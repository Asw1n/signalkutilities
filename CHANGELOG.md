# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.1.5] — 2026-09-17

### Fixed
- `MessageHandler` now marks its state stale after `stalePeriod` even when no `onStale` callback is registered, so raw handlers wrapped by smoothers expose accurate lifecycle state.
- Smoothers now retain a value that Signal K replays synchronously while a subscription is being started, preventing the first measurement from being lost.

---

## [3.1.4] — 2026-09-16

### Fixed
- `MessageSmoother` no longer permanently fixes an object path's tracked properties to whatever keys happened to be present in the first delta. It now seeds the full property set from the SignalK spec metadata (`meta.properties`, e.g. `navigation.attitude`'s `roll`/`pitch`/`yaw`) when available, and otherwise keeps discovering new numeric keys as they appear in later deltas. Previously, a path whose first delta was partial (e.g. `{roll}` before `{roll, pitch}`) would never track `pitch` at all.

---

## [3.1.3] — 2026-09-08

### Fixed
- `MessageHandler.subscribe()` now falls back to a one-shot `app.getSelfPath()` read of the path's current value when the live subscription hasn't delivered anything yet. This closes a known signalk-server race (see `signalk-polar-performance-plugin/doc/subscription-race-bug.md`) where a path's very first delta after subscribing can be missed if the plugin subscribes after another plugin has already published to that path — for example a downstream plugin reading `polars.activePolar`/`polars.performanceFactor` after Polar Management has already started and published them. The fallback only runs if no delta has arrived, so it never overwrites a value the live subscription already delivered, and it transparently unwraps a full-data-model `{value, $source, timestamp}` node as well as a bare value.

---

## [3.1.2] — 2026-09-04

### Added
- `MessageSmoother.invalidate()` clears the current filtered value and requires a fresh source sample before the smoother becomes ready again. Consumers can use it to discard stale state at a manoeuvre or other data-boundary transition.

### Fixed
- `Polar` and `PolarSmoother` now re-arm the idle timer on every delta and no longer require `ABSENT` status for `onIdle` to fire, matching the `MessageHandler` fix in 3.1.1. A polar input that goes quiet after a healthy start previously produced no long-silence signal at all, so consumers could not recover it.

---

## [3.1.1] — 2026-09-04

### Fixed
- `onIdle` now fires whenever a subscription has been silent for `idlePeriod`, not only when it has never received a delta. The idle timer is re-armed on every delta instead of being cleared, so an input that goes quiet after a healthy start still triggers recovery in consuming plugins.

---

## [3.1.0] — 2026-08-04

### Fixed
- `PolarSmoother.polarValue` now returns `null` when `!this.ready` (i.e. no samples have been received yet, or data has gone stale). Previously, the uninitialized smoother `x`/`y` estimates of `0` caused `polarValue` to return `{ magnitude: 0, angle: 0 }`, making callers unable to distinguish "no data" from a genuine zero reading.

### Added
- `onDelta`, `onIdle`, and `onStale` are now first-class lifecycle events on `MessageHandler`, `Polar`, `MessageSmoother`, and `PolarSmoother`.
- The new `clear()` helpers (`MessageHandler.clear`, `Polar.clear`, `PolarSmoother.clear`) make it straightforward to write `null` to output paths when a plugin is stopped or a feature is toggled off.
- `stalePeriod` is now separate from `idlePeriod`, so absence and staleness use independent wait periods.

### Changed
- Subscription event configuration is now fixed for the duration of an ACTIVE lifecycle. Paths, subscribe options, `idlePeriod`, `stalePeriod`, and public event handlers must be configured before `subscribe()` and changed only after `unsubscribe()` or `terminate()`.
- `onChange` remains as a compatibility alias for `onDelta`, but wrapper propagation no longer depends on mutating child public callbacks.
- `MessageHandler`, `Polar`, `MessageSmoother`, and `PolarSmoother` now each own their own lifecycle state (`INACTIVE` / `ACTIVE`) and value status (`ABSENT` / `FRESH` / `STALE`) instead of borrowing stale semantics from wrapped objects.
- Wrapper factory helpers now accept event callbacks and timing options up front, so wrapper subscriptions can start with a complete event contract.

### Fixed
- Changing a live path now requires an explicit `unsubscribe() -> set path -> subscribe()` cycle instead of an implicit active resubscribe hidden inside the path setter.

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

