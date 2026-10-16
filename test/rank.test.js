// Tests für die Rangliste (M-015a). Ausführen: node test/rank.test.js
const assert = require('assert');
const Rank = require('../js/rank.js');
const { rankOffers, rankOffersStep, createRankState, cancelRank, rowFromResult, sortRows, markTies, filterRows, quantile, ci95, codeMark } = Rank;

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
const near = (a, b, eps = 1e-9, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg || ''} ${a} ≠ ${b}`);

// ---- Stub-Daten: konstruierte Angebote, P und R, keine echte Simulation ----
const offer = (id, extra) => Object.assign({ id, n: 'Angebot ' + id, mode: 'challenge', fee: 100, dd: 2000, code: '–' }, extra);
const listOf = (rows) => rows.map((x, i) => Object.assign({ i, res: 'fail', trades: 1, days: 1, nPay: 0, pay: 0, hedge: 0 }, x));
// R mit vier Accounts: netNo −100, −100, 300, 500 → Mittel 150
function stubR(withDays = true) {
  const L = listOf([
    { netNo: -100, netHe: -40, hedge: 60, daysToFirstPay: null },
    { netNo: -100, netHe: -50, hedge: 50, daysToFirstPay: null },
    { netNo: 300, netHe: 250, hedge: -50, res: 'paid', nPay: 1, daysToFirstPay: 10 },
    { netNo: 500, netHe: 420, hedge: -80, res: 'paid', nPay: 2, daysToFirstPay: 20 }
  ]);
  if (!withDays) L.forEach(x => delete x.daysToFirstPay);
  return { list: L, passed: 3, paid: 2, nPayTot: 3 };
}
const stubP = (o, extra) => Object.assign({}, o, { n: 4, risk: 500, cost: 10, hp: 6.5 }, extra);

test('1 Kennzahlen inkl. Spanne an bekannten Zahlen', () => {
  const o = offer('x');
  const r = rowFromResult(o, stubP(o), stubR(), { g: 'Firma A · Futures · einmalig' });
  // s² = (250² + 250² + 150² + 350²) / 3 = 90000, s = 300, SE = 150, Spanne ± 294
  const half = 294;
  near(r.net, 150); near(r.netHalf, half); near(r.netLo, 150 - half); near(r.netHi, 150 + half);
  near(r.netHe, 145);
  near(r.roi, 1.5); near(r.roiLo, (150 - half) / 100); near(r.roiHi, (150 + half) / 100);
  near(r.netPer1k, 75);
  assert.strictEqual(r.pass, 0.75); assert.strictEqual(r.payout, 0.5); assert.strictEqual(r.avgPayouts, 0.75);
  assert.strictEqual(r.days, 15);
  assert.strictEqual(r.n, 4);
  // 5-%-Quantil: Position 3 · 0,05 = 0,15 → −50 + 0,15 · (−40 − −50) = −48,5
  near(r.q5NetHe, -48.5); near(r.q5Hedge, -80 + 0.15 * 30);
  assert.strictEqual(r.firm, 'Firma A'); assert.strictEqual(r.market, 'Futures'); assert.strictEqual(r.type, 'challenge');
  assert.strictEqual(r.riskCapped, false); assert.strictEqual(r.notTradable, false);
  // Instant: keine Pass-Quote
  const oi = offer('y', { mode: 'instant' });
  assert.strictEqual(rowFromResult(oi, stubP(oi), stubR(), { g: 'X · CFD' }).pass, null);
  assert.strictEqual(rowFromResult(oi, stubP(oi), stubR(), { g: 'X · CFD' }).market, 'CFD');
  // Flags aus P
  const rc = rowFromResult(o, stubP(o, { riskCapped: true, reason: 'gedeckelt' }), stubR(), {});
  assert.strictEqual(rc.riskCapped, true); assert.strictEqual(rc.reason, 'gedeckelt');
});

// Konstruierte Zeilen für Sortierung, „gleichauf“ und Filter
const row = (id, v) => Object.assign({ id, market: 'Futures', firm: 'A', type: 'challenge', fee: 100, size: 50000 }, v);
const ROWS = [
  row('b', { net: 100, netLo: 60, netHi: 140, roi: 1.0, roiLo: 0.6, roiHi: 1.4, netHe: 90, netPer1k: 50, payout: 0.3, days: 20 }),
  row('a', { net: 100, netLo: 80, netHi: 120, roi: 2.0, roiLo: 1.6, roiHi: 2.4, netHe: 95, netPer1k: 40, payout: 0.5, days: 12 }),
  row('c', { net: 300, netLo: 250, netHi: 350, roi: 1.5, roiLo: 1.25, roiHi: 1.75, netHe: 280, netPer1k: 75, payout: 0.2, days: null }),
  row('d', { net: 200, netLo: 120, netHi: 280, roi: 0.8, roiLo: 0.48, roiHi: 1.12, netHe: 210, netPer1k: 20, payout: 0.4, days: 8 }),
  row('e', { net: null, netLo: null, netHi: null, roi: null, roiLo: null, roiHi: null, netHe: null, netPer1k: null, payout: null, days: null, notTradable: true })
];
const ids = rs => rs.map(r => r.id).join('');

test('2 sortRows je Schlüssel und Stabilität', () => {
  assert.strictEqual(ids(sortRows(ROWS, 'net')), 'cdabe');         // a/b gleich (100) → nach id
  assert.strictEqual(ids(sortRows(ROWS, 'net', 'asc')), 'abdce');  // ohne Wert immer am Ende
  assert.strictEqual(ids(sortRows(ROWS, 'netHe')), 'cdabe');
  assert.strictEqual(ids(sortRows(ROWS, 'roi')), 'acbde');
  assert.strictEqual(ids(sortRows(ROWS, 'netPer1k')), 'cbade');
  assert.strictEqual(ids(sortRows(ROWS, 'payout')), 'adbce');
  assert.strictEqual(ids(sortRows(ROWS, 'days')), 'dabce');        // Tage aufsteigend, null ans Ende, c/e nach id
  assert.strictEqual(ids(sortRows(ROWS, 'days', 'desc')), 'badce');
  // Eingabe bleibt unverändert, Reihenfolge der Eingabe spielt keine Rolle
  assert.strictEqual(ids(ROWS), 'bacde');
  assert.strictEqual(ids(sortRows(ROWS.slice().reverse(), 'net')), 'cdabe');
  assert.throws(() => sortRows(ROWS, 'fee'), /Sortierschlüssel/);
});

test('3 markTies: überlappend / nicht überlappend, nur net und roi', () => {
  const byId = rs => Object.fromEntries(rs.map(r => [r.id, r]));
  // net: Platz 1 = c [250, 350]; d [120, 280] überlappt, a [80, 120] und b [60, 140] nicht
  let m = byId(markTies(sortRows(ROWS, 'net'), 'net'));
  assert.strictEqual(m.c.leader, true); assert.strictEqual(m.c.tie, false);
  assert.strictEqual(m.d.tie, true); assert.strictEqual(m.a.tie, false); assert.strictEqual(m.b.tie, false); assert.strictEqual(m.e.tie, false);
  // Grenzfall: Spannen berühren sich genau (hi = lo von Platz 1) → gleichauf
  const touch = markTies([row('p', { net: 10, netLo: 8, netHi: 12 }), row('q', { net: 6, netLo: 4, netHi: 8 })], 'net');
  assert.strictEqual(touch[1].tie, true);
  // roi: Platz 1 = a [1,6, 2,4]; c [1,25, 1,75] überlappt, b [0,6, 1,4] und d nicht
  m = byId(markTies(ROWS, 'roi'));
  assert.strictEqual(m.a.leader, true); assert.strictEqual(m.c.tie, true); assert.strictEqual(m.b.tie, false); assert.strictEqual(m.d.tie, false);
  // Andere Schlüssel: nie gleichauf
  for (const k of ['netHe', 'netPer1k', 'payout', 'days']) assert.ok(markTies(ROWS, k).every(r => !r.tie && !r.leader), k);
  // Eingabe wird nicht verändert
  assert.ok(ROWS.every(r => r.tie === undefined));
});

test('4 filterRows je Filter', () => {
  const R = [
    row('f1', { market: 'Futures', firm: 'Alpha Futures', type: 'challenge', fee: 99, size: 50000 }),
    row('f2', { market: 'Futures', firm: 'Lucid Trading', type: 'instant', fee: 300, size: 150000 }),
    row('c1', { market: 'CFD', firm: 'Blue Guardian', type: 'challenge', fee: 50, size: 5000 }),
    row('f3', { market: 'Futures', firm: 'Blue Guardian', type: 'instant', fee: 150, size: 25000 }),
    row('x', { market: 'Futures', firm: 'Ohne Größe', type: 'challenge', fee: 10, size: null })
  ];
  assert.strictEqual(ids(filterRows(R, {})), ids(R));
  assert.strictEqual(ids(filterRows(R, { markt: 'all', firma: '', typ: null })), ids(R));
  assert.strictEqual(ids(filterRows(R, { markt: 'CFD' })), 'c1');
  assert.strictEqual(ids(filterRows(R, { markt: 'Futures' })), 'f1f2f3x');
  assert.strictEqual(ids(filterRows(R, { firma: 'Blue Guardian' })), 'c1f3');
  assert.strictEqual(ids(filterRows(R, { typ: 'instant' })), 'f2f3');
  assert.strictEqual(ids(filterRows(R, { maxFee: 150 })), 'f1c1f3x');
  assert.strictEqual(ids(filterRows(R, { sizeMin: 25000 })), 'f1f2f3');
  assert.strictEqual(ids(filterRows(R, { sizeMax: 50000 })), 'f1c1f3');
  assert.strictEqual(ids(filterRows(R, { sizeMin: 25000, sizeMax: 50000, markt: 'Futures', maxFee: 120 })), 'f1');
});

test('5 quantile und ci95', () => {
  assert.strictEqual(quantile([], 0.05), null);
  assert.strictEqual(quantile([7], 0.05), 7);
  assert.strictEqual(quantile([3, 1, 2], 0.5), 2);
  near(quantile([10, 20, 30, 40, 50], 0.05), 12);   // Position 0,2
  assert.strictEqual(quantile([10, 20, 30, 40, 50], 0), 10);
  assert.strictEqual(quantile([10, 20, 30, 40, 50], 1), 50);
  const a = [1, 2, 3, 4, 5];
  const before = a.join(); quantile(a.slice().reverse(), 0.3); assert.strictEqual(a.join(), before);
  assert.strictEqual(ci95([]), null);
  const c1 = ci95([5]); assert.strictEqual(c1.mean, 5); assert.strictEqual(c1.half, 0);
  const c = ci95([2, 4, 4, 4, 5, 5, 7, 9]);        // Mittel 5, s² = 32 / 7
  near(c.mean, 5); near(c.s, Math.sqrt(32 / 7)); near(c.se, Math.sqrt(32 / 7) / Math.sqrt(8));
  near(c.half, 1.96 * c.se); near(c.lo, 5 - c.half); near(c.hi, 5 + c.half);
});

// Stub-deps für rankOffers: zählen simulate-Aufrufe und geben konstruierte R zurück
function stubDeps(extra) {
  const calls = { simulate: 0, prepare: 0, seeds: [] };
  return Object.assign({
    calls,
    autoParams: (o, ui) => Object.assign({}, o, { n: ui.n, risk: 100, cost: 2, hp: 5 }, o.flagNT ? { notTradable: true, reason: 'nicht handelbar' } : {}),
    prepare: P => { calls.prepare++; return P; },
    simulate: (P, seed) => { calls.simulate++; calls.seeds.push(seed); return stubR(); }
  }, extra);
}
const GROUPS = [
  { g: 'Firma A · Futures', items: [offer('a1'), offer('a2', { flagNT: true })] },
  { g: 'Firma B · CFD', items: [offer('b1', { mode: 'instant', rules: { codeValidUntil: null } })] }
];

test('6 notTradable → Zeile ohne simulate-Aufruf', () => {
  const d = stubDeps();
  const rows = rankOffers(GROUPS, { n: 4 }, d);
  assert.strictEqual(rows.length, 3);
  assert.strictEqual(d.calls.simulate, 2); assert.strictEqual(d.calls.prepare, 2);
  const nt = rows.find(r => r.id === 'a2');
  assert.strictEqual(nt.notTradable, true); assert.strictEqual(nt.reason, 'nicht handelbar');
  assert.strictEqual(nt.net, null); assert.strictEqual(nt.days, null);
  assert.strictEqual(nt.firm, 'Firma A');
  // nicht handelbar steht bei jeder Sortierung am Ende
  assert.strictEqual(sortRows(rows, 'net').pop().id, 'a2');
  // Gleicher Seed für alle; Standard 20261015, sonst aus ui
  assert.deepStrictEqual(d.calls.seeds, [20261015, 20261015]);
  const d2 = stubDeps(); rankOffers(GROUPS, { n: 4, seed: 7 }, d2);
  assert.deepStrictEqual(d2.calls.seeds, [7, 7]);
  // seed und today gehen nicht an autoParams
  let seen = null; rankOffers(GROUPS, { n: 4, seed: 7, today: '2026-10-16' }, stubDeps({ autoParams: (o, ui) => { seen = ui; return { ...o, n: 4, risk: 1, cost: 1 }; } }));
  assert.deepStrictEqual(seen, { n: 4 });
  // Fehler in prepare/simulate → Zeile mit error statt Abbruch
  const de = stubDeps({ prepare: () => { throw new Error('kaputt'); } });
  const re = rankOffers(GROUPS, { n: 4 }, de);
  assert.strictEqual(re.find(r => r.id === 'a1').error, 'kaputt');
});

test('7 fehlendes daysToFirstPay → null', () => {
  const o = offer('x');
  assert.strictEqual(rowFromResult(o, stubP(o), stubR(false), {}).days, null);
  // Feld da, aber keine Auszahlung → null
  const R = stubR(); R.list.forEach(x => { x.daysToFirstPay = null; });
  assert.strictEqual(rowFromResult(o, stubP(o), R, {}).days, null);
});

test('8 Code-Kennzeichnung mit festem Stichtag', () => {
  assert.strictEqual(codeMark(offer('a'), '2026-10-16'), null);                                   // ohne rules
  assert.strictEqual(codeMark(offer('a', { rules: {} }), '2026-10-16'), null);                     // Feld fehlt
  assert.deepStrictEqual(codeMark(offer('a', { rules: { codeValidUntil: null } }), '2026-10-16'), { kind: 'noExpiry', label: 'Code ohne Ablaufdatum' });
  const o = offer('a', { rules: { codeValidUntil: '2026-10-31' } });
  assert.deepStrictEqual(codeMark(o, '2026-10-16'), { kind: 'until', until: '2026-10-31', expired: false, label: 'Code bis 31.10.2026' });
  assert.strictEqual(codeMark(o, '2026-10-31').expired, false);                                     // letzter gültiger Tag
  assert.strictEqual(codeMark(o, '2026-11-01').expired, true);
  assert.strictEqual(codeMark(o, null).expired, null);                                              // ohne Stichtag unbekannt
  // in der Zeile
  const rows = rankOffers(GROUPS, { n: 4, today: '2026-10-16' }, stubDeps());
  assert.strictEqual(rows.find(r => r.id === 'b1').codeMark.kind, 'noExpiry');
  assert.strictEqual(rows.find(r => r.id === 'a1').codeMark, null);
});

test('9 rankOffersStep über alle Angebote = rankOffers, Fortschritt und Abbruch', () => {
  const all = rankOffers(GROUPS, { n: 4 }, stubDeps());
  const st = createRankState(GROUPS, { n: 4 }, stubDeps());
  assert.strictEqual(st.total, 3); assert.strictEqual(st.i, 0); assert.strictEqual(st.done, false);
  rankOffersStep(st); assert.strictEqual(st.i, 1); assert.strictEqual(st.rows.length, 1);
  while (!st.done) rankOffersStep(st);
  assert.deepStrictEqual(st.rows, all);
  rankOffersStep(st); assert.strictEqual(st.rows.length, 3);   // nach dem Ende ohne Wirkung
  // Abbruch: keine weiteren Angebote
  const d = stubDeps(), sc = createRankState(GROUPS, { n: 4 }, d);
  rankOffersStep(sc); cancelRank(sc); rankOffersStep(sc); rankOffersStep(sc);
  assert.strictEqual(sc.rows.length, 1); assert.strictEqual(sc.done, false); assert.strictEqual(d.calls.simulate, 1);
  // Flache Liste mit g am Angebot ergibt dieselben Zeilen
  const flat = GROUPS.flatMap(gr => gr.items.map(o => Object.assign({ g: gr.g }, o)));
  assert.deepStrictEqual(rankOffers(flat, { n: 4 }, stubDeps()).map(r => [r.id, r.firm, r.market]), all.map(r => [r.id, r.firm, r.market]));
  // Leere Liste
  assert.deepStrictEqual(rankOffers([], {}, stubDeps()), []);
});

// ---- Integration: echtes simulate/prepare aus sim.js, minimale autoParams-Attrappe ----
const { prepare, simulate } = require('../js/sim.js');
const { OFFERS, PRESETS } = require('../js/offers.js');
// Attrappe nach dem Auto-Risiko der App (25 % des Drawdowns, gedeckelt auf maxRisk, Kosten 2 %, hp kalibriert)
function miniAutoParams(o, ui) {
  const instant = o.mode === 'instant';
  let risk = Math.max(10, Math.round(o.dd * 0.25 / 5) * 5); if (o.maxRisk) risk = Math.min(risk, o.maxRisk);
  return Object.assign({}, o, { target: instant ? 0 : o.target, target2: instant ? 0 : (o.target2 || 0), ddStatic: !!o.ddStatic,
    hfund: false, hp: Math.min(30, Math.round(o.fee * 1.25 / o.dd * 200) / 2), risk, cost: Math.max(1, Math.round(risk * 0.02)),
    rr: ui.rr, wr: ui.wr, n: ui.n, tradesPerDay: ui.tradesPerDay });
}
const REAL = { simulate, prepare, autoParams: miniAutoParams };
const UI = { rr: PRESETS.futures.rr, wr: PRESETS.futures.wr, n: 300, tradesPerDay: 2 };

test('Integration: zwei Angebote, Zeile = direkter simulate-Aufruf', () => {
  const pick = ['af-std-50', 'bg-cfd-instant-200'];
  const groups = OFFERS.map(gr => ({ g: gr.g, items: gr.items.filter(o => pick.includes(o.id)) })).filter(gr => gr.items.length);
  const t0 = Date.now();
  const rows = rankOffers(groups, UI, REAL);
  const ms = Date.now() - t0;
  assert.strictEqual(rows.length, 2);
  for (const r of rows) {
    const gr = groups.find(g => g.items.some(o => o.id === r.id)), o = gr.items.find(x => x.id === r.id);
    const P = miniAutoParams(o, UI), R = simulate(prepare(P), Rank.SEED);
    assert.strictEqual(r.net, R.netNo / UI.n, r.id + ' net');
    assert.strictEqual(r.netHe, R.netHe / UI.n, r.id + ' netHe');
    assert.strictEqual(r.payout, R.paid / UI.n, r.id + ' payout');
    assert.strictEqual(r.avgPayouts, R.nPayTot / UI.n, r.id + ' avgPayouts');
    assert.strictEqual(r.pass, o.mode === 'instant' ? null : R.passed / UI.n, r.id + ' pass');
    assert.deepStrictEqual(r, rowFromResult(o, P, R, { g: gr.g }), r.id + ' Zeile');
  }
  assert.strictEqual(rows.find(r => r.id === 'bg-cfd-instant-200').codeMark.kind, 'noExpiry');
  assert.strictEqual(rows.find(r => r.id === 'bg-cfd-instant-200').market, 'CFD');
  assert.strictEqual(rows.find(r => r.id === 'af-std-50').firm, 'Alpha Futures');
  console.log(`    Laufzeit 2 Angebote × n ${UI.n}: ${ms} ms`);
});

test('Integration: alle Angebote, deterministisch, n 1000 unter 5 s (Node)', () => {
  const ui = { rr: PRESETS.futures.rr, wr: PRESETS.futures.wr, n: 1000, tradesPerDay: 1 };
  const t0 = Date.now();
  const a = rankOffers(OFFERS, ui, REAL);
  const ms = Date.now() - t0;
  const b = rankOffers(OFFERS, ui, REAL);
  const total = OFFERS.reduce((s, g) => s + g.items.length, 0);
  assert.strictEqual(a.length, total);
  assert.deepStrictEqual(a, b);
  assert.ok(a.every(r => !r.error), a.filter(r => r.error).map(r => r.id + ': ' + r.error).join('; '));
  assert.ok(ms < 5000, `${ms} ms`);
  console.log(`    Laufzeit ${total} Angebote × n 1000: ${ms} ms`);
});

console.log(`\n${passed} Tests bestanden.`);
