package main

import (
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"path/filepath"
	"time"
)

func broadcastReload() {
	reloadMu.Lock()
	defer reloadMu.Unlock()
	for ch := range reloadClients {
		select {
		case ch <- struct{}{}:
		default:
		}
	}
}

func handleReload(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	ch := make(chan struct{}, 1)
	reloadMu.Lock()
	reloadClients[ch] = struct{}{}
	reloadMu.Unlock()
	defer func() {
		reloadMu.Lock()
		delete(reloadClients, ch)
		reloadMu.Unlock()
	}()

	fmt.Fprintf(w, ": connected\n\n")
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}

	select {
	case <-ch:
		fmt.Fprintf(w, "data: reload\n\n")
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}
	case <-r.Context().Done():
	}
}

func latestMod(dirs []string) time.Time {
	var latest time.Time
	for _, dir := range dirs {
		filepath.WalkDir(dir, func(_ string, d fs.DirEntry, err error) error { //nolint:errcheck
			if err != nil {
				return nil
			}
			info, err := d.Info()
			if err != nil {
				return nil
			}
			if info.ModTime().After(latest) {
				latest = info.ModTime()
			}
			return nil
		})
	}
	return latest
}

func watchAndRebuild() {
	watched := []string{"content", "templates", "assets"}
	last := latestMod(watched)

	ticker := time.NewTicker(400 * time.Millisecond)
	defer ticker.Stop()

	for range ticker.C {
		if mod := latestMod(watched); mod.After(last) {
			last = mod
			if err := buildSite(); err != nil {
				log.Printf("rebuild error: %v", err)
				continue
			}
			fmt.Println("Rebuilt.")
			broadcastReload()
		}
	}
}
