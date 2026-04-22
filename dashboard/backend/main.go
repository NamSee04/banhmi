package main

import (
	"context"
	"log"
	"os"
	"path/filepath"

	"github.com/namsee/banhmi/dashboard/api"
	"github.com/namsee/banhmi/dashboard/embedder"
	"github.com/namsee/banhmi/dashboard/ingestor"
	"github.com/namsee/banhmi/dashboard/llm"
	"github.com/namsee/banhmi/dashboard/store"
	"github.com/namsee/banhmi/dashboard/watcher"
)

func main() {
	// Config from env with defaults
	modelPath := envOr("MODEL_PATH", "./models/all-MiniLM-L6-v2")
	qdrantAddr := envOr("QDRANT_ADDR", "localhost:6334")
	qdrantAPIKey := envOr("QDRANT_API_KEY", "")
	alertsRoot := envOr("ALERTS_ROOT", "../../alerts")
	listenAddr := envOr("LISTEN_ADDR", ":8080")
	quantized := envOr("EMBED_QUANTIZED", "true") != "false"

	// Resolve paths relative to binary location
	if !filepath.IsAbs(alertsRoot) {
		exe, err := os.Executable()
		if err == nil {
			alertsRoot = filepath.Join(filepath.Dir(exe), alertsRoot)
		}
	}
	if !filepath.IsAbs(modelPath) {
		exe, err := os.Executable()
		if err == nil {
			modelPath = filepath.Join(filepath.Dir(exe), modelPath)
		}
	}

	ctx := context.Background()

	// Qdrant
	log.Printf("connecting to Qdrant at %s", qdrantAddr)
	st, err := store.New(qdrantAddr, qdrantAPIKey)
	if err != nil {
		log.Fatalf("qdrant: %v", err)
	}
	defer st.Close()

	if err := st.EnsureCollection(ctx); err != nil {
		log.Fatalf("ensure collection: %v", err)
	}

	// Embedder — ONNX in-process, no external service required
	log.Printf("loading ONNX embedder from %s (quantized=%v)", modelPath, quantized)
	emb, err := embedder.New(modelPath, quantized)
	if err != nil {
		log.Fatalf("embedder: %v", err)
	}
	defer emb.Close()

	// Ingest all existing alerts
	ing := ingestor.New(alertsRoot, emb, st)
	log.Printf("ingesting alerts from %s", alertsRoot)
	if err := ing.IngestAll(ctx); err != nil {
		log.Fatalf("ingest: %v", err)
	}

	// Watch for new alert files
	if err := watcher.Watch(ctx, alertsRoot, ing); err != nil {
		log.Printf("watcher: %v (continuing without watch)", err)
	}

	// Start API
	ollamaEndpoint := envOr("OLLAMA_ENDPOINT", "https://ollama.com")
	ollamaKey := envOr("OLLAMA_API_KEY", "")
	ollamaModel := envOr("OLLAMA_MODEL", "gpt-oss:20b")
	var llmClient *llm.Client
	if ollamaKey != "" {
		llmClient = llm.New(ollamaEndpoint, ollamaKey, ollamaModel)
		log.Printf("LLM client configured: %s model=%s", ollamaEndpoint, ollamaModel)
	} else {
		log.Printf("LLM chat disabled: OLLAMA_API_KEY not set")
	}
	r := api.New(st, emb, llmClient)
	log.Printf("API listening on %s", listenAddr)
	if err := r.Run(listenAddr); err != nil {
		log.Fatalf("server: %v", err)
	}
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
