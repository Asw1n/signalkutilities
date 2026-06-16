---
applyTo: "**"
---

# signalkutilities Library – Agent Instructions

Standards and best practices for developing, testing, versioning, and publishing the **signalkutilities** npm library. This is a utility library consumed by Signal K plugins — it is **not** itself a Signal K plugin. Follow these guidelines when creating or modifying any code in this repository.

---

## 1. Architecture Principles

### This is a library, not a plugin
`signalkutilities` is a plain npm library required by Signal K plugins. It has no plugin entry point, no `schema()`, no `start()`/`stop()` lifecycle, and is never listed in the Signal K AppStore. Changes here only take effect when consuming plugins update their dependency.

### Layer responsibilities

| Layer | Location | Responsibility |
|---|---|---|
| General utilities | `src/general/` | Pure maths/data structures — zero Signal K dependency |
| Signal K wrappers | `src/signalk/` | Classes that take `(app, pluginId)` and interact with `app.subscriptionmanager` or `app.handleMessage` |
| Web helpers | `src/web/` | Aggregation helpers for Express route handlers in consuming plugins |
| Public entry | `index.js` | Re-exports everything; the only file consumers import |

### Design rules
- **No side effects on require.** Nothing in the library subscribes, starts timers, or emits deltas at module load time. All side effects are triggered by explicit method calls (`subscribe()`, `configure()`, etc.).
- **Consumers own the lifecycle.** A plugin calls `terminate()` in its `stop()` function. The library must not hold references that prevent garbage collection after `terminate()`.
- **General code stays general.** `src/general/` must have zero Signal K imports. It may be used independently of a Signal K server.
- **Hot paths stay synchronous.** Callbacks driven by SK delta streams must not use async/await or blocking I/O.

---

## 2. Project Structure

```
signalkutilities/
  index.js            # public entry: re-exports everything
  package.json
  CHANGELOG.md
  README.md
  src/
    general/          # pure JS — no SK dependency
      Table2D.js
      PolarTable.js
      SI.js
    signalk/          # SK-aware classes
      MessageHandler.js
      Polar.js
      smoothers.js
    web/              # Reporter for Express handlers
      Reporter.js
    tests/            # unit tests (run with: npm test)
      Table2D.js
      PolarTable.js
  public/             # demo/test webapp (not published to npm)
```

`index.js` is the **only** public entry point. Consumers do `require('signalkutilities')`. Internal modules may require each other directly.

---

## 3. `package.json` Requirements

```json
{
  "name": "signalkutilities",
  "version": "x.y.z",
  "description": "Utilities for Signal K plugin development: ...",
  "main": "index.js",
  "files": [
    "index.js",
    "CHANGELOG.md",
    "src/general/**",
    "src/signalk/**",
    "src/web/**"
  ],
  "scripts": {
    "test": "node src/tests/Table2D.js && node src/tests/PolarTable.js"
  },
  "keywords": ["signalk", "signalk-plugin", "utilities", ...],
  "engines": { "node": ">=18" },
  "license": "ISC"
}
```

**Key rules:**
- `files` must list every path consumers need. `src/tests/` and `public/` are excluded from the published package.
- No `postinstall` scripts — consumers may install with `--ignore-scripts`.
- No `peerDependencies` on `@signalk/server-api`. The library uses the `app` object duck-typed at runtime; there is no compile-time SK dependency.
- `engines.node` must match the minimum supported by the oldest SK server version this library targets (currently `>=18`).
- Verify what gets published: `npm pack --dry-run`.

---

## 4. Public API Conventions

### Exports (`index.js`)
Every public class or factory is exported from `index.js`. Never ask consumers to require internal module paths like `signalkutilities/src/signalk/MessageHandler`.

### `id` convention
Every tracked object carries a camelCase `id`. Smoothers append `.smoothed`; Polar sub-handlers use `.magnitude` and `.angle` internally.

```
"boatSpeed"              ← MessageHandler id
"boatSpeed.smoothed"     ← MessageSmoother id
"apparentWind"           ← Polar / PolarSmoother id
"heading"                ← SmoothedAngle id
"heading.smoothed"       ← SmoothedAngle smoother id
```

### `meta / state / report()` pattern
Every public class exposes these three accessors:

| Accessor | When to use | Contents |
|---|---|---|
| `meta` | Read once on startup | Static info: `id`, `path`, `displayName`, `displayUnits`, smoother type, options |
| `state` | Poll at any frequency | Dynamic info: `id`, `stale`, `frequency` |
| `report()` | Snapshot for logging or API response | Combined: current value(s), variance, path, state |

New classes **must** implement all three. Do not add extra top-level properties to the snapshot objects; extend `meta`, `state`, or `report()` instead.

### SK interaction pattern
Classes that interact with the Signal K server accept `(app, pluginId)` as their first two constructor arguments. They use:
- `app.subscriptionmanager.subscribe()` — **not** `app.streambundle.getBus()` (deprecated)
- `app.handleMessage(pluginId, delta)` for emitting values back to SK

Never call `app.setPluginStatus()`, `app.setPluginError()`, or any other plugin-level API from the library. That is the consuming plugin's responsibility.

---

## 5. Subscribing and Emitting Deltas

These patterns are used inside `src/signalk/` classes.

### Subscribing

```javascript
// MessageHandler-style subscription
const subscription = {
  context: 'vessels.self',
  subscribe: [{ path: this.path, period: 1000 }]
}
app.subscriptionmanager.subscribe(
  subscription,
  this._unsubscribes,
  (err) => { /* log via a passed-in logger or silently ignore */ },
  (delta) => {
    delta.updates.forEach((u) => {
      u.values?.forEach(({ path, value }) => {
        if (Number.isFinite(value)) this._onValue(value)
      })
    })
  }
)
```

- Store unsubscribe functions in an instance array; clear them in `terminate()`.
- Use `excludeSelf: true` on any path that the consuming plugin may also write.

### Emitting

```javascript
// Static send helpers (e.g. PolarSmoother.send)
app.handleMessage(pluginId, {
  updates: [{
    values: [{ path: somePath, value: someValue }]
  }]
})
```

---

## 6. Error Handling

- **Hot paths** (delta callbacks, per-sample smoother calls): guard with `Number.isFinite()` and return silently on invalid input. Never throw; an uncaught throw inside a SK delta handler floods server logs.
- **Configuration**: throw a descriptive `Error` from `configure()` or the constructor if required arguments are missing or invalid — the consuming plugin's `start()` is the appropriate catch boundary.
- **`terminate()`**: must be idempotent and synchronous. Clear all timers and unsubscribe functions. Return value is ignored by callers.

```javascript
// Hot path guard
_onValue(value) {
  if (!Number.isFinite(value)) return
  // … proceed
}

// Configuration boundary
configure(path) {
  if (typeof path !== 'string' || !path) throw new Error('path must be a non-empty string')
  this.path = path
}
```

---

## 7. Performance Guidelines

- Delta callbacks are on the hot path — keep them **synchronous**. No async/await, no file I/O, no network calls.
- Smoother classes are called once per incoming delta. Avoid per-sample heap allocations; reuse internal arrays/objects.
- `Reporter.report()` / `Reporter.state()` / `Reporter.meta()` are polled by webapp endpoints. They should read pre-computed state, not recompute on every call.
- Angle arithmetic must use wraparound-safe operations (convert to unit vector, then back) — never average raw radian values across the 0/2π boundary.

---

## 8. WebApp (`public/`)

The `public/` directory contains a demo/development webapp. It is **not** published to npm (not listed in `files`). It is served by a consuming plugin's `registerWithRouter` during development.

- Use plain ES modules (`<script type="module">`) — no build step.
- Bundle all dependencies locally; do not load from CDN.
- Poll `Reporter`-backed endpoints at ≤1 Hz.
- The webapp is for testing and demonstration only; it is not part of the library's public API.

---

## 9. Testing

Tests live in `src/tests/` and are plain Node.js scripts (no test framework required). Run with:

```shell
npm test
# expands to: node src/tests/Table2D.js && node src/tests/PolarTable.js
```

### Rules
- Each test file is standalone and exits with code 0 on success, non-zero on failure.
- Use `assert` from Node.js built-ins (`require('assert/strict')`).
- Test pure functions from `src/general/` without any SK mock.
- SK-aware classes (`MessageHandler`, etc.) require an `app` mock. Keep mocks minimal — only implement the methods actually called.

```javascript
// Minimal app mock for subscription tests
const app = {
  subscriptionmanager: {
    subscribe: (sub, unsubs, errCb, deltaCb) => {
      unsubs.push(() => {}) // register a no-op unsubscribe
    }
  }
}
```

### What to test
- Correct interpolation and boundary behaviour for `Table2D` and `PolarTable`
- Smoother convergence and reset behaviour
- `meta`, `state`, and `report()` shape and required fields
- `terminate()` clears all subscriptions (unsubscribe array is empty after call)

---

## 10. Continuous Integration (GitHub Actions)

A standard npm library CI workflow is sufficient. No Signal K server integration is required.

```yaml
name: CI

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
      - run: npm ci
      - run: npm test
```

---

## 11. Releases and Versioning

Follow [Semantic Versioning](https://semver.org/):
- **patch** — bug fixes, no API changes
- **minor** — new exported classes or methods, backward-compatible
- **major** — breaking changes to any public API (constructor signatures, property names, `meta`/`state`/`report()` shape)

Breaking changes affect every plugin that depends on this library. Prefer additive changes and document removed/renamed APIs clearly in `CHANGELOG.md` with a migration note.

### Release workflow

```yaml
name: Release

on:
  push:
    tags:
      - '[0-9]+.[0-9]+.[0-9]+*'
      - 'v[0-9]+.[0-9]+.[0-9]+*'

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          registry-url: 'https://registry.npmjs.org'
      - run: npm ci
      - run: npm test
      - name: Publish to npm
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
        run: |
          tag="${GITHUB_REF#refs/tags/}"
          if [[ "$tag" == *beta* ]]; then
            npm publish --provenance --access public --tag beta
          else
            npm publish --provenance --access public
          fi
```

### Cutting a release

```shell
npm version patch    # or minor / major
git push && git push --tags
```

### Commit hygiene

Write commit messages that make sense in release notes, e.g.:
- `fix: correct angle wraparound in ExponentialSmoother`
- `feat: add SmoothedAngle class`
- `breaking: rename MessageHandler.terminate() parameter`

---

## 12. Dependabot

Create `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: '/'
    schedule:
      interval: weekly
    groups:
      minor-and-patch:
        update-types: [minor, patch]

  - package-ecosystem: github-actions
    directory: '/'
    schedule:
      interval: weekly
    groups:
      actions:
        update-types: [minor, patch]
```

---

## 13. Documentation

### `README.md` (required)

Must include:
- What the library provides (1–2 sentences)
- Installation (`npm install signalkutilities`)
- Node.js version requirement
- Per-class usage examples with all constructor arguments, key properties, and methods
- The `meta / state / report()` pattern explanation
- The `id` naming convention

### Code comments
- Comment **why**, not **what**
- Document non-obvious maths (Kalman filter tuning, vector-based angle averaging, polar interpolation)
- Do not add comments that just restate the code

---

## 14. Security

- **Do not** accept file paths from consumers and write to them without sanitisation
- **Do not** embed credentials or server-internal state in `meta`, `state`, or `report()` responses
- Validate all constructor and `configure()` arguments at the boundary — throw on invalid input rather than silently producing wrong results

---

## 15. Local Development Workflow

```shell
# Run tests
npm test

# Link into a consuming plugin for end-to-end testing
npm link
cd ../my-consuming-plugin
npm link signalkutilities

# After making changes, tests in the consuming plugin pick them up immediately
# (no rebuild needed — this is plain CommonJS)
```

---

## 16. Anti-patterns to Avoid

| Anti-pattern | Correct approach |
|---|---|
| Requiring internal paths (`require('signalkutilities/src/...')`) | Export everything from `index.js` |
| Side effects on `require` (subscriptions, timers) | Only side-effect on explicit method calls |
| Calling `app.setPluginStatus()` / `app.setPluginError()` | Leave plugin status to the consuming plugin |
| Using `app.streambundle.getBus()` | Use `app.subscriptionmanager.subscribe()` |
| Throwing inside a delta callback | Guard with `Number.isFinite()`, return silently |
| Averaging raw radian angles | Convert to unit vector, average x/y, convert back |
| Publishing `src/tests/` or `public/` to npm | List only `src/general/`, `src/signalk/`, `src/web/` in `files` |
| `peerDependencies` on `@signalk/server-api` | Accept `app` duck-typed; no compile-time SK dependency |
| Force-pushing or amending published tags | Cut a new patch version |

---

## References

- [Signal K Server API](https://signalk.org/signalk-server/master/api/)
- [Signal K Plugin Development Docs](https://signalk.org/signalk-server/master/docs/develop/plugins/)
- [Keep a Changelog](https://keepachangelog.com/)
- [Semantic Versioning](https://semver.org/)
- [npm Provenance](https://docs.npmjs.com/generating-provenance-statements)
