# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/Asw1n/signalkutilities/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/Asw1n/signalkutilities/compare/v1.12.3...v2.0.0
[1.12.3]: https://github.com/Asw1n/signalkutilities/compare/v1.12.2...v1.12.3
[1.12.2]: https://github.com/Asw1n/signalkutilities/releases/tag/v1.12.2
