# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Remove client-side source-selection machinery once Signal K source priorities are stable (see [SK PR #2688](https://github.com/SignalK/signalk-server/pull/2688)):
  - `MessageHandler`: remove `_subscribeViaHandler`, `passOn`, `source`, `sourcePolicy: 'all'`, and `_sources` tracking.
  - `Polar`: remove `source`/`passOn` from `configureMagnitude()`, `configureAngle()`, and `createSmoothedPolar()`.

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

[Unreleased]: https://github.com/Asw1n/signalkutilities/compare/v1.12.3...HEAD
[1.12.3]: https://github.com/Asw1n/signalkutilities/compare/v1.12.2...v1.12.3
[1.12.2]: https://github.com/Asw1n/signalkutilities/releases/tag/v1.12.2
