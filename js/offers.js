/* Glitch-Simulator – Daten: Szenario-Buttons (PRESETS) und Challenge-Angebote (OFFERS).
   Stand der Angebote: 15.10.2026. Fee = Preis mit aktuellem Rabattcode, ohne belegten Code der Listenpreis.
   Alpha Futures: pro Eintrag src (Quelle), asof (Stand) und rules (Rohregeln).
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
  const OFFERS=[
    {g:'Alpha Futures · CME-Futures · Eval monatlich, Direct einmalig', items:AF_ROWS.map(AF)},
    {g:'Lucid Trading · NQ-Futures · einmalig', items:[
      {id:'lu-flex-50',n:'Flex 50k',mode:'challenge',fee:88,list:'146 $',code:'VIBES (−40 %)',target:3000,dd:2000,buf:100,minp:750,wfrac:50,cap:2000,split:90,maxp:5,note:'Eval-Consistency 50 %. Payout nach 5 Tagen ≥ 150 $, max. 50 % des Gewinns. Funded-Kontrakte skalieren.'},
      {id:'lu-pro-50',n:'Pro 50k',mode:'challenge',fee:115,list:'192 $',code:'VIBES (−40 %)',target:3000,dd:2000,buf:2100,minp:500,wfrac:100,cap:2000,split:90,maxp:5,note:'Keine Eval-Consistency, Funded 40 %. Puffer 52.100 $, erste Auszahlung max. 2.000 $, danach 2.500 $.'},
      {id:'lu-daily-50',n:'Daily 50k',mode:'challenge',fee:94,list:'156 $',code:'VIBES (−40 %)',target:3000,dd:2000,buf:2100,minp:500,wfrac:100,cap:100000,split:90,maxp:5,note:'Eval-Consistency 50 %. Funded Drawdown intraday. Auszahlung täglich über 52.100 $ möglich.'},
      {id:'lu-direct-50',n:'Direct 50k (ohne Challenge)',mode:'instant',fee:309,list:'515 $',code:'VIBES (−40 %)',target:0,dd:2000,buf:0,minp:3000,wfrac:100,cap:2000,split:90,maxp:5,note:'Erster Zyklus 3.000 $ Gewinn, danach 2.500 $. Consistency 20 %, Daily Loss 1.200 $.'}
    ]},
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
