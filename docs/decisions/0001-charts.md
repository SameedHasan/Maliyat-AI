# ADR 0001: Charts are drawn in-house on `react-native-svg`

- Status: Accepted (desk spike; device benchmark pending)
- Date: 2026-09-30
- Plan reference: §7.4 Chart Library Spike

## Context

Phase 1 needs four chart types: a line (balance history, cumulative spending), grouped bars
(income vs. expense trend), a donut (category breakdown) and progress bars (budgets). §7.4
asks us to compare a Skia-based library (`victory-native`) with `react-native-gifted-charts`
against 60 fps on a mid-range Android device with 12–24 months of data, the four chart types,
screen-reader accessibility, and dark mode.

The spike was done at a desk without an Android device, so the 60 fps criterion could not be
measured directly. The comparison below is based on the libraries' dependencies and APIs and
on the data sizes we actually render.

| Criterion | victory-native (Skia) | react-native-gifted-charts | In-house on react-native-svg |
|---|---|---|---|
| New native deps | `@shopify/react-native-skia` (~6 MB per ABI), Reanimated | `react-native-svg`, `expo-linear-gradient` | `react-native-svg` only (Expo-supported) |
| Line / bar / donut / progress | Yes / yes / via Pie / no | Yes / yes / yes / no | Yes / yes / yes / plain `View` |
| Screen reader | No built-in value labels | No built-in value labels | One summary label per chart, owned by us |
| Dark mode | Colours passed in | Colours passed in | Reads theme tokens directly |
| Data we draw | ≤ 31 daily or ≤ 24 monthly points | same | same |

## Decision

Draw charts ourselves with `react-native-svg` (`src/components/charts/`): `LineChart`,
`BarChart`, `DonutChart`, plus the existing `ProgressBar` primitive. Aggregation always
happens in SQL, so a chart never receives more than a few dozen points.

- Every chart is wrapped in an accessible container whose label summarises the values
  (e.g. "Spent Rs. 42,000 so far this month vs Rs. 38,500 at this point last month"); the
  SVG itself is hidden from screen readers.
- Colours come from theme tokens (`charts`, `income`, `expense`, `textMuted`), so light and
  dark mode need no extra work.
- No animation in Phase 1. If we add it later, it goes through Reanimated on the existing
  shapes rather than a new library.

## Consequences

- No Skia binary in the APK and one fewer dependency to keep in step with each Expo SDK.
- We own axis/label layout. It is intentionally minimal (start/end labels, bar labels); if
  Phase 5 reports need tooltips, zoom or many series, revisit this decision.
- **Follow-up:** when a mid-range Android device is available, profile Analytics with the
  5k-transaction seed (24 monthly bars, donut with 12 segments) and record the frame times
  here. If anything drops below 60 fps, re-run this spike with `victory-native`.
