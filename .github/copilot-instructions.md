# Copilot Instructions – signalKutilities

## Role

`signalKutilities` is a **shared library** used by all three plugin projects in this family:
- `advancedWind`
- `speedandcurrent`
- `signalk-polar-performance-plugin`

It is **not a Signal K plugin itself**. It is a local npm dependency (`npm link`ed during development). Changes here affect all three consuming projects.

## Fix Strategy

**Fix here, not in the consumers.** If a bug or missing feature is rooted in this library, fix it here rather than working around it in each plugin. This is the upstream/downstream principle shared across all projects.

## What the Library Provides

| Export | Purpose |
|---|---|
| `MessageHandler` | Subscribes to a single SK path; tracks staleness, frequency, sources |
| `MessageSmoother` | Wraps `MessageHandler` with a configurable smoother |
| `createSmoothedHandler` | Factory for `MessageSmoother` |
| `Polar` | Polar vector (magnitude + angle) built from two `MessageHandler`s |
| `PolarSmoother` | Polar vector with smoothed components |
| `createSmoothedPolar` | Factory for `PolarSmoother` |
| `SmoothedAngle` | Heading/angle handler with wrap-around awareness |
| `BaseSmoother` / `MovingAverageSmoother` / `ExponentialSmoother` / `KalmanSmoother` | Smoothing algorithms |
| `Reporter` | Aggregates handler/polar state and meta for JSON HTTP responses to the webapp |
| `Table2D` | 2D interpolation table |
| `SI` | SI unit conversion utilities |

## meta / state API

All handler and polar classes expose two getters:

- **`meta`** — static, configuration-time properties (path, source, units, displayName, smoother type, idlePeriod). Does not change at runtime.
- **`state`** — dynamic, runtime properties (ready, stale, frequency, sources). Changes as the system operates.

Never put runtime-changing properties in `meta`, and never put configuration-fixed properties in `state`.

`report()` returns a snapshot merging value data with a nested `state` object. It no longer contains `displayAttributes` (removed in v2).

`Reporter` aggregates across all registered items:
- `reporter.meta()` — all static metadata
- `reporter.state()` — all runtime state
- `reporter.report()` — full snapshot for webapp polling

## Development Workflow

This library is consumed via `npm link`. After making changes:
1. Test with `npm test` (runs Table2D and smoothers tests)
2. Re-link in each consuming project if the exports change: `cd <plugin>; npm link signalkutilities`
3. Bump the version in `package.json` following semver
