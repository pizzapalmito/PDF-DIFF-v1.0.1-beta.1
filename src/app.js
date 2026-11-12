import './style.css';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/manrope';
import {createIcons, Layers, Zap, Files, Cloud, MousePointer2, Plus, Minus, Maximize, ChevronDown, ChevronLeft, ChevronRight, ArrowRight, Upload, Download, SlidersHorizontal, Search, Check, X, Trash2, MessageSquare, CircleHelp, PanelLeftClose, RotateCcw, GitCompareArrows, ListChecks, Plug, Lightbulb, Settings2, FileText, ShieldCheck, Move, Save, FolderOpen, ClipboardList, CheckCheck} from 'lucide';
import {loadPdf,renderPage,saveFile,exportReviewed,paintComparison,buildReviewDocuments} from './pdf.js';
import {createImpactState,serializeReview,parseReview} from './impact.js';
import {createDemo} from './demo.js';
import {comparePixels,cloudPath,normalizeRect,DEVICE_TYPES,csvCell} from './core.js';

const iconSet={Layers,Zap,Files,Cloud,MousePointer2,Plus,Minus,Maximize,ChevronDown,ChevronLeft,ChevronRight,ArrowRight,Upload,Download,SlidersHorizontal,Search,Check,X,Trash2,MessageSquare,CircleHelp,PanelLeftClose,RotateCcw,GitCompareArrows,ListChecks,Plug,Lightbulb,Settings2,FileText,ShieldCheck,Move,Save,FolderOpen,ClipboardList,CheckCheck};
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const icon=n=>`<i data-lucide="${n}"></i>`;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={old:null,new:null,page:1,mode:'overlay',tool:'select',zoom:1,opacity:50,threshold:55,annotations:[],impact:createImpactState(),suggestions:[],selected:null,tab:'changes',filter:'all',device:'receptacle',canvases:null,busy:false,demo:true,showClouds:true,view:'compare',nextId:1,renderId:0,loaded:false};
let history=[],drag=null,toastTimer;
const current=()=>state.annotations.filter(a=>a.page===state.page);
function icons(){createIcons({icons:iconSet,attrs:{'stroke-width':1.7}});}
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),4200);}
function reviewSnapshot(){return structuredClone({annotations:state.annotations,impact:state.impact,nextId:state.nextId});}
function restoreSnapshot(snapshot){state.annotations=snapshot.annotations;state.impact=snapshot.impact;state.nextId=Math.max(state.nextId,snapshot.nextId||1,...snapshot.annotations.map(annotation=>annotation.id+1));}
function checkpoint(){history.push(reviewSnapshot());if(history.length>40)history.shift();}
function addAnnotation(a){checkpoint();const item={id:state.nextId++,page:state.page,status:'open',note:'',...a};state.annotations.push(item);state.selected=item.id;refresh();return item;}
function setBusy(value,message='Rendering page - '){state.busy=value;$('#loading').classList.toggle('visible',value);$('#loading span').textContent=message;$$('[data-lock],#page-picker,#load-review,#compare-settings').forEach(el=>el.disabled=value);if($('#auto-cloud'))$('#auto-cloud').disabled=value||!state.suggestions.length;}
$('#app').innerHTML=`
<div class="shell"><header class="topbar"><div class="wordmark">PDF<span>DIFF</span><span class="product-tag">PDF COMPARISON</span><span class="demo-tag" id="demo-tag">SAMPLE</span></div><div class="top-right"><button class="icon-button" id="help" title="Help & shortcuts" aria-label="Help">${icon('circle-help')}</button><span class="local-status">${icon('shield-check')} On-device only</span><button class="button" id="new-comparison" data-lock title="New comparison" aria-label="New comparison">${icon('plus')} <span class="desktop-label">New comparison</span></button><button class="icon-button" id="load-review" title="Load a saved review" aria-label="Load review">${icon('folder-open')}</button><button class="button subtle" id="save-session" title="Save markups and review settings" aria-label="Save review">${icon('save')} Save review</button><button class="button primary" id="export" data-lock>${icon('download')} Export <span class="desktop-label">review</span></button></div></header>
<div class="workspace"><aside class="sheets-panel"><div class="panel-heading"><h2>Documents</h2></div><div class="project-card"><div class="project-icon">${icon('layers')}</div><div><strong id="project-name">Sample documents</strong><span id="project-sub">Local PDF comparison</span></div></div><div class="section-label">PAGES <span id="sheet-count">02</span></div><div id="sheet-list"></div><div class="sidebar-bottom"><div class="review-progress"><span>Review progress</span><strong id="progress-label">0%</strong></div><div class="progress-track"><div id="progress-bar"></div></div><p id="progress-detail">Add clouds to start your review</p><div class="privacy-note">${icon('shield-check')}<span>Your documents stay<br>on this computer.</span></div></div></aside>
<main class="main-panel"><div class="file-row"><button class="file-card" id="load-old" data-lock><span class="file-symbol old">${icon('file-text')}</span><span class="file-info"><span class="eyebrow">ORIGINAL <b> A </b></span><strong id="old-name">Loading sample - </strong></span>${icon('upload')}</button><div class="compare-link">${icon('arrow-right')}</div><button class="file-card" id="load-new" data-lock><span class="file-symbol new">${icon('file-text')}</span><span class="file-info"><span class="eyebrow">REVISED <b> B </b></span><strong id="new-name">Loading sample - </strong></span>${icon('upload')}</button></div>
<div class="comparison-toolbar"><div class="segmented" aria-label="Comparison view"><button data-mode="overlay" class="active">${icon('layers')} Overlay</button><button data-mode="split">${icon('files')} Split</button><button data-mode="revised">${icon('file-text')} Revised</button></div><button class="button text-button" id="compare-settings">${icon('sliders-horizontal')} <span>Settings</span></button></div>
<div class="canvas-toolbar"><div class="draw-tools"><button data-tool="select" class="icon-button active" title="Select (V)">${icon('mouse-pointer-2')}</button><span class="tool-divider"></span><button data-tool="cloud" class="tool-button" title="Draw revision cloud (C)">${icon('cloud')} <span>Revcloud</span></button><button data-tool="note" class="icon-button" title="Place note (N)">${icon('message-square')}</button><span class="tool-divider"></span><button class="icon-button" id="undo" title="Undo annotation edit (Ctrl+Z)">${icon('rotate-ccw')}</button></div><div class="zoom-tools"><button class="icon-button" id="zoom-out" aria-label="Zoom out">${icon('minus')}</button><span id="zoom-label">100%</span><button class="icon-button" id="zoom-in" aria-label="Zoom in">${icon('plus')}</button><button class="icon-button" id="fit" title="Fit page">${icon('maximize')}</button><button class="icon-button" id="expand-workspace" title="Expand document workspace" aria-label="Expand document workspace" aria-pressed="false">${icon('panel-left-close')}</button></div></div>
<div class="drawing-stage" id="stage"><div class="stage-label"><span id="sheet-stage-label">Page 1</span><span id="stage-description">PROJECT OVERVIEW</span></div><div class="paper-wrap" id="paper-wrap"><div class="paper" id="paper"><canvas id="drawing"></canvas><svg id="markups" xmlns="http://www.w3.org/2000/svg"></svg></div><div class="paper split-paper" id="split-paper"><span class="split-badge">ORIGINAL</span><canvas id="split-drawing"></canvas></div></div><div id="loading" class="loading visible"><div class="spinner"></div><span>Preparing sample documents - </span></div><div class="canvas-hint" id="canvas-hint">${icon('mouse-pointer-2')} Select a change to inspect it</div><div class="drawing-legend"><span><i class="legend-dot removed"></i>Removed</span><span><i class="legend-dot added"></i>Added</span><span><i class="legend-dot unchanged"></i>Unchanged</span></div></div>
<div class="statusbar"><span id="compare-status"><span class="status-dot"></span>Preparing comparison</span><span id="page-status">Sheet 1 of 2</span><span>PDF DIFF <b> / </b> LOCAL</span></div></main>
<aside class="review-panel"><div class="review-header"><h2>Review panel</h2><span class="small-badge" id="annotation-count">0</span></div><div class="review-tabs"><button data-tab="changes" class="active">Changes <span id="changes-count">0</span></button></div><div id="review-content"></div><div class="review-footer"><span>${icon('shield-check')} Review before issuing</span></div></aside></div>
<footer class="app-footer"><span>A little more clarity. A lot less rework.</span><span>Browser-based comparison <span class="footer-dot"> - </span> Files never uploaded</span></footer></div>
<input type="file" id="file-input" accept="application/pdf,.pdf" hidden><input type="file" id="review-input" accept="application/json,.json" hidden><div id="toast" role="status" aria-live="polite"></div><dialog id="dialog"><div id="dialog-body"></div></dialog>`;

function sheetName(n){return `Page ${n}`;}
function sheetTitle(n){return state.demo?(n===1?'Project overview':'Delivery checklist'):`Revised page ${n}`;}
function renderSheets(){
  const count=state.new?.pages||0;$('#sheet-count').textContent=String(count).padStart(2,'0');
  $('#page-picker').innerHTML=Array.from({length:count},(_,i)=>`<option value="${i+1}" ${i+1===state.page?'selected':''}>${sheetName(i+1)}  -  ${i+1} / ${count}</option>`).join('');
  $('#sheet-list').innerHTML=Array.from({length:count},(_,i)=>`<button class="sheet-item ${i+1===state.page?'selected':''}" data-page="${i+1}"><div class="sheet-thumbnail">${icon('file-text')}<span>${sheetName(i+1)}</span></div><div><strong>${sheetName(i+1)}</strong><span>${sheetTitle(i+1)}</span><small>${state.old&&i<state.old.pages?'Paired revisions':'No original page'}</small></div>${i+1===state.page?'<span class="sheet-active-dot"></span>':''}</button>`).join('');
  $$('.sheet-item').forEach(b=>b.onclick=()=>{if(state.busy)return;state.page=Number(b.dataset.page);state.selected=null;renderDrawing();});
}
function refresh(){
  renderMarkups();renderReview();renderSheets();
  const clouds=state.annotations.filter(a=>a.type==='cloud'),done=clouds.filter(a=>a.status==='reviewed').length,percent=clouds.length?Math.round(done/clouds.length*100):0;
  $('#progress-label').textContent=percent+'%';$('#progress-bar').style.width=percent+'%';$('#progress-detail').textContent=clouds.length?`${done} of ${clouds.length} clouds reviewed`:'Add clouds to start your review';
  $('#annotation-count').textContent=current().length;$('#changes-count').textContent=current().filter(a=>a.type==='cloud').length;
  $('#undo').disabled=!history.length;icons();
}
function renderMarkups(){
  const svg=$('#markups');const height=state.canvases?1000*state.canvases.new.height/state.canvases.new.width:700;
  svg.setAttribute('viewBox',`0 0 1000 ${height}`);svg.style.cursor=state.tool==='select'?'default':'crosshair';
  svg.innerHTML=current().map(a=>{
    const selected=a.id===state.selected;
    if(a.type==='cloud')return state.showClouds?`<g data-id="${a.id}" class="annotation ${selected?'is-selected':''}" style="color:${a.status==='reviewed'?'#168374':'#e25464'}"><path d="${cloudPath(a)}" fill="${selected?'#e254640e':'transparent'}" stroke="currentColor" stroke-width="${selected?2.4:1.7}"/><rect x="${a.x}" y="${Math.max(0,a.y-24)}" width="${Math.max(34,a.label.length*6.5+12)}" height="18" rx="4" fill="currentColor"/><text x="${a.x+6}" y="${Math.max(12,a.y-11)}" fill="white" font-size="10" font-weight="600">${esc(a.label)}</text></g>`:'';
    if(a.type==='device'){const d=DEVICE_TYPES[a.device];return `<g data-id="${a.id}" class="annotation"><circle cx="${a.x}" cy="${a.y}" r="${selected?12:10}" fill="${d.color}" stroke="white" stroke-width="2"/><text x="${a.x}" y="${a.y+3.5}" fill="white" text-anchor="middle" font-size="10" font-weight="700">${d.short}</text></g>`;}
    return `<g data-id="${a.id}" class="annotation"><rect x="${a.x-8}" y="${a.y-8}" width="16" height="16" rx="3" fill="#e3ad38"/><text x="${a.x}" y="${a.y+4}" font-size="12" text-anchor="middle" fill="white">!</text><text x="${a.x+14}" y="${a.y+4}" font-size="10" fill="#896622">${esc(a.label)}</text></g>`;
  }).join('');
}
async function renderDrawing(){
  const token=++state.renderId;setBusy(true);state.suggestions=[];renderSheets();
  try{
    if(!state.new)return;
    const rev=await renderPage(state.new,state.page);
    let original=null;if(state.old&&state.page<=state.old.pages)original=await renderPage(state.old,state.page);
    if(token!==state.renderId)return;
    state.canvases={new:rev.canvas,old:original?.canvas};
    const dimMismatch=original&&Math.abs(original.width/original.height-rev.width/rev.height)>.005;
    if(original&&!dimMismatch){
      const old=document.createElement('canvas');old.width=rev.canvas.width;old.height=rev.canvas.height;old.getContext('2d').drawImage(original.canvas,0,0,old.width,old.height);
      const result=comparePixels(old.getContext('2d').getImageData(0,0,old.width,old.height).data,rev.canvas.getContext('2d').getImageData(0,0,old.width,old.height).data,old.width,old.height,state.threshold);
      const diff=document.createElement('canvas');diff.width=old.width;diff.height=old.height;diff.getContext('2d').putImageData(new ImageData(result.output,old.width,old.height),0,0);
      state.canvases.diff=diff;state.suggestions=result.regions.map(r=>({...r,x:r.x*1000/old.width,y:r.y*1000/old.width,w:r.w*1000/old.width,h:r.h*1000/old.width}));
      $('#compare-status').innerHTML=`<span class="status-dot"></span>${result.regions.length} candidate regions <span class="status-separator"> - </span> ${result.percent.toFixed(2)}% pixels changed`;
    }else{$('#compare-status').textContent=dimMismatch?'Page proportions differ  -  use Split view; automatic comparison unavailable':'No original page paired  -  revised view only';}
    $('#sheet-stage-label').textContent=sheetName(state.page);$('#stage-description').textContent=sheetTitle(state.page).toUpperCase();$('#page-status').textContent=`Page ${state.page} of ${state.new.pages}`;
    paintCanvas();refresh();
  }catch(e){toast('Unable to render PDF: '+e.message);$('#compare-status').textContent='Drawing could not be rendered';}
  finally{if(token===state.renderId)setBusy(false);}
}
function paintCanvas(){
  if(!state.canvases)return;const c=$('#drawing'),src=state.canvases.new;c.width=src.width;c.height=src.height;const ctx=c.getContext('2d');
  paintComparison(c,src,state.canvases.old,state.mode==='overlay'?state.canvases.diff:null,state.opacity);
  const split=state.mode==='split';$('#paper-wrap').classList.toggle('split',split);$('#split-paper').style.display=split?'block':'none';
  if(split){const s=$('#split-drawing');s.width=state.canvases.old?.width||c.width;s.height=state.canvases.old?.height||c.height;const x=s.getContext('2d');x.fillStyle='white';x.fillRect(0,0,s.width,s.height);if(state.canvases.old)x.drawImage(state.canvases.old,0,0);else{x.fillStyle='#72827d';x.font='26px Arial';x.fillText('No matching original page',50,80);}}
  sizeDrawing();
  $$('.segmented button').forEach(b=>b.classList.toggle('active',b.dataset.mode===state.mode));
}
function sizeDrawing(){
  if(!state.canvases)return;
  const stage=$('#stage'),style=getComputedStyle(stage);
  const availableWidth=stage.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
  $('#paper-wrap').style.width=`${Math.max(1,availableWidth)*state.zoom}px`;
  $('#zoom-label').textContent=Math.round(state.zoom*100)+'%';
}
function setZoom(value,anchor){
  if(!state.canvases||state.busy||drag)return;
  const zoom=Math.max(.25,Math.min(6,value));if(zoom===state.zoom)return;
  const stage=$('#stage'),wrap=$('#paper-wrap'),before=wrap.getBoundingClientRect(),viewport=stage.getBoundingClientRect();
  const cursor=anchor||{x:viewport.left+stage.clientWidth/2,y:viewport.top+stage.clientHeight/2};
  const x=(cursor.x-before.left)/before.width,y=(cursor.y-before.top)/before.height;
  state.zoom=zoom;sizeDrawing();
  const after=wrap.getBoundingClientRect();
  stage.scrollLeft+=after.left+x*after.width-cursor.x;
  stage.scrollTop+=after.top+y*after.height-cursor.y;
}
function selectedEditor(){
  const a=state.annotations.find(a=>a.id===state.selected);if(!a)return '';
  return `<div class="selection-editor"><div class="editor-heading"><strong>${a.type==='cloud'?'Revision cloud':a.type==='device'?'Device properties':'Page note'}</strong><button class="icon-button" id="deselect" title="Close properties">${icon('x')}</button></div><label>Label<input id="annotation-label" maxlength="80" value="${esc(a.label)}"></label><label>Review note<textarea id="annotation-note" rows="2" maxlength="600" placeholder="Add review details - ">${esc(a.note)}</textarea></label><div class="editor-actions">${a.type==='cloud'?`<button class="button ${a.status==='reviewed'?'':'primary'}" id="mark-reviewed">${icon('check')} ${a.status==='reviewed'?'Reopen':'Mark reviewed'}</button>`:''}<button class="icon-button danger" id="delete-annotation" title="Delete annotation">${icon('trash-2')}</button></div></div>`;
}
function renderReview(){
  const el=$('#review-content');$$('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===state.tab));
  if(state.tab==='changes'){
    const clouds=current().filter(a=>a.type==='cloud'),notes=current().filter(a=>a.type==='note'),items=[...clouds,...notes].filter(a=>state.filter==='all'||a.status===state.filter);
    el.innerHTML=`<div class="review-summary"><div><strong>${clouds.length.toString().padStart(2,'0')}</strong><span>revision clouds</span></div><div><strong class="green-text">${clouds.filter(a=>a.status==='reviewed').length.toString().padStart(2,'0')}</strong><span>reviewed</span></div></div><button class="button auto-cloud" id="auto-cloud" ${state.busy||!state.suggestions.length?'disabled':''}>${icon('cloud')} Auto-cloud changes <span>${state.suggestions.length}</span></button><p class="microcopy">Pixel-based suggestions. Verify each region.</p><div class="filter-row"><button data-filter="all" class="${state.filter==='all'?'active':''}">All</button><button data-filter="open" class="${state.filter==='open'?'active':''}">Open</button><button data-filter="reviewed" class="${state.filter==='reviewed'?'active':''}">Reviewed</button><span>${items.length} items</span></div><div class="change-list">${items.length?items.map(a=>`<button class="change-card ${a.id===state.selected?'selected':''}" data-select="${a.id}"><span class="change-icon ${a.status==='reviewed'?'done':a.kind||'modified'}">${icon(a.type==='note'?'message-square':a.status==='reviewed'?'check':'cloud')}</span><span class="change-copy"><strong>${esc(a.label)}</strong><span>${esc(a.note|| (a.type==='note'?'Review note':a.kind==='added'?'Added page content':a.kind==='removed'?'Removed page content':'Document revision'))}</span><small>${sheetName(a.page)} <b> - </b> ${a.status==='reviewed'?'Reviewed':'Needs review'}</small></span>${icon('chevron-right')}</button>`).join(''):`<div class="empty-state">${icon('cloud')}<strong>${state.filter==='all'?'Start your document review':'No '+state.filter+' items'}</strong><p>${state.filter==='all'?'Auto-cloud the detected differences, or draw a cloud around any area.':'Change the filter to see other items.'}</p></div>`}</div>${selectedEditor()}<div class="review-tip">${icon('lightbulb')}<p><strong>Keep useful context</strong><br>Add a note to each cloud before exporting your reviewed page.</p></div>`;
    $('#auto-cloud').onclick=autoCloud;$$('[data-filter]').forEach(b=>b.onclick=()=>{state.filter=b.dataset.filter;renderReview();icons();});
  }
  $$('[data-select]').forEach(b=>b.onclick=()=>{state.selected=Number(b.dataset.select);refresh();});
  bindEditor();icons();
}
function bindEditor(){
  const a=state.annotations.find(a=>a.id===state.selected);if(!a)return;
  $('#deselect').onclick=()=>{state.selected=null;refresh();};
  let editing=false;const beginEdit=()=>{if(!editing){checkpoint();editing=true;$('#undo').disabled=false;}};
  $('#annotation-label').oninput=e=>{beginEdit();a.label=e.target.value.trim();renderMarkups();};
  $('#annotation-note').oninput=e=>{beginEdit();a.note=e.target.value;};
  if($('#mark-reviewed'))$('#mark-reviewed').onclick=()=>{checkpoint();a.status=a.status==='reviewed'?'open':'reviewed';refresh();};
  $('#delete-annotation').onclick=()=>{checkpoint();state.annotations=state.annotations.filter(x=>x.id!==a.id);state.selected=null;refresh();};
}
function autoCloud(){
  if(state.busy||!state.suggestions.length)return;
  const candidates=state.suggestions.filter(r=>!current().some(a=>a.source==='auto'&&Math.abs(a.x-r.x)<3&&Math.abs(a.y-r.y)<3));
  if(!candidates.length){toast('These candidate regions already have clouds.');return;}
  checkpoint();for(const r of candidates){const id=state.nextId++;state.annotations.push({id,page:state.page,type:'cloud',source:'auto',status:'open',note:'',label:`REV-${String(id).padStart(2,'0')}`,...r});}
  state.selected=null;state.showClouds=true;refresh();toast(`${candidates.length} revision clouds added. Review the suggested regions.`);
}
function updateTools(){
  $$('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===state.tool));
  $('#canvas-hint').innerHTML=icon(state.tool==='cloud'?'cloud':state.tool==='note'?'message-square':'mouse-pointer-2')+' '+({select:'Select a change to inspect it',cloud:'Drag a rectangle around a changed area',note:'Click on the page to place a note'}[state.tool]);renderMarkups();icons();
}
function point(e){const box=$('#markups').getBoundingClientRect();return{x:Math.max(0,Math.min(1000,(e.clientX-box.left)/box.width*1000)),y:Math.max(0,Math.min(box.height/box.width*1000,(e.clientY-box.top)/box.width*1000))};}
$('#markups').addEventListener('pointerdown',e=>{
  if(state.busy||!state.canvases)return;const p=point(e),id=e.target.closest('[data-id]')?.dataset.id;
  if(state.tool==='select'){state.selected=id?Number(id):null;if(id){const a=state.annotations.find(a=>a.id===Number(id));drag={kind:'move',start:p,original:structuredClone(a),snapshot:reviewSnapshot()};$('#markups').setPointerCapture(e.pointerId);}refresh();return;}
  if(state.tool==='cloud'){drag={kind:'draw',start:p};state.showClouds=true;$('#markups').setPointerCapture(e.pointerId);e.preventDefault();}
  if(state.tool==='note'){addAnnotation({type:'note',...p,label:'Review note'});state.tab='changes';refresh();$('#annotation-label')?.focus();}
});
$('#markups').addEventListener('pointermove',e=>{if(!drag)return;const p=point(e);if(drag.kind==='move'){const a=state.annotations.find(a=>a.id===drag.original.id),height=1000*state.canvases.new.height/state.canvases.new.width;a.x=Math.max(0,Math.min(1000-(a.w||0),drag.original.x+p.x-drag.start.x));a.y=Math.max(0,Math.min(height-(a.h||0),drag.original.y+p.y-drag.start.y));renderMarkups();return;}const r=normalizeRect(drag.start,p);renderMarkups();$('#markups').insertAdjacentHTML('beforeend',`<path d="${cloudPath(r)}" fill="#e2546410" stroke="#e25464" stroke-width="2"/>`);});
$('#markups').addEventListener('pointerup',e=>{if(!drag)return;if(drag.kind==='move'){const a=state.annotations.find(a=>a.id===drag.original.id);if(a.x!==drag.original.x||a.y!==drag.original.y){history.push(drag.snapshot);a.source='manual';}drag=null;refresh();return;}const r=normalizeRect(drag.start,point(e));drag=null;if(r.w>8&&r.h>8){addAnnotation({type:'cloud',...r,label:`REV-${String(state.nextId).padStart(2,'0')}`,kind:'modified',source:'manual'});state.tab='changes';refresh();}else renderMarkups();});
$('#markups').addEventListener('pointercancel',()=>{if(drag?.kind==='move')restoreSnapshot(drag.snapshot);drag=null;renderMarkups();});
function modal(title,body,wide=false){$('#dialog').oncancel=null;$('#dialog-body').innerHTML=`<div class="modal-heading"><h2>${title}</h2><button class="icon-button" id="close-dialog" title="Close">${icon('x')}</button></div>${body}`;$('#dialog').classList.toggle('wide',wide);$('#dialog').showModal();$('#close-dialog').onclick=()=>$('#dialog').close();icons();}
function openExport(){modal('Export your review',`<p class="modal-description">Download a marked-up PDF or a simple change register.</p><button class="export-option" id="export-pdf">${icon('file-text')}<span><strong>Reviewed PDF</strong><small>${state.mode==='overlay'?'All sheets with red/blue overlay':'All revised sheets'} and flattened markups  -  high resolution</small></span>${icon('download')}</button><button class="export-option" id="export-csv">${icon('clipboard-list')}<span><strong>Change register</strong><small>Revision clouds and notes  -  CSV</small></span>${icon('download')}</button><p class="info-box">Your original files remain untouched. Save a review file to retain editable markups.</p>`);
  $('#export-pdf').onclick=async()=>{$('#dialog').close();setBusy(true,'Preparing reviewed PDF - ');try{const bytes=await exportReviewed(state.new,structuredClone(state.annotations),(n,total)=>$('#loading span').textContent=`Exporting sheet ${n} of ${total} - `,{original:state.old,mode:state.mode,threshold:state.threshold,opacity:state.opacity,showClouds:state.showClouds});saveFile(bytes,'PDF-DIFF-reviewed.pdf','application/pdf');toast('Reviewed PDF exported.');}catch(e){toast('Export failed: '+e.message);}finally{setBusy(false);}};
  $('#export-csv').onclick=()=>{const rows=[['Page','Type','Label','Status','Note'],...state.annotations.map(a=>[a.page,a.type,a.label,a.status,a.note])];saveFile('\uFEFF'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n'),'PDF-DIFF-register.csv','text/csv;charset=utf-8');$('#dialog').close();toast('Review register exported.');};
}
function openSettings(){modal('Comparison settings',`<p class="modal-description">Pages are paired by page number. Use matching scale, orientation and alignment for reliable results.</p><label>Difference sensitivity <span id="sensitivity-value">${state.threshold}</span><input id="sensitivity" type="range" min="15" max="150" value="${state.threshold}"></label><p class="microcopy">Lower thresholds detect more subtle changes, including scan noise.</p><label>View blend <span id="blend-value">${state.opacity===50?'Difference overlay':state.opacity<50?'Toward revised':'Toward original'}</span><input id="blend" type="range" min="0" max="100" value="${state.opacity}"></label><div class="range-labels"><span>Revised</span><span>Difference</span><span>Original</span></div><label class="checkbox-label"><input id="show-clouds" type="checkbox" ${state.showClouds?'checked':''}> Show revision clouds</label><button class="button primary full" id="apply-settings">Apply settings</button>`);$('#sensitivity').oninput=e=>$('#sensitivity-value').textContent=e.target.value;$('#blend').oninput=e=>$('#blend-value').textContent=e.target.value==50?'Difference overlay':e.target.value<50?'Toward revised':'Toward original';$('#apply-settings').onclick=()=>{state.threshold=Number($('#sensitivity').value);state.opacity=Number($('#blend').value);state.showClouds=$('#show-clouds').checked;$('#dialog').close();renderDrawing();};}
let uploadSlot='old';
function choosePdf(slot){uploadSlot=slot;$('#file-input').value='';$('#file-input').click();}
$('#load-old').onclick=()=>choosePdf('old');$('#load-new').onclick=()=>choosePdf('new');
$('#file-input').onchange=async e=>{
  const f=e.target.files[0];if(!f)return;if(f.size>150*1024*1024){toast('Choose a PDF smaller than 150 MB.');return;}
  setBusy(true,'Opening '+f.name+' - ');
  try{
    const pdf=await loadPdf(await f.arrayBuffer(),f.name);
    const hasImpact=state.impact.records.length||state.impact.references.length;
    const apply=async()=>{const previous=state[uploadSlot];state[uploadSlot]=pdf;if(uploadSlot==='new'){state.annotations=[];history=[];state.selected=null;state.page=1;state.nextId=1;}else if(hasImpact)history=[];state.impact=createImpactState();state.demo=false;$('#demo-tag').hidden=true;$('#project-name').textContent='PDF review';$('#project-sub').textContent='Local PDF comparison';updateFileNames();await renderDrawing();previous?.doc.destroy();};
    if((uploadSlot==='new'&&(state.annotations.length||hasImpact))||(uploadSlot==='old'&&hasImpact)){
      setBusy(false);modal(uploadSlot==='new'?'Replace revised page?':'Replace original page?',`<p class="modal-description">${uploadSlot==='new'?'Replacing the revised PDF clears current markups and legacy review data.':'Replacing the original PDF clears legacy review data and reference links. Revised markups are retained.'} Save your review first if you need to keep it.</p><div class="modal-actions"><button class="button" id="cancel-replace">Keep current page</button><button class="button primary" id="confirm-replace">${uploadSlot==='new'?'Replace & clear markups':'Replace & clear impacts'}</button></div>`);
      const cancel=()=>{pdf.doc.destroy();$('#dialog').close();};$('#cancel-replace').onclick=cancel;$('#close-dialog').onclick=cancel;$('#dialog').oncancel=e=>{e.preventDefault();cancel();};$('#confirm-replace').onclick=()=>{$('#dialog').close();apply();};
    }else await apply();
  }catch(err){setBusy(false);toast('Could not open PDF. '+(err.name==='PasswordException'?'Remove its password protection first.':err.message));}
};
function updateFileNames(){$('#old-name').textContent=state.old?.name||'Choose original PDF';$('#new-name').textContent=state.new?.name||'Choose revised PDF';}
$('#new-comparison').onclick=()=>modalNew();
function modalNew(){modal('Start a comparison',`<p class="modal-description">Choose an original and revised PDF using the file cards. Current markups remain until you replace the revised page.</p><button class="export-option" id="pick-original">${icon('upload')}<span><strong>Choose original PDF</strong><small>Baseline page or previous issue</small></span>${icon('arrow-right')}</button><button class="export-option" id="pick-revised">${icon('upload')}<span><strong>Choose revised PDF</strong><small>Updated page to review</small></span>${icon('arrow-right')}</button>`);$('#pick-original').onclick=()=>{$('#dialog').close();choosePdf('old');};$('#pick-revised').onclick=()=>{$('#dialog').close();choosePdf('new');};}
$$('[data-mode]').forEach(b=>b.onclick=()=>{state.mode=b.dataset.mode;paintCanvas();});
$$('[data-tool]').forEach(b=>b.onclick=()=>{state.tool=b.dataset.tool;updateTools();});
$$('[data-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;state.selected=null;renderReview();$('#review-content').scrollTop=0;});
$('#zoom-in').onclick=()=>setZoom(state.zoom+.25);$('#zoom-out').onclick=()=>setZoom(state.zoom-.25);
$('#stage').addEventListener('wheel',e=>{
  if(drag){e.preventDefault();return;}
  if(!state.canvases||state.busy||!e.deltaY||e.shiftKey||Math.abs(e.deltaX)>Math.abs(e.deltaY))return;
  e.preventDefault();
  const pixels=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?$('#stage').clientHeight:1);
  setZoom(state.zoom*Math.exp(-Math.max(-100,Math.min(100,pixels))*.002),{x:e.clientX,y:e.clientY});
},{passive:false});
$('#fit').onclick=()=>{const stage=$('#stage'),src=state.canvases?.new;if(!src||state.busy||drag)return;const style=getComputedStyle(stage),width=stage.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),height=stage.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom);state.zoom=Math.min(1,Math.max(.25,(height*src.width/src.height*(state.mode==='split'?2:1)+(state.mode==='split'?16:0))/width));sizeDrawing();stage.scrollTo(0,0);};
$('#undo').onclick=()=>{if(history.length){restoreSnapshot(history.pop());state.selected=null;refresh();}};
$('#export').onclick=openExport;$('#compare-settings').onclick=openSettings;
$('#help').onclick=()=>modal('Compare PDFs, simply',`<div class="help-steps"><p><b>01</b><span><strong>Choose two PDFs</strong>Load the original and revised document. Pages are paired by number.</span></p><p><b>02</b><span><strong>Find the differences</strong>Use Overlay or Split. Blue means added; red means removed. Auto-cloud finds possible changes.</span></p><p><b>03</b><span><strong>Review and export</strong>Add notes, mark clouds reviewed, and download a PDF or CSV. Save review keeps editable markups.</span></p></div><div class="shortcut-grid"><span><kbd>V</kbd> Select</span><span><kbd>C</kbd> Cloud</span><span><kbd>N</kbd> Note</span><span><kbd>Ctrl Z</kbd> Undo</span></div><p class="info-box">Visual comparison only, not OCR or automatic alignment. Shifted or scanned pages can produce false differences. Your files stay on this device.</p>`);
document.addEventListener('keydown',e=>{if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||$('#dialog').open)return;if((e.ctrlKey||e.metaKey)&&e.key==='z'){e.preventDefault();$('#undo').click();return;}const key={v:'select',c:'cloud',n:'note'}[e.key.toLowerCase()];if(key){state.tool=key;refresh();updateTools();}if(e.key==='Escape'){state.tool='select';state.selected=null;drag=null;refresh();updateTools();}});
$('#save-session').onclick=async()=>{if(!state.new||state.busy)return;const snapshot=reviewSnapshot();setBusy(true,'Saving editable review - ');try{const documents=await buildReviewDocuments(state.old,state.new,snapshot.impact),data=serializeReview({...documents,annotations:snapshot.annotations,impact:snapshot.impact});saveFile(JSON.stringify(data,null,2),'PDF-DIFF-review.json','application/json');toast('Editable review saved. Keep the original PDFs with this file.');}catch(error){toast('Could not save review: '+error.message);}finally{setBusy(false);}};
$('#load-review').onclick=()=>{$('#review-input').value='';$('#review-input').click();};
$('#review-input').onchange=async e=>{const f=e.target.files[0];if(!f||state.busy)return;setBusy(true,'Validating saved review - ');try{if(f.size>5e6)throw Error('Review file is too large.');const data=JSON.parse(await f.text());if(data.version===2&&(!Array.isArray(data.impact?.records)||data.impact.records.length>1000||!Array.isArray(data.impact?.references)||data.impact.references.length>1000))throw Error('Invalid impact state.');const documents=await buildReviewDocuments(state.old,state.new,data.version===2?data.impact:null),parsed=parseReview(data,documents);setBusy(false);modal('Load saved review?',`<p class="modal-description">This replaces your current review with ${parsed.annotations.length} markups and ${parsed.impact.records.length} legacy change records for <strong>${esc(state.new.name)}</strong>. Legacy change records are preserved when saved, but are not editable in this simplified app.</p><button class="button primary full" id="confirm-review-load">Load saved markups</button>`);$('#confirm-review-load').onclick=()=>{checkpoint();state.annotations=parsed.annotations;state.impact=parsed.impact;state.nextId=parsed.nextId;state.selected=null;$('#dialog').close();refresh();toast('Saved review loaded.');};}catch(err){toast('Cannot load review: '+err.message);}finally{setBusy(false);}};
async function boot(){
  icons();setBusy(true,'Preparing sample documents - ');try{const [a,b]=await Promise.all([createDemo(false),createDemo(true)]);[state.old,state.new]=await Promise.all([loadPdf(a,'Sample_Original.pdf'),loadPdf(b,'Sample_Revised.pdf')]);updateFileNames();await renderDrawing();autoCloud();history=[];refresh();state.loaded=true;}catch(e){setBusy(false);toast('Could not prepare the sample: '+e.message);}
}
// Optional browser-native agent tools share the visible review actions.
if(document.modelContext?.registerTool){
  const lifecycle=new AbortController();const register=t=>{try{Promise.resolve(document.modelContext.registerTool(t,{signal:lifecycle.signal})).catch(()=>{});}catch{}};
  const validateEmpty=input=>{if(!input||Array.isArray(input)||typeof input!=='object'||Object.keys(input).length)throw Error('Expected an empty object.');};
  register({name:'get_drawing_review',description:'Read the currently loaded page and annotation counts.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:input=>{validateEmpty(input);return{original:state.old?.name,revised:state.new?.name,page:state.page,annotations:state.annotations.length,candidates:state.suggestions.length};}});
  register({name:'stage_revision_clouds',description:'Add unreviewed clouds for detected pixel differences on the current sheet.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false},execute:input=>{validateEmpty(input);if(state.busy||!state.canvases)throw Error('Drawing not ready');autoCloud();return{clouds:current().filter(a=>a.type==='cloud').length};}});
  window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
$('#page-status').insertAdjacentHTML('afterend','<select id="page-picker" aria-label="Current sheet"></select>');
$('#page-picker').onchange=e=>{if(state.busy)return;state.page=Number(e.target.value);state.selected=null;renderDrawing();};
const canvasInfo=document.createElement('div');canvasInfo.className='canvas-info';canvasInfo.append($('#canvas-hint'),$('.drawing-legend'));$('#stage').before(canvasInfo);
boot();
new ResizeObserver(()=>sizeDrawing()).observe($('#stage'));

$('#expand-workspace').onclick=()=>{const expanded=document.body.classList.toggle('expanded-workspace');$('#expand-workspace').setAttribute('aria-pressed',String(expanded));paintCanvas();};
