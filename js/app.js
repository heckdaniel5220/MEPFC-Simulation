/* Glitch-Simulator – Oberfläche (Regler, Angebotsauswahl, Kennzahlen, Chart, Tabellen). */
(function(){
  const fmt0 = new Intl.NumberFormat('de-DE',{maximumFractionDigits:0});
  const kTxt = v => new Intl.NumberFormat('de-DE',{maximumFractionDigits:1}).format(v/1000)+'k';
  const usd = v => (v<0?'−':'') + fmt0.format(Math.round(Math.abs(v))) + ' $';
  const sgn = v => (v>0?'+':v<0?'−':'') + fmt0.format(Math.round(Math.abs(v))) + ' $';
  const pct = v => fmt0.format(Math.round(v*100)) + ' %';
  const $ = id => document.getElementById(id);

  const IDS = ['fee','target','target2','dd','risk','rr','wr','cost','hp','buf','minp','wfrac','cap','split','maxp','n'];
  const {PRESETS,OFFERS}=window.GlitchData;
  const {simulate,prepare}=window.GlitchSim;
  const {autoParams,stratFromUi,slipFromUi,slipFields,SLIP_NUM}=window.GlitchParams;
  const Rank=window.GlitchRank;
  // Strategie-Regler (M-007a): Trades pro Tag, Auto-Risiko in % des Drawdowns, Kosten in % des Risikos
  const EXTRA=['tradesPerDay','riskPct','costPct'];
  let seed = 20261015;


  // Maßgeblich ist das Zahlenfeld; der Regler zeigt den Wert nur an (er rastet auf seine Schrittweite ein)
  const num = s => parseFloat(String(s).replace(',','.'));
  function val(k){
    const ni=$(k+'-n'), v=ni?num(ni.value):NaN;
    let x=isFinite(v)?v:parseFloat($(k).value);
    // Anzahlen sind ganz und ≥ 1, sonst läuft die Schleife einen Account mehr (100,5 → 101)
    if(k==='n'||k==='maxp'||k==='tradesPerDay') x=Math.max(1,Math.round(x));
    return x;
  }
  // Werte aller UI-Felder, die in P landen
  function uiVals(){
    const u={mode:$('mode').value,hfund:$('hfund').checked,ddStatic:$('ddstatic').checked,
      tradesPerDay:val('tradesPerDay'),dllCompliant:$('dllCompliant').checked,consCompliant:$('consCompliant').checked,daysCompliant:$('daysCompliant').checked};
    IDS.forEach(k=>u[k]=val(k));
    // Slippage (M-017b): Felder → P-Schlüssel nur über slipFromUi (aus = keine Schlüssel, Anteil der Ausreißer in %)
    const f={slipMode:$('slipMode').value}; SLIP_NUM.forEach(k=>f[k]=val(k));
    return Object.assign(u,slipFromUi(f));
  }
  // Slip-Felder setzen (aus P bzw. Strategie; fehlend = aus mit Standardwerten) und Sichtbarkeit anpassen
  function applySlip(src){
    const f=slipFields(src);
    $('slipMode').value=f.slipMode; SLIP_NUM.forEach(k=>setNum(k,f[k]));
    slipVis();
  }
  // Bei „aus“ nur die Auswahl, bei „fest“ Slippage und Puffer, bei „mit Ausreißern“ zusätzlich die Tail-Felder
  function slipVis(){
    const m=$('slipMode').value, on=m!=='none';
    $('w-slipPct').hidden=!on; $('w-slipBuffer').hidden=!on; $('slip-note').hidden=!on;
    $('w-slipTailPct').hidden=m!=='dist'; $('w-slipTailProb').hidden=m!=='dist';
  }
  const pctDe=v=>String(Math.round(v*100)/100).replace('.',',');
  // Kurztext der Slippage einer Strategie bzw. von P (null bei aus); Anteil der Ausreißer in P als Anteil
  function slipTxt(o){
    if(!o.slipMode||o.slipMode==='none') return null;
    const b=o.slipBuffer>0?`, Puffer ${pctDe(o.slipBuffer)} %`:'';
    return o.slipMode==='fixed'
      ? `Slippage am Stop fest ${pctDe(o.slipPct)} % des Risikos${b}`
      : `Slippage am Stop ${pctDe(o.slipPct)} %, Ausreißer ${pctDe(o.slipTailPct)} % bei ${pctDe(o.slipTailProb*100)} % der Verluste${b}`;
  }
  // UI-Werte plus Steuerfelder des Auto-Risikos (Eingabe für stratFromUi)
  function stratUi(){ return Object.assign(uiVals(),{riskPct:val('riskPct'),costPct:val('costPct'),autorisk:$('autorisk').checked}); }
  // Strategie-Felder in die Oberfläche schreiben (Klick auf eine Ranglisten-Zeile stellt den Schnappschuss wieder her)
  function setNum(k,v){ const rg=$(k), ni=$(k+'-n'); if(v>parseFloat(rg.max)) rg.max=v; rg.value=v; if(ni) ni.value=v; }
  function applyStrat(st){
    setNum('tradesPerDay',st.tradesPerDay); setNum('riskPct',st.riskPct); setNum('costPct',st.costPct);
    ['dllCompliant','consCompliant','daysCompliant'].forEach(k=>{ $(k).checked=st[k]!==false; });
    $('hfund').checked=!!st.hfund; $('autorisk').checked=st.autorisk!==false;
    applySlip(st);
  }
  // UI gewinnt; vom gewählten Angebot kommen nur die Felder ohne UI-Element (DLL, Consistency, …). Unvorbereitet.
  function read(){ return autoParams(OFFER_BY[$('offer').value],uiVals()); }
  function apply(pr){
    $('mode').value=pr.mode; $('hfund').checked=!!pr.hfund; $('ddstatic').checked=!!pr.ddStatic;
    IDS.forEach(k=>{
      const v = pr[k]!==undefined ? pr[k] : (k==='target2'?0:val(k)), rg=$(k), ni=$(k+'-n');
      if(v>parseFloat(rg.max)) rg.max=v;
      rg.value=v; if(ni) ni.value=v;
    });
    // Video-Szenarien haben keine Slippage: ihr apply setzt sie auf aus (M-017b)
    applySlip(pr);
  }


  function niceStep(span){const raw=span/5;const m=Math.pow(10,Math.floor(Math.log10(raw||1)));const f=raw/m;return (f<1.5?1:f<3?2:f<7?5:10)*m;}

  function drawChart(R,P){
    const svg=$('chart'),W=760,H=300,L=72,Rr=16,T=14,B=34;
    const all=R.cumNo.concat(R.cumHe,R.cumReal);
    let mn=Math.min(0,...all),mx=Math.max(0,...all); if(mx-mn<1){mx+=1;mn-=1;}
    const st=niceStep(mx-mn); mn=Math.floor(mn/st)*st; mx=Math.ceil(mx/st)*st;
    const x=i=>L+(W-L-Rr)*i/(R.cumNo.length-1), y=v=>T+(H-T-B)*(mx-v)/(mx-mn);
    let s='';
    for(let v=mn;v<=mx+1e-9;v+=st){
      const yy=y(v).toFixed(1);
      s+=`<line x1="${L}" x2="${W-Rr}" y1="${yy}" y2="${yy}" stroke="var(--line)" stroke-width="${v===0?1.5:1}" ${v===0?'':'stroke-dasharray="2 4"'}/>`;
      s+=`<text x="${L-8}" y="${(+yy+4)}" text-anchor="end">${(v<0?'−':'')+fmt0.format(Math.abs(v))} $</text>`;
    }
    const n=R.cumNo.length-1, xs=niceStep(n);
    for(let i=0;i<=n;i+=xs){s+=`<text x="${x(i).toFixed(1)}" y="${H-12}" text-anchor="middle">${fmt0.format(i)}</text>`;}
    s+=`<text x="${W-Rr}" y="${H-0}" text-anchor="end">Accounts</text>`;
    const path=arr=>{const k=Math.max(1,Math.floor(arr.length/700));let d='';for(let i=0;i<arr.length;i+=k){d+=(i?'L':'M')+x(i).toFixed(1)+' '+y(arr[i]).toFixed(1);}const j=arr.length-1;d+='L'+x(j).toFixed(1)+' '+y(arr[j]).toFixed(1);return d;};
    s+=`<path d="${path(R.cumReal)}" fill="none" stroke="var(--real)" stroke-width="1.6" stroke-dasharray="5 4"/>`;
    s+=`<path d="${path(R.cumNo)}" fill="none" stroke="var(--nohedge)" stroke-width="2.4"/>`;
    s+=`<path d="${path(R.cumHe)}" fill="none" stroke="var(--hedge)" stroke-width="2.4"/>`;
    const j=R.cumNo.length-1;
    s+=`<circle cx="${x(j)}" cy="${y(R.cumNo[j])}" r="4" fill="var(--nohedge)"/><circle cx="${x(j)}" cy="${y(R.cumHe[j])}" r="4" fill="var(--hedge)"/>`;
    svg.innerHTML=s;
  }

  const RES=document.querySelector('.results');
  function blocked(msg){
    $('err').textContent=msg; $('err').hidden=false; RES.classList.add('blocked');
    last=null;
  }
  const hasDays=P=>(P.mode==='challenge'&&(P.evalMinDays>0||P.evalWinDays>0))||P.payMinDays>0||P.payWinDays>0;
  function ruleHint(P,off){
    if(!off) return 'Die drei Schalter wirken nur bei einem gewählten Angebot mit Tageslimit, Consistency-Regel bzw. Tage-Regeln.';
    const miss=[];
    if(!(P.dllEval>0||P.dllFunded>0||P.dllScaleFunded>0)) miss.push(['kein Tageslimit','Daily Loss Limit regeltreu']);
    if(!(P.consEval>0||P.consFunded>0)) miss.push(['keine Consistency-Regel','Consistency regeltreu']);
    if(!hasDays(P)) miss.push(['keine Tage-Regeln','Tage-Regeln regeltreu']);
    if(!miss.length) return '';
    return `Dieses Angebot hat ${miss.map(m=>m[0]).join(', ')}: Schalter ${miss.map(m=>`„${m[1]}“`).join(', ')} ohne Wirkung.`;
  }
  function render(){
    const P0=read(), off=OFFER_BY[$('offer').value];
    const instant=P0.mode==='instant';
    ['target','target2'].forEach(k=>{ $('w-'+k).classList.toggle('dis',instant); $(k).disabled=instant; $(k+'-n').disabled=instant; });
    const autoOn=$('autorisk').checked;
    ['riskPct','costPct'].forEach(k=>{ $('w-'+k).classList.toggle('dis',!autoOn); $(k).disabled=!autoOn; $(k+'-n').disabled=!autoOn; });
    $('rule-hint').textContent=ruleHint(P0,off);
    if(P0.notTradable) return blocked(P0.reason);
    let P,R;
    try{ P=prepare(P0); R=simulate(P,seed); }
    catch(e){ return blocked('Simulation nicht möglich: '+e.message); }
    $('err').hidden=true; RES.classList.remove('blocked');
    // Mittlere Slippage je Verlust (M-017b): fest slipPct, mit Ausreißern (1 − q) · slipPct + q · slipTailPct, in $ = s̄/100 × Risiko
    const slipOn=P.slipMode!=='none';
    const sBar=P.slipMode==='fixed'?P.slipPct:P.slipMode==='dist'?(1-P.slipTailProb)*P.slipPct+P.slipTailProb*P.slipTailPct:0, s=sBar/100*P.risk;
    const be=1/(1+P.rr), beC=slipOn?(P.risk+P.cost+s)/(P.risk*(1+P.rr)+s):(P.risk+P.cost)/(P.risk*(1+P.rr));
    $('wr-hint').textContent=`Ohne Edge bei diesem CRV: ${fmt0.format(be*100)} %, mit Kosten${slipOn?' und Slippage':''} ${fmt0.format(beC*100)} %. ${P.p>beC+0.005?'Über Break-even: Edge vorhanden.':P.p<be-0.005?'Unter Break-even: negativer Edge.':'Etwa Break-even: kein Edge.'}`;
    const calibH = instant ? P.fee/P.dd : P.fee/P.dd;
    $('hp-hint').textContent=`Fee genau zurück = Fee ÷ Drawdown = ${String((calibH*100).toFixed(1)).replace('.',',')} %. Etwas mehr bringt beim Verlieren einen kleinen Gewinn. 0 % = kein Gegentrade.${P.feeMonthly>0?' Monatsabo nicht eingerechnet.':''}`;

    const n=P.n;
    $('k-no').textContent=sgn(R.netNo/n); $('k-no').className='val '+(R.netNo>=0?'pos':'neg');
    $('k-no-s').textContent=`pro Account · gesamt ${sgn(R.netNo)}`;
    $('k-he').textContent=sgn(R.netHe/n); $('k-he').className='val '+(R.netHe>=0?'pos':'neg');
    $('k-he-s').textContent=`pro Account · gesamt ${sgn(R.netHe)}`;
    $('k-real').textContent=usd(-R.realMin);
    $('k-real-s').textContent=`Echtgeld nötig (größter Rückgang) · Ergebnis ${sgn(R.real)}`;

    // Fee-Text; bei Monatsabo dazu Ø gezahlte Gebühren der verlorenen Challenges (aus R.list.feesPaid, reine Anzeige)
    const lost=R.list.filter(x=>x.res==='fail');
    const feeTxt=P.feeMonthly>0&&!instant?`Fee ${usd(P.fee)}/Monat, Ø gezahlt ${usd(lost.length?lost.reduce((a,x)=>a+x.feesPaid,0)/lost.length:P.fee)}`:`Fee ${usd(P.fee)}`;
    const diff=(R.netHe-R.netNo)/n;
    const passRate=instant? R.paid/n : R.passed/n;
    let v;
    if(P.h===0){ v=`Gegentrade ist auf 0 % gestellt. Beide Linien sind identisch.`; }
    else {
      const fA=R.nFail?R.hFail/R.nFail:0, sA=R.nSucc?R.hSucc/R.nSucc:0;
      v=`<b>Refinanzierung:</b> Jede ${instant?'vor der ersten Auszahlung verlorene Runde':'verlorene Challenge'} bringt auf dem Echtgeld-Konto im Schnitt ${sgn(fA)} (${feeTxt}). Dafür kostet jede ${instant?'Runde mit Auszahlung':'bestandene Challenge'} im Schnitt ${sgn(sA)}. `;
      v+=`<b>Unterm Strich verändert der Gegentrade das Ergebnis um ${sgn(diff)} pro Account</b> (${sgn(R.netHe-R.netNo)} gesamt). `;
      if(P.p>beC+0.005) v+=`Weil hier ein echter Edge drin ist, gewinnt der Prop-Account öfter, und genau dann verliert das Echtgeld-Konto. Der Hedge kostet also Geld.`;
      else if(P.p<be-0.005) v+=`Hier ist der Edge negativ. Der Gegentrade gewinnt nur, weil er die Gegenseite eines Verlust-Systems handelt. Dafür bräuchtest du die Prop-Firma nicht.`;
      else v+=`Ohne Edge gleicht sich der Gegentrade aus: verlorene Accounts holen die Fee zurück, bestandene kosten Echtgeld. Übrig bleiben die zusätzlichen Spread-Kosten. Den Gewinn oder Verlust machen allein die Payouts.`;
    }
    $('verdict').innerHTML=v;

    drawChart(R,P);

    // seine rechnung
    const won = instant ? Math.min(P.cap,P.minp*P.wf) : P.target;
    const mine = 0.5*won-0.5*P.fee;
    const avgPayPassed = (instant? (R.paid? R.pay/R.paid:0) : (R.passed? R.pay/R.passed:0));
    $('calc').innerHTML=`
      <div class="line"><span>Whiteboard aus dem Video (fest, Zahlen aus dem Video): 50 % × 2.000 $ − 50 % × 100 $</span><span class="pos">+950 $</span></div>
      <div class="line"><span>Dieselbe Formel für ${off?`<b>${off.firm} ${off.n}</b>`:'die eigenen Werte'}: 50 % × ${usd(won)} ${instant?'Auszahlungswert':'Ziel'} − 50 % × ${usd(P.fee)} Fee</span><span class="${mine>=0?'pos':'neg'}">${sgn(mine)}</span></div>
      <div class="line"><span>${instant?'Payout-Quote':'Pass-Quote'} in der Simulation (statt 50 %)</span><span>${pct(passRate)}</span></div>
      <div class="line"><span>Ø Auszahlung pro ${instant?'Account mit Payout':'bestandenem Account'} (statt 2.000 $)</span><span>${usd(avgPayPassed)}</span></div>
      ${instant?'':`<div class="line"><span>Bestandene Accounts ohne jede Auszahlung</span><span>${pct(R.passed? R.passNo/R.passed:0)}</span></div>`}
      <div class="line"><span>Echtes Ergebnis pro Account (ohne / mit Gegentrade)</span><span><span class="${R.netNo>=0?'pos':'neg'}">${sgn(R.netNo/n)}</span> / <span class="${R.netHe>=0?'pos':'neg'}">${sgn(R.netHe/n)}</span></span></div>
      <p class="note">${instant?'Auszahlungswert = 1. Auszahlung an der Schwelle: min(Max. pro Auszahlung, Mindestgewinn × auszahlbarer Anteil), vor Split. ':''}Seine Rechnung behandelt „bestanden“ wie 2.000 $ Gewinn. Tatsächlich ist der Drawdown nur Puffer, und Payouts sind gedeckelt und unsicher.</p>`;

    // flow table
    $('flow').innerHTML=`
      <thead><tr><th><span class="sr">Posten</span></th><th>Ohne</th><th>Mit Gegentrade</th></tr></thead>
      <tbody>
        <tr><td class="txt">${P.feeMonthly>0?'Gebühren (inkl. Monatsabo)':'Fees'}</td><td class="neg">${sgn(-R.fees)}</td><td class="neg">${sgn(-R.fees)}</td></tr>
        <tr><td class="txt">Payouts (nach Split)</td><td class="pos">${sgn(R.pay)}</td><td class="pos">${sgn(R.pay)}</td></tr>
        <tr><td class="txt">Echtgeld bei ${instant?'vor 1. Auszahlung verlorenen':'verlorenen Challenges'} (${fmt0.format(R.nFail)}×)<br><span class="note">Ø ${sgn(R.nFail?R.hFail/R.nFail:0)} pro Account, ${feeTxt}</span></td><td>0 $</td><td class="${R.hFail>=0?'pos':'neg'}">${sgn(R.hFail)}</td></tr>
        <tr><td class="txt">Echtgeld bei ${instant?'Accounts mit 1. Auszahlung':'bestandenen Challenges'} (${fmt0.format(R.nSucc)}×)<br><span class="note">Ø ${sgn(R.nSucc?R.hSucc/R.nSucc:0)} pro Account</span></td><td>0 $</td><td class="${R.hSucc>=0?'pos':'neg'}">${sgn(R.hSucc)}</td></tr>
        ${P.hfund?`<tr><td class="txt">Echtgeld nach Bestehen</td><td>0 $</td><td class="${R.hAfter>=0?'pos':'neg'}">${sgn(R.hAfter)}</td></tr>`:''}
        <tr><td class="txt"><b>Netto</b></td><td class="${R.netNo>=0?'pos':'neg'}"><b>${sgn(R.netNo)}</b></td><td class="${R.netHe>=0?'pos':'neg'}"><b>${sgn(R.netHe)}</b></td></tr>
      </tbody>`;
    $('outc').textContent = instant
      ? `${fmt0.format(R.fail+R.passNo)} von ${fmt0.format(n)} Accounts ohne Auszahlung verloren, ${fmt0.format(R.paid)} mit mindestens einer Auszahlung (insgesamt ${fmt0.format(R.nPayTot)} Auszahlungen).`
      : `${fmt0.format(R.fail)} von ${fmt0.format(n)} Challenges verloren, ${fmt0.format(R.passed)} bestanden. Davon ${fmt0.format(R.paid)} mit mindestens einer Auszahlung, ${fmt0.format(R.passNo)} vorher verloren.`;

    // Slippage gesamt (M-017b): kein eigener Geldfluss, steckt in Bestehen und Auszahlungen
    $('slipc').hidden=!slipOn;
    if(slipOn) $('slipc').textContent=`Slippage gesamt: ${usd(R.slipPaid)} auf den Prop-Konten (Ø ${usd(R.slipPaid/n)} je Account). Steckt bereits in Bestehen und Auszahlungen.`;

    last={R,P,instant,slip:slipOn};
    renderList();
  }

  // ---- Account-Tabelle: alle n Accounts, 50 pro Seite, Filter und Sortierung; nur die sichtbare Seite wird gebaut ----
  const PAGE=50, RANK={fail:0,pass:1,paid:2};
  const LS={sort:'i',dir:1,filter:'all',page:0,open:-1};
  let last=null;
  const COLS=[['i','#'],['res','Ergebnis'],['trades','Trades'],['days','Tage gesamt'],['pay','Payouts'],['hedge','Echtgeld'],['netNo','Netto ohne'],['netHe','Netto mit']];
  // Mit Slippage (M-017b) zusätzlich „Slippage“ vor den Netto-Spalten
  const colsOf=slip=>slip?COLS.slice(0,6).concat([['slipPaid','Slippage']],COLS.slice(6)):COLS;
  const PHN={step1:'Step 1',step2:'Step 2',funded:'Funded'};
  function filters(instant){
    return instant
      ? [['all','Alle'],['pass','Ohne Auszahlung verloren'],['paid','Mit Auszahlung']]
      : [['all','Alle'],['fail','Verloren'],['pass','Bestanden ohne Auszahlung'],['paid','Mit Auszahlung']];
  }
  function pill(x,instant){
    return x.res==='fail' ? '<span class="pill fail">Challenge verloren</span>'
      : x.res==='paid' ? `<span class="pill paid">${x.nPay}× ausgezahlt</span>`
      : `<span class="pill pass">${instant?'verloren':'bestanden, kein Payout'}</span>`;
  }
  function detail(a,slip){
    let h=`<div class="det"><table><thead><tr><th>Phase</th><th>Handels&shy;tage</th><th>Gewinn&shy;tage</th><th>Tag von–bis</th><th>DLL-Stopps</th><th>Consistency-Blockaden</th>${slip?'<th>Slippage-Brüche DLL / DD</th>':''}</tr></thead><tbody>`;
    let pnl='';
    for(const k of ['step1','step2','funded']){
      const ph=a.phases[k]; if(!ph) continue;
      h+=`<tr><td class="txt">${PHN[k]}</td><td>${ph.days}</td><td>${ph.winDays}</td><td>${ph.firstDay===null?'–':ph.firstDay+'–'+ph.lastDay}</td><td>${ph.dllStops}</td><td>${ph.consBlocks}</td>${slip?`<td>${ph.dllSlipBreaches} / ${ph.ddSlipBreaches}</td>`:''}</tr>`;
      const d=ph.dayPnl, more=d.length>40?` … (${fmt0.format(d.length)} Tage)`:'';
      pnl+=`<p><b>${PHN[k]}</b> Tages-P&amp;L: ${d.slice(0,40).map(v=>`<span class="${v>0?'pos':v<0?'neg':''}">${sgn(v)}</span>`).join(' · ')}${more}</p>`;
    }
    h+=`</tbody></table>${pnl}<p>Echtgeld in der Absicherungsphase ${sgn(a.hedgeEval)}, danach ${sgn(a.hedgeFund)}.</p>`;
    if(slip) h+=`<p>Slippage auf dem Prop-Konto ${usd(a.slipPaid)}. Slippage-Brüche: Tageslimit bzw. Drawdown wäre ohne die Slippage dieses Trades nicht gerissen. Der DD-Anteil hängt stark am Raster der Verluste (Vielfache von Risiko + Kosten) und ist nur ein Hinweis.</p>`;
    h+='</div>';
    return h;
  }
  function renderList(){
    if(!last) return;
    const {R,P,instant,slip}=last, list=R.list, cols=colsOf(slip);
    if(!cols.some(c=>c[0]===LS.sort)){ LS.sort='i'; LS.dir=1; }
    const cnt={all:list.length,fail:0,pass:0,paid:0}; list.forEach(x=>cnt[x.res]++);
    const fl=filters(instant); if(!fl.some(f=>f[0]===LS.filter)) LS.filter='all';
    $('lfilter').innerHTML=fl.map(([k,l])=>`<button type="button" data-f="${k}" aria-pressed="${LS.filter===k}">${l} <span class="num">${fmt0.format(cnt[k])}</span></button>`).join('');
    let rows=LS.filter==='all'?list.slice():list.filter(x=>x.res===LS.filter);
    const k=LS.sort, d=LS.dir;
    rows.sort((x,y)=>{ const a=k==='res'?RANK[x.res]:x[k], b=k==='res'?RANK[y.res]:y[k]; return (a-b)*d || x.i-y.i; });
    const pages=Math.max(1,Math.ceil(rows.length/PAGE)); if(LS.page>=pages) LS.page=pages-1;
    const from=LS.page*PAGE, vis=rows.slice(from,from+PAGE);
    let t='<thead><tr>'+cols.map(([c,l])=>`<th aria-sort="${LS.sort===c?(d>0?'ascending':'descending'):'none'}"><button type="button" class="sort" data-k="${c}">${l}${LS.sort===c?(d>0?' ▲':' ▼'):''}</button></th>`).join('')+'</tr></thead><tbody>';
    for(const x of vis){
      const det=x.i<R.accts.length, open=det&&LS.open===x.i;
      t+=`<tr${det?` class="clk${open?' open':''}" data-i="${x.i}" tabindex="0" aria-expanded="${open}"`:''}><td>${x.i+1}${det?'<span class="chev" aria-hidden="true"></span>':''}</td><td class="txt">${pill(x,instant)}</td><td>${fmt0.format(x.trades)}</td><td>${fmt0.format(x.days)}</td><td>${x.pay?sgn(x.pay):'–'}</td><td class="${x.hedge>=0?'pos':'neg'}">${P.h?sgn(x.hedge):'–'}</td>${slip?`<td class="${x.slipPaid>0?'neg':''}">${x.slipPaid?sgn(-x.slipPaid):'–'}</td>`:''}<td class="${x.netNo>=0?'pos':'neg'}">${sgn(x.netNo)}</td><td class="${x.netHe>=0?'pos':'neg'}">${sgn(x.netHe)}</td></tr>`;
      if(open) t+=`<tr class="detrow"><td colspan="${cols.length}">${detail(R.accts[x.i],slip)}</td></tr>`;
    }
    if(!vis.length) t+=`<tr><td colspan="${cols.length}" class="txt note">Keine Accounts in diesem Filter.</td></tr>`;
    $('trace').innerHTML=t+'</tbody>';
    $('lpage').textContent=rows.length?`Accounts ${fmt0.format(from+1)}–${fmt0.format(from+vis.length)} von ${fmt0.format(rows.length)} · Seite ${LS.page+1} von ${pages}`:'0 Accounts';
    $('lprev').disabled=LS.page<=0; $('lnext').disabled=LS.page>=pages-1;
  }
  $('lfilter').addEventListener('click',e=>{const b=e.target.closest('button[data-f]'); if(!b) return; LS.filter=b.dataset.f; LS.page=0; renderList();});
  $('lprev').addEventListener('click',()=>{LS.page--; renderList();});
  $('lnext').addEventListener('click',()=>{LS.page++; renderList();});
  const toggle=tr=>{const i=+tr.dataset.i; LS.open=LS.open===i?-1:i; renderList();};
  $('trace').addEventListener('click',e=>{
    const b=e.target.closest('button[data-k]');
    if(b){ const k=b.dataset.k; if(LS.sort===k) LS.dir=-LS.dir; else {LS.sort=k; LS.dir=k==='i'?1:-1;} LS.page=0; renderList(); return; }
    const tr=e.target.closest('tr[data-i]'); if(tr) toggle(tr);
  });
  $('trace').addEventListener('keydown',e=>{const tr=e.target.closest('tr[data-i]'); if(tr&&(e.key==='Enter'||e.key===' ')){e.preventDefault(); toggle(tr); const n=$('trace').querySelector(`tr[data-i="${tr.dataset.i}"]`); if(n) n.focus();}});

  // Zahlenfelder neben jeden Regler setzen
  const UNIT={tradesPerDay:'×',riskPct:'%',costPct:'%',fee:'$',target:'$',target2:'$',dd:'$',risk:'$',rr:'',wr:'%',cost:'$',hp:'%',buf:'$',minp:'$',wfrac:'%',cap:'$',split:'%',maxp:'×',n:'',slipPct:'%',slipTailPct:'%',slipTailProb:'%',slipBuffer:'%'};
  const PRE={rr:'1 :'};
  IDS.concat(EXTRA,SLIP_NUM).forEach(k=>{
    const rg=$(k), out=$(k+'-o'); if(!out) return;
    const box=document.createElement('span'); box.className='numbox';
    if(PRE[k]){const p=document.createElement('span');p.className='unit';p.textContent=PRE[k];box.appendChild(p);}
    const ni=document.createElement('input'); ni.type='number'; ni.id=k+'-n'; ni.inputMode='decimal';
    ni.step=rg.step; ni.min=0; ni.value=rg.value; ni.setAttribute('aria-label',(document.querySelector(`label[for="${k}"]`)||{}).textContent||k);
    box.appendChild(ni);
    if(UNIT[k]){const u=document.createElement('span');u.className='unit';u.textContent=UNIT[k];box.appendChild(u);}
    out.replaceWith(box);
    // Das Minimum nicht absenken: sonst verschiebt sich das Raster des Reglers (min 1, Schritt 10 → 101 statt 100)
    ni.addEventListener('input',()=>{
      const v=num(ni.value);
      if(!isFinite(v)) return;
      if(v>parseFloat(rg.max)) rg.max=v;
      rg.value=v;
    });
    rg.addEventListener('input',()=>{ni.value=rg.value;});
  });

  const OFFER_BY={};
  (function fill(){
    const sel=$('offer');
    OFFERS.forEach(gr=>{const og=document.createElement('optgroup');og.label=gr.g;
      gr.items.forEach(o=>{OFFER_BY[o.id]=Object.assign({firm:gr.g.split(' · ')[0]},o);const op=document.createElement('option');op.value=o.id;op.textContent=`${o.n} · ${fmt0.format(o.fee)} $${o.feeMonthly>0?'/Monat':''}`;og.appendChild(op);});
      sel.appendChild(og);});
  })();
  const pctTxt=v=>String(Math.round(v*100)/100).replace('.',',');
  // DLL und Consistency des Angebots in Worten
  function rulesTxt(o){
    const ch=o.mode==='challenge', t=[];
    if(o.dllEval>0||o.dllFunded>0||o.dllScaleFunded>0){
      const parts=[]; if(ch&&o.dllEval>0) parts.push('Challenge '+usd(o.dllEval)); if(o.dllFunded>0) parts.push('Funded '+usd(o.dllFunded));
      if(ch&&!(o.dllEval>0)) parts.push('in der Challenge keins'); if(!(o.dllFunded>0)) parts.push('im Funded keins');
      const sc=o.dllScaleFunded>0?`, ab ${usd(o.dllScaleFrom)} Gewinn mind. ${pctTxt(o.dllScaleFunded*100)} % des höchsten Tagesend-Gewinns`:'';
      t.push(`Tageslimit ${parts.join(', ')}${sc} (${o.dllType==='hard'?'hart: Bruch beendet Challenge bzw. Account':'weich: Tag endet'})`);
    } else t.push('Kein Tageslimit');
    if(o.consEval>0||o.consFunded>0){
      const parts=[]; if(ch&&o.consEval>0) parts.push(`Challenge ${pctTxt(o.consEval)} %`);
      if(o.consFunded>0) parts.push(`Funded ${pctTxt(o.consFunded)} % ${o.consFundedMode==='perpetual'?'über alle Funded-Tage':'je Auszahlungszyklus'}`);
      t.push(`Consistency (bester Tag < Anteil am Gewinn) ${parts.join(', ')}`);
    } else t.push('Keine Consistency-Regel');
    t.push(daysTxt(o));
    t.push(calTxt(o));
    return t.join('. ')+'.';
  }
  // Tage-Regeln (M-004): Mindest-Handelstage und Gewinntage mit Schwelle, Challenge je Step, Funded je Auszahlungszyklus
  function daysTxt(o){
    const win=(n,x)=>`${n} Gewinntage ${x>0?'≥ '+usd(x):'mit Gewinn > 0 $'}`;
    const ev=[], pay=[];
    if(o.mode==='challenge'){
      if(o.evalMinDays>0) ev.push(`mind. ${o.evalMinDays} Handelstag${o.evalMinDays>1?'e':''}`);
      if(o.evalWinDays>0) ev.push(win(o.evalWinDays,o.evalWinDayMin));
    }
    if(o.payMinDays>0) pay.push(`mind. ${o.payMinDays} Handelstag${o.payMinDays>1?'e':''}`);
    if(o.payWinDays>0) pay.push(win(o.payWinDays,o.payWinDayMin));
    if(!ev.length&&!pay.length) return 'Keine Tage-Regeln';
    const parts=[];
    if(ev.length) parts.push(`Challenge ${ev.join(' und ')}${o.target2>0?' je Step':''}`);
    if(pay.length) parts.push(`Funded ${pay.join(' und ')} je Auszahlungszyklus`);
    return 'Tage-Regeln: '+parts.join(', ');
  }
  // Kalender und Monatsabo (M-005): Wartezeit bis zur 1. Auszahlung, Rhythmus, Abo der Challenge
  function calTxt(o){
    const kt=n=>`${n} Kalendertag${n>1?'e':''}`;
    const t=[];
    if(o.payFirstAfterCal>0) t.push(`1. Auszahlung frühestens ${kt(o.payFirstAfterCal)} nach dem 1. Funded-Trade`);
    if(o.payEveryCal>0) t.push(`${o.payFirstAfterCal>0?'danach ':'Auszahlung '}alle ${kt(o.payEveryCal)}`);
    let s=t.length?t.join(', '):'Keine Wartezeit für Auszahlungen';
    if(o.feeMonthly>0&&o.mode==='challenge') s+=`. Monatsabo: je weitere angefangene 30 Kalendertage der Challenge ${usd(o.feeMonthly)}`;
    if(o.feeActivation>0) s+=`. Aktivierungsgebühr ${usd(o.feeActivation)}`;
    return s;
  }
  // strat: Strategie aus stratFromUi (Standard: aktuelle Oberfläche); die Rangliste übergibt ihren Schnappschuss
  function applyOffer(id,strat){
    const o=OFFER_BY[id]; if(!o){ $('offer-note').textContent='Eigene Werte. Wähle ein Angebot, um Fee, Ziel, Drawdown und Payout-Regeln automatisch zu setzen.'; return; }
    strat=strat||stratFromUi(stratUi());
    const autorisk=strat.autorisk, riskPct=strat.riskPct, costPct=strat.costPct;
    const P=autoParams(o,strat);
    apply(P);
    const two=o.target2?` → ${usd(o.target2)}`:'';
    const size=o.rules&&o.rules.size;
    const mr=o.maxRisk?`, max. ${usd(o.maxRisk)} offenes Risiko${size?` (${pctTxt(o.maxRisk/size*100)} % des Kontos)`:''}, Firmenregel, gilt hier auch in der Challenge (Modellannahme)`:'';
    $('offer-note').innerHTML=`<b>${o.n}</b>: ${o.mode==='instant'?'ohne Challenge':'Ziel '+usd(o.target)+two}, Drawdown ${usd(o.dd)} ${o.ddStatic?'statisch':'trailing'}. Fee ${usd(o.fee)} (Liste ${o.list}, Code ${o.code}).<br>${rulesTxt(o)}<br>${o.note}`
      +(autorisk?`<br>Risiko pro Trade = ${pctTxt(riskPct)} % des Drawdowns${mr}, Kosten = ${pctTxt(costPct)} % des Risikos. Ändern von Risiko- oder Kosten-% setzt die Angebotswerte zurück.`:'')
      +(P.riskCapped?`<br><b>Risiko gedeckelt (DLL):</b> ${P.reason}`:'');
  }
  $('offer').addEventListener('change',e=>{applyOffer(e.target.value);setPressed('');render();});
  $('autorisk').addEventListener('change',()=>{if($('offer').value){applyOffer($('offer').value);render();}});
  // Risiko- oder Kosten-% ändern: Angebot neu anwenden (setzt von Hand geänderte Angebotswerte zurück)
  ['riskPct','costPct'].forEach(k=>[k,k+'-n'].forEach(id=>$(id).addEventListener('input',()=>{if($('offer').value&&$('autorisk').checked) applyOffer($('offer').value);})));

  let tm; const schedule=()=>{clearTimeout(tm);tm=setTimeout(render,60);};
  // Presets = Video-Szenarien mit festen Werten (M-013): Hinweis, solange eines gedrückt ist, bei zwei ein Knopf zum echten Angebot
  const PRESET_KEYS=[['p-futures','futures'],['p-coin','coin'],['p-edge','edge'],['p-instant','instant'],['p-afstd','afstd']];
  const PRESET_OFFER={afstd:'af-std-50',instant:'ac-d-50'};
  const setPressed=id=>{
    document.querySelectorAll('.presets button').forEach(b=>b.setAttribute('aria-pressed',b.id===id?'true':'false'));
    const k=(PRESET_KEYS.find(p=>p[0]===id)||[])[1], o=k&&OFFER_BY[PRESET_OFFER[k]], b=$('preset-offer');
    $('preset-note').hidden=!k;
    b.hidden=!o;
    if(o){ b.dataset.id=o.id; b.textContent=`Echtes Angebot wählen: ${o.firm} ${o.n}`; }
  };
  PRESET_KEYS.forEach(([id,k])=>{
    $(id).addEventListener('click',()=>{apply(PRESETS[k]);setPressed(id);$('offer').value='';applyOffer('');render();checkStale();});
  });
  $('preset-offer').addEventListener('click',e=>{
    const id=e.currentTarget.dataset.id; if(!OFFER_BY[id]) return;
    $('offer').value=id; applyOffer(id); setPressed(''); render(); checkStale();
  });
  $('ctl').addEventListener('input',()=>{setPressed('');schedule();});
  $('mode').addEventListener('change',()=>{setPressed('');render();});
  $('slipMode').addEventListener('change',slipVis);
  $('calib').addEventListener('click',()=>{const P=read();const v=Math.min(30,Math.round(P.fee*1.25/P.dd*200)/2);$('hp').value=v;$('hp-n').value=v;render();});
  $('reroll').addEventListener('click',()=>{seed=(seed*1103515245+12345)>>>0;render();checkStale();});

  // ---- Rangliste (M-015b): alle Angebote mit der eingestellten Strategie, ein Angebot pro setTimeout ----
  const fmtFee=new Intl.NumberFormat('de-DE',{maximumFractionDigits:2});
  const fee$=v=>fmtFee.format(v)+' $';
  const pct0=v=>(v>0?'+':v<0?'−':'')+fmt0.format(Math.round(Math.abs(v*100)))+' %';
  const today=()=>{ const d=new Date(), z=x=>String(x).padStart(2,'0'); return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`; };
  const deDate=iso=>iso.split('-').reverse().join('.');
  const RK={sort:'net',dir:undefined,state:null,snap:null,rows:null,ms:0,aborted:false,timer:null};
  const ALL_OFFERS=OFFERS.reduce((a,g)=>a+g.items.length,0);
  const rankN=()=>{ const v=Math.round(num($('rankN').value)); return isFinite(v)&&v>=1?v:1000; };
  // Schnappschuss: Strategie (wie applyOffer sie an autoParams gibt), Gegentrade an/aus, Accounts je Angebot und Seed
  function snapNow(){ const hedge=$('rankHedge').checked, n=rankN(); return {strat:stratFromUi(stratUi(),{n,hedge}),hedge,n,seed}; }
  const snapKey=s=>JSON.stringify([s.strat,s.hedge,s.n,s.seed]);
  function checkStale(){
    $('rankStale').hidden=!RK.snap || snapKey(RK.snap)===snapKey(snapNow());
    riskHint();
  }
  function riskHint(){
    $('rankRiskHint').textContent=$('autorisk').checked
      ? `Risiko je Angebot = ${pctTxt(val('riskPct'))} % des Drawdowns (gedeckelt auf Firmenlimit und Tageslimit), Kosten = ${pctTxt(val('costPct'))} % des Risikos.`
      : `Auto-Risiko ist aus: Alle Angebote rechnen mit ${usd(val('risk'))} Risiko und ${usd(val('cost'))} Kosten pro Trade aus dem Steuerpult. Kleine Konten sind damit oft nicht handelbar.`;
    const st=slipTxt(uiVals());
    if(st) $('rankRiskHint').textContent+=` ${st}, für alle Angebote gleich${uiVals().slipBuffer>0?' (der Puffer kann das Risiko je Angebot zusätzlich deckeln)':''}.`;
  }
  function rankRun(){
    if(RK.timer) return;
    const snap=snapNow();
    RK.snap=snap; RK.rows=null; RK.aborted=false;
    RK.state=Rank.createRankState(OFFERS,Object.assign({},snap.strat,{seed:snap.seed,today:today()}),{simulate,prepare,autoParams});
    $('rankGo').disabled=true; $('rankStop').hidden=false; $('rankStale').hidden=true;
    const t0=performance.now();
    const tick=()=>{
      const st=RK.state;
      Rank.rankOffersStep(st);
      $('rankProg').textContent=`${fmt0.format(st.i)} / ${fmt0.format(st.total)}`;
      if(st.done||st.cancelled){
        RK.timer=null; RK.ms=performance.now()-t0; RK.aborted=st.cancelled; RK.rows=st.rows.slice();
        $('rankGo').disabled=false; $('rankStop').hidden=true;
        $('rankProg').textContent=RK.aborted
          ? `abgebrochen nach ${fmt0.format(st.i)} / ${fmt0.format(st.total)}`
          : `${fmt0.format(st.total)} Angebote × ${fmt0.format(snap.n)} Accounts in ${String((RK.ms/1000).toFixed(1)).replace('.',',')} s`;
        fillFilters(); renderRank(); checkStale();
        return;
      }
      RK.timer=setTimeout(tick,0);
    };
    RK.timer=setTimeout(tick,0);
  }
  function rankStop(){ if(RK.state) Rank.cancelRank(RK.state); }
  function fillFilters(){
    const firms=[...new Set(RK.rows.map(r=>r.firm))].sort((a,b)=>a.localeCompare(b,'de'));
    const sizes=[...new Set(RK.rows.map(r=>r.size).filter(v=>v!==null))].sort((a,b)=>a-b);
    const keep=(id,opts,first)=>{ const el=$(id), v=el.value; el.innerHTML=first+opts; if([...el.options].some(o=>o.value===v)) el.value=v; };
    keep('fFirma',firms.map(f=>`<option value="${f}">${f}</option>`).join(''),'<option value="all">Alle</option>');
    const so=sizes.map(v=>`<option value="${v}">${kTxt(v)}</option>`).join('');
    keep('fSizeMin',so,'<option value="">–</option>'); keep('fSizeMax',so,'<option value="">–</option>');
    $('rankFilter').hidden=false;
  }
  function curFilter(){
    const n=id=>{ const v=num($(id).value); return isFinite(v)?v:undefined; };
    return {markt:$('fMarkt').value,firma:$('fFirma').value,typ:$('fTyp').value,maxFee:n('fFee'),sizeMin:n('fSizeMin'),sizeMax:n('fSizeMax')};
  }
  // Spalten; k = Sortierschlüssel (Tage: calDays, sobald rank.js das Feld liefert)
  function rankCols(hasCal,hedge){
    return [['#','Platz'],['firm','Firma'],['offer','Angebot'],['fee','Fee'],['k:net','Netto/Account ± 95 %'],['k:roi','ROI'],['k:netPer1k','Netto je 1.000 $ DD'],
      ['pass','Pass'],['k:payout','Payout'],['k:'+(hasCal?'calDays':'days'),hasCal?'Ø Kalendertage bis 1. Auszahlung':'Ø Tage bis 1. Auszahlung'],...(hedge?[['q5','Schlechteste 5 % (Netto inkl. Gegentrade)']]:[]),['marks','Markierungen']];
  }
  function marks(r){
    const m=[];
    if(r.leader) m.push('<span class="pill lead">Platz 1</span>');
    if(r.tie) m.push('<span class="pill tie">gleichauf</span>');
    if(r.riskCapped) m.push(`<span class="pill cap" title="${r.reason}">Risiko gedeckelt (DLL)</span>`);
    if(r.notTradable) m.push('<span class="pill nt">nicht handelbar</span>');
    if(r.error) m.push(`<span class="pill exp" title="${r.error}">Fehler</span>`);
    const c=r.codeMark;
    if(c&&c.kind==='noExpiry') m.push(`<span class="pill code">Code ${r.code} ohne Ablauf</span>`);
    if(c&&c.kind==='until') m.push(c.expired?`<span class="pill exp">Code ${r.code} abgelaufen (${deDate(c.until)})</span>`:`<span class="pill code">Code ${r.code} bis ${deDate(c.until)}</span>`);
    let h=m.join('');
    if(r.notTradable||r.error) h+=`<span class="sub">${r.reason||r.error}</span>`;
    else if(r.riskCapped) h+=`<span class="sub">${r.reason}</span>`;
    return h;
  }
  function renderRank(){
    if(!RK.rows) return;
    const hasCal=RK.rows.some(r=>'calDays' in r), hedge=RK.snap.hedge;
    if(RK.sort==='days'&&hasCal) RK.sort='calDays';
    if(RK.sort==='calDays'&&!hasCal) RK.sort='days';
    const rows=Rank.filterRows(RK.rows,curFilter());
    const sorted=Rank.markTies(Rank.sortRows(rows,RK.sort,RK.dir),RK.sort);
    const cols=rankCols(hasCal,hedge);
    const dirNow=RK.dir||(RK.sort==='days'||RK.sort==='calDays'?'asc':'desc');
    let t='<thead><tr>'+cols.map(([c,l])=>{
      if(!c.startsWith('k:')) return `<th class="static">${l}</th>`;
      const k=c.slice(2), on=RK.sort===k;
      return `<th aria-sort="${on?(dirNow==='asc'?'ascending':'descending'):'none'}"><button type="button" class="sort" data-k="${k}">${l}${on?(dirNow==='asc'?' ▲':' ▼'):''}</button></th>`;
    }).join('')+'</tr></thead><tbody>';
    let place=0;
    for(const r of sorted){
      const ok=!r.notTradable&&!r.error&&r.net!==null;
      if(ok) place++;
      const o=OFFER_BY[r.id];
      const feeSub=typeof r.feesMean==='number'&&Math.abs(r.feesMean-r.fee)>0.005?`<span class="sub">Ø gezahlt ${fee$(r.feesMean)}</span>`:'';
      const days=ok&&(hasCal?r.calDays:r.days)!==null
        ? (hasCal?`${fmtFee.format(Math.round(r.calDays*10)/10)}<span class="sub">${r.days===null?'–':fmtFee.format(Math.round(r.days*10)/10)} Handelstage</span>`:`${fmtFee.format(Math.round(r.days*10)/10)}<span class="sub">Handelstage</span>`)
        : '–';
      const cell=(v,f)=>ok&&v!==null?f(v):'–';
      t+=`<tr class="clk${ok?'':' nt'}" data-id="${r.id}" tabindex="0" title="In die Hauptsimulation übernehmen">`
        +`<td>${ok?place:'–'}</td><td class="txt firm">${r.firm}</td><td class="txt offer">${o?o.n:r.name}<span class="sub">${r.market} · ${r.type==='instant'?'Instant':'Challenge'}${r.size?' · '+kTxt(r.size):''}</span></td>`
        +`<td>${fee$(r.fee)}${feeSub}</td>`
        +`<td class="${ok?(r.net>=0?'pos':'neg'):''}">${ok?`${sgn(r.net)}<span class="sub">± ${usd(r.netHalf)}${hedge?` · mit Gegentrade ${sgn(r.netHe)}`:''}</span>`:'–'}</td>`
        +`<td>${cell(r.roi,pct0)}</td><td>${cell(r.netPer1k,sgn)}</td>`
        +`<td>${ok&&r.pass!==null?pct(r.pass):'–'}</td><td>${cell(r.payout,pct)}<span class="sub">${ok?'Ø '+fmtFee.format(Math.round(r.avgPayouts*100)/100)+' Ausz.':''}</span></td>`
        +`<td>${days}</td>`
        +(hedge?`<td class="${ok&&r.q5NetHe<0?'neg':''}">${cell(r.q5NetHe,sgn)}</td>`:'')
        +`<td class="txt marks">${marks(r)}</td></tr>`;
    }
    if(!sorted.length) t+=`<tr><td colspan="${cols.length}" class="txt note">Keine Angebote in diesem Filter.</td></tr>`;
    $('rankTbl').innerHTML=t+'</tbody>';
    $('rankWrap').hidden=false;
    $('rankCount').textContent=`${fmt0.format(sorted.length)} von ${fmt0.format(RK.rows.length)} Angeboten${RK.aborted?` (abgebrochen, ${fmt0.format(ALL_OFFERS-RK.rows.length)} nicht berechnet)`:''}. Seed ${RK.snap.seed}${slipTxt(RK.snap.strat)?', '+slipTxt(RK.snap.strat):''}, ${fmt0.format(RK.snap.n)} Accounts je Angebot${hedge?'':', ohne Gegentrade'}.`;
  }
  // Klick: Angebot mit dem Schnappschuss der Berechnung übernehmen (Strategie, n, Gegentrade, Seed), dann zu den Kennzahlen
  function rankPick(id){
    const s=RK.snap; if(!s||!OFFER_BY[id]) return;
    applyStrat(s.strat); seed=s.seed;
    $('offer').value=id; setPressed('');
    applyOffer(id,s.strat); render(); checkStale();
    document.querySelector('.kpis').scrollIntoView({behavior:'smooth',block:'start'});
  }
  $('rankGo').addEventListener('click',rankRun);
  $('rankStop').addEventListener('click',rankStop);
  $('rankTbl').addEventListener('click',e=>{
    const b=e.target.closest('button[data-k]');
    if(b){ const k=b.dataset.k; if(RK.sort===k){ const cur=RK.dir||(k==='days'||k==='calDays'?'asc':'desc'); RK.dir=cur==='asc'?'desc':'asc'; } else { RK.sort=k; RK.dir=undefined; } renderRank(); return; }
    const tr=e.target.closest('tr[data-id]'); if(tr) rankPick(tr.dataset.id);
  });
  $('rankTbl').addEventListener('keydown',e=>{ const tr=e.target.closest('tr[data-id]'); if(tr&&(e.key==='Enter'||e.key===' ')){ e.preventDefault(); rankPick(tr.dataset.id); } });
  ['fMarkt','fFirma','fTyp','fFee','fSizeMin','fSizeMax'].forEach(id=>$(id).addEventListener('input',renderRank));
  ['rankN','rankHedge'].forEach(id=>$(id).addEventListener('input',checkStale));
  $('ctl').addEventListener('input',checkStale); $('ctl').addEventListener('change',checkStale);

  apply(PRESETS.futures); setPressed('p-futures'); render(); riskHint();
})();
