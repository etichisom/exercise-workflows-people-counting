# People counting

This extension turns the baseline's yes/no person check into a people counter.
For each recording, the stage reports how many people were visible at the
busiest moment, when that moment was, and when people were present at all, and
writes that back to Hub as searchable data.

## Why

A "person detected" flag only says a recording is not empty. Counting answers
questions a shop or site operator actually asks: *how busy was it, and when?*
Because the count goes into the marker name and tag, Hub's existing marker
filter becomes a "show me crowded moments" search, without any change to Hub.

## What changed

| Area | Baseline | People counting |
| --- | --- | --- |
| Frames analysed | Stops at the first frame with a person | Samples the whole clip at `YOLO_SAMPLE_FPS` |
| Per-frame result | Highest person score | Number of distinct people, after non-maximum suppression |
| Preprocessing | Stretches the frame to 640x640 | Letterboxes: keeps the aspect ratio and pads with grey |
| Default `YOLO_CONFIDENCE` | 0.5 | 0.35 |
| Marker name | `person detected` | `1 person detected`, `3 people detected`, ... |
| Marker interval | Fixed `MARKER_DURATION_SECONDS` from the recording start | First to last sampled frame with a person (plus one sample) |
| Marker extras | none | Category `people counting`, tag `people:N`, event `peak occupancy` at the busiest second |
| Description | Detection confidence | Peak count, peak time, visible span, frames, best confidence |
| No-person result | `framesAnalyzed`, `personDetected` | adds `peopleCount: 0` |

The workflow contract (invocation, callback, result schema) is unchanged; only
the content of the marker and routing result is richer.

## How counting works

1. **Candidates.** YOLO11n outputs 8400 candidate boxes per frame, each with
   80 class scores. The stage keeps candidates whose *person* score is at
   least `YOLO_CONFIDENCE` (`personCandidates` in
   [counting.go](../internal/app/counting.go)).
2. **De-duplication.** The model usually proposes several overlapping boxes
   for one person. Non-maximum suppression keeps the strongest box and drops
   any other box overlapping it by more than 0.45 intersection-over-union, the
   Ultralytics default (`nonMaxSuppression`).
3. **Summary.** Each analysed frame updates the peak count and its time, and
   the first and last time a person was seen (`recordFrame`).

Counting is per frame: the peak is the most people visible *at the same time*,
not the number of different people who passed through. That avoids needing a
tracker, which is listed under future work.

## Choosing the threshold

Measured on a 30-second clip of the exercise's demo shop stream. By eye, the
busiest frame shows about 10-11 people. The empty clip is a synthetic moving
test pattern with no people.

| Preprocessing | `YOLO_CONFIDENCE` | Shop clip peak | Empty clip |
| --- | --- | --- | --- |
| Stretched (baseline) | 0.5 | 5 | 0 |
| Letterboxed | 0.5 | 8 | 0 |
| Letterboxed | **0.35** | **10** | 0 |
| Letterboxed | 0.25 | 11 | 0 |

Letterboxing alone raised the count from 5 to 8: stretching a 16:9 frame into
a square makes people look thinner than in the training data, so their scores
drop. 0.35 was chosen over 0.25 because a lower threshold also admits more
false positives (posters, mannequins, shadows), and the only negative test
available is an easy synthetic one. Set `YOLO_CONFIDENCE` per site if needed.

## Verification

- Unit tests in [counting_test.go](../internal/app/counting_test.go) cover
  box conversion, invalid scores, IoU, NMS (duplicates merged, neighbours
  kept), peak/visibility tracking, the marker interval, names, and the full
  marker, event, tag and description sent to Hub.
- [yolo_test.go](../internal/app/yolo_test.go) checks letterboxing pixel by
  pixel and runs the real ONNX model on a blank video
  (`TestYOLOModelIntegration`).
- End to end: positive (busy shop) and counterexample (empty scene) recordings
  processed through Hub, RabbitMQ and the callback.

## Occupancy dashboard

Hub shows one recording at a time. The dashboard shows the trend: how busy
each recording was, the busiest moment with the counted people boxed, and a
live feed of recordings as the worker processes them. (No screenshot is
committed: the snapshots show identifiable people.)

It is served by the worker itself, so there is nothing extra to deploy:

```bash
set -a; . ./.env; set +a
RESULTS_DIR=./results DASHBOARD_ADDR=0.0.0.0:8090 go run . -once
```

Then open <http://localhost:8090>. To browse earlier results without
RabbitMQ, run `go run . -dashboard` (or the **Dashboard: results only** VS Code
profile).

- **Data.** After each successfully handled delivery the worker appends a line
  to `RESULTS_DIR/results.jsonl` and writes the peak frame, with the counted
  people boxed, as `RESULTS_DIR/<runId>.jpg`. Results Hub rejected are not
  recorded. Recording is best-effort: a local write failure is logged and never
  affects the delivery to Hub.
- **API.** `GET /api/results` (newest first, latest record per run) and
  `GET /snapshots/<runId>.jpg`. Run IDs are validated before touching the
  file system; nothing outside `RESULTS_DIR` is served.
- **Page.** A React + TypeScript + Vite app in [web/dashboard](../web/dashboard)
  built with [shadcn/ui](https://ui.shadcn.com) (Radix primitives, Tailwind
  CSS v4), starting from shadcn's `dashboard-01` block and its default
  neutral theme: KPI cards, an interactive area chart of peak people per
  clip, a clip viewer (the busiest frame with a scrubber marking when people
  were in view), and a searchable, sortable recordings table whose rows open
  a drawer with the peak frame. The viewer follows the newest clip until an
  older one is picked.
  The production build is committed into `internal/app/dashboard` and
  embedded in the worker, with the Geist font bundled, so it works offline
  and the Go build needs no Node. It polls every 4 seconds (paused while the
  tab is hidden), highlights new recordings, follows the system light/dark
  setting with a toggle, and is keyboard and screen-reader friendly down to
  phone widths.
- **Privacy.** Snapshots can show people. `RESULTS_DIR` is created owner-only,
  `results/` is ignored by Git, the default address is `127.0.0.1`, and
  snapshots are never sent to Hub.

## Limitations

- **Peak, not total.** Without tracking, one person walking through counts
  once per frame, and the stage cannot report how many different visitors
  there were.
- **Sampling.** At 1 frame per second, someone visible for under a second can
  be missed, and the visible span is accurate to about one second.
- **Occlusion and crowds.** People hidden behind shelves or each other are
  undercounted; dense groups can merge into one box under NMS.
- **Whole frame.** People outside the shop window are counted too. The Agent's
  region of interest only controls when recording starts, not what YOLO sees.
- **Weak negative test.** The empty test is synthetic; an empty real scene, or
  a scene with a mannequin or a poster of a person, would be a stronger check.
- **Single threshold.** One `YOLO_CONFIDENCE` serves both "is anyone here" and
  "how many"; different sites may need different values.

## Future work

- Track people across frames (e.g. ByteTrack) to count unique visitors and
  line crossings at the door.
- Restrict counting to a polygon so passers-by outside are ignored.
- Emit one marker per occupancy level change to show busy periods on the
  timeline.
