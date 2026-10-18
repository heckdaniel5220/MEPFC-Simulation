/* Glitch-Simulator – Daten: Szenario-Buttons (PRESETS) und Challenge-Angebote (OFFERS).
   Stand der Angebote: 15.10.2026 (Alpha Capital und Blue Guardian 16.10.2026). Fee = Preis mit aktuellem Rabattcode, ohne belegten Code der Listenpreis.
   Alpha Futures, Lucid, MFFU, FundedNext, Alpha Capital und Blue Guardian: pro Eintrag src (Quelle), asof (Stand) und rules (Rohregeln).
   Quellen und offene Punkte: siehe CLAUDE.md. */
(function(root){
  'use strict';
  const PRESETS = {
    futures:{mode:'challenge',fee:100,target:3000,dd:2000,risk:500,rr:1.5,wr:40,cost:10,hp:6.5,hfund:false,buf:100,minp:1500,wfrac:50,cap:2000,split:90,maxp:5,n:500},
    coin:   {mode:'challenge',fee:100,target:3000,dd:2000,risk:2000,rr:1.5,wr:40,cost:10,hp:6.5,hfund:false,buf:100,minp:1500,wfrac:50,cap:2000,split:90,maxp:5,n:500},
    edge:   {mode:'challenge',fee:100,target:3000,dd:2000,risk:500,rr:1.5,wr:46,cost:10,hp:6.5,hfund:false,buf:100,minp:1500,wfrac:50,cap:2000,split:90,maxp:5,n:500},
    afstd:  {mode:'challenge',fee:65,target:3000,dd:2000,risk:500,rr:1.5,wr:40,cost:10,hp:4,hfund:false,buf:100,minp:1000,wfrac:100,cap:3000,split:90,maxp:5,n:500},
    instant:{mode:'instant',fee:97,target:3000,dd:2500,risk:250,rr:1,wr:50,cost:20,hp:5,hfund:false,buf:1500,minp:500,wfrac:100,cap:10000,split:90,maxp:5,n:500},
    // Whiteboard „Mathematical Edge“ (M-022): Werte vom Board, WR = Break-even 25 ÷ 44; cost und Payout-Felder (wie afstd) angenommen
    whiteboard:{mode:'challenge',fee:60,target:3000,dd:2000,risk:2000,rr:0.76,wr:56.8,cost:10,hp:3.375,hfund:false,buf:100,minp:1000,wfrac:100,cap:3000,split:90,maxp:5,n:500}
  };
  // Hinweise zu Video-Szenarien (M-022), app.js zeigt sie nur an; die Zahlen im Stufentext prüft test/sim.test.js nach
  const PRESET_NOTES = {
    whiteboard:[
      'Kein Edge: Die Trefferquote 56,8 % ist der Break-even für CRV 0,76 (25 ÷ 44, ohne Kosten). Das Plus kommt allein aus der Payout-Struktur: 60 $ Fee gegen etwa ein Drittel Chance (zwei Gewinne vor dem ersten Verlust), dann mehrere Tausend Dollar an Auszahlungen. Der Gegentrade (3,375 % der Prop-Position, nur bis zum Bestehen) ändert den Erwartungswert nicht, er verschiebt nur, wann die Fee bezahlt wird. Alle simulierten Firmen verbieten Gegenpositionen über Konten. Reine Analyse.',
      'Nicht auf dem Board und deshalb angenommen: Kosten 10 $ pro Trade und die Auszahlungsregeln (wie Alpha Futures Std).',
      'Mit den Regeln von heute (Alpha Futures Standard 50k), gemessen mit 20.000 Accounts und Seed 20261015: Das Board ergibt etwa +475 $ je Account. Die Eval-Consistency 50 % senkt das auf etwa +338 $. Mit allen Regeln außer dem Daily Loss Guard (inkl. Fee und Auszahlungsregeln des Angebots) sind es etwa +95 $. Mit dem Daily Loss Guard im Funded (1.000 $) ist ein Risiko von 2.000 $ gar nicht erlaubt. Der Knopf rechnet deshalb mit dem Auto-Risiko (Standard 25 % des Drawdowns); ist es aus, meldet die App „Kein Trade möglich“.'
    ]
  };

  // ---- Alle recherchierten Challenge-Angebote (Fee = Preis mit aktuellem Code) ----
  // ---- Alpha Futures: offizielle Regeln aus help.alpha-futures.com (Artikel Juli/Aug. 2026), Stand 15.10.2026 ----
  // rules = Rohregeln (null = Regel gilt nicht), Kernfelder für DLL und Consistency leiten die Schleifen am Ende ab. Abbildung auf Kernfelder: siehe CLAUDE.md.
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
    // minp: Eval = Mindestauszahlung ÷ 50 % (Gewinntage seit M-004 im Kern), Direct = 1. Auszahlungsziel für alle Zyklen
    const minp=direct?goal[0]:payoutMin/0.5;
    const fmt=v=>v.toLocaleString('de-DE');
    const regeln=[
      `DLG ${dlgEval==null&&dlgFunded==null?'keiner':(direct?fmt(dlgFunded)+' $':`Eval ${dlgEval==null?'–':fmt(dlgEval)+' $'}, Funded ${dlgFunded==null?'–':fmt(dlgFunded)+' $'}`)+' (soft)'}`,
      `Consistency ${direct?consFunded+' %':`Eval ${consEval==null?'–':consEval+' %'}, Funded ${consFunded==null?'–':consFunded+' %'}`}`,
      direct?`Auszahlungsziel ${fmt(goal[0])} $, ab 2. Antrag ${fmt(goal[1])} $, je Zyklus neu`:`Auszahlung nach 5 Gewinntagen ≥ 200 $, max. 50 % des Gewinns, max. 4 Anträge/Monat`,
      `Auszahlung ${fmt(payoutMin)}–${fmt(payoutMax)} $, max. ${maxMini} Mini/${maxMicro} Micro, Scaling ${scaling?'ja':'nein'}, News Funded ${newsFunded}, flat bis 16:20 ET`].join('. ')+'.';
    const annahmen=`Annahmen: MLL EOD-trailing, Kern pro Trade (konservativ). Consistency im Kern seit M-003 (strikt <, Funded je Zyklus). minp ${fmt(minp)} $ ${direct?'= 1. Auszahlungsziel für alle Zyklen':'= Mindestauszahlung ÷ 50 % (5 Gewinntage ≥ 200 $ je Zyklus im Kern seit M-004)'}. wfrac 50 %${direct?' ohne offizielle Angabe (konservativ)':''}. Fee = Listenpreis, kein belegter Rabattcode.${scaling?' Kontraktlimit (M-023) nur bei gewähltem Instrument (Strategiefeld), Grenze = Mini- oder Micro-Limit des Angebots. Scaling nur im Qualified, Stufen nicht belegt: Startstufe kann niedriger sein (nicht abgebildet).':''}`;
    return {id,n,mode:direct?'instant':'challenge',fee:price,list:direct?`${price} $ einmalig`:`${price} $/Monat`,code:'–',
      target:direct?0:goal,target2:0,dd:mll,buf:0,minp,wfrac:50,cap:payoutMax,split:90,maxp:5,
      src:AF_SRC[plan],asof:'2026-10-15',rules,note:regeln+' '+annahmen};
  };
  // ---- Lucid Trading: Regeln aus support.lucidtrading.com (Artikel Juli/Aug. 2026), Preise lucidtrading.com/#plans, Stand 15.10.2026 ----
  // fee = VAULT-Preis (rules.codePrice), rules.price = Listenpreis.
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
      k={buf:100,wfrac:50,cap:x.cap,minp:500/0.5};
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
      Object.assign(r,{dlgScaleFunded:size===25?null:0.6,consFunded:20,payoutCap1:x.cap1,payoutCap2:x.cap2,cycleTarget1:x.cycle1,cycleTarget2:x.cycle2,maxPayouts:5,minDaysPayout:10,config:'fest'});
      k={buf:100,wfrac:100,cap:x.cap1,minp:x.cycle1};
      regeln=`Consistency 20 %, DLL ${dlgFunded==null?'keiner':fmt(dlgFunded)+' $'}${size===25?'':', über der Trail-Balance 60 % des höchsten EOD-Gewinns'}. Zyklusziel ${fmt(x.cycle1)} $, ab 2. Zyklus ${fmt(x.cycle2)} $. Cap ${fmt(x.cap1)} $ (Auszahlung 1–3), ${fmt(x.cap2)} $ (4–5), max. 5 Auszahlungen. Auszahlungsartikel https://support.lucidtrading.com/en/articles/12890164-luciddirect-payout-objectives (geschrieben 26.08.2026, Abruf 17.10.2026 (Orchestrator)): Zyklusziele wie oben, Mindestantrag 500 $, Consistency 20 % je Zyklus, keine Mindest- oder Gewinntage. Produktseite https://lucidtrading.com/product/luciddirect-50k (Abruf 17.10.2026 (Orchestrator)): „Trading Days: 10“ ohne Erklärung.`;
    }
    const allg=`${direct?'':`DLL ${fmt(dlgEval)} $ Eval / ${fmt(dlgFunded)} $ Funded (soft). `}Max. ${r.maxMini} Mini/${r.maxMicro} Micro. VAULT-Preis ${eur(codePrice)} $${reset!=null?`, Reset ${fmt(reset)} $`:''}${x.promo?`; Aktionspreis „Limited time“ ${eur(x.promo)} $ ohne Enddatum`:''}.`;
    const annahmen=[`Annahmen: Lock bei Start+100, Kern lockt bei Start (100 $ milder).`];
    if(plan!=='daily') annahmen.push('EOD-trailing, Kern pro Trade (strenger).');
    if(plan==='flex') annahmen.push(`minp ${fmt(k.minp)} $ = Mindestauszahlung 500 $ ÷ 50 %; 5 Gewinntage ≥ ${fmt(x.winDayMin)} $ je Zyklus im Kern seit M-004.`);
    if(plan==='pro') annahmen.push(`cap = Cap der 1. Auszahlung (konservativ). maxp 5: Quelle nennt kein Maximum, Konvention.`);
    if(plan==='daily') annahmen.push(`cap ${fmt(x.live)} $ = Tagesgewinn bis Live (Proxy, es gibt keinen Cap). maxp 5: Konvention.`);
    if(direct) annahmen.push(`minp = 1. Zyklusziel und cap = Cap Auszahlung 1–3 für alle Zyklen (konservativ). Auszahlungsartikel 26.08.2026 ohne Tage-Regel, Produktseite „Trading Days: 10“, konservativ 10 Handelstage je Zyklus (M-004, M-010h; bis M-010h 5 laut Zweitquelle tradetanto.com).`);
    return {id:`lu-${plan}-${size}`,n:`${NAME[plan]} ${size}k`,mode:direct?'instant':'challenge',fee:codePrice,list:`${price} $ einmalig`,code:'VAULT',
      target:direct?0:goal,target2:0,dd:mll,buf:k.buf,minp:k.minp,wfrac:k.wfrac,cap:k.cap,split:90,maxp:5,
      src:LU_SRC[plan],asof:'2026-10-15',rules:r,note:`${regeln} ${allg} ${annahmen.join(' ')}`};
  };
  // ---- MyFundedFutures: Regeln aus help.myfundedfutures.com (Artikel Juli–Okt. 2026), Preise myfundedfutures.com (Screenshots 15.10.2026) ----
  // fee = CLUB-Preis (−40 %, rules.codePrice), rules.price = Listenpreis. Builder 50k = Variante Add-On. Abbildung: siehe CLAUDE.md.
  const MF_SRC={
    rapid:{25:'https://help.myfundedfutures.com/en/articles/14116402-rapid-plan-25k-a-comprehensive-look',
      50:'https://help.myfundedfutures.com/en/articles/13134709-rapid-plan-50k-a-comprehensive-look',
      100:'https://help.myfundedfutures.com/en/articles/13286542-rapid-plan-100k-a-comprehensive-look',
      150:'https://help.myfundedfutures.com/en/articles/13286582-rapid-plan-150k-a-comprehensive-look'},
    rapideod:{25:'https://help.myfundedfutures.com/en/articles/16727601-rapid-eod-25k-a-comprehensive-look'},
    pro:{50:'https://help.myfundedfutures.com/en/articles/17573707-comprehensive-look-into-redesigned-pro-plan',
      100:'https://help.myfundedfutures.com/en/articles/17573707-comprehensive-look-into-redesigned-pro-plan',
      150:'https://help.myfundedfutures.com/en/articles/17573707-comprehensive-look-into-redesigned-pro-plan'},
    builder:{25:'https://help.myfundedfutures.com/en/articles/17036130-builder-plan-25k-a-comprehensive-look',
      50:'https://help.myfundedfutures.com/en/articles/14290805-builder-plan-50k-a-comprehensive-guide',
      100:'https://help.myfundedfutures.com/en/articles/17005296-builder-plan-100k-comprehensive-guide',
      150:'https://help.myfundedfutures.com/en/articles/17035331-builder-plan-150k-comprehensive-guide'}};
  // Plan, Größe, Liste, CLUB, Ziel, MLL, Mini, Micro, min. Tage Eval, Consistency Eval/Funded %, Builder: DLL, Zyklus/Mindestauszahlung, Cap
  const MF_ROWS=[
    ['rapid',25,145,87,1500,1000,3,30,2,50,null],
    ['rapid',50,209,125,3000,2000,5,50,2,50,null],
    ['rapid',100,356,214,6000,3000,8,80,2,50,null],
    ['rapid',150,463,278,9000,4500,10,100,2,50,null],
    // Rapid EOD (M-010h, Abruf 17.10.2026): … Zyklusgewinn nach der 1. Auszahlung. 50k ohne belegten Preis, nicht aufgenommen.
    ['rapideod',25,145,87,1500,1000,2,20,4,30,null,{cycle:250}],
    ['pro',50,265,159,3000,2000,3,30,2,50,null],
    ['pro',100,401,241,6000,3000,6,60,2,50,null],
    ['pro',150,557,334,9000,4500,9,90,2,50,null],
    ['builder',25,105,63,1500,1000,2,20,1,null,50,{dll:600,cycle:250,cap:1000}],
    ['builder',50,125,75,3000,1500,4,40,1,null,50,{dll:1000,cycle:500,cap:2000}],
    ['builder',100,282,169,6000,3000,6,60,1,null,50,{dll:1750,cycle:1000,cap:3000}],
    ['builder',150,398,239,9000,4500,9,90,1,null,50,{dll:2500,cycle:1500,cap:4500}]
  ];
  const MF = ([plan,size,price,codePrice,goal,mll,maxMini,maxMicro,minDaysEval,consEval,consFunded,x])=>{
    const NAME={rapid:'Rapid',rapideod:'Rapid EOD',pro:'Pro',builder:'Builder'}, fmt=v=>v.toLocaleString('de-DE'), addOn=plan==='builder'&&size===50, eod=plan==='rapideod';
    const EOD='eod-trailing-lock-start100', INTRA='intraday-trailing-lock-start100';
    const r={price,codePrice,codeMaxUses:2,target:goal,mll,mllTypeEval:EOD,mllTypeFunded:plan==='rapid'?INTRA:EOD,mllStaticAfterFirstPayout:plan==='pro',
      dlgEval:null,dlgFunded:null,dlgType:null,consEval,consFunded,minDaysEval,payoutMin:null,payoutCap:null,totalPayoutCap:null,cycleProfitMin:null,
      minDaysCycle:null,firstPayoutAfterHours:null,maxPayouts:null,liveAtDailyProfit:null,maxMini,maxMicro,newsFunded:null,billing:'once',variant:addOn?'Add-On':null};
    let k, regeln;
    if(plan==='rapid'){
      Object.assign(r,{payoutMin:500,firstPayoutAfterHours:24,liveAtDailyProfit:10000,newsFunded:'T1 verboten'});
      k={minp:500,cap:10000,maxp:5,split:90};
      regeln=`Eval-Consistency 50 %, min. 2 Tage. Eval EOD-trailing, Funded intraday-trailing. Kein DLL. Puffer ${fmt(mll+100)} $ (MLL + 100), Auszahlung täglich ab 500 $, erste 24 h nach dem ersten Trade, kein Cap pro Auszahlung. Ab 10.000 $ Tagesgewinn automatisch live, Gewinn darüber verfällt, bis 5.000 $ gehen in die Reserve. T1-News im Funded verboten.`;
    } else if(eod){
      Object.assign(r,{payoutMin:500,cycleProfitMin:x.cycle,firstPayoutAfterHours:24,liveAtDailyProfit:10000,newsFunded:'verboten'});
      k={minp:500,cap:10000,maxp:5,split:90};
      regeln=`Eval-Consistency 30 % (nur Eval), Funded keine, min. ${minDaysEval} Tage. Eval und Funded EOD-trailing, lockt bei Start + 100 $. Kein DLL. Puffer ${fmt(mll+100)} $ für die 1. Auszahlung, danach je ${fmt(x.cycle)} $ Nettogewinn seit der letzten Auszahlung, Mindestantrag 500 $, täglich, Split 90/10. Übergang zu Live nach den Standardregeln von Rapid ${size}k. News im Funded verboten. Quelle: ${MF_SRC.rapideod[size]} und https://myfundedfutures.com/plans/rapid-eod (Preis ${fmt(price)} $, CLUB ${fmt(codePrice)} $), Abruf 17.10.2026 (Orchestrator), Artikel aktualisiert 02.09.2026.`;
    } else if(plan==='pro'){
      Object.assign(r,{payoutMin:1000,totalPayoutCap:100000,firstPayoutAfterHours:336,maxPayouts:3,newsFunded:'T1 verboten'});
      k={minp:1000,cap:100000,maxp:3,split:80};
      regeln=`Eval-Consistency 50 %, min. 2 Tage. Eval und Funded EOD-trailing, nach der 1. Auszahlung MLL statisch bei Start + 100 $. Kein DLL. Puffer ${fmt(mll+100)} $ (MLL + 100), Auszahlung ab 1.000 $, erste frühestens 14 Kalendertage nach dem ersten Trade, kein Cap pro Auszahlung, Gesamtcap 100.000 $ pro Nutzer. Live-Prüfung nach 3 Auszahlungen in Folge oder bei 20.000 $ Gewinn. T1-News im Funded verboten.`;
    } else {
      Object.assign(r,{dlgEval:x.dll,dlgFunded:x.dll,dlgType:'soft',payoutMin:x.cycle,payoutCap:x.cap,cycleProfitMin:x.cycle,minDaysCycle:2,firstPayoutAfterHours:48,maxPayouts:5,newsFunded:'T1 erlaubt'});
      k={minp:x.cycle,cap:x.cap,maxp:5,split:80};
      regeln=`Funded-Consistency 50 %, min. 1 Tag Eval. Eval und Funded EOD-trailing. DLL ${fmt(x.dll)} $ (soft, Eval und Funded). Puffer ${fmt(mll+100)} $ (MLL + 100), Zyklusgewinn und Mindestauszahlung ${fmt(x.cycle)} $, min. 2 Handelstage pro Zyklus, Cap ${fmt(x.cap)} $ pro Zyklus, erste Auszahlung 48 h nach dem ersten Trade, max. 5 Auszahlungen, dann live. T1-News erlaubt.${addOn?' Variante Add-On (strengere MLL, Preise aus dem Help Center); Default: MLL 2.000 $, Liste 153 $, CLUB 92 $.':''}`;
    }
    const allg=`Max. ${maxMini} Mini/${maxMicro} Micro, keine Overnight-Positionen, Funded startet bei 0 $. Einmalzahlung, keine Aktivierungsgebühr. CLUB-Preis ${fmt(codePrice)} $, CLUB max. 2 Einlösungen.`;
    const annahmen=['Annahmen: Lock bei Start + 100, Kern lockt bei Start (100 $ milder).'];
    if(plan==='rapid') annahmen.push('Eval EOD-trailing, Kern pro Trade (strenger). cap 10.000 $ = Tagesgewinn bis Live (Proxy, es gibt keinen Cap). maxp 5: Konvention. Reserve nicht abgebildet.');
    if(eod) annahmen.push('Rapid EOD: im Kern bis auf Preis gleich mit Rapid (EOD wird pro Trade gezogen, strenger). Wartezeit bis zur 1. Auszahlung nicht genannt: 24 h wie Rapid (konservativ). cap 10.000 $ = Tagesgewinn bis Live wie Rapid (Proxy, es gibt keinen Cap; Live folgt laut Artikel den Rapid-Regeln). maxp 5: Konvention. minp 500 $ = max(Mindestantrag 500 $; Zyklusgewinn 250 $).');
    if(plan==='pro') annahmen.push('EOD-trailing, Kern pro Trade (strenger). Statisches MLL nach der 1. Auszahlung nicht im Kern. cap 100.000 $ = Gesamtcap als Proxy. maxp 3 = Live-Prüfung nach 3 Auszahlungen (konservativ).');
    if(plan==='builder') annahmen.push('EOD-trailing, Kern pro Trade (strenger). DLL (M-002), Funded-Consistency (M-003, je Zyklus) und Mindest-Handelstage (M-004, Eval und je Zyklus) im Kern.');
    return {id:eod?`mf-rapid-eod-${size}`:`mf-${plan}-${size}`,n:`${NAME[plan]} ${size}k${addOn?' Add-On':''}`,mode:'challenge',fee:codePrice,list:`${price} $ einmalig`,code:'CLUB',
      target:goal,target2:0,dd:mll,buf:mll+100,minp:k.minp,wfrac:100,cap:k.cap,split:k.split,maxp:k.maxp,
      src:MF_SRC[plan][size],asof:eod?'2026-10-17':'2026-10-15',rules:r,note:`${regeln} ${allg} ${annahmen.join(' ')}`};
  };
  // ---- FundedNext Futures: Regeln aus helpfutures.fundednext.com (Artikel Sept./Okt. 2026), Preise fundednext.com/de/futures (Screenshots 15.10.2026) ----
  // fee = Codepreis 1. Account (rules.codePrice), rules.price = Listenpreis. Website vor Help-Center. Abbildung: siehe CLAUDE.md.
  const FN_SRC={
    flex:'https://helpfutures.fundednext.com/en/articles/17229829-fundednext-futures-flex-challenge-all-rules',
    rp:'https://helpfutures.fundednext.com/en/articles/17229677-fundednext-futures-rapid-pro-challenge-all-rules',
    rd:'https://helpfutures.fundednext.com/en/articles/17229779-fundednext-futures-rapid-daily-fundednext-account-all-rules',
    direct:'https://helpfutures.fundednext.com/en/articles/17430065-fundednext-futures-direct-account-all-rules'};
  // Plan, Größe, Liste, Codepreis (1. Account), Codepreis Folge-Accounts, Reset, Ziel, MLL, Lock, Mini, Micro, plus planeigene Werte
  const FN_ROWS=[
    // Flex: … Benchmark-Tagesminimum, Cap
    ['flex',50,141.99,74.99,84.99,82.99,2500,1500,50100,3,30,{bench:200,cap:1500}],
    ['flex',100,273.99,145.13,159.99,157.99,5000,2500,100100,5,50,{bench:200,cap:2500}],
    ['flex',150,490.99,259.99,289.99,284.99,8000,4000,150100,8,80,{bench:250,cap:4000}],
    // Rapid Pro: … Cap
    ['rp',25,159.98,79.99,84.99,84.99,1500,1000,25100,2,20,{cap:800}],
    ['rp',50,299.98,169.99,174.99,174.99,3000,2000,50100,4,40,{cap:1200,asof:'2026-10-16',kachel:true}],
    ['rp',100,499.98,279.99,299.99,299.99,5000,2500,100100,6,60,{cap:2500}],
    // Rapid Daily (Preise 16.10.2026): … DLL, Puffer, Cap
    ['rd',25,159.98,79.99,89.99,89.99,1500,1000,25100,2,20,{dll:500,buffer:1100,cap:800,asof:'2026-10-16'}],
    ['rd',50,299.98,169.99,189.99,189.99,3000,2000,50100,4,40,{dll:1000,buffer:2100,cap:1200,asof:'2026-10-16'}],
    ['rd',100,499.98,279.99,299.99,299.99,5000,2500,100100,6,60,{dll:1250,buffer:2600,cap:2500,asof:'2026-10-16'}],
    // Direct: kein Reset, kein Ziel
    ['direct',50,283.99,169.99,null,null,null,2000,50100,3,30,{cap:1200}]
  ];
  const FN = ([plan,size,price,codePrice,codeNext,reset,goal,mll,mllLock,maxMini,maxMicro,x])=>{
    const NAME={flex:'Flex',rp:'Rapid Pro',rd:'Rapid Daily',direct:'Direct'}, CODE={flex:'FNFLEX',rp:'RAPID',rd:'RAPID',direct:'FNDIRECT'}, direct=plan==='direct';
    const fmt=v=>v.toLocaleString('de-DE'), eur=v=>v.toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2});
    const r={price,codePrice,codePriceFrom3rd:codeNext,reset,target:goal,mll,mllLock,mllFixedAfterFirstPayout:null,dlgEval:null,dlgFunded:null,dlgType:null,
      consEval:null,consEvalMode:null,consFunded:null,consFundedMode:null,benchmarkDays:null,benchmarkMin:null,cycleProfitMin:null,payoutMin:null,
      payoutCap:x.cap,payoutFrac:null,payoutEveryDays:null,buffer:null,maxPayouts:5,maxMini,maxMicro,inactivityDays:null,billing:'once'};
    let k, regeln;
    if(plan==='flex'){
      Object.assign(r,{mllFixedAfterFirstPayout:true,consEval:40,consEvalMode:'target',benchmarkDays:5,benchmarkMin:x.bench,cycleProfitMin:500,payoutMin:250,payoutFrac:0.5});
      k={buf:100,wfrac:50,minp:Math.max(500,250/0.5),split:95};
      regeln=`Eval-Consistency: bester Tag ≤ 40 % des Profit-Ziels, sonst steigt das Ziel auf bester Tag ÷ 0,4. Funded ohne Consistency. Kein DLL. Auszahlung nach 5 Benchmark-Tagen ≥ ${fmt(x.bench)} $ je Zyklus, Zyklusgewinn ≥ 500 $, min. 250 $, max. 50 % des Gewinns, Cap ${fmt(x.cap)} $. Die 1. Auszahlung setzt das MLL fest auf Start + 100 $. Nach 5 Auszahlungen beendet. Codepreis ab dem 3. Account ${eur(codeNext)} $.${size===100?' Kachel 144,99 $, Checkout 145,13 $; es gilt 145,13 $ (konservativ).':''}`;
    } else if(plan==='rp'){
      Object.assign(r,{consFunded:40,consFundedMode:'cycle',cycleProfitMin:500,payoutMin:250,payoutEveryDays:3});
      k={buf:100,wfrac:100,minp:500,split:90};
      regeln=`Eval ohne Consistency. Funded-Consistency 40 % (bester Tag ÷ Zyklusgewinn). Kein DLL; DLL-Add-On laut Help-Center (günstiger) ist auf der Website nicht sichtbar, nicht verwendet. Auszahlung alle 3 Tage, Zyklusgewinn ≥ 500 $, min. 250 $, max. ${fmt(x.cap)} $, kein Puffer. Nach 5 Auszahlungen beendet. Codepreis ab dem 2. Account ${eur(codeNext)} $ (in rules.codePriceFrom3rd).${x.kachel?' Widerspruch (M-010h): Help-Center-Artikel https://helpfutures.fundednext.com/en/articles/17228852-what-are-the-reset-conditions-and-fees-at-fundednext-futures nennt „flat 50 % discount on all purchases“ für Rapid Pro & Daily, das wären 149,99 $ (Liste 299,98 $ ÷ 2); es bleiben 174,99 $ (Screenshot 16.10.2026, Reset-Tabelle; höher = konservativ).':''}${x.kachel?' Preis laut Kachel 16.10.2026 (Kachel „Rapid 50k“ gilt für Pro und Daily; 15.10.: 159,99 $).':''}`;
    } else if(plan==='rd'){
      Object.assign(r,{dlgEval:x.dll,dlgFunded:x.dll,dlgType:'soft',cycleProfitMin:500,payoutMin:250,payoutEveryDays:1,buffer:x.buffer});
      k={buf:x.buffer,wfrac:100,minp:500,split:90};
      regeln=`Keine Consistency in Eval und Funded. DLL ${fmt(x.dll)} $ (soft) in Eval und Funded. Auszahlung täglich möglich, keine Mindest-Handelstage; EOD-Balance ≥ Puffer ${fmt(x.buffer)} $ und Zyklusgewinn ≥ 500 $, min. 250 $, max. ${fmt(x.cap)} $ je Auszahlung. Nach 5 Auszahlungen beendet. Codepreis ab dem 2. Account ${eur(codeNext)} $ (in rules.codePriceFrom3rd).`;
    } else {
      Object.assign(r,{mllFixedAfterFirstPayout:true,dlgFunded:1000,dlgType:'soft',consFunded:20,consFundedMode:'perpetual-best-day',payoutMin:800,buffer:2100,inactivityDays:7});
      k={buf:2100,wfrac:100,minp:800,split:90};
      regeln=`Instant, kein Reset. DLL 1.000 $ (soft, inkl. offener Positionen und Gebühren). Consistency 20 % „perpetual“: bester Tag aller Zeiten ≤ 20 % des aktuellen Zyklusgewinns. Puffer 2.100 $, Auszahlung min. 800 $, max. 1.200 $. Die 1. Auszahlung setzt das MLL fest auf 50.100 $. Nach 5 Auszahlungen beendet. Mindestens 1 Trade pro Woche, sonst Breach.`;
    }
    const allg=`MLL EOD-trailing, Bruch intraday auf Equity. Max. ${maxMini} Mini/${maxMicro} Micro (1:10). Einmalgebühr, keine Aktivierungsgebühr. ${CODE[plan]}-Preis ${eur(codePrice)} $${reset!=null?`, Reset ${eur(reset)} $`:''}.`;
    const annahmen=['Annahmen: EOD-trailing, Kern pro Trade (strenger); Lock bei Start + 100, Kern bei Start (100 $ milder).'];
    if(plan==='flex') annahmen.push(`Eval-Consistency gegen Profit-Ziel: im Kern als bester Tag < 40 % des Phasengewinns (gleiche Bedingung, strikt < statt ≤). buf 100 = MLL fest bei Start + 100 nach der 1. Auszahlung. minp ${fmt(k.minp)} $ = max(Zyklusgewinn 500 $; 250 $ ÷ 50 %); 5 Benchmark-Tage ≥ ${fmt(x.bench)} $ je Zyklus im Kern seit M-004 (je Zyklus konservativ angenommen).`);
    if(plan==='rd') annahmen.push('DLL im Kern seit M-002.');
    if(plan==='rp') annahmen.push('buf 100 (konservativ: nach dem Lock muss das Konto über Start + 100 bleiben). Funded-Consistency im Kern seit M-003 (je Zyklus).');
    if(direct) annahmen.push('DLL (M-002) und Consistency perpetual (M-003) im Kern, Wochen-Trade nicht.');
    return {id:`fn-${plan}-${size}`,n:`${NAME[plan]} ${size}k`,mode:direct?'instant':'challenge',fee:codePrice,list:`${price} $ einmalig`,code:CODE[plan],
      target:direct?0:goal,target2:0,dd:mll,buf:k.buf,minp:k.minp,wfrac:k.wfrac,cap:x.cap,split:k.split,maxp:5,
      src:FN_SRC[plan],asof:x.asof||'2026-10-15',rules:r,note:`${regeln} ${allg} ${annahmen.join(' ')}`};
  };
  // ---- Alpha Capital (CFD): Regeln aus help.alphacapitalgroup.uk (Artikel Juli/Aug. 2026), Preise Checkout-Datensatz /api/v3/challenges/ (Mitschnitt 16.10.2026) ----
  // fee = Codepreis (rules.codePrice), rules.price = Listenpreis. Codes laut alphacapitalgroup.uk/alpha-capital-discount-codes (Stand 14.10.2026). Abbildung: siehe CLAUDE.md.
  const AC_SRC={
    d:'https://help.alphacapitalgroup.uk/en/articles/16003693-alpha-direct',
    one:'https://help.alphacapitalgroup.uk/en/articles/10097421-alpha-one-6-10-12',
    pro6:'https://help.alphacapitalgroup.uk/en/articles/11378706-alpha-pro-6'};
  // Plan, Größe, Liste, Codepreis, Ziel P1, Ziel P2, Max. DD, Tages-DD, Lot-Limit, Preis 90 %-Add-On, Bi-Weekly-Preis
  const AC_ROWS=[
    ['d',2500,30,18.00,null,null,125,75,1.25,null,null],
    ['d',5000,67,40.20,null,null,250,150,2.5,null,null],
    ['d',10000,97,58.20,null,null,500,300,5,null,null],
    ['d',25000,197,118.20,null,null,1250,750,10,null,null],
    ['d',50000,257,154.20,null,null,2500,1500,20,null,null],
    ['d',100000,457,274.20,null,null,5000,3000,40,null,null],
    ['d',200000,897,538.20,null,null,10000,6000,80,null,null],
    ['one',5000,47,37.60,500,null,300,200,2.5,52,null],
    ['one',10000,87,69.60,1000,null,600,400,5,96,null],
    ['one',25000,187,149.60,2500,null,1500,1000,10,206,null],
    ['one',50000,277,221.60,5000,null,3000,2000,20,305,null],
    ['one',100000,477,381.60,10000,null,6000,4000,40,525,null],
    ['one',200000,947,757.60,20000,null,12000,8000,80,1042,null],
    ['pro6',5000,27,21.60,300,300,300,150,2.5,30,30],
    ['pro6',10000,47,37.60,600,600,600,300,5,52,55],
    ['pro6',25000,117,93.60,1500,1500,1500,750,10,129,127],
    ['pro6',50000,217,173.60,3000,3000,3000,1500,20,239,227],
    ['pro6',100000,397,317.60,6000,6000,6000,3000,40,437,427],
    ['pro6',200000,797,637.60,12000,12000,12000,6000,80,877,847]
  ];
  const AC = ([plan,size,price,codePrice,goal1,goal2,mll,dailyDd,lotLimit,ninety,biWeekly])=>{
    const direct=plan==='d', pro=plan==='pro6';
    const fmt=v=>v.toLocaleString('de-DE'), eur=v=>v.toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2});
    const maxRiskPct=direct?1:(size<=25000?3:2), code=direct?'FUNDED40':'ALPHA20', k=size/1000;
    const r={size,price,codePrice,codeValidUntil:'2026-10-31',priceNinety:ninety,priceBiWeekly:pro?biWeekly:null,target1:goal1,target2:goal2,
      mll,mllType:pro?'static':'trailing-hwm-lock-start',dailyDd,dailyDdBase:'max(eod-balance,equity)',minDays:direct?null:(pro?3:1),
      bestDayPct:direct?15:40,payoutMinPct:direct?1:2,bufferPct:direct?3:null,minProfitDays:direct?7:null,maxRiskPct,lotLimit,
      weekendFunded:plan==='one',eas:direct?false:null,billing:'once'};
    let n, regeln;
    if(direct){
      n=`Direct ${fmt(k)}k`;
      regeln=`Ohne Challenge. Max. DD 5 % trailing (HWM Balance), lockt bei Start. Tages-DD ${fmt(dailyDd)} $. Auszahlung: zuerst Puffer 3 % (${fmt(size*0.03)} $), darüber min. 1 % brutto; bester Tag ≤ 15 % des Gewinns, Teilauszahlung setzt das Fenster zurück; 7 Gewinntage laut Datensatz${size===100000?' (Datensatz 0, konservativ 7)':''}; Widerspruch (M-010h): Help Center https://help.alphacapitalgroup.uk/en/articles/16003693-alpha-direct (Abruf 17.10.2026 (Orchestrator)) nennt keine Mindest- oder Gewinntage (bester Tag ≤ 15 %, Puffer 3 %, danach min. 1 %, Split 90 %), AGB On-Demand „Trading days N/A“; konservativ 7, im Kern ohne Wirkung neben der 15-%-Regel. Max. 1 % offenes Risiko pro Asset ab dem ersten Trade (Hard Breach). Kein Wochenend-Halten, keine EAs, kein Scaling.`;
    } else if(plan==='one'){
      n=`Alpha One 10 % ${fmt(k)}k (1-Step)`;
      regeln=`Ziel 10 % (${fmt(goal1)} $), min. 1 Tag. Max. DD 6 % trailing (HWM Balance), lockt bei Start. Tages-DD 4 % (${fmt(dailyDd)} $). Max_Loss im Datensatz 10 %, Help-Center 6 % → 6 %. Auszahlung on demand: bester Tag ≤ 40 %, min. 2 % brutto. Vollabhebung nach Lock schließt den Account (Kern ignoriert). Wochenende erlaubt. 90 %-Add-On ${fmt(ninety)} $ (nur Notiz).`;
    } else {
      n=`Alpha Pro 6 % ${fmt(k)}k (2-Step)`;
      regeln=`Ziel je Phase 6 % (${fmt(goal1)} $), min. 3 Tage je Phase. Max. DD 6 % statisch, Tages-DD 3 % (${fmt(dailyDd)} $). Preis = On-Demand; Bi-Weekly ${fmt(biWeekly)} $, 90 %-Add-On ${fmt(ninety)} $ (nur Notiz). Auszahlung on demand: bester Tag ≤ 40 %, min. 2 % brutto. Kein Wochenend-Halten im Qualified.`;
    }
    const allg=`${direct?'':`Max. ${maxRiskPct} % offenes Risiko pro Asset (Hard Breach, nur Qualified, Käufe ab 21.07.2026). `}Tages-DD gemessen am höheren Wert aus EOD-Balance und Equity. News-Sperre ±5 Min. auf dem betroffenen Instrument. Lot-Limit ${fmt(lotLimit)}. Einmalgebühr, Liste ${fmt(price)} $, ${code}-Preis ${eur(codePrice)} $. Code bis 31.10.2026 laut https://alphacapitalgroup.uk/alpha-capital-discount-codes (Stand 14.10.2026, gültig 01.–31.10.2026); ab 01.11. Listenpreis (Nachtrag M-010i). Gegentrades verboten.`;
    const annahmen=`Annahmen: Tages-DD im Kern als hartes DLL (M-002), Best-Day-Regel als Funded-Consistency je Zyklus (M-003, strikt < statt ≤). cap 100.000 $ = kein Cap. maxp 5 Konvention.${direct?' buf 3 %, minp 1 % der Kontogröße. 7 Gewinntage im Kern (M-004) je Zyklus mit Tages-P&L > 0 (Quelle nennt keine Schwelle, je Zyklus konservativ).':` minp = 2 % der Kontogröße. Mindesttage im Kern (M-004) als ${pro?3:1} Handelstag${pro?'e':''} je Phase.`}`;
    return {id:`ac-${plan}-${size===2500?'2.5':k}`,n,mode:direct?'instant':'challenge',fee:codePrice,list:`${price} $ einmalig`,code,
      maxRisk:size*maxRiskPct/100,target:direct?0:goal1,target2:pro?goal2:0,dd:mll,...(pro?{ddStatic:true}:{}),
      buf:direct?size*0.03:0,minp:size*(direct?0.01:0.02),wfrac:100,cap:100000,split:direct?90:80,maxp:5,
      src:AC_SRC[plan],asof:'2026-10-16',rules:r,note:`${regeln} ${allg} ${annahmen}`};
  };
  // ---- Blue Guardian (CFD + Futures): Preise und Regeln aus dem Quelltext von blueguardian.com (currentPrice/originalPrice, challengeRules/fundedRules,
  //      Download des Operators 16.10.2026), CFD-Regeltexte help.blueguardian.com (Artikel Aug./Sept. 2026) ----
  // fee = Website-Preis mit Saisoncode HALLOWEEN (rules.codePrice), rules.price = Listenpreis. Abbildung: siehe CLAUDE.md.
  const BG_SRC={
    instant:'https://help.blueguardian.com/en/articles/14061082-instant-standard-account-rules',
    '1step':'https://help.blueguardian.com/en/articles/14062186-1-step-standard-rules',
    '2step':'https://help.blueguardian.com/en/articles/14062291-2-step-standard-rules',
    '1step-nano':'https://help.blueguardian.com/en/articles/16444654-1-step-nano-rules',
    '2step-nano':'https://help.blueguardian.com/en/articles/16445450-2-step-nano-rules',
    payout:'https://help.blueguardian.com/en/articles/9660857-how-do-payouts-work',
    fut:'https://blueguardian.com'};
  const bgFmt=v=>v.toLocaleString('de-DE',{maximumFractionDigits:2});
  // CFD: Plan, Größe, Liste, Website-Preis, Ziel P1, Ziel P2, Tages-DD, Max. DD
  const BG_CFD_ROWS=[
    ['instant',5000,72,47,null,null,150,300],
    ['instant',10000,100,65,null,null,300,600],
    ['instant',25000,208,135,null,null,750,1500],
    ['instant',50000,324,211,null,null,1500,3000],
    ['instant',100000,623,405,null,null,3000,6000],
    ['instant',200000,954,620,null,null,6000,12000],
    ['instant',300000,1712,1113,null,null,9000,18000],
    ['instant',400000,2200,1430,null,null,12000,24000],
    ['1step',5000,40,26,450,null,200,300],
    ['1step',10000,66,43,900,null,400,600],
    ['1step',25000,134,87,2250,null,1000,1500],
    ['1step',50000,200,130,4500,null,2000,3000],
    ['1step',100000,398,259,9000,null,4000,6000],
    ['1step',200000,736,478,18000,null,8000,12000],
    ['2step',5000,32,21,400,200,200,400],
    ['2step',10000,75,49,800,400,400,800],
    ['2step',25000,154,100,2000,1000,1000,2000],
    ['2step',50000,232,151,4000,2000,2000,4000],
    ['2step',100000,463,301,8000,4000,4000,8000],
    ['2step',200000,930,605,16000,8000,8000,16000],
    ['1step-nano',5000,26.66,17,500,null,200,300],
    ['1step-nano',10000,38.66,25,1000,null,400,600],
    ['1step-nano',25000,78.66,51,2500,null,1000,1500],
    ['1step-nano',50000,160,104,5000,null,2000,3000],
    ['1step-nano',100000,320,208,10000,null,4000,6000],
    ['1step-nano',200000,585,380,20000,null,8000,12000],
    ['2step-nano',25000,66.66,43,2000,1250,750,2500],
    ['2step-nano',50000,127,83,4000,2500,1500,5000],
    ['2step-nano',100000,239,155,8000,5000,3000,10000],
    ['2step-nano',200000,460,299,16000,10000,6000,20000]
  ];
  // Je Plan: Name, nominaler Split, statischer DD, Consistency Eval/Funded, Mindest-Gewinntage Eval (je Phase)/Funded (≥ 0,5 %), Auszahlungsrhythmus (Tage, 0 = on demand)
  const BG_CFD_PLAN={
    instant:{n:'Instant',split:80,stat:false,consEval:null,consFunded:20,minDaysEval:null,minProfitDays:5,every:0},
    '1step':{n:'1 Step',split:85,stat:false,consEval:null,consFunded:null,minDaysEval:3,minProfitDays:null,every:14},
    '2step':{n:'2 Step',split:85,stat:true,consEval:null,consFunded:null,minDaysEval:3,minProfitDays:null,every:14},
    '1step-nano':{n:'1 Step Nano',split:85,stat:false,consEval:50,consFunded:50,minDaysEval:null,minProfitDays:5,every:7},
    '2step-nano':{n:'2 Step Nano',split:80,stat:true,consEval:null,consFunded:50,minDaysEval:null,minProfitDays:null,every:14}};
  const BG_CFD = ([plan,size,price,codePrice,goal1,goal2,dailyDd,mll])=>{
    const p=BG_CFD_PLAN[plan], k=size/1000, instant=plan==='instant', nano2=plan==='2step-nano';
    const shield=instant?1:2, split=Math.round(p.split*0.97*100)/100;
    const consFunded=instant&&size>=300000?15:p.consFunded;
    const firstCap=instant&&size>=200000;
    const r={size,price,codePrice,codeValidUntil:null,target1:goal1,target2:goal2,mll,mllType:p.stat?'static':'trailing-hwm-close-lock-start',
      bufferPct:p.stat?null:1,dailyDd,dailyDdBase:'max(balance,equity) 17:00 EST',consEval:p.consEval,consFunded,
      minProfitDaysEval:p.minDaysEval,minProfitDays:p.minProfitDays,minProfitDayPct:p.minDaysEval||p.minProfitDays?0.5:null,payoutMin:instant?500:100,
      payoutEveryDays:p.every,payoutFeePct:3,splitNominal:p.split,payoutCapPct:nano2?2:null,
      guardianShieldPct:shield,guardianShieldNano:plan.endsWith('nano')?'nicht genannt, konservativ 2 %':null,
      firstPayoutsCap:firstCap?{amount:10000,count:2}:null,leverage:null,newsFunded:false,billing:'once'};
    // Instant (M-010h): 100 $ Krypto, 500 $ Rise; minp = 500 $ (für alle Auszahlungswege erfüllbar, konservativ)
    const minp=instant?500:100;
    const cap=nano2?size*0.02:(firstCap?10000:100000);
    const ziel=instant?'Ohne Challenge':(goal2?`Ziel ${bgFmt(goal1)} $ / ${bgFmt(goal2)} $`:`Ziel ${bgFmt(goal1)} $`);
    const regeln=[`${ziel}. Max. DD ${bgFmt(mll)} $ ${p.stat?'statisch':'trailing (höchster Schlusskontostand), lockt bei Start, sobald Gewinn = DD; danach 1 % der Größe als Puffer'}. Tages-DD ${bgFmt(dailyDd)} $ (hart, Basis höherer Wert aus Balance und Equity um 17:00 EST)`,
      `Consistency ${p.consEval?`Eval ${p.consEval} %, `:''}${consFunded?`Funded ${consFunded} %`:'keine'}`,
      p.minDaysEval?`Eval min. ${p.minDaysEval} Tage mit ≥ 0,5 % Gewinn${plan==='2step'?' je Phase':''}`:null,
      p.minProfitDays?`Funded min. ${p.minProfitDays} Tage mit ≥ 0,5 % Gewinn`:null,
      `Auszahlung ${p.every?`alle ${p.every} Tage`:'on demand'}${nano2?`, Cap 2 % der Größe je Zyklus (${bgFmt(size*0.02)} $)`:''}${firstCap?', die ersten 2 Auszahlungen max. 10.000 $':''}, 3 % Bearbeitungsgebühr`,
      `Guardian Shield (nur Funded): ${shield} % offener Verlust schließt alle Trades, 1. Mal Split 50 %, 2. Mal Account weg${plan.endsWith('nano')?' (bei Nano nicht genannt, konservativ 2 %)':''}`,
      `Einmalgebühr, Liste ${bgFmt(price)} $, Website-Preis ${bgFmt(codePrice)} $ (HALLOWEEN −35 %). Saisoncode ohne Ablaufdatum, Abgleich. Gegentrades verboten`
    ].filter(Boolean).join('. ')+'.';
    const annahmen=`Annahmen: split ${bgFmt(split)} = ${p.split} % × 0,97 inkl. 3 % Auszahlungsgebühr. Guardian Shield als maxRisk ${shield} % (${bgFmt(size*shield/100)} $; die App deckelt das Risiko auch in der Challenge). Tages-DD im Kern als hartes DLL (M-002)${consFunded||p.consEval?', Consistency je Zyklus (M-003, strikt <)':''}. ${p.stat?'buf 0 (statisch).':'buf 1 % der Größe (Puffer nach Lock).'} ${instant?'minp 500 $ = Mindestauszahlung Rise (M-010h): https://help.blueguardian.com/en/articles/14061082-instant-standard-account-rules (Abruf 17.10.2026 (Orchestrator)) nennt „Minimum Withdrawl: $100 via crypto and $500 via rise“, an anderer Stelle 100 $ (Widerspruch auf der Seite); 500 $ ist für alle Wege erfüllbar (konservativ, bis M-010h 100 $). ':`minp ${bgFmt(minp)} $ = Mindestauszahlung. `}${cap===100000?'cap 100.000 $ = kein Cap':`cap ${bgFmt(cap)} $${firstCap?' für alle Auszahlungen (konservativ)':''}`}. maxp 5 Konvention. Gewinntage ≥ 0,5 % (${bgFmt(size*0.005)} $) im Kern seit M-004${p.minProfitDays?' (Funded je Zyklus, konservativ)':''}${p.minDaysEval?' (Eval je Phase)':''}, ${p.every>1?`Auszahlungsrhythmus ${p.every} Kalendertage im Kern seit M-005 (auch für die 1. Auszahlung)`:'Auszahlung on demand'}.`;
    return {id:`bg-cfd-${plan}-${k}`,n:`${p.n} ${bgFmt(k)}k`,mode:instant?'instant':'challenge',fee:codePrice,list:`${bgFmt(price)} $ einmalig`,code:'HALLOWEEN',
      maxRisk:size*shield/100,target:instant?0:goal1,target2:goal2||0,dd:mll,...(p.stat?{ddStatic:true}:{}),
      buf:p.stat?0:size*0.01,minp,wfrac:100,cap,split,maxp:5,
      src:BG_SRC[plan],asof:'2026-10-16',rules:r,note:`${regeln} ${annahmen}`};
  };
  // Futures: Plan, Größe, Liste, Website-Preis, Ziel bzw. Auszahlungsziel 1./ab 2., DLL Eval/Funded, MLL Eval/Funded, Mini/Micro, Auszahlung (je Plan)
  //   std: Cap 1./ab 2. · express: Puffer, max./Tag, min. · reserve: Cap, Gewinntag-Minimum
  const BG_FUT_ROWS=[
    ['std',25000,154,100,1500,null,null,1000,1000,1,10,{cap1:1500,cap2:2000}],
    ['std',50000,209,136,3000,1000,1000,2000,2000,4,40,{cap1:2500,cap2:3000}],
    ['std',100000,330,215,6000,2000,2000,3500,3500,8,80,{cap1:3000,cap2:3500}],
    ['std',150000,424,276,9000,3000,3000,5000,5000,12,120,{cap1:4000,cap2:4500}],
    ['express',25000,86,56,1500,null,500,1000,1000,1,10,{buffer:1100,perDay:600,min:250}],
    ['express',50000,130,85,3000,1000,1000,2000,2000,4,40,{buffer:2100,perDay:1100,min:500}],
    ['express',100000,205,133,6000,1500,1250,3000,2500,8,80,{buffer:2600,perDay:1500,min:1000}],
    ['express',150000,320,208,9000,2250,1750,4500,3500,12,120,{buffer:3600,perDay:2500,min:1500}],
    ['reserve',25000,64,48,1500,600,600,1000,1000,2,20,{cap:1000,winDayMin:100,noDll:[96,72]}],
    ['reserve',50000,112,84,3000,1200,1200,2000,2000,4,40,{cap:2000,winDayMin:150,noDll:[168,126]}],
    ['reserve',100000,148,111,6000,1700,1700,3000,3000,8,80,{cap:2500,winDayMin:200,noDll:[240,180]}],
    ['reserve',150000,296,222,9000,3000,3000,4500,4500,12,120,{cap:3000,winDayMin:250,noDll:[392,294]}],
    ['direct',25000,350,228,[1500,1000],null,1000,null,1500,1,10,{}],
    ['direct',50000,452,294,[3000,2000],null,1250,null,2000,4,40,{}],
    ['direct',100000,598.67,389,[6000,3500],null,2500,null,3500,8,80,{}],
    ['direct',150000,718.67,467,[9000,4500],null,3000,null,4500,12,120,{}]
  ];
  const BG_FUT_NAME={std:'Standard',express:'Express',reserve:'Reserve',direct:'Direct'};
  const BG_FUT = ([plan,size,price,codePrice,goal,dlgEval,dlgFunded,mllEval,mllFunded,maxMini,maxMicro,x])=>{
    const k=size/1000, direct=plan==='direct', std=plan==='std', exp=plan==='express', res=plan==='reserve';
    // Kern hat nur ein dd: bei abweichender Eval/Funded-MLL gilt der kleinere Wert (Express 100k/150k)
    const mll=direct?mllFunded:Math.min(mllEval,mllFunded);
    const consEval=exp||res?40:null, consFunded=std?40:(direct?20:null);
    const payoutMin=std||res?100:(exp?x.min:1000);
    const r={size,price,codePrice,codeValidUntil:null,target:direct?null:goal,mll,mllEval:direct?null:mllEval,mllFunded,mllType:'eod-trailing',
      mllLock:'Start + 100 nach jeder Auszahlung oder bei Schlusskontostand ≥ Start + MLL + 100',
      dlgEval:direct?null:dlgEval,dlgFunded,dlgType:dlgEval==null&&dlgFunded==null?null:'soft',
      consEval,consFunded,consFundedSteps:direct?[20,25,30]:null,maxMini,maxMicro,
      winDays:res?5:null,winDayMin:res?x.winDayMin:null,payoutMin,
      payoutCap1:std?x.cap1:(res?x.cap:null),payoutCap2:std?x.cap2:(res?x.cap:null),
      cycleTarget1:direct?goal[0]:null,cycleTarget2:direct?goal[1]:null,firstPayoutAfterDays:std?3:null,
      dailyPayoutMax:exp?x.perDay:null,payoutEveryDays:exp?1:null,buffer:std?mll+100:(exp?x.buffer:null),
      riskOption:res?'DLL':null,consOption:exp?'40%':null,
      priceNoDll:res?x.noDll[0]:null,codePriceNoDll:res?x.noDll[1]:null,split:90,billing:'once'};
    const buf=std?mll+100:(exp?x.buffer:100);
    const minp=std?100:(exp?x.min:(res?100:goal[0]));
    const cap=std?x.cap1:(exp?x.perDay:(res?x.cap:100000));
    const dllTxt=dlgEval==null&&dlgFunded==null?'kein DLL':(direct?`DLL ${bgFmt(dlgFunded)} $`:`DLL Eval ${dlgEval==null?'–':bgFmt(dlgEval)+' $'}, Funded ${dlgFunded==null?'–':bgFmt(dlgFunded)+' $'}`)+(dlgEval!=null||dlgFunded!=null?' (soft, Pause bis zum nächsten Handelstag)':'');
    const ausz=std?`Auszahlung min. 100 $, Cap 1. ${bgFmt(x.cap1)} $, ab 2. ${bgFmt(x.cap2)} $, erste Auszahlung 3 Tage nach dem 1. Funded-Trade, Puffer ${bgFmt(mll+100)} $ (Sekundärquelle tradetanto.com)`
      :exp?`Tägliche Auszahlung, Puffer ${bgFmt(x.buffer)} $, max. ${bgFmt(x.perDay)} $/Tag, min. ${bgFmt(x.min)} $`
      :res?`Auszahlung nach 5 Gewinntagen ≥ ${bgFmt(x.winDayMin)} $, min. 100 $, Cap ${bgFmt(x.cap)} $, kein Puffer`
      :`Auszahlungsziel 1. ${bgFmt(goal[0])} $, ab 2. ${bgFmt(goal[1])} $, min. 1.000 $`;
    const regeln=[`${direct?'Ohne Challenge':`Ziel ${bgFmt(goal)} $`}. MLL ${direct?bgFmt(mllFunded)+' $':(mllEval===mllFunded?bgFmt(mll)+' $':`Eval ${bgFmt(mllEval)} $, Funded ${bgFmt(mllFunded)} $`)} EOD-trailing, Lock bei Start + 100 nach jeder Auszahlung oder sobald der Schlusskontostand Start + MLL + 100 erreicht`,
      dllTxt,
      `Consistency ${direct?'20 % → 25 % → 30 % je Auszahlung':`Eval ${consEval?consEval+' %'+(exp?' (Standard-Option, 50 % wählbar)':''):'–'}, Funded ${consFunded?consFunded+' %':'–'}`}`,
      ausz,`max. ${maxMini} Mini/${maxMicro} Micro`,
      `Einmalgebühr, Liste ${bgFmt(price)} $, Website-Preis ${bgFmt(codePrice)} $ (HALLOWEEN${res?'; Website zeigt −25 %':' −35 %'}). Saisoncode ohne Ablaufdatum, Abgleich. Gegentrades verboten`,
      res?`Option „mit DLL“ gewählt (Standard, günstiger); ohne DLL Liste ${bgFmt(x.noDll[0])} $, Website ${bgFmt(x.noDll[1])} $ (nur Notiz)`:null
    ].filter(Boolean).join('. ')+'.';
    const annahmen=[`Annahmen: MLL EOD-trailing, Kern pro Trade (strenger); Lock bei Start + 100, Kern bei Start (100 $ milder).`,
      exp&&mllEval!==mllFunded?`dd = kleinere Funded-MLL ${bgFmt(mll)} $ für beide Phasen (Kern hat nur ein dd, konservativ).`:null,
      direct?'Consistency steigt auf 25/30 %, Kern fest 20 %.':null,
      std?'buf = MLL + 100 $ aus Sekundärquelle (konservativ), cap = Cap der 1. Auszahlung.':null,
      exp?'cap = max. Auszahlung pro Tag, minp = Mindestauszahlung; tägliche Auszahlung nicht im Kern.':null,
      res?`buf 100 (Lock nach Auszahlung), minp = Mindestauszahlung 100 $; 5 Gewinntage ≥ ${bgFmt(x.winDayMin)} $ je Zyklus im Kern seit M-004.`:null,
      direct?'buf 100, minp = 1. Auszahlungsziel für alle Zyklen, cap 100.000 $ = kein Cap.':null,
      'maxp 5 Konvention.'].filter(Boolean).join(' ');
    return {id:`bg-fut-${plan}-${k}`,n:`${BG_FUT_NAME[plan]} ${k}k`,mode:direct?'instant':'challenge',fee:codePrice,list:`${bgFmt(price)} $ einmalig`,code:'HALLOWEEN',
      target:direct?0:goal,target2:0,dd:mll,buf,minp,wfrac:100,cap,split:90,maxp:5,
      src:BG_SRC.fut,asof:'2026-10-16',rules:r,note:`${regeln} ${annahmen}`};
  };
  const OFFERS=[
    {g:'Alpha Futures · CME-Futures · Eval monatlich, Direct einmalig', items:AF_ROWS.map(AF)},
    {g:'Lucid Trading · Futures · einmalig', items:LU_ROWS.map(LU)},
    {g:'MyFundedFutures · Futures · einmalig', items:MF_ROWS.map(MF)},
    {g:'FundedNext Futures · einmalig', items:FN_ROWS.map(FN)},
    {g:'Alpha Capital · CFD (NAS100, Gold) · einmalig', items:AC_ROWS.map(AC)},
    {g:'Blue Guardian · CFD', items:BG_CFD_ROWS.map(BG_CFD)},
    {g:'Blue Guardian · Futures', items:BG_FUT_ROWS.map(BG_FUT)}
  ];

  // ---- Daily Loss Limit (M-002): Kernfelder aus rules ableiten ----
  // dlgEval/dlgFunded (Futures, soft) bzw. dailyDd (Alpha Capital, hard). Instant hat keine Challenge, dllEval bleibt 0.
  // Lucid-Scaling: Anteil aus rules.dlgScaleFunded, Schwelle = MLL + 100 $ (Trail-Balance − Kontogröße). dllCompliant bleibt Default (true).
  for(const gr of OFFERS) for(const o of gr.items){
    const r=o.rules||{}, scale=r.dlgScaleFunded??0;
    Object.assign(o,{
      dllEval:o.mode==='instant'?0:(r.dlgEval??r.dailyDd??0),
      dllFunded:r.dlgFunded??r.dailyDd??0,
      dllType:r.dailyDd!=null?'hard':'soft',
      dllScaleFunded:scale,
      dllScaleFrom:scale>0?r.mll+100:0});
  }

  // ---- Consistency (M-003): Kernfelder aus rules ableiten ----
  // consEval/consFunded (Futures) bzw. bestDayPct (Alpha Capital, nur Funded). FundedNext Flex 'target' ist dieselbe Bedingung.
  // 'perpetual-best-day' (FundedNext Direct) → 'perpetual', sonst 'cycle'. consCompliant bleibt Default (true).
  for(const gr of OFFERS) for(const o of gr.items){
    const r=o.rules||{};
    Object.assign(o,{
      consEval:r.consEval??0,
      consFunded:r.consFunded??r.bestDayPct??0,
      consFundedMode:r.consFundedMode==='perpetual-best-day'?'perpetual':'cycle'});
  }

  // ---- Tage-Regeln (M-004): Kernfelder aus rules ableiten ----
  // Eval (je Step): Mindest-Handelstage minDaysEval (MFFU) bzw. minDays (Alpha Capital); Gewinntage minProfitDaysEval × minProfitDayPct (Blue Guardian CFD).
  // Funded (je Zyklus): Gewinntage winDays/winDayMin, benchmarkDays/benchmarkMin bzw. minProfitDays × minProfitDayPct (Schwelle 0 = Tages-P&L > 0);
  // Mindest-Handelstage minDaysCycle (MFFU Builder) bzw. minDaysPayout (Lucid Direct). Prozent-Schwellen in $ (rules.size). Instant ohne Eval-Regeln.
  for(const gr of OFFERS) for(const o of gr.items){
    const r=o.rules||{}, inst=o.mode==='instant', pct=v=>v==null?0:r.size*v/100;
    Object.assign(o,{
      evalMinDays:inst?0:(r.minDaysEval??r.minDays??0),
      evalWinDays:inst?0:(r.minProfitDaysEval??0),
      evalWinDayMin:inst||!r.minProfitDaysEval?0:pct(r.minProfitDayPct),
      payMinDays:r.minDaysCycle??r.minDaysPayout??0,
      payWinDays:r.winDays??r.benchmarkDays??r.minProfitDays??0,
      payWinDayMin:r.winDayMin??r.benchmarkMin??(r.minProfitDays?pct(r.minProfitDayPct):0)});
  }

  // ---- Kalender und Gebühren (M-005): Kernfelder aus rules ableiten ----
  // Wartezeit bis zur 1. Auszahlung ab dem 1. Funded-Trade: firstPayoutAfterHours (MFFU, auf ganze Tage aufgerundet),
  // firstPayoutAfterDays (BG Futures Std, als Kalendertage) bzw. der Rhythmus payoutEveryDays (BG CFD, FN Rapid Pro gelten auch für die 1. Auszahlung).
  // payoutEveryDays 0 (on demand) und 1 (täglich) sind im Kern wirkungslos (höchstens 1 Auszahlung pro Tag) und bleiben 0.
  // Monatsabo: billing 'monthly' (Alpha Futures Eval), Folgemonat = Listenpreis. Aktivierungsgebühr: keine Quelle mit Betrag, überall 0.
  for(const gr of OFFERS) for(const o of gr.items){
    const r=o.rules||{}, every=r.payoutEveryDays>1?r.payoutEveryDays:0;
    Object.assign(o,{
      payFirstAfterCal:r.firstPayoutAfterHours!=null?Math.ceil(r.firstPayoutAfterHours/24):(r.firstPayoutAfterDays??every),
      payEveryCal:every,
      feeMonthly:r.billing==='monthly'?r.price:0,
      feeActivation:0});
    const t=[];
    if(o.payFirstAfterCal>0) t.push(`Kalender (M-005): 1. Auszahlung frühestens ${o.payFirstAfterCal} Kalendertag${o.payFirstAfterCal>1?'e':''} nach dem 1. Funded-Trade${r.firstPayoutAfterHours!=null?` (${r.firstPayoutAfterHours} h aufgerundet)`:''}${every?`, danach alle ${every} Kalendertage`:''}; regeltreu pausiert der Trader bis zum Termin.`);
    if(r.firstPayoutAfterDays!=null) t.push('„3 Tage“: Art offen (Sekundärquelle), bei Start Do/Fr milder als Handelstage, gemessen ohne Wirkung.');
    if(o.feeMonthly>0) t.push(`Monatsabo (M-005): je weitere angefangene 30 Kalendertage der Challenge ${o.feeMonthly} $ (Folgemonat = Listenpreis, Verlängerungspreis ohne Quelle), endet sofort bei Bestehen oder Scheitern, keine Funded-Monatsgebühr. Max. 4 Anträge/Monat nur Notiz (gemessen 0 Blockaden).`);
    if(r.inactivityDays!=null) t.push(`Inaktivität ${r.inactivityDays} Tage nur Notiz: im Kern jeden Handelstag ≥ 1 Trade, größte Lücke Fr → Mo 3 Kalendertage.`);
    if(t.length) o.note+=' '+t.join(' ');
  }

  // ---- Guardian Shield (Blue Guardian CFD) und Max Risk (Alpha Capital), M-019: Kernfelder aus rules ableiten, nur Funded ----
  // Grenze in $ = Größe × guardianShieldPct bzw. maxRiskPct (dieselben Schlüssel, aus denen maxRisk entsteht).
  // BG: 1. Bruch Split 50 % × 0,97 (3-%-Gebühr bleibt) für alle folgenden Auszahlungen, 2. Bruch Account verloren. AC: 1. Bruch Account verloren.
  const SHIELD_SRC={bgInstant:'https://help.blueguardian.com/en/articles/14061082-instant-standard-account-rules',
    bg2step:'https://help.blueguardian.com/en/articles/14062291-2-step-standard-rules',
    ac:'https://help.alphacapitalgroup.uk/en/articles/15888623-what-is-the-max-risk-rule-and-how-does-it-work'};
  for(const gr of OFFERS) for(const o of gr.items){
    const r=o.rules||{}, bg=r.guardianShieldPct>0, ac=!bg && r.maxRiskPct>0;
    const pct=bg?r.guardianShieldPct:ac?r.maxRiskPct:0;
    Object.assign(o,{shield:pct?r.size*pct/100:0,
      shieldSplit:bg?Math.round(50*o.split/r.splitNominal*100)/100:50,
      shieldStrikes:ac?1:2});
    // Quelle in den Regelteil (vor „Annahmen:“), Abbildung ans Ende (Modellteil, M-020)
    const addSrc=t=>{ const i=o.note.indexOf(' Annahmen:'); o.note=i<0?o.note+' '+t:o.note.slice(0,i)+' '+t+o.note.slice(i); };
    if(bg){
      const nano=o.id.includes('nano');
      addSrc(`Guardian Shield laut ${SHIELD_SRC.bgInstant} und ${SHIELD_SRC.bg2step} (Abruf 17.10.2026 (Orchestrator)): „If your PnL on open trades reaches a 1% loss“, beim 2-Step-Account „reaches a 2% loss“, „only applies on 2step Funded Accounts“, schließt „in most cases“ alle offenen Trades aller Symbole, „you may immediately begin trading afterward“, 1. Mal „Profit split reduced to 50%“, 2. Mal „The account is permanently breached“, „does not reset once triggered and the profit split cannot be reinstated“.`);
      o.note+=` Guardian Shield im Kern (M-019): Bruch, wenn der Verlust eines Funded-Trades (Risiko + Slippage + Kosten, Kosten mitgerechnet, die Quelle nennt sie nicht) ${bgFmt(o.shield)} $ erreicht (≥); der Trade wird voll gebucht, der Handel läuft am selben Tag weiter.${nano?' Für Nano nennt die Quelle keinen Wert, konservativ 2 %.':''} Ab dem ersten Bruch gilt Split ${bgFmt(o.shieldSplit)} % (= 50 % × 0,97) für alle folgenden Auszahlungen, beim zweiten Bruch ist der Account verloren, bisherige Auszahlungen bleiben. Die Firma misst alle offenen Trades zusammen, das Modell rechnet mit einer Position je Trade. Das Auto-Risiko bleibt mit Kosten und Slippage-Puffer unter der Grenze.`;
    }
    if(ac){
      addSrc(`Max Risk laut ${SHIELD_SRC.ac} (Abruf 17.10.2026 (Orchestrator)): je Asset „in open drawdown“, „assessed based on equity (unrealised losses)“, Folge „your account will be closed“ (keine Vorstufe), 3 % (5k–25k), 2 % (50k–200k), Alpha Direct 1 %, unabhängig von Daily und Max Drawdown; „Applies to Qualified Accounts only“ für Käufe nach dem 21.07.2026, die Tabelle nennt Direct trotzdem (Widerspruch auf der Seite).`);
      o.note+=` Max Risk im Kern (M-019): nur Funded (Direct ab dem ersten Trade, konservativ trotz Widerspruch; One und Pro im Qualified), Bruch, wenn der Verlust eines Trades (Risiko + Slippage + Kosten) ${bgFmt(o.shield)} $ erreicht (≥), der Account ist sofort verloren. Die Firma misst je Asset, das Modell rechnet mit einer Position je Trade. Das Auto-Risiko bleibt mit Kosten und Slippage-Puffer unter der Grenze.`;
    }
  }

  const api={PRESETS,PRESET_NOTES,OFFERS};
  if(typeof module!=='undefined' && module.exports) module.exports=api; else root.GlitchData=api;
})(typeof self!=='undefined'?self:this);
