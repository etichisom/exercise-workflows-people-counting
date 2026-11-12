package app

import (
	"context"
	"os"
	"strings"
	"testing"

	ort "github.com/yalue/onnxruntime_go"
	"gocv.io/x/gocv"
)

func TestPersonCandidatesBestScore(t *testing.T) {
	channelsFirst := make([]float32, 84*3)
	channelsFirst[4*3+1] = 0.87
	boxes, best, err := personCandidates(channelsFirst, ort.NewShape(1, 84, 3), 0.5)
	if err != nil || best != 0.87 || len(boxes) != 1 {
		t.Fatalf("channels-first best = %v, boxes = %d, error = %v", best, len(boxes), err)
	}

	detectionsFirst := make([]float32, 3*84)
	detectionsFirst[2*84+4] = 0.76
	boxes, best, err = personCandidates(detectionsFirst, ort.NewShape(1, 3, 84), 0.8)
	if err != nil || best != 0.76 || len(boxes) != 0 {
		t.Fatalf("detections-first best = %v, boxes = %d, error = %v", best, len(boxes), err)
	}

	if _, _, err := personCandidates(make([]float32, 4), ort.NewShape(2, 2), 0.5); err == nil {
		t.Fatal("accepted unsupported YOLO output")
	}
}

func TestYOLOInputLetterboxesWideFrames(t *testing.T) {
	// A white 1280x720 frame scales to 640x360 and is centred with 140 rows of
	// grey padding above and below.
	frame := gocv.NewMatWithSizeFromScalar(gocv.NewScalar(255, 255, 255, 0), 720, 1280, gocv.MatTypeCV8UC3)
	defer frame.Close()
	input, err := yoloInput(frame)
	if err != nil {
		t.Fatal(err)
	}
	if len(input) != 3*yoloInputSize*yoloInputSize {
		t.Fatalf("input length = %d", len(input))
	}
	grey := float32(letterboxPadding) / 255
	at := func(channel, row, column int) float32 {
		return input[channel*yoloInputSize*yoloInputSize+row*yoloInputSize+column]
	}
	for _, check := range []struct {
		row, column int
		want        float32
	}{
		{0, 320, grey}, {139, 0, grey}, {140, 320, 1}, {320, 320, 1}, {499, 639, 1}, {500, 320, grey}, {639, 639, grey},
	} {
		for channel := 0; channel < 3; channel++ {
			if got := at(channel, check.row, check.column); got != check.want {
				t.Fatalf("channel %d at (%d,%d) = %v, want %v", channel, check.row, check.column, got, check.want)
			}
		}
	}
}

func TestYOLOInputRejectsGreyscale(t *testing.T) {
	frame := gocv.NewMatWithSize(10, 10, gocv.MatTypeCV8UC1)
	defer frame.Close()
	if _, err := yoloInput(frame); err == nil {
		t.Fatal("accepted a single-channel frame")
	}
}

func TestYOLOConfiguration(t *testing.T) {
	directory := t.TempDir()
	modelPath := directory + "/yolo.onnx"
	runtimePath := directory + "/onnxruntime.so"
	for _, path := range []string{modelPath, runtimePath} {
		if err := os.WriteFile(path, []byte("runtime"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	t.Setenv("YOLO_MODEL", modelPath)
	t.Setenv("ONNXRUNTIME_SHARED_LIBRARY", runtimePath)
	detector, err := newYOLOPersonDetector()
	if err != nil {
		t.Fatal(err)
	}
	if detector.modelPath != modelPath || detector.runtimePath != runtimePath || detector.confidence != 0.35 || detector.sampleFPS != 1 {
		t.Fatalf("unexpected detector configuration: %+v", detector)
	}

	for name, value := range map[string]string{
		"YOLO_CONFIDENCE":            "1.1",
		"YOLO_SAMPLE_FPS":            "0",
		"YOLO_MODEL":                 modelPath + "-missing",
		"ONNXRUNTIME_SHARED_LIBRARY": runtimePath + "-missing",
	} {
		t.Run(name, func(t *testing.T) {
			t.Setenv("YOLO_MODEL", modelPath)
			t.Setenv("ONNXRUNTIME_SHARED_LIBRARY", runtimePath)
			t.Setenv(name, value)
			if _, err := newYOLOPersonDetector(); err == nil || strings.TrimSpace(err.Error()) == "" {
				t.Fatalf("accepted %s=%q", name, value)
			}
		})
	}
}

func TestYOLOModelIntegration(t *testing.T) {
	modelPath := os.Getenv("YOLO_MODEL_INTEGRATION")
	runtimePath := os.Getenv("ONNXRUNTIME_SHARED_LIBRARY_INTEGRATION")
	if modelPath == "" || runtimePath == "" {
		t.Skip("set YOLO_MODEL_INTEGRATION and ONNXRUNTIME_SHARED_LIBRARY_INTEGRATION to exercise an ONNX model")
	}
	videoPath := t.TempDir() + "/blank.avi"
	writer, err := gocv.VideoWriterFile(videoPath, "MJPG", 10, yoloInputSize, yoloInputSize, true)
	if err != nil {
		t.Fatal(err)
	}
	frame := gocv.NewMatWithSize(yoloInputSize, yoloInputSize, gocv.MatTypeCV8UC3)
	for range 30 {
		if err := writer.Write(frame); err != nil {
			t.Fatal(err)
		}
	}
	frame.Close()
	writer.Close()
	media, err := os.ReadFile(videoPath)
	if err != nil {
		t.Fatal(err)
	}
	detector := yoloPersonDetector{
		modelPath:   modelPath,
		runtimePath: runtimePath,
		confidence:  0.5,
		sampleFPS:   1,
	}
	detection, err := detector.Detect(context.Background(), media)
	if err != nil {
		t.Fatal(err)
	}
	defer ort.DestroyEnvironment()
	if detection.Detected || detection.FramesAnalyzed != 3 {
		t.Fatalf("unexpected blank-video detection: %+v", detection)
	}
}
