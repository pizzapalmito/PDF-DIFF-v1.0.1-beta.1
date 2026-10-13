import {DEVICE_TYPES,normalizeRect} from './core.js';
import {deriveImpact,upsertRecord,deleteRecord,upsertReference,deleteReference,setTaskOutcome,impactCsv} from './impact.js';
import {renderPage,renderEvidenceCrop,buildReviewDocuments,saveFile} from './pdf.js';

const kinds={added:'Added',removed:'Removed',relocated:'Relocated',reassigned:'Reassigned',modified:'Modified'};
const $=selector=>document.querySelector(selector);
const signed=value=>(value>0?'+':'')+value.toLocaleString(undefined,{maximumFractionDigits:2});
const nextId=items=>Math.max(0,...items.map(item=>item.id))+1;
const blankSide=()=>({device:'receptacle',quantity:1,panel:'',circuit:'',va:null,evidence:null});
const locationText=location=>location?`${location.side==='old'?'Original':'Revised'} · page ${location.page}`:'No location selected';

export function createImpactUI({getState,checkpoint,refresh,toast,modal,icons,esc,icon}) {
  const context=model=>buildReviewDocuments(getState().old,getState().new,model);
  function apply(model){checkpoint();getState().impact=model;refresh();}
  function show(title,body,back){
    modal(title,body,true);
    if(back){$('#close-dialog').onclick=back;$('#dialog').oncancel=e=>{e.preventDefault();back();};}
  }
  function fail(error){
    if(!$('#dialog').open){toast(error.message);return;}
    let alert=$('#impact-error');if(!alert){alert=document.createElement('p');alert.id='impact-error';alert.setAttribute('role','alert');$('#dialog-body').querySelector('.modal-heading').after(alert);}
    alert.textContent=error.message;alert.scrollIntoView({block:'nearest'});
  }
  function exportCsv(){saveFile(impactCsv(getState().impact),'PDF-DIFF-electrical-impact.csv','text/csv;charset=utf-8');toast('Electrical impact register exported.');}
  function render(){
    const state=getState(),model=state.impact,summary=deriveImpact(model),pending=summary.tasks.filter(task=>task.status==='pending').length;
    $('#review-content').innerHTML=`<div class="impact-intro"><h3>Electrical revision impact</h3><p>Confirm changes, then review the affected schedules and single-line diagrams.</p></div>
      <button class="button primary full" id="new-impact" ${state.busy||!state.old||!state.new?'disabled':''}>${icon('plus')} New electrical change</button>
      <div class="impact-counts"><span><strong>${summary.confirmed}</strong>Confirmed</span><span><strong>${summary.drafts}</strong>Drafts</span><span><strong>${pending}</strong>Pending reviews</span></div>
      <p class="microcopy">Entered quantities and VA only. Missing VA remains unknown.</p>
      <div class="impact-section"><h3>Circuit changes</h3>${summary.circuits.length?summary.circuits.map(c=>`<article class="impact-card"><strong>${esc(c.panel)} / ${esc(c.circuit)}</strong><p>${Object.entries(c.quantities).map(([device,count])=>`${esc(DEVICE_TYPES[device].label)} ${signed(count)}`).join(' · ')}</p><p class="impact-va">${c.missingVa?`Incomplete VA · known subtotal ${signed(c.knownVaDelta)} VA · ${c.missingVa} unknown input${c.missingVa===1?'':'s'}`:`${signed(c.knownVaDelta)} VA`}</p><small>${c.recordIds.length} contributing change${c.recordIds.length===1?'':'s'}</small></article>`).join(''):'<p class="impact-empty">Confirm a change to see its circuit effects.</p>'}</div>
      <div class="impact-section"><h3>Change register</h3>${model.records.length?model.records.map(record=>`<button class="impact-card impact-record" data-impact-edit="${record.id}"><strong>${esc(record.label||'Electrical change')}</strong><span>${kinds[record.kind]} · ${record.status==='confirmed'?'Confirmed':'Draft'}</span><small>${esc(record.note||'Open to inspect evidence and quantities')}</small></button>`).join(''):'<p class="impact-empty">Start here, or select a cloud or device and choose Track electrical impact.</p>'}</div>
      <div class="impact-section"><h3>Linked reviews</h3>${summary.tasks.length?summary.tasks.map((task,index)=>`<article class="impact-card impact-task"><strong>${task.type==='schedule'?'Panel schedule':'Single-line'} · ${esc(task.panel)}${task.circuit?' / '+esc(task.circuit):''}</strong><span class="impact-status ${task.status==='pending'?'pending':''}">${task.status==='not-applicable'?'Not applicable':task.status==='checked'?'Checked':'Pending'}</span><p>${task.recordIds.length} confirmed change${task.recordIds.length===1?'':'s'} · ${task.referenceIds.length?task.referenceIds.length+' linked location(s)':'No schedule location linked'}</p>${task.note?`<p>${esc(task.note)}</p>`:''}<button class="button full" data-impact-task="${index}">Review task</button>${task.type==='schedule'?`<button class="button full" data-impact-link="${index}">Link schedule location</button>`:''}</article>`).join(''):'<p class="impact-empty">Confirmed changes create schedule reviews. Link single-line locations to add panel reviews.</p>'}</div>
      <div class="impact-actions"><button class="button full" id="impact-references">Manage references</button><button class="button full" id="impact-csv" ${model.records.length?'':'disabled'}>${icon('download')} Electrical impact CSV</button></div>`;
    $('#new-impact').onclick=()=>editRecord();
    document.querySelectorAll('[data-impact-edit]').forEach(button=>button.onclick=()=>editRecord(model.records.find(record=>record.id===Number(button.dataset.impactEdit))));
    document.querySelectorAll('[data-impact-task]').forEach(button=>button.onclick=()=>reviewTask(summary.tasks[Number(button.dataset.impactTask)].key));
    document.querySelectorAll('[data-impact-link]').forEach(button=>button.onclick=()=>{const task=summary.tasks[Number(button.dataset.impactLink)];editReference(null,{type:'schedule',panel:task.panel,circuit:task.circuit});});
    $('#impact-references').onclick=manageReferences;$('#impact-csv').onclick=exportCsv;icons();
  }
  function trackAnnotation(annotation){
    if(getState().busy||!getState().old||!getState().new){toast('Load both original and revised PDFs to track electrical impacts.');return;}
    editRecord(null,annotation);
  }
  function editRecord(existing=null,source=null){
    const state=getState();
    if(!state.old||!state.new){toast('Load both original and revised PDFs first.');return;}
    const record=existing?structuredClone(existing):{id:nextId(state.impact.records),kind:'added',status:'draft',label:source?`Electrical ${source.label}`.slice(0,80):'Electrical change',note:'',sourceAnnotationId:source?.id||null,before:null,after:blankSide()};
    const sides={before:record.before||blankSide(),after:record.after||blankSide()};
    if(source){
      if(source.type==='device'){sides.after.device=source.device;sides.after.circuit=source.circuit||'';}
      const height=1000*state.canvases.new.height/state.canvases.new.width;
      const x=Math.max(0,Math.min(990,source.type==='cloud'?source.x:source.x-20)),y=Math.max(0,Math.min(height-10,source.type==='cloud'?source.y:source.y-20));
      sides.after.evidence={side:'new',page:source.page,rect:{x,y,w:Math.min(source.w||40,1000-x),h:Math.min(source.h||40,height-y)}};
    }
    const active=name=>name==='before'?record.kind!=='added':record.kind!=='removed';
    function collect(){
      record.label=$('#impact-label').value.trim();record.note=$('#impact-note').value;
      for(const name of ['before','after'])if($(`#${name}-quantity`)){
        const side=sides[name];side.device=$(`#${name}-device`).value;side.quantity=Number($(`#${name}-quantity`).value);side.panel=$(`#${name}-panel`).value.trim();side.circuit=$(`#${name}-circuit`).value.trim();side.va=$(`#${name}-va`).value===''?null:Number($(`#${name}-va`).value);
      }
      record.kind=$('#impact-kind').value;record.before=active('before')?sides.before:null;record.after=active('after')?sides.after:null;
      return record;
    }
    function sideForm(name){const side=sides[name];return `<fieldset class="impact-side"><legend>${name==='before'?'Before · original':'After · revised'}</legend><div class="form-grid"><label>Device type<select id="${name}-device" aria-label="${name} device">${Object.entries(DEVICE_TYPES).map(([key,type])=>`<option value="${key}" ${side.device===key?'selected':''}>${type.label}</option>`).join('')}</select></label><label>Quantity<input id="${name}-quantity" aria-label="${name} quantity" type="number" min="1" max="10000" step="1" value="${side.quantity}"></label><label>Panel<input id="${name}-panel" aria-label="${name} panel" maxlength="40" value="${esc(side.panel)}" placeholder="LP-1"></label><label>Circuit<input id="${name}-circuit" aria-label="${name} circuit" maxlength="40" value="${esc(side.circuit)}" placeholder="7"></label></div><label>VA per device <span class="optional-label">optional</span><input id="${name}-va" aria-label="${name} VA" type="number" min="0" max="100000" step="any" value="${side.va??''}" placeholder="Unknown until entered"></label><div class="evidence-action"><span>${locationText(side.evidence)}</span><button class="button" id="${name}-pick">Select evidence area</button>${side.evidence?`<button class="button" id="${name}-view">View</button>`:''}</div></fieldset>`;}
    function draw(){
      show(existing?'Edit electrical change':'New electrical change',`<p class="modal-description">One group per device type and circuit. Confirm only quantities and assignments you have checked against the drawings.</p><div class="form-grid"><label>Label<input id="impact-label" maxlength="80" value="${esc(record.label)}"></label><label>Change type<select id="impact-kind">${Object.entries(kinds).map(([key,label])=>`<option value="${key}" ${record.kind===key?'selected':''}>${label}</option>`).join('')}</select></label></div><div class="impact-side-grid">${['before','after'].filter(active).map(sideForm).join('')}</div><label>Review note<textarea id="impact-note" maxlength="600" rows="2">${esc(record.note)}</textarea></label>${existing?.status==='confirmed'?'<p class="info-box">Saving an edit as a draft removes it from totals and reopens affected reviews. Confirm it again after checking the changes.</p>':''}<div class="modal-actions impact-editor-actions"><button class="button" id="impact-cancel">Cancel</button>${existing?'<button class="button danger" id="impact-delete">Delete change</button>':''}<button class="button" id="impact-save">Save draft</button><button class="button primary" id="impact-confirm">Confirm change</button></div>`);
      $('#impact-kind').onchange=()=>{collect();draw();};
      for(const name of ['before','after'].filter(active)){
        $(`#${name}-pick`).onclick=()=>{collect();pickEvidence(name==='before'?'old':'new',sides[name].evidence,location=>{sides[name].evidence=location;draw();},draw);};
        if($(`#${name}-view`))$(`#${name}-view`).onclick=()=>{collect();viewEvidence(record.label,[sides[name].evidence],draw);};
      }
      $('#impact-cancel').onclick=()=>$('#dialog').close();
      const commit=async status=>{
        const button=status==='confirmed'?$('#impact-confirm'):$('#impact-save'),controls=[...$('#dialog-body').querySelectorAll('input,select,textarea,button:not(#close-dialog):not(#impact-cancel)')];
        try{const candidate=structuredClone(collect());candidate.status=status;controls.forEach(control=>control.disabled=true);const documents=await context({...state.impact,records:[...state.impact.records,candidate]});if(!button.isConnected||!$('#dialog').open)return;apply(upsertRecord(state.impact,candidate,documents));$('#dialog').close();toast(status==='confirmed'?'Electrical change confirmed. Review the linked tasks.':'Electrical change saved as a draft.');}catch(error){fail(error);}finally{controls.forEach(control=>{if(control.isConnected)control.disabled=false;});}
      };
      $('#impact-save').onclick=()=>commit('draft');$('#impact-confirm').onclick=()=>commit('confirmed');
      if(existing)$('#impact-delete').onclick=()=>{apply(deleteRecord(state.impact,record.id));$('#dialog').close();toast('Electrical change deleted.');};
    }
    draw();
  }
  function pickEvidence(side,existing,onSelect,onCancel){
    const pdf=getState()[side];if(!pdf){toast('Load the evidence PDF first.');onCancel();return;}
    let page=existing?.page||Math.min(getState().page,pdf.pages),rect=existing?structuredClone(existing.rect):null,token=0;
    show('Select drawing evidence',`<p class="modal-description">${side==='old'?'Original':'Revised'} · ${esc(pdf.name)}. Choose a page and drag a rectangle around the evidence.</p><label>Evidence page<select id="evidence-page">${Array.from({length:pdf.pages},(_,i)=>`<option value="${i+1}" ${i+1===page?'selected':''}>Page ${i+1}</option>`).join('')}</select></label><p id="evidence-loading" role="status">Rendering page…</p><div class="evidence-picker-paper"><canvas id="evidence-canvas"></canvas><svg id="evidence-picker" xmlns="http://www.w3.org/2000/svg" aria-label="Evidence area selection"></svg></div><div class="modal-actions"><button class="button" id="evidence-cancel">Back</button><button class="button primary" id="evidence-use" disabled>Use selected area</button></div>`,onCancel);
    $('#evidence-cancel').onclick=onCancel;
    $('#evidence-use').onclick=()=>onSelect({side,page,rect:structuredClone(rect)});
    const canvas=$('#evidence-canvas'),svg=$('#evidence-picker'),loading=$('#evidence-loading'),use=$('#evidence-use');
    let start=null,height=700;
    const position=e=>{const box=svg.getBoundingClientRect();return{x:Math.max(0,Math.min(1000,(e.clientX-box.left)/box.width*1000)),y:Math.max(0,Math.min(height,(e.clientY-box.top)/box.height*height))};};
    function outline(){svg.innerHTML=rect?`<rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" fill="#24523f22" stroke="#24523f" stroke-width="3"/>`:'';use.disabled=!rect||rect.w<2||rect.h<2;}
    async function paint(){
      const id=++token;use.disabled=true;svg.style.pointerEvents='none';loading.textContent='Rendering page…';
      try{const rendered=await renderPage(pdf,page,1600);if(id!==token||!canvas.isConnected)return;height=1000*rendered.height/rendered.width;canvas.width=rendered.canvas.width;canvas.height=rendered.canvas.height;canvas.getContext('2d').drawImage(rendered.canvas,0,0);svg.setAttribute('viewBox',`0 0 1000 ${height}`);svg.style.pointerEvents='auto';loading.textContent='Drag an area to select it.';outline();}catch(error){if(canvas.isConnected)loading.textContent='Could not render evidence: '+error.message;}
    }
    $('#evidence-page').onchange=e=>{page=Number(e.target.value);rect=null;svg.innerHTML='';paint();};
    svg.onpointerdown=e=>{start=position(e);svg.setPointerCapture(e.pointerId);e.preventDefault();};
    svg.onpointermove=e=>{if(!start)return;rect=normalizeRect(start,position(e));outline();};
    svg.onpointerup=e=>{if(!start)return;rect=normalizeRect(start,position(e));start=null;outline();};
    svg.onpointercancel=()=>{start=null;rect=null;outline();};
    svg.onwheel=e=>{if(start)e.preventDefault();};paint();
  }
  function viewEvidence(title,locations,back){
    const sides=locations.filter(Boolean);
    show(title,`<p class="modal-description">Captured drawing evidence. Locations remain tied to the loaded PDF files.</p><div class="evidence-crops">${sides.map((location,i)=>`<figure><figcaption>${locationText(location)}</figcaption><div id="evidence-crop-${i}" class="evidence-crop">Rendering evidence…</div></figure>`).join('')||'<p>No evidence locations selected.</p>'}</div><div class="modal-actions"><button class="button" id="evidence-back">Back</button></div>`,back);
    $('#evidence-back').onclick=back||(()=>$('#dialog').close());
    sides.forEach(async(location,i)=>{const slot=$(`#evidence-crop-${i}`);try{const canvas=await renderEvidenceCrop(getState()[location.side],location);if(slot.isConnected)slot.replaceChildren(canvas);}catch(error){if(slot.isConnected)slot.textContent=error.message;}});
  }
  function manageReferences(){
    const model=getState().impact;
    show('Linked reference locations',`<p class="modal-description">Link a panel-schedule row to a panel/circuit, or a single-line area to a panel. Choose locations within the loaded PDFs.</p><button class="button primary" id="reference-new">Add reference</button><div class="impact-reference-list">${model.references.map(reference=>`<article class="impact-card"><strong>${esc(reference.label)}</strong><p>${reference.type==='schedule'?'Panel schedule':'Single-line'} · ${esc(reference.panel)} ${esc(reference.circuit)}</p><p>${locationText(reference.before)} / ${locationText(reference.after)}</p><button class="button" data-reference-edit="${reference.id}">Edit reference</button><button class="button danger" data-reference-delete="${reference.id}">Delete reference</button></article>`).join('')||'<p class="impact-empty">No references linked yet.</p>'}</div>`);
    $('#reference-new').onclick=()=>editReference(null,{},manageReferences);
    document.querySelectorAll('[data-reference-edit]').forEach(button=>button.onclick=()=>editReference(model.references.find(reference=>reference.id===Number(button.dataset.referenceEdit)),{},manageReferences));
    document.querySelectorAll('[data-reference-delete]').forEach(button=>button.onclick=()=>{apply(deleteReference(getState().impact,Number(button.dataset.referenceDelete)));manageReferences();});
  }
  function editReference(existing=null,prefill={},back=null){
    const state=getState();if(!state.old||!state.new){toast('Load both PDFs before linking references.');return;}
    const reference=existing?structuredClone(existing):{id:nextId(state.impact.references),type:prefill.type||'schedule',panel:prefill.panel||'',circuit:prefill.circuit||'',label:'',before:null,after:null};
    function collect(){reference.type=$('#reference-type').value;reference.label=$('#reference-label').value.trim();reference.panel=$('#reference-panel').value.trim();reference.circuit=reference.type==='schedule'?$('#reference-circuit').value.trim():'';return reference;}
    function draw(){
      show(existing?'Edit reference':'Link reference',`<div class="form-grid"><label>Reference type<select id="reference-type"><option value="schedule" ${reference.type==='schedule'?'selected':''}>Panel schedule</option><option value="single-line" ${reference.type==='single-line'?'selected':''}>Single-line diagram</option></select></label><label>Label<input id="reference-label" maxlength="80" value="${esc(reference.label)}" placeholder="LP-1 circuit 7 schedule"></label><label>Panel<input id="reference-panel" maxlength="40" value="${esc(reference.panel)}"></label><label ${reference.type==='single-line'?'hidden':''}>Circuit<input id="reference-circuit" maxlength="40" value="${esc(reference.circuit)}"></label></div><p class="modal-description">Select at least one reference location. Missing before/after locations stay visible to the reviewer.</p><div class="impact-side-grid">${['before','after'].map(name=>`<fieldset class="impact-side"><legend>${name==='before'?'Before · original':'After · revised'}</legend><p>${locationText(reference[name])}</p><button class="button" id="reference-${name}-pick">Select reference area</button>${reference[name]?`<button class="button" id="reference-${name}-clear">Clear location</button>`:''}</fieldset>`).join('')}</div><div class="modal-actions"><button class="button" id="reference-cancel">Cancel</button><button class="button primary" id="reference-save">Save reference</button></div>`,back);
      $('#reference-type').onchange=()=>{collect();draw();};
      for(const name of ['before','after']){
        $(`#reference-${name}-pick`).onclick=()=>{collect();pickEvidence(name==='before'?'old':'new',reference[name],location=>{reference[name]=location;draw();},draw);};
        if($(`#reference-${name}-clear`))$(`#reference-${name}-clear`).onclick=()=>{collect();reference[name]=null;draw();};
      }
      $('#reference-cancel').onclick=back||(()=>$('#dialog').close());
      $('#reference-save').onclick=async()=>{const button=$('#reference-save'),controls=[...$('#dialog-body').querySelectorAll('input,select,textarea,button:not(#close-dialog):not(#reference-cancel)')];try{const candidate=structuredClone(collect());controls.forEach(control=>control.disabled=true);const documents=await context({...state.impact,references:[...state.impact.references,candidate]});if(!button.isConnected||!$('#dialog').open)return;apply(upsertReference(state.impact,candidate,documents));if(back)back();else $('#dialog').close();toast('Reference linked. Affected reviews are pending.');}catch(error){fail(error);}finally{controls.forEach(control=>{if(control.isConnected)control.disabled=false;});}};
    }
    draw();
  }
  function reviewTask(key,draft=null){
    const state=getState(),task=deriveImpact(state.impact).tasks.find(item=>item.key===key);if(!task)return;
    if(draft){task.status=draft.status;task.note=draft.note;}
    show('Review linked task',`<p class="modal-description">${task.type==='schedule'?'Panel schedule':'Single-line diagram'} · ${esc(task.panel)} ${esc(task.circuit)}. Inspect the changed drawing evidence and linked references before recording your review.</p><div class="impact-section"><h3>Contributing changes</h3>${task.recordIds.map(id=>{const record=state.impact.records.find(item=>item.id===id);return `<button class="button full" data-task-record="${id}">${esc(record.label)} · View before / after</button>`;}).join('')}</div><div class="impact-section"><h3>Reference evidence</h3>${task.referenceIds.map(id=>{const reference=state.impact.references.find(item=>item.id===id);return `<button class="button full" data-task-reference="${id}">${esc(reference.label)} · View locations</button>`;}).join('')||'<p>No schedule reference linked. Link one, or explain why this review is not applicable.</p>'}</div><label>Review outcome<select id="task-status"><option value="pending" ${task.status==='pending'?'selected':''}>Pending</option><option value="checked" ${task.status==='checked'?'selected':''} ${task.referenceIds.length?'':'disabled'}>Checked</option><option value="not-applicable" ${task.status==='not-applicable'?'selected':''}>Not applicable</option></select></label><label>Review note<textarea id="task-note" maxlength="600" rows="3" placeholder="Required when not applicable">${esc(task.note)}</textarea></label><p class="microcopy">Checked records your acknowledgement. It does not certify the electrical design.</p><div class="modal-actions"><button class="button" id="task-cancel">Cancel</button><button class="button primary" id="task-save">Save review outcome</button></div>`);
    const view=(title,locations)=>{const outcome={status:$('#task-status').value,note:$('#task-note').value};viewEvidence(title,locations,()=>reviewTask(key,outcome));};
    document.querySelectorAll('[data-task-record]').forEach(button=>button.onclick=()=>{const record=state.impact.records.find(item=>item.id===Number(button.dataset.taskRecord));view(record.label,[record.before?.evidence,record.after?.evidence]);});
    document.querySelectorAll('[data-task-reference]').forEach(button=>button.onclick=()=>{const reference=state.impact.references.find(item=>item.id===Number(button.dataset.taskReference));view(reference.label,[reference.before,reference.after]);});
    $('#task-cancel').onclick=()=>$('#dialog').close();
    $('#task-save').onclick=()=>{try{apply(setTaskOutcome(state.impact,key,$('#task-status').value,$('#task-note').value));$('#dialog').close();toast('Review outcome saved.');}catch(error){fail(error);}};
  }
  return {render,trackAnnotation,editRecord,exportCsv};
}
