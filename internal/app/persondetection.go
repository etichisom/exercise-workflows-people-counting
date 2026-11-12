package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"path"
	"regexp"
	"strconv"
	"time"

	log "github.com/sirupsen/logrus"
	ingest "github.com/uug-ai/ingest/pkg/ingest"
	"github.com/uug-ai/models/pkg/models"
)

const operation = "forwarder"
const invocationSchemaV1 = models.WorkflowInvocationSchemaV1
const (
	peopleCountingCategory = "people counting"
	peakOccupancyEvent     = "peak occupancy"
)
const maxMediaSize = 100 << 20

var runIDPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_-]*$`)
var signedMediaClient = &http.Client{Timeout: 2 * time.Minute}

// Recording keys name the capture start in one of two filename forms:
// "<unix-ms>-<device>.mp4" (dated keys, owner/yyyy/mm/dd/...) and
// "<unix-seconds>_<capture>_..." (older Agent uploads).
var datedRecordingName = regexp.MustCompile(`^([0-9]+)-[^/\\]+\.mp4$`)
var legacyRecordingName = regexp.MustCompile(`^([0-9]+)_.+$`)

// recordingStartFromKey returns the recording's start in Unix seconds.
func recordingStartFromKey(key string) (int64, error) {
	name := path.Base(key)
	if match := datedRecordingName.FindStringSubmatch(name); match != nil {
		millis, err := strconv.ParseInt(match[1], 10, 64)
		if start := millis / 1000; err == nil && start >= 1 && start <= 253402300799 {
			return start, nil
		}
	} else if match := legacyRecordingName.FindStringSubmatch(name); match != nil {
		start, err := strconv.ParseInt(match[1], 10, 64)
		if err == nil && start >= 1 && start <= 253402300799 {
			return start, nil
		}
	}
	return 0, errors.New("media.key filename must start with the recording's Unix-milliseconds timestamp followed by '-<device>.mp4', or its Unix-seconds timestamp followed by '_'; set MARKER_START_TIMESTAMP explicitly for nonstandard keys")
}

type handledInvocation struct {
	runID    string
	callback *models.WorkflowCallback
	result   models.WorkflowResult

	// Local-only context for the results log; never sent to Hub.
	mediaKey       string
	recordingStart int64
	detection      personDetection
}

func buildPersonMarker(invocation models.WorkflowInvocation, detection personDetection, start, duration int64) models.Marker {
	people := max(detection.PeakCount, 1)
	markerStart, markerEnd := markerInterval(detection, start, duration)
	marker := models.Marker{
		OrganisationId: invocation.Tenant.OrganisationID,
		MediaKeys:      []string{invocation.Media.Key},
		Name:           peopleMarkerName(people),
		Description:    detectionSummary(detection),
		StartTimestamp: markerStart,
		EndTimestamp:   markerEnd,
		Duration:       markerEnd - markerStart,
		Categories:     []models.MarkerCategory{{Name: peopleCountingCategory}},
		Tags:           []models.MarkerTag{{Name: peopleCountTag(people)}},
	}
	if detection.PeakCount > 0 {
		peak := start + int64(math.Floor(detection.PeakAtSeconds))
		marker.Events = []models.MarkerEvent{{
			Name:           peakOccupancyEvent,
			Description:    fmt.Sprintf("%s visible at once", pluralPeople(people)),
			StartTimestamp: peak,
			EndTimestamp:   peak + 1,
			Duration:       1,
		}}
	}
	if len(invocation.Device.SiteIDs) > 0 {
		marker.SiteId = invocation.Device.SiteIDs[0]
	}
	return marker
}

// markerInterval covers the time people were actually visible, from the first
// to the last sampled frame containing a person plus one sample interval.
// Without frame timing (PeakCount == 0) it falls back to the configured
// MARKER_DURATION_SECONDS window from the recording start.
func markerInterval(detection personDetection, start, duration int64) (int64, int64) {
	if detection.PeakCount == 0 {
		return start, start + duration
	}
	from := start + int64(math.Floor(detection.FirstSeenSeconds))
	to := start + int64(math.Ceil(detection.LastSeenSeconds+detection.SampleSeconds))
	if to <= from {
		to = from + 1
	}
	return from, to
}

func pluralPeople(count int) string {
	if count == 1 {
		return "1 person"
	}
	return fmt.Sprintf("%d people", count)
}

// peopleMarkerName is the searchable marker name, e.g. "3 people detected".
func peopleMarkerName(count int) string {
	return pluralPeople(count) + " detected"
}

func peopleCountTag(count int) string {
	return fmt.Sprintf("people:%d", count)
}

// formatOffset renders seconds from the recording start as m:ss.
func formatOffset(seconds float64) string {
	whole := int(math.Floor(seconds))
	return fmt.Sprintf("%d:%02d", whole/60, whole%60)
}

func detectionSummary(detection personDetection) string {
	if detection.PeakCount == 0 {
		return fmt.Sprintf("YOLO detected a person with %.2f confidence after analyzing %d sampled frames",
			detection.MaxConfidence, detection.FramesAnalyzed)
	}
	return fmt.Sprintf("YOLO counted up to %s at %s; people visible %s-%s; %d sampled frames, best person confidence %.2f",
		pluralPeople(detection.PeakCount), formatOffset(detection.PeakAtSeconds),
		formatOffset(detection.FirstSeenSeconds), formatOffset(detection.LastSeenSeconds+detection.SampleSeconds),
		detection.FramesAnalyzed, detection.MaxConfidence)
}

func handleInvocation(ctx context.Context, body []byte, stageOperation string, start, duration int64, detector personDetector) (handledInvocation, error) {
	var invocation models.WorkflowInvocation
	if json.Unmarshal(body, &invocation) != nil {
		return handledInvocation{}, errors.New("expected a workflow invocation JSON object")
	}
	runID, dispatchOperation, callback, err := dispatchMetadata(invocation)
	if err != nil {
		return handledInvocation{}, err
	}
	if dispatchOperation != stageOperation {
		return handledInvocation{}, fmt.Errorf("dispatch operation %q does not match STAGE_OPERATION %q", dispatchOperation, stageOperation)
	}
	if !runIDPattern.MatchString(runID) {
		return handledInvocation{}, errors.New("invalid runId")
	}
	if callback != nil && callback.URL != "" {
		if err := validateCallback(callback, runID); err != nil {
			return handledInvocation{}, err
		}
	}
	if start == 0 {
		start, err = recordingStartFromKey(invocation.Media.Key)
		if err != nil {
			return handledInvocation{}, err
		}
	}
	if start < 1 || start > 253402300799 || duration < 1 || duration > 3600 || start > 253402300799-duration {
		return handledInvocation{}, errors.New("provide a valid Unix-seconds marker start and duration of 1..3600 seconds")
	}

	logWorkflowMedia(invocation)

	media, err := downloadSignedMedia(ctx, invocation.Media.SignedURL)
	if err != nil {
		return handledInvocation{}, err
	}
	log.WithFields(log.Fields{
		"component":        "workflow_stage",
		"event":            "workflow_media_downloaded",
		"media_key":        invocation.Media.Key,
		"media_size_bytes": len(media),
	}).Info("Workflow media downloaded into memory")

	if detector == nil {
		return handledInvocation{}, errors.New("YOLO person detector is not configured")
	}
	detection, err := detector.Detect(ctx, media)
	if err != nil {
		return handledInvocation{}, err
	}
	log.WithFields(log.Fields{
		"component":       "workflow_stage",
		"event":           "yolo_person_detection_completed",
		"frames_analyzed": detection.FramesAnalyzed,
		"max_confidence":  detection.MaxConfidence,
		"person_detected": detection.Detected,
		"peak_people":     detection.PeakCount,
		"peak_at_seconds": detection.PeakAtSeconds,
	}).Info("YOLO person detection completed")

	result := models.WorkflowResult{
		Schema: models.WorkflowResultSchemaV1,
		Stage:  models.WorkflowStageReference{Operation: dispatchOperation},
	}
	if detection.Detected {
		marker := buildPersonMarker(invocation, detection, start, duration)
		markerData, err := json.Marshal(marker)
		if err != nil {
			return handledInvocation{}, err
		}
		mediaPatchData, err := json.Marshal(struct {
			MediaKey    string `json:"mediaKey"`
			Description string `json:"description"`
		}{
			MediaKey:    invocation.Media.Key,
			Description: marker.Description,
		})
		if err != nil {
			return handledInvocation{}, err
		}
		payload, err := json.Marshal(struct {
			Blocks []ingest.Block `json:"blocks"`
		}{
			Blocks: []ingest.Block{
				{Type: ingest.KindMarker, Data: markerData},
				{Type: ingest.KindMediaPatch, Data: mediaPatchData},
			},
		})
		if err != nil {
			return handledInvocation{}, err
		}
		result.Payload = payload
	} else {
		result.Result = map[string]any{
			"personDetected": false,
			"peopleCount":    0,
			"framesAnalyzed": detection.FramesAnalyzed,
		}
	}

	return handledInvocation{
		runID:          runID,
		callback:       callback,
		result:         result,
		mediaKey:       invocation.Media.Key,
		recordingStart: start,
		detection:      detection,
	}, nil
}

func downloadSignedMedia(ctx context.Context, signedURL string) ([]byte, error) {
	endpoint, err := url.Parse(signedURL)
	if err != nil || endpoint.Host == "" || endpoint.User != nil || endpoint.Scheme != "http" && endpoint.Scheme != "https" {
		return nil, errors.New("media.signedUrl must be an absolute HTTP or HTTPS URL without user credentials")
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint.String(), nil)
	if err != nil {
		return nil, errors.New("cannot create signed media request")
	}
	response, err := signedMediaClient.Do(request)
	if err != nil {
		if ctx.Err() != nil {
			return nil, fmt.Errorf("signed media download canceled: %w", ctx.Err())
		}
		return nil, errors.New("signed media download request failed")
	}
	defer response.Body.Close()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return nil, fmt.Errorf("signed media download returned HTTP %d", response.StatusCode)
	}
	if response.ContentLength > maxMediaSize {
		return nil, fmt.Errorf("signed media exceeds the %d-byte in-memory limit", maxMediaSize)
	}
	media, err := io.ReadAll(io.LimitReader(response.Body, maxMediaSize+1))
	if err != nil {
		return nil, errors.New("cannot read signed media response")
	}
	if len(media) > maxMediaSize {
		return nil, fmt.Errorf("signed media exceeds the %d-byte in-memory limit", maxMediaSize)
	}
	return media, nil
}

func dispatchMetadata(invocation models.WorkflowInvocation) (runID, dispatchOperation string, callback *models.WorkflowCallback, err error) {
	if invocation.RunID == "" {
		return "", "", nil, errors.New("missing or invalid runId")
	}

	if invocation.Schema == "" {
		return "", "", nil, errors.New("missing or invalid schema")
	}
	if invocation.Schema != models.WorkflowInvocationSchemaV1 {
		return "", "", nil, fmt.Errorf("unsupported invocation schema %q", invocation.Schema)
	}
	if invocation.Stage.Operation == "" {
		return "", "", nil, errors.New("missing or invalid stage.operation")
	}
	if invocation.Media.Key == "" {
		return "", "", nil, errors.New("missing or invalid media.key")
	}
	return invocation.RunID, invocation.Stage.Operation, invocation.Callback, nil
}
