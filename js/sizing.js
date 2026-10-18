/* Glitch-Simulator – Rechner für Positionsgröße und Risiko (M-027).
   DOM-frei, deps per Parameter: Browser window.GlitchSizing, Node module.exports.
   Ein Konto, ein Trade: Menge aus Risiko und Stop (immer abgerundet), tatsächliches Risiko, Kosten, Ziel,
   Verluste bis DD und Tageslimit, Prüfung gegen die Regeln des Angebots. Die Regelsätze kommen aus
   params.js (autoParams mit maskierten Angebotskopien), nichts davon ist hier nachgebaut.
   deps: {OFFERS, autoParams, contractLimit, INSTRUMENTS, accountSize} */
(function(root){
  'use strict';

  const FUT=['NQ','MNQ','ES','MES'];
  const CFD='CFD';
  const TOL=1e-9;            // Toleranz in Schritten gegen Gleitkomma (1,15 ÷ 0,01 = 114,999…)
  const RISK_MODES=['dd','size','usd'];
  const ZERO_FUT='Stop zu weit oder Risiko zu klein für 1 Kontrakt';
  const NO_SLIP='Ohne Slippage gerechnet: ein Stop kann weiter laufen.';
  const NO_OFFER='Ohne Angebot keine Regelprüfung.';
  const CHECK_SRC='Vor dem Trade die Regeln im Help Center der Firma prüfen.';
  const DLL_CUT='Kein Trade möglich.';

  const nf=new Intl.NumberFormat('de-DE',{maximumFractionDigits:2});
  const neg=s=>s.replace('-','−');
  const money=v=>neg(nf.format(v))+' $';
  const numDe=v=>neg(nf.format(v));
  const r2=x=>Math.round(x*100)/100;
  const deDate=iso=>{ const [y,m,d]=String(iso).split('-'); return `${d}.${m}.${y}`; };
  // Nachkommastellen eines Schritts (0,01 → 2, 0,1 → 1, 1 → 0)
  const decOf=step=>{ for(let d=0;d<=8;d++) if(Math.abs(Math.round(step*10**d)-step*10**d)<1e-9) return d; return 8; };
  const fixedDe=(v,d)=>new Intl.NumberFormat('de-DE',{minimumFractionDigits:d,maximumFractionDigits:d}).format(v);

  const market=g=>/CFD/.test(g||'')?'CFD':'Futures';
  // Angebote für die Auswahl: [{id, name, group, market}] in der Reihenfolge von OFFERS
  function offerList(OFFERS){
    const L=[];
    for(const gr of OFFERS) for(const o of gr.items) L.push({id:o.id,name:o.n,label:`${String(gr.g).split(' · ')[0]} ${o.n}`,group:gr.g,market:market(gr.g)});
    return L;
  }
  function findOffer(OFFERS,id){
    if(!id) return null;
    for(const gr of OFFERS) for(const o of gr.items) if(o.id===id) return {offer:o,market:market(gr.g)};
    return null;
  }
  // Zulässige Instrumente: Futures-Angebot nur Futures, CFD-Angebot nur CFD, eigene Werte alle
  const instrumentsFor=mk=>mk==='Futures'?FUT.slice():mk==='CFD'?[CFD]:FUT.concat([CFD]);

  const isNum=x=>typeof x==='number' && Number.isFinite(x);

  /* Menge auf den Schritt abrunden: steps = ⌊Risiko ÷ (Wert je Schritt) + 1e-9⌋, nie aufrunden über einen echten Schritt. */
  function roundDown(risk, perStep){
    const steps=Math.floor(risk/perStep+TOL);
    return Math.max(0,steps);
  }

  /* Volle Verluste in Folge ab Start bis zum DD-Bruch (Bruch bei eq ≤ −dd wie sim.js); k = Verlust, der bricht. */
  function lossesToDd(dd, L){
    let eq=0, k=0;
    do{ eq-=L; k++; } while(eq>-dd && k<1e6);
    return k;
  }
  /* Volle Verluste je Tag beim regeltreuen Trader: Trade nicht eröffnen, wenn Tages-P&L − L ≤ −Limit (wie sim.js). */
  function lossesPerDay(lim, L){
    let pnl=0, m=0;
    while(pnl-L>-lim && m<1e6){ pnl-=L; m++; }
    return m;
  }

  // Einzelprüfung über autoParams mit Angebotskopie, in der die anderen Grenzen aus sind (kein rr: keine Gewinntag-Prüfung)
  const OFF_DLL={dllEval:0,dllFunded:0,dllScaleFunded:0};
  function maskedReason(deps, offer, mask, ui){
    const P=deps.autoParams(Object.assign({},offer,mask),ui);
    return P.notTradable?P.reason:null;
  }
  const cutDll=s=>{ const i=s.indexOf(DLL_CUT); return i<0?s:s.slice(0,i+DLL_CUT.length); };

  /* Hauptrechnung. inp: {offerId, size, dd, riskMode 'dd'|'size'|'usd', riskVal, instrument, stopPts, costPer, rr, cfdPerPt, lotStep}
     (size/dd nur ohne Angebot). Ergebnis: {ok, errors[], …} – alle Sätze und Zahlen für die Seite. */
  function compute(inp, deps){
    inp=inp||{};
    const found=findOffer(deps.OFFERS,inp.offerId), offer=found?found.offer:null, mk=found?found.market:null;
    const errors=[];
    const size=offer?deps.accountSize(offer):inp.size, dd=offer?offer.dd:inp.dd;
    const ins=inp.instrument, cfd=ins===CFD, fut=FUT.includes(ins);
    if(!fut && !cfd) errors.push('Instrument wählen.');
    else if(!instrumentsFor(mk).includes(ins)) errors.push(mk==='CFD'?'Für ein CFD-Angebot „CFD“ wählen.':'Für ein Futures-Angebot ein Futures-Instrument wählen.');
    if(!offer){
      if(!(isNum(size) && size>0)) errors.push('Kontogröße muss eine Zahl > 0 sein.');
      if(!(isNum(dd) && dd>0)) errors.push('DD muss eine Zahl > 0 sein.');
    }
    if(!RISK_MODES.includes(inp.riskMode)) errors.push('Risiko-Art wählen.');
    if(!(isNum(inp.riskVal) && inp.riskVal>0)) errors.push('Risiko muss eine Zahl > 0 sein.');
    if(!(isNum(inp.stopPts) && inp.stopPts>0)) errors.push('Stop in Punkten muss eine Zahl > 0 sein.');
    if(!(isNum(inp.costPer) && inp.costPer>=0)) errors.push('Kosten müssen eine Zahl ≥ 0 sein.');
    if(!(isNum(inp.rr) && inp.rr>0)) errors.push('CRV muss eine Zahl > 0 sein.');
    if(cfd){
      if(!(isNum(inp.cfdPerPt) && inp.cfdPerPt>0)) errors.push('„$ je Punkt und Lot“ eintragen (hängt vom Broker ab).');
      if(!(isNum(inp.lotStep) && inp.lotStep>0)) errors.push('Lot-Schritt muss eine Zahl > 0 sein.');
    }
    const base={ok:false,errors,offerId:offer?offer.id:null,market:mk,size,dd,notes:[NO_SLIP]};
    if(errors.length) return base;

    const budget=inp.riskMode==='usd'?inp.riskVal:inp.riskMode==='dd'?dd*inp.riskVal/100:size*inp.riskVal/100;
    const budgetText=inp.riskMode==='usd'?money(budget):
      `${numDe(inp.riskVal)} % ${inp.riskMode==='dd'?'des DD':'der Kontogröße'} (${money(inp.riskMode==='dd'?dd:size)}) = ${money(r2(budget))}`;
    const step=cfd?inp.lotStep:1, ptVal=cfd?inp.cfdPerPt:deps.INSTRUMENTS[ins].pt;
    const perStep=inp.stopPts*ptVal*step;
    const steps=roundDown(budget,perStep), dec=cfd?decOf(step):0;
    const qty=Math.round(steps*step*10**dec)/10**dec;
    const unitWord=cfd?'Lots':(qty===1?'Kontrakt':'Kontrakte');
    const qtyText=cfd?`${fixedDe(qty,dec)} Lots`:`${qty} ${ins}`;
    const R=Object.assign(base,{ok:true,budget,budgetText,instrument:ins,step,steps,qty,qtyText,unitWord,perStep,
      lotHint:null,checks:[],violations:[],lines:[]});
    if(offer && offer.rules && offer.rules.lotLimit!=null)
      R.lotHint=`Lot-Limit laut Angebot: ${numDe(offer.rules.lotLimit)} Lots. Geltungsbereich nicht belegt, im Rechner nicht geprüft.`;
    if(steps===0){
      R.zero=true;
      R.zeroText=cfd?`Stop zu weit oder Risiko zu klein für ${fixedDe(step,dec)} Lots`:ZERO_FUT;
      if(offer) R.notes.push(CHECK_SRC+(offer.asof?` Daten Stand ${deDate(offer.asof)}.`:''));
      return R;
    }
    R.zero=false;
    const risk=r2(steps*perStep), cost=r2(qty*inp.costPer), L=risk+cost;
    const target=r2(risk*inp.rr);
    Object.assign(R,{risk,cost,loss:r2(L),target,targetNet:r2(target-cost)});
    R.lines.push({key:'risk',label:'Tatsächliches Risiko',text:`${money(risk)}${risk<budget-0.005?` (Budget ${money(r2(budget))})`:''}`});
    R.lines.push({key:'cost',label:'Kosten',text:`${money(cost)} (${qtyText} × ${money(inp.costPer)})`});
    R.lines.push({key:'loss',label:'Voller Verlust',text:`${money(r2(L))} (Risiko + Kosten)`});
    R.lines.push({key:'target',label:`Ziel bei CRV ${numDe(inp.rr)}`,text:`${money(target)} (nach Kosten ${money(R.targetNet)})`});

    const k=lossesToDd(dd,L);
    const ddWhere=offer?(offer.ddStatic?'ab Start (statischer DD)':'ab Start bzw. ab Höchststand (trailing DD)'):'ab Start bzw. ab Höchststand bei trailing DD';
    R.ddLosses={hit:k,survive:k-1};
    R.lines.push({key:'dd',label:'Verluste bis DD',text:k===1?`Schon der 1. volle Verlust erreicht den DD (${money(dd)}).`:
      `${k-1} ${k===2?'voller Verlust':'volle Verluste'} in Folge überstehbar, der ${k}. erreicht den DD (${money(dd)}) ${ddWhere}.`});

    if(!offer){
      R.lines.push({key:'dll',label:'Verluste je Tag',text:'Ohne Angebot kein Tageslimit.'});
      R.notes.unshift(NO_OFFER);
      return R;
    }
    // Tageslimit je Phase (Text), Urteil nach der strengsten Phase wie autoParams
    const parts=[], phase=(name,lim,scale)=>{
      if(!(lim>0)){ parts.push(`${name} kein Tageslimit`); return; }
      const m=lossesPerDay(lim,L);
      parts.push(`${name} ${money(lim)}${scale?' (steigt mit dem Gewinn)':''}: `+(m===0?'schon ein voller Verlust erreicht das Limit':`höchstens ${m} ${m===1?'voller Verlust':'volle Verluste'} je Tag`));
    };
    if(offer.mode==='challenge') phase('Challenge',offer.dllEval,false);
    phase('Funded',offer.dllFunded,offer.dllScaleFunded>0);
    R.lines.push({key:'dll',label:'Verluste je Tag',text:parts.join('; ')+'.'});

    const ui={risk,cost};
    const lims=[]; if(offer.mode==='challenge' && offer.dllEval>0) lims.push(offer.dllEval); if(offer.dllFunded>0) lims.push(offer.dllFunded);
    if(lims.length){
      const why=maskedReason(deps,offer,{shield:0},ui);
      R.checks.push({key:'dll',label:`Tageslimit ${money(Math.min(...lims))} (strengste Phase)`,ok:!why,text:why?cutDll(why):''});
    }
    if(offer.shield>0){
      const name=offer.rules&&offer.rules.guardianShieldPct>0?'Guardian Shield':'Max Risk';
      const why=maskedReason(deps,offer,OFF_DLL,ui);
      R.checks.push({key:'shield',label:`${name} ${money(offer.shield)} (gilt im Funded)`,ok:!why,text:why||''});
    }
    if(fut){
      const cl=deps.contractLimit(Object.assign({},offer,{instrument:ins,stopPts:inp.stopPts}));
      if(cl){
        const why=maskedReason(deps,offer,Object.assign({shield:0},OFF_DLL),Object.assign({instrument:ins,stopPts:inp.stopPts},ui));
        R.checks.push({key:'contract',label:`Kontraktlimit ${cl.max} ${cl.unit}`,ok:!why,text:why||''});
      }
    }
    R.violations=R.checks.filter(c=>!c.ok).map(c=>c.text);
    R.notes.push(CHECK_SRC+(offer.asof?` Daten Stand ${deDate(offer.asof)}.`:''));
    return R;
  }

  const api={compute,offerList,findOffer,instrumentsFor,roundDown,lossesToDd,lossesPerDay,cutDll,market,
    FUT,CFD,TOL,RISK_MODES,ZERO_FUT,NO_SLIP,NO_OFFER,CHECK_SRC,DLL_CUT};
  if(typeof module!=='undefined' && module.exports) module.exports=api; else root.GlitchSizing=api;
})(typeof self!=='undefined'?self:this);
