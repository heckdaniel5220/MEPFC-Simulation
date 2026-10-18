/* Glitch-Simulator – Seite „Tracker“ (M-028a).
   HTML-Bausteine als Text und mount(env): DOM nur in mount. Rechnung, Datenmodell und Speicher-Hülle in js/tracker.js.
   env = {doc, storage, today: () => 'JJJJ-MM-TT', now: () => ISO-Zeit, T, E, OFFERS, confirm, download}. Browser: globales GlitchTrackerUi. */
(function(root){
  'use strict';

  const esc=s=>String(s===null || s===undefined?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const firmOf=g=>g.split(' · ')[0];

  // Angebote flach, mit Gruppe und Anzeigename
  function offerIndex(OFFERS){
    const list=[]; for(const g of OFFERS) for(const o of g.items) list.push({o,group:g.g,label:firmOf(g.g)+' '+o.n});
    return list;
  }
  function offerOptions(OFFERS){
    return '<option value="">– eigene Regeln –</option>'+OFFERS.map(g=>`<optgroup label="${esc(g.g)}">`+
      g.items.map(o=>`<option value="${esc(o.id)}">${esc(firmOf(g.g)+' '+o.n)}</option>`).join('')+'</optgroup>').join('');
  }

  const pill=(state,word)=>`<span class="tr-st tr-${esc(state)}">${esc(word)}</span>`;

  function sparkSvg(T,ser,w,h,cls){
    const m=T.curveModel(ser,w,h,{l:2,r:2,t:4,b:4}); if(!m) return '';
    return `<svg class="${cls}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">`+
      (m.floor?`<path class="tr-floor" d="${m.floor}"/>`:'')+`<path class="tr-bal" d="${m.bal}"/></svg>`;
  }

  // Kurve im Detail: Kontostand (Stufen je Tag), Grenze, Ziel bzw. Auszahlungsschwelle, Auszahlungen als Marken
  function curveSvg(T,ser){
    const w=640,h=220, m=T.curveModel(ser,w,h,{l:62,r:10,t:12,b:22}); if(!m) return '';
    const y=v=>12+(m.hi-v)/(m.hi-m.lo)*(h-34);
    const ticks=[m.hi,(m.hi+m.lo)/2,m.lo].map(v=>`<text class="tr-ax" x="56" y="${(y(v)+4).toFixed(1)}" text-anchor="end">${esc(T.usd(Math.round(v)))}</text>`).join('');
    const pts=ser.points, last=pts[pts.length-1];
    return `<svg class="tr-curve" viewBox="0 0 ${w} ${h}" role="img" aria-label="Kontostand je Tag mit Grenze">`+ticks+
      (m.target!==null?`<line class="tr-tgt" x1="62" x2="${w-10}" y1="${m.target}" y2="${m.target}"/>`:'')+
      (m.floor?`<path class="tr-floor" d="${m.floor}"/>`:'')+`<path class="tr-bal" d="${m.bal}"/>`+
      m.marks.map(p=>`<circle class="tr-mark" cx="${p.x}" cy="${p.y}" r="4"/>`).join('')+
      `<text class="tr-ax" x="62" y="${h-6}">${esc(T.deDate(pts[0].date))}</text><text class="tr-ax" x="${w-10}" y="${h-6}" text-anchor="end">${esc(T.deDate(last.date))}</text></svg>`+
      `<p class="tr-legend"><span class="tr-k tr-k-bal"></span>Kontostand <span class="tr-k tr-k-floor"></span>Grenze`+
      (m.target!==null?` <span class="tr-k tr-k-tgt"></span>${ser.target!==null?'Ziel bzw. Auszahlungsschwelle':''}`:'')+(m.marks.length?' <span class="tr-k tr-k-mark"></span>Auszahlung':'')+'</p>';
  }

  function overviewHtml(T,state,evals,offersById){
    const o=T.overview(state);
    const k=(lab,val,cls)=>`<div class="tr-kpi"><span class="lab">${lab}</span><span class="val num ${cls||''}">${esc(val)}</span></div>`;
    const cnt=Object.entries(o.counts).filter(([,n])=>n).map(([s,n])=>`${n} ${s}`).join(' · ')||'noch keine Accounts';
    let h=`<div class="tr-kpis">${k('Fees und Kosten',T.usd(o.fees))}${k('Auszahlungen erhalten',T.usd(o.payouts))}${k('Netto',T.usdS(o.net),o.net>0?'tr-pos':o.net<0?'tr-neg':'')}</div>`+
      `<p class="note">${esc(cnt)}</p>`;
    if(state.accounts.length){
      h+='<ul class="tr-cards">'+state.accounts.map(a=>{
        const e=evals[a.id], off=a.offerId?offersById[a.offerId]:null;
        return `<li><button type="button" class="tr-card" data-act="open" data-id="${esc(a.id)}">`+
          `<span class="tr-card-h"><b>${esc(a.name||'ohne Namen')}</b>${pill(e.state,e.word)}</span>`+
          `<span class="tr-card-s">${esc(off?off.label:'eigene Regeln')} · ${esc(e.phaseLabel)}</span>`+
          `<span class="tr-card-t">${esc(e.headline)}</span>`+
          `<span class="tr-card-b"><span class="num">${esc(T.usd(e.balance))}</span>${sparkSvg(T,e.series,160,36,'tr-spark')}</span></button></li>`;
      }).join('')+'</ul>';
    }
    return h;
  }

  function rulesHtml(e){
    return '<ul class="tr-rules">'+e.rules.map(r=>{
      const meta=[r.value&&'Wert '+r.value,r.limit&&'Grenze '+r.limit,r.distance&&'Abstand '+r.distance,r.exact].filter(Boolean).join(' · ');
      return `<li>${pill(r.state,r.word)}<div><b>${esc(r.label)}</b> <span>${esc(r.text)}</span><small>${esc(meta)}</small></div></li>`;
    }).join('')+'</ul>';
  }

  function sheetHtml(E,offer){
    if(!offer) return '';
    const s=E.ruleSheet(offer);
    return `<details class="tr-sheet"><summary>Regeln des Angebots</summary>`+s.groups.map(g=>{
      const items=g.entries.filter(x=>x.state==='value');
      return items.length?`<h4>${esc(g.label)}</h4><dl>`+items.map(x=>`<dt>${esc(x.label)}</dt><dd>${esc(x.text)}</dd>`).join('')+'</dl>':'';
    }).join('')+(offer.src?`<p class="note">Quelle: <a href="${esc(offer.src)}" rel="noopener" target="_blank">${esc(offer.src)}</a> (Stand ${esc(offer.asof||'–')})</p>`:'')+'</details>';
  }

  const inp=(id,label,attrs,val)=>`<label class="tr-f" for="${id}"><span>${label}</span><input class="tr-in" id="${id}" ${attrs||''} value="${esc(val===undefined?'':val)}"></label>`;
  const money=(id,label,val)=>inp(id,label,'inputmode="decimal" autocomplete="off"',val);
  const date=(id,label,val)=>inp(id,label,'type="date"',val);

  function detailHtml(T,E,acc,e,offer,today,kind){
    const R=acc.rules, cur=acc.phases[acc.phases.length-1];
    const nf=new Intl.NumberFormat('de-DE',{maximumFractionDigits:2});
    let diff=[];
    if(offer) diff=T.rulesDiff(acc.rules,T.snapshotRules(offer.o,E));
    const next=T.nextPhase(acc);
    const P=T.phaseCalc(acc,acc.phases.length-1);
    let h=`<div class="tr-dh"><div><h2>${esc(acc.name||'ohne Namen')}</h2>`+
      `<p class="note">${esc(offer?offer.label:'eigene Regeln')}${acc.offerAsof?' · Regeln Stand '+esc(T.deDate(acc.offerAsof)):''} · gekauft ${esc(T.deDate(acc.buyDate))} · Fee ${esc(T.usd(acc.feePaid))} · ${esc(e.phaseLabel)} seit ${esc(T.deDate(cur.start))}</p>`+
      (acc.note?`<p class="note">${esc(acc.note)}</p>`:'')+`</div>`+
      `<label class="tr-f tr-status"><span>Status</span><select class="tr-in" id="tr-status">`+T.STATUS.map(s=>`<option${s===acc.status?' selected':''}>${s}</option>`).join('')+`</select></label></div>`;
    if(diff.length) h+=`<div class="warn">Regeln im Angebot seit dem Anlegen geändert: ${esc(diff.map(x=>x.label).join(', '))}. Gerechnet wird mit den Regeln vom Anlegen. <button type="button" class="btn" data-act="take-rules">Aktuelle Regeln übernehmen</button></div>`;
    if(e.suggestLost) h+=`<div class="warn">Laut Tracker ist eine harte Grenze erreicht. Prüf das Dashboard der Firma und setz den Status auf „verloren“, wenn es stimmt. <button type="button" class="btn" data-act="set-lost">Status verloren</button></div>`;
    h+=`<p class="tr-head">${pill(e.state,e.word)} <span>${esc(e.headline)}</span></p>`+
      `<p class="tr-bal-line">Kontostand <b class="num">${esc(T.usd(e.balance))}</b> · Gewinn in der Phase <b class="num">${esc(T.usdS(e.profit))}</b></p>`+
      rulesHtml(e)+`<div class="tr-chart">${curveSvg(T,e.series)}</div>`;

    // Tagesbuchung
    h+=`<details class="tr-box" open><summary>Tag buchen</summary><form class="tr-form" data-form="day" onsubmit="return false">`+
      date('tr-d-date','Datum',today)+
      `<label class="tr-f" for="tr-d-kind"><span>Eingabe</span><select class="tr-in" id="tr-d-kind"><option value="pnl">Tagesergebnis</option><option value="bal"${kind==='bal'?' selected':''}>Schlusskontostand</option></select></label>`+
      money('tr-d-val','Betrag in $','')+inp('tr-d-trades','Trades','inputmode="numeric" autocomplete="off"','')+
      `<details class="tr-more"><summary>mehr</summary><div class="tr-form">`+money('tr-d-high','Tageshoch Kontostand','')+money('tr-d-low','Tagestief Kontostand','')+money('tr-d-mtl','Größter Verlust eines Trades','')+`</div></details>`+
      `<button type="button" class="btn tr-go" data-act="book">Buchen</button></form>`+
      `<p class="note">Eine Buchung je Tag, eine neue am selben Datum ersetzt die alte. Tageshoch und Tagestief machen Drawdown und Tageslimit genauer.</p></details>`;
    // Auszahlung
    if(cur.phase==='funded') h+=`<details class="tr-box"><summary>Auszahlung buchen</summary><form class="tr-form" onsubmit="return false">`+
      date('tr-p-date','Datum',today)+money('tr-p-amt','Vom Konto abgebucht','')+money('tr-p-rec',`Erhalten (leer = ${nf.format(R.split)} % Split)`,'')+
      `<button type="button" class="btn tr-go" data-act="payout">Buchen</button></form></details>`;
    // Kosten
    h+=`<details class="tr-box"><summary>Kosten buchen</summary><form class="tr-form" onsubmit="return false">`+date('tr-c-date','Datum',today)+money('tr-c-amt','Betrag in $','')+
      inp('tr-c-text','Wofür','autocomplete="off"','')+`<button type="button" class="btn tr-go" data-act="cost">Buchen</button></form></details>`;
    // Phase
    if(next) h+=`<details class="tr-box"><summary>Phase wechseln</summary><form class="tr-form" onsubmit="return false">`+
      `<p class="note tr-span">Nächste Phase: <b>${esc(T.PHASE_LABEL[next])}</b>. Buchungen ab dem Startdatum gehören zur neuen Phase.</p>`+
      date('tr-ph-date','Start',today)+money('tr-ph-bal','Startkontostand',nf.format(R.size))+`<button type="button" class="btn tr-go" data-act="phase" data-phase="${next}">Wechseln</button></form></details>`;
    // Grenze laut Firma, Bearbeiten
    h+=`<details class="tr-box"><summary>Grenze laut Firma</summary><form class="tr-form" onsubmit="return false">`+
      `<p class="note tr-span">Das Dashboard der Firma zeigt die Grenze (Liquidation). Eingetragen gilt sie statt der eigenen Rechnung, bis zum nächsten Phasenwechsel. Tracker heute ${esc(T.usd((P.start+P.floorNow)/100))}.</p>`+
      money('tr-ff',`Grenze in $`,typeof acc.firmFloor==='number'?nf.format(acc.firmFloor):'')+`<button type="button" class="btn tr-go" data-act="firm">Speichern</button></form></details>`;
    h+=`<details class="tr-box"><summary>Account bearbeiten</summary><form class="tr-form" onsubmit="return false">`+inp('tr-e-name','Name','autocomplete="off"',acc.name)+
      inp('tr-e-note','Notiz','autocomplete="off"',acc.note)+money('tr-e-fee','Fee in $',nf.format(acc.feePaid))+date('tr-e-buy','Kaufdatum',acc.buyDate)+
      `<button type="button" class="btn tr-go" data-act="edit">Speichern</button><button type="button" class="btn tr-del" data-act="delete">Account löschen</button></form></details>`;
    // Buchungsliste
    const rows=[];
    for(const x of acc.days) rows.push({date:x.date,kind:'Tag',text:T.usdS(x.pnl)+(x.trades!==null?` · ${x.trades} Trades`:''),act:'del-day',key:x.date});
    acc.payouts.forEach((p,i)=>rows.push({date:p.date,kind:'Auszahlung',text:`${T.usd(p.amount)} abgebucht, ${T.usd(p.received)} erhalten`,act:'del-pay',key:i}));
    acc.costs.forEach((x,i)=>rows.push({date:x.date,kind:'Kosten',text:`${T.usd(x.amount)}${x.text?' · '+x.text:''}`,act:'del-cost',key:i}));
    acc.phases.forEach((p,i)=>rows.push({date:p.start,kind:'Phase',text:`${T.PHASE_LABEL[p.phase]} ab ${T.usd(p.startBalance)}`,act:i===acc.phases.length-1&&i>0?'del-phase':null,key:i}));
    rows.sort((a,b)=>a.date<b.date?1:a.date>b.date?-1:0);
    h+=`<details class="tr-box" open><summary>Buchungen (${acc.days.length} Tage)</summary><ul class="tr-log">`+rows.map(r=>
      `<li><span class="num">${esc(T.deDate(r.date))}</span><span class="tr-kind">${esc(r.kind)}</span><span class="tr-lt">${esc(r.text)}</span>`+
      (r.act?`<button type="button" class="tr-x" data-act="${r.act}" data-key="${esc(r.key)}" aria-label="${esc(r.kind)} vom ${esc(T.deDate(r.date))} löschen">×</button>`:'<span></span>')+'</li>').join('')+'</ul></details>';
    h+=sheetHtml(E,offer?offer.o:null);
    return h;
  }

  function newFormHtml(OFFERS,today){
    return `<h2>Account anlegen</h2><form class="tr-form" id="tr-new-form" onsubmit="return false">`+
      `<label class="tr-f tr-span" for="tr-n-offer"><span>Angebot</span><select class="tr-in" id="tr-n-offer">${offerOptions(OFFERS)}</select></label>`+
      inp('tr-n-name','Name','autocomplete="off"','')+inp('tr-n-note','Notiz','autocomplete="off"','')+date('tr-n-buy','Kaufdatum',today)+money('tr-n-fee','Fee in $','')+
      date('tr-n-start','Start der Phase',today)+money('tr-n-bal','Startkontostand','')+
      `<fieldset class="tr-custom tr-span" id="tr-n-custom"><legend>Eigene Regeln</legend><div class="tr-form">`+
      `<label class="tr-f" for="tr-n-mode"><span>Account-Art</span><select class="tr-in" id="tr-n-mode"><option value="challenge">Challenge, danach Funded</option><option value="instant">Instant Funding</option></select></label>`+
      money('tr-n-size','Kontogröße','50.000')+money('tr-n-target','Ziel Phase 1','')+money('tr-n-target2','Ziel Phase 2 (leer = 1-Step)','')+money('tr-n-dd','Drawdown','')+
      `<label class="tr-f" for="tr-n-ddkind"><span>Drawdown-Art</span><select class="tr-in" id="tr-n-ddkind"><option value="intraday">trailing intraday</option><option value="eod">trailing auf Schlussstand (EOD)</option><option value="static">statisch</option></select></label>`+
      money('tr-n-lock','Lock über Start (z. B. 100)','0')+money('tr-n-dlle','Tageslimit Challenge','')+money('tr-n-dllf','Tageslimit Funded','')+
      `<label class="tr-f" for="tr-n-dllt"><span>Art des Tageslimits</span><select class="tr-in" id="tr-n-dllt"><option value="soft">weich: Tag endet</option><option value="hard">hart: Account endet</option></select></label>`+
      money('tr-n-cone','Consistency Challenge in %','')+money('tr-n-conf','Consistency Funded in %','')+money('tr-n-buf','Puffer','')+money('tr-n-minp','Mindestgewinn für Auszahlung','')+
      money('tr-n-split','Split in %','90')+`</div></fieldset>`+
      `<p class="note tr-span" id="tr-n-hint"></p>`+
      `<div class="tr-span tr-btns"><button type="button" class="btn tr-go" data-act="create">Anlegen</button><button type="button" class="btn" data-act="cancel-new">Abbrechen</button></div></form>`;
  }

  /* ---------- mount: einziger Teil mit DOM ---------- */
  // Umgebung im Browser: Speicher (jeder Zugriff in try/catch), heutiges Datum, Download und Bestätigung
  function browserEnv(root){ return {root}; }

  function mount(env){
    if(env.root){
      const w=env.root, pad=n=>String(n).padStart(2,'0');
      let storage;
      try{ storage=w.localStorage; storage.getItem('mepfc-tracker'); }
      catch(_){ storage={getItem(){ throw new Error('kein Speicher'); },setItem(){ throw new Error('kein Speicher'); }}; }
      env={doc:w.document,storage,T:w.GlitchTracker,E:w.GlitchExplain,OFFERS:w.GlitchData.OFFERS,FileReader:w.FileReader,
        confirm:t=>w.confirm(t),
        today:()=>{ const d=new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; },
        now:()=>new Date().toISOString(),
        download:(name,text)=>{
          const url=w.URL.createObjectURL(new w.Blob([text],{type:'application/json'}));
          const a=w.document.createElement('a'); a.href=url; a.download=name; w.document.body.appendChild(a); a.click(); a.remove();
          w.setTimeout(()=>w.URL.revokeObjectURL(url),1000);
        }};
    }
    const {doc,T,E,OFFERS}=env;
    const $=id=>doc.getElementById(id);
    const idx=offerIndex(OFFERS), byId={}; for(const x of idx) byId[x.o.id]=x;
    const loaded=T.loadStore(env.storage);
    let state=loaded.state, canSave=loaded.canSave, msg=loaded.msg, sel=null, flash='', kind='pnl';

    function showStore(){
      const box=$('tr-store');
      box.hidden=!msg;
      box.innerHTML=msg?esc(msg)+(msg===T.BROKEN?' <button type="button" class="btn" data-act="reset-store">Neu beginnen</button>':''):'';
    }
    function save(){
      if(!canSave){ showStore(); return; }
      const r=T.saveStore(env.storage,state);
      if(!r.ok){ msg=r.msg; canSave=false; }
      showStore();
    }
    const today=()=>env.today();
    function evalAll(){ const m={}; for(const a of state.accounts) m[a.id]=T.evaluate(a,{today:today()}); return m; }
    function render(){
      const ev=evalAll();
      $('tr-over-body').innerHTML=overviewHtml(T,state,ev,byId);
      const acc=state.accounts.find(a=>a.id===sel);
      $('tr-detail').hidden=!acc;
      if(acc) $('tr-detail').innerHTML=(flash?`<p class="warn" role="status">${esc(flash)}</p>`:'')+detailHtml(T,E,acc,ev[acc.id],acc.offerId?byId[acc.offerId]:null,today(),kind);
      flash='';
      showStore();
    }
    function setAcc(a){ state=Object.assign({},state,{accounts:state.accounts.map(x=>x.id===a.id?a:x)}); save(); render(); }
    const val=id=>{ const el=$(id); return el?el.value.trim():''; };
    const num=id=>T.parseDe(val(id));
    const optNum=id=>{ const v=val(id); if(!v) return null; const n=T.parseDe(v); return Number.isFinite(n)?n:NaN; };
    function fail(t){ flash=t; render(); }

    function newForm(){
      const box=$('tr-new'); box.hidden=false; box.innerHTML=newFormHtml(OFFERS,today());
      const upd=()=>{
        const x=byId[val('tr-n-offer')];
        $('tr-n-custom').hidden=!!x;
        if(x){ $('tr-n-fee').value=new Intl.NumberFormat('de-DE',{maximumFractionDigits:2}).format(x.o.fee); $('tr-n-bal').value=new Intl.NumberFormat('de-DE').format(T.offerSize(x.o)); if(!val('tr-n-name')) $('tr-n-name').placeholder=x.label; }
        $('tr-n-hint').textContent=x?`Die Regeln werden beim Anlegen gespeichert (Stand ${T.deDate(x.o.asof)}). Prüf sie im Help Center der Firma.`:'Fehlende Regel = keine Regel.';
      };
      $('tr-n-offer').addEventListener('change',upd); upd();
      box.scrollIntoView({block:'start'});
    }
    function create(){
      const x=byId[val('tr-n-offer')];
      const buy=val('tr-n-buy'), start=val('tr-n-start')||buy, fee=num('tr-n-fee');
      if(!T.validIso(buy) || !T.validIso(start)){ $('tr-n-hint').textContent='Bitte Kaufdatum und Start als Datum eingeben.'; return; }
      if(!Number.isFinite(fee) || fee<0){ $('tr-n-hint').textContent='Bitte die Fee als Zahl eingeben.'; return; }
      let rules;
      if(x) rules=T.snapshotRules(x.o,E);
      else{
        rules=T.customRules({mode:val('tr-n-mode'),size:val('tr-n-size'),target:val('tr-n-target'),target2:val('tr-n-target2'),dd:val('tr-n-dd'),ddKind:val('tr-n-ddkind'),
          lock:val('tr-n-lock'),dllEval:val('tr-n-dlle'),dllFunded:val('tr-n-dllf'),dllType:val('tr-n-dllt'),consEval:val('tr-n-cone'),consFunded:val('tr-n-conf'),
          buf:val('tr-n-buf'),minp:val('tr-n-minp'),split:val('tr-n-split')});
        if(!(rules.size>0)){ $('tr-n-hint').textContent='Bitte die Kontogröße eingeben.'; return; }
      }
      const bal=optNum('tr-n-bal');
      if(Number.isNaN(bal)){ $('tr-n-hint').textContent='Startkontostand ist keine Zahl.'; return; }
      const a=T.newAccount({id:T.newId(state.accounts,state.accounts.length+1),name:val('tr-n-name')||(x?x.label:'Eigener Account'),note:val('tr-n-note'),
        offerId:x?x.o.id:null,offerAsof:x?x.o.asof:null,rules,buyDate:buy,feePaid:fee,start,startBalance:bal===null?rules.size:bal});
      state=Object.assign({},state,{accounts:state.accounts.concat([a])}); sel=a.id;
      $('tr-new').hidden=true; $('tr-new').innerHTML='';
      save(); render(); $('tr-detail').scrollIntoView({block:'start'});
    }

    function act(name,el){
      const acc=state.accounts.find(a=>a.id===sel);
      switch(name){
        case 'new': newForm(); return;
        case 'cancel-new': $('tr-new').hidden=true; $('tr-new').innerHTML=''; return;
        case 'create': create(); return;
        case 'open': sel=el.dataset.id; render(); $('tr-detail').scrollIntoView({block:'start'}); return;
        case 'export': exportFile(); return;
        case 'import': $('tr-file').click(); return;
        case 'reset-store':
          if(!env.confirm('Der beschädigte Stand im Browser wird überschrieben. Vorher exportieren geht nicht. Neu beginnen?')) return;
          canSave=true; msg=null; state=T.emptyState(); save(); render(); return;
      }
      if(!acc) return;
      if(name==='book'){
        const dt=val('tr-d-date'), v=num('tr-d-val');
        if(!T.validIso(dt)) return fail('Bitte ein Datum eingeben.');
        if(!Number.isFinite(v)) return fail('Bitte den Betrag als Zahl eingeben, z. B. 1.234,50 oder −200.');
        kind=val('tr-d-kind');
        const pnl=kind==='bal'?Math.round((v-T.closeBefore(acc,dt))*100)/100:v;
        const tr=val('tr-d-trades'), trades=tr===''?null:Number(tr);
        if(trades!==null && !(Number.isInteger(trades) && trades>=0)) return fail('Trades als ganze Zahl eingeben.');
        const hi=optNum('tr-d-high'), lo=optNum('tr-d-low'), mtl=optNum('tr-d-mtl');
        if([hi,lo,mtl].some(Number.isNaN)) return fail('Tageshoch, Tagestief und größter Verlust als Zahl eingeben.');
        if(dt<acc.phases[0].start) return fail('Das Datum liegt vor dem Start der ersten Phase.');
        setAcc(T.upsertDay(acc,{date:dt,pnl,trades,high:hi,low:lo,maxTradeLoss:mtl===null?null:Math.abs(mtl)}));
      }else if(name==='payout'){
        const dt=val('tr-p-date'), amt=num('tr-p-amt'), rec=optNum('tr-p-rec');
        if(!T.validIso(dt) || !Number.isFinite(amt) || amt<=0 || Number.isNaN(rec)) return fail('Bitte Datum und abgebuchten Betrag eingeben.');
        setAcc(T.addPayout(acc,{date:dt,amount:amt,received:rec===null?Math.round(amt*acc.rules.split)/100:rec}));
      }else if(name==='cost'){
        const dt=val('tr-c-date'), amt=num('tr-c-amt');
        if(!T.validIso(dt) || !Number.isFinite(amt) || amt<0) return fail('Bitte Datum und Betrag eingeben.');
        setAcc(T.addCost(acc,{date:dt,amount:amt,text:val('tr-c-text')}));
      }else if(name==='phase'){
        const dt=val('tr-ph-date'), b=num('tr-ph-bal');
        if(!T.validIso(dt) || !Number.isFinite(b)) return fail('Bitte Start und Startkontostand eingeben.');
        if(dt<acc.phases[acc.phases.length-1].start) return fail('Der Start liegt vor dem Start der laufenden Phase.');
        setAcc(T.addPhase(acc,{phase:el.dataset.phase,start:dt,startBalance:b}));
      }else if(name==='firm'){
        const v=optNum('tr-ff'); if(Number.isNaN(v)) return fail('Die Grenze ist keine Zahl.');
        setAcc(Object.assign({},acc,{firmFloor:v}));
      }else if(name==='edit'){
        const fee=num('tr-e-fee'), buy=val('tr-e-buy');
        if(!Number.isFinite(fee) || fee<0 || !T.validIso(buy)) return fail('Fee und Kaufdatum prüfen.');
        setAcc(Object.assign({},acc,{name:val('tr-e-name'),note:val('tr-e-note'),feePaid:fee,buyDate:buy}));
      }else if(name==='delete'){
        if(!env.confirm(`Account „${acc.name}“ mit allen Buchungen löschen?`)) return;
        state=Object.assign({},state,{accounts:state.accounts.filter(a=>a.id!==acc.id)}); sel=null; save(); render();
      }else if(name==='take-rules'){
        const x=byId[acc.offerId]; if(!x) return;
        setAcc(Object.assign({},acc,{rules:T.snapshotRules(x.o,E),offerAsof:x.o.asof}));
      }else if(name==='set-lost') setAcc(Object.assign({},acc,{status:'verloren'}));
      else if(name==='del-day') setAcc(T.removeDay(acc,el.dataset.key));
      else if(name==='del-pay') setAcc(T.removePayout(acc,+el.dataset.key));
      else if(name==='del-cost') setAcc(T.removeCost(acc,+el.dataset.key));
      else if(name==='del-phase') setAcc(Object.assign({},acc,{phases:acc.phases.slice(0,-1)}));
    }

    function exportFile(){
      env.download(T.exportName(today()),T.exportJson(state,env.now()));
    }
    function importFile(file){
      const rd=new env.FileReader();
      rd.onload=()=>{
        const r=T.importJson(String(rd.result));
        if(!r.ok){ flash=''; $('tr-io').textContent='Import abgelehnt, der Stand bleibt unverändert: '+r.errors.slice(0,5).join(' ')+(r.errors.length>5?` (und ${r.errors.length-5} weitere)`:''); return; }
        if(state.accounts.length && env.confirm('Vorher den aktuellen Stand exportieren?')) exportFile();
        if(!env.confirm(T.confirmText(state,r.state))) return;
        state=r.state; sel=null; if(msg===T.BROKEN){ canSave=true; msg=null; }
        save(); render(); $('tr-io').textContent=`Import fertig: ${state.accounts.length} Accounts.`;
      };
      rd.onerror=()=>{ $('tr-io').textContent='Die Datei konnte nicht gelesen werden, der Stand bleibt unverändert.'; };
      rd.readAsText(file);
    }

    doc.addEventListener('click',ev=>{
      const el=ev.target.closest('[data-act]'); if(!el) return;
      act(el.dataset.act,el);
    });
    doc.addEventListener('change',ev=>{
      if(ev.target.id==='tr-status'){ const acc=state.accounts.find(a=>a.id===sel); if(acc) setAcc(Object.assign({},acc,{status:ev.target.value})); }
      if(ev.target.id==='tr-file' && ev.target.files[0]){ importFile(ev.target.files[0]); ev.target.value=''; }
    });
    render();
    return {get state(){ return state; },render};
  }

  const api={esc,offerIndex,offerOptions,overviewHtml,rulesHtml,detailHtml,newFormHtml,sheetHtml,curveSvg,browserEnv,mount};
  if(typeof module!=='undefined' && module.exports) module.exports=api;
  else{
    root.GlitchTrackerUi=api;
    if(root.document) root.document.addEventListener('DOMContentLoaded',()=>mount(browserEnv(root)));
  }
})(typeof self!=='undefined'?self:this);
