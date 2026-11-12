package app

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

func newTestStore(t *testing.T) *resultStore {
	t.Helper()
	store, err := newResultStore(filepath.Join(t.TempDir(), "results"))
	if err != nil {
		t.Fatal(err)
	}
	return store
}

func TestResultStoreListsNewestRecordingFirst(t *testing.T) {
	store := newTestStore(t)
	base := time.Date(2026, 11, 12, 15, 0, 0, 0, time.UTC)
	for _, record := range []resultRecord{
		{RunID: "older", RecordingStart: 1000, PeakCount: 2, ProcessedAt: base},
		{RunID: "newer", RecordingStart: 2000, PeakCount: 0, ProcessedAt: base},
		{RunID: "older", RecordingStart: 1000, PeakCount: 3, ProcessedAt: base.Add(time.Minute)}, // redelivery
	} {
		if err := store.save(record, nil); err != nil {
			t.Fatal(err)
		}
	}
	records, err := store.list()
	if err != nil {
		t.Fatal(err)
	}
	if len(records) != 2 || records[0].RunID != "newer" || records[1].RunID != "older" || records[1].PeakCount != 3 {
		t.Fatalf("unexpected records: %+v", records)
	}
}

func TestResultStoreSkipsMalformedLines(t *testing.T) {
	store := newTestStore(t)
	if err := store.save(resultRecord{RunID: "good", RecordingStart: 1}, nil); err != nil {
		t.Fatal(err)
	}
	log, err := os.OpenFile(filepath.Join(store.dir, resultsLogName), os.O_APPEND|os.O_WRONLY, 0)
	if err != nil {
		t.Fatal(err)
	}
	_, _ = log.WriteString("{not json\n{\"runId\":\"../escape\"}\n")
	log.Close()
	records, err := store.list()
	if err != nil || len(records) != 1 || records[0].RunID != "good" {
		t.Fatalf("records = %+v, error = %v", records, err)
	}
}

func TestResultStoreEmptyAndPrivate(t *testing.T) {
	store := newTestStore(t)
	records, err := store.list()
	if err != nil || len(records) != 0 {
		t.Fatalf("empty store returned %+v, %v", records, err)
	}
	if err := store.save(resultRecord{RunID: "run-1"}, []byte("jpeg")); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"run-1.jpg", resultsLogName} {
		info, err := os.Stat(filepath.Join(store.dir, name))
		if err != nil || info.Mode().Perm() != 0o600 {
			t.Fatalf("%s mode = %v, error = %v", name, info.Mode().Perm(), err)
		}
	}
	if info, err := os.Stat(store.dir); err != nil || info.Mode().Perm() != 0o700 {
		t.Fatalf("results directory is not private: %v", err)
	}
	if err := store.save(resultRecord{RunID: "../escape"}, []byte("jpeg")); err == nil {
		t.Fatal("accepted a path-like runId for a snapshot")
	}
}

func TestNewResultRecordUsesDetection(t *testing.T) {
	invocation := handledInvocation{
		runID: "run-1", mediaKey: "owner/1700000000_clip.mp4", recordingStart: 1700000000,
		detection: personDetection{Detected: true, PeakCount: 4, PeakAtSeconds: 9, FramesAnalyzed: 30, PeakSnapshot: []byte("x")},
	}
	record := newResultRecord(invocation, "submitted", time.Unix(1700000100, 0))
	if record.RunID != "run-1" || record.PeakCount != 4 || record.Delivery != "submitted" || !record.HasSnapshot ||
		record.RecordingStart != 1700000000 || !record.ProcessedAt.Equal(time.Unix(1700000100, 0)) {
		t.Fatalf("unexpected record: %+v", record)
	}
}

func TestDashboardHandler(t *testing.T) {
	store := newTestStore(t)
	if err := store.save(resultRecord{RunID: "run-1", RecordingStart: 5, PeakCount: 2, HasSnapshot: true}, []byte("jpeg-bytes")); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(filepath.Dir(store.dir), "secret.jpg"), []byte("secret"), 0o600); err != nil {
		t.Fatal(err)
	}
	handler := newDashboardHandler(store)
	get := func(method, target string) *httptest.ResponseRecorder {
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, httptest.NewRequest(method, target, nil))
		return recorder
	}

	page := get(http.MethodGet, "/")
	if page.Code != http.StatusOK || !strings.Contains(page.Body.String(), "<title>Shop Occupancy</title>") ||
		!strings.Contains(page.Header().Get("Content-Security-Policy"), "default-src 'none'") ||
		page.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Fatalf("page: %d %v", page.Code, page.Header())
	}

	api := get(http.MethodGet, "/api/results")
	var body struct {
		Results []resultRecord `json:"results"`
	}
	if api.Code != http.StatusOK || json.Unmarshal(api.Body.Bytes(), &body) != nil || len(body.Results) != 1 || body.Results[0].PeakCount != 2 {
		t.Fatalf("api: %d %s", api.Code, api.Body.String())
	}

	snapshot := get(http.MethodGet, "/snapshots/run-1.jpg")
	if snapshot.Code != http.StatusOK || snapshot.Body.String() != "jpeg-bytes" || snapshot.Header().Get("Content-Type") != "image/jpeg" {
		t.Fatalf("snapshot: %d %q", snapshot.Code, snapshot.Body.String())
	}

	for _, target := range []string{
		"/snapshots/missing.jpg",
		"/snapshots/run-1.png",
		"/snapshots/..%2Fsecret.jpg",
		"/snapshots/%2E%2E.jpg",
		"/unknown",
	} {
		if response := get(http.MethodGet, target); response.Code != http.StatusNotFound {
			t.Errorf("%s returned %d, want 404", target, response.Code)
		}
	}
	if response := get(http.MethodPost, "/api/results"); response.Code != http.StatusMethodNotAllowed {
		t.Errorf("POST /api/results returned %d", response.Code)
	}
}

func TestDeliveryRecordsResultForDashboard(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method == http.MethodGet {
			_, _ = writer.Write([]byte("video"))
			return
		}
		writer.WriteHeader(http.StatusAccepted)
	}))
	defer server.Close()
	body := strings.Replace(sampleInvocation, "https://api.example.com", server.URL, 1)
	body = strings.Replace(body, "https://example.com?secret=SECRET", server.URL+"/recording.mp4", 1)
	store := newTestStore(t)
	settings := config{
		operation: "forwarder", mode: "http", token: "test-token", start: 1700000000, duration: 30,
		detector: &stubPersonDetector{detection: personDetection{
			Detected: true, FramesAnalyzed: 30, PeakCount: 2, PeakAtSeconds: 4, SampleSeconds: 1, PeakSnapshot: []byte("jpeg"),
		}},
		results: store,
	}
	ack := &acknowledgements{}
	if _, err := handleDelivery(context.Background(), settings, amqp.Delivery{Body: []byte(body), Acknowledger: ack}, io.Discard); err != nil {
		t.Fatal(err)
	}
	records, err := store.list()
	if err != nil || len(records) != 1 {
		t.Fatalf("records = %+v, error = %v", records, err)
	}
	if record := records[0]; record.RunID != "665f1b2c3d4e5f6071829304" || record.Delivery != "submitted" ||
		record.PeakCount != 2 || record.RecordingStart != 1700000000 || !record.HasSnapshot {
		t.Fatalf("unexpected record: %+v", record)
	}
	if ack.acks != 1 {
		t.Fatalf("delivery was not acknowledged: %+v", ack)
	}
}

func TestFailedCallbackIsNotRecorded(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method == http.MethodGet {
			_, _ = writer.Write([]byte("video"))
			return
		}
		writer.WriteHeader(http.StatusUnauthorized)
	}))
	defer server.Close()
	body := strings.Replace(sampleInvocation, "https://api.example.com", server.URL, 1)
	body = strings.Replace(body, "https://example.com?secret=SECRET", server.URL+"/recording.mp4", 1)
	store := newTestStore(t)
	settings := config{
		operation: "forwarder", mode: "http", token: "test-token", start: 1700000000, duration: 30,
		detector: detectedPerson(), results: store,
	}
	ack := &acknowledgements{}
	if _, err := handleDelivery(context.Background(), settings, amqp.Delivery{Body: []byte(body), Acknowledger: ack}, io.Discard); err == nil {
		t.Fatal("expected the rejected callback to fail the delivery")
	}
	if records, _ := store.list(); len(records) != 0 {
		t.Fatalf("a result Hub rejected was recorded: %+v", records)
	}
}

func TestLoadDashboardConfig(t *testing.T) {
	t.Setenv("RESULTS_DIR", "")
	t.Setenv("DASHBOARD_ADDR", "")
	if store, address, err := loadDashboardConfig(); store != nil || address != "" || err != nil {
		t.Fatalf("disabled dashboard returned %v %q %v", store, address, err)
	}

	t.Setenv("DASHBOARD_ADDR", "127.0.0.1:8090")
	if _, _, err := loadDashboardConfig(); err == nil {
		t.Fatal("accepted DASHBOARD_ADDR without RESULTS_DIR")
	}

	directory := filepath.Join(t.TempDir(), "results")
	t.Setenv("RESULTS_DIR", directory)
	t.Setenv("DASHBOARD_ADDR", "not-an-address")
	if _, _, err := loadDashboardConfig(); err == nil {
		t.Fatal("accepted an invalid DASHBOARD_ADDR")
	}

	t.Setenv("DASHBOARD_ADDR", "0.0.0.0:8090")
	store, address, err := loadDashboardConfig()
	if err != nil || store == nil || address != "0.0.0.0:8090" {
		t.Fatalf("store = %v, address = %q, error = %v", store, address, err)
	}
}
