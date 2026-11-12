# How the baseline works, and what my runs showed

My answers to the four questions in the README's "Make it your own"
section, based on what I saw when I ran the baseline on 12 November 2026
and on reading the worker code. The extension I built afterwards is
described in [people-counting.md](people-counting.md).

## 1. What each component does, and why the flow needs a callback

Following one recording from the camera to the result in Hub:

| Component | What it contributes |
| --- | --- |
| **Agent** (`introduction-agent`) | Watches the RTSP stream, starts a recording when there is motion inside the region of interest, and uploads the clip to Hub. It decides *when* something is recorded, not what is in it. |
| **Hub** | Stores the recording and its metadata, and is where the result has to end up: markers on the timeline, the description, search and filters. |
| **Workflow** (Recording classified → Forward to my system) | Hub's way of reacting to a new recording. The trigger chooses which recordings qualify (only my Agent, always active); the forwarder block hands each one to an external system. |
| **RabbitMQ** (`chisom-forward-queue`) | The hand-off point between Hub and my code. Hub publishes an invocation (run ID, media key, a signed download URL, callback details); the worker consumes it whenever it is ready. The queue buffers work if the worker is slow or offline, and the dead-letter queue catches deliveries that keep failing. |
| **Worker** (this repository) | Validates the invocation, downloads the clip, runs YOLO11n, and builds the result: a marker plus a description when a person is found, a plain routing result when not. |
| **Callback** (`POST /workflows/runs/<runId>`) | Sends that result back to Hub for that specific run, authorised by a token that can only update workflow runs. |

**Why a callback?** The forwarder only knows that it *delivered* a message;
it cannot know when, or whether, the analysis finished. The analysis takes
seconds to minutes, runs outside Hub and can fail. With "Wait for result",
the run stays open until the worker reports back, so Hub can attach the
result to the right run and recording, and a failed analysis shows up as an
unfinished run instead of a false "done". I saw this directly: while the
worker was stopped, the run stayed *Running* after `forwarderDispatched`,
and it resolved only after my worker's callback returned `202`.

The worker also acknowledges the RabbitMQ message only *after* Hub accepts
the callback. If the callback fails, the message goes back on the queue
instead of being lost.

## 2. Evidence that the result belongs to the right recording

For each test I matched the same identifiers across Hub and the worker log:

| Test | Run ID (Hub ↔ worker log) | Media key (`media.key` ↔ Hub `videoFile`) | Callback |
| --- | --- | --- | --- |
| Person (baseline) | `7c06a0dfb78d7c91f48e6c82` | `…/1794494215565-introduction-agent-chisom.mp4` | `202` |
| No person (baseline) | `b6ce16a2500ecf00ba9c7b2b` | `…/1794494897533-introduction-agent-chisom.mp4` | `202` |
| People counting | `438651a70cc18dbd27b22330` | `…/1794496219866-introduction-agent-chisom.mp4` | `202` |

- The **run ID** is the strongest link. Hub put it in the invocation, the
  worker logged it, and the callback URL is built from it. Hub accepting the
  callback (`202`) means that run existed and my token was allowed to
  update it.
- The **media key** ties the run to the recording. The worker logs
  `media.key`, and it matched the `videoFile` of the recording I opened in
  Hub.
- The **timestamp** in that key (milliseconds) matched the recording's
  `data.media.startTimestamp` (seconds, the first ten digits), and the
  marker landed at the right place on that recording's timeline.
- Before each one-shot test I checked that the queue held only that one
  invocation, so `-once` could not pick up a different recording.

A `202` on its own proves less than it seems: Hub accepted the request, not
that the marker is in the right place. That is why I also checked the marker
on the timeline and the description in Hub.

## 3. What the person and no-person tests tell me, and what they don't

**What they show**

- The whole chain works end to end in both directions: Agent → Hub →
  workflow → RabbitMQ → worker → callback → Hub.
- Both outcomes are handled. With a person, Hub got a "person detected"
  marker and a description (confidence `0.89`, found on the first sampled
  frame). Without one, the run resolved with only a routing result
  (`framesAnalyzed: 30, personDetected: false`) and the recording was left
  unchanged, which is the intended behaviour.
- The token is scoped correctly and the timestamps are converted correctly.

**What they don't prove**

- **Accuracy.** One positive clip and one negative clip cannot tell me how
  often the detector is wrong. The demo shop is busy, so the positive case
  is easy.
- **The negative test is weak.** My empty clip was a synthetic test pattern
  streamed through MediaMTX, not a real empty shop. A real empty scene with
  shelves, a poster of a person or a mannequin would be a much harder test.
- **Borderline cases.** Because the demo stream records a clip about every
  30 seconds, four more clips queued up while I tested. All were processed
  (`202`), and one was detected with a confidence of only `0.65`. Raising the
  threshold a little would have flipped that result, so a single threshold
  is fragile.
- **Operation over time.** Nothing here tests long runs, broker reconnects
  (the worker stops on a closed connection), expired signed URLs, or several
  workers sharing the queue.

## 4. Assumptions the baseline makes

**Timing**

- The recording's start time comes from the filename in `media.key`
  (milliseconds before the dash). A file with a different naming scheme
  needs `MARKER_START_TIMESTAMP`, and an override applies to *every*
  recording that worker processes.
- The marker starts at the start of the recording and lasts
  `MARKER_DURATION_SECONDS` (30 s by default), not from when the person
  appeared. On a short clip a 30-second marker can run past the end.
- The signed URL is still valid when the worker gets to the message. If the
  queue backs up for too long, downloads fail.

**Detection**

- "Is there a person" is answered by one threshold (`0.5`) on YOLO11n's
  person class, and the baseline stops at the first frame that passes. It
  does not count people or say when they were there.
- Each frame is stretched to 640 × 640. I later found this squashes people
  in a 16:9 camera image and lowers their scores: letterboxing instead
  raised the busy-shop count from 5 to 8, and lowering the threshold to
  0.35 brought it to 10 (see
  [people-counting.md](people-counting.md#choosing-the-threshold)).
- The whole frame is analysed. The Agent's region of interest only decides
  when recording starts, so people outside the window count as well.

**Input**

- H.264/H.265 clips small enough to download into memory, with readable
  frames, and one frame per second (`YOLO_SAMPLE_FPS=1`) is enough to see
  someone.
- One invocation is in flight at a time (prefetch of one), and my queue
  only receives my own recordings.

## What I changed because of this

The two weakest points, the yes/no answer and the stretched input, led to
my extension: count people per frame across the whole clip, letterbox the
input, and write the count, peak time and visible span back to Hub as a
searchable marker. The limitations above that still apply (no tracking, the
whole frame is counted, a weak negative test) are listed in
[people-counting.md](people-counting.md#limitations).
