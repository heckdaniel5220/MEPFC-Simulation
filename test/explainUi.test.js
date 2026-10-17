// Tests für die Erklärungen in der Oberfläche (M-016b), DOM-frei. Ausführen: node test/explainUi.test.js
const assert = require('assert');
const Sim = require('../js/sim.js');
const { OFFERS } = require('../js/offers.js');
const Params = require('../js/params.js');
const Rank = require('../js/rank.js');
const Ex = require('../js/explain.js');
const U = require('../js/explainUi.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + (e.stack || e.message)); process.exitCode = 1; }
}

const deps = { simulate: Sim.simulate, prepare: Sim.prepare, autoParams: Params.autoParams, rank: Rank };
const ALL = OFFERS.flatMap(g => g.items.map(o => ({ o, g: g.g })));
const N_OFFERS = ALL.length;   // Anzahl zur Laufzeit (M-010h ändert sie)
const byId = id => ALL.find(x => x.o.id === id).o;
const gOf = id => ALL.find(x => x.o.id === id).g;
const SEED = 20261015;
const IDS = ['af-zero-25', 'af-std-50', 'lu-pro-50', 'mf-rapid-25', 'fn-flex-50', 'ac-d-50', 'bg-cfd-2step-50', 'bg-fut-std-25'];
const only = ids => OFFERS.map(g => ({ g: g.g, items: g.items.filter(o => ids.includes(o.id)) })).filter(g => g.items.length);
const stratOf = (wr, extra, n) => Params.stratFromUi(Object.assign({ wr, rr: 1.5, tradesPerDay: 1, dllCompliant: true, consCompliant: true, daysCompliant: true, hfund: false, riskPct: 25, costPct: 2, autorisk: true }, extra || {}), { n: n || 300 });
const uiOf = s => Object.assign({}, s, { seed: SEED });
// stratOf: Strategie wie stratFromUi(stratUi()) in app.js (alle Schalter gesetzt)
// Wörter, die auf Regelumgehung oder den Gegentrade deuten (nur in erzeugten Texten, nicht in zitierten Angebotsnotizen)
const BAD = /umgeh|vermeid|austrick|trick|ausnutz|lücke|gegentrade|hedge|glitch|aushebel/i;

console.log('explainUi.js');

test('1 Cache-Schlüssel: gleiche Werte gleich, jedes Feld und der Seed zählen, Metadaten nicht', () => {
  const P = Params.autoParams(byId('af-std-50'), stratOf(46));
  assert.strictEqual(U.costKey(P, SEED), U.costKey(Object.assign({}, P), SEED));
  assert.notStrictEqual(U.costKey(P, SEED), U.costKey(P, SEED + 1));
  for (const k of ['wr', 'risk', 'fee', 'n', 'consFunded', 'maxp']) assert.notStrictEqual(U.costKey(P, SEED), U.costKey(Object.assign({}, P, { [k]: P[k] + 1 }), SEED), k);
  assert.notStrictEqual(U.costKey(P, SEED), U.costKey(Object.assign({}, P, { slipMode: 'fixed', slipPct: 10 }), SEED));
  // Metadaten und Schlüsselreihenfolge ändern den Schlüssel nicht
  const meta = Object.assign({ firm: 'Alpha Futures', riskCapped: true, reason: 'x' }, P, { note: 'anders', rules: {} });
  assert.strictEqual(U.costKey(meta, SEED), U.costKey(P, SEED));
  const rev = {}; for (const k of Object.keys(P).reverse()) rev[k] = P[k];
  assert.strictEqual(U.costKey(rev, SEED), U.costKey(P, SEED));
  // „aus“: keine Slip-Schlüssel, Schlüssel wie ohne Slippage-Felder
  const off = Params.autoParams(byId('af-std-50'), stratOf(46, Params.slipFromUi({ slipMode: 'none', slipPct: 10 })));
  assert.strictEqual(U.costKey(off, SEED), U.costKey(P, SEED));
});

test('2 Ranglisten-Zeile und Hauptsimulation nach Klick: gleicher Schlüssel, gleiches P (auch gedeckelt, mit Slippage)', () => {
  for (const extra of [{}, Params.slipFromUi({ slipMode: 'fixed', slipPct: 10, slipBuffer: 5 })]) {
    const s = stratOf(46, Object.assign({ riskPct: 50 }, extra));
    const rows = Rank.rankOffers(only(IDS), uiOf(s), deps);
    assert.ok(rows.some(r => r.riskCapped), 'mindestens eine gedeckelte Zeile');
    for (const r of rows) {
      const o = Object.assign({ firm: gOf(r.id).split(' · ')[0] }, byId(r.id));   // wie OFFER_BY in app.js
      const clicked = Params.autoParams(o, Params.uiFromP(Params.autoParams(o, s)));
      assert.ok(U.sameP(clicked, r.P), r.id);
      assert.strictEqual(U.costKey(clicked, SEED), U.costKey(r.P, SEED), r.id);
    }
  }
});

test('3 Cache: höchstens max Einträge, älteste zuerst verworfen, erneutes Setzen frischt auf', () => {
  const c = U.createCache(3);
  ['a', 'b', 'c'].forEach((k, i) => c.set(k, i));
  c.set('a', 9); c.set('d', 4);
  assert.strictEqual(c.size(), 3);
  assert.ok(!c.has('b') && c.has('a') && c.has('c') && c.has('d'));
  assert.strictEqual(c.get('a'), 9);
  assert.strictEqual(U.CACHE_MAX, 600);
});

// Fake-Scheduler: Aufgaben in einer Liste, run() arbeitet sie ab
function fakeSched() { const q = []; return { q, sched: fn => q.push(fn), run(max) { let n = 0; while (q.length && (max === undefined || n < max)) { q.shift()(); n++; } return n; } }; }
function specsFor(wr, ids) {
  const ui = uiOf(stratOf(wr, {}, 200));
  const rows = Rank.rankOffers(only(ids), ui, deps);
  return rows.map(r => ({ offer: byId(r.id), row: r, ui: { seed: SEED }, key: U.costKey(r.P, SEED) }));
}

test('4 Warteschlange: ein simulate je Aufgabe, Ergebnis = ruleCosts, gewähltes Angebot zuerst, Abbruch nach dem laufenden Schritt', () => {
  let calls = 0;
  const d = Object.assign({}, deps, { simulate: (P, s) => { calls++; return Sim.simulate(P, s); } });
  const f = fakeSched(), got = {}, prog = [];
  const run = U.createRunner({ deps: d, sched: f.sched, onSel: (s, v) => { got[s.key] = v; }, onAll: a => prog.push(a.i) });
  const specs = specsFor(46, IDS);
  // alle starten, dann ein gewähltes Angebot dazwischen
  run.startAll(specs.slice(0, 4), 'snap1');
  let before = calls; f.run(1); assert.strictEqual(calls - before, 1, 'genau ein Lauf je Aufgabe');
  const sel = specs[6];
  assert.strictEqual(run.select(sel), undefined);
  const allAt = run.state().all.i;
  while (!(sel.key in got)) { before = calls; f.run(1); assert.ok(calls - before <= 1); }
  assert.strictEqual(run.state().all.i, allAt, 'Lauf für alle wartet, solange das gewählte Angebot rechnet');
  assert.deepStrictEqual(got[sel.key], Ex.ruleCosts(sel.offer, sel.ui, deps, sel.row));
  // Abbruch: nach dem laufenden Schritt kein weiterer Lauf
  f.run(2); run.cancelAll(); before = calls; f.run();
  assert.ok(calls - before <= 1, 'höchstens der schon geplante Schritt');
  assert.ok(run.state().all.cancelled);
  // Cache-Treffer: sofort, ohne Lauf
  before = calls; const hit = run.select(sel); assert.deepStrictEqual(hit, got[sel.key]); assert.strictEqual(calls, before);
  assert.strictEqual(f.q.length, 0);
});

test('5 Warteschlange: neuer Auftrag ersetzt den alten, Lauf für alle rechnet jedes Angebot genau einmal', () => {
  const f = fakeSched(), got = [];
  const run = U.createRunner({ deps, sched: f.sched, onSel: s => got.push(s.key) });
  const specs = specsFor(40, IDS);
  run.select(specs[0]); f.run(1);
  run.select(specs[1]); f.run();
  assert.deepStrictEqual(got, [specs[1].key], 'nur der neue Auftrag meldet ein Ergebnis');
  const a = run.startAll(specs, 'snap2'); f.run();
  assert.ok(a.done && !a.cancelled);
  assert.strictEqual(a.i, specs.length);
  for (const s of specs) assert.deepStrictEqual(run.cache.get(s.key), Ex.ruleCosts(s.offer, s.ui, deps, s.row), s.offer.id);
});

test('6 Zeile aus der Hauptsimulation besteht die Netto-Prüfung von ruleCosts', () => {
  for (const id of ['af-std-50', 'ac-d-50']) {
    const o = Object.assign({ firm: 'x' }, byId(id));
    const P0 = Params.autoParams(o, Object.assign(Params.uiFromP(Params.autoParams(o, stratOf(46))), { n: 250 }));
    const R = Sim.simulate(Sim.prepare(P0), SEED);
    const row = U.rowFromMain(Rank, o, gOf(id), P0, R);
    const c = Ex.ruleCosts(o, { seed: SEED }, deps, row);
    assert.ok(c && c.groups.length, id);
    assert.strictEqual(c.base.net, R.netNo / R.list.length);
  }
});

test('7 Eignung nur bei frischer Rangliste und gleichem P, nie „Platz 1 von 1“', () => {
  const s = stratOf(46);
  const rows = Rank.rankOffers(only(IDS), uiOf(s), deps);
  const row = rows.find(r => r.id === 'af-std-50');
  const sel = { id: 'af-std-50', P0: Object.assign({ firm: 'Alpha Futures' }, row.P), seed: SEED };
  const rk = { rows, filtered: rows, seed: SEED, stale: false, aborted: false, running: false };
  assert.strictEqual(U.fitGate(sel, rk).ok, true);
  assert.strictEqual(U.fitGate(sel, null).why, 'noRank');
  assert.strictEqual(U.fitGate(sel, Object.assign({}, rk, { stale: true })).why, 'stale');
  assert.strictEqual(U.fitGate(sel, Object.assign({}, rk, { running: true })).why, 'running');
  assert.strictEqual(U.fitGate(sel, Object.assign({}, rk, { aborted: true })).why, 'aborted');
  assert.strictEqual(U.fitGate(sel, Object.assign({}, rk, { seed: SEED + 1 })).why, 'differs');
  assert.strictEqual(U.fitGate(Object.assign({}, sel, { P0: Object.assign({}, sel.P0, { fee: 1 }) }), rk).why, 'differs');
  assert.strictEqual(U.fitGate(Object.assign({}, sel, { P0: Object.assign({}, sel.P0, { n: 299 }) }), rk).why, 'differs');
  assert.strictEqual(U.fitGate(sel, Object.assign({}, rk, { filtered: [row] })).why, 'few');
  assert.strictEqual(U.fitGate({ id: 'gibt-es-nicht', P0: row.P, seed: SEED }, rk).why, 'missing');
  for (const why of Object.keys(U.GATE_TEXT)) {
    const t = U.plain(U.gateHtml(why));
    assert.ok(!/Platz 1 von 1/.test(t) && t.includes(Ex.DISCLAIMER), why);
  }
});

test('8 HTML: Analyse-Hinweis, Slippage-Zeile nur bei Slippage, Kontrolllauf, Modellannahme, Hinweis, Escape', () => {
  const ui = uiOf(stratOf(46, {}, 1000));
  const rows = Rank.rankOffers(OFFERS, ui, deps);
  const row = rows.find(r => r.id === 'ac-d-50'), c = Ex.ruleCosts(byId('ac-d-50'), ui, deps, row);
  const h = U.costsHtml(c, null), t = U.plain(h);
  assert.ok(t.includes(Ex.ANALYSIS));
  assert.ok(!t.includes('Strategie, keine Firmenregel'));
  assert.ok(t.includes('mit max. 1.000 Auszahlungen'), 'Kontrolllauf-Zeile');
  // M-019: Risiko 485 statt 500 $ wegen Max-Risk-Deckel
  assert.ok(t.includes('−1.184 $'), 'Consistency Δ');
  const hs = U.plain(U.costsHtml(c, 'Slippage am Stop fest 10 % des Risikos'));
  assert.ok(hs.includes('Gerechnet mit: Slippage am Stop fest 10 % des Risikos (Strategie, keine Firmenregel).'));
  // Modellannahme maxp an einer konstruierten Gruppe
  const art = Object.assign({}, c, { groups: [Object.assign({}, c.groups.find(g => g.control), { maxpArtifact: true })] });
  assert.ok(U.plain(U.costsHtml(art, null)).includes('Modellannahme max. Auszahlungen (Konvention)'));
  assert.ok(U.plain(U.costsHtml(null, null)).includes('Nicht handelbar'));
  const fit = Ex.strategyFit(byId('ac-d-50'), ui, row, c, rows);
  assert.ok(U.plain(U.fitHtml(fit)).includes(Ex.DISCLAIMER));
  assert.ok(U.plain(U.typesHtml(Ex.typeSummary(rows), null)).includes(Ex.DISCLAIMER));
  assert.strictEqual(U.esc('<b a="1">&\''), '&lt;b a=&quot;1&quot;&gt;&amp;&#39;');
  // Regelblatt: je Gruppe ein details, Felder ohne Angabe gesammelt am Ende
  const sh = Ex.ruleSheet(byId('af-std-50')), sh2 = U.sheetHtml(sh);
  assert.strictEqual((sh2.match(/<details class="ex-group">/g) || []).length, sh.groups.length + (sh.rest.length ? 1 : 0));
  const miss = sh.groups.reduce((a, g) => a + g.entries.filter(e => e.state === 'missing' || e.state === 'null').length, 0);
  const listed = [...sh2.matchAll(/weitere Felder \((\d+) ohne Angabe\)/g)].reduce((a, m) => a + +m[1], 0);
  assert.strictEqual(listed, miss);
});

test('9 Erwartete Läufe = Grundlauf + aktive Gruppen mit eigenem Lauf', () => {
  const ui = uiOf(stratOf(40, {}, 200));
  for (const r of Rank.rankOffers(only(IDS), ui, deps)) {
    let calls = 0;
    const d = Object.assign({}, deps, { simulate: (P, s) => { calls++; return Sim.simulate(P, s); } });
    const c = Ex.ruleCosts(byId(r.id), ui, d, r);
    const ctl = c.groups.filter(g => g.control).length;
    assert.ok(calls === U.expectedRuns(r.P) + ctl || calls === U.expectedRuns(r.P) + ctl + 1, r.id);
  }
});

test('10 Wortprüfung: erzeugte Texte aller Angebote (WR 40 % und 46 %) ohne Umgehung und Gegentrade', () => {
  let n = 0, rowsSeen = 0;
  for (const wr of [40, 46]) {
    const ui = uiOf(stratOf(wr, {}, 200));
    const rows = Rank.rankOffers(OFFERS, ui, deps), costs = Ex.ruleCostsForRows(OFFERS, rows, ui, deps);
    rowsSeen = rows.length;
    const texts = [U.plain(U.typesHtml(Ex.typeSummary(rows, costs), null))];
    for (const r of rows) {
      const o = byId(r.id);
      texts.push(U.plain(U.fitHtml(Ex.strategyFit(o, ui, r, costs[r.id], rows))));
      if (costs[r.id] !== undefined) texts.push(U.plain(U.costsHtml(costs[r.id], 'Slippage am Stop fest 10 % des Risikos')));
      // Regelblatt ohne die zitierten Angebotsnotizen (Regeltext und Annahmen sind Daten)
      const sh = Ex.ruleSheet(o);
      texts.push(U.plain(U.sheetHtml(Object.assign({}, sh, { noteRules: '', assumptions: '' }))));
    }
    for (const t of texts) { n++; assert.ok(!BAD.test(t), `verbotenes Wort: ${(t.match(BAD) || [])[0]} in „${t.slice(Math.max(0, t.search(BAD) - 80), t.search(BAD) + 40)}“`); }
  }
  assert.strictEqual(rowsSeen, N_OFFERS);
  console.log(`    (${n} Texte, ${N_OFFERS} Angebote)`);
});

console.log(`${passed} Tests bestanden`);
