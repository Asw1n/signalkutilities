# TODO

## Simplify when Signal K source priorities are stable

Signal K source priorities (see [PR #2688](https://github.com/SignalK/signalk-server/pull/2688)) allow users
to rank sources per path. Once that feature is part of a stable SK release, the source-selection
machinery in this library can be removed — SK handles it server-side.

### `MessageHandler`

- [ ] Remove `_subscribeViaHandler` and the `app.registerDeltaInputHandler` subscription path entirely.
- [ ] Remove the `passOn` parameter from `configure()` and `subscribe()`. Always subscribe via `_subscribeViaManager`.
- [ ] Remove the `source` parameter from `configure()` and all `label`-based client-side source filtering in the subscription callback.
- [ ] Remove `sourcePolicy: 'all'` from `_subscribeViaManager` (was needed to guarantee delivery of a named source regardless of priority; no longer relevant once source selection is gone).
- [ ] Remove `this._sources` / the `_sources` `Set` — source list tracking is no longer needed once SK resolves the preferred source server-side.

### `Polar`

- [ ] Remove `source` / `passOn` parameters from `configureMagnitude()` and `configureAngle()`.
- [ ] Remove `source` / `passOn` parameters from `createSmoothedPolar()`.

### Consuming plugins

- [ ] Replace per-path source selection with Signal K source priority configuration in the plugin settings UI.
- [ ] Remove any `source` arguments passed to `configure()`, `configureMagnitude()`, `configureAngle()`, and the factory functions.
