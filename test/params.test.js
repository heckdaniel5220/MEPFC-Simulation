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
  // M-019: maxRisk = shield, ein voller Stop mit Kosten bleibt darunter (größtes Vielfaches von 5 mit risk + cost < shield)
  for (const o of capped) {
    const P = autoParams(o, STRAT), c = r => Math.max(1, Math.round(r * 0.02));
    let r = Math.floor(o.maxRisk / 5) * 5; while (r + c(r) >= o.shield) r -= 5;
    assert.strictEqual(P.risk, r, o.id); assert.ok(P.risk + P.cost < o.shield, o.id);
  }
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
    // M-019: Angebote, bei denen risk + cost den Shield erreichen würde, werden gedeckelt (eigener Test)
    const sh = o.shield > 0 && risk + old.cost >= o.shield;
    for (const k in old) if (!(sh && (k === 'risk' || k === 'cost'))) assert.strictEqual(P[k], old[k], o.id + ' ' + k);
    assert.ok(!P.notTradable && !!P.riskCapped === sh, o.id);
  }
});

test('Alle 116 Angebote × Risiko 5–100 % werfen nie, außer bei notTradable', () => {
  assert.strictEqual(ALL.length, 116);
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

test('M-017b (e): Auto-Risiko 60 % mit Puffer 10 % über alle 116 Angebote ohne prepare-Ausnahme', () => {
  assert.strictEqual(ALL.length, 116);
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

// ---- M-019: Auto-Risiko unter Guardian Shield bzw. Max Risk, Handrisiko an der Grenze nicht handelbar ----
test('M-019 Deckel: risk × (1 + Puffer) + cost < shield für BG CFD und AC, Puffer 0/10/50 %, prepare wirft nie', () => {
  const SH = ALL.filter(o => o.shield > 0);
  assert.strictEqual(SH.length, 49);
  let capped = 0;
  for (const o of ALL) for (const buf of [0, 10, 50]) for (const slip of [{}, { slipMode: 'fixed', slipPct: 10, slipBuffer: buf }, { slipMode: 'dist', slipPct: 5, slipTailPct: 100, slipTailProb: 2, slipBuffer: buf }]) {
    const ui = { ...STRAT, ...slipFromUi({ slipMode: 'none', ...slip, slipTailProb: slip.slipTailProb ?? 2 }) };
    const P = autoParams(o, ui);
    if (P.notTradable) continue;
    prepare(P);
    if (o.shield > 0) {
      const b = P.slipBuffer > 0 ? P.slipBuffer : 0;
      assert.ok(P.risk * (1 + b / 100) + P.cost < o.shield, `${o.id} Puffer ${b}`);
      // größtmögliches Vielfaches von 5 (wie der DLL-Deckel)
      if (P.riskCapped && /Guardian Shield|Max Risk/.test(P.reason)) { capped++;
        const r = P.risk + 5, c = Math.max(1, Math.round(r * 0.02)); assert.ok(r * (1 + b / 100) + c >= o.shield, o.id); }
    }
  }
  assert.ok(capped > 0);
  const bg = autoParams(byId('bg-cfd-instant-100'), STRAT), ac = autoParams(byId('ac-d-50'), STRAT);
  assert.deepStrictEqual([bg.risk, bg.cost, bg.riskCapped], [975, 20, true]);
  assert.ok(bg.reason.includes('Guardian Shield (1000 $)'), bg.reason);
  assert.deepStrictEqual([ac.risk, ac.cost, ac.riskCapped], [485, 10, true]);
  assert.ok(ac.reason.includes('Max Risk (500 $)'), ac.reason);
  const bgB = autoParams(byId('bg-cfd-instant-100'), { ...STRAT, ...slipFromUi({ slipMode: 'fixed', slipPct: 10, slipBuffer: 10 }) });
  assert.strictEqual(bgB.risk, 890); assert.ok(bgB.reason.includes('Risiko mit Puffer 10 % + Kosten'), bgB.reason);
});

test('M-019 Handrisiko an der Grenze: notTradable mit Grund, knapp darunter handelbar', () => {
  const bg = byId('bg-cfd-instant-100'), ac = byId('ac-d-50');
  const P = autoParams(bg, { ...STRAT, autorisk: false, risk: 980, cost: 20 });
  assert.strictEqual(P.notTradable, true);
  assert.strictEqual(P.reason, 'Risiko + Kosten (1000 $) erreichen den Guardian Shield (1000 $). Jeder volle Stop wäre ein Bruch.');
  assert.ok(!autoParams(bg, { ...STRAT, autorisk: false, risk: 979, cost: 20 }).notTradable);
  const A = autoParams(ac, { ...STRAT, autorisk: false, risk: 495, cost: 5 });
  assert.strictEqual(A.reason, 'Risiko + Kosten (500 $) erreichen den Max Risk (500 $). Jeder volle Stop wäre ein Bruch.');
  const B = autoParams(bg, { ...STRAT, autorisk: false, risk: 900, cost: 20, ...slipFromUi({ slipMode: 'fixed', slipPct: 10, slipBuffer: 10 }) });
  assert.ok(B.notTradable && B.reason.startsWith('Risiko mit Puffer 10 % + Kosten (1010 $)'), B.reason);
  // ohne Shield unverändert
  assert.ok(!autoParams(byId('af-std-50'), { ...STRAT, autorisk: false, risk: 600, cost: 12 }).notTradable);
});

test('M-019 Shield-Felder sind keine UI- oder Steuerfelder', () => {
  for (const k of ['shield', 'shieldSplit', 'shieldStrikes']) { assert.ok(!UI_KEYS.includes(k) && !CTRL_KEYS.includes(k), k); }
});


// ---- M-023 Kontraktlimits: Instrument und Stop in Punkten ----
const P23 = require('../js/params.js');
const FUT = ALL.filter(o => o.rules && o.rules.maxMini);
const INS = { instrument: 'NQ', stopPts: 25 };

test('M-023 Instrument aus: keine neuen Schlüssel, P gleich wie ohne Feld (alle Angebote, WR 40/46, Trades/Tag 1/3)', () => {
  for (const o of ALL) for (const wr of [40, 46]) for (const tradesPerDay of [1, 3]) {
    const base = { ...STRAT, wr, tradesPerDay };
    const A = autoParams(o, base), B = autoParams(o, { ...base, instrument: 'none', stopPts: 25 });
    assert.deepStrictEqual(B, A, o.id);
    assert.ok(!('instrument' in B) && !('stopPts' in B), o.id);
    assert.deepStrictEqual(stratFromUi({ ...base, instrument: 'none', stopPts: 25 }), stratFromUi(base));
  }
});

test('M-023 Handrisiko über dem Limit: notTradable mit Grund (mf-pro-50, NQ 25 Pkt, 2.000 $)', () => {
  const o = byId('mf-pro-50');
  const P = autoParams(o, { ...STRAT, autorisk: false, risk: 2000, cost: 10, ...INS });
  assert.strictEqual(P.notTradable, true);
  assert.strictEqual(P.reason, '4 NQ bei 25 Punkten Stop, erlaubt sind 3 Mini. Risiko senken oder Stop vergrößern.');
  // genau am Limit handelbar (3 NQ × 25 Pkt × 20 $ = 1.500 $), cost zählt nicht mit
  const Q = autoParams(o, { ...STRAT, autorisk: false, risk: 1500, cost: 200, ...INS });
  assert.ok(!Q.notTradable, Q.reason);
  assert.strictEqual(Q.instrument, 'NQ'); assert.strictEqual(Q.stopPts, 25);
});

test('M-023 Auto-Risiko 50 % DD, NQ 10 Pkt: Deckel mit Grund, prepare wirft nie, Kontrakte im Limit', () => {
  let capped = 0;
  for (const o of ALL) for (const ins of ['NQ', 'MNQ', 'ES', 'MES']) for (const stopPts of [10, 25]) {
    const P = autoParams(o, { ...STRAT, riskPct: 50, instrument: ins, stopPts });
    if (P.notTradable) continue;
    assert.doesNotThrow(() => prepare({ ...P }), o.id);
    const L = P23.contractLimit(P);
    if (!L) { assert.ok(!(o.rules && o.rules.maxMini), o.id); continue; }
    assert.ok(P.risk <= L.max * stopPts * L.ins.pt + 1e-9, `${o.id} ${ins} ${P.risk}`);
    if (/Kontraktlimit/.test(P.reason || '')) { capped++; assert.strictEqual(P.riskCapped, true, o.id); }
  }
  assert.ok(capped > 0);
  const P = autoParams(byId('mf-pro-50'), { ...STRAT, riskPct: 50, instrument: 'NQ', stopPts: 10 });
  assert.strictEqual(P.risk, 600); assert.strictEqual(P.cost, 12); assert.strictEqual(P.riskCapped, true);
  assert.strictEqual(P.reason, 'Risiko auf 600 $ gedeckelt (statt 1000 $), damit 3 NQ bei 10 Punkten Stop im Kontraktlimit (3 Mini) bleiben.');
});

test('M-023 Micro und Mini liefern dieselbe Grenze (NQ/MNQ, ES/MES; Auto und Hand)', () => {
  for (const o of FUT) for (const [mini, micro] of [['NQ', 'MNQ'], ['ES', 'MES']]) for (const stopPts of [5, 10, 25]) {
    for (const u of [{ riskPct: 25 }, { riskPct: 50 }, { riskPct: 100 }, { autorisk: false, risk: 2000, cost: 10 }, { autorisk: false, risk: 500, cost: 10 }]) {
      const A = autoParams(o, { ...STRAT, ...u, instrument: mini, stopPts });
      const B = autoParams(o, { ...STRAT, ...u, instrument: micro, stopPts });
      assert.strictEqual(B.risk, A.risk, `${o.id} ${micro} ${stopPts}`);
      assert.strictEqual(!!B.notTradable, !!A.notTradable, `${o.id} ${micro} ${stopPts}`);
    }
    const Lm = P23.contractLimit({ rules: o.rules, instrument: mini, stopPts: 1 }), Lu = P23.contractLimit({ rules: o.rules, instrument: micro, stopPts: 1 });
    assert.strictEqual(Lm.max * Lm.ins.pt, Lu.max * Lu.ins.pt, o.id);
  }
});

test('M-023 ohne Angebotslimit keine Prüfung, Stop ≤ 0 nicht handelbar, Rundreise uiFromP/stratFromUi', () => {
  // Video-Szenario und CFD: keine maxMini → keine Prüfung, Instrument bleibt nur als Strategiefeld
  const V = autoParams(undefined, { ...PRESETS.whiteboard, ...INS });
  assert.ok(!V.notTradable);
  const C = autoParams(byId('ac-d-50'), { ...STRAT, autorisk: false, risk: 400, cost: 10, ...INS, stopPts: 0.01 });
  assert.ok(!C.notTradable, C.reason);
  const Z = autoParams(byId('af-std-50'), { ...STRAT, instrument: 'ES', stopPts: 0 });
  assert.strictEqual(Z.notTradable, true); assert.strictEqual(Z.reason, 'Stop in Punkten muss eine Zahl > 0 sein.');
  const s = stratFromUi({ ...STRAT, instrument: 'MES', stopPts: 12.5 });
  assert.strictEqual(s.instrument, 'MES'); assert.strictEqual(s.stopPts, 12.5);
  const P = autoParams(byId('af-std-50'), s), u = uiFromP(P);
  assert.strictEqual(u.instrument, 'MES'); assert.strictEqual(u.stopPts, 12.5);
  assert.ok(!('instrument' in uiFromP(autoParams(byId('af-std-50'), STRAT))));
});

console.log(`\n${passed} Tests bestanden${process.exitCode ? ', mindestens einer fehlgeschlagen' : ''}.`);
