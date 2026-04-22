package api

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/namsee/banhmi/dashboard/embedder"
	"github.com/namsee/banhmi/dashboard/graph"
	"github.com/namsee/banhmi/dashboard/llm"
	"github.com/namsee/banhmi/dashboard/models"
	"github.com/namsee/banhmi/dashboard/store"
	"github.com/namsee/banhmi/dashboard/summary"
)

// Server holds dependencies for API handlers
type Server struct {
	store    *store.Client
	embedder *embedder.Client
	llm      *llm.Client
}

// New creates a configured Gin engine. llmClient may be nil (chat disabled).
func New(st *store.Client, emb *embedder.Client, llmClient *llm.Client) *gin.Engine {
	srv := &Server{store: st, embedder: emb, llm: llmClient}

	r := gin.Default()
	r.Use(cors.Default())

	api := r.Group("/api")
	{
		api.GET("/summary", srv.handleSummary)
		api.GET("/graph", srv.handleGraph)
		api.GET("/graph/all", srv.handleGraphAll)
		api.GET("/alerts", srv.handleAlerts)
		api.GET("/alert/:id/similar", srv.handleSimilar)
		api.POST("/search", srv.handleSearch)
		api.POST("/chat", srv.handleChat)
	}

	return r
}

// GET /api/summary?date=MMDDYYYY
func (s *Server) handleSummary(c *gin.Context) {
	date := c.Query("date")
	alerts, err := s.store.GetAll(c.Request.Context(), date)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	sum := summary.Build(date, alerts)
	c.JSON(http.StatusOK, sum)
}

// GET /api/alerts?date=MMDDYYYY
func (s *Server) handleAlerts(c *gin.Context) {
	date := c.Query("date")
	alerts, err := s.store.GetAll(c.Request.Context(), date)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, alerts)
}

// GET /api/graph?date=MMDDYYYY&threshold=0.75
func (s *Server) handleGraph(c *gin.Context) {
	date := c.Query("date")
	threshold := parseFloat(c.Query("threshold"), 0.75)
	g, err := s.buildGraph(c.Request.Context(), date, threshold)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, g)
}

// GET /api/graph/all?threshold=0.75
func (s *Server) handleGraphAll(c *gin.Context) {
	threshold := parseFloat(c.Query("threshold"), 0.75)
	g, err := s.buildGraph(c.Request.Context(), "", threshold)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, g)
}

// GET /api/alert/:id/similar?topk=5
func (s *Server) handleSimilar(c *gin.Context) {
	rawID := c.Param("id")  // e.g. "04172026/001"
	date := c.Query("date") // optional date filter
	topK := parseInt(c.Query("topk"), 5)

	// Embed the alert description first — look it up from store
	alerts, err := s.store.GetAll(c.Request.Context(), "")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var target *models.Alert
	for _, a := range alerts {
		if a.ID == rawID {
			target = a
			break
		}
	}
	if target == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "alert not found"})
		return
	}

	vector, err := s.embedder.Embed(c.Request.Context(), target.Description+". "+target.Details)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	similar, scores, err := s.store.SearchSimilar(c.Request.Context(), vector, uint64(topK+1), date)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var results []models.SearchResult
	for i, a := range similar {
		if a.ID == rawID {
			continue // skip self
		}
		results = append(results, models.SearchResult{Alert: *a, Similarity: scores[i]})
	}
	c.JSON(http.StatusOK, results)
}

// POST /api/search  body: {"query": "disk space issues", "date": "04182026", "topk": 5}
func (s *Server) handleSearch(c *gin.Context) {
	var req struct {
		Query string `json:"query" binding:"required"`
		Date  string `json:"date"`
		TopK  int    `json:"topk"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.TopK == 0 {
		req.TopK = 5
	}

	vector, err := s.embedder.Embed(c.Request.Context(), req.Query)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	alerts, scores, err := s.store.SearchSimilar(c.Request.Context(), vector, uint64(req.TopK), req.Date)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	results := make([]models.SearchResult, len(alerts))
	for i, a := range alerts {
		results[i] = models.SearchResult{Alert: *a, Similarity: scores[i]}
	}
	c.JSON(http.StatusOK, results)
}

// buildGraph fetches all alerts for a date, queries neighbors, and builds the graph
func (s *Server) buildGraph(ctx context.Context, date string, threshold float64) (*models.Graph, error) {
	alerts, err := s.store.GetAll(ctx, date)
	if err != nil {
		return nil, err
	}
	if len(alerts) == 0 {
		return &models.Graph{Nodes: []models.GraphNode{}, Edges: []models.GraphEdge{}, Clusters: []models.Cluster{}}, nil
	}

	log.Printf("[graph] building for %d alerts (date=%q, threshold=%.2f)", len(alerts), date, threshold)

	// For each alert embed its text and find neighbors
	neighbors := make(map[string][]graph.Neighbor, len(alerts))
	for _, a := range alerts {
		embedText := a.Description
		if a.Details != "" {
			embedText += ". " + a.Details
		}
		vec, err := s.embedder.Embed(ctx, embedText)
		if err != nil {
			return nil, err
		}
		similar, scores, err := s.store.SearchSimilar(ctx, vec, 10, date)
		if err != nil {
			return nil, err
		}
		nbrs := make([]graph.Neighbor, len(similar))
		for i, nb := range similar {
			nbrs[i] = graph.Neighbor{ID: nb.ID, Score: scores[i]}
		}
		neighbors[a.ID] = nbrs
	}

	return graph.Build(alerts, neighbors, threshold), nil
}

func parseFloat(s string, def float64) float64 {
	if s == "" {
		return def
	}
	var f float64
	if _, err := parseInto(s, &f); err != nil {
		return def
	}
	return f
}

func parseInt(s string, def int) int {
	if s == "" {
		return def
	}
	v := 0
	for _, c := range s {
		if c < '0' || c > '9' {
			return def
		}
		v = v*10 + int(c-'0')
	}
	return v
}

func parseInto(s string, f *float64) (int, error) {
	// simple atof
	var err error
	neg := false
	i := 0
	if i < len(s) && s[i] == '-' {
		neg = true
		i++
	}
	intPart := 0.0
	for i < len(s) && s[i] >= '0' && s[i] <= '9' {
		intPart = intPart*10 + float64(s[i]-'0')
		i++
	}
	fracPart := 0.0
	fracDiv := 1.0
	if i < len(s) && s[i] == '.' {
		i++
		for i < len(s) && s[i] >= '0' && s[i] <= '9' {
			fracPart = fracPart*10 + float64(s[i]-'0')
			fracDiv *= 10
			i++
		}
	}
	*f = intPart + fracPart/fracDiv
	if neg {
		*f = -*f
	}
	return i, err
}

// POST /api/chat  body: {"query": "...", "date": "MMDDYYYY"}
func (s *Server) handleChat(c *gin.Context) {
	var req models.ChatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Set SSE headers early so we can always stream events
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("X-Accel-Buffering", "no")

	sseError := func(msg string) {
		c.SSEvent("error", msg)
		c.Writer.Flush()
	}

	if s.llm == nil {
		sseError("chat disabled: OLLAMA_API_KEY not set")
		return
	}

	ctx := c.Request.Context()

	// Embed query
	vec, err := s.embedder.Embed(ctx, req.Query)
	if err != nil {
		sseError(fmt.Sprintf("embed: %v", err))
		return
	}

	// Retrieve similar alerts
	alerts, scores, err := s.store.SearchSimilar(ctx, vec, 8, req.Date)
	if err != nil {
		sseError(fmt.Sprintf("search: %v", err))
		return
	}

	// Build source list for the response
	sources := make([]models.ChatSourceAlert, len(alerts))
	for i, a := range alerts {
		sources[i] = models.ChatSourceAlert{
			ID:          a.ID,
			Similarity:  scores[i],
			Severity:    a.Severity,
			Host:        a.Host,
			Time:        a.Time,
			Description: a.Description,
		}
	}

	// Handle empty retrieval without calling LLM
	if len(alerts) == 0 {
		c.SSEvent("token", `"No matching alerts found for your query."`)
		c.Writer.Flush()
		sourceJSON, _ := json.Marshal(sources)
		c.SSEvent("sources", string(sourceJSON))
		c.Writer.Flush()
		c.SSEvent("done", "")
		c.Writer.Flush()
		return
	}

	// Build system prompt
	dateLabel := req.Date
	if dateLabel == "" {
		dateLabel = "all"
	}
	var sb strings.Builder
	sb.WriteString("You are an SRE assistant answering questions strictly from the provided alert context.\n")
	sb.WriteString("Rules:\n")
	sb.WriteString("- Answer only using the ALERTS block below.\n")
	sb.WriteString("- Cite alert IDs inline like [04182026/003].\n")
	sb.WriteString("- If alerts do not contain enough information, reply: \"I don't have enough information in the retrieved alerts to answer that.\"\n")
	sb.WriteString("- Be concise (<=6 sentences). No speculation. No generic advice.\n\n")
	fmt.Fprintf(&sb, "ALERTS (top %d by similarity for date=%s):\n", len(alerts), dateLabel)
	for i, a := range alerts {
		details := a.Details
		if len(details) > 400 {
			details = details[:400] + "..."
		}
		fmt.Fprintf(&sb, "[%d] id=%s sim=%.2f severity=%s status=%s host=%s time=%s\n    desc: %s\n    details: %s\n",
			i+1, a.ID, scores[i], a.Severity, a.Status, a.Host, a.Time, a.Description, details)
	}
	sysPompt := sb.String()

	// Stream from LLM
	tokens, errs := s.llm.ChatStream(ctx, sysPompt, req.Query)

	c.Stream(func(w io.Writer) bool {
		select {
		case t, ok := <-tokens:
			if !ok {
				return false
			}
			data, _ := json.Marshal(t)
			c.SSEvent("token", string(data))
			return true
		case e, ok := <-errs:
			if !ok {
				return false
			}
			if e != nil {
				log.Printf("[chat] llm error: %v", e)
				c.SSEvent("error", e.Error())
			}
			return false
		case <-ctx.Done():
			return false
		}
	})

	// Emit sources then done
	sourceJSON, _ := json.Marshal(sources)
	c.SSEvent("sources", string(sourceJSON))
	c.Writer.Flush()
	c.SSEvent("done", "")
	c.Writer.Flush()
}
