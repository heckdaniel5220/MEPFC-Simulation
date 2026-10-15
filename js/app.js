/* Glitch-Simulator – Oberfläche (Regler, Angebotsauswahl, Kennzahlen, Chart, Tabellen). */
(function(){
  const fmt0 = new Intl.NumberFormat('de-DE',{maximumFractionDigits:0});
  const usd = v => (v<0?'−':'') + fmt0.format(Math.abs(Math.round(v))) + ' $';
  const sgn = v => (v>0?'+':v<0?'−':'') + fmt0.format(Math.abs(Math.round(v))) + ' $';
  const pct = v => fmt0.format(Math.round(v*100)) + ' %';
  const $ = id => document.getElementById(id);

  const IDS = ['fee','target','target2','dd','risk','rr','wr','cost','tpd','dll','cons','consF','hp','buf','minp','wfrac','cap','split','maxp','n'];
  const {PRESETS,OFFERS}=window.GlitchData;
  const {simulate}=window.GlitchSim;
  let seed = 20261015;


  function read(){
    const P={mode:$('mode').value,hfund:$('hfund').checked,ddStatic:$('ddstatic').checked,dllHard:$('dllhard').checked};
    IDS.forEach(k=>P[k]=parseFloat($(k).value));
    return window.GlitchSim.prepare(P);
  }
  function apply(pr){
    $('mode').value=pr.mode; $('hfund').checked=!!pr.hfund; $('ddstatic').checked=!!pr.ddStatic; $('dllhard').checked=!!pr.dllHard;
    const ZERO={target2:1,dll:1,cons:1,consF:1};
    IDS.forEach(k=>{ const v = pr[k]!==undefined ? pr[k] : (ZERO[k]?0:$(k).value); $(k).value=v; });
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

  function render(){
    const P=read();
    const instant=P.mode==='instant';
    // Eingabefelder mit Reglern abgleichen (nicht überschreiben, während getippt wird)
    IDS.forEach(k=>{const ni=$(k+'-n'); if(ni && document.activeElement!==ni) ni.value=$(k).value;});
    const be=1/(1+P.rr), beC=(P.risk+P.cost)/(P.risk*(1+P.rr));
    $('wr-hint').textContent=`Ohne Edge bei diesem CRV: ${fmt0.format(be*100)} %, mit Kosten ${fmt0.format(beC*100)} %. ${P.p>beC+0.005?'Über Break-even: Edge vorhanden.':P.p<be-0.005?'Unter Break-even: negativer Edge.':'Etwa Break-even: kein Edge.'}`;
    const calibH = instant ? P.fee/P.dd : P.fee/P.dd;
    $('hp-hint').textContent=`Fee genau zurück = Fee ÷ Drawdown = ${String((calibH*100).toFixed(1)).replace('.',',')} %. Etwas mehr bringt beim Verlieren einen kleinen Gewinn. 0 % = kein Gegentrade.`;
    $('w-target').classList.toggle('dis',instant);
    $('w-target2').classList.toggle('dis',instant);
    $('w-cons').classList.toggle('dis',instant);

    const R=simulate(P,seed);
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
    const his=0.5*2000-0.5*100;
    const avgPayPassed = (instant? (R.paid? R.pay/R.paid:0) : (R.passed? R.pay/R.passed:0));
    $('calc').innerHTML=`
      <div class="line"><span>Whiteboard: 50 % × 2.000 $ − 50 % × 100 $</span><span class="pos">+950 $</span></div>
      <div class="line"><span>${instant?'Payout-Quote':'Pass-Quote'} in der Simulation (statt 50 %)</span><span>${pct(passRate)}</span></div>
      <div class="line"><span>Ø Auszahlung pro ${instant?'Account mit Payout':'bestandenem Account'} (statt 2.000 $)</span><span>${usd(avgPayPassed)}</span></div>
      ${instant?'':`<div class="line"><span>Bestandene Accounts ohne jede Auszahlung</span><span>${pct(R.passed? R.passNo/R.passed:0)}</span></div>`}
      <div class="line"><span>Echtes Ergebnis pro Account (ohne / mit Gegentrade)</span><span><span class="${R.netNo>=0?'pos':'neg'}">${sgn(R.netNo/n)}</span> / <span class="${R.netHe>=0?'pos':'neg'}">${sgn(R.netHe/n)}</span></span></div>
      <p class="note">Seine Rechnung behandelt „bestanden“ wie 2.000 $ Gewinn. Tatsächlich ist der Drawdown nur Puffer, und Payouts sind gedeckelt und unsicher.</p>`;

    // flow table
    $('flow').innerHTML=`
      <thead><tr><th></th><th>Ohne</th><th>Mit Gegentrade</th></tr></thead>
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
    const rules=[];
    if(P.dll>0) rules.push(P.dllHard?`${fmt0.format(R.dllBreach)} Accounts am Daily Loss Limit verloren`:`${fmt0.format(R.dllStops)}× Handelstag am Daily Loss Limit beendet`);
    if(P.ce>0) rules.push(`${fmt0.format(R.consWait)}× Ziel erreicht, aber wegen Consistency weitergehandelt`);
    if(rules.length) $('outc').textContent+=' '+rules.join(', ')+'.';
    $('outc').textContent+=` Ø ${fmt0.format(R.days/n)} Handelstage pro Account.`;

    // trace
    let t=`<thead><tr><th>#</th><th>Ergebnis</th><th>Tage</th><th>Trades</th><th>Payouts</th><th>Echtgeld</th><th>Netto ohne</th><th>Netto mit</th></tr></thead><tbody>`;
    R.accts.forEach((a,i)=>{
      const st = a.dllBreach && a.nPay===0 ? `<span class="pill fail">${a.passed?'':'Challenge '}Daily Loss verletzt</span>` : !a.passed ? '<span class="pill fail">Challenge verloren</span>' : a.nPay>0 ? `<span class="pill paid">${a.nPay}× ausgezahlt</span>` : `<span class="pill pass">${instant?'verloren':'bestanden, kein Payout'}</span>`;
      t+=`<tr><td>${i+1}</td><td class="txt">${st}</td><td>${a.days}</td><td>${a.trades}</td><td>${a.pay?sgn(a.pay):'–'}</td><td class="${a.hedge>=0?'pos':'neg'}">${P.h? sgn(a.hedge):'–'}</td><td class="${a.netNo>=0?'pos':'neg'}">${sgn(a.netNo)}</td><td class="${a.netHe>=0?'pos':'neg'}">${sgn(a.netHe)}</td></tr>`;
    });
    $('trace').innerHTML=t+'</tbody>';
  }

  // Zahlenfelder neben jeden Regler setzen
  const UNIT={fee:'$',target:'$',target2:'$',dd:'$',risk:'$',rr:'',wr:'%',cost:'$',tpd:'×',dll:'$',cons:'%',consF:'%',hp:'%',buf:'$',minp:'$',wfrac:'%',cap:'$',split:'%',maxp:'×',n:''};
  const PRE={rr:'1 :'};
  IDS.forEach(k=>{
    const rg=$(k), out=$(k+'-o'); if(!out) return;
    const box=document.createElement('span'); box.className='numbox';
    if(PRE[k]){const p=document.createElement('span');p.className='unit';p.textContent=PRE[k];box.appendChild(p);}
    const ni=document.createElement('input'); ni.type='number'; ni.id=k+'-n'; ni.inputMode='decimal';
    ni.step=rg.step; ni.min=0; ni.setAttribute('aria-label',(document.querySelector(`label[for="${k}"]`)||{}).textContent||k);
    box.appendChild(ni);
    if(UNIT[k]){const u=document.createElement('span');u.className='unit';u.textContent=UNIT[k];box.appendChild(u);}
    out.replaceWith(box);
    ni.addEventListener('input',()=>{
      const v=parseFloat(String(ni.value).replace(',','.'));
      if(!isFinite(v)) return;
      if(v>parseFloat(rg.max)) rg.max=v;
      if(v<parseFloat(rg.min)) rg.min=v;
      rg.value=v;
    });
    rg.addEventListener('input',()=>{ni.value=rg.value;});
  });
  // Presets können ebenfalls außerhalb der Reglergrenzen liegen
  const applyOrig=apply;
  apply=function(pr){IDS.forEach(k=>{const rg=$(k);if(pr[k]>parseFloat(rg.max))rg.max=pr[k];if(pr[k]<parseFloat(rg.min))rg.min=pr[k];});applyOrig(pr);IDS.forEach(k=>{const ni=$(k+'-n');if(ni)ni.value=$(k).value;});};

  const OFFER_BY={};
  (function fill(){
    const sel=$('offer');
    OFFERS.forEach(gr=>{const og=document.createElement('optgroup');og.label=gr.g;
      gr.items.forEach(o=>{OFFER_BY[o.id]=o;const op=document.createElement('option');op.value=o.id;op.textContent=`${o.n} · ${fmt0.format(o.fee)} $`;og.appendChild(op);});
      sel.appendChild(og);});
  })();
  function applyOffer(id){
    const o=OFFER_BY[id]; if(!o){ $('offer-note').textContent='Eigene Werte. Wähle ein Angebot, um Fee, Ziel, Drawdown und Payout-Regeln automatisch zu setzen.'; return; }
    const cur=read();
    const pr={mode:o.mode,fee:o.fee,target:o.target||cur.target,target2:o.target2||0,dd:o.dd,ddStatic:!!o.ddStatic,buf:o.buf,minp:o.minp,wfrac:o.wfrac,cap:o.cap,split:o.split,maxp:o.maxp,
      dll:o.dll||0,dllHard:!!o.dllHard,cons:o.cons||0,consF:o.consF||0,
      risk:cur.risk,rr:cur.rr,wr:cur.wr,cost:cur.cost,tpd:cur.tpd,hfund:false,n:cur.n,
      hp:Math.min(30,Math.round(o.fee*1.25/o.dd*200)/2)};
    if($('autorisk').checked){ pr.risk=Math.max(10,Math.round(o.dd*0.25/5)*5); if(o.maxRisk) pr.risk=Math.min(pr.risk,o.maxRisk); pr.cost=Math.max(1,Math.round(pr.risk*0.02)); }
    apply(pr);
    const two=o.target2?` → ${usd(o.target2)}`:'';
    $('offer-note').innerHTML=`<b>${o.n}</b>: ${o.mode==='instant'?'ohne Challenge':'Ziel '+usd(o.target)+two}, Drawdown ${usd(o.dd)} ${o.ddStatic?'statisch':'trailing'}${o.dll?`, Daily Loss ${usd(o.dll)} ${o.dllHard?'hart':'soft'}`:''}${o.cons?`, Challenge-Consistency ${o.cons} %`:''}${o.consF?`, Funded-Consistency ${o.consF} %`:''}. Fee ${usd(o.fee)} (Liste ${o.list}, Code ${o.code}).<br>${o.note}${$('autorisk').checked?`<br>Risiko pro Trade = 25 % des Drawdowns${o.maxRisk?', max. 1 % des Kontos (Firmenregel)':''}, Kosten = 2 % des Risikos.`:''}`;
  }
  $('offer').addEventListener('change',e=>{applyOffer(e.target.value);setPressed('');render();});
  $('autorisk').addEventListener('change',()=>{if($('offer').value){applyOffer($('offer').value);render();}});

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
