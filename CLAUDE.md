# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: JARVIAS — Just A Rather Very Intelligent Alert System

Alert ingestion → semantic embedding → vector storage → React dashboard for exploration and RAG chat.

---

## Architecture Overview

**Data flow:**
1. **Alerts** — Markdown files in `alerts/MMDDYYYY/NNN.md` (user-created, not versioned)
2. **Parser** — regex extracts: severity, status, description, source, host, value, time, details
3. **Embedder** — ONNX in-process all-MiniLM-L6-v2 (384-dim, no external LLM service)
4. **Store** — Qdrant vector DB (gRPC), stores alerts + vectors + metadata
5. **Graph** — label propagation community detection on similarity edges
6. **API** — Gin server: list alerts, search (semantic), graph, summary, chat (RAG)
7. **Frontend** — React SPA: force-directed graph, alert detail panel, search bar, chat panel

**Critical constraint:** Embedding model is in-process (ONNX Runtime). No external inference during ingestion. This keeps the system fast and offline-capable.

**Key packages (backend):**
- `api/` — Gin HTTP handlers; routes: `/api/alerts`, `/api/summary`, `/api/graph`, `/api/search`, `/api/chat`
- `embedder/` — hugot + ONNX Runtime wrapper; `Embed(ctx, text) []float32`
- `store/` — Qdrant gRPC client; `SearchSimilar`, `GetAll`, `UpsertBatch`
- `graph/` — builds similarity graph + community detection
- `parser/` — markdown regex → Alert struct
- `ingestor/` — parse → embed → upsert orchestration
- `watcher/` — fsnotify live reload of new alert files
- `models/` — shared Go types (Alert, Graph, Cluster, etc.)
- `summary/` — daily aggregation (counts, timeline, by-source)
- `llm/` — Ollama Cloud client (SSE streaming) for RAG chat

**Frontend (React + Vite + Tailwind):**
- `components/AlertGraph` — force-directed graph (react-force-graph-2d)
- `components/AlertDetail` — selected alert + similar alerts
- `components/SummaryPanels` — day stats
- `components/ClusterPanel` — cluster sidebar
- `components/SearchBar` — semantic search
- `components/ChatPanel` — RAG chat interface (streams tokens from Ollama)

---

## Common Commands

### Quick start (Docker)
```bash
cd dashboard
docker compose up --build
# Frontend: http://localhost:5173
# Backend API: http://localhost:8080
# Qdrant: http://localhost:6333
```

### Backend (local + Qdrant Cloud)
```bash
# 1. Download ONNX model (one-time)
cd dashboard/backend
bash scripts/download-model.sh

# 2. Set Qdrant credentials
export QDRANT_ADDR="your-cluster.region.gcp.cloud.qdrant.io:6334"
export QDRANT_API_KEY="your-api-key"

# 3. Run
CGO_LDFLAGS="-L/usr/local/lib" go run .
```

### Backend (with Ollama Cloud for RAG)
```bash
export QDRANT_ADDR="localhost:6334"
export OLLAMA_ENDPOINT="https://ollama.com"
export OLLAMA_API_KEY="sk-..."
export OLLAMA_MODEL="gpt-oss:20b"
CGO_LDFLAGS="-L/usr/local/lib" go run .
```

### Frontend (local dev)
```bash
cd dashboard/frontend
npm install
npm run dev        # dev server on :5173
npm run build      # production build
npm run preview    # preview build output
```

### Test integration (curl)
```bash
# Semantic search
curl -X POST http://localhost:8080/api/search \
  -H 'Content-Type: application/json' \
  -d '{"query":"disk space","date":"04182026","topk":5}'

# RAG chat (streaming)
curl -N -X POST http://localhost:8080/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"query":"summarize disk alerts","date":"04182026"}'
```

---

## Alert File Format

Each markdown file `alerts/MMDDYYYY/NNN.md`:
```markdown
🚨 **Severity**: 🟡 Warning
📋 **Status**: Firing 🔥
📌 **Description**: [short description]

🖥 **Source**: [system name]
🏷 **Host/Service**: [host:port]
📊 **Value**: [metric value]
🕐 **Time**: [timestamp UTC+7]

🔍 **Details**:
[longer context]
```

Severities: `critical` / `warning` / `info`  
Statuses: `firing` / `resolved`

---

## Key Implementation Notes

### ONNX Model (hugot)

- Model: `sentence-transformers/all-MiniLM-L6-v2`
- Location: `dashboard/backend/models/all-MiniLM-L6-v2/`
- Files: `tokenizer_config.json`, `config.json`, `onnx/model.onnx` (FP32), `onnx/model_quantized.onnx` (INT8, preferred)
- Quantization: set `EMBED_QUANTIZED=true` (default) to use INT8 (~2-4× faster, negligible quality loss)
- libonnxruntime: required system library
  - macOS: `brew install onnxruntime` → `/opt/homebrew/lib/libonnxruntime.dylib` → set `CGO_LDFLAGS="-L/opt/homebrew/lib"`
  - Linux: Dockerfile installs it automatically
  - Set `ORT_LIB_PATH` if hugot can't find it

### Qdrant

- Collection: `"alerts"`, distance metric: cosine, dimensions: 384
- Local: `localhost:6334` (gRPC) or `localhost:6333` (REST)
- Cloud: env vars `QDRANT_ADDR`, `QDRANT_API_KEY` → TLS + auth automatically enabled
- Payload schema: alert_id, date, file, severity, status, description, source, host, value, time, details

### Embedder Batching

- `embedder.Embed(ctx, text)` — single text → `[]float32` (384-dim)
- `embedder.EmbedBatch(ctx, texts)` — multiple texts, one ONNX call, faster
- Used during ingest and graph building; always prefer batch when processing multiple alerts

### Graph Community Detection

- Label propagation (20 iterations, weighted by similarity scores)
- Output: clusters with members + heuristic label (dominant severity + source)
- Threshold: default 0.75 cosine similarity; adjustable via query param

### Retrieval-Augmented Generation (RAG Chat)

- Query embedding: all-MiniLM-L6-v2 (in-process)
- Retrieval: Qdrant `SearchSimilar(topK=8)`
- Generation: Ollama Cloud `/v1/chat/completions` with `stream=true`
- Streaming: SSE (Server-Sent Events) from backend → frontend with incremental tokens
- System prompt: includes top-8 retrieved alerts with metadata, instructs LLM to cite alert IDs and refuse out-of-context questions
- Single-turn Q&A (no multi-turn history yet)

---

## Project Preferences

### Plan/Design Files

Save all design docs and implementation plans to `docs/` folder (e.g., `docs/rag-chat-plan.md`). This keeps plans checked into the repo alongside code and other documentation.

---

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `QDRANT_ADDR` | `localhost:6334` | Qdrant gRPC endpoint |
| `QDRANT_API_KEY` | _(empty)_ | Qdrant Cloud API key (enables TLS) |
| `ALERTS_ROOT` | `../../alerts` | Path to alerts directory |
| `MODEL_PATH` | `./models/all-MiniLM-L6-v2` | ONNX model directory |
| `EMBED_QUANTIZED` | `true` | Use INT8 quantized ONNX model |
| `LISTEN_ADDR` | `:8080` | Backend HTTP listen address |
| `OLLAMA_ENDPOINT` | `https://ollama.com` | Ollama Cloud base URL (RAG) |
| `OLLAMA_API_KEY` | _(empty)_ | Ollama Cloud API key (disables chat if missing) |
| `OLLAMA_MODEL` | `gpt-oss:20b` | Model name for generation |

---

## Critical Files to Know

**Backend:**
- `main.go` — entry point, env setup, service wiring
- `api/api.go` — all HTTP handlers
- `embedder/embedder.go` — ONNX embedding (single + batch)
- `store/store.go` — Qdrant client (search, upsert, payload schema)
- `models/models.go` — shared types (Alert, Graph, Cluster, ChatRequest, etc.)
- `graph/graph.go` — similarity edges + label propagation
- `llm/ollama.go` — Ollama Cloud streaming client

**Frontend:**
- `App.tsx` — main tab router + state management
- `api.ts` — fetch-based HTTP client + streaming
- `types.ts` — TypeScript interfaces
- `components/AlertGraph.tsx` — force-directed graph visualization
- `components/ChatPanel.tsx` — RAG chat UI

**Configuration:**
- `dashboard/docker-compose.yml` — service wiring + ports
- `dashboard/backend/Dockerfile` — Go build + model download
- `dashboard/frontend/Dockerfile` — Node build + nginx serving
- `dashboard/backend/scripts/download-model.sh` — HuggingFace model download

---

## Hardcoded Items to Maintain

- **Frontend date options** — `App.tsx` line 12-16: `DATE_OPTIONS` array lists available days (e.g., 04/17/2026, 04/18/2026). Update when new alert folders are added.
- **System prompt for RAG** — in `api/api.go` `handleChat` method. Keep instructions concise (~6 sentences, topK=8 alerts) to control token budget.

---

## Testing Strategy

- **Integration test:** `docker compose up --build` → visit http://localhost:5173 → search and chat
- **API smoke test:** curl examples (see Commands section above)
- **Chat streaming:** use DevTools Network → /api/chat → EventStream tab to see SSE event frames
- **Embedding quality:** check similarity scores in search/graph responses (cosine 0–1, higher = more similar)
- **Qdrant payload:** inspect via REST at `http://localhost:6333/dashboard` (local only) or Qdrant Cloud UI
