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

test('MFFU hat 12 Einträge', () => {
  assert.strictEqual(MF.length, 12);
  assert.deepStrictEqual(MF.map(o => o.id), ['mf-rapid-25', 'mf-rapid-50', 'mf-rapid-100', 'mf-rapid-150', 'mf-rapid-eod-25', 'mf-pro-50', 'mf-pro-100', 'mf-pro-150',
    'mf-builder-25', 'mf-builder-50', 'mf-builder-100', 'mf-builder-150']);
});

test('MFFU-Einträge haben Quelle, Stand, Rohregeln und Code CLUB', () => {
  for (const o of MF) {
    assert.ok(typeof o.src === 'string' && o.src.startsWith('https://help.myfundedfutures.com/'), o.id);
    assert.strictEqual(o.asof, o.id === 'mf-rapid-eod-25' ? '2026-10-17' : '2026-10-15', o.id);
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

test('Alpha Capital hat 19 Einträge', () => {
  assert.strictEqual(AC.length, 19);
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

// ---- Blue-Guardian-Katalog (M-010g) ----
const BGC = OFFERS.find(gr => gr.g === 'Blue Guardian · CFD').items;
const BGF = OFFERS.find(gr => gr.g === 'Blue Guardian · Futures').items;

test('Blue Guardian hat 46 Einträge (30 CFD + 16 Futures), insgesamt 116 Angebote', () => {
  assert.strictEqual(BGC.length, 30);
  assert.strictEqual(BGF.length, 16);
  assert.strictEqual(OFFERS.reduce((s, gr) => s + gr.items.length, 0), 116);
  const plans = xs => [...new Set(xs.map(o => o.id.replace(/-[\d.]+$/, '')))];
  assert.deepStrictEqual(plans(BGC), ['bg-cfd-instant', 'bg-cfd-1step', 'bg-cfd-2step', 'bg-cfd-1step-nano', 'bg-cfd-2step-nano']);
  assert.deepStrictEqual(plans(BGF), ['bg-fut-std', 'bg-fut-express', 'bg-fut-reserve', 'bg-fut-direct']);
});

test('Blue Guardian: src, asof, rules, Code HALLOWEEN ohne Ablaufdatum, fee = Website-Preis', () => {
  for (const o of [...BGC, ...BGF]) {
    assert.ok(/^https:\/\/(help\.)?blueguardian\.com/.test(o.src), o.id + ' src');
    assert.strictEqual(o.asof, '2026-10-16', o.id + ' asof');
    assert.strictEqual(o.code, 'HALLOWEEN', o.id + ' code');
    assert.strictEqual(o.rules.codeValidUntil, null, o.id + ' codeValidUntil');
    assert.strictEqual(o.fee, o.rules.codePrice, o.id + ' fee');
    assert.ok(o.rules.codePrice < o.rules.price, o.id + ' Rabatt');
    assert.strictEqual(o.dd, o.rules.mll, o.id + ' dd');
    assert.strictEqual(o.wfrac, 100, o.id + ' wfrac');
    assert.strictEqual(o.maxp, 5, o.id + ' maxp');
  }
});

test('Blue Guardian CFD: DLL hart, split × 0,97, maxRisk = Guardian Shield, buf und ddStatic', () => {
  for (const o of BGC) {
    const r = o.rules, inst = o.id.startsWith('bg-cfd-instant-'), stat = /-2step(-nano)?-/.test(o.id);
    assert.strictEqual(o.dllType, 'hard', o.id + ' dllType');
    assert.strictEqual(o.dllFunded, r.dailyDd, o.id + ' dllFunded');
    assert.strictEqual(o.dllEval, inst ? 0 : r.dailyDd, o.id + ' dllEval');
    assert.strictEqual(o.split, Math.round(r.splitNominal * 0.97 * 100) / 100, o.id + ' split');
    assert.ok([77.6, 82.45].includes(o.split), o.id + ' split-Wert');
    assert.strictEqual(o.maxRisk, r.size * (inst ? 0.01 : 0.02), o.id + ' maxRisk');
    assert.strictEqual(!!o.ddStatic, stat, o.id + ' ddStatic');
    assert.strictEqual(o.buf, stat ? 0 : r.size * 0.01, o.id + ' buf');
    assert.strictEqual(o.mode, inst ? 'instant' : 'challenge', o.id + ' mode');
    if (/-2step/.test(o.id)) assert.ok(o.target2 > 0, o.id + ' target2'); else assert.strictEqual(o.target2, 0, o.id + ' target2');
  }
  const by = id => BGC.find(o => o.id === id);
  assert.strictEqual(by('bg-cfd-instant-100').consFunded, 20);
  assert.strictEqual(by('bg-cfd-instant-300').consFunded, 15);
  assert.strictEqual(by('bg-cfd-instant-200').cap, 10000);
  assert.strictEqual(by('bg-cfd-instant-100').minp, 500); // M-004: Gewinntage im Kern, minp = Mindestauszahlung (M-010h: Rise 500 $)
  assert.strictEqual(by('bg-cfd-1step-nano-100').consEval, 50);
  assert.strictEqual(by('bg-cfd-2step-nano-100').cap, 2000);
  assert.strictEqual(by('bg-cfd-2step-nano-100').consEval, 0);
});

test('Blue Guardian Futures: DLL soft, Consistency, buf, minp, cap je Plan', () => {
  for (const o of BGF) {
    const r = o.rules;
    assert.strictEqual(o.dllType, 'soft', o.id + ' dllType');
    assert.strictEqual(o.split, 90, o.id + ' split');
    assert.strictEqual(o.maxRisk, undefined, o.id + ' maxRisk');
    assert.ok(!o.ddStatic, o.id + ' ddStatic');
    if (o.id.startsWith('bg-fut-std-')) { assert.strictEqual(o.buf, o.dd + 100, o.id); assert.strictEqual(o.cap, r.payoutCap1, o.id); assert.strictEqual(o.consFunded, 40, o.id); }
    if (o.id.startsWith('bg-fut-express-')) { assert.strictEqual(o.buf, r.buffer, o.id); assert.strictEqual(o.cap, r.dailyPayoutMax, o.id); assert.strictEqual(o.dd, r.mllFunded, o.id); assert.strictEqual(o.consEval, 40, o.id); }
    if (o.id.startsWith('bg-fut-reserve-')) { assert.strictEqual(o.buf, 100, o.id); assert.strictEqual(o.minp, 100, o.id); assert.strictEqual(o.consEval, 40, o.id); }
    if (o.id.startsWith('bg-fut-direct-')) { assert.strictEqual(o.mode, 'instant', o.id); assert.strictEqual(o.target, 0, o.id); assert.strictEqual(o.minp, r.cycleTarget1, o.id); assert.strictEqual(o.consFunded, 20, o.id); }
    else assert.strictEqual(o.mode, 'challenge', o.id);
  }
});

test('alle ids eindeutig (mit Blue Guardian)', () => {
  const ids = OFFERS.flatMap(gr => gr.items.map(o => o.id));
  assert.strictEqual(new Set(ids).size, ids.length);
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
  accts: R.accts.map(a => ({ ...a, phases: 0, calDays: 0 })), list: (R.list || []).map(x => ({ ...x, days: 0, daysToFirstPay: 0, calDays: 0, calToFirstPay: 0 })) });
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

// ---- Daily Loss Limit (M-002) ----
// core() (M-001) nimmt days und phases aus, damit auch dllStops, dllBreaches und dayDll.
const ALL = OFFERS.flatMap(gr => gr.items);
const byId = id => ALL.find(o => o.id === id);
const DLL_KEYS = ['dllEval', 'dllFunded', 'dllType', 'dllScaleFunded', 'dllScaleFrom'];
// Angebot mit den Trading-Parametern des Presets futures, Auto-Risiko wie in js/app.js
const offerP = (o, over) => {
  let risk = Math.max(10, Math.round(o.dd * 0.25 / 5) * 5); if (o.maxRisk) risk = Math.min(risk, o.maxRisk);
  const f = PRESETS.futures;
  return prepare({ mode: o.mode, fee: o.fee, target: o.target || f.target, target2: o.target2 || 0, dd: o.dd, ddStatic: !!o.ddStatic,
    buf: o.buf, minp: o.minp, wfrac: o.wfrac, cap: o.cap, split: o.split, maxp: o.maxp,
    risk, rr: f.rr, wr: f.wr, cost: Math.max(1, Math.round(risk * 0.02)), hfund: false, n: f.n,
    hp: Math.min(30, Math.round(o.fee * 1.25 / o.dd * 200) / 2), ...over });
};
const withDll = o => Object.fromEntries(DLL_KEYS.map(k => [k, o[k]]));
const money = R => [R.passed, R.paid, R.netNo, R.netHe, R.real, R.realMin];
const VERGLEICH = ['mf-builder-50', 'lu-pro-50', 'af-zero-50', 'ac-one-50'];

test('M-002 Golden: ohne DLL exakt die Baseline (tradesPerDay 1 und 3)', () => {
  const zero = { dllEval: 0, dllFunded: 0, dllType: 'soft', dllScaleFunded: 0, dllScaleFrom: 0, dllCompliant: true };
  for (const k of Object.keys(GOLD)) for (const tpd of [1, 3]) {
    const R = simulate(prepare({ ...PRESETS[k], n: 2000, tradesPerDay: tpd }), SEED);
    const Z = simulate(prepare({ ...PRESETS[k], n: 2000, tradesPerDay: tpd, ...zero }), SEED);
    assert.deepStrictEqual(kpi(R, 2000), GOLD[k], k + ' tpd ' + tpd);
    assert.strictEqual(JSON.stringify(Z), JSON.stringify(R), k + ' explizit 0 = Default');
    for (const ph of ['step1', 'step2', 'funded']) if (R.days[ph].n) assert.deepStrictEqual([R.days[ph].dllStops, R.days[ph].dllBreaches], [0, 0]);
  }
});

test('M-002 Geld-Gleichheit: regeltreues DLL ändert keine Geld-Kennzahl', () => {
  for (const id of VERGLEICH) {
    const o = byId(id);
    const A = simulate(offerP(o, { tradesPerDay: 3 }), SEED), B = simulate(offerP(o, { tradesPerDay: 3, ...withDll(o) }), SEED);
    assert.deepStrictEqual(money(B), money(A), id);
    assert.strictEqual(core(B), core(A), id + ' Gesamtergebnis ohne Tagesfelder');
    assert.ok(B.days.step1.dllStops > 0, id + ' DLL greift');
  }
});

test('M-002 Regeltreue: kein Tages-P&L erreicht −dll', () => {
  let tage = 0;
  for (const o of ALL.filter(o => o.dllEval > 0 || o.dllFunded > 0)) for (const tpd of [3, 6]) for (const seed of [SEED, 7, 99]) {
    const R = simulate(offerP(o, { tradesPerDay: tpd, n: 12, ...withDll(o) }), seed);
    for (const a of R.accts) for (const k of ['step1', 'step2', 'funded']) {
      const ph = a.phases[k]; if (!ph) continue;
      ph.dayPnl.forEach((x, i) => { const lim = ph.dayDll[i]; if (lim > 0) { tage++; assert.ok(x > -lim, `${o.id} ${k} ${x} vs ${lim}`); } });
      if (k !== 'funded') assert.ok(ph.dayDll.every(l => l === o.dllEval), o.id);
      else if (!o.dllScaleFunded) assert.ok(ph.dayDll.every(l => l === o.dllFunded), o.id);
    }
  }
  assert.ok(tage > 10000, 'geprüfte Tage ' + tage);
});

test('M-002 Tagesstopp: Trade verweigert, Rest-Trades ziehen nichts, Folgetag normal', () => {
  // Immer Verlust 110 $: dll 250 erlaubt 2 Trades (−220), der 3. würde −330 erreichen → verweigert
  const a = simulate(det({ wr: 0, dllEval: 250, tradesPerDay: 3, n: 1 }), SEED).accts[0], s1 = a.phases.step1;
  assert.strictEqual(a.trades, 19); // DD 2000 bricht beim 19. Trade, wie ohne DLL
  assert.deepStrictEqual(s1.dayPnl, [...Array(9).fill(-220), -110]);
  assert.strictEqual(s1.dllStops, 9); // Tag 10 endet durch den Drawdown
  // Letzter Slot im Minus ist kein Stopp
  const b = simulate(det({ wr: 0, dllEval: 250, tradesPerDay: 2, n: 1 }), SEED).accts[0];
  assert.deepStrictEqual(b.phases.step1.dayPnl, [...Array(9).fill(-220), -110]);
  assert.strictEqual(b.phases.step1.dllStops, 0);
  // Genau −dll erreichen ist schon verboten: dll 220 erlaubt nur 1 Trade (−110 − 110 = −220)
  const e = simulate(det({ wr: 0, dllEval: 220, tradesPerDay: 3, n: 1 }), SEED).accts[0].phases.step1;
  assert.ok(e.dayPnl.every(x => x === -110)); assert.strictEqual(e.dllStops, e.days - 1);
  // Mit Zufall: Tage aus derselben Zufallsfolge nachrechnen, verweigerte Trades ziehen keine Zahl
  const { mulberry32 } = require('../js/sim.js');
  const tpd = 3, P = prepare({ ...PRESETS.futures, target: 1e9, n: 1, tradesPerDay: tpd, dllEval: 1100 });
  const x = simulate(P, SEED).accts[0], ph = x.phases.step1, r = mulberry32(SEED);
  const pnl = []; let stops = 0, t = 0;
  while (t < x.trades) {
    let d = 0;
    for (let k = 0; k < tpd && t < x.trades; k++) {
      if (d - (P.risk + P.cost) <= -1100) { stops++; break; }
      d += (r() < P.p ? P.risk * P.rr : -P.risk) - P.cost; t++;
    }
    pnl.push(d);
  }
  assert.deepStrictEqual(ph.dayPnl, pnl);
  assert.strictEqual(ph.dllStops, stops);
  assert.ok(stops > 0);
});

test('M-002 Eval und Funded getrennt', () => {
  const P = over => prepare({ ...PRESETS.futures, n: 300, tradesPerDay: 5, ...over });
  const E = simulate(P({ dllEval: 1100 }), SEED), F = simulate(P({ dllFunded: 1100 }), SEED);
  assert.ok(E.days.step1.dllStops > 0); assert.strictEqual(E.days.funded.dllStops, 0);
  assert.strictEqual(F.days.step1.dllStops, 0); assert.ok(F.days.funded.dllStops > 0);
  assert.ok(E.accts.some(a => a.phases.funded && a.phases.funded.dayPnl.some(x => x <= -1100)), 'Funded ohne Limit');
  assert.ok(E.accts.every(a => a.phases.step1.dayPnl.every(x => x > -1100)));
  // Instant: dllEval wird nicht geprüft und wirkt nicht
  const I = simulate(prepare({ ...PRESETS.instant, n: 100, tradesPerDay: 5, dllEval: 100 }), SEED);
  assert.strictEqual(I.days.funded.dllStops, 0);
});

test('M-002 Lucid-Scaling: ab dllScaleFrom 0,6 × Peak-EOD, sinkt nie (auch nach Auszahlung)', () => {
  // +190 $ je Trade, 1 Trade/Tag. EOD 190, 380, 570 (≥ 500 → Scaling), 760, 950; Tag 6: 1140 → Auszahlung → EOD 0
  const a = simulate(det({ mode: 'instant', target: 0, dllFunded: 300, dllScaleFunded: 0.6, dllScaleFrom: 500,
    minp: 1000, n: 1 }), SEED).accts[0], f = a.phases.funded;
  assert.strictEqual(a.nPay, 3);
  assert.deepStrictEqual(f.dayDll.slice(0, 12).map(Math.round), [300, 300, 300, 342, 456, 570, 570, 570, 570, 570, 570, 570]);
  for (let i = 1; i < f.dayDll.length; i++) assert.ok(f.dayDll[i] >= f.dayDll[i - 1]);
  // Daten: Lucid Direct 25k ohne Scaling, Pro 50k ab 2.100 $
  assert.deepStrictEqual([byId('lu-direct-25').dllScaleFunded, byId('lu-direct-25').dllScaleFrom], [0, 0]);
  assert.deepStrictEqual([byId('lu-pro-50').dllScaleFunded, byId('lu-pro-50').dllScaleFrom], [0.6, 2100]);
  // Mit Zufall: Limit nie unter dllFunded, steigt nur
  const o = byId('lu-pro-50');
  let scaled = 0;
  for (let seed = 1; seed <= 40; seed++) for (const x of simulate(offerP(o, { tradesPerDay: 3, n: 12, ...withDll(o) }), seed).accts) if (x.phases.funded) {
    const d = x.phases.funded.dayDll;
    d.forEach((l, i) => { assert.ok(l >= o.dllFunded); if (i) assert.ok(l >= d[i - 1]); if (l > o.dllFunded) scaled++; });
  }
  assert.ok(scaled, 'Scaling greift');
});

test('M-002 dllCompliant = false: soft beendet den Tag, hard Challenge bzw. Account', () => {
  // Immer Verlust 110 $, dll 250: der 3. Trade erreicht −330
  const soft = simulate(det({ wr: 0, dllEval: 250, dllCompliant: false, tradesPerDay: 4, n: 1 }), SEED).accts[0].phases.step1;
  assert.deepStrictEqual(soft.dayPnl, [...Array(6).fill(-330), -110]);
  assert.deepStrictEqual([soft.dllStops, soft.dllBreaches], [6, 0]);
  // Bruch im letzten Slot: Tag endet ohnehin, kein Stopp
  const last = simulate(det({ wr: 0, dllEval: 250, dllCompliant: false, tradesPerDay: 3, n: 1 }), SEED).accts[0].phases.step1;
  assert.deepStrictEqual(last.dayPnl, [...Array(6).fill(-330), -110]);
  assert.strictEqual(last.dllStops, 0);
  // Genau −dll gilt als erreicht
  const eq = simulate(det({ wr: 0, dllEval: 220, dllCompliant: false, tradesPerDay: 3, n: 1 }), SEED).accts[0].phases.step1;
  assert.deepStrictEqual(eq.dayPnl.slice(0, 3), [-220, -220, -220]);
  const h = simulate(det({ wr: 0, dllEval: 250, dllType: 'hard', dllCompliant: false, tradesPerDay: 4, n: 1 }), SEED).accts[0];
  assert.strictEqual(h.passed, false); assert.strictEqual(h.trades, 3);
  assert.deepStrictEqual([h.phases.step1.days, h.phases.step1.dllBreaches, h.phases.step1.dllStops], [1, 1, 1]);
  assert.strictEqual(h.phases.funded, null);
  // Funded (Instant): hard = Account verloren
  const f = simulate(det({ mode: 'instant', target: 0, wr: 0, dllFunded: 250, dllType: 'hard', dllCompliant: false, tradesPerDay: 4, n: 1 }), SEED).accts[0];
  assert.deepStrictEqual([f.blown, f.trades, f.nPay, f.phases.funded.dllBreaches], [true, 3, 0, 1]);
  // Drawdown 300 bricht beim selben Trade (−330) → Drawdown gilt, kein DLL-Bruch
  const d = simulate(det({ wr: 0, dd: 300, dllEval: 250, dllType: 'hard', dllCompliant: false, tradesPerDay: 4, n: 1 }), SEED).accts[0];
  assert.deepStrictEqual([d.passed, d.trades, d.phases.step1.dllBreaches, d.phases.step1.dllStops], [false, 3, 0, 0]);
  // Regeltreu ändert hard nichts: kein Bruch möglich
  const o = byId('ac-one-50');
  const C = simulate(offerP(o, { tradesPerDay: 3, ...withDll(o) }), SEED);
  assert.strictEqual(C.days.step1.dllBreaches, 0);
});

test('M-002 Validierung: negative Werte, dllType, dllCompliant, risk + cost ≥ dll werfen', () => {
  const f = PRESETS.futures; // risk 500 + cost 10 = 510
  for (const k of ['dllEval', 'dllFunded', 'dllScaleFunded', 'dllScaleFrom']) {
    assert.throws(() => prepare({ ...f, [k]: -1 }), new RegExp(k));
    assert.throws(() => prepare({ ...f, [k]: '1000' }), new RegExp(k));
    assert.throws(() => prepare({ ...f, [k]: NaN }), new RegExp(k));
  }
  assert.throws(() => prepare({ ...f, dllType: 'medium' }), /dllType/);
  assert.throws(() => prepare({ ...f, dllCompliant: 'ja' }), /dllCompliant/);
  assert.throws(() => prepare({ ...f, dllCompliant: 1 }), /dllCompliant/);
  assert.throws(() => prepare({ ...f, dllEval: 510 }), /dllEval.*risk \+ cost/);
  assert.throws(() => prepare({ ...f, dllFunded: 400 }), /dllFunded.*risk \+ cost/);
  assert.throws(() => prepare({ ...f, dllScaleFunded: 0.6, dllScaleFrom: 500 }), /Scaling/);
  assert.doesNotThrow(() => prepare({ ...f, dllEval: 511, dllFunded: 511, dllType: 'hard', dllCompliant: false }));
  assert.doesNotThrow(() => prepare({ ...f, dllScaleFunded: 0.6, dllScaleFrom: 1000 }));
  assert.doesNotThrow(() => prepare({ ...PRESETS.instant, dllEval: 100 })); // instant: kein dllEval
  const P = prepare({ ...f });
  assert.deepStrictEqual([P.dllEval, P.dllFunded, P.dllType, P.dllScaleFunded, P.dllScaleFrom, P.dllCompliant], [0, 0, 'soft', 0, 0, true]);
});

test('M-002 Daten: DLL-Kernfelder passen zu rules, 97 Angebote mit DLL (52 + 45 Blue Guardian)', () => {
  let n = 0;
  for (const o of ALL) {
    const r = o.rules || {};
    for (const k of DLL_KEYS) assert.ok(k in o, o.id + ' ' + k);
    assert.strictEqual(o.dllEval, o.mode === 'instant' ? 0 : (r.dlgEval ?? r.dailyDd ?? 0), o.id);
    assert.strictEqual(o.dllFunded, r.dlgFunded ?? r.dailyDd ?? 0, o.id);
    if (r.dlgEval != null && o.mode !== 'instant') assert.ok(o.dllEval > 0, o.id);
    if (r.dlgFunded != null || r.dailyDd != null) assert.ok(o.dllFunded > 0, o.id);
    assert.strictEqual(o.dllType, /^(ac-|bg-cfd-)/.test(o.id) ? 'hard' : 'soft', o.id);
    if (o.dllScaleFunded > 0) {
      assert.ok(o.id.startsWith('lu-') && r.dlgScaleFunded === 0.6, o.id);
      assert.strictEqual(o.dllScaleFrom, r.trailBalance - Number(o.id.split('-').pop()) * 1000, o.id);
    } else assert.deepStrictEqual([o.dllScaleFunded, o.dllScaleFrom, r.dlgScaleFunded ?? null], [0, 0, null], o.id);
    assert.ok(!('dllCompliant' in o), o.id);
    if (o.dllEval > 0 || o.dllFunded > 0) n++;
    assert.doesNotThrow(() => offerP(o, withDll(o)), o.id);
  }
  assert.strictEqual(n, 97);
  assert.strictEqual(ALL.filter(o => o.dllScaleFunded > 0).length, 7);
  for (const p of Object.values(PRESETS)) for (const k of DLL_KEYS) assert.ok(!(k in p));
});

// ---- Consistency (M-003) ----
const CONS_ZERO = { consEval: 0, consFunded: 0, consFundedMode: 'cycle', consCompliant: true };
// Ergebnis ohne die neuen Consistency-Felder je Phase (consBlocks, bestDay)
const noCons = R => JSON.stringify({ ...R,
  days: Object.fromEntries(Object.entries(R.days).map(([k, d]) => [k, { ...d, consBlocks: 0 }])),
  accts: R.accts.map(a => ({ ...a, phases: Object.fromEntries(Object.entries(a.phases).map(([k, ph]) => [k, ph && { ...ph, consBlocks: 0, bestDay: 0 }])) })) });

test('M-003 Golden: ohne Regel exakt die Baseline (alle 5 Presets, tradesPerDay 1 und 3)', () => {
  for (const k of Object.keys(PRESETS)) for (const tpd of [1, 3]) {
    const R = simulate(prepare({ ...PRESETS[k], n: 2000, tradesPerDay: tpd }), SEED);
    const Z = simulate(prepare({ ...PRESETS[k], n: 2000, tradesPerDay: tpd, ...CONS_ZERO }), SEED);
    const F = simulate(prepare({ ...PRESETS[k], n: 2000, tradesPerDay: tpd, ...CONS_ZERO, consCompliant: false, consFundedMode: 'perpetual' }), SEED);
    if (GOLD[k]) assert.deepStrictEqual(kpi(R, 2000), GOLD[k], k + ' tpd ' + tpd);
    assert.strictEqual(JSON.stringify(Z), JSON.stringify(R), k + ' explizit 0 = Default');
    assert.strictEqual(noCons(F), noCons(R), k + ' Schalter ohne Regel wirkungslos');
    for (const ph of ['step1', 'step2', 'funded']) if (R.days[ph].n) assert.strictEqual(R.days[ph].consBlocks, 0, k + ' ' + ph);
    assert.strictEqual(R.consTargetFails.n, 0, k);
    if (PRESETS[k].mode === 'challenge') assert.strictEqual(R.consPassDelay, 0, k); else assert.strictEqual(R.consPassDelay, null, k);
  }
});

test('M-003 Eval: Ziel erreicht, bester Tag zu groß → kein Bestehen, später Bestehen, consBlocks steigt', () => {
  // je Trade +190, 3 Trades pro Tag: Tag 2 erreicht 1.140 ≥ 1.000, aber 570 ≥ 40 % × 1.140 → blockiert
  const base = simulate(det({ tradesPerDay: 3 }), 1).accts[0].phases.step1;
  assert.deepStrictEqual([base.days, base.consBlocks], [2, 0]);
  const R = simulate(det({ tradesPerDay: 3, consEval: 40 }), 1), ph = R.accts[0].phases.step1;
  assert.strictEqual(R.passed, 20);
  assert.deepStrictEqual(ph.dayPnl, [570, 570, 190, 190], 'regeltreu: Blockade beendet den Tag');
  assert.deepStrictEqual(ph.bestDay, [570, 570, 570, 570]);
  assert.strictEqual(ph.consBlocks, 2);
  assert.strictEqual(R.days.step1.consBlocks, 2);
  assert.strictEqual(R.consPassDelay, 2);
  assert.deepStrictEqual(R.consTargetFails, { n: 0, hit: 20, share: 0 });
  // consCompliant = false: am selben Tag weiter, Bestehen an Tag 3 mit dem 2. Trade
  const F = simulate(det({ tradesPerDay: 3, consEval: 40, consCompliant: false }), 1), pf = F.accts[0].phases.step1;
  assert.deepStrictEqual([pf.dayPnl, pf.consBlocks, F.consPassDelay], [[570, 570, 380], 2, 1]);
});

test('M-003 Eval 2-Step: Regel je Step getrennt, Step 2 startet mit bestem Tag 0', () => {
  const R = simulate(det({ tradesPerDay: 3, consEval: 40, target2: 1000 }), 1), a = R.accts[0];
  assert.deepStrictEqual([a.phases.step1.consBlocks, a.phases.step2.consBlocks], [2, 2]);
  assert.strictEqual(R.consPassDelay, 4, 'Step 1 + Step 2');
  assert.strictEqual(R.medianDaysToPass, 8);
  // Zufallskurse: bestDay je Step = laufendes Maximum nur der eigenen Tage
  const P = prepare({ ...PRESETS.futures, target2: 3000, tradesPerDay: 3, consEval: 40, n: 300 });
  let reset = false;
  for (const x of simulate(P, SEED).accts) for (const k of ['step1', 'step2']) {
    const ph = x.phases[k]; if (!ph) continue;
    let m = 0; ph.dayPnl.forEach((v, i) => { m = Math.max(m, v); assert.strictEqual(ph.bestDay[i], m, k); });
    if (k === 'step2' && ph.bestDay[0] < Math.max(...x.phases.step1.bestDay)) reset = true;
  }
  assert.ok(reset, 'mindestens ein Step 2 beginnt unter dem besten Tag aus Step 1');
});

// Instant: Puffer 600, Schwelle 900; je Trade +190, 3 Trades pro Tag, max. 2 Auszahlungen
const fund = over => simulate(det({ mode: 'instant', target: 0, buf: 600, maxp: 2, tradesPerDay: 3, consFunded: 40, ...over }), 1).accts[0];

test("M-003 Funded 'cycle': Auszahlung blockiert, bis die Regel erfüllt ist, danach Reset", () => {
  assert.strictEqual(fund({ consFunded: 0 }).phases.funded.days, 3, 'ohne Regel');
  const a = fund({ consFundedMode: 'cycle' }), ph = a.phases.funded;
  assert.strictEqual(a.nPay, 2);
  // 1. Zyklus: Zyklusgewinn inkl. Puffer, Auszahlung an Tag 5 (1.520, 570 < 608); 2. Zyklus ab 600 $, Auszahlung an Tag 10
  assert.deepStrictEqual(ph.dayPnl, [570, 380, 190, 190, 190, 380, 190, 190, 190, 190]);
  assert.deepStrictEqual(ph.bestDay, [570, 570, 570, 570, 0, 380, 380, 380, 380, 0]);
  assert.strictEqual(ph.consBlocks, 7);
  // consCompliant = false: Blockade beendet den Tag nicht
  const f = fund({ consFundedMode: 'cycle', consCompliant: false }).phases.funded;
  assert.ok(f.dayPnl.some((v, i) => v === 570 && i > 0), 'weiter getradet');
});

test("M-003 Funded 'perpetual': kein Reset, alter großer Tag blockiert auch den 2. Zyklus", () => {
  const a = fund({ consFundedMode: 'perpetual' }), ph = a.phases.funded;
  assert.strictEqual(a.nPay, 2);
  assert.strictEqual(ph.days, 12, '2. Zyklus braucht Zyklusgewinn > 570 ÷ 0,4');
  assert.ok(ph.bestDay.every(v => v === 570));
  assert.strictEqual(ph.consBlocks, 9);
});

test('M-003 strikt: bester Tag = genau X % blockiert', () => {
  // Tag 2: 570 = 50 % × 1.140 → blockiert, Bestehen an Tag 3; knapp darüber besteht Tag 2
  const eq = simulate(det({ tradesPerDay: 3, consEval: 50 }), 1).accts[0].phases.step1;
  assert.deepStrictEqual([eq.days, eq.consBlocks], [3, 1]);
  const ab = simulate(det({ tradesPerDay: 3, consEval: 50.01 }), 1).accts[0].phases.step1;
  assert.deepStrictEqual([ab.days, ab.consBlocks], [2, 0]);
  // Funded: Tag 3 erreicht 1.140, bester Tag 570 = 50 % × 1.140 → blockiert, Auszahlung an Tag 4
  assert.strictEqual(fund({ consFunded: 50, maxp: 1 }).phases.funded.days, 4);
  assert.strictEqual(fund({ consFunded: 50.01, maxp: 1 }).phases.funded.days, 3);
});

test('M-003 Validierung: Werte außerhalb [0, 100], Typ, Mode und consCompliant', () => {
  const f = PRESETS.futures;
  for (const k of ['consEval', 'consFunded']) for (const v of [-1, 100.5, NaN, Infinity, '40', null])
    assert.throws(() => prepare({ ...f, [k]: v }), new RegExp(k), k + ' ' + v);
  for (const v of ['target', 'perpetual-best-day', '', 1]) assert.throws(() => prepare({ ...f, consFundedMode: v }), /consFundedMode/);
  for (const v of [1, 'true', null]) assert.throws(() => prepare({ ...f, consCompliant: v }), /consCompliant/);
  for (const v of [0, 100]) assert.doesNotThrow(() => prepare({ ...f, consEval: v, consFunded: v }));
  const P = prepare({ ...f });
  assert.deepStrictEqual([P.consEval, P.consFunded, P.consFundedMode, P.consCompliant], [0, 0, 'cycle', true]);
  // instant: consEval wirkt nicht
  const I = { ...PRESETS.instant, n: 300, tradesPerDay: 3 };
  assert.strictEqual(JSON.stringify(simulate(prepare({ ...I, consEval: 40 }), SEED)), JSON.stringify(simulate(prepare(I), SEED)));
});

test('M-003 consTargetFails: erreichtes Ziel, danach gescheitert (1-Step)', () => {
  const R = simulate(prepare({ ...PRESETS.futures, n: 2000, tradesPerDay: 3, consEval: 40 }), SEED);
  const t = R.consTargetFails;
  assert.ok(t.n > 0 && t.hit - t.n === R.passed, JSON.stringify(t));
  assert.strictEqual(t.share, t.n / t.hit);
  assert.ok(R.consPassDelay > 0 && R.days.step1.consBlocks > 0);
});

test('M-003 Daten: Consistency-Kernfelder passen zu rules, Anzahl je Anbieter', () => {
  const CNT = { 'Alpha Futures': [13, 6, 10], 'Lucid': [16, 8, 8], 'MyFundedFutures': [12, 8, 4], 'FundedNext': [7, 3, 4], 'Alpha Capital': [19, 0, 19],
    'Blue Guardian · CFD': [18, 6, 18], 'Blue Guardian · Futures': [16, 8, 8] };
  for (const gr of OFFERS) {
    const key = Object.keys(CNT).find(k => gr.g.startsWith(k)); assert.ok(key, gr.g);
    let any = 0, ev = 0, fu = 0;
    for (const o of gr.items) {
      const r = o.rules || {};
      assert.strictEqual(o.consEval, r.consEval ?? 0, o.id);
      assert.strictEqual(o.consFunded, r.consFunded ?? r.bestDayPct ?? 0, o.id);
      assert.strictEqual(o.consFundedMode, r.consFundedMode === 'perpetual-best-day' ? 'perpetual' : 'cycle', o.id);
      if (o.mode === 'instant') assert.strictEqual(o.consEval, 0, o.id);
      assert.ok(!('consCompliant' in o), o.id);
      if (o.consEval > 0 || o.consFunded > 0) any++;
      if (o.consEval > 0) ev++;
      if (o.consFunded > 0) fu++;
      assert.doesNotThrow(() => offerP(o, { consEval: o.consEval, consFunded: o.consFunded, consFundedMode: o.consFundedMode }), o.id);
    }
    assert.deepStrictEqual([any, ev, fu], CNT[key], key);
  }
  assert.deepStrictEqual(ALL.filter(o => o.consFundedMode === 'perpetual').map(o => o.id), ['fn-direct-50']);
  for (const p of Object.values(PRESETS)) for (const k of Object.keys(CONS_ZERO)) assert.ok(!(k in p));
});

// ---- Account-Liste (M-014) ----
test('M-014 R.list: genau n Einträge, Summen stimmen mit netNo, netHe und real', () => {
  for (const k of Object.keys(PRESETS)) for (const n of [1, 101, 2000]) {
    const R = simulate(prepare({ ...PRESETS[k], n }), SEED);
    assert.strictEqual(R.list.length, n, k + ' n ' + n);
    assert.deepStrictEqual(R.list.map(x => x.i), [...Array(n).keys()], k);
    let no = 0, he = 0, real = 0;
    for (const x of R.list) { no += x.netNo; he += x.netHe; real += x.hedge; }
    assert.strictEqual(no, R.netNo, k + ' netNo');
    assert.strictEqual(he, R.netHe, k + ' netHe');
    assert.ok(Math.abs(real - R.real) < 1e-6, k + ` real ${real} vs ${R.real}`);
    // Die ersten 12 Zeilen gehören zu den Detail-Accounts
    R.accts.forEach((a, i) => assert.deepStrictEqual([R.list[i].trades, R.list[i].nPay, R.list[i].netNo], [a.trades, a.nPay, a.netNo], k));
  }
});

test('M-014 Zählung: verloren + mit Auszahlung + sonstige = n, passend zu fail/paid/passNo', () => {
  for (const k of Object.keys(PRESETS)) for (const n of [10, 100, 101, 2000]) {
    const R = simulate(prepare({ ...PRESETS[k], n }), SEED);
    const c = { fail: 0, pass: 0, paid: 0 };
    for (const x of R.list) c[x.res]++;
    assert.strictEqual(c.fail + c.paid + c.pass, n, k);
    assert.deepStrictEqual([c.fail, c.paid, c.pass], [R.fail, R.paid, R.passNo], k + ' n ' + n);
    assert.strictEqual(R.fail + R.paid + R.passNo, n, k);
    assert.strictEqual(R.cumNo.length, n + 1, k);
  }
});

// ---- Gewinntage und Mindesttage (M-004) ----
const DAYS_ZERO = { evalMinDays: 0, evalWinDays: 0, evalWinDayMin: 0, payMinDays: 0, payWinDays: 0, payWinDayMin: 0, daysCompliant: true };
const DAYS_KEYS = Object.keys(DAYS_ZERO);
// Ergebnis ohne die neuen Tage-Felder (daysBlocks, firstPayDay, daysToFirstPay)
const noDays = R => JSON.stringify({ ...R,
  days: Object.fromEntries(Object.entries(R.days).map(([k, d]) => [k, { ...d, daysBlocks: 0, daysToFirstPay: 0 }])),
  accts: R.accts.map(a => ({ ...a, phases: Object.fromEntries(Object.entries(a.phases).map(([k, ph]) => [k, ph && { ...ph, daysBlocks: 0 }])) })) });

test('M-004 Golden: ohne Regel exakt die Baseline (alle 5 Presets, tradesPerDay 1 und 3)', () => {
  for (const k of Object.keys(PRESETS)) for (const tpd of [1, 3]) {
    const R = simulate(prepare({ ...PRESETS[k], n: 2000, tradesPerDay: tpd }), SEED);
    const Z = simulate(prepare({ ...PRESETS[k], n: 2000, tradesPerDay: tpd, ...DAYS_ZERO }), SEED);
    const F = simulate(prepare({ ...PRESETS[k], n: 2000, tradesPerDay: tpd, ...DAYS_ZERO, daysCompliant: false }), SEED);
    if (GOLD[k]) assert.deepStrictEqual(kpi(R, 2000), GOLD[k], k + ' tpd ' + tpd);
    assert.strictEqual(JSON.stringify(Z), JSON.stringify(R), k + ' explizit 0 = Default');
    assert.strictEqual(noDays(F), noDays(R), k + ' Schalter ohne Regel wirkungslos');
    for (const ph of ['step1', 'step2', 'funded']) if (R.days[ph].n) assert.strictEqual(R.days[ph].daysBlocks, 0, k + ' ' + ph);
    if (PRESETS[k].mode === 'challenge') assert.strictEqual(R.daysPassDelay, 0, k); else assert.strictEqual(R.daysPassDelay, null, k);
    // Tag der 1. Auszahlung: Mittel über Accounts mit Auszahlung, aus den Detail-Accounts nachvollziehbar
    if (R.paid) assert.ok(R.days.funded.daysToFirstPay >= 1, k); else assert.strictEqual(R.days.funded.daysToFirstPay, null, k);
    for (const a of R.accts) if (a.phases.funded) assert.strictEqual(a.phases.funded.firstPayDay !== null, a.nPay > 0, k);
  }
});

test('M-004 Eval Mindesttage: Ziel an Tag 1, evalMinDays 3 → Bestehen frühestens an Tag 3', () => {
  // je Trade +190, 10 Trades pro Tag: Ziel 1.000 nach 6 Trades an Tag 1
  const b = simulate(det({ tradesPerDay: 10 }), 1).accts[0].phases.step1;
  assert.deepStrictEqual([b.days, b.dayPnl], [1, [1140]]);
  const R = simulate(det({ tradesPerDay: 10, evalMinDays: 3 }), 1), ph = R.accts[0].phases.step1;
  assert.strictEqual(R.passed, 20);
  assert.deepStrictEqual(ph.dayPnl, [1140, 190, 190], 'regeltreu: Tag endet, sobald der laufende Tag zählt');
  assert.deepStrictEqual([ph.days, ph.daysBlocks, ph.consBlocks], [3, 2, 0]);
  assert.deepStrictEqual([R.days.step1.daysBlocks, R.daysPassDelay, R.medianDaysToPass], [2, 2, 3]);
  // daysCompliant = false: volle Tage weiter, Bestehen an Tag 3 mit dem 1. Trade
  const F = simulate(det({ tradesPerDay: 10, evalMinDays: 3, daysCompliant: false }), 1).accts[0].phases.step1;
  assert.deepStrictEqual([F.dayPnl, F.daysBlocks], [[1900, 1900, 190], 2]);
  // 2-Step: je Step getrennt
  const T = simulate(det({ tradesPerDay: 10, evalMinDays: 3, target2: 1000 }), 1).accts[0];
  assert.deepStrictEqual([T.phases.step1.days, T.phases.step2.days, T.phases.step2.firstDay], [3, 3, 4]);
});

test('M-004 Eval Gewinntage: Bestehen erst mit n Tagen ≥ X, der laufende Tag zählt mit', () => {
  // evalWinDays 3, Schwelle 500: Tag 1 Ziel + Gewinntag, Tag 2 und 3 je 3 Trades bis 570 ≥ 500
  const R = simulate(det({ tradesPerDay: 10, evalWinDays: 3, evalWinDayMin: 500 }), 1), ph = R.accts[0].phases.step1;
  assert.strictEqual(R.passed, 20);
  assert.deepStrictEqual(ph.dayPnl, [1140, 570, 570]);
  // Tag 3 zählt als Blockade, bis der 3. Trade die Schwelle erreicht
  assert.deepStrictEqual([ph.winDays, ph.daysBlocks, R.daysPassDelay], [3, 3, 2]);
  // Schwelle 0 = Tages-P&L > 0: ein Gewinn-Trade pro Tag reicht
  const Z = simulate(det({ tradesPerDay: 10, evalWinDays: 3 }), 1).accts[0].phases.step1;
  assert.deepStrictEqual(Z.dayPnl, [1140, 190, 190]);
  // Verlusttage zählen nicht: wr 50 %, alle Accounts mit Bestehen haben ≥ 3 Tage mit ≥ 500 $
  const P = prepare({ ...PRESETS.futures, tradesPerDay: 3, evalWinDays: 3, evalWinDayMin: 500, n: 300 });
  for (const a of simulate(P, SEED).accts) if (a.passed) assert.ok(a.phases.step1.dayPnl.filter(v => v >= 500).length >= 3);
});

// Instant: Puffer 0, Schwelle 300; je Trade +190, 3 Trades pro Tag, max. 2 Auszahlungen
const fundD = over => simulate(det({ mode: 'instant', target: 0, buf: 0, minp: 300, maxp: 2, tradesPerDay: 3, ...over }), 1);

test('M-004 Funded Gewinntage je Zyklus: Auszahlung blockiert bis n Tage ≥ X, danach Reset', () => {
  const b = fundD({}).accts[0].phases.funded;
  assert.deepStrictEqual([b.dayPnl, b.firstPayDay], [[380, 380], 1]);
  const R = fundD({ payWinDays: 2, payWinDayMin: 500 }), a = R.accts[0], f = a.phases.funded;
  assert.deepStrictEqual(f.dayPnl, [570, 570, 570, 570], 'Zyklus 1: Tag 1–2, Zyklus 2: Tag 3–4');
  assert.deepStrictEqual([a.nPay, f.firstPayDay, f.daysBlocks], [2, 2, 4]);
  assert.ok(Math.abs(a.pay - 2 * 1140 * 0.9) < 1e-9);
  assert.strictEqual(R.days.funded.daysToFirstPay, 2);
});

test('M-004 Funded Mindesttage je Zyklus', () => {
  const R = fundD({ payMinDays: 2 }), a = R.accts[0], f = a.phases.funded;
  assert.deepStrictEqual(f.dayPnl, [380, 190, 380, 190]);
  assert.deepStrictEqual([a.nPay, f.firstPayDay, f.daysBlocks], [2, 2, 2]);
  assert.ok(Math.abs(a.pay - 2 * 570 * 0.9) < 1e-9);
  // daysCompliant = false: am Blockade-Tag weiter
  const F = fundD({ payMinDays: 2, daysCompliant: false }).accts[0].phases.funded;
  assert.deepStrictEqual(F.dayPnl, [570, 190, 570, 190]);
});

test('M-004 Zusammenspiel: Consistency und Tage müssen beide erfüllt sein', () => {
  // M-003 allein: Bestehen an Tag 4 ([570, 570, 190, 190]); mit 5 Mindesttagen erst an Tag 5
  const R = simulate(det({ tradesPerDay: 3, consEval: 40, evalMinDays: 5 }), 1), ph = R.accts[0].phases.step1;
  assert.deepStrictEqual(ph.dayPnl, [570, 570, 190, 190, 190]);
  assert.deepStrictEqual([ph.consBlocks, ph.daysBlocks, R.consPassDelay, R.daysPassDelay], [2, 1, 3, 1]);
  // Funded: Consistency 40 % allein → 1. Auszahlung an Tag 5, 7 Mindesttage allein → Tag 7, beide → Tag 7
  const c = fundD({ consFunded: 40 }).accts[0].phases.funded, d = fundD({ payMinDays: 7 }).accts[0].phases.funded;
  const f = fundD({ consFunded: 40, payMinDays: 7 }).accts[0].phases.funded;
  assert.deepStrictEqual([c.firstPayDay, d.firstPayDay, f.firstPayDay], [5, 7, 7]);
  assert.deepStrictEqual([c.daysBlocks, d.consBlocks], [0, 0]);
  // Tage mit beiden Blockaden zählen nur als consBlocks: gleich viele consBlocks wie mit Consistency allein
  assert.strictEqual(f.consBlocks, c.consBlocks);
  // daysBlocks nur an Tagen, an denen die Consistency erfüllt war (Tag 5–6 und 12–13)
  assert.deepStrictEqual([f.consBlocks, f.daysBlocks, f.days], [8, 4, 14]);
});

test('M-004 Validierung: negative, nicht-ganzzahlige oder unerreichbare Werte werfen', () => {
  for (const k of ['evalMinDays', 'evalWinDays', 'payMinDays', 'payWinDays'])
    for (const v of [-1, 1.5, '3', NaN, null]) assert.throws(() => det({ [k]: v }), new RegExp(k), k + ' ' + v);
  for (const k of ['evalWinDayMin', 'payWinDayMin'])
    for (const v of [-5, '100', NaN, Infinity]) assert.throws(() => det({ [k]: v }), new RegExp(k), k + ' ' + v);
  assert.throws(() => det({ daysCompliant: 'ja' }), /daysCompliant/);
  // höchster Tagesgewinn 3 × 190 = 570
  assert.throws(() => det({ tradesPerDay: 3, evalWinDays: 1, evalWinDayMin: 600 }), /evalWinDayMin/);
  assert.throws(() => det({ tradesPerDay: 3, payWinDays: 1, payWinDayMin: 600 }), /payWinDayMin/);
  assert.doesNotThrow(() => det({ tradesPerDay: 3, evalWinDays: 1, evalWinDayMin: 570 }));
  assert.doesNotThrow(() => det({ tradesPerDay: 3, payWinDays: 0, payWinDayMin: 600 }), 'ohne Tage keine Prüfung');
  assert.doesNotThrow(() => det({ mode: 'instant', target: 0, tradesPerDay: 3, evalWinDays: 1, evalWinDayMin: 600 }), 'Instant ohne Eval');
});

test('M-004 Daten: Tage-Regeln aus rules, Prozent-Schwellen in $, minp = echte Mindestauszahlung', () => {
  const v = id => { const o = byId(id); return DAYS_KEYS.slice(0, 6).map(k => o[k]); };
  // evalMinDays, evalWinDays, evalWinDayMin, payMinDays, payWinDays, payWinDayMin
  assert.deepStrictEqual(v('af-zero-50'), [0, 0, 0, 0, 5, 200]);
  assert.deepStrictEqual(v('af-direct-50'), [0, 0, 0, 0, 0, 0]);
  assert.deepStrictEqual(v('lu-flex-150'), [0, 0, 0, 0, 5, 250]);
  assert.deepStrictEqual(v('lu-direct-50'), [0, 0, 0, 10, 0, 0]);
  assert.deepStrictEqual(v('mf-rapid-25'), [2, 0, 0, 0, 0, 0]);
  assert.deepStrictEqual(v('mf-builder-50'), [1, 0, 0, 2, 0, 0]);
  assert.deepStrictEqual(v('fn-flex-150'), [0, 0, 0, 0, 5, 250]);
  assert.deepStrictEqual(v('ac-d-50'), [0, 0, 0, 0, 7, 0]);
  assert.deepStrictEqual(v('ac-one-50'), [1, 0, 0, 0, 0, 0]);
  assert.deepStrictEqual(v('ac-pro6-50'), [3, 0, 0, 0, 0, 0]);
  assert.deepStrictEqual(v('bg-cfd-instant-100'), [0, 0, 0, 0, 5, 500]);
  assert.deepStrictEqual(v('bg-cfd-1step-25'), [0, 3, 125, 0, 0, 0]);
  assert.deepStrictEqual(v('bg-cfd-2step-200'), [0, 3, 1000, 0, 0, 0]);
  assert.deepStrictEqual(v('bg-cfd-1step-nano-50'), [0, 0, 0, 0, 5, 250]);
  assert.deepStrictEqual(v('bg-cfd-2step-nano-50'), [0, 0, 0, 0, 0, 0]);
  assert.deepStrictEqual(v('bg-fut-reserve-150'), [0, 0, 0, 0, 5, 250]);
  let ev = 0, fu = 0;
  for (const o of ALL) {
    const r = o.rules || {}, inst = o.mode === 'instant';
    if (o.evalMinDays || o.evalWinDays) ev++;
    if (o.payMinDays || o.payWinDays) fu++;
    for (const k of DAYS_KEYS.slice(0, 6)) assert.ok(Number.isFinite(o[k]) && o[k] >= 0, o.id + ' ' + k);
    if (inst) assert.deepStrictEqual([o.evalMinDays, o.evalWinDays, o.evalWinDayMin], [0, 0, 0], o.id);
    // Prozent-Schwellen: Größe × Prozent
    if (r.minProfitDaysEval) assert.strictEqual(o.evalWinDayMin, r.size * r.minProfitDayPct / 100, o.id);
    if (r.minProfitDays && r.minProfitDayPct) assert.strictEqual(o.payWinDayMin, r.size * r.minProfitDayPct / 100, o.id);
    // Gewinntage stehen nicht mehr in minp: minp = Mindestauszahlung (÷ Auszahlungsanteil) bzw. Zyklusziel
    if (o.payWinDays && r.payoutMin) assert.strictEqual(o.minp, Math.max(r.payoutMin / (r.payoutFrac || 1), r.cycleProfitMin || 0, r.cycleTarget1 || 0), o.id);
    assert.ok(!('minDaysEval' in r) || !o.id.startsWith('bg-'), o.id + ' BG: minProfitDaysEval statt minDaysEval');
    assert.doesNotThrow(() => offerP(o, DAYS_KEYS.reduce((x, k) => ({ ...x, [k]: o[k] ?? DAYS_ZERO[k] }), { tradesPerDay: 1 })), o.id);
  }
  assert.deepStrictEqual([ev, fu], [36, 49]);
  const minp = id => byId(id).minp;
  assert.deepStrictEqual(['af-zero-50', 'af-std-50', 'af-adv-50', 'lu-flex-150', 'fn-flex-50', 'bg-cfd-instant-400', 'bg-cfd-1step-nano-200', 'bg-fut-reserve-50'].map(minp),
    [400, 1000, 2000, 1000, 500, 500, 100, 100]);
  for (const p of Object.values(PRESETS)) for (const k of DAYS_KEYS) assert.ok(!(k in p));
});

test('M-004 Instant ignoriert Eval-Tage', () => {
  for (const tpd of [1, 3]) {
    const R = simulate(prepare({ ...PRESETS.instant, n: 500, tradesPerDay: tpd }), SEED);
    const E = simulate(prepare({ ...PRESETS.instant, n: 500, tradesPerDay: tpd, evalMinDays: 5, evalWinDays: 3, evalWinDayMin: 100000 }), SEED);
    assert.strictEqual(JSON.stringify(E), JSON.stringify(R), 'tpd ' + tpd);
  }
  // Instant-Angebote tragen keine Eval-Tage (Lucid Direct: nur Funded)
  assert.deepStrictEqual([byId('lu-direct-50').evalMinDays, byId('lu-direct-50').payMinDays], [0, 10]);
});

test('M-004 R.list: daysToFirstPay je Account, Mittel = days.funded.daysToFirstPay', () => {
  for (const k of Object.keys(PRESETS)) for (const over of [{}, { tradesPerDay: 3, payWinDays: 2, payWinDayMin: 100 }]) {
    const R = simulate(prepare({ ...PRESETS[k], n: 2000, ...over }), SEED);
    const xs = R.list.filter(x => x.nPay > 0).map(x => x.daysToFirstPay);
    assert.ok(xs.every(v => Number.isInteger(v) && v >= 1), k);
    assert.ok(R.list.filter(x => x.nPay === 0).every(x => x.daysToFirstPay === null), k);
    const m = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
    assert.strictEqual(m, R.days.funded.daysToFirstPay, k);
    // Detail-Accounts: gleich phases.funded.firstPayDay, höchstens Gesamttage
    R.accts.forEach((a, i) => { assert.strictEqual(R.list[i].daysToFirstPay, a.phases.funded ? a.phases.funded.firstPayDay : null, k);
      if (R.list[i].daysToFirstPay !== null) assert.ok(R.list[i].daysToFirstPay <= R.list[i].days, k); });
  }
});

test('M-004 Daten je Anbieter: Tage-Felder und minp', () => {
  // id: [evalMinDays, evalWinDays, evalWinDayMin, payMinDays, payWinDays, payWinDayMin, minp]
  const EXP = {
    'af-zero-50':           [0, 0, 0,   0, 5, 200, 400],   // Alpha Futures: 200 $ ÷ 50 %
    'lu-flex-50':           [0, 0, 0,   0, 5, 150, 1000],  // Lucid Flex: 500 $ ÷ 50 %
    'lu-direct-50':         [0, 0, 0,   10, 0, 0,  3000],  // Lucid Direct: 10 Handelstage (M-010h), minp = 1. Zyklusziel
    'mf-builder-100':       [1, 0, 0,   2, 0, 0,   1000],  // MFFU Builder
    'mf-rapid-50':          [2, 0, 0,   0, 0, 0,   500],   // MFFU Rapid
    'fn-flex-100':          [0, 0, 0,   0, 5, 200, 500],   // FundedNext Flex: max(500 $; 250 $ ÷ 50 %)
    'ac-d-100':             [0, 0, 0,   0, 7, 0,   1000],  // Alpha Capital Direct: 7 Tage > 0, minp 1 %
    'ac-pro6-100':          [3, 0, 0,   0, 0, 0,   2000],  // Alpha Capital Pro 6 %: 3 Handelstage je Phase
    'bg-cfd-2step-50':      [0, 3, 250, 0, 0, 0,   100],   // Blue Guardian CFD 2 Step: 3 × 0,5 % je Phase
    'bg-cfd-instant-50':    [0, 0, 0,   0, 5, 250, 500],   // Blue Guardian CFD Instant: 5 × 0,5 %, minp 500 $ (M-010h)
    'bg-fut-reserve-100':   [0, 0, 0,   0, 5, 200, 100],   // Blue Guardian Futures Reserve
    'bg-fut-express-50':    [0, 0, 0,   0, 0, 0,   500],   // Blue Guardian Futures Express: ohne Tage-Regel
  };
  for (const [id, e] of Object.entries(EXP)) {
    const o = byId(id);
    assert.deepStrictEqual([...DAYS_KEYS.slice(0, 6).map(k => o[k]), o.minp], e, id);
  }
});

// ---- Kalender und Gebühren (M-005) ----
const { calDay } = require('../js/sim.js');
const CAL_KEYS = ['payFirstAfterCal', 'payEveryCal', 'feeMonthly', 'feeActivation'];
const CAL_ZERO = { payFirstAfterCal: 0, payEveryCal: 0, feeMonthly: 0, feeActivation: 0 };
const withCal = o => Object.fromEntries(CAL_KEYS.map(k => [k, o[k]]));
// Ergebnis ohne die Zeitfelder (Tage, Kalender, Detail-Phasen), für die Geld-Gleichheit bei Pause
const moneyList = R => JSON.stringify(R.list.map(x => [x.res, x.trades, x.nPay, x.pay, x.hedge, x.netNo, x.netHe, x.feesPaid]));

test('M-005 Golden: ohne Regel exakt die Baseline (Presets, alle Angebote, tradesPerDay 1 und 3)', () => {
  for (const k of Object.keys(PRESETS)) for (const tpd of [1, 3]) {
    const R = simulate(prepare({ ...PRESETS[k], n: 2000, tradesPerDay: tpd }), SEED);
    const Z = simulate(prepare({ ...PRESETS[k], n: 2000, tradesPerDay: tpd, ...CAL_ZERO }), SEED);
    const F = simulate(prepare({ ...PRESETS[k], n: 2000, tradesPerDay: tpd, ...CAL_ZERO, calCompliant: false }), SEED);
    if (GOLD[k]) assert.deepStrictEqual(kpi(R, 2000), GOLD[k], k + ' tpd ' + tpd);
    assert.strictEqual(JSON.stringify(Z), JSON.stringify(R), k + ' explizit 0 = Default');
    assert.strictEqual(JSON.stringify(F), JSON.stringify(R), k + ' Schalter ohne Regel wirkungslos');
    assert.strictEqual(R.fees, PRESETS[k].fee * 2000, k + ' Fees pauschal');
    assert.ok(R.list.every(x => x.feesPaid === PRESETS[k].fee), k);
    for (const ph of ['step1', 'step2', 'funded']) if (R.days[ph].n) assert.strictEqual(R.days[ph].calBlocks, 0, k + ' ' + ph);
  }
  for (const id of ['mf-pro-50', 'bg-cfd-1step-50', 'af-adv-50', 'fn-rp-50', 'bg-fut-std-50']) for (const tpd of [1, 3]) {
    const o = byId(id);
    const A = simulate(offerP(o, { tradesPerDay: tpd }), SEED), B = simulate(offerP(o, { tradesPerDay: tpd, ...CAL_ZERO }), SEED);
    assert.strictEqual(JSON.stringify(B), JSON.stringify(A), id + ' tpd ' + tpd);
  }
});

test('M-005 Validierung: Kalenderfelder, Gebühren und calCompliant', () => {
  const ok = { ...PRESETS.futures };
  for (const k of ['payFirstAfterCal', 'payEveryCal']) for (const v of [-1, 1.5, '3', NaN, null])
    assert.throws(() => prepare({ ...ok, [k]: v }), new RegExp(k), k + ' ' + v);
  for (const k of ['feeMonthly', 'feeActivation']) for (const v of [-1, Infinity, '50', NaN, null])
    assert.throws(() => prepare({ ...ok, [k]: v }), new RegExp(k), k + ' ' + v);
  for (const v of [1, 'true', null]) assert.throws(() => prepare({ ...ok, calCompliant: v }), /calCompliant/);
  const P = prepare({ ...ok, payFirstAfterCal: 14, payEveryCal: 0, feeMonthly: 12.5, feeActivation: 0, calCompliant: false });
  assert.deepStrictEqual([P.payFirstAfterCal, P.feeMonthly, P.calCompliant], [14, 12.5, false]);
  assert.strictEqual(prepare(ok).calCompliant, true, 'Standard = Pause');
});

test('M-005 Kalender: Fünf-Tage-Woche ab Montag', () => {
  assert.deepStrictEqual([1, 2, 5, 6, 10, 11, 22, 23].map(calDay), [1, 2, 5, 8, 12, 15, 30, 31]);
  // jeder Kalendertag ist Mo–Fr (Rest 1–5 modulo 7), streng steigend
  for (let d = 1; d < 400; d++) { const c = calDay(d), w = (c - 1) % 7; assert.ok(w < 5, d); assert.ok(calDay(d + 1) > c, d); }
});

test('M-005 Wartezeit: 24 h / 48 h / 14 Tage → Funded-Tag 2 / 3 / 11, Start Freitag mit 48 h → Tag 2', () => {
  // Instant, je Trade +190, Schwelle 300 nach 2 Trades an Tag 1
  assert.strictEqual(fundD({}).accts[0].phases.funded.firstPayDay, 1);
  for (const [x, d] of [[1, 2], [2, 3], [14, 11]]) {
    const R = fundD({ payFirstAfterCal: x }), f = R.accts[0].phases.funded;
    assert.strictEqual(f.firstPayDay, d, x + ' Kalendertage');
    assert.strictEqual(R.list[0].calToFirstPay, calDay(d));
    assert.strictEqual(R.days.funded.calToFirstPay, calDay(d));
    // Pause: an Tag 1 Schwelle erreicht, dann ohne Trade bis zur Auszahlung; Auszahlungstag ist kein Handelstag
    assert.deepStrictEqual(f.dayPnl.slice(0, 1), [380]);
    assert.strictEqual(f.calBlocks >= 1, true);
  }
  // Challenge besteht Donnerstag (Tag 4: 3 + 3 + 3 + 1 Trades à 190 = 1.900), Funded startet Freitag
  const fr = over => simulate(det({ target: 1900, tradesPerDay: 3, maxp: 1, n: 1, ...over }), 1).accts[0].phases.funded;
  assert.deepStrictEqual([fr({}).firstDay, fr({}).firstPayDay], [5, 5]);
  assert.strictEqual(fr({ payFirstAfterCal: 2 }).firstPayDay, 6, 'Fr + 48 h = So → Montag = Funded-Tag 2');
  assert.strictEqual(fr({ payFirstAfterCal: 1 }).firstPayDay, 6, 'Fr + 24 h = Sa → Montag');
});

test('M-005 Rhythmus: Abstand der Auszahlungen ≥ payEveryCal, 1. Auszahlung ≥ payFirstAfterCal', () => {
  for (const cc of [true, false]) for (const tpd of [1, 3]) {
    const R = simulate(prepare({ ...PRESETS.instant, wr: 55, n: 300, maxp: 5, tradesPerDay: tpd, payFirstAfterCal: 7, payEveryCal: 14, calCompliant: cc }), SEED);
    let checked = 0;
    for (const a of R.accts) { const f = a.phases.funded; if (!f.payDays.length) continue;
      assert.ok(calDay(f.payDays[0]) >= calDay(f.firstDay) + 7, 'erste');
      for (let j = 1; j < f.payDays.length; j++) { assert.ok(calDay(f.payDays[j]) >= calDay(f.payDays[j - 1]) + 14, 'Abstand'); checked++; }
      assert.strictEqual(f.payDays.length, a.nPay); }
    assert.ok(checked > 0, 'mindestens zwei Auszahlungen geprüft');
    assert.ok(R.days.funded.calBlocks > 0);
  }
});

test('M-005 Pause: Geld bit-identisch zu ohne Kalender, nur die Zeit verschiebt sich', () => {
  for (const id of ['bg-cfd-1step-50', 'mf-pro-50', 'bg-cfd-2step-nano-50', 'fn-rp-50']) for (const tpd of [1, 3]) {
    const o = byId(id), cal = withCal(o);
    assert.ok(cal.payFirstAfterCal > 0, id);
    const A = simulate(offerP(o, { tradesPerDay: tpd }), SEED), B = simulate(offerP(o, { tradesPerDay: tpd, ...cal }), SEED);
    assert.deepStrictEqual(money(B), money(A), id + ' tpd ' + tpd);
    assert.strictEqual(moneyList(B), moneyList(A), id + ' Zeilen');
    if (id !== 'fn-rp-50') assert.ok(B.days.funded.calBlocks > 0, id + ' Kalender greift');
    // Handelstage gleich, Tagesnummer und Kalendertag nie früher
    assert.strictEqual(B.days.funded.tradingDays, A.days.funded.tradingDays, id);
    B.list.forEach((x, i) => { assert.ok(x.days >= A.list[i].days, id); if (x.calToFirstPay !== null) assert.ok(x.calToFirstPay >= A.list[i].calToFirstPay, id); });
    for (const a of B.accts) { const f = a.phases.funded; if (!f || f.firstPayDay === null) continue;
      assert.ok(calDay(f.firstPayDay) >= calDay(f.firstDay) + cal.payFirstAfterCal, id + ' Wartezeit');
      // mit Wartetagen: weniger Handelstage als Tage zwischen erstem und letztem Funded-Tag
      if (f.calBlocks > 0) assert.ok(f.days < f.lastDay - f.firstDay + 1 || f.payDays.some(d => d > f.lastDay), id); }
  }
});

test('M-005 Weitertraden: keine Auszahlung vor dem Freigabetag, calBlocks höchstens 1 pro Tag', () => {
  // 48 h, 3 Trades pro Tag: Tag 1 und 2 blockiert (volle Tage), Auszahlung mit dem 1. Trade an Tag 3
  const R = fundD({ payFirstAfterCal: 2, calCompliant: false }), f = R.accts[0].phases.funded;
  assert.deepStrictEqual(f.dayPnl.slice(0, 3), [570, 570, 190]);
  assert.deepStrictEqual([f.firstPayDay, f.calBlocks], [3, 2], 'Block an Tag 1 und 2, je Tag einmal trotz mehrerer blockierter Trades');
  // Pause zum Vergleich: Tag 1 endet nach 2 Trades, Auszahlung an Tag 3 ohne Trade
  const p = fundD({ payFirstAfterCal: 2 }).accts[0].phases.funded;
  assert.deepStrictEqual([p.dayPnl[0], p.firstPayDay, p.calBlocks >= 1], [380, 3, true]);
  for (const id of ['bg-cfd-1step-50', 'mf-pro-50']) {
    const o = byId(id), B = simulate(offerP(o, { tradesPerDay: 3, ...withCal(o), calCompliant: false }), SEED);
    for (const a of B.accts) { const g = a.phases.funded; if (!g) continue;
      assert.ok(g.calBlocks <= g.days, id);
      if (g.firstPayDay !== null) assert.ok(calDay(g.firstPayDay) >= calDay(g.firstDay) + o.payFirstAfterCal, id); }
  }
});

test('M-005 Monatsabo: je weitere angefangene 30 Kalendertage, endet bei Bestehen oder Scheitern', () => {
  // 1 Trade pro Tag à 190: Ziel 4.180 an Tag 22 (Kalendertag 30) → 1 Monat; 4.370 an Tag 23 (31) → 2 Monate
  const run = over => simulate(det({ target: 4180, feeMonthly: 50, n: 3, ...over }), 1);
  const A = run({}), B = run({ target: 4370 });
  assert.deepStrictEqual([A.accts[0].phases.step1.days, A.list[0].feesPaid], [22, 100]);
  assert.deepStrictEqual([B.accts[0].phases.step1.days, B.list[0].feesPaid], [23, 150]);
  // Funded-Tage zählen nicht: Account läuft weit über 30 Kalendertage, Abo bleibt bei 1 bzw. 2 Monaten
  assert.ok(B.list[0].calDays > 31);
  // Scheitern: 110 $ Verlust je Trade, DD 3.000 → gescheitert an Tag 28 (Kalendertag 38) → 2 Monate
  const F = simulate(det({ wr: 0, dd: 3000, feeMonthly: 50, n: 2 }), 1);
  assert.deepStrictEqual([F.fail, F.list[0].days, F.list[0].calDays, F.list[0].feesPaid], [2, 28, 38, 150]);
  // Instant: kein Abo
  assert.strictEqual(fundD({ feeMonthly: 50 }).list[0].feesPaid, 100);
  // Alpha Futures: feesPaid = fee × Monate, nie kleiner als fee
  const o = byId('af-adv-50'), R = simulate(offerP(o, { ...withCal(o) }), SEED);
  assert.ok(R.list.every(x => x.feesPaid >= o.fee && Number.isInteger(Math.round((x.feesPaid / o.fee) * 1e9) / 1e9)));
  assert.ok(R.list.some(x => x.feesPaid > o.fee), 'mindestens ein Account zahlt mehr als einen Monat');
});

test('M-005 Aktivierung: nur bei bestandener Challenge, nie bei Instant', () => {
  const P = simulate(det({ feeActivation: 30 }), 1), L = simulate(det({ wr: 0, feeActivation: 30 }), 1);
  assert.ok(P.list.every(x => x.res !== 'fail' && x.feesPaid === 130));
  assert.ok(L.list.every(x => x.res === 'fail' && x.feesPaid === 100));
  assert.ok(fundD({ feeActivation: 30 }).list.every(x => x.feesPaid === 100));
});

test('M-005 Summen: R.fees = Σ feesPaid, netNo = pay − feesPaid je Zeile', () => {
  for (const id of ['af-zero-25', 'af-adv-150', 'bg-cfd-1step-50']) {
    const o = byId(id), R = simulate(offerP(o, { tradesPerDay: 1, ...withCal(o), feeActivation: 7 }), SEED);
    const sum = R.list.reduce((a, x) => a + x.feesPaid, 0);
    assert.ok(Math.abs(R.fees - sum) < 1e-6, id);
    for (const x of R.list) assert.ok(Math.abs(x.netNo - (x.pay - x.feesPaid)) < 1e-9, id);
    assert.ok(Math.abs(R.netNo - R.list.reduce((a, x) => a + x.netNo, 0)) < 1e-6, id);
  }
});

test('M-005 Zusammenspiel: Tage und Kalender müssen beide erfüllt sein', () => {
  // 2 Handelstage je Zyklus allein → Tag 2; 48 h allein → Tag 3; beide → Tag 3 (Auszahlung ohne Trade)
  const d = fundD({ payMinDays: 2 }).accts[0].phases.funded, c = fundD({ payFirstAfterCal: 2 }).accts[0].phases.funded;
  const b = fundD({ payMinDays: 2, payFirstAfterCal: 2 }).accts[0].phases.funded;
  assert.deepStrictEqual([d.firstPayDay, c.firstPayDay, b.firstPayDay], [2, 3, 3]);
  assert.deepStrictEqual(b.dayPnl.slice(0, 2), [380, 190]);
  assert.ok(b.daysBlocks >= 1 && b.calBlocks >= 1);
  // Consistency blockiert vor dem Kalender: Tage mit Consistency-Blockade zählen nicht als calBlocks
  const k = fundD({ consFunded: 40, payFirstAfterCal: 1 }).accts[0].phases.funded, k0 = fundD({ consFunded: 40 }).accts[0].phases.funded;
  assert.strictEqual(k.consBlocks, k0.consBlocks);
  assert.strictEqual(k.calBlocks, 0, 'Consistency gibt erst nach dem Freigabetag frei');
});

test('M-005 Daten: Kalender- und Gebührenfelder aus rules, Anzahl je Anbieter, keine Inaktivitäts-Konflikte', () => {
  const firm = g => g.split(' · ')[0] + (/^Blue Guardian · Futures/.test(g) ? ' Futures' : '');
  const cnt = {};
  for (const gr of OFFERS) for (const o of gr.items) {
    const r = o.rules || {}, c = cnt[firm(gr.g)] = cnt[firm(gr.g)] || [0, 0, 0, 0];
    for (const k of CAL_KEYS) assert.ok(typeof o[k] === 'number' && o[k] >= 0, o.id + ' ' + k);
    if (o.payFirstAfterCal) c[0]++; if (o.payEveryCal) c[1]++; if (o.feeMonthly) c[2]++; if (o.feeActivation) c[3]++;
    if (o.feeMonthly) assert.strictEqual(o.feeMonthly, r.price, o.id);
    assert.strictEqual(o.feeMonthly > 0, r.billing === 'monthly', o.id);
    if (r.inactivityDays != null) assert.ok(r.inactivityDays > Math.max(o.payFirstAfterCal, o.payEveryCal), o.id + ' Pause länger als Inaktivität');
  }
  assert.deepStrictEqual(cnt, {
    'Alpha Futures': [0, 0, 9, 0], 'Lucid Trading': [0, 0, 0, 0], MyFundedFutures: [12, 0, 0, 0], 'FundedNext Futures': [3, 3, 0, 0],
    'Alpha Capital': [0, 0, 0, 0], 'Blue Guardian': [22, 22, 0, 0], 'Blue Guardian Futures': [4, 0, 0, 0] });
  // id: [payFirstAfterCal, payEveryCal, feeMonthly]
  const EXP = { 'mf-rapid-50': [1, 0, 0], 'mf-builder-50': [2, 0, 0], 'mf-pro-50': [14, 0, 0], 'bg-fut-std-50': [3, 0, 0],
    'bg-fut-express-50': [0, 0, 0], 'bg-cfd-instant-50': [0, 0, 0], 'bg-cfd-1step-50': [14, 14, 0], 'bg-cfd-1step-nano-50': [7, 7, 0],
    'bg-cfd-2step-nano-50': [14, 14, 0], 'fn-rp-50': [3, 3, 0], 'fn-rd-50': [0, 0, 0], 'fn-direct-50': [0, 0, 0],
    'af-std-50': [0, 0, 129], 'af-adv-150': [0, 0, 489], 'af-direct-50': [0, 0, 0], 'lu-direct-50': [0, 0, 0], 'ac-d-100': [0, 0, 0] };
  for (const [id, e] of Object.entries(EXP)) assert.deepStrictEqual(CAL_KEYS.slice(0, 3).map(k => byId(id)[k]), e, id);
  // PRESETS ohne neue Felder
  for (const k of Object.keys(PRESETS)) for (const f of [...CAL_KEYS, 'calCompliant']) assert.strictEqual(PRESETS[k][f], undefined, k + ' ' + f);
});

// ---- Slippage am Stop-Loss (M-017) ----
const SLIP_KEYS = ['slipMode', 'slipPct', 'slipTailPct', 'slipTailProb', 'slipBuffer'];
// Alle Kernfelder eines Angebots (DLL, Consistency, Tage, Kalender) mit den Trading-Parametern von offerP
const fullP = (o, over) => offerP(o, { ...Object.fromEntries(Object.keys(o).filter(k => /^(dll|cons|eval|pay|fee)/.test(k)).map(k => [k, o[k]])), fee: o.fee, ...over });
// Immer Verlust (wr 0), 2 Trades pro Tag, Tageslimit 250 $: 2 × 110 $ ohne Slippage erlaubt, 2 × 130 $ mit 20 % reißt es
const lossDay = over => simulate(det({ wr: 0, target: 1e9, dd: 10000, ddStatic: true, tradesPerDay: 2, dllEval: 250, n: 1, ...over }), 1);

test('M-017 bit-identisch: ohne Felder = none = fixed 0 % = dist 0 % (alle Angebote, PRESETS, tpd 1 und 3)', () => {
  const vars = [{ slipMode: 'none' }, { slipMode: 'fixed', slipPct: 0 }, { slipMode: 'dist', slipPct: 0, slipTailPct: 0, slipTailProb: 0.5 }];
  for (const tpd of [1, 3]) {
    for (const o of ALL) {
      let A; try { A = simulate(fullP(o, { n: 200, tradesPerDay: tpd }), SEED); } catch (e) { continue; } // Gewinntag-Schwelle unerreichbar
      const a = JSON.stringify(A);
      for (const v of vars) assert.strictEqual(JSON.stringify(simulate(fullP(o, { n: 200, tradesPerDay: tpd, ...v }), SEED)), a, o.id + ' ' + JSON.stringify(v));
      assert.strictEqual(A.slipPaid, 0, o.id);
    }
    for (const k of Object.keys(PRESETS)) {
      const a = JSON.stringify(simulate(prepare({ ...PRESETS[k], tradesPerDay: tpd }), SEED));
      for (const v of vars) assert.strictEqual(JSON.stringify(simulate(prepare({ ...PRESETS[k], tradesPerDay: tpd, ...v }), SEED)), a, k);
    }
  }
  // Golden (M-001) mit fixed 0 %
  for (const k of Object.keys(GOLD)) assert.deepStrictEqual(kpi(simulate(prepare({ ...PRESETS[k], n: 2000, slipMode: 'fixed', slipPct: 0 }), SEED), 2000), GOLD[k], k);
  for (const k of Object.keys(PRESETS)) for (const f of SLIP_KEYS) assert.strictEqual(PRESETS[k][f], undefined, k + ' ' + f);
  for (const o of ALL) for (const f of SLIP_KEYS) assert.strictEqual(o[f], undefined, o.id + ' ' + f);
});

// Ziel und DD unerreichbar: 500 Trades bis MAXT, 1 Trade pro Tag
const streamRun = over => simulate(det({ wr: 50, target: 1e9, dd: 1e9, n: 1, ...over }), SEED).accts[0].phases.step1;

test('M-017 Gewinn-Trades ohne Slippage: Gewinn-Tage unverändert, auch bei dist', () => {
  const A = streamRun({}), B = streamRun({ slipMode: 'dist', slipPct: 5, slipTailPct: 100, slipTailProb: 0.1 });
  let wins = 0;
  A.dayPnl.forEach((x, i) => { if (x > 0) { wins++; assert.strictEqual(B.dayPnl[i], 190, 'Tag ' + i); } else assert.ok(B.dayPnl[i] <= -115, 'Tag ' + i); });
  assert.ok(wins > 200, 'Gewinne ' + wins);
});

test('M-017 Zufallsstrom: gleiche Trades, Verluste um slip teurer', () => {
  const A = streamRun({}), B = streamRun({ slipMode: 'fixed', slipPct: 10 });
  assert.strictEqual(A.days, 500); assert.strictEqual(B.days, 500);
  let losses = 0;
  A.dayPnl.forEach((x, i) => {
    if (x > 0) assert.strictEqual(B.dayPnl[i], x, 'Gewinn-Tag ' + i);
    else { losses++; assert.strictEqual(x, -110); assert.strictEqual(B.dayPnl[i], -120, 'Verlust-Tag ' + i); }
  });
  assert.ok(losses > 200 && losses < 300, 'Verluste ' + losses);
  const sum = xs => xs.reduce((a, b) => a + b, 0);
  assert.strictEqual(sum(B.dayPnl) - sum(A.dayPnl), -10 * losses);
});

test("M-017 dist: Anteil der Ausreißer ≈ slipTailProb, dist mit Anteil 0 = fixed", () => {
  const R = simulate(det({ wr: 40, target: 1e9, dd: 1e9, n: 20, slipMode: 'dist', slipPct: 5, slipTailPct: 100, slipTailProb: 0.1 }), SEED);
  let norm = 0, tail = 0;
  for (const a of R.accts) for (const x of a.phases.step1.dayPnl) { if (x === -115) norm++; else if (x === -210) tail++; else assert.strictEqual(x, 190); }
  const share = tail / (norm + tail);
  assert.ok(norm + tail > 3000, 'Verluste (12 Detail-Accounts) ' + (norm + tail));
  assert.ok(Math.abs(share - 0.1) < 0.02, 'Anteil ' + share.toFixed(4));
  const f = { ...PRESETS.edge, n: 1000, tradesPerDay: 3 };
  assert.strictEqual(JSON.stringify(simulate(prepare({ ...f, slipMode: 'dist', slipPct: 10, slipTailPct: 80, slipTailProb: 0 }), SEED)),
    JSON.stringify(simulate(prepare({ ...f, slipMode: 'fixed', slipPct: 10, slipTailPct: 80, slipTailProb: 0.3 }), SEED)));
});

test('M-017 regeltreu: DLL-Bruch durch Slippage, soft beendet den Tag, hard die Challenge', () => {
  const none = lossDay({}).accts[0].phases.step1;
  assert.deepStrictEqual([none.dayPnl[0], none.dllSlipBreaches, none.dllBreaches], [-220, 0, 0], 'ohne Slippage kein Bruch');
  const soft = lossDay({ slipMode: 'fixed', slipPct: 20 }).accts[0].phases.step1;
  // 38 Tage mit −260 $ (Bruch durch Slippage), Tag 39: −9.880 − 130 = −10.010 ≤ −10.000
  assert.deepStrictEqual([soft.days, soft.dayPnl[0], soft.dllSlipBreaches, soft.dllBreaches, soft.dllStops], [39, -260, 38, 0, 0]);
  const hR = lossDay({ slipMode: 'fixed', slipPct: 20, dllType: 'hard' }), hard = hR.accts[0].phases.step1;
  assert.deepStrictEqual([hard.days, hard.dayPnl[0], hard.dllSlipBreaches, hard.dllBreaches, hR.fail], [1, -260, 1, 1, 1]);
  assert.strictEqual(hR.days.step1.dllSlipBreaches, 1); assert.strictEqual(hR.days.step1.dllBreaches, 1);
  // nicht regeltreu: der Bruch zählt nur als durch Slippage, wenn er ohne die Slippage dieses Trades nicht entstanden wäre
  const nc = lossDay({ slipMode: 'fixed', slipPct: 20, dllCompliant: false, dllEval: 200 }).accts[0].phases.step1;
  assert.strictEqual(nc.dllSlipBreaches, 0, '2 × 110 $ reißt 200 $ auch ohne Slippage');
});

test('M-017 DD-Bruch durch Slippage: ohne die Slippage des Trades bliebe eq über dem Floor', () => {
  const soft = lossDay({ slipMode: 'fixed', slipPct: 20 });
  assert.strictEqual(soft.accts[0].phases.step1.ddSlipBreaches, 1, '−10.010 $, ohne die 20 $ −9.990 $');
  assert.strictEqual(soft.days.step1.ddSlipBreaches, 1);
  // ohne Slippage: 45 Tage × −220 $ = −9.900, Tag 46: −10.010 → Bruch, aber nicht durch Slippage
  const none = lossDay({}).accts[0].phases.step1;
  assert.deepStrictEqual([none.days, none.ddSlipBreaches], [46, 0]);
  // Bruch auch ohne die Slippage dieses Trades (dd 9.950: −9.880 − 110 = −9.990 ≤ −9.950) zählt nicht
  assert.strictEqual(lossDay({ slipMode: 'fixed', slipPct: 20, dd: 9950 }).accts[0].phases.step1.ddSlipBreaches, 0);
});

test('M-017 Puffer: mit slipBuffer = slipPct kein DLL-Bruch durch Slippage', () => {
  const R = lossDay({ slipMode: 'fixed', slipPct: 20, slipBuffer: 20 }), ph = R.accts[0].phases.step1;
  // 2. Trade verweigert: −130 − (120 + 10) = −260 ≤ −250
  // jeder Tag bis auf den letzten (DD-Bruch mit dem 1. Trade) endet durch Verweigerung
  assert.deepStrictEqual([ph.dayPnl[0], ph.dllSlipBreaches, ph.dllStops, ph.days], [-130, 0, 76, 77]);
  for (const id of ['lu-flex-50', 'ac-one-50']) {
    const o = byId(id), B = simulate(fullP(o, { n: 500, tradesPerDay: 3, slipMode: 'fixed', slipPct: 20, slipBuffer: 20 }), SEED);
    for (const k of ['step1', 'funded']) assert.strictEqual(B.days[k].dllSlipBreaches, 0, id + ' ' + k);
  }
});

test('M-017 prepare() wirft, wenn risk × (1 + slipBuffer/100) + cost ein Limit im Modus erreicht', () => {
  // 100 × (1 + 1,5) + 10 = 260 ≥ 250
  assert.throws(() => det({ dllEval: 250, slipBuffer: 150 }), /dllEval \(250 \$\).*slipBuffer/);
  assert.throws(() => det({ mode: 'instant', target: 0, dllFunded: 250, slipBuffer: 150 }), /dllFunded/);
  assert.throws(() => det({ dllScaleFunded: 0.5, dllScaleFrom: 400, slipBuffer: 150 }), /Scaling/);
  // Instant: dllEval wirkt nicht; ohne Limit ist jeder Puffer erlaubt
  assert.doesNotThrow(() => det({ mode: 'instant', target: 0, dllEval: 250, slipBuffer: 150 }));
  assert.doesNotThrow(() => det({ slipBuffer: 1000 }));
  assert.doesNotThrow(() => det({ dllEval: 250, slipBuffer: 130 }));
});

test('M-017 Gegentrade: TP ohne Slippage bei Prop-Verlust, eigener Stop rutscht bei Prop-Gewinn', () => {
  // h = 10 %, risk 100, rr 2, cost 10, Slippage 20 % = 20 $
  const hedgeOf = over => simulate(det({ hp: 10, n: 1, ...over }), 1).accts[0];
  // immer Gewinn: 6 Trades bis zum Ziel 1.000 (6 × 190), je −0,1 × 200 − 0,1 × 20 − 0,1 × 10 = −23
  const w0 = hedgeOf({}), w = hedgeOf({ slipMode: 'fixed', slipPct: 20 });
  assert.strictEqual(w.phases.step1.days, 6);
  assert.ok(Math.abs(w0.hedgeEval - 6 * -21) < 1e-9, String(w0.hedgeEval));
  assert.ok(Math.abs(w.hedgeEval - 6 * -23) < 1e-9, String(w.hedgeEval));
  assert.strictEqual(w.slipPaid, 0, 'Gewinn-Trades ohne Slippage auf dem Prop-Konto');
  // immer Verlust: je +0,1 × 100 − 0,1 × 10 = +9, mit und ohne Slippage gleich
  const l0 = hedgeOf({ wr: 0 }), l = hedgeOf({ wr: 0, slipMode: 'fixed', slipPct: 20 });
  assert.ok(Math.abs(l0.hedgeEval / l0.trades - 9) < 1e-9 && Math.abs(l.hedgeEval / l.trades - 9) < 1e-9);
  assert.ok(l.trades < l0.trades, 'mit Slippage früher am DD');
});

test('M-017 slipPaid: Summe der Slippage je Account in R.list und gesamt in R', () => {
  const R = lossDay({ slipMode: 'fixed', slipPct: 20 });
  assert.strictEqual(R.accts[0].slipPaid, 20 * R.accts[0].trades);
  assert.strictEqual(R.list[0].slipPaid, 20 * 77, '38 Tage × 2 + 1 Trade');
  const E = simulate(prepare({ ...PRESETS.edge, n: 500, slipMode: 'dist', slipPct: 5, slipTailPct: 100, slipTailProb: 0.02 }), SEED);
  assert.ok(E.slipPaid > 0);
  assert.ok(Math.abs(E.slipPaid - E.list.reduce((a, x) => a + x.slipPaid, 0)) < 1e-6);
  assert.ok(E.list.every(x => x.slipPaid >= 0));
  assert.strictEqual(simulate(prepare({ ...PRESETS.edge, n: 500 }), SEED).slipPaid, 0);
});

test('M-017 prepare() prüft die Slippage-Felder', () => {
  for (const [k, v] of [['slipMode', 'gap'], ['slipMode', 1], ['slipPct', -1], ['slipPct', '5'], ['slipPct', NaN], ['slipTailPct', -5],
    ['slipTailPct', Infinity], ['slipTailProb', 1], ['slipTailProb', -0.1], ['slipTailProb', '0.1'], ['slipBuffer', -1], ['slipBuffer', null]])
    assert.throws(() => prepare({ ...PRESETS.futures, [k]: v }), new RegExp(k), k + ' ' + String(v));
  const P = prepare({ ...PRESETS.futures });
  assert.deepStrictEqual(SLIP_KEYS.map(k => P[k]), ['none', 0, 0, 0, 0]);
  assert.doesNotThrow(() => prepare({ ...PRESETS.futures, slipMode: 'dist', slipPct: 5, slipTailPct: 100, slipTailProb: 0.999 }));
});

test('M-017 nie weicher: Referenz-Angebote und PRESETS mit Slippage nie besser', () => {
  for (const id of ['af-std-50', 'ac-one-50', 'bg-cfd-instant-100', 'lu-flex-50']) for (const tpd of [1, 3]) {
    const o = byId(id), A = simulate(fullP(o, { n: 1000, tradesPerDay: tpd }), SEED);
    for (const v of [{ slipMode: 'fixed', slipPct: 5 }, { slipMode: 'fixed', slipPct: 20 }, { slipMode: 'dist', slipPct: 5, slipTailPct: 100, slipTailProb: 0.02 }]) {
      const B = simulate(fullP(o, { n: 1000, tradesPerDay: tpd, ...v }), SEED);
      assert.ok(B.netNo < A.netNo && B.netHe < A.netHe, `${id} tpd ${tpd} ${JSON.stringify(v)}: ${B.netNo} vs ${A.netNo}`);
    }
  }
  for (const k of ['futures', 'edge']) {
    const A = simulate(prepare({ ...PRESETS[k], n: 2000 }), SEED), B = simulate(prepare({ ...PRESETS[k], n: 2000, slipMode: 'fixed', slipPct: 10 }), SEED);
    assert.ok(B.netNo < A.netNo && B.netHe < A.netHe && B.passed < A.passed, k);
  }
});

// ---- M-010h Datenpaket ----
test('M-010h Rapid EOD 25k: Kernfelder aus rules, im Kern bis auf Preis wie Rapid 25k', () => {
  const o = byId('mf-rapid-eod-25'), r = o.rules, rap = byId('mf-rapid-25');
  assert.strictEqual(o.n, 'Rapid EOD 25k');
  assert.deepStrictEqual([o.fee, r.codePrice, r.price, o.list, o.code, r.codeMaxUses], [87, 87, 145, '145 $ einmalig', 'CLUB', 2]);
  assert.deepStrictEqual([o.target, o.target2, o.dd, r.mll, o.buf], [1500, 0, 1000, 1000, 1100]);
  assert.deepStrictEqual([r.mllTypeEval, r.mllTypeFunded], ['eod-trailing-lock-start100', 'eod-trailing-lock-start100']);
  assert.deepStrictEqual([r.consEval, r.consFunded, o.consEval, o.consFunded], [30, null, 30, 0]);
  assert.deepStrictEqual([r.minDaysEval, o.evalMinDays, o.payMinDays, o.payWinDays], [4, 4, 0, 0]);
  assert.deepStrictEqual([r.payoutMin, r.cycleProfitMin, o.minp, o.cap, o.split, o.maxp, o.wfrac], [500, 250, 500, 10000, 90, 5, 100]);
  assert.deepStrictEqual([r.maxMini, r.maxMicro, r.firstPayoutAfterHours, o.payFirstAfterCal], [2, 20, 24, 1]);
  assert.deepStrictEqual([o.dllEval, o.dllFunded], [0, 0]);
  assert.ok(o.note.includes('im Kern bis auf Preis gleich mit Rapid') && o.note.includes('Abruf 17.10.2026 (Orchestrator)') && o.note.includes('16727601'));
  assert.ok(!ALL.some(x => x.id === 'mf-rapid-eod-50'), 'Rapid EOD 50k ohne belegten Preis');
  // gleiche Kernfelder wie Rapid 25k außer consEval und evalMinDays
  for (const k of ['fee', 'target', 'dd', 'buf', 'minp', 'cap', 'split', 'maxp', 'wfrac', 'consFunded', 'payFirstAfterCal'])
    assert.strictEqual(o[k], rap[k], k);
});

test('M-010h BG CFD: Instant minp 500 $ (Rise), übrige CFD 100 $', () => {
  const BGC = OFFERS.find(gr => gr.g === 'Blue Guardian · CFD').items;
  for (const o of BGC) {
    const inst = o.id.startsWith('bg-cfd-instant-');
    assert.strictEqual(o.minp, inst ? 500 : 100, o.id);
    assert.strictEqual(o.rules.payoutMin, inst ? 500 : 100, o.id);
    if (inst) assert.ok(o.note.includes('$100 via crypto and $500 via rise') && o.note.includes('Abruf 17.10.2026 (Orchestrator)'), o.id);
  }
});

test('M-010h Lucid Direct: 10 Handelstage je Zyklus, Zyklusziele laut Quelle', () => {
  const GOALS = { 25: [1500, 1250], 50: [3000, 2500], 100: [6000, 3500], 150: [9000, 4500] };
  for (const [k, g] of Object.entries(GOALS)) {
    const o = byId('lu-direct-' + k);
    assert.deepStrictEqual([o.rules.minDaysPayout, o.payMinDays, o.payWinDays, o.evalMinDays], [10, 10, 0, 0], o.id);
    assert.deepStrictEqual([o.rules.cycleTarget1, o.rules.cycleTarget2, o.minp], [g[0], g[1], g[0]], o.id);
    assert.ok(o.note.includes('Trading Days: 10') && o.note.includes('12890164'), o.id);
  }
});

// ---- Guardian Shield (Blue Guardian CFD) und Max Risk (Alpha Capital), M-019 ----
// Instant wie bg-cfd-instant-100: risk + cost = 1.000 $ = Shield
const SH = { mode: 'instant', fee: 405, target: 0, target2: 0, dd: 6000, risk: 980, rr: 1.5, wr: 46, cost: 20, hp: 0,
  buf: 1000, minp: 500, wfrac: 100, cap: 100000, split: 77.6, maxp: 5, n: 400 };
const noShield = R => {
  const c = JSON.parse(JSON.stringify(R));
  delete c.shieldBreaches; delete c.shieldLost;
  for (const k in c.days) if (c.days[k]) delete c.days[k].shieldBreaches;
  for (const l of c.list) { delete l.shieldBreaches; delete l.shieldLost; }
  for (const a of c.accts) { delete a.shieldLost; for (const k in a.phases) if (a.phases[k]) delete a.phases[k].shieldBreaches; }
  return JSON.stringify(c);
};

test('M-019 aus: shield 0 und fehlende Felder sind bit-identisch (PRESETS, Handfall ohne Shield)', () => {
  for (const k in PRESETS) assert.deepStrictEqual(simulate(prepare({ ...PRESETS[k], n: 300 }), SEED), simulate(prepare({ ...PRESETS[k], n: 300, shield: 0, shieldSplit: 50, shieldStrikes: 2 }), SEED), k);
  const R = simulate(prepare(SH), SEED);
  assert.strictEqual(R.shieldBreaches, 0); assert.strictEqual(R.shieldLost, 0);
  assert.ok(R.list.every(l => l.shieldBreaches === 0 && l.shieldLost === false));
});

test('M-019 Grenze ≥: risk + cost = shield ist ein Bruch, knapp darüber keiner (bit-gleich)', () => {
  const A = simulate(prepare(SH), SEED);
  const B = simulate(prepare({ ...SH, shield: 1000.01 }), SEED);
  assert.strictEqual(noShield(B), noShield(A)); assert.strictEqual(B.shieldBreaches, 0);
  const C = simulate(prepare({ ...SH, shield: 1000 }), SEED);
  assert.ok(C.shieldBreaches > 0 && C.shieldLost > 0);
  // jeder Funded-Verlust zählt: höchstens 2 Brüche, beim 2. Account verloren
  for (const l of C.list) { assert.ok(l.shieldBreaches <= 2); assert.strictEqual(l.shieldLost, l.shieldBreaches === 2, 'Account ' + l.i); }
  assert.strictEqual(C.shieldBreaches, C.list.reduce((s, l) => s + l.shieldBreaches, 0));
  assert.strictEqual(C.shieldLost, C.list.filter(l => l.shieldLost).length);
  assert.strictEqual(C.days.funded.shieldBreaches, C.shieldBreaches / C.days.funded.n);
  for (const a of C.accts) { const losses = a.phases.funded.dayPnl.filter(x => x < 0).length;
    assert.strictEqual(a.phases.funded.shieldBreaches, Math.min(2, losses)); }
});

test('M-019 Split: ab dem 1. Bruch shieldSplit für alle folgenden Auszahlungen, Trades bit-gleich', () => {
  const A = simulate(prepare({ ...SH, n: 300 }), SEED), B = simulate(prepare({ ...SH, n: 300, shield: 1000, shieldStrikes: 99, shieldSplit: 48.5 }), SEED);
  // gleicher Split wie ohne Bruch: nur die Zähler unterscheiden sich
  const C = simulate(prepare({ ...SH, n: 300, shield: 1000, shieldStrikes: 99, shieldSplit: 77.6 }), SEED);
  assert.strictEqual(noShield(C), noShield(A));
  let before = 0, mixed = 0;
  for (let i = 0; i < 300; i++) {
    const a = A.list[i], b = B.list[i];
    assert.deepStrictEqual([b.trades, b.days, b.nPay, b.daysToFirstPay], [a.trades, a.days, a.nPay, a.daysToFirstPay], 'Account ' + i);
    assert.ok(b.pay <= a.pay + 1e-9);
  }
  for (let i = 0; i < 12; i++) {
    const fa = A.accts[i].phases.funded, fb = B.accts[i].phases.funded;
    if (!fa.payDays.length) continue;
    const firstLoss = fa.firstDay + fa.dayPnl.findIndex(x => x < 0);
    if (fa.dayPnl.every(x => x >= 0)) { assert.strictEqual(B.accts[i].pay, A.accts[i].pay); continue; }
    if (firstLoss < fa.payDays[0]) { before++; assert.ok(Math.abs(B.accts[i].pay - A.accts[i].pay * 48.5 / 77.6) < 1e-6, 'Account ' + i); }
    else if (firstLoss < fa.payDays[fa.payDays.length - 1]) { mixed++; assert.ok(B.accts[i].pay < A.accts[i].pay && B.accts[i].pay > A.accts[i].pay * 48.5 / 77.6, 'Account ' + i); }
    assert.ok(fb.shieldBreaches > 0);
  }
  assert.ok(before > 0 && mixed > 0, `${before} / ${mixed}`);
});

test('M-019 Max Risk (shieldStrikes 1): 1. Bruch beendet den Account', () => {
  const R = simulate(prepare({ ...SH, shield: 1000, shieldStrikes: 1 }), SEED);
  assert.ok(R.shieldLost > 0);
  for (const l of R.list) { assert.ok(l.shieldBreaches <= 1); assert.strictEqual(l.shieldLost, l.shieldBreaches === 1); }
  for (const a of R.accts) if (a.phases.funded.dayPnl.some(x => x < 0)) assert.ok(a.shieldLost && a.blown && a.phases.funded.dayPnl[a.phases.funded.dayPnl.length - 1] < 0);
});

test('M-019 Challenge: Shield wirkt nie, nur im Funded', () => {
  const C = { ...SH, mode: 'challenge', target: 4500, target2: 0, fee: 259, buf: 1000, minp: 100 };
  const A = simulate(prepare(C), SEED), B = simulate(prepare({ ...C, shield: 1000, shieldStrikes: 99, shieldSplit: 77.6 }), SEED);
  assert.strictEqual(noShield(B), noShield(A));
  assert.strictEqual(B.days.step1.shieldBreaches, 0); assert.ok(B.days.funded.shieldBreaches > 0);
  for (const a of B.accts) assert.strictEqual(a.phases.step1.shieldBreaches, 0);
  // 2 Brüche: das 1. Account hat dieselbe Challenge
  const D = simulate(prepare({ ...C, shield: 1000 }), SEED);
  assert.deepStrictEqual(D.accts[0].phases.step1, A.accts[0].phases.step1);
});

test('M-019 Reihenfolge: Drawdown vor Shield, Shield vor DLL', () => {
  // Ein Verlust bricht den DD: kein Shield-Bruch
  const R = simulate(prepare({ ...SH, dd: 1000, buf: 0, shield: 1000 }), SEED);
  assert.strictEqual(R.shieldBreaches, 0); assert.strictEqual(R.shieldLost, 0);
  // Slippage 10 %: Verlust 1.098 $ bricht Shield und hartes DLL (1.050 $) beim selben Trade
  const D = { ...SH, dllFunded: 1050, dllType: 'hard', slipMode: 'fixed', slipPct: 10, shield: 1000 };
  const S1 = simulate(prepare({ ...D, shieldStrikes: 1 }), SEED);
  assert.ok(S1.shieldLost > 0); assert.strictEqual(S1.days.funded.dllBreaches, 0);
  const S2 = simulate(prepare(D), SEED);
  // 1. Verlust: Shield-Bruch 1, danach bricht das DLL den Account; der Shield beendet ihn nie
  assert.strictEqual(S2.shieldLost, 0); assert.ok(S2.list.every(l => l.shieldBreaches <= 1));
  assert.strictEqual(S2.days.funded.dllBreaches, S2.shieldBreaches / S2.days.funded.n);
});

test('M-019 prepare wirft bei ungültigen Shield-Werten', () => {
  for (const bad of [{ shield: -1 }, { shield: '1000' }, { shield: NaN }, { shieldSplit: -1 }, { shieldSplit: 101 }, { shieldStrikes: 0 }, { shieldStrikes: 1.5 }, { shieldStrikes: '2' }])
    assert.throws(() => prepare({ ...SH, ...bad }), JSON.stringify(bad));
  prepare({ ...SH, shield: 1000, shieldSplit: 0, shieldStrikes: 1 });
});

test('M-019 Angebote: BG CFD und Alpha Capital mit Shield aus vorhandenen rules-Schlüsseln, sonst 0', () => {
  for (const o of ALL) {
    const r = o.rules || {}, bg = r.guardianShieldPct > 0, ac = o.id.startsWith('ac-');
    if (bg) assert.deepStrictEqual([o.shield, o.shieldSplit, o.shieldStrikes], [r.size * r.guardianShieldPct / 100, 48.5, 2], o.id);
    else if (ac) assert.deepStrictEqual([o.shield, o.shieldStrikes], [r.size * r.maxRiskPct / 100, 1], o.id);
    else assert.strictEqual(o.shield, 0, o.id);
    if (bg || ac) { assert.strictEqual(o.shield, o.maxRisk, o.id); assert.ok(o.note.includes(bg ? '14061082' : '15888623') && o.note.includes('Abruf 17.10.2026 (Orchestrator)'), o.id); }
  }
  assert.strictEqual(ALL.filter(o => o.shield > 0).length, 49);
});

// ---- M-021: Detail für jeden Account (opt {from, skip, detail}, accountDetail) ----
const { accountDetail } = require('../js/sim.js');
const { autoParams } = require('../js/params.js');
const J = x => JSON.stringify(x);
// Strategien mit Slippage, 3 Trades je Tag, Gegentrade im Funded und ohne Regeltreue (mehr Wege durch den Kern)
const M21_UI = [
  { wr: 46, rr: 1.5, tradesPerDay: 1 },
  { wr: 52, rr: 1.2, tradesPerDay: 3, slipMode: 'dist', slipPct: 5, slipTailPct: 100, slipTailProb: 0.02, slipBuffer: 10,
    hfund: true, dllCompliant: false, consCompliant: false, daysCompliant: false }
];
const m21P = (o, ui, n) => { const P0 = autoParams(o, { ...ui, n }); return P0.notTradable ? null : prepare(P0); };

test('M-021 ohne opt bzw. mit leerem opt bit-gleich, detail ändert nur R.accts', () => {
  for (const ui of M21_UI) for (const id of ['af-std-50', 'bg-cfd-instant-50', 'ac-d-50', 'lu-direct-50', 'mf-builder-50']) {
    const P = m21P(ALL.find(o => o.id === id), ui, 300); if (!P) continue;
    const a = simulate(P, SEED), b = simulate(P, SEED, {}), c = simulate(P, SEED, { detail: [5, 40, 299] });
    assert.strictEqual(J(a), J(b), id);
    assert.strictEqual(J({ ...c, accts: c.accts.slice(0, 12) }), J(a), id);
    assert.strictEqual(c.accts.length, 14, id);
  }
  for (const k of Object.keys(PRESETS)) { const P = prepare(PRESETS[k]); assert.strictEqual(J(simulate(P, SEED, {})), J(simulate(P, SEED)), k); }
});

test('M-021 accountDetail: jeder Account aller Angebote gleich R.list[i], i < 12 gleich R.accts[i], ohne Rückfall', () => {
  let n = 0;
  for (const ui of M21_UI) for (const o of ALL) {
    const P = m21P(o, ui, 60); if (!P) continue;
    const R = simulate(P, 7);
    for (let i = 0; i < P.n; i++) {
      const d = accountDetail(P, 7, R.list, i); n++;
      assert.strictEqual(d.fallback, false, o.id + ' #' + i);
      if (i < 12) assert.strictEqual(J(d.acct), J(R.accts[i]), o.id + ' #' + i);
    }
  }
  // Video-Szenarien (Gegentrade in der Challenge)
  for (const k of Object.keys(PRESETS)) {
    const P = prepare(PRESETS[k]), R = simulate(P, SEED);
    for (let i = 0; i < P.n; i += 37) { const d = accountDetail(P, SEED, R.list, i); n++; assert.strictEqual(d.fallback, false, k + ' #' + i); if (i < 12) assert.strictEqual(J(d.acct), J(R.accts[i]), k); }
  }
  assert.ok(n > 10000, 'zu wenige Accounts geprüft: ' + n);
});

test('M-021 Weg A (detail) und Weg B (from/skip) liefern dasselbe Detail für Accounts ab 12', () => {
  for (const ui of M21_UI) for (const id of ['af-std-50', 'bg-cfd-2step-100', 'ac-one-50', 'fn-flex-50']) {
    const P = m21P(ALL.find(o => o.id === id), ui, 500); if (!P) continue;
    const R = simulate(P, SEED);
    for (const i of [12, 250, 499]) {
      const A = simulate(P, SEED, { detail: [i] }), B = accountDetail(P, SEED, R.list, i);
      assert.strictEqual(J(B.acct), J(A.accts[12]), id + ' #' + i);
    }
  }
});

test('M-021 accountDetail: verfälschte Liste löst den Rückfall aus und liefert trotzdem das richtige Detail', () => {
  const P = m21P(ALL.find(o => o.id === 'af-std-50'), M21_UI[0], 200), R = simulate(P, SEED);
  const ok = accountDetail(P, SEED, R.list, 150);
  const bad = R.list.map(x => ({ ...x })); bad[3].trades += 1;
  const d = accountDetail(P, SEED, bad, 150);
  assert.strictEqual(d.fallback, true);
  assert.strictEqual(J(d.acct), J(ok.acct));
  const d5 = accountDetail(P, SEED, bad, 5);
  assert.strictEqual(d5.fallback, true); assert.strictEqual(J(d5.acct), J(R.accts[5]));
  assert.deepStrictEqual(accountDetail(P, SEED, bad, 150, true), { acct: null, fallback: true });
  assert.strictEqual(J(accountDetail(P, SEED, R.list, 150, true).acct), J(ok.acct));
  assert.throws(() => accountDetail(P, SEED, R.list, 200), /Index/);
  assert.throws(() => accountDetail(P, SEED, R.list, -1), /Index/);
});

console.log(`\n${passed} Tests bestanden${process.exitCode ? ', mindestens einer fehlgeschlagen' : ''}.`);
