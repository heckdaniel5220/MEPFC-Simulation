/* Glitch-Simulator – Firmendaten für die Seite „Regeln“ (M-029).
   DOM-frei: Browser: globales GlitchFirms, Node module.exports.
   FIRMS: je OFFERS-Gruppe ein Eintrag (Zuordnung über den vollen Gruppennamen) mit Account-Limits in drei Zuständen
   (value = Zahl belegt, none = belegt: keine feste Anzahl, unknown = nicht belegt), Quelle und Stand je Wert.
   planSheets fasst ruleSheet (explain.js, per deps übergeben) je Plan zusammen: Zeilen = Einträge, Spalten = Größen. */
(function(root){
  'use strict';

  // ---- Quellen (Abrufe durch den Orchestrator, Texte aus den Aufträgen M-010h und M-029) ----
  const SRC={
    fnLimits:'https://helpfutures.fundednext.com/en/articles/17225812',
    luLimits:'https://support.lucidtrading.com/en/articles/11404617',
    luBan:'https://support.lucidtrading.com/en/articles/11404734',
    mfBan:'https://help.myfundedfutures.com/en/articles/12011241',
    mfRapidEod:'https://help.myfundedfutures.com/en/articles/16727601-rapid-eod-25k-a-comprehensive-look',
    afThird:'https://thegodfunded.com'
  };
  const U={state:'unknown'};

  // Verbot von Gegenpositionen: aus den notes (Wendung „Gegentrades verboten.“) oder als Originalzitat
  const BAN_PHRASE='Gegentrades verboten';
  const BAN_RE=/Gegentrades verboten\./;
  // Die einzigen Stellen, an denen das englische Wort vorkommen darf (Test)
  const BAN_QUOTES=[
    'Lucid Trading strictly prohibits all forms of hedging, including … Hedging across multiple accounts held by the same user.',
    'MyFunded Futures prohibits hedging of any kind.'
  ];
  // Fester Satz oben auf der Seite für Firmen ohne Einzelbeleg (Auftrag M-029, E2)
  const NO_BAN_TEXT='Für Alpha Futures und FundedNext Futures liegt hier kein Einzelbeleg zum Verbot von Gegenpositionen vor. Vor dem Handel im Help Center prüfen.';
  const HINT='Maßgeblich ist immer das Help Center der Firma. Regeln und Limits ändern sich oft.';
  const SHEET_HINT='Die Tabellen zeigen das Regelblatt des Simulators je Plan, die Größen als Spalten. „im Modell“ meint die Abbildung im Simulator.';

  const FIRMS=[
    {id:'af',name:'Alpha Futures',group:'Alpha Futures · CME-Futures · Eval monatlich, Direct einmalig',
      scope:U,
      limits:{eval:U,funded:U,
        live:{state:'unknown',third:{text:'Drittquelle nennt 5 Live',src:SRC.afThird,asof:'2026-06-22'}},
        allocation:U},
      extra:[],plans:[],ban:null},
    {id:'lu',name:'Lucid Trading',group:'Lucid Trading · Futures · einmalig',
      scope:{state:'value',text:'je Haushalt bzw. Familie',src:SRC.luLimits,asof:'2026-10-19',written:'2026-08-26'},
      limits:{
        eval:{state:'value',value:10,unit:'Accounts',text:'aktive Evaluations',src:SRC.luLimits,asof:'2026-10-19',written:'2026-08-26'},
        funded:{state:'value',value:5,unit:'Accounts',text:'aktive Funded',src:SRC.luLimits,asof:'2026-10-19',written:'2026-08-26'},
        live:{state:'value',value:5,unit:'Accounts',text:'aktive LucidLive',src:SRC.luLimits,asof:'2026-10-19',written:'2026-08-26'},
        allocation:U},
      extra:[
        {text:'Eval und Funded zusammen höchstens 10 aktive Accounts.',src:SRC.luLimits,asof:'2026-10-19'},
        {text:'5 Evaluations dürfen „in reserve“ gehalten werden, während 5 Funded laufen.',src:SRC.luLimits,asof:'2026-10-19'}],
      plans:[],
      ban:{kind:'quote',quote:BAN_QUOTES[0],text:'Folge laut Quelle: Reset auf den Stand des Vortags, bei Wiederholung Bruch („will be breached“).',
        src:SRC.luBan,asof:'2026-10-19'}},
    {id:'mf',name:'MyFundedFutures',group:'MyFundedFutures · Futures · einmalig',
      scope:U,
      limits:{eval:U,funded:U,live:U,allocation:U},
      extra:[],
      plans:[{plan:'mf-rapid-eod',label:'Rapid EOD 25k',phase:'funded',value:3,text:'höchstens 3 Funded-Accounts',src:SRC.mfRapidEod,asof:'2026-10-17'}],
      ban:{kind:'quote',quote:BAN_QUOTES[1],text:'Definition laut Quelle: Kauf und Verkauf desselben Basiswerts zur selben Zeit. Mehrere Konten nennt die Quelle nicht ausdrücklich.',
        src:SRC.mfBan,asof:'2026-10-19',written:'2025-11-10'}},
    {id:'fn',name:'FundedNext Futures',group:'FundedNext Futures · einmalig',
      scope:{state:'value',text:'je Nutzer und Haushalt (gleiche Adresse oder IP)',src:SRC.fnLimits,asof:'2026-10-19'},
      limits:{
        eval:{state:'none',text:'keine feste Anzahl',src:SRC.fnLimits,asof:'2026-10-19'},
        funded:{state:'value',value:5,unit:'Accounts',text:'aktive Funded gleichzeitig',src:SRC.fnLimits,asof:'2026-10-19'},
        live:U,
        allocation:{state:'value',value:750000,unit:'$',text:'gesamt gleichzeitig, laut Text bei Challenges',src:SRC.fnLimits,asof:'2026-10-19',
          quote:'Up to $750,000 in total allocation at any one time'}},
      extra:[
        {text:'Höchstens 10 neue Funded-Accounts je Kalendermonat.',src:SRC.fnLimits,asof:'2026-10-19'},
        {text:'Funded: „up to 5 active FundedNext Accounts at any given moment“.',src:SRC.fnLimits,asof:'2026-10-19'},
        {text:'„Maximum allocation limits are subject to periodic review.“',src:SRC.fnLimits,asof:'2026-10-19'}],
      plans:[],ban:null},
    {id:'ac',name:'Alpha Capital',group:'Alpha Capital · CFD (NAS100, Gold) · einmalig',
      scope:U,limits:{eval:U,funded:U,live:U,allocation:U},extra:[],plans:[],ban:{kind:'note'}},
    {id:'bg-cfd',name:'Blue Guardian · CFD',group:'Blue Guardian · CFD',
      scope:U,limits:{eval:U,funded:U,live:U,allocation:U},extra:[],plans:[],ban:{kind:'note'}},
    {id:'bg-fut',name:'Blue Guardian · Futures',group:'Blue Guardian · Futures',
      scope:U,limits:{eval:U,funded:U,live:U,allocation:U},extra:[],plans:[],ban:{kind:'note'}}
  ];
  const TILES=[
    {key:'eval',label:'Challenge / Eval'},
    {key:'funded',label:'Funded'},
    {key:'live',label:'Live'},
    {key:'allocation',label:'Allocation'}];

  // Wortprüfung (F6/E2): verbotene Wörter, Ausnahmen nur über die feste Wendung bzw. die zwei Zitate
  const FORBIDDEN=['hedge','gegentrade','gegenkonto','spiegel','hedg'];
  const TIP_WORDS=['vpn','umgeh','anderer name','anderen namen','familienmitglied','zweite adresse','andere adresse'];
  function wordProblems(text){
    let t=String(text);
    for(const q of BAN_QUOTES) t=t.split(q).join(' ');
    t=t.split(BAN_PHRASE).join(' ');
    const low=t.toLowerCase();
    return FORBIDDEN.concat(TIP_WORDS).filter(w=>low.includes(w));
  }

  // ---- Zahlen und Datum ----
  const nf=new Intl.NumberFormat('de-DE',{maximumFractionDigits:2});
  const num=v=>nf.format(v).replace(/^-/,'−');
  const usd=v=>num(v)+' $';
  const deDate=iso=>{ const [y,m,d]=String(iso).split('-'); return `${d}.${m}.${y}`; };
  const range=(xs,f)=>{ const lo=Math.min(...xs), hi=Math.max(...xs); return lo===hi?f(lo):`${num(lo)}–${f(hi)}`; };
  const dateRange=ds=>{ const s=[...new Set(ds)].sort(); return s.length===1?deDate(s[0]):`${deDate(s[0])} bis ${deDate(s[s.length-1])}`; };

  // ---- Zuordnung ----
  const market=g=>/CFD/.test(g||'')?'CFD':'Futures';
  const firmOfGroup=g=>FIRMS.find(f=>f.group===g)||null;
  const planKey=id=>String(id).replace(/-\d+(?:\.\d+)?$/,'');
  const sizeLabel=n=>{ const m=/\s(\d+(?:,\d+)?k)\b/.exec(n); return m?m[1]:n; };
  const planName=n=>String(n).replace(/\s\d+(?:,\d+)?k\b/,'').replace(/\s{2,}/g,' ').trim();
  // Spaltenkopf: Größe, bei abweichendem Namen der Rest dazu (Builder 50k Add-On)
  function colLabel(o,name){
    const s=sizeLabel(o.n), rest=planName(o.n);
    return rest===name?s:`${s} ${rest.replace(name,'').trim()}`.trim();
  }
  function banFromNotes(items){ const n=items.filter(o=>BAN_RE.test(o.note||'')).length; return {n,total:items.length}; }

  // ---- Regelblatt je Plan ----
  const HIDE=['missing','null'];
  const isUrl=s=>/^https?:\/\//.test(String(s));
  // Zellen: gleiche Texte nebeneinander werden zu einer Zelle mit span zusammengefasst
  function cellsOf(entries){
    const cells=[];
    for(const e of entries){
      const last=cells[cells.length-1];
      if(last && last.text===e.text) last.span++;
      else cells.push({text:e.text,span:1,url:e.unit==='URL' && isUrl(e.text)});
    }
    return cells;
  }
  function planSheet(items,name,ruleSheet){
    const sheets=items.map(o=>ruleSheet(o));
    const groups=[], missing=[];
    sheets[0].groups.forEach((g,gi)=>{
      const rows=[], none=[];
      g.entries.forEach((e,ei)=>{
        const es=sheets.map(s=>s.groups[gi].entries[ei]);
        if(es.some(x=>x.label!==e.label)) throw new Error('Regelblatt uneinheitlich: '+e.label);
        if(e.label==='Kontogröße') return;
        if(es.every(x=>HIDE.includes(x.state))){ missing.push({group:g.label,label:e.label,cells:cellsOf(es)}); return; }
        if(es.every(x=>x.state==='none-model')){ none.push(e.label); return; }
        rows.push({label:e.label,cells:cellsOf(es)});
      });
      groups.push({key:g.key,label:g.label,rows,none});
    });
    return {groups,missing};
  }
  function planSummary(items){
    const p=[`${items.length} ${items.length===1?'Größe':'Größen'}`, 'Fee '+range(items.map(o=>o.fee),usd)];
    const ch=items.filter(o=>o.mode!=='instant');
    if(ch.length) p.push('Ziel '+range(ch.map(o=>o.target),usd)); else p.push('ohne Challenge');
    p.push('Drawdown '+range(items.map(o=>o.dd),usd));
    return p.join(' · ');
  }
  function planSheets(items,ruleSheet){
    const map=new Map();
    for(const o of items){ const k=planKey(o.id); if(!map.has(k)) map.set(k,[]); map.get(k).push(o); }
    return [...map].map(([key,os])=>{
      const name=planName(os[0].n);
      return Object.assign({key,name,cols:os.map(o=>({id:o.id,label:colLabel(o,name)})),summary:planSummary(os)},planSheet(os,name,ruleSheet));
    });
  }

  // ---- Seitenmodell ----
  // deps = {OFFERS, ruleSheet}
  function model(deps){
    return deps.OFFERS.map(g=>{
      const f=firmOfGroup(g.g);
      if(!f) throw new Error('Keine Firma für Gruppe '+g.g);
      const notes=banFromNotes(g.items);
      return {firm:f,group:g.g,market:market(g.g),items:g.items,plans:planSheets(g.items,deps.ruleSheet),
        banNotes:notes,rulesAsof:dateRange(g.items.map(o=>o.asof)),firstSrc:g.items[0].src};
    });
  }

  const api={FIRMS,TILES,SRC,BAN_PHRASE,BAN_RE,BAN_QUOTES,NO_BAN_TEXT,HINT,SHEET_HINT,FORBIDDEN,TIP_WORDS,
    wordProblems,market,firmOfGroup,planKey,planName,sizeLabel,colLabel,banFromNotes,cellsOf,planSheet,planSheets,planSummary,model,
    num,usd,deDate,dateRange};
  if(typeof module!=='undefined' && module.exports) module.exports=api; else root.GlitchFirms=api;
})(typeof self!=='undefined'?self:this);
