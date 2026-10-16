/* Glitch-Simulator – Oberfläche (Regler, Angebotsauswahl, Kennzahlen, Chart, Tabellen). */
(function(){
  const fmt0 = new Intl.NumberFormat('de-DE',{maximumFractionDigits:0});
  const usd = v => (v<0?'−':'') + fmt0.format(Math.round(Math.abs(v))) + ' $';
  const sgn = v => (v>0?'+':v<0?'−':'') + fmt0.format(Math.round(Math.abs(v))) + ' $';
  const pct = v => fmt0.format(Math.round(v*100)) + ' %';
  const $ = id => document.getElementById(id);

  const IDS = ['fee','target','target2','dd','risk','rr','wr','cost','hp','buf','minp','wfrac','cap','split','maxp','n'];
  const {PRESETS,OFFERS}=window.GlitchData;
  const {simulate,prepare}=window.GlitchSim;
  const {autoParams}=window.GlitchParams;
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
      tradesPerDay:val('tradesPerDay'),dllCompliant:$('dllCompliant').checked,consCompliant:$('consCompliant').checked};
    IDS.forEach(k=>u[k]=val(k));
    return u;
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
  function ruleHint(P,off){
    if(!off) return 'Die beiden Schalter wirken nur bei einem gewählten Angebot mit Tageslimit bzw. Consistency-Regel.';
    const dll=P.dllEval>0||P.dllFunded>0||P.dllScaleFunded>0, cons=P.consEval>0||P.consFunded>0;
    if(dll&&cons) return '';
    if(!dll&&!cons) return 'Dieses Angebot hat weder Tageslimit noch Consistency-Regel: beide Schalter ohne Wirkung.';
    return dll?'Dieses Angebot hat keine Consistency-Regel: Schalter „Consistency regeltreu“ ohne Wirkung.':'Dieses Angebot hat kein Tageslimit: Schalter „Daily Loss Limit regeltreu“ ohne Wirkung.';
  }
  function render(){
    const P0=read(), off=OFFER_BY[$('offer').value];
    const instant=P0.mode==='instant';
    ['target','target2'].forEach(k=>{ $('w-'+k).classList.toggle('dis',instant); $(k).disabled=instant; $(k+'-n').disabled=instant; });
    const autoOn=!!off&&$('autorisk').checked;
    ['riskPct','costPct'].forEach(k=>{ $('w-'+k).classList.toggle('dis',!autoOn); $(k).disabled=!autoOn; $(k+'-n').disabled=!autoOn; });
    $('rule-hint').textContent=ruleHint(P0,off);
    if(P0.notTradable) return blocked(P0.reason);
    let P,R;
    try{ P=prepare(P0); R=simulate(P,seed); }
    catch(e){ return blocked('Simulation nicht möglich: '+e.message); }
    $('err').hidden=true; RES.classList.remove('blocked');
    const be=1/(1+P.rr), beC=(P.risk+P.cost)/(P.risk*(1+P.rr));
    $('wr-hint').textContent=`Ohne Edge bei diesem CRV: ${fmt0.format(be*100)} %, mit Kosten ${fmt0.format(beC*100)} %. ${P.p>beC+0.005?'Über Break-even: Edge vorhanden.':P.p<be-0.005?'Unter Break-even: negativer Edge.':'Etwa Break-even: kein Edge.'}`;
    const calibH = instant ? P.fee/P.dd : P.fee/P.dd;
    $('hp-hint').textContent=`Fee genau zurück = Fee ÷ Drawdown = ${String((calibH*100).toFixed(1)).replace('.',',')} %. Etwas mehr bringt beim Verlieren einen kleinen Gewinn. 0 % = kein Gegentrade.`;

    const n=P.n;
    $('k-no').textContent=sgn(R.netNo/n); $('k-no').className='val '+(R.netNo>=0?'pos':'neg');
    $('k-no-s').textContent=`pro Account · gesamt ${sgn(R.netNo)}`;
    $('k-he').textContent=sgn(R.netHe/n); $('k-he').className='val '+(R.netHe>=0?'pos':'neg');
    $('k-he-s').textContent=`pro Account · gesamt ${sgn(R.netHe)}`;
    $('k-real').textContent=usd(-R.realMin);
    $('k-real-s').textContent=`Echtgeld nötig (größter Rückgang) · Ergebnis ${sgn(R.real)}`;

    const diff=(R.netHe-R.netNo)/n;
    const passRate=instant? R.paid/n : R.passed/n;
    let v;
    if(P.h===0){ v=`Gegentrade ist auf 0 % gestellt. Beide Linien sind identisch.`; }
    else {
      const fA=R.nFail?R.hFail/R.nFail:0, sA=R.nSucc?R.hSucc/R.nSucc:0;
      v=`<b>Refinanzierung:</b> Jede ${instant?'vor der ersten Auszahlung verlorene Runde':'verlorene Challenge'} bringt auf dem Echtgeld-Konto im Schnitt ${sgn(fA)} (Fee ${usd(P.fee)}). Dafür kostet jede ${instant?'Runde mit Auszahlung':'bestandene Challenge'} im Schnitt ${sgn(sA)}. `;
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
      <div class="line"><span>Whiteboard aus dem Video (fest): 50 % × 2.000 $ − 50 % × 100 $</span><span class="pos">+950 $</span></div>
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
        <tr><td class="txt">Fees</td><td class="neg">${sgn(-R.fees)}</td><td class="neg">${sgn(-R.fees)}</td></tr>
        <tr><td class="txt">Payouts (nach Split)</td><td class="pos">${sgn(R.pay)}</td><td class="pos">${sgn(R.pay)}</td></tr>
        <tr><td class="txt">Echtgeld bei ${instant?'vor 1. Auszahlung verlorenen':'verlorenen Challenges'} (${fmt0.format(R.nFail)}×)<br><span class="note">Ø ${sgn(R.nFail?R.hFail/R.nFail:0)} pro Account, Fee ${usd(P.fee)}</span></td><td>0 $</td><td class="${R.hFail>=0?'pos':'neg'}">${sgn(R.hFail)}</td></tr>
        <tr><td class="txt">Echtgeld bei ${instant?'Accounts mit 1. Auszahlung':'bestandenen Challenges'} (${fmt0.format(R.nSucc)}×)<br><span class="note">Ø ${sgn(R.nSucc?R.hSucc/R.nSucc:0)} pro Account</span></td><td>0 $</td><td class="${R.hSucc>=0?'pos':'neg'}">${sgn(R.hSucc)}</td></tr>
        ${P.hfund?`<tr><td class="txt">Echtgeld nach Bestehen</td><td>0 $</td><td class="${R.hAfter>=0?'pos':'neg'}">${sgn(R.hAfter)}</td></tr>`:''}
        <tr><td class="txt"><b>Netto</b></td><td class="${R.netNo>=0?'pos':'neg'}"><b>${sgn(R.netNo)}</b></td><td class="${R.netHe>=0?'pos':'neg'}"><b>${sgn(R.netHe)}</b></td></tr>
      </tbody>`;
    $('outc').textContent = instant
      ? `${fmt0.format(R.fail+R.passNo)} von ${fmt0.format(n)} Accounts ohne Auszahlung verloren, ${fmt0.format(R.paid)} mit mindestens einer Auszahlung (insgesamt ${fmt0.format(R.nPayTot)} Auszahlungen).`
      : `${fmt0.format(R.fail)} von ${fmt0.format(n)} Challenges verloren, ${fmt0.format(R.passed)} bestanden. Davon ${fmt0.format(R.paid)} mit mindestens einer Auszahlung, ${fmt0.format(R.passNo)} vorher verloren.`;

    last={R,P,instant};
    renderList();
  }

  // ---- Account-Tabelle: alle n Accounts, 50 pro Seite, Filter und Sortierung; nur die sichtbare Seite wird gebaut ----
  const PAGE=50, RANK={fail:0,pass:1,paid:2};
  const LS={sort:'i',dir:1,filter:'all',page:0,open:-1};
  let last=null;
  const COLS=[['i','#'],['res','Ergebnis'],['trades','Trades'],['days','Tage'],['pay','Payouts'],['hedge','Echtgeld'],['netNo','Netto ohne'],['netHe','Netto mit']];
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
  function detail(a){
    let h='<div class="det"><table><thead><tr><th>Phase</th><th>Tage</th><th>Gewinn&shy;tage</th><th>Tag von–bis</th><th>DLL-Stopps</th><th>Consistency-Blockaden</th></tr></thead><tbody>';
    let pnl='';
    for(const k of ['step1','step2','funded']){
      const ph=a.phases[k]; if(!ph) continue;
      h+=`<tr><td class="txt">${PHN[k]}</td><td>${ph.days}</td><td>${ph.winDays}</td><td>${ph.firstDay===null?'–':ph.firstDay+'–'+ph.lastDay}</td><td>${ph.dllStops}</td><td>${ph.consBlocks}</td></tr>`;
      const d=ph.dayPnl, more=d.length>40?` … (${fmt0.format(d.length)} Tage)`:'';
      pnl+=`<p><b>${PHN[k]}</b> Tages-P&amp;L: ${d.slice(0,40).map(v=>`<span class="${v>0?'pos':v<0?'neg':''}">${sgn(v)}</span>`).join(' · ')}${more}</p>`;
    }
    h+=`</tbody></table>${pnl}<p>Echtgeld in der Absicherungsphase ${sgn(a.hedgeEval)}, danach ${sgn(a.hedgeFund)}.</p></div>`;
    return h;
  }
  function renderList(){
    if(!last) return;
    const {R,P,instant}=last, list=R.list;
    const cnt={all:list.length,fail:0,pass:0,paid:0}; list.forEach(x=>cnt[x.res]++);
    const fl=filters(instant); if(!fl.some(f=>f[0]===LS.filter)) LS.filter='all';
    $('lfilter').innerHTML=fl.map(([k,l])=>`<button type="button" data-f="${k}" aria-pressed="${LS.filter===k}">${l} <span class="num">${fmt0.format(cnt[k])}</span></button>`).join('');
    let rows=LS.filter==='all'?list.slice():list.filter(x=>x.res===LS.filter);
    const k=LS.sort, d=LS.dir;
    rows.sort((x,y)=>{ const a=k==='res'?RANK[x.res]:x[k], b=k==='res'?RANK[y.res]:y[k]; return (a-b)*d || x.i-y.i; });
    const pages=Math.max(1,Math.ceil(rows.length/PAGE)); if(LS.page>=pages) LS.page=pages-1;
    const from=LS.page*PAGE, vis=rows.slice(from,from+PAGE);
    let t='<thead><tr>'+COLS.map(([c,l])=>`<th aria-sort="${LS.sort===c?(d>0?'ascending':'descending'):'none'}"><button type="button" class="sort" data-k="${c}">${l}${LS.sort===c?(d>0?' ▲':' ▼'):''}</button></th>`).join('')+'</tr></thead><tbody>';
    for(const x of vis){
      const det=x.i<R.accts.length, open=det&&LS.open===x.i;
      t+=`<tr${det?` class="clk${open?' open':''}" data-i="${x.i}" tabindex="0" aria-expanded="${open}"`:''}><td>${x.i+1}${det?'<span class="chev" aria-hidden="true"></span>':''}</td><td class="txt">${pill(x,instant)}</td><td>${fmt0.format(x.trades)}</td><td>${fmt0.format(x.days)}</td><td>${x.pay?sgn(x.pay):'–'}</td><td class="${x.hedge>=0?'pos':'neg'}">${P.h?sgn(x.hedge):'–'}</td><td class="${x.netNo>=0?'pos':'neg'}">${sgn(x.netNo)}</td><td class="${x.netHe>=0?'pos':'neg'}">${sgn(x.netHe)}</td></tr>`;
      if(open) t+=`<tr class="detrow"><td colspan="8">${detail(R.accts[x.i])}</td></tr>`;
    }
    if(!vis.length) t+='<tr><td colspan="8" class="txt note">Keine Accounts in diesem Filter.</td></tr>';
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
  const UNIT={tradesPerDay:'×',riskPct:'%',costPct:'%',fee:'$',target:'$',target2:'$',dd:'$',risk:'$',rr:'',wr:'%',cost:'$',hp:'%',buf:'$',minp:'$',wfrac:'%',cap:'$',split:'%',maxp:'×',n:''};
  const PRE={rr:'1 :'};
  IDS.concat(EXTRA).forEach(k=>{
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
      gr.items.forEach(o=>{OFFER_BY[o.id]=Object.assign({firm:gr.g.split(' · ')[0]},o);const op=document.createElement('option');op.value=o.id;op.textContent=`${o.n} · ${fmt0.format(o.fee)} $`;og.appendChild(op);});
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
    } else t.push('kein Tageslimit');
    if(o.consEval>0||o.consFunded>0){
      const parts=[]; if(ch&&o.consEval>0) parts.push(`Challenge ${pctTxt(o.consEval)} %`);
      if(o.consFunded>0) parts.push(`Funded ${pctTxt(o.consFunded)} % ${o.consFundedMode==='perpetual'?'über alle Funded-Tage':'je Auszahlungszyklus'}`);
      t.push(`Consistency (bester Tag < Anteil am Gewinn) ${parts.join(', ')}`);
    } else t.push('keine Consistency-Regel');
    return t.join('. ')+'.';
  }
  function applyOffer(id){
    const o=OFFER_BY[id]; if(!o){ $('offer-note').textContent='Eigene Werte. Wähle ein Angebot, um Fee, Ziel, Drawdown und Payout-Regeln automatisch zu setzen.'; return; }
    const cur=uiVals(), autorisk=$('autorisk').checked, riskPct=val('riskPct'), costPct=val('costPct');
    const strat={wr:cur.wr,rr:cur.rr,n:cur.n,tradesPerDay:cur.tradesPerDay,dllCompliant:cur.dllCompliant,consCompliant:cur.consCompliant,riskPct,costPct,autorisk};
    if(!autorisk){ strat.risk=cur.risk; strat.cost=cur.cost; }
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
  const setPressed=id=>document.querySelectorAll('.presets button').forEach(b=>b.setAttribute('aria-pressed',b.id===id?'true':'false'));
  [['p-futures','futures'],['p-coin','coin'],['p-edge','edge'],['p-instant','instant'],['p-afstd','afstd']].forEach(([id,k])=>{
    $(id).addEventListener('click',()=>{apply(PRESETS[k]);setPressed(id);$('offer').value='';applyOffer('');render();});
  });
  $('ctl').addEventListener('input',()=>{setPressed('');schedule();});
  $('mode').addEventListener('change',()=>{setPressed('');render();});
  $('calib').addEventListener('click',()=>{const P=read();const v=Math.min(30,Math.round(P.fee*1.25/P.dd*200)/2);$('hp').value=v;$('hp-n').value=v;render();});
  $('reroll').addEventListener('click',()=>{seed=(seed*1103515245+12345)>>>0;render();});

  apply(PRESETS.futures); render();
})();
