# signalkutilities

Utilities for Signal K plugin development. Covers subscription and value tracking for individual paths, polar vector maths (add, rotate, scale), statistical smoothing with three smoother types, correct wraparound-safe angle smoothing, and a web-facing Reporter that aggregates state across all tracked objects.

## Installation

```
npm install signalkutilities
```

Requires Node.js ≥ 18.

---

## ID convention

Every tracked object carries a camelCase `id`. Smoothers derive their id automatically by appending `.smoothed`. Polar sub-handlers use `.magnitude` and `.angle` suffixes internally, but these are not normally exposed directly.

```
"apparentWind"            ← Polar id
"apparentWind.magnitude"  ← internal handler id
"apparentWind.angle"      ← internal handler id
"apparentWind.smoothed"   ← PolarSmoother id
"heading"                 ← SmoothedAngle id
"heading.smoothed"        ← SmoothedAngle smoother id (PolarSmoother base)
```

---

## meta / state / report() pattern

Every class exposes three standard accessors:

| Accessor | When to use | Contents |
|---|---|---|
| `meta` | Read once on startup | Static info: `id`, `path`, `displayName`, `displayUnits`, smoother type, etc. |
| `state` | Poll at any frequency | Dynamic info: `id`, `stale`, `frequency`, `sources` |
| `report()` | Snapshot for logging/API | Combined: id, current value(s), variance, path, `state` |

`Reporter` aggregates these across all objects and returns results keyed by `id`.

---

## MessageHandler

Subscribes to a single Signal K path and tracks the latest value.

```js
const { MessageHandler } = require('signalkutilities');

const handler = new MessageHandler(app, pluginId, 'boatSpeed');
handler.configure('navigation.speedOverGround', null, true);
handler.subscribe();

// later
handler.value;       // latest numeric value
handler.stale;       // true if no update within idlePeriod
handler.frequency;   // Hz
handler.meta;        // { id, path, source, displayName, displayUnits, ... }
handler.state;       // { id, stale, frequency, sources }
handler.report();    // { id, value, path, source, state }

handler.terminate(); // unsubscribe
```

---

## MessageSmoother

Wraps a `MessageHandler` and applies statistical smoothing to scalar values.

```js
const { MessageHandler, MessageSmoother, ExponentialSmoother } = require('signalkutilities');

const handler = new MessageHandler(app, pluginId, 'boatSpeed');
handler.configure('navigation.speedOverGround', null, true);
const smoother = new MessageSmoother(handler, ExponentialSmoother, { timeConstant: 2 });
handler.subscribe();
handler.onChange = () => smoother.sample();

smoother.value;          // smoothed value
smoother.standardError;  // sqrt of variance
smoother.handler;        // underlying MessageHandler
smoother.meta;           // includes smoother type and options
smoother.state;          // { id, stale, frequency, sources }
smoother.report();       // { id, value, variance, path, source, state }
```

Or use the factory:

```js
const { createSmoothedHandler } = require('signalkutilities');

const smoother = createSmoothedHandler({
  id: 'boatSpeed',
  path: 'navigation.speedOverGround',
  app, pluginId,
  SmootherClass: ExponentialSmoother,
  smootherOptions: { timeConstant: 2 }
});
```

---

## Polar + PolarSmoother

Combines two SK paths into a cartesian vector (x, y). Supports add, subtract, rotate, scale. Smoothing is applied in cartesian space so magnitude and angle are both smoothed correctly.

```js
const { createSmoothedPolar } = require('signalkutilities');

const wind = createSmoothedPolar({
  id: 'apparentWind',
  pathMagnitude: 'environment.wind.speedApparent',
  pathAngle: 'environment.wind.angleApparent',
  app, pluginId,
  angleRange: '-piToPi',
  SmootherClass: ExponentialSmoother,
  smootherOptions: { timeConstant: 3 },
  meta: { displayName: 'Apparent Wind' }
});

// PolarSmoother values
wind.magnitude;   // smoothed speed
wind.angle;       // smoothed angle (radians)
wind.trace;       // xVariance + yVariance
wind.sources;     // union of magnitude and angle sources

wind.meta;        // { id, angleRange, magnitude: {...}, angle: {...}, smoother: {...} }
wind.state;       // { id, stale, sources, magnitude: {...}, angle: {...} }
wind.report();    // { id, pathMagnitude, pathAngle, x, y, magnitude, angle, trace, state }

// Static send — writes smoothed values back to SK
PolarSmoother.send(app, pluginId, [wind]);
```

For unsmoothed use:

```js
const { Polar } = require('signalkutilities');

const polar = new Polar(app, pluginId, 'apparentWind');
polar.configureMagnitude('environment.wind.speedApparent', null, true);
polar.configureAngle('environment.wind.angleApparent', null, true);
polar.subscribe();
// polar.add(), polar.rotate(), polar.scale(), etc.
```

---

## SmoothedAngle

Wraps a single angular SK path and applies vector-based smoothing that correctly handles wraparound (heading crossing 0/2π, etc.). Mirrors the `MessageSmoother` interface.

```js
const { SmoothedAngle } = require('signalkutilities');

const heading = new SmoothedAngle(app, pluginId, 'heading', 'navigation.headingTrue', {
  angleRange: '0to2pi',
  SmootherClass: ExponentialSmoother,
  smootherOptions: { timeConstant: 2 },
  meta: { displayName: 'True Heading' }
});

heading.value;          // smoothed angle (radians)
heading.standardError;  // angular uncertainty (radians)
heading.frequency;      // Hz
heading.path;           // 'navigation.headingTrue'
heading.source;         // active source
heading.getSources();   // all observed sources

heading.meta;    // { id, path, displayUnits, angleRange, smoother: {...}, ... }
heading.state;   // { id, stale, frequency, sources }
heading.report(); // { id, value, variance, path, source, state }
```

---

## Smoothers

Three smoother classes are available. All implement the same interface: `add(value, variance?)`, `estimate`, `variance`, `reset()`, `setOptions(opts)`.

| Class | Options | Use case |
|---|---|---|
| `ExponentialSmoother` | `timeConstant` (seconds) | General purpose, low lag |
| `MovingAverageSmoother` | `windowSize` (samples) | Simple rolling average |
| `KalmanSmoother` | `processNoise`, `measurementNoise` | Optimal when noise is known |

```js
const { ExponentialSmoother, KalmanSmoother, MovingAverageSmoother } = require('signalkutilities');
```

---

## Reporter

Aggregates `meta`, `state`, and `report()` across collections of objects and returns results keyed by `id`. Designed for Express/webapp endpoints.

```js
const { Reporter } = require('signalkutilities');

const reporter = new Reporter();
reporter.addDelta(boatSpeed);        // MessageHandler or MessageSmoother
reporter.addPolar(apparentWind);     // Polar or PolarSmoother or SmoothedAngle
reporter.addTable(polarTable);       // PolarTable

// In your webapp GET handler:
res.json(reporter.state());   // { deltas: { boatSpeed: {...}, ... }, polars: { ... } }
res.json(reporter.meta());    // same structure, static fields
res.json(reporter.report());  // combined snapshot
```

---

## Table2D / PolarTable / SI

- **`Table2D`** — generic 2-D interpolation table.
- **`PolarTable`** — sailing polar performance table (Jieter CSV format). Provides optimal angles, VMG, and interpolated boat speed for any TWS/TWA.
- **`SI`** — unit conversion helpers.
