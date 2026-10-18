// Tests für den Rechner Positionsgröße und Risiko (M-027). Ausführen: node test/sizing.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const S = require('../js/sizing.js');
const Pa = require('../js/params.js');
const { OFFERS } = require('../js/offers.js');
const { accountSize } = require('../js/rank.js');
const { simulate, prepare } = require('../js/sim.js');

const deps = { OFFERS, autoParams: Pa.autoParams, contractLimit: Pa.contractLimit, INSTRUMENTS: Pa.INSTRUMENTS, accountSize };
const calc = inp => S.compute(inp, deps);
const ALL = OFFERS.flatMap(g => g.items.map(o => ({ o, mk: S.market(g.g) })));
const byId = id => ALL.find(x => x.o.id === id).o;
const ROOT = path.join(__dirname, '..');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}

// Raster für Futures und CFD (eine Stelle, damit Test 1, 4 und 7 dieselben Fälle sehen)
function grid() {
  const out = [];
  for (const { o, mk } of ALL) {
    const ins = S.instrumentsFor(mk);
    for (const instrument of ins) {
      const stops = instrument === S.CFD ? [10, 49, 120] : [3, 10, 25, 60];
      for (const stopPts of stops) for (const riskVal of [40, 300, 990, 2400]) for (const costPer of [0, 4.5]) {
        const inp = { offerId: o.id, riskMode: 'usd', riskVal, instrument, stopPts, costPer, rr: 1.5 };
        if (instrument === S.CFD) Object.assign(inp, { cfdPerPt: 1, lotStep: 0.01 });
        out.push({ o, inp });
      }
    }
  }
  return out;
}
const GRID = grid();

test('1. Rundung immer abwärts, tatsächliches Risiko ≤ Budget, Gleitkomma-Fall und Satz bei 0', () => {
  for (const { inp } of GRID) {
    const R = calc(inp);
    assert.ok(R.ok, JSON.stringify(R.errors));
    assert.ok(R.zero || R.risk <= R.budget + 1e-9, `${inp.offerId}: ${R.risk} > ${R.budget}`);
    // Ein Schritt mehr läge über dem Budget
    assert.ok((R.steps + 1) * R.perStep > R.budget + 1e-9);
  }
  let R = calc({ offerId: 'af-std-50', riskMode: 'usd', riskVal: 1000, instrument: 'NQ', stopPts: 20, costPer: 4, rr: 1.5 });
  assert.strictEqual(R.qty, 2); assert.strictEqual(R.risk, 800); assert.strictEqual(R.cost, 8); assert.strictEqual(R.target, 1200); assert.strictEqual(R.targetNet, 1192);
  // 1,15 ÷ 0,01 = 114,999… in Gleitkomma, mit Toleranz 115 Schritte
  R = calc({ riskMode: 'usd', riskVal: 1.15, instrument: 'CFD', stopPts: 1, costPer: 0, rr: 1, cfdPerPt: 1, lotStep: 0.01, size: 10000, dd: 500 });
  assert.strictEqual(R.steps, 115); assert.strictEqual(R.qtyText, '1,15 Lots');
  assert.strictEqual(S.roundDown(0.3, 0.1), 3); assert.strictEqual(S.roundDown(0.29999, 0.1), 2);
  // 0 Kontrakte bzw. Lots: Satz, keine Regelprüfung
  R = calc({ offerId: 'af-std-50', riskMode: 'usd', riskVal: 300, instrument: 'NQ', stopPts: 20, costPer: 0, rr: 1 });
  assert.ok(R.zero); assert.strictEqual(R.zeroText, 'Stop zu weit oder Risiko zu klein für 1 Kontrakt'); assert.deepStrictEqual(R.checks, []);
  R = calc({ offerId: 'ac-d-50', riskMode: 'usd', riskVal: 0.4, instrument: 'CFD', stopPts: 50, costPer: 0, rr: 1, cfdPerPt: 1, lotStep: 0.01 });
  assert.ok(R.zero); assert.strictEqual(R.zeroText, 'Stop zu weit oder Risiko zu klein für 0,01 Lots');
  R = calc({ offerId: 'ac-d-50', riskMode: 'usd', riskVal: 4, instrument: 'CFD', stopPts: 50, costPer: 0, rr: 1, cfdPerPt: 1, lotStep: 0.1 });
  assert.strictEqual(R.zeroText, 'Stop zu weit oder Risiko zu klein für 0,1 Lots');
});

test('2. Risiko in % des DD und der Kontogröße für alle Angebote', () => {
  for (const { o, mk } of ALL) {
    const size = accountSize(o);
    assert.ok(size > 0, o.id);
    const ins = S.instrumentsFor(mk)[0], extra = ins === S.CFD ? { cfdPerPt: 1, lotStep: 0.01 } : {};
    const a = calc(Object.assign({ offerId: o.id, riskMode: 'dd', riskVal: 25, instrument: ins, stopPts: 10, costPer: 0, rr: 1 }, extra));
    const b = calc(Object.assign({ offerId: o.id, riskMode: 'size', riskVal: 1, instrument: ins, stopPts: 10, costPer: 0, rr: 1 }, extra));
    assert.strictEqual(a.budget, o.dd * 0.25, o.id); assert.strictEqual(b.budget, size * 0.01, o.id);
  }
  const e = calc({ riskMode: 'dd', riskVal: 10, instrument: 'MNQ', stopPts: 10, costPer: 0, rr: 1 });
  assert.ok(!e.ok && e.errors.includes('Kontogröße muss eine Zahl > 0 sein.') && e.errors.includes('DD muss eine Zahl > 0 sein.'));
  const c = calc({ riskMode: 'dd', riskVal: 10, instrument: 'CFD', stopPts: 10, costPer: 0, rr: 1, size: 1e4, dd: 1e3, lotStep: 0.01 });
  assert.ok(c.errors.includes('„$ je Punkt und Lot“ eintragen (hängt vom Broker ab).'));
  const f = calc({ offerId: 'af-std-50', riskMode: 'dd', riskVal: 10, instrument: 'CFD', stopPts: 10, costPer: 0, rr: 1, cfdPerPt: 1, lotStep: 0.01 });
  assert.ok(f.errors.includes('Für ein Futures-Angebot ein Futures-Instrument wählen.'));
});

test('3. Shield-Grenze ≥ mit Kosten (Max Risk und Guardian Shield)', () => {
  const at = (id, costPer, stop, shieldOf) => {
    const o = byId(id);
    const R = calc({ offerId: id, riskMode: 'usd', riskVal: shieldOf(o), instrument: 'CFD', stopPts: stop, costPer, rr: 1, cfdPerPt: 1, lotStep: 0.01 });
    return R.checks.find(c => c.key === 'shield');
  };
  // ac-d-50: Grenze 500 $; 490 $ Risiko + 10 Lots × 1 $ = 500 $ → Bruch, × 0,999 $ = 499,99 $ → keiner
  assert.strictEqual(byId('ac-d-50').shield, 500);
  let c = at('ac-d-50', 1, 49, () => 490);
  assert.ok(!c.ok); assert.strictEqual(c.text, 'Risiko + Kosten (500 $) erreichen den Max Risk (500 $). Jeder volle Stop wäre ein Bruch.');
  assert.strictEqual(c.label, 'Max Risk 500 $ (gilt im Funded)');
  assert.ok(at('ac-d-50', 0.999, 49, () => 490).ok);
  const bg = byId('bg-cfd-1step-50');
  c = at('bg-cfd-1step-50', 1, 99, o => o.shield - 10);
  assert.ok(!c.ok && /Guardian Shield/.test(c.text) && c.label.endsWith('(gilt im Funded)'));
  assert.ok(at('bg-cfd-1step-50', 0.999, 99, o => o.shield - 10).ok, String(bg.shield));
});

test('4. Gleiches Urteil wie autoParams, Sätze wortgleich bzw. Präfix (Tageslimit)', () => {
  const seen = { dll: 0, shield: 0, contract: 0 };
  for (const { o, inp } of GRID) {
    const R = calc(inp);
    if (R.zero) continue;
    const fut = inp.instrument !== S.CFD;
    const ui = fut ? { risk: R.risk, cost: R.cost, instrument: inp.instrument, stopPts: inp.stopPts } : { risk: R.risk, cost: R.cost };
    const P = Pa.autoParams(o, ui);
    assert.strictEqual(R.violations.length > 0, !!P.notTradable, `${o.id} ${JSON.stringify(inp)}: ${P.reason}`);
    if (P.notTradable) {
      // erste Verletzung in Simulator-Reihenfolge = autoParams-Grund (Tageslimit gekürzt bis „Kein Trade möglich.“)
      const first = R.checks.find(c => !c.ok);
      if (first.key === 'dll') { assert.ok(P.reason.startsWith(first.text) && first.text.endsWith(S.DLL_CUT), P.reason); }
      else assert.strictEqual(first.text, P.reason);
    }
    for (const c of R.checks) if (!c.ok) {
      seen[c.key]++;
      const mask = c.key === 'dll' ? { shield: 0 } : c.key === 'shield' ? { dllEval: 0, dllFunded: 0, dllScaleFunded: 0 } : { dllEval: 0, dllFunded: 0, dllScaleFunded: 0, shield: 0 };
      const u = c.key === 'contract' ? ui : { risk: R.risk, cost: R.cost };
      const why = Pa.autoParams(Object.assign({}, o, mask), u).reason;
      if (c.key === 'dll') assert.ok(why.startsWith(c.text)); else assert.strictEqual(c.text, why);
    }
  }
  for (const k in seen) assert.ok(seen[k] > 0, 'keine Verletzung ' + k + ' im Raster');
  // M-023-Satz am bekannten Fall
  const R = calc({ offerId: 'af-std-50', riskMode: 'usd', riskVal: 1200, instrument: 'NQ', stopPts: 10, costPer: 4, rr: 1 });
  assert.deepStrictEqual(R.violations, [
    'Risiko + Kosten (1224 $) erreichen das Tageslimit (1000 $). Kein Trade möglich.',
    '6 NQ bei 10 Punkten Stop, erlaubt sind 5 Mini. Risiko senken oder Stop vergrößern.']);
});

test('5. Verluste bis DD und je Tag wie simulate (WR 0)', () => {
  const cases = [[2000, 500, 10, 1000, false], [2000, 400, 0, 1200, true], [2500, 600, 84, 1500, false], [1000, 250, 0, 0, false], [3000, 333, 7, 1000, true]];
  for (const [dd, risk, cost, lim, st] of cases) {
    const L = risk + cost;
    const P = prepare({ mode: 'challenge', fee: 0, target: 1e9, dd, ddStatic: st, risk, rr: 1, wr: 0, cost, hp: 0, buf: 0, minp: 1, wfrac: 100, cap: 1, split: 100, maxp: 1, n: 1, tradesPerDay: 50, dllEval: lim });
    const R = simulate(P, 20261015);
    assert.strictEqual(R.list[0].trades, S.lossesToDd(dd, L), `DD ${dd}/${L}`);
    if (lim > 0) {
      const day = R.accts[0].phases.step1.dayPnl[0];
      assert.ok(Math.abs(day + S.lossesPerDay(lim, L) * L) < 1e-6, `Tag ${day} vs ${S.lossesPerDay(lim, L)} × ${L}`);
    }
  }
  const R = calc({ offerId: 'af-std-50', riskMode: 'usd', riskVal: 1000, instrument: 'NQ', stopPts: 20, costPer: 4, rr: 1.5 });
  assert.deepStrictEqual(R.ddLosses, { hit: 3, survive: 2 });
  assert.strictEqual(R.lines.find(l => l.key === 'dll').text, 'Challenge kein Tageslimit; Funded 1.000 $: höchstens 1 voller Verlust je Tag.');
});

test('6. Nur ein Konto: feste Schlüsselliste, genau eine Positionsgröße', () => {
  const R = calc({ offerId: 'ac-d-50', riskMode: 'usd', riskVal: 400, instrument: 'CFD', stopPts: 50, costPer: 7, rr: 2, cfdPerPt: 1, lotStep: 0.01 });
  assert.deepStrictEqual(Object.keys(R).sort(), ['budget', 'budgetText', 'checks', 'cost', 'dd', 'ddLosses', 'errors', 'instrument', 'loss', 'lines', 'lotHint',
    'market', 'notes', 'offerId', 'ok', 'perStep', 'qty', 'qtyText', 'risk', 'size', 'step', 'steps', 'target', 'targetNet', 'unitWord', 'violations', 'zero'].sort());
  assert.strictEqual(R.lotHint, 'Lot-Limit laut Angebot: 20 Lots. Geltungsbereich nicht belegt, im Rechner nicht geprüft.');
  assert.ok(R.notes.includes('Ohne Slippage gerechnet: ein Stop kann weiter laufen.'));
});

test('7. Wortprüfung: Seite, Modul und alle erzeugten Sätze', () => {
  const BAD = /hedge|gegentrade|spiegel|gegenkonto/i;
  for (const f of ['rechner.html', 'js/sizing.js']) {
    const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.ok(!BAD.test(t), f + ': ' + (t.match(BAD) || [])[0]);
  }
  for (const { inp } of GRID) {
    const t = JSON.stringify(calc(inp));
    assert.ok(!BAD.test(t), inp.offerId);
  }
  // Angebots-note erscheint nirgends
  const R = calc({ offerId: 'af-std-50', riskMode: 'dd', riskVal: 25, instrument: 'MNQ', stopPts: 10, costPer: 1, rr: 1 });
  assert.ok(!JSON.stringify(R).includes(byId('af-std-50').note.slice(0, 40)));
});

test('8. Link-Leiste: index.html und rechner.html, Tracker nur wenn vorhanden', () => {
  const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), rc = fs.readFileSync(path.join(ROOT, 'rechner.html'), 'utf8');
  const nav = t => (t.match(/<nav class="sitenav"[^>]*>[\s\S]*?<\/nav>/) || [''])[0];
  assert.ok(/<div class="wrap">\s*<nav class="sitenav" aria-label="Seiten">/.test(idx), 'index: nav als erstes Kind von .wrap');
  assert.ok(/<div class="wrap">\s*<nav class="sitenav" aria-label="Seiten">/.test(rc), 'rechner: nav als erstes Kind von .wrap');
  assert.ok(/href="rechner\.html"/.test(nav(idx)) && /aria-current="page"[^>]*>Simulator/.test(nav(idx)));
  assert.ok(/href="index\.html"/.test(nav(rc)) && /aria-current="page"[^>]*>Rechner/.test(nav(rc)));
  const tr = fs.existsSync(path.join(ROOT, 'tracker.html'));
  for (const t of [idx, rc]) assert.strictEqual(/tracker\.html/.test(nav(t)), tr);
});

console.log(`\n${passed} Tests bestanden`);
