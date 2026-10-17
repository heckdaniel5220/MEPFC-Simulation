/* Glitch-Simulator – Erklärungen in der Oberfläche (M-016b).
   Bindet js/explain.js ein: Panel „Angebot erklärt“ (Eignung, Regelkosten, Regelblatt) und die Typ-Zusammenfassung der Rangliste.
   Regelkosten laufen in Häppchen (ein simulate je Aufgabe der Ereignisschleife, gewähltes Angebot zuerst), Ergebnisse im Cache über P + Seed.
   DOM-freier Teil (Schlüssel, Warteschlange, HTML-Bau als Text) ist in Node testbar: module.exports.
   mount(api) verbindet ihn mit der Seite; app.js ruft nur die Einhängepunkte. Browser: window.GlitchExplainUi */
(function(root){
  'use strict';

  const Ex=typeof module!=='undefined' && module.exports?require('./explain.js'):root.GlitchExplain;
  const CACHE_MAX=600, SEL_DELAY=250;

  // ---- Zahlen und Text (de-DE, „1.234 $“, Minus „−“) ----
  const nf=d=>new Intl.NumberFormat('de-DE',{minimumFractionDigits:d,maximumFractionDigits:d});
  const num=(v,d=0)=>nf(d).format(Object.is(Math.round(v*10**d),-0)?0:v).replace(/^-/,'−');
  const mny=v=>(v!==0 && Math.abs(v)<10?num(v,2):num(v))+' $';             // wie explain.js: unter 10 $ mit Cent
  const sMny=v=>(v>0 && /[1-9]/.test(mny(v))?'+':'')+mny(v);
  const pp=v=>(v>0 && /[1-9]/.test(num(v*100,1))?'+':'')+num(v*100,1);
  const esc=s=>String(s===null || s===undefined?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const plain=html=>String(html).replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');

  // ---- Cache-Schlüssel: P ohne reine Metadaten (Texte, Quelle, Gruppenname), Schlüssel sortiert, plus Seed ----
  // Hauptsimulation (OFFER_BY mit firm, Risiko aus dem Zahlenfeld) und Rangliste (Angebot aus OFFERS, Auto-Risiko mit riskCapped)
  // ergeben so bei gleichen Werten denselben Schlüssel.
  const META=['firm','g','note','src','asof','rules','list','code','reason','riskCapped','notTradable'];
  function canonP(P){
    const o={};
    for(const k of Object.keys(P||{}).sort()) if(!META.includes(k) && P[k]!==undefined) o[k]=P[k];
    return JSON.stringify(o);
  }
  const costKey=(P,seed)=>canonP(P)+'|'+seed;
  const sameP=(a,b)=>!!a && !!b && canonP(a)===canonP(b);

  function createCache(max){
    max=max||CACHE_MAX;
    const m=new Map();
    return {
      has:k=>m.has(k),
      get:k=>m.get(k),
      set(k,v){ if(m.has(k)) m.delete(k); m.set(k,v); while(m.size>max) m.delete(m.keys().next().value); },
      size:()=>m.size,
      clear:()=>m.clear()};
  }

  // Zeile aus der Hauptsimulation (gleiche Rechnung wie die Rangliste); ruleCosts prüft, dass der Grundlauf dieses Netto trifft
  const rowFromMain=(rank,offer,g,P0,R)=>rank.rowFromResult(offer,P0,R,{g});

  // Eignung nur bei frischer, vollständiger Rangliste, gleicher Strategie (P = row.P, gleicher Seed) und mindestens 2 Zeilen im Vergleich
  function fitGate(sel,rank){
    if(!rank || !rank.rows) return {ok:false,why:'noRank'};
    if(rank.running) return {ok:false,why:'running'};
    if(rank.aborted) return {ok:false,why:'aborted'};
    if(rank.stale) return {ok:false,why:'stale'};
    const row=rank.rows.find(r=>r.id===sel.id);
    if(!row) return {ok:false,why:'missing'};
    if(rank.seed!==sel.seed || !sameP(row.P,sel.P0)) return {ok:false,why:'differs'};
    const others=(rank.filtered||[]).filter(r=>r.id!==row.id && typeof r.net==='number' && !r.error && !r.notTradable).length;
    if(others<1) return {ok:false,why:'few'};
    return {ok:true,row};
  }
  const GATE_TEXT={
    noRank:'Die Eignung vergleicht dieses Angebot mit allen anderen bei derselben Strategie. Dafür zuerst die Rangliste berechnen (oder dort eine Zeile anklicken).',
    running:'Die Rangliste wird gerade berechnet. Die Eignung erscheint, sobald sie fertig ist.',
    aborted:'Die Rangliste wurde abgebrochen. Für die Eignung die Rangliste vollständig berechnen.',
    stale:'Strategie oder Seed haben sich seit der Rangliste geändert. Für die Eignung die Rangliste neu berechnen oder dort eine Zeile anklicken.',
    missing:'Dieses Angebot fehlt in der Rangliste. Für die Eignung die Rangliste neu berechnen.',
    differs:'Die Werte im Steuerpult weichen von der Rangliste ab (z. B. von Hand geänderte Angebotswerte oder andere Accounts). Für die Eignung in der Rangliste auf die Zeile klicken.',
    few:'Im Filter der Rangliste ist kein weiteres handelbares Angebot. Für die Eignung den Filter erweitern.'};

  // ---- Warteschlange: ein simulate je Häppchen, gewähltes Angebot vor dem Lauf für alle ----
  // sched(fn) plant fn (Browser: setTimeout 0), now() misst Zeit. Spec: {offer, row, ui, key}.
  function createRunner(o){
    const deps=o.deps, cache=o.cache||createCache(), sched=o.sched, now=o.now||(()=>Date.now());
    let sel=null, all=null, pending=false;
    const job=s=>({spec:s,it:null,steps:0});
    function finish(j,value){ cache.set(j.spec.key,value); return value; }
    // ein Schritt eines Auftrags; true = fertig
    function step(j){
      if(!j.it){
        if(cache.has(j.spec.key)) return true;
        j.it=Ex.ruleCostsSteps(j.spec.offer,j.spec.ui,deps,j.spec.row);
      }
      let r;
      try{ r=j.it.next(); }
      catch(e){ finish(j,{error:e.message}); return true; }
      j.steps++;
      if(r.done){ finish(j,r.value); return true; }
      return false;
    }
    function tick(){
      pending=false;
      if(sel){
        const done=step(sel), s=sel;
        if(done){ sel=null; o.onSel && o.onSel(s.spec,cache.get(s.spec.key)); }
        else o.onSelProgress && o.onSelProgress(s.spec,s.steps);
        return kick();
      }
      if(all && !all.done && !all.cancelled){
        // fertige (gecachte) Angebote ohne Lauf überspringen, dann genau einen Schritt rechnen
        while(all.i<all.specs.length){
          if(!all.cur) all.cur=job(all.specs[all.i]);
          if(!all.cur.it && cache.has(all.cur.spec.key)){ all.i++; all.cur=null; continue; }
          break;
        }
        if(all.i<all.specs.length && step(all.cur)){ all.i++; all.cur=null; }
        if(all.i>=all.specs.length){ all.done=true; all.ms=now()-all.t0; }
        o.onAll && o.onAll(all);
      }
      kick();
    }
    function kick(){
      if(pending) return;
      const work=sel || (all && !all.done && !all.cancelled);
      if(work){ pending=true; sched(tick); }
    }
    return {
      cache,
      // gewähltes Angebot: ersetzt einen laufenden Auftrag; Treffer im Cache sofort
      select(spec){
        sel=null;
        if(!spec) return null;
        if(cache.has(spec.key)){ o.onSel && o.onSel(spec,cache.get(spec.key)); return cache.get(spec.key); }
        sel=job(spec); kick(); return undefined;
      },
      startAll(specs,tag){ all={specs,tag,i:0,cur:null,done:false,cancelled:false,t0:now(),ms:0,total:specs.length}; o.onAll && o.onAll(all); kick(); return all; },
      cancelAll(){ if(all && !all.done){ all.cancelled=true; o.onAll && o.onAll(all); } },
      state:()=>({sel:sel?sel.spec:null,all}),
      tick};
  }

  // ---- HTML-Bau (Text, ohne DOM) ----
  const FIT_PILL={gut:'paid',neutral:'pass',schlecht:'fail','nicht handelbar':'nt'};
  function fitHtml(fit){
    const reasons=fit.reasons.map(s=>`<li>${esc(s.text)}</li>`).join('');
    const more=fit.more.length?`<details class="ex-more"><summary>Mehr Begründung</summary><ul class="ex-reasons">${fit.more.map(s=>`<li>${esc(s.text)}</li>`).join('')}</ul></details>`:'';
    return `<p class="ex-fit"><span class="pill ${FIT_PILL[fit.fit]||'pass'}">${esc(fit.fitText)}</span></p><ul class="ex-reasons">${reasons}</ul>${more}<p class="warn ex-disc">${esc(fit.disclaimer)}</p>`;
  }
  function gateHtml(why){ return `<p class="note">${esc(GATE_TEXT[why]||GATE_TEXT.noRank)}</p><p class="warn ex-disc">${esc(Ex.DISCLAIMER)}</p>`; }

  // Hinweiszeile zur Slippage über der Tabelle (E2); bei „aus“ keine Zeile
  const slipLine=slip=>slip?`<p class="note ex-slip">Gerechnet mit: ${esc(slip)} (Strategie, keine Firmenregel).</p>`:'';
  // Regelkosten-Tabelle mit festem Analyse-Hinweis; slip = Kurztext der Slippage (null bei aus)
  function costsHtml(c,slip){
    const head=`<p class="note ex-analysis">${esc(Ex.ANALYSIS)}</p>`+slipLine(slip);
    if(c===null) return head+'<p class="note">Nicht handelbar: keine Regelkosten.</p>';
    if(c && c.error) return head+`<p class="note">Regelkosten nicht berechenbar: ${esc(c.error)}</p>`;
    const b=c.base;
    const base=`<p class="note">Grundlauf: im Mittel ${sMny(b.net)} je Account (Spanne ${mny(b.netLo)} bis ${mny(b.netHi)}), n = ${num(c.n)}, Seed ${esc(c.seed)}. Δ = Netto mit abgeschalteter Regel − Netto mit Regel, Spanne 95 % gepaart je Account.</p>`;
    if(!c.groups.length) return head+base+'<p class="note">Keine der geprüften Regelgruppen (Tageslimit, Consistency, Tage, Kalender, Cap, Monatsabo) ist bei diesem Angebot aktiv.</p>';
    let t='<div class="tbl"><table class="list ex-costs"><thead><tr><th>Regel</th><th>Δ je Account</th><th>Zustand</th></tr></thead><tbody>';
    for(const g of c.groups){
      const sub=[];
      sub.push(g.exact?'exakt aus den gezahlten Gebühren':g.state==='same'?`alle ${num(g.n)} Accounts identisch`:`Spanne ${mny(g.lo)} bis ${mny(g.hi)}`);
      if(g.payBinds) sub.push(`Payout-Quote ${pp(g.dPay)} Prozentpunkte (${num(g.payLo*100,1)} bis ${num(g.payHi*100,1)})`);
      if(g.control) sub.push(`mit max. ${num(g.control.maxp)} Auszahlungen ${sMny(g.control.d)} (${mny(g.control.lo)} bis ${mny(g.control.hi)})`);
      const cls=g.state==='binds'?(g.d>0?'pos':'neg'):'';
      const state=esc(g.stateText)+(g.maxpArtifact?'<span class="sub">Modellannahme max. Auszahlungen (Konvention)</span>':'');
      t+=`<tr><td class="txt">${esc(g.rule)}</td><td class="${cls}">${sMny(g.d)}<span class="sub">${sub.map(esc).join('<br>')}</span></td><td class="txt">${state}</td></tr>`;
    }
    return head+base+t+'</tbody></table></div>';
  }
  function costsProgressHtml(done,expected,slip){
    return `<p class="note ex-analysis">${esc(Ex.ANALYSIS)}</p>`+slipLine(slip)
      +`<p class="note" aria-live="polite">Regelkosten werden gerechnet (${num(done)} / ${num(Math.max(done,expected))} Läufe).</p>`;
  }
  // erwartete Läufe: Grundlauf + je aktiver Gruppe mit eigenem Lauf (Kontrollläufe kommen bei Bedarf dazu)
  const expectedRuns=P=>1+Ex.GROUPS.filter(G=>!G.exact && G.on(P)).length;

  // Regelblatt: je Gruppe ein details; Felder ohne Angabe gesammelt am Ende
  const MISSING=['missing','null'];
  function sheetHtml(sheet){
    const row=e=>{
      const orig=[e.field?`Kernfeld ${e.field}`:null,e.from?`Rohfeld ${e.from}`:null].filter(Boolean).join(' · ');
      return `<div class="ex-row"><dt>${esc(e.label)}</dt><dd>${esc(e.text)}${orig?`<span class="ex-orig">${esc(orig)}</span>`:''}</dd></div>`;
    };
    let h='';
    for(const g of sheet.groups){
      const shown=g.entries.filter(e=>!MISSING.includes(e.state)), miss=g.entries.filter(e=>MISSING.includes(e.state));
      const head=shown.filter(e=>e.state==='value' && e.field).slice(0,2).map(e=>`${e.label}: ${e.text}`).join(' · ');
      h+=`<details class="ex-group"><summary>${esc(g.label)}${head?`<span class="ex-head">${esc(head)}</span>`:''}</summary><dl class="ex-sheet">${shown.map(row).join('')}</dl>`
        +(miss.length?`<details class="ex-miss"><summary>weitere Felder (${miss.length} ohne Angabe)</summary><dl class="ex-sheet">${miss.map(row).join('')}</dl></details>`:'')+'</details>';
    }
    if(sheet.rest.length) h+=`<details class="ex-group"><summary>Weitere Rohfelder</summary><dl class="ex-sheet">${sheet.rest.map(row).join('')}</dl></details>`;
    h+=`<p class="note"><b>Regeltext:</b> ${esc(sheet.noteRules)}</p><p class="note"><b>Annahmen im Modell:</b> ${esc(sheet.assumptions)}</p>`;
    return h;
  }

  // Typ-Zusammenfassung; part = {n, total} bei unvollständigen Regelkosten
  function typesHtml(sum,part){
    if(!sum.types.length) return '<p class="note">Keine handelbaren Angebote im Filter.</p>';
    let h='<div class="ex-types">';
    for(const t of sum.types) h+=`<div class="ex-type"><h3>${esc(t.label)}</h3>${t.sentences.map(s=>`<p>${esc(s.text)}</p>`).join('')}</div>`;
    h+='</div>';
    if(part) h+=`<p class="note">Regelkosten liegen für ${num(part.n)} von ${num(part.total)} Angeboten im Filter vor.</p>`;
    return h+`<p class="warn ex-disc">${esc(sum.disclaimer)}</p>`;
  }

  // ---- Seite (nur Browser) ----
  // api: {offers, deps, selected() → {id, P0, R, seed} | null, rank() → {rows, filtered, seed, stale, aborted, running} | null, slipTxt(P) → Text | null}
  function mount(api){
    const $=id=>document.getElementById(id);
    const byId={};
    for(const g of api.offers) for(const o of g.items) byId[o.id]={offer:o,g:g.g};
    // Häppchen als eigene Aufgabe in der Ereignisschleife: MessageChannel statt setTimeout(0), weil Browser verschachtelte
    // setTimeout-Aufrufe auf mindestens 4 ms strecken (gemessen: 10,5 statt 5,8 s für alle Angebote). Eingaben laufen dazwischen.
    const mc=typeof MessageChannel!=='undefined'?new MessageChannel():null, q=[];
    if(mc) mc.port1.onmessage=()=>{ const fn=q.shift(); if(fn) fn(); };
    const sched=mc?fn=>{ q.push(fn); mc.port2.postMessage(0); }:fn=>setTimeout(fn,0);
    const runner=createRunner({deps:api.deps,sched,now:()=>performance.now(),
      onSel:()=>showSel(), onSelProgress:(s,n)=>{ if(cur && cur.key===s.key) $('ex-cost-b').innerHTML=costsProgressHtml(n,expectedRuns(cur.P0),api.slipTxt(cur.P0)); },
      onAll:a=>allProgress(a)});
    const cache=runner.cache;
    let cur=null, selTimer=null, sheetId=null;

    // gewähltes Angebot: Panel, Regelblatt, Regelkosten (verzögert), Eignung
    function onRender(){
      const s=api.selected(), panel=$('explain');
      clearTimeout(selTimer);
      if(!s || !byId[s.id]){ panel.hidden=true; cur=null; runner.select(null); return; }
      panel.hidden=false;
      const {offer,g}=byId[s.id];
      if(sheetId!==s.id){ $('ex-sheet-b').innerHTML=sheetHtml(Ex.ruleSheet(offer)); sheetId=s.id; }
      if(!s.R){   // nicht handelbar oder Simulation nicht möglich
        cur=null; runner.select(null);
        const t=s.P0 && s.P0.reason?s.P0.reason:'Simulation nicht möglich.';
        $('ex-fit-b').innerHTML=`<p class="ex-fit"><span class="pill nt">nicht handelbar</span></p><p class="note">${esc(t)}</p>`;
        $('ex-cost-b').innerHTML=costsHtml(null,null);
        return;
      }
      const key=costKey(s.P0,s.seed);
      cur={id:s.id,P0:s.P0,R:s.R,seed:s.seed,key,offer,g};
      showSel();
      if(!cache.has(key)){
        $('ex-cost-b').innerHTML=costsProgressHtml(0,expectedRuns(s.P0),api.slipTxt(s.P0));
        selTimer=setTimeout(()=>{ if(!cur || cur.key!==key) return;
          runner.select({offer,ui:{seed:s.seed},row:rowFromMain(api.deps.rank,offer,g,s.P0,s.R),key}); },SEL_DELAY);
      }
    }
    function showSel(){
      if(!cur) return;
      const c=cache.get(cur.key);
      if(c!==undefined) $('ex-cost-b').innerHTML=costsHtml(c,api.slipTxt(cur.P0));
      showFit();
    }
    function showFit(){
      if(!cur) return;
      const rk=api.rank(), gate=fitGate(cur,rk);
      if(!gate.ok){ $('ex-fit-b').innerHTML=gateHtml(gate.why); return; }
      const c=cache.get(cur.key);
      const fit=Ex.strategyFit(cur.offer,{seed:cur.seed},gate.row,c && !c.error?c:null,rk.filtered);
      $('ex-fit-b').innerHTML=fitHtml(fit)+(c===undefined?'<p class="note">Die Sätze zu den Regelkosten folgen, sobald sie gerechnet sind.</p>':'');
    }

    // Rangliste: Typ-Zusammenfassung, Knopf für alle Angebote
    function rankSpecs(rk){
      return rk.rows.filter(r=>typeof r.net==='number' && !r.error && !r.notTradable && byId[r.id])
        .map(r=>({offer:byId[r.id].offer,row:r,ui:{seed:rk.seed},key:costKey(r.P,rk.seed)}));
    }
    function costsFor(rows,seed){
      const out={}; let n=0, total=0;
      for(const r of rows){ if(typeof r.net!=='number' || r.error || r.notTradable) continue; total++;
        const c=cache.get(costKey(r.P,seed)); if(c!==undefined && !(c && c.error)){ out[r.id]=c; n++; } }
      return {out,n,total};
    }
    let allTag=null;
    function showTypes(){
      const rk=api.rank(), box=$('typeBox');
      if(!rk || !rk.rows || rk.running){ box.hidden=true; return; }
      box.hidden=false;
      const cf=costsFor(rk.filtered,rk.seed), withCosts=cf.n>0 && (cf.n===cf.total || allTag===rk.tag);
      const sum=Ex.typeSummary(rk.filtered,withCosts?cf.out:undefined);
      $('typeBody').innerHTML=typesHtml(sum,withCosts && cf.n<cf.total?cf:null);
    }
    // Fortschritt höchstens alle 250 ms in die Seite schreiben: jede Änderung kostet ein neues Bild der (großen) Seite
    let lastShow=0, wasRun=false;
    function allProgress(a){
      const run=!a.done && !a.cancelled, t=performance.now();
      if(run && wasRun && t-lastShow<250) return;
      lastShow=t; wasRun=run;
      $('costProg').textContent=a.cancelled?`Regelkosten abgebrochen nach ${num(a.i)} / ${num(a.total)} Angeboten`
        :a.done?`Regelkosten: ${num(a.total)} Angebote in ${num(a.ms/1000,1)} s`:`Regelkosten ${num(a.i)} / ${num(a.total)} Angebote`;
      $('costStop').hidden=!run; $('costGo').disabled=run || !canAll();
      // Typ-Zusammenfassung und Eignung erst am Ende neu bauen
      if(!run){ showTypes(); showFit(); }
    }
    const canAll=()=>{ const rk=api.rank(); return !!(rk && rk.rows && !rk.running && !rk.aborted); };
    function onRank(){
      const st=runner.state().all, run=st && !st.done && !st.cancelled;
      $('costGo').disabled=run || !canAll();
      showTypes(); showFit();
    }
    function onRankStart(){ runner.cancelAll(); allTag=null; $('costProg').textContent=''; $('costGo').disabled=true; $('typeBox').hidden=true; showFit(); }
    $('costGo').addEventListener('click',()=>{
      const rk=api.rank(); if(!canAll()) return;
      allTag=rk.tag; runner.startAll(rankSpecs(rk),rk.tag);
    });
    $('costStop').addEventListener('click',()=>runner.cancelAll());
    return {onRender,onRank,onRankStart,refresh:()=>{ showFit(); },runner};
  }

  const api={mount,createRunner,createCache,costKey,canonP,sameP,fitGate,rowFromMain,expectedRuns,
    fitHtml,gateHtml,costsHtml,costsProgressHtml,sheetHtml,typesHtml,esc,plain,GATE_TEXT,META,CACHE_MAX,SEL_DELAY};
  if(typeof module!=='undefined' && module.exports) module.exports=api; else root.GlitchExplainUi=api;
})(typeof self!=='undefined'?self:this);
