# Codebase Analysis: signalkutilities

**Package**: `signalkutilities` v1.6.0  
**Author**: aswin.bouwmeester@gmail.com  
**Repository**: https://github.com/Asw1n/signalkutilities  
**Entry point**: `index.js`

---

## Purpose

This library provides reusable utility classes for building [Signal K](https://signalk.org/) server plugins (Node.js). It covers:

- **Subscribing** to Signal K data paths and tracking values.
- **Smoothing** incoming data using statistical filters.
- **Vector arithmetic** on polar quantities (speed + angle pairs).
- **Polar performance table** management and interpolation for sailing.
- **General data structures** – a generic 2D lookup table and SI unit conversion.
- **Reporting** aggregated state to a web or REST endpoint.

---

## Module Map

```
index.js                         ← Public API re-export
src/
  general/
    SI.js                        ← Unit conversion utilities (knots ↔ m/s, deg ↔ rad)
    Table2D.js                   ← Generic 2-D grid with nearest-neighbour lookup
    PolarTable.js                ← Sailing polar performance table (CSV load + interpolation)
  signalk/
    smoothers.js                 ← Statistical smoothers: Base, MovingAverage, Exponential, Kalman
    MessageHandler.js            ← Signal K path subscriber + MessageSmoother decorator
    Polar.js                     ← Two-path vector handler + PolarSmoother decorator
    commons.js                   ← Pre-built handlers for common Signal K paths
  web/
    Reporter.js                  ← Aggregated report/JSON builder
  tests/
    PolarTable.js                ← Self-contained test harness for PolarTable
    Table2D.js                   ← Quick smoke test for Table2D
```

---

## Design Patterns

| Pattern | Where used |
|---|---|
| **Decorator** | `MessageSmoother` wraps `MessageHandler`; `PolarSmoother` wraps `Polar`. Both mirror the wrapped object's interface. |
| **Observer / callback** | `MessageHandler.onChange`, `Polar.onChange` fire when new data arrives. Smoothers hook in via these callbacks. |
| **Factory function** | `createSmoothedHandler()` and `createSmoothedPolar()` construct a handler + smoother pair and wire them together. |
| **Template Method** | `BaseSmoother` defines the interface; subclasses override `reset()` and `add()`. |
| **Static batch send** | `MessageHandler.send()` and `Polar.send()` aggregate multiple values into a single Signal K delta for efficiency. |

---

## Module Details

### `src/general/SI.js` – Unit Conversion

A pure static utility class. No state, no dependencies.

| Method | Conversion |
|---|---|
| `SI.fromKnots(kn)` | knots → m/s |
| `SI.toKnots(ms)` | m/s → knots |
| `SI.fromDegrees(deg)` | degrees → radians |
| `SI.toDegrees(rad)` | radians → degrees |

All internal values in this library use **SI units**: metres per second and radians.

---

### `src/general/Table2D.js` – Generic 2D Lookup Table

A rectangular grid parameterised by row and column axis definitions (`min`, `max`, `step`). Each cell holds an instance of a caller-supplied `ClassType`.

**Constructor**:
```js
new Table2D(id, row, col, ClassType, param)
// row/col: { min, max, step }
// ClassType: class with toJSON() / fromJSON() / addObs() etc.
```

**Key methods**:

| Method | Description |
|---|---|
| `getCell(rowValue, colValue)` | Returns the cell nearest to the given axis values (clamped). |
| `getIndex(value, dim)` | Maps a continuous value to the nearest integer grid index. |
| `getIndices(rowValue, colValue)` | Returns `[rowIndex, colIndex]`. |
| `findNeighbours(rowValue, colValue)` | Returns the 2×2 surrounding cells with normalised distances (for bilinear interpolation). |
| `findClosest(rowValue, colValue, N=4)` | Returns the N globally closest cells, sorted by distance. |
| `toJSON()` / `Table2D.fromJSON(data, ClassType)` | Serialise/deserialise the entire table. |

**Important**: `ClassType` must implement `toJSON()` and `static fromJSON()`.

---

### `src/general/PolarTable.js` – Sailing Polar Performance Table

Manages a boat's theoretical speed/angle performance across wind conditions.

**Data model** (after `loadFromJieter()`): an array of TWS (True Wind Speed) entries, each containing:
- `tws` – wind speed in m/s
- `Beat angle` / `Beat VMG` – optimal upwind angle and VMG
- `Run angle` / `Run VMG` – optimal downwind angle and VMG
- `Max speed` / `Max speed angle` – peak speed and its angle
- `twa[]` – sorted array of `{ twa, tbs, vmg }` data points (padded for smooth interpolation)

**Constructor**:
```js
const polar = new PolarTable();
polar.loadFromJieter(csvString, app?);
polar.setPerformanceAdjustment(0.9); // optional scaling
```

**CSV format**: Jieter format – semicolon-delimited, first column is `twa/tws`, first row header contains wind speeds in knots, data cells are boat speeds in knots. Rows where all but one speed column are `'0'` denote optimal beat/run angles.

**Query methods** (all inputs in SI units):

| Method | Returns |
|---|---|
| `getBeatAngle(tws)` | Optimal upwind angle (rad) |
| `getRunAngle(tws)` | Optimal downwind angle (rad) |
| `getBeatVMG(tws)` | Best upwind VMG (m/s, scaled) |
| `getRunVMG(tws)` | Best downwind VMG (m/s, scaled) |
| `getMaxSpeed(tws)` | Peak boat speed (m/s, scaled) |
| `getMaxSpeedAngle(tws)` | Angle for peak speed (rad) |
| `getBoatSpeed(tws, twa)` | Boat speed via bilinear interpolation (m/s, scaled) |
| `getVMG(tws, twa)` | VMG for any angle (m/s) |

**Port/starboard symmetry**: negative TWA values are automatically mirrored to their positive equivalent.

**Padding**: After loading, the table is padded at the 0° and 180° extremes and a near-zero wind speed entry is prepended, ensuring smooth interpolation at all wind conditions.

---

### `src/signalk/smoothers.js` – Statistical Smoothers

All smoothers share the same interface via `BaseSmoother`.

#### `BaseSmoother` (base class)

```js
smoother.add(value, variance?)  // ingest a new sample
smoother.estimate               // current smoothed value
smoother.variance               // current variance estimate
smoother.options                // get/set options (triggers reset)
smoother.reset(estimate?, variance?)
```

`BaseSmoother.add()` is a pass-through (last-value-wins). Subclasses override it.

#### `MovingAverageSmoother`

Option: `{ timeSpan: 1 }` (seconds)

Maintains a time-windowed buffer. Discards samples older than `timeSpan` seconds. Computes the mean of the remaining window. Also exposes `standardError` (SEM). Does **not** use input variance.

#### `ExponentialSmoother`

Options: `{ tau: 1 }` or `{ timeConstant: 1 }` (seconds)

Applies exponential moving average with proper time-based alpha: $\alpha = 1 - e^{-\Delta t / \tau}$. Tracks a running variance estimate. First sample initialises the estimate exactly.

#### `KalmanSmoother`

Options: `{ processVariance, measurementVariance }` or `{ steadyState }` (Kalman gain 0–1)

1-D Kalman filter. Alternates a prediction step (variance grows by `processVariance`) and an update step (Kalman gain applied). Accepts per-sample `measurementVariance` in `add(value, variance)`. `steadyState` option derives `processVariance`/`measurementVariance` from a desired steady-state gain.

---

### `src/signalk/MessageHandler.js` – Signal K Path Subscriber

#### `MessageHandler`

The core class for consuming a single Signal K path.

**Constructor**:
```js
new MessageHandler(app, pluginId, id)
```

**Configuration** (set before or after construction – re-subscribes automatically):
```js
handler.path = 'navigation.speedOverGround';
handler.source = 'label.talker';    // optional source filter
handler.passOn = true;              // keep delta in stream, false = consume it
handler.onChange = () => { ... };   // called on every new value
```

Or via fluent `setSubscription(path, source, passOn, onChange)`.

**Subscription**:
```js
handler.subscribe();    // registers Signal K delta input handler
handler.terminate();    // unsubscribes, clears idle timer
```

**State**:
```js
handler.value       // most recent raw value (any type Signal K provides)
handler.timestamp   // ms timestamp of last update
handler.frequency   // EMA-smoothed update rate (Hz)
handler.stale       // true if no update in ≥ 4 000 ms (configurable via idlePeriod)
handler.variance    // undefined unless a downstream smoother sets it
```

**Static helpers**:
```js
MessageHandler.send(app, pluginId, handlers[])   // send batch delta
MessageHandler.sendMeta(app, pluginId, entries[]) // send meta updates
MessageHandler.setMeta(app, pluginId, path, value)
```

**Staleness detection**: An internal idle timer fires after `idlePeriod` ms (default 4 000 ms) with no updates and sets `stale = true`. It resets on the next received value and logs via `app.debug`.

#### `MessageSmoother` (decorator)

Wraps a `MessageHandler` and applies a smoother to its values. Supports both scalar `number` values and `object` values with numeric properties (creates one smoother per property).

**Constructor**:
```js
new MessageSmoother(id, handler, SmootherClass?, smootherOptions?)
// SmootherClass defaults to ExponentialSmoother
```

**Usage pattern**:
```js
handler.onChange = () => { smoother.sample(); };
```

**Interface mirrors `MessageHandler`**: `value`, `variance`, `standardError`, `stale`, `frequency`, `id`, `report()`, `terminate()`.

#### `createSmoothedHandler(options)` – Factory

Convenience function that builds a `MessageHandler`, wraps it in a `MessageSmoother`, and optionally subscribes:

```js
const smoother = createSmoothedHandler({
  id, path, source, app, pluginId,
  subscribe: true,
  SmootherClass: KalmanSmoother,
  smootherOptions: { processVariance: 0.1, measurementVariance: 0.4 },
  displayAttributes: { label: 'My value' }
});
```

---

### `src/signalk/Polar.js` – Vector Quantities

#### `Polar`

Represents a 2-D vector sourced from **two** Signal K paths: one for magnitude and one for angle. Internally stores the vector in Cartesian form (`xValue`, `yValue`) to allow arithmetic. Provides variance propagation for all operations.

**Constructor**:
```js
new Polar(app, pluginId, id)
```

After construction, configure subscriptions:
```js
polar.setMagnitudeSubscription(path, source, passOn?)
polar.setAngleSubscription(path, source, passOn?)
polar.setAngleRange('0to2pi' | '-piToPi')  // default: '-piToPi'
polar.subscribe(toMagnitude?, toAngle?)
```

When either handler fires `onChange`, `Polar.processChanges()` recomputes `xValue`/`yValue` and fires `polar.onChange`.

**Vector arithmetic** (mutates in place, propagates variance):

| Method | Operation |
|---|---|
| `add(polar)` | vector addition |
| `substract(polar)` | vector subtraction |
| `rotate(angle)` | rotation (variance transformed by rotation matrix) |
| `scale(factor)` | scalar multiplication |
| `copyFrom(polar)` | copy x, y, and variances |

**Setters**:
```js
polar.setPolarValue({ magnitude, angle })
polar.setVectorValue({ x, y }, { x: xVar, y: yVar })
```

**Getters**: `magnitude`, `angle`, `x`, `y`, `polarValue`, `vectorValue`, `vector`, `trace`, `stale`, `frequency`, `timestamp`, `pathMagnitude`, `pathAngle`.

**Static send**:
```js
Polar.send(app, pluginId, polars[])  // batch delta for multiple polars
```

#### `PolarSmoother` (decorator)

Wraps a `Polar` and smooths its Cartesian `x` and `y` components independently using two instances of a smoother. Angle formatfollows `angleRange`.

**Constructor**:
```js
new PolarSmoother(id, polar, SmootherClass?, smootherOptions?)
```

**Exposes** the same geometric interface as `Polar`: `x`, `y`, `magnitude`, `angle`, `polarValue`, `vectorValue`, `vector`, `xVariance`, `yVariance`, `trace`, `stale`, `nSamples`, `report()`, `terminate()`.

**Static send**:
```js
PolarSmoother.send(app, pluginId, polarsSmoothed[])
```

#### `createSmoothedPolar(options)` – Factory

```js
const smoother = createSmoothedPolar({
  id, pathMagnitude, pathAngle,
  sourceMagnitude?, sourceAngle?,
  app, pluginId,
  subscribe: true,
  SmootherClass: ExponentialSmoother,
  smootherOptions: { timeConstant: 2 },
  passOn: true,
  angleRange: '0to2pi',
  displayAttributes: {}
});
```

---

### `src/signalk/commons.js` – Pre-built Signal K Handlers

Ready-to-use handler classes for the most common Signal K paths. Each raw handler has a corresponding smoothed variant.

| Class | Paths subscribed | Type |
|---|---|---|
| `ApparentWind` | `environment.wind.speedApparent` + `environment.wind.angleApparent` | `Polar` |
| `SmoothedApparentWind` | same | `PolarSmoother` |
| `GroundSpeed` | `navigation.speedOverGround` + `navigation.courseOverGroundTrue` | `Polar` |
| `SmoothedGroundSpeed` | same | `PolarSmoother` |
| `SpeedThroughWater` | `navigation.speedThroughWater` + `navigation.leewayAngle` | `Polar` |
| `SmoothedSpeedThroughWater` | same | `PolarSmoother` |
| `Attitude` | `navigation.attitude` | `MessageHandler` |
| `SmoothedAttitude` | same | `MessageSmoother` |
| `Heading` | `navigation.headingTrue` | `MessageHandler` |
| `SmoothedHeading` | `navigation.headingTrue` (angle only, magnitude=1) | `PolarSmoother` |

All constructors accept `(app, pluginId, source?, passOn?, SmootherClass?, smootherOptions?)`.

**`SmoothedHeading` note**: Because heading is a circular quantity, it uses a `PolarSmoother` internally (unit vector on the unit circle) to correctly handle 0°/360° wraparound. The `value` getter returns `angle` and `variance` returns `trace`.

**Default smoother**: `ExponentialSmoother` with `{ timeConstant: 1 }`.

---

### `src/web/Reporter.js` – Aggregated Reporter

Collects references to handlers and produces a structured report or JSON snapshot.

**Constructor**: `new Reporter()`

**Registration**:
```js
reporter.setDeltas(handlers[])   // replace delta list
reporter.addDelta(handler)       // append one
reporter.setPolars(polars[])
reporter.addPolar(polar)
reporter.setTables(tables[])
reporter.addTable(table)
reporter.setAttitudes(attitudes[])
reporter.addAttitude(attitude)
```

**Output**:
```js
reporter.report()   // calls .report() on each registered object; returns { deltas, polars, tables, attitudes }
reporter.toJSON()   // calls .toJSON() on each registered object; returns same structure
```

Objects that do not implement `report()` or `toJSON()` are stringified as a fallback.

---

## Data Flow

```
Signal K Server
      │
      │ delta stream
      ▼
MessageHandler.subscribe()
      │  onChange callback
      ▼
MessageSmoother.sample()         ← or PolarSmoother.sample()
      │
      │  .value / .variance
      ▼
Plugin business logic
      │
      │ MessageHandler.send() / Polar.send()
      ▼
Signal K Server  (new derived path)
```

For vector quantities the flow passes through `Polar` (which holds two `MessageHandler` instances) before reaching `PolarSmoother`.

---

## Usage Examples

### Minimal: subscribe to a path

```js
const { MessageHandler } = require('signalkutilities');

const handler = new MessageHandler(app, plugin.id, 'sog');
handler.setSubscription('navigation.speedOverGround', null, true);
handler.onChange = () => {
  app.debug('SOG =', handler.value);
};
handler.subscribe();
```

### With smoothing (factory pattern)

```js
const { createSmoothedHandler, ExponentialSmoother } = require('signalkutilities');

const sog = createSmoothedHandler({
  id: 'sog',
  path: 'navigation.speedOverGround',
  source: null,
  subscribe: true,
  app,
  pluginId: plugin.id,
  SmootherClass: ExponentialSmoother,
  smootherOptions: { timeConstant: 3 },
  displayAttributes: { label: 'Smoothed SOG', units: 'm/s' }
});

// Later:
app.debug('Smoothed SOG =', sog.value, '±', Math.sqrt(sog.variance));
```

### Polar vector

```js
const { SmoothedGroundSpeed } = require('signalkutilities');

const cog = new SmoothedGroundSpeed(app, plugin.id, null, true);
// cog.magnitude → smoothed SOG in m/s
// cog.angle     → smoothed COG in radians
```

### Polar table lookup

```js
const { PolarTable, SI } = require('signalkutilities');
const fs = require('fs');

const polar = new PolarTable();
polar.loadFromJieter(fs.readFileSync('polar.csv', 'utf8'));
polar.setPerformanceAdjustment(0.95);

const tws = SI.fromKnots(12);
const twa = SI.fromDegrees(52);
const speed = polar.getBoatSpeed(tws, twa);       // m/s
const vmg   = polar.getVMG(tws, twa);             // m/s
const beat  = polar.getBeatAngle(tws);            // radians
```

### Reporter

```js
const { Reporter, SmoothedGroundSpeed, SmoothedApparentWind } = require('signalkutilities');

const reporter = new Reporter();
const gs = new SmoothedGroundSpeed(app, plugin.id);
const aw = new SmoothedApparentWind(app, plugin.id);

reporter.addPolar(gs);
reporter.addPolar(aw);

// In a GET handler:
res.json(reporter.report());
```

---

## Important Conventions

- **All internal units are SI**: speeds in m/s, angles in radians. Use `SI` helpers at the boundary.
- **`stale` flag**: set automatically by `MessageHandler` after 4 s of silence. Always propagated up through smoothers and polars.
- **`onChange` wiring**: smoothers do not auto-sample; the consuming code must set `handler.onChange = () => smoother.sample()`. The pre-built classes in `commons.js` and the factory functions do this automatically.
- **Subscriptions are live**: changing `handler.path`, `handler.source`, or `handler.passOn` via their setters while subscribed automatically re-subscribes.
- **`passOn = false`**: consumes the delta from the stream (removes the value from the update array), preventing it from being forwarded. Use with care to avoid breaking other listeners.
- **Variance propagation**: `Polar` propagates variance through `rotate()` and `scale()` using exact linear transformation formulas (assuming independent x/y). `KalmanSmoother` accepts per-sample measurement variance from `MessageHandler.variance`.

---

## Dependencies

None – this package has no `dependencies` in `package.json`. It is intended to be installed as a dependency by plugin packages. The Signal K `app` object is passed in at construction time and used for `app.debug()`, `app.handleMessage()`, `app.registerDeltaInputHandler()`, and `app.getSelfPath()`.
