const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { MessageHandler, createSmoothedHandler } = require('../signalk/MessageHandler');
const { Polar, createSmoothedPolar } = require('../signalk/Polar');

function createAppShim() {
  const subscribers = new Map();
  return {
    app: {
      debug: () => {},
      getMetadata: () => undefined,
      getSelfPath: () => undefined,
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