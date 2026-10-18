/* Glitch-Simulator – Notizen für Nutzer (M-020).
   DOM-frei: Browser window.GlitchNotes, Node module.exports.
   userNote(offer) macht aus offer.note (Regeltext + „Annahmen: …“) eine Fassung in Klartext ohne interne Kürzel,
   Feldnamen und Auftragsnummern. Die Originalnotiz in offers.js bleibt die Quelle der Wahrheit.
   Ablauf: Schnitt an „Annahmen:“, Sätze, Ersetzungstabelle RULES je Satz, Marker ⟦Q:…⟧ (nach „Quellen“) und
   ⟦M:…⟧ (vom Regelteil nach „So rechnet das Modell“), Kürzel beim ersten Vorkommen erklären, Restprüfung.
   Wer eine note ändert, prüft mit npm test, ob RULES, BLOCK und ALLOWED noch passen. */
(function(root){
  'use strict';

  const ID='M-0\\d+[a-z]?';                 // Auftragsnummer
  const URL_RE=/https?:\/\/\S+/g;
  // Zahl: Ziffernfolge mit . oder , dazwischen, nicht direkt nach einem Buchstaben (Codes wie ALPHA20, T1 sind Namen)
  const NUM_RE=/(?<![\p{L}\d_])\d+(?:[.,]\d+)*/gu;

  /* Ersetzungstabelle: in 'r' = Regelteil, 'm' = Modellteil, '*' = beide. Je Satz der Reihe nach angewendet,
     spezielle Muster vor allgemeinen. to ist ein String oder eine Funktion wie bei String.replace. */
  const RULES=[
    // ---- Regelteil: Quellen, Widersprüche, interne Vermerke ----
    {id:'r-widerspruch-satz',in:'*',re:new RegExp('^Widerspruch \\('+ID+'\\): (.*)$'),to:'⟦Q:Widerspruch: $1⟧'},
    {id:'r-widerspruch-ac',in:'r',re:new RegExp('; Widerspruch \\('+ID+'\\): (.*?„Trading days N/A“); konservativ (\\d+), im Kern ohne Wirkung neben der (\\S+-Regel)\\.'),
      to:'; konservativ $2 Gewinntage, im Modell ohne Wirkung neben der $3.⟦Q:Widerspruch: $1.⟧'},
    {id:'r-quelle',in:'r',re:/^Quelle: (.*)$/,to:'⟦Q:$1⟧'},
    {id:'r-code-ac',in:'r',re:new RegExp('^Code bis (\\S+) laut (https?://\\S+) \\(Stand ([\\d.]+), gültig ([^)]*)\\); ab (\\S+) Listenpreis \\(Nachtrag '+ID+'\\)\\.$'),
      to:'Code gültig bis $1 ($4); ab $5 gilt der Listenpreis.⟦Q:Rabattcodes: $2, Stand $3⟧'},
    {id:'r-url-satz',in:'r',re:/^(?!.*⟦).*https?:\/\/.*$/,to:'⟦Q:$&⟧'},
    {id:'r-maxloss',in:'r',re:/^Max_Loss im Datensatz (\S+ %), Help-Center (\S+ %) → (\S+ %)\.$/,to:'Maximaler Verlust laut Checkout-Daten der Firma $1, laut Help Center $2; es gilt $3.'},
    {id:'r-rules-feld',in:'r',re:/ \(in rules\.\w+\)/,to:''},
    {id:'r-saisoncode',in:'r',re:/Saisoncode ohne Ablaufdatum, Abgleich\./,to:'Saisoncode ohne bekanntes Ablaufdatum.'},
    {id:'r-option-dll',in:'r',re:/^(Option „mit DLL“ gewählt \(Standard, günstiger\)); ohne DLL (.*) \(nur Notiz\)\.$/,to:'$1.⟦M:Im Modell nicht abgebildet: Variante ohne DLL ($2).⟧'},
    {id:'r-preis-ondemand',in:'r',re:/^Preis = On-Demand; (.*) \(nur Notiz\)\.$/,to:'Preis = On-Demand.⟦M:Im Modell nicht abgebildet: $1.⟧'},
    {id:'r-nur-notiz',in:'r',re:/^(.*) \(nur Notiz\)\.$/,to:'⟦M:Im Modell nicht abgebildet: $1.⟧'},
    {id:'r-kern-ignoriert',in:'r',re:/^(.*) nach Lock (.*) \(Kern ignoriert\)\.$/,to:'⟦M:Im Modell nicht abgebildet: $1 nach dem Lock $2.⟧'},
    {id:'r-datensatz-dort',in:'r',re:/\(Datensatz (\d+), /,to:'(dort $1, '},
    {id:'r-datensatz',in:'r',re:/laut Datensatz/,to:'laut Checkout-Daten der Firma'},
    {id:'r-eval-leer',in:'r',re:/\b(Eval|Funded) –(?=[,.])/g,to:'$1 keine'},
    {id:'r-news-funded',in:'r',re:/News Funded/,to:'News im Funded'},
    {id:'r-tag-eval',in:'r',re:/Tag Eval\b/,to:'Tag in der Challenge'},

    // ---- Modellteil: Drawdown nachziehen und Lock ----
    {id:'m-eod-kern',in:'m',re:/^(MLL |Eval )?EOD-trailing, Kern pro Trade \((strenger|konservativ)\)/,
      to:(m,w,k)=>'die Firma zieht '+(w==='MLL '?'die MLL':'die Verlustgrenze')+(w==='Eval '?' in der Challenge':'')+' am Tagesende nach (EOD-trailing), das Modell nach jedem Trade ('+k+')'},
    {id:'m-lock',in:'m',re:/Lock bei Start ?\+ ?(\d+),? Kern (?:lockt )?bei Start \((\d+) \$ milder\)/,
      to:'die Firma stoppt die Verlustgrenze bei Start + $1, das Modell schon bei Start ($2 $ milder)'},
    {id:'m-rapid-eod',in:'m',re:/^Rapid EOD: im Kern bis auf Preis gleich mit Rapid \(EOD wird pro Trade gezogen, strenger\)\./,
      to:'Rapid EOD rechnet bis auf den Preis wie Rapid; die EOD-Verlustgrenze zieht das Modell nach jedem Trade nach (strenger).'},
    {id:'m-wartezeit',in:'m',re:/^Wartezeit bis zur (\d)\. Auszahlung nicht genannt: (\d+) h wie Rapid \(konservativ\)\./,
      to:'die Wartezeit bis zur $1. Auszahlung nennt die Firma nicht, angenommen $2 h wie bei Rapid (konservativ).'},

    // ---- Modellteil: Auszahlungsgrenze (cap) und Anzahl (maxp) ----
    {id:'m-cap-live',in:'m',re:/\bcap (\S+ \$) = Tagesgewinn bis Live( wie Rapid)? \(Proxy, es gibt keinen Cap(?:; ([^)]*))?\)/,
      to:(m,a,wie,rest)=>'höchstens '+a+' je Auszahlung als Ersatz für den Tagesgewinn bis Live'+(wie?' wie bei Rapid':'')+'; die Firma hat keine Auszahlungsgrenze'+(rest?' ('+rest+')':'')},
    {id:'m-cap-gesamt',in:'m',re:/\bcap (\S+ \$) = Gesamtcap als Proxy/,to:'höchstens $1 je Auszahlung als Ersatz für den Gesamtcap'},
    {id:'m-maxp-live',in:'m',re:/\bmaxp (\d+) = Live-Prüfung nach (\d+) Auszahlungen \(konservativ\)/,to:'höchstens $1 Auszahlungen (Live-Prüfung nach $2 Auszahlungen, konservativ)'},
    {id:'m-maxp-quelle',in:'m',re:/\bmaxp (\d+): Quelle nennt kein Maximum, Konvention/,to:'höchstens $1 Auszahlungen (die Quelle nennt kein Maximum; feste Annahme des Modells)'},
    {id:'m-maxp-konvention',in:'m',re:/\bmaxp (\d+):? Konvention/,to:'höchstens $1 Auszahlungen (feste Annahme des Modells, keine Regel der Firma)'},
    {id:'m-cap-kein',in:'m',re:/\bcap (\S+ \$) = kein Cap/,to:'keine Auszahlungsgrenze, gerechnet mit höchstens $1 je Auszahlung'},
    {id:'m-cap-alle',in:'m',re:/\bcap (\S+ \$) für alle Auszahlungen/,to:'höchstens $1 je Auszahlung, für alle Auszahlungen'},
    {id:'m-cap-erste',in:'m',re:/\bcap = Cap der (\d)\. Auszahlung/,to:'Auszahlungsgrenze der $1. Auszahlung für alle Auszahlungen'},
    {id:'m-cap-tag',in:'m',re:/\bcap = max\. Auszahlung pro Tag/,to:'Auszahlungsgrenze = höchste Auszahlung pro Tag'},
    {id:'m-cap-betrag',in:'m',re:/\bcap (\S+ \$)\./,to:'höchstens $1 je Auszahlung.'},
    {id:'m-minp-cap-zyklus',in:'m',re:/\bminp = (\d)\. Zyklusziel und cap = Cap Auszahlung (\d+–\d+) für alle Zyklen/,
      to:'Auszahlungsschwelle = $1. Zyklusziel und Auszahlungsgrenze = Cap der Auszahlungen $2, beide für alle Zyklen'},
    {id:'m-lu-direct-tage',in:'m',re:new RegExp('^Auszahlungsartikel ([\\d.]+) ohne Tage-Regel, Produktseite („[^“]*“), konservativ (\\d+) Handelstage je Zyklus \\('+ID+', '+ID+'; bis '+ID+' \\d+ laut Zweitquelle (tradetanto\\.com)\\)\\.$'),
      to:'der Auszahlungsartikel vom $1 nennt keine Tage-Regel, die Produktseite $2; konservativ $3 Handelstage je Zyklus.⟦Q:Frühere Angabe der Zweitquelle $4, ersetzt durch die Produktseite.⟧'},

    // ---- Modellteil: Auszahlungsschwelle (minp), Puffer (buf), Anteile ----
    {id:'m-minp-max',in:'m',re:/\bminp (\S+ \$) = max\(([^;]+); ([^)]+)\)/,to:'Auszahlungsschwelle $1 = der größere Wert aus $2 und $3'},
    {id:'m-minp-rise',in:'m',re:new RegExp('\\bminp (\\S+ \\$) = Mindestauszahlung Rise \\('+ID+'\\): (https?://\\S+) \\(Abruf ([\\d.]+) \\(Orchestrator\\)\\) nennt („[^“]*“), an anderer Stelle (\\S+ \\$) \\(Widerspruch auf der Seite\\); (\\S+ \\$) ist für alle Wege erfüllbar \\(konservativ, bis '+ID+' \\S+ \\$\\)'),
      to:'Auszahlungsschwelle $1 = Mindestauszahlung über Rise; $6 ist für alle Auszahlungswege erfüllbar (konservativ)⟦Q:Mindestauszahlung: $2 (abgerufen $3) nennt $4, an anderer Stelle $5 (Widerspruch auf der Seite).⟧'},
    {id:'m-minp-groesse',in:'m',re:/\bminp (\S+ %) der Kontogröße/,to:'Auszahlungsschwelle $1 der Kontogröße'},
    {id:'m-minp',in:'m',re:/\bminp\b/g,to:'Auszahlungsschwelle'},
    {id:'m-buf-lock',in:'m',re:/\bbuf (\S+ %) der Größe \(Puffer nach Lock\)/,to:'Puffer $1 der Kontogröße nach dem Lock'},
    {id:'m-buf-statisch',in:'m',re:/\bbuf (\d+) \(statisch\)/,to:'Puffer $1 (statischer Drawdown)'},
    {id:'m-buf-mll-fest',in:'m',re:/\bbuf (\d+) = MLL fest/,to:'Puffer $1: MLL fest'},
    {id:'m-buf-zweitquelle',in:'m',re:/\bbuf = MLL \+ (\d+ \$) aus Sekundärquelle/,to:'Puffer = MLL + $1 laut Zweitquelle'},
    {id:'m-buf',in:'m',re:/\bbuf\b/g,to:'Puffer'},
    {id:'m-split',in:'m',re:/^split (\S+) = (\S+ %) × (\S+) inkl\. (\S+ %) Auszahlungsgebühr\./,to:'Gewinnanteil $1 % = $2 × $3, die $4 Auszahlungsgebühr sind eingerechnet.'},
    {id:'m-maxrisk',in:'m',re:/Guardian Shield als maxRisk (\S+ %) \((\S+ \$); die App deckelt das Risiko auch in der Challenge\)/,
      to:'Guardian Shield als Höchstrisiko je Trade $1 ($2); die App begrenzt damit das Risiko auch in der Challenge'},
    {id:'m-wfrac',in:'m',re:/\bwfrac (\S+ %)/,to:'Auszahlungsanteil $1 des Gewinns'},
    {id:'m-fee',in:'m',re:/^Fee = /,to:'Gebühr = '},
    {id:'m-dd-express',in:'m',re:/\bdd = kleinere Funded-MLL (\S+ \$) für beide Phasen \(Kern hat nur ein dd, konservativ\)/,
      to:'Drawdown = kleinere Funded-MLL $1 für beide Phasen (das Modell kennt nur einen Drawdown, konservativ)'},
    {id:'m-cons-stufen',in:'m',re:/^Consistency steigt auf (\S+ %), Kern fest (\S+ %)\./,to:'die Consistency steigt bei der Firma auf $1, das Modell rechnet fest mit $2.'},

    // ---- Modellteil: Regeln im Modell, nicht abgebildete Regeln ----
    {id:'m-tagesdd-hart',in:'m',re:new RegExp('^Tages-DD im Kern als hartes DLL(?: \\('+ID+'\\))?'),to:'Tages-DD als harte Tagesverlustgrenze (DLL), ein Bruch beendet Challenge bzw. Account'},
    {id:'m-strikt-statt',in:'m',re:/strikt < statt ≤/g,to:'der beste Tag muss unter der Grenze bleiben, die Firma lässt sie genau zu'},
    {id:'m-strikt',in:'m',re:/strikt </g,to:'der beste Tag muss unter der Grenze bleiben'},
    {id:'m-nicht-im-kern-teil',in:'m',re:/; ([^;]*) nicht im Kern\./,to:'; im Modell nicht abgebildet: $1.'},
    {id:'m-nicht-im-kern-satz',in:'m',re:/^(.*) nicht im Kern\.$/,to:'Im Modell nicht abgebildet: $1.'},
    {id:'m-scaling-stufen',in:'m',re:/^(Scaling nur im Qualified, Stufen nicht belegt: |Scaling laut Daten ja; Stufen und Geltungsbereich \(Eval\/Qualified\) nicht belegt, )(.*) \(nicht abgebildet\)\.$/,to:'Im Modell nicht abgebildet: Scaling-Stufen ($1$2).'},
    {id:'m-reserve',in:'m',re:/^Reserve nicht abgebildet\.$/,to:'Im Modell nicht abgebildet: Reserve.'},
    {id:'m-nur-notiz-blockaden',in:'m',re:/^(.*) nur Notiz \(gemessen (\d+) Blockaden\)\.$/,to:'Im Modell nicht abgebildet: $1 (in Testläufen $2 Blockaden).'},
    {id:'m-inaktivitaet',in:'m',re:/^Inaktivität (\d+) Tage nur Notiz: im Kern (.*)$/,to:'Im Modell nicht abgebildet: Inaktivität $1 Tage; das Modell tradet $2'},
    {id:'m-fn-direct',in:'m',re:new RegExp('^DLL \\('+ID+'\\) und Consistency perpetual \\('+ID+'\\) im Kern, Wochen-Trade nicht\\.$'),
      to:'DLL und Consistency „perpetual“ sind gerechnet, der Wochen-Trade nicht.'},
    {id:'m-dll-allein',in:'m',re:new RegExp('^DLL im Kern seit '+ID+'\\.?$'),to:'DLL ist gerechnet.'},
    {id:'m-im-kern-ende',in:'m',re:new RegExp('^(DLL \\('+ID+'\\), .*) im Kern\\.$'),to:'$1 sind gerechnet.'},
    {id:'m-kern-als',in:'m',re:/: im Kern als /,to:': gerechnet als '},
    {id:'m-regeltreu',in:'m',re:/regeltreu pausiert der Trader bis zum Termin/,to:'der Modell-Trader hält sich an die Regel und pausiert bis zum Termin'},
    {id:'m-art-offen',in:'m',re:/^„(\d+) Tage“: Art offen \(Sekundärquelle\), (.*), gemessen ohne Wirkung\.$/,
      to:'„$1 Tage“: ob Kalender- oder Handelstage, ist offen (Zweitquelle); $2, in Testläufen ohne Wirkung.'},

    // ---- beide Teile: Auftragsnummern, Quellenvermerke, Abkürzungen ----
    {id:'g-im-kern-seit',in:'*',re:new RegExp('\\s*im Kern seit '+ID,'g'),to:' gerechnet'},
    {id:'g-im-kern-klammer',in:'*',re:new RegExp('\\s*im Kern \\('+ID+'\\)','g'),to:' gerechnet'},
    {id:'g-id-klammer',in:'*',re:new RegExp(' \\('+ID+'(?:, '+ID+')*\\)','g'),to:''},
    {id:'g-id-klammer-anfang',in:'*',re:new RegExp('\\('+ID+',? ','g'),to:'('},
    {id:'g-abruf',in:'*',re:/\(Abruf ([\d.]+) \(Orchestrator\)\)/g,to:'(abgerufen $1)'},
    {id:'g-abruf-frei',in:'*',re:/Abruf ([\d.]+) \(Orchestrator\)/g,to:'abgerufen $1'},
    {id:'g-eval-consistency',in:'*',re:/\bEval-Consistency\b/g,to:'Consistency in der Challenge'},
    {id:'g-eval',in:'*',re:/\bEval\b/g,to:'Challenge'},
    {id:'g-je-zyklus',in:'*',re:/\bje Zyklus\b/g,to:'je Auszahlungszyklus'},
    {id:'g-max-dd',in:'*',re:/\bMax\. DD\b/g,to:'Maximaler DD'},
    {id:'g-max',in:'*',re:/\bmax\. /g,to:'höchstens '},
    {id:'g-max-gross',in:'*',re:/\bMax\. /g,to:'Höchstens '},
    {id:'g-min',in:'*',re:/\bmin\. /g,to:'mindestens '},
    {id:'g-on-demand',in:'*',re:/\bon demand\b/g,to:'jederzeit auf Antrag'},
    {id:'g-sekundaer',in:'*',re:/Sekundärquelle/g,to:'Zweitquelle'},
    {id:'g-konservativ-angenommen',in:'*',re:/konservativ angenommen/g,to:'vorsichtig gerechnet'},
    {id:'g-konservativ',in:'*',re:/\bkonservativ\b/g,to:'vorsichtig gerechnet'}
  ];

  // Kürzel der Firmen, beim ersten Vorkommen je Notiz erklärt (E1)
  const ABBR=[
    ['DLG','Daily Loss Guard, Tagesverlustgrenze'],
    ['DLL','Tagesverlustgrenze'],
    ['MLL','maximale Verlustgrenze'],
    ['EOD','Tagesende'],
    ['DD','Drawdown'],
    ['HWM','höchster Kontostand'],
    ['P&L','Gewinn und Verlust'],
    ['EST','US-Ostküstenzeit'],
    ['ET','US-Ostküstenzeit'],
    ['EAs','Handelsroboter'],
    ['T1','Nachrichten der höchsten Stufe']
  ];
  // Erlaubte Großbuchstaben-Kürzel in der Ausgabe (Firmenkürzel, Rabattcodes, Fachbegriffe)
  const ALLOWED=['DD','EOD','DLL','MLL','DLG','EST','ET','HWM','P&L','AGB','T1','N/A',
    'VAULT','CLUB','FNFLEX','RAPID','FNDIRECT','FUNDED40','ALPHA20','HALLOWEEN'];
  // Sperrliste: interne Muster, die nach RULES nicht mehr vorkommen dürfen
  const BLOCK=[
    ['Auftragsnummer',new RegExp('\\b'+ID+'\\b')],
    ['Orchestrator',/Orchestrator/],
    ['Konvention',/Konvention/],
    ['Proxy',/Proxy/],
    ['Nachtrag',/Nachtrag/],
    ['Kern',/\bKern/],
    ['Datensatz',/Datensatz/],
    ['rules.*',/\brules\./],
    ['Bezeichner',/\b[a-z]+[A-Z][A-Za-z]*\b/],
    ['Unterstrich',/[A-Za-z]_[A-Za-z]/],
    ['Feldname',/\b(?:minp|maxp|buf|cap|split|wfrac|maxRisk|ddStatic|fee|dd|target2?|Minp|Maxp|Buf|Wfrac|MaxRisk|DdStatic|Fee|Dd|Target2?)\b/],   // groß nur, wo es kein Wort der Firmen ist (Cap, Split)
    ['nur Notiz',/nur Notiz/],
    ['regeltreu',/regeltreu/],
    ['Abgleich',/\bAbgleich\b/],
    ['gemessen',/gemessen (?:ohne|\d)/],
    ['konservativ',/konservativ/],
    ['Marker',/[⟦⟧]/]
  ];
  // Wortprüfung (F4): Formulierungen, die das Umgehen von Regeln nahelegen könnten
  const FORBIDDEN=[/umgeh/i,/Umgehung/,/Trick/,/unbemerkt/,/versteck/i,/Gegenposition/,/hedg/i,/Gegentrade(?!s verboten)/];

  const fmtDate=s=>{ const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s||'')); return m?m[3]+'.'+m[2]+'.'+m[1]:null; };
  const stripUrls=s=>String(s).replace(URL_RE,' ');
  const numbers=s=>stripUrls(s).match(NUM_RE)||[];
  // Zahlen der Originalnotiz ohne die Ausnahmen (E3): Auftragsnummern und die Historienklammern „bis M-0xx <Zahl>“
  const HISTORY_RE=new RegExp('\\bbis '+ID+' \\d+(?:[.,]\\d+)*','g');
  const noteNumbers=note=>numbers(String(note||'').replace(HISTORY_RE,' ').replace(new RegExp(ID,'g'),' '));
  const urls=s=>String(s).match(URL_RE)||[];

  // Sätze: Punkt + Leerzeichen + Großbuchstabe; Abkürzungen, Ordnungszahlen und „TT.MM. “ sind geschützt
  function sentences(s){
    const P=' ';
    const t=String(s)
      .replace(/\b(Max|max|Min|min|inkl)\. /g,'$1.'+P)
      .replace(/(^|[^\d.,])(\d)\. (?=(?:Antrag|Auszahlungsziel|Auszahlung|Zyklusziel|Zyklus|Funded-Trade|Account|Mal)\b)/g,'$1$2.'+P)
      .replace(/(\b\d{1,2}\.\d{1,2}\.) (?=[A-ZÄÖÜ])/g,'$1'+P);
    return t.split(/(?<=\.) +(?=[A-ZÄÖÜ„]|(?:minp|maxp|buf|cap|split|wfrac|dd)\b|\d+ %-Add-On)/).map(x=>x.replace(/ /g,' ').trim()).filter(Boolean);
  }

  function applyRules(s, part, hits){
    for(const r of RULES){
      if(r.in!=='*' && r.in!==part) continue;
      r.re.lastIndex=0;
      const out=s.replace(r.re,r.to);
      if(out!==s){ if(hits) hits.add(r.id); s=out; }
    }
    return s;
  }

  // Marker herausziehen, Rest aufräumen
  function extract(s, q, m){
    s=s.replace(/⟦Q:([^⟧]*)⟧/g,(x,c)=>{ q.push(c.trim()); return ''; })
       .replace(/⟦M:([^⟧]*)⟧/g,(x,c)=>{ m.push(c.trim()); return ''; });
    s=s.replace(/\s{2,}/g,' ').replace(/ ([,;.)])/g,'$1').replace(/\( /g,'(').trim();
    return /[\p{L}\d]/u.test(s)?s:'';
  }
  const cap1=s=>/^https?:/.test(s)?s:s.charAt(0).toUpperCase()+s.slice(1);
  // Satzanfang groß auch innerhalb eines Eintrags (nicht nach „Min.“ und nicht nach Datum oder Ordnungszahl)
  const capSentences=s=>s.replace(/(?<!Min|\d)\. ([a-zäöü])/g,(m,c)=>'. '+c.toUpperCase());

  // Bereiche, in denen nichts ersetzt wird: URLs und Zitate „…“
  function protectedSpans(s){
    const sp=[];
    for(const re of [/https?:\/\/\S+/g,/„[^“]*“/g]){ let m; re.lastIndex=0; while((m=re.exec(s))) sp.push([m.index,m.index+m[0].length]); }
    return sp;
  }
  const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  // Erstes Vorkommen eines Kürzels erklären: „DLL (Tagesverlustgrenze)“, im Wortverbund „EOD-trailing (EOD = Tagesende)“
  function explainFirst(entries, abbr, meaning){
    const re=new RegExp('(?<![A-Za-z0-9&])'+esc(abbr)+'(?![A-Za-z0-9&])','g');
    for(let i=0;i<entries.length;i++){
      const s=entries[i], sp=protectedSpans(s); let m; re.lastIndex=0;
      while((m=re.exec(s))){
        const at=m.index;
        if(sp.some(([a,b])=>at>=a&&at<b)) continue;
        let a=at, b=at+abbr.length;
        while(a>0 && /[\p{L}\d&-]/u.test(s[a-1])) a--;
        while(b<s.length && /[\p{L}\d&-]/u.test(s[b])) b++;
        while(b>a && s[b-1]==='-') b--;
        // schon erklärt: steht als „(EOD-trailing)“ direkt hinter seiner Erklärung
        if(s[a-1]==='(' && s[b]===')') return true;
        const tok=s.slice(a,b);
        const add=tok===abbr?' ('+meaning+')':' ('+abbr+' = '+meaning+')';
        entries[i]=s.slice(0,b)+add+s.slice(b);
        return true;
      }
    }
    return false;
  }

  // Restprüfung (F5): Sperrliste, Kürzel außerhalb ALLOWED, Wortprüfung; URLs und Zitate ausgenommen
  function residual(text){
    const t=String(text).replace(/https?:\/\/\S+/g,' ').replace(/„[^“]*“/g,' ');
    const out=[];
    for(const [name,re] of BLOCK){ const m=t.match(re); if(m) out.push(name+': '+m[0]); }
    for(const m of t.match(/(?<![\p{L}\d&/_-])[A-Z][A-Z0-9&/_-]*[A-Z0-9](?![\p{L}\d&/_-])/gu)||[])
      if(!ALLOWED.includes(m)) out.push('Kürzel: '+m);
    for(const re of FORBIDDEN){ const m=t.match(re); if(m) out.push('Wortprüfung: '+m[0]); }
    return out;
  }

  // Multimengen-Vergleich: was in a fehlt bzw. zu viel ist
  function multisetDiff(a, b){
    const c=new Map();
    for(const x of a) c.set(x,(c.get(x)||0)+1);
    for(const x of b) c.set(x,(c.get(x)||0)-1);
    const missing=[], extra=[];
    for(const [x,n] of c){ for(let i=0;i<n;i++) missing.push(x); for(let i=0;i<-n;i++) extra.push(x); }
    return {missing,extra};
  }

  function build(offer, hits){
    const note=String(offer&&offer.note||'');
    const i=note.indexOf('Annahmen:');
    const ruleText=i<0?note:note.slice(0,i), modelText=i<0?'':note.slice(i+'Annahmen:'.length);
    const rules=[], model=[], q=[], moved=[];
    for(const s of sentences(ruleText)){ const t=extract(applyRules(s,'r',hits),q,moved); if(t) rules.push(capSentences(cap1(t))); }
    for(const s of sentences(modelText)){ const t=extract(applyRules(s,'m',hits),q,moved); if(t) model.push(t); }
    for(const s of moved){ const t=extract(applyRules(s,'*',hits),q,[]); if(t) model.push(t); }
    const modelOut=model.map(s=>capSentences(/^Im Modell/.test(s)?s:'Im Modell: '+cap1(s)));
    const sources=[];
    const d=fmtDate(offer&&offer.asof);
    if(offer&&offer.src) sources.push(offer.src+(d?', Stand '+d:''));
    for(const s of q) sources.push(cap1(s));
    const all=[...rules,...modelOut,...sources];
    for(const [a,mn] of ABBR) explainFirst(all,a,mn);
    const R=all.slice(0,rules.length), M=all.slice(rules.length,rules.length+modelOut.length), S=all.slice(rules.length+modelOut.length);
    const text=[R.length?'Regeln der Firma: '+R.join(' '):'', M.length?'So rechnet das Modell: '+M.join(' '):'', S.length?'Quellen: '+S.join(' · '):'']
      .filter(Boolean).join('\n');
    // Selbstprüfung: Restbegriffe, Zahlen (E3), URLs
    const unknown=residual(text);
    const outNums=numbers(text);
    if(d){ const k=outNums.indexOf(d); if(k>=0) outNums.splice(k,1); }
    const nd=multisetDiff(noteNumbers(note),outNums);
    for(const x of nd.missing) unknown.push('Zahl fehlt: '+x);
    for(const x of nd.extra) unknown.push('Zahl neu: '+x);
    for(const u of urls(note)) if(!text.includes(u)) unknown.push('URL fehlt: '+u);
    return {rules:R,model:M,sources:S,text,unknown};
  }

  // Klartextfassung einer Angebotsnotiz. Wirft nie; bei einem Fehler Originalnotiz und Meldung in unknown.
  // opts.hits (Set) sammelt die ids der Regeln, die gegriffen haben (Abdeckungstest).
  function userNote(offer, opts){
    try{ return build(offer, opts&&opts.hits); }
    catch(e){
      const note=String(offer&&offer.note||'');
      return {rules:note?[note]:[],model:[],sources:[],text:note,unknown:['Fehler: '+(e&&e.message||e)]};
    }
  }

  const api={userNote,RULES,ABBR,ALLOWED,BLOCK,FORBIDDEN,numbers,noteNumbers,multisetDiff,residual,sentences};
  if(typeof module!=='undefined' && module.exports) module.exports=api; else root.GlitchNotes=api;
})(typeof self!=='undefined'?self:this);
