/* Glitch-Simulator – Seite „Regeln“ (M-029).
   HTML-Bausteine als Text und mount(env): DOM und localStorage nur in mount. Daten und Zusammenführen in js/firms.js,
   Regelblatt aus js/explain.js (ruleSheet). Browser: globales GlitchRegelnUi, Node: module.exports. */
(function(root){
  'use strict';

  const STORE_KEY='mepfc-regeln-v1';
  const esc=s=>String(s===null || s===undefined?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const link=(url,text)=>`<a href="${esc(url)}" target="_blank" rel="noopener">${esc(text)}</a>`;

  // Quelle und Stand eines Belegs
  function srcLine(F,x){
    if(!x || !x.src) return '';
    const parts=[link(x.src,'Quelle'),'Stand '+esc(F.deDate(x.asof))];
    if(x.written) parts.push('Artikel vom '+esc(F.deDate(x.written)));
    return `<span class="rg-src">${parts.join(' · ')}</span>`;
  }

  // Kachel: Zahl groß, Zustand als Wort
  function tileHtml(F,t,x){
    let val, sub='', cls=x.state;
    if(x.state==='value'){
      val=x.unit==='$'?F.usd(x.value):F.num(x.value);
      sub=`<span class="rg-sub">${esc(x.text||'')}</span><span class="rg-word">belegt</span>`;
    } else if(x.state==='none'){
      val=x.text||'keine feste Anzahl';
      sub='<span class="rg-word">belegt</span>';
    } else {
      val='nicht belegt';
      if(x.third) sub=`<span class="rg-sub">${esc(x.third.text)}</span>`;
    }
    const src=x.state==='unknown'?(x.third?srcLine(F,x.third):''):srcLine(F,x);
    const quote=x.quote?`<span class="rg-quote">„${esc(x.quote)}“</span>`:'';
    return `<div class="rg-tile rg-${esc(cls)}"><span class="rg-lab">${esc(t.label)}</span><span class="rg-val">${esc(val)}</span>${sub}${quote}${src}</div>`;
  }

  function banHtml(F,m){
    const b=m.firm.ban; if(!b) return '';
    if(b.kind==='note'){
      if(m.banNotes.n!==m.banNotes.total) return '';
      return `<div class="rg-ban"><b>${esc(F.BAN_PHRASE)}</b><span>Laut Regeltext aller ${esc(F.num(m.banNotes.total))} Angebote. `+
        `<span class="rg-src">${link(m.firstSrc,'Quelle')} · Stand ${esc(m.rulesAsof)}</span></span></div>`;
    }
    return `<div class="rg-ban"><b>${esc(F.BAN_PHRASE)}</b><span class="rg-quote">„${esc(b.quote)}“</span>`+
      (b.text?`<span>${esc(b.text)}</span>`:'')+srcLine(F,b)+'</div>';
  }

  // Stand der Limits: alle Daten der Belege der Firma
  function limitsAsof(F,f){
    const xs=[f.scope].concat(Object.values(f.limits),f.extra,f.plans).filter(x=>x && x.src && x.state!=='unknown');
    return xs.length?'Limits Stand '+F.dateRange(xs.map(x=>x.asof)):'Limits: kein Beleg';
  }

  function firmCardHtml(F,m){
    const f=m.firm;
    let h=`<div class="rg-card"><h2>${esc(f.name)}</h2><p class="rg-q">Wie viele Accounts gleichzeitig?</p><div class="rg-tiles">`;
    h+=F.TILES.map(t=>tileHtml(F,t,f.limits[t.key])).join('')+'</div>';
    const lines=[];
    lines.push(f.scope.state==='value'?`Gilt ${esc(f.scope.text)}. ${srcLine(F,f.scope)}`:'Geltungsbereich (Person, Haushalt, IP): <b class="rg-nb">nicht belegt</b>');
    for(const x of f.extra) lines.push(`${esc(x.text)} ${srcLine(F,x)}`);
    for(const p of f.plans) lines.push(`Nur ${esc(p.label)}: ${esc(p.text)}. ${srcLine(F,p)}`);
    h+=`<ul class="rg-lines">${lines.map(l=>`<li>${l}</li>`).join('')}</ul>`+banHtml(F,m);
    h+=`<p class="rg-asof">${esc(limitsAsof(F,f))} · Regeln Stand ${esc(m.rulesAsof)}</p></div>`;
    return h;
  }

  function cellHtml(c){
    const span=c.span>1?` colspan="${c.span}"`:'';
    return `<td${span}>${c.url?link(c.text,'Quelle'):esc(c.text)}</td>`;
  }
  function planHtml(F,p){
    const n=p.cols.length;
    let t=`<div class="rg-scroll"><table class="rg-t"><thead><tr><th scope="col">Regel</th>${p.cols.map(c=>`<th scope="col">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>`;
    for(const g of p.groups){
      if(!g.rows.length && !g.none.length) continue;
      t+=`<tr class="rg-g"><th scope="rowgroup" colspan="${n+1}">${esc(g.label)}</th></tr>`;
      for(const r of g.rows) t+=`<tr><th scope="row">${esc(r.label)}</th>${r.cells.map(cellHtml).join('')}</tr>`;
      if(g.none.length) t+=`<tr class="rg-off"><td colspan="${n+1}">Ohne Regel im Modell: ${esc(g.none.join(', '))}</td></tr>`;
    }
    t+='</tbody></table></div>';
    if(p.missing.length){
      t+=`<details class="rg-miss"><summary>${esc(F.num(p.missing.length))} Felder ohne Angabe</summary><ul>`+
        p.missing.map(x=>`<li>${esc(x.group)}: ${esc(x.label)} (${esc(x.cells.map(c=>c.text).join(' / '))})</li>`).join('')+'</ul></details>';
    }
    return `<details class="rg-plan" id="plan-${esc(p.key)}"><summary><span class="rg-pn">${esc(p.name)}</span><span class="rg-ps">${esc(p.cols.map(c=>c.label).join(' · '))}</span><span class="rg-ps">${esc(p.summary)}</span></summary>${t}</details>`;
  }

  function firmHtml(F,m){
    return `<section class="panel rg-firm" id="firma-${esc(m.firm.id)}" data-firm="${esc(m.firm.id)}" data-market="${esc(m.market)}" aria-label="${esc(m.firm.name)}">`+
      firmCardHtml(F,m)+`<h3 class="rg-ph">Regeln je Plan</h3>`+m.plans.map(p=>planHtml(F,p)).join('')+'</section>';
  }

  function jumpHtml(M){
    return M.map(m=>`<a href="#firma-${esc(m.firm.id)}" data-firm="${esc(m.firm.id)}" data-market="${esc(m.market)}">${esc(m.firm.name)}</a>`).join('');
  }
  function firmOptions(M){
    return '<option value="all">alle Firmen</option>'+M.map(m=>`<option value="${esc(m.firm.id)}">${esc(m.firm.name)}</option>`).join('');
  }
  const visible=(m,flt)=>(flt.firm==='all' || flt.firm===m.firm.id) && (flt.market==='all' || flt.market===m.market);

  // Alle erzeugten Texte einer Seite (für die Wortprüfung im Test)
  function pageHtml(F,M){ return M.map(m=>firmHtml(F,m)).join(''); }

  // ---- Seite (nur Browser) ----
  // env = {doc, storage, F, E, OFFERS}
  function mount(env){
    const doc=env.doc, $=id=>doc.getElementById(id), F=env.F;
    const M=F.model({OFFERS:env.OFFERS,ruleSheet:env.E.ruleSheet});
    let flt={firm:'all',market:'all'};
    try{ const s=JSON.parse(env.storage.getItem(STORE_KEY)||'null'); if(s && typeof s==='object') flt={firm:String(s.firm||'all'),market:String(s.market||'all')}; }catch(_){}
    if(flt.firm!=='all' && !M.some(m=>m.firm.id===flt.firm)) flt.firm='all';
    if(!['all','Futures','CFD'].includes(flt.market)) flt.market='all';
    $('rg-firm').innerHTML=firmOptions(M);
    $('rg-jump').innerHTML=jumpHtml(M);
    $('rg-body').innerHTML=pageHtml(F,M);
    const apply=()=>{
      $('rg-firm').value=flt.firm; $('rg-market').value=flt.market;
      let shown=0;
      for(const m of M){
        const on=visible(m,flt); if(on) shown++;
        $('firma-'+m.firm.id).hidden=!on;
        const a=$('rg-jump').querySelector(`a[data-firm="${m.firm.id}"]`); if(a) a.hidden=!on;
      }
      $('rg-empty').hidden=shown>0;
      try{ env.storage.setItem(STORE_KEY,JSON.stringify(flt)); }catch(_){}
    };
    $('rg-firm').addEventListener('change',e=>{ flt.firm=e.target.value; apply(); });
    $('rg-market').addEventListener('change',e=>{ flt.market=e.target.value; apply(); });
    // Sprung auf einen Plan öffnet ihn
    const openHash=()=>{
      const h=decodeURIComponent((root.location && root.location.hash)||'').slice(1); if(!h) return;
      const el=$(h); if(el && el.tagName==='DETAILS'){ el.open=true; el.scrollIntoView(); }
    };
    apply(); openHash();
    if(root.addEventListener) root.addEventListener('hashchange',openHash);
  }
  function browserEnv(w){
    let storage;
    try{ storage=w.localStorage; storage.getItem(STORE_KEY); }
    catch(_){ storage={getItem(){ return null; },setItem(){}}; }
    return {doc:w.document,storage,F:w.GlitchFirms,E:w.GlitchExplain,OFFERS:w.GlitchData.OFFERS};
  }

  const api={STORE_KEY,esc,tileHtml,banHtml,firmCardHtml,planHtml,firmHtml,jumpHtml,firmOptions,visible,pageHtml,limitsAsof,browserEnv,mount};
  if(typeof module!=='undefined' && module.exports) module.exports=api;
  else{
    root.GlitchRegelnUi=api;
    if(root.document) root.document.addEventListener('DOMContentLoaded',()=>mount(browserEnv(root)));
  }
})(typeof self!=='undefined'?self:this);
