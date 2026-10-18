// Tests für Regelblatt und Eignungserklärung (M-016a). Ausführen: node test/explain.test.js
const assert = require('assert');
const Sim = require('../js/sim.js');
const { OFFERS } = require('../js/offers.js');
const Params = require('../js/params.js');
const Rank = require('../js/rank.js');
const Ex = require('../js/explain.js');
const { ruleSheet, challengeType, ruleCosts, ruleCostsForRows, strategyFit, typeSummary, placeOf, classify, rawKeyGroups, proxyCap } = Ex;

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + (e.stack || e.message)); process.exitCode = 1; }
}
const near = (a, b, eps = 1e-9, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg || ''} ${a} ≠ ${b}`);

const deps = { simulate: Sim.simulate, prepare: Sim.prepare, autoParams: Params.autoParams, rank: Rank };
const ALL = OFFERS.flatMap(g => g.items.map(o => ({ o, g: g.g })));
const byId = id => ALL.find(x => x.o.id === id).o;
const gOf = id => ALL.find(x => x.o.id === id).g;
const has = (r, k) => Object.prototype.hasOwnProperty.call(r, k);
// Je Anbieter ein Angebot
const ONE_PER_FIRM = ['af-zero-25', 'lu-pro-50', 'mf-rapid-25', 'fn-flex-50', 'ac-d-50', 'bg-cfd-2step-50', 'bg-fut-std-25'];

// Pfad wie 'row.P.dd' oder 'costs.groups.0.d' in ctx auflösen
const resolve = (ctx, path) => path.split('.').reduce((x, k) => (x === null || x === undefined ? undefined : x[k]), ctx);
function checkSentence(s, ctx) {
  assert.ok(s.nums.length >= 1, `Satz ohne Zahl: ${s.key}: ${s.text}`);
  assert.ok(s.nums.some(n => n.src !== 'derived'), `Satz ohne Zahl aus den Daten: ${s.key}: ${s.text}`);
  for (const n of s.nums) {
    assert.ok(s.text.includes(n.s), `${s.key}: „${n.s}“ fehlt in „${s.text}“`);
    assert.ok(typeof n.v === 'number' && Number.isFinite(n.v), `${s.key}: Zahl ${n.src} nicht endlich`);
    if (n.src !== 'derived') assert.strictEqual(resolve(ctx, n.src), n.v, `${s.key}: ${n.src}`);
  }
  assert.ok(!/gegentrade|hedge|umgeh|erkennung/i.test(s.text), `${s.key}: verbotenes Thema in „${s.text}“`);
}

console.log('explain.js');

test('Hinweistext wortgleich', () => {
  assert.strictEqual(Ex.DISCLAIMER, 'Gilt nur für die eingestellte Strategie. Positive Werte können aus der Payout-Struktur der Firma kommen statt aus einem Trading-Edge. Modell mit Annahmen (CLAUDE.md). Keine Anlageberatung.');
  assert.strictEqual(Ex.ANALYSIS, 'Analyse: Regel im Modell abgeschaltet, bei der Firma nicht möglich.');
});

test('1 ruleSheet: je Anbieter exakt die Datenwerte, fehlende Werte „keine Angabe“', () => {
  for (const id of ONE_PER_FIRM) {
    const o = byId(id), r = o.rules, sh = ruleSheet(o);
    assert.strictEqual(sh.id, id);
    let n = 0;
    for (const g of sh.groups) for (const e of g.entries) {
      n++;
      assert.ok(typeof e.text === 'string' && e.text.length, `${id} ${e.label}: kein Text`);
      assert.ok(e.unit, `${id} ${e.label}: keine Einheit`);
      if (e.field) {
        assert.strictEqual(e.value, o[e.field], `${id} ${e.label}: Wert ≠ ${e.field}`);
        if (e.state === 'none-model') assert.strictEqual(e.text, 'keine Regel im Modell');
      } else if (e.label === 'Kontogröße') {
        assert.strictEqual(e.value, Rank.accountSize(o));
      } else if (e.state === 'missing') {
        assert.strictEqual(e.text, 'keine Angabe');
        assert.strictEqual(e.from, null, `${id} ${e.label}: Quelle trotz fehlendem Schlüssel`);
      } else if (e.state === 'null') {
        assert.strictEqual(e.text, id.startsWith('af-') ? 'gilt nicht' : 'gilt nicht / keine Angabe');
        for (const k of e.from.split(' / ')) assert.strictEqual(r[k.replace('rules.', '')], null);
      } else {
        // Rohwert(e) genau aus rules
        const keys = e.from.split(' / ').map(k => k.replace('rules.', ''));
        const v = keys.length === 1 ? r[keys[0]] : keys.map(k => r[k]);
        assert.deepStrictEqual(e.value, v, `${id} ${e.label}`);
      }
      // Quellfeld zeigt auf einen vorhandenen Schlüssel
      if (e.from && e.from !== 'id') for (const k of e.from.split(' / ')) assert.ok(has(r, k.replace('rules.', '')), `${id} ${e.label}: ${k} fehlt`);
    }
    assert.ok(n > 40);
    assert.ok(sh.assumptions.length > 10 && !sh.assumptions.startsWith('Annahmen'), id);
    assert.strictEqual(sh.noteRules + ' Annahmen: ' + sh.assumptions, o.note.trim().replace(/\s+Annahmen:\s+/, ' Annahmen: '));
  }
  // Stichproben mit Zahl, Quellfeld und Text
  const entry = (id, gk, label) => ruleSheet(byId(id)).groups.find(g => g.key === gk).entries.find(e => e.label === label);
  let e = entry('af-zero-25', 'tageslimit', 'Eval');
  assert.deepStrictEqual([e.value, e.field, e.from, e.text], [500, 'dllEval', 'rules.dlgEval', '500 $']);
  e = entry('af-zero-25', 'consistency', 'Eval (bester Tag < … des Phasengewinns)');
  assert.deepStrictEqual([e.state, e.text, e.from, e.fromValue], ['none-model', 'keine Regel im Modell', 'rules.consEval', null]);
  e = entry('af-zero-25', 'kosten', 'Code gültig bis');
  assert.deepStrictEqual([e.state, e.text], ['missing', 'keine Angabe']);
  e = entry('af-zero-25', 'kosten', 'Monatsabo (je weitere 30 Kalendertage)');
  assert.deepStrictEqual([e.value, e.text], [89, '89 $']);
  e = entry('af-zero-25', 'kosten', 'Code');
  assert.deepStrictEqual([e.state, e.text, e.value], ['no-code', 'kein belegter Code', '–']);
  e = entry('ac-d-50', 'tageslimit', 'Funded');
  assert.deepStrictEqual([e.value, e.from, e.fromValue], [1500, 'rules.dailyDd', 1500]);
  e = entry('ac-d-50', 'auszahlung', 'Cap je Auszahlung');
  assert.strictEqual(e.text, 'kein Cap (100.000 $ = Konvention)');
  e = entry('mf-rapid-25', 'tageslimit', 'Funded');
  assert.deepStrictEqual([e.state, e.from, e.fromValue], ['none-model', 'rules.dlgFunded', null]);
  e = entry('mf-rapid-25', 'drawdown', 'Art laut Quelle');
  assert.deepStrictEqual([e.state, e.text], ['missing', 'keine Angabe']);
  e = entry('mf-rapid-25', 'drawdown', 'Art laut Quelle Eval / Funded');
  assert.strictEqual(e.text, 'EOD-trailing, Lock bei Start + 100 $ / intraday-trailing, Lock bei Start + 100 $');
  e = entry('bg-cfd-2step-50', 'kosten', 'Code gültig bis');
  assert.deepStrictEqual([e.state, e.value, e.text], ['value', null, 'ohne Ablaufdatum']);
  e = entry('bg-cfd-2step-50', 'ziele', 'Ziel Phase 2');
  assert.strictEqual(e.text, '2.000 $ (4,0 % der Kontogröße)');
  e = entry('lu-pro-50', 'tageslimit', 'Scaling Funded (Anteil des höchsten EOD-Gewinns)');
  assert.deepStrictEqual([e.value, e.text], [0.6, '60 %']);
  e = entry('fn-flex-50', 'kosten', 'Fee im Modell');
  assert.deepStrictEqual([e.value, e.from, e.text], [74.99, 'rules.codePrice', '74,99 $']);
});

test('1b Zuordnung: jeder rules-Schlüssel genau einer Gruppe oder der Restliste', () => {
  const m = rawKeyGroups(), seen = new Set();
  for (const { o } of ALL) for (const k of Object.keys(o.rules)) {
    seen.add(k);
    assert.ok(m[k], `${o.id}: rules.${k} ohne Gruppe`);
    assert.strictEqual(m[k].length, 1, `rules.${k} in mehreren Gruppen: ${m[k]}`);
  }
  for (const k of Object.keys(m)) assert.ok(seen.has(k), `Zuordnung nennt rules.${k}, das in keinem Angebot vorkommt`);
  // Restliste erscheint im Regelblatt
  const sh = ruleSheet(byId('lu-pro-50'));
  assert.deepStrictEqual(sh.rest.map(x => x.label), ['config']);
  assert.strictEqual(sh.rest[0].text, 'DLL an');
});

test('1c Proxy-Caps: feste Liste passt zu den notes, Text „Modell-Proxy: …, kein Firmen-Cap“', () => {
  const noted = ALL.filter(({ o }) => /Proxy/.test(o.note) && /cap/i.test(o.note.match(/[^.]*Proxy[^.]*/)[0] + o.note)).map(({ o }) => o.id).sort();
  const listed = ALL.filter(({ o }) => proxyCap(o)).map(({ o }) => o.id).sort();
  assert.deepStrictEqual(listed, noted);
  assert.strictEqual(listed.length, 12);
  for (const p of Ex.PROXY_CAPS) assert.ok(ALL.some(({ o }) => o.id.startsWith(p.prefix)), p.prefix);
  for (const id of listed) {
    const o = byId(id), m = proxyCap(o);
    assert.ok(o.note.includes(m.split(' ')[0]), `${id}: note nennt „${m}“ nicht`);
    const e = ruleSheet(o).groups.find(g => g.key === 'auszahlung').entries.find(x => x.field === 'cap');
    assert.ok(e.text.endsWith(`(Modell-Proxy: ${m}, kein Firmen-Cap)`), e.text);
  }
});

test('2 challengeType: alle 116 ohne „unbekannt“, Zählung je Typ', () => {
  const c = {};
  for (const { o, g } of ALL) {
    const t = challengeType(o, g);
    assert.ok(['instant', '1step', '2step'].includes(t.type), o.id);
    assert.ok(Ex.TYPE_KEYS.includes(t.key), `${o.id}: ${t.key}`);
    assert.ok(t.ddSource, o.id);
    c[t.key] = (c[t.key] || 0) + 1;
    if (t.type === '2step') { assert.strictEqual(t.market, 'CFD'); assert.strictEqual(t.ddModel, 'statisch'); assert.strictEqual(t.note, 'alle CFD, statischer DD'); }
  }
  assert.deepStrictEqual(c, { '1-Step · Futures': 54, 'Instant/Direct · Futures': 13, 'Instant/Direct · CFD': 15, '1-Step · CFD': 18, '2-Step · CFD': 16 });
  assert.strictEqual(challengeType(byId('fn-flex-50'), gOf('fn-flex-50')).ddSource, 'keine Angabe');
  assert.strictEqual(challengeType(byId('mf-rapid-25'), gOf('mf-rapid-25')).ddSource, 'Eval EOD-trailing, Lock bei Start + 100 $, Funded intraday-trailing, Lock bei Start + 100 $');
  assert.strictEqual(challengeType(byId('ac-pro6-50'), gOf('ac-pro6-50')).ddSource, 'statisch');
});

const UI = { wr: 40, rr: 1.5, n: 300 };
const rankRow = (id, ui = UI) => Rank.rankOffers([{ g: gOf(id), items: [byId(id)] }], ui, deps)[0];
const direct = (P, off, seed = Rank.SEED) => Rank.rowFromResult({ fee: P.fee }, Object.assign({}, P, off), Sim.simulate(Sim.prepare(Object.assign({}, P, off)), seed), {});

test('3 ruleCosts: abgeschaltet = direkter simulate-Aufruf mit Feld 0, Grundlauf = rank-Zeile', () => {
  const o = byId('af-zero-25'), row = rankRow('af-zero-25');
  const c0 = ruleCosts(o, UI, deps), c1 = ruleCosts(o, UI, deps, row);
  assert.strictEqual(c0.base.net, row.net, 'Grundlauf ≠ rank-Zeile');
  assert.strictEqual(c0.base.payout, row.payout);
  assert.deepStrictEqual(c0, c1);
  assert.deepStrictEqual(c0.groups.map(g => g.key), ['dll', 'cons', 'days', 'cap', 'fee']);
  for (const g of c0.groups) {
    if (g.exact) continue;
    const alt = direct(row.P, g.off);
    if (!g.moneyIdentical) near(g.d, alt.net - row.net, 1e-9, g.key);
    near(g.dPay, g.moneyIdentical ? 0 : alt.payout - row.payout, 1e-12, g.key);
  }
  // DLL-Gruppe: Feldnamen und Risiko aus dem Grundlauf
  const dll = c0.groups.find(g => g.key === 'dll');
  assert.deepStrictEqual(dll.off, { dllEval: 0, dllFunded: 0, dllScaleFunded: 0, dllScaleFrom: 0 });
  assert.strictEqual(dll.state, 'same'); assert.strictEqual(dll.stateText, 'wirkt nicht (identisch)');
  // Gedeckeltes Risiko bleibt beim Abschalten des Tageslimits
  const uiCap = { wr: 40, rr: 1.5, n: 200, riskPct: 60 }, rc = rankRow('af-zero-25', uiCap);
  assert.ok(rc.P.riskCapped);
  const cc = ruleCosts(o, uiCap, deps, rc), alt = direct(rc.P, { dllEval: 0, dllFunded: 0, dllScaleFunded: 0, dllScaleFrom: 0 });
  const g = cc.groups.find(x => x.key === 'dll');
  near(g.d, g.moneyIdentical ? 0 : alt.net - rc.net);
  assert.strictEqual(alt.risk, rc.risk);
  // Nicht handelbar → null
  assert.strictEqual(ruleCosts(o, { wr: 40, rr: 1.5, n: 50, risk: 600, cost: 10 }, deps), null);
});

test('3b Kalender (nur Zeit bei Pause) und Monatsabo (exakt aus feesPaid)', () => {
  const o = byId('mf-pro-50'), row = rankRow('mf-pro-50'), c = ruleCosts(o, UI, deps, row);
  const cal = c.groups.find(g => g.key === 'cal');
  assert.deepStrictEqual(cal.off, { payFirstAfterCal: 0, payEveryCal: 0 });
  assert.strictEqual(cal.moneyIdentical, true);
  assert.strictEqual(cal.d, 0); assert.strictEqual(cal.lo, 0); assert.strictEqual(cal.hi, 0);
  assert.notStrictEqual(cal.state, 'binds');
  const alt = direct(row.P, cal.off);
  near(cal.dCalDays, alt.calDays - row.calDays);
  assert.ok(cal.dCalDays < 0, 'ohne Wartezeit früher ausgezahlt');
  // Monatsabo: kein zweiter Lauf, exakt
  const oa = byId('af-std-50'), ra = rankRow('af-std-50'), ca = ruleCosts(oa, UI, deps, ra);
  const fee = ca.groups.find(g => g.key === 'fee');
  assert.strictEqual(fee.exact, true);
  assert.strictEqual(fee.d, ra.feesMean - oa.fee);
  assert.ok(fee.d > 0); assert.strictEqual(fee.state, 'binds'); assert.strictEqual(fee.lo, fee.hi);
  const noFee = direct(ra.P, { feeMonthly: 0 });
  near(fee.d, noFee.net - ra.net, 1e-9);
  // ohne Monatsabo und ohne Kalender keine Gruppe
  assert.ok(!ruleCosts(byId('lu-flex-50'), UI, deps).groups.some(g => g.key === 'fee' || g.key === 'cal'));
});

// Stub-Läufe: Account-Liste hängt nur von cap und maxp ab (Grundlauf cap 1000, abgeschaltet cap 100000)
function stubDeps(altNet, opts = {}) {
  return {
    simulate: P => {
      const L = [];
      for (let i = 0; i < 100; i++) {
        const base = i % 2 ? 1000 : -1000;
        const v = P.cap === 100000 ? altNet(i, base, P) : base;
        L.push({ i, res: 'pass', trades: 10, days: 5, daysToFirstPay: null, nPay: 0, pay: 0, hedge: 0, netNo: v, netHe: v, calDays: 7, calToFirstPay: null, feesPaid: 100 });
      }
      return { list: L, passed: 100, paid: 0, nPayTot: 0 };
    },
    prepare: P => P, autoParams: (o, ui) => Object.assign({}, o, ui, { hp: 5 }), rank: Rank
  };
}
const stubOffer = extra => Object.assign({ id: 'x-1', n: 'X', mode: 'challenge', fee: 100, dd: 2000, cap: 1000, maxp: 5, target: 3000, risk: 100, cost: 1, note: 'Annahmen: maxp 5 Konvention.', rules: {} }, extra);
const capOf = (o, deps) => ruleCosts(o, { n: 100 }, deps).groups.find(x => x.key === 'cap');

test('4 „bindet nicht messbar“, „bindet“ und „identisch“ an konstruierten Läufen (gepaarte Spanne)', () => {
  // abgeschaltet: Vorzeichen je Account getauscht plus shift → Differenzen ±2.000 + shift, SE ≈ 201, Spanne ≈ ±394
  const flip = shift => stubDeps((i, b) => -b + shift);
  const o = stubOffer();
  let g = capOf(o, flip(100));
  assert.strictEqual(g.state, 'none'); assert.strictEqual(g.stateText, 'bindet nicht messbar');
  assert.ok(g.lo < 0 && g.hi > 0); near(g.d, 100, 1e-9);
  g = capOf(o, flip(600)); assert.strictEqual(g.state, 'binds'); assert.ok(g.lo > 0);
  g = capOf(o, flip(-600)); assert.strictEqual(g.state, 'binds'); assert.ok(g.hi < 0);
  // identische Läufe → „wirkt nicht (identisch)“ mit Spanne 0
  g = capOf(o, stubDeps((i, b) => b));
  assert.deepStrictEqual([g.state, g.stateText, g.d, g.lo, g.hi, g.half, g.nDiff, g.dPay], ['same', 'wirkt nicht (identisch)', 0, 0, 0, 0, 0, 0]);
  // nur ein Account verschieden (wie af-std-50, Cap, WR 46 %): gepaart winzige Spanne um ein kleines Δ, nicht ±179 $
  g = capOf(o, stubDeps((i, b) => (i === 7 ? b + 9.56 : b)));
  assert.strictEqual(g.state, 'none'); assert.strictEqual(g.nDiff, 1);
  near(g.d, 0.0956, 1e-9); assert.ok(g.hi - g.lo < 0.5, `Spanne ${g.lo} bis ${g.hi}`);
  // Konstante Verschiebung aller Accounts: gepaart sicher
  g = capOf(o, stubDeps((i, b) => b + 5)); assert.strictEqual(g.state, 'binds'); assert.strictEqual(g.half, 0);
  const c = ruleCosts(o, { n: 100 }, flip(600));
  assert.strictEqual(c.costliest, 'cap'); assert.strictEqual(c.mostNegative, null);
});

test('4b Kontrolllauf maxp 1000 bei negativem Δ: kippt → Modellannahme, stabil → „auch ohne Auszahlungsgrenze“', () => {
  // abgeschaltet: −800 je Account bei maxp 5; mit maxp 1000 je nach Fall 0 (kippt) oder −800 (stabil); Rauschen ±2.000 je Account
  const deps = ctl => stubDeps((i, b, P) => -b + (P.maxp === 1000 ? ctl : -800));
  const o = stubOffer();
  assert.strictEqual(Ex.maxpConvention(o), true);
  let c = ruleCosts(o, { n: 100 }, deps(0)), g = c.groups.find(x => x.key === 'cap');
  assert.strictEqual(g.state, 'binds'); assert.ok(g.d < 0);
  assert.strictEqual(g.control.maxp, 1000); assert.strictEqual(g.control.state, 'none'); assert.strictEqual(g.maxpArtifact, true);
  assert.strictEqual(c.mostNegative, null); assert.strictEqual(c.maxpArtifact, 'cap');
  c = ruleCosts(o, { n: 100 }, deps(-800)); g = c.groups.find(x => x.key === 'cap');
  assert.strictEqual(g.maxpArtifact, false); assert.ok(g.control.d < 0);
  assert.strictEqual(c.mostNegative, 'cap'); assert.strictEqual(c.maxpArtifact, null);
  // maxp laut Quelle (rules.maxPayouts) → kein Kontrolllauf
  const of = stubOffer({ note: 'Annahmen: keine.', rules: { maxPayouts: 5 } });
  assert.strictEqual(Ex.maxpConvention(of), false);
  g = ruleCosts(of, { n: 100 }, deps(0)).groups.find(x => x.key === 'cap');
  assert.strictEqual(g.control, undefined); assert.strictEqual(g.maxpArtifact, undefined);
  // Daten: maxp-Konvention genau bei Alpha Futures, Lucid Pro/Daily, MFFU Rapid und Rapid EOD, Alpha Capital, Blue Guardian (13 + 8 + 5 + 19 + 46)
  assert.strictEqual(ALL.filter(({ o: x }) => Ex.maxpConvention(x)).length, 91);
  assert.strictEqual(Ex.maxpConvention(byId('lu-direct-25')), false);
  assert.strictEqual(Ex.maxpConvention(byId('mf-pro-50')), false);
});

test('4c Sätze zum Kontrolllauf an echten Angeboten (WR 46 %)', () => {
  const ui = { wr: 46, rr: 1.5, n: 1000 };
  const rows = Rank.rankOffers(OFFERS, ui, deps);
  let flipped = 0, stable = 0;
  for (const id of ['ac-d-50', 'bg-cfd-instant-200', 'lu-direct-25', 'ac-pro6-50', 'bg-fut-std-50']) {
    const o = byId(id), row = rows.find(r => r.id === id), costs = ruleCosts(o, ui, deps, row), f = strategyFit(o, ui, row, costs, rows);
    for (const s of [...f.reasons, ...f.more]) checkSentence(s, { row, costs, offer: o, fit: f });
    const s4 = f.reasons.find(s => ['costliest', 'negative', 'negativeMaxp', 'noBind'].includes(s.key));
    for (const g of costs.groups) if (g.control) { if (g.maxpArtifact) flipped++; else stable++; }
    if (costs.maxpArtifact && !costs.mostNegative && !costs.costliest) {
      assert.strictEqual(s4.key, 'negativeMaxp'); assert.ok(s4.text.includes('Modellannahme max. 5 Auszahlungen (Konvention, keine Firmenregel)'), s4.text);
    }
    if (costs.mostNegative && !costs.costliest) {
      const g = costs.groups.find(x => x.key === costs.mostNegative);
      assert.strictEqual(s4.key, 'negative');
      assert.strictEqual(s4.text.includes('auch ohne Auszahlungsgrenze'), !!g.control, s4.text);
    }
  }
  assert.ok(flipped + stable > 0, 'kein Kontrolllauf');
});

// Konstruierte Zeilen: netPer1k = net / dd · 1.000, dd 1.000
const R = (id, net, half, extra) => Object.assign({ id, name: id, net, netLo: net - half, netHi: net + half, netPer1k: net, n: 1000, payout: 0.2, days: 20, calDays: 28, pass: 0.3, fee: 100, market: 'Futures',
  P: { dd: 1000, mode: 'challenge', target: 1500, target2: 0, risk: 250, rr: 1.5, wr: 40, cost: 5, ddStatic: false, buf: 0, minp: 500, cap: 100000 } }, extra);

test('5 strategyFit-Schwellen: Platz-Spanne aus netPer1k plus Vorzeichen', () => {
  // 9 Zeilen, Drittelgrenzen 3 und 6
  const rows = [R('a', 900, 10), R('b', 800, 10), R('c', 700, 10), R('d', 600, 10), R('e', 500, 10), R('f', 400, 10), R('g', 300, 10), R('h', 200, 10), R('i', -100, 10)];
  const fit = id => strategyFit({ id }, {}, rows.find(r => r.id === id), null, rows);
  assert.deepStrictEqual(fit('a').place, { best: 1, worst: 1, n: 9, k: 900, kLo: 890, kHi: 910 });
  assert.strictEqual(fit('a').fit, 'gut'); assert.strictEqual(fit('c').fit, 'gut');
  assert.strictEqual(fit('d').fit, 'neutral'); assert.strictEqual(fit('f').fit, 'neutral');
  assert.strictEqual(fit('g').fit, 'schlecht'); assert.strictEqual(fit('g').why, 'bottom');
  assert.strictEqual(fit('i').fit, 'schlecht'); assert.strictEqual(fit('i').why, 'loses');
  // breite Spanne: überlappt (gleichauf) über die Drittelgrenze → neutral
  const wide = rows.map(r => r.id === 'c' ? R('c', 700, 250) : r);
  const fc = strategyFit({ id: 'c' }, {}, wide.find(r => r.id === 'c'), null, wide);
  assert.deepStrictEqual([fc.place.best, fc.place.worst], [1, 5]); assert.strictEqual(fc.fit, 'neutral');
  // oberes Drittel, aber Spanne schließt 0 ein → nicht „gut“
  const z = [R('p', 50, 60), R('q', -500, 10), R('r', -600, 10), R('s', -700, 10)];
  assert.strictEqual(classify(z[0], placeOf(z[0], z)).fit, 'neutral');
  // unteres Drittel nur möglich, aber nicht sicher → neutral; Netto sicher negativ → schlecht auch auf Platz 1
  const solo = [R('m', -50, 10)];
  assert.strictEqual(strategyFit({ id: 'm' }, {}, solo[0], null, solo).fit, 'schlecht');
  // gefilterte Zeilen als Bezug: Platz hängt an rows
  assert.strictEqual(strategyFit({ id: 'g' }, {}, rows[6], null, rows.slice(6)).place.best, 1);
  // nicht handelbar
  const nt = strategyFit({ id: 'n' }, {}, { id: 'n', net: null, notTradable: true, reason: 'Kein Trade möglich.' }, null, rows);
  assert.strictEqual(nt.fit, 'nicht handelbar'); assert.strictEqual(nt.reasons[0].text, 'Kein Trade möglich.');
  assert.strictEqual(fit('a').disclaimer, Ex.DISCLAIMER);
});

test('6 Begründungssätze: jeder mit Zahl aus row oder costs (echte Angebote, WR 40 % und 46 %)', () => {
  const ids = ['af-std-50', 'ac-d-50', 'bg-cfd-2step-50', 'mf-pro-100', 'af-direct-25', 'lu-direct-50', 'mf-rapid-25', 'bg-cfd-2step-nano-25', 'fn-rp-50'];
  const keys = new Set();
  for (const wr of [40, 46]) {
    const ui = { wr, rr: 1.5, n: 1000 };
    const rows = Rank.rankOffers(OFFERS.map(g => ({ g: g.g, items: g.items.filter(o => ids.includes(o.id)) })), ui, deps);
    for (const row of rows) {
      const o = byId(row.id), costs = ruleCosts(o, ui, deps, row), f = strategyFit(o, ui, row, costs, rows);
      assert.ok(f.reasons.length >= 3 && f.reasons.length <= 5, `${row.id}: ${f.reasons.length} Sätze`);
      for (const s of [...f.reasons, ...f.more]) { checkSentence(s, { row, costs, offer: o, fit: f }); keys.add(s.key); }
    }
  }
  for (const k of ['fit', 'target', 'instant', 'losses', 'costliest', 'negative', 'noBind', 'dllSame', 'cap', 'dd', 'payout'])
    assert.ok(keys.has(k), `Baustein ${k} kam nicht vor`);
});

test('7 typeSummary an Stub-Zeilen', () => {
  const rows = [
    R('f1', 300, 20, { name: 'F1' }), R('f2', 100, 20, { name: 'F2' }), R('f3', 290, 20, { name: 'F3' }),
    R('c1', 50, 20, { name: 'C1', market: 'CFD', P: Object.assign({}, R('x', 0, 0).P, { target2: 500, ddStatic: true }) }),
    R('i1', 600, 20, { name: 'I1', P: Object.assign({}, R('x', 0, 0).P, { mode: 'instant' }) }),
    { id: 'nt', net: null, notTradable: true, market: 'Futures', P: { mode: 'challenge' } }
  ];
  const costs = { f1: { costliest: 'cons' }, f2: { costliest: null, mostNegative: 'cap' }, f3: { costliest: 'cons' }, c1: { costliest: 'cap' }, i1: { costliest: null, mostNegative: null } };
  const t = typeSummary(rows, costs);
  assert.strictEqual(t.n, 5); assert.strictEqual(t.medianPer1k, 290); assert.strictEqual(t.disclaimer, Ex.DISCLAIMER);
  assert.deepStrictEqual(t.types.map(x => x.key), ['1-Step · Futures', '2-Step · CFD', 'Instant/Direct · Futures']);
  const f = t.types[0];
  assert.strictEqual(f.n, 3); assert.strictEqual(f.medianPer1k, 290); assert.strictEqual(f.medianNet, 290); assert.strictEqual(f.medianPayout, 0.2);
  assert.deepStrictEqual(f.best, { id: 'f1', name: 'F1', netPer1k: 300, ties: 1 });
  assert.deepStrictEqual(f.costliest, { counts: { cons: 2 }, none: 0, negative: 1, negCounts: { cap: 1 }, maxpModel: 0, n: 3, top: 'cons', topCount: 2, negTop: 'cap' });
  assert.ok(f.sentences[2].text.includes('bei 1 Angebot bringt eine Regel im Modell mehr Netto (am häufigsten Cap)'), f.sentences[2].text);
  assert.strictEqual(t.types[1].label, '2-Step · CFD (alle CFD, statischer DD)');
  assert.ok(t.types[2].sentences[0].text.includes('passt besser'));
  assert.ok(t.types[1].sentences[0].text.includes('passt schlechter'));
  for (const ty of t.types) for (const s of ty.sentences) checkSentence(s, { type: ty, summary: t });
  // ohne Kosten keine Regelzeile
  assert.ok(typeSummary(rows).types.every(x => x.costliest === null && x.sentences.length === 2));
});

test('8 Laufzeit: ruleCosts je Angebot unter 0,5 s (n 1000), alle 116 ohne Fehler', () => {
  const ui = { wr: 46, rr: 1.5, n: 1000 };
  const rows = Rank.rankOffers(OFFERS, ui, deps);
  let max = 0, maxId = null, cnt = 0;
  for (const row of rows) {
    const t = Date.now(); const c = ruleCosts(byId(row.id), ui, deps, row); const dt = Date.now() - t;
    if (dt > max) { max = dt; maxId = row.id; }
    if (c) cnt++;
  }
  assert.strictEqual(cnt, 116);
  assert.ok(max < 500, `${maxId}: ${max} ms`);
  console.log(`    (langsamstes Angebot ${maxId}: ${max} ms)`);
  const all = ruleCostsForRows(OFFERS, rows, ui, deps);
  assert.strictEqual(Object.keys(all).length, 116);
});

// ---- M-016b: schrittweise Regelkosten und Slippage in den Sätzen ----
const fs = require('fs');
const SLIP10 = { slipMode: 'fixed', slipPct: 10, slipBuffer: 0 };
const strat = (wr, extra) => Object.assign(Params.stratFromUi(Object.assign({ wr, rr: 1.5, riskPct: 25, costPct: 2, autorisk: true }, extra || {}), { n: 1000 }), { seed: 20261015 });

test('9 ruleCostsSteps: leer gelaufen = ruleCosts, ein yield je simulate-Aufruf', () => {
  for (const ui of [strat(40), strat(46), strat(46, Params.slipFromUi(SLIP10))]) {
    const rows = Rank.rankOffers(OFFERS.map(g => ({ g: g.g, items: g.items.filter(o => ONE_PER_FIRM.includes(o.id)) })), ui, deps);
    for (const row of rows) {
      let calls = 0;
      const d = Object.assign({}, deps, { simulate: (P, sd) => { calls++; return Sim.simulate(P, sd); } });
      const it = Ex.ruleCostsSteps(byId(row.id), ui, d, row);
      let steps = 0, r = it.next();
      while (!r.done) { steps++; assert.strictEqual(steps, calls, `${row.id}: Schritt ohne Lauf`); r = it.next(); }
      assert.strictEqual(steps, calls, row.id);
      assert.ok(steps >= 1, row.id);
      assert.deepStrictEqual(r.value, ruleCosts(byId(row.id), ui, deps, row), row.id);
    }
  }
});

test('10 slipMean = Formel der Oberfläche (app.js, M-017b E8)', () => {
  const src = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');
  const m = /const sBar=([^,]+?:[^,]+?:0), s=sBar\/100\*P\.risk;/.exec(src);
  assert.ok(m, 'Formel sBar in app.js nicht gefunden');
  const appS = new Function('P', `const sBar=${m[1]}; return sBar/100*P.risk;`);
  const cases = [
    { slipMode: 'none', risk: 500 }, { risk: 500 }, { slipMode: 'fixed', slipPct: 10, risk: 500 }, { slipMode: 'fixed', slipPct: 2.5, risk: 335 },
    { slipMode: 'dist', slipPct: 5, slipTailPct: 100, slipTailProb: 0.02, risk: 500 }, { slipMode: 'dist', slipPct: 0, slipTailPct: 300, slipTailProb: 0.141, risk: 125 },
    { slipMode: 'dist', slipPct: 7, slipTailPct: 50, slipTailProb: 0, risk: 1000 }];
  for (const P of cases) {
    const a = appS(Object.assign({ slipMode: 'none' }, P)), b = Ex.slipMean(P);
    near(b, a, 1e-9, JSON.stringify(P));
  }
  assert.strictEqual(Ex.slipMean({ slipMode: 'fixed', slipPct: 10, risk: 500 }), 50);
  assert.strictEqual(Ex.slipMean({ risk: 500 }), 0);
});

test('11 Sätze mit Slippage: Erwartungswert, Verlustserie und Tageslimit mit mittlerer Slippage, ohne Slippage wie bisher', () => {
  const o = byId('af-std-50');
  const row0 = Rank.rankOffers([{ g: gOf('af-std-50'), items: [o] }], strat(46), deps)[0];
  const f0 = strategyFit(o, strat(46), row0, null, [row0]);
  assert.strictEqual(f0.reasons.find(s => s.key === 'target').text,
    'Ziel 3.000 $ = 1,5 × Drawdown 2.000 $. Bei 500 $ Risiko, CRV 1,5 und 10 $ Kosten bringt ein Trade im Mittel 65 $, also rund 47 Trades bis zum Ziel; bestanden haben 45 % der Accounts.');
  assert.strictEqual(f0.reasons.find(s => s.key === 'losses').text, '4 Verlust-Trades in Folge (je 510 $) erreichen den Drawdown von 2.000 $.');
  const ui = strat(46, Params.slipFromUi(SLIP10));
  const rows = Rank.rankOffers(OFFERS, ui, deps);
  const row = rows.find(r => r.id === 'af-std-50'), c = ruleCosts(o, ui, deps, row);
  const f = strategyFit(o, ui, row, c, rows);
  const t2 = f.reasons.find(s => s.key === 'target').text, t3 = f.reasons.find(s => s.key === 'losses').text;
  assert.ok(t2.includes('10 $ Kosten und im Mittel 50 $ Slippage je Verlust bringt ein Trade im Mittel 38 $, also rund 79 Trades bis zum Ziel'), t2);
  assert.strictEqual(t3, '4 Verlust-Trades in Folge (je im Mittel 560 $ inkl. Slippage) erreichen den Drawdown von 2.000 $.');
  const d = f.more.find(s => s.key === 'dllSame');
  assert.ok(d && d.text.includes('im Mittel 560 $ Verlust je Trade inkl. Slippage nie'), d && d.text);
  for (const s of f.reasons.concat(f.more)) checkSentence(s, { row, costs: c, fit: f });
  // Regelkosten rechnen mit der Slippage: ac-d-50 Consistency
  // M-019: mit Max Risk (500 $) bricht bei fest 10 % jeder Funded-Verlust (485 + 48,5 + 10 $ ≥ 500 $), die Consistency wirkt nicht mehr
  const a = byId('ac-d-50'), ra = rows.find(r => r.id === 'ac-d-50'), ca = ruleCosts(a, ui, deps, ra);
  const g = ca.groups.find(x => x.key === 'cons');
  assert.strictEqual(Math.round(g.d), 0);
  assert.strictEqual(g.state, 'same');
  // ohne Max Risk (shield 0) wie vor M-019
  const a0 = { ...a, shield: 0 }, r0 = Rank.rankOffers([{ g: gOf('ac-d-50'), items: [a0] }], ui, deps)[0];
  const g0 = ruleCosts(a0, ui, deps, r0).groups.find(x => x.key === 'cons');
  assert.strictEqual(Math.round(g0.d), -474);
  assert.strictEqual(g0.state, 'binds');
});

test('12 Sätze mit Ausreißer-Slippage: jede Zahl mit Quelle, kein verbotenes Thema (je Anbieter)', () => {
  const ui = strat(40, Params.slipFromUi({ slipMode: 'dist', slipPct: 5, slipTailPct: 100, slipTailProb: 2, slipBuffer: 0 }));
  const rows = Rank.rankOffers(OFFERS, ui, deps);
  for (const id of ONE_PER_FIRM) {
    const row = rows.find(r => r.id === id), c = ruleCosts(byId(id), ui, deps, row);
    const f = strategyFit(byId(id), ui, row, c, rows);
    for (const s of f.reasons.concat(f.more)) checkSentence(s, { row, costs: c, fit: f });
  }
});

// ---- M-021: Guardian Shield / Max Risk in Regelkosten, Regelblatt und Slippage-Hinweis ----
const SHIELD_IDS = ALL.filter(x => x.o.shield > 0).map(x => x.o.id);
const M21_SLIP = [
  { slipMode: 'fixed', slipPct: 5, slipBuffer: 0 },
  { slipMode: 'fixed', slipPct: 5, slipBuffer: 5 },
  { slipMode: 'fixed', slipPct: 10, slipBuffer: 10 },
  { slipMode: 'dist', slipPct: 5, slipTailPct: 100, slipTailProb: 0.02, slipBuffer: 10 },
  { slipMode: 'dist', slipPct: 5, slipTailPct: 100, slipTailProb: 0.02, slipBuffer: 0 }
];
const M21_BAD = /umgeh|vermeid|austrick|trick|ausnutz|lücke|gegentrade|hedge|glitch|aushebel/i;
const m21P = (id, ui) => Sim.prepare(Params.autoParams(byId(id), { wr: 46, rr: 1.5, tradesPerDay: 1, n: 500, ...ui }));

test('M-021 shieldExposure: Anteil > 0 genau dann, wenn der Kern Shield-Brüche zählt (alle Angebote mit Grenze, fünf Slippage-Fälle)', () => {
  assert.strictEqual(SHIELD_IDS.length, 49);
  let warn = 0, n = 0;
  for (const sl of M21_SLIP) for (const id of SHIELD_IDS) {
    const P = m21P(id, sl), e = Ex.shieldExposure(P), R = Sim.simulate(P, Rank.SEED); n++;
    assert.strictEqual(e.share > 0, R.shieldBreaches > 0, `${id} ${JSON.stringify(sl)}: Anteil ${e.share}, Brüche ${R.shieldBreaches}`);
    assert.strictEqual(e.name, byId(id).rules.guardianShieldPct > 0 ? 'Guardian Shield' : 'Max Risk', id);
    const t = Ex.shieldWarnText(P);
    assert.strictEqual(t !== null, e.share > 0, id);
    if (t) {
      warn++; assert.ok(!M21_BAD.test(t), t);
      assert.ok(t.includes(e.name) && t.includes(`mindestens ${String(e.need).replace('.', ',')} %`), t);
      // Puffer = need: Auto-Risiko unter der Grenze, kein Funded-Verlust bricht mehr
      const P2 = m21P(id, { ...sl, slipBuffer: e.need });
      assert.strictEqual(Ex.shieldExposure(P2).share, 0, id + ' need');
      assert.strictEqual(Sim.simulate(P2, Rank.SEED).shieldBreaches, 0, id + ' need Brüche');
    }
  }
  assert.ok(warn >= 49 * 2 && n === 49 * 5, `Hinweise ${warn} von ${n}`);
});

test('M-021 shieldExposure: Formel fest und Ausreißer, ohne Shield oder Slippage 0', () => {
  const P = { shield: 500, risk: 485, cost: 10, rules: { guardianShieldPct: 1 } };
  assert.deepStrictEqual(Ex.shieldExposure({ ...P, slipMode: 'none' }), { share: 0, need: 0, name: 'Guardian Shield', tail: false });
  assert.deepStrictEqual(Ex.shieldExposure({ ...P, shield: 0, slipMode: 'fixed', slipPct: 50 }), { share: 0, need: 0, name: null, tail: false });
  // Abstand 5 $: 1 % von 485 $ reicht nicht (4,85 $), 2 % schon (9,70 $)
  assert.strictEqual(Ex.shieldExposure({ ...P, slipMode: 'fixed', slipPct: 1 }).share, 0);
  assert.deepStrictEqual(Ex.shieldExposure({ ...P, slipMode: 'fixed', slipPct: 2 }), { share: 1, need: 2, name: 'Guardian Shield', tail: false });
  assert.deepStrictEqual(Ex.shieldExposure({ ...P, rules: {}, slipMode: 'dist', slipPct: 1, slipTailPct: 100, slipTailProb: 0.02 }), { share: 0.02, need: 100, name: 'Max Risk', tail: true });
  const both = Ex.shieldExposure({ ...P, slipMode: 'dist', slipPct: 5, slipTailPct: 100, slipTailProb: 0.02 });
  near(both.share, 1); assert.strictEqual(both.need, 100); assert.strictEqual(both.tail, false);
  assert.strictEqual(Ex.shieldWarnText({ ...P, slipMode: 'fixed', slipPct: 5, slipBuffer: 0 }),
    'Slippage über dem Puffer: jeder volle Stop im Funded bricht den Guardian Shield (500 $); Verlust 485 $ + 24,25 $ + 10 $ = 519,25 $. Puffer auf mindestens 5 % erhöhen.');
  assert.strictEqual(Ex.shieldWarnText({ ...P, rules: {}, slipMode: 'dist', slipPct: 1, slipTailPct: 100, slipTailProb: 0.02 }),
    'Ausreißer über dem Puffer: 2 % der Verluste im Funded brechen den Max Risk (500 $). Puffer auf mindestens 100 % erhöhen oder Ausreißer senken.');
});

test('M-021 shieldRankText: nur bei Slippage über dem Puffer, mit Anzahl nach dem Lauf', () => {
  assert.strictEqual(Ex.shieldRankText({ slipMode: 'none' }), null);
  assert.strictEqual(Ex.shieldRankText({ slipMode: 'fixed', slipPct: 5, slipBuffer: 5 }), null);
  assert.strictEqual(Ex.shieldRankText({ slipMode: 'dist', slipPct: 5, slipTailPct: 100, slipTailProb: 0, slipBuffer: 5 }), null);
  const t = Ex.shieldRankText({ slipMode: 'dist', slipPct: 5, slipTailPct: 100, slipTailProb: 0.02, slipBuffer: 10 }, { hit: 22, n: 49 });
  assert.ok(t.includes('Puffer ≥ 100 % verhindert das.') && t.endsWith('Betroffen: 22 von 49 Angeboten mit Grenze.'), t);
  assert.ok(!M21_BAD.test(t));
  // Strenge: Puffer ≥ größte Slippage → kein Bruch bei allen 49 Angeboten
  for (const id of SHIELD_IDS) assert.strictEqual(Sim.simulate(m21P(id, { slipMode: 'dist', slipPct: 5, slipTailPct: 100, slipTailProb: 0.02, slipBuffer: 100 }), Rank.SEED).shieldBreaches, 0, id);
});

test('M-021 Regelkosten: Gruppe Guardian Shield / Max Risk nur mit Grenze, vor Cap, Abschaltung = simulate mit shield 0', () => {
  const ui = (sl) => ({ ...UI, wr: 46, rr: 1.5, tradesPerDay: 1, ...sl });
  // ohne Grenze keine Gruppe
  assert.ok(!ruleCosts(byId('af-zero-25'), UI, deps).groups.some(g => g.key === 'shield'));
  // ohne Slippage identisch
  let u = ui({}), row = rankRow('bg-cfd-instant-50', u), c = ruleCosts(byId('bg-cfd-instant-50'), u, deps, row);
  let g = c.groups.find(x => x.key === 'shield'), keys = c.groups.map(x => x.key);
  assert.ok(keys.indexOf('shield') >= 0 && (keys.indexOf('cap') < 0 || keys.indexOf('shield') < keys.indexOf('cap')), keys.join());
  assert.strictEqual(g.state, 'same'); assert.deepStrictEqual(g.off, { shield: 0 }); assert.strictEqual(g.note, null);
  assert.ok(g.rule.startsWith('Guardian Shield (500 $ je Trade, nur Funded, 1. Bruch Split 48,5 %, 2. Bruch Account verloren)'), g.rule);
  assert.ok(g.analysis.endsWith('Risiko wie im Grundlauf (der Risikodeckel wird nicht mitgemessen).'));
  // fest 5 %, Puffer 0: bindet, Δ = direkter Lauf ohne Grenze
  u = ui({ slipMode: 'fixed', slipPct: 5, slipBuffer: 0 }); row = rankRow('bg-cfd-instant-50', u); c = ruleCosts(byId('bg-cfd-instant-50'), u, deps, row);
  g = c.groups.find(x => x.key === 'shield');
  assert.strictEqual(g.state, 'binds'); assert.ok(g.d > 0 && g.shieldLost > 0);
  near(g.d, direct(row.P, { shield: 0 }).net - row.net, 1e-9, 'Δ');
  // AC: Grenze beim 1. Bruch
  row = rankRow('ac-d-50', u); g = ruleCosts(byId('ac-d-50'), u, deps, row).groups.find(x => x.key === 'shield');
  assert.ok(g.rule.startsWith('Max Risk (500 $ je Trade, nur Funded, 1. Bruch Account verloren)'), g.rule);
  // ac-pro6-100 mit Ausreißern: Shield-Verluste, aber der harte Tages-DD beendet dieselben Accounts
  u = ui({ slipMode: 'dist', slipPct: 5, slipTailPct: 100, slipTailProb: 0.02, slipBuffer: 10 });
  row = rankRow('ac-pro6-100', u); g = ruleCosts(byId('ac-pro6-100'), u, deps, row).groups.find(x => x.key === 'shield');
  assert.strictEqual(g.state, 'same'); assert.ok(g.shieldLost > 0); assert.strictEqual(g.note, Ex.SHIELD_SAME);
  assert.strictEqual(Ex.SHIELD_SAME, 'Wirkt nicht: dieselben Accounts hätte der Tages-DD beendet.');
});

test('M-021 shieldCanBreak: ohne mögliche Brüche ist der Lauf ohne Grenze bit-gleich (Regelkosten sparen den zweiten Lauf)', () => {
  let skipped = 0;
  for (const sl of [{}].concat(M21_SLIP)) for (const id of SHIELD_IDS) {
    const P = m21P(id, sl);
    if (Ex.shieldCanBreak(P)) continue;
    skipped++;
    assert.strictEqual(JSON.stringify(Sim.simulate({ ...P, shield: 0 }, Rank.SEED).list), JSON.stringify(Sim.simulate(P, Rank.SEED).list), id);
  }
  assert.ok(skipped >= 49 * 3, 'übersprungen: ' + skipped);
  assert.ok(Ex.shieldCanBreak({ shield: 500, risk: 495, cost: 5, slipMode: 'none' }));
  assert.ok(!Ex.shieldCanBreak({ shield: 0, risk: 495, cost: 5 }));
});

test('M-021 Regelblatt: Gruppe Risiko mit Grenze, Split ab dem 1. Bruch und Brüchen bis Verlust', () => {
  const ent = id => ruleSheet(byId(id)).groups.find(g => g.key === 'risiko').entries;
  const val = (id, f) => ent(id).find(e => e.field === f);
  assert.strictEqual(val('bg-cfd-instant-50', 'shield').text, '500 $ (1,0 % der Kontogröße)');
  assert.strictEqual(val('bg-cfd-instant-50', 'shieldSplit').text, '48,5 %');
  assert.strictEqual(val('bg-cfd-instant-50', 'shieldStrikes').text, '2');
  assert.strictEqual(val('ac-d-50', 'shieldStrikes').text, '1');
  assert.strictEqual(val('ac-d-50', 'shieldSplit').state, 'none-model');
  for (const f of ['shield', 'shieldSplit', 'shieldStrikes']) assert.strictEqual(val('af-zero-25', f).state, 'none-model', f);
});

test('M-021 typeSummary: Gruppe Shield als Bezeichnung bekannt', () => {
  assert.ok(Ex.GROUPS.some(G => G.key === 'shield' && G.label === 'Guardian Shield / Max Risk'));
  const rows = [{ id: 'x', net: 1, netPer1k: 1, kLo: 0, kHi: 2, payout: 0.5, P: { mode: 'instant' }, market: 'CFD', name: 'X' }];
  const s = typeSummary(rows, { x: { costliest: 'shield' } });
  assert.ok(s.types[0].sentences.find(x => x.key === 'typeCost').text.includes('Guardian Shield / Max Risk'));
});


test('M-023 Regelblatt: Mini/Micro im Modell bei gewähltem Instrument, Scaling-Stufen nicht abgebildet, Lot-Limit unverändert', () => {
  const ent = id => ruleSheet(byId(id)).groups.find(G => G.key === 'risiko').entries;
  const lab = id => ent(id).map(e => e.label);
  for (const id of ['af-std-50', 'mf-pro-50', 'bg-fut-direct-25']) {
    assert.ok(lab(id).includes('Max. Mini / Micro (im Modell bei gewähltem Instrument)'), id);
    assert.ok(!lab(id).some(l => /Mini \/ Micro \(nicht im Modell\)/.test(l)), id);
  }
  assert.ok(lab('af-std-50').includes('Scaling-Plan (Stufen nicht abgebildet)'));
  assert.ok(lab('ac-d-50').includes('Lot-Limit (nicht im Modell)'));
  assert.ok(lab('bg-cfd-1step-50').includes('Hebel (nicht im Modell)'));
  // note-Zusatz nur bei den 5 AF-Angeboten mit Scaling
  const sc = ALL.filter(x => /Stufen nicht belegt: Startstufe kann niedriger sein \(nicht abgebildet\)\./.test(x.o.note)).map(x => x.o.id).sort();
  assert.deepStrictEqual(sc, ALL.filter(x => x.o.rules && x.o.rules.scaling === true).map(x => x.o.id).sort());
  assert.strictEqual(sc.length, 5);
});

console.log(`${passed} Tests bestanden`);
