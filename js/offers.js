/* Glitch-Simulator – Daten: Szenario-Buttons (PRESETS) und Challenge-Angebote (OFFERS).
   Stand der Angebote: 15.10.2026. Fee = Preis mit aktuellem Rabattcode.
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
  const OFFERS=[
    {g:'Alpha Futures · NQ-Futures · monatlich', items:[
      {id:'af-zero-25',n:'Zero 25k',mode:'challenge',fee:53,list:'89 $/Monat',code:'ALPHA40',target:1500,dd:1000,buf:0,minp:1000,wfrac:50,cap:1000,split:90,maxp:5,note:'Payout nach 5 Gewinntagen ≥ 200 $. Funded-Consistency 40 %, Daily Loss 500 $ (soft).'},
      {id:'af-zero-50',n:'Zero 50k',mode:'challenge',fee:83,list:'139 $/Monat',code:'ALPHA40',target:3000,dd:2000,buf:0,minp:1000,wfrac:50,cap:1500,split:90,maxp:5,note:'Payout nach 5 Gewinntagen ≥ 200 $, max. 50 % des Gewinns. Funded-Consistency 40 %, Daily Loss 1.000 $ (soft).'},
      {id:'af-zero-100',n:'Zero 100k',mode:'challenge',fee:167,list:'279 $/Monat',code:'ALPHA40',target:6000,dd:3000,buf:0,minp:1000,wfrac:50,cap:2500,split:90,maxp:5,note:'Payout nach 5 Gewinntagen ≥ 200 $. Funded-Consistency 40 %, Daily Loss 2.000 $ (soft).'},
      {id:'af-std-50',n:'Standard 50k',mode:'challenge',fee:65,list:'129 $/Monat',code:'ALPHA50',target:3000,dd:2000,buf:0,minp:1000,wfrac:100,cap:3000,split:90,maxp:5,note:'Eval-Consistency 50 %, Funded 40 %, Funded Daily Loss 1.000 $. Auszahlbarer Anteil nicht offiziell bestätigt.'},
      {id:'af-adv-50',n:'Advanced 50k',mode:'challenge',fee:105,list:'209 $/Monat',code:'ALPHA50',target:4000,dd:1750,buf:0,minp:2000,wfrac:50,cap:15000,split:90,maxp:5,note:'Eval-Consistency 40 %. 50 % des Gewinns auszahlbar bis 30 Gewinntage ≥ 200 $, Mindestauszahlung 1.000 $.'},
      {id:'af-adv-100',n:'Advanced 100k',mode:'challenge',fee:175,list:'349 $/Monat',code:'ALPHA50',target:8000,dd:3500,buf:0,minp:2000,wfrac:50,cap:15000,split:90,maxp:5,note:'Ziel und Drawdown aus Drittquelle (TradeTanto).'},
      {id:'af-adv-150',n:'Advanced 150k',mode:'challenge',fee:245,list:'489 $/Monat',code:'ALPHA50',target:12000,dd:5250,buf:0,minp:2000,wfrac:50,cap:15000,split:90,maxp:5,note:'Ziel und Drawdown aus Drittquelle (TradeTanto).'},
      {id:'af-direct-50',n:'Direct 50k (ohne Challenge)',mode:'instant',fee:260,list:'519 $ einmalig',code:'ALPHA50',target:0,dd:2000,buf:0,minp:3000,wfrac:100,cap:2000,split:90,maxp:5,note:'Erster Payout nach 3.000 $ Zyklusgewinn, danach 2.000 $. Consistency 20 %, Daily Loss 1.000 $.'}
    ]},
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
