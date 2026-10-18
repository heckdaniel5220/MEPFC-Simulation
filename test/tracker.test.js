// Tests für den Tracker (M-028a), DOM-frei. Ausführen: node test/tracker.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const T = require('../js/tracker.js');
const E = require('../js/explain.js');
const { OFFERS } = require('../js/offers.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + (e.stack || e.message)); process.exitCode = 1; }
}

const ALL = OFFERS.flatMap(g => g.items);
const byId = id => ALL.find(o => o.id === id);
const snap = id => T.snapshotRules(byId(id), E);
// Account mit eigenen Regeln (Kontogröße 50.000 $), Overrides auf dem Schnappschuss
function custom(u, over) {
  const r = Object.assign(T.customRules(Object.assign({ size: 50000, mode: 'challenge', target: 3000, dd: 2000, ddKind: 'eod', lock: 0 }, u)), over || {});
  return T.newAccount({ id: 'a-1', name: 'Test', rules: r, buyDate: '2026-10-01', feePaid: 100, start: '2026-10-01' });
}
function fromOffer(id, phase) {
  let a = T.newAccount({ id: 'a-1', name: id, offerId: id, rules: snap(id), buyDate: '2026-10-01', feePaid: byId(id).fee, start: '2026-10-01' });
  if (phase === 'funded' && a.phases[0].phase !== 'funded') a = T.addPhase(a, { phase: 'funded', start: '2026-10-01', startBalance: a.rules.size });
  return a;
}
// Tagesbuchungen ab Datum: Liste von Ergebnissen oder Objekten
function book(a, start, list) {
  list.forEach((x, k) => { a = T.upsertDay(a, Object.assign({ date: T.addDays(start, k), trades: 1 }, typeof x === 'number' ? { pnl: x } : x)); });
  return a;
}
const ev = (a, today) => T.evaluate(a, { today: today || '2026-12-31' });
const ruleOf = (r, key) => r.rules.find(x => x.key === key);
const cur = a => T.phaseCalc(a, a.phases.length - 1);

console.log('tracker.js');

test('1 DD statisch: Grenze −DD, Bruch mit Tagestief, ohne Tagestief „geschätzt“', () => {
  let a = book(custom({ ddKind: 'static' }), '2026-10-01', [500, -1000, -1400]);
  let P = cur(a);
  assert.strictEqual(P.floorNow, -200000); assert.strictEqual(P.eq, -190000); assert.strictEqual(P.breach, null);
  const r = ruleOf(ev(a), 'dd');
  assert.strictEqual(r.state, 'yellow'); assert.strictEqual(r.exact, 'geschätzt'); assert.strictEqual(r.distance, '100 $');
  a = book(a, '2026-10-04', [{ pnl: 50, low: 47950 }]);
  P = cur(a);
  assert.deepStrictEqual(P.breach, { date: '2026-10-04', low: -205000, floor: -200000 });
  assert.strictEqual(ruleOf(ev(a), 'dd').state, 'red'); assert.strictEqual(ev(a).suggestLost, true);
});

test('2 DD EOD mit Lock bei Start: Grenze aus Schlussständen, Bruch gegen die Grenze des Vortags', () => {
  let a = book(custom({}), '2026-10-01', [{ pnl: 1000, low: 50000 }]);
  assert.strictEqual(cur(a).floorNow, -100000);
  // Tagestief 49.000 = −1.000 trifft die Vortagsgrenze −1.000, obwohl der Tag im Plus schließt
  const b = book(a, '2026-10-02', [{ pnl: 500, low: 49000 }]);
  assert.strictEqual(cur(b).breach.date, '2026-10-02');
  a = book(a, '2026-10-02', [{ pnl: 1500, low: 50500 }, { pnl: -2400, low: 50100 }]);
  const P = cur(a);
  assert.strictEqual(P.peak, 250000); assert.strictEqual(P.floorNow, 0); assert.strictEqual(P.eq, 10000); assert.strictEqual(P.breach, null);
  assert.strictEqual(ruleOf(ev(a), 'dd').exact, 'exakt');
  a = book(a, '2026-10-04', [{ pnl: 0, low: 50000 }]);
  assert.strictEqual(cur(a).breach.date, '2026-10-04');
});

test('3 DD EOD mit Lock bei Start + 100 (Lucid/MFFU) und FundedNext mllLock absolut', () => {
  const lu = snap('lu-flex-50');
  assert.deepStrictEqual([lu.ddEval.kind, lu.ddEval.lock, lu.ddEval.dd], ['eod', 100, 2000]);
  let a = book(fromOffer('lu-flex-50'), '2026-10-01', [2500]);
  assert.strictEqual(cur(a).floorNow, 10000);
  const fn = snap('fn-flex-50');
  assert.deepStrictEqual([fn.ddEval.kind, fn.ddEval.lock, fn.ddEval.dd, fn.ddEval.source, fn.fixedAfterPayout], ['eod', 100, 1500, 'rules.mllLock', true]);
  const af = snap('af-std-50');
  assert.deepStrictEqual([af.ddEval.kind, af.ddEval.lock], ['eod', 0]);
  const bg = snap('bg-fut-std-50');
  assert.deepStrictEqual([bg.ddEval.kind, bg.ddEval.lock, bg.fixedAfterPayout], ['eod', 100, true]);
});

test('4 DD intraday: mit Tageshoch „konservativ“, ohne Tageshoch „geschätzt“ und früher gelb (E7)', () => {
  const lu = snap('lu-daily-50');
  assert.deepStrictEqual([lu.ddEval.kind, lu.ddEval.lock], ['intraday', 100]);
  const mf = snap('mf-rapid-50');
  assert.deepStrictEqual([mf.ddEval.kind, mf.ddFunded.kind], ['eod', 'intraday']);
  const withHi = book(fromOffer('lu-daily-50'), '2026-10-01', [{ pnl: 500, high: 51200, low: 50000 }, { pnl: -100, high: 50600, low: 50300 }]);
  let P = cur(withHi);
  assert.strictEqual(P.peak, 120000); assert.strictEqual(P.floorNow, -80000);
  let r = ruleOf(ev(withHi), 'dd');
  assert.strictEqual(r.exact, 'konservativ'); assert.strictEqual(r.state, 'green'); assert.strictEqual(r.distance, '1.200 $');
  const noHi = book(fromOffer('lu-daily-50'), '2026-10-01', [500, -100]);
  P = cur(noHi);
  assert.strictEqual(P.peak, 50000); assert.strictEqual(P.floorNow, -150000);
  r = ruleOf(ev(noHi), 'dd');
  assert.strictEqual(r.exact, 'geschätzt'); assert.strictEqual(r.state, 'yellow');
  assert.ok(/echte Grenze kann höher liegen/.test(r.text));
  // Grenze laut Firma übersteuert
  const f = Object.assign({}, noHi, { firmFloor: 49200 });
  r = ruleOf(ev(f), 'dd');
  assert.strictEqual(r.exact, 'laut Firma'); assert.strictEqual(r.limit, '49.200 $'); assert.ok(/Tracker 48.500 \$/.test(r.text));
  // unbekannte Art: strengste (intraday, Lock bei Start), gekennzeichnet
  const k = T.ddKind({ id: 'x-50', dd: 2000, rules: {} }, 'step1');
  assert.deepStrictEqual([k.kind, k.lock, k.assumed], ['intraday', 0, true]);
});

test('5 Grenze fest nach Auszahlung (FundedNext Flex), Express je Phase eigener DD', () => {
  let a = book(fromOffer('fn-flex-50', 'funded'), '2026-10-01', [600]);
  assert.strictEqual(cur(a).floorNow, -90000);
  a = T.addPayout(a, { date: '2026-10-01', amount: 300, received: 285 });
  const P = cur(a);
  assert.strictEqual(P.fixed, true); assert.strictEqual(P.floorNow, 10000); assert.strictEqual(P.eq, 30000);
  // ohne Festschreibung bliebe die Grenze bei −900 $
  const b = T.addPayout(book(custom({ ddKind: 'eod', lock: 100, dd: 1500, mode: 'instant' }), '2026-10-01', [600]), { date: '2026-10-01', amount: 300, received: 285 });
  assert.strictEqual(cur(b).floorNow, -90000);
  const ex = snap('bg-fut-express-100');
  assert.deepStrictEqual([ex.ddEval.dd, ex.ddFunded.dd], [3000, 2500]);
});

test('6 Zuordnung: jedes Angebot hat je Phase eine belegte DD-Art', () => {
  for (const o of ALL) for (const ph of ['step1', 'funded']) {
    const k = T.ddKind(o, ph);
    assert.ok(['static', 'eod', 'intraday'].includes(k.kind), o.id);
    assert.strictEqual(k.assumed, false, o.id + ' ' + ph);
    assert.ok(k.dd > 0 && k.lock >= 0, o.id);
  }
});

test('7 Tageslimit weich und hart, Tagestief, Lucid-Scaling sinkt nicht nach Auszahlung', () => {
  let a = book(custom({ dllEval: 1000 }), '2026-10-01', [-1000]);
  assert.strictEqual(ruleOf(ev(a, '2026-10-01'), 'dll').state, 'yellow');
  let r = ruleOf(ev(a, '2026-10-02'), 'dll');
  assert.strictEqual(r.state, 'green'); assert.ok(/an 1 Tag erreicht/.test(r.text)); assert.strictEqual(r.exact, 'geschätzt');
  a = book(custom({ dllEval: 1500, dllType: 'hard' }), '2026-10-01', [{ pnl: -500, low: 48400 }]);
  r = ruleOf(ev(a), 'dll');
  assert.strictEqual(r.state, 'red'); assert.strictEqual(r.exact, 'exakt'); assert.strictEqual(ev(a).suggestLost, true);
  const R = { dllFunded: 1000, dllScaleFunded: 0.6, dllScaleFrom: 2100 };
  assert.strictEqual(T.dllLimitFor(R, true, 300000), 180000);
  assert.strictEqual(T.dllLimitFor(R, true, 200000), 100000);
  assert.strictEqual(T.dllLimitFor(R, false, 300000), 0);
  // EOD-Gewinn nach Auszahlung 2.500 $ → Limit 60 % = 1.500 $; der Höchstwert bleibt, obwohl der Gewinn danach sinkt
  let b = T.addPayout(book(custom({ mode: 'instant', dd: 5000, dllFunded: 1000 }, { dllScaleFunded: 0.6, dllScaleFrom: 2100 }), '2026-10-01', [3500]),
    { date: '2026-10-01', amount: 1000, received: 900 });
  b = book(b, '2026-10-02', [-200, -100]);
  r = ruleOf(ev(b, '2026-10-03'), 'dll');
  assert.strictEqual(r.limit, '−1.500 $'); assert.strictEqual(r.state, 'green');
  assert.strictEqual(ruleOf(ev(book(b, '2026-10-04', [-1500]), '2026-10-04'), 'dll').state, 'yellow');
  assert.ok(snap('lu-pro-50').dllScaleFunded > 0);
});

test('8 Consistency: Challenge strikt, Funded cycle mit Reset nach der Auszahlung, perpetual', () => {
  let a = book(custom({ consEval: 50 }), '2026-10-01', [1000, 500]);
  let r = ruleOf(ev(a), 'cons');
  assert.strictEqual(r.state, 'yellow'); assert.ok(/über 2.000 \$/.test(r.text));
  assert.strictEqual(ruleOf(ev(book(a, '2026-10-03', [1000])), 'cons').state, 'green');
  assert.strictEqual(ruleOf(ev(book(custom({ consEval: 50 }), '2026-10-01', [1000, 1000])), 'cons').state, 'yellow'); // genau 50 %: gesperrt
  const base = u => T.addPayout(book(custom(Object.assign({ mode: 'instant', dd: 5000, consFunded: 40 }, u)), '2026-10-01', [500, 500, 600]),
    { date: '2026-10-03', amount: 1000, received: 900 });
  let c = book(base({}), '2026-10-04', [300, 300]);
  assert.strictEqual(ruleOf(ev(c), 'cons').state, 'yellow');            // 300 von 600 = 50 %
  assert.strictEqual(ruleOf(ev(book(c, '2026-10-06', [300])), 'cons').state, 'green'); // 300 von 900
  let p = book(T.addPayout(book(custom({ mode: 'instant', dd: 5000, consFunded: 40 }, { consFundedMode: 'perpetual' }), '2026-10-01', [500, 500, 600]),
    { date: '2026-10-03', amount: 1000, received: 900 }), '2026-10-04', [300, 300, 300]);
  r = ruleOf(ev(p), 'cons');
  assert.strictEqual(r.state, 'yellow'); assert.ok(/600 \$/.test(r.text));
});

test('9 Handels- und Gewinntage: Mindesttage, Schwelle, Schwelle 0, Reset je Zyklus', () => {
  let a = book(custom({}, { evalMinDays: 2 }), '2026-10-01', [{ pnl: 3000 }, { pnl: 0, trades: 0 }]);
  let e = ev(a);
  assert.strictEqual(ruleOf(e, 'days').state, 'yellow'); assert.strictEqual(e.passOk, false);
  assert.ok(/es fehlen 1 Handelstag/.test(e.headline), e.headline);
  a = book(a, '2026-10-03', [10]);
  e = ev(a); assert.strictEqual(e.passOk, true); assert.ok(/bestanden/.test(e.headline));
  const w = book(custom({}, { evalWinDays: 2, evalWinDayMin: 200 }), '2026-10-01', [200, 199, 3000]);
  assert.ok(/2 von 2 Gewinntagen/.test(ruleOf(ev(w), 'days').text));
  const z = book(custom({}, { evalWinDays: 2, evalWinDayMin: 0 }), '2026-10-01', [0, 1, 3000]);
  assert.ok(/2 von 2/.test(ruleOf(ev(z), 'days').text));
  let f = T.addPayout(book(custom({ mode: 'instant', dd: 5000 }, { payWinDays: 2 }), '2026-10-01', [300, 300]), { date: '2026-10-02', amount: 200, received: 180 });
  f = book(f, '2026-10-03', [300]);
  assert.ok(/1 von 2 Gewinntagen/.test(ruleOf(ev(f), 'days').text));
  assert.strictEqual(ruleOf(ev(f), 'days').exact, 'exakt');
});

test('10 Kalender: Wartezeit über ein Wochenende, Rhythmus, Stunden aufgerundet, Anträge je Monat, Inaktivität', () => {
  let a = book(custom({ mode: 'instant', dd: 5000 }, { payFirstAfterCal: 14, payEveryCal: 14 }), '2026-10-16', [300]); // Freitag
  let r = ruleOf(ev(a, '2026-10-29'), 'cal');
  assert.strictEqual(r.value, '30.10.2026'); assert.strictEqual(r.state, 'info');
  assert.strictEqual(ruleOf(ev(a, '2026-10-30'), 'cal').state, 'green');
  a = T.addPayout(a, { date: '2026-11-02', amount: 100, received: 90 });
  assert.strictEqual(ruleOf(ev(a, '2026-11-03'), 'cal').value, '16.11.2026');
  const mf = snap('mf-rapid-25');
  assert.deepStrictEqual([mf.payHours, mf.payFirstAfterCal], [24, 1]);
  r = ruleOf(ev(book(fromOffer('mf-rapid-25', 'funded'), '2026-10-01', [100]), '2026-10-02'), 'cal');
  assert.strictEqual(r.exact, 'aufgerundet'); assert.strictEqual(r.value, '02.10.2026');
  let af = book(fromOffer('af-std-50', 'funded'), '2026-10-01', [100]);
  for (const dt of ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']) af = T.addPayout(af, { date: dt, amount: 10, received: 9 });
  assert.strictEqual(ruleOf(ev(af, '2026-10-28'), 'req').state, 'yellow');
  assert.strictEqual(ruleOf(ev(af, '2026-11-02'), 'req').state, 'green');
  const inact = book(custom({}, { inactivityDays: 7 }), '2026-10-01', [100]);
  assert.strictEqual(ruleOf(ev(inact, '2026-10-09'), 'inact').state, 'red');
  assert.strictEqual(ruleOf(ev(inact, '2026-10-06'), 'inact').state, 'yellow');
  assert.strictEqual(ruleOf(ev(inact, '2026-10-03'), 'inact').state, 'green');
  assert.strictEqual(snap('fn-direct-50').inactivityDays, 7);
});

test('11 Auszahlung: Schwelle buf + minp, Betrag mit Anteil, Cap und Split, Cap-Konvention gekennzeichnet', () => {
  let a = book(fromOffer('fn-flex-50', 'funded'), '2026-10-01', [800, 800, 800, 800, 800]);
  // eq 4.000, buf 100: (3.900 × 50 %) = 1.950 → Cap 1.500 → 95 % = 1.425
  let r = ruleOf(ev(a), 'payout');
  assert.strictEqual(r.state, 'green'); assert.ok(/etwa 1.500 \$, davon 1.425 \$/.test(r.text), r.text); assert.strictEqual(r.exact, 'exakt');
  const b = book(custom({ mode: 'instant', dd: 5000, buf: 100, minp: 500 }), '2026-10-01', [550]);
  r = ruleOf(ev(b), 'payout');
  assert.strictEqual(r.state, 'info'); assert.strictEqual(r.distance, '50 $'); assert.strictEqual(r.exact, 'Konvention');
  assert.strictEqual(snap('mf-rapid-50').capNote, 'Modellwert: Tagesgewinn bis Live');
  const m = ruleOf(ev(fromOffer('af-std-50', 'funded')), 'maxp');
  assert.strictEqual(m.exact, E.maxpConvention(byId('af-std-50')) ? 'Konvention' : 'exakt');
});

test('12 Bestehen nur mit Ziel, Consistency und Tagen zugleich; Klartext nennt die fehlende Bedingung', () => {
  let a = book(custom({ consEval: 50 }, { evalMinDays: 3 }), '2026-10-01', [2000, 1200]);
  let e = ev(a);
  assert.strictEqual(e.passOk, false);
  assert.ok(/Consistency/.test(e.headline) && /Handelstag/.test(e.headline) && !/Ziel:/.test(e.headline), e.headline);
  a = book(a, '2026-10-03', [1000]);
  e = ev(a); assert.strictEqual(e.passOk, true);
  assert.strictEqual(T.nextPhase(a), 'funded');
  assert.strictEqual(T.nextPhase(custom({ target2: 1500 })), 'step2');
  const s2 = T.addPhase(custom({ target2: 1500 }), { phase: 'step2', start: '2026-10-05', startBalance: 50000 });
  assert.strictEqual(ruleOf(ev(book(s2, '2026-10-05', [1500])), 'target').state, 'green');
});

test('13 Shield: BG 2 Brüche mit Split 48,5 %, AC 1 Bruch, ohne größten Trade-Verlust nur Hinweis', () => {
  let a = book(fromOffer('bg-cfd-instant-50'), '2026-10-01', [{ pnl: -300 }]);
  assert.strictEqual(ruleOf(ev(a), 'shield').state, 'grey');
  a = book(fromOffer('bg-cfd-instant-50'), '2026-10-01', [{ pnl: -500, maxTradeLoss: 500 }, 1000, 1000]);
  let r = ruleOf(ev(a), 'shield');
  assert.strictEqual(r.state, 'yellow'); assert.ok(/48,5 %/.test(ruleOf(ev(a), 'payout').text));
  a = book(a, '2026-10-04', [{ pnl: -600, maxTradeLoss: 600 }]);
  assert.strictEqual(ruleOf(ev(a), 'shield').state, 'red'); assert.strictEqual(ev(a).suggestLost, true);
  const ac = book(fromOffer('ac-d-50'), '2026-10-01', [{ pnl: -500, maxTradeLoss: 500 }]);
  assert.strictEqual(ac.rules.shieldStrikes, 1);
  assert.strictEqual(ruleOf(ev(ac), 'shield').state, 'red');
  assert.strictEqual(ruleOf(ev(book(fromOffer('ac-d-50'), '2026-10-01', [{ pnl: -100, maxTradeLoss: 100 }])), 'shield').state, 'green');
});

test('14 Übersicht: Fees inkl. Kosten, erhaltene Auszahlungen, Netto in Cent exakt', () => {
  const a = Object.assign(T.addCost(custom({}), { date: '2026-10-05', amount: 99.1, text: 'Verlängerung' }), { id: 'a-1', feePaid: 65.5 });
  const b = Object.assign(T.addPayout(custom({ mode: 'instant' }), { date: '2026-10-05', amount: 1000.37, received: 900.33 }), { id: 'a-2', feePaid: 129.99, status: 'verloren' });
  const o = T.overview({ app: T.APP, version: T.VERSION, accounts: [a, b] });
  assert.deepStrictEqual(o, { fees: 294.59, payouts: 900.33, net: 605.74, counts: { aktiv: 1, bestanden: 0, verloren: 1, beendet: 0 }, n: 2 });
});

test('15 Export → Import Rundreise exakt; unbekannte Felder bleiben; neuere Version, kaputtes JSON, doppelte ids → Fehler', () => {
  let a = book(fromOffer('af-std-50'), '2026-10-01', [{ pnl: 1234.56, trades: 3, high: 51300, low: 49900, maxTradeLoss: 120.5 }, -200]);
  a = T.addPhase(a, { phase: 'funded', start: '2026-10-10', startBalance: 50000 });
  a = T.addPayout(a, { date: '2026-10-20', amount: 1000, received: 900 });
  a = Object.assign(a, { extraFeld: { x: 1 } });
  const s = { app: T.APP, version: T.VERSION, accounts: [a, Object.assign(custom({}), { id: 'a-2' })], zusatz: 'bleibt' };
  const before = JSON.stringify(s);
  const txt = T.exportJson(s, '2026-10-18T12:00:00Z');
  assert.strictEqual(JSON.parse(txt).version, 1); assert.strictEqual(JSON.parse(txt).exported, '2026-10-18T12:00:00Z');
  const r = T.importJson(txt);
  assert.strictEqual(r.ok, true, r.errors.join('; '));
  assert.deepStrictEqual(r.state, s);
  assert.strictEqual(JSON.stringify(s), before);
  assert.deepStrictEqual(T.importJson(T.exportJson(r.state, null)).state, s);
  const bad = [
    ['{kaputt', /kein gültiges JSON/],
    [JSON.stringify({ app: 'anderes', version: 1, accounts: [] }), /Keine Tracker-Datei/],
    [JSON.stringify(Object.assign({}, s, { version: 2 })), /neueren Version/],
    [JSON.stringify(Object.assign({}, s, { version: '1' })), /gültige Version/],
    [JSON.stringify(Object.assign({}, s, { accounts: [a, a] })), /doppelt/],
    [JSON.stringify(Object.assign({}, s, { accounts: [Object.assign({}, a, { buyDate: '2026-02-30' })] })), /Kaufdatum/],
    [JSON.stringify(Object.assign({}, s, { accounts: [Object.assign({}, a, { days: [a.days[0], a.days[0]] })] })), /zwei Buchungen/]
  ];
  for (const [t, re] of bad) { const x = T.importJson(t); assert.strictEqual(x.ok, false); assert.strictEqual(x.state, null); assert.ok(x.errors.some(m => re.test(m)), x.errors.join('; ')); }
  assert.strictEqual(T.confirmText(s, { accounts: [1, 2, 3] }), 'Der Import ersetzt alle 2 Accounts durch 3 aus der Datei. Fortfahren?');
  assert.strictEqual(T.exportName('2026-10-18'), 'mepfc-tracker-2026-10-18.json');
});

test('16 Speicher: Ausnahme → leerer Stand und Hinweis, beschädigter Stand wird nicht überschrieben', () => {
  const thrower = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceeded'); } };
  const l = T.loadStore(thrower);
  assert.deepStrictEqual(l.state, T.emptyState()); assert.strictEqual(l.canSave, false);
  assert.ok(/wird nicht gespeichert, bitte exportieren/.test(l.msg));
  const s = T.saveStore(thrower, T.emptyState());
  assert.strictEqual(s.ok, false); assert.ok(/wird nicht gespeichert, bitte exportieren/.test(s.msg));
  const mem = { m: {}, getItem(k) { return k in this.m ? this.m[k] : null; }, setItem(k, v) { this.m[k] = v; } };
  assert.deepStrictEqual(T.loadStore(mem), { state: T.emptyState(), canSave: true, msg: null });
  const st = { app: T.APP, version: T.VERSION, accounts: [book(custom({}), '2026-10-01', [100])] };
  assert.strictEqual(T.saveStore(mem, st).ok, true);
  assert.deepStrictEqual(T.loadStore(mem).state, st);
  mem.m[T.STORE_KEY] = '{kaputt';
  const b = T.loadStore(mem);
  assert.strictEqual(b.canSave, false); assert.strictEqual(b.msg, T.BROKEN);
});

test('17 Regelschnappschuss: geändertes Angebot erzeugt einen Unterschied, die Rechnung nutzt den Schnappschuss', () => {
  const o = byId('af-std-50');
  const a = book(fromOffer('af-std-50'), '2026-10-01', [1500]);
  const changed = Object.assign({}, o, { dd: 2500, consEval: 40 });
  const diff = T.rulesDiff(a.rules, T.snapshotRules(changed, E));
  assert.deepStrictEqual(diff.map(x => x.key).sort(), ['consEval', 'dd', 'ddEval', 'ddFunded']);
  assert.ok(diff.every(x => typeof x.label === 'string' && x.label));
  assert.deepStrictEqual(T.rulesDiff(a.rules, T.snapshotRules(o, E)), []);
  assert.strictEqual(cur(a).floorNow, -50000);
  for (const k of T.SNAP_KEYS) assert.ok(k in a.rules, k);
});

test('18 parseDe und Datum (UTC, Monatswechsel, Schaltjahr, Sommerzeit)', () => {
  assert.strictEqual(T.parseDe('1.234,50'), 1234.5);
  assert.strictEqual(T.parseDe('−200'), -200);
  assert.strictEqual(T.parseDe('-1.234'), -1234);
  assert.strictEqual(T.parseDe('1234.5'), 1234.5);
  assert.strictEqual(T.parseDe(' 50.000 $'), 50000);
  assert.ok(Number.isNaN(T.parseDe(''))); assert.ok(Number.isNaN(T.parseDe('abc'))); assert.ok(Number.isNaN(T.parseDe('1,2,3')));
  assert.strictEqual(T.addDays('2028-02-28', 1), '2028-02-29');
  assert.strictEqual(T.addDays('2026-12-31', 1), '2027-01-01');
  assert.strictEqual(T.daysBetween('2026-03-28', '2026-03-30'), 2);
  assert.strictEqual(T.daysBetween('2026-10-24', '2026-10-26'), 2);
  assert.strictEqual(T.validIso('2026-02-29'), false); assert.strictEqual(T.validIso('2028-02-29'), true); assert.strictEqual(T.validIso('18.10.2026'), false);
  assert.strictEqual(T.deDate('2026-10-18'), '18.10.2026');
  assert.strictEqual(T.usd(-1234.5), '−1.234,5 $');
});

test('19 Tageswechsel (E6): aus rules (BG CFD 17:00 EST), sonst Kalendertag als Annahme', () => {
  const bg = snap('bg-cfd-1step-50').dayBoundary;
  assert.deepStrictEqual([bg.time, bg.tz, bg.assumed], ['17:00', 'EST', false]);
  const af = snap('af-std-50').dayBoundary;
  assert.strictEqual(af.assumed, true); assert.strictEqual(af.text, 'Tageswechsel nicht belegt, Kalendertag angenommen.');
  assert.strictEqual(ruleOf(ev(fromOffer('af-std-50')), 'day').exact, 'Annahme');
  const n = ALL.filter(o => !snap(o.id).dayBoundary.assumed).length;
  assert.strictEqual(n, ALL.filter(o => /\d{1,2}:\d{2}/.test(String((o.rules || {}).dailyDdBase || ''))).length);
});

test('20 Kurve: Pfade ohne DOM, Grenze und Ziel, Marken für Auszahlungen', () => {
  let a = T.addPayout(book(fromOffer('fn-flex-50', 'funded'), '2026-10-01', [800, -200, 600]), { date: '2026-10-03', amount: 300, received: 285 });
  const e = ev(a), m = T.curveModel(e.series, 300, 100);
  assert.strictEqual(e.series.points.length, 4);
  assert.ok(/^M8 /.test(m.bal) && m.bal.includes('H')); assert.ok(m.floor); assert.ok(typeof m.target === 'number');
  assert.strictEqual(m.marks.length, 1);
  assert.strictEqual(e.series.points[3].bal, 50900);
  // Kontostand statt Ergebnis: Ergebnis = Kontostand − Schlussstand des Vortags (nach Auszahlung)
  assert.strictEqual(T.closeBefore(a, '2026-10-04'), 50900);
  assert.strictEqual(T.closeBefore(a, '2026-10-03'), 50600);
  assert.strictEqual(T.closeBefore(a, '2026-10-01'), 50000);
});

test('21 Wortprüfung: kein „Hedge“, „Gegentrade“, „Gegenkonto“, „spiegel“ in den Tracker-Dateien und allen erzeugten Texten', () => {
  const re = new RegExp(T.FORBIDDEN.join('|'), 'i');
  for (const f of ['tracker.html', 'js/tracker.js', 'js/trackerUi.js']) {
    const txt = fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/FORBIDDEN=\[[^\]]*\]/, '');
    assert.ok(!re.test(txt), f + ': ' + (txt.match(re) || [])[0]);
  }
  for (const o of ALL) {
    let a = book(fromOffer(o.id), '2026-10-01', [{ pnl: 400, maxTradeLoss: 50 }, -300, 900, { pnl: 0, trades: 0 }]);
    if (a.phases[0].phase !== 'funded') a = book(T.addPhase(a, { phase: 'funded', start: '2026-10-10', startBalance: a.rules.size }), '2026-10-10', [500, 700]);
    a = T.addPayout(a, { date: '2026-10-11', amount: 100, received: 90 });
    const e = ev(a, '2026-10-20');
    const texts = [e.headline, e.word].concat(e.rules.flatMap(r => [r.label, r.word, r.exact, r.text, r.value, r.limit, r.distance]))
      .concat(T.rulesDiff(a.rules, T.snapshotRules(Object.assign({}, o, { dd: 1 }), E)).map(x => x.label));
    const sheet = E.ruleSheet(o);
    for (const g of sheet.groups) { texts.push(g.label); for (const x of g.entries) texts.push(x.label, x.text); }
    for (const t of texts) assert.ok(!re.test(String(t)), o.id + ': ' + t);
  }
});

test('22 Grenzen: keine Netzwerkaufrufe, kein DOM und keine Zeitabfrage im Kernmodul, Datenmodell nur Prop-Account', () => {
  for (const f of ['tracker.html', 'js/tracker.js', 'js/trackerUi.js']) {
    const txt = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/.test(txt), f);
  }
  const src = fs.readFileSync(path.join(__dirname, '..', 'js/tracker.js'), 'utf8');
  assert.ok(!/\bdocument\.|\bwindow\.|Date\.now|new Date\(\)|localStorage/.test(src));
  assert.deepStrictEqual(Object.keys(custom({})).sort(),
    ['buyDate', 'costs', 'days', 'feePaid', 'firmFloor', 'id', 'name', 'note', 'offerAsof', 'offerId', 'payouts', 'phases', 'rules', 'status'].sort());
  assert.ok(typeof E.maxpConvention === 'function');
});

console.log(`\n${passed} Tests bestanden${process.exitCode ? ', es gibt Fehler' : ''}.`);
