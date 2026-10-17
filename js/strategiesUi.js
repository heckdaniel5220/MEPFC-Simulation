/* Glitch-Simulator – Strategie-Beispiele in der Oberfläche (M-018b).
   Bindet js/strategies.js ein: Block „Strategie-Beispiele“ oben im Bereich „Trading“.
   DOM-frei (Modell, Klick-Plan, Aktiv-Prüfung, HTML als Text), in Node testbar: module.exports. Browser: window.GlitchStrategiesUi.
   deps per Parameter wie in explain.js: {stratFromUi, slipFromUi, autoParams} aus params.js. app.js schreibt nur die Felder. */
(function(root){
  'use strict';

  const S=typeof module!=='undefined' && module.exports?require('./strategies.js'):root.GlitchStrategies;

  const nf1=new Intl.NumberFormat('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1});
  const esc=s=>String(s===null || s===undefined?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const HEAD='Setzen nur Trefferquote, CRV, Risiko- und Kosten-%, Trades pro Tag und Slippage. Angebot und Firmenregeln bleiben.';
  const SLIP_SENTENCE='Das letzte Beispiel zeigt, wie Slippage einen kleinen Edge aufzehrt.';
  const OWN_SENTENCE='Ohne Angebot setzt das Beispiel Risiko und Kosten einmal aus dem Drawdown-Feld.';

  // Je Preset: Name wortgleich, Etikett aus edge(), Break-even nominal mit einer Nachkommastelle
  function barModel(list){
    return (list||S.STRATEGIES).map(p=>({id:p.id,name:p.name,label:S.edge(p),edgeYes:S.edge(p)===S.EDGE_YES,
      beTxt:`Break-even ${nf1.format(S.breakEven(p)*100)} %`,note:p.note||null}));
  }

  /* Klick-Plan. ui: Form wie stratUi() in app.js (UI-Werte plus riskPct, costPct, autorisk).
     strat = stratFromUi(applyStrategy(ui, preset)): geht mit Angebot an applyOffer (wie ein Klick auf eine Ranglisten-Zeile).
     Ohne Angebot wirken Risiko-% und Kosten-% nicht: Risiko und Kosten einmal über autoParams mit den UI-Werten als Angebot (nur risk/cost). */
  function plan(ui, preset, opts, deps){
    const strat=deps.stratFromUi(S.applyStrategy(ui,preset,{slipFromUi:deps.slipFromUi}));
    if(opts && opts.hasOffer) return {strat};
    const P=deps.autoParams(Object.assign({},ui),strat);
    return {strat,risk:P.risk,cost:P.cost};
  }

  // Aktiv = das Preset würde nichts ändern (gleiche Strategie wie die Rangliste sie vergleicht; ohne Angebot auch gleiches Risiko und gleiche Kosten)
  function activeId(ui, opts, deps, list){
    const cur=JSON.stringify(deps.stratFromUi(ui)), has=!!(opts && opts.hasOffer);
    for(const p of list||S.STRATEGIES){
      const pl=plan(ui,p,{hasOffer:has},deps);
      if(JSON.stringify(pl.strat)!==cur) continue;
      if(has || (pl.risk===ui.risk && pl.cost===ui.cost)) return p.id;
    }
    return null;
  }

  // Inhalt des Blocks; aria-pressed setzt app.js (Knöpfe bleiben stehen, damit der Fokus beim Klick nicht verloren geht)
  function barHtml(model, active){
    const notes=model.filter(m=>m.note).map(m=>`<p class="note">${esc(m.note)}</p>`).join('');
    return `<p class="note">${esc(HEAD)}</p>`
      +`<div class="strat-list" role="group" aria-label="Strategie-Beispiele">`
      +model.map(m=>`<button type="button" data-sid="${esc(m.id)}" aria-pressed="${m.id===active}">`
        +`<span class="st-name">${esc(m.name)}</span>`
        +`<span class="st-sub"><span class="pill ${m.edgeYes?'st-yes':'st-no'}">${esc(m.label)}</span> ${esc(m.beTxt)}</span></button>`).join('')
      +`</div>${notes}<p class="note">${esc(SLIP_SENTENCE)}</p>`
      +`<p class="note" id="strat-own" hidden>${esc(OWN_SENTENCE)}</p>`
      +`<p class="note">${esc(S.DISCLAIMER)}</p>`;
  }

  const api={barModel,plan,activeId,barHtml,HEAD,SLIP_SENTENCE,OWN_SENTENCE};
  if(typeof module!=='undefined' && module.exports) module.exports=api; else root.GlitchStrategiesUi=api;
})(typeof self!=='undefined'?self:this);
