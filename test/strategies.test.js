// Tests für die Strategie-Presets (M-018). Ausführen: node test/strategies.test.js
const assert = require('assert');
const S = require('../js/strategies.js');
const { STRATEGIES, STRAT_FIELDS, DISCLAIMER, breakEven, edgeR, edge, applyStrategy, byId, EDGE_YES, EDGE_NO } = S;
const Pa = require('../js/params.js');
const { autoParams, stratFromUi, slipFromUi, SLIP_KEYS, CORE_KEYS } = Pa;
const { simulate, prepare } = require('../js/sim.js');
const { PRESETS, OFFERS } = require('../js/offers.js');
const { rankOffers } = require('../js/rank.js');
const { DISCLAIMER: EXPLAIN_DISCLAIMER } = require('../js/explain.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
const near = (a, b, eps = 1e-9, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg || ''} ${a} ≠ ${b}`);
const deps = { slipFromUi };
const ALL = OFFERS.flatMap(g => g.items);
const N = 20, SEED = 20261015;
// UI-Werte wie stratUi() in app.js (Schalter an, Auto-Risiko aus mit Hand-Risiko und alter Slippage, damit applyStrategy sie ersetzen muss)
const UI = { mode: 'challenge', hfund: false, ddStatic: false, tradesPerDay: 2, dllCompliant: true, consCompliant: false, daysCompliant: true,
  wr: 40, rr: 1.5, risk: 500, cost: 10, n: 500, riskPct: 30, costPct: 3, autorisk: false,
  slipMode: 'dist', slipPct: 5, slipTailPct: 100, slipTailProb: 0.02, slipBuffer: 5 };
const stratOf = (p, opts) => stratFromUi(applyStrategy(UI, p, deps), opts || { n: N });

// Erwartete Werte (Prüfbericht M-018): Break-even nach E8, EV je Trade in R, Kennzeichnung
const EXP = {
  'hoch-wr': { be: 1.02 / 1.5, ev: 0.7 * 0.5 - 0.3 - 0.02, edge: EDGE_YES },
  'tief-wr': { be: 1.02 / 4, ev: 0.27 * 3 - 0.73 - 0.02, edge: EDGE_YES },
  'leicht': { be: 1.02 / 2.2, ev: 0.48 * 1.2 - 0.52 - 0.02, edge: EDGE_YES },
  'mehrfach': { be: 1.04 / 2, ev: 0.55 - 0.45 - 0.04, edge: EDGE_YES },
  'null': { be: 0.51, ev: 0, edge: EDGE_NO },
  'leicht-slip': { be: 1.12 / 2.3, ev: 0.48 * 1.2 - 0.52 * 1.1 - 0.02, edge: EDGE_NO }
};
// Nicht handelbar bei hoch-wr laut Prüfbericht (Stand 115 Angebote); weitere sind erlaubt
const HOCH_WR_NT = ['af-zero-25', 'af-zero-50', 'af-std-50', 'af-adv-50', 'lu-flex-25', 'fn-flex-50', 'bg-fut-reserve-25',
  'bg-cfd-instant-5', 'bg-cfd-instant-10', 'bg-cfd-instant-25', 'bg-cfd-instant-50', 'bg-cfd-instant-100', 'bg-cfd-instant-200', 'bg-cfd-instant-300', 'bg-cfd-instant-400'];

// Break-even je Angebot aus P wie wr-hint in app.js (Kosten und Slippage in $)
function beP(P) {
  const sb = P.slipMode === 'fixed' ? P.slipPct : P.slipMode === 'dist' ? (1 - P.slipTailProb) * P.slipPct + P.slipTailProb * P.slipTailPct : 0, s = sb / 100 * P.risk;
  return (P.risk + P.cost + s) / (P.risk * (1 + P.rr) + s);
}

test('1 sechs Presets mit eindeutiger id, Name „Beispiel: “ und nur Strategiefeldern', () => {
  assert.deepStrictEqual(STRATEGIES.map(p => p.id), Object.keys(EXP));
  for (const p of STRATEGIES) {
    assert.ok(p.name.startsWith('Beispiel: '), p.id);
    for (const k of Object.keys(p)) assert.ok(['id', 'name', 'note'].concat(STRAT_FIELDS).includes(k), `${p.id}: ${k}`);
    for (const k of STRAT_FIELDS) assert.ok(p[k] !== undefined, `${p.id}: ${k} fehlt`);
    for (const k of Object.keys(p)) assert.ok(!CORE_KEYS.includes(k) && !/^(dll|cons|eval|pay|fee|cal)/.test(k), `${p.id}: Firmenfeld ${k}`);
    assert.ok(['none', 'fixed', 'dist'].includes(p.slip.slipMode), p.id);
    assert.strictEqual(byId(p.id), p);
  }
  assert.strictEqual(byId('gibt-es-nicht'), null);
});

test('2 Werte auf dem Raster der Regler', () => {
  const onGrid = (x, min, max, step) => x >= min && x <= max && Math.abs(Math.round((x - min) / step) * step + min - x) < 1e-9;
  for (const p of STRATEGIES) {
    assert.ok(onGrid(p.wr, 10, 80, 1), p.id + ' wr'); assert.ok(onGrid(p.rr, 0.5, 4, 0.1), p.id + ' rr');
    assert.ok(onGrid(p.riskPct, 5, 100, 1), p.id + ' riskPct'); assert.ok(onGrid(p.costPct, 0, 20, 0.5), p.id + ' costPct');
    assert.ok(onGrid(p.tradesPerDay, 1, 10, 1), p.id + ' tradesPerDay');
    if (p.slip.slipMode !== 'none') {
      assert.ok(onGrid(p.slip.slipPct, 0, 50, 0.5), p.id + ' slipPct'); assert.ok(onGrid(p.slip.slipBuffer || 0, 0, 50, 1), p.id + ' slipBuffer');
    }
  }
});

test('3 Break-even, EV und Kennzeichnung wie im Prüfbericht', () => {
  for (const p of STRATEGIES) {
    near(breakEven(p), EXP[p.id].be, 1e-9, p.id + ' be'); near(edgeR(p), EXP[p.id].ev, 1e-9, p.id + ' ev');
    assert.strictEqual(edge(p), EXP[p.id].edge, p.id);
    // Vorzeichen passt zur Kennzeichnung (null: EV 0 bis auf Rundung = kein Edge)
    assert.strictEqual(edgeR(p) > 1e-12, edge(p) === EDGE_YES, p.id);
  }
});

// Ausnahmen mit Grund; jede weitere Abweichung bleibt rot
const LABEL_EXCEPT = {
  // M-019: Risiko 20 $ wegen Max-Risk-Deckel (25 $), Kosten-Minimum 1 $ = 5 % → kein Edge
  'hoch-wr': ['ac-d-2.5'],
  'leicht': ['ac-d-2.5']
};

test('4 Kennzeichnung je Angebot (P aus autoParams, Formel wie app.js) gleich der nominalen', () => {
  for (const p of STRATEGIES) {
    const st = stratOf(p), bad = [];
    for (const o of ALL) {
      const P = autoParams(o, st); if (P.notTradable) continue;
      const lab = P.wr / 100 > beP(P) + S.EDGE_MARGIN ? EDGE_YES : EDGE_NO;
      if (lab !== edge(p)) bad.push(o.id);
    }
    assert.deepStrictEqual(bad, LABEL_EXCEPT[p.id] || [], p.id);
  }
});

test('5 applyStrategy: Kopie, Auto-Risiko an, Slippage ersetzt, Schalter bleiben', () => {
  const before = JSON.stringify(UI);
  for (const p of STRATEGIES) {
    const u = applyStrategy(UI, p, deps);
    assert.strictEqual(JSON.stringify(UI), before, 'Eingabe verändert');
    assert.notStrictEqual(u, UI);
    for (const k of ['wr', 'rr', 'riskPct', 'costPct', 'tradesPerDay']) assert.strictEqual(u[k], p[k], p.id + ' ' + k);
    assert.strictEqual(u.autorisk, true); assert.ok(!('risk' in u) && !('cost' in u), p.id);
    const slip = {}; for (const k of SLIP_KEYS) if (k in u) slip[k] = u[k];
    assert.deepStrictEqual(slip, slipFromUi(p.slip), p.id);
    for (const k of ['mode', 'hfund', 'ddStatic', 'n', 'dllCompliant', 'consCompliant', 'daysCompliant']) assert.strictEqual(u[k], UI[k], p.id + ' ' + k);
  }
  // aus = keine Slip-Schlüssel, fest = ohne Tail-Schlüssel
  assert.ok(SLIP_KEYS.every(k => !(k in applyStrategy(UI, byId('leicht'), deps))));
  assert.deepStrictEqual(slipFromUi(byId('leicht-slip').slip), { slipMode: 'fixed', slipPct: 10, slipBuffer: 10 });
});

test('6 stratFromUi ergibt das erwartete Strategieobjekt (params.js unverändert nutzbar)', () => {
  const p = byId('leicht-slip');
  assert.deepStrictEqual(stratOf(p, { n: 1000, hedge: false }), {
    wr: 48, rr: 1.2, tradesPerDay: 1, dllCompliant: true, consCompliant: false, daysCompliant: true, hfund: false,
    slipMode: 'fixed', slipPct: 10, slipBuffer: 10, n: 1000, riskPct: 25, costPct: 2, autorisk: true, hp: 0 });
  assert.deepStrictEqual(stratOf(byId('mehrfach'), { n: 7 }), {
    wr: 55, rr: 1, tradesPerDay: 3, dllCompliant: true, consCompliant: false, daysCompliant: true, hfund: false,
    n: 7, riskPct: 10, costPct: 4, autorisk: true });
});

test('7 alle Angebote je Preset: keine prepare-Ausnahme, Rangliste ohne Fehler, nicht handelbar nur hoch-wr mit Gewinntag-Schwelle', () => {
  const extra = [];
  for (const p of STRATEGIES) {
    const st = stratOf(p);
    for (const o of ALL) {
      const P = autoParams(o, st); if (P.notTradable) continue;
      assert.doesNotThrow(() => prepare(P), `${p.id} ${o.id}`);
    }
    const rows = rankOffers(OFFERS, Object.assign({}, st, { seed: SEED }), { simulate, prepare, autoParams });
    assert.strictEqual(rows.length, OFFERS.reduce((a, g) => a + g.items.length, 0));
    assert.deepStrictEqual(rows.filter(r => r.error).map(r => r.id + ': ' + r.error), [], p.id);
    const nt = rows.filter(r => r.notTradable);
    if (p.id !== 'hoch-wr') { assert.deepStrictEqual(nt.map(r => r.id), [], p.id); continue; }
    for (const r of nt) assert.ok(/^Gewinntag-Schwelle/.test(r.reason), `${r.id}: ${r.reason}`);
    const ids = nt.map(r => r.id);
    for (const id of HOCH_WR_NT) assert.ok(ids.includes(id), 'fehlt: ' + id);
    extra.push(...ids.filter(id => !HOCH_WR_NT.includes(id)));
  }
  if (extra.length) console.log('    weitere nicht handelbar bei hoch-wr: ' + extra.join(', '));
});

test('8 Texte: Hinweis wortgleich zu explain.js, keine Empfehlung, Annahme bei Slippage sichtbar', () => {
  assert.strictEqual(DISCLAIMER, EXPLAIN_DISCLAIMER);
  const texts = [DISCLAIMER].concat(STRATEGIES.flatMap(p => [p.name, p.note || '']), [EDGE_YES, EDGE_NO]).join(' ').toLowerCase();
  for (const w of ['profitabel', 'empfohlen', 'empfehl', 'lohnt', 'garantiert', 'gewinnstrategie', 'gegentrade', 'hedge'])
    assert.ok(!texts.includes(w), w);
  assert.ok(!/\bsicher\b/.test(texts), 'sicher');
  const s = byId('leicht-slip');
  assert.strictEqual(s.note, 'Slippage 10 % ist eine Annahme ohne Quelle (Beispielwert).');
  assert.ok(/Annahme/.test(s.name));
  for (const p of STRATEGIES) if (p.slip.slipMode === 'none') assert.ok(!p.note, p.id);
});

test('9 Video-PRESETS in offers.js unberührt und ohne Namenskollision', () => {
  assert.deepStrictEqual(Object.keys(PRESETS), ['futures', 'coin', 'edge', 'afstd', 'instant']);
  const snap = JSON.stringify(PRESETS);
  for (const p of STRATEGIES) { applyStrategy(PRESETS.futures, p, deps); assert.ok(!(p.id in PRESETS), p.id); }
  assert.strictEqual(JSON.stringify(PRESETS), snap);
});

console.log(`\n${passed} Tests bestanden${process.exitCode ? ', FEHLER' : ''}.`);
