/* Tests für js/params.js (M-007a): node test/params.test.js */
const assert = require('assert');
const { prepare, simulate } = require('../js/sim.js');
const { PRESETS, OFFERS } = require('../js/offers.js');
const { autoParams, dllMin, UI_KEYS, CTRL_KEYS, CORE_KEYS } = require('../js/params.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}

const ALL = OFFERS.flatMap(gr => gr.items);
const byId = id => ALL.find(o => o.id === id);
// Strategie wie applyOffer sie übergibt (Standardwerte der Oberfläche)
const STRAT = { wr: 40, rr: 1.5, n: 500, tradesPerDay: 1, dllCompliant: true, consCompliant: true, riskPct: 25, costPct: 2, autorisk: true };
// Was die Oberfläche nach applyOffer in ihren Feldern hält
const uiOf = P => Object.fromEntries(UI_KEYS.filter(k => P[k] !== undefined).map(k => [k, P[k]]));
const FLAGS = ['riskCapped', 'notTradable', 'reason'];
const strip = P => { const c = { ...P }; FLAGS.forEach(k => delete c[k]); return c; };
const SEED = 20261015;

test('1. n ist numerisch (Account-Zahl statt Angebotsname)', () => {
  for (const o of ALL) {
    const P = autoParams(o, STRAT);
    assert.strictEqual(typeof o.n, 'string', o.id);
    assert.strictEqual(P.n, 500, o.id);
  }
});

test('2. dll- und cons-Felder kommen an', () => {
  const keys = ['dllEval', 'dllFunded', 'dllType', 'dllScaleFunded', 'dllScaleFrom', 'consEval', 'consFunded', 'consFundedMode'];
  for (const o of ALL) {
    const P = autoParams(o, STRAT), R = autoParams(o, uiOf(P));
    for (const k of keys) { assert.strictEqual(P[k], o[k], o.id + ' ' + k); assert.strictEqual(R[k], o[k], o.id + ' read ' + k); }
  }
  const lu = autoParams(byId('lu-pro-50'), STRAT);
  assert.ok(lu.dllFunded > 0 && lu.dllScaleFunded > 0 && lu.consFunded > 0);
});

test('M-004: Tage-Felder kommen über die generische Übernahme an (applyOffer und read)', () => {
  const keys = ['evalMinDays', 'evalWinDays', 'evalWinDayMin', 'payMinDays', 'payWinDays', 'payWinDayMin'];
  const withDays = ALL.filter(o => keys.some(k => o[k] > 0));
  assert.ok(withDays.length > 0);
  for (const o of ALL) {
    const P = autoParams(o, STRAT), R = autoParams(o, uiOf(P));
    for (const k of keys) { assert.strictEqual(P[k], o[k], o.id + ' ' + k); assert.strictEqual(R[k], o[k], o.id + ' read ' + k); }
    assert.ok(!('daysCompliant' in R), o.id);
  }
});

test('M-004: unerreichbare Gewinntag-Schwelle ergibt notTradable statt Absturz', () => {
  const o = { ...byId('af-zero-25'), evalWinDays: 2, evalWinDayMin: 200 };
  const P = autoParams(o, { ...STRAT, riskPct: 5 }); // 50 $ × 1,5 − 1 $ = 74 $ < 200 $
  assert.strictEqual(P.notTradable, true); assert.ok(/200 \$.*74 \$/.test(P.reason));
  assert.throws(() => prepare(P));
  const ok = autoParams(o, { ...STRAT, riskPct: 5, tradesPerDay: 3 }); // 3 × 74 $ = 222 $
  assert.ok(!ok.notTradable); prepare(ok);
});

test('3. Instant-Ziele sind 0', () => {
  const inst = ALL.filter(o => o.mode === 'instant');
  assert.ok(inst.length > 0);
  for (const o of inst) { const P = autoParams(o, STRAT); assert.strictEqual(P.target, 0, o.id); assert.strictEqual(P.target2, 0, o.id); }
});

test('4. maxRisk-Deckel', () => {
  const capped = ALL.filter(o => o.maxRisk && Math.max(10, Math.round(o.dd * 0.25 / 5) * 5) > o.maxRisk);
  assert.ok(capped.length > 0);
  for (const o of ALL.filter(o => o.maxRisk)) assert.ok(autoParams(o, STRAT).risk <= o.maxRisk, o.id);
  for (const o of capped) assert.strictEqual(autoParams(o, STRAT).risk, o.maxRisk, o.id);
});

test('5. DLL-Deckel und notTradable (konstruiertes Angebot)', () => {
  const o = { id: 'x', n: 'Test', mode: 'challenge', fee: 100, target: 3000, target2: 0, dd: 2000, buf: 100, minp: 500, wfrac: 100, cap: 2000, split: 90, maxp: 5,
    dllEval: 300, dllFunded: 400, dllType: 'soft', dllScaleFunded: 0, dllScaleFrom: 0 };
  const P = autoParams(o, STRAT); // 25 % von 2000 = 500 $ → gedeckelt unter 300 $
  assert.strictEqual(P.riskCapped, true);
  assert.strictEqual(P.risk, 290); assert.strictEqual(P.cost, 6);
  assert.ok(P.risk + P.cost < 300 && P.risk % 5 === 0);
  assert.ok(/290 \$.*300 \$/.test(P.reason));
  prepare(P);
  // ungedeckelt keine Flags
  const ok = autoParams(o, { ...STRAT, riskPct: 10 });
  assert.strictEqual(ok.risk, 200); assert.ok(!ok.riskCapped && !ok.notTradable);
  // Untergrenze 10 $ gilt ungedeckelt, der DLL-Deckel darf bis 5 $
  const tiny = autoParams({ ...o, dd: 20, dllEval: 7, dllFunded: 7 }, STRAT);
  assert.strictEqual(tiny.risk, 5); assert.strictEqual(tiny.riskCapped, true);
  // Auch 5 $ geht nicht
  const nt = autoParams({ ...o, dllEval: 6 }, STRAT);
  assert.strictEqual(nt.notTradable, true); assert.ok(!nt.riskCapped);
  assert.throws(() => prepare(nt));
  // Handrisiko wird nicht gedeckelt
  const hand = autoParams(o, { ...uiOf(P), risk: 500, cost: 10 });
  assert.strictEqual(hand.risk, 500); assert.strictEqual(hand.notTradable, true);
  assert.ok(/510 \$.*300 \$/.test(hand.reason));
  // Instant prüft nur dllFunded
  const inst = autoParams({ ...o, mode: 'instant', target: 0, dllEval: 0, dllFunded: 300 }, STRAT);
  assert.strictEqual(inst.risk, 290);
  // Scaling: kleinstes Funded-Limit = max(dllFunded, Anteil × Schwelle)
  assert.strictEqual(dllMin({ mode: 'instant', dllFunded: 100, dllScaleFunded: 0.6, dllScaleFrom: 1000 }), 100);
  assert.strictEqual(dllMin({ mode: 'instant', dllFunded: 0, dllScaleFunded: 0.6, dllScaleFrom: 1000 }), 600);
});

test('6. Preset-Pfad unverändert (ohne Angebot, Trades pro Tag 1)', () => {
  for (const k of Object.keys(PRESETS)) {
    const ui = { ...PRESETS[k], tradesPerDay: 1, dllCompliant: true, consCompliant: true, riskPct: 25, costPct: 2, autorisk: true };
    const P = autoParams(null, ui);
    CTRL_KEYS.forEach(c => assert.ok(!(c in P), k + ' ' + c));
    assert.deepStrictEqual(prepare(P), prepare(PRESETS[k]), k);
    assert.deepStrictEqual(simulate(prepare(P), SEED), simulate(prepare(PRESETS[k]), SEED), k);
  }
});

test('Standardwerte ergeben dieselben Kernwerte wie das bisherige applyOffer', () => {
  for (const o of ALL) {
    const P = autoParams(o, STRAT);
    let risk = Math.max(10, Math.round(o.dd * 0.25 / 5) * 5); if (o.maxRisk) risk = Math.min(risk, o.maxRisk);
    const old = { mode: o.mode, fee: o.fee, target: o.mode === 'instant' ? 0 : o.target, target2: o.mode === 'instant' ? 0 : (o.target2 || 0), dd: o.dd, ddStatic: !!o.ddStatic,
      buf: o.buf, minp: o.minp, wfrac: o.wfrac, cap: o.cap, split: o.split, maxp: o.maxp, risk, cost: Math.max(1, Math.round(risk * 0.02)), hfund: false,
      hp: Math.min(30, Math.round(o.fee * 1.25 / o.dd * 200) / 2) };
    for (const k in old) assert.strictEqual(P[k], old[k], o.id + ' ' + k);
    assert.ok(!P.riskCapped && !P.notTradable, o.id);
  }
});

test('Alle 115 Angebote × Risiko 5–100 % werfen nie, außer bei notTradable', () => {
  assert.strictEqual(ALL.length, 115);
  let capped = 0;
  for (const o of ALL) for (let rp = 5; rp <= 100; rp++) {
    const P = autoParams(o, { ...STRAT, riskPct: rp });
    if (P.riskCapped) capped++;
    if (P.notTradable) assert.throws(() => prepare(P), o.id + ' ' + rp);
    else prepare(P);
  }
  assert.ok(capped > 0);
});

test('UI-Rundreise: applyOffer → UI-Felder → read() ergibt dieselben P', () => {
  for (const o of ALL) for (const s of [STRAT, { ...STRAT, riskPct: 80, costPct: 5, tradesPerDay: 3, dllCompliant: false }]) {
    const P1 = autoParams(o, s), P2 = autoParams(o, uiOf(P1));
    if (P1.notTradable) continue;
    assert.deepStrictEqual(strip(P2), strip(P1), o.id);
    assert.ok(!P2.notTradable, o.id);
  }
});

test('Risiko-Häkchen aus: Risiko und Kosten kommen aus der Oberfläche', () => {
  const P = autoParams(byId('af-std-50'), { ...STRAT, autorisk: false, risk: 300, cost: 7 });
  assert.strictEqual(P.risk, 300); assert.strictEqual(P.cost, 7);
});

test('F2: Angebotsfelder außer den Kernfeldern überschneiden sich nicht mit UI- und Steuerfeldern', () => {
  const ui = new Set(UI_KEYS.concat(CTRL_KEYS));
  for (const o of ALL) for (const k of Object.keys(o)) {
    if (CORE_KEYS.includes(k)) continue;
    assert.ok(!ui.has(k), `${o.id}: Feld ${k} heißt wie ein UI-Feld`);
  }
});

console.log(`\n${passed} Tests bestanden${process.exitCode ? ', mindestens einer fehlgeschlagen' : ''}.`);
