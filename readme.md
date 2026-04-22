# JARVIAS — Just A Rather Very Intelligent Alert System

JARVIAS ingests markdown-formatted alerts, embeds them into a vector space with an in-process ONNX model, and stores them in Qdrant. A React dashboard lets you explore alerts by day, drill into semantic similarity, run natural-language searches, and chat with your alerts via RAG (retrieval-augmented generation with Ollama).

---

## Repository layout

```
alerts/               # Raw alert files, one folder per day (MMDDYYYY/)
  04172026/           #   001.md, 002.md, ...
  04182026/
dashboard/
  backend/            # Go API server
    api/              #   Gin HTTP handlers
    embedder/         #   ONNX in-process sentence embedder (all-MiniLM-L6-v2)
    graph/            #   Similarity graph builder + community detection
    ingestor/         #   Orchestrates parse → embed → upsert
    models/           #   Shared Go types (Alert, Graph, Summary, …)
    parser/           #   Markdown → Alert struct
    store/            #   Qdrant gRPC client
    summary/          #   Per-day statistics aggregator
    llm/              #   Ollama Cloud streaming client (RAG chat)
    watcher/          #   fsnotify-based live reload
    scripts/
      download-model.sh  # One-time HuggingFace model download
  frontend/           # React + TypeScript + Tailwind UI
    src/
      components/     #   AlertGraph, AlertDetail, SummaryPanels, ClusterPanel, SearchBar, ChatPanel
docs/                 # Guides and references
```

---

## Architecture

```
alerts/*.md
    │
    ▼
 parser          Reads markdown, extracts fields via regex
    │            (Severity, Status, Description, Source, Host, Value, Time, Details)
    ▼
 ingestor        Combines fields into embed text, calls embedder, upserts to Qdrant
    │
    ├──► embedder   all-MiniLM-L6-v2 via ONNX Runtime (in-process, no external service)
    │                → 384-dimensional float32 vector
    │
    └──► store      Qdrant gRPC client
                    Collection: "alerts"  |  Distance: Cosine  |  Dims: 384
                    Supports local Qdrant (insecure) and Qdrant Cloud (TLS + API key)

 watcher         fsnotify monitors alerts/ — new files are ingested automatically

 api (Gin)       REST endpoints consumed by the frontend
    GET  /api/alerts?date=         List all alerts for a day
    GET  /api/summary?date=        Aggregated stats (counts, timeline, by-source, by-host)
    GET  /api/graph?date=&threshold=     Similarity graph for a day
    GET  /api/graph/all?threshold=       Similarity graph across all days
    GET  /api/alert/:id/similar    Top-K semantically similar alerts
    POST /api/search               Natural-language search (embed query → ANN)
    POST /api/chat                 RAG chat — retrieves top-8 similar alerts, streams answer via SSE

 llm (Ollama)    Ollama Cloud client
    Embedding: all-MiniLM-L6-v2 (in-process) → Qdrant top-K retrieval → Ollama generation
    Transport: SSE streaming (/v1/chat/completions with stream=true)
    Disabled automatically when OLLAMA_API_KEY is not set

 frontend        React SPA
    AlertGraph     Force-directed graph (react-force-graph-2d), coloured by severity or cluster
    SummaryPanels  Daily stats — total / critical / warning / info / firing / resolved
    ClusterPanel   Community-detected alert clusters
    AlertDetail    Selected node detail + similar alerts panel
    SearchBar      Semantic search across all stored alerts
    ChatPanel      RAG chat interface — streams tokens from Ollama
```

---

## Alert file format

Each alert is a markdown file under `alerts/MMDDYYYY/NNN.md`:

```markdown
🚨 **Severity**: 🟡 Warning
📋 **Status**: Firing 🔥
📌 **Description**: Harbor heap memory usage is high (9.18GB) on 10.110.3.4

🖥 **Source**: harbor
🏷 **Host/Service**: 10.110.3.4:9428
📊 **Value**: 9.18GB
🕐 **Time**: 2026-04-17 14:26:40 (UTC+7)

🔍 **Details**:
Harbor process heap allocation has reached 9.18GB, exceeding the 500 MiB threshold.
```

Supported severities: `critical` / `warning` / `info`  
Supported statuses: `firing` / `resolved`

---

## Quick start (Docker)

The easiest path — no local Go/Rust/ONNX setup needed.

```bash
cd dashboard
docker compose up --build
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8080 |
| Qdrant REST | http://localhost:6333 |

---

## Quick start (local + Qdrant Cloud)

See [docs/local-run-qdrant-cloud.md](docs/local-run-qdrant-cloud.md) for the full walkthrough.

**Short version:**

```bash
# 1. Download the ONNX model (once)
cd dashboard/backend
bash scripts/download-model.sh

# 2. Set Qdrant Cloud credentials
export QDRANT_ADDR="your-cluster.region.gcp.cloud.qdrant.io:6334"
export QDRANT_API_KEY="your-api-key"

# 3. Run backend
CGO_LDFLAGS="-L/usr/local/lib" go run .

# 4. (Optional) Enable RAG chat with Ollama Cloud
export OLLAMA_ENDPOINT="https://ollama.com"
export OLLAMA_API_KEY="sk-..."
export OLLAMA_MODEL="gpt-oss:20b"

# 5. Run frontend (separate terminal)
cd dashboard/frontend
npm install && npm run dev
```

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `QDRANT_ADDR` | `localhost:6334` | Qdrant gRPC address (host:port) |
| `QDRANT_API_KEY` | _(empty)_ | Qdrant Cloud API key — enables TLS when set |
| `ALERTS_ROOT` | `../../alerts` | Path to the alerts directory |
| `MODEL_PATH` | `./models/all-MiniLM-L6-v2` | Path to the ONNX model directory |
| `EMBED_QUANTIZED` | `true` | Use INT8-quantized model (`false` = FP32) |
| `LISTEN_ADDR` | `:8080` | Backend listen address |
| `OLLAMA_ENDPOINT` | `https://ollama.com` | Ollama Cloud base URL |
| `OLLAMA_API_KEY` | _(empty)_ | Ollama Cloud API key — chat disabled when not set |
| `OLLAMA_MODEL` | `gpt-oss:20b` | Model name for RAG generation |

---

## Backend packages

| Package | Responsibility |
|---------|---------------|
| `parser` | Regex-based markdown → `models.Alert` |
| `embedder` | Wraps hugot + ONNX Runtime; produces 384-dim vectors |
| `ingestor` | Coordinates parse → embed → upsert; supports batch and single-file |
| `store` | Qdrant gRPC client; upsert, scroll, search, TLS/auth |
| `graph` | Builds `models.Graph` from similarity neighbors; community detection |
| `summary` | Aggregates `models.DaySummary` (counts, timeline, top sources/hosts) |
| `watcher` | fsnotify loop — re-ingests files dropped into `alerts/` at runtime |
| `llm` | Ollama Cloud client; SSE streaming for RAG chat completions |
| `api` | Gin router wiring all of the above into HTTP endpoints |

---

## Docs

- [docs/plan/local-run-qdrant-cloud.md](docs/plan/local-run-qdrant-cloud.md) — Run locally with Qdrant Cloud
- [docs/plan/rag-chat-plan.md](docs/plan/rag-chat-plan.md) — RAG chat implementation plan
- [docs/plan/guide-build-openclaw-skill.md](docs/plan/guide-build-openclaw-skill.md) — Building OpenClaw skills
- [docs/souls/SRE-SOUL.md](docs/souls/SRE-SOUL.md) — SRE agent soul definition
