# Agent Instructions: Migrating Plugin and Webapp to the meta/state API

These instructions describe the changes required in a **Signal K plugin** and its **companion webapp** after the `signalkutilities` library replaced the `displayAttributes` system with two dedicated getters: `meta` (static) and `state` (dynamic).

---

## Background: What Changed in the Library

### Removed from all classes
- `this._displayAttributes = {}`
- `setDisplayAttributes(attr)`
- `setDisplayAttribute(key, value)`
- `loadMeta()` (MessageHandler only)
- `get displayAttributes()`

### Added to all handler/polar classes

| Class | `get meta()` | `get state()` |
|---|---|---|
| `MessageHandler` | `{ id, path, source, idlePeriod, ...skMeta }` — SK fields lazily read | `{ stale, frequency, sources }` |
| `MessageSmoother` | `{ ...handler.meta, smoother: { type, ...smootherOptions } }` | delegates to `handler.state` |
| `Polar` | `{ ..._polarMeta, angleRange, magnitude: handler.meta, angle: handler.meta }` | `{ stale, magnitude: handler.state, angle: handler.state }` |
| `PolarSmoother` | `{ ...polar.meta, smoother: { type, ...smootherOptions } }` | `{ stale, magnitude: handler.state, angle: handler.state }` |

### `report()` field changes

`report()` no longer contains `displayAttributes`, `magnitudeSources`, or `angleSources`. It now includes a nested `state` object instead:

```js
// MessageHandler.report()
{ id, path, value, source, state: { stale, frequency, sources } }

// MessageSmoother.report()
{ id, path, value, variance, source, state: { stale, frequency, sources } }

// Polar.report()
{ id, pathMagnitude, pathAngle, x, y, xVariance, yVariance, magnitude, angle, trace,
  state: { stale, magnitude: { stale, frequency, sources }, angle: { stale, frequency, sources } } }

// PolarSmoother.report()
{ id, pathMagnitude, pathAngle, x, y, magnitude, angle, trace,
  state: { stale, magnitude: { stale, frequency, sources }, angle: { stale, frequency, sources } } }
```

### `Reporter` additions

```js
reporter.meta()    // aggregates .meta from all registered items
reporter.state()   // aggregates .state from all registered items
reporter.report()  // unchanged in structure, but items no longer have displayAttributes
```

---

## Part 1: Plugin Changes

### 1.1 Remove all `setDisplayAttributes` / `loadMeta` calls

**Before:**
```js
handler.setDisplayAttributes({ label: "Wind speed", units: "m/s" });
handler.loadMeta();
```

**After:** Delete both lines. SK vocabulary (`displayName`, `description`, `units`, `zones`) is now read automatically from the SK data model at endpoint call time. Do not set it manually.

---

### 1.2 Set Polar identity fields using `setMeta()`

A `Polar` or `PolarSmoother` has no SK path, so the plugin must provide its identity fields explicitly.

**For a `Polar` subclass (direct):**
```js
// In the constructor, after super():
this.setMeta({ displayName: "Apparent Wind", description: "Observed apparent wind vector", plane: "Boat" });
```

**For a `PolarSmoother` subclass:**
```js
// PolarSmoother has no own _polarMeta — call setMeta on the underlying polar:
this.polar.setMeta({ displayName: "Smoothed Apparent Wind", plane: "Boat" });
```

**For `createSmoothedPolar`:** pass `meta` (not `displayAttributes`):
```js
const smoother = createSmoothedPolar({
  id: 'myWind',
  pathMagnitude: 'environment.wind.speedApparent',
  pathAngle: 'environment.wind.angleApparent',
  app, pluginId,
  meta: { displayName: "Apparent Wind", plane: "Boat" },
  angleRange: '-piToPi'
});
```

**For `createSmoothedHandler`:** the `displayAttributes` parameter no longer exists and must be removed:
```js
// Before:
const s = createSmoothedHandler({ id, path, source, app, pluginId, displayAttributes: { label: "Speed" } });

// After:
const s = createSmoothedHandler({ id, path, source, app, pluginId });
```

---

### 1.3 Plugin endpoint design

Expose **three separate endpoints** so webapps can call each on a different schedule:

#### `/api/meta` — serve once at webapp load
```js
app.get('/api/my-plugin/meta', (req, res) => {
  res.json(reporter.meta());
});
```

#### `/api/state` — serve on cheap poll (e.g. every 2 s)
```js
app.get('/api/my-plugin/state', (req, res) => {
  res.json(reporter.state());
});
```

#### `/api/report` — live data (e.g. SSE or frequent poll)
```js
app.get('/api/my-plugin/report', (req, res) => {
  res.json(reporter.report());
});
```

**Note:** You can also combine `state` into `report` if you prefer fewer endpoints — `report()` already includes the nested `state` object in every item. The separate `/api/state` endpoint is only useful if the webapp needs to poll staleness more cheaply than full values.

---

### 1.4 SK meta vocabulary reference

When SK has metadata for a path, `handler.meta` will include these fields automatically (no action required in the plugin):

| SK field | Meaning |
|---|---|
| `displayName` | Short UI label (was `label` in old code) |
| `description` | Long description text |
| `units` | SI base unit string, e.g. `"m/s"`, `"rad"`, `"K"` — always the SI value |
| `zones` | Alert zones array |
| `displayUnits` | Object added by SK server when the user has unit preferences configured (see below) |

**Do not** add `label`, `shortName`, or `timeout` — these are not part of the SK specification.

For fields the webapp needs that SK does not provide (like `plane`, `angleRange`, `displayName` for polars), set them via `polar.setMeta()` as shown in §1.2.

#### `displayUnits` — server-managed unit conversion

When a user has configured unit preferences on the SK server, the server injects a `displayUnits` object into the path's metadata. This is provided automatically by SK — **the plugin does not need to do anything**.

Example `meta` object for `navigation.speedOverGround` with unit preferences active:

```json
{
  "units": "m/s",
  "description": "Speed over ground",
  "displayName": "SOG",
  "displayUnits": {
    "category": "speed",
    "targetUnit": "kn",
    "formula": "value * 1.94384",
    "inverseFormula": "value / 1.94384",
    "symbol": "kn",
    "displayFormat": "0.0"
  }
}
```

The `displayUnits` fields:

| Field | Meaning |
|---|---|
| `category` | Unit category for this path, e.g. `"speed"`, `"depth"`, `"temperature"`, `"angle"` |
| `targetUnit` | The unit the user wants to see, e.g. `"kn"`, `"ft"`, `"°C"` |
| `formula` | A [Math.js](https://mathjs.org/) expression to convert the raw SI value to the display unit. The variable `value` is the input. |
| `inverseFormula` | Math.js expression to convert back from display unit to SI (useful for user input fields) |
| `symbol` | Display symbol to show next to the value, e.g. `"kn"`, `"m/s"` |
| `displayFormat` | Optional format pattern for decimal places, e.g. `"0.0"` for one decimal place |

Standard SK unit categories (all base units are SI):

| Category | Base unit | Example paths |
|---|---|---|
| `speed` | m/s | `navigation.speedOverGround`, `environment.wind.speedTrue` |
| `distance` | m | `navigation.log` |
| `depth` | m | `environment.depth.belowKeel` |
| `length` | m | `design.length.overall` |
| `temperature` | K | `environment.outside.temperature` |
| `pressure` | Pa | `environment.outside.pressure` |
| `angle` | rad | `environment.wind.angleApparent`, `navigation.headingMagnetic` |
| `angularVelocity` | rad/s | `navigation.rateOfTurn` |
| `volume` | m³ | `tanks.*.currentLevel` |
| `volumeRate` | m³/s | `propulsion.*.fuel.rate` |
| `mass` | kg | — |
| `voltage` | V | `electrical.batteries.*.voltage` |
| `current` | A | `electrical.batteries.*.current` |
| `power` | W | — |
| `energy` | J | — |
| `frequency` | Hz | `propulsion.*.revolutions` |
| `time` | s | — |
| `percentage` | ratio 0–1 | `tanks.*.currentLevel`, `electrical.batteries.*.capacity.stateOfCharge` |

---

## Part 2: Webapp Changes

### 2.1 Fetch meta once at startup

```js
let meta = {};

async function loadMeta() {
  const res = await fetch('/api/my-plugin/meta');
  meta = await res.json();
}

// Call at startup, e.g. on DOMContentLoaded or app mount
loadMeta();
```

Do **not** re-fetch `meta` on every update cycle. It is static configuration data.

---

### 2.2 Access live values from `report`

```js
async function fetchReport() {
  const res = await fetch('/api/my-plugin/report');
  const data = await res.json();
  renderDeltas(data.deltas);
  renderPolars(data.polars);
}

setInterval(fetchReport, 500);
```

---

### 2.3 Handle missing meta fields with your own fallbacks

**The library does not provide fallback values.** If SK has no `displayName` for a path, `meta` will simply not have that field. The webapp is responsible for all display fallbacks.

```js
function getDisplayName(item) {
  // For a MessageHandler or MessageSmoother:
  return item.meta?.displayName ?? item.meta?.path ?? 'Unknown';
}

function getPolarDisplayName(polar) {
  // For a Polar or PolarSmoother:
  return polar.meta?.displayName ?? polar.meta?.id ?? 'Unknown polar';
}
```

Common fallback patterns:

| Field | Fallback strategy |
|---|---|
| `displayName` | Show raw `path`, or `id`, or a hardcoded label |
| `description` | Hide the description area |
| `units` | Show raw number without unit suffix |
| `plane` | Default to `"Boat"` or omit the frame indicator |
| `angleRange` | Default to `'-piToPi'` |

---

### 2.4 Use `state` for staleness indicators and source display

```js
function renderDelta(reportItem, metaItem) {
  const { value, state } = reportItem;
  const { displayName, units } = metaItem ?? {};

  const label = displayName ?? reportItem.path;
  const valueStr = state.stale ? '—' : formatValue(value, units);
  const freqStr = state.frequency != null ? `${state.frequency.toFixed(1)} Hz` : '';
  const sourcesStr = state.sources.join(', ');

  // render label, valueStr, freqStr, sourcesStr ...
}
```

For a Polar, `state` is nested:
```js
function renderPolar(reportItem) {
  const { magnitude, angle, state } = reportItem;

  const magnitudeStale = state.magnitude.stale;
  const angleStale = state.angle.stale;
  const overallStale = state.stale;

  // show per-component staleness indicators separately
}
```

---

### 2.5 Display smoother config from meta

For handlers/polars created with a smoother, `meta.smoother` describes the algorithm:
```js
const { type, timeConstant, windowSize } = metaItem.smoother ?? {};
// e.g. type = "ExponentialSmoother", timeConstant = 1
```

Use this to show the user what smoothing is active, or to allow configuration changes.

---

## Part 3: Quick Migration Checklist

### Plugin
- [ ] Remove all `setDisplayAttributes(...)` calls
- [ ] Remove all `setDisplayAttribute(...)` calls
- [ ] Remove all `loadMeta()` calls
- [ ] Remove `displayAttributes` from any `createSmoothedHandler` or `createSmoothedPolar` calls (rename to `meta`)
- [ ] Add `setMeta({ displayName, description, plane })` to any `Polar` or `PolarSmoother` subclass constructors
- [ ] Expose `/api/meta`, `/api/state`, `/api/report` (or equivalent) endpoints
- [ ] Do **not** use `label` — use `displayName` (SK vocabulary)

### Webapp
- [ ] Call `/api/meta` once at load; cache it
- [ ] Do not look for `displayAttributes` in report responses — it no longer exists
- [ ] Replace any use of `report.displayAttributes.label` → fallback pattern on `meta.displayName ?? meta.path`
- [ ] Replace any use of `report.displayAttributes.stale` → `report.state.stale`
- [ ] Replace any use of `report.magnitudeSources` / `report.angleSources` → `report.state.magnitude.sources` / `report.state.angle.sources`
- [ ] Add fallbacks for all meta fields that SK may not provide
