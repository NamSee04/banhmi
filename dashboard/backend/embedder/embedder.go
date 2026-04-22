// Package embedder runs all-MiniLM-L6-v2 entirely in-process via ONNX Runtime.
// No external service (Ollama, Python, etc.) is required.
//
// Model setup (one-time):
//
//	go run ./cmd/download-model   # or run the shell script in scripts/download-model.sh
//
// Quantization:
//
//	By default the INT8-quantized ONNX file is used (model_quantized.onnx) when
//	present, giving ~2-4× faster inference at negligible quality loss.
//	Set EMBED_QUANTIZED=false to force the full FP32 model.
package embedder

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"github.com/knights-analytics/hugot"
	"github.com/knights-analytics/hugot/pipelineBackends"
	"github.com/knights-analytics/hugot/pipelines"
)

// Client runs sentence embeddings in-process via ONNX Runtime.
type Client struct {
	session  *hugot.Session
	pipeline *pipelines.FeatureExtractionPipeline
}

// New loads the model at modelPath and initialises the ONNX pipeline.
//
//   - modelPath must be a directory containing tokenizer_config.json and an
//     ONNX model file.  The canonical layout produced by the download script:
//
//     <modelPath>/
//     ├── tokenizer_config.json
//     ├── tokenizer.json
//     ├── config.json
//     └── onnx/
//     ├── model.onnx          (FP32)
//     └── model_quantized.onnx (INT8, preferred)
//
//   - quantized=true selects the INT8 file when available; falls back to FP32.
func New(modelPath string, quantized bool) (*Client, error) {
	if _, err := os.Stat(modelPath); err != nil {
		return nil, fmt.Errorf("model path %q not found — run scripts/download-model.sh first: %w", modelPath, err)
	}

	// Pick ONNX file
	onnxFile := onnxFilePath(modelPath, quantized)

	// Create hugot session — discovers libonnxruntime via ORT_LIB_PATH env or
	// well-known system locations (/usr/lib, /usr/local/lib, etc.)
	session, err := hugot.NewORTSession()
	if err != nil {
		return nil, fmt.Errorf("hugot session: %w (ensure libonnxruntime is installed)", err)
	}

	pipe, err := hugot.NewPipeline(session, pipelineBackends.PipelineConfig[*pipelines.FeatureExtractionPipeline]{
		ModelPath:    modelPath,
		Name:         "alert-embedder",
		OnnxFilename: onnxFile,
	})
	if err != nil {
		session.Destroy()
		return nil, fmt.Errorf("feature extraction pipeline: %w", err)
	}

	return &Client{session: session, pipeline: pipe}, nil
}

// Close releases the ONNX session and its resources.
func (c *Client) Close() {
	c.session.Destroy()
}

// Embed returns a 384-dimensional vector for text.
func (c *Client) Embed(_ context.Context, text string) ([]float32, error) {
	out, err := c.pipeline.RunPipeline([]string{text})
	if err != nil {
		return nil, fmt.Errorf("embed: %w", err)
	}
	if len(out.Embeddings) == 0 {
		return nil, fmt.Errorf("embed: empty result")
	}
	return out.Embeddings[0], nil
}

// EmbedBatch embeds multiple texts in a single batched ONNX call.
func (c *Client) EmbedBatch(_ context.Context, texts []string) ([][]float32, error) {
	if len(texts) == 0 {
		return nil, nil
	}
	out, err := c.pipeline.RunPipeline(texts)
	if err != nil {
		return nil, fmt.Errorf("embed batch: %w", err)
	}
	vectors := make([][]float32, len(out.Embeddings))
	for i, emb := range out.Embeddings {
		vectors[i] = emb
	}
	return vectors, nil
}

// onnxFilePath resolves the ONNX filename relative to modelPath.
// Prefers the quantized INT8 file when quantized=true and the file exists.
func onnxFilePath(modelPath string, quantized bool) string {
	if quantized {
		q := filepath.Join("onnx", "model_quantized.onnx")
		if _, err := os.Stat(filepath.Join(modelPath, q)); err == nil {
			return q
		}
		// Flat layout fallback
		if _, err := os.Stat(filepath.Join(modelPath, "model_quantized.onnx")); err == nil {
			return "model_quantized.onnx"
		}
	}
	// FP32 fallback
	if _, err := os.Stat(filepath.Join(modelPath, "onnx", "model.onnx")); err == nil {
		return filepath.Join("onnx", "model.onnx")
	}
	return "model.onnx"
}
