/* Glitch-Simulator – Tracker für eigene Prop-Accounts (M-028a).
   Hand-Buchungen je Tag, Regelauswertung aus dem Regelschnappschuss des Angebots, Datenmodell mit Version, Export/Import, Speicher-Hülle.
   DOM-frei und ohne Zeitabfrage: „heute“ kommt immer als Parameter. Node: module.exports, Browser: globales GlitchTracker.
   Grenze: nur Prop-Accounts, keine Kopplung von Konten, keine Anbindung an Broker oder Schnittstellen, keine Automatisierung. */
(function(root){
  'use strict';

  const APP='mepfc-tracker', VERSION=1, STORE_KEY='mepfc-tracker';
  const NOSAVE='Speichern im Browser nicht möglich. Der Stand wird nicht gespeichert, bitte exportieren.';
  const BROKEN='Der gespeicherte Stand im Browser ist beschädigt und wurde nicht geladen. Er bleibt unverändert, bis du importierst oder neu beginnst.';
  const PHASES=['step1','step2','funded'];
  const STATUS=['aktiv','bestanden','verloren','beendet'];
  const STATE_WORD={red:'gebrochen',yellow:'Achtung',green:'OK',grey:'nicht prüfbar',info:'Hinweis'};
  const RANK={red:3,yellow:2,green:1,grey:0,info:0};

  /* ---------- Zahlen und Datum ---------- */
  const nf=new Intl.NumberFormat('de-DE',{minimumFractionDigits:0,maximumFractionDigits:2});
  const nf0=new Intl.NumberFormat('de-DE',{maximumFractionDigits:0});
  const c=x=>Math.round(x*100);                 // $ → Cent
  const d=x=>x/100;                             // Cent → $
  const minus=s=>s.replace('-','−');
  const usd=x=>minus(nf.format(x))+' $';
  const usdS=x=>(x>0?'+':'')+usd(x);
  const pct=x=>minus(nf0.format(x))+' %';

  // Deutsche Zahleneingabe: „1.234,50“, „−200“, „1234.5“; leer oder ungültig = NaN
  function parseDe(s){
    if(typeof s==='number') return Number.isFinite(s)?s:NaN;
    let t=String(s===null||s===undefined?'':s).trim().replace(/[\s $]/g,'').replace(/[−–]/g,'-');
    if(!t) return NaN;
    if(t.includes(',')) t=t.replace(/\./g,'').replace(',','.');
    else if(/^-?\d{1,3}(\.\d{3})+$/.test(t)) t=t.replace(/\./g,'');
    if(!/^[+-]?\d+(\.\d+)?$/.test(t)) return NaN;
    return Number(t);
  }

  const ISO=/^(\d{4})-(\d{2})-(\d{2})$/;
  function validIso(s){
    const m=ISO.exec(s||''); if(!m) return false;
    const t=Date.UTC(+m[1],+m[2]-1,+m[3]); const x=new Date(t);
    return x.getUTCFullYear()===+m[1] && x.getUTCMonth()===+m[2]-1 && x.getUTCDate()===+m[3];
  }
  const dayNum=s=>{ const m=ISO.exec(s); return Date.UTC(+m[1],+m[2]-1,+m[3])/864e5; };
  const isoOf=n=>new Date(n*864e5).toISOString().slice(0,10);
  const addDays=(s,k)=>isoOf(dayNum(s)+k);
  const daysBetween=(a,b)=>dayNum(b)-dayNum(a);
  const deDate=s=>{ const m=ISO.exec(s||''); return m?`${m[3]}.${m[2]}.${m[1]}`:'–'; };

  /* ---------- Regeln aus dem Angebot ---------- */
  function offerSize(o){
    if(o.rules && typeof o.rules.size==='number') return o.rules.size;
    const m=/-(\d+(?:\.\d+)?)$/.exec(o.id||''); return m?Math.round(+m[1]*1000):0;
  }

  // Zuordnung Rohwert rules.mllType* → DD-Art im Tracker (Firmenregel, nicht die Modellannahme des Kerns)
  const MLL_KINDS={
    'eod-trailing-lock-start':{kind:'eod',lock:0},
    'eod-trailing-lock-start100':{kind:'eod',lock:100},
    'intraday-trailing-lock-start100':{kind:'intraday',lock:100},
    'trailing-hwm-lock-start':{kind:'intraday',lock:0},
    'trailing-hwm-close-lock-start':{kind:'eod',lock:0},
    'eod-trailing':{kind:'eod',lock:null},          // Lock aus dem Text in rules.mllLock (Blue Guardian Futures)
    'static':{kind:'static',lock:0}
  };
  const KIND_TEXT={static:'statisch',eod:'trailing auf Schlussstand (EOD)',intraday:'trailing intraday'};

  function ddKind(o,phase){
    const r=o.rules||{}, size=offerSize(o);
    const raw=phase==='funded'?(r.mllTypeFunded!==undefined?r.mllTypeFunded:r.mllType):(r.mllTypeEval!==undefined?r.mllTypeEval:r.mllType);
    const dd=phase==='funded'?(typeof r.mllFunded==='number'?r.mllFunded:o.dd):(typeof r.mllEval==='number'?r.mllEval:o.dd);
    if(raw && MLL_KINDS[raw]){
      const k=MLL_KINDS[raw]; let lock=k.lock, assumed=false;
      if(lock===null){ const m=/Start \+ (\d+)/.exec(typeof r.mllLock==='string'?r.mllLock:''); lock=m?+m[1]:0; assumed=!m; }
      return {kind:k.kind,lock,dd,source:'rules.'+(phase==='funded'&&r.mllTypeFunded!==undefined?'mllTypeFunded':phase!=='funded'&&r.mllTypeEval!==undefined?'mllTypeEval':'mllType'),assumed};
    }
    if(typeof r.mllLock==='number') return {kind:'eod',lock:r.mllLock-size,dd,source:'rules.mllLock',assumed:false};
    if(o.ddStatic) return {kind:'static',lock:0,dd,source:'ddStatic',assumed:false};
    return {kind:'intraday',lock:0,dd,source:null,assumed:true};   // unbekannt: strengste Art
  }

  // Tageswechsel (E6): aus rules, wo vorhanden, sonst Kalendertag als Annahme
  function dayBoundary(r){
    const src=r && typeof r.dailyDdBase==='string'?r.dailyDdBase:'';
    const m=/(\d{1,2}:\d{2})\s*(EST|ET|CET|CEST|UTC|GMT)/.exec(src);
    if(m) return {time:m[1],tz:m[2],assumed:false,text:`Tageswechsel ${m[1]} ${m[2]} laut Regeln der Firma. Buche Trades nach dieser Uhrzeit auf den Folgetag.`};
    return {time:null,tz:null,assumed:true,text:'Tageswechsel nicht belegt, Kalendertag angenommen.'};
  }

  const SNAP_KEYS=['mode','size','target','target2','dd','ddStatic','buf','minp','wfrac','cap','split','maxp',
    'dllEval','dllFunded','dllType','dllScaleFunded','dllScaleFrom','consEval','consFunded','consFundedMode',
    'evalMinDays','evalWinDays','evalWinDayMin','payMinDays','payWinDays','payWinDayMin','payFirstAfterCal','payEveryCal',
    'feeMonthly','shield','shieldSplit','shieldStrikes'];
  const LABELS={mode:'Account-Art',size:'Kontogröße',target:'Ziel Phase 1',target2:'Ziel Phase 2',dd:'Drawdown',ddStatic:'Drawdown statisch',
    buf:'Puffer',minp:'Mindestgewinn für Auszahlung',wfrac:'Auszahlbarer Anteil',cap:'Cap je Auszahlung',split:'Split',maxp:'Max. Auszahlungen',
    dllEval:'Tageslimit Challenge',dllFunded:'Tageslimit Funded',dllType:'Art des Tageslimits',dllScaleFunded:'Tageslimit-Scaling',dllScaleFrom:'Scaling ab',
    consEval:'Consistency Challenge',consFunded:'Consistency Funded',consFundedMode:'Consistency-Bezug Funded',
    evalMinDays:'Mindest-Handelstage Challenge',evalWinDays:'Gewinntage Challenge',evalWinDayMin:'Gewinntag-Schwelle Challenge',
    payMinDays:'Mindest-Handelstage je Auszahlung',payWinDays:'Gewinntage je Auszahlung',payWinDayMin:'Gewinntag-Schwelle je Auszahlung',
    payFirstAfterCal:'Wartezeit 1. Auszahlung',payEveryCal:'Auszahlungsrhythmus',feeMonthly:'Monatsgebühr',
    shield:'Guardian Shield / Max Risk',shieldSplit:'Split nach Shield-Bruch',shieldStrikes:'Shield-Brüche bis zum Ende',
    ddEval:'Drawdown-Art Challenge',ddFunded:'Drawdown-Art Funded',fixedAfterPayout:'Grenze fest nach Auszahlung',
    maxReqPerMonth:'Max. Anträge pro Monat',inactivityDays:'Inaktivität',payHours:'Wartezeit in Stunden',dayBoundary:'Tageswechsel',
    maxpConvention:'Max. Auszahlungen als Konvention',capNote:'Cap-Kennzeichnung'};

  // Schnappschuss beim Anlegen (Regeln zum Kaufzeitpunkt). explain = GlitchExplain (maxpConvention, proxyCap), optional.
  function snapshotRules(o,explain){
    const r=o.rules||{}, s={};
    for(const k of SNAP_KEYS) s[k]=o[k]===undefined?(k==='mode'?'challenge':k==='ddStatic'?false:k==='dllType'?'soft':k==='consFundedMode'?'cycle':0):o[k];
    s.size=offerSize(o);
    s.ddEval=ddKind(o,'step1'); s.ddFunded=ddKind(o,'funded');
    s.fixedAfterPayout=r.mllFixedAfterFirstPayout===true || r.mllStaticAfterFirstPayout===true || (typeof r.mllLock==='string' && /Auszahlung/.test(r.mllLock));
    s.maxReqPerMonth=typeof r.maxReqPerMonth==='number'?r.maxReqPerMonth:0;
    s.inactivityDays=typeof r.inactivityDays==='number'?r.inactivityDays:0;
    s.payHours=typeof r.firstPayoutAfterHours==='number'?r.firstPayoutAfterHours:0;
    s.dayBoundary=dayBoundary(r);
    s.maxpConvention=explain && explain.maxpConvention?!!explain.maxpConvention(o):false;
    const proxy=explain && explain.proxyCap?explain.proxyCap(o):null;
    s.capNote=proxy?'Modellwert: '+proxy:(s.cap>=100000?'Konvention: kein Cap':null);
    return s;
  }

  // Eigene Regeln ohne Angebot: fehlende Regel = 0 = keine Regel (wie im Kern)
  function customRules(u){
    u=u||{};
    const num=(k,def)=>{ const v=typeof u[k]==='number'?u[k]:parseDe(u[k]); return Number.isFinite(v)?v:def; };
    const s={};
    for(const k of SNAP_KEYS) s[k]=0;
    Object.assign(s,{mode:u.mode==='instant'?'instant':'challenge',size:num('size',0),target:num('target',0),target2:num('target2',0),dd:num('dd',0),
      ddStatic:u.ddKind==='static',buf:num('buf',0),minp:num('minp',0),wfrac:num('wfrac',100),cap:num('cap',100000),split:num('split',100),maxp:num('maxp',0),
      dllEval:num('dllEval',0),dllFunded:num('dllFunded',0),dllType:u.dllType==='hard'?'hard':'soft',consEval:num('consEval',0),consFunded:num('consFunded',0),
      consFundedMode:'cycle',shieldSplit:50,shieldStrikes:2});
    const kind=['static','eod','intraday'].includes(u.ddKind)?u.ddKind:'intraday';
    const dk={kind,lock:kind==='static'?0:num('lock',0),dd:s.dd,source:'eigene Regeln',assumed:false};
    s.ddEval=Object.assign({},dk); s.ddFunded=Object.assign({},dk);
    Object.assign(s,{fixedAfterPayout:false,maxReqPerMonth:0,inactivityDays:0,payHours:0,dayBoundary:dayBoundary(null),maxpConvention:false,
      capNote:s.cap>=100000?'Konvention: kein Cap':null});
    return s;
  }

  // Unterschied zwischen gespeichertem Schnappschuss und aktuellem Angebot
  function rulesDiff(a,b){
    const out=[];
    for(const k of Object.keys(LABELS)){
      const x=JSON.stringify(a?a[k]:undefined), y=JSON.stringify(b?b[k]:undefined);
      if(x!==y) out.push({key:k,label:LABELS[k],from:a?a[k]:undefined,to:b?b[k]:undefined});
    }
    return out;
  }

  /* ---------- Datenmodell ---------- */
  const emptyState=()=>({app:APP,version:VERSION,accounts:[]});

  function newAccount(f){
    const rules=f.rules;
    const start=f.start||f.buyDate;
    return {id:f.id,name:f.name||'',note:f.note||'',offerId:f.offerId||null,offerAsof:f.offerAsof||null,rules,
      buyDate:f.buyDate,feePaid:+f.feePaid||0,
      phases:[{phase:rules.mode==='instant'?'funded':'step1',start,startBalance:f.startBalance!==undefined?f.startBalance:rules.size}],
      status:'aktiv',days:[],payouts:[],costs:[],firmFloor:null};
  }
  function newId(acc,seed){
    const used=new Set((acc||[]).map(a=>a.id));
    let i=(seed||0)%1e6, id;
    do{ id='a-'+(i++).toString(36); }while(used.has(id));
    return id;
  }

  const byDate=(a,b)=>a.date<b.date?-1:a.date>b.date?1:0;
  // Index der Phase, in deren Zeitraum das Datum fällt (letzte Phase mit Start ≤ Datum); vor der ersten Phase: 0
  function phaseIndex(acc,date){
    let k=0;
    acc.phases.forEach((p,i)=>{ if(p.start<=date) k=i; });
    return k;
  }
  const curIndex=acc=>acc.phases.length-1;

  function upsertDay(acc,day){
    const days=acc.days.filter(x=>x.date!==day.date).concat([Object.assign({trades:null,high:null,low:null,maxTradeLoss:null},day)]).sort(byDate);
    return Object.assign({},acc,{days});
  }
  const removeDay=(acc,date)=>Object.assign({},acc,{days:acc.days.filter(x=>x.date!==date)});
  const addPayout=(acc,p)=>Object.assign({},acc,{payouts:acc.payouts.concat([p]).sort(byDate)});
  const removePayout=(acc,i)=>Object.assign({},acc,{payouts:acc.payouts.filter((_,j)=>j!==i)});
  const addCost=(acc,x)=>Object.assign({},acc,{costs:acc.costs.concat([x]).sort(byDate)});
  const removeCost=(acc,i)=>Object.assign({},acc,{costs:acc.costs.filter((_,j)=>j!==i)});
  function addPhase(acc,ph){
    if(!PHASES.includes(ph.phase)) throw new Error('Unbekannte Phase');
    return Object.assign({},acc,{phases:acc.phases.concat([{phase:ph.phase,start:ph.start,startBalance:ph.startBalance}]),firmFloor:null});
  }
  // Nächste Phase nach dem Bestehen: 2-Step → Phase 2, sonst Funded
  function nextPhase(acc){
    const p=acc.phases[curIndex(acc)].phase;
    if(p==='step1') return acc.rules.target2>0?'step2':'funded';
    if(p==='step2') return 'funded';
    return null;
  }

  /* ---------- Rechnung je Phase (in Cent) ---------- */
  function phaseCalc(acc,i){
    const ph=acc.phases[i], R=acc.rules, end=acc.phases[i+1]?acc.phases[i+1].start:null;
    const inPh=x=>x.date>=ph.start && (end===null || x.date<end);
    const days=acc.days.filter(inPh).sort(byDate), pays=acc.payouts.filter(inPh).sort(byDate);
    const funded=ph.phase==='funded';
    const K=funded?R.ddFunded:R.ddEval, dd=c(K.dd||0), lock=c(K.lock||0), start=c(ph.startBalance);
    const floorOf=p=>K.kind==='static'?-dd:Math.min(p-dd,lock);
    const dates=[...new Set(days.map(x=>x.date).concat(pays.map(x=>x.date)))].sort();
    let eq=0, peak=0, fixed=false, breach=null, lowsMissing=0, highsMissing=0, maxEod=0, prevMaxEod=0, eqAfterPay=0;
    const rows=[];
    for(const dt of dates){
      const day=days.find(x=>x.date===dt)||null, open=eq;
      const floorBefore=fixed?lock:floorOf(peak);
      let floorDay=floorBefore;
      if(day){
        const pnl=c(day.pnl);
        const hi=typeof day.high==='number'?c(day.high)-start:null, lo=typeof day.low==='number'?c(day.low)-start:null;
        eq+=pnl;
        if(lo===null) lowsMissing++;
        const low=lo!==null?Math.min(lo,eq,open):eq;
        if(K.kind==='intraday' && !fixed){
          if(hi===null) highsMissing++;
          const peakDay=Math.max(peak,hi!==null?hi:Math.max(open,eq));
          floorDay=floorOf(peakDay);       // konservativ: Tageshoch vor Tagestief angenommen
          peak=peakDay;
        }
        if(breach===null && dd>0 && low<=floorDay) breach={date:dt,low,floor:floorDay};
        if(K.kind==='eod') peak=Math.max(peak,eq);
        rows.push({date:dt,pnl,open,close:eq,low,hi,hasLow:lo!==null,floor:floorDay,dayLoss:lo!==null?Math.min(pnl,lo-open):pnl,
          trades:day.trades,maxTradeLoss:day.maxTradeLoss,dllLimit:0});
      }
      for(const p of pays.filter(x=>x.date===dt)){ eq-=c(p.amount); eqAfterPay=eq; if(R.fixedAfterPayout) fixed=true; }
      prevMaxEod=maxEod; maxEod=Math.max(maxEod,eq);
      const r=rows[rows.length-1];
      if(r && r.date===dt){ r.close=eq; r.prevMaxEod=prevMaxEod; }
    }
    const floorNow=fixed?lock:floorOf(peak);
    return {ph,i,funded,K,days,pays,rows,eq,peak,floorNow,fixed,breach,lowsMissing,highsMissing,start,dd,lock,maxEod,eqAfterPay};
  }

  // Kontostand am Ende des Vortags in der Phase des Datums (für „Kontostand statt Ergebnis“ bei der Tagesbuchung)
  function closeBefore(acc,date){
    const i=phaseIndex(acc,date), P=phaseCalc(Object.assign({},acc,{days:acc.days.filter(x=>x.date<date),payouts:acc.payouts.filter(x=>x.date<date)}),i);
    return d(P.start+P.eq);
  }

  // Tageslimit des Tages (Lucid-Scaling: höchster EOD-Gewinn bis zum Vortag, sinkt nicht nach Auszahlungen)
  function dllLimitFor(R,funded,prevMaxEod){
    const base=c((funded?R.dllFunded:R.dllEval)||0);
    if(funded && R.dllScaleFunded>0 && prevMaxEod>=c(R.dllScaleFrom)) return Math.max(base,Math.round(R.dllScaleFunded*prevMaxEod));
    return base;
  }

  const isTradingDay=x=>x.trades===null || x.trades===undefined || x.trades>=1;
  const isWinDay=(x,thr)=>thr>0?x.pnl>=c(thr):x.pnl>0;

  /* ---------- Auswertung ---------- */
  function rule(key,label,state,exact,text,o){ return Object.assign({key,label,state,word:STATE_WORD[state],exact,text,value:'',limit:'',distance:''},o||{}); }
  const PHASE_LABEL={step1:'Phase 1',step2:'Phase 2',funded:'Funded'};

  function evaluate(acc,opts){
    const today=opts.today, R=acc.rules;
    const i=curIndex(acc), P=phaseCalc(acc,i), funded=P.funded, out=[];
    const balance=d(P.start+P.eq);
    const lastPay=P.pays.length?P.pays[P.pays.length-1]:null;
    const cycleRows=funded&&lastPay?P.rows.filter(x=>x.date>lastPay.date):P.rows;
    const cycleProfit=P.eq-P.eqAfterPay;   // 1. Zyklus: gesamter Funded-Gewinn

    // Drawdown
    if(P.dd>0){
      const firm=typeof acc.firmFloor==='number'?c(acc.firmFloor)-P.start:null;
      const floor=firm!==null?firm:P.floorNow, dist=P.eq-floor;
      const est=P.K.kind==='intraday'?(P.highsMissing>0?'geschätzt':'konservativ'):(P.lowsMissing>0?'geschätzt':'exakt');
      const kindTxt=KIND_TEXT[P.K.kind]+(P.K.kind!=='static'?`, Lock bei Start${P.K.lock?' + '+usd(P.K.lock):''}`:'')+(P.fixed?', fest nach Auszahlung':'');
      let state, text;
      if(P.breach){ state='red'; text=`Drawdown-Grenze am ${deDate(P.breach.date)} erreicht (Tief ${usd(d(P.start+P.breach.low))}, Grenze ${usd(d(P.start+P.breach.floor))}).`; }
      else{
        const warn=P.K.kind==='intraday' && P.highsMissing>0?dist<P.dd:dist<P.dd*0.25;
        state=warn?'yellow':'green';
        text=`Abstand zur Grenze ${usd(d(dist))} (${kindTxt}).`;
        if(P.K.kind==='intraday' && P.highsMissing>0) text+=' Ohne Tageshoch geschätzt, die echte Grenze kann höher liegen. Trag die Grenze laut Firma ein.';
        else if(P.lowsMissing>0) text+=' Bruch nur auf Schlussständen geprüft (ohne Tagestief).';
      }
      if(firm!==null) text+=` Grenze laut Firma ${usd(d(P.start+firm))}, Tracker ${usd(d(P.start+P.floorNow))}.`;
      if(P.K.assumed) text+=' DD-Art nicht belegt, strengste Art angenommen.';
      out.push(rule('dd','Drawdown',state,firm!==null?'laut Firma':est,text,{value:usd(balance),limit:usd(d(P.start+floor)),distance:usd(d(dist))}));
    }

    // Tageslimit
    const baseDll=funded?R.dllFunded:(R.mode==='instant'?0:R.dllEval);
    if(baseDll>0){
      let hard=null, soft=0, last=null, lowsMiss=0;
      for(const r of P.rows){
        const lim=dllLimitFor(R,funded,r.prevMaxEod||0); r.dllLimit=lim;
        if(!r.hasLow) lowsMiss++;
        if(r.dayLoss<=-lim){ if(R.dllType==='hard'){ if(!hard) hard=r; } else soft++; }
        last=r;
      }
      const lim=last?last.dllLimit:c(baseDll);
      const scaled=lim>c(baseDll);
      let state='green', text=`Limit ${usd(d(lim))} je Tag (${R.dllType==='hard'?'hart: Bruch beendet den Account':'weich: Tag endet'})${scaled?', durch Scaling erhöht':''}.`;
      if(hard){ state='red'; text=`Tageslimit am ${deDate(hard.date)} gebrochen (${usd(d(hard.dayLoss))}, Limit ${usd(d(hard.dllLimit))}).`; }
      else if(last && last.date===today && last.dayLoss<=-lim){ state='yellow'; text=`Tageslimit heute erreicht (${usd(d(last.dayLoss))}). Handel erst am nächsten Handelstag.`; }
      else if(soft) text+=` Bisher an ${soft} Tag${soft>1?'en':''} erreicht.`;
      if(lowsMiss) text+=' Geprüft auf dem Tagesergebnis, ohne Tagestief geschätzt.';
      out.push(rule('dll','Tageslimit',state,lowsMiss?'geschätzt':'exakt',text,
        {value:last?usdS(d(last.dayLoss)):'–',limit:'−'+usd(d(lim)),distance:last?usd(d(last.dayLoss+lim)):usd(d(lim))}));
    }

    // Ziel, Consistency, Tage: Challenge-Phase
    let passOk=null, missing=[];
    if(!funded){
      const tgt=P.ph.phase==='step2'?R.target2:R.target;
      const conds=[];
      if(tgt>0){
        const ok=P.eq>=c(tgt); conds.push(ok);
        if(!ok) missing.push(`Ziel: es fehlen ${usd(d(c(tgt)-P.eq))}`);
        out.push(rule('target','Ziel '+PHASE_LABEL[P.ph.phase],ok?'green':'info','exakt',
          ok?`Ziel ${usd(tgt)} erreicht.`:`${pct(Math.max(0,P.eq)/c(tgt)*100)} von ${usd(tgt)} erreicht.`,
          {value:usdS(d(P.eq)),limit:usd(tgt),distance:ok?'':usd(d(c(tgt)-P.eq))}));
      }
      if(R.consEval>0) conds.push(consRule(out,missing,P.rows,P.eq,R.consEval,'Consistency Challenge','Bestehen'));
      if(R.evalMinDays>0 || R.evalWinDays>0) conds.push(daysRule(out,missing,P.rows,R.evalMinDays,R.evalWinDays,R.evalWinDayMin,'Bestehen'));
      passOk=conds.length?conds.every(Boolean):null;
      if(R.feeMonthly>0 && acc.status==='aktiv'){
        let k=1; while(addDays(acc.buyDate,30*k)<=today) k++;
        out.push(rule('fee','Monatsgebühr','info','Hinweis',`Nächste Verlängerung ${deDate(addDays(acc.buyDate,30*k))} (${usd(R.feeMonthly)}, alle 30 Tage ab Kauf).`));
      }
    }

    // Funded: Auszahlung
    let payOk=null, earliest=null, shieldHits=0;
    if(funded){
      const conds=[];
      if(R.consFunded>0){
        const rowsC=R.consFundedMode==='perpetual'?P.rows:cycleRows;
        conds.push(consRule(out,missing,rowsC,cycleProfit,R.consFunded,'Consistency Funded'+(R.consFundedMode==='perpetual'?' (alle Funded-Tage)':' (seit letzter Auszahlung)'),'Auszahlen'));
      }
      if(R.payMinDays>0 || R.payWinDays>0) conds.push(daysRule(out,missing,cycleRows,R.payMinDays,R.payWinDays,R.payWinDayMin,'Auszahlen'));
      // Schwelle buf + minp
      const thr=c(R.buf+R.minp);
      if(thr>0 || R.minp>0){
        const ok=P.eq>=thr; conds.push(ok);
        if(!ok) missing.push(`Auszahlungsschwelle: es fehlen ${usd(d(thr-P.eq))}`);
        const avail=Math.max(0,(P.eq-c(R.buf))*R.wfrac/100), amt=Math.min(c(R.cap),Math.round(avail));
        const split=shieldCount(P.rows,R)>=1?R.shieldSplit:R.split;
        let text=ok?`Schwelle ${usd(d(thr))} erreicht. Auszahlbar etwa ${usd(d(amt))}, davon ${usd(d(Math.round(amt*split/100)))} bei ${nf.format(split)} % Split.`
          :`Auszahlung ab ${usd(d(thr))} Gewinn (Puffer ${usd(R.buf)} + Mindestgewinn ${usd(R.minp)}).`;
        if(R.capNote) text+=` Cap ${usd(R.cap)}: ${R.capNote}.`;
        out.push(rule('payout','Auszahlungsschwelle',ok?'green':'info',R.capNote?(/^Modellwert/.test(R.capNote)?'Modellwert':'Konvention'):'exakt',text,{value:usdS(d(P.eq)),limit:usd(d(thr)),distance:usd(d(thr-P.eq))}));
      }
      // Kalender
      const firstTrade=P.rows.find(isTradingDay);
      const wait=lastPay?R.payEveryCal:R.payFirstAfterCal;
      if(wait>0){
        const base=lastPay?lastPay.date:(firstTrade?firstTrade.date:null);
        earliest=base?addDays(base,wait):null;
        const ok=earliest!==null && today>=earliest; conds.push(ok);
        if(!ok) missing.push(earliest?`Kalender: frühestens ${deDate(earliest)}`:'Kalender: zählt ab dem ersten Funded-Handelstag');
        const hours=!lastPay && R.payHours>0?` (${nf0.format(R.payHours)} Stunden, auf ganze Tage aufgerundet)`:'';
        out.push(rule('cal','Auszahlung frühestens',ok?'green':'info',hours?'aufgerundet':'exakt',
          earliest?`Frühester Auszahlungstag ${deDate(earliest)}: ${wait} Kalendertage nach ${lastPay?'der letzten Auszahlung':'dem ersten Funded-Handelstag'}${hours}.`
            :`${wait} Kalendertage ab dem ersten Funded-Handelstag${hours}.`,{value:earliest?deDate(earliest):'–'}));
      }
      // Max. Auszahlungen
      if(R.maxp>0){
        const n=P.pays.length, ok=n<R.maxp; conds.push(ok);
        if(!ok) missing.push('Maximum an Auszahlungen erreicht');
        out.push(rule('maxp','Auszahlungen',ok?'green':'yellow',R.maxpConvention?'Konvention':'exakt',
          `${n} von ${R.maxp}${R.maxpConvention?' (Modellannahme, die Firma nennt kein Maximum)':''}.`+(ok?'':' Laut Regel endet der Account hier oder wechselt.'),{value:String(n),limit:String(R.maxp)}));
      }
      if(R.maxReqPerMonth>0){
        const m=today.slice(0,7), n=acc.payouts.filter(p=>p.date.slice(0,7)===m).length, ok=n<R.maxReqPerMonth;
        conds.push(ok); if(!ok) missing.push('keine weiteren Anträge in diesem Monat');
        out.push(rule('req','Anträge im Monat',ok?'green':'yellow','exakt',`${n} von ${R.maxReqPerMonth} Anträgen im laufenden Kalendermonat.`,{value:String(n),limit:String(R.maxReqPerMonth)}));
      }
      payOk=conds.every(Boolean);
      if(payOk && earliest===null) earliest=today;
      // Shield
      if(R.shield>0){
        shieldHits=shieldCount(P.rows,R);
        const unknown=P.rows.filter(r=>r.pnl<0 && typeof r.maxTradeLoss!=='number').length;
        let state, text;
        if(shieldHits>=R.shieldStrikes){ state='red'; text=`${shieldHits} Bruch${shieldHits>1?'e':''} (Grenze ${usd(R.shield)} offener Verlust): Account beendet.`; }
        else if(shieldHits>0){ state='yellow'; text=`${shieldHits} Bruch, Split jetzt ${nf.format(R.shieldSplit)} %. Beim ${R.shieldStrikes}. Bruch endet der Account.`; }
        else if(unknown){ state='grey'; text=`Grenze ${usd(R.shield)} offener Verlust je Trade. An ${unknown} Verlusttag${unknown>1?'en':''} fehlt der größte Trade-Verlust, dort nicht prüfbar.`; }
        else{ state='green'; text=`Kein Trade hat ${usd(R.shield)} offenen Verlust erreicht.`; }
        out.push(rule('shield','Guardian Shield / Max Risk',state,unknown?'Hinweis':'exakt',text,{limit:usd(R.shield),value:String(shieldHits)}));
      }
    }

    // Inaktivität
    if(R.inactivityDays>0){
      const lastDay=acc.days.length?acc.days[acc.days.length-1].date:P.ph.start;
      const gap=daysBetween(lastDay,today), state=gap>R.inactivityDays?'red':gap>=R.inactivityDays-2?'yellow':'green';
      out.push(rule('inact','Inaktivität',state,'exakt',`Letzte Buchung ${deDate(lastDay)}, ${gap} Tage her. Erlaubt sind ${R.inactivityDays} Tage ohne Trade.`,{value:String(gap),limit:String(R.inactivityDays)}));
    }

    out.push(rule('day','Tageswechsel','info',R.dayBoundary.assumed?'Annahme':'exakt',R.dayBoundary.text));
    out.push(rule('other','Weitere Regeln','grey','Hinweis','News, Flat-Zeit, Wochenende, EAs, Kontrakt- und Lot-Limits und Hebel sind aus Tagesbuchungen nicht prüfbar. Siehe Regeln des Angebots.'));

    // Gesamtstatus
    const worst=out.reduce((m,r)=>RANK[r.state]>RANK[m]?r.state:m,'green');
    let headline;
    const red=out.find(r=>r.state==='red');
    if(red) headline=red.text;
    else if(!funded && passOk) headline=`${PHASE_LABEL[P.ph.phase]} bestanden. Phase wechseln, sobald die Firma es bestätigt.`;
    else if(!funded) headline=missing.length?`${PHASE_LABEL[P.ph.phase]} offen: ${missing.join('; ')}.`:`${PHASE_LABEL[P.ph.phase]} läuft.`;
    else if(payOk) headline=`Auszahlung möglich${earliest && earliest>today?' ab '+deDate(earliest):''}.`;
    else headline=`Auszahlung noch gesperrt: ${missing.join('; ')}.`;
    const yellow=out.find(r=>r.state==='yellow' && ['dd','dll','shield','inact'].includes(r.key));
    if(!red && yellow && !headline.includes(yellow.text)) headline+=' '+yellow.text;
    const lost=!!(P.breach || out.some(r=>(r.key==='dll'||r.key==='shield') && r.state==='red'));

    return {phase:P.ph.phase,phaseLabel:PHASE_LABEL[P.ph.phase],balance,profit:d(P.eq),rules:out,
      state:acc.status==='aktiv'?worst:'info',word:acc.status==='aktiv'?STATE_WORD[worst]:acc.status,headline:acc.status==='aktiv'?headline:`Status: ${acc.status}.`,
      passOk,payOk,earliest,suggestLost:acc.status==='aktiv' && lost,series:series(acc,P)};
  }

  function shieldCount(rows,R){ return R.shield>0?rows.filter(r=>typeof r.maxTradeLoss==='number' && c(r.maxTradeLoss)>=c(R.shield)).length:0; }

  // Consistency wie im Kern: bester Tag < Grenze × Gewinn, strikt
  function consRule(out,missing,rows,profit,lim,label,verb){
    const best=rows.reduce((m,r)=>Math.max(m,r.pnl),0);
    const ok=profit>0 && best<lim/100*profit;
    const share=profit>0?best/profit*100:null;
    const need=Math.floor(best*100/lim)+1;            // Gewinn, ab dem der beste Tag unter der Grenze liegt (Cent)
    if(!ok) missing.push(best>0?`Consistency: Gewinn muss über ${usd(d(need-1))} steigen`:'Consistency: noch kein Gewinntag');
    out.push(rule('cons',label,ok?'green':'yellow','exakt',
      (share===null?`Noch kein Gewinn, erlaubt ist ein bester Tag unter ${pct(lim)} des Gewinns.`:`Bester Tag ${usd(d(best))} = ${pct(share)} des Gewinns, erlaubt unter ${pct(lim)}.`)+(ok||best===0?'':` Zum ${verb} muss der Gewinn über ${usd(d(need-1))} liegen.`),
      {value:share===null?'–':pct(share),limit:'< '+pct(lim)}));
    return ok;
  }
  function daysRule(out,missing,rows,minDays,winDays,thr,verb){
    const td=rows.filter(isTradingDay).length, wd=rows.filter(r=>isWinDay(r,thr)).length;
    const okT=td>=minDays, okW=wd>=winDays, ok=okT&&okW;
    const assumed=rows.some(r=>r.trades===null || r.trades===undefined);
    const parts=[];
    if(minDays>0) parts.push(`${td} von ${minDays} Handelstagen`);
    if(winDays>0) parts.push(`${wd} von ${winDays} Gewinntagen (${thr>0?'ab '+usd(thr):'Ergebnis über 0'})`);
    if(!okT) missing.push(`es fehlen ${minDays-td} Handelstag${minDays-td>1?'e':''}`);
    if(!okW) missing.push(`es fehlen ${winDays-wd} Gewinntag${winDays-wd>1?'e':''}`);
    out.push(rule('days','Handels- und Gewinntage',ok?'green':'yellow',assumed?'Annahme':'exakt',
      parts.join(', ')+'.'+(ok?'':` Zum ${verb} fehlen noch Tage.`)+(assumed?' Tage ohne Angabe der Trades zählen als Handelstag.':''),
      {value:String(minDays>0?td:wd),limit:String(minDays>0?minDays:winDays)}));
    return ok;
  }

  // Kurve der laufenden Phase: Kontostand je Tag (nach Auszahlung), Grenze, Ziel bzw. Schwelle, Auszahlungen
  function series(acc,P){
    const R=acc.rules, s=P.start;
    const pts=[{date:P.ph.start,bal:d(s),floor:P.dd>0?d(s+(P.K.kind==='static'?-P.dd:Math.min(-P.dd,P.lock))):null}];
    for(const r of P.rows) pts.push({date:r.date,bal:d(s+r.close),floor:P.dd>0?d(s+r.floor):null});
    const tgt=P.funded?(R.buf+R.minp>0?d(s)+R.buf+R.minp:null):((P.ph.phase==='step2'?R.target2:R.target)>0?d(s)+(P.ph.phase==='step2'?R.target2:R.target):null);
    return {points:pts,target:tgt,payouts:P.pays.map(p=>({date:p.date,amount:p.amount}))};
  }

  // SVG-Pfade ohne DOM (Ausgabe als Text)
  function curveModel(ser,w,h,pad){
    pad=pad||{l:8,r:8,t:8,b:8};
    const pts=ser.points; if(!pts.length) return null;
    const vals=pts.map(p=>p.bal).concat(pts.filter(p=>p.floor!==null).map(p=>p.floor)).concat(ser.target!==null?[ser.target]:[]);
    let lo=Math.min(...vals), hi=Math.max(...vals); if(hi===lo){ hi+=1; lo-=1; }
    const X=k=>pad.l+(pts.length>1?k/(pts.length-1):0.5)*(w-pad.l-pad.r), Y=v=>pad.t+(hi-v)/(hi-lo)*(h-pad.t-pad.b);
    const f=x=>Math.round(x*10)/10;
    const step=key=>pts.map((p,k)=>p[key]===null?'':(k?`H${f(X(k))}V${f(Y(p[key]))}`:`M${f(X(k))} ${f(Y(p[key]))}`)).join('');
    const marks=ser.payouts.map(p=>{ const k=pts.findIndex(q=>q.date===p.date); return k<0?null:{x:f(X(k)),y:f(Y(pts[k].bal))}; }).filter(Boolean);
    return {bal:step('bal'),floor:pts[0].floor!==null?step('floor'):null,target:ser.target!==null?f(Y(ser.target)):null,marks,lo,hi,w,h};
  }

  /* ---------- Übersicht ---------- */
  function overview(state){
    let fees=0, pays=0; const counts={aktiv:0,bestanden:0,verloren:0,beendet:0};
    for(const a of state.accounts){
      fees+=c(a.feePaid)+a.costs.reduce((s,x)=>s+c(x.amount),0);
      pays+=a.payouts.reduce((s,p)=>s+c(p.received),0);
      counts[a.status]=(counts[a.status]||0)+1;
    }
    return {fees:d(fees),payouts:d(pays),net:d(pays-fees),counts,n:state.accounts.length};
  }

  /* ---------- Prüfung, Version, Export/Import ---------- */
  const MIGRATIONS={};   // MIGRATIONS[v](obj) hebt Version v auf v+1

  function migrate(obj){
    let o=JSON.parse(JSON.stringify(obj));
    if(typeof o.version!=='number' || !Number.isInteger(o.version) || o.version<1) throw new Error('Datei ohne gültige Version.');
    if(o.version>VERSION) throw new Error(`Datei aus einer neueren Version (${o.version}), diese Seite kennt Version ${VERSION}.`);
    while(o.version<VERSION){ o=MIGRATIONS[o.version](o); }
    for(const a of Array.isArray(o.accounts)?o.accounts:[]){
      if(a && typeof a==='object'){
        if(a.note===undefined) a.note='';
        if(a.offerId===undefined) a.offerId=null;
        if(a.offerAsof===undefined) a.offerAsof=null;
        if(a.status===undefined) a.status='aktiv';
        for(const k of ['days','payouts','costs']) if(a[k]===undefined) a[k]=[];
        if(a.firmFloor===undefined) a.firmFloor=null;
        for(const x of Array.isArray(a.days)?a.days:[]) for(const k of ['trades','high','low','maxTradeLoss']) if(x && x[k]===undefined) x[k]=null;
      }
    }
    return o;
  }

  function validate(o){
    const e=[];
    const isNum=x=>typeof x==='number' && Number.isFinite(x), optNum=x=>x===null || isNum(x);
    if(!o || typeof o!=='object') return ['Kein Tracker-Stand.'];
    if(o.app!==APP) e.push('Keine Tracker-Datei (Feld app fehlt oder ist falsch).');
    if(!Array.isArray(o.accounts)) return e.concat(['Feld accounts fehlt.']);
    const ids=new Set();
    o.accounts.forEach((a,i)=>{
      const w=`Account ${i+1}`;
      if(!a || typeof a!=='object'){ e.push(`${w}: kein Objekt.`); return; }
      if(typeof a.id!=='string' || !a.id) e.push(`${w}: id fehlt.`);
      else if(ids.has(a.id)) e.push(`${w}: id ${a.id} doppelt.`); else ids.add(a.id);
      if(typeof a.name!=='string') e.push(`${w}: Name fehlt.`);
      if(typeof a.note!=='string') e.push(`${w}: Notiz ist kein Text.`);
      if(a.offerId!==null && typeof a.offerId!=='string') e.push(`${w}: offerId ungültig.`);
      if(!a.rules || typeof a.rules!=='object' || !a.rules.ddEval || !a.rules.ddFunded || !isNum(a.rules.size)) e.push(`${w}: Regeln fehlen.`);
      if(!validIso(a.buyDate)) e.push(`${w}: Kaufdatum ungültig.`);
      if(!isNum(a.feePaid) || a.feePaid<0) e.push(`${w}: Fee ungültig.`);
      if(!STATUS.includes(a.status)) e.push(`${w}: Status ungültig.`);
      if(!optNum(a.firmFloor)) e.push(`${w}: Grenze laut Firma ungültig.`);
      if(!Array.isArray(a.phases) || !a.phases.length) e.push(`${w}: Phasen fehlen.`);
      else a.phases.forEach((p,k)=>{
        if(!p || !PHASES.includes(p.phase) || !validIso(p.start) || !isNum(p.startBalance)) e.push(`${w}, Phase ${k+1}: ungültig.`);
        else if(k && p.start<a.phases[k-1].start) e.push(`${w}, Phase ${k+1}: Start vor der vorigen Phase.`);
      });
      const dates=new Set();
      (Array.isArray(a.days)?a.days:(e.push(`${w}: Tagesbuchungen fehlen.`),[])).forEach((x,k)=>{
        if(!x || !validIso(x.date) || !isNum(x.pnl)) e.push(`${w}, Buchung ${k+1}: Datum oder Ergebnis ungültig.`);
        else{
          if(dates.has(x.date)) e.push(`${w}: zwei Buchungen am ${deDate(x.date)}.`); dates.add(x.date);
          if(!(x.trades===null || (Number.isInteger(x.trades) && x.trades>=0))) e.push(`${w}, Buchung ${deDate(x.date)}: Trades ungültig.`);
          for(const k2 of ['high','low','maxTradeLoss']) if(!optNum(x[k2])) e.push(`${w}, Buchung ${deDate(x.date)}: ${k2} ungültig.`);
        }
      });
      (Array.isArray(a.payouts)?a.payouts:(e.push(`${w}: Auszahlungen fehlen.`),[])).forEach((p,k)=>{
        if(!p || !validIso(p.date) || !isNum(p.amount) || p.amount<0 || !isNum(p.received) || p.received<0) e.push(`${w}, Auszahlung ${k+1}: ungültig.`);
      });
      (Array.isArray(a.costs)?a.costs:(e.push(`${w}: Kosten fehlen.`),[])).forEach((x,k)=>{
        if(!x || !validIso(x.date) || !isNum(x.amount) || x.amount<0 || typeof x.text!=='string') e.push(`${w}, Kosten ${k+1}: ungültig.`);
      });
    });
    return e;
  }

  function exportJson(state,nowIso){
    return JSON.stringify(Object.assign({},state,{app:APP,version:VERSION,exported:nowIso||null}),null,2);
  }
  const exportName=today=>`mepfc-tracker-${today}.json`;

  // Import ersetzt den ganzen Stand (E2). Bei Fehlern: ok false, state null, der alte Stand bleibt beim Aufrufer.
  function importJson(text){
    let o;
    try{ o=JSON.parse(text); }catch(_){ return {ok:false,state:null,errors:['Die Datei ist kein gültiges JSON.']}; }
    if(!o || typeof o!=='object' || Array.isArray(o)) return {ok:false,state:null,errors:['Kein Tracker-Stand.']};
    if(o.app!==APP) return {ok:false,state:null,errors:['Keine Tracker-Datei (Feld app fehlt oder ist falsch).']};
    try{ o=migrate(o); }catch(err){ return {ok:false,state:null,errors:[err.message]}; }
    delete o.exported;
    const errors=validate(o);
    return errors.length?{ok:false,state:null,errors}:{ok:true,state:o,errors:[]};
  }
  const confirmText=(cur,next)=>`Der Import ersetzt alle ${cur.accounts.length} Accounts durch ${next.accounts.length} aus der Datei. Fortfahren?`;

  /* ---------- Speicher (storage = Web Storage des Browsers oder Ersatz), jeder Zugriff in try/catch ---------- */
  function loadStore(storage){
    let raw;
    try{ raw=storage.getItem(STORE_KEY); }catch(_){ return {state:emptyState(),canSave:false,msg:NOSAVE}; }
    if(raw===null || raw===undefined) return {state:emptyState(),canSave:true,msg:null};
    const r=importJson(raw);
    return r.ok?{state:r.state,canSave:true,msg:null}:{state:emptyState(),canSave:false,msg:BROKEN};
  }
  function saveStore(storage,state){
    try{ storage.setItem(STORE_KEY,exportJson(state,null)); return {ok:true,msg:null}; }
    catch(_){ return {ok:false,msg:NOSAVE}; }
  }

  // Wörter, die auf keiner Tracker-Seite und in keinem erzeugten Text stehen dürfen (Test)
  const FORBIDDEN=['hedge','gegentrade','gegenkonto','spiegel'];

  const api={APP,VERSION,STORE_KEY,NOSAVE,BROKEN,PHASES,STATUS,STATE_WORD,PHASE_LABEL,MLL_KINDS,KIND_TEXT,SNAP_KEYS,LABELS,FORBIDDEN,
    parseDe,validIso,dayNum,isoOf,addDays,daysBetween,deDate,usd,usdS,
    offerSize,ddKind,dayBoundary,snapshotRules,customRules,rulesDiff,
    emptyState,newAccount,newId,upsertDay,removeDay,addPayout,removePayout,addCost,removeCost,addPhase,nextPhase,phaseIndex,
    phaseCalc,closeBefore,dllLimitFor,evaluate,curveModel,overview,
    migrate,validate,exportJson,exportName,importJson,confirmText,loadStore,saveStore};
  if(typeof module!=='undefined' && module.exports) module.exports=api; else root.GlitchTracker=api;
})(typeof self!=='undefined'?self:this);
