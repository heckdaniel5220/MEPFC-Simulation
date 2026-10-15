/* Glitch-Simulator – Daten: Szenario-Buttons (PRESETS) und Challenge-Angebote (OFFERS).
   Stand der Angebote: 15.10.2026. Fee = Preis mit aktuellem Rabattcode, ohne belegten Code der Listenpreis.
   Alpha Futures und Lucid: pro Eintrag src (Quelle), asof (Stand) und rules (Rohregeln).
   Quellen und offene Punkte: siehe CLAUDE.md. */
(function(root){
  'use strict';
  const PRESETS = {
    futures:{mode:'challenge',fee:100,target:3000,dd:2000,risk:500,rr:1.5,wr:40,cost:10,hp:6.5,hfund:false,buf:100,minp:1500,wfrac:50,cap:2000,split:90,maxp:5,n:500},
    coin:   {mode:'challenge',fee:100,target:3000,dd:2000,risk:2000,rr:1.5,wr:40,cost:10,hp:6.5,hfund:false,buf:100,minp:1500,wfrac:50,cap:2000,split:90,maxp:5,n:500},
    edge:   {mode:'challenge',fee:100,target:3000,dd:2000,risk:500,rr:1.5,wr:46,cost:10,hp:6.5,hfund:false,buf:100,minp:1500,wfrac:50,cap:2000,split:90,maxp:5,n:500},
    afstd:  {mode:'challenge',fee:65,target:3000,dd:2000,risk:500,rr:1.5,wr:40,cost:10,hp:4,hfund:false,buf:100,minp:1000,wfrac:100,cap:3000,split:90,maxp:5,n:500},
    instant:{mode:'instant',fee:97,target:3000,dd:2500,risk:250,rr:1,wr:50,cost:20,hp:5,hfund:false,buf:1500,minp:500,wfrac:100,cap:10000,split:90,maxp:5,n:500}
  };

  // ---- Alle recherchierten Challenge-Angebote (Fee = Preis mit aktuellem Code) ----
  const AC = (size,fee,list,code)=>({mode:'instant',fee,list,code,maxRisk:size*0.01,target:0,target2:0,dd:size*0.05,ddStatic:false,buf:size*0.03,minp:size*0.01,wfrac:100,cap:100000,split:90,maxp:5,
    note:'Ohne Challenge. Daily Loss 3 %, max. 1 % offenes Risiko pro Asset, 15 % Best-Day-Regel, kein Wochenende, Gegentrades verboten.'});
  // ---- Alpha Futures: offizielle Regeln aus help.alpha-futures.com (Artikel Juli/Aug. 2026), Stand 15.10.2026 ----
  // rules = Rohregeln (null = Regel gilt nicht), der Kern liest sie noch nicht. Abbildung auf Kernfelder: siehe CLAUDE.md.
  const AF_SRC={
    zero:'https://help.alpha-futures.com/en/articles/11771813-zero-account-overview',
    std:'https://help.alpha-futures.com/en/articles/11632512-standard-account-overview',
    adv:'https://help.alpha-futures.com/en/articles/11634907-advanced-account-overview',
    direct:'https://help.alpha-futures.com/en/articles/15838742-direct-account-overview'};
  // Eval: id, Name, Plan, Preis/Monat, Reset, Ziel, MLL, DLG Eval/Funded, Consistency Eval/Funded %, Auszahlung min/max, Mini/Micro, Scaling, News Funded
  // Direct: id, Name, Plan, Preis einmalig, –, Auszahlungsziel 1./2.+, MLL, DLG, Consistency %, Auszahlung min/max, Mini/Micro, Scaling, News
  const AF_ROWS=[
    ['af-zero-25','Zero 25k','zero',89,79,1500,1000,500,500,null,40,200,1000,1,10,false,'eingeschränkt'],
    ['af-zero-50','Zero 50k','zero',139,119,3000,2000,1000,1000,null,40,200,1500,3,30,true,'eingeschränkt'],
    ['af-zero-100','Zero 100k','zero',279,249,6000,3000,2000,2000,null,40,200,2500,6,60,true,'eingeschränkt'],
    ['af-std-50','Standard 50k','std',129,109,3000,2000,null,1000,50,40,500,3000,5,50,true,'eingeschränkt'],
    ['af-std-100','Standard 100k','std',239,199,6000,3000,null,2000,50,40,500,4000,10,100,true,'eingeschränkt'],
    ['af-std-150','Standard 150k','std',349,289,9000,4500,null,3000,50,40,500,5000,15,150,true,'eingeschränkt'],
    ['af-adv-50','Advanced 50k','adv',209,189,4000,1750,null,null,40,null,1000,15000,5,50,false,'keine'],
    ['af-adv-100','Advanced 100k','adv',349,319,8000,3500,null,null,40,null,1000,15000,10,100,false,'keine'],
    ['af-adv-150','Advanced 150k','adv',489,449,12000,5250,null,null,40,null,1000,15000,15,150,false,'keine'],
    ['af-direct-25','Direct 25k','direct',349,null,[1500,1000],1000,null,500,null,20,500,1000,2,20,false,'eingeschränkt'],
    ['af-direct-50','Direct 50k','direct',519,null,[3000,2000],2000,null,1000,null,20,500,2000,4,40,false,'eingeschränkt'],
    ['af-direct-100','Direct 100k','direct',689,null,[6000,4000],3000,null,2000,null,20,500,2500,8,80,false,'eingeschränkt'],
    ['af-direct-150','Direct 150k','direct',859,null,[9000,6000],4500,null,3000,null,20,500,3000,10,100,false,'eingeschränkt']
  ];
  const AF = ([id,n,plan,price,reset,goal,mll,dlgEval,dlgFunded,consEval,consFunded,payoutMin,payoutMax,maxMini,maxMicro,scaling,newsFunded])=>{
    const direct=plan==='direct';
    const rules={price,reset,target:direct?null:goal,mll,mllType:'eod-trailing-lock-start',dlgEval,dlgFunded,dlgType:'soft',consEval,consFunded,
      payoutMin,payoutMax,payoutFrac:direct?null:0.5,winDays:direct?null:5,winDayMin:direct?null:200,maxReqPerMonth:direct?null:4,
      wTarget1:direct?goal[0]:null,wTarget2:direct?goal[1]:null,maxMini,maxMicro,scaling,newsFunded,flatBy:'16:20 ET',billing:direct?'once':'monthly'};
    // minp: Eval = max(2 × Mindestauszahlung; 5 Gewinntage × 200 $), Direct = 1. Auszahlungsziel für alle Zyklen
    const minp=direct?goal[0]:Math.max(2*payoutMin,5*200);
    const fmt=v=>v.toLocaleString('de-DE');
    const regeln=[
      `DLG ${dlgEval==null&&dlgFunded==null?'keiner':(direct?fmt(dlgFunded)+' $':`Eval ${dlgEval==null?'–':fmt(dlgEval)+' $'}, Funded ${dlgFunded==null?'–':fmt(dlgFunded)+' $'}`)+' (soft)'}`,
      `Consistency ${direct?consFunded+' %':`Eval ${consEval==null?'–':consEval+' %'}, Funded ${consFunded==null?'–':consFunded+' %'}`}`,
      direct?`Auszahlungsziel ${fmt(goal[0])} $, ab 2. Antrag ${fmt(goal[1])} $, je Zyklus neu`:`Auszahlung nach 5 Gewinntagen ≥ 200 $, max. 50 % des Gewinns, max. 4 Anträge/Monat`,
      `Auszahlung ${fmt(payoutMin)}–${fmt(payoutMax)} $, max. ${maxMini} Mini/${maxMicro} Micro, Scaling ${scaling?'ja':'nein'}, News Funded ${newsFunded}, flat bis 16:20 ET`].join('. ')+'.';
    const annahmen=`Annahmen: MLL EOD-trailing, Kern pro Trade (konservativ bis M-001/M-002). minp ${fmt(minp)} $ ${direct?'= 1. Auszahlungsziel für alle Zyklen':'nähert Gewinntage und Mindestauszahlung an'}. wfrac 50 %${direct?' ohne offizielle Angabe (konservativ)':''}. Fee = Listenpreis, kein belegter Rabattcode.`;
    return {id,n,mode:direct?'instant':'challenge',fee:price,list:direct?`${price} $ einmalig`:`${price} $/Monat`,code:'–',
      target:direct?0:goal,target2:0,dd:mll,buf:0,minp,wfrac:50,cap:payoutMax,split:90,maxp:5,
      src:AF_SRC[plan],asof:'2026-10-15',rules,note:regeln+' '+annahmen};
  };
  // ---- Lucid Trading: Regeln aus support.lucidtrading.com (Artikel Juli/Aug. 2026), Preise lucidtrading.com/#plans, Stand 15.10.2026 ----
  // Gewählt ist je Plan die strengste Konfiguration: Flex/Pro DLL an, Daily DLL an + Eval intraday, Direct fest. Abbildung: siehe CLAUDE.md.
  const LU_SRC={
    flex:'https://support.lucidtrading.com/en/articles/12945790-lucidflex-evaluation-account',
    pro:'https://support.lucidtrading.com/en/articles/12890029-lucidpro-evaluation-account',
    daily:'https://support.lucidtrading.com/en/articles/15996664-luciddaily-evaluation',
    direct:'https://support.lucidtrading.com/en/articles/12890148-luciddirect-funded-account'};
  const LU_SIZE={25:[2,20],50:[4,40],100:[6,60],150:[10,100]}; // max. Mini/Micro
  // Größe, Liste, VAULT, Reset, Ziel, MLL, Trail-Balance, DLL Eval, DLL Funded, plus planeigene Werte
  const LU_ROWS=[
    // Flex: … Cap (fest), Tagesminimum der 5 Gewinntage, Aktionspreis
    ['flex',25,89,65.30,65,1250,1000,26100,600,600,{cap:1000,winDayMin:100,promo:50.30}],
    ['flex',50,146,105.20,105,3000,2000,52100,1200,1200,{cap:2000,winDayMin:150,promo:90.20}],
    ['flex',100,293,215.60,215,6000,3000,103100,1800,1800,{cap:2500,winDayMin:200,promo:170.60}],
    ['flex',150,407,295.40,295,9000,4500,154600,2700,2700,{cap:3000,winDayMin:250,promo:250.40}],
    // Pro: … Zyklusziel, Cap 1. / ab 2. Auszahlung, Aktionspreis
    ['pro',25,123,90.60,90,1250,1000,26100,600,600,{cycle:250,cap1:1000,cap2:1500,promo:70.60}],
    ['pro',50,192,140.40,140,3000,2000,52100,1200,1200,{cycle:500,cap1:2000,cap2:2500,promo:115.40}],
    ['pro',100,307,225.40,225,6000,3000,103100,1800,1800,{cycle:750,cap1:2500,cap2:3000,promo:180.40}],
    ['pro',150,410,300.50,300,9000,4500,154600,2700,2700,{cycle:1000,cap1:3000,cap2:3500,promo:245.50}],
    // Daily: … automatisch live ab Tagesgewinn, Liste EOD-Variante, Aktionspreis
    ['daily',25,104,80.30,80,1250,1000,26100,600,600,{live:6000,eod:118,promo:55.30}],
    ['daily',50,138,105.60,105,3000,2000,52100,1200,1200,{live:8000,eod:166,promo:75.60}],
    ['daily',100,224,170.30,170,6000,3000,103100,1800,1800,{live:10000,eod:267,promo:125.30}],
    ['daily',150,313,235.60,235,9000,4500,154600,2700,2700,{live:12000,eod:375,promo:180.60}],
    // Direct: kein Reset, kein Ziel; … Zyklusziel 1./2.+, Cap Auszahlung 1–3 / 4–5
    ['direct',25,329,230.30,null,null,1000,26100,null,null,{cycle1:1500,cycle2:1250,cap1:1000,cap2:1000}],
    ['direct',50,515,360.50,null,null,2000,52100,null,1200,{cycle1:3000,cycle2:2500,cap1:2000,cap2:2500}],
    ['direct',100,700,490.00,null,null,3500,103600,null,2100,{cycle1:6000,cycle2:3500,cap1:2500,cap2:3000}],
    ['direct',150,836,585.20,null,null,5000,155100,null,3000,{cycle1:9000,cycle2:4500,cap1:3000,cap2:3500}]
  ];
  const LU = ([plan,size,price,codePrice,reset,goal,mll,trailBalance,dlgEval,dlgFunded,x])=>{
    const NAME={flex:'Flex',pro:'Pro',daily:'Daily',direct:'Direct'}, direct=plan==='direct';
    const fmt=v=>v.toLocaleString('de-DE'), eur=v=>v.toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2});
    const r={price,codePrice,reset,target:goal,mll,mllType:plan==='daily'?'intraday-trailing-lock-start100':'eod-trailing-lock-start100',trailBalance,
      dlgEval,dlgFunded,dlgType:'soft',dlgScaleFunded:null,consEval:null,consFunded:null,payoutMin:500,payoutCap1:null,payoutCap2:null,payoutFrac:null,
      winDays:null,winDayMin:null,cycleTarget1:null,cycleTarget2:null,bufferMll100:false,maxPayouts:null,liveAtDailyProfit:null,minDaysPayout:null,
      maxMini:LU_SIZE[size][0],maxMicro:LU_SIZE[size][1],config:null,billing:'once'};
    let k, regeln;
    if(plan==='flex'){
      Object.assign(r,{consEval:50,payoutCap1:x.cap,payoutCap2:x.cap,payoutFrac:0.5,winDays:5,winDayMin:x.winDayMin,maxPayouts:5,config:'DLL an'});
      k={buf:100,wfrac:50,cap:x.cap,minp:Math.max(2*500,5*x.winDayMin)};
      regeln=`Eval-Consistency 50 %. Auszahlung nach 5 Tagen ≥ ${fmt(x.winDayMin)} $ je Zyklus, Netto-Zyklusgewinn > 0, max. 50 % des Gewinns, Cap ${fmt(x.cap)} $ (fest), max. 5 Auszahlungen, dann live. Nach jeder Auszahlung springt das MLL auf Start + 100 $.`;
    } else if(plan==='pro'){
      Object.assign(r,{dlgScaleFunded:0.6,consFunded:40,payoutCap1:x.cap1,payoutCap2:x.cap2,cycleTarget1:x.cycle,cycleTarget2:x.cycle,bufferMll100:true,config:'DLL an'});
      k={buf:mll+100,wfrac:100,cap:x.cap1,minp:Math.max(500,x.cycle)};
      regeln=`Funded-Consistency 40 %. Funded-DLL über der Trail-Balance 60 % des höchsten EOD-Gewinns. Puffer MLL + 100 $, Zyklusziel ${fmt(x.cycle)} $, Cap ${fmt(x.cap1)} $ (1. Auszahlung), danach ${fmt(x.cap2)} $.${size===25?' DLL 25k: DLL-Artikel sagt „None“, Funded-Artikel und Website 600 $; es gilt 600 $ (konservativ).':''}`;
    } else if(plan==='daily'){
      Object.assign(r,{consEval:50,bufferMll100:true,liveAtDailyProfit:x.live,config:'DLL an, Intraday'});
      k={buf:mll+100,wfrac:100,cap:x.live,minp:500};
      regeln=`Eval-Consistency 50 %. Eval und Funded intraday-trailing. Puffer MLL + 100 $, Netto-Zyklusgewinn > 0, kein Auszahlungs-Cap, ab ${fmt(x.live)} $ Tagesgewinn automatisch live. EOD-Variante: Liste ${fmt(x.eod)} $.`;
    } else {
      Object.assign(r,{dlgScaleFunded:size===25?null:0.6,consFunded:20,payoutCap1:x.cap1,payoutCap2:x.cap2,cycleTarget1:x.cycle1,cycleTarget2:x.cycle2,maxPayouts:5,minDaysPayout:5,config:'fest'});
      k={buf:100,wfrac:100,cap:x.cap1,minp:x.cycle1};
      regeln=`Consistency 20 %, DLL ${dlgFunded==null?'keiner':fmt(dlgFunded)+' $'}${size===25?'':', über der Trail-Balance 60 % des höchsten EOD-Gewinns'}. Zyklusziel ${fmt(x.cycle1)} $, ab 2. Zyklus ${fmt(x.cycle2)} $. Cap ${fmt(x.cap1)} $ (Auszahlung 1–3), ${fmt(x.cap2)} $ (4–5), max. 5 Auszahlungen, min. 5 Tage bis zur Auszahlung (Website).`;
    }
    const allg=`${direct?'':`DLL ${fmt(dlgEval)} $ Eval / ${fmt(dlgFunded)} $ Funded (soft). `}Max. ${r.maxMini} Mini/${r.maxMicro} Micro. VAULT-Preis ${eur(codePrice)} $${reset!=null?`, Reset ${fmt(reset)} $`:''}${x.promo?`; Aktionspreis „Limited time“ ${eur(x.promo)} $ ohne Enddatum`:''}.`;
    const annahmen=[`Annahmen: Lock bei Start+100, Kern lockt bei Start (100 $ milder).`];
    if(plan!=='daily') annahmen.push('EOD-trailing, Kern pro Trade (strenger).');
    if(plan==='flex') annahmen.push(`minp ${fmt(k.minp)} $ = max(2 × 500 $; 5 × ${fmt(x.winDayMin)} $).`);
    if(plan==='pro') annahmen.push(`cap = Cap der 1. Auszahlung (konservativ). maxp 5: Quelle nennt kein Maximum, Konvention.`);
    if(plan==='daily') annahmen.push(`cap ${fmt(x.live)} $ = Tagesgewinn bis Live (Proxy, es gibt keinen Cap). maxp 5: Konvention.`);
    if(direct) annahmen.push(`minp = 1. Zyklusziel und cap = Cap Auszahlung 1–3 für alle Zyklen (konservativ).`);
    return {id:`lu-${plan}-${size}`,n:`${NAME[plan]} ${size}k`,mode:direct?'instant':'challenge',fee:price,list:`${price} $ einmalig`,code:'VAULT',
      target:direct?0:goal,target2:0,dd:mll,buf:k.buf,minp:k.minp,wfrac:k.wfrac,cap:k.cap,split:90,maxp:5,
      src:LU_SRC[plan],asof:'2026-10-15',rules:r,note:`${regeln} ${allg} ${annahmen.join(' ')}`};
  };
  const OFFERS=[
    {g:'Alpha Futures · CME-Futures · Eval monatlich, Direct einmalig', items:AF_ROWS.map(AF)},
    {g:'Lucid Trading · Futures · einmalig', items:LU_ROWS.map(LU)},
    {g:'MyFundedFutures · NQ-Futures · monatlich', items:[
      {id:'mf-rapid-50',n:'Rapid 50k',mode:'challenge',fee:79,list:'157 $/Monat',code:'50 % (Juni 2026)',target:3000,dd:2000,buf:2100,minp:500,wfrac:100,cap:100000,split:90,maxp:5,note:'Eval-Consistency 50 %. Funded Drawdown intraday, Puffer 2.100 $, Auszahlung täglich.'},
      {id:'mf-builder-50',n:'Builder 50k',mode:'challenge',fee:77,list:'153 $/Monat',code:'50 % (Juni 2026)',target:3000,dd:2000,buf:2100,minp:500,wfrac:100,cap:2000,split:80,maxp:5,note:'Funded-Consistency 50 %, Daily Loss 1.000 $ (soft), Auszahlung alle 48 h.'},
      {id:'mf-pro-50',n:'Pro 50k',mode:'challenge',fee:114,list:'227 $/Monat',code:'50 % (Juni 2026)',target:3000,dd:2000,buf:2100,minp:500,wfrac:100,cap:100000,split:80,maxp:5,note:'Eval-Consistency 50 %. Auszahlung alle 14 Tage, kein Deckel pro Auszahlung.'}
    ]},
    {g:'FundedNext Futures · einmalig', items:[
      {id:'fn-rd-50',n:'Rapid Daily 50k',mode:'challenge',fee:159,list:'299,98 $',code:'Rabatt (Partner)',target:3000,dd:2000,buf:0,minp:500,wfrac:100,cap:1200,split:90,maxp:5,note:'Keine Consistency. Daily Loss 1.000 $ (soft). Auszahlung täglich, max. 1.200 $ pro Zyklus. Bots erlaubt.'},
      {id:'fn-rp-50',n:'Rapid Pro 50k',mode:'challenge',fee:159,list:'299,98 $',code:'Rabatt (Partner)',target:3000,dd:2000,buf:0,minp:500,wfrac:100,cap:1200,split:90,maxp:5,note:'Funded-Consistency 40 %. Auszahlung alle 3 Tage, max. 1.200 $. Bots erlaubt.'},
      {id:'fn-legacy-50',n:'Legacy 50k',mode:'challenge',fee:180,list:'199,99 $',code:'Rabatt (Partner)',target:3000,dd:2000,buf:0,minp:1000,wfrac:100,cap:6000,split:80,maxp:5,note:'Eval-Consistency 40 %. Benchmark-Tage vor erster Auszahlung, alle 5 Tage.'},
      {id:'fn-flex-50',n:'Flex 50k',mode:'challenge',fee:71,list:'133,99 $',code:'Rabatt (Partner)',target:2500,dd:1500,buf:0,minp:1000,wfrac:100,cap:2500,split:80,maxp:5,note:'Eval-Consistency 40 %. 5 Benchmark-Tage ≥ 200 $, alle 5 Tage. 90 % Split per Add-on.'},
      {id:'fn-legacy-100',n:'Legacy 100k',mode:'challenge',fee:216,list:'239,99 $',code:'Rabatt (Partner)',target:6000,dd:3000,buf:0,minp:1000,wfrac:100,cap:6000,split:80,maxp:5,note:'Eval-Consistency 40 %. Auszahlungsdeckel für 100k aus 50k übernommen.'},
      {id:'fn-flex-100',n:'Flex 100k',mode:'challenge',fee:133,list:'249,99 $',code:'Rabatt (Partner)',target:5000,dd:2500,buf:0,minp:1000,wfrac:100,cap:2500,split:80,maxp:5,note:'Eval-Consistency 40 %. Auszahlungsdeckel für 100k nicht bestätigt.'}
    ]},
    {g:'Alpha Capital · CFD (NAS100, Gold) · einmalig', items:[
      Object.assign({id:'ac-d-2.5',n:'Direct 2,5k'},AC(2500,30,'30 $','–')),
      Object.assign({id:'ac-d-5',n:'Direct 5k'},AC(5000,67,'67 $','–')),
      Object.assign({id:'ac-d-10',n:'Direct 10k'},AC(10000,97,'97 $','–')),
      Object.assign({id:'ac-d-25',n:'Direct 25k'},AC(25000,197,'197 $','–')),
      Object.assign({id:'ac-d-50',n:'Direct 50k'},AC(50000,97,'257 $','50KFOR97 (bis 31.10.)')),
      Object.assign({id:'ac-d-100',n:'Direct 100k'},AC(100000,197,'457 $','100KFOR197 (bis 31.10.)')),
      Object.assign({id:'ac-d-200',n:'Direct 200k'},AC(200000,897,'897 $','–')),
      {id:'ac-one-50',n:'Alpha One 50k (1-Step)',mode:'challenge',fee:178,list:'297 $',code:'SMS40 (bis 31.10.)',target:5000,target2:0,dd:3000,ddStatic:false,buf:0,minp:1000,wfrac:100,cap:100000,split:80,maxp:5,note:'Daily Loss 4 %, Drawdown 6 % trailing bis Breakeven. On-Demand-Payout ab 2 % Gewinn, 40 % Best Day.'},
      {id:'ac-pro6-50',n:'Alpha Pro 6 % 50k (2-Step)',mode:'challenge',fee:142,list:'237 $',code:'SMS40 (bis 31.10.)',target:3000,target2:3000,dd:3000,ddStatic:true,buf:0,minp:100,wfrac:100,cap:100000,split:80,maxp:5,note:'Statischer Drawdown 6 %, Daily Loss 3 %. Bi-weekly ab 100 $ und 5 Handelstagen. Funded kein Wochenende.'},
      {id:'ac-pro10-50',n:'Alpha Pro 10 % 50k (2-Step)',mode:'challenge',fee:178,list:'297 $',code:'SMS40 (bis 31.10.)',target:5000,target2:2500,dd:5000,ddStatic:true,buf:0,minp:100,wfrac:100,cap:100000,split:80,maxp:5,note:'Statischer Drawdown 10 %, Daily Loss 5 %. Bi-weekly ab 100 $ und 5 Handelstagen. Funded kein Wochenende.'}
    ]}
  ];

  const api={PRESETS,OFFERS};
  if(typeof module!=='undefined' && module.exports) module.exports=api; else root.GlitchData=api;
})(typeof self!=='undefined'?self:this);
