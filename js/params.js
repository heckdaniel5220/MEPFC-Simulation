/* Glitch-Simulator – Parameter aus Angebot und Oberfläche (M-007a).
   DOM-frei: Browser window.GlitchParams, Node module.exports.
   autoParams(offer, ui) liefert unvorbereitete Simulationsparameter P (prepare() ruft der Aufrufer). */
(function(root){
  'use strict';

  // Felder mit eigenem Eingabeelement in der Oberfläche. Was hier steht, gewinnt gegen das Angebot.
  const UI_KEYS=['mode','hfund','ddStatic','fee','target','target2','dd','risk','rr','wr','cost','hp','buf','minp','wfrac','cap','split','maxp','n',
    'tradesPerDay','dllCompliant','consCompliant'];
  // Steuerfelder der Oberfläche, die nur die Berechnung lenken und nicht in P landen
  const CTRL_KEYS=['riskPct','costPct','autorisk'];
  // Angebotsfelder, die bewusst auf ein UI-Feld abgebildet werden
  const CORE_KEYS=['n','mode','fee','target','target2','dd','ddStatic','buf','minp','wfrac','cap','split','maxp'];
  const DEF={riskPct:25,costPct:2};

  // Gegentrade wie im Video: Fee zurück + 25 %, höchstens 30 %
  const calibHp=(fee,dd)=>Math.min(30,Math.round(fee*1.25/dd*200)/2);
  const autoCost=(risk,costPct)=>Math.max(1,Math.round(risk*costPct/100));

  // Kleinstes Tageslimit, das prepare() im Modus prüft (null = kein Limit)
  function dllMin(P){
    const L=[];
    if(P.mode==='challenge' && P.dllEval>0) L.push(P.dllEval);
    if(P.dllFunded>0) L.push(P.dllFunded);
    if(P.dllScaleFunded>0) L.push(Math.max(P.dllFunded||0,P.dllScaleFunded*P.dllScaleFrom));
    return L.length?Math.min(...L):null;
  }

  function autoParams(offer, ui){
    ui=ui||{};
    const own={}; for(const k in ui) if(!CTRL_KEYS.includes(k)) own[k]=ui[k];
    if(!offer) return own;

    const instant=offer.mode==='instant';
    const P=Object.assign({},offer,{
      target:instant?0:offer.target, target2:instant?0:(offer.target2||0), ddStatic:!!offer.ddStatic,
      hfund:false, hp:calibHp(offer.fee,offer.dd)});
    const riskPct=ui.riskPct??DEF.riskPct, costPct=ui.costPct??DEF.costPct;
    const auto=ui.risk===undefined && ui.autorisk!==false;
    if(auto){
      let r=Math.max(10,Math.round(offer.dd*riskPct/100/5)*5);
      if(offer.maxRisk) r=Math.min(r,offer.maxRisk);
      P.risk=r; P.cost=autoCost(r,costPct);
    }
    Object.assign(P,own);
    if(ui.n!==undefined) P.n=ui.n; else delete P.n;

    const lim=dllMin(P);
    if(lim!==null && P.risk+P.cost>=lim){
      if(auto){
        const from=P.risk;
        let r=Math.floor(Math.min(from,lim)/5)*5;
        while(r>=5 && r+autoCost(r,costPct)>=lim) r-=5;
        if(r>=5){
          P.risk=r; P.cost=autoCost(r,costPct); P.riskCapped=true;
          P.reason=`Risiko auf ${r} $ gedeckelt (statt ${from} $), damit Risiko + Kosten (${r+P.cost} $) unter dem Tageslimit (${lim} $) bleiben.`;
        } else {
          P.notTradable=true;
          P.reason=`Auch mit 5 $ Risiko erreichen Risiko + Kosten (${5+autoCost(5,costPct)} $) das Tageslimit (${lim} $). Kein Trade möglich.`;
        }
      } else {
        P.notTradable=true;
        P.reason=`Risiko + Kosten (${P.risk+P.cost} $) erreichen das Tageslimit (${lim} $). Kein Trade möglich. Risiko senken oder „Risiko & Kosten anpassen“ einschalten.`;
      }
    }
    return P;
  }

  const api={autoParams,dllMin,calibHp,UI_KEYS,CTRL_KEYS,CORE_KEYS,DEF};
  if(typeof module!=='undefined' && module.exports) module.exports=api; else root.GlitchParams=api;
})(typeof self!=='undefined'?self:this);
