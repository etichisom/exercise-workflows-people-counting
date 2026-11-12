package app

import (
	"errors"
	"fmt"
	"math"
	"sort"

	ort "github.com/yalue/onnxruntime_go"
)

// YOLO11 detection heads emit 84 values per candidate: a box (cx, cy, w, h in
// input pixels) followed by 80 COCO class scores. Class 0 is "person".
const (
	yoloValuesPerCandidate = 84
	yoloPersonScoreIndex   = 4
	// nmsIoUThreshold is the overlap above which two person boxes are treated as
	// the same person. 0.45 is the common Ultralytics default for YOLO models.
	nmsIoUThreshold = 0.45
)

// personBox is one person candidate in YOLO input coordinates.
type personBox struct {
	X1, Y1, X2, Y2 float32
	Score          float32
}

func (box personBox) area() float32 {
	return max(0, box.X2-box.X1) * max(0, box.Y2-box.Y1)
}

// intersectionOverUnion measures how much two boxes overlap, from 0 (disjoint)
// to 1 (identical).
func intersectionOverUnion(a, b personBox) float32 {
	width := min(a.X2, b.X2) - max(a.X1, b.X1)
	height := min(a.Y2, b.Y2) - max(a.Y1, b.Y1)
	if width <= 0 || height <= 0 {
		return 0
	}
	intersection := width * height
	union := a.area() + b.area() - intersection
	if union <= 0 {
		return 0
	}
	return intersection / union
}

// personCandidates extracts every person candidate scoring at least threshold
// from a raw YOLO output tensor, and reports the best person score seen at any
// confidence. Both channel-first [1,84,N] and candidate-first [1,N,84] layouts
// are accepted, matching the exported model variants.
func personCandidates(output []float32, shape ort.Shape, threshold float32) ([]personBox, float32, error) {
	if len(shape) != 3 || shape[0] != 1 {
		return nil, 0, fmt.Errorf("YOLO returned unsupported output shape %v", shape)
	}
	rows, columns := int(shape[1]), int(shape[2])
	if len(output) != rows*columns {
		return nil, 0, errors.New("YOLO returned inconsistent output data")
	}
	var count int
	var value func(candidate, field int) float32
	switch {
	case rows == yoloValuesPerCandidate:
		count = columns
		value = func(candidate, field int) float32 { return output[field*columns+candidate] }
	case columns == yoloValuesPerCandidate:
		count = rows
		value = func(candidate, field int) float32 { return output[candidate*columns+field] }
	default:
		return nil, 0, fmt.Errorf("YOLO returned unsupported output shape %v", shape)
	}

	var boxes []personBox
	var bestScore float32
	for candidate := 0; candidate < count; candidate++ {
		score := value(candidate, yoloPersonScoreIndex)
		if score < 0 || score > 1 || math.IsNaN(float64(score)) {
			return nil, 0, errors.New("YOLO returned an invalid person confidence")
		}
		bestScore = max(bestScore, score)
		if score < threshold {
			continue
		}
		cx, cy := value(candidate, 0), value(candidate, 1)
		halfWidth, halfHeight := value(candidate, 2)/2, value(candidate, 3)/2
		boxes = append(boxes, personBox{
			X1: cx - halfWidth, Y1: cy - halfHeight,
			X2: cx + halfWidth, Y2: cy + halfHeight,
			Score: score,
		})
	}
	return boxes, bestScore, nil
}

// nonMaxSuppression keeps the highest-scoring box of every group of boxes that
// overlap by more than iouThreshold, so one person yields one box. It does not
// modify its input.
func nonMaxSuppression(boxes []personBox, iouThreshold float32) []personBox {
	ordered := append([]personBox(nil), boxes...)
	sort.SliceStable(ordered, func(i, j int) bool { return ordered[i].Score > ordered[j].Score })
	kept := make([]personBox, 0, len(ordered))
	for _, candidate := range ordered {
		duplicate := false
		for _, existing := range kept {
			if intersectionOverUnion(candidate, existing) > iouThreshold {
				duplicate = true
				break
			}
		}
		if !duplicate {
			kept = append(kept, candidate)
		}
	}
	return kept
}

// recordFrame folds one analysed frame into the recording summary.
func (detection *personDetection) recordFrame(offsetSeconds float64, people int, bestScore float32) {
	detection.FramesAnalyzed++
	detection.MaxConfidence = max(detection.MaxConfidence, bestScore)
	if people == 0 {
		return
	}
	if !detection.Detected {
		detection.Detected = true
		detection.FirstSeenSeconds = offsetSeconds
	}
	detection.LastSeenSeconds = offsetSeconds
	if people > detection.PeakCount {
		detection.PeakCount = people
		detection.PeakAtSeconds = offsetSeconds
	}
}
