# TODO

## Simplify when Signal K source priorities are stable

Signal K source priorities (see [PR #2688](https://github.com/SignalK/signalk-server/pull/2688)) allow users
to rank sources per path. Once that feature is part of a stable SK release, the source-selection
machinery in this library can be removed — SK handles it server-side.

### `MessageHandler`

- [x] Remove `_subscribeViaHandler` and the `app.registerDeltaInputHandler` subscription path entirely.
- [x] Remove the `passOn` parameter from `configure()` and `subscribe()`. Always subscribe via `_subscribeViaManager`.
- [x] Remove the `source` parameter from `configure()` and all `label`-based client-side source filtering in the subscription callback.
- [x] Remove `sourcePolicy: 'all'` from `_subscribeViaManager` (was needed to guarantee delivery of a named source regardless of priority; no longer relevant once source selection is gone).
- [x] Remove `this._sources` / the `_sources` `Set` — source list tracking is no longer needed once SK resolves the preferred source server-side.

### `Polar`

- [x] Remove `source` / `passOn` parameters from `configureMagnitude()` and `configureAngle()`.
- [x] Remove `source` / `passOn` parameters from `createSmoothedPolar()`.

### Consuming plugins

- [ ] Remove per-path source selection in the plugin settings UI.
- [ ] Remove any `source` arguments passed to `configure()`, `configureMagnitude()`, `configureAngle()`, and the factory functions.
- [ ] Upgrade the plugin configuration schema: remove all source-related fields and the overwrite option, bump the configuration version number, and add migration code to convert existing saved configurations to the new structure.
- [ ] Remove all UI elements related to the overwrite option from the plugin settings schema/form.
