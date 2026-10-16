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
    assert.strictEqual(o.fee, r.price, o.id + ' fee = Listenpreis');
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

test('Lucid hat 16 Einträge', () => {
  assert.strictEqual(LU.length, 16);
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
    assert.strictEqual(o.fee, o.rules.codePrice, o.id + ' fee = VAULT-Preis');
    assert.ok(o.fee < o.rules.price, o.id + ' VAULT unter Liste');
    assert.strictEqual(o.list, `${o.rules.price} $ einmalig`, o.id + ' list');
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

// ---- MyFundedFutures-Katalog (M-010c) ----
const MF = OFFERS.find(gr => gr.g.startsWith('MyFundedFutures')).items;

test('MFFU hat 11 Einträge', () => {
  assert.strictEqual(MF.length, 11);
  assert.deepStrictEqual(MF.map(o => o.id), ['mf-rapid-25', 'mf-rapid-50', 'mf-rapid-100', 'mf-rapid-150', 'mf-pro-50', 'mf-pro-100', 'mf-pro-150',
    'mf-builder-25', 'mf-builder-50', 'mf-builder-100', 'mf-builder-150']);
});

test('MFFU-Einträge haben Quelle, Stand, Rohregeln und Code CLUB', () => {
  for (const o of MF) {
    assert.ok(typeof o.src === 'string' && o.src.startsWith('https://help.myfundedfutures.com/'), o.id);
    assert.strictEqual(o.asof, '2026-10-15', o.id);
    assert.ok(o.rules && typeof o.rules === 'object', o.id);
    assert.strictEqual(o.code, 'CLUB', o.id);
  }
});

test('MFFU-Kernfelder passen zu den Rohregeln', () => {
  for (const o of MF) {
    assert.strictEqual(o.fee, o.rules.codePrice, o.id + ' fee = CLUB-Preis');
    assert.ok(o.fee < o.rules.price, o.id + ' CLUB unter Liste');
    assert.strictEqual(o.list, `${o.rules.price} $ einmalig`, o.id + ' list');
    assert.strictEqual(o.dd, o.rules.mll, o.id + ' dd');
    assert.strictEqual(o.buf, o.rules.mll + 100, o.id + ' buf');
    assert.strictEqual(o.wfrac, 100, o.id + ' wfrac');
    assert.strictEqual(o.split, o.id.startsWith('mf-rapid-') ? 90 : 80, o.id + ' split');
  }
});

test('MFFU: alle 1-Step-Challenge mit trailing Drawdown', () => {
  for (const o of MF) {
    assert.strictEqual(o.mode, 'challenge', o.id);
    assert.strictEqual(o.target2, 0, o.id);
    assert.ok(!o.ddStatic, o.id);
  }
});

test('MFFU-ids sind eindeutig', () => {
  assert.strictEqual(new Set(MF.map(o => o.id)).size, MF.length);
});

// ---- FundedNext-Futures-Katalog (M-010d) ----
const FN = OFFERS.find(gr => gr.g.startsWith('FundedNext')).items;

test('FundedNext hat 10 Einträge', () => {
  assert.strictEqual(FN.length, 10);
  assert.deepStrictEqual(FN.map(o => o.id), ['fn-flex-50', 'fn-flex-100', 'fn-flex-150', 'fn-rp-25', 'fn-rp-50', 'fn-rp-100',
    'fn-rd-25', 'fn-rd-50', 'fn-rd-100', 'fn-direct-50']);
});

test('FundedNext-Einträge haben Quelle, Stand, Rohregeln und Code', () => {
  for (const o of FN) {
    assert.ok(typeof o.src === 'string' && o.src.startsWith('https://helpfutures.fundednext.com/'), o.id);
    assert.strictEqual(o.asof, o.id.startsWith('fn-rd-') || o.id === 'fn-rp-50' ? '2026-10-16' : '2026-10-15', o.id);
    assert.ok(o.rules && typeof o.rules === 'object', o.id);
    assert.ok(['FNFLEX', 'RAPID', 'FNDIRECT'].includes(o.code), o.id);
  }
});

test('FundedNext-Kernfelder passen zu den Rohregeln', () => {
  for (const o of FN) {
    assert.strictEqual(o.fee, o.rules.codePrice, o.id + ' fee = Codepreis');
    assert.ok(o.fee < o.rules.price, o.id + ' Code unter Liste');
    assert.strictEqual(o.list, `${o.rules.price} $ einmalig`, o.id + ' list');
    assert.strictEqual(o.dd, o.rules.mll, o.id + ' dd');
    assert.strictEqual(o.cap, o.rules.payoutCap, o.id + ' cap');
    assert.strictEqual(o.split, o.id.startsWith('fn-flex-') ? 95 : 90, o.id + ' split');
    assert.ok(!o.ddStatic, o.id + ' trailing');
  }
});

test('FundedNext: Direct instant mit Ziel 0, sonst 1-Step-Challenge', () => {
  for (const o of FN) {
    if (o.id === 'fn-direct-50') { assert.strictEqual(o.mode, 'instant'); assert.strictEqual(o.target, 0); }
    else { assert.strictEqual(o.mode, 'challenge', o.id); assert.strictEqual(o.target2, 0, o.id); }
  }
});

test('FundedNext Rapid Daily: buf = MLL + 100, fee = Codepreis, split 90, DLL soft, keine Consistency', () => {
  const RD = FN.filter(o => o.id.startsWith('fn-rd-'));
  assert.strictEqual(RD.length, 3);
  for (const o of RD) {
    assert.strictEqual(o.buf, o.rules.mll + 100, o.id + ' buf');
    assert.strictEqual(o.buf, o.rules.buffer, o.id + ' buffer');
    assert.strictEqual(o.fee, o.rules.codePrice, o.id + ' fee');
    assert.strictEqual(o.split, 90, o.id + ' split');
    assert.strictEqual(o.code, 'RAPID', o.id + ' code');
    assert.strictEqual(o.rules.dlgType, 'soft', o.id + ' dlgType');
    assert.strictEqual(o.rules.consEval, null, o.id + ' consEval');
    assert.strictEqual(o.rules.consFunded, null, o.id + ' consFunded');
  }
  assert.strictEqual(FN.find(o => o.id === 'fn-rp-50').fee, 169.99, 'fn-rp-50 Preis 16.10.');
});

test('alle ids eindeutig, keine FundedNext-Legacy-ids mehr', () => {
  const ids = OFFERS.flatMap(gr => gr.items.map(o => o.id));
  assert.strictEqual(new Set(ids).size, ids.length);
  assert.ok(!ids.some(id => id.startsWith('fn-legacy-')), 'Legacy vorhanden');
});

// ---- Alpha-Capital-Katalog (M-010e) ----
const AC = OFFERS.find(gr => gr.g.startsWith('Alpha Capital')).items;

test('Alpha Capital hat 19 Einträge, insgesamt 69 Angebote (66 + 3 Rapid Daily)', () => {
  assert.strictEqual(AC.length, 19);
  assert.strictEqual(OFFERS.reduce((s, gr) => s + gr.items.length, 0), 69);
});

test('Alpha Capital: src, asof, rules, code und codeValidUntil je Eintrag', () => {
  for (const o of AC) {
    assert.ok(/^https:\/\/help\.alphacapitalgroup\.uk\//.test(o.src), o.id + ' src');
    assert.strictEqual(o.asof, '2026-10-16', o.id + ' asof');
    assert.ok(o.rules && typeof o.rules === 'object', o.id + ' rules');
    assert.ok(o.code, o.id + ' code');
    assert.strictEqual(o.rules.codeValidUntil, '2026-10-31', o.id + ' codeValidUntil');
  }
});

test('Alpha Capital: Konsistenz von fee, dd, buf, split, ddStatic', () => {
  for (const o of AC) {
    assert.strictEqual(o.fee, o.rules.codePrice, o.id + ' fee');
    assert.strictEqual(o.dd, o.rules.mll, o.id + ' dd');
    if (o.id.startsWith('ac-d-')) assert.strictEqual(o.buf, o.rules.size * 0.03, o.id + ' buf');
    assert.strictEqual(o.split, o.id.startsWith('ac-d-') ? 90 : 80, o.id + ' split');
    if (o.id.startsWith('ac-pro6-')) assert.strictEqual(o.ddStatic, true, o.id + ' ddStatic');
  }
});

test('Alpha Capital: Direct instant, One 1-Step, Pro 2-Step', () => {
  for (const o of AC) {
    if (o.id.startsWith('ac-d-')) { assert.strictEqual(o.mode, 'instant', o.id); assert.strictEqual(o.target, 0, o.id); }
    else if (o.id.startsWith('ac-one-')) { assert.strictEqual(o.mode, 'challenge', o.id); assert.strictEqual(o.target2, 0, o.id); }
    else { assert.ok(o.id.startsWith('ac-pro6-'), o.id); assert.strictEqual(o.mode, 'challenge', o.id); assert.ok(o.target2 > 0, o.id); }
  }
});

test('alle ids eindeutig, keine Pro-10-%-ids mehr', () => {
  const ids = OFFERS.flatMap(gr => gr.items.map(o => o.id));
  assert.strictEqual(new Set(ids).size, ids.length);
  assert.ok(!ids.some(id => id.startsWith('ac-pro10')), 'Pro 10 % vorhanden');
});

// ---- Handelstage (M-001) ----
const GOLD = { // Seed 20261015, n = 2000, Stand main 2219cb7
  futures: [91.790984, 79.688959, 0.2650, 0.1050],
  edge:    [497.459797, 420.200472, 0.4680, 0.2780],
  instant: [151.728500, 92.433500, 1.0000, 0.2035],
};
const kpi = (R, n) => [(R.netNo / n).toFixed(6), (R.netHe / n).toFixed(6), (R.passed / n).toFixed(4), (R.paid / n).toFixed(4)].map(Number);
// Ergebnis ohne die neuen Tagesfelder, für den Vergleich verschiedener tradesPerDay
const core = R => JSON.stringify({ ...R, days: 0, medianDaysToPass: 0,
  accts: R.accts.map(a => ({ ...a, phases: 0 })) });
// Deterministischer Trade: p = 1 (immer Gewinn) bzw. p = 0 (immer Verlust)
const det = (over) => prepare({ mode: 'challenge', fee: 100, target: 1000, target2: 0, dd: 2000, risk: 100, rr: 2, wr: 100,
  cost: 10, hp: 5, hfund: false, buf: 0, minp: 300, wfrac: 100, cap: 100000, split: 90, maxp: 3, n: 20, ...over });

test('M-001 Golden: tradesPerDay 1 und 3 ergeben exakt die Baseline', () => {
  for (const k of Object.keys(GOLD)) {
    const R1 = simulate(prepare({ ...PRESETS[k], n: 2000, tradesPerDay: 1 }), SEED);
    const R3 = simulate(prepare({ ...PRESETS[k], n: 2000, tradesPerDay: 3 }), SEED);
    assert.deepStrictEqual(kpi(R1, 2000), GOLD[k], k + ' tpd 1');
    assert.deepStrictEqual(kpi(R3, 2000), GOLD[k], k + ' tpd 3');
    assert.strictEqual(core(R3), core(R1), k + ' Gesamtergebnis bit-identisch');
    const R0 = simulate(prepare({ ...PRESETS[k], n: 2000 }), SEED);
    assert.strictEqual(core(R0), core(R1), k + ' Default = 1');
  }
});

test('M-001 Determinismus: gleicher Seed und gleiche P bei tradesPerDay 3', () => {
  const P = prepare({ ...PRESETS.edge, n: 500, tradesPerDay: 3 });
  assert.strictEqual(JSON.stringify(simulate(P, SEED)), JSON.stringify(simulate(P, SEED)));
});

test('M-001 Zähler: p = 1 → winDays = tradingDays, p = 0 → winDays = 0', () => {
  const W = simulate(det({ tradesPerDay: 2 }), SEED);
  for (const k of ['step1', 'funded']) {
    assert.ok(W.days[k].tradingDays > 0, k);
    assert.strictEqual(W.days[k].winDays, W.days[k].tradingDays, k);
  }
  const L = simulate(det({ wr: 0, tradesPerDay: 2 }), SEED);
  assert.ok(L.days.step1.tradingDays > 0);
  assert.strictEqual(L.days.step1.winDays, 0);
  assert.strictEqual(L.days.funded.n, 0);
  assert.strictEqual(L.days.funded.tradingDays, null);
});

test('M-001 Tages-P&L: dayPnl = Summe der Trades inkl. cost', () => {
  // Ziel unerreichbar: nur Step 1, Tage voll bis auf den letzten. Trades aus derselben Zufallsfolge nachrechnen.
  const { mulberry32 } = require('../js/sim.js');
  const tpd = 3, P = prepare({ ...PRESETS.futures, target: 1e9, n: 1, tradesPerDay: tpd });
  const a = simulate(P, SEED).accts[0], ph = a.phases.step1, r = mulberry32(SEED);
  const pnl = [];
  for (let t = 0; t < a.trades; t++) {
    if (t % tpd === 0) pnl.push(0);
    pnl[pnl.length - 1] += (r() < P.p ? P.risk * P.rr : -P.risk) - P.cost;
  }
  assert.deepStrictEqual(ph.dayPnl, pnl);
  assert.strictEqual(ph.days, Math.ceil(a.trades / tpd));
  // Deterministisch: p = 1, 2 Trades pro Tag, jeder Trade 190 $
  const b = simulate(det({ tradesPerDay: 2, target: 1e9, n: 1 }), SEED).accts[0];
  assert.ok(b.phases.step1.dayPnl.every(x => x === 380));
});

test('M-001 Phasenwechsel: Bestehen mitten am Tag, Rest-Trades verfallen', () => {
  // 190 $ je Trade, Ziel 950 $ → bestanden mit dem 5. Trade = Tag 2, Trade 2 von 3
  const P = det({ target: 950, tradesPerDay: 3, n: 1 });
  const a = simulate(P, SEED).accts[0], s1 = a.phases.step1, f = a.phases.funded;
  assert.deepStrictEqual([s1.days, s1.firstDay, s1.lastDay], [2, 1, 2]);
  assert.deepStrictEqual(s1.dayPnl, [570, 380]);
  assert.strictEqual(f.firstDay, s1.lastDay + 1);
  // Verfallene Trades ziehen keine Zahl und zählen nicht: gleiches Ergebnis wie tradesPerDay 1
  const a1 = simulate(det({ target: 950, tradesPerDay: 1, n: 1 }), SEED).accts[0];
  assert.strictEqual(a.trades, a1.trades);
  assert.strictEqual(a.pay, a1.pay);
  // Mit Zufall: ganze Folge bleibt identisch
  const Rn = simulate(prepare({ ...PRESETS.futures, n: 300, tradesPerDay: 4 }), SEED);
  const R1 = simulate(prepare({ ...PRESETS.futures, n: 300 }), SEED);
  assert.strictEqual(core(Rn), core(R1));
  for (const x of Rn.accts) if (x.phases.funded) assert.strictEqual(x.phases.funded.firstDay, x.phases.step1.lastDay + 1);
});

test('M-001 Auszahlung: neuer Tag danach, Funded-Zähler laufen weiter', () => {
  // 190 $ je Trade, minp 300 → Auszahlung nach 2 Trades, eq danach 0; maxp 3
  const a = simulate(det({ target: 190, tradesPerDay: 3, n: 1 }), SEED).accts[0], f = a.phases.funded;
  assert.strictEqual(a.nPay, 3);
  assert.deepStrictEqual([f.days, f.winDays, f.firstDay, f.lastDay], [3, 3, 2, 4]);
  assert.deepStrictEqual(f.dayPnl, [380, 380, 380]);
  // Instant: Funded zählt über alle Zyklen, step1/step2 gibt es nicht
  const R = simulate(prepare({ ...PRESETS.instant, n: 200, tradesPerDay: 3 }), SEED);
  for (const x of R.accts) {
    assert.strictEqual(x.phases.step1, null); assert.strictEqual(x.phases.step2, null);
    assert.strictEqual(x.phases.funded.firstDay, 1);
    assert.strictEqual(x.phases.funded.lastDay, x.phases.funded.days);
    assert.ok(x.phases.funded.days >= x.nPay);
  }
});

test('M-001 medianDaysToPass: 2-Step summiert, ohne Bestehen null', () => {
  // Step 1: 2 Trades (1 Tag), Step 2: 4 Trades (2 Tage) → 3 Tage
  const R = simulate(det({ target: 380, target2: 760, tradesPerDay: 3 }), SEED);
  assert.strictEqual(R.passed, 20);
  assert.strictEqual(R.days.step2.n, 20);
  assert.strictEqual(R.medianDaysToPass, 3);
  const a = R.accts[0];
  assert.deepStrictEqual([a.phases.step2.firstDay, a.phases.step2.lastDay, a.phases.funded.firstDay], [2, 3, 4]);
  assert.strictEqual(simulate(det({ wr: 0, tradesPerDay: 3 }), SEED).medianDaysToPass, null);
  assert.strictEqual(simulate(prepare({ ...PRESETS.instant, n: 50 }), SEED).medianDaysToPass, null);
});

test('M-001 Validierung: tradesPerDay 0, 1.5 und "2" werfen', () => {
  for (const v of [0, 1.5, '2', -1, NaN, null]) assert.throws(() => prepare({ ...PRESETS.futures, tradesPerDay: v }), String(v));
  assert.strictEqual(prepare({ ...PRESETS.futures }).tradesPerDay, 1);
  assert.strictEqual(prepare({ ...PRESETS.futures, tradesPerDay: 5 }).tradesPerDay, 5);
});

console.log(`\n${passed} Tests bestanden${process.exitCode ? ', mindestens einer fehlgeschlagen' : ''}.`);
