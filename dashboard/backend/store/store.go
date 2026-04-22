package store

import (
	"context"
	"crypto/tls"
	"fmt"
	"hash/fnv"

	"github.com/namsee/banhmi/dashboard/models"
	qdrant "github.com/qdrant/go-client/qdrant"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
)

const (
	CollectionName = "alerts"
	VectorSize     = 384 // all-MiniLM-L6-v2
)

// Client wraps the Qdrant gRPC client
type Client struct {
	conn        *grpc.ClientConn
	collections qdrant.CollectionsClient
	points      qdrant.PointsClient
	apiKey      string
}

// New connects to Qdrant at addr (e.g. "localhost:6334").
// If apiKey is non-empty, TLS is used and the key is sent as gRPC metadata
// on every call (required for Qdrant Cloud).
func New(addr, apiKey string) (*Client, error) {
	var dialOpt grpc.DialOption
	if apiKey != "" {
		dialOpt = grpc.WithTransportCredentials(credentials.NewTLS(&tls.Config{}))
	} else {
		dialOpt = grpc.WithTransportCredentials(insecure.NewCredentials())
	}
	conn, err := grpc.NewClient(addr, dialOpt)
	if err != nil {
		return nil, fmt.Errorf("qdrant connect: %w", err)
	}
	return &Client{
		conn:        conn,
		collections: qdrant.NewCollectionsClient(conn),
		points:      qdrant.NewPointsClient(conn),
		apiKey:      apiKey,
	}, nil
}

// ctx returns a context with the API key injected as gRPC metadata when set.
func (c *Client) ctx(parent context.Context) context.Context {
	if c.apiKey == "" {
		return parent
	}
	return metadata.AppendToOutgoingContext(parent, "api-key", c.apiKey)
}

// Close closes the underlying gRPC connection
func (c *Client) Close() { c.conn.Close() }

// EnsureCollection creates the collection if it doesn't exist
func (c *Client) EnsureCollection(parent context.Context) error {
	ctx := c.ctx(parent)
	_, err := c.collections.Get(ctx, &qdrant.GetCollectionInfoRequest{CollectionName: CollectionName})
	if err == nil {
		return nil // already exists
	}

	_, err = c.collections.Create(ctx, &qdrant.CreateCollection{
		CollectionName: CollectionName,
		VectorsConfig: &qdrant.VectorsConfig{
			Config: &qdrant.VectorsConfig_Params{
				Params: &qdrant.VectorParams{
					Size:     VectorSize,
					Distance: qdrant.Distance_Cosine,
				},
			},
		},
	})
	return err
}

// alertID hashes an alert ID string to a uint64 for Qdrant point ID
func alertID(id string) uint64 {
	h := fnv.New64a()
	h.Write([]byte(id))
	return h.Sum64()
}

// Upsert stores an alert vector + metadata in Qdrant
func (c *Client) Upsert(parent context.Context, alert *models.Alert, vector []float32) error {
	ctx := c.ctx(parent)
	id := alertID(alert.ID)
	alert.VectorID = &id

	_, err := c.points.Upsert(ctx, &qdrant.UpsertPoints{
		CollectionName: CollectionName,
		Points: []*qdrant.PointStruct{
			{
				Id:      qdrant.NewIDNum(id),
				Vectors: qdrant.NewVectors(vector...),
				Payload: map[string]*qdrant.Value{
					"alert_id":    qdrant.NewValueString(alert.ID),
					"date":        qdrant.NewValueString(alert.Date),
					"file":        qdrant.NewValueString(alert.File),
					"severity":    qdrant.NewValueString(alert.Severity),
					"status":      qdrant.NewValueString(alert.Status),
					"description": qdrant.NewValueString(alert.Description),
					"source":      qdrant.NewValueString(alert.Source),
					"host":        qdrant.NewValueString(alert.Host),
					"value":       qdrant.NewValueString(alert.Value),
					"time":        qdrant.NewValueString(alert.Time),
					"details":     qdrant.NewValueString(alert.Details),
				},
			},
		},
	})
	return err
}

// UpsertBatch upserts multiple alerts with their vectors
func (c *Client) UpsertBatch(parent context.Context, alerts []*models.Alert, vectors [][]float32) error {
	ctx := c.ctx(parent)
	points := make([]*qdrant.PointStruct, len(alerts))
	for i, alert := range alerts {
		id := alertID(alert.ID)
		alert.VectorID = &id
		points[i] = &qdrant.PointStruct{
			Id:      qdrant.NewIDNum(id),
			Vectors: qdrant.NewVectors(vectors[i]...),
			Payload: map[string]*qdrant.Value{
				"alert_id":    qdrant.NewValueString(alert.ID),
				"date":        qdrant.NewValueString(alert.Date),
				"file":        qdrant.NewValueString(alert.File),
				"severity":    qdrant.NewValueString(alert.Severity),
				"status":      qdrant.NewValueString(alert.Status),
				"description": qdrant.NewValueString(alert.Description),
				"source":      qdrant.NewValueString(alert.Source),
				"host":        qdrant.NewValueString(alert.Host),
				"value":       qdrant.NewValueString(alert.Value),
				"time":        qdrant.NewValueString(alert.Time),
				"details":     qdrant.NewValueString(alert.Details),
			},
		}
	}
	_, err := c.points.Upsert(ctx, &qdrant.UpsertPoints{
		CollectionName: CollectionName,
		Points:         points,
	})
	return err
}

// SearchSimilar returns top-K similar alerts by vector, optionally filtered by date
func (c *Client) SearchSimilar(parent context.Context, vector []float32, topK uint64, dateFilter string) ([]*models.Alert, []float64, error) {
	ctx := c.ctx(parent)
	req := &qdrant.SearchPoints{
		CollectionName: CollectionName,
		Vector:         vector,
		Limit:          topK,
		WithPayload:    &qdrant.WithPayloadSelector{SelectorOptions: &qdrant.WithPayloadSelector_Enable{Enable: true}},
	}
	if dateFilter != "" {
		req.Filter = &qdrant.Filter{
			Must: []*qdrant.Condition{
				{
					ConditionOneOf: &qdrant.Condition_Field{
						Field: &qdrant.FieldCondition{
							Key:   "date",
							Match: &qdrant.Match{MatchValue: &qdrant.Match_Keyword{Keyword: dateFilter}},
						},
					},
				},
			},
		}
	}

	resp, err := c.points.Search(ctx, req)
	if err != nil {
		return nil, nil, fmt.Errorf("qdrant search: %w", err)
	}

	alerts := make([]*models.Alert, len(resp.Result))
	scores := make([]float64, len(resp.Result))
	for i, hit := range resp.Result {
		alerts[i] = payloadToAlert(hit.Payload)
		scores[i] = float64(hit.Score)
	}
	return alerts, scores, nil
}

// GetAll returns all alerts stored in Qdrant
func (c *Client) GetAll(parent context.Context, dateFilter string) ([]*models.Alert, error) {
	ctx := c.ctx(parent)
	var filter *qdrant.Filter
	if dateFilter != "" {
		filter = &qdrant.Filter{
			Must: []*qdrant.Condition{
				{
					ConditionOneOf: &qdrant.Condition_Field{
						Field: &qdrant.FieldCondition{
							Key:   "date",
							Match: &qdrant.Match{MatchValue: &qdrant.Match_Keyword{Keyword: dateFilter}},
						},
					},
				},
			},
		}
	}

	var alerts []*models.Alert
	var offset *qdrant.PointId
	for {
		resp, err := c.points.Scroll(ctx, &qdrant.ScrollPoints{
			CollectionName: CollectionName,
			Filter:         filter,
			WithPayload:    &qdrant.WithPayloadSelector{SelectorOptions: &qdrant.WithPayloadSelector_Enable{Enable: true}},
			Limit:          ptr(uint32(100)),
			Offset:         offset,
		})
		if err != nil {
			return nil, fmt.Errorf("qdrant scroll: %w", err)
		}
		for _, p := range resp.Result {
			alerts = append(alerts, payloadToAlert(p.Payload))
		}
		if resp.NextPageOffset == nil {
			break
		}
		offset = resp.NextPageOffset
	}
	return alerts, nil
}

func ptr[T any](v T) *T { return &v }

func payloadToAlert(p map[string]*qdrant.Value) *models.Alert {
	get := func(key string) string {
		if v, ok := p[key]; ok {
			return v.GetStringValue()
		}
		return ""
	}
	return &models.Alert{
		ID:          get("alert_id"),
		Date:        get("date"),
		File:        get("file"),
		Severity:    get("severity"),
		Status:      get("status"),
		Description: get("description"),
		Source:      get("source"),
		Host:        get("host"),
		Value:       get("value"),
		Time:        get("time"),
		Details:     get("details"),
	}
}
