package ingestor

import (
	"context"
	"fmt"
	"log"
	"path/filepath"
	"strings"

	"github.com/namsee/banhmi/dashboard/embedder"
	"github.com/namsee/banhmi/dashboard/models"
	"github.com/namsee/banhmi/dashboard/parser"
	"github.com/namsee/banhmi/dashboard/store"
)

// Ingestor orchestrates parsing → embedding → storing
type Ingestor struct {
	alertsRoot string
	embedder   *embedder.Client
	store      *store.Client
}

// New creates an Ingestor
func New(alertsRoot string, emb *embedder.Client, st *store.Client) *Ingestor {
	return &Ingestor{alertsRoot: alertsRoot, embedder: emb, store: st}
}

// IngestAll parses and embeds all alert files, upserting into Qdrant
func (ing *Ingestor) IngestAll(ctx context.Context) error {
	alerts, err := parser.ParseAll(ing.alertsRoot)
	if err != nil {
		return fmt.Errorf("parse all: %w", err)
	}
	return ing.ingest(ctx, alerts)
}

// IngestDay parses and embeds all alerts for a specific date
func (ing *Ingestor) IngestDay(ctx context.Context, date string) error {
	alerts, err := parser.ParseDay(ing.alertsRoot, date)
	if err != nil {
		return fmt.Errorf("parse day %s: %w", date, err)
	}
	return ing.ingest(ctx, alerts)
}

// IngestFile parses and embeds a single file
func (ing *Ingestor) IngestFile(ctx context.Context, path string) error {
	// path is like /abs/path/to/alerts/04172026/001.md
	rel, err := filepath.Rel(ing.alertsRoot, path)
	if err != nil {
		return err
	}
	parts := strings.SplitN(rel, string(filepath.Separator), 2)
	if len(parts) != 2 {
		return fmt.Errorf("unexpected path structure: %s", rel)
	}
	date, filename := parts[0], parts[1]
	alert, err := parser.ParseFile(ing.alertsRoot, date, filename)
	if err != nil {
		return err
	}
	return ing.ingest(ctx, []*models.Alert{alert})
}

func (ing *Ingestor) ingest(ctx context.Context, alerts []*models.Alert) error {
	if len(alerts) == 0 {
		return nil
	}

	texts := make([]string, len(alerts))
	for i, a := range alerts {
		texts[i] = a.EmbedText
	}

	log.Printf("[ingestor] embedding %d alerts...", len(alerts))
	vectors, err := ing.embedder.EmbedBatch(ctx, texts)
	if err != nil {
		return fmt.Errorf("embed batch: %w", err)
	}

	if err := ing.store.UpsertBatch(ctx, alerts, vectors); err != nil {
		return fmt.Errorf("upsert batch: %w", err)
	}

	log.Printf("[ingestor] ingested %d alerts into Qdrant", len(alerts))
	return nil
}
