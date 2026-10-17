// Tests für die Notizen in Klartext (M-020). Ausführen: node test/notes.test.js
const assert = require('assert');
const N = require('../js/notes.js');
const { userNote, RULES, ALLOWED, numbers, noteNumbers, multisetDiff, residual } = N;
const { OFFERS } = require('../js/offers.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + (e.stack || e.message)); process.exitCode = 1; }
}
const ALL = OFFERS.flatMap(g => g.items);
const byId = id => ALL.find(o => o.id === id);
const OUT = new Map(ALL.map(o => [o.id, userNote(o)]));
const count = (s, re) => (String(s).match(re) || []).length;
const fmtDate = s => s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4);
// Fehler je Angebot sammeln, damit der Test alle Fundstellen auf einmal meldet
function each(check) {
  const bad = [];
  for (const o of ALL) { const m = check(o, OUT.get(o.id)); if (m) bad.push(o.id + ': ' + m); }
  assert.deepStrictEqual(bad, []);
}

test('1 Form: {rules, model, sources, text, unknown} für jedes Angebot, unknown leer', () => {
  each((o, u) => {
    for (const k of ['rules', 'model', 'sources', 'unknown']) if (!Array.isArray(u[k])) return k + ' fehlt';
    if (typeof u.text !== 'string' || !u.text) return 'text leer';
    if (!u.rules.length || !u.model.length || !u.sources.length) return 'Abschnitt leer';
    return u.unknown.length ? u.unknown.join(' | ') : null;
  });
});

test('2 Originalnotiz unverändert (userNote ändert das Angebot nicht)', () => {
  const o = byId('bg-cfd-instant-200'), before = JSON.stringify(o);
  userNote(o); userNote(o);
  assert.strictEqual(JSON.stringify(o), before);
});

test('3 Zahlen: Multimenge streng gleich, Ausnahmen nur Auftragsnummern, Historienklammern, asof-Datum', () => {
  each((o, u) => {
    const out = numbers(u.text);
    const d = fmtDate(o.asof), k = out.indexOf(d);
    if (k < 0) return 'asof-Datum fehlt in Quellen';
    out.splice(k, 1);
    const { missing, extra } = multisetDiff(noteNumbers(o.note), out);
    return missing.length || extra.length ? 'fehlt ' + missing.join(',') + ' / neu ' + extra.join(',') : null;
  });
  // Ausnahme (b) ist eng: jede entfernte Historienklammer ist „bis M-0xx <eine Zahl>“
  for (const o of ALL) for (const m of o.note.match(/\bbis M-0\d+[a-z]? \S+/g) || [])
    assert.match(m, /^bis M-0\d+[a-z]? \d+(?:[.,]\d+)*$/, o.id + ': ' + m);
  // Schreibweise wortgleich: 1.000 bleibt 1.000, 0,5 bleibt 0,5
  assert.deepStrictEqual(numbers('1.000 $ und 0,5 % und 16:20'), ['1.000', '0,5', '16', '20']);
  assert.deepStrictEqual(numbers('ALPHA20 T1 25k M'), ['25']);
});

test('3b URLs, tradetanto.com und Zitate „…“ bleiben wortgleich, src und Stand stehen in sources', () => {
  each((o, u) => {
    for (const x of o.note.match(/https?:\/\/\S+/g) || []) if (!u.sources.join(' ').includes(x)) return 'URL fehlt ' + x;
    if (/tradetanto\.com/.test(o.note) && !u.text.includes('tradetanto.com')) return 'tradetanto.com fehlt';
    for (const q of o.note.match(/„[^“]*“/g) || []) if (!u.text.includes(q)) return 'Zitat fehlt ' + q;
    return u.sources[0] === o.src + ', Stand ' + fmtDate(o.asof) ? null : 'erste Quelle ' + u.sources[0];
  });
});

test('4 Sperrliste und Erlaubtliste: kein internes Muster, kein unbekanntes Kürzel im text', () => {
  each((o, u) => { const r = residual(u.text); return r.length ? r.join(' | ') : null; });
  // Selbsttest: erfundene Notiz meldet Feldname, Bezeichner, Auftragsnummer und Kürzel; bekannte Muster (minp) übersetzt RULES
  const fake = userNote({ id: 'x', note: 'Regel XYZ 3 Tage. Annahmen: target2 5 und ddStatic laut M-099.', src: 'https://example.com/a', asof: '2026-10-17' });
  const u = fake.unknown.join(' | ');
  assert.match(u, /Feldname: Target2/);
  assert.match(u, /Bezeichner: ddStatic/);
  assert.match(u, /Kürzel: XYZ/);
  assert.match(u, /Auftragsnummer: M-099/);
  const fake2 = userNote({ id: 'y', note: 'Kern rechnet 7. Annahmen: keine.', asof: '2026-10-17' });
  assert.match(fake2.unknown.join(' | '), /Kern/);
  // Zahl, die beim Umformulieren verloren ginge, steht in unknown
  assert.match(userNote({ note: 'Annahmen: cap 100.000 $ = kein Cap.', asof: '2026-10-17' }).unknown.join(), /^$/);
  const lost = multisetDiff(['1.000', '5'], ['1.000']);
  assert.deepStrictEqual(lost, { missing: ['5'], extra: [] });
  // Erlaubtliste enthält keine Sperrbegriffe
  for (const a of ALLOWED) assert.deepStrictEqual(residual(a), [], a);
});

test('4b userNote wirft nie (fehlende oder kaputte Notiz)', () => {
  for (const o of [null, undefined, {}, { note: 42 }, { note: '' }, { note: 'Annahmen:' }, { note: 'ohne Schnitt', asof: 'x' }]) {
    const u = userNote(o);
    assert.ok(u && Array.isArray(u.rules) && Array.isArray(u.unknown) && typeof u.text === 'string');
  }
  assert.strictEqual(userNote({ note: 'ohne Schnitt.' }).model.length, 0);
});

test('5 Pflichttexte: „Gegentrades verboten“ genau dort, wo es in der Notiz steht', () => {
  each((o, u) => count(o.note, /Gegentrades verboten/g) === count(u.text, /Gegentrades verboten/g) ? null : 'Anzahl');
});

test('5b strenger, milder, konservativ und nicht abgebildet: Zählung gleich', () => {
  each((o, u) => {
    const pairs = [
      ['konservativ', count(o.note, /konservativ/g), count(u.text, /vorsichtig gerechnet/g)],
      ['strenger', count(o.note, /strenger/g), count(u.text, /strenger/g)],
      ['milder', count(o.note, /milder/g), count(u.text, /milder/g)],
      ['nicht abgebildet', count(o.note, /nicht im Kern|Kern ignoriert|nur Notiz|nicht abgebildet/g), count(u.text, /[Ii]m Modell nicht abgebildet/g)]
    ];
    const bad = pairs.filter(p => p[1] !== p[2]).map(p => p[0] + ' ' + p[1] + '→' + p[2]);
    return bad.length ? bad.join(', ') : null;
  });
});

test('5c Jeder Modellsatz beginnt mit „Im Modell“, kein Regelsatz', () => {
  each((o, u) => {
    const m = u.model.find(s => !/^Im Modell( nicht abgebildet)?:/.test(s));
    if (m) return 'Modellsatz ' + m;
    const r = u.rules.find(s => /^Im Modell/.test(s));
    return r ? 'Regelsatz ' + r : null;
  });
});

test('5d Wortprüfung: keine Formulierung, die das Umgehen von Regeln nahelegt (Original und Ausgabe)', () => {
  each((o, u) => {
    for (const re of N.FORBIDDEN) { if (re.test(o.note)) return 'Original ' + re; if (re.test(u.text)) return 'Ausgabe ' + re; }
    return null;
  });
  assert.match(residual('man kann das umgehen').join(), /Wortprüfung/);
  assert.match(residual('Gegentrade auf Konto 2').join(), /Wortprüfung/);
  assert.deepStrictEqual(residual('Gegentrades verboten.'), []);
});

test('5e Kürzel beim ersten Vorkommen erklärt, danach nicht wieder', () => {
  const u = OUT.get('fn-flex-50');
  assert.strictEqual(count(u.text, /DLL \(Tagesverlustgrenze\)/g), 1);
  assert.strictEqual(count(u.text, /MLL \(maximale Verlustgrenze\)/g), 1);
  assert.ok(u.text.indexOf('DLL (Tagesverlustgrenze)') <= u.text.indexOf('DLL'));
  each((o, u) => {
    for (const [a, m] of N.ABBR) {
      const re = new RegExp('(?<![A-Za-z0-9&])' + a.replace(/[&]/g, '\\$&') + '(?![A-Za-z0-9&])');
      const plain = u.text.replace(/https?:\/\/\S+/g, ' ').replace(/„[^“]*“/g, ' ');
      if (re.test(plain) && !(plain.includes(a + ' (' + m + ')') || plain.includes(a + ' = ' + m) || new RegExp('\\(' + a + '[^()\\s]*\\)').test(plain)))
        return a + ' nicht erklärt';
      if (count(plain, new RegExp('\\(' + m.replace(/[()]/g, '\\$&') + '\\)|= ' + m, 'g')) > 1) return a + ' doppelt erklärt';
    }
    return null;
  });
});

test('6 Abdeckung: jede Regel in RULES greift bei mindestens einer Notiz', () => {
  const hits = new Set();
  for (const o of ALL) userNote(o, { hits });
  assert.deepStrictEqual(RULES.filter(r => !hits.has(r.id)).map(r => r.id), []);
  assert.strictEqual(new Set(RULES.map(r => r.id)).size, RULES.length, 'ids eindeutig');
});

// Freigegebene Beispiele aus dem Prüfbericht (Inhalt)
const has = (list, ...parts) => assert.ok(list.some(s => parts.every(p => s.includes(p))), 'fehlt: ' + parts.join(' … ') + '\n' + list.join('\n'));

test('7a Beispiel af-std-50 (Alpha Futures Standard 50k)', () => {
  const u = OUT.get('af-std-50');
  has(u.rules, 'Daily Loss Guard', 'Challenge keine', 'Funded 1.000 $', 'soft');
  has(u.rules, 'Consistency', 'Challenge 50 %', 'Funded 40 %');
  has(u.rules, 'Auszahlung nach 5 Gewinntagen ≥ 200 $', 'höchstens 50 % des Gewinns', 'höchstens 4 Anträge');
  has(u.rules, 'Auszahlung 500–3.000 $', '5 Mini/50 Micro', 'News im Funded eingeschränkt', 'flat bis 16:20 ET');
  has(u.model, 'Im Modell:', 'MLL', 'am Tagesende', 'nach jedem Trade', 'vorsichtig gerechnet');
  has(u.model, 'Consistency', 'unter der Grenze', 'je Auszahlungszyklus');
  has(u.model, 'Auszahlungsschwelle 1.000 $', 'Mindestauszahlung ÷ 50 %', '5 Gewinntage ≥ 200 $');
  has(u.model, 'Auszahlungsanteil 50 % des Gewinns');
  has(u.model, 'Gebühr = Listenpreis, kein belegter Rabattcode');
  has(u.model, 'Monatsabo', '30 Kalendertage', '129 $', 'Verlängerungspreis ohne Quelle', 'endet sofort bei Bestehen oder Scheitern');
  has(u.model, 'Im Modell nicht abgebildet:', '4 Anträge', 'in Testläufen 0 Blockaden');
  assert.deepStrictEqual(u.sources, ['https://help.alpha-futures.com/en/articles/11632512-standard-account-overview, Stand 15.10.2026']);
});

test('7b Beispiel bg-cfd-instant-200 (Blue Guardian Instant 200k)', () => {
  const u = OUT.get('bg-cfd-instant-200');
  has(u.rules, 'Ohne Challenge');
  has(u.rules, 'DD (Drawdown) 12.000 $', 'höchster Schlusskontostand', 'lockt bei Start', '1 % der Größe als Puffer');
  has(u.rules, 'Tages-DD 6.000 $', 'hart', '17:00 EST');
  has(u.rules, 'Consistency Funded 20 %');
  has(u.rules, 'mindestens 5 Tage mit ≥ 0,5 % Gewinn');
  has(u.rules, 'jederzeit auf Antrag', 'die ersten 2 Auszahlungen höchstens 10.000 $', '3 % Bearbeitungsgebühr');
  has(u.rules, 'Guardian Shield (nur Funded)', '1 % offener Verlust', '1. Mal Split 50 %', '2. Mal Account weg');
  has(u.rules, 'Liste 954 $', 'Website-Preis 620 $', 'HALLOWEEN −35 %');
  has(u.rules, 'Saisoncode ohne bekanntes Ablaufdatum');
  has(u.rules, 'Gegentrades verboten');
  has(u.model, 'Gewinnanteil 77,6 %', '80 % × 0,97', '3 % Auszahlungsgebühr');
  has(u.model, 'Höchstrisiko je Trade 1 % (2.000 $)', 'auch in der Challenge');
  has(u.model, 'Tages-DD', 'harte Tagesverlustgrenze', 'Consistency je Auszahlungszyklus', 'unter der Grenze');
  has(u.model, 'Puffer 1 % der Kontogröße nach dem Lock');
  has(u.model, 'Auszahlungsschwelle 500 $', 'Rise', '500 $ ist für alle Auszahlungswege erfüllbar', 'vorsichtig gerechnet');
  has(u.model, 'Höchstens 10.000 $ je Auszahlung', 'für alle Auszahlungen', 'vorsichtig gerechnet');
  has(u.model, 'Höchstens 5 Auszahlungen', 'feste Annahme des Modells, keine Regel der Firma');
  has(u.model, 'Gewinntage ≥ 0,5 % (1.000 $)', 'je Auszahlungszyklus', 'jederzeit auf Antrag');
  has(u.sources, 'https://help.blueguardian.com/en/articles/14061082-instant-standard-account-rules, Stand 16.10.2026');
  has(u.sources, 'abgerufen 17.10.2026', '„Minimum Withdrawl: $100 via crypto and $500 via rise“', 'an anderer Stelle 100 $', 'Widerspruch auf der Seite');
  assert.ok(!/bis M-|100 \$\)\.?$/.test(u.model.join(' ')), 'Historie „bis M-010h 100 $“ entfällt');
});

test('7c Beispiel mf-rapid-eod-25 (MyFundedFutures Rapid EOD 25k)', () => {
  const u = OUT.get('mf-rapid-eod-25');
  has(u.rules, 'Consistency in der Challenge 30 %', 'Funded keine', 'mindestens 4 Tage');
  has(u.rules, 'Challenge und Funded EOD-trailing', 'Start + 100 $');
  has(u.rules, 'Kein DLL');
  has(u.rules, 'Puffer 1.100 $ für die 1. Auszahlung', 'je 250 $ Nettogewinn', 'Mindestantrag 500 $', 'täglich', '90/10');
  has(u.rules, 'Übergang zu Live nach den Standardregeln von Rapid 25k');
  has(u.rules, 'News im Funded verboten');
  has(u.rules, '2 Mini/20 Micro', 'keine Overnight-Positionen', 'Funded startet bei 0 $');
  has(u.rules, 'Einmalzahlung, keine Aktivierungsgebühr');
  has(u.rules, 'CLUB-Preis 87 $', 'höchstens 2 Einlösungen');
  has(u.model, 'Start + 100', 'schon bei Start', '100 $ milder');
  has(u.model, 'Rapid EOD rechnet bis auf den Preis wie Rapid', 'nach jedem Trade', 'strenger');
  has(u.model, 'Wartezeit bis zur 1. Auszahlung nennt die Firma nicht', '24 h wie bei Rapid', 'vorsichtig gerechnet');
  has(u.model, 'Höchstens 10.000 $ je Auszahlung', 'Tagesgewinn bis Live wie bei Rapid', 'keine Auszahlungsgrenze', 'Live folgt laut Artikel den Rapid-Regeln');
  has(u.model, 'Höchstens 5 Auszahlungen', 'feste Annahme des Modells');
  has(u.model, 'Auszahlungsschwelle 500 $', 'der größere Wert aus Mindestantrag 500 $ und Zyklusgewinn 250 $');
  has(u.model, '1. Auszahlung frühestens 1 Kalendertag nach dem 1. Funded-Trade', '24 h aufgerundet', 'pausiert bis zum Termin');
  has(u.sources, 'https://help.myfundedfutures.com/en/articles/16727601-rapid-eod-25k-a-comprehensive-look', 'https://myfundedfutures.com/plans/rapid-eod', 'Preis 145 $, CLUB 87 $', 'abgerufen 17.10.2026', 'aktualisiert 02.09.2026');
});

test('8 Sätze: Abkürzungen, Ordnungszahlen und Datum ohne Satzende trennen nicht', () => {
  assert.deepStrictEqual(N.sentences('Max. DD 5 %. Die 1. Auszahlung ab 01.11. Listenpreis. Lot-Limit 5. Einmalgebühr.'),
    ['Max. DD 5 %.', 'Die 1. Auszahlung ab 01.11. Listenpreis.', 'Lot-Limit 5.', 'Einmalgebühr.']);
  assert.deepStrictEqual(N.sentences('Kern pro Trade. minp 1 $. cap 2 $.'), ['Kern pro Trade.', 'minp 1 $.', 'cap 2 $.']);
});

console.log(passed + ' Tests bestanden.');
