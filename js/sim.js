/* Glitch-Simulator – Simulationskern.
   Läuft im Browser (window.GlitchSim) und in Node (require('./sim.js')).
   Keine DOM-Abhängigkeiten: alles, was gerechnet wird, steht hier. */
(function(root){
  'use strict';

  // Deterministischer Zufallsgenerator: gleicher Seed = gleiche Kursbewegungen
  function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}}

  // Rohwerte aus der Oberfläche (Prozent als Zahl) in Simulationsparameter umrechnen
  function prepare(raw){
    const P=Object.assign({target2:0,ddStatic:false,hfund:false},raw);
    if(P.tradesPerDay===undefined) P.tradesPerDay=1;
    if(!Number.isInteger(P.tradesPerDay) || P.tradesPerDay<1) throw new Error('tradesPerDay muss eine Ganzzahl ≥ 1 sein: '+JSON.stringify(P.tradesPerDay));
    P.p=P.wr/100; P.h=P.hp/100; P.wf=P.wfrac/100; P.sp=P.split/100;
    return P;
  }

  function median(xs){
    if(!xs.length) return null;
    const s=xs.slice().sort((x,y)=>x-y), m=s.length>>1;
    return s.length%2 ? s[m] : (s[m-1]+s[m])/2;
  }

  /* Simuliert P.n Accounts nacheinander.
     Jeder Trade: Gewinn risk*rr mit Wahrscheinlichkeit p, sonst Verlust risk, minus cost.
     Gegentrade (Echtgeld): -h * Brutto-Ergebnis - h * cost, nur in der Absicherungsphase
     (Challenge bzw. bei Instant Funding bis zur ersten Auszahlung), außer hfund=true.
     Handelstage: bis zu tradesPerDay Trades pro Tag. Phasenwechsel (Bestehen, Scheitern,
     Account-Verlust, MAXT) und Auszahlung beenden den Tag; die Rest-Trades verfallen ohne
     Zufallszahl. Die Tagesnummer läuft je Account fortlaufend über alle Phasen. */
  function simulate(P, seed){
    const r=mulberry32(seed>>>0), MAXT=500, TPD=P.tradesPerDay||1;
    const res={accts:[],cumNo:[0],cumHe:[0],cumReal:[0],fees:0,pay:0,hedge:0,realMin:0,fail:0,passNo:0,paid:0,passed:0,nPayTot:0,
      hFail:0,nFail:0,hSucc:0,nSucc:0,hAfter:0};
    const PH=['step1','step2','funded'], sum={}, toPass=[];
    for(const k of PH) sum[k]={n:0,tradingDays:0,winDays:0};
    let real=0, cNo=0, cHe=0;
    for(let i=0;i<P.n;i++){
      const a={passed:P.mode==='instant',pay:0,hedgeEval:0,hedgeFund:0,trades:0,nPay:0,blown:false,
        phases:{step1:null,step2:null,funded:null}};
      const detail=i<12;
      let day=0;
      const trade=(hedgeOn,phase)=>{
        const gross = r()<P.p ? P.risk*P.rr : -P.risk;
        a.trades++;
        if(hedgeOn){ const hv=-P.h*gross - P.h*P.cost; if(phase==='e') a.hedgeEval+=hv; else a.hedgeFund+=hv; real+=hv; if(real<res.realMin) res.realMin=real; }
        return gross-P.cost;
      };
      // Tageszähler einer Phase; ein Tag zählt nur mit mindestens einem Trade
      const openPhase=k=>{ const ph={days:0,winDays:0,firstDay:null,lastDay:null,dayPnl:[]}; a.phases[k]=ph; return ph; };
      const closeDay=(ph,pnl)=>{
        ph.days++; if(pnl>0) ph.winDays++;
        if(ph.firstDay===null) ph.firstDay=day;
        ph.lastDay=day; if(detail) ph.dayPnl.push(pnl);
      };
      if(P.mode==='challenge'){
        const phases=[P.target]; if(P.target2>0) phases.push(P.target2);
        let ok=true;
        for(let s=0;s<phases.length;s++){
          const tg=phases[s], ph=openPhase(PH[s]);
          let eq=0,peak=0,done=false,t=0,end=false;
          while(!end && t<MAXT){
            day++; let pnl=0;
            for(let k=0;k<TPD && t<MAXT;k++){
              const x=trade(P.h>0,'e'); t++; pnl+=x;
              eq+=x; if(eq>peak) peak=eq;
              if(eq>=tg){done=true;end=true;break;}
              const floor=P.ddStatic?-P.dd:Math.min(peak-P.dd,0); if(eq<=floor){end=true;break;}
            }
            closeDay(ph,pnl);
          }
          if(!done){ok=false;break;}
        }
        a.passed=ok;
      }
      if(a.passed){
        const ph=openPhase('funded');
        let eq=0,peak=0,t=0;
        while(t<MAXT && a.nPay<P.maxp && !a.blown){
          day++; let pnl=0;
          for(let k=0;k<TPD && t<MAXT;k++){
            // Absicherungsphase: Challenge (oben) bzw. bei Instant Funding bis zur ersten Auszahlung
            const protect = P.mode==='instant' && a.nPay===0;
            const x=trade(P.h>0 && (P.hfund||protect), protect?'e':'f'); t++; pnl+=x;
            eq+=x; if(eq>peak) peak=eq;
            const floor=P.ddStatic?-P.dd:Math.min(peak-P.dd,0); if(eq<=floor){a.blown=true;break;}
            // Auszahlung beendet den Tag (kein Phasenwechsel)
            if(eq>=P.buf+P.minp){ const w=Math.min(P.cap,(eq-P.buf)*P.wf); eq-=w; a.pay+=w*P.sp; a.nPay++; break; }
          }
          closeDay(ph,pnl);
        }
      }
      for(const k of PH){ const ph=a.phases[k]; if(ph){ sum[k].n++; sum[k].tradingDays+=ph.days; sum[k].winDays+=ph.winDays; } }
      if(P.mode==='challenge' && a.passed) toPass.push(a.phases.step1.days+(a.phases.step2?a.phases.step2.days:0));
      a.hedge=a.hedgeEval+a.hedgeFund;
      const success = P.mode==='instant' ? a.nPay>0 : a.passed;
      if(success){res.hSucc+=a.hedgeEval;res.nSucc++;} else {res.hFail+=a.hedgeEval;res.nFail++;}
      res.hAfter+=a.hedgeFund;
      a.netNo=a.pay-P.fee; a.netHe=a.netNo+a.hedge;
      res.fees+=P.fee; res.pay+=a.pay; res.hedge+=a.hedge; res.nPayTot+=a.nPay;
      if(a.passed) res.passed++;
      if(!a.passed) res.fail++; else if(a.nPay===0) res.passNo++; else res.paid++;
      cNo+=a.netNo; cHe+=a.netHe;
      res.cumNo.push(cNo); res.cumHe.push(cHe); res.cumReal.push(real);
      if(detail) res.accts.push(a);
    }
    res.real=real; res.netNo=cNo; res.netHe=cHe;
    // Mittelwerte je Phase nur über Accounts, die die Phase erreicht haben (sonst null)
    res.days={};
    for(const k of PH){ const s=sum[k]; res.days[k]={n:s.n,tradingDays:s.n?s.tradingDays/s.n:null,winDays:s.n?s.winDays/s.n:null}; }
    res.medianDaysToPass=median(toPass);
    return res;
  }

  const api={mulberry32,prepare,simulate};
  if(typeof module!=='undefined' && module.exports) module.exports=api; else root.GlitchSim=api;
})(typeof self!=='undefined'?self:this);
