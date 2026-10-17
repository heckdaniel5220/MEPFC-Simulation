/* Glitch-Simulator – Strategie-Presets (M-018).
   DOM-frei: Browser window.GlitchStrategies, Node module.exports. Ohne require: slipFromUi kommt per deps.
   Ein Preset setzt nur Strategiefelder (Trefferquote, CRV, Risiko-% des DD, Kosten-% des Risikos, Trades/Tag, Slippage),
   nie Firmenregeln; die Firma kommt weiter über autoParams. Getrennt von den Video-PRESETS in offers.js. */
(function(root){
  'use strict';

  // Erlaubte Strategiefelder eines Presets (dazu id, name, optional note). slip in Feldform wie die Oberfläche (slipTailProb in % der Verluste).
  const STRAT_FIELDS=['wr','rr','riskPct','costPct','tradesPerDay','slip'];
  // Wortgleich zu GlitchExplain.DISCLAIMER (M-016a), der Test prüft die Gleichheit
  const DISCLAIMER='Gilt nur für die eingestellte Strategie. Positive Werte können aus der Payout-Struktur der Firma kommen statt aus einem Trading-Edge. Modell mit Annahmen (CLAUDE.md). Keine Anlageberatung.';
  // Abstand über dem Break-even wie der Hinweis unter der Trefferquote (app.js wr-hint): 0,5 Prozentpunkte
  const EDGE_MARGIN=0.005;
  const EDGE_YES='Edge vorhanden', EDGE_NO='kein Edge';

  // Werte auf dem Raster der Regler. Jedes Preset setzt slipMode ausdrücklich, damit keine alte Slippage stehen bleibt.
  const STRATEGIES=[
    {id:'hoch-wr',name:'Beispiel: hohe Trefferquote, kleines CRV',
      wr:70,rr:0.5,riskPct:20,costPct:2,tradesPerDay:1,slip:{slipMode:'none'}},
    {id:'tief-wr',name:'Beispiel: niedrige Trefferquote, großes CRV',
      wr:27,rr:3,riskPct:15,costPct:2,tradesPerDay:1,slip:{slipMode:'none'}},
    {id:'leicht',name:'Beispiel: leichter Edge',
      wr:48,rr:1.2,riskPct:25,costPct:2,tradesPerDay:1,slip:{slipMode:'none'}},
    {id:'mehrfach',name:'Beispiel: mehrere Trades pro Tag',
      wr:55,rr:1,riskPct:10,costPct:4,tradesPerDay:3,slip:{slipMode:'none'}},
    {id:'null',name:'Beispiel: Break-even ohne Edge',
      wr:51,rr:1,riskPct:25,costPct:2,tradesPerDay:1,slip:{slipMode:'none'}},
    {id:'leicht-slip',name:'Beispiel: leichter Edge mit Slippage 10 % (Annahme)',
      note:'Slippage 10 % ist eine Annahme ohne Quelle (Beispielwert).',
      wr:48,rr:1.2,riskPct:25,costPct:2,tradesPerDay:1,slip:{slipMode:'fixed',slipPct:10,slipBuffer:10}}
  ];

  // Mittlere Slippage je Verlust in Anteilen des Risikos: fest slipPct, mit Ausreißern (1 − q) · slipPct + q · slipTailPct (q aus % der Verluste)
  function slipMean(s){
    if(!s) return 0;
    if(s.slipMode==='fixed') return s.slipPct/100;
    if(s.slipMode==='dist'){ const q=s.slipTailProb/100; return ((1-q)*s.slipPct+q*s.slipTailPct)/100; }
    return 0;
  }
  // Break-even nach E8 (M-017b) in Anteilen des Risikos: (1 + c + s̄) / (1 + CRV + s̄)
  function breakEven(p){
    const c=p.costPct/100, s=slipMean(p.slip);
    return (1+c+s)/(1+p.rr+s);
  }
  // Erwartungswert je Trade in R: p · CRV − (1 − p) · (1 + s̄) − c
  function edgeR(p){
    const q=p.wr/100, c=p.costPct/100, s=slipMean(p.slip);
    return q*p.rr-(1-q)*(1+s)-c;
  }
  // Kennzeichnung, berechnet (nominal aus den %-Werten)
  const edge=p=>p.wr/100>breakEven(p)+EDGE_MARGIN?EDGE_YES:EDGE_NO;

  /* Preset auf UI-Werte (Form wie stratUi() in app.js) anwenden. Liefert eine Kopie; Eingabe bleibt unverändert.
     Setzt die Strategiefelder, schaltet das Auto-Risiko ein (sonst wirkt Risiko-% nicht) und ersetzt die Slippage
     über deps.slipFromUi. Regeltreue-Schalter, hfund, n und mode bleiben. Ergebnis geht an stratFromUi. */
  function applyStrategy(ui, preset, deps){
    const u=Object.assign({},ui||{});
    u.wr=preset.wr; u.rr=preset.rr; u.riskPct=preset.riskPct; u.costPct=preset.costPct; u.tradesPerDay=preset.tradesPerDay;
    u.autorisk=true; delete u.risk; delete u.cost;
    for(const k of ['slipMode','slipPct','slipTailPct','slipTailProb','slipBuffer']) delete u[k];
    return Object.assign(u,deps.slipFromUi(preset.slip));
  }

  const byId=id=>STRATEGIES.find(p=>p.id===id)||null;

  const api={STRATEGIES,STRAT_FIELDS,DISCLAIMER,EDGE_MARGIN,EDGE_YES,EDGE_NO,slipMean,breakEven,edgeR,edge,applyStrategy,byId};
  if(typeof module!=='undefined' && module.exports) module.exports=api; else root.GlitchStrategies=api;
})(typeof self!=='undefined'?self:this);
