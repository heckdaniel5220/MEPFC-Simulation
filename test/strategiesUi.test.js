// Tests für die Strategie-Beispiele in der Oberfläche (M-018b), DOM-frei. Ausführen: node test/strategiesUi.test.js
const assert = require('assert');
const Sim = require('../js/sim.js');
const { OFFERS, PRESETS } = require('../js/offers.js');
const Params = require('../js/params.js');
const Rank = require('../js/rank.js');
const S = require('../js/strategies.js');
const U = require('../js/strategiesUi.js');
const { canonP } = require('../js/explainUi.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + (e.stack || e.message)); process.exitCode = 1; }
}

const deps = { stratFromUi: Params.stratFromUi, slipFromUi: Params.slipFromUi, autoParams: Params.autoParams };
const rdeps = { simulate: Sim.simulate, prepare: Sim.prepare, autoParams: Params.autoParams };
const SEED = 20261015;
// Wie OFFER_BY in app.js (mit firm)
const ALL = OFFERS.flatMap(g => g.items.map(o => Object.assign({ firm: g.g.split(' · ')[0] }, o)));
const byId = id => ALL.find(o => o.id === id);
// UI-Werte wie stratUi() in app.js: Felder nach apply(P), dazu die Steuerfelder des Auto-Risikos
const uiOfP = (P, ctrl) => Object.assign(Params.uiFromP(P), { riskPct: 25, costPct: 2, autorisk: true }, ctrl || {});
const uiVideo = () => uiOfP(Object.assign({ tradesPerDay: 1 }, PRESETS.futures));
// Zustand nach einem Klick: mit Angebot applyOffer → apply(autoParams(o, strat)), ohne Angebot Felder plus risk/cost
function afterClick(ui, p, offer) {
  const pl = U.plan(ui, p, { hasOffer: !!offer }, deps);
  if (offer) return uiOfP(Params.autoParams(offer, pl.strat), { riskPct: pl.strat.riskPct, costPct: pl.strat.costPct, autorisk: true });
  const u = Object.assign({}, ui, Params.uiFromP(Object.assign({}, ui, pl.strat)), { risk: pl.risk, cost: pl.cost, riskPct: pl.strat.riskPct, costPct: pl.strat.costPct, autorisk: true });
  return u;
}
const BAD = /umgeh|vermeid|austrick|trick|ausnutz|lücke|gegentrade|hedge|glitch|aushebel|profitabel|empfohlen|empfehl|lohnt|garantiert|gewinnstrategie/i;
const plain = h => h.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

console.log('strategiesUi.js');

test('1 Modell: Reihenfolge, Name wortgleich, Etikett aus edge(), Break-even aus breakEven() mit einer Nachkommastelle', () => {
  const m = U.barModel();
  assert.deepStrictEqual(m.map(x => x.id), S.STRATEGIES.map(p => p.id));
  m.forEach((x, i) => {
    const p = S.STRATEGIES[i];
    assert.strictEqual(x.name, p.name);
    assert.strictEqual(x.label, S.edge(p));
    assert.strictEqual(x.edgeYes, S.edge(p) === S.EDGE_YES);
    assert.strictEqual(x.beTxt, 'Break-even ' + (Math.round(S.breakEven(p) * 1000) / 10).toFixed(1).replace('.', ',') + ' %');
    assert.strictEqual(x.note, p.note || null);
  });
  const ls = m.find(x => x.id === 'leicht-slip');
  assert.strictEqual(ls.label, 'kein Edge');
  assert.strictEqual(ls.beTxt, 'Break-even 48,7 %');
});

test('2 Plan: mit Angebot Strategie wie stratFromUi(applyStrategy), ohne risk/cost; ohne Angebot risk und cost > 0', () => {
  for (const ui of [uiVideo(), uiOfP(Params.autoParams(byId('ac-d-50'), Params.stratFromUi(uiVideo())), { autorisk: false, riskPct: 40 })]) {
    for (const p of S.STRATEGIES) {
      const want = Params.stratFromUi(S.applyStrategy(ui, p, { slipFromUi: Params.slipFromUi }));
      const a = U.plan(ui, p, { hasOffer: true }, deps);
      assert.deepStrictEqual(a.strat, want, p.id);
      assert.ok(!('risk' in a) && !('cost' in a) && !('risk' in a.strat), p.id);
      assert.strictEqual(a.strat.autorisk, true);
      for (const k of ['wr', 'rr', 'riskPct', 'costPct', 'tradesPerDay']) assert.strictEqual(a.strat[k], p[k], p.id + ' ' + k);
      // Schalter, hfund und n bleiben
      for (const k of ['dllCompliant', 'consCompliant', 'daysCompliant', 'hfund', 'n']) assert.strictEqual(a.strat[k], ui[k], p.id + ' ' + k);
      const b = U.plan(ui, p, { hasOffer: false }, deps);
      assert.deepStrictEqual(b.strat, want, p.id);
      assert.ok(b.risk > 0 && b.cost > 0 && Number.isFinite(b.risk) && Number.isFinite(b.cost), p.id);
      // Eingabe unverändert
      assert.deepStrictEqual(ui, JSON.parse(JSON.stringify(ui)));
    }
  }
  // Slippage: leicht-slip fest 10 % mit Puffer, alle anderen ohne Slip-Schlüssel (auch wenn vorher Slippage an war)
  const slipUi = Object.assign(uiVideo(), Params.slipFromUi({ slipMode: 'dist', slipPct: 3, slipTailPct: 80, slipTailProb: 4, slipBuffer: 2 }));
  for (const p of S.STRATEGIES) {
    const st = U.plan(slipUi, p, { hasOffer: true }, deps).strat;
    if (p.id === 'leicht-slip') assert.deepStrictEqual([st.slipMode, st.slipPct, st.slipBuffer, st.slipTailPct], ['fixed', 10, 10, undefined]);
    else assert.ok(!('slipMode' in st), p.id);
  }
});

test('3 Mit Angebot: P nach dem Klick gleich der Ranglisten-Zeile (alle Angebote, alle Beispiele, gleiches n)', () => {
  const ui = Object.assign(uiVideo(), { n: 20 });
  let n = 0, nt = 0;
  for (const p of S.STRATEGIES) {
    const strat = U.plan(ui, p, { hasOffer: true }, deps).strat;
    const rows = Rank.rankOffers(OFFERS, Object.assign({}, Params.stratFromUi(S.applyStrategy(ui, p, { slipFromUi: Params.slipFromUi }), { n: 20 }), { seed: SEED }), rdeps);
    for (const r of rows) {
      const o = byId(r.id);
      const P = Params.autoParams(o, strat);                       // applyOffer → apply(P)
      const read = Params.autoParams(o, Params.uiFromP(P));          // danach read() aus den Feldern
      assert.strictEqual(canonP(P), canonP(r.P), p.id + ' ' + r.id);
      if (!P.notTradable) assert.strictEqual(canonP(read), canonP(r.P), p.id + ' ' + r.id + ' (read)');
      else nt++;
      n++;
    }
  }
  assert.strictEqual(n, S.STRATEGIES.length * ALL.length);
  assert.ok(nt > 0, 'mindestens ein nicht handelbares Paar (hoch-wr)');
});

test('4 Aktiv: nach dem Klick genau dieses, Strategiefeld ändern löscht, andere Felder nicht, Start ohne Markierung', () => {
  const v = uiVideo();
  assert.strictEqual(U.activeId(v, { hasOffer: false }, deps), null, 'Video-Szenario Futures');
  assert.strictEqual(U.activeId(v, { hasOffer: true }, deps), null);
  const off = byId('ac-d-50');
  for (const has of [true, false]) {
    for (const p of S.STRATEGIES) {
      const u = afterClick(v, p, has ? off : null);
      assert.strictEqual(U.activeId(u, { hasOffer: has }, deps), p.id, `${p.id} ${has}`);
      // Strategiefelder: jede Änderung löscht
      const changes = [['wr', u.wr + 1], ['rr', Math.round((u.rr + 0.1) * 10) / 10], ['tradesPerDay', u.tradesPerDay + 1], ['riskPct', u.riskPct + 1], ['costPct', u.costPct + 0.5], ['autorisk', false]];
      changes.push(u.slipMode ? ['slipPct', u.slipPct + 1] : ['slipMode', 'fixed']);
      for (const [k, x] of changes) {
        const w = Object.assign({}, u, { [k]: x });
        if (k === 'slipMode') Object.assign(w, Params.slipFromUi({ slipMode: 'fixed', slipPct: 5, slipBuffer: 0 }));
        assert.strictEqual(U.activeId(w, { hasOffer: has }, deps), null, `${p.id} ${has} ${k}`);
      }
      if (!has) assert.strictEqual(U.activeId(Object.assign({}, u, { risk: u.risk + 5 }), { hasOffer: false }, deps), null, p.id + ' risk');
      // Andere Felder: Fee, Gegentrade, n, Schalter, ausgeblendete Slip-Werte lassen die Markierung stehen
      for (const [k, x] of [['fee', u.fee + 10], ['hp', u.hp + 1], ['n', u.n + 10], ['hfund', !u.hfund], ['dllCompliant', false], ['slipTailPct', 55]]) {
        const w = Object.assign({}, u, { [k]: x });
        assert.strictEqual(U.activeId(w, { hasOffer: has }, deps), p.id, `${p.id} ${has} ${k}`);
      }
      // Zurückstellen von Hand aktiviert wieder
      assert.strictEqual(U.activeId(Object.assign({}, u, { wr: u.wr + 1 }, { wr: u.wr }), { hasOffer: has }, deps), p.id);
    }
  }
});

test('5 Texte: DISCLAIMER wortgleich, note, Erklärsätze, keine verbotenen Wörter, aria-pressed nur am aktiven', () => {
  const h = U.barHtml(U.barModel(), 'leicht');
  const t = plain(h);
  assert.ok(t.includes(S.DISCLAIMER));
  assert.ok(t.includes('Slippage 10 % ist eine Annahme ohne Quelle (Beispielwert).'));
  assert.ok(t.includes('Das letzte Beispiel zeigt, wie Slippage einen kleinen Edge aufzehrt.'));
  assert.ok(t.includes('Ohne Angebot setzt das Beispiel Risiko und Kosten einmal aus dem Drawdown-Feld.'));
  for (const p of S.STRATEGIES) assert.ok(t.includes(p.name), p.id);
  assert.ok(!BAD.test(t), `verbotenes Wort: ${(t.match(BAD) || [])[0]}`);
  assert.strictEqual((h.match(/aria-pressed="true"/g) || []).length, 1);
  assert.ok(/data-sid="leicht" aria-pressed="true"/.test(h));
  assert.strictEqual((h.match(/<button type="button"/g) || []).length, S.STRATEGIES.length);
  assert.ok(!/class="[^"]*presets/.test(h), 'eigener Selektor, nicht .presets');
  assert.strictEqual((U.barHtml(U.barModel(), null).match(/aria-pressed="true"/g) || []).length, 0);
});


test('M-023 Presets lassen das Instrument unverändert, activeId erkennt sie mit Instrument', () => {
  for (const ins of [{ instrument: 'NQ', stopPts: 25 }, { instrument: 'MES', stopPts: 8 }]) for (const has of [true, false]) {
    const u0 = Object.assign(has ? uiOfP(Params.autoParams(byId('af-std-50'), Params.stratFromUi(uiVideo()))) : uiVideo(), ins);
    for (const p of S.STRATEGIES) {
      const pl = U.plan(u0, p, { hasOffer: has }, deps);
      assert.strictEqual(pl.strat.instrument, ins.instrument, p.id); assert.strictEqual(pl.strat.stopPts, ins.stopPts, p.id);
      // UI nach dem Klick: Strategie geschrieben, Instrument wie vorher
      const u = Object.assign({}, u0, { wr: pl.strat.wr, rr: pl.strat.rr, riskPct: pl.strat.riskPct, costPct: pl.strat.costPct, tradesPerDay: pl.strat.tradesPerDay,
        autorisk: true }, Params.slipFromUi(Params.slipFields(pl.strat)));
      for (const k of Params.SLIP_KEYS) if (!(k in pl.strat)) delete u[k];
      if (!has) { u.risk = pl.risk; u.cost = pl.cost; }
      assert.strictEqual(U.activeId(u, { hasOffer: has }, deps), p.id, `${p.id} ${has} ${ins.instrument}`);
      // Instrument und Stop setzt das Preset nicht: ein anderer Wert lässt es aktiv (wie die Video-Felder)
      assert.strictEqual(U.activeId(Object.assign({}, u, { instrument: 'ES' }), { hasOffer: has }, deps), p.id);
      assert.strictEqual(U.activeId(Object.assign({}, u, { stopPts: ins.stopPts + 1 }), { hasOffer: has }, deps), p.id);
      // Strategiefeld ändern löscht die Markierung weiterhin
      assert.notStrictEqual(U.activeId(Object.assign({}, u, { wr: u.wr + 1 }), { hasOffer: has }, deps), p.id);
    }
  }
});

console.log(`\n${passed} Tests bestanden${process.exitCode ? ', Fehler siehe oben' : ''}.`);
