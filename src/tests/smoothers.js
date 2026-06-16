/**
 * Test script for smoother classes.
 * Run with: node src/tests/smoothers.js
 */

const { BaseSmoother, MovingAverageSmoother, ExponentialSmoother, KalmanSmoother } = require('../../index');

// ─── Harness ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

function assertApprox(actual, expected, tolerance, message) {
  const diff = Math.abs(actual - expected);
  assert(diff <= tolerance, `${message} (expected ~${expected}, got ${typeof actual === 'number' ? actual.toFixed(6) : actual})`);
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

// ─── MovingAverageSmoother ────────────────────────────────────────────────────

section('MovingAverageSmoother – construction');
{
  const s = new MovingAverageSmoother({ timeSpan: 2 });
  assert(s.estimate === null, 'estimate is null before any sample');
  assert(s.variance === null, 'variance is null before any sample');
  assert(s.standardError === null, 'standardError is null before any sample');
  assert(s._head === 0, '_head starts at 0');
  assert(s._vals.length === 0, '_vals starts empty');
  assert(s._times.length === 0, '_times starts empty');
  assert(s._sum === 0, '_sum starts at 0');
  assert(s._sumSq === 0, '_sumSq starts at 0');
}

section('MovingAverageSmoother – single sample');
{
  const s = new MovingAverageSmoother({ timeSpan: 5 });
  s.add(7);
  assert(s.estimate === 7, 'single sample: estimate equals the value');
  assert(s.variance === 0, 'single sample: variance is 0');
  assert(s._vals.length === 1, 'single sample: one entry in _vals');
  assert(s._times.length === 1, 'single sample: one entry in _times');
}

section('MovingAverageSmoother – mean of multiple samples');
{
  const s = new MovingAverageSmoother({ timeSpan: 60 });
  [2, 4, 6, 8, 10].forEach(v => s.add(v));
  assertApprox(s.estimate, 6, 0.001, 'mean of [2,4,6,8,10] is 6');
  assert(s._vals.length - s._head === 5, '5 live samples in window');
}

section('MovingAverageSmoother – variance of constant signal');
{
  const s = new MovingAverageSmoother({ timeSpan: 60 });
  [7, 7, 7, 7].forEach(v => s.add(v));
  assertApprox(s.variance, 0, 1e-10, 'variance is 0 for constant signal');
  assert(s.standardError === 0, 'standardError is 0 for constant signal');
}

section('MovingAverageSmoother – variance of spread signal');
{
  const s = new MovingAverageSmoother({ timeSpan: 60 });
  [0, 10].forEach(v => s.add(v));
  // mean=5, population variance = ((0-5)² + (10-5)²)/2 = 25
  assertApprox(s.variance, 25, 0.001, 'population variance of [0,10] is 25');
}

section('MovingAverageSmoother – old samples expire');
{
  const s = new MovingAverageSmoother({ timeSpan: 0.05 }); // 50 ms window
  s.add(100);
  // Backdate the first entry so it falls outside the window
  s._times[0] -= 100;
  s.add(5); // triggers _evict
  const n = s._vals.length - s._head;
  assert(n === 1, 'expired sample is evicted (1 live sample remains)');
  assertApprox(s.estimate, 5, 0.001, 'estimate reflects only the fresh sample after expiry');
}

section('MovingAverageSmoother – running sums stay consistent after expiry');
{
  const s = new MovingAverageSmoother({ timeSpan: 0.05 });
  s.add(10);
  s.add(20);
  // Expire the first entry
  s._times[0] -= 100;
  s.add(30); // evicts 10, adds 30 → live window: [20, 30]
  const n = s._vals.length - s._head;
  assert(n === 2, '2 live samples after expiry');
  assertApprox(s.estimate, 25, 0.001, 'mean of [20,30] is 25 after first entry evicted');
  // Verify running sums match recomputed values
  const liveVals = s._vals.slice(s._head);
  const recomputedSum = liveVals.reduce((a, b) => a + b, 0);
  assertApprox(s._sum, recomputedSum, 1e-10, '_sum matches recomputed sum after eviction');
}

section('MovingAverageSmoother – array compaction at _head >= 128');
{
  const s = new MovingAverageSmoother({ timeSpan: 0.001 }); // 1 ms window → entries expire quickly
  // Fill 130 entries, all with timestamps old enough to expire on the next add
  for (let i = 0; i < 130; i++) {
    s._vals.push(i);
    s._times.push(Date.now() - 5000); // already expired
    s._sum += i;
    s._sumSq += i * i;
  }
  s.add(99); // _evict runs, evicts all 130 stale entries → _head reaches 130 ≥ 128 → compaction
  assert(s._head === 0, '_head reset to 0 after compaction');
  assert(s._vals.length === 1, '_vals contains only the new entry after compaction');
  assert(s._times.length === 1, '_times contains only the new entry after compaction');
  assert(s.estimate === 99, 'estimate is the single live sample after compaction');
}

section('MovingAverageSmoother – standardError decreases as n grows');
{
  const s = new MovingAverageSmoother({ timeSpan: 60 });
  [5, 5, 5, 5].forEach(v => s.add(v));
  // stdError = sqrt(variance / n) = 0 for constant, but with spread:
  const s2 = new MovingAverageSmoother({ timeSpan: 60 });
  [0, 10].forEach(v => s2.add(v));
  const se2 = s2.standardError; // sqrt(25/2) ≈ 3.535
  s2.add(5); s2.add(5);
  const se4 = s2.standardError; // variance lower, n higher → se should drop
  assert(se4 < se2, 'standardError decreases as more samples are added');
}

section('MovingAverageSmoother – reset clears all state');
{
  const s = new MovingAverageSmoother({ timeSpan: 5 });
  s.add(3);
  s.add(6);
  s.reset();
  assert(s.estimate === null, 'estimate is null after reset');
  assert(s.variance === null, 'variance is null after reset');
  assert(s._vals.length === 0, '_vals is empty after reset');
  assert(s._times.length === 0, '_times is empty after reset');
  assert(s._head === 0, '_head is 0 after reset');
  assert(s._sum === 0, '_sum is 0 after reset');
  assert(s._sumSq === 0, '_sumSq is 0 after reset');
}

section('MovingAverageSmoother – options setter updates timeSpan and resets');
{
  const s = new MovingAverageSmoother({ timeSpan: 1 });
  s.add(42);
  s.options = { timeSpan: 10 };
  assert(s._timeSpan === 10, 'timeSpan updated after options setter');
  assert(s.estimate === null, 'estimate cleared after options setter');
  assert(s._vals.length === 0, '_vals cleared after options setter');
}

section('MovingAverageSmoother – no _window property (old API gone)');
{
  const s = new MovingAverageSmoother({ timeSpan: 5 });
  s.add(1);
  assert(!('_window' in s), '_window property no longer exists');
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n=== Summary: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
