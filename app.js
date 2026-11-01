"use strict";
/* Prep & Portion — meal prep, portioning, food diary and shopping list. */

/* ===================== helpers ===================== */
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>{if(v===''||v==null)return NaN;return parseFloat(String(v).replace(',','.'));};
const nz=v=>{const n=num(v);return isFinite(n)?n:0;};
function fmt(n,d=0){if(n==null||!isFinite(n))return '–';return Number(n).toLocaleString('en-GB',{minimumFractionDigits:d,maximumFractionDigits:d});}
const iso=d=>{const z=new Date(d.getTime()-d.getTimezoneOffset()*60000);return z.toISOString().slice(0,10);};
const today=()=>iso(new Date());
const parseISO=s=>{const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d);};
const addDays=(s,n)=>{const d=parseISO(s);d.setDate(d.getDate()+n);return iso(d);};
const monday=s=>{const d=parseISO(s);d.setDate(d.getDate()-((d.getDay()+6)%7));return iso(d);};
const dayLabel=s=>parseISO(s).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});
const daysBetween=(a,b)=>Math.round((parseISO(b)-parseISO(a))/86400000);
const byName=(a,b)=>(a.name||'').localeCompare(b.name||'');
const NK=['kcal','p','c','f','fib','sat'];
const zeroN=()=>({kcal:0,p:0,c:0,f:0,fib:0,sat:0});
const basis=ing=>ing&&ing.unit==='pc'?1:100;
const unitTxt=u=>u==='pc'?'pc':(u==='ml'?'ml':'g');
function nutOf(ing,amt){const r=zeroN();if(!ing)return r;const b=basis(ing);NK.forEach(k=>r[k]=nz(ing[k])*amt/b);return r;}
function addN(a,b,s=1){NK.forEach(k=>a[k]=(a[k]||0)+(b[k]||0)*s);return a;}
function amt(ing,x){if(!isFinite(x))return '–';return ing&&ing.unit==='pc'?fmt(x,1)+' pc':fmt(x,0)+' '+unitTxt(ing&&ing.unit);}
function setPath(path,val){const o={};let cur=o;const ks=path.split('.');ks.forEach((k,i)=>{if(i===ks.length-1)cur[k]=val;else{cur[k]={};cur=cur[k];}});return o;}
function getPath(obj,path){return path.split('.').reduce((o,k)=>o==null?undefined:o[k],obj);}
function toast(msg){const t=$('#toast');t.textContent=msg;t.style.display='block';clearTimeout(toast._t);toast._t=setTimeout(()=>t.style.display='none',3200);}
const clone=o=>JSON.parse(JSON.stringify(o));
const ingName=id=>(S.ingredients[id]||{}).name||'(deleted ingredient)';

/* ===================== state ===================== */
const COLS=['ingredients','recipes','meals','utensils','people','sessions','logs','shop','meta'];
const S={db:null,user:null,loaded:{},server:{},tab:'prep',
  ui:{week:monday(today()),session:null,step:1,recipe:null,rlib:'recipes',q:'',pid:null,date:today(),shopWeek:monday(today()),prof:'people'}};
COLS.forEach(c=>S[c]={});
const APP_VERSION=(document.querySelector('meta[name="app-version"]')||{}).content||'dev';

/* ===================== writes ===================== */
// Writes are fire-and-forget: the local copy updates at once (also offline) and syncs when online.
function fail(e){
  const c=e&&e.code||'';
  if(c.includes('permission'))toast('Not allowed to save. Is this account on the allow-list?');
  else toast('Could not save ('+(c||'error')+').');
}
function newId(col){return S.db.collection(col).doc().id;}
function put(col,id,data){S.db.collection(col).doc(id).set(data).catch(fail);return true;}
function patch(col,id,data){S.db.collection(col).doc(id).update(data).catch(fail);return true;}
function remove(col,id){S.db.collection(col).doc(id).delete().catch(fail);return true;}

/* ===================== targets ===================== */
const PAL=[[1.2,'Sedentary: desk job, little walking'],[1.375,'Lightly active: desk job, some walking or cycling'],[1.55,'Moderately active: 3–5 training days, active commute'],[1.725,'Very active: daily hard training or physical job']];
function ageOf(b){if(!b)return null;const d=parseISO(b),n=new Date();let a=n.getFullYear()-d.getFullYear();if(n.getMonth()<d.getMonth()||(n.getMonth()===d.getMonth()&&n.getDate()<d.getDate()))a--;return a;}
function weightSeries(pid){return Object.values(S.logs).filter(l=>l.pid===pid&&nz(l.kg)>0).map(l=>({date:l.date,kg:nz(l.kg)})).sort((a,b)=>a.date<b.date?-1:1);}
function trend(pid){
  const w=weightSeries(pid);if(!w.length)return{n:0,series:[]};
  let ema=w[0].kg;const pts=[{date:w[0].date,v:ema}];
  for(let i=1;i<w.length;i++){const gap=Math.max(1,daysBetween(w[i-1].date,w[i].date));const a=1-Math.pow(0.9,gap);ema+=a*(w[i].kg-ema);pts.push({date:w[i].date,v:ema});}
  const last=w[w.length-1],cutoff=addDays(last.date,-21);
  const win=w.filter(p=>p.date>=cutoff);let slope=null;
  if(win.length>=8&&daysBetween(win[0].date,last.date)>=14){
    const xs=win.map(p=>daysBetween(win[0].date,p.date)),ys=win.map(p=>p.kg);
    const mx=xs.reduce((a,b)=>a+b)/xs.length,my=ys.reduce((a,b)=>a+b)/ys.length;
    let sxy=0,sxx=0;xs.forEach((x,i)=>{sxy+=(x-mx)*(ys[i]-my);sxx+=(x-mx)**2;});slope=sxx?sxy/sxx:null;
  }
  return{n:w.length,series:w,pts,latest:last.kg,lastDate:last.date,trendKg:ema,slope,perWeek:slope!=null?slope*7:null};
}
function targets(p){
  if(!p)return{ok:false,missing:['person']};
  const tr=trend(p.id);const W=tr.trendKg||nz(p.startKg)||null;const A=ageOf(p.birth);
  const missing=[];if(!W)missing.push('weight');if(!nz(p.height))missing.push('height');if(A==null)missing.push('birth date');
  if(missing.length)return{ok:false,missing,tr};
  const bmr=10*W+6.25*nz(p.height)-5*A+(p.sex==='f'?-161:5);
  const tdee=bmr*(nz(p.pal)||1.55);
  const sign=p.goal==='cut'?-1:p.goal==='bulk'?1:0;
  const ratePct=sign*(nz(p.rate)||0);
  const offset=ratePct/100*W*7700/7;
  const kcal=tdee+offset+nz(p.adj);
  const P=(nz(p.pkg)||2)*W,F=(nz(p.fkg)||0.8)*W,C=Math.max(0,(kcal-4*P-9*F)/4);
  return{ok:true,W,A,bmr,tdee,offset,kcal,P,F,C,fib:30,satMax:kcal*0.1/9,targetKgWk:ratePct/100*W,tr};
}
function boxDefaults(p){
  const t=targets(p);if(!t.ok)return{kcal:600,p:40,f:18};
  const k=(t.kcal-nz(p.other))/(nz(p.prepMeals)||2),ratio=k/t.kcal;
  return{kcal:Math.round(k/10)*10,p:Math.round(t.P*ratio),f:Math.round(t.F*ratio)};
}
function dayTotals(pid,date){const l=S.logs[pid+'_'+date];const t=zeroN();(l&&l.entries||[]).forEach(e=>addN(t,e.n||{}));return t;}
function coaching(p){
  const t=targets(p);if(!t.ok||t.tr.perWeek==null)return null;
  const diff=t.targetKgWk-t.tr.perWeek;let sug=Math.round(diff*7700/7/25)*25;sug=Math.max(-300,Math.min(300,sug));
  const cutoff=addDays(t.tr.lastDate,-21);
  const full=Object.values(S.logs).filter(l=>l.pid===p.id&&l.full&&l.date>=cutoff);
  let maint=null;if(full.length>=7){const avg=full.reduce((a,l)=>a+dayTotals(p.id,l.date).kcal,0)/full.length;maint=avg-t.tr.slope*7700;}
  const recentChange=p.adjDate&&daysBetween(p.adjDate,today())<14;
  return{sug,maint,recentChange,obs:t.tr.perWeek,target:t.targetKgWk,fullDays:full.length};
}

/* ===================== solver ===================== */
const ROLE={P:{label:'Protein source',short:'protein',macro:'p',cls:'mp'},C:{label:'Carb source',short:'carb',macro:'c',cls:'mc'},F:{label:'Fat source',short:'fat',macro:'f',cls:'mf'},X:{label:'Fixed amount',short:'fixed',macro:null,cls:'muted'}};
function buildGroups(items){
  const groups=[],errors=[];
  ['P','C','F'].forEach(role=>{
    const idx=[];items.forEach((it,i)=>{if(it.role===role)idx.push(i);});if(!idx.length)return;
    const mk=ROLE[role].macro;const tot=idx.reduce((a,i)=>a+(nz(items[i].w)||0),0)||idx.length;
    const col=zeroN(),parts=[];let bad=false;
    idx.forEach(i=>{
      const ing=S.ingredients[items[i].ing];
      if(!ing){errors.push('An ingredient in this recipe was deleted.');bad=true;return;}
      const perUnit=nz(ing[mk])/basis(ing);
      if(perUnit<=0){errors.push(ing.name+' has no '+({p:'protein',c:'carbs',f:'fat'})[mk]+' listed, so it cannot be a '+ROLE[role].label.toLowerCase()+'.');bad=true;return;}
      const share=(idx.length===1?1:(nz(items[i].w)||0)/tot);
      const u=share/perUnit;parts.push({i,u});addN(col,nutOf(ing,u));
    });
    if(!bad&&parts.length)groups.push({role,col,parts});
  });
  return{groups,errors};
}
function solveLin(A,b){
  const n=b.length,M=A.map((r,i)=>[...r,b[i]]);
  for(let c=0;c<n;c++){
    let piv=c;for(let r=c+1;r<n;r++)if(Math.abs(M[r][c])>Math.abs(M[piv][c]))piv=r;
    if(Math.abs(M[piv][c])<1e-9)return null;[M[c],M[piv]]=[M[piv],M[c]];
    for(let r=0;r<n;r++){if(r===c)continue;const f=M[r][c]/M[c][c];for(let k=c;k<=n;k++)M[r][k]-=f*M[c][k];}
  }
  return M.map((r,i)=>r[n]/r[i]);
}
function solveGroups(groups,tgt){
  let active=groups.map((g,i)=>i);const pri=['p','f','c'];
  while(active.length){
    const macros=active.map(i=>ROLE[groups[i].role].macro).sort((a,b)=>pri.indexOf(a)-pri.indexOf(b));
    const rows=['kcal',...macros].slice(0,active.length);
    const x=solveLin(rows.map(r=>active.map(i=>groups[i].col[r])),rows.map(r=>tgt[r]));
    if(!x){active.pop();continue;}
    let mi=-1,mv=-1e-9;x.forEach((v,j)=>{if(v<mv){mv=v;mi=j;}});
    if(mi<0){const q=groups.map(()=>0);active.forEach((gi,j)=>q[gi]=x[j]);return{q,rows};}
    active.splice(mi,1);
  }
  return{q:groups.map(()=>0),rows:[]};
}
function sessionPeople(s){return Object.entries(s.people||{}).filter(([pid,v])=>S.people[pid]&&nz(v.boxes)>0).map(([pid,v])=>({pid,boxes:nz(v.boxes),t:{kcal:nz(v.kcal),p:nz(v.p),f:nz(v.f)}}));}
function planSession(s){
  const items=s.items||[];const {groups,errors}=buildGroups(items);
  const ppl=sessionPeople(s);const totals=items.map(()=>0);const byPerson={};
  let rows=[];
  if(!ppl.length)return{items,errors,totals,byPerson,ppl,rows,empty:true};
  const nb=ppl.reduce((a,pp)=>a+pp.boxes,0);
  const T={kcal:0,p:0,f:0};ppl.forEach(pp=>{T.kcal+=pp.t.kcal*pp.boxes;T.p+=pp.t.p*pp.boxes;T.f+=pp.t.f*pp.boxes;});
  const shareOf=pp=>T.kcal>0?pp.t.kcal*pp.boxes/T.kcal:pp.boxes/nb;
  const fixedAmt=(it,pp)=>{const v=nz(it.fixed);if(it.per==='box')return v*(pp?pp.boxes:nb);return pp?v*shareOf(pp):v;};
  const fixedVec=pp=>items.map(it=>it.role==='X'?fixedAmt(it,pp):0);
  const nutVec=a=>{const n=zeroN();a.forEach((x,i)=>{if(x)addN(n,nutOf(S.ingredients[items[i].ing],x));});return n;};
  if(s.mode==='split'){
    ppl.forEach(pp=>{
      const fa=fixedVec(pp),fx=nutVec(fa);
      const tg={kcal:pp.t.kcal-fx.kcal/pp.boxes,p:pp.t.p-fx.p/pp.boxes,f:pp.t.f-fx.f/pp.boxes};
      const sol=solveGroups(groups,tg);rows=sol.rows;
      const amts=fa.slice();groups.forEach((g,gi)=>g.parts.forEach(pt=>amts[pt.i]+=sol.q[gi]*pt.u*pp.boxes));
      byPerson[pp.pid]={amts,boxes:pp.boxes,target:pp.t,share:shareOf(pp)};amts.forEach((x,i)=>totals[i]+=x);
    });
  }else{
    const fa=fixedVec(null),fx=nutVec(fa);
    const tg={kcal:T.kcal-fx.kcal,p:T.p-fx.p,f:T.f-fx.f};
    const sol=solveGroups(groups,tg);rows=sol.rows;
    const tot=fa.slice();groups.forEach((g,gi)=>g.parts.forEach(pt=>tot[pt.i]+=sol.q[gi]*pt.u));
    tot.forEach((x,i)=>totals[i]=x);
    ppl.forEach(pp=>{const share=shareOf(pp);byPerson[pp.pid]={amts:tot.map(x=>x*share),boxes:pp.boxes,target:pp.t,share};});
  }
  Object.values(byPerson).forEach(bp=>{const n=nutVec(bp.amts);NK.forEach(k=>n[k]/=bp.boxes);bp.perBox=n;});
  return{items,errors,totals,byPerson,ppl,rows,groups};
}
function defaultPan(s,it){if(s.mode!=='split')return 'A';return it.role==='C'?'B':it.role==='X'?'C':'A';}
function cookSession(s,plan){
  const items=plan.items;
  const actual=items.map((it,i)=>{const v=num(getPath(s,'actual.'+i));return isFinite(v)?v:plan.totals[i];});
  const panOf=i=>(s.pan&&s.pan[i])||defaultPan(s,items[i]);
  const slots={};items.forEach((it,i)=>{const L=panOf(i);(slots[L]=slots[L]||[]).push(i);});
  const res={actual,panOf,slots:{},box:{}};
  plan.ppl.forEach(pp=>{res.box[pp.pid]={nut:zeroN(),weights:{},direct:[]};});
  Object.entries(slots).forEach(([L,idx])=>{
    if(L==='box'){
      idx.forEach(i=>{const ing=S.ingredients[items[i].ing];plan.ppl.forEach(pp=>{
        const share=plan.totals[i]?plan.byPerson[pp.pid].amts[i]/plan.totals[i]:0;const per=actual[i]*share/pp.boxes;
        res.box[pp.pid].direct.push({i,per});addN(res.box[pp.pid].nut,nutOf(ing,per));});});
      return;
    }
    const cfg=(s.slots&&s.slots[L])||{};const ut=S.utensils[cfg.u];const tare=ut?nz(ut.tare):0;const gross=num(cfg.gross);
    const net=isFinite(gross)?gross-tare:NaN;
    let tot=0;const pk={};plan.ppl.forEach(pp=>{let k=0;idx.forEach(i=>{const ing=S.ingredients[items[i].ing];k+=plan.byPerson[pp.pid].amts[i]*nz((ing||{}).kcal)/basis(ing);});pk[pp.pid]=k;tot+=k;});
    if(tot<=0){tot=0;plan.ppl.forEach(pp=>{let k=0;idx.forEach(i=>k+=plan.byPerson[pp.pid].amts[i]);pk[pp.pid]=k;tot+=k;});}
    const panNut=zeroN();idx.forEach(i=>addN(panNut,nutOf(S.ingredients[items[i].ing],actual[i])));
    res.slots[L]={idx,cfg,tare,gross,net,share:{},hasUt:!!ut};
    plan.ppl.forEach(pp=>{const sh=tot?pk[pp.pid]/tot:0;res.slots[L].share[pp.pid]=sh;
      res.box[pp.pid].weights[L]=isFinite(net)?net*sh/pp.boxes:NaN;addN(res.box[pp.pid].nut,panNut,sh/pp.boxes);});
  });
  return res;
}
function sessionBoxNut(s,pid){const plan=planSession(s);if(!plan.byPerson[pid])return null;return cookSession(s,plan).box[pid].nut;}
function mealNut(m,serv=1){const n=zeroN();(m.items||[]).forEach(it=>addN(n,nutOf(S.ingredients[it.ing],nz(it.amt)*serv)));return n;}

/* ===================== rendering infra ===================== */
const ICON={
  prep:'<rect x="3" y="7" width="18" height="12" rx="2" stroke="currentColor" stroke-width="2" fill="none"/><path d="M3 11h18M12 11v8" stroke="currentColor" stroke-width="2"/><path d="M8 4h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  recipes:'<path d="M6 3h10a2 2 0 0 1 2 2v16l-3-2-3 2-3-2-3 2V5a2 2 0 0 1 0-2z" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/><path d="M9 8h6M9 12h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  shop:'<path d="M5 7h14l-1.5 12h-11z" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/><path d="M9 7a3 3 0 0 1 6 0" stroke="currentColor" stroke-width="2" fill="none"/>',
  diary:'<rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" stroke-width="2" fill="none"/><path d="M4 10h16M9 3v4M15 3v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  profile:'<circle cx="9" cy="9" r="3" stroke="currentColor" stroke-width="2" fill="none"/><path d="M3 19c1-3 3.5-4.5 6-4.5s5 1.5 6 4.5" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="17" cy="8" r="2.4" stroke="currentColor" stroke-width="2" fill="none"/><path d="M16 13.5c2.2 0 4 1.3 5 3.5" stroke="currentColor" stroke-width="2" fill="none"/>'};
const TABS=[['prep','Meal prep','What you cook this week and how to portion it'],['recipes','Recipes','Recipes, breakfasts and your ingredients'],['shop','Shopping','Everything to buy for the week'],['diary','Diary','What each of you ate, and morning weight'],['profile','Profile','Targets, progress, pans and app settings']];
function renderTabs(){$('#tabs').innerHTML=TABS.map(([k,l])=>`<button data-tab="${k}" ${S.tab===k?'aria-current="page"':''}><svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>${l}</button>`).join('');}
let rq=0;function scheduleRender(){if(rq)return;rq=requestAnimationFrame(()=>{rq=0;render();});}
function render(){
  if(!S.db)return;
  const a=document.activeElement,key=a&&a.dataset&&a.dataset.k,sel=(a&&typeof a.selectionStart==='number')?[a.selectionStart,a.selectionEnd]:null;
  renderTabs();
  const t=TABS.find(x=>x[0]===S.tab);
  $('#title').textContent=t[1];
  const views={prep:viewPrep,recipes:viewRecipes,shop:viewShop,diary:viewDiary,profile:viewProfile};
  $('#view').innerHTML=views[S.tab]();
  if(key){const el=document.querySelector(`#view [data-k="${CSS.escape(key)}"]`);if(el&&el!==document.activeElement){el.focus({preventScroll:true});if(sel&&el.setSelectionRange)try{el.setSelectionRange(sel[0],sel[1]);}catch(e){}}}
}
function sub(txt){return `<p class="subtitle">${txt}</p>`;}
function macroLine(n,opts={}){return `<div class="macros"><span class="mk"><b>${fmt(n.kcal)}</b> kcal</span><span class="mp">Protein <b>${fmt(n.p)}</b></span><span class="mc">Carbs <b>${fmt(n.c)}</b></span><span class="mf">Fat <b>${fmt(n.f)}</b></span>${opts.extra?`<span class="muted">Fibre ${fmt(n.fib,1)}</span><span class="muted">Sat. fat ${fmt(n.sat,1)}</span>`:''}</div>`;}
function bar(label,val,target,color,unit='g',mode='target'){
  const pct=target>0?Math.min(1.15,val/target):0;const over=mode==='max'&&val>target;
  return `<div class="bar"><span>${label}</span><span class="track"><span class="fill" style="width:${Math.min(100,pct*100)}%;background:${over?'var(--warn)':color}"></span></span><span class="val"><b>${fmt(val)}</b> / ${mode==='max'?'max ':''}${fmt(target)} ${unit}</span></div>`;
}
const seg=(act,cur,opts,label)=>`<div class="seg" role="group" aria-label="${label}">${opts.map(([k,l])=>`<button data-act="${act}" data-v="${k}" aria-pressed="${cur===k}">${l}</button>`).join('')}</div>`;
const personList=()=>Object.values(S.people).sort(byName);
const roleTag=r=>`<span class="tag ${ROLE[r].cls}">${ROLE[r].short}</span>`;

/* ===================== MEAL PREP ===================== */
function viewPrep(){
  if(S.ui.session&&S.sessions[S.ui.session])return viewSession(S.sessions[S.ui.session]);
  S.ui.session=null;
  const w=S.ui.week,end=addDays(w,6);
  const list=Object.values(S.sessions).filter(s=>s.date>=w&&s.date<=end).sort((a,b)=>a.date<b.date?-1:1);
  const needs=[];
  if(!personList().some(p=>targets(p).ok))needs.push('fill in height, weight and birth date under <b>Profile</b>');
  if(!Object.keys(S.utensils).length)needs.push('weigh your empty pans under <b>Profile → Pans</b>');
  return sub('Plan each cooking session: who eats, how much to cook, and what goes in every box.')+`
  <div class="weeknav"><button class="btn icon" data-act="week" data-d="-7" aria-label="Previous week">‹</button><strong>Week of ${dayLabel(w)}</strong><button class="btn icon" data-act="week" data-d="7" aria-label="Next week">›</button></div>
  ${needs.length?`<div class="note">Before your first cook: ${needs.join('; ')}.</div>`:''}
  <h2>Cooking sessions</h2>
  <div class="list">${list.length?list.map(s=>{
    const ppl=sessionPeople(s).map(pp=>esc(S.people[pp.pid].name)+' '+pp.boxes).join(' · ');
    const cooked=Object.values(s.slots||{}).some(x=>isFinite(num(x.gross)));
    return `<button class="item tap" data-act="openSession" data-id="${s.id}"><div class="grow"><div class="title">${esc(s.name||'Untitled')}</div><div class="small muted">${dayLabel(s.date)}${ppl?' · boxes: '+ppl:''}</div></div><span class="tag ${cooked?'mf':'mk'}">${cooked?'Portioned':'Planned'}</span><span class="chev">›</span></button>`;}).join(''):`<div class="empty">Nothing planned this week yet.</div>`}</div>
  <div class="actions"><button class="btn primary" data-act="newSession">+ Plan a cooking session</button></div>`;
}
const STEPS=[[1,'Who eats'],[2,'Weigh out'],[3,'Cook'],[4,'Portion']];
function viewSession(s){
  const step=S.ui.step;
  let html=`<div class="weeknav"><button class="btn sm" data-act="closeSession">‹ All sessions</button><button class="btn sm danger" data-act="delSession">Delete</button></div>
  <h2 style="margin:4px 0 2px">${esc(s.name)}</h2><p class="small muted" style="margin:0 0 8px">${dayLabel(s.date)} · ${s.mode==='split'?'components cooked separately':'everything in one pan'}</p>
  <div class="steps" role="tablist">${STEPS.map(([n,l])=>`<button data-act="step" data-v="${n}" ${step===n?'aria-current="step"':''}><b>${n}</b>${l}</button>`).join('')}</div>`;
  const plan=planSession(s);
  if(step===1)html+=stepWho(s,plan);
  else if(plan.empty)html+=`<div class="note">First set how many boxes each person gets in step 1.</div>`;
  else if(step===2)html+=stepWeigh(s,plan);
  else if(step===3)html+=stepCook(s,plan);
  else html+=stepPortion(s,plan);
  html+=`<div class="stepnav">${step>1?`<button class="btn" data-act="step" data-v="${step-1}">‹ ${STEPS[step-2][1]}</button>`:'<span></span>'}${step<4?`<button class="btn primary" data-act="step" data-v="${step+1}">${STEPS[step][1]} ›</button>`:'<span></span>'}</div>`;
  return html;
}
function stepWho(s,plan){
  const rec=S.recipes[s.recipe];
  const stale=rec&&JSON.stringify(rec.items||[])!==JSON.stringify(s.items||[]);
  const people=personList();
  return `<h3>Session details</h3><div class="panel"><div class="grid2"><label class="f">Cooking day<input class="in" type="date" data-k="sess.${s.id}.date" data-ch="sess" data-path="date" value="${esc(s.date)}"></label>
  <label class="f">How it's cooked<select class="in" data-k="sess.${s.id}.mode" data-ch="sess" data-path="mode"><option value="split" ${s.mode==='split'?'selected':''}>Components cooked separately</option><option value="mixed" ${s.mode!=='split'?'selected':''}>Everything in one pan</option></select></label></div>
  <p class="small muted">${s.mode==='split'?'Each person gets their own mix of each component, so both of you hit your own protein and fat exactly.':'Every box has the same mix; only the amount differs. Individual protein targets may drift a little.'}</p>
  ${stale?`<div class="note">The recipe “${esc(rec.name)}” changed after you planned this. <button class="btn sm" data-act="syncRecipe">Use the new recipe</button></div>`:''}</div>
  <h3>Boxes and targets per box</h3>
  <div class="panel">${people.length?people.map(p=>{const v=(s.people||{})[p.id]||{};const k=f=>`sess.${s.id}.people.${p.id}.${f}`;
    const fld=(f,l,cls='')=>`<label class="f"><span class="${cls}">${l}</span><input class="in" inputmode="decimal" data-k="${k(f)}" data-ch="sess" data-path="people.${p.id}.${f}" value="${esc(v[f]??'')}"></label>`;
    return `<div class="portion"><div class="topbar"><h3 style="margin:0">${esc(p.name)}</h3><button class="btn sm" data-act="resetTargets" data-pid="${p.id}">Use profile targets</button></div>
    <div class="grid4" style="margin-top:8px">${fld('boxes','Boxes')}${fld('kcal','kcal per box','mk')}${fld('p','Protein g / box','mp')}${fld('f','Fat g / box','mf')}</div></div>`;}).join(''):'<p class="muted">Add people under Profile first.</p>'}
  <p class="tiny muted">Set boxes to 0 for someone who is not eating from this batch. Carbs fill whatever calories remain.</p></div>`;
}
function deviationNotes(plan){
  const out=[];
  Object.entries(plan.byPerson).forEach(([pid,bp])=>{
    const n=bp.perBox,t=bp.target,nm=esc(S.people[pid].name);
    [['kcal','calories',15],['p','protein',3],['f','fat',3]].forEach(([k,l,tol])=>{
      const d=n[k]-t[k];if(Math.abs(d)>Math.max(tol,Math.abs(t[k])*0.05))out.push(`${nm}: ${l} land at <b>${fmt(n[k])}${k==='kcal'?' kcal':' g'}</b> per box instead of ${fmt(t[k])}.`);
    });
  });
  return out;
}
function stepWeigh(s,plan){
  const errs=plan.errors.map(e=>`<div class="warnbox"><b>Check:</b> ${esc(e)}</div>`).join('');
  const dev=deviationNotes(plan);
  return `<p class="small muted">Weigh these amounts <b>raw</b> (dry for rice and pasta) before cooking. The Shopping tab adds them up for the week.</p>${errs}
  <div class="panel scroll"><table class="t"><thead><tr><th>Ingredient</th><th class="n">Total</th>${plan.ppl.length>1?plan.ppl.map(pp=>`<th class="n">${esc(S.people[pp.pid].name)}</th>`).join(''):''}</tr></thead><tbody>
  ${plan.items.map((it,i)=>{const ing=S.ingredients[it.ing];return `<tr><td>${esc(ingName(it.ing))} ${roleTag(it.role)}</td><td class="n"><b>${amt(ing,plan.totals[i])}</b></td>${plan.ppl.length>1?plan.ppl.map(pp=>`<td class="n muted">${amt(ing,plan.byPerson[pp.pid].amts[i])}</td>`).join(''):''}</tr>`;}).join('')}
  </tbody></table></div>
  <h3>Each box, as planned</h3><div class="panel">${plan.ppl.map(pp=>{const bp=plan.byPerson[pp.pid];return `<div class="portion"><div class="title">${esc(S.people[pp.pid].name)} <span class="muted small">× ${pp.boxes} boxes</span></div>${macroLine(bp.perBox,{extra:true})}</div>`;}).join('')}</div>
  ${dev.length?`<div class="warnbox">${dev.join('<br>')}<br><span class="muted">${s.mode!=='split'&&plan.ppl.length>1?'In one pan everyone gets the same protein-to-calorie ratio. Cooking components separately fixes this. ':''}If the fat source came out at zero, the other ingredients already bring more fat than the target.</span></div>`:''}`;
}
function stepCook(s,plan){
  const rec=S.recipes[s.recipe];const items=plan.items;const ck=cookSession(s,plan);
  const slotOpts=cur=>['A','B','C','D'].map(L=>`<option value="${L}" ${cur===L?'selected':''}>Pan ${L}</option>`).join('')+`<option value="box" ${cur==='box'?'selected':''}>Straight into boxes</option>`;
  let h='';
  if(rec&&(rec.steps||[]).length)h+=`<h3>Method${rec.time?` · about ${rec.time} min`:''}</h3><div class="panel"><ol class="method">${rec.steps.map(x=>`<li>${esc(x)}</li>`).join('')}</ol>${rec.note?`<div class="note">${esc(rec.note)}</div>`:''}</div>`;
  h+=`<h3>What you used, and which pan</h3><p class="small muted">Only change “used” if it differs from the plan, for example when you use a whole pack. Ingredients cooked together share a pan letter.</p>
  <div class="panel scroll"><table class="t"><thead><tr><th>Ingredient</th><th>Used</th><th>Cooked in</th></tr></thead><tbody>
  ${items.map((it,i)=>{const ing=S.ingredients[it.ing];const v=getPath(s,'actual.'+i);return `<tr><td>${esc(ingName(it.ing))}<div class="tiny muted">plan ${amt(ing,plan.totals[i])}</div></td>
  <td style="min-width:96px"><input class="in" inputmode="decimal" placeholder="${fmt(plan.totals[i],ing&&ing.unit==='pc'?1:0)}" data-k="sess.${s.id}.actual.${i}" data-ch="sess" data-path="actual.${i}" value="${esc(v??'')}"></td>
  <td style="min-width:140px"><select class="in" data-k="sess.${s.id}.pan.${i}" data-ch="sess" data-path="pan.${i}">${slotOpts(ck.panOf(i))}</select></td></tr>`;}).join('')}
  </tbody></table></div>`;
  return h;
}
function stepPortion(s,plan){
  const ck=cookSession(s,plan),items=plan.items;
  const ut=Object.values(S.utensils).sort(byName);
  let h=`<p class="small muted">Put each pan with its cooked food on the scale and enter the reading. The app removes the pan's own weight and tells you how much goes in every box.</p>`;
  Object.entries(ck.slots).sort().forEach(([L,sl])=>{
    const names=sl.idx.map(i=>esc(ingName(items[i].ing))).join(', ');
    h+=`<div class="slot"><h3>Pan ${L}</h3><p class="small muted">${names}</p>
    <div class="grid2"><label class="f">Which pan<select class="in" data-k="sess.${s.id}.slot.${L}.u" data-ch="sess" data-path="slots.${L}.u"><option value="">Scale already zeroed (0 g)</option>${ut.map(u=>`<option value="${u.id}" ${sl.cfg.u===u.id?'selected':''}>${esc(u.name)} (${fmt(nz(u.tare))} g)</option>`).join('')}</select></label>
    <label class="f">Scale reading, pan + food (g)<input class="in" inputmode="decimal" data-k="sess.${s.id}.slot.${L}.gross" data-ch="sess" data-path="slots.${L}.gross" value="${esc(sl.cfg.gross??'')}"></label></div>
    ${isFinite(sl.net)?`<p class="small">Cooked food in this pan: <b>${fmt(sl.net)} g</b></p>`:''}
    ${isFinite(sl.net)&&sl.net<=0?`<div class="warnbox"><b>Check:</b> the reading is not more than the empty pan's weight.</div>`:''}
    ${isFinite(sl.net)&&sl.net>0?plan.ppl.map(pp=>`<div class="portion"><div class="small muted">${esc(S.people[pp.pid].name)}: put in each of ${pp.boxes} boxes</div><div class="readout"><span class="big">${fmt(ck.box[pp.pid].weights[L])}</span><span class="unit">g</span></div></div>`).join(''):''}
    </div>`;
  });
  const direct=plan.ppl.filter(pp=>ck.box[pp.pid].direct.length);
  if(direct.length)h+=`<div class="slot"><h3>Add straight into each box</h3>${direct.map(pp=>`<div class="portion"><div class="small muted">${esc(S.people[pp.pid].name)}</div>${ck.box[pp.pid].direct.map(d=>{const ing=S.ingredients[items[d.i].ing];return `<div>${esc(ingName(items[d.i].ing))}: <b>${amt(ing,d.per)}</b></div>`;}).join('')}</div>`).join('')}</div>`;
  h+=`<h3>Each box, with what you actually used</h3><div class="panel">${plan.ppl.map(pp=>`<div class="portion"><div class="title">${esc(S.people[pp.pid].name)}</div>${macroLine(ck.box[pp.pid].nut,{extra:true})}</div>`).join('')}<p class="tiny muted">Log a box in the Diary tab with “Add a prepped box”.</p></div>`;
  return h;
}
function newSessionSheet(recipeId){
  const recs=Object.values(S.recipes).sort(byName);
  if(!recs.length){toast('Create a recipe first.');return;}
  const d=S.ui.week<=today()&&today()<=addDays(S.ui.week,6)?today():S.ui.week;
  const r0=S.recipes[recipeId]||recs[0];
  openSheet(`<h2>Plan a cooking session</h2><div class="stack">
  <label class="f">Recipe<select class="in" name="recipe">${recs.map(r=>`<option value="${r.id}" ${r.id===r0.id?'selected':''}>${esc(r.name)}</option>`).join('')}</select></label>
  <label class="f">Cooking day<input class="in" type="date" name="date" value="${d}"></label>
  <label class="f">How it's cooked<select class="in" name="mode"><option value="split">Components cooked separately</option><option value="mixed">Everything in one pan</option></select></label>
  <p class="small muted">Boxes start from your last session; calories start from each profile. You can change both in step 1.</p></div>
  <div class="actions"><button class="btn primary" id="go">Create</button><button class="btn" data-close>Cancel</button></div>`,pn=>{
    const sel=pn.querySelector('[name=recipe]'),mode=pn.querySelector('[name=mode]');
    const syncMode=()=>{const r=S.recipes[sel.value];if(r&&r.mode)mode.value=r.mode;};sel.onchange=syncMode;syncMode();
    pn.querySelector('#go').onclick=()=>{
      const r=S.recipes[sel.value];
      const last=Object.values(S.sessions).sort((a,b)=>a.date<b.date?1:-1)[0];
      const people={};personList().forEach(p=>{const bd=boxDefaults(p);const lb=last&&last.people&&last.people[p.id]?nz(last.people[p.id].boxes):3;people[p.id]={boxes:lb,...bd};});
      const id=newId('sessions');const date=pn.querySelector('[name=date]').value||today();
      put('sessions',id,{name:r.name,recipe:r.id,items:clone(r.items||[]),date,mode:mode.value,people,actual:{},pan:{},slots:{}});
      closeSheet();S.tab='prep';S.ui.session=id;S.ui.step=1;S.ui.week=monday(date);render();window.scrollTo(0,0);
    };
  });
}

/* ===================== RECIPES ===================== */
function viewRecipes(){
  if(S.ui.recipe&&S.recipes[S.ui.recipe])return viewRecipe(S.recipes[S.ui.recipe]);
  S.ui.recipe=null;
  const t=S.ui.rlib;let body='';
  if(t==='recipes'){const l=Object.values(S.recipes).sort(byName);
    body=sub('Tap a recipe to read it or plan a cooking session with it.')+`<div class="list">${l.length?l.map(r=>`<button class="item tap" data-act="openRecipe" data-id="${r.id}"><div class="grow"><div class="title">${esc(r.name)}</div><div class="small muted">${r.time?r.time+' min · ':''}${(r.items||[]).map(it=>esc(ingName(it.ing))).join(', ')}</div></div><span class="chev">›</span></button>`).join(''):`<div class="empty">No recipes yet.</div>`}</div><div class="actions"><button class="btn primary" data-act="editRec">+ New recipe</button></div>`;}
  if(t==='meals'){const l=Object.values(S.meals).sort(byName);
    body=sub('Breakfasts you repeat. Log one in the Diary in a single tap.')+`<div class="list">${l.length?l.map(m=>`<button class="item tap" data-act="editMeal" data-id="${m.id}"><div class="grow"><div class="title">${esc(m.name)}</div><div class="small muted">${(m.items||[]).map(it=>esc(ingName(it.ing))+' '+amt(S.ingredients[it.ing],nz(it.amt))).join(', ')}</div>${macroLine(mealNut(m))}</div><span class="chev">›</span></button>`).join(''):`<div class="empty">No breakfasts saved yet.</div>`}</div><div class="actions"><button class="btn primary" data-act="editMeal">+ New breakfast</button></div>`;}
  if(t==='ingredients'){
    const q=S.ui.q.trim().toLowerCase();
    const l=Object.values(S.ingredients).filter(i=>!q||(i.name||'').toLowerCase().includes(q)).sort(byName);
    const groups=[['product','Your products (from labels)'],['veg','Vegetables'],['fruit','Fruit']];
    const catOf=i=>i.cat==='veg'||i.cat==='fruit'?i.cat:'product';
    body=sub('Values per 100 g, per 100 ml or per piece. Fruit and vegetables use standard values; products use their labels.')+
    `<input class="in search" type="search" placeholder="Search ingredients" data-k="ingq" data-ch="ingq" value="${esc(S.ui.q)}">`+
    groups.map(([c,label])=>{const g=l.filter(i=>catOf(i)===c);if(!g.length)return '';
      return `<h3>${label} <span class="muted small">${g.length}</span></h3><div class="list">${g.map(i=>`<button class="item tap" data-act="editIng" data-id="${i.id}"><div class="grow"><div class="title">${esc(i.name)}</div><div class="tiny muted">per ${i.unit==='pc'?'piece':'100 '+unitTxt(i.unit)}${i.store?' · '+esc(i.store):''}</div>${macroLine({kcal:nz(i.kcal),p:nz(i.p),c:nz(i.c),f:nz(i.f)})}</div><span class="chev">›</span></button>`).join('')}</div>`;}).join('')+
    (l.length?'':`<div class="empty">No ingredient matches.</div>`)+`<div class="actions"><button class="btn primary" data-act="editIng">+ New ingredient</button></div>`;}
  return seg('rlib',t,[['recipes','Meal-prep recipes'],['meals','Breakfasts'],['ingredients','Ingredients']],'Recipe section')+`<div style="margin-top:12px">${body}</div>`;
}
function viewRecipe(r){
  const fixed=(r.items||[]).filter(it=>it.role==='X'),solved=(r.items||[]).filter(it=>it.role!=='X');
  return `<div class="weeknav"><button class="btn sm" data-act="closeRecipe">‹ All recipes</button><button class="btn sm" data-act="editRec" data-id="${r.id}">Edit</button></div>
  <h2 style="margin:4px 0 2px">${esc(r.name)}</h2><p class="small muted" style="margin:0 0 10px">${r.time?`About ${r.time} min · `:''}${r.mode==='mixed'?'cooked in one pan':'components cooked separately'}</p>
  <h3>Ingredients</h3><div class="panel">
  ${solved.length?`<p class="small muted" style="margin-top:0">Amounts worked out per person when you plan a session:</p>${solved.map(it=>`<div class="ingline"><span>${esc(ingName(it.ing))}</span><span>${roleTag(it.role)}${solved.filter(x=>x.role===it.role).length>1?` <span class="small muted">${fmt(nz(it.w))}% of ${ROLE[it.role].short}</span>`:''}</span></div>`).join('')}`:''}
  ${fixed.length?`<p class="small muted">Fixed amounts:</p>${fixed.map(it=>`<div class="ingline"><span>${esc(ingName(it.ing))}</span><span><b>${amt(S.ingredients[it.ing],nz(it.fixed))}</b> <span class="small muted">${it.per==='box'?'per box':'whole batch'}</span></span></div>`).join('')}`:''}
  </div>
  <h3>Method</h3><div class="panel">${(r.steps||[]).length?`<ol class="method">${r.steps.map(x=>`<li>${esc(x)}</li>`).join('')}</ol>`:'<p class="muted">No method written yet. Tap Edit to add one.</p>'}${r.note?`<div class="note">${esc(r.note)}</div>`:''}</div>
  <div class="actions"><button class="btn primary block" data-act="newSession" data-id="${r.id}">Plan a cooking session with this</button></div>`;
}
function editIngredient(id){
  const ing=id?S.ingredients[id]:{unit:'g',cat:'product'};
  const stores=[...new Set(Object.values(S.ingredients).map(i=>i.store).filter(Boolean))];
  const f=(k,l,cls='')=>`<label class="f"><span class="${cls}">${l}</span><input class="in" name="${k}" inputmode="decimal" value="${esc(ing[k]??'')}"></label>`;
  const cat=ing.cat==='veg'||ing.cat==='fruit'?ing.cat:'product';
  openSheet(`<h2>${id?'Edit ingredient':'New ingredient'}</h2><div class="stack">
  <label class="f">Name<input class="in" name="name" value="${esc(ing.name??'')}" placeholder="Salmon fillet, Jumbo"></label>
  <div class="grid3"><label class="f">Type<select class="in" name="cat"><option value="product" ${cat==='product'?'selected':''}>Product</option><option value="veg" ${cat==='veg'?'selected':''}>Vegetable</option><option value="fruit" ${cat==='fruit'?'selected':''}>Fruit</option></select></label>
  <label class="f">Measured in<select class="in" name="unit"><option value="g" ${ing.unit==='g'?'selected':''}>grams</option><option value="ml" ${ing.unit==='ml'?'selected':''}>millilitres</option><option value="pc" ${ing.unit==='pc'?'selected':''}>pieces</option></select></label>
  <label class="f">Shop<input class="in" name="store" list="stl" value="${esc(ing.store??'')}" placeholder="Jumbo"><datalist id="stl">${stores.map(s=>`<option value="${esc(s)}">`).join('')}</datalist></label></div>
  <p class="small" id="basisTxt"></p>
  <div class="grid3">${f('kcal','kcal','mk')}${f('p','Protein g','mp')}${f('c','Carbs g','mc')}${f('f','Fat g','mf')}${f('fib','Fibre g')}${f('sat','Sat. fat g')}</div>
  <label class="f"><span id="packTxt">Pack size</span><input class="in" name="pack" inputmode="decimal" value="${esc(ing.pack??'')}" placeholder="optional, for the shopping list"></label>
  ${ing.src==='generic'?'<p class="tiny muted">Standard values. Saving your own numbers keeps them, even when the app updates its library.</p>':''}
  <div id="chk"></div></div>
  <div class="actions"><button class="btn primary" id="go">Save</button>${id?'<button class="btn danger" id="del">Delete</button>':''}<button class="btn" data-close>Cancel</button></div>`,pn=>{
    const q=n=>pn.querySelector(`[name=${n}]`);
    const upd=()=>{const u=q('unit').value;pn.querySelector('#basisTxt').innerHTML=u==='pc'?'Values <b>per piece</b>.':`Values <b>per 100 ${unitTxt(u)}</b>, as on the label. For rice and pasta, use the dry values.`;
      pn.querySelector('#packTxt').textContent='Pack size ('+unitTxt(u)+')';
      const k=nz(q('kcal').value),est=4*nz(q('p').value)+4*nz(q('c').value)+9*nz(q('f').value)+2*nz(q('fib').value);
      pn.querySelector('#chk').innerHTML=k>0&&est>0&&Math.abs(est-k)/k>0.15?`<div class="warnbox"><b>Check the numbers:</b> the macros add up to ${fmt(est)} kcal, but kcal says ${fmt(k)}.</div>`:'';};
    pn.querySelectorAll('input,select').forEach(el=>el.addEventListener('input',upd));upd();
    pn.querySelector('#go').onclick=()=>{const name=q('name').value.trim();if(!name){toast('Give the ingredient a name.');return;}
      const d={...(id?S.ingredients[id]:{}),name,unit:q('unit').value,store:q('store').value.trim(),cat:q('cat').value,edited:true};delete d.id;
      ['kcal','p','c','f','fib','sat','pack'].forEach(k=>{const v=num(q(k).value);d[k]=isFinite(v)?v:null;});
      put('ingredients',id||newId('ingredients'),d);closeSheet();};
    const del=pn.querySelector('#del');if(del)del.onclick=()=>{const used=Object.values(S.recipes).filter(r=>(r.items||[]).some(it=>it.ing===id)).map(r=>r.name);
      if(!confirm(used.length?`${ing.name} is used in: ${used.join(', ')}. Delete it anyway?`:`Delete ${ing.name}?`))return;markDeleted('ingredients',id);remove('ingredients',id);closeSheet();};
  });
}
function markDeleted(col,id){const del=clone((S.meta.library||{}).deleted||[]);if(!del.includes(col+'/'+id)){del.push(col+'/'+id);patch('meta','library',{deleted:del});}}
function ingOptions(ings,cur){
  const cats=[['product','Your products'],['veg','Vegetables'],['fruit','Fruit']];const catOf=i=>i.cat==='veg'||i.cat==='fruit'?i.cat:'product';
  return cats.map(([c,l])=>{const g=ings.filter(i=>catOf(i)===c);return g.length?`<optgroup label="${l}">${g.map(i=>`<option value="${i.id}" ${i.id===cur?'selected':''}>${esc(i.name)}</option>`).join('')}</optgroup>`:'';}).join('');
}
function editRecipe(id){
  const rec=id?S.recipes[id]:{name:'',items:[],steps:[],mode:'split'};let items=clone(rec.items||[]);
  const ings=Object.values(S.ingredients).sort(byName);if(!ings.length){toast('Add ingredients first.');return;}
  openSheet(`<h2>${id?'Edit recipe':'New recipe'}</h2><div class="stack">
  <label class="f">Name<input class="in" id="rn" value="${esc(rec.name)}" placeholder="Salmon and potatoes"></label>
  <div class="grid2"><label class="f">Cooking time (min)<input class="in" id="rt" inputmode="numeric" value="${esc(rec.time??'')}"></label>
  <label class="f">Usually cooked<select class="in" id="rm"><option value="split" ${rec.mode!=='mixed'?'selected':''}>Components separately</option><option value="mixed" ${rec.mode==='mixed'?'selected':''}>All in one pan</option></select></label></div>
  <h3>Ingredients</h3>
  <div class="note">Mark the main <b>protein, carb and fat sources</b>: the app works out their amounts for each person. Give everything else a <b>fixed amount</b>, usually for the whole batch (one tin, two onions). With two sources of the same kind, the % sets how much of that macro each provides.</div>
  <div id="rows"></div><button class="btn sm" id="add">+ Add ingredient</button>
  <h3>Method</h3><label class="f">One step per line<textarea class="in" id="rs" placeholder="Boil the rice 10–12 min.&#10;Sear the chicken in the oil, 6 min.">${esc((rec.steps||[]).join('\n'))}</textarea></label>
  <label class="f">Tip (optional)<input class="in" id="rnote" value="${esc(rec.note??'')}"></label></div>
  <div class="actions"><button class="btn primary" id="go">Save</button>${id?'<button class="btn danger" id="del">Delete</button>':''}<button class="btn" data-close>Cancel</button></div>`,pn=>{
    const rowsEl=pn.querySelector('#rows');
    const draw=()=>{const cnt={};items.forEach(it=>cnt[it.role]=(cnt[it.role]||0)+1);
      rowsEl.innerHTML=items.map((it,i)=>{const ing=S.ingredients[it.ing];const u=unitTxt(ing&&ing.unit);
        const third=it.role==='X'?`<div class="f"><label class="f">Amount (${u})<input class="in" data-i="${i}" data-fld="fixed" inputmode="decimal" value="${esc(it.fixed??'')}"></label><select class="in" data-i="${i}" data-fld="per" aria-label="Amount applies to"><option value="batch" ${it.per!=='box'?'selected':''}>whole batch</option><option value="box" ${it.per==='box'?'selected':''}>each box</option></select></div>`
          :cnt[it.role]>1?`<label class="f">% of ${ROLE[it.role].short}<input class="in" data-i="${i}" data-fld="w" inputmode="decimal" value="${esc(it.w??'')}"></label>`:`<span class="tiny muted" style="padding-bottom:12px">amount worked out</span>`;
        return `<div class="irow"><label class="f">Ingredient<select class="in" data-i="${i}" data-fld="ing">${ingOptions(ings,it.ing)}</select></label>
        <label class="f">Role<select class="in" data-i="${i}" data-fld="role">${Object.entries(ROLE).map(([k,r])=>`<option value="${k}" ${k===it.role?'selected':''}>${r.label}</option>`).join('')}</select></label>${third}
        <button class="btn icon rm" data-rm="${i}" aria-label="Remove">✕</button></div>`;}).join('')||'<p class="muted small">No ingredients yet.</p>';};
    draw();
    rowsEl.addEventListener('input',e=>{const el=e.target;if(!el.dataset.fld)return;const i=+el.dataset.i,fld=el.dataset.fld;
      if(fld==='fixed'||fld==='w'){const v=num(el.value);items[i][fld]=isFinite(v)?v:null;}});
    rowsEl.addEventListener('change',e=>{const el=e.target;if(!el.dataset.fld)return;const i=+el.dataset.i,fld=el.dataset.fld;
      if(fld==='per'){items[i].per=el.value;return;}
      if(fld==='ing'||fld==='role'){items[i][fld]=el.value;if(fld==='role'){if(el.value==='X'&&items[i].fixed==null){items[i].fixed=100;items[i].per='batch';}const same=items.filter(x=>x.role===el.value);same.forEach(x=>x.w=Math.round(100/same.length));}draw();}});
    rowsEl.addEventListener('click',e=>{const b=e.target.closest('[data-rm]');if(!b)return;items.splice(+b.dataset.rm,1);draw();});
    pn.querySelector('#add').onclick=()=>{items.push({ing:ings[0].id,role:'X',fixed:100,per:'batch'});draw();};
    pn.querySelector('#go').onclick=()=>{const name=pn.querySelector('#rn').value.trim();if(!name){toast('Give the recipe a name.');return;}
      if(!items.length){toast('Add at least one ingredient.');return;}
      if(!items.some(it=>it.role!=='X')){toast('Mark at least one ingredient as a protein, carb or fat source.');return;}
      const steps=pn.querySelector('#rs').value.split('\n').map(x=>x.trim()).filter(Boolean);
      const t=num(pn.querySelector('#rt').value);
      const nid=id||newId('recipes');
      const d={...(id?S.recipes[id]:{}),name,items,steps,time:isFinite(t)?t:null,mode:pn.querySelector('#rm').value,note:pn.querySelector('#rnote').value.trim(),edited:true};delete d.id;
      put('recipes',nid,d);
      closeSheet();S.ui.recipe=nid;render();};
    const del=pn.querySelector('#del');if(del)del.onclick=()=>{if(confirm(`Delete ${rec.name}? Sessions already planned keep their own copy.`)){markDeleted('recipes',id);remove('recipes',id);S.ui.recipe=null;closeSheet();render();}};
  });
}
function editMeal(id){
  const m=id?S.meals[id]:{name:'',items:[]};let items=clone(m.items||[]);
  const ings=Object.values(S.ingredients).sort(byName);if(!ings.length){toast('Add ingredients first.');return;}
  openSheet(`<h2>${id?'Edit breakfast':'New breakfast'}</h2><div class="stack">
  <label class="f">Name<input class="in" id="mn" value="${esc(m.name)}" placeholder="Eggs with spinach"></label>
  <div id="rows"></div><button class="btn sm" id="add">+ Add ingredient</button><div id="pv"></div></div>
  <div class="actions"><button class="btn primary" id="go">Save</button>${id?'<button class="btn danger" id="del">Delete</button>':''}<button class="btn" data-close>Cancel</button></div>`,pn=>{
    const rowsEl=pn.querySelector('#rows');
    const pv=()=>{pn.querySelector('#pv').innerHTML='<p class="small muted">One serving:</p>'+macroLine(mealNut({items}),{extra:true});};
    const draw=()=>{rowsEl.innerHTML=items.map((it,i)=>{const ing=S.ingredients[it.ing];return `<div class="irow" style="grid-template-columns:1fr 120px 38px"><label class="f">Ingredient<select class="in" data-i="${i}" data-fld="ing">${ingOptions(ings,it.ing)}</select></label>
      <label class="f">Amount (${unitTxt(ing&&ing.unit)})<input class="in" data-i="${i}" data-fld="amt" inputmode="decimal" value="${esc(it.amt??'')}"></label><button class="btn icon rm" data-rm="${i}" aria-label="Remove">✕</button></div>`;}).join('')||'<p class="muted small">No ingredients yet.</p>';pv();};
    draw();
    rowsEl.addEventListener('input',e=>{const el=e.target;if(el.dataset.fld==='amt'){items[+el.dataset.i].amt=nz(el.value);pv();}});
    rowsEl.addEventListener('change',e=>{const el=e.target;if(el.dataset.fld==='ing'){items[+el.dataset.i].ing=el.value;draw();}});
    rowsEl.addEventListener('click',e=>{const b=e.target.closest('[data-rm]');if(!b)return;items.splice(+b.dataset.rm,1);draw();});
    pn.querySelector('#add').onclick=()=>{items.push({ing:ings[0].id,amt:0});draw();};
    pn.querySelector('#go').onclick=()=>{const name=pn.querySelector('#mn').value.trim();if(!name){toast('Give the breakfast a name.');return;}
      put('meals',id||newId('meals'),{name,items,edited:true});closeSheet();};
    const del=pn.querySelector('#del');if(del)del.onclick=()=>{if(confirm(`Delete ${m.name}?`)){markDeleted('meals',id);remove('meals',id);closeSheet();}};
  });
}

/* ===================== DIARY ===================== */
function viewDiary(){
  const ppl=personList();if(!ppl.length)return `<div class="empty">Add a person under Profile first.</div>`;
  if(!S.ui.pid||!S.people[S.ui.pid])S.ui.pid=ppl[0].id;
  const p=S.people[S.ui.pid],date=S.ui.date,id=p.id+'_'+date,doc=S.logs[id]||{};
  const tot=dayTotals(p.id,date),t=targets(p);const entries=doc.entries||[];
  return seg('pickPerson',p.id,ppl.map(x=>[x.id,x.name]),'Person')+`
  <div class="weeknav"><button class="btn icon" data-act="day" data-d="-1" aria-label="Previous day">‹</button><strong>${date===today()?'Today':dayLabel(date)}</strong><button class="btn icon" data-act="day" data-d="1" aria-label="Next day">›</button></div>
  <h3>Morning weight</h3><div class="panel"><label class="f">kg, after waking, before eating<input class="in" inputmode="decimal" data-k="logw.${id}" data-ch="logw" value="${esc(doc.kg??'')}" placeholder="e.g. 74.6"></label>
  <p class="tiny muted">Daily readings bounce by up to 1 kg. Profile shows the smoothed trend.</p></div>
  <h3>Eaten</h3>
  <div class="list">${entries.length?entries.map((e,i)=>`<div class="item"><div class="grow"><div class="title">${esc(e.label)}</div>${macroLine(e.n||zeroN())}</div><button class="btn icon" data-act="rmEntry" data-i="${i}" aria-label="Remove">✕</button></div>`).join(''):`<div class="empty">Nothing logged for this day.</div>`}</div>
  <div class="grid2" style="margin-top:10px"><button class="btn" data-act="addBox">+ Prepped box</button><button class="btn" data-act="addMeal">+ Breakfast</button><button class="btn" data-act="addFood">+ Single ingredient</button><button class="btn" data-act="addOther">+ Something else</button></div>
  <h3>Day total</h3>
  <div class="panel">${t.ok?`<div class="bars">
    ${bar('Calories',tot.kcal,t.kcal,'var(--kcal)','kcal')}${bar('Protein',tot.p,t.P,'var(--prot)')}${bar('Carbs',tot.c,t.C,'var(--carb)')}${bar('Fat',tot.f,t.F,'var(--fat)')}${bar('Fibre',tot.fib,t.fib,'var(--muted)')}${bar('Sat. fat',tot.sat,t.satMax,'var(--muted)','g','max')}
  </div>`:`${macroLine(tot,{extra:true})}<p class="small muted">Complete ${esc(p.name)}'s profile to see targets.</p>`}
  <label style="display:flex;gap:10px;align-items:center;margin-top:14px"><input type="checkbox" class="check" data-ch="full" ${doc.full?'checked':''}> Everything eaten today is logged</label>
  <p class="tiny muted">Tick this on complete days. After 7 of them, Profile can measure your real maintenance calories.</p></div>`;
}
function saveEntries(entries){const p=S.ui.pid,d=S.ui.date;patch('logs',p+'_'+d,{pid:p,date:d,entries});}
function curEntries(){const l=S.logs[S.ui.pid+'_'+S.ui.date];return clone(l&&l.entries||[]);}
const roundN=n=>{const r={};NK.forEach(k=>r[k]=Math.round((n[k]||0)*10)/10);return r;};
function addFoodSheet(){
  const ings=Object.values(S.ingredients).sort(byName);if(!ings.length){toast('Add ingredients first.');return;}
  openSheet(`<h2>Add a single ingredient</h2><div class="stack"><label class="f">Ingredient<select class="in" name="ing">${ingOptions(ings)}</select></label>
  <label class="f"><span id="au">Amount</span><input class="in" name="amt" inputmode="decimal"></label><div id="pv"></div></div>
  <div class="actions"><button class="btn primary" id="go">Add</button><button class="btn" data-close>Cancel</button></div>`,pn=>{
    const upd=()=>{const ing=S.ingredients[pn.querySelector('[name=ing]').value];pn.querySelector('#au').textContent='Amount ('+unitTxt(ing.unit)+')';pn.querySelector('#pv').innerHTML=macroLine(nutOf(ing,nz(pn.querySelector('[name=amt]').value)),{extra:true});};
    pn.querySelector('[name=ing]').onchange=upd;pn.querySelector('[name=amt]').oninput=upd;upd();
    pn.querySelector('#go').onclick=()=>{const ing=S.ingredients[pn.querySelector('[name=ing]').value];const a=nz(pn.querySelector('[name=amt]').value);if(a<=0){toast('Enter an amount.');return;}
      const e=curEntries();e.push({label:`${ing.name}, ${amt(ing,a)}`,n:roundN(nutOf(ing,a))});saveEntries(e);closeSheet();};
  });
}
function addMealSheet(){
  const meals=Object.values(S.meals).sort(byName);if(!meals.length){toast('Save a breakfast under Recipes first.');return;}
  openSheet(`<h2>Add a breakfast</h2><div class="stack"><label class="f">Breakfast<select class="in" name="m">${meals.map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></label>
  <label class="f">Servings<input class="in" name="sv" inputmode="decimal" value="1"></label><div id="pv"></div></div>
  <div class="actions"><button class="btn primary" id="go">Add</button><button class="btn" data-close>Cancel</button></div>`,pn=>{
    const upd=()=>{pn.querySelector('#pv').innerHTML=macroLine(mealNut(S.meals[pn.querySelector('[name=m]').value],nz(pn.querySelector('[name=sv]').value)),{extra:true});};
    pn.querySelector('[name=m]').onchange=upd;pn.querySelector('[name=sv]').oninput=upd;upd();
    pn.querySelector('#go').onclick=()=>{const m=S.meals[pn.querySelector('[name=m]').value];const sv=nz(pn.querySelector('[name=sv]').value)||1;
      const e=curEntries();e.push({label:m.name+(sv!==1?` × ${fmt(sv,sv%1?1:0)}`:''),n:roundN(mealNut(m,sv))});saveEntries(e);closeSheet();};
  });
}
function addBoxSheet(){
  const pid=S.ui.pid,from=addDays(S.ui.date,-10);
  const ss=Object.values(S.sessions).filter(s=>s.date>=from&&s.date<=S.ui.date&&s.people&&s.people[pid]&&nz(s.people[pid].boxes)>0).sort((a,b)=>a.date<b.date?1:-1);
  if(!ss.length){toast('No sessions with boxes for '+S.people[pid].name+' in the last 10 days.');return;}
  openSheet(`<h2>Add a prepped box</h2><div class="stack"><label class="f">Box from<select class="in" name="s">${ss.map(s=>`<option value="${s.id}">${esc(s.name)}, cooked ${dayLabel(s.date)}</option>`).join('')}</select></label>
  <label class="f">Boxes eaten<input class="in" name="n" inputmode="decimal" value="1"></label><div id="pv"></div></div>
  <div class="actions"><button class="btn primary" id="go">Add</button><button class="btn" data-close>Cancel</button></div>`,pn=>{
    const get=()=>{const n=sessionBoxNut(S.sessions[pn.querySelector('[name=s]').value],pid)||zeroN();const k=nz(pn.querySelector('[name=n]').value)||1;const r=zeroN();addN(r,n,k);return r;};
    const upd=()=>{pn.querySelector('#pv').innerHTML=macroLine(get(),{extra:true});};
    pn.querySelector('[name=s]').onchange=upd;pn.querySelector('[name=n]').oninput=upd;upd();
    pn.querySelector('#go').onclick=()=>{const s=S.sessions[pn.querySelector('[name=s]').value];const k=nz(pn.querySelector('[name=n]').value)||1;
      const e=curEntries();e.push({label:`Box: ${s.name}${k!==1?' × '+fmt(k,k%1?1:0):''}`,n:roundN(get())});saveEntries(e);closeSheet();};
  });
}
function addOtherSheet(){
  openSheet(`<h2>Add something else</h2><p class="small muted">For a meal out or anything not in your library. Estimates are fine.</p><div class="stack">
  <label class="f">What<input class="in" name="l" placeholder="Lunch at work"></label>
  <div class="grid3"><label class="f">kcal<input class="in" name="kcal" inputmode="decimal"></label><label class="f"><span class="mp">Protein g</span><input class="in" name="p" inputmode="decimal"></label><label class="f"><span class="mc">Carbs g</span><input class="in" name="c" inputmode="decimal"></label>
  <label class="f"><span class="mf">Fat g</span><input class="in" name="f" inputmode="decimal"></label><label class="f">Fibre g<input class="in" name="fib" inputmode="decimal"></label><label class="f">Sat. fat g<input class="in" name="sat" inputmode="decimal"></label></div></div>
  <div class="actions"><button class="btn primary" id="go">Add</button><button class="btn" data-close>Cancel</button></div>`,pn=>{
    pn.querySelector('#go').onclick=()=>{const n={};NK.forEach(k=>n[k]=nz(pn.querySelector(`[name=${k}]`).value));if(!n.kcal)n.kcal=4*n.p+4*n.c+9*n.f+2*n.fib;
      const e=curEntries();e.push({label:pn.querySelector('[name=l]').value||'Other',n:roundN(n)});saveEntries(e);closeSheet();};
  });
}

/* ===================== SHOPPING ===================== */
function viewShop(){
  const w=S.ui.shopWeek,end=addDays(w,6),doc=S.shop[w]||{};const checked=doc.checked||{};
  const agg={};const add=(ingId,a)=>{if(!ingId||!(a>0))return;agg[ingId]=(agg[ingId]||0)+a;};
  const ss=Object.values(S.sessions).filter(s=>s.date>=w&&s.date<=end);
  ss.forEach(s=>{const pl=planSession(s);pl.items.forEach((it,i)=>add(it.ing,pl.totals[i]));});
  (doc.meals||[]).forEach(m=>{const meal=S.meals[m.meal];if(meal)(meal.items||[]).forEach(it=>add(it.ing,nz(it.amt)*nz(m.count)));});
  const byStore={};Object.entries(agg).forEach(([id,a])=>{const ing=S.ingredients[id];if(!ing)return;const st=(ing.store||'').trim()||'Any shop';(byStore[st]=byStore[st]||[]).push({id,ing,a});});
  const stores=Object.keys(byStore).sort((a,b)=>a==='Any shop'?1:b==='Any shop'?-1:a.localeCompare(b));
  const meals=Object.values(S.meals).sort(byName);
  return sub('Adds up every cooking session this week plus the breakfasts you plan. Amounts are raw, before cooking.')+`
  <div class="weeknav"><button class="btn icon" data-act="shopWeek" data-d="-7" aria-label="Previous week">‹</button><strong>Week of ${dayLabel(w)}</strong><button class="btn icon" data-act="shopWeek" data-d="7" aria-label="Next week">›</button></div>
  <h2>To buy</h2><p class="small muted" style="margin-top:-4px">From ${ss.length} cooking session${ss.length===1?'':'s'}${(doc.meals||[]).length?' and '+doc.meals.length+' breakfast'+(doc.meals.length>1?'s':''):''}.</p>
  ${stores.length?stores.map(st=>`<h3>${esc(st)}</h3><div class="list">${byStore[st].sort((a,b)=>byName(a.ing,b.ing)).map(r=>{const pk=nz(r.ing.pack);const packs=pk>0?Math.ceil(r.a/pk-1e-6):null;
    return `<label class="item ${checked[r.id]?'done':''}" style="cursor:pointer"><input type="checkbox" class="check" data-ch="shopCheck" data-id="${r.id}" ${checked[r.id]?'checked':''}><div class="grow"><div class="title">${esc(r.ing.name)}</div><div class="small muted">${amt(r.ing,r.a)}${packs?` · ${packs} × ${amt(r.ing,pk)} pack${packs>1?'s':''}`:''}</div></div></label>`;}).join('')}</div>`).join(''):`<div class="empty">Nothing to buy yet. Plan cooking sessions for this week, or add breakfasts below.</div>`}
  <h2>Breakfasts this week</h2>
  <div class="list">${(doc.meals||[]).length?(doc.meals||[]).map((m,i)=>`<div class="item"><div class="grow"><div class="title">${esc((S.meals[m.meal]||{}).name||'(deleted)')}</div></div><label class="f" style="width:110px">Servings<input class="in" inputmode="numeric" data-k="shopMeal.${w}.${i}" data-ch="shopMeal" data-i="${i}" value="${esc(m.count)}"></label><button class="btn icon" data-act="rmShopMeal" data-i="${i}" aria-label="Remove">✕</button></div>`).join(''):`<div class="empty">Add the breakfasts you plan, with total servings for both of you.</div>`}</div>
  ${meals.length?`<div class="actions"><select class="in" id="shopMealPick" style="max-width:260px">${meals.map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select><button class="btn" data-act="addShopMeal">Add</button></div>`:''}`;
}

/* ===================== PROFILE ===================== */
function spark(tr){
  const pts=tr.series.slice(-60);if(pts.length<2)return '';
  const ema=tr.pts.slice(-60);const ys=pts.map(p=>p.kg).concat(ema.map(p=>p.v));const lo=Math.min(...ys)-0.3,hi=Math.max(...ys)+0.3;
  const d0=pts[0].date,span=Math.max(1,daysBetween(d0,pts[pts.length-1].date));
  const X=d=>6+daysBetween(d0,d)/span*288,Y=v=>64-(v-lo)/(hi-lo)*58;
  return `<svg class="spark" viewBox="0 0 300 70" role="img" aria-label="Weight over the last ${pts.length} weigh-ins">${pts.map(p=>`<circle cx="${X(p.date).toFixed(1)}" cy="${Y(p.kg).toFixed(1)}" r="2.2" fill="var(--muted)" opacity=".55"/>`).join('')}
  <polyline fill="none" stroke="var(--accent)" stroke-width="2.2" points="${ema.map(p=>X(p.date).toFixed(1)+','+Y(p.v).toFixed(1)).join(' ')}"/></svg>
  <div class="tiny muted" style="display:flex;justify-content:space-between"><span>${dayLabel(d0)}</span><span>dots: daily weight · line: trend</span></div>`;
}
function viewProfile(){
  const t=S.ui.prof;let body='';
  if(t==='people')body=viewPeople();
  if(t==='pans'){const l=Object.values(S.utensils).sort(byName);
    body=sub('Weigh each empty pan or pot once (with the lid, if you weigh it with the lid). Used in step 4 of a cooking session.')+`<div class="list">${l.length?l.map(u=>`<button class="item tap" data-act="editUt" data-id="${u.id}"><div class="grow"><div class="title">${esc(u.name)}</div></div><b>${fmt(nz(u.tare))} g</b><span class="chev">›</span></button>`).join(''):`<div class="empty">No pans yet.</div>`}</div><div class="actions"><button class="btn primary" data-act="editUt">+ Add pan</button></div>`;}
  if(t==='app')body=viewApp();
  return seg('prof',t,[['people','Targets & progress'],['pans','Pans'],['app','App & data']],'Profile section')+`<div style="margin-top:12px">${body}</div>`;
}
function viewPeople(){
  const ppl=personList();
  return (ppl.length?ppl.map(p=>{
    const t=targets(p),c=coaching(p),bd=boxDefaults(p),tw=S.logs[p.id+'_'+today()];
    return `<div class="panel" style="margin-bottom:12px"><div class="topbar"><h2 style="margin:0">${esc(p.name)}</h2><button class="btn sm" data-act="editPerson" data-id="${p.id}">Edit</button></div>
    <div class="grid2" style="margin-top:10px"><label class="f">Today's weight (kg)<input class="in" inputmode="decimal" data-k="pw.${p.id}" data-ch="pw" data-pid="${p.id}" value="${esc(tw&&tw.kg||'')}"></label>
    <div class="small" style="align-self:end">${t.tr&&t.tr.n?`Trend <b>${fmt(t.tr.trendKg,1)} kg</b>${t.tr.perWeek!=null?`<br>${t.tr.perWeek>=0?'+':''}${fmt(t.tr.perWeek,2)} kg per week`:'<br><span class="muted">rate after 2 weeks of weigh-ins</span>'}`:'<span class="muted">No weigh-ins yet</span>'}</div></div>
    ${t.tr&&t.tr.n>1?spark(t.tr):''}
    ${t.ok?`<h3>Daily target: ${fmt(Math.round(t.kcal/10)*10)} kcal</h3>
      <div class="macros"><span class="mp">Protein <b>${fmt(t.P)}</b> g</span><span class="mc">Carbs <b>${fmt(t.C)}</b> g</span><span class="mf">Fat <b>${fmt(t.F)}</b> g</span><span class="muted">Fibre ≥ 30 g</span><span class="muted">Sat. fat ≤ ${fmt(t.satMax)} g</span></div>
      <p class="small">Each prepped box: <b>${fmt(bd.kcal)} kcal</b>, <span class="mp">${bd.p} g protein</span>, <span class="mf">${bd.f} g fat</span> <span class="muted">(${nz(p.prepMeals)||2} boxes a day; ${fmt(nz(p.other))} kcal left for breakfast and snacks)</span></p>
      <p class="tiny muted">How: resting ${fmt(t.bmr)} kcal (Mifflin–St Jeor) × activity ${nz(p.pal)||1.55} = maintenance ${fmt(t.tdee)} kcal; goal ${t.offset>=0?'+':''}${fmt(t.offset)} kcal${nz(p.adj)?`; your adjustment ${nz(p.adj)>0?'+':''}${fmt(nz(p.adj))} kcal`:''}.</p>
      ${c?`<div class="note"><b>Weekly check.</b> Target ${c.target>=0?'+':''}${fmt(c.target,2)} kg/week, measured ${c.obs>=0?'+':''}${fmt(c.obs,2)} kg/week.
        ${Math.abs(c.sug)>=75?` Suggested change: <b>${c.sug>0?'+':''}${c.sug} kcal a day</b>. <button class="btn sm" data-act="applyAdj" data-id="${p.id}" data-v="${c.sug}">Apply</button>`:' On track, no change needed.'}
        ${c.recentChange?'<br><span class="muted">You changed calories less than 2 weeks ago; part of this data is from before.</span>':''}
        ${c.maint!=null?`<br>Measured maintenance from ${c.fullDays} fully logged days: <b>${fmt(Math.round(c.maint/10)*10)} kcal</b> (formula: ${fmt(t.tdee)}).`:''}</div>`:`<p class="tiny muted">After 2 weeks of weigh-ins (at least 8), this suggests calorie adjustments from your real weight trend.</p>`}`
      :`<p class="muted" style="margin-top:10px">Add ${t.missing.join(', ')} to calculate targets.</p>`}
    </div>`;}).join(''):`<div class="empty">Add yourself and anyone you cook for.</div>`)+`<div class="actions"><button class="btn" data-act="editPerson">+ Add person</button></div>`;
}
function viewApp(){
  const lib=S.meta.library||{};
  return `<div class="panel"><h3 style="margin-top:0">Account</h3><p class="small">Signed in as <b>${esc(S.user&&S.user.email||'')}</b></p><button class="btn sm" data-act="signOut">Sign out</button></div>
  <div class="panel"><h3 style="margin-top:0">Updates</h3><p class="small">App version <b>${esc(APP_VERSION)}</b> · ingredient &amp; recipe library v${fmt(nz(lib.version))}</p>
  <p class="tiny muted">New versions install themselves when you open the app. Library updates add new ingredients and recipes but never overwrite ones you edited.</p>
  <button class="btn sm" data-act="checkUpdate">Check now</button></div>
  <div class="panel"><h3 style="margin-top:0">Backup</h3><p class="small muted">Download everything as a file, or restore from one. Importing adds and replaces items; it never deletes.</p>
  <div class="actions"><button class="btn sm" data-act="exportData">Download backup</button><button class="btn sm" data-act="importData">Import backup</button><input type="file" id="importFile" accept="application/json,.json" hidden></div></div>`;
}
function editPerson(id){
  const p=id?S.people[id]:{sex:'m',pal:1.55,goal:'maintain',rate:0.5,pkg:2,fkg:0.8,prepMeals:2,other:500,adj:0};
  const o=(v,l,cur)=>`<option value="${v}" ${String(cur)===String(v)?'selected':''}>${l}</option>`;
  const f=(k,l,ph='')=>`<label class="f">${l}<input class="in" name="${k}" inputmode="decimal" value="${esc(p[k]??'')}" placeholder="${ph}"></label>`;
  openSheet(`<h2>${id?'Edit '+esc(p.name):'New person'}</h2><div class="stack">
  <h3>About</h3>
  <div class="grid2"><label class="f">Name<input class="in" name="name" value="${esc(p.name??'')}"></label><label class="f">Sex (for the formula)<select class="in" name="sex">${o('m','Male',p.sex)}${o('f','Female',p.sex)}</select></label></div>
  <div class="grid3"><label class="f">Birth date<input class="in" type="date" name="birth" value="${esc(p.birth??'')}"></label>${f('height','Height (cm)')}${f('startKg','Weight (kg)','until weigh-ins exist')}</div>
  <label class="f">Activity<select class="in" name="pal">${PAL.map(([v,l])=>o(v,l,p.pal)).join('')}</select></label>
  <h3>Goal</h3>
  <div class="grid2"><label class="f">Goal<select class="in" name="goal">${o('cut','Cut (lose fat)',p.goal)}${o('maintain','Maintain',p.goal)}${o('bulk','Bulk (gain muscle)',p.goal)}</select></label>${f('rate','Rate (% bodyweight per week)','cut 0.5–1, bulk 0.25–0.5')}</div>
  <div class="grid2">${f('pkg','Protein (g per kg)','1.6–2.2; up to 2.4 on a cut')}${f('fkg','Fat (g per kg)','0.7–1.0')}</div>
  <h3>How you eat</h3>
  <div class="grid3">${f('prepMeals','Prepped boxes a day')}${f('other','kcal for breakfast & snacks')}${f('adj','Manual adjustment (kcal)')}</div></div>
  <div class="actions"><button class="btn primary" id="go">Save</button>${id?'<button class="btn danger" id="del">Delete</button>':''}<button class="btn" data-close>Cancel</button></div>`,pn=>{
    const q=n=>pn.querySelector(`[name=${n}]`);
    pn.querySelector('#go').onclick=()=>{const name=q('name').value.trim();if(!name){toast('Enter a name.');return;}
      const d={...(id?S.people[id]:{}),name,sex:q('sex').value,birth:q('birth').value||null,goal:q('goal').value,pal:num(q('pal').value)};
      delete d.id;['height','startKg','rate','pkg','fkg','prepMeals','other','adj'].forEach(k=>{const v=num(q(k).value);d[k]=isFinite(v)?v:null;});
      if(id&&nz(d.adj)!==nz(p.adj))d.adjDate=today();
      put('people',id||newId('people'),d);closeSheet();};
    const del=pn.querySelector('#del');if(del)del.onclick=()=>{if(confirm(`Delete ${p.name}? Their diary stays stored.`)){remove('people',id);closeSheet();}};
  });
}
function editUtensil(id){
  const u=id?S.utensils[id]:{};
  openSheet(`<h2>${id?'Edit pan':'New pan'}</h2><div class="stack">
  <label class="f">Name<input class="in" id="un" value="${esc(u.name??'')}" placeholder="Large frying pan"></label>
  <label class="f">Empty weight (g)<input class="in" id="ut" inputmode="decimal" value="${esc(u.tare??'')}"></label></div>
  <div class="actions"><button class="btn primary" id="go">Save</button>${id?'<button class="btn danger" id="del">Delete</button>':''}<button class="btn" data-close>Cancel</button></div>`,pn=>{
    pn.querySelector('#go').onclick=()=>{const name=pn.querySelector('#un').value.trim(),tare=num(pn.querySelector('#ut').value);if(!name||!isFinite(tare)){toast('Enter a name and a weight.');return;}
      put('utensils',id||newId('utensils'),{name,tare});closeSheet();};
    const del=pn.querySelector('#del');if(del)del.onclick=()=>{if(confirm(`Delete ${u.name}?`)){remove('utensils',id);closeSheet();}};
  });
}

/* ===================== backup ===================== */
function exportData(){
  const out={app:'prep-portion',exported:new Date().toISOString(),collections:{}};
  COLS.forEach(c=>{out.collections[c]={};Object.values(S[c]).forEach(d=>{const x={...d};delete x.id;out.collections[c][d.id]=x;});});
  const blob=new Blob([JSON.stringify(out,null,1)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='prep-portion-backup-'+today()+'.json';document.body.appendChild(a);a.click();a.remove();
}
async function importFile(file){
  let data;try{data=JSON.parse(await file.text());}catch(e){toast('That file is not a valid backup.');return;}
  const cols=data&&data.collections;if(!cols){toast('That file is not a Prep & Portion backup.');return;}
  let n=0;Object.entries(cols).forEach(([c,docs])=>{if(!COLS.includes(c)||c==='meta')return;Object.entries(docs||{}).forEach(([id,d])=>{put(c,id,d);n++;});});
  toast('Imported '+n+' items.');
}

/* ===================== library sync ===================== */
let libSyncing=false;
async function syncLibrary(force){
  if(libSyncing)return;libSyncing=true;
  try{
    const res=await fetch('library.json',{cache:'no-cache'});if(!res.ok)return;const lib=await res.json();
    const meta=S.meta.library||{};if(!force&&nz(meta.version)>=lib.version)return;
    const skip=new Set(meta.deleted||[]);let n=0;
    ['ingredients','recipes','meals'].forEach(c=>Object.entries(lib[c]||{}).forEach(([id,d])=>{
      if(skip.has(c+'/'+id))return;const ex=S[c][id];if(ex&&ex.edited)return;
      put(c,id,{...d,lib:true});n++;}));
    patch('meta','library',{version:lib.version});
    if(n&&meta.version)toast('Library updated: '+n+' new or changed items.');
  }catch(e){}finally{libSyncing=false;}
}

/* ===================== auto update ===================== */
async function checkForUpdate(manual){
  try{
    const r=await fetch('version.json?t='+Date.now(),{cache:'no-store'});if(!r.ok)return;
    const v=(await r.json()).v;
    if(v&&v!==APP_VERSION&&APP_VERSION!=='dev'){
      const busy=!$('#sheet').hidden||(document.activeElement&&/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName));
      if(busy&&!manual){checkForUpdate._pending=true;return;}
      if(navigator.serviceWorker&&navigator.serviceWorker.controller){try{const reg=await navigator.serviceWorker.getRegistration();if(reg)await reg.update();}catch(e){}}
      location.reload();
    }else if(manual)toast('You have the latest version.');
  }catch(e){if(manual)toast('Could not check: offline?');}
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){checkForUpdate();if(S.db)syncLibrary();}});
setInterval(()=>checkForUpdate(),30*60*1000);

/* ===================== sheet ===================== */
function openSheet(html,mount){const pn=$('#sheetPanel');pn.innerHTML=html;$('#sheet').hidden=false;mount&&mount(pn);const first=pn.querySelector('input,select');if(first&&window.matchMedia&&window.matchMedia('(pointer:fine)').matches)first.focus();}
function closeSheet(){$('#sheet').hidden=true;$('#sheetPanel').innerHTML='';if(checkForUpdate._pending){checkForUpdate._pending=false;checkForUpdate();}}
$('#sheet').addEventListener('click',e=>{if(e.target.id==='sheet'||e.target.closest('[data-close]'))closeSheet();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#sheet').hidden)closeSheet();});

/* ===================== events ===================== */
$('#tabs').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(!b)return;
  if(S.tab===b.dataset.tab){S.ui.session=null;S.ui.recipe=null;}
  S.tab=b.dataset.tab;render();window.scrollTo(0,0);});
$('#view').addEventListener('click',e=>{
  const b=e.target.closest('[data-act]');if(!b||!S.db)return;const a=b.dataset.act;
  const sess=S.ui.session&&S.sessions[S.ui.session];
  const top=()=>{render();window.scrollTo(0,0);};
  switch(a){
    case 'week':S.ui.week=addDays(S.ui.week,+b.dataset.d);render();break;
    case 'shopWeek':S.ui.shopWeek=addDays(S.ui.shopWeek,+b.dataset.d);render();break;
    case 'day':S.ui.date=addDays(S.ui.date,+b.dataset.d);render();break;
    case 'openSession':S.ui.session=b.dataset.id;S.ui.step=1;top();break;
    case 'closeSession':S.ui.session=null;top();break;
    case 'step':S.ui.step=+b.dataset.v;top();break;
    case 'newSession':newSessionSheet(b.dataset.id);break;
    case 'delSession':if(sess&&confirm(`Delete this session (${sess.name}, ${dayLabel(sess.date)})?`)){remove('sessions',sess.id);S.ui.session=null;render();}break;
    case 'syncRecipe':if(sess){const r=S.recipes[sess.recipe];patch('sessions',sess.id,{items:clone(r.items||[]),actual:{},pan:{}});}break;
    case 'resetTargets':if(sess){patch('sessions',sess.id,{people:{[b.dataset.pid]:boxDefaults(S.people[b.dataset.pid])}});}break;
    case 'rlib':S.ui.rlib=b.dataset.v;render();break;
    case 'openRecipe':S.ui.recipe=b.dataset.id;top();break;
    case 'closeRecipe':S.ui.recipe=null;top();break;
    case 'prof':S.ui.prof=b.dataset.v;render();break;
    case 'pickPerson':S.ui.pid=b.dataset.v;render();break;
    case 'rmEntry':{const en=curEntries();en.splice(+b.dataset.i,1);saveEntries(en);break;}
    case 'addFood':addFoodSheet();break;
    case 'addMeal':addMealSheet();break;
    case 'addBox':addBoxSheet();break;
    case 'addOther':addOtherSheet();break;
    case 'editIng':editIngredient(b.dataset.id);break;
    case 'editRec':editRecipe(b.dataset.id);break;
    case 'editMeal':editMeal(b.dataset.id);break;
    case 'editUt':editUtensil(b.dataset.id);break;
    case 'editPerson':editPerson(b.dataset.id);break;
    case 'applyAdj':{const p=S.people[b.dataset.id];patch('people',p.id,{adj:nz(p.adj)+(+b.dataset.v),adjDate:today()});toast('Daily target changed by '+b.dataset.v+' kcal.');break;}
    case 'addShopMeal':{const w=S.ui.shopWeek,d=S.shop[w]||{};const m=clone(d.meals||[]);m.push({meal:$('#shopMealPick').value,count:7});patch('shop',w,{meals:m});break;}
    case 'rmShopMeal':{const w=S.ui.shopWeek,m=clone((S.shop[w]||{}).meals||[]);m.splice(+b.dataset.i,1);patch('shop',w,{meals:m});break;}
    case 'signOut':if(confirm('Sign out on this device?'))window.PPBackend.signOut();break;
    case 'checkUpdate':checkForUpdate(true);syncLibrary(true);break;
    case 'exportData':exportData();break;
    case 'importData':{const fi=$('#importFile');fi.onchange=()=>{if(fi.files[0])importFile(fi.files[0]);fi.value='';};fi.click();break;}
  }
});
$('#view').addEventListener('input',e=>{const el=e.target;if(el.dataset.ch==='ingq'){S.ui.q=el.value;render();}});
$('#view').addEventListener('change',e=>{
  const el=e.target,ch=el.dataset.ch;if(!ch||ch==='ingq')return;
  if(ch==='sess'){const s=S.sessions[S.ui.session];if(!s)return;const path=el.dataset.path;let v=el.value;
    if(el.tagName!=='SELECT'&&el.type!=='date'){const n=num(v);v=isFinite(n)?n:null;}
    if(path==='date'&&v)S.ui.week=monday(v);
    patch('sessions',s.id,setPath(path,v));}
  else if(ch==='logw'){const v=num(el.value);patch('logs',S.ui.pid+'_'+S.ui.date,{pid:S.ui.pid,date:S.ui.date,kg:isFinite(v)?v:null});}
  else if(ch==='pw'){const v=num(el.value),pid=el.dataset.pid;patch('logs',pid+'_'+today(),{pid,date:today(),kg:isFinite(v)?v:null});}
  else if(ch==='full'){patch('logs',S.ui.pid+'_'+S.ui.date,{pid:S.ui.pid,date:S.ui.date,full:el.checked});}
  else if(ch==='shopCheck'){const w=S.ui.shopWeek;patch('shop',w,{checked:{[el.dataset.id]:el.checked}});}
  else if(ch==='shopMeal'){const w=S.ui.shopWeek,m=clone((S.shop[w]||{}).meals||[]);m[+el.dataset.i]={...m[+el.dataset.i],count:nz(el.value)};patch('shop',w,{meals:m});}
});

/* ===================== sign-in & boot ===================== */
function viewLogin(msg){
  $('nav.tabs').hidden=true;$('#title').textContent='Prep & Portion';$('#sync').textContent='';
  $('#view').innerHTML=`<div class="login panel"><h2 style="margin-top:0">Sign in</h2><p class="small muted">Use the account set up for you in Firebase.</p>
  <form id="lf" class="stack"><label class="f">Email<input class="in" type="email" name="e" autocomplete="username" required></label>
  <label class="f">Password<input class="in" type="password" name="p" autocomplete="current-password" required></label>
  ${msg?`<div class="warnbox">${esc(msg)}</div>`:''}<button class="btn primary block" type="submit">Sign in</button><button class="btn block" type="button" id="fp">Forgot password</button></form></div>`;
  $('#lf').onsubmit=async ev=>{ev.preventDefault();const f=ev.target;
    try{await window.PPBackend.signIn(f.e.value.trim(),f.p.value);}catch(e){viewLogin((e.code||'').includes('invalid')||(e.code||'').includes('wrong')?'Wrong email or password.':'Could not sign in ('+(e.code||e.message)+').');}};
  $('#fp').onclick=async()=>{const e=$('#lf').e.value.trim();if(!e){toast('Enter your email first.');return;}try{await window.PPBackend.resetPassword(e);toast('Reset link sent to '+e);}catch(x){toast('Could not send the reset link.');}};
}
let unsubs=[];
function startData(){
  const be=window.PPBackend;S.db=be.db;$('nav.tabs').hidden=false;render();
  unsubs.forEach(u=>u&&u());unsubs=[];
  COLS.forEach(c=>{unsubs.push(be.db.collection(c).onSnapshot(snap=>{const o={};snap.docs.forEach(d=>{o[d.id]={...d.data(),id:d.id};});S[c]=o;S.loaded[c]=true;if(!snap.metadata.fromCache)S.server[c]=true;
      const all=COLS.every(k=>S.loaded[k]);
      $('#sync').textContent=snap.metadata.hasPendingWrites?'Saving…':(!navigator.onLine?'Offline – saved on this device':(all?'Synced':'Loading…'));
      if(['ingredients','recipes','meals','meta'].every(k=>S.server[k]))syncLibrary();
      scheduleRender();},
    err=>{$('#sync').textContent='Sync stopped';if((err.code||'').includes('permission'))viewLogin('This account is not allowed to use the app. Ask Yash to add it to the allow-list.');else toast('Sync stopped ('+err.code+'). Reopen the app.');}));});
}
function boot(){
  const be=window.PPBackend;
  if(!be)return;
  if(be.missingConfig){$('#view').innerHTML=`<div class="panel"><h2 style="margin-top:0">Almost there</h2><p>The app is installed but not yet connected to its database. Add the Firebase settings to <code>firebase-config.js</code>.</p></div>`;return;}
  if(be.loadError){$('#view').innerHTML=`<div class="panel"><h2 style="margin-top:0">Can't start</h2><p>The app could not load its sync library. Check your connection and reopen it.</p><p class="tiny muted">${esc(be.loadError)}</p></div>`;return;}
  be.onAuth(u=>{S.user=u;if(u)startData();else{unsubs.forEach(x=>x&&x());unsubs=[];S.db=null;viewLogin();}});
}
addEventListener('online',()=>{$('#sync').textContent='Synced';});
addEventListener('offline',()=>{$('#sync').textContent='Offline – saved on this device';});
if(window.PPBackend)boot();else window.addEventListener('pp-backend',boot,{once:true});
checkForUpdate();
