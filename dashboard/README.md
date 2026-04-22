# Alert Dashboard — Quick Start

## Prerequisites

- [Docker + Docker Compose](https://docs.docker.com/compose/)
- Go 1.22+ with CGO enabled (for local backend dev)
- Node 20+ (for local frontend dev)
- ONNX Runtime shared library (for local backend dev — not needed for Docker)

---

## 1. Download the model (local dev only)

```bash
cd dashboard/backend
bash scripts/download-model.sh
# → ./models/all-MiniLM-L6-v2/onnx/model_quantized.onnx  (INT8)
# → ./models/all-MiniLM-L6-v2/onnx/model.onnx             (FP32)
```

Docker does this automatically at image build time.

## 2. Run with Docker Compose

```bash
cd dashboard
docker compose up --build
```

- Frontend → http://localhost:5173
- Backend API → http://localhost:8080/api
- Qdrant REST → http://localhost:6333

No Ollama, no Python — embeddings run in-process via ONNX Runtime.

---

## 3. Local development (without Docker)

### Install ONNX Runtime

```bash
# macOS
brew install onnxruntime

# Ubuntu/Debian
ORT=1.17.3
curl -fsSL https://github.com/microsoft/onnxruntime/releases/download/v${ORT}/onnxruntime-linux-x64-${ORT}.tgz \
  | sudo tar -xz -C /usr/local --strip-components=1
sudo ldconfig
```

### Backend

```bash
# Start Qdrant
docker run -p 6333:6333 -p 6334:6334 qdrant/qdrant

# Run backend
cd dashboard/backend
go mod tidy
MODEL_PATH=./models/all-MiniLM-L6-v2 ALERTS_ROOT=../../alerts go run .
```

### Frontend

```bash
cd dashboard/frontend
npm install
npm run dev
```

---

## Environment variables (backend)

| Variable | Default | Description |
|----------|---------|-------------|
| `MODEL_PATH` | `./models/all-MiniLM-L6-v2` | Path to downloaded model directory |
| `EMBED_QUANTIZED` | `true` | Use INT8-quantized ONNX file (2–4× faster) |
| `QDRANT_ADDR` | `localhost:6334` | Qdrant gRPC address |
| `ALERTS_ROOT` | `../../alerts` | Path to alerts directory |
| `LISTEN_ADDR` | `:8080` | API listen address |

---

## API reference

| Endpoint | Description |
|----------|-------------|
| `GET /api/summary?date=MMDDYYYY` | Daily stats summary |
| `GET /api/alerts?date=MMDDYYYY` | All alerts for a day |
| `GET /api/graph?date=MMDDYYYY&threshold=0.75` | Similarity graph for a day |
| `GET /api/graph/all?threshold=0.75` | Cross-day similarity graph |
| `GET /api/alert/:id/similar?topk=5` | Semantically similar alerts |
| `POST /api/search` `{"query":"...","date":"...","topk":5}` | Natural language search |

---

## Project structure

```
dashboard/
├── backend/
│   ├── main.go              # Entry point
│   ├── models/models.go     # Shared types
│   ├── parser/parser.go     # Alert markdown parser
│   ├── embedder/embedder.go # Ollama HTTP client
│   ├── store/store.go       # Qdrant gRPC client
│   ├── ingestor/ingestor.go # Orchestrates parse→embed→store
│   ├── watcher/watcher.go   # fsnotify file watcher
│   ├── graph/graph.go       # Similarity graph + community detection
│   ├── summary/summary.go   # Daily stats aggregation
│   ├── api/api.go           # Gin HTTP API handlers
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.tsx               # Root app + layout
│   │   ├── api.ts                # API client
│   │   ├── types.ts              # TypeScript types
│   │   ├── colors.ts             # Color constants
│   │   └── components/
│   │       ├── AlertGraph.tsx    # Force-directed graph (react-force-graph-2d)
│   │       ├── AlertDetail.tsx   # Node detail panel + similar alerts
│   │       ├── SummaryPanels.tsx # Charts (Recharts)
│   │       ├── ClusterPanel.tsx  # Cluster list sidebar
│   │       └── SearchBar.tsx     # Semantic search UI
│   ├── Dockerfile
│   └── nginx.conf
└── docker-compose.yml
```
