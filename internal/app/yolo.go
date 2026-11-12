package app

import (
	"context"
	"errors"
	"fmt"
	"image"
	"image/color"
	"math"
	"os"
	"strconv"
	"strings"
	"sync"

	ort "github.com/yalue/onnxruntime_go"
	"gocv.io/x/gocv"
)

const yoloInputSize = 640

var onnxRuntimeMu sync.Mutex

// personDetection summarises one recording. Offsets are seconds from the start
// of the video file and are only meaningful when PeakCount > 0.
type personDetection struct {
	Detected       bool
	FramesAnalyzed int
	// MaxConfidence is the highest person score seen in any sampled frame, even
	// when it stays below the configured threshold.
	MaxConfidence float32

	// PeakCount is the largest number of people visible in a single sampled
	// frame after non-maximum suppression.
	PeakCount        int
	PeakAtSeconds    float64
	FirstSeenSeconds float64
	LastSeenSeconds  float64
	// SampleSeconds is the time between analysed frames; a person seen in the
	// last sample is assumed to stay visible until the next one.
	SampleSeconds float64
}

type personDetector interface {
	Detect(context.Context, []byte) (personDetection, error)
}

type yoloPersonDetector struct {
	modelPath, runtimePath string
	confidence             float32
	sampleFPS              float64
}

func newYOLOPersonDetector() (*yoloPersonDetector, error) {
	confidence, err := strconv.ParseFloat(envOr("YOLO_CONFIDENCE", "0.35"), 32)
	if err != nil || confidence <= 0 || confidence > 1 {
		return nil, errors.New("YOLO_CONFIDENCE must be greater than 0 and at most 1")
	}
	sampleFPS, err := strconv.ParseFloat(envOr("YOLO_SAMPLE_FPS", "1"), 64)
	if err != nil || sampleFPS <= 0 || sampleFPS > 30 {
		return nil, errors.New("YOLO_SAMPLE_FPS must be greater than 0 and at most 30")
	}
	modelPath, err := regularFileFromEnv("YOLO_MODEL", "/opt/yolo/yolo11n.onnx")
	if err != nil {
		return nil, err
	}
	runtimePath, err := regularFileFromEnv("ONNXRUNTIME_SHARED_LIBRARY", "/opt/onnxruntime/lib/libonnxruntime.so.1.29.0")
	if err != nil {
		return nil, err
	}
	return &yoloPersonDetector{
		modelPath:   modelPath,
		runtimePath: runtimePath,
		confidence:  float32(confidence),
		sampleFPS:   sampleFPS,
	}, nil
}

func regularFileFromEnv(name, fallback string) (string, error) {
	path := strings.TrimSpace(envOr(name, fallback))
	if path == "" || strings.ContainsAny(path, "\r\n") {
		return "", fmt.Errorf("%s must identify a regular file", name)
	}
	info, err := os.Stat(path)
	if err != nil || !info.Mode().IsRegular() {
		return "", fmt.Errorf("%s must identify an existing regular file", name)
	}
	return path, nil
}

func (detector *yoloPersonDetector) Detect(ctx context.Context, media []byte) (personDetection, error) {
	if len(media) == 0 {
		return personDetection{}, errors.New("cannot run YOLO on empty media")
	}
	mediaFile, err := os.CreateTemp("", "workflow-media-*.mp4")
	if err != nil {
		return personDetection{}, errors.New("cannot create private temporary media file")
	}
	mediaPath := mediaFile.Name()
	defer os.Remove(mediaPath)
	if _, err := mediaFile.Write(media); err != nil {
		mediaFile.Close()
		return personDetection{}, errors.New("cannot stage media for YOLO")
	}
	if err := mediaFile.Close(); err != nil {
		return personDetection{}, errors.New("cannot finish staging media for YOLO")
	}

	capture, err := gocv.VideoCaptureFile(mediaPath)
	if err != nil {
		return personDetection{}, errors.New("YOLO could not open the downloaded media as video")
	}
	defer capture.Close()
	fps := capture.Get(gocv.VideoCaptureFPS)
	if fps <= 0 || math.IsNaN(fps) || math.IsInf(fps, 0) {
		return personDetection{}, errors.New("YOLO could not determine the video frame rate")
	}

	onnxRuntimeMu.Lock()
	defer onnxRuntimeMu.Unlock()
	if !ort.IsInitialized() {
		ort.SetSharedLibraryPath(detector.runtimePath)
		if err := ort.InitializeEnvironment(); err != nil {
			return personDetection{}, errors.New("YOLO could not initialize ONNX Runtime")
		}
	}
	session, err := ort.NewDynamicAdvancedSession(
		detector.modelPath,
		[]string{"images"},
		[]string{"output0"},
		nil,
	)
	if err != nil {
		return personDetection{}, errors.New("YOLO could not load YOLO_MODEL")
	}
	defer session.Destroy()

	sampleEvery := max(1, int(math.Round(fps/detector.sampleFPS)))
	frame := gocv.NewMat()
	defer frame.Close()
	detection := personDetection{SampleSeconds: float64(sampleEvery) / fps}
	// Unlike a yes/no check, counting must see the whole clip: the busiest
	// moment can come after the first person appears.
	for frameIndex := 0; ; frameIndex++ {
		if err := ctx.Err(); err != nil {
			return personDetection{}, fmt.Errorf("YOLO person detection canceled: %w", err)
		}
		if ok := capture.Read(&frame); !ok {
			break
		}
		if frame.Empty() || frameIndex%sampleEvery != 0 {
			continue
		}
		boxes, bestScore, err := detectPeopleInFrame(session, frame, detector.confidence)
		if err != nil {
			return personDetection{}, err
		}
		detection.recordFrame(float64(frameIndex)/fps, len(boxes), bestScore)
	}
	if detection.FramesAnalyzed == 0 {
		return personDetection{}, errors.New("YOLO did not decode any video frames")
	}
	return detection, nil
}

// detectPeopleInFrame returns one box per person at or above threshold, after
// non-maximum suppression, plus the best raw person score in the frame.
func detectPeopleInFrame(session *ort.DynamicAdvancedSession, frame gocv.Mat, threshold float32) ([]personBox, float32, error) {
	inputData, err := yoloInput(frame)
	if err != nil {
		return nil, 0, err
	}
	input, err := ort.NewTensor(ort.NewShape(1, 3, yoloInputSize, yoloInputSize), inputData)
	if err != nil {
		return nil, 0, errors.New("YOLO could not create an input tensor")
	}
	defer input.Destroy()
	outputs := []ort.Value{nil}
	if err := session.Run([]ort.Value{input}, outputs); err != nil {
		return nil, 0, errors.New("YOLO inference failed")
	}
	defer outputs[0].Destroy()
	output, ok := outputs[0].(*ort.Tensor[float32])
	if !ok {
		return nil, 0, errors.New("YOLO returned an unsupported output tensor")
	}
	candidates, bestScore, err := personCandidates(output.GetData(), output.GetShape(), threshold)
	if err != nil {
		return nil, 0, err
	}
	return nonMaxSuppression(candidates, nmsIoUThreshold), bestScore, nil
}

// letterboxPadding is the grey Ultralytics uses to pad letterboxed inputs.
const letterboxPadding = 114

// yoloInput letterboxes a BGR frame into the model's square input: it scales
// the frame to fit while keeping its aspect ratio and pads the rest with grey.
// Stretching a 16:9 frame to a square would make people look thinner than the
// model saw in training and lowers their scores.
func yoloInput(frame gocv.Mat) ([]float32, error) {
	if frame.Empty() || frame.Channels() != 3 {
		return nil, errors.New("YOLO could not prepare a three-channel video frame")
	}
	scale := min(float64(yoloInputSize)/float64(frame.Cols()), float64(yoloInputSize)/float64(frame.Rows()))
	width := min(yoloInputSize, max(1, int(math.Round(float64(frame.Cols())*scale))))
	height := min(yoloInputSize, max(1, int(math.Round(float64(frame.Rows())*scale))))
	resized := gocv.NewMat()
	defer resized.Close()
	gocv.Resize(frame, &resized, image.Pt(width, height), 0, 0, gocv.InterpolationLinear)
	left, top := (yoloInputSize-width)/2, (yoloInputSize-height)/2
	padded := gocv.NewMat()
	defer padded.Close()
	grey := color.RGBA{R: letterboxPadding, G: letterboxPadding, B: letterboxPadding}
	gocv.CopyMakeBorder(resized, &padded, top, yoloInputSize-height-top, left, yoloInputSize-width-left, gocv.BorderConstant, grey)
	if padded.Empty() || padded.Channels() != 3 || padded.Cols() != yoloInputSize || padded.Rows() != yoloInputSize {
		return nil, errors.New("YOLO could not prepare a three-channel video frame")
	}
	pixels := padded.ToBytes()
	pixelCount := yoloInputSize * yoloInputSize
	if len(pixels) != pixelCount*3 {
		return nil, errors.New("YOLO received an unexpected video frame layout")
	}
	input := make([]float32, pixelCount*3)
	for pixel := 0; pixel < pixelCount; pixel++ {
		source := pixel * 3
		input[pixel] = float32(pixels[source+2]) / 255
		input[pixelCount+pixel] = float32(pixels[source+1]) / 255
		input[2*pixelCount+pixel] = float32(pixels[source]) / 255
	}
	return input, nil
}
