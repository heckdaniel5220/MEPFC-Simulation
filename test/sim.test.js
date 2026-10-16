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

test('Blue Guardian hat 46 Einträge (30 CFD + 16 Futures), insgesamt 115 Angebote', () => {
  assert.strictEqual(BGC.length, 30);
  assert.strictEqual(BGF.length, 16);
  assert.strictEqual(OFFERS.reduce((s, gr) => s + gr.items.length, 0), 115);
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
  assert.strictEqual(by('bg-cfd-instant-100').minp, 100); // M-004: Gewinntage im Kern, minp = Mindestauszahlung
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
  accts: R.accts.map(a => ({ ...a, phases: 0 })), list: (R.list || []).map(x => ({ ...x, days: 0 })) });
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
  const CNT = { 'Alpha Futures': [13, 6, 10], 'Lucid': [16, 8, 8], 'MyFundedFutures': [11, 7, 4], 'FundedNext': [7, 3, 4], 'Alpha Capital': [19, 0, 19],
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
  assert.deepStrictEqual(v('lu-direct-50'), [0, 0, 0, 5, 0, 0]);
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
  assert.deepStrictEqual([ev, fu], [35, 49]);
  const minp = id => byId(id).minp;
  assert.deepStrictEqual(['af-zero-50', 'af-std-50', 'af-adv-50', 'lu-flex-150', 'fn-flex-50', 'bg-cfd-instant-400', 'bg-cfd-1step-nano-200', 'bg-fut-reserve-50'].map(minp),
    [400, 1000, 2000, 1000, 500, 100, 100, 100]);
  for (const p of Object.values(PRESETS)) for (const k of DAYS_KEYS) assert.ok(!(k in p));
});

console.log(`\n${passed} Tests bestanden${process.exitCode ? ', mindestens einer fehlgeschlagen' : ''}.`);
