package app

import (
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"strings"
	"time"

	log "github.com/sirupsen/logrus"
)

//go:embed dashboard/index.html
var dashboardPage []byte

// newDashboardHandler serves the read-only occupancy dashboard: the page, the
// results API, and peak snapshots. It never exposes anything outside the
// results directory.
func newDashboardHandler(store *resultStore) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /{$}", func(writer http.ResponseWriter, _ *http.Request) {
		writer.Header().Set("Content-Type", "text/html; charset=utf-8")
		writer.Header().Set("Cache-Control", "no-cache")
		_, _ = writer.Write(dashboardPage)
	})
	mux.HandleFunc("GET /api/results", func(writer http.ResponseWriter, _ *http.Request) {
		records, err := store.list()
		if err != nil {
			log.WithError(err).WithField("component", "dashboard").Error("Cannot read results")
			http.Error(writer, "cannot read results", http.StatusInternalServerError)
			return
		}
		writer.Header().Set("Content-Type", "application/json")
		writer.Header().Set("Cache-Control", "no-store")
		_ = json.NewEncoder(writer).Encode(struct {
			Results []resultRecord `json:"results"`
		}{records})
	})
	mux.HandleFunc("GET /snapshots/{file}", func(writer http.ResponseWriter, request *http.Request) {
		runID, ok := strings.CutSuffix(request.PathValue("file"), ".jpg")
		path, err := store.snapshotPath(runID)
		if !ok || err != nil {
			http.NotFound(writer, request)
			return
		}
		content, err := os.ReadFile(path)
		if err != nil {
			http.NotFound(writer, request)
			return
		}
		writer.Header().Set("Content-Type", "image/jpeg")
		writer.Header().Set("Cache-Control", "private, max-age=3600")
		_, _ = writer.Write(content)
	})
	return securityHeaders(mux)
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		header := writer.Header()
		header.Set("X-Content-Type-Options", "nosniff")
		header.Set("Referrer-Policy", "no-referrer")
		header.Set("X-Frame-Options", "DENY")
		header.Set("Content-Security-Policy",
			"default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; "+
				"img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
		next.ServeHTTP(writer, request)
	})
}

// serveDashboard runs the dashboard until ctx is cancelled.
func serveDashboard(ctx context.Context, address string, store *resultStore) error {
	server := &http.Server{
		Addr:              address,
		Handler:           newDashboardHandler(store),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	failed := make(chan error, 1)
	go func() { failed <- server.ListenAndServe() }()
	log.WithFields(log.Fields{
		"component": "dashboard",
		"event":     "dashboard_listening",
		"address":   address,
	}).Info("Dashboard listening")
	select {
	case err := <-failed:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-ctx.Done():
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return server.Shutdown(shutdown)
	}
}
