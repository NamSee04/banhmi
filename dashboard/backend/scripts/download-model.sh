#!/usr/bin/env bash
# Download all-MiniLM-L6-v2 ONNX model files from HuggingFace.
# Produces both FP32 and INT8-quantized ONNX files.
#
# Usage:
#   ./scripts/download-model.sh [output-dir]
#
# Default output-dir: ./models/all-MiniLM-L6-v2
#
# Requires: curl (or wget), python3 + pip (for quantization only)
# Set HF_TOKEN env var if you hit rate limits.

set -euo pipefail

REPO="sentence-transformers/all-MiniLM-L6-v2"
OUT="${1:-./models/all-MiniLM-L6-v2}"
HF_BASE="https://huggingface.co/${REPO}/resolve/main"
AUTH=""
[ -n "${HF_TOKEN:-}" ] && AUTH="Authorization: Bearer ${HF_TOKEN}"

mkdir -p "${OUT}/onnx"

download() {
  local src="$1" dst="$2"
  echo "  → ${dst}"
  if [ -n "${AUTH}" ]; then
    curl -fsSL -H "${AUTH}" "${src}" -o "${dst}"
  else
    curl -fsSL "${src}" -o "${dst}"
  fi
}

echo "Downloading tokenizer files..."
download "${HF_BASE}/tokenizer_config.json"  "${OUT}/tokenizer_config.json"
download "${HF_BASE}/tokenizer.json"         "${OUT}/tokenizer.json"
download "${HF_BASE}/special_tokens_map.json" "${OUT}/special_tokens_map.json"
download "${HF_BASE}/config.json"            "${OUT}/config.json"

echo "Downloading ONNX model (FP32)..."
# Try the onnx/ subfolder first (newer layout), then root
if curl -fsSL --head "${HF_BASE}/onnx/model.onnx" >/dev/null 2>&1; then
  download "${HF_BASE}/onnx/model.onnx"             "${OUT}/onnx/model.onnx"
  download "${HF_BASE}/onnx/model_quantized.onnx"   "${OUT}/onnx/model_quantized.onnx" || true
else
  download "${HF_BASE}/model.onnx" "${OUT}/onnx/model.onnx"
fi

echo ""
if [ -f "${OUT}/onnx/model_quantized.onnx" ]; then
  echo "✓ Model ready at ${OUT}/"
  echo "  FP32:  onnx/model.onnx"
  echo "  INT8:  onnx/model_quantized.onnx  ← default (EMBED_QUANTIZED=true)"
else
  echo "✓ FP32 model ready at ${OUT}/onnx/model.onnx"
  echo "  No quantized file found. Set EMBED_QUANTIZED=false or quantize manually:"
  echo "  pip install optimum[onnxruntime] && optimum-cli onnx quantize --model ${OUT} --output ${OUT}/onnx"
fi
