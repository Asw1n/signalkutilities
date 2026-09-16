const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { MessageHandler, createSmoothedHandler } = require('../signalk/MessageHandler');
const { Polar, createSmoothedPolar } = require('../signalk/Polar');

function createAppShim(options = {}) {
  const subscribers = new Map();
  return {
    app: {
      debug: () => {},
      getMetadata: options.getMetadata || (() => undefined),
      getSelfPath: options.getSelfPath || (() => undefined),
      handleMessage: () => {},
      subscriptionmanager: {
        subscribe: (msg, unsubscribes, _errorCb, deltaCb) => {
          const paths = (msg.subscribe || []).map(s => s.path);
          for (const path of paths) {
            const set = subscribers.get(path) || new Set();
            set.add(deltaCb);
            subscribers.set(path, set);
          }
          unsubscribes.push(() => {
            for (const path of paths) {
              const set = subscribers.get(path);
              if (!set) continue;
              set.delete(deltaCb);
              if (set.size === 0) subscribers.delete(path);
            }
          });
        }
      }
    },
    deliver(values) {
      const delta = { updates: [{ values }] };
      for (const entry of values) {
        const cbs = subscribers.get(entry.path);
        if (!cbs) continue;
        for (const cb of [...cbs]) cb(delta);
      }
    }
  };
}

describe('event lifecycle contract', () => {
  it('uses 60s idle and 4s stale defaults', () => {
    const { app } = createAppShim();
    const handler = new MessageHandler(app, 'plugin', 'test');
    assert.equal(handler.idlePeriod, 60000);
    assert.equal(handler.stalePeriod, 4000);

    const smoother = createSmoothedHandler({
      app,
      pluginId: 'plugin',
      id: 'speed',
      path: 'navigation.speedThroughWater'
    });
    assert.equal(smoother.idlePeriod, 60000);
    assert.equal(smoother.stalePeriod, 4000);

    const polar = new Polar(app, 'plugin', 'wind');
    assert.equal(polar.idlePeriod, 60000);
    assert.equal(polar.stalePeriod, 4000);
  });

  it('blocks active mutation of handler event config', () => {
    const { app } = createAppShim();
    const handler = new MessageHandler(app, 'plugin', 'test');
    handler.configure('navigation.speedThroughWater');
    handler.subscribe();
    assert.throws(() => { handler.onDelta = () => {}; }, /ACTIVE/);
    assert.throws(() => { handler.onIdle = () => {}; }, /ACTIVE/);
    assert.throws(() => { handler.onStale = () => {}; }, /ACTIVE/);
    assert.throws(() => { handler.idlePeriod = 10; }, /ACTIVE/);
    assert.throws(() => { handler.stalePeriod = 10; }, /ACTIVE/);
    handler.unsubscribe();
    assert.doesNotThrow(() => { handler.onDelta = () => {}; });
  });

  it('fires handler onIdle once when no data arrives after activation', async () => {
    const { app } = createAppShim();
    let calls = 0;
    const handler = new MessageHandler(app, 'plugin', 'test');
    handler.configure('navigation.speedThroughWater');
    handler.idlePeriod = 10;
    handler.onIdle = () => { calls += 1; };
    handler.subscribe();
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(calls, 1);
  });

  it('fires handler onIdle after deltas stop arriving', async () => {
    const { app, deliver } = createAppShim();
    let calls = 0;
    const handler = new MessageHandler(app, 'plugin', 'test');
    handler.configure('navigation.speedThroughWater');
    handler.idlePeriod = 40;
    handler.onIdle = () => { calls += 1; };
    handler.subscribe();
    deliver([{ path: 'navigation.speedThroughWater', value: 3.2 }]);
    await new Promise(resolve => setTimeout(resolve, 25));
    deliver([{ path: 'navigation.speedThroughWater', value: 3.3 }]);
    await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(calls, 0, 'deltas must keep re-arming the idle timer');
    await new Promise(resolve => setTimeout(resolve, 40));
    assert.equal(calls, 1);
  });

  it('fires smoother onIdle after deltas stop arriving', async () => {
    const { app, deliver } = createAppShim();
    let calls = 0;
    const smoother = createSmoothedHandler({
      app,
      pluginId: 'plugin',
      id: 'speed',
      path: 'navigation.speedThroughWater',
      idlePeriod: 40,
      onIdle: () => { calls += 1; }
    });
    smoother.subscribe();
    deliver([{ path: 'navigation.speedThroughWater', value: 3.2 }]);
    await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(calls, 0);
    await new Promise(resolve => setTimeout(resolve, 40));
    assert.equal(calls, 1);
  });

  it('fires polar onIdle after deltas stop arriving', async () => {
    const { app, deliver } = createAppShim();
    let calls = 0;
    const polar = new Polar(app, 'plugin', 'wind');
    polar.configureMagnitude('environment.wind.speedTrue');
    polar.configureAngle('environment.wind.angleTrueWater');
    polar.idlePeriod = 40;
    polar.onIdle = () => { calls += 1; };
    polar.subscribe(true, true);
    deliver([
      { path: 'environment.wind.speedTrue', value: 5 },
      { path: 'environment.wind.angleTrueWater', value: 0.4 }
    ]);
    await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(calls, 0);
    await new Promise(resolve => setTimeout(resolve, 40));
    assert.equal(calls, 1);
  });

  it('fires polar smoother onIdle after deltas stop arriving', async () => {
    const { app, deliver } = createAppShim();
    let calls = 0;
    const smoother = createSmoothedPolar({
      app,
      pluginId: 'plugin',
      id: 'wind',
      pathMagnitude: 'environment.wind.speedTrue',
      pathAngle: 'environment.wind.angleTrueWater',
      idlePeriod: 40,
      onIdle: () => { calls += 1; }
    });
    smoother.subscribe(true, true);
    deliver([
      { path: 'environment.wind.speedTrue', value: 5 },
      { path: 'environment.wind.angleTrueWater', value: 0.4 }
    ]);
    await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(calls, 0);
    await new Promise(resolve => setTimeout(resolve, 40));
    assert.equal(calls, 1);
  });

  it('fires handler onStale once between deltas', async () => {
    const { app, deliver } = createAppShim();
    let calls = 0;
    const handler = new MessageHandler(app, 'plugin', 'test');
    handler.configure('navigation.speedThroughWater');
    handler.stalePeriod = 10;
    handler.onStale = () => { calls += 1; };
    handler.subscribe();
    deliver([{ path: 'navigation.speedThroughWater', value: 3.2 }]);
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(calls, 1);
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(calls, 1);
    deliver([{ path: 'navigation.speedThroughWater', value: 3.4 }]);
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(calls, 2);
  });

  it('fires polar onDelta only when the polar becomes fresh', () => {
    const { app, deliver } = createAppShim();
    let calls = 0;
    const polar = new Polar(app, 'plugin', 'wind');
    polar.configureMagnitude('environment.wind.speedTrue');
    polar.configureAngle('environment.wind.angleTrueWater');
    polar.onDelta = () => { calls += 1; };
    polar.subscribe(true, true);
    deliver([{ path: 'environment.wind.speedTrue', value: 5 }]);
    assert.equal(calls, 0);
    deliver([{ path: 'environment.wind.angleTrueWater', value: 0.4 }]);
    assert.equal(calls, 1);
  });

  it('lets wrapper callbacks be configured before subscribe via factories', () => {
    const { app, deliver } = createAppShim();
    let deltaCalls = 0;
    const smoother = createSmoothedHandler({
      app,
      pluginId: 'plugin',
      id: 'speed',
      path: 'navigation.speedThroughWater',
      subscribe: true,
      onDelta: () => { deltaCalls += 1; }
    });
    deliver([{ path: 'navigation.speedThroughWater', value: 4.2 }]);
    assert.equal(deltaCalls, 1);
    const polar = createSmoothedPolar({
      app,
      pluginId: 'plugin',
      id: 'wind',
      pathMagnitude: 'environment.wind.speedTrue',
      pathAngle: 'environment.wind.angleTrueWater',
      subscribe: true,
      onDelta: () => { deltaCalls += 1; }
    });
    deliver([{ path: 'environment.wind.speedTrue', value: 6 }]);
    deliver([{ path: 'environment.wind.angleTrueWater', value: 0.5 }]);
    assert.equal(deltaCalls, 2);
    assert.ok(smoother.ready);
    assert.ok(polar.ready);
  });

  it('invalidates a smoother until its next source delta', () => {
    const { app, deliver } = createAppShim();
    const smoother = createSmoothedHandler({
      app,
      pluginId: 'plugin',
      id: 'leeway',
      path: 'navigation.leewayAngle',
      subscribe: true
    });

    deliver([{ path: 'navigation.leewayAngle', value: 0.1 }]);
    assert.equal(smoother.ready, true);
    assert.equal(smoother.value, 0.1);

    smoother.invalidate();
    assert.equal(smoother.ready, false);
    assert.equal(smoother.value, null);
    assert.equal(smoother.state.nSamples, 0);

    deliver([{ path: 'navigation.leewayAngle', value: -0.1 }]);
    assert.equal(smoother.ready, true);
    assert.equal(smoother.value, -0.1);
  });

  it('does not activate MessageSmoother lifecycle when subscribed path is empty', async () => {
    const { app } = createAppShim();
    let idleCalls = 0;
    let staleCalls = 0;
    const smoother = createSmoothedHandler({
      app,
      pluginId: 'plugin',
      id: 'emptySpeed',
      path: '',
      subscribe: true,
      idlePeriod: 10,
      stalePeriod: 10,
      onIdle: () => { idleCalls += 1; },
      onStale: () => { staleCalls += 1; }
    });
    await new Promise(resolve => setTimeout(resolve, 35));
    assert.equal(smoother.subscribed, false);
    assert.equal(smoother.state.subscribed, false);
    assert.equal(idleCalls, 0);
    assert.equal(staleCalls, 0);
  });

  it('does not activate PolarSmoother lifecycle when both subscribed paths are empty', async () => {
    const { app } = createAppShim();
    let idleCalls = 0;
    let staleCalls = 0;
    const smoother = createSmoothedPolar({
      app,
      pluginId: 'plugin',
      id: 'emptyWind',
      pathMagnitude: '',
      pathAngle: '',
      subscribe: true,
      idlePeriod: 10,
      stalePeriod: 10,
      onIdle: () => { idleCalls += 1; },
      onStale: () => { staleCalls += 1; }
    });
    await new Promise(resolve => setTimeout(resolve, 35));
    assert.equal(smoother.subscribed, false);
    assert.equal(smoother.state.subscribed, false);
    assert.equal(idleCalls, 0);
    assert.equal(staleCalls, 0);
  });
});

describe('boot-time bootstrap fallback (subscription race workaround)', () => {
  it('seeds the value from getSelfPath when no delta arrives at subscribe time', () => {
    const { app } = createAppShim({ getSelfPath: () => ({ href: '/resources/polars/abc' }) });
    let calls = 0;
    const handler = new MessageHandler(app, 'plugin', 'test');
    handler.configure('polars.activePolar');
    handler.onDelta = () => { calls += 1; };
    handler.subscribe();
    assert.equal(calls, 1);
    assert.deepEqual(handler.value, { href: '/resources/polars/abc' });
    assert.equal(handler.ready, true);
  });

  it('unwraps a full-data-model node with a value property', () => {
    const { app } = createAppShim({
      getSelfPath: () => ({ value: 0.95, $source: 'polar-management', timestamp: '2026-01-01T00:00:00Z' })
    });
    const handler = new MessageHandler(app, 'plugin', 'test');
    handler.configure('polars.performanceFactor');
    handler.subscribe();
    assert.equal(handler.value, 0.95);
  });

  it('does not overwrite a value already delivered by the live subscription', () => {
    const { app, deliver } = createAppShim({ getSelfPath: () => ({ href: '/resources/polars/stale' }) });
    const handler = new MessageHandler(app, 'plugin', 'test');
    handler.configure('polars.activePolar');
    // Simulate the subscription manager delivering the bootstrap snapshot
    // synchronously, before the getSelfPath fallback runs.
    const originalSubscribe = app.subscriptionmanager.subscribe;
    app.subscriptionmanager.subscribe = (msg, unsubscribes, errorCb, deltaCb) => {
      originalSubscribe(msg, unsubscribes, errorCb, deltaCb);
      deliver([{ path: 'polars.activePolar', value: { href: '/resources/polars/fresh' } }]);
    };
    handler.subscribe();
    assert.deepEqual(handler.value, { href: '/resources/polars/fresh' });
  });

  it('leaves value absent when getSelfPath has nothing to offer', () => {
    const { app } = createAppShim({ getSelfPath: () => undefined });
    const handler = new MessageHandler(app, 'plugin', 'test');
    handler.configure('polars.activePolar');
    handler.subscribe();
    assert.equal(handler.ready, false);
  });
});

describe('smoother object properties grow with partial deltas', () => {
  const attitudeMeta = {
    properties: {
      roll: { type: 'number', units: 'rad' },
      pitch: { type: 'number', units: 'rad' },
      yaw: { type: 'number', units: 'rad' }
    }
  };

  it('tracks a spec property that only appears in a later delta', () => {
    const { app, deliver } = createAppShim({ getMetadata: () => attitudeMeta });
    const smoother = createSmoothedHandler({
      app,
      pluginId: 'plugin',
      id: 'attitude',
      path: 'navigation.attitude',
      subscribe: true
    });
    deliver([{ path: 'navigation.attitude', value: { roll: 0.1 } }]);
    deliver([{ path: 'navigation.attitude', value: { roll: 0.2, pitch: 0.3 } }]);
    // pitch's smoother receives its first-ever sample here, so its estimate is exact
    // regardless of the exponential smoother's time-based weighting of roll.
    assert.equal(smoother.value.pitch, 0.3);
    assert.equal(typeof smoother.value.roll, 'number');
  });

  it('tracks a non-spec object property that only appears in a later delta', () => {
    const { app, deliver } = createAppShim();
    const smoother = createSmoothedHandler({
      app,
      pluginId: 'plugin',
      id: 'custom',
      path: 'custom.values',
      subscribe: true
    });
    deliver([{ path: 'custom.values', value: { a: 1 } }]);
    deliver([{ path: 'custom.values', value: { a: 2, b: 5 } }]);
    assert.equal(smoother.value.b, 5);
    assert.equal(typeof smoother.value.a, 'number');
  });
});