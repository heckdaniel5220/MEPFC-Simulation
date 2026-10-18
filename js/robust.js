/* Glitch-Simulator – Robustheit der Rangliste über Seeds (M-025).
   DOM-frei: Browser window.GlitchRobust, Node module.exports. deps per Parameter wie explain.js:
   {simulate, prepare, autoParams, rank} (rank = GlitchRank bzw. require('./rank.js')).
   Rechnet die Rangliste (rank.js) für K Seeds, je Seed gepaart (gleicher Seed für alle Angebote), und fasst je Angebot
   Median-Platz, Platz-Spanne, Seeds im Plus und Seeds in den Top 10 zusammen. Anteile immer als Anzahl von Kdone. */
(function(root){
  'use strict';

  /* Seed-Liste (E1): seed_k = (Basis + k · C) >>> 0 mit C = 0x6D2B79F5 · 0x9E3779B9 mod 2^32, k = 0 ist der Basis-Seed.
     Begründung: mulberry32 setzt seinen Zustand je Ziehung um 0x6D2B79F5 weiter. Ein Seed Basis + d · 0x6D2B79F5 ist deshalb
     derselbe Strom, nur um d Ziehungen verschoben (gemessen: Streuung der Mittel über 30 Seeds 0–2 $ statt rund 230 $).
     Mit C = 0x6D2B79F5 · J beginnt Seed k genau k · J Ziehungen nach der Basis; J = 0x9E3779B9 (2^32 ÷ goldener Schnitt)
     hält alle Startpunkte weit auseinander: kleinster Abstand zweier Seeds 239.350.328 Ziehungen bis K 10,
     56.502.930 bis K 50. Ein simulate zieht gemessen höchstens rund 152.000 Zahlen (n 1000), die Ströme überlappen nie. */
  const STEP=0x6D2B79F5, GOLD=0x9E3779B9;
  const C=Math.imul(STEP,GOLD)>>>0;
  const K_MIN=1, K_MAX=50, K_DEF=10, TOP_DEF=10;
  // Wortgleich zu GlitchExplain.DISCLAIMER (M-016a), der Test prüft die Gleichheit
  const DISCLAIMER='Gilt nur für die eingestellte Strategie. Positive Werte können aus der Payout-Struktur der Firma kommen statt aus einem Trading-Edge. Modell mit Annahmen (CLAUDE.md). Keine Anlageberatung.';

  function seedList(base,K){
    if(!Number.isInteger(base) || base<0 || base>0xFFFFFFFF) throw new Error('Basis-Seed muss eine Ganzzahl von 0 bis 4294967295 sein: '+JSON.stringify(base));
    if(!Number.isInteger(K) || K<K_MIN || K>K_MAX) throw new Error(`Anzahl der Seeds K muss eine Ganzzahl von ${K_MIN} bis ${K_MAX} sein: `+JSON.stringify(K));
    const out=[]; for(let k=0;k<K;k++) out.push((base+Math.imul(k,C))>>>0);
    return out;
  }

  // Median; gerade Anzahl: Mittel der beiden mittleren (wie medianDaysToPass)
  function median(xs){
    if(!xs.length) return null;
    const s=xs.slice().sort((a,b)=>a-b), m=s.length>>1;
    return s.length%2?s[m]:(s[m-1]+s[m])/2;
  }
  const stats=xs=>xs.length?{med:median(xs),min:Math.min(...xs),max:Math.max(...xs)}:null;

  /* Häppchen (E3): je Seed ein Ranglisten-Zustand aus rank.js; robustStep rechnet genau ein Angebot eines Seeds
     (höchstens ein simulate, nicht handelbare Angebote ohne). ui wie für rankOffers, ui.seed = Basis (Standard rank.SEED). */
  function createRobustState(offers,ui,deps,opt){
    ui=ui||{}; opt=opt||{};
    const K=opt.K===undefined?K_DEF:opt.K;
    const seeds=seedList(ui.seed!==undefined?ui.seed:deps.rank.SEED,K);
    const rdeps={simulate:deps.simulate,prepare:deps.prepare,autoParams:deps.autoParams};
    const ranks=seeds.map(s=>deps.rank.createRankState(offers,Object.assign({},ui,{seed:s}),rdeps));
    const per=ranks[0].total;
    const st={seeds,K,ranks,deps,k:0,Kdone:0,i:0,total:K*per,done:false,cancelled:false};
    if(per===0){ st.k=st.Kdone=K; st.done=true; }
    return st;
  }
  function robustStep(state){
    if(state.done || state.cancelled) return state;
    const rs=state.ranks[state.k];
    state.deps.rank.rankOffersStep(rs);
    state.i++;
    if(rs.done){ state.k++; state.Kdone=state.k; if(state.k>=state.K) state.done=true; }
    return state;
  }
  // Abbruch: keine weitere Simulation; summarize nutzt nur die vollständig gerechneten Seeds (Kdone)
  function cancelRobust(state){ state.cancelled=true; return state; }

  // Alles auf einmal (Node, Tests): Schleife über robustStep
  function robustOffers(offers,ui,deps,opt){
    const st=createRobustState(offers,ui,deps,opt);
    while(!st.done) robustStep(st);
    return st;
  }

  /* Zusammenfassung erst beim Abruf: je vollständigem Seed filterRows → handelbare Zeilen mit Wert → sortRows(key) → Platz.
     Ein Filterwechsel braucht so keinen neuen Lauf, die Plätze beziehen sich auf die gezeigten Zeilen.
     o = {key: Sortierschlüssel (Standard 'net'), filter: wie filterRows, top: Grenze für „Top“ (Standard 10)}.
     Je Angebot: places (Platz je Seed), medPlace, minPlace, maxPlace, plus (Seeds mit Netto > 0), top (Seeds mit Platz ≤ Grenze),
     net und value ({med, min, max} von Netto und vom Sortierfeld), missing (Seeds ohne Wert, z. B. Fehler).
     Nicht handelbar hängt nicht am Seed (autoParams ist seedfrei): Plätze und Zählungen null. */
  function summarize(state,o){
    o=o||{};
    const R=state.deps.rank, key=o.key||'net', field=R.SORT_KEYS[key];
    if(!field) throw new Error('Unbekannter Sortierschlüssel: '+JSON.stringify(key));
    const top=o.top===undefined?TOP_DEF:o.top, Kd=state.Kdone;
    const has=r=>!r.notTradable && !r.error && typeof r[field]==='number' && Number.isFinite(r[field]);
    const by=new Map(), order=[], Nseed=[];
    for(let k=0;k<Kd;k++){
      const rows=R.filterRows(state.ranks[k].rows,o.filter);
      for(const r of rows) if(!by.has(r.id)){ by.set(r.id,{row:r,places:[],net:[],value:[]}); order.push(r.id); }
      const sorted=R.sortRows(rows.filter(has),key);
      Nseed.push(sorted.length);
      sorted.forEach((r,i)=>{ const e=by.get(r.id); e.places.push(i+1); e.net.push(r.net); e.value.push(r[field]); });
    }
    const out=order.map(id=>{
      const e=by.get(id), r=e.row, nt=!!r.notTradable, p=e.places;
      return {id,name:r.name,group:r.group,firm:r.firm,market:r.market,type:r.type,fee:r.fee,size:r.size,
        notTradable:nt,reason:nt?r.reason:null,places:nt?null:p.slice(),
        medPlace:nt?null:median(p),minPlace:nt||!p.length?null:Math.min(...p),maxPlace:nt||!p.length?null:Math.max(...p),
        plus:nt?null:e.net.filter(x=>x>0).length,top:nt?null:p.filter(x=>x<=top).length,
        net:nt?null:stats(e.net),value:nt?null:stats(e.value),missing:nt?null:Kd-p.length};
    });
    return {K:state.K,Kdone:Kd,seeds:state.seeds.slice(),key,topLimit:top,
      N:Nseed.length?Math.max(...Nseed):0,Nseed,rows:out,disclaimer:DISCLAIMER};
  }

  const api={seedList,createRobustState,robustStep,cancelRobust,robustOffers,summarize,median,
    C,STEP,GOLD,K_MIN,K_MAX,K_DEF,TOP_DEF,DISCLAIMER};
  if(typeof module!=='undefined' && module.exports) module.exports=api; else root.GlitchRobust=api;
})(typeof self!=='undefined'?self:this);
