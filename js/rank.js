/* Glitch-Simulator – Rangliste der Angebote (M-015a).
   DOM-frei: Browser window.GlitchRank, Node module.exports.
   Simuliert jedes Angebot mit denselben Trading-Werten und demselben Seed, bildet Kennzahlen,
   sortiert, filtert und markiert „gleichauf“. simulate, prepare und autoParams werden übergeben (deps). */
(function(root){
  'use strict';

  const SEED=20261015;
  // Steuerfelder der Rangliste, die nicht an autoParams gehen
  const RANK_KEYS=['seed','today'];
  // Sortierschlüssel → Zeilenfeld; Tage aufsteigend, alles andere absteigend
  const SORT_KEYS={net:'net',netHe:'netHe',roi:'roi',netPer1k:'netPer1k',payout:'payout',days:'days'};
  const ASC={days:true};
  // Spanne je Schlüssel für „gleichauf“
  const TIE_KEYS={net:['netLo','netHi'],roi:['roiLo','roiHi']};

  // Mittelwert mit 95-%-Spanne ± 1,96 · s/√n (s mit n − 1)
  function ci95(arr){
    const n=arr.length; if(!n) return null;
    let m=0; for(const x of arr) m+=x; m/=n;
    let q=0; for(const x of arr) q+=(x-m)*(x-m);
    const s=n>1?Math.sqrt(q/(n-1)):0, se=s/Math.sqrt(n), half=1.96*se;
    return {n,mean:m,s,se,half,lo:m-half,hi:m+half};
  }

  // Quantil mit linearer Interpolation zwischen den sortierten Werten (Position (n − 1) · q)
  function quantile(arr,q){
    const n=arr.length; if(!n) return null;
    const s=arr.slice().sort((a,b)=>a-b), pos=(n-1)*q, lo=Math.floor(pos), hi=Math.ceil(pos);
    return s[lo]+(s[hi]-s[lo])*(pos-lo);
  }

  const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
  const market=g=>/CFD/.test(g)?'CFD':'Futures';
  const firm=g=>String(g).split(' · ')[0];
  // Kontogröße: rules.size (Alpha Capital, Blue Guardian), sonst Zahl am Ende der id × 1.000 (af-zero-25 → 25.000)
  function accountSize(o){
    if(o.rules && typeof o.rules.size==='number') return o.rules.size;
    const m=/-(\d+(?:\.\d+)?)$/.exec(o.id||''); return m?Math.round(+m[1]*1000):null;
  }
  const deDate=iso=>{ const [y,m,d]=iso.split('-'); return `${d}.${m}.${y}`; };

  // Code-Kennzeichnung: rules.codeValidUntil null → ohne Ablauf, Datum → bis TT.MM.JJJJ (abgelaufen, wenn Stichtag danach), fehlt → keine
  function codeMark(offer,today){
    const v=offer.rules?offer.rules.codeValidUntil:undefined;
    if(v===undefined) return null;
    if(v===null) return {kind:'noExpiry',label:'Code ohne Ablaufdatum'};
    return {kind:'until',until:v,expired:today?today>v:null,label:`Code bis ${deDate(v)}`};
  }

  // Zeilenkopf ohne Kennzahlen (auch für nicht handelbare Angebote)
  function baseRow(offer,P,ctx){
    const g=ctx.g!==undefined?ctx.g:(offer.g||'');
    return {id:offer.id,name:offer.n,group:g,firm:firm(g),market:market(g),type:offer.mode,
      fee:offer.fee,dd:offer.dd,size:accountSize(offer),code:offer.code,codeMark:codeMark(offer,ctx.today),
      risk:P.risk,cost:P.cost,hp:P.hp,riskCapped:!!P.riskCapped,notTradable:!!P.notTradable,reason:P.reason||null,error:null,
      n:null,net:null,netLo:null,netHi:null,netHalf:null,netHe:null,netHeLo:null,netHeHi:null,netHeHalf:null,
      roi:null,roiLo:null,roiHi:null,feesPaid:null,netPer1k:null,pass:null,payout:null,avgPayouts:null,days:null,q5NetHe:null,q5Hedge:null,
      P};
  }

  // Kennzahlen eines Angebots aus einem simulate-Ergebnis. ctx = {g: Gruppenname, today: 'JJJJ-MM-TT'}
  function rowFromResult(offer,P,R,ctx){
    ctx=ctx||{};
    const row=baseRow(offer,P,ctx), L=R.list, n=L.length;
    const no=ci95(L.map(x=>x.netNo)), he=ci95(L.map(x=>x.netHe));
    // daysToFirstPay kommt mit M-004; fehlt das Feld, bleibt die Kennzahl null
    const days=L.map(x=>x.daysToFirstPay).filter(v=>v!==null && v!==undefined);
    // ROI-Nenner (M-005): mittlere gezahlte Gebühren je Account (inkl. Monatsabo); fehlt feesPaid, gilt offer.fee
    const paidFees=L.map(x=>x.feesPaid).filter(v=>typeof v==='number' && Number.isFinite(v));
    const fees=paidFees.length===n && n>0 ? mean(paidFees) : offer.fee;
    Object.assign(row,{n,
      net:no.mean,netLo:no.lo,netHi:no.hi,netHalf:no.half,
      netHe:he.mean,netHeLo:he.lo,netHeHi:he.hi,netHeHalf:he.half,
      roi:no.mean/fees,roiLo:no.lo/fees,roiHi:no.hi/fees,feesPaid:fees,
      netPer1k:no.mean/P.dd*1000,
      pass:offer.mode==='instant'?null:R.passed/n,
      payout:R.paid/n,avgPayouts:R.nPayTot/n,
      days:mean(days),
      q5NetHe:quantile(L.map(x=>x.netHe),0.05),
      q5Hedge:quantile(L.map(x=>x.hedge),0.05)});
    return row;
  }

  // Ein Angebot: P aus autoParams, bei notTradable keine Simulation, sonst ein simulate-Aufruf
  function rankOne(offer,g,ui,deps,seed,today){
    const P=deps.autoParams(offer,ui), ctx={g,today};
    if(P.notTradable) return baseRow(offer,P,ctx);
    try{ return rowFromResult(offer,P,deps.simulate(deps.prepare(P),seed),ctx); }
    catch(e){ const row=baseRow(offer,P,ctx); row.error=e.message; return row; }
  }

  // OFFERS-Gruppen ({g, items}) oder eine flache Liste (g optional am Angebot) in {offer, g} auflösen
  function flatten(offers){
    const out=[];
    for(const x of offers){
      if(x && Array.isArray(x.items)) for(const o of x.items) out.push({offer:o,g:x.g});
      else out.push({offer:x,g:x.g||''});
    }
    return out;
  }

  // Häppchen: Zustand anlegen, dann je Aufruf von rankOffersStep genau ein Angebot rechnen
  function createRankState(offers,ui,deps){
    ui=ui||{};
    const own={}; for(const k in ui) if(!RANK_KEYS.includes(k)) own[k]=ui[k];
    const items=flatten(offers);
    return {items,ui:own,deps,seed:ui.seed!==undefined?ui.seed:SEED,today:ui.today||null,
      i:0,total:items.length,rows:[],done:items.length===0,cancelled:false};
  }
  function rankOffersStep(state){
    if(state.done || state.cancelled) return state;
    const {offer,g}=state.items[state.i];
    state.rows.push(rankOne(offer,g,state.ui,state.deps,state.seed,state.today));
    state.i++; if(state.i>=state.total) state.done=true;
    return state;
  }
  function cancelRank(state){ state.cancelled=true; return state; }

  // Alle Angebote auf einmal (gleicher Seed für alle, ein simulate-Aufruf je Angebot)
  function rankOffers(offers,ui,deps){
    const st=createRankState(offers,ui,deps);
    while(!st.done) rankOffersStep(st);
    return st.rows;
  }

  // Sortieren: dir 'asc'/'desc' (Standard: Tage aufsteigend, sonst absteigend). Zeilen ohne Wert ans Ende, Gleichstand nach id.
  function sortRows(rows,key,dir){
    const f=SORT_KEYS[key]; if(!f) throw new Error('Unbekannter Sortierschlüssel: '+JSON.stringify(key));
    const d=(dir===undefined?(ASC[key]?'asc':'desc'):dir)==='asc'?1:-1;
    const has=r=>typeof r[f]==='number' && Number.isFinite(r[f]);
    const byId=(a,b)=>a.id<b.id?-1:a.id>b.id?1:0;
    return rows.slice().sort((a,b)=>{
      const ha=has(a), hb=has(b);
      if(ha!==hb) return ha?-1:1;
      if(ha && a[f]!==b[f]) return (a[f]-b[f])*d;
      return byId(a,b);
    });
  }

  // „Gleichauf“ nur bei net und roi: Spanne überlappt mit der von Platz 1 (höchster Wert). Liefert Kopien mit leader/tie.
  function markTies(rows,key){
    const t=TIE_KEYS[key];
    if(!t) return rows.map(r=>Object.assign({},r,{leader:false,tie:false}));
    const [lo,hi]=t, f=SORT_KEYS[key];
    let top=null;
    for(const r of rows) if(typeof r[f]==='number' && (top===null || r[f]>top[f] || (r[f]===top[f] && r.id<top.id))) top=r;
    return rows.map(r=>{
      const leader=r===top;
      const tie=!leader && top!==null && typeof r[f]==='number' && r[hi]>=top[lo] && r[lo]<=top[hi];
      return Object.assign({},r,{leader,tie});
    });
  }

  // Filter: markt ('Futures'/'CFD'), firma, typ ('challenge'/'instant'), maxFee, sizeMin, sizeMax; leer oder 'all' = ohne Filter
  function filterRows(rows,f){
    f=f||{};
    const on=v=>v!==undefined && v!==null && v!=='' && v!=='all';
    return rows.filter(r=>
      (!on(f.markt) || r.market===f.markt) &&
      (!on(f.firma) || r.firm===f.firma) &&
      (!on(f.typ) || r.type===f.typ) &&
      (!on(f.maxFee) || r.fee<=f.maxFee) &&
      (!on(f.sizeMin) || (r.size!==null && r.size>=f.sizeMin)) &&
      (!on(f.sizeMax) || (r.size!==null && r.size<=f.sizeMax)));
  }

  const api={rankOffers,rankOffersStep,createRankState,cancelRank,rowFromResult,sortRows,markTies,filterRows,
    quantile,ci95,codeMark,accountSize,SEED,SORT_KEYS};
  if(typeof module!=='undefined' && module.exports) module.exports=api; else root.GlitchRank=api;
})(typeof self!=='undefined'?self:this);
