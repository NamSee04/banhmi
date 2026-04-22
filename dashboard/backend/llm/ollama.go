package llm

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// Client is an Ollama Cloud HTTP client for streaming chat completions.
type Client struct {
	endpoint string
	apiKey   string
	model    string
	http     *http.Client
}

// New creates a new Ollama Cloud client.
func New(endpoint, apiKey, model string) *Client {
	return &Client{
		endpoint: strings.TrimRight(endpoint, "/"),
		apiKey:   apiKey,
		model:    model,
		http:     &http.Client{Timeout: 120 * time.Second},
	}
}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatRequest struct {
	Model    string        `json:"model"`
	Messages []chatMessage `json:"messages"`
	Stream   bool          `json:"stream"`
}

type streamChunk struct {
	Choices []struct {
		Delta struct {
			Content string `json:"content"`
		} `json:"delta"`
	} `json:"choices"`
}

// ChatStream sends a streaming chat request to Ollama Cloud.
// tokens receives incremental content strings; errs receives at most one error.
// Both channels are closed when the stream ends.
func (c *Client) ChatStream(ctx context.Context, sys, user string) (<-chan string, <-chan error) {
	tokens := make(chan string, 64)
	errs := make(chan error, 1)

	go func() {
		defer close(tokens)
		defer close(errs)

		body, _ := json.Marshal(chatRequest{
			Model: c.model,
			Messages: []chatMessage{
				{Role: "system", Content: sys},
				{Role: "user", Content: user},
			},
			Stream: true,
		})

		req, err := http.NewRequestWithContext(ctx, http.MethodPost,
			c.endpoint+"/v1/chat/completions", bytes.NewReader(body))
		if err != nil {
			errs <- fmt.Errorf("build request: %w", err)
			return
		}
		req.Header.Set("Authorization", "Bearer "+c.apiKey)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Accept", "text/event-stream")

		resp, err := c.http.Do(req)
		if err != nil {
			errs <- fmt.Errorf("http: %w", err)
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			var snippet [512]byte
			n, _ := resp.Body.Read(snippet[:])
			errs <- fmt.Errorf("ollama %d: %s", resp.StatusCode, string(snippet[:n]))
			return
		}

		scanner := bufio.NewScanner(resp.Body)
		scanner.Buffer(make([]byte, 1<<20), 1<<20) // 1 MiB buffer

		for scanner.Scan() {
			select {
			case <-ctx.Done():
				return
			default:
			}

			line := strings.TrimSpace(scanner.Text())
			if line == "" {
				continue
			}
			line = strings.TrimPrefix(line, "data: ")
			if line == "[DONE]" {
				return
			}

			var chunk streamChunk
			if err := json.Unmarshal([]byte(line), &chunk); err != nil {
				continue // skip malformed lines
			}
			if len(chunk.Choices) > 0 {
				if t := chunk.Choices[0].Delta.Content; t != "" {
					select {
					case tokens <- t:
					case <-ctx.Done():
						return
					}
				}
			}
		}

		if err := scanner.Err(); err != nil {
			errs <- fmt.Errorf("stream read: %w", err)
		}
	}()

	return tokens, errs
}
