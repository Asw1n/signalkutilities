// Statistical smoothing and variance tracking for MessageHandler values, using Smoother classes

const { MovingAverageSmoother, ExponentialSmoother, KalmanSmoother } = require('./smoothers');

const INACTIVE = 'INACTIVE';
const ACTIVE = 'ACTIVE';

const ABSENT = 'ABSENT';
const FRESH = 'FRESH';
const STALE = 'STALE';

const DEFAULT_IDLE_PERIOD = 60000;
const DEFAULT_STALE_PERIOD = 4000;

function clearTimer(timer) {
  if (timer) clearTimeout(timer);
  return null;
}

class MessageSmoother {
  constructor(handler, SmootherClass = ExponentialSmoother, smootherOptions = {}, eventOptions = {}) {
    this.id = handler.id + '.smoothed';
    this.handler = handler;
    this.SmootherClass = SmootherClass;
    this.smootherOptions = smootherOptions;
    this.smoother = null;
    this.timestamp = null;
    this.n = 0;
    this._isObject = false;
    this._propertyKeys = null;
    this._lifecycle = handler.subscribed ? ACTIVE : INACTIVE;
    this._valueStatus = ABSENT;
    this._stale = false;
    this._idleTimer = null;
    this._staleTimer = null;
    this._idlePeriod = eventOptions.idlePeriod ?? DEFAULT_IDLE_PERIOD;
    this._stalePeriod = eventOptions.stalePeriod ?? this._derivedStalePeriod(smootherOptions);
    this._onDelta = eventOptions.onDelta ?? null;
    this._onIdle = eventOptions.onIdle ?? null;
    this._onStale = eventOptions.onStale ?? null;
    this._handleSourceDelta = () => { this.sample(); };
    this.handler.addDeltaListener(this._handleSourceDelta);
    if (this.handler.subscribed) {
      this._activateLifecycle();
    }
  }

  _ensureInactive(field) {
    if (this.subscribed) {
      throw new Error(`Cannot modify ${field} while subscription is ACTIVE for ${this.id}`);
    }
  }

  _clearEventTimers() {
    this._idleTimer = clearTimer(this._idleTimer);
    this._staleTimer = clearTimer(this._staleTimer);
  }

  // Re-armed on every delta, so firing always means idlePeriod of silence.
  _armIdleTimer() {
    this._idleTimer = clearTimer(this._idleTimer);
    if (this._lifecycle !== ACTIVE || typeof this._onIdle !== 'function' || !(this._idlePeriod > 0)) return;
    this._idleTimer = setTimeout(() => {
      this._idleTimer = null;
      if (this._lifecycle === ACTIVE && typeof this._onIdle === 'function') {
        this._onIdle();
      }
    }, this._idlePeriod);
  }

  _armStaleTimer() {
    this._staleTimer = clearTimer(this._staleTimer);
    if (this._lifecycle !== ACTIVE || typeof this._onStale !== 'function' || !(this._stalePeriod > 0)) return;
    this._staleTimer = setTimeout(() => {
      this._staleTimer = null;
      if (this._lifecycle !== ACTIVE || this._stale) return;
      this._stale = true;
      if (this._valueStatus !== ABSENT) this._valueStatus = STALE;
      if (typeof this._onStale === 'function') this._onStale();
    }, this._stalePeriod);
  }

  _activateLifecycle() {
    this._lifecycle = ACTIVE;
    this._valueStatus = ABSENT;
    this._stale = false;
    this.reset();
    this._armIdleTimer();
    this._armStaleTimer();
  }

  _deactivateLifecycle() {
    this._lifecycle = INACTIVE;
    this._clearEventTimers();
  }

  reset() {
    this.timestamp = null;
    this.n = 0;
    this._isObject = false;
    this._propertyKeys = null;
    this.smoother = null;

    const handlerValue = this.handler.value;
    if (typeof handlerValue === 'number') {
      this._isObject = false;
      this.smoother = new this.SmootherClass(this.smootherOptions);
    } else if (handlerValue && typeof handlerValue === 'object') {
      this._isObject = true;
      this._propertyKeys = Object.keys(handlerValue).filter(
        key => typeof handlerValue[key] === 'number'
      );
      this.smoother = {};
      for (const key of this._propertyKeys) {
        this.smoother[key] = new this.SmootherClass(this.smootherOptions);
      }
    }
  }

  invalidate() {
    this.reset();
    this._valueStatus = ABSENT;
    this._stale = false;
    return this;
  }

  subscribe() {
    this.handler.subscribe();
    if (this.handler.subscribed) {
      this._activateLifecycle();
    } else {
      this._deactivateLifecycle();
    }
    return this;
  }

  unsubscribe() {
    this._deactivateLifecycle();
    return this.handler.unsubscribe();
  }

  terminate(clearCallback = true) {
    this._deactivateLifecycle();
    this.handler.removeDeltaListener(this._handleSourceDelta);
    if (clearCallback) {
      this._onDelta = null;
      this._onIdle = null;
      this._onStale = null;
    }
    return this.handler.terminate(clearCallback);
  }

  _derivedStalePeriod(opts) {
    const MIN_PERIOD = DEFAULT_STALE_PERIOD;
    if (typeof opts.timeConstant === 'number') return Math.max(opts.timeConstant * 3000, MIN_PERIOD);
    if (typeof opts.tau === 'number') return Math.max(opts.tau * 3000, MIN_PERIOD);
    if (typeof opts.timeSpan === 'number') return Math.max(opts.timeSpan * 3000, MIN_PERIOD);
    return DEFAULT_STALE_PERIOD;
  }

  get subscribed() {
    return this.handler.subscribed;
  }

  get onDelta() {
    return this._onDelta;
  }

  set onDelta(fn) {
    this._ensureInactive('onDelta');
    this._onDelta = fn;
  }

  get onChange() {
    return this.onDelta;
  }

  set onChange(fn) {
    this.onDelta = fn;
  }

  get onIdle() {
    return this._onIdle;
  }

  set onIdle(fn) {
    this._ensureInactive('onIdle');
    this._onIdle = fn;
  }

  get onStale() {
    return this._onStale;
  }

  set onStale(fn) {
    this._ensureInactive('onStale');
    this._onStale = fn;
  }

  get idlePeriod() {
    return this._idlePeriod;
  }

  set idlePeriod(ms) {
    this._ensureInactive('idlePeriod');
    this._idlePeriod = ms;
  }

  get stalePeriod() {
    return this._stalePeriod;
  }

  set stalePeriod(ms) {
    this._ensureInactive('stalePeriod');
    this._stalePeriod = ms;
  }

  sample() {
    if (!this.handler.ready) return this;
    if (this._stale || this.n === 0 || !this.smoother) {
      this.reset();
    }
    const now = Date.now();
    const handlerValue = this.handler.value;
    const handlerVariance = this.handler.variance;
    if (!this.smoother) {
      return this;
    }
    if (!this._isObject) {
      this.smoother.add(handlerValue, handlerVariance);
    } else if (handlerValue && typeof handlerValue === 'object') {
      for (const key of this._propertyKeys) {
        this.smoother[key].add(handlerValue[key]);
      }
    }
    this.timestamp = now;
    this.n++;
    this._valueStatus = FRESH;
    this._stale = false;
    this._armIdleTimer();
    this._armStaleTimer();
    if (typeof this._onDelta === 'function') {
      this._onDelta();
    }
    return this;
  }

  get value() {
    if (this._isObject && this.smoother) {
      const result = {};
      for (const key of this._propertyKeys) {
        result[key] = this.smoother[key].estimate;
      }
      return result;
    }
    return this.smoother ? this.smoother.estimate : undefined;
  }

  get variance() {
    if (this._isObject && this.smoother) {
      const result = {};
      for (const key of this._propertyKeys) {
        result[key] = this.smoother[key].variance;
      }
      return result;
    }
    return this.smoother ? this.smoother.variance : undefined;
  }

  get standardError() {
    if (this._isObject && this.smoother) {
      const result = {};
      for (const key of this._propertyKeys) {
        if (typeof this.smoother[key].standardError === 'function') {
          result[key] = this.smoother[key].standardError;
        }
      }
      return result;
    }
    return this.smoother ? this.smoother.standardError : undefined;
  }

  get stale() {
    return this._stale;
  }

  get ready() {
    return this._valueStatus !== ABSENT && !this.stale;
  }

  setSmootherOptions(opts) {
    this.smootherOptions = opts;
    if (!this.smoother) return;
    if (this._isObject) {
      for (const key of this._propertyKeys) {
        this.smoother[key].options = opts;
      }
    } else {
      this.smoother.options = opts;
    }
  }

  setSmootherClass(SmootherClass) {
    this.SmootherClass = SmootherClass;
    this.reset();
  }

  get meta() {
    const { idlePeriod: _childIdlePeriod, stalePeriod: _childStalePeriod, ...handlerMeta } = this.handler.meta;
    return {
      id: this.id,
      ...handlerMeta,
      idlePeriod: this.idlePeriod,
      stalePeriod: this.stalePeriod,
      smoother: { type: this.SmootherClass.name, ...this.smootherOptions }
    };
  }

  get state() {
    const lastDelta = this.timestamp;
    return {
      id: this.id,
      subscribed: this.subscribed,
      ready: this.ready,
      valueStatus: this._valueStatus,
      isStale: this.stale,
      hasDelta: this.n > 0,
      nSamples: this.n,
      lastDelta,
      deltaAge: lastDelta ? Date.now() - lastDelta : null,
      frequency: this.handler.frequency,
      handler: this.handler.state,
    };
  }

  report() {
    return {
      id: this.id,
      path: this.handler.path,
      value: this.value,
      variance: this.variance,
      state: this.state
    };
  }

  get frequency() {
    return this.handler.frequency;
  }
}

class MessageHandler {
  constructor(app, pluginId, id) {
    this._app = app;
    this._id = id;
    this._pluginId = pluginId;

    this._value = null;
    this._lifecycle = INACTIVE;
    this._valueStatus = ABSENT;
    this._stale = false;
    this.timestamp = null;
    this.frequency = null;
    this.freqAlpha = 0.2;
    this.n = 0;
    this._idlePeriod = DEFAULT_IDLE_PERIOD;
    this._stalePeriod = DEFAULT_STALE_PERIOD;
    this._idleTimer = null;
    this._staleTimer = null;
    this._onDelta = null;
    this._onIdle = null;
    this._onStale = null;
    this._path = '';
    this._unsubscribes = [];
    this._specMeta = null;
    this._metaCache = null;
    this._subscribeOptions = { excludeSelf: true };
    this._deltaListeners = new Set();
  }

  _ensureInactive(field) {
    if (this.subscribed) {
      throw new Error(`Cannot modify ${field} while subscription is ACTIVE for ${this.id}`);
    }
  }

  _clearEventTimers() {
    this._idleTimer = clearTimer(this._idleTimer);
    this._staleTimer = clearTimer(this._staleTimer);
  }

  // Re-armed on every delta, so firing always means idlePeriod of silence.
  _armIdleTimer() {
    this._idleTimer = clearTimer(this._idleTimer);
    if (this._lifecycle !== ACTIVE || typeof this._onIdle !== 'function' || !(this._idlePeriod > 0)) return;
    this._idleTimer = setTimeout(() => {
      this._idleTimer = null;
      if (this._lifecycle === ACTIVE && typeof this._onIdle === 'function') {
        this._app.debug(`No data for ${this.path}`);
        this._onIdle();
      }
    }, this._idlePeriod);
  }

  _armStaleTimer() {
    this._staleTimer = clearTimer(this._staleTimer);
    if (this._lifecycle !== ACTIVE || typeof this._onStale !== 'function' || !(this._stalePeriod > 0)) return;
    this._staleTimer = setTimeout(() => {
      this._staleTimer = null;
      if (this._lifecycle !== ACTIVE || this._stale) return;
      this._stale = true;
      if (this._valueStatus !== ABSENT) this._valueStatus = STALE;
      if (typeof this._onStale === 'function') {
        this._onStale();
      }
    }, this._stalePeriod);
  }

  _dispatchDelta() {
    for (const listener of this._deltaListeners) {
      listener();
    }
    if (typeof this._onDelta === 'function') {
      this._onDelta();
    }
  }

  addDeltaListener(fn) {
    if (typeof fn === 'function') this._deltaListeners.add(fn);
    return this;
  }

  removeDeltaListener(fn) {
    this._deltaListeners.delete(fn);
    return this;
  }

  get id() {
    return this._id;
  }

  get value() {
    return this._value;
  }

  set value(v) {
    this._value = v;
    this._valueStatus = FRESH;
    this._stale = false;
  }

  invalidate() {
    this._valueStatus = ABSENT;
    this._stale = false;
    return this;
  }

  get subscribed() {
    return this._lifecycle === ACTIVE;
  }

  set path(newPath) {
    this._ensureInactive('path');
    this._path = newPath;
    this._specMeta = null;
    this._metaCache = null;
    this._loadSpecMeta(newPath);
  }

  get path() {
    return this._path;
  }

  get onDelta() {
    return this._onDelta;
  }

  set onDelta(fn) {
    this._ensureInactive('onDelta');
    this._onDelta = fn;
  }

  get onChange() {
    return this.onDelta;
  }

  set onChange(fn) {
    this.onDelta = fn;
  }

  get onIdle() {
    return this._onIdle;
  }

  set onIdle(fn) {
    this._ensureInactive('onIdle');
    this._onIdle = fn;
  }

  get onStale() {
    return this._onStale;
  }

  set onStale(fn) {
    this._ensureInactive('onStale');
    this._onStale = fn;
  }

  get idlePeriod() {
    return this._idlePeriod;
  }

  set idlePeriod(ms) {
    this._ensureInactive('idlePeriod');
    this._idlePeriod = ms;
  }

  get stalePeriod() {
    return this._stalePeriod;
  }

  set stalePeriod(ms) {
    this._ensureInactive('stalePeriod');
    this._stalePeriod = ms;
  }

  configure(path, subscribeOptions = { excludeSelf: true }) {
    this._ensureInactive('configure');
    this._path = path;
    this._subscribeOptions = subscribeOptions;
    this._specMeta = null;
    this._metaCache = null;
    this._loadSpecMeta(path);
    return this;
  }

  unsubscribe() {
    this._clearEventTimers();
    this._unsubscribes.forEach(fn => fn());
    this._unsubscribes = [];
    this._lifecycle = INACTIVE;
  }

  terminate(clearCallback = true) {
    if (clearCallback) {
      this._onDelta = null;
      this._onIdle = null;
      this._onStale = null;
    }
    this.unsubscribe();
    return null;
  }

  static send(app, pluginId, messages) {
    const values = [];
    messages.forEach(delta => {
      if (delta.ready) {
        values.push({
          path: delta._path,
          value: delta.value
        });
      }
    });
    const message = {
      context: 'vessels.self',
      updates: [{
        $source: pluginId,
        values
      }]
    };
    if (values.length > 0) app.handleMessage(pluginId, message);
  }

  static clear(app, pluginId, handlers) {
    const values = handlers
      .map(h => (h.handler ? h.handler.path : h.path))
      .filter(path => path)
      .map(path => ({ path, value: null }));
    if (values.length > 0) app.handleMessage(pluginId, {
      context: 'vessels.self',
      updates: [{ $source: pluginId, values }]
    });
  }

  static sendMeta(app, pluginId, metaEntries) {
    const meta = metaEntries.map(entry => ({
      path: entry.path,
      value: entry.value ?? entry.meta
    }));
    const message = {
      context: 'vessels.self',
      updates: [{
        $source: pluginId,
        meta
      }]
    };
    app.handleMessage(pluginId, message);
  }

  static setMeta(app, pluginId, path, value) {
    return MessageHandler.sendMeta(app, pluginId, [{ path, value }]);
  }

  subscribe() {
    const path = this._path;
    const app = this._app;

    if (!path || path === '') {
      app.debug(`${this.id} is trying to subscribe to an empty path, subscription aborted`);
      return this;
    }

    app.debug(`Subscribing to ${path}`);
    this._valueStatus = ABSENT;
    this._stale = false;
    this.timestamp = null;
    this.frequency = null;
    this.n = 0;
    this._clearEventTimers();
    this._subscribeViaManager(path);
    this._lifecycle = ACTIVE;
    this._armIdleTimer();
    this._armStaleTimer();
    return this;
  }

  _subscribeViaManager(path) {
    const app = this._app;
    app.subscriptionmanager.subscribe(
      { context: 'vessels.self', ...this._subscribeOptions, subscribe: [{ path, policy: 'instant', minPeriod: 0 }] },
      this._unsubscribes,
      err => app.debug(`MessageHandler[${this.id}] subscription error: ${err}`),
      delta => {
        let found = false;
        delta?.updates?.forEach(update => {
          if (Array.isArray(update?.values)) {
            for (const entry of update.values) {
              if (path === entry.path) {
                this._value = entry.value;
                this._valueStatus = FRESH;
                this._stale = false;
                this.n++;
                this.updateFrequency();
                found = true;
              }
            }
          }
        });
        if (found) {
          this._armIdleTimer();
          this._armStaleTimer();
          this._dispatchDelta();
        }
      }
    );
  }

  get stale() {
    return this._stale;
  }

  _loadSpecMeta(path) {
    if (!path) return;
    const data = this._app.getMetadata?.('vessels.self.' + path);
    if (data && typeof data === 'object') {
      this._specMeta = data;
      this._metaCache = null;
    }
  }

  updateFrequency() {
    const now = Date.now();
    if (this.timestamp) {
      const dt = now - this.timestamp;
      const freq = dt > 0 ? 1000 / dt : 0;
      if (this.frequency === null) {
        this.frequency = freq;
      } else {
        this.frequency = (1 - this.freqAlpha) * this.frequency + this.freqAlpha * freq;
      }
    }
    this.timestamp = now;
  }

  get meta() {
    try {
      if (this._specMeta === null) this._loadSpecMeta(this._path);
      const skMeta = this._app.getSelfPath(this.path)?.meta ?? {};
      if (!this._metaCache) {
        const restMeta = this._specMeta ?? {};
        const merged = { ...restMeta };
        for (const [key, val] of Object.entries(skMeta)) {
          if (val && typeof val === 'object' && !Array.isArray(val) &&
              merged[key] && typeof merged[key] === 'object') {
            merged[key] = { ...merged[key], ...val };
          } else {
            merged[key] = val;
          }
        }
        this._metaCache = merged;
      }
      return {
        id: this.id,
        path: this.path,
        idlePeriod: this.idlePeriod,
        stalePeriod: this.stalePeriod,
        ...this._metaCache
      };
    } catch (e) {
      return {
        id: this.id,
        path: this.path,
        idlePeriod: this.idlePeriod,
        stalePeriod: this.stalePeriod,
        ...(this._specMeta ?? {})
      };
    }
  }

  get state() {
    const lastDelta = this.timestamp;
    return {
      id: this.id,
      subscribed: this.subscribed,
      lifecycle: this._lifecycle,
      valueStatus: this._valueStatus,
      pathKnown: this._specMeta !== null,
      hasDelta: this._valueStatus !== ABSENT,
      isStale: this.stale,
      lastDelta,
      deltaAge: lastDelta ? Date.now() - lastDelta : null,
      frequency: this.frequency,
      ready: this.ready,
    };
  }

  get ready() {
    return this._valueStatus !== ABSENT && !this.stale;
  }

  report() {
    return {
      id: this.id,
      path: this.path,
      value: this.value,
      state: this.state
    };
  }
}

function createSmoothedHandler({
  id,
  path,
  subscribe = false,
  app,
  pluginId,
  SmootherClass = ExponentialSmoother,
  smootherOptions = {},
  subscribeOptions = { excludeSelf: true },
  onDelta = null,
  onIdle = null,
  onStale = null,
  idlePeriod,
  stalePeriod,
}) {
  const handler = new MessageHandler(app, pluginId, id);
  handler.configure(path, subscribeOptions);
  const smoother = new MessageSmoother(handler, SmootherClass, smootherOptions, {
    onDelta,
    onIdle,
    onStale,
    idlePeriod,
    stalePeriod,
  });
  if (subscribe) {
    smoother.subscribe();
  }
  return smoother;
}

module.exports = { MessageHandler, MessageSmoother, createSmoothedHandler };


