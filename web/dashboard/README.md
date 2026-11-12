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

- **Based on shadcn's `dashboard-01` block** (`npx shadcn@latest add dashboard-01`),
  adapted to occupancy data: the inset sidebar, a site header, four KPI
  cards with trend badges, the interactive area chart, and the TanStack data
  table with view tabs, column picker, row menu, pagination and a row drawer.
  The block's demo data, drag-to-reorder and row selection were removed.
- **One addition: the clip viewer.** The selected clip's busiest frame with
  a scrubber, beside its count and facts. It follows the newest clip until a
  clip is picked from the chart, the busiest-moment card or a row's drawer.
- **Theme.** shadcn/ui's default neutral theme, unchanged, in light and dark
  (`src/index.css`). Only success/warning (status dots) and a muted bar
  colour are added. Timecodes use Geist Mono so digits do not shift.
- **States.** Loading skeletons, an empty state, an offline banner that keeps
  the last data visible, and an empty-filter message.
- **Accessibility.** Skip link, landmarks, a breadcrumb, a scroll-aware
  sidebar, labelled scrubbers and icon buttons, status shown as dot plus
  text, focus returned to the viewer after "Show in viewer", and
  reduced-motion support.

## Layout

| Path | Purpose |
| --- | --- |
| `src/App.tsx` | Page shell (sidebar provider, inset), selection and states |
| `src/components/AppSidebar.tsx` | Navigation, Hub links, theme toggle, worker status |
| `src/components/SiteHeader.tsx` | Sidebar trigger, breadcrumb title, live status |
| `src/components/SectionCards.tsx` | Four KPI cards |
| `src/components/OccupancyChart.tsx` | Peak people per clip (Recharts area chart) |
| `src/components/Viewer.tsx` | Selected clip: busiest frame, scrubber, count and facts |
| `src/components/RecordingsTable.tsx` | TanStack data table of recordings |
| `src/components/RecordingDrawer.tsx` | Row drawer with the peak frame and details |
| `src/components/ui` | shadcn/ui components (generated, then owned here) |
| `src/hooks/` | Polling, theme, clock, count-up and scroll-spy hooks; `use-mobile` from shadcn |
| `src/summary.ts`, `src/format.ts` | Pure data and formatting logic (unit tested) |
