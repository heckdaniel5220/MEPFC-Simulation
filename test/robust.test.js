// Tests für die Robustheit der Rangliste über Seeds (M-025). Ausführen: node test/robust.test.js
const assert = require('assert');
const Rb = require('../js/robust.js');
const { seedList, createRobustState, robustStep, cancelRobust, robustOffers, summarize, median, C, STEP, GOLD, K_DEF, DISCLAIMER } = Rb;
const Rank = require('../js/rank.js');
const { simulate, prepare } = require('../js/sim.js');
const { OFFERS } = require('../js/offers.js');
const Pa = require('../js/params.js');
const { DISCLAIMER: EXPLAIN_DISCLAIMER } = require('../js/explain.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
const t0 = Date.now();
const BASE = 20261015, N = 200, K = 3;
const ALL = OFFERS.flatMap(g => g.items);
// Strategie wie die Rangliste in app.js (stratFromUi mit n und Gegentrade), WR 46 %, CRV 1,5, Auto-Risiko 25 %
const STRAT = Pa.stratFromUi({ wr: 46, rr: 1.5, riskPct: 25, costPct: 2, tradesPerDay: 1, autorisk: true,
  dllCompliant: true, consCompliant: true, daysCompliant: true, hfund: false, slipMode: 'none' }, { n: N, hedge: true });
const UI = Object.assign({}, STRAT, { seed: BASE, today: '2026-10-18' });
// simulate mit Zähler (Häppchen-Prüfung)
let calls = 0;
const DEPS = { simulate: (P, s) => { calls++; return simulate(P, s); }, prepare, autoParams: Pa.autoParams, rank: Rank };
const tradable = ALL.filter(o => !Pa.autoParams(o, STRAT).notTradable).length;
// Teilmenge (zwei Gruppen) für die Läufe in Test 4 und 5, damit der Test kurz bleibt
const SUB = OFFERS.slice(0, 2), SUBN = SUB.reduce((a, g) => a + g.items.length, 0);
const subTradable = SUB.flatMap(g => g.items).filter(o => !Pa.autoParams(o, STRAT).notTradable).length;

// Ein echter kleiner Lauf (n 200, K 3), schrittweise; geteilt von mehreren Tests
const stepCalls = [];
const RUN = createRobustState(OFFERS, UI, DEPS, { K });
while (!RUN.done) { const c = calls; robustStep(RUN); stepCalls.push(calls - c); }

test('1 seedList: Formel, Seed 0 = Basis, verschieden, Fehler außerhalb 1–50', () => {
  assert.strictEqual(C, Number((BigInt(STEP) * BigInt(GOLD)) % (1n << 32n)));
  assert.strictEqual(C, 3669159693);
  const s = seedList(BASE, 50);
  s.forEach((x, k) => assert.strictEqual(x, Number((BigInt(BASE) + BigInt(k) * BigInt(C)) % (1n << 32n)), 'k ' + k));
  assert.strictEqual(s[0], BASE);
  assert.strictEqual(new Set(s).size, 50);
  assert.deepStrictEqual(seedList(BASE, K_DEF), s.slice(0, 10));
  assert.strictEqual(K_DEF, 10);
  for (const bad of [0, 51, 2.5, '10', NaN, undefined]) assert.throws(() => seedList(BASE, bad), /K muss/, String(bad));
  for (const bad of [-1, 2 ** 32, 1.5, '1']) assert.throws(() => seedList(bad, 10), /Basis-Seed/, String(bad));
});

test('2 Abstand der Startpunkte ≥ 10 Mio. Ziehungen bis K 50 (Seed k = Basis + k · 0x9E3779B9 Ziehungen)', () => {
  const M = 1n << 32n, g = BigInt(STEP);
  let inv = 1n; for (let i = 0; i < 6; i++) inv = ((inv * (2n - g * inv)) % M + M) % M;
  assert.strictEqual((g * inv) % M, 1n);
  const off = seedList(BASE, 50).map(s => Number((((BigInt(s) - BigInt(BASE)) % M + M) % M * inv) % M));
  off.forEach((j, k) => assert.strictEqual(j, Math.imul(k, GOLD) >>> 0, 'k ' + k));
  let min = Infinity;
  for (let a = 0; a < 50; a++) for (let b = a + 1; b < 50; b++) {
    const d = Math.abs(off[a] - off[b]); min = Math.min(min, d, 2 ** 32 - d);
  }
  assert.ok(min >= 1e7, 'kleinster Abstand ' + min);
  assert.strictEqual(min, 56502930);
});

test('3 Seed 0 bit-gleich zu rankOffers mit dem Basis-Seed, Seed k zu rankOffers mit seed_k', () => {
  const plain = { simulate, prepare, autoParams: Pa.autoParams };
  assert.deepStrictEqual(RUN.ranks[0].rows, Rank.rankOffers(OFFERS, UI, plain));
  assert.deepStrictEqual(RUN.ranks[2].rows, Rank.rankOffers(OFFERS, Object.assign({}, UI, { seed: RUN.seeds[2] }), plain));
  assert.ok(RUN.ranks[0].rows.some((r, i) => r.net !== RUN.ranks[1].rows[i].net), 'Seed 1 rechnet andere Kurse');
});

test('4 Häppchen: je Schritt höchstens ein simulate, insgesamt K × handelbare Angebote', () => {
  assert.strictEqual(RUN.total, K * ALL.length);
  assert.strictEqual(stepCalls.length, RUN.total);
  assert.ok(stepCalls.every(c => c <= 1));
  assert.strictEqual(stepCalls.reduce((a, b) => a + b, 0), K * tradable);
  assert.strictEqual(RUN.i, RUN.total); assert.strictEqual(RUN.Kdone, K);
  const c0 = calls, all = robustOffers(SUB, UI, DEPS, { K });
  assert.strictEqual(calls - c0, K * subTradable);
  const st = createRobustState(SUB, UI, DEPS, { K });
  while (!st.done) robustStep(st);
  assert.deepStrictEqual(summarize(all), summarize(st));
  // Teilmenge: dieselben Zeilen wie der volle Lauf für diese Angebote
  const ids = new Set(SUB.flatMap(g => g.items.map(o => o.id)));
  assert.deepStrictEqual(all.ranks[1].rows, RUN.ranks[1].rows.filter(r => ids.has(r.id)));
  // ohne Angebote sofort fertig
  const empty = createRobustState([], UI, DEPS, { K: 2 });
  assert.ok(empty.done); assert.strictEqual(empty.total, 0); assert.strictEqual(summarize(empty).rows.length, 0);
});

test('5 Abbruch: keine weitere Simulation, summarize nur aus vollständigen Seeds', () => {
  const st = createRobustState(SUB, UI, DEPS, { K });
  const half = SUBN + Math.floor(SUBN / 2);
  for (let i = 0; i < half; i++) robustStep(st);
  assert.strictEqual(st.Kdone, 1); assert.strictEqual(st.i, half);
  cancelRobust(st);
  const c0 = calls; for (let i = 0; i < 10; i++) robustStep(st);
  assert.strictEqual(calls, c0); assert.strictEqual(st.i, half); assert.ok(!st.done);
  const s = summarize(st), one = summarize(robustOffers(SUB, UI, DEPS, { K: 1 }));
  assert.strictEqual(s.Kdone, 1);
  assert.deepStrictEqual(s.rows, one.rows);
  assert.ok(s.rows.filter(r => !r.notTradable).every(r => r.places.length === 1));
});

// Stub-Zeilen: Plätze bekannt, ohne Simulation
const row = (id, net, extra) => Object.assign({ id, name: 'Angebot ' + id, group: 'F · Futures', firm: 'F', market: 'Futures', type: 'challenge',
  fee: 100, size: 50000, notTradable: false, error: null, net, roi: net / 100 }, extra);
function stubState(nets, Kdone) {
  const ids = Object.keys(nets);
  const ranks = nets[ids[0]].map((_, k) => ({ rows: ids.map(id => nets[id] === null ? row(id, null, { notTradable: true, reason: 'x' })
    : row(id, nets[id][k], nets[id][k] === 'err' ? { net: null, error: 'Fehler' } : {})) }));
  return { K: ranks.length, Kdone: Kdone === undefined ? ranks.length : Kdone, seeds: ranks.map((_, k) => k), ranks, deps: { rank: Rank } };
}

test('6 summarize an Stub-Daten: Median (gerade, ungerade), Spanne, Plus, Top, nicht handelbar, fehlend', () => {
  const nets = { a: [300, 100, 300, 50], b: [200, 200, -10, 40], c: [-5, -50, 100, 60], d: null, e: [10, 'err', 0, 30] };
  const s = summarize(stubState(nets), { top: 1 });
  const by = id => s.rows.find(r => r.id === id);
  // Plätze je Seed: 1: a b e c · 2: b a c (e Fehler) · 3: a c e b · 4: c a b e
  assert.deepStrictEqual(by('a').places, [1, 2, 1, 2]);
  assert.deepStrictEqual(by('b').places, [2, 1, 4, 3]);
  assert.deepStrictEqual(by('c').places, [4, 3, 2, 1]);
  assert.deepStrictEqual(by('e').places, [3, 3, 4]);
  assert.strictEqual(by('a').medPlace, 1.5); assert.strictEqual(by('b').medPlace, 2.5); assert.strictEqual(by('e').medPlace, 3);
  assert.strictEqual(by('c').minPlace, 1); assert.strictEqual(by('c').maxPlace, 4);
  assert.strictEqual(by('a').plus, 4); assert.strictEqual(by('b').plus, 3); assert.strictEqual(by('c').plus, 2); assert.strictEqual(by('e').plus, 2);
  assert.strictEqual(by('a').top, 2); assert.strictEqual(by('b').top, 1); assert.strictEqual(by('c').top, 1); assert.strictEqual(by('e').top, 0);
  assert.deepStrictEqual(by('a').net, { med: 200, min: 50, max: 300 });
  assert.strictEqual(by('e').missing, 1); assert.strictEqual(by('a').missing, 0);
  const d = by('d');
  assert.ok(d.notTradable); assert.strictEqual(d.reason, 'x');
  for (const k of ['places', 'medPlace', 'minPlace', 'maxPlace', 'plus', 'top', 'net', 'value', 'missing']) assert.strictEqual(d[k], null, k);
  assert.deepStrictEqual(s.Nseed, [4, 3, 4, 4]); assert.strictEqual(s.N, 4);
  assert.strictEqual(s.Kdone, 4); assert.strictEqual(s.topLimit, 1); assert.strictEqual(s.disclaimer, DISCLAIMER);
  // ungerades Kdone: nur die ersten drei Seeds
  const s3 = summarize(stubState(nets, 3));
  assert.strictEqual(s3.rows.find(r => r.id === 'a').medPlace, 1);
  assert.strictEqual(s3.rows.find(r => r.id === 'c').medPlace, 3);
  assert.strictEqual(s3.rows.find(r => r.id === 'a').top, 3, 'Standard-Grenze 10');
  assert.strictEqual(median([]), null);
  assert.throws(() => summarize(stubState(nets), { key: 'xyz' }), /Sortierschlüssel/);
});

test('7 Filter und Sortierschlüssel wie sortRows(filterRows(…)) je Seed', () => {
  for (const [filter, key] of [[{ markt: 'CFD' }, 'roi'], [{ firma: 'Alpha Futures' }, 'net'], [undefined, 'netPer1k'], [{ typ: 'instant' }, 'days']]) {
    const s = summarize(RUN, { filter, key });
    const f = Rank.SORT_KEYS[key];
    for (let k = 0; k < K; k++) {
      const sorted = Rank.sortRows(Rank.filterRows(RUN.ranks[k].rows, filter).filter(r => !r.notTradable && !r.error && Number.isFinite(r[f])), key);
      sorted.forEach((r, i) => {
        const e = s.rows.find(x => x.id === r.id);
        assert.strictEqual(e.places[k], i + 1, `${key} ${r.id} Seed ${k}`);
      });
      assert.strictEqual(s.Nseed[k], sorted.length);
    }
    assert.strictEqual(s.rows.length, Rank.filterRows(RUN.ranks[0].rows, filter).length);
  }
});

test('8 Pflichttext wortgleich, keine verbotenen Wörter in exportierten Zeichenketten', () => {
  assert.strictEqual(DISCLAIMER, EXPLAIN_DISCLAIMER);
  const strs = [];
  const walk = v => { if (typeof v === 'string') strs.push(v); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  // Texte des Moduls: Exporte, Zusammenfassung ohne Zeilen (Zeilen tragen Daten aus offers.js und params.js) und Fehlermeldungen
  const sum = summarize(RUN); delete sum.rows;
  walk(Rb); walk(sum);
  for (const f of [() => seedList(BASE, 0), () => seedList(-1, 1), () => summarize(RUN, { key: 'x' })]) {
    try { f(); } catch (e) { strs.push(e.message); }
  }
  const txt = strs.join(' ').toLowerCase();
  for (const w of ['empfehl', 'beste wahl', 'kaufen', 'lohnt', 'sicher', 'stabil', 'garantiert', 'profitabel', 'gewinnstrategie', 'umgeh', 'trick', 'gegentrade', 'glitch'])
    assert.ok(!txt.includes(w), w);
  assert.ok(txt.includes('keine anlageberatung'));
});

test('9 echter Lauf n 200, K 3: Plätze vollständig, Seeds im Plus und Top als Anzahl', () => {
  const s = summarize(RUN);
  assert.strictEqual(s.K, K); assert.strictEqual(s.Kdone, K); assert.deepStrictEqual(s.seeds, seedList(BASE, K));
  assert.strictEqual(s.N, tradable); assert.deepStrictEqual(s.Nseed, [tradable, tradable, tradable]);
  assert.strictEqual(s.rows.length, ALL.length);
  for (const r of s.rows) {
    if (r.notTradable) continue;
    assert.strictEqual(r.places.length, K, r.id); assert.strictEqual(r.missing, 0);
    assert.ok(Number.isInteger(r.plus) && r.plus >= 0 && r.plus <= K);
    assert.ok(Number.isInteger(r.top) && r.top >= 0 && r.top <= K);
  }
  // je Seed belegen genau 10 Angebote die Top 10
  assert.strictEqual(s.rows.reduce((a, r) => a + (r.top || 0), 0), 10 * K);
});

console.log(`robust: ${passed} Tests bestanden (${Date.now() - t0} ms)`);
