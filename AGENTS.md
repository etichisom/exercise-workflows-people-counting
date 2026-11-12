# Working on this repository

Handoff guide for anyone (person or coding agent) continuing this work.
Read it fully before changing anything.

## What this is

A take-home exercise for the **Creative Frontend Engineer** role at UUG.AI
(Augment Vision). The original repository is
[uug-ai/exercise-workflows](https://github.com/uug-ai/exercise-workflows)
(remote `upstream`); this fork is where the work lives. The candidate will
present it at UUG.AI's office (slides and/or a live demo).

The exercise ([README.md](README.md)): wire a camera Agent into Kerberos Hub,
build a Hub workflow whose `forwarder` block sends each recording to RabbitMQ,
run the Go worker that analyses it with YOLO and posts the result back to Hub,
then **extend the stage with your own use case** and explain the trade-offs.

## Status

| Part | State |
| --- | --- |
| Baseline (Agent, Hub workflow, RabbitMQ, worker, callback) | Done and verified in Hub with a person clip and a no-person clip |
| Extension: **people counting** | Done, verified end to end in Hub (marker "3 people detected", tag `people:3`, "peak occupancy" event, description) |
| **Occupancy dashboard** (React + shadcn/ui), served by the worker | Done, verified in light/dark/phone; all tests pass |
| Written explanation of the baseline (README "Make it your own" questions) | **Not started** |
| Presentation (slides + live demo script) | **Not started** |
| Final cleanup: disable the Hub workflow, delete the Hub access token | **Do last**, after the presentation is prepared |

Work is on branch **`feature/people-counting`**. `main` matches upstream.

## Repository map

| Path | What |
| --- | --- |
| `main.go`, `internal/app/` | Go worker (RabbitMQ consumer, YOLO, Hub callback) |
| `internal/app/counting.go` | Person candidates, NMS, per-frame peak tracking |
| `internal/app/yolo.go` | Video sampling, letterboxing, ONNX inference, peak snapshot |
| `internal/app/persondetection.go` | Invocation handling, marker/description built for Hub |
| `internal/app/results.go`, `dashboard.go` | Local results store and the dashboard HTTP server |
| `internal/app/dashboard/` | **Generated** production build of the web app, embedded with `go:embed`. Do not edit by hand |
| `web/dashboard/` | Dashboard source: React 19, TypeScript, Vite, Tailwind v4, shadcn/ui. See its [README](web/dashboard/README.md) |
| `docs/people-counting.md` | Design, measurements, verification, limitations of the extension and dashboard |
| `ADDENDUM.md` | Technical reference (updated for counting) |

## Running things

The Go worker needs OpenCV and ONNX Runtime, so it runs in the **dev
container**. Without VS Code, build and use the image directly:

```bash
docker build -f .devcontainer/Dockerfile -t exercise-workflows-dev .
docker volume create exercise-gomod
# Go checks (from the repo root)
docker run --rm -v "$PWD":/workspace -v exercise-gomod:/go/pkg/mod -w /workspace \
  -e GOWORK=off --user root exercise-workflows-dev sh -c 'gofmt -l internal; go vet ./... && go test ./...'
# Real-model integration test
docker run --rm -v "$PWD":/workspace -v exercise-gomod:/go/pkg/mod -w /workspace --user root exercise-workflows-dev \
  sh -c 'YOLO_MODEL_INTEGRATION=$YOLO_MODEL ONNXRUNTIME_SHARED_LIBRARY_INTEGRATION=$ONNXRUNTIME_SHARED_LIBRARY go test ./internal/app -run Integration'
```

Dashboard (Node 20+ on the host, no container needed):

```bash
cd web/dashboard
npm install
npm run typecheck && npm test && npm run build   # build writes to internal/app/dashboard
```

After changing anything in `web/dashboard/src`, run `npm run build` and
**commit the rebuilt `internal/app/dashboard` together with the source**,
then run the Go tests (they check every asset the page references is
embedded).

Serve the dashboard from recorded results (no RabbitMQ needed):

```bash
docker run -d --name exercise-dashboard -p 127.0.0.1:8090:8090 -v "$PWD":/workspace \
  -v exercise-gomod:/go/pkg/mod -w /workspace -e RESULTS_DIR=/workspace/results \
  -e DASHBOARD_ADDR=0.0.0.0:8090 --user root exercise-workflows-dev sh -c 'go run . -dashboard'
```

Process one real job from Hub and record it for the dashboard:

```bash
docker run --rm -v "$PWD":/workspace -v exercise-gomod:/go/pkg/mod -w /workspace --user root \
  -e RESULTS_DIR=/workspace/results exercise-workflows-dev sh -c 'set -a; . ./.env; set +a; go run . -once'
```

## Secrets and local-only state

Nothing secret is in Git. These exist only on the original machine:

- **`.env`** (git-ignored): RabbitMQ host, port, username and password from
  the tutor, the queue name, and the Hub access token. Recreate it from
  `.env.example` with the user; **never ask them to paste secrets into chat,
  never print them, never commit them.** RabbitMQ on the tutor's port is
  plain AMQP: `RABBITMQ_SCHEME=amqp`. `YOLO_CONFIDENCE=0.35`.
  `WORKFLOW_BEARER_TOKEN` is the raw token **without** `Bearer `, with only
  the `workflow-runs.update` permission.
- **`results/`** (git-ignored): dashboard results and peak snapshots. The
  snapshots show identifiable people: keep them out of Git and screenshots.
- **Docker containers** (original machine only): `introduction-agent` (Kerberos
  Agent on the demo shop stream), `introduction-agent-empty` (same Agent
  config pointed at a synthetic no-person stream), `exercise-rtsp`
  (MediaMTX, serves that stream), `exercise-dashboard`. Keep both Agents
  **stopped** except when recording a test clip.
- **No-person test video**: regenerate with
  `ffmpeg -f lavfi -i "testsrc2=size=1280x720:rate=15" -t 60 -c:v libx264 -pix_fmt yuv420p empty.mp4`
  and stream it with `ffmpeg -re -stream_loop -1 -i empty.mp4 -c copy -f rtsp rtsp://localhost:8554/empty`
  into MediaMTX.

Hub setup (in the user's Hub account): site "Chisom - exercise", Agent
`introduction-agent`, workflow **Person detection exercise** (Recording
classified → Forward to my system, Wait for result, TLS **off**, queue
`chisom-forward-queue`, dead-letter `chisom-forward-dead-letter-queue`).

## Gotchas learned the hard way

- **The demo shop stream records a clip about every 30 s.** With the workflow
  enabled, each clip becomes a job. To test one clip: start the Agent, wait
  for one `Hub upload completed`, stop it immediately.
- **`docker logs` without `--tail` returns a truncated log** on this setup, and
  `--since` with a UTC timestamp silently matched nothing. Use `--tail N`.
- **Hub workflow designer:** toggling *Use TLS* blanked the canvas, and any
  forwarder change requires re-entering the RabbitMQ password before saving.
  Re-type the password first, change TLS last, save, then reload to confirm.
- **Hub token dialog** copies the token with a `Bearer ` prefix; strip it.
  The permission is `workflow-runs.update`, not `workflows.update`.
- **Mac disk was nearly full** (Docker images corrupted when it hit 100%).
  Keep 10 GB+ free; rebuild the dev image with `--no-cache` if libraries are
  0 bytes.
- **shadcn CLI** is a dev dependency only (its own deps have audit warnings);
  `npm audit --omit=dev` must stay clean. `cn` is shadcn's own package.

## Conventions

- **Commits and PRs carry no AI attribution**: no `Co-Authored-By`, no
  "Generated with", no AI mentions anywhere. Commits use the user's git
  identity, small logical commits, imperative subject, body explaining why.
- Go: `gofmt`, `go vet`, table-driven tests; keep the worker's existing
  error-handling and logging style (structured logrus fields, no secrets in
  logs). Recording dashboard results must never block or fail a Hub delivery.
- Dashboard: shadcn/ui components in `src/components/ui` (owned code); pure
  logic in `summary.ts`/`format.ts` with Vitest tests; every off-site link
  goes through `ExternalLink` (a test enforces it); built from shadcn's
  `dashboard-01` block with shadcn's default neutral theme (light and dark
  tokens in `src/index.css`), so prefer stock shadcn blocks and tokens; check colour contrast and verify
  in a browser (light, dark, phone width) before calling UI work done.
- Never commit `.env`, `results/`, snapshots, or screenshots with people.

## Suggested next steps

1. **Written explanation** (README "Make it your own"): answer the four
   questions in the candidate's own words. Evidence to use: run IDs and media
   keys matched between worker logs and Hub; HTTP 202 callbacks; the
   person/no-person pair; the 0.65-confidence case; the 5 → 10 people
   accuracy fix (letterboxing + threshold, table in `docs/people-counting.md`);
   limitations (peak not unique visitors, counts people outside the window,
   synthetic negative test, 1 fps sampling).
2. **Presentation**: ~8-10 slides (architecture sequence, baseline evidence,
   extension design, measurements, dashboard, limitations, future work) and a
   live demo script: start the worker with `RESULTS_DIR` + `DASHBOARD_ADDR`,
   start the Agent for one clip, show the job arrive, the Hub marker, and the
   dashboard update live.
3. **Optional polish**: count only inside a drawn region (ignore passers-by
   outside), tracking for unique visitors / door line crossing.
4. **Cleanup at the very end**: disable the Hub workflow and delete the
   exercise access token (README requirement).
