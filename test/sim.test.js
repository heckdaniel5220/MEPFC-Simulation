// Tests für den Simulationskern. Ausführen: node test/sim.test.js  (oder: npm test)
const assert = require('assert');
const { prepare, simulate } = require('../js/sim.js');
const { PRESETS, OFFERS } = require('../js/offers.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}

const base = prepare(PRESETS.futures);
const SEED = 20261015;

test('gleicher Seed liefert identisches Ergebnis', () => {
  const a = simulate(base, SEED), b = simulate(base, SEED);
  assert.strictEqual(a.netNo, b.netNo);
  assert.strictEqual(a.netHe, b.netHe);
});

test('ohne Gegentrade (0 %) sind beide Varianten identisch', () => {
  const R = simulate(prepare({ ...PRESETS.futures, hp: 0 }), SEED);
  assert.strictEqual(R.netHe, R.netNo);
  assert.strictEqual(R.realMin, 0);
});

test('ohne Edge verändert der Gegentrade das Ergebnis kaum (|Δ| < Fee pro Account)', () => {
  const P = prepare({ ...PRESETS.futures, n: 2000 });
  const R = simulate(P, SEED);
  const diff = (R.netHe - R.netNo) / P.n;
  assert.ok(Math.abs(diff) < P.fee, `Δ pro Account = ${diff.toFixed(1)} $`);
});

test('mit echtem Edge kostet der Gegentrade Geld', () => {
  const P = prepare({ ...PRESETS.edge, n: 2000 });
  const R = simulate(P, SEED);
  assert.ok(R.netHe < R.netNo, `mit ${R.netHe.toFixed(0)} vs ohne ${R.netNo.toFixed(0)}`);
});

test('Kontozahlen gehen auf (verloren + bestanden = n)', () => {
  const R = simulate(base, SEED);
  assert.strictEqual(R.fail + R.passNo + R.paid, base.n);
  assert.strictEqual(R.nFail + R.nSucc, base.n);
});

test('alle Angebote laufen ohne NaN', () => {
  for (const gr of OFFERS) for (const o of gr.items) {
    const P = prepare({ ...PRESETS.futures, ...o, target: o.target || 3000, target2: o.target2 || 0,
      risk: Math.max(10, Math.round(o.dd * 0.25 / 5) * 5), n: 100,
      hp: Math.min(30, Math.round(o.fee * 1.25 / o.dd * 200) / 2) });
    const R = simulate(P, SEED);
    assert.ok(Number.isFinite(R.netNo) && Number.isFinite(R.netHe), o.id);
  }
});

// ---- Alpha-Futures-Katalog (M-010a) ----
const AF = OFFERS.find(gr => gr.g.startsWith('Alpha Futures')).items;

test('Alpha Futures hat 13 Einträge', () => {
  assert.strictEqual(AF.length, 13);
});

test('Alpha-Futures-Einträge haben Quelle, Stand und Rohregeln', () => {
  for (const o of AF) {
    assert.ok(typeof o.src === 'string' && o.src.startsWith('https://help.alpha-futures.com/'), o.id);
    assert.strictEqual(o.asof, '2026-10-15', o.id);
    assert.ok(o.rules && typeof o.rules === 'object', o.id);
  }
});

test('Alpha-Futures-Kernfelder passen zu den Rohregeln', () => {
  for (const o of AF) {
    const r = o.rules;
    assert.strictEqual(o.dd, r.mll, o.id + ' dd');
    assert.strictEqual(o.cap, r.payoutMax, o.id + ' cap');
    if (o.mode === 'instant') assert.strictEqual(o.target, 0, o.id + ' target');
    else assert.strictEqual(o.target, r.target, o.id + ' target');
    assert.strictEqual(o.wfrac, 50, o.id + ' wfrac');
    assert.strictEqual(o.split, 90, o.id + ' split');
  }
});

test('Alpha Futures: Direct ist Instant, alle anderen 1-Step-Challenge', () => {
  for (const o of AF) {
    if (o.id.startsWith('af-direct-')) assert.strictEqual(o.mode, 'instant', o.id);
    else { assert.strictEqual(o.mode, 'challenge', o.id); assert.strictEqual(o.target2, 0, o.id); }
  }
});

test('alle Angebots-ids sind eindeutig', () => {
  const ids = OFFERS.flatMap(gr => gr.items.map(o => o.id));
  assert.strictEqual(new Set(ids).size, ids.length);
});

// ---- Lucid-Katalog (M-010b) ----
const LU = OFFERS.find(gr => gr.g.startsWith('Lucid')).items;

test('Lucid hat 16 Einträge, insgesamt 48 Angebote (36 − 4 + 16)', () => {
  assert.strictEqual(LU.length, 16);
  assert.strictEqual(OFFERS.reduce((s, gr) => s + gr.items.length, 0), 48);
});

test('Lucid-Einträge haben Quelle, Stand, Rohregeln und Code VAULT', () => {
  for (const o of LU) {
    assert.ok(typeof o.src === 'string' && o.src.startsWith('https://support.lucidtrading.com/'), o.id);
    assert.strictEqual(o.asof, '2026-10-15', o.id);
    assert.ok(o.rules && typeof o.rules === 'object', o.id);
    assert.strictEqual(o.code, 'VAULT', o.id);
  }
});

test('Lucid-Kernfelder passen zu den Rohregeln', () => {
  for (const o of LU) {
    assert.strictEqual(o.fee, o.rules.price, o.id + ' fee');
    assert.strictEqual(o.dd, o.rules.mll, o.id + ' dd');
    assert.strictEqual(o.split, 90, o.id + ' split');
    if (/^lu-(pro|daily)-/.test(o.id)) assert.strictEqual(o.buf, o.rules.mll + 100, o.id + ' buf');
  }
});

test('Lucid: Direct ist Instant, alle anderen 1-Step-Challenge', () => {
  for (const o of LU) {
    if (o.id.startsWith('lu-direct-')) { assert.strictEqual(o.mode, 'instant', o.id); assert.strictEqual(o.target, 0, o.id); }
    else { assert.strictEqual(o.mode, 'challenge', o.id); assert.strictEqual(o.target2, 0, o.id); }
  }
});

console.log(`\n${passed} Tests bestanden${process.exitCode ? ', mindestens einer fehlgeschlagen' : ''}.`);
