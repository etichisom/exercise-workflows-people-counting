# Occupancy dashboard

The web UI for the people counting stage: a live view of how many people
were counted per recording. Built with React, TypeScript and Vite, using the
Hub widgets from UUG.AI's design system (see
[src/vendor/hub-widgets](src/vendor/hub-widgets/README.md)).

The worker serves the production build from `internal/app/dashboard`, which
is committed so the Go worker builds without Node. See
[docs/people-counting.md](../../docs/people-counting.md#occupancy-dashboard)
for how the worker records results and serves the page.

## Develop

Requires Node 18 or newer. Start a worker with `RESULTS_DIR` and
`DASHBOARD_ADDR=0.0.0.0:8090` (or `-dashboard`), then:

```bash
npm install
npm run dev
```

The dev server proxies `/api` and `/snapshots` to `127.0.0.1:8090`.

## Check and build

```bash
npm run typecheck
npm test
npm run build
```

`npm run build` type-checks and writes the bundle to
`../../internal/app/dashboard`. Commit the rebuilt files together with the
source change, then run `go test ./...` from the repository root: it checks
that every asset the page references is embedded.

## Layout

| Path | Purpose |
| --- | --- |
| `src/App.tsx` | Page composition from Hub widgets |
| `src/components/OccupancyChart.tsx` | Peak-per-recording SVG bar chart with tooltips |
| `src/components/RecordingCard.tsx` | Recording card, snapshot and Hub link |
| `src/hooks.ts` | Polling, element width, theme and clock hooks |
| `src/summary.ts`, `src/format.ts` | Pure data and formatting logic (unit tested) |
| `src/vendor/hub-widgets` | UUG.AI Hub widgets, vendored unmodified (MIT) |
