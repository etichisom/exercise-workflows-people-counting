package app

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

const (
	resultsLogName = "results.jsonl"
	// maxListedResults bounds what the dashboard API returns.
	maxListedResults = 500
)

// resultRecord is one processed recording as shown on the local dashboard.
type resultRecord struct {
	ProcessedAt      time.Time `json:"processedAt"`
	RunID            string    `json:"runId"`
	MediaKey         string    `json:"mediaKey"`
	RecordingStart   int64     `json:"recordingStart"`
	Delivery         string    `json:"delivery"`
	PersonDetected   bool      `json:"personDetected"`
	PeakCount        int       `json:"peakCount"`
	PeakAtSeconds    float64   `json:"peakAtSeconds"`
	FirstSeenSeconds float64   `json:"firstSeenSeconds"`
	LastSeenSeconds  float64   `json:"lastSeenSeconds"`
	SampleSeconds    float64   `json:"sampleSeconds"`
	FramesAnalyzed   int       `json:"framesAnalyzed"`
	MaxConfidence    float32   `json:"maxConfidence"`
	HasSnapshot      bool      `json:"hasSnapshot"`
}

func newResultRecord(invocation handledInvocation, delivery string, processedAt time.Time) resultRecord {
	detection := invocation.detection
	return resultRecord{
		ProcessedAt:      processedAt.UTC(),
		RunID:            invocation.runID,
		MediaKey:         invocation.mediaKey,
		RecordingStart:   invocation.recordingStart,
		Delivery:         delivery,
		PersonDetected:   detection.Detected,
		PeakCount:        detection.PeakCount,
		PeakAtSeconds:    detection.PeakAtSeconds,
		FirstSeenSeconds: detection.FirstSeenSeconds,
		LastSeenSeconds:  detection.LastSeenSeconds,
		SampleSeconds:    detection.SampleSeconds,
		FramesAnalyzed:   detection.FramesAnalyzed,
		MaxConfidence:    detection.MaxConfidence,
		HasSnapshot:      len(detection.PeakSnapshot) > 0,
	}
}

// resultStore keeps processed results in a private local directory: an
// append-only JSON Lines log plus one peak snapshot per run. Snapshots can
// show people, so the directory is created owner-only and must stay out of Git.
type resultStore struct {
	dir string
	mu  sync.Mutex
}

func newResultStore(dir string) (*resultStore, error) {
	if dir == "" {
		return nil, errors.New("results directory is empty")
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, fmt.Errorf("cannot create RESULTS_DIR: %w", err)
	}
	return &resultStore{dir: dir}, nil
}

func (store *resultStore) snapshotPath(runID string) (string, error) {
	if !runIDPattern.MatchString(runID) {
		return "", errors.New("invalid runId")
	}
	return filepath.Join(store.dir, runID+".jpg"), nil
}

// save writes the snapshot (if any) before the log line, so a listed record
// never points at a missing image.
func (store *resultStore) save(record resultRecord, snapshot []byte) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	if len(snapshot) > 0 {
		path, err := store.snapshotPath(record.RunID)
		if err != nil {
			return err
		}
		if err := os.WriteFile(path, snapshot, 0o600); err != nil {
			return fmt.Errorf("cannot write snapshot: %w", err)
		}
	}
	line, err := json.Marshal(record)
	if err != nil {
		return err
	}
	log, err := os.OpenFile(filepath.Join(store.dir, resultsLogName), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return fmt.Errorf("cannot open results log: %w", err)
	}
	if _, err := log.Write(append(line, '\n')); err != nil {
		log.Close()
		return fmt.Errorf("cannot append result: %w", err)
	}
	return log.Close()
}

// list returns the newest results first. A redelivered run keeps only its
// latest record, and malformed lines are skipped rather than failing the page.
func (store *resultStore) list() ([]resultRecord, error) {
	store.mu.Lock()
	content, err := os.ReadFile(filepath.Join(store.dir, resultsLogName))
	store.mu.Unlock()
	if errors.Is(err, os.ErrNotExist) {
		return []resultRecord{}, nil
	}
	if err != nil {
		return nil, err
	}
	latest := map[string]resultRecord{}
	scanner := bufio.NewScanner(bytes.NewReader(content))
	for scanner.Scan() {
		var record resultRecord
		if json.Unmarshal(scanner.Bytes(), &record) != nil || !runIDPattern.MatchString(record.RunID) {
			continue
		}
		latest[record.RunID] = record
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	records := make([]resultRecord, 0, len(latest))
	for _, record := range latest {
		records = append(records, record)
	}
	sort.Slice(records, func(i, j int) bool {
		if records[i].RecordingStart != records[j].RecordingStart {
			return records[i].RecordingStart > records[j].RecordingStart
		}
		return records[i].ProcessedAt.After(records[j].ProcessedAt)
	})
	if len(records) > maxListedResults {
		records = records[:maxListedResults]
	}
	return records, nil
}
