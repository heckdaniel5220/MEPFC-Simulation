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

// ---- Handelstage, Daily Loss Limit, Consistency ----
const noRules = { ...PRESETS.futures, dll: 0, cons: 0, consF: 0 };

test('ohne Tagesregeln ist das Ergebnis unabhängig von Trades pro Tag', () => {
  const a = simulate(prepare({ ...noRules, tpd: 1 }), SEED), b = simulate(prepare({ ...noRules, tpd: 7 }), SEED);
  assert.strictEqual(a.netNo, b.netNo);
  assert.strictEqual(a.netHe, b.netHe);
  assert.strictEqual(a.nPayTot, b.nPayTot);
  assert.ok(b.days < a.days, `Tage ${b.days} vs ${a.days}`);
});

test('bei 1 Trade pro Tag ist jeder Trade ein Handelstag', () => {
  const R = simulate(prepare({ ...noRules, tpd: 1, n: 12 }), SEED);
  for (const a of R.accts) assert.strictEqual(a.days, a.trades);
});

test('Tage halten das Limit Trades pro Tag ein', () => {
  const tpd = 4, R = simulate(prepare({ ...noRules, tpd, n: 12 }), SEED);
  for (const a of R.accts) assert.ok(a.days >= Math.ceil(a.trades / tpd) && a.days <= a.trades, `${a.days} Tage / ${a.trades} Trades`);
});

test('Daily Loss Limit über einem Tagesverlust hat keine Wirkung', () => {
  const tpd = 3, P = { ...noRules, tpd };
  const a = simulate(prepare(P), SEED);
  const b = simulate(prepare({ ...P, dll: tpd * (P.risk + P.cost) + 1, dllHard: true }), SEED);
  assert.strictEqual(b.netNo, a.netNo);
  assert.strictEqual(b.dllBreach, 0);
  assert.strictEqual(b.dllStops, 0);
});

test('weiches Daily Loss Limit beendet nur den Tag', () => {
  // dll = 1 Verlust-Trade: nach jedem Verlust ist der Tag vorbei
  const P = prepare({ ...noRules, tpd: 5, dll: 500, dllHard: false, n: 300 });
  const R = simulate(P, SEED);
  assert.ok(R.dllStops > 0);
  assert.strictEqual(R.dllBreach, 0);
  assert.strictEqual(R.fail + R.passNo + R.paid, P.n);
});

test('hartes Daily Loss Limit kostet Accounts', () => {
  const base = { ...noRules, tpd: 5, n: 1000 };
  const soft = simulate(prepare({ ...base, dll: 1000 }), SEED);
  const hard = simulate(prepare({ ...base, dll: 1000, dllHard: true }), SEED);
  assert.ok(hard.dllBreach > 0);
  assert.ok(hard.passed < soft.passed, `bestanden hart ${hard.passed} vs soft ${soft.passed}`);
  assert.ok(hard.accts.some(a => a.dllBreach));
});

test('hartes Daily Loss Limit unter einem Verlust-Trade: jeder Verlust beendet den Account', () => {
  const R = simulate(prepare({ ...noRules, dll: 100, dllHard: true, n: 12 }), SEED);
  // Drawdown braucht mehrere Verluste, also scheitert jede verlorene Challenge am Daily Loss
  for (const a of R.accts) if (!a.passed) assert.ok(a.dllBreach);
  assert.ok(R.passed < R.fail);
});

test('Challenge-Consistency greift, wenn der beste Tag zu groß ist', () => {
  // 3 Gewinne an einem Tag = 2.220 $ > 50 % von 3.000 $: dann muss weitergehandelt werden
  const P = prepare({ ...noRules, tpd: 3, cons: 50, maxp: 0, n: 1000 });
  const R = simulate(P, SEED);
  const free = simulate(prepare({ ...noRules, tpd: 3, maxp: 0, n: 1000 }), SEED);
  assert.ok(R.consWait > 0, 'Regel greift nie');
  assert.ok(R.passed <= free.passed, `mit Regel ${R.passed} vs ohne ${free.passed}`);
});

test('sehr strenge Consistency verhindert Bestehen', () => {
  // ein Gewinn-Trade (740 $) ist mehr als 1 % von allem, was in 500 Trades erreichbar ist
  const R = simulate(prepare({ ...noRules, tpd: 3, cons: 1 }), SEED);
  assert.strictEqual(R.passed, 0);
});

test('Funded-Consistency verzögert oder verhindert Auszahlungen', () => {
  const P = { ...PRESETS.instant, dll: 0, dllHard: false, n: 1000 };
  const free = simulate(prepare({ ...P, consF: 0 }), SEED);
  const strict = simulate(prepare({ ...P, consF: 15 }), SEED);
  assert.ok(strict.nPayTot < free.nPayTot, `Auszahlungen ${strict.nPayTot} vs ${free.nPayTot}`);
});

test('Gegentrade bleibt bei Tagesregeln konsistent (kein NaN, Konten gehen auf)', () => {
  const P = prepare({ ...PRESETS.afstd, n: 500 });
  const R = simulate(P, SEED);
  assert.ok(Number.isFinite(R.netHe));
  assert.strictEqual(R.nFail + R.nSucc, P.n);
  assert.ok(Math.abs(R.netHe - R.netNo - R.hedge) < 1e-6);
});

test('Angebote haben gültige Tagesregeln', () => {
  for (const gr of OFFERS) for (const o of gr.items) {
    if (o.dll !== undefined) assert.ok(o.dll > 0 && o.dll <= o.dd, `${o.id}: dll ${o.dll}`);
    for (const k of ['cons', 'consF']) if (o[k] !== undefined) assert.ok(o[k] > 0 && o[k] <= 100, `${o.id}: ${k}`);
    if (o.mode === 'instant') assert.ok(!o.cons, `${o.id}: Challenge-Consistency ohne Challenge`);
  }
});

console.log(`\n${passed} Tests bestanden${process.exitCode ? ', mindestens einer fehlgeschlagen' : ''}.`);
