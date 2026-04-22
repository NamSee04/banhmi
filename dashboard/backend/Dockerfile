FROM golang:1.25-bookworm AS builder

ARG TARGETARCH
ARG ORT_VERSION=1.21.0
ARG TOKENIZERS_VERSION=1.20.2

# Install build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install ONNX Runtime (architecture-aware)
RUN ORT_ARCH=$([ "$TARGETARCH" = "arm64" ] && echo "aarch64" || echo "x64") \
    && curl -fsSL \
       "https://github.com/microsoft/onnxruntime/releases/download/v${ORT_VERSION}/onnxruntime-linux-${ORT_ARCH}-${ORT_VERSION}.tgz" \
       | tar -xz -C /usr/local --strip-components=1 \
    && ln -sf /usr/local/lib/libonnxruntime.so /usr/local/lib/onnxruntime.so \
    && ldconfig

# Install libtokenizers.a (required by hugot/daulet/tokenizers CGO)
# GitHub releases use aarch64 for arm64; files are .tar.gz archives
RUN TOKENIZERS_ARCH=$([ "$TARGETARCH" = "arm64" ] && echo "aarch64" || echo "amd64") \
    && curl -fsSL \
       "https://github.com/daulet/tokenizers/releases/download/v${TOKENIZERS_VERSION}/libtokenizers.linux-${TOKENIZERS_ARCH}.tar.gz" \
       | tar -xz -C /usr/local/lib/ \
    && ldconfig

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .

# CGO required for hugot (tokenizers + onnxruntime bindings)
RUN CGO_ENABLED=1 GOOS=linux \
    CGO_LDFLAGS="-L/usr/local/lib" \
    go build -o dashboard .

# -------------------------------------------------------------------
FROM debian:bookworm-slim AS runtime

ARG TARGETARCH
ARG ORT_VERSION=1.21.0
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl \
    && ORT_ARCH=$([ "$TARGETARCH" = "arm64" ] && echo "aarch64" || echo "x64") \
    && curl -fsSL \
       "https://github.com/microsoft/onnxruntime/releases/download/v${ORT_VERSION}/onnxruntime-linux-${ORT_ARCH}-${ORT_VERSION}.tgz" \
       | tar -xz -C /usr/local --strip-components=1 \
    && ln -sf /usr/local/lib/libonnxruntime.so /usr/local/lib/onnxruntime.so \
    && ldconfig \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/dashboard .
COPY --from=builder /usr/local/lib/libtokenizers.a /usr/local/lib/
COPY scripts/download-model.sh ./scripts/

# Download model at image build time (cached layer).
# Override MODEL_PATH to use a pre-mounted volume instead.
ARG DOWNLOAD_MODEL=true
RUN if [ "$DOWNLOAD_MODEL" = "true" ]; then \
      bash ./scripts/download-model.sh ./models/all-MiniLM-L6-v2; \
    fi

ENV MODEL_PATH=/app/models/all-MiniLM-L6-v2
ENV EMBED_QUANTIZED=true
ENV ORT_LIB_PATH=/usr/local/lib
ENV LD_LIBRARY_PATH=/usr/local/lib
EXPOSE 8080
CMD ["./dashboard"]
