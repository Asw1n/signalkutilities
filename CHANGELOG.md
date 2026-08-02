# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `MessageHandler.onIdle` — optional callback fired once when a subscription is ACTIVE and no delivery has arrived for `idlePeriod` ms. Null by default. Restarted by `subscribe()` and by every incoming delta. The timer is only armed when all conditions are met: `stalenessDetection` enabled, lifecycle ACTIVE, `onIdle` set, and `idlePeriod > 0`. Setting `onIdle` or changing `idlePeriod` while ACTIVE arms the timer immediately.
- `MessageHandler.idlePeriod` is now a getter/setter. Assigning a new value rearms the idle timer immediately if conditions are met.

### Changed
- `MessageHandler` internal state model refactored to two orthogonal dimensions: **Lifecycle** (`INACTIVE` / `ACTIVE`) and **Value Status** (`ABSENT` / `FRESH` / `STALE`). The three overlapping boolean flags (`subscribed`, `_ready`, `_stale`) have been replaced.
  - `subscribed` is now a derived read-only getter (`lifecycle === ACTIVE`).
  - Staleness is **computed on demand** from `timestamp + idlePeriod > now` — no timer flips a flag.
  - `terminate()` moves to INACTIVE but preserves value status; the last value remains readable.
  - `subscribe()` moves to ACTIVE without resetting value status.
  - `ready` = ACTIVE + FRESH. Exception: when `stalenessDetection` is disabled (constant/placeholder contributors), lifecycle is not checked.
  - `state` now exposes `lifecycle` and `valueStatus` fields for richer diagnostics.
- `MessageHandler._scheduleStaleDebug()` and `_resetIdleTimer()` replaced by `_armIdleTimer()`, which manages both the debug log and the `onIdle` callback in one place.

### Fixed
- `MessageHandler._resetIdleTimer()`: `_stale` is now cleared unconditionally on every data delivery, matching the existing behaviour of `MessageSmoother._resetIdleTimer()`. Previously the flag was only cleared inside the `if (this._idleTimer)` guard, so the very first delivery after `stalenessDetection = true` was explicitly set (with no prior data or timer) left `_stale = true`, causing `Polar.ready` to return `false` and silencing `PolarSmoother.sample()` for that entire update cycle.
- `createSmoothedPolar()`: `PolarSmoother` is now constructed and `polar.onChange` is wired before `polar.subscribe()` is called. Previously the subscribe call ran first, so any bootstrap-snapshot delivery triggered `processChanges()` with `polar.onChange === null`, causing the smoother to miss the initial cached value entirely.

---

## [3.0.1] — 2026-07-23

### Fixed
- `MessageHandler` no longer floods the server HTTP log with repeated `401` errors on servers with security enabled and anonymous read access disabled. The async REST meta fetch (`_fetchRestMeta`) has been replaced by a synchronous in-process call to `app.getMetadata`, which requires no authentication and carries no HTTP overhead. Spec-defined metadata (units, description) is loaded immediately when a path is configured and re-attempted lazily on each `meta` getter read for unknown paths.

---

## [3.0.0] — 2026-07-17

### Removed
- PolarTable has been removed from signalkutilities. The polar-performance plugin now owns that implementation in its own package.

---

## [2.1.0] — 2026-07-10

### Added
- `MessageHandler.clear(app, pluginId, handlers)` — static method that writes `null` to the SK path of each handler. Accepts `MessageHandler` or `MessageSmoother` (delegates via `.handler` pointer).
- `Polar.clear(app, pluginId, polars)` — static method that writes `null` to the magnitude and angle SK paths of each polar. Accepts `Polar` or `PolarSmoother` (delegates via `.polar` pointer).
- `PolarSmoother.clear(app, pluginId, polarsSmoothed)` — thin wrapper that delegates to `Polar.clear`.

---

## [2.0.1] — 2026-06-14

### Fixed
- `MovingAverageSmoother`: replaced per-sample `{value, timestamp}` object allocation, `Array.filter()` copy, and two-pass `reduce()` with a circular-buffer queue and O(1) amortised running sums. No behaviour change; significantly lower CPU and GC pressure at typical SK sample rates.
- `MovingAverageSmoother`: class-level comment corrected — the smoother does not consume input variance but does compute and expose population variance of the current window.
- `Polar.trace`: was returning the L2-norm of the variance vector (`√(σx⁴ + σy⁴)`), which has no standard meaning. Now returns the matrix trace (`σx² + σy²`), consistent with `PolarSmoother.trace`.
- `MessageHandler._fetchRestMeta`: added `_fetchPending` guard to prevent multiple concurrent in-flight REST requests for the same path between the first delta and the fetch resolving.
- `MessageHandler.meta`: the REST-layer merge (spread + field-by-field loop) is now cached in `_metaCache` and only rebuilt when `_restMeta` changes or the path is reset, instead of on every poll.

### Added
- `src/tests/smoothers.js`: test suite for all four smoother classes covering construction, convergence, expiry, compaction, reset, and options update.

---

## [2.0.0] — 2026-06-02

### Changed (Breaking)
- Source selection has been removed from all subscription APIs. The Signal K server now manages source priority natively, so plugins no longer need to specify which data source to use — the highest-priority source is delivered automatically.
- The `source` and `passOn` parameters have been removed from `configure()`, `configureMagnitude()`, `configureAngle()`, `createSmoothedHandler()`, `createSmoothedPolar()`, and the `SmoothedAngle` constructor. Any code passing these arguments must be updated to omit them.

### Removed
- `getSources()` method removed from all handler and smoother classes.
- `source` property removed from `MessageHandler`, `MessageSmoother`, and `SmoothedAngle`.
- `passOn` property removed from `MessageHandler`.
- `state.sources` field removed from handler, smoother, and polar state objects.
- `report().source` field removed from smoother report output.

---

## [1.12.3] — 2026-05-20

### Fixed
- Incorrect source filtering could cause a subscribed handler to miss updates when a specific source was configured. This is now resolved.
- `createSmoothedHandler` factory example in the documentation was missing `subscribe: true`, which would leave the smoother inactive.

### Added
- `MessageHandler` and `Polar` now correctly handle Signal K source priorities: when a named source is requested, updates from that source are delivered regardless of which source the server currently favours.

---

## [1.12.2] — 2026-05-20

Initial changelog entry. Established baseline.

[Unreleased]: https://github.com/Asw1n/signalkutilities/compare/v3.0.0...HEAD
[3.0.0]: https://github.com/Asw1n/signalkutilities/compare/v2.1.0...v3.0.0
[2.1.0]: https://github.com/Asw1n/signalkutilities/compare/v2.0.0...v2.1.0
[2.0.1]: https://github.com/Asw1n/signalkutilities/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/Asw1n/signalkutilities/compare/v1.12.3...v2.0.0
[1.12.3]: https://github.com/Asw1n/signalkutilities/compare/v1.12.2...v1.12.3
[1.12.2]: https://github.com/Asw1n/signalkutilities/releases/tag/v1.12.2

