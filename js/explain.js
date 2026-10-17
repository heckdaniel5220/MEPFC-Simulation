/* Glitch-Simulator – Regelblatt und Eignungserklärung (M-016a).
   DOM-frei: Browser window.GlitchExplain, Node module.exports.
   ruleSheet und challengeType lesen nur die Daten eines Angebots. ruleCosts rechnet je Regelgruppe einen Lauf mit
   abgeschalteter Gruppe (ruleCostsSteps: dasselbe schrittweise, ein simulate je Schritt, M-016b) (simulate, prepare, autoParams und rank werden übergeben: deps). strategyFit und typeSummary
   bauen Sätze nur aus Zahlen der Rangliste (rank.js) und aus ruleCosts. */
(function(root){
  'use strict';

  const DISCLAIMER='Gilt nur für die eingestellte Strategie. Positive Werte können aus der Payout-Struktur der Firma kommen statt aus einem Trading-Edge. Modell mit Annahmen (CLAUDE.md). Keine Anlageberatung.';
  const ANALYSIS='Analyse: Regel im Modell abgeschaltet, bei der Firma nicht möglich.';
  const NO_CAP=100000;   // Konvention „kein Cap“
  const SEED=20261015;
  const RANK_KEYS=['seed','today'];

  // ---- Zahlenformat (de-DE, „1.234 $“, Minus „−“) ----
  const nf=d=>new Intl.NumberFormat('de-DE',{minimumFractionDigits:d,maximumFractionDigits:d});
  const minus=s=>s.replace(/^-/,'−');
  const num=(v,d=0)=>minus(nf(d).format(Object.is(Math.round(v*10**d),-0)?0:v));
  const money=v=>num(v)+' $';                                   // gemessene Beträge: ganze Dollar
  const moneyData=v=>num(v,Number.isInteger(v)?0:2)+' $';      // Datenwerte: wie im Angebot (bis 2 Nachkommastellen)
  const signed=(s,v)=>(v>0 && /[1-9]/.test(s)?'+':'')+s;      // „+“ nur, wenn nicht als 0 angezeigt
  const sMoney=v=>signed(money(v),v);
  const pctOf=v=>num(v*100)+' %';                               // Anteil 0–1 als Prozent
  const pp=v=>signed(num(v*100,1),v);                           // Prozentpunkte
  const dataNum=v=>minus(new Intl.NumberFormat('de-DE',{maximumFractionDigits:2}).format(v));   // Datenwerte ohne Nachkommanullen

  // Satz-Bauer: Teile sind Text oder {v, s, src}; nums hält jede Zahl mit ihrer Quelle (Pfad in {row, costs, offer, fit} oder 'derived')
  function sentence(key,parts){
    const nums=[]; let text='';
    for(const p of parts){
      if(p===null || p===undefined || p===false) continue;
      if(typeof p==='string'){ text+=p; continue; }
      nums.push({v:p.v,s:p.s,src:p.src}); text+=p.s;
    }
    return {key,text,nums};
  }
  const N=(v,s,src)=>({v,s,src});

  // ---- Angebots-Hilfen ----
  const market=g=>/CFD/.test(g||'')?'CFD':'Futures';
  const isAF=o=>/^af-/.test(o.id||'');
  function accountSize(o){
    if(o.rules && typeof o.rules.size==='number') return o.rules.size;
    const m=/-(\d+(?:\.\d+)?)$/.exec(o.id||''); return m?Math.round(+m[1]*1000):null;
  }
  const deDate=iso=>{ const [y,m,d]=String(iso).split('-'); return `${d}.${m}.${y}`; };

  // Modell-Proxys für cap (laut note kein Firmen-Cap). Feste Liste, ein Test gleicht sie mit den notes ab.
  const PROXY_CAPS=[
    {prefix:'mf-rapid-',meaning:'Tagesgewinn bis Live'},
    {prefix:'lu-daily-',meaning:'Tagesgewinn bis Live'},
    {prefix:'mf-pro-',meaning:'Gesamtcap pro Nutzer'}
  ];
  const proxyCap=o=>{ const p=PROXY_CAPS.find(x=>String(o.id).startsWith(x.prefix)); return p?p.meaning:null; };
  const proxyText=m=>`Modell-Proxy: ${m}, kein Firmen-Cap`;

  // DD-Art laut Quelle (rules.mllType, bei MFFU je Phase)
  const DD_SRC={
    'eod-trailing-lock-start':'EOD-trailing, Lock bei Start',
    'eod-trailing-lock-start100':'EOD-trailing, Lock bei Start + 100 $',
    'intraday-trailing-lock-start100':'intraday-trailing, Lock bei Start + 100 $',
    'trailing-hwm-lock-start':'trailing vom Höchststand, Lock bei Start',
    'trailing-hwm-close-lock-start':'trailing vom höchsten Schlusskontostand, Lock bei Start',
    'eod-trailing':'EOD-trailing',
    'static':'statisch'};
  const ddSrcText=v=>DD_SRC[v]||String(v);

  // ---- 1. Regelblatt ----
  // Eintrag: label, core (Kernfeld) oder nur raw (Rohfelder in Reihenfolge), unit, optional fmt (Wert → Text), off (Kernwert = keine Regel), pct (in % der Kontogröße)
  const fmtBill=v=>v==='monthly'?'monatlich':v==='once'?'einmalig':String(v);
  const SHEET=[
    {key:'kosten',label:'Kosten',items:[
      {label:'Fee im Modell',core:'fee',raw:['codePrice','price'],unit:'$'},
      {label:'Listenpreis',core:'list',raw:['price'],unit:'Text'},
      {label:'Code',core:'code',raw:[],unit:'Text',off:v=>v==='–'||!v,offState:'no-code',offText:'kein belegter Code'},
      {label:'Code gültig bis',raw:['codeValidUntil'],unit:'Datum',fmt:v=>v===null?'ohne Ablaufdatum':deDate(v),nullIsValue:true},
      {label:'Code max. Einlösungen',raw:['codeMaxUses'],unit:'Anzahl'},
      {label:'Codepreis Folge-Accounts',raw:['codePriceFrom3rd'],unit:'$'},
      {label:'Reset',raw:['reset'],unit:'$'},
      {label:'Abrechnung',raw:['billing'],unit:'Text',fmt:fmtBill},
      {label:'Monatsabo (je weitere 30 Kalendertage)',core:'feeMonthly',raw:[],unit:'$'},
      {label:'Aktivierungsgebühr',core:'feeActivation',raw:[],unit:'$'},
      {label:'Preis 90-%-Add-On',raw:['priceNinety'],unit:'$'},
      {label:'Preis Bi-Weekly',raw:['priceBiWeekly'],unit:'$'},
      {label:'Listenpreis ohne DLL',raw:['priceNoDll'],unit:'$'},
      {label:'Codepreis ohne DLL',raw:['codePriceNoDll'],unit:'$'}]},
    {key:'ziele',label:'Ziele',items:[
      {label:'Kontogröße',size:true,raw:['size'],unit:'$'},
      {label:'Ziel Phase 1',core:'target',raw:['target','target1'],unit:'$',pct:true},
      {label:'Ziel Phase 2',core:'target2',raw:['target2'],unit:'$',pct:true},
      {label:'Auszahlungsziel 1. (Direct)',raw:['wTarget1','cycleTarget1'],unit:'$'},
      {label:'Auszahlungsziel ab 2. (Direct)',raw:['wTarget2','cycleTarget2'],unit:'$'}]},
    {key:'drawdown',label:'Drawdown',items:[
      {label:'Drawdown',core:'dd',raw:['mll'],unit:'$',pct:true},
      {label:'Drawdown Eval / Funded laut Quelle',raw:['mllEval','mllFunded'],unit:'$',multi:true},
      {label:'Art im Modell',core:'ddStatic',raw:[],unit:'Text',always:true,fmt:v=>v?'statisch':'trailing pro Trade, Lock beim Startkapital'},
      {label:'Art laut Quelle',raw:['mllType'],unit:'Text',fmt:ddSrcText},
      {label:'Art laut Quelle Eval / Funded',raw:['mllTypeEval','mllTypeFunded'],unit:'Text',multi:true,fmt:ddSrcText},
      {label:'Lock',raw:['mllLock','trailBalance'],unit:'Text',multi:true},
      {label:'MLL fest nach 1. Auszahlung',raw:['mllFixedAfterFirstPayout','mllStaticAfterFirstPayout'],unit:'Ja/Nein'}]},
    {key:'tageslimit',label:'Tageslimit',items:[
      {label:'Eval',core:'dllEval',raw:['dlgEval','dailyDd'],unit:'$'},
      {label:'Funded',core:'dllFunded',raw:['dlgFunded','dailyDd'],unit:'$'},
      {label:'Art',core:'dllType',raw:['dlgType'],unit:'Text',activeIf:o=>o.dllEval>0||o.dllFunded>0,fmt:v=>v==='hard'?'hart (Bruch beendet Challenge bzw. Account)':'weich (Tag endet)'},
      {label:'Basis',raw:['dailyDdBase'],unit:'Text'},
      {label:'Scaling Funded (Anteil des höchsten EOD-Gewinns)',core:'dllScaleFunded',raw:['dlgScaleFunded'],unit:'Anteil'},
      {label:'Scaling ab EOD-Gewinn',core:'dllScaleFrom',raw:[],unit:'$'}]},
    {key:'consistency',label:'Consistency',items:[
      {label:'Eval (bester Tag < … des Phasengewinns)',core:'consEval',raw:['consEval'],unit:'%'},
      {label:'Eval-Modus laut Quelle',raw:['consEvalMode'],unit:'Text'},
      {label:'Funded (bester Tag < … des Zyklusgewinns)',core:'consFunded',raw:['consFunded','bestDayPct'],unit:'%'},
      {label:'Funded-Bezug',core:'consFundedMode',raw:['consFundedMode'],unit:'Text',activeIf:o=>o.consFunded>0,fmt:v=>v==='perpetual'?'dauerhaft':'je Zyklus'},
      {label:'Stufen laut Quelle',raw:['consFundedSteps'],unit:'%'},
      {label:'Option laut Quelle',raw:['consOption'],unit:'Text'}]},
    {key:'tage',label:'Tage',items:[
      {label:'Mindest-Handelstage Eval (je Step)',core:'evalMinDays',raw:['minDaysEval','minDays'],unit:'Tage'},
      {label:'Gewinntage Eval (je Step)',core:'evalWinDays',raw:['minProfitDaysEval'],unit:'Tage'},
      {label:'Gewinntag-Schwelle Eval',core:'evalWinDayMin',raw:['minProfitDayPct'],unit:'$',activeIf:o=>o.evalWinDays>0,zeroText:'Tages-P&L > 0'},
      {label:'Mindest-Handelstage je Auszahlungszyklus',core:'payMinDays',raw:['minDaysCycle','minDaysPayout'],unit:'Tage'},
      {label:'Gewinntage je Auszahlungszyklus',core:'payWinDays',raw:['winDays','benchmarkDays','minProfitDays'],unit:'Tage'},
      {label:'Gewinntag-Schwelle Funded',core:'payWinDayMin',raw:['winDayMin','benchmarkMin','minProfitDayPct'],unit:'$',activeIf:o=>o.payWinDays>0,zeroText:'Tages-P&L > 0'},
      {label:'1. Auszahlung frühestens nach',core:'payFirstAfterCal',raw:['firstPayoutAfterHours','firstPayoutAfterDays'],unit:'Kalendertage'},
      {label:'Auszahlungsrhythmus',core:'payEveryCal',raw:['payoutEveryDays'],unit:'Kalendertage'},
      {label:'Max. Anträge pro Monat (nicht im Modell)',raw:['maxReqPerMonth'],unit:'Anzahl'},
      {label:'Inaktivität (nicht im Modell)',raw:['inactivityDays'],unit:'Tage'},
      {label:'Flat bis (nicht im Modell)',raw:['flatBy'],unit:'Text'}]},
    {key:'auszahlung',label:'Auszahlung',items:[
      {label:'Puffer vor der 1. Auszahlung',core:'buf',raw:['buffer','bufferPct','bufferMll100'],unit:'$'},
      {label:'Mindestgewinn je Auszahlung',core:'minp',raw:['payoutMin','payoutMinPct','cycleProfitMin'],unit:'$'},
      {label:'Auszahlbarer Anteil',core:'wfrac',raw:['payoutFrac'],unit:'%'},
      {label:'Cap je Auszahlung',core:'cap',raw:['payoutCap','payoutCap1','payoutMax','payoutCapPct','firstPayoutsCap','dailyPayoutMax','totalPayoutCap'],unit:'$',cap:true},
      {label:'Cap ab 2. Auszahlung laut Quelle',raw:['payoutCap2'],unit:'$'},
      {label:'Split',core:'split',raw:['split','splitNominal'],unit:'%'},
      {label:'Auszahlungsgebühr laut Quelle',raw:['payoutFeePct'],unit:'%'},
      {label:'Max. Anzahl Auszahlungen',core:'maxp',raw:['maxPayouts'],unit:'Anzahl'},
      {label:'Live ab Tagesgewinn (nicht im Modell)',raw:['liveAtDailyProfit'],unit:'$'}]},
    {key:'risiko',label:'Risiko',items:[
      {label:'Max. Risiko je Trade (maxRisk)',core:'maxRisk',raw:['maxRiskPct','guardianShieldPct'],unit:'$'},
      {label:'Guardian Shield Nano laut Quelle',raw:['guardianShieldNano'],unit:'Text'},
      {label:'Max. Mini / Micro (nicht im Modell)',raw:['maxMini','maxMicro'],unit:'Kontrakte',multi:true},
      {label:'Lot-Limit (nicht im Modell)',raw:['lotLimit'],unit:'Lots'},
      {label:'Hebel (nicht im Modell)',raw:['leverage'],unit:'Text'},
      {label:'News im Funded (nicht im Modell)',raw:['newsFunded'],unit:'Text'},
      {label:'Wochenende halten im Funded (nicht im Modell)',raw:['weekendFunded'],unit:'Ja/Nein'},
      {label:'EAs (nicht im Modell)',raw:['eas'],unit:'Ja/Nein'},
      {label:'Scaling-Plan (nicht im Modell)',raw:['scaling'],unit:'Ja/Nein'}]},
    {key:'quelle',label:'Quelle und Stand',items:[
      {label:'Quelle',core:'src',raw:[],unit:'URL'},
      {label:'Stand',core:'asof',raw:[],unit:'Datum',fmt:deDate}]}
  ];
  // Rohfelder ohne Gruppe: werden vollständig unter „weitere Rohfelder“ gezeigt
  const REST_KEYS=['config','variant','riskOption'];

  const has=(r,k)=>Object.prototype.hasOwnProperty.call(r,k);
  function fmtVal(v,unit){
    if(v===null || v===undefined) return '';
    if(typeof v==='boolean') return v?'ja':'nein';
    if(Array.isArray(v)) return v.map(x=>fmtVal(x,unit)).join(' / ');
    if(typeof v==='object') return Object.entries(v).map(([k,x])=>`${k} ${fmtVal(x,'')}`).join(', ');
    if(typeof v==='number'){
      if(unit==='$') return moneyData(v);
      if(unit==='%') return dataNum(v)+' %';
      if(unit==='Anteil') return dataNum(v*100)+' %';
      return dataNum(v);
    }
    return String(v);
  }
  // Text für fehlende Werte (F1)
  const missingText='keine Angabe';
  const nullText=o=>isAF(o)?'gilt nicht':'gilt nicht / keine Angabe';
  const noneText='keine Regel im Modell';

  function sheetEntry(o,it){
    const r=o.rules||{}, size=accountSize(o);
    // Rohfeld: erster vorhandener Schlüssel mit Wert, sonst erster vorhandener (null), sonst keiner
    const present=it.raw.filter(k=>has(r,k)), withVal=present.filter(k=>r[k]!==null);
    const fromKeys=it.multi?present:(withVal.length?[withVal[0]]:present.length?[present[0]]:[]);
    const from=fromKeys.map(k=>'rules.'+k), fromValue=fromKeys.map(k=>r[k]);
    const e={label:it.label,field:it.core||null,from:from.length?from.join(' / '):null,fromValue:fromKeys.length===1?fromValue[0]:fromKeys.length?fromValue:undefined,
      unit:it.unit,value:undefined,state:null,text:null};
    if(it.size){
      e.field=null; e.value=size; e.state=size===null?'missing':'value'; e.text=size===null?missingText:moneyData(size);
      if(!has(r,'size')) e.from='id'; return e;
    }
    if(it.core){
      const v=o[it.core]; e.value=v;
      const off=it.always?false:it.activeIf?!it.activeIf(o):it.off?it.off(v):(v===0 || v===null || v===undefined || v==='');
      if(off){ e.state=it.offState||'none-model'; e.text=it.offText||noneText; return e; }
      e.state='value';
      if(it.zeroText && v===0) e.text=it.zeroText;
      else e.text=it.fmt?it.fmt(v):fmtVal(v,it.unit);
      if(it.pct && size && typeof v==='number') e.pct=v/size*100, e.text+=` (${num(v/size*100,1)} % der Kontogröße)`;
      if(it.cap){
        const m=proxyCap(o);
        if(m){ e.proxy=m; e.text+=` (${proxyText(m)})`; }
        else if(v===NO_CAP){ e.text='kein Cap (100.000 $ = Konvention)'; e.convention=true; }
      }
      return e;
    }
    // nur Rohfeld
    if(!present.length){ e.state='missing'; e.text=missingText; return e; }
    if(!withVal.length && !it.nullIsValue){ e.state='null'; e.text=nullText(o); e.value=null; return e; }
    if(it.multi){ e.value=fromKeys.length===1?fromValue[0]:fromValue; e.state='value'; e.text=fromValue.map(v=>v===null?nullText(o):it.fmt?it.fmt(v):fmtVal(v,it.unit)).join(' / '); return e; }
    const v=r[fromKeys[0]]; e.value=v; e.state='value'; e.text=it.fmt?it.fmt(v):fmtVal(v,it.unit);
    return e;
  }

  // note: Teil vor „Annahmen:“ = Regeltext, danach = Annahme im Modell
  function splitNote(note){
    const s=String(note||''), i=s.indexOf('Annahmen:');
    if(i<0) return {rules:s.trim()||missingText,model:missingText};
    return {rules:s.slice(0,i).trim()||missingText,model:s.slice(i+'Annahmen:'.length).trim()||missingText};
  }

  function ruleSheet(offer){
    const r=offer.rules||{};
    const groups=SHEET.map(g=>({key:g.key,label:g.label,entries:g.items.map(it=>sheetEntry(offer,it))}));
    const rest=REST_KEYS.filter(k=>has(r,k)).map(k=>({label:k,field:null,from:'rules.'+k,unit:'Text',value:r[k],
      state:r[k]===null?'null':'value',text:r[k]===null?nullText(offer):fmtVal(r[k],'Text')}));
    const n=splitNote(offer.note);
    return {id:offer.id,name:offer.n,size:accountSize(offer),groups,rest,noteRules:n.rules,assumptions:n.model};
  }

  // Zuordnung Rohfeld → Gruppe (für den Zuordnungstest)
  function rawKeyGroups(){
    const m={};
    for(const g of SHEET) for(const it of g.items) for(const k of it.raw) (m[k]=m[k]||new Set()).add(g.key);
    for(const k of REST_KEYS) (m[k]=m[k]||new Set()).add('rest');
    const out={}; for(const k in m) out[k]=[...m[k]]; return out;
  }

  // ---- 2. Challenge-Typ ----
  const TYPE_LABEL={'instant':'Instant/Direct','1step':'1-Step','2step':'2-Step'};
  function challengeType(offer,g){
    const r=offer.rules||{};
    const type=offer.mode==='instant'?'instant':(offer.target2||0)>0?'2step':'1step';
    const mk=market(g!==undefined?g:offer.g);
    const ddModel=offer.ddStatic?'statisch':'trailing';
    let ddSource;
    if(r.mllType) ddSource=ddSrcText(r.mllType);
    else if(r.mllTypeEval || r.mllTypeFunded) ddSource=`Eval ${r.mllTypeEval?ddSrcText(r.mllTypeEval):missingText}, Funded ${r.mllTypeFunded?ddSrcText(r.mllTypeFunded):missingText}`;
    else ddSource=missingText;
    const key=`${TYPE_LABEL[type]} · ${mk}`;
    return {type,typeLabel:TYPE_LABEL[type],market:mk,key,ddModel,ddSource,
      note:type==='2step'?'alle CFD, statischer DD':null};
  }
  // Typ einer Rangliste-Zeile (aus row.P und row.market)
  function rowTypeKey(row){
    const type=row.P.mode==='instant'?'instant':(row.P.target2||0)>0?'2step':'1step';
    return `${TYPE_LABEL[type]} · ${row.market}`;
  }
  const TYPE_KEYS=['1-Step · Futures','1-Step · CFD','2-Step · CFD','Instant/Direct · Futures','Instant/Direct · CFD'];

  // ---- 3. Regelkosten ----
  const chal=P=>P.mode==='challenge';
  function dllLabel(P){
    const L=[]; if(chal(P) && P.dllEval>0) L.push(`Eval ${moneyData(P.dllEval)}`); if(P.dllFunded>0) L.push(`Funded ${moneyData(P.dllFunded)}`);
    if(P.dllScaleFunded>0) L.push(`Scaling ${dataNum(P.dllScaleFunded*100)} %`);
    return `Tageslimit (${L.join(', ')}, ${P.dllType==='hard'?'hart':'weich'})`;
  }
  function consLabel(P){
    const L=[]; if(chal(P) && P.consEval>0) L.push(`Eval ${dataNum(P.consEval)} %`); if(P.consFunded>0) L.push(`Funded ${dataNum(P.consFunded)} %`);
    return `Consistency (${L.join(', ')})`;
  }
  function daysLabel(P){
    const L=[], w=(n,x)=>`${n} Gewinntage ${x>0?'≥ '+moneyData(x):'> 0 $'}`;
    if(chal(P) && P.evalMinDays>0) L.push(`Eval ${P.evalMinDays} Handelstage`);
    if(chal(P) && P.evalWinDays>0) L.push(`Eval ${w(P.evalWinDays,P.evalWinDayMin)}`);
    if(P.payMinDays>0) L.push(`${P.payMinDays} Handelstage je Zyklus`);
    if(P.payWinDays>0) L.push(`${w(P.payWinDays,P.payWinDayMin)} je Zyklus`);
    return `Tage-Regeln (${L.join(', ')})`;
  }
  function calLabel(P){
    const L=[]; if(P.payFirstAfterCal>0) L.push(`1. Auszahlung frühestens nach ${P.payFirstAfterCal} Kalendertagen`); if(P.payEveryCal>0) L.push(`danach alle ${P.payEveryCal}`);
    return `Kalender (${L.join(', ')})`;
  }
  const capLabel=(P,o)=>{ const m=proxyCap(o); return m?`Cap ${moneyData(P.cap)} (${proxyText(m)})`:`Cap ${moneyData(P.cap)} je Auszahlung`; };

  // Regelgruppen: aktiv, Abschaltfelder, Etikett. Monatsabo ohne zweiten Lauf (exakt aus feesPaid).
  const GROUPS=[
    {key:'dll',label:'Tageslimit',on:P=>(chal(P) && P.dllEval>0)||P.dllFunded>0||P.dllScaleFunded>0,
      off:{dllEval:0,dllFunded:0,dllScaleFunded:0,dllScaleFrom:0},rule:dllLabel,extra:'Risiko wie im Grundlauf.'},
    {key:'cons',label:'Consistency',on:P=>(chal(P) && P.consEval>0)||P.consFunded>0,off:{consEval:0,consFunded:0},rule:consLabel},
    {key:'days',label:'Tage-Regeln',on:P=>(chal(P) && (P.evalMinDays>0||P.evalWinDays>0))||P.payMinDays>0||P.payWinDays>0,
      off:{evalMinDays:0,evalWinDays:0,evalWinDayMin:0,payMinDays:0,payWinDays:0,payWinDayMin:0},rule:daysLabel},
    {key:'cal',label:'Kalender',on:P=>P.payFirstAfterCal>0||P.payEveryCal>0,off:{payFirstAfterCal:0,payEveryCal:0},rule:calLabel},
    {key:'cap',label:'Cap',on:P=>typeof P.cap==='number' && P.cap<NO_CAP,off:{cap:NO_CAP},rule:capLabel},
    {key:'fee',label:'Monatsabo',on:P=>chal(P) && P.feeMonthly>0,exact:true,rule:P=>`Monatsabo (${moneyData(P.feeMonthly)} je weitere 30 Kalendertage)`}
  ];
  const STATE={same:'wirkt nicht (identisch)',none:'bindet nicht messbar',binds:'bindet'};

  function stripUi(ui){ const own={}; for(const k in (ui||{})) if(!RANK_KEYS.includes(k)) own[k]=ui[k]; return own; }

  // Ein Lauf: Rangliste-Zeile (gleiche Rechnung wie rank.js) plus Account-Liste für den gepaarten Vergleich
  function run(offer,P,seed,deps){
    const R=deps.simulate(deps.prepare(P),seed);
    return {row:deps.rank.rowFromResult(offer,P,R,{}),list:R.list};
  }
  // Felder einer Account-Zeile, die für „identisch“ übereinstimmen müssen
  const SAME_KEYS=['res','trades','days','daysToFirstPay','nPay','pay','netNo','calDays','calToFirstPay','feesPaid'];
  const paid=x=>x.nPay>0?1:0;

  // Gruppe gegen den Grundlauf: Δ = Netto ohne Regel − Netto mit Regel, 95-%-Spanne gepaart je Account.
  // Gleicher Seed und gleiche Account-Reihenfolge: Account i beider Läufe ist ein Paar. Weichen die Läufe früh voneinander ab,
  // ist die gepaarte Spanne praktisch gleich der ungepaarten (M-016a-Prüfung); bei fast gleichen Läufen ist sie enger und richtig.
  function compare(b,a,ci95){
    const B=b.list, A=a.list, n=B.length;
    let nDiff=0, money=true;
    for(let i=0;i<n;i++){
      if(SAME_KEYS.some(k=>A[i][k]!==B[i][k])) nDiff++;
      if(A[i].netNo!==B[i].netNo || A[i].nPay!==B[i].nPay) money=false;
    }
    const same=nDiff===0;
    const dn=ci95(B.map((x,i)=>A[i].netNo-x.netNo)), dp=ci95(B.map((x,i)=>paid(A[i])-paid(x)));
    const d=money?0:dn.mean, half=money?0:dn.half, dPay=money?0:dp.mean, payHalf=money?0:dp.half;
    const lo=d-half, hi=d+half, payLo=dPay-payHalf, payHi=dPay+payHalf;
    const state=same?'same':(money || (lo<=0 && hi>=0))?'none':'binds';
    // Geld identisch, nur die Zeit verschiebt sich (z. B. Kalender mit Pause)
    const timeOnly=money && !same;
    const br=b.row, ar=a.row;
    return {d,lo,hi,half,state,stateText:STATE[state]+(timeOnly?' (nur Zeit)':''),moneyIdentical:money,timeOnly,nDiff,n,
      dPay,payLo,payHi,payBinds:!(payLo<=0 && payHi>=0),
      dDays:ar.days!==null && br.days!==null?ar.days-br.days:null,
      dCalDays:ar.calDays!==null && br.calDays!==null?ar.calDays-br.calDays:null};
  }

  // maxp ist eine Modellannahme, wenn die note es „Konvention“ nennt oder rules.maxPayouts keinen Wert hat
  function maxpConvention(o){
    const r=o.rules||{};
    return /maxp \d+:?[^.]*Konvention/.test(o.note||'') || r.maxPayouts===undefined || r.maxPayouts===null;
  }
  const CONTROL_MAXP=1000;

  // ruleCostsSteps(offer, ui, deps, row?): deps = {simulate, prepare, autoParams, rank}. Generator (M-016b): yield nach jedem
  // simulate-Aufruf, damit die Oberfläche je Lauf ein Häppchen rechnen kann; der Rückgabewert ist das Ergebnis von ruleCosts.
  // row = Rangliste-Zeile mit gleichem ui und Seed: P kommt aus row.P, der Grundlauf wird für die Account-Liste wiederholt und muss row.net treffen.
  function* ruleCostsSteps(offer,ui,deps,row){
    ui=ui||{};
    const seed=ui.seed!==undefined?ui.seed:SEED;
    const P=row?row.P:deps.autoParams(offer,stripUi(ui));
    if(P.notTradable || (row && (row.net===null || row.error))) return null;
    const b=run(offer,P,seed,deps), base=b.row; yield;
    if(row && base.net!==row.net) throw new Error(`Grundlauf ${offer.id}: Netto ${base.net} ≠ Rangliste ${row.net} (ui oder Seed verschieden)`);
    const conv=maxpConvention(offer), ci95=deps.rank.ci95;
    let bCtl=null;   // Grundlauf mit maxp 1000, nur bei Bedarf
    const groups=[];
    for(const G of GROUPS){
      if(!G.on(P)) continue;
      let c;
      if(G.exact){
        // Gebühren ändern keine Trades: Δ Netto = Ø feesPaid − (fee + Aktivierung bei Bestehen), exakt
        const offFees=P.fee+(P.feeActivation||0)*(base.pass||0);
        const d=base.feesMean!==null && base.feesMean!==undefined?base.feesMean-offFees:0;
        c={d,lo:d,hi:d,half:0,state:d!==0?'binds':'same',stateText:STATE[d!==0?'binds':'same'],moneyIdentical:d===0,exact:true,
          dPay:0,payLo:0,payHi:0,payBinds:false,dDays:0,dCalDays:0};
      } else {
        const a=run(offer,Object.assign({},P,G.off),seed,deps); yield;
        c=compare(b,a,ci95); c.off=G.off;
        // Negatives Δ und maxp nur Konvention: Kontrolllauf mit und ohne Regel, beide mit maxp 1000
        if(c.state==='binds' && c.d<0 && conv){
          if(!bCtl){ bCtl=run(offer,Object.assign({},P,{maxp:CONTROL_MAXP}),seed,deps); yield; }
          const aCtl=run(offer,Object.assign({},P,G.off,{maxp:CONTROL_MAXP}),seed,deps); yield;
          const k=compare(bCtl,aCtl,ci95);
          c.control={maxp:CONTROL_MAXP,d:k.d,lo:k.lo,hi:k.hi,state:k.state,dPay:k.dPay};
          // kippt das Vorzeichen oder schließt die Spanne 0 ein, folgt das negative Δ aus der Annahme maxp
          c.maxpArtifact=!(k.state==='binds' && k.d<0);
        }
      }
      groups.push(Object.assign({key:G.key,label:G.label,rule:G.rule(P,offer),analysis:ANALYSIS+(G.extra?' '+G.extra:'')},c));
    }
    const pos=groups.filter(g=>g.state==='binds' && g.d>0).sort((a,b)=>b.d-a.d);
    const neg=groups.filter(g=>g.state==='binds' && g.d<0 && !g.maxpArtifact).sort((a,b)=>a.d-b.d);
    const art=groups.filter(g=>g.maxpArtifact).sort((a,b)=>a.d-b.d);
    return {id:offer.id,seed,n:base.n,maxp:P.maxp,maxpConvention:conv,
      base:{net:base.net,netLo:base.netLo,netHi:base.netHi,payout:base.payout,days:base.days,calDays:base.calDays,feesMean:base.feesMean},
      groups,costliest:pos.length?pos[0].key:null,mostNegative:neg.length?neg[0].key:null,maxpArtifact:art.length?art[0].key:null};
  }
  // ruleCosts: Generator in einem Zug leer laufen lassen
  function ruleCosts(offer,ui,deps,row){
    const it=ruleCostsSteps(offer,ui,deps,row);
    let r=it.next(); while(!r.done) r=it.next();
    return r.value;
  }

  // Kosten für alle handelbaren Zeilen einer Rangliste (offers = OFFERS-Gruppen oder flache Liste)
  function ruleCostsForRows(offers,rows,ui,deps){
    const byId={};
    for(const x of offers){ if(x && Array.isArray(x.items)) for(const o of x.items) byId[o.id]=o; else byId[x.id]=x; }
    const out={};
    for(const r of rows) if(r.net!==null && !r.error && byId[r.id]) out[r.id]=ruleCosts(byId[r.id],ui,deps,r);
    return out;
  }

  // ---- 4. Eignung ----
  // Platz-Spanne nach Netto je 1.000 $ DD aus der 95-%-Spanne: bester Platz = 1 + Zeilen, die sicher besser sind; schlechtester = N − Zeilen, die sicher schlechter sind
  const k1=r=>({k:r.netPer1k,lo:r.netLo/r.P.dd*1000,hi:r.netHi/r.P.dd*1000});
  const tradable=r=>r && typeof r.net==='number' && !r.error && !r.notTradable;
  function placeOf(row,rows){
    const R=rows.filter(tradable); if(!R.some(r=>r.id===row.id)) R.push(row);
    const me=k1(row), K=R.map(k1), n=R.length;
    const best=1+K.filter(x=>x.lo>me.hi).length, worst=n-K.filter(x=>x.hi<me.lo).length;
    return {best,worst,n,k:me.k,kLo:me.lo,kHi:me.hi};
  }
  // passt gut: netLo > 0 und schlechtester Platz ≤ N/3; passt schlecht: netHi < 0 oder bester Platz > 2N/3; sonst neutral
  function classify(row,place){
    const n=place.n;
    if(row.netHi<0) return {fit:'schlecht',why:'loses'};
    if(n>=3 && place.best>2*n/3) return {fit:'schlecht',why:'bottom'};
    if(row.netLo>0 && n>=3 && place.worst<=n/3) return {fit:'gut',why:'top'};
    return {fit:'neutral',why:'mid'};
  }
  const FIT_TEXT={gut:'passt gut',neutral:'neutral',schlecht:'passt schlecht'};

  function s1(row,place,c){
    const pl=place.best===place.worst?['Platz ',N(place.best,String(place.best),'fit.place.best')]
      :['Platz ',N(place.best,String(place.best),'fit.place.best'),' bis ',N(place.worst,String(place.worst),'fit.place.worst')];
    const net=c.why==='loses'
      ?['verliert im Mittel ',N(row.net,money(-row.net),'row.net')]
      :['im Mittel ',N(row.net,sMoney(row.net),'row.net')];
    return sentence('fit',[...pl,' von ',N(place.n,String(place.n),'fit.place.n'),' nach Netto je 1.000 $ Drawdown (',N(row.netPer1k,money(row.netPer1k),'row.netPer1k'),'), ',
      ...net,' je Account (Spanne ',N(row.netLo,money(row.netLo),'row.netLo'),' bis ',N(row.netHi,money(row.netHi),'row.netHi'),')',
      c.why==='bottom'?', sicher im unteren Drittel':'',': ',FIT_TEXT[c.fit],'.']);
  }
  // Mittlere Slippage je Verlust-Trade in $ (M-017b E8): fest slipPct, mit Ausreißern (1 − q) · slipPct + q · slipTailPct, je % von risk; aus = 0
  function slipMean(P){
    const m=P.slipMode, b=m==='fixed'?P.slipPct:m==='dist'?(1-P.slipTailProb)*P.slipPct+P.slipTailProb*P.slipTailPct:0;
    return b>0?b/100*P.risk:0;
  }
  function tradeEV(P){ const p=P.wr/100; return p*P.risk*P.rr-(1-p)*(P.risk+slipMean(P))-P.cost; }
  function s2(row){
    const P=row.P, E=tradeEV(P), ratio=P.target/P.dd;
    const parts=[(P.target2||0)>0?'Ziel Phase 1 ':'Ziel ',N(P.target,moneyData(P.target),'row.P.target'),' = ',N(ratio,dataNum(ratio),'derived'),' × Drawdown ',N(P.dd,moneyData(P.dd),'row.P.dd')];
    if((P.target2||0)>0) parts.push(', Phase 2 ',N(P.target2,moneyData(P.target2),'row.P.target2'));
    const sm=slipMean(P);
    parts.push('. Bei ',N(P.risk,moneyData(P.risk),'row.P.risk'),' Risiko, CRV ',N(P.rr,dataNum(P.rr),'row.P.rr'),sm>0?', ':' und ',N(P.cost,moneyData(P.cost),'row.P.cost'),' Kosten');
    // mit Slippage (M-016b): mittlere Slippage je Verlust-Trade nennen, sie steckt im Erwartungswert
    if(sm>0) parts.push(' und im Mittel ',N(sm,moneyData(Math.round(sm*100)/100),'derived'),' Slippage je Verlust');
    parts.push(' bringt ein Trade im Mittel ',N(E,num(E,E===Math.round(E)?0:2)+' $','derived'));
    if(E>0) parts.push(', also rund ',N(Math.ceil(P.target/E),String(Math.ceil(P.target/E)),'derived'),' Trades bis zum Ziel');
    parts.push('; bestanden haben ',N(row.pass,pctOf(row.pass),'row.pass'),' der Accounts.');
    return sentence('target',parts);
  }
  function s3(row){
    const P=row.P, sm=slipMean(P), loss=P.risk+P.cost+sm, k=Math.ceil(P.dd/loss);
    // mit Slippage (M-016b): mittlerer Verlust inkl. Slippage
    const lossS=sm>0?moneyData(Math.round(loss*100)/100):moneyData(loss);
    return sentence('losses',[N(k,String(k),'derived'),k===1?' Verlust-Trade (':' Verlust-Trades in Folge (je ',sm>0?'im Mittel ':'',N(loss,lossS,'derived'),sm>0?' inkl. Slippage':'',k===1?') erreicht':') erreichen',' den Drawdown von ',N(P.dd,moneyData(P.dd),'row.P.dd'),'.']);
  }
  // Beträge unter 10 $ mit Cent, damit fast gleiche Läufe nicht als „0 $“ erscheinen
  const mny=v=>v!==0 && Math.abs(v)<10?num(v,2)+' $':money(v);
  const sMny=v=>signed(mny(v),v);
  // nur wenige Accounts verschieden: Anzahl nennen
  const fewDiff=(g,p)=>g.nDiff!==undefined && g.nDiff>0 && g.nDiff<g.n/10
    ?[', nur ',N(g.nDiff,num(g.nDiff),p+'.nDiff'),' von ',N(g.n,num(g.n),p+'.n'),' Accounts verschieden']:[];
  function spanParts(lo,hi,p){ return [N(lo,mny(lo),p+'.lo'),' bis ',N(hi,mny(hi),p+'.hi')]; }
  function costParts(g,i){
    const p=`costs.groups.${i}`;
    const parts=[N(g.d,sMny(g.d),p+'.d'),' je Account'];
    if(g.exact) parts.push(' (exakt aus den gezahlten Gebühren)');
    else parts.push(' (Spanne ',...spanParts(g.lo,g.hi,p),...fewDiff(g,p),')');
    if(g.payBinds) parts.push(', Payout-Quote ',N(g.dPay,pp(g.dPay),p+'.dPay'),' Prozentpunkte (Spanne ',N(g.payLo,num(g.payLo*100,1),p+'.payLo'),' bis ',N(g.payHi,num(g.payHi*100,1),p+'.payHi'),')');
    return parts;
  }
  // Kontrolllauf mit maxp 1000 (beide Läufe): Δ und Spanne
  function controlParts(g,i){
    const p=`costs.groups.${i}.control`;
    return [N(g.control.d,sMny(g.control.d),p+'.d'),' je Account, Spanne ',...spanParts(g.control.lo,g.control.hi,p)];
  }
  const KEEP=['cons','cap','days','cal'];
  function s4(costs,row){
    if(!costs) return null;
    const G=costs.groups, at=k=>k?G.findIndex(g=>g.key===k):-1;
    const i=at(costs.costliest);
    if(i>=0){ const g=G[i];
      return sentence('costliest',['Am meisten kostet ',g.rule,': im Modell abgeschaltet ',...costParts(g,i),'. ',g.analysis]); }
    const j=at(costs.mostNegative);
    if(j>=0){ const g=G[j], why=KEEP.includes(g.key)?', weil der Gewinn mit der Regel länger im Konto bleibt':', mit der Regel ist das Netto im Modell höher';
      const ctl=g.control?['; das gilt auch ohne Auszahlungsgrenze: mit max. ',N(g.control.maxp,num(g.control.maxp),`costs.groups.${j}.control.maxp`),' Auszahlungen ',...controlParts(g,j)]:[];
      return sentence('negative',[g.rule,' kostet hier nichts: abgeschaltet ',...costParts(g,j),why,...ctl,'. ',g.analysis]); }
    const m=at(costs.maxpArtifact);
    if(m>=0){ const g=G[m];
      return sentence('negativeMaxp',['Der negative Wert bei ',g.rule,' (abgeschaltet ',...costParts(g,m),') folgt hier vor allem aus der Modellannahme max. ',
        N(row.P.maxp,String(row.P.maxp),'row.P.maxp'),' Auszahlungen (Konvention, keine Firmenregel): mit max. ',N(g.control.maxp,num(g.control.maxp),`costs.groups.${m}.control.maxp`),
        ' Auszahlungen ändert das Abschalten das Netto um ',...controlParts(g,m),'. Ohne die Regel werden die Auszahlungen mit kleineren Beträgen verbraucht. ',g.analysis]); }
    const parts=['Keine der ',N(G.length,String(G.length),'derived'),' geprüften Regelgruppen ändert das Netto messbar (n = ',N(row.n,num(row.n),'row.n'),')'];
    // Payout-Quote mit eigener Spanne, wenn sie 0 ausschließt (größte Änderung)
    let k=-1; G.forEach((g,x)=>{ if(g.payBinds && (k<0 || Math.abs(g.dPay)>Math.abs(G[k].dPay))) k=x; });
    if(k>=0){ const g=G[k], p=`costs.groups.${k}`;
      parts.push('; die Payout-Quote ändert sich ohne ',g.rule,' um ',N(g.dPay,pp(g.dPay),p+'.dPay'),' Prozentpunkte (Spanne ',N(g.payLo,num(g.payLo*100,1),p+'.payLo'),' bis ',N(g.payHi,num(g.payHi*100,1),p+'.payHi'),'). ',g.analysis); }
    else parts.push('.');
    return sentence('noBind',parts);
  }
  function s4d(costs,row){
    if(!costs) return null;
    const i=costs.groups.findIndex(g=>g.key==='dll' && g.state==='same'); if(i<0) return null;
    const P=row.P, L=[]; if(chal(P) && P.dllEval>0) L.push(P.dllEval); if(P.dllFunded>0) L.push(P.dllFunded);
    const sm=slipMean(P), lim=L.length?Math.min(...L):P.dllScaleFunded*P.dllScaleFrom, loss=P.risk+P.cost+sm, tpd=P.tradesPerDay||1;
    // mit Slippage (M-016b): mittlerer Verlust inkl. Slippage
    return sentence('dllSame',['Das Tageslimit von ',N(lim,moneyData(lim),'derived'),' greift bei ',N(tpd,String(tpd),'derived'),tpd===1?' Trade':' Trades',' pro Tag und ',
      sm>0?'im Mittel ':'',N(loss,sm>0?moneyData(Math.round(loss*100)/100):moneyData(loss),'derived'),sm>0?' Verlust je Trade inkl. Slippage':' Verlust je Trade',' nie (Ergebnis identisch, Drawdown ',N(P.dd,moneyData(P.dd),'row.P.dd'),').']);
  }
  function s5(costs,row,offer){
    if(!costs) return null;
    const i=costs.groups.findIndex(g=>g.key==='cap'); if(i<0) return null;
    const g=costs.groups[i], m=proxyCap(offer), P=row.P;
    const head=m?[proxyText(m),' (',N(P.cap,moneyData(P.cap),'row.P.cap'),')']:['Cap ',N(P.cap,moneyData(P.cap),'row.P.cap'),' je Auszahlung'];
    if(g.state==='same') return sentence('cap',[...head,': wirkt nicht (alle ',N(g.n,num(g.n),`costs.groups.${i}.n`),' Accounts identisch).']);
    if(g.state==='none') return sentence('cap',[...head,': bindet nicht messbar (Δ ',N(g.d,sMny(g.d),`costs.groups.${i}.d`),', Spanne ',...spanParts(g.lo,g.hi,`costs.groups.${i}`),...fewDiff(g,`costs.groups.${i}`),').']);
    return sentence('cap',[...head,m?': ohne Proxy ':': ohne Cap ',...costParts(g,i),'. ',g.analysis]);
  }
  function s6(row){
    const P=row.P;
    if(P.ddStatic) return sentence('dd',['Drawdown statisch: Die Grenze bleibt fest bei ',N(P.dd,moneyData(P.dd),'row.P.dd'),' unter dem Start.']);
    return sentence('dd',['Drawdown trailing: Die Grenze steigt mit jedem neuen Höchststand, bis sie nach ',N(P.dd,moneyData(P.dd),'row.P.dd'),' Gewinn beim Startkapital stehen bleibt.']);
  }
  function s7(row){
    const P=row.P, L=[];
    if(P.buf>0) L.push(['Puffer ',N(P.buf,moneyData(P.buf),'row.P.buf'),' vor der 1. Auszahlung']);
    L.push(['mindestens ',N(P.minp,moneyData(P.minp),'row.P.minp'),' Gewinn je Auszahlung']);
    if(P.consFunded>0) L.push(['Consistency ',N(P.consFunded,dataNum(P.consFunded)+' %','row.P.consFunded')]);
    if(P.dllFunded>0) L.push(['Tageslimit ',N(P.dllFunded,moneyData(P.dllFunded),'row.P.dllFunded')]);
    if(P.payMinDays>0) L.push([N(P.payMinDays,String(P.payMinDays),'row.P.payMinDays'),' Handelstage je Zyklus']);
    if(P.payWinDays>0) L.push([N(P.payWinDays,String(P.payWinDays),'row.P.payWinDays'),' Gewinntage je Zyklus']);
    if(P.payFirstAfterCal>0) L.push(['1. Auszahlung frühestens nach ',N(P.payFirstAfterCal,String(P.payFirstAfterCal),'row.P.payFirstAfterCal'),' Kalendertagen']);
    const parts=['Kein Pass nötig (Fee ',N(row.fee,moneyData(row.fee),'row.fee'),'). Dafür gelten im Funded: '];
    L.forEach((x,i)=>{ if(i) parts.push(i===L.length-1?' und ':', '); parts.push(...x); });
    parts.push('.');
    return sentence('instant',parts);
  }
  function s8(row){
    if(!row.payout) return sentence('payout',['Kein Account zahlt aus (n = ',N(row.n,num(row.n),'row.n'),').']);
    const parts=[N(row.payout,pctOf(row.payout),'row.payout'),' der Accounts zahlen mindestens einmal aus, im Mittel an Handelstag ',N(row.days,num(row.days),'row.days')];
    if(row.calDays!==null && row.calDays!==undefined) parts.push(' (Kalendertag ',N(row.calDays,num(row.calDays),'row.calDays'),')');
    parts.push(', gemittelt über die auszahlenden Accounts.');
    return sentence('payout',parts);
  }

  // strategyFit(offer, ui, row, costs, rows): rows = die gerade gezeigten (gefilterten) Zeilen der Rangliste
  function strategyFit(offer,ui,row,costs,rows){
    if(!tradable(row)){
      const t=row.reason||row.error||'Nicht handelbar.';
      return {fit:'nicht handelbar',fitText:'nicht handelbar',place:null,reasons:[sentence('notTradable',[t])],more:[],disclaimer:DISCLAIMER};
    }
    const place=placeOf(row,rows||[row]), c=classify(row,place);
    const instant=row.P.mode==='instant';
    const capS=s5(costs,row,offer);
    const reasons=[s1(row,place,c),instant?s7(row):s2(row),s3(row),s4(costs,row),capS||s6(row)].filter(Boolean);
    const more=[capS?s6(row):null,s8(row),s4d(costs,row)].filter(Boolean);
    return {fit:c.fit,fitText:FIT_TEXT[c.fit],why:c.why,place,reasons,more,disclaimer:DISCLAIMER};
  }

  // ---- 5. Zusammenfassung je Challenge-Typ ----
  function median(xs){
    if(!xs.length) return null;
    const s=xs.slice().sort((a,b)=>a-b), m=s.length>>1;
    return s.length%2?s[m]:(s[m-1]+s[m])/2;
  }
  const GROUP_LABEL=Object.fromEntries(GROUPS.map(g=>[g.key,g.label]));

  function typeSummary(rows,costsByOffer){
    const R=rows.filter(tradable);
    const all=median(R.map(r=>r.netPer1k));
    const fits=Object.fromEntries(R.map(r=>[r.id,classify(r,placeOf(r,R)).fit]));
    const types=[];
    for(const key of TYPE_KEYS){
      const T=R.filter(r=>rowTypeKey(r)===key); if(!T.length) continue;
      const med=median(T.map(r=>r.netPer1k)), medNet=median(T.map(r=>r.net)), medPay=median(T.map(r=>r.payout));
      let best=T[0]; for(const r of T) if(r.netPer1k>best.netPer1k || (r.netPer1k===best.netPer1k && r.id<best.id)) best=r;
      const b=k1(best), ties=T.filter(r=>r!==best && k1(r).hi>=b.lo).length;
      const good=T.filter(r=>fits[r.id]==='gut').length;
      const is2=key.startsWith('2-Step');
      const label=key+(is2?' (alle CFD, statischer DD)':'');
      const sentences=[];
      sentences.push(sentence('typeFit',[label,med>all?' passt besser zu deiner Strategie als der Schnitt':' passt schlechter zu deiner Strategie als der Schnitt',
        ': Median ',N(med,money(med),'type.medianPer1k'),' je 1.000 $ Drawdown gegenüber ',N(all,money(all),'summary.medianPer1k'),' über alle ',
        N(R.length,String(R.length),'summary.n'),' Angebote; ',N(good,String(good),'type.good'),' von ',N(T.length,String(T.length),'type.n'),' Angeboten passen gut.']));
      sentences.push(sentence('typeBest',['Bestes Angebot: ',best.firm && !String(best.name).startsWith(best.firm)?best.firm+' '+best.name:best.name,' mit ',N(best.netPer1k,money(best.netPer1k),'type.best.netPer1k'),' je 1.000 $ Drawdown',
        ...(ties?[', ',N(ties,String(ties),'type.best.ties'),ties===1?' weiteres gleichauf':' weitere gleichauf']:[]),
        '; Median ',N(medNet,sMoney(medNet),'type.medianNet'),' je Account, Payout-Quote ',N(medPay,pctOf(medPay),'type.medianPayout'),'.']));
      let costliest=null;
      if(costsByOffer){
        // none: keine Gruppe bindet; negative: nur eine Regel bindet, die im Modell mehr Netto bringt
        // maxpModel: negatives Δ nur wegen der Modellannahme maxp (Kontrolllauf), zählt nicht als „mehr Netto“
        const counts={}, negCounts={}; let none=0, negative=0, maxpModel=0, seen=0;
        for(const r of T){ const c=costsByOffer[r.id]; if(!c) continue; seen++;
          if(c.costliest) counts[c.costliest]=(counts[c.costliest]||0)+1;
          else if(c.mostNegative){ negative++; negCounts[c.mostNegative]=(negCounts[c.mostNegative]||0)+1; }
          else if(c.maxpArtifact) maxpModel++;
          else none++; }
        const topOf=m=>Object.entries(m).sort((a,b)=>b[1]-a[1]||(a[0]<b[0]?-1:1))[0]||null;
        const top=topOf(counts), negTop=topOf(negCounts);
        costliest={counts,none,negative,negCounts,maxpModel,n:seen,top:top?top[0]:null,topCount:top?top[1]:0,negTop:negTop?negTop[0]:null};
        const cnt=(v,src)=>[N(v,String(v),src),v===1?' Angebot':' Angeboten'];
        const parts=['Bei ',N(none,String(none),'type.costliest.none'),' von ',N(seen,String(seen),'type.costliest.n'),' Angeboten bindet keine Regel messbar'];
        if(negative) parts.push('; bei ',...cnt(negative,'type.costliest.negative'),' bringt eine Regel im Modell mehr Netto (am häufigsten ',GROUP_LABEL[negTop[0]],')');
        if(maxpModel) parts.push('; bei ',...cnt(maxpModel,'type.costliest.maxpModel'),' folgt ein negativer Wert aus der Modellannahme max. Auszahlungen (Konvention)');
        if(top) parts.push('; die teuerste Regel ist am häufigsten ',GROUP_LABEL[top[0]],' (',N(top[1],String(top[1]),'type.costliest.topCount'),top[1]===1?' Angebot)':' Angebote)');
        parts.push('.');
        sentences.push(sentence('typeCost',parts));
      }
      types.push({key,label,n:T.length,medianNet:medNet,medianPayout:medPay,medianPer1k:med,good,
        best:{id:best.id,name:best.name,netPer1k:best.netPer1k,ties},costliest,sentences});
    }
    return {n:R.length,medianPer1k:all,types,disclaimer:DISCLAIMER};
  }

  const api={ruleSheet,challengeType,ruleCosts,ruleCostsSteps,ruleCostsForRows,slipMean,strategyFit,typeSummary,
    placeOf,classify,splitNote,rawKeyGroups,rowTypeKey,proxyCap,maxpConvention,
    SHEET,REST_KEYS,GROUPS,PROXY_CAPS,TYPE_KEYS,DISCLAIMER,ANALYSIS,STATE};
  if(typeof module!=='undefined' && module.exports) module.exports=api; else root.GlitchExplain=api;
})(typeof self!=='undefined'?self:this);
