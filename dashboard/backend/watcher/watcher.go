package watcher

import (
	"context"
	"log"
	"path/filepath"
	"strings"

	"github.com/fsnotify/fsnotify"
	"github.com/namsee/banhmi/dashboard/ingestor"
)

// Watch monitors the alerts directory and re-ingests files on create/write
func Watch(ctx context.Context, alertsRoot string, ing *ingestor.Ingestor) error {
	w, err := fsnotify.NewWatcher()
	if err != nil {
		return err
	}

	// Watch root and all existing date subdirs
	if err := w.Add(alertsRoot); err != nil {
		return err
	}

	go func() {
		defer w.Close()
		for {
			select {
			case <-ctx.Done():
				return
			case event, ok := <-w.Events:
				if !ok {
					return
				}
				if event.Has(fsnotify.Create) {
					// New date directory — start watching it
					if !strings.HasSuffix(event.Name, ".md") {
						_ = w.Add(event.Name)
						continue
					}
				}
				if (event.Has(fsnotify.Create) || event.Has(fsnotify.Write)) &&
					strings.HasSuffix(event.Name, ".md") {
					path := filepath.Clean(event.Name)
					log.Printf("[watcher] detected change: %s", path)
					if err := ing.IngestFile(ctx, path); err != nil {
						log.Printf("[watcher] ingest error: %v", err)
					}
				}
			case err, ok := <-w.Errors:
				if !ok {
					return
				}
				log.Printf("[watcher] error: %v", err)
			}
		}
	}()

	return nil
}
