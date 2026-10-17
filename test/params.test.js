/* Tests für js/params.js (M-007a): node test/params.test.js */
const assert = require('assert');
const { prepare, simulate } = require('../js/sim.js');
const { PRESETS, OFFERS } = require('../js/offers.js');
const { autoParams, dllMin, stratFromUi, uiFromP, slipFromUi, slipFields, SLIP_KEYS, UI_KEYS, CTRL_KEYS, CORE_KEYS } = require('../js/params.js');
const Rank = require('../js/rank.js');

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

// ---- M-015b: Rangliste und Klick nutzen dieselbe Strategie (stratFromUi), die UI-Rundreise ist uiFromP ----
// UI-Werte, wie stratUi() in app.js sie liest (Strategie-Felder plus die Angebotsfelder, die nicht in die Strategie gehen)
const UI = { mode: 'challenge', hfund: false, ddStatic: false, fee: 100, target: 3000, target2: 0, dd: 2000, risk: 500, rr: 1.5, wr: 40, cost: 10, hp: 6.5,
  buf: 100, minp: 1500, wfrac: 50, cap: 2000, split: 90, maxp: 5, n: 500, tradesPerDay: 3, dllCompliant: true, consCompliant: true, daysCompliant: true,
  riskPct: 50, costPct: 2, autorisk: true };
const ALL_GROUPS = OFFERS;

test('M-015b: stratFromUi nimmt nur Strategie-Felder, n und Gegentrade aus opts', () => {
  const s = stratFromUi(UI, { n: 1000 });
  assert.deepStrictEqual(s, { wr: 40, rr: 1.5, tradesPerDay: 3, dllCompliant: true, consCompliant: true, daysCompliant: true, hfund: false,
    n: 1000, riskPct: 50, costPct: 2, autorisk: true });
  assert.strictEqual(stratFromUi(UI).n, 500);
  assert.strictEqual(stratFromUi(UI, { hedge: false }).hp, 0);
  assert.ok(!('hp' in stratFromUi(UI, { hedge: true })));
  const off = stratFromUi({ ...UI, autorisk: false });
  assert.strictEqual(off.autorisk, false); assert.strictEqual(off.risk, 500); assert.strictEqual(off.cost, 10);
  // Gegentrade aus: hp 0 für jedes Angebot, an: je Angebot kalibriert
  const o = byId('af-std-50');
  assert.strictEqual(autoParams(o, stratFromUi(UI, { hedge: false })).hp, 0);
  assert.strictEqual(autoParams(o, stratFromUi(UI)).hp, Math.min(30, Math.round(o.fee * 1.25 / o.dd * 200) / 2));
});

test('M-015b: Ranglisten-Zeile P = P nach Klick (applyOffer → UI → read), 5 Angebote, gleiche Kennzahlen', () => {
  // gedeckeltes Risiko (Risiko 50 %), Instant, monatliche Eval, CFD mit maxRisk, Code mit Datum
  const ids = ['af-zero-25', 'af-std-50', 'lu-direct-50', 'bg-cfd-instant-200', 'ac-pro6-50'];
  const groups = ALL_GROUPS.map(g => ({ g: g.g, items: g.items.filter(o => ids.includes(o.id)) })).filter(g => g.items.length);
  const deps = { simulate, prepare, autoParams };
  for (const hedge of [true, false]) {
    const strat = stratFromUi(UI, { n: 200, hedge });
    const rows = Rank.rankOffers(groups, { ...strat, seed: SEED }, deps);
    assert.strictEqual(rows.length, 5);
    assert.ok(rows.some(r => r.riskCapped), 'mindestens eine gedeckelte Zeile');
    for (const r of rows) {
      const o = byId(r.id);
      // Klick: applyOffer(o, strat) → apply(P) schreibt die UI → read() = autoParams(o, uiVals())
      const shown = autoParams(o, strat), clicked = autoParams(o, uiFromP(shown));
      assert.deepStrictEqual(strip(clicked), strip(r.P), r.id);
      assert.ok(!clicked.notTradable, r.id);
      const R = simulate(prepare(clicked), SEED);
      assert.strictEqual(R.netNo / clicked.n, r.net, r.id + ' net');
      assert.strictEqual(R.netHe / clicked.n, r.netHe, r.id + ' netHe');
      assert.strictEqual(R.paid / clicked.n, r.payout, r.id + ' payout');
      if (!hedge) assert.strictEqual(r.P.hp, 0, r.id);
    }
  }
});

test('M-015b: uiFromP rundet n und maxp wie die Oberfläche und setzt fehlende Schalter auf den Standard', () => {
  const u = uiFromP({ mode: 'instant', n: 100.4, maxp: 2.6, tradesPerDay: 2, fee: 145.13, target: 0, dd: 2000, risk: 1, rr: 1, wr: 50, cost: 1, hp: 0,
    buf: 0, minp: 1, wfrac: 100, cap: 1, split: 90 });
  assert.strictEqual(u.n, 100); assert.strictEqual(u.maxp, 3); assert.strictEqual(u.fee, 145.13); assert.strictEqual(u.target2, 0);
  assert.strictEqual(u.hfund, false); assert.strictEqual(u.ddStatic, false);
  assert.strictEqual(u.dllCompliant, true); assert.strictEqual(u.consCompliant, true); assert.strictEqual(u.daysCompliant, true);
  assert.strictEqual(uiFromP({ daysCompliant: false }).daysCompliant, false);
});

// ---- M-017b: Slippage in der Oberfläche (Felder → slipFromUi → P, P → slipFields → Felder) ----
const FIX10 = { slipMode: 'fixed', slipPct: 10, slipTailPct: 100, slipTailProb: 2, slipBuffer: 0 };
const DIST = (q, extra) => ({ slipMode: 'dist', slipPct: 5, slipTailPct: 100, slipTailProb: q, slipBuffer: 0, ...extra });
const hasSlip = o => SLIP_KEYS.some(k => k in o);

test('M-017b (a): „aus“ erzeugt keine Slip-Schlüssel (slipFromUi, stratFromUi, autoParams, uiFromP)', () => {
  const off = slipFromUi({ slipMode: 'none', slipPct: 7, slipTailPct: 50, slipTailProb: 3, slipBuffer: 20 });
  assert.deepStrictEqual(off, {});
  const u = { ...UI, ...off };
  assert.ok(!hasSlip(stratFromUi(u)));
  // auch ein ungekürztes 'none' mit Werten in ausgeblendeten Feldern bleibt ohne Wirkung
  const raw = { ...UI, slipMode: 'none', slipPct: 7, slipBuffer: 20 };
  assert.ok(!hasSlip(stratFromUi(raw)));
  assert.deepStrictEqual(stratFromUi(raw), stratFromUi(UI));
  for (const o of ALL) {
    const P = autoParams(o, stratFromUi(raw));
    assert.ok(!hasSlip(P), o.id);
    assert.ok(!hasSlip(autoParams(o, raw)), o.id);
    assert.ok(!hasSlip(uiFromP(P)), o.id);
  }
  for (const k of Object.keys(PRESETS)) assert.ok(!hasSlip(autoParams(null, { ...PRESETS[k], ...off })), k);
  // fest: ohne Tail-Schlüssel
  assert.deepStrictEqual(slipFromUi(FIX10), { slipMode: 'fixed', slipPct: 10, slipBuffer: 0 });
});

test('M-017b (b): Rundreise Felder → P → Felder exakt, Tail-Anteil 7 % und 14,1 %', () => {
  for (const q of [7, 14.1, 0.5, 2]) {
    const f = DIST(q, { slipPct: 2.5, slipTailPct: 150, slipBuffer: 3 });
    const P = autoParams(byId('af-std-50'), { ...STRAT, ...slipFromUi(f) });
    assert.strictEqual(P.slipTailProb, q / 100);
    assert.deepStrictEqual(slipFields(P), f, String(q));
    // zweiter Durchlauf (Klick auf eine Zeile → Felder → uiVals) bleibt gleich
    const u = uiFromP(P);
    assert.strictEqual(u.slipTailProb, q / 100);
    assert.deepStrictEqual(slipFields(autoParams(byId('af-std-50'), u)), f);
  }
  const fx = slipFields(autoParams(byId('af-std-50'), { ...STRAT, ...slipFromUi(FIX10) }));
  assert.deepStrictEqual(fx, FIX10); // Tail-Felder auf Standard
  assert.deepStrictEqual(slipFields({}), { slipMode: 'none', slipPct: 5, slipTailPct: 100, slipTailProb: 2, slipBuffer: 0 });
});

test('M-017b (c): Ranglisten-Zeile P = P nach Klick, mit „fest“ und mit Ausreißern', () => {
  const ids = ['af-zero-25', 'af-std-50', 'lu-direct-50', 'bg-cfd-instant-200', 'ac-pro6-50'];
  const groups = ALL_GROUPS.map(g => ({ g: g.g, items: g.items.filter(o => ids.includes(o.id)) })).filter(g => g.items.length);
  const deps = { simulate, prepare, autoParams };
  for (const f of [FIX10, DIST(7, { slipBuffer: 10 })]) {
    const strat = stratFromUi({ ...UI, ...slipFromUi(f) }, { n: 200, hedge: true });
    assert.strictEqual(strat.slipMode, f.slipMode);
    const rows = Rank.rankOffers(groups, { ...strat, seed: SEED }, deps);
    for (const r of rows) {
      assert.ok(!r.error, r.id + ' ' + r.error);
      if (r.notTradable) continue;
      const o = byId(r.id), shown = autoParams(o, strat), clicked = autoParams(o, uiFromP(shown));
      assert.deepStrictEqual(strip(clicked), strip(r.P), r.id);
      assert.deepStrictEqual(slipFields(clicked), slipFields(strat), r.id);
      const R = simulate(prepare(clicked), SEED);
      assert.strictEqual(R.netNo / clicked.n, r.net, r.id + ' net');
      assert.ok(R.slipPaid > 0, r.id);
    }
  }
});

test('M-017b (d): Puffer erreicht das Tageslimit → Auto-Risiko gedeckelt, Handrisiko notTradable', () => {
  const o = { id: 'x', n: 'Test', mode: 'challenge', fee: 100, target: 3000, target2: 0, dd: 2000, buf: 100, minp: 500, wfrac: 100, cap: 2000, split: 90, maxp: 5,
    dllEval: 600, dllFunded: 600, dllType: 'soft', dllScaleFunded: 0, dllScaleFrom: 0 };
  const slip = slipFromUi({ ...FIX10, slipBuffer: 20 });
  // ohne Puffer: 500 + 10 < 600, kein Deckel
  assert.ok(!autoParams(o, { ...STRAT, ...slipFromUi(FIX10) }).riskCapped);
  const P = autoParams(o, { ...STRAT, ...slip }); // 500 × 1,2 + 10 = 610 ≥ 600
  assert.strictEqual(P.riskCapped, true); assert.ok(!P.notTradable);
  assert.strictEqual(P.risk, 490); assert.strictEqual(P.cost, 10); // 490 × 1,2 + 10 = 598
  assert.ok(/Puffer 20 %.*598 \$.*600 \$/.test(P.reason), P.reason);
  prepare(P);
  const hand = autoParams(o, { ...STRAT, ...slip, autorisk: false, risk: 500, cost: 10 });
  assert.strictEqual(hand.notTradable, true); assert.strictEqual(hand.risk, 500);
  assert.ok(/Risiko mit Puffer \+ Kosten \(610 \$\) erreichen das Tageslimit \(600 \$\)\. Puffer oder Risiko senken\./.test(hand.reason), hand.reason);
  assert.throws(() => prepare(hand));
  // Rangliste: nicht handelbar mit Grund, kein Fehler
  const rows = Rank.rankOffers([{ g: 'Test', items: [o] }], { ...stratFromUi({ ...UI, ...slip, autorisk: false, risk: 500, cost: 10 }), seed: SEED }, { simulate, prepare, autoParams });
  assert.strictEqual(rows[0].notTradable, true); assert.strictEqual(rows[0].error, null); assert.ok(/Puffer/.test(rows[0].reason));
});

test('M-017b (e): Auto-Risiko 60 % mit Puffer 10 % über alle 115 Angebote ohne prepare-Ausnahme', () => {
  assert.strictEqual(ALL.length, 115);
  let capped = 0, nt = 0;
  for (const buf of [10, 20, 50]) for (const rp of [25, 60, 100]) for (const o of ALL) {
    const P = autoParams(o, { ...STRAT, riskPct: rp, ...slipFromUi({ ...FIX10, slipBuffer: buf }) });
    if (P.notTradable) { nt++; assert.throws(() => prepare(P), o.id); continue; }
    if (buf === 10 && rp === 60 && P.riskCapped) capped++;
    prepare(P);
  }
  assert.ok(capped > 0);
});

test('M-017b (f): Ausreißer-Anteil ≥ 100 % gibt eine deutsche Meldung, keine Kernmeldung', () => {
  for (const q of [100, 150]) {
    for (const o of [byId('af-std-50'), null]) {
      const P = autoParams(o, { ...(o ? STRAT : PRESETS.futures), ...slipFromUi(DIST(q)) });
      assert.strictEqual(P.notTradable, true);
      assert.ok(/Anteil der Ausreißer \(1[05]0 %\) muss unter 100 % der Verluste liegen\./.test(P.reason), P.reason);
      assert.ok(!/slipTailProb/.test(P.reason));
    }
  }
  assert.ok(!autoParams(byId('af-std-50'), { ...STRAT, ...slipFromUi(DIST(99.5)) }).notTradable);
});

test('M-017b: af-std-50 fest 10 % (WR 40 %, CRV 1,5, 1 Trade/Tag, Risiko 25 %, n 1.000): Rangliste = Hauptsimulation', () => {
  const o = byId('af-std-50'), groups = [{ g: 'Alpha Futures', items: [o] }], deps = { simulate, prepare, autoParams };
  const ui = { ...STRAT, n: 1000, daysCompliant: true };
  for (const [f, want] of [[FIX10, -15.13], [{ slipMode: 'none' }, 63.18]]) {
    const strat = stratFromUi({ ...ui, ...slipFromUi(f) }, { n: 1000, hedge: true });
    const row = Rank.rankOffers(groups, { ...strat, seed: SEED }, deps)[0];
    const R = simulate(prepare(autoParams(o, uiFromP(autoParams(o, strat)))), SEED);
    assert.strictEqual(R.netNo / 1000, row.net);
    assert.strictEqual(Math.round(row.net * 100) / 100, want);
  }
});

console.log(`\n${passed} Tests bestanden${process.exitCode ? ', mindestens einer fehlgeschlagen' : ''}.`);
