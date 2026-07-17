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
      SI.js
    signalk/          # SK-aware classes
      MessageHandler.js
      Polar.js
      smoothers.js
    web/              # Reporter for Express handlers
      Reporter.js
    tests/            # unit tests (run with: npm test)
      Table2D.js
      smoothers.js
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
    "test": "node src/tests/Table2D.js && node src/tests/smoothers.js"
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
