# Shared analysis of signalkutilities

## Module Map

```
index.js                         ← Public API re-export
src/
  general/
    SI.js                        ← Unit conversion utilities (knots ↔ m/s, deg ↔ rad)
    Table2D.js                   ← Generic 2-D grid with nearest-neighbour lookup
  signalk/
    smoothers.js                 ← Statistical smoothers: Base, MovingAverage, Exponential, Kalman
    MessageHandler.js            ← Signal K path subscriber + MessageSmoother decorator
    Polar.js                     ← Two-path vector handler + PolarSmoother decorator
    commons.js                   ← Pre-built handlers for common Signal K paths
  web/
    Reporter.js                  ← Aggregated report/JSON builder
  tests/
    Table2D.js                   ← Quick smoke test for Table2D
    smoothers.js                 ← Smoother test suite
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

### `src/signalk/smoothers.js` – Statistical Smoothers

All smoothers share the same interface via `BaseSmoother`.

#### `BaseSmoother` (base class)

```js
smoother.add(value, variance?)  // ingest a new sample
smoother.estimate               // current smoothed value
smoother.variance               // current variance estimate
smoother.options                // get/set options (triggers reset)
```

---

### Reporter

```js
const { Reporter, createSmoothedPolar } = require('signalkutilities');

const reporter = new Reporter();
const wind = createSmoothedPolar({
  id: 'apparentWind',
  pathMagnitude: 'environment.wind.speedApparent',
  pathAngle: 'environment.wind.angleApparent',
  app, pluginId
});

reporter.addPolar(wind);
res.json(reporter.report());
```
