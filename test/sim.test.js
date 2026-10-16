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

test('FundedNext hat 7 Einträge', () => {
  assert.strictEqual(FN.length, 7);
  assert.deepStrictEqual(FN.map(o => o.id), ['fn-flex-50', 'fn-flex-100', 'fn-flex-150', 'fn-rp-25', 'fn-rp-50', 'fn-rp-100', 'fn-direct-50']);
});

test('FundedNext-Einträge haben Quelle, Stand, Rohregeln und Code', () => {
  for (const o of FN) {
    assert.ok(typeof o.src === 'string' && o.src.startsWith('https://helpfutures.fundednext.com/'), o.id);
    assert.strictEqual(o.asof, '2026-10-15', o.id);
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

test('alle ids eindeutig, keine FundedNext-Legacy-ids mehr', () => {
  const ids = OFFERS.flatMap(gr => gr.items.map(o => o.id));
  assert.strictEqual(new Set(ids).size, ids.length);
  assert.ok(!ids.some(id => id.startsWith('fn-legacy-')), 'Legacy vorhanden');
});

// ---- Alpha-Capital-Katalog (M-010e) ----
const AC = OFFERS.find(gr => gr.g.startsWith('Alpha Capital')).items;

test('Alpha Capital hat 19 Einträge, insgesamt 66 Angebote (57 − 10 + 19)', () => {
  assert.strictEqual(AC.length, 19);
  assert.strictEqual(OFFERS.reduce((s, gr) => s + gr.items.length, 0), 66);
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

console.log(`\n${passed} Tests bestanden${process.exitCode ? ', mindestens einer fehlgeschlagen' : ''}.`);
