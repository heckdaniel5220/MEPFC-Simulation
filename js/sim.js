/* Glitch-Simulator – Simulationskern.
   Läuft im Browser (window.GlitchSim) und in Node (require('./sim.js')).
   Keine DOM-Abhängigkeiten: alles, was gerechnet wird, steht hier. */
(function(root){
  'use strict';

  // Deterministischer Zufallsgenerator: gleicher Seed = gleiche Kursbewegungen
  function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}}

  // Kalender (M-005): Handelstag d (1 = Montag) → Kalendertag über eine Fünf-Tage-Woche (Mo–Fr), Wochenende ohne Handel
  const calDay=d=>7*Math.floor((d-1)/5)+(d-1)%5+1;

  // Rohwerte aus der Oberfläche (Prozent als Zahl) in Simulationsparameter umrechnen
  function prepare(raw){
    const P=Object.assign({target2:0,ddStatic:false,hfund:false},raw);
    if(P.tradesPerDay===undefined) P.tradesPerDay=1;
    if(!Number.isInteger(P.tradesPerDay) || P.tradesPerDay<1) throw new Error('tradesPerDay muss eine Ganzzahl ≥ 1 sein: '+JSON.stringify(P.tradesPerDay));
    // Daily Loss Limit (M-002): 0 = kein Limit
    for(const [k,d] of [['dllEval',0],['dllFunded',0],['dllScaleFunded',0],['dllScaleFrom',0]]){
      if(P[k]===undefined) P[k]=d;
      if(typeof P[k]!=='number' || !Number.isFinite(P[k]) || P[k]<0) throw new Error(k+' muss eine Zahl ≥ 0 sein: '+JSON.stringify(P[k]));
    }
    if(P.dllType===undefined) P.dllType='soft';
    if(P.dllType!=='soft' && P.dllType!=='hard') throw new Error("dllType muss 'soft' oder 'hard' sein: "+JSON.stringify(P.dllType));
    if(P.dllCompliant===undefined) P.dllCompliant=true;
    if(typeof P.dllCompliant!=='boolean') throw new Error('dllCompliant muss true oder false sein: '+JSON.stringify(P.dllCompliant));
    // Ein Limit, das schon ein einzelner Verlust-Trade (risk + cost) erreicht, lässt keinen Trade zu
    const loss=P.risk+P.cost, chk=(name,v)=>{ if(v>0 && loss>=v) throw new Error(`${name} (${v} $) muss größer sein als risk + cost (${loss} $), sonst ist kein Trade erlaubt`); };
    if(P.mode==='challenge') chk('dllEval',P.dllEval);
    chk('dllFunded',P.dllFunded);
    // Scaling greift erst ab dllScaleFrom, das kleinste mögliche Funded-Limit ist dann max(dllFunded, Anteil × Schwelle)
    if(P.dllScaleFunded>0){ const m=Math.max(P.dllFunded,P.dllScaleFunded*P.dllScaleFrom);
      if(loss>=m) throw new Error(`Scaling: max(dllFunded, dllScaleFunded × dllScaleFrom) = ${m} $ muss größer sein als risk + cost (${loss} $), sonst ist kein Trade erlaubt`); }
    // Consistency (M-003): bester Tag < cons % des Gewinns der Phase bzw. des Zyklus, 0 = keine Regel
    for(const k of ['consEval','consFunded']){
      if(P[k]===undefined) P[k]=0;
      if(typeof P[k]!=='number' || !Number.isFinite(P[k]) || P[k]<0 || P[k]>100) throw new Error(k+' muss eine Zahl in [0, 100] sein: '+JSON.stringify(P[k]));
    }
    if(P.consFundedMode===undefined) P.consFundedMode='cycle';
    if(P.consFundedMode!=='cycle' && P.consFundedMode!=='perpetual') throw new Error("consFundedMode muss 'cycle' oder 'perpetual' sein: "+JSON.stringify(P.consFundedMode));
    if(P.consCompliant===undefined) P.consCompliant=true;
    if(typeof P.consCompliant!=='boolean') throw new Error('consCompliant muss true oder false sein: '+JSON.stringify(P.consCompliant));
    // Tage-Regeln (M-004): Mindest-Handelstage und Gewinntage je Step bzw. Auszahlungszyklus, 0 = keine Regel
    for(const k of ['evalMinDays','evalWinDays','payMinDays','payWinDays']){
      if(P[k]===undefined) P[k]=0;
      if(!Number.isInteger(P[k]) || P[k]<0) throw new Error(k+' muss eine Ganzzahl ≥ 0 sein: '+JSON.stringify(P[k]));
    }
    for(const k of ['evalWinDayMin','payWinDayMin']){
      if(P[k]===undefined) P[k]=0;
      if(typeof P[k]!=='number' || !Number.isFinite(P[k]) || P[k]<0) throw new Error(k+' muss eine Zahl ≥ 0 sein: '+JSON.stringify(P[k]));
    }
    if(P.daysCompliant===undefined) P.daysCompliant=true;
    if(typeof P.daysCompliant!=='boolean') throw new Error('daysCompliant muss true oder false sein: '+JSON.stringify(P.daysCompliant));
    // Eine Gewinntag-Schwelle, die kein Tag erreichen kann (alle Trades gewonnen), lässt nie bestehen bzw. auszahlen
    const dayMax=P.tradesPerDay*(P.risk*P.rr-P.cost), reach=(name,n,x)=>{ if(n>0 && !(x>0 ? dayMax>=x : dayMax>0))
      throw new Error(`${name} (${x} $) ist nicht erreichbar: höchster Tagesgewinn tradesPerDay × (risk × rr − cost) = ${dayMax} $`); };
    if(P.mode==='challenge') reach('evalWinDayMin',P.evalWinDays,P.evalWinDayMin);
    reach('payWinDayMin',P.payWinDays,P.payWinDayMin);
    // Kalender und Gebühren (M-005): Wartezeiten in Kalendertagen, wiederkehrende Gebühren, 0 = keine Regel
    for(const k of ['payFirstAfterCal','payEveryCal']){
      if(P[k]===undefined) P[k]=0;
      if(!Number.isInteger(P[k]) || P[k]<0) throw new Error(k+' muss eine Ganzzahl ≥ 0 sein: '+JSON.stringify(P[k]));
    }
    for(const k of ['feeMonthly','feeActivation']){
      if(P[k]===undefined) P[k]=0;
      if(typeof P[k]!=='number' || !Number.isFinite(P[k]) || P[k]<0) throw new Error(k+' muss eine Zahl ≥ 0 sein: '+JSON.stringify(P[k]));
    }
    if(P.calCompliant===undefined) P.calCompliant=true;
    if(typeof P.calCompliant!=='boolean') throw new Error('calCompliant muss true oder false sein: '+JSON.stringify(P.calCompliant));
    // Slippage (M-017): Zusatzverlust am Stop-Loss in % von risk, nur bei Verlust-Trades, 'none' = aus
    if(P.slipMode===undefined) P.slipMode='none';
    if(!['none','fixed','dist'].includes(P.slipMode)) throw new Error("slipMode muss 'none', 'fixed' oder 'dist' sein: "+JSON.stringify(P.slipMode));
    for(const k of ['slipPct','slipTailPct','slipBuffer']){
      if(P[k]===undefined) P[k]=0;
      if(typeof P[k]!=='number' || !Number.isFinite(P[k]) || P[k]<0) throw new Error(k+' muss eine Zahl ≥ 0 sein: '+JSON.stringify(P[k]));
    }
    if(P.slipTailProb===undefined) P.slipTailProb=0;
    if(typeof P.slipTailProb!=='number' || !Number.isFinite(P.slipTailProb) || P.slipTailProb<0 || P.slipTailProb>=1) throw new Error('slipTailProb muss eine Zahl in [0, 1) sein: '+JSON.stringify(P.slipTailProb));
    // Puffer: der regeltreue Trader plant risk × (1 + slipBuffer/100) + cost ein; erreicht das ein Limit, wäre kein Trade erlaubt
    if(P.slipBuffer>0){
      const lb=P.risk*(1+P.slipBuffer/100)+P.cost, chkB=(name,v)=>{ if(v>0 && lb>=v) throw new Error(`${name} (${v} $) muss größer sein als risk × (1 + slipBuffer/100) + cost (${lb} $), sonst ist kein Trade erlaubt`); };
      if(P.mode==='challenge') chkB('dllEval',P.dllEval);
      chkB('dllFunded',P.dllFunded);
      if(P.dllScaleFunded>0) chkB('Scaling: max(dllFunded, dllScaleFunded × dllScaleFrom)',Math.max(P.dllFunded,P.dllScaleFunded*P.dllScaleFrom));
    }
    // Guardian Shield / Max Risk (M-019): offener Verlust eines Funded-Trades (risk + Slippage + cost) ≥ shield ($) ist ein Bruch, 0 = aus
    for(const k of ['shield','shieldSplit']){
      if(P[k]===undefined) P[k]=k==='shield'?0:50;
      if(typeof P[k]!=='number' || !Number.isFinite(P[k]) || P[k]<0) throw new Error(k+' muss eine Zahl ≥ 0 sein: '+JSON.stringify(P[k]));
    }
    if(P.shieldSplit>100) throw new Error('shieldSplit muss eine Zahl in [0, 100] sein: '+JSON.stringify(P.shieldSplit));
    if(P.shieldStrikes===undefined) P.shieldStrikes=2;
    if(!Number.isInteger(P.shieldStrikes) || P.shieldStrikes<1) throw new Error('shieldStrikes muss eine Ganzzahl ≥ 1 sein: '+JSON.stringify(P.shieldStrikes));
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
     Zufallszahl. Die Tagesnummer läuft je Account fortlaufend über alle Phasen.
     Daily Loss Limit: dllEval (Challenge), dllFunded (Funded, optional Scaling auf Anteil × höchster EOD-Gewinn).
     Regeltreu (dllCompliant): kein Trade, dessen voller Verlust (risk + cost) das Limit erreichen würde; der Tag endet.
     Sonst Prüfung nach dem Trade (Drawdown zuerst): soft beendet den Tag, hard beendet Challenge bzw. Account.
     Consistency: Bestehen bzw. Auszahlung erst, wenn bester Tag < cons % des Phasen- bzw. Zyklusgewinns
     (bester Tag = max(bester abgeschlossener Tag, laufender Tages-P&L)). Blockiert die Regel, endet der Tag
     bei consCompliant, sonst wird weiter getradet. Zyklusgewinn = eq − Stand direkt nach der letzten Auszahlung;
     'cycle' setzt den besten Tag nach dem Auszahlungstag auf 0, 'perpetual' nie.
     Tage-Regeln: Bestehen (je Step) bzw. Auszahlung (je Zyklus) erst mit Mindest-Handelstagen und Gewinntagen
     (Tages-P&L ≥ Schwelle, Schwelle 0 = Tages-P&L > 0); der laufende Tag zählt mit. Geprüft nach Consistency.
     Blockieren nur die Tage, endet der Tag bei daysCompliant, sobald der laufende Tag schon zählt.
     Kalender: Tag d → Kalendertag calDay(d) (Mo–Fr, Start Montag). Auszahlung erst ab Kalendertag des 1. Funded-Trades
     + payFirstAfterCal bzw. der letzten Auszahlung + payEveryCal (als Letztes geprüft). Blockiert nur der Kalender:
     calCompliant (Pause) beendet den Tag, Wartetage ohne Trade und ohne Zufallszahl, Auszahlung am Ende des Freigabetags
     ohne Trade (kein Handelstag); sonst wird weiter getradet. Gebühren: fee + feeMonthly je weitere angefangene
     30 Kalendertage der Challenge + feeActivation beim Bestehen.
     Slippage: ein Verlust kostet risk + slip + cost, slip = slipPct (bzw. bei 'dist' mit slipTailProb slipTailPct) % von risk.
     Die Höhe kommt aus der Lage der Zufallszahl im Verlustbereich (u = (r − p)/(1 − p)), keine weitere Zufallszahl.
     Gewinn-Trades (Take-Profit als Limit) ohne Slippage. Gegentrade: bei Prop-Verlust genau h × risk (keine Slippage zu
     seinen Gunsten), bei Prop-Gewinn rutscht sein eigener Stop um h × slip (u = r/p). Der regeltreue Trader prüft vor dem
     Trade mit risk × (1 + slipBuffer/100) + cost; das DLL wird nach jedem Trade auch bei dllCompliant geprüft.
     Guardian Shield / Max Risk (nur Funded): Verlust eines Trades risk + slip + cost ≥ shield ist ein Bruch (nach dem Drawdown,
     vor dem DLL). Ab dem 1. Bruch gilt shieldSplit für alle folgenden Auszahlungen, der shieldStrikes-te Bruch beendet den Account.
     Der Trade wird voll gebucht, der Tag läuft weiter.
     opt (M-021, optional, nicht in P): {from, skip} rechnet nur Account from, Zufallsstrom um skip Ziehungen vorgespult, mit Details;
     {detail:[i, …]} speichert zusätzlich Details für diese Accounts (R.accts nach den ersten 12, aufsteigend). Ohne opt bit-gleich.
     INVARIANTE: genau eine r()-Ziehung je ausgeführtem Trade (nur in trade()), R.list[j].trades zählt diese Trades. Der Zustand von
     mulberry32 wächst je Ziehung um 0x6D2B79F5, Account i startet also bei seed + Σ trades(j < i) · 0x6D2B79F5. Wer eine zweite
     Ziehung einführt, muss accountDetail anpassen (sonst greift dort nur noch der langsame Rückfall). */
  function simulate(P, seed, opt){
    opt=opt||{};
    const one=opt.from!==undefined, from=one?opt.from:0, to=one?opt.from+1:P.n, extra=opt.detail?new Set(opt.detail):null;
    const r=mulberry32(((seed>>>0)+Math.imul(opt.skip||0,0x6D2B79F5))>>>0), MAXT=500, TPD=P.tradesPerDay||1;
    const res={accts:[],list:[],cumNo:[0],cumHe:[0],cumReal:[0],fees:0,pay:0,hedge:0,slipPaid:0,realMin:0,fail:0,passNo:0,paid:0,passed:0,nPayTot:0,
      hFail:0,nFail:0,hSucc:0,nSucc:0,hAfter:0,shieldBreaches:0,shieldLost:0};
    const cal=calDay;
    const PH=['step1','step2','funded'], sum={}, toPass=[];
    for(const k of PH) sum[k]={n:0,tradingDays:0,winDays:0,dllStops:0,dllBreaches:0,dllSlipBreaches:0,ddSlipBreaches:0,shieldBreaches:0,consBlocks:0,daysBlocks:0,calBlocks:0};
    const delays=[], dDelays=[], firstPays=[], firstPayCals=[]; let hitN=0, hitFail=0;
    const LOSS=P.risk+P.cost, hard=P.dllType==='hard';
    // Slippage (M-017): Vorabprüfung des regeltreuen Traders mit Puffer
    const LOSSB=P.slipBuffer>0 ? P.risk*(1+P.slipBuffer/100)+P.cost : LOSS, SLIP=P.slipMode!=='none';
    const slipOf=u=>(P.slipMode==='dist' && u<P.slipTailProb ? P.slipTailPct : P.slipPct)/100*P.risk;
    let real=0, cNo=0, cHe=0;
    for(let i=from;i<to;i++){
      const a={passed:P.mode==='instant',pay:0,hedgeEval:0,hedgeFund:0,trades:0,nPay:0,blown:false,slipPaid:0,shieldLost:false,
        phases:{step1:null,step2:null,funded:null}};
      const detail=i<12 || one || (extra!==null && extra.has(i));
      let day=0, evalEnd=0, lastSlip=0, lastLoss=0, sp=P.sp;
      const trade=(hedgeOn,phase)=>{
        const z=r(), win=z<P.p;
        // Slippage-Höhe aus der Lage von z im Verlust- bzw. Gewinnbereich (dort jeweils gleichverteilt)
        let slip=0, hslip=0;
        if(SLIP){ if(!win) slip=slipOf((z-P.p)/(1-P.p)); else if(hedgeOn) hslip=slipOf(z/P.p); }
        const gross = win ? P.risk*P.rr : -P.risk-slip;
        a.trades++; a.slipPaid+=slip; lastSlip=slip; lastLoss=win?0:P.risk+slip+P.cost;
        // Gegentrade: Take-Profit (Prop-Verlust) als Limit ohne Slippage, eigener Stop (Prop-Gewinn) mit h × Slippage
        if(hedgeOn){ const hv=win ? -P.h*gross - P.h*hslip - P.h*P.cost : P.h*P.risk - P.h*P.cost; if(phase==='e') a.hedgeEval+=hv; else a.hedgeFund+=hv; real+=hv; if(real<res.realMin) res.realMin=real; }
        return gross-P.cost;
      };
      // Tageszähler einer Phase; ein Tag zählt nur mit mindestens einem Trade
      const openPhase=k=>{ const ph={days:0,winDays:0,firstDay:null,lastDay:null,dayPnl:[],dayDll:[],dllStops:0,dllBreaches:0,dllSlipBreaches:0,ddSlipBreaches:0,shieldBreaches:0,consBlocks:0,daysBlocks:0,calBlocks:0,firstPayDay:null,payDays:[],bestDay:[]}; a.phases[k]=ph; return ph; };
      // DLL vor dem Trade (regeltreu): true = Trade verweigert, Tag endet
      const refuse=(ph,lim,pnl)=>{ if(lim>0 && P.dllCompliant && pnl-LOSSB<=-lim){ ph.dllStops++; return true; } return false; };
      // DLL nach dem Trade: 0 = weiter, 1 = Tag endet (soft), 2 = Bruch (hard)
      // Durch Slippage: ohne die Slippage dieses Trades wäre das Limit nicht erreicht (beim regeltreuen Trader immer)
      const breach=(ph,lim,pnl,slotLeft)=>{
        if(!(lim>0) || pnl>-lim) return 0;
        if(pnl+lastSlip>-lim) ph.dllSlipBreaches++;
        if(P.dllCompliant){ if(hard){ ph.dllBreaches++; return 2; } return 1; }
        if(hard){ ph.dllStops++; ph.dllBreaches++; return 2; }
        if(slotLeft) ph.dllStops++;
        return 1;
      };
      // DD-Bruch durch Slippage: ohne die Slippage dieses Trades bliebe eq über dem Floor
      const ddSlip=(ph,eq,floor)=>{ if(eq+lastSlip>floor) ph.ddSlipBreaches++; };
      // Guardian Shield: offener Verlust des Trades (risk + Slippage + cost) erreicht die Grenze
      const shieldHit=()=>P.shield>0 && lastLoss>0 && lastLoss>=P.shield;
      // Consistency: true = Bestehen bzw. Auszahlung erlaubt
      const consOk=(pct,best,pnl,gain)=>!(pct>0) || Math.max(best,pnl) < pct/100*gain;
      // Blockade höchstens einmal pro Tag zählen
      const block=(ph,st)=>{ if(!st.blk){ st.blk=true; ph.consBlocks++; } };
      // Tage-Regeln: Gewinntag bei Tages-P&L ≥ x (x = 0: > 0); td/wd = abgeschlossene Handels- bzw. Gewinntage, der laufende Tag zählt mit
      const isWin=(pnl,x)=>x>0 ? pnl>=x : pnl>0;
      const daysOk=(td,wd,pnl,minD,winD,x)=>td+1>=minD && wd+(isWin(pnl,x)?1:0)>=winD;
      // Weitertraden lohnt nur, solange Gewinntage fehlen und der laufende Tag noch keiner ist
      const daysStop=(wd,pnl,winD,x)=>wd>=winD || isWin(pnl,x);
      const dblock=(ph,st)=>{ if(!st.dblk){ st.dblk=true; ph.daysBlocks++; } };
      const closeDay=(ph,pnl,lim,best)=>{
        ph.days++; if(pnl>0) ph.winDays++;
        if(ph.firstDay===null) ph.firstDay=day;
        ph.lastDay=day; if(detail){ ph.dayPnl.push(pnl); ph.dayDll.push(lim); ph.bestDay.push(best); }
      };
      if(P.mode==='challenge'){
        const phases=[P.target]; if(P.target2>0) phases.push(P.target2);
        let ok=true, delay=0, dDelay=0;
        for(let s=0;s<phases.length;s++){
          const tg=phases[s], ph=openPhase(PH[s]);
          let eq=0,peak=0,done=false,t=0,end=false,best=0,hit=false,firstBlk=null,td=0,wd=0,dFirst=null;
          while(!end && t<MAXT){
            day++; let pnl=0; const st={blk:false,dblk:false};
            for(let k=0;k<TPD && t<MAXT;k++){
              if(refuse(ph,P.dllEval,pnl)) break;
              const x=trade(P.h>0,'e'); t++; pnl+=x;
              eq+=x; if(eq>peak) peak=eq;
              let blocked=false, dBlocked=false;
              if(eq>=tg){
                hit=true;
                if(!consOk(P.consEval,best,pnl,eq)){ block(ph,st); if(firstBlk===null) firstBlk=day; blocked=true; }
                else if(daysOk(td,wd,pnl,P.evalMinDays,P.evalWinDays,P.evalWinDayMin)){done=true;end=true;break;}
                else { dblock(ph,st); if(dFirst===null) dFirst=day; dBlocked=true; }
              }
              const floor=P.ddStatic?-P.dd:Math.min(peak-P.dd,0); if(eq<=floor){ddSlip(ph,eq,floor);end=true;break;}
              const b=breach(ph,P.dllEval,pnl,k+1<TPD && t<MAXT); if(b===2){end=true;break;} if(b===1) break;
              // Regeltreu: Ziel erreicht, Regel blockiert → Tag endet
              if(blocked && P.consCompliant) break;
              // Regeltreu: nur Tage fehlen und der laufende Tag zählt schon → Tag endet
              if(dBlocked && P.daysCompliant && daysStop(wd,pnl,P.evalWinDays,P.evalWinDayMin)) break;
            }
            if(pnl>best) best=pnl;
            td++; if(isWin(pnl,P.evalWinDayMin)) wd++;
            closeDay(ph,pnl,P.dllEval,best);
          }
          if(hit){ hitN++; if(!done) hitFail++; }
          if(!done){ok=false;break;}
          if(firstBlk!==null) delay+=day-firstBlk;
          if(dFirst!==null) dDelay+=day-dFirst;
        }
        if(ok){ delays.push(delay); dDelays.push(dDelay); }
        a.passed=ok; evalEnd=day;
      }
      if(a.passed){
        const ph=openPhase('funded');
        let eq=0,peak=0,t=0,peakEod=0,best=0,base=0,ctd=0,cwd=0,calFirst=0,calLast=0,wait=false;
        // Kalender: frühester Kalendertag der nächsten Auszahlung
        const unlock=()=>a.nPay===0 ? calFirst+P.payFirstAfterCal : calLast+P.payEveryCal;
        const pay=()=>{
          const w=Math.min(P.cap,(eq-P.buf)*P.wf); eq-=w; a.pay+=w*sp; a.nPay++; base=eq; calLast=cal(day);
          if(ph.firstPayDay===null) ph.firstPayDay=day;
          if(detail) ph.payDays.push(day);
        };
        while(t<MAXT && a.nPay<P.maxp && !a.blown){
          day++;
          if(calFirst===0) calFirst=cal(day);
          // Pause: Wartetage ohne Trade bis zum Freigabetag, dort Auszahlung am Tagesende ohne Trade (kein Handelstag)
          if(wait){
            const u=unlock(); while(cal(day)<u) day++;
            wait=false; pay();
            if(P.consFundedMode==='cycle') best=0;
            ctd=0; cwd=0; if(eq>peakEod) peakEod=eq;
            continue;
          }
          let pnl=0, paid=false; const st={blk:false,dblk:false,cblk:false};
          // Aktives Limit für den ganzen Tag; Scaling ab dllScaleFrom, Höchstwert sinkt nie
          const lim = P.dllScaleFunded>0 && peakEod>=P.dllScaleFrom ? Math.max(P.dllFunded,P.dllScaleFunded*peakEod) : P.dllFunded;
          for(let k=0;k<TPD && t<MAXT;k++){
            if(refuse(ph,lim,pnl)) break;
            // Absicherungsphase: Challenge (oben) bzw. bei Instant Funding bis zur ersten Auszahlung
            const protect = P.mode==='instant' && a.nPay===0;
            const x=trade(P.h>0 && (P.hfund||protect), protect?'e':'f'); t++; pnl+=x;
            eq+=x; if(eq>peak) peak=eq;
            const floor=P.ddStatic?-P.dd:Math.min(peak-P.dd,0); if(eq<=floor){ddSlip(ph,eq,floor);a.blown=true;break;}
            // Shield nach dem Drawdown, vor dem DLL: 1. Bruch Split, letzter Bruch Account verloren
            if(shieldHit()){ ph.shieldBreaches++; if(ph.shieldBreaches>=P.shieldStrikes){ a.shieldLost=true; a.blown=true; break; } sp=P.shieldSplit/100; }
            const b=breach(ph,lim,pnl,k+1<TPD && t<MAXT); if(b===2){a.blown=true;break;} if(b===1) break;
            // Auszahlung beendet den Tag (kein Phasenwechsel)
            // Zyklus: ctd/cwd = abgeschlossene Handels- bzw. Gewinntage seit der letzten Auszahlung
            if(eq>=P.buf+P.minp){
              if(!consOk(P.consFunded,best,pnl,eq-base)){ block(ph,st); if(P.consCompliant) break; }
              else if(daysOk(ctd,cwd,pnl,P.payMinDays,P.payWinDays,P.payWinDayMin)){
                // Kalender als Letztes: blockiert nur er, Pause (Tag endet, Auszahlung am Freigabetag) oder weitertraden
                if(cal(day)<unlock()){
                  if(!st.cblk){ st.cblk=true; ph.calBlocks++; }
                  if(P.calCompliant){ wait=true; break; }
                }
                else { pay(); paid=true; break; }
              }
              else { dblock(ph,st); if(P.daysCompliant && daysStop(cwd,pnl,P.payWinDays,P.payWinDayMin)) break; }
            }
          }
          // 'cycle': Auszahlungstag gehört zum alten Zyklus, danach bester Tag 0; 'perpetual': kein Reset
          if(paid && P.consFundedMode==='cycle') best=0; else if(pnl>best) best=pnl;
          // Neuer Zyklus ab dem Folgetag mit 0 Tagen
          if(paid){ ctd=0; cwd=0; } else { ctd++; if(isWin(pnl,P.payWinDayMin)) cwd++; }
          closeDay(ph,pnl,lim,best);
          // EOD-Gewinn nach einer eventuellen Auszahlung
          if(eq>peakEod) peakEod=eq;
        }
      }
      for(const k of PH){ const ph=a.phases[k]; if(ph){ sum[k].n++; sum[k].tradingDays+=ph.days; sum[k].winDays+=ph.winDays; sum[k].dllStops+=ph.dllStops; sum[k].dllBreaches+=ph.dllBreaches; sum[k].dllSlipBreaches+=ph.dllSlipBreaches; sum[k].ddSlipBreaches+=ph.ddSlipBreaches; sum[k].shieldBreaches+=ph.shieldBreaches; sum[k].consBlocks+=ph.consBlocks; sum[k].daysBlocks+=ph.daysBlocks; sum[k].calBlocks+=ph.calBlocks; } }
      if(P.mode==='challenge' && a.passed) toPass.push(a.phases.step1.days+(a.phases.step2?a.phases.step2.days:0));
      const fpd=a.phases.funded?a.phases.funded.firstPayDay:null;
      if(fpd!==null){ firstPays.push(fpd); firstPayCals.push(cal(fpd)); }
      // Gebühren: Challenge-Abo je weitere angefangene 30 Kalendertage bis Bestehen bzw. Scheitern, Aktivierung beim Bestehen
      a.feesPaid=P.mode==='challenge' ? P.fee+P.feeMonthly*(Math.ceil(cal(evalEnd)/30)-1)+(a.passed?P.feeActivation:0) : P.fee;
      a.calDays=cal(day);
      a.hedge=a.hedgeEval+a.hedgeFund;
      const success = P.mode==='instant' ? a.nPay>0 : a.passed;
      if(success){res.hSucc+=a.hedgeEval;res.nSucc++;} else {res.hFail+=a.hedgeEval;res.nFail++;}
      res.hAfter+=a.hedgeFund;
      a.netNo=a.pay-a.feesPaid; a.netHe=a.netNo+a.hedge;
      const shB=a.phases.funded?a.phases.funded.shieldBreaches:0; res.shieldBreaches+=shB; if(a.shieldLost) res.shieldLost++;
      res.fees+=a.feesPaid; res.pay+=a.pay; res.slipPaid+=a.slipPaid; res.hedge+=a.hedge; res.nPayTot+=a.nPay;
      if(a.passed) res.passed++;
      if(!a.passed) res.fail++; else if(a.nPay===0) res.passNo++; else res.paid++;
      cNo+=a.netNo; cHe+=a.netHe;
      res.cumNo.push(cNo); res.cumHe.push(cHe); res.cumReal.push(real);
      if(detail) res.accts.push(a);
      // Kompakte Zeile je Account (alle n): Ergebnis 'fail' (Challenge verloren), 'pass' (ohne Auszahlung), 'paid' (≥ 1 Auszahlung)
      // daysToFirstPay: Tagesnummer der 1. Auszahlung ab Account-Start (inkl. Challenge), ohne Auszahlung null
      // calDays: Kalendertag des letzten Account-Tags, calToFirstPay: Kalendertag der 1. Auszahlung (ohne null), feesPaid: alle Gebühren
      // slipPaid: Summe der Slippage in $ auf dem Prop-Konto; shieldBreaches/shieldLost: Shield-Brüche, Account durch den Shield beendet
      res.list.push({i,res:!a.passed?'fail':a.nPay>0?'paid':'pass',trades:a.trades,days:day,daysToFirstPay:fpd,nPay:a.nPay,pay:a.pay,hedge:a.hedge,netNo:a.netNo,netHe:a.netHe,
        calDays:a.calDays,calToFirstPay:fpd===null?null:cal(fpd),feesPaid:a.feesPaid,slipPaid:a.slipPaid,shieldBreaches:shB,shieldLost:a.shieldLost});
    }
    res.real=real; res.netNo=cNo; res.netHe=cHe;
    // Mittelwerte je Phase nur über Accounts, die die Phase erreicht haben (sonst null)
    res.days={};
    for(const k of PH){ const s=sum[k]; res.days[k]={n:s.n,tradingDays:s.n?s.tradingDays/s.n:null,winDays:s.n?s.winDays/s.n:null,
      dllStops:s.n?s.dllStops/s.n:null,dllBreaches:s.n?s.dllBreaches/s.n:null,
      dllSlipBreaches:s.n?s.dllSlipBreaches/s.n:null,ddSlipBreaches:s.n?s.ddSlipBreaches/s.n:null,shieldBreaches:s.n?s.shieldBreaches/s.n:null,consBlocks:s.n?s.consBlocks/s.n:null,daysBlocks:s.n?s.daysBlocks/s.n:null,
      calBlocks:s.n?s.calBlocks/s.n:null}; }
    res.medianDaysToPass=median(toPass);
    // Consistency: Zusatztage vom ersten Blockade-Tag bis zum Bestehen (Step 1 + Step 2), Mittel über bestandene Accounts
    res.consPassDelay=delays.length?delays.reduce((x,y)=>x+y,0)/delays.length:null;
    res.consTargetFails={n:hitFail,hit:hitN,share:hitN?hitFail/hitN:null};
    // Tage-Regeln: Zusatztage vom ersten Tage-Blockade-Tag bis zum Bestehen (Step 1 + Step 2), Mittel über bestandene Accounts
    const mean=xs=>xs.length?xs.reduce((x,y)=>x+y,0)/xs.length:null;
    res.daysPassDelay=mean(dDelays);
    // Tagesnummer (ab Account-Start, inkl. Challenge) der 1. Auszahlung, Mittel über Accounts mit Auszahlung
    res.days.funded.daysToFirstPay=mean(firstPays);
    // Kalender (M-005): Kalendertag der 1. Auszahlung ab Account-Start, Mittel über Accounts mit Auszahlung
    res.days.funded.calToFirstPay=mean(firstPayCals);
    return res;
  }

  /* Detail eines beliebigen Accounts i nachrechnen (M-021). list = R.list des Laufs mit demselben P und Seed.
     Weg B: Strom um Σ list[j].trades (j < i) vorspulen und nur Account i rechnen (siehe INVARIANTE bei simulate).
     Gegenprüfung aller Felder der Zeile gegen list[i]; weicht etwas ab, Rückfall auf Weg A (voller Lauf mit detail:[i]).
     Ergebnis: {acct, fallback}. lazy = true: ohne Rückfall-Lauf, bei Abweichung {acct:null, fallback:true} (Aufrufer rechnet später). */
  function accountDetail(P, seed, list, i, lazy){
    if(!Number.isInteger(i) || i<0 || i>=list.length) throw new Error('accountDetail: Index außerhalb: '+i);
    let skip=0; for(let j=0;j<i;j++) skip+=list[j].trades;
    const R=simulate(P,seed,{from:i,skip}), row=R.list[0], want=list[i];
    const keys=Object.keys(want);
    const same=keys.length===Object.keys(row).length && keys.every(k=>Object.is(row[k],want[k]));
    if(same) return {acct:R.accts[0],fallback:false};
    if(lazy) return {acct:null,fallback:true};
    const A=simulate(P,seed,{detail:[i]});
    return {acct:i<12?A.accts[i]:A.accts[12],fallback:true};
  }

  const api={mulberry32,prepare,simulate,calDay,accountDetail};
  if(typeof module!=='undefined' && module.exports) module.exports=api; else root.GlitchSim=api;
})(typeof self!=='undefined'?self:this);
