# Occupancy dashboard

The web UI for the people counting stage: a live view of how many people
were counted per recording. Built with React 19, TypeScript, Vite,
Tailwind CSS v4 and [shadcn/ui](https://ui.shadcn.com) (Radix primitives,
Lucide icons).

The worker serves the production build from `internal/app/dashboard`, which
is committed so the Go worker builds without Node. See
[docs/people-counting.md](../../docs/people-counting.md#occupancy-dashboard)
for how the worker records results and serves the page.

## Develop

Requires Node 20 or newer. Start a worker with `RESULTS_DIR` and
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

## Design notes

- **Layout.** Sidebar navigation, a sticky header with live status, then a
  pipeline summary, the chart beside a crowd-size breakdown, and the
  recordings table. Below `lg` the sidebar collapses into the header.
- **Colour.** Cool neutrals with one blue accent, reserved for the primary
  action, the selected state and the newest chart bar. Light and dark themes
  are defined as tokens in `src/index.css`; the chart blue is validated for
  3:1 contrast on both card surfaces.
- **States.** Loading skeletons, an empty state, an offline banner that keeps
  the last data visible, and an empty-filter message with a clear action.
- **Accessibility.** Skip link, landmarks, a breadcrumb, focus rings,
  keyboard-reachable chart bars with tooltips, status shown as dot plus text,
  a labelled dialog with focus trapping, and reduced-motion support.

## Layout

| Path | Purpose |
| --- | --- |
| `src/App.tsx` | Page shell, header and states |
| `src/components/AppSidebar.tsx` | Navigation, worker status and theme toggle |
| `src/components/FlowSummary.tsx` | Pipeline summary with the busiest moment |
| `src/components/PeakChart.tsx` | Peak-per-recording SVG bar chart |
| `src/components/CrowdBreakdown.tsx` | Recordings by crowd size |
| `src/components/RecordingsTable.tsx` | Tabs, search, filter and table |
| `src/components/RecordingDialog.tsx` | Peak frame and facts for one recording |
| `src/components/ui` | shadcn/ui components (generated, then owned here) |
| `src/hooks.ts` | Polling, element width, theme and clock hooks |
| `src/summary.ts`, `src/format.ts` | Pure data and formatting logic (unit tested) |
