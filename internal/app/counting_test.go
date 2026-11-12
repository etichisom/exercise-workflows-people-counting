package app

import (
	"context"
	"encoding/json"
	"math"
	"strings"
	"testing"

	ingest "github.com/uug-ai/ingest/pkg/ingest"
	"github.com/uug-ai/models/pkg/models"
	ort "github.com/yalue/onnxruntime_go"
)

// candidate describes one row of a fake YOLO output: a centre-based box and a
// person score.
type candidate struct{ cx, cy, w, h, score float32 }

// channelsFirstOutput builds a [1,84,N] YOLO tensor, the layout YOLO11 exports.
func channelsFirstOutput(candidates ...candidate) ([]float32, ort.Shape) {
	n := len(candidates)
	output := make([]float32, yoloValuesPerCandidate*n)
	for i, c := range candidates {
		for field, value := range []float32{c.cx, c.cy, c.w, c.h, c.score} {
			output[field*n+i] = value
		}
	}
	return output, ort.NewShape(1, yoloValuesPerCandidate, int64(n))
}

func TestIntersectionOverUnion(t *testing.T) {
	a := personBox{X1: 0, Y1: 0, X2: 10, Y2: 10}
	tests := []struct {
		name string
		b    personBox
		want float32
	}{
		{"identical", a, 1},
		{"disjoint", personBox{X1: 20, Y1: 20, X2: 30, Y2: 30}, 0},
		{"touching edges", personBox{X1: 10, Y1: 0, X2: 20, Y2: 10}, 0},
		{"half overlap", personBox{X1: 5, Y1: 0, X2: 15, Y2: 10}, 50.0 / 150.0},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := intersectionOverUnion(a, test.b); math.Abs(float64(got-test.want)) > 1e-6 {
				t.Fatalf("IoU = %v, want %v", got, test.want)
			}
		})
	}
}

func TestPersonCandidatesConvertsBoxesAndAppliesThreshold(t *testing.T) {
	output, shape := channelsFirstOutput(
		candidate{cx: 100, cy: 200, w: 40, h: 120, score: 0.9},
		candidate{cx: 300, cy: 200, w: 40, h: 120, score: 0.3},
	)
	boxes, best, err := personCandidates(output, shape, 0.5)
	if err != nil {
		t.Fatal(err)
	}
	if best != 0.9 || len(boxes) != 1 {
		t.Fatalf("best = %v, boxes = %+v", best, boxes)
	}
	want := personBox{X1: 80, Y1: 140, X2: 120, Y2: 260, Score: 0.9}
	if boxes[0] != want {
		t.Fatalf("box = %+v, want %+v", boxes[0], want)
	}
}

func TestPersonCandidatesRejectsInvalidScores(t *testing.T) {
	for _, score := range []float32{-0.1, 1.5, float32(math.NaN())} {
		output, shape := channelsFirstOutput(candidate{w: 1, h: 1, score: score})
		if _, _, err := personCandidates(output, shape, 0.5); err == nil {
			t.Fatalf("accepted invalid person score %v", score)
		}
	}
}

func TestNonMaxSuppressionCountsDistinctPeople(t *testing.T) {
	// Two heavily overlapping boxes on one person, one box on a second person.
	output, shape := channelsFirstOutput(
		candidate{cx: 100, cy: 200, w: 40, h: 120, score: 0.80},
		candidate{cx: 102, cy: 201, w: 42, h: 118, score: 0.92},
		candidate{cx: 400, cy: 210, w: 38, h: 110, score: 0.70},
	)
	boxes, _, err := personCandidates(output, shape, 0.5)
	if err != nil {
		t.Fatal(err)
	}
	kept := nonMaxSuppression(boxes, nmsIoUThreshold)
	if len(kept) != 2 {
		t.Fatalf("kept %d boxes, want 2: %+v", len(kept), kept)
	}
	if kept[0].Score != 0.92 || kept[1].Score != 0.70 {
		t.Fatalf("NMS kept the wrong boxes: %+v", kept)
	}
	if boxes[0].Score != 0.80 {
		t.Fatal("NMS reordered its input")
	}
}

func TestNonMaxSuppressionKeepsAdjacentPeople(t *testing.T) {
	// People standing side by side overlap a little but are not duplicates.
	boxes := []personBox{
		{X1: 0, Y1: 0, X2: 40, Y2: 120, Score: 0.9},
		{X1: 30, Y1: 0, X2: 70, Y2: 120, Score: 0.8},
	}
	if kept := nonMaxSuppression(boxes, nmsIoUThreshold); len(kept) != 2 {
		t.Fatalf("kept %d boxes, want 2", len(kept))
	}
}

func TestRecordFrameTracksPeakAndVisibility(t *testing.T) {
	detection := personDetection{SampleSeconds: 1}
	for _, frame := range []struct {
		offset float64
		people int
		score  float32
	}{
		{0, 0, 0.20}, {1, 1, 0.70}, {2, 3, 0.91}, {3, 2, 0.88}, {4, 0, 0.10}, {5, 3, 0.85},
	} {
		detection.recordFrame(frame.offset, frame.people, frame.score)
	}
	want := personDetection{
		Detected: true, FramesAnalyzed: 6, MaxConfidence: 0.91,
		PeakCount: 3, PeakAtSeconds: 2, FirstSeenSeconds: 1, LastSeenSeconds: 5, SampleSeconds: 1,
	}
	if detection != want {
		t.Fatalf("detection = %+v, want %+v", detection, want)
	}
}

func TestRecordFrameWithoutPeople(t *testing.T) {
	var detection personDetection
	detection.recordFrame(0, 0, 0.3)
	detection.recordFrame(1, 0, 0.4)
	if detection.Detected || detection.PeakCount != 0 || detection.FramesAnalyzed != 2 || detection.MaxConfidence != 0.4 {
		t.Fatalf("unexpected empty-scene detection: %+v", detection)
	}
}

func TestMarkerInterval(t *testing.T) {
	tests := []struct {
		name      string
		detection personDetection
		wantFrom  int64
		wantTo    int64
	}{
		{"legacy detector falls back to configured window", personDetection{Detected: true}, 1000, 1030},
		{"visible span plus one sample", personDetection{PeakCount: 2, FirstSeenSeconds: 3.4, LastSeenSeconds: 12.2, SampleSeconds: 1}, 1003, 1014},
		{"single sample still spans a second", personDetection{PeakCount: 1, FirstSeenSeconds: 7, LastSeenSeconds: 7}, 1007, 1008},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			from, to := markerInterval(test.detection, 1000, 30)
			if from != test.wantFrom || to != test.wantTo {
				t.Fatalf("interval = %d..%d, want %d..%d", from, to, test.wantFrom, test.wantTo)
			}
		})
	}
}

func TestPeopleMarkerNames(t *testing.T) {
	if got := peopleMarkerName(1); got != "1 person detected" {
		t.Fatalf("singular name = %q", got)
	}
	if got := peopleMarkerName(4); got != "4 people detected" {
		t.Fatalf("plural name = %q", got)
	}
	if got := formatOffset(75.9); got != "1:15" {
		t.Fatalf("formatOffset = %q", got)
	}
}

func TestHandleInvocationReportsPeopleCount(t *testing.T) {
	server := newMediaServer(t, []byte("video"))
	body := strings.Replace(sampleInvocation, "https://example.com?secret=SECRET", server.URL, 1)
	detector := &stubPersonDetector{detection: personDetection{
		Detected: true, FramesAnalyzed: 30, MaxConfidence: 0.93,
		PeakCount: 3, PeakAtSeconds: 12.0, FirstSeenSeconds: 2.0, LastSeenSeconds: 26.0, SampleSeconds: 1,
	}}
	invocation, err := handleInvocation(context.Background(), []byte(body), "forwarder", 1700000000, 30, detector)
	if err != nil {
		t.Fatal(err)
	}
	var envelope struct {
		Blocks []ingest.Block `json:"blocks"`
	}
	if err := json.Unmarshal(invocation.result.Payload, &envelope); err != nil {
		t.Fatal(err)
	}
	var marker models.Marker
	if err := json.Unmarshal(envelope.Blocks[0].Data, &marker); err != nil {
		t.Fatal(err)
	}
	if marker.Name != "3 people detected" ||
		marker.StartTimestamp != 1700000002 || marker.EndTimestamp != 1700000027 || marker.Duration != 25 ||
		len(marker.Categories) != 1 || marker.Categories[0].Name != peopleCountingCategory ||
		len(marker.Tags) != 1 || marker.Tags[0].Name != "people:3" {
		t.Fatalf("unexpected counting marker: %+v", marker)
	}
	if len(marker.Events) != 1 || marker.Events[0].Name != peakOccupancyEvent ||
		marker.Events[0].StartTimestamp != 1700000012 || marker.Events[0].Duration != 1 {
		t.Fatalf("unexpected peak event: %+v", marker.Events)
	}
	wantSummary := "YOLO counted up to 3 people at 0:12; people visible 0:02-0:27; 30 sampled frames, best person confidence 0.93"
	if marker.Description != wantSummary {
		t.Fatalf("description = %q, want %q", marker.Description, wantSummary)
	}
	var mediaPatch struct {
		Description string `json:"description"`
	}
	if err := json.Unmarshal(envelope.Blocks[1].Data, &mediaPatch); err != nil || mediaPatch.Description != wantSummary {
		t.Fatalf("media patch description = %q, error = %v", mediaPatch.Description, err)
	}
}
