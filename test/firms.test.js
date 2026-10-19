// Tests für die Seite „Regeln“ (M-029): Firmendaten, Zusammenführen der Regelblätter je Plan, Wortprüfung, Link-Leiste.
// Ausführen: node test/firms.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const F = require('../js/firms.js');
const E = require('../js/explain.js');
const UI = require('../js/regelnUi.js');
const { OFFERS } = require('../js/offers.js');

const ROOT = path.join(__dirname, '..');
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok  ' + name); }
  catch (e) { console.error('FEHLER  ' + name + '\n  ' + (e && e.stack || e)); process.exitCode = 1; }
}
const M = F.model({ OFFERS, ruleSheet: E.ruleSheet });
const PAGE = UI.pageHtml(F, M);
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s));
const isUrl = s => /^https:\/\/[^\s]+$/.test(String(s));

test('1. Zuordnung: jede OFFERS-Gruppe hat genau einen FIRMS-Eintrag über den vollen Gruppennamen', () => {
  assert.strictEqual(F.FIRMS.length, OFFERS.length);
  for (const g of OFFERS) assert.strictEqual(F.FIRMS.filter(f => f.group === g.g).length, 1, g.g);
  for (const f of F.FIRMS) assert.ok(OFFERS.some(g => g.g === f.group), f.id);
  assert.strictEqual(new Set(F.FIRMS.map(f => f.id)).size, F.FIRMS.length);
  assert.deepStrictEqual(M.map(m => m.firm.id), F.FIRMS.map(f => f.id));
  // BG CFD und BG Futures sind getrennte Einträge
  assert.ok(F.firmOfGroup('Blue Guardian · CFD') !== F.firmOfGroup('Blue Guardian · Futures'));
});

test('2. Limits: drei Zustände, jede Zahl mit Quelle und Stand, „nicht belegt“ ohne Zahl', () => {
  const proof = (x, w) => { assert.ok(isUrl(x.src), w + ' src'); assert.ok(isDate(x.asof), w + ' asof'); if (x.written) assert.ok(isDate(x.written), w + ' written'); };
  for (const f of F.FIRMS) {
    assert.deepStrictEqual(Object.keys(f.limits).sort(), ['allocation', 'eval', 'funded', 'live'], f.id);
    for (const [k, x] of Object.entries(f.limits).concat([['scope', f.scope]])) {
      const w = f.id + '.' + k;
      assert.ok(['value', 'none', 'unknown'].includes(x.state), w);
      if (x.state === 'value' && k !== 'scope') { assert.ok(typeof x.value === 'number' && x.value > 0, w); proof(x, w); }
      if (x.state === 'value' && k === 'scope') { assert.ok(x.text, w); proof(x, w); }
      if (x.state === 'none') { assert.ok(!('value' in x), w); proof(x, w); }
      if (x.state === 'unknown') {
        assert.ok(!('value' in x) && !x.src, w + ': keine Zahl, keine Schätzung');
        if (x.third) { assert.ok(x.third.text && x.third.src && isDate(x.third.asof), w + ' third'); }
      }
      if (x.third) assert.strictEqual(x.state, 'unknown', w + ': third nur bei unknown');
    }
    for (const x of f.extra) proof(x, f.id + ' extra');
    for (const p of f.plans) {
      proof(p, f.id + ' plans');
      assert.ok(typeof p.value === 'number', f.id + ' plans value');
      const g = OFFERS.find(g => g.g === f.group);
      assert.ok(g.items.some(o => F.planKey(o.id) === p.plan), p.plan);
    }
  }
  const by = id => F.FIRMS.find(f => f.id === id);
  // Werte laut Auftrag (E1, E3, E6)
  assert.deepStrictEqual([by('lu').limits.eval.value, by('lu').limits.funded.value, by('lu').limits.live.value], [10, 5, 5]);
  assert.strictEqual(by('fn').limits.eval.state, 'none');
  assert.strictEqual(by('fn').limits.funded.value, 5);
  assert.strictEqual(by('fn').limits.allocation.value, 750000);
  assert.ok(/laut Text bei Challenges/.test(by('fn').limits.allocation.text));
  assert.strictEqual(by('af').limits.live.state, 'unknown');
  assert.strictEqual(by('af').limits.live.third.text, 'Drittquelle nennt 5 Live');
  assert.strictEqual(by('af').limits.live.third.asof, '2026-06-22');
  assert.strictEqual(by('mf').limits.funded.state, 'unknown');
  assert.deepStrictEqual(by('mf').plans.map(p => [p.plan, p.value, p.asof]), [['mf-rapid-eod', 3, '2026-10-17']]);
  for (const id of ['ac', 'bg-cfd', 'bg-fut']) for (const x of Object.values(by(id).limits)) assert.strictEqual(x.state, 'unknown', id);
});

test('3. Regelblatt je Plan: 28 Pläne, Spalten in OFFERS-Reihenfolge, jede Zelle = Text des Einzelangebots', () => {
  let plans = 0, offers = 0;
  for (const m of M) {
    const ids = m.plans.flatMap(p => p.cols.map(c => c.id));
    assert.deepStrictEqual(ids, m.items.map(o => o.id), m.firm.id + ': Spaltenreihenfolge');
    for (const p of m.plans) {
      plans++;
      const items = p.cols.map(c => m.items.find(o => o.id === c.id)); offers += items.length;
      const sheets = items.map(o => E.ruleSheet(o));
      const expand = cells => cells.flatMap(c => Array(c.span).fill(c.text));
      for (const g of p.groups) {
        const sg = sheets[0].groups.find(x => x.key === g.key);
        for (const r of g.rows) {
          const i = sg.entries.findIndex(e => e.label === r.label);
          assert.ok(i >= 0, r.label);
          assert.deepStrictEqual(expand(r.cells), sheets.map(s => s.groups.find(x => x.key === g.key).entries[i].text), p.key + ' ' + r.label);
          assert.strictEqual(r.cells.reduce((a, c) => a + c.span, 0), items.length);
        }
        for (const lab of g.none) {
          const i = sg.entries.findIndex(e => e.label === lab);
          for (const s of sheets) assert.strictEqual(s.groups.find(x => x.key === g.key).entries[i].state, 'none-model', p.key + ' ' + lab);
        }
      }
      // Jeder Eintrag des Regelblatts erscheint genau einmal (Zeile, „ohne Regel“ oder „ohne Angabe“), außer Kontogröße
      const all = sheets[0].groups.flatMap(g => g.entries.map(e => g.label + '|' + e.label)).filter(k => !/\|Kontogröße$/.test(k));
      const seen = p.groups.flatMap(g => g.rows.map(r => g.label + '|' + r.label).concat(g.none.map(l => g.label + '|' + l)))
        .concat(p.missing.map(x => x.group + '|' + x.label));
      assert.deepStrictEqual(seen.slice().sort(), all.slice().sort(), p.key);
    }
  }
  assert.strictEqual(plans, 28);
  assert.strictEqual(offers, OFFERS.reduce((a, g) => a + g.items.length, 0));
  // Gleiche Texte über alle Größen = eine Zelle; MFFU Builder 50k heißt „50k Add-On“
  const builder = M.find(m => m.firm.id === 'mf').plans.find(p => p.key === 'mf-builder');
  assert.deepStrictEqual(builder.cols.map(c => c.label), ['25k', '50k Add-On', '100k', '150k']);
  assert.ok(builder.groups.some(g => g.rows.some(r => r.cells.length === 1 && r.cells[0].span === 4)));
  assert.throws(() => F.planSheet([{ id: 'x-1', n: 'X 1k' }, { id: 'x-2', n: 'X 2k' }], 'X', o => ({ groups: [{ key: 'a', label: 'A', entries: [{ label: o.id, text: '', state: 'value' }] }] })), /uneinheitlich/);
});

test('4. Gegentrade-Verbot: notes je Gruppe alle oder keins, Zitate bei Lucid und MFFU, fester Satz für AF und FN', () => {
  for (const m of M) {
    assert.ok(m.banNotes.n === 0 || m.banNotes.n === m.banNotes.total, m.firm.id);
    const b = m.firm.ban;
    if (m.banNotes.n) assert.ok(b && b.kind === 'note', m.firm.id);
    if (b && b.kind === 'note') assert.strictEqual(m.banNotes.n, m.banNotes.total, m.firm.id);
    if (b && b.kind === 'quote') { assert.ok(F.BAN_QUOTES.includes(b.quote)); assert.ok(isUrl(b.src) && isDate(b.asof)); }
  }
  const kinds = Object.fromEntries(F.FIRMS.map(f => [f.id, f.ban ? f.ban.kind : null]));
  assert.deepStrictEqual(kinds, { af: null, lu: 'quote', mf: 'quote', fn: null, ac: 'note', 'bg-cfd': 'note', 'bg-fut': 'note' });
  const without = F.FIRMS.filter(f => !f.ban).map(f => f.name);
  for (const n of without) assert.ok(F.NO_BAN_TEXT.includes(n), n);
  assert.strictEqual(F.NO_BAN_TEXT, 'Für Alpha Futures und FundedNext Futures liegt hier kein Einzelbeleg zum Verbot von Gegenpositionen vor. Vor dem Handel im Help Center prüfen.');
  assert.ok(!/alle Firmen/i.test(PAGE + F.NO_BAN_TEXT));
  // Kopfkarte: Wendung je Firma mit Verbot, nie „nicht belegt“ beim Verbot
  for (const m of M) {
    const card = UI.firmCardHtml(F, m);
    assert.strictEqual(card.includes(F.BAN_PHRASE), !!m.firm.ban, m.firm.id);
    if (m.firm.ban) assert.ok(/rg-ban[\s\S]*Quelle/.test(card), m.firm.id + ' Quelle');
  }
  const html = fs.readFileSync(path.join(ROOT, 'regeln.html'), 'utf8');
  assert.ok(html.includes(F.NO_BAN_TEXT) && html.includes(F.HINT) && html.includes(F.SHEET_HINT));
});

test('5. Wortprüfung: kein „Hedge“, „Gegentrade“ (außer „Gegentrades verboten“), „Gegenkonto“, „spiegel“, englisches Wort nur in den zwei Zitaten, keine Tipps', () => {
  for (const f of ['regeln.html', 'js/firms.js', 'js/regelnUi.js']) {
    const txt = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/FORBIDDEN=\[[^\]]*\]/, '').replace(/TIP_WORDS=\[[^\]]*\]/, '');
    assert.deepStrictEqual(F.wordProblems(txt), [], f);
  }
  assert.deepStrictEqual(F.wordProblems(PAGE), [], 'Seite');
  assert.deepStrictEqual(F.wordProblems(F.NO_BAN_TEXT + F.HINT + F.SHEET_HINT + F.FIRMS.map(f => f.name).join(' ')), []);
  // Englisches Wort: Vorkommen auf der Seite = Vorkommen in den Zitaten (je ein Zitat bei Lucid und MFFU)
  const count = (t, re) => (t.match(re) || []).length;
  const re = /hedg/gi;
  assert.strictEqual(count(PAGE, re), F.BAN_QUOTES.reduce((a, q) => a + count(q, re), 0));
  assert.strictEqual(F.BAN_QUOTES.length, 2);
  // Gegenprobe: die Prüfung schlägt an
  assert.ok(F.wordProblems('Hedge auf dem Gegenkonto').length >= 2);
  assert.ok(F.wordProblems('mit VPN umgehen').length >= 1);
  assert.deepStrictEqual(F.wordProblems(F.BAN_PHRASE + ' ' + F.BAN_QUOTES.join(' ')), []);
});

test('6. Keine note auf der Seite: weder Regeltext noch Annahmen der Angebote', () => {
  const text = PAGE.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  assert.ok(!/Annahmen/.test(text));
  assert.ok(!/M-0\d\d/.test(text), 'keine Auftragsnummern');
  for (const g of OFFERS) for (const o of g.items) {
    const s = E.ruleSheet(o);
    for (const t of [o.note.slice(0, 50), s.noteRules.slice(0, 50), s.assumptions.slice(0, 50)]) assert.ok(!text.includes(t), o.id);
  }
});

test('7. Kopfkarte: vier Kacheln, „nicht belegt“ ohne Zahl, Pläne zugeklappt, Kopfkarte nicht in details', () => {
  for (const m of M) {
    const card = UI.firmCardHtml(F, m);
    assert.strictEqual((card.match(/class="rg-tile /g) || []).length, 4, m.firm.id);
    for (const t of F.TILES) assert.ok(card.includes('>' + t.label + '<'), t.label);
    const unknown = card.match(/<div class="rg-tile rg-unknown">[\s\S]*?<\/div>/g) || [];
    assert.strictEqual(unknown.length, F.TILES.filter(t => m.firm.limits[t.key].state === 'unknown').length);
    for (const u of unknown) {
      assert.ok(/<span class="rg-val">nicht belegt<\/span>/.test(u));
      assert.ok(!/rg-val">[^<]*\d/.test(u), 'keine Zahl als Wert');
    }
    const sec = UI.firmHtml(F, m);
    assert.ok(sec.indexOf('rg-card') < sec.indexOf('<details'), 'Kopfkarte vor den Plänen');
    assert.ok(!/<details[^>]*\bopen\b/.test(sec), 'Pläne zugeklappt');
    assert.strictEqual((sec.match(/<details class="rg-plan"/g) || []).length, m.plans.length);
  }
  const fn = UI.firmCardHtml(F, M.find(m => m.firm.id === 'fn'));
  assert.ok(fn.includes('750.000 $') && fn.includes('laut Text bei Challenges') && fn.includes('Up to $750,000 in total allocation at any one time'));
  assert.ok(fn.includes('keine feste Anzahl'));
  const af = UI.firmCardHtml(F, M.find(m => m.firm.id === 'af'));
  assert.ok(af.includes('Drittquelle nennt 5 Live') && af.includes('Stand 22.06.2026'));
  const mf = UI.firmCardHtml(F, M.find(m => m.firm.id === 'mf'));
  assert.ok(/Nur Rapid EOD 25k: höchstens 3 Funded-Accounts/.test(mf) && mf.includes('Stand 17.10.2026'));
  assert.ok(/Funded<\/span><span class="rg-val">nicht belegt/.test(mf), 'MFFU-Firmenkachel bleibt nicht belegt');
  const lu = UI.firmCardHtml(F, M.find(m => m.firm.id === 'lu'));
  assert.ok(lu.includes('Artikel vom 26.08.2026') && lu.includes('Limits Stand 19.10.2026') && lu.includes('Regeln Stand 15.10.2026'));
  // Sprungmarken und Filter
  for (const m of M) {
    assert.ok(UI.jumpHtml(M).includes(`href="#firma-${m.firm.id}"`));
    for (const p of m.plans) assert.ok(PAGE.includes(`id="plan-${p.key}"`));
  }
  const n = flt => M.filter(m => UI.visible(m, flt)).length;
  assert.strictEqual(n({ firm: 'all', market: 'all' }), 7);
  assert.strictEqual(n({ firm: 'all', market: 'CFD' }), 2);
  assert.strictEqual(n({ firm: 'all', market: 'Futures' }), 5);
  assert.strictEqual(n({ firm: 'lu', market: 'CFD' }), 0);
  // Quelle als Link, nicht als lange URL
  assert.ok(!/<td[^>]*>https?:/.test(PAGE));
});

test('8. Link-Leiste: vier Seiten, gleich bis auf aria-current, erstes Kind von .wrap', () => {
  const pages = { 'index.html': 'Simulator', 'rechner.html': 'Rechner', 'tracker.html': 'Tracker', 'regeln.html': 'Regeln' };
  const navs = [];
  for (const [f, name] of Object.entries(pages)) {
    const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.ok(/<div class="wrap">\s*<nav class="sitenav" aria-label="Seiten">/.test(t), f);
    const nav = t.match(/<nav class="sitenav"[^>]*>[\s\S]*?<\/nav>/)[0];
    assert.ok(new RegExp(`aria-current="page">${name}<`).test(nav), f);
    assert.strictEqual((nav.match(/aria-current/g) || []).length, 1, f);
    for (const href of Object.keys(pages)) assert.ok(nav.includes(`href="${href}"`), f + ' ' + href);
    navs.push(nav.replace(/ aria-current="page"/, ''));
  }
  assert.strictEqual(new Set(navs).size, 1);
});

test('9. Grenzen: keine Netzwerkaufrufe, kein DOM in js/firms.js, Skripte als klassische Tags', () => {
  for (const f of ['regeln.html', 'js/firms.js', 'js/regelnUi.js']) {
    const txt = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/.test(txt), f);
  }
  const src = fs.readFileSync(path.join(ROOT, 'js/firms.js'), 'utf8');
  assert.ok(!/\bdocument\.|\bwindow\.|localStorage|Date\.now|new Date\(/.test(src));
  const html = fs.readFileSync(path.join(ROOT, 'regeln.html'), 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(x => x[1]);
  assert.deepStrictEqual(scripts, ['js/offers.js', 'js/explain.js', 'js/firms.js', 'js/regelnUi.js']);
});

console.log(`\n${passed} Tests bestanden${process.exitCode ? ', es gibt Fehler' : ''}.`);
