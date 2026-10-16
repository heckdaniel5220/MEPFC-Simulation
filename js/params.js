/* Glitch-Simulator – Parameter aus Angebot und Oberfläche (M-007a).
   DOM-frei: Browser window.GlitchParams, Node module.exports.
   autoParams(offer, ui) liefert unvorbereitete Simulationsparameter P (prepare() ruft der Aufrufer). */
(function(root){
  'use strict';

  // Felder mit eigenem Eingabeelement in der Oberfläche. Was hier steht, gewinnt gegen das Angebot.
  const UI_KEYS=['mode','hfund','ddStatic','fee','target','target2','dd','risk','rr','wr','cost','hp','buf','minp','wfrac','cap','split','maxp','n',
    'tradesPerDay','dllCompliant','consCompliant','daysCompliant'];
  // Zahlenfelder mit Regler (Reihenfolge wie in der Oberfläche) und Schalter, die apply(P) schreibt und uiVals() zurückliest
  const NUM_KEYS=['fee','target','target2','dd','risk','rr','wr','cost','hp','buf','minp','wfrac','cap','split','maxp','n'];
  const FLAG_KEYS=['hfund','ddStatic','dllCompliant','consCompliant','daysCompliant'];
  // Strategie: was applyOffer und die Rangliste aus der Oberfläche an autoParams geben
  const STRAT_KEYS=['wr','rr','tradesPerDay','dllCompliant','consCompliant','daysCompliant','hfund'];
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
    // Gewinntage (M-004): Schwelle, die selbst ein Tag nur mit Gewinn-Trades nicht erreicht, prüft prepare() ebenfalls
    if(!P.notTradable && P.rr!==undefined){
      const dayMax=(P.tradesPerDay||1)*(P.risk*P.rr-P.cost);
      const miss=(n,x)=>n>0 && !(x>0 ? dayMax>=x : dayMax>0);
      const x=P.mode==='challenge' && miss(P.evalWinDays,P.evalWinDayMin) ? P.evalWinDayMin : miss(P.payWinDays,P.payWinDayMin) ? P.payWinDayMin : null;
      if(x!==null){
        P.notTradable=true;
        P.reason=`Gewinntag-Schwelle (${x} $) nicht erreichbar: höchster Tagesgewinn = Trades pro Tag × (Risiko × CRV − Kosten) = ${Math.round(dayMax*100)/100} $. Risiko oder Trades pro Tag erhöhen.`;
      }
    }
    return P;
  }

  /* Strategie aus UI-Werten (M-015b). u: wr, rr, tradesPerDay, Regeltreue-Schalter, hfund, n, riskPct, costPct, autorisk, risk, cost.
     opts.n überschreibt n (Rangliste: Accounts je Angebot), opts.hedge === false setzt den Gegentrade auf 0 statt je Angebot zu kalibrieren.
     applyOffer und die Rangliste benutzen dieselbe Funktion, damit der Klick auf eine Ranglisten-Zeile dasselbe P ergibt. */
  function stratFromUi(u, opts){
    opts=opts||{};
    const s={};
    for(const k of STRAT_KEYS) if(u[k]!==undefined) s[k]=u[k];
    s.n=opts.n!==undefined?opts.n:u.n;
    s.riskPct=u.riskPct??DEF.riskPct; s.costPct=u.costPct??DEF.costPct; s.autorisk=u.autorisk!==false;
    if(!s.autorisk){ s.risk=u.risk; s.cost=u.cost; }
    if(opts.hedge===false) s.hp=0;
    return s;
  }

  // Was die Oberfläche nach apply(P) in ihren Feldern hält und uiVals() zurückliest (Zahlenfeld als Text, Anzahlen ganz)
  const num=s=>parseFloat(String(s).replace(',','.'));
  function uiFromP(P){
    const u={mode:P.mode,tradesPerDay:Math.max(1,Math.round(P.tradesPerDay||1))};
    for(const k of FLAG_KEYS) u[k]=k==='hfund'||k==='ddStatic'?!!P[k]:P[k]!==false;
    for(const k of NUM_KEYS){
      let x=num(P[k]!==undefined?P[k]:(k==='target2'?0:NaN));
      if(k==='n'||k==='maxp') x=Math.max(1,Math.round(x));
      u[k]=x;
    }
    return u;
  }

  const api={autoParams,dllMin,calibHp,stratFromUi,uiFromP,UI_KEYS,CTRL_KEYS,CORE_KEYS,NUM_KEYS,FLAG_KEYS,STRAT_KEYS,DEF};
  if(typeof module!=='undefined' && module.exports) module.exports=api; else root.GlitchParams=api;
})(typeof self!=='undefined'?self:this);
