import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import {createDemo} from '../../src/demo.js';

async function ready(page){
  await expect(page.locator('#loading')).not.toHaveClass(/visible/);
  await expect(page.locator('#drawing')).toHaveJSProperty('width',3200);
}
async function openImpact(page){await page.locator('[data-tab="impact"]').click();}
async function fillSide(page,name,{quantity=1,panel='LP-1',circuit='7',va='',device='receptacle'}={}){
  await page.locator(`#${name}-device`).selectOption(device);
  for(const [field,value] of Object.entries({quantity,panel,circuit,va}))await page.locator(`#${name}-${field}`).fill(String(value));
}
async function pick(page,button,{sheet='1',x=.2,y=.2,x2=.45,y2=.45,bottom=false}={}){
  await page.locator(button).click();
  await expect(page.locator('#evidence-loading')).toHaveText('Drag an area to select it.');
  if(sheet!=='1'){
    await page.locator('#evidence-page').selectOption(sheet);
    await expect(page.locator('#evidence-loading')).toHaveText('Drag an area to select it.');
  }
  const svg=page.locator('#evidence-picker');await svg.scrollIntoViewIfNeeded();
  if(bottom)await page.locator('#dialog').evaluate(el=>el.scrollTop=el.scrollHeight);
  const box=await svg.boundingBox();
  await page.mouse.move(box.x+box.width*x,box.y+box.height*y);await page.mouse.down();
  await page.mouse.move(box.x+box.width*x2,box.y+box.height*y2,{steps:4});await page.mouse.up();
  await expect(page.locator('#evidence-use')).toBeEnabled();await page.locator('#evidence-use').click();
}
async function addChange(page,{label='Added receptacles',kind='added',before={},after={},draft=false}={}){
  await openImpact(page);await page.locator('#new-impact').click();
  await page.locator('#impact-kind').selectOption(kind);await page.locator('#impact-label').fill(label);
  if(kind!=='added'){await fillSide(page,'before',before);await pick(page,'#before-pick');}
  if(kind!=='removed'){await fillSide(page,'after',after);await pick(page,'#after-pick',{x:.5,x2:.75});}
  await page.locator(draft?'#impact-save':'#impact-confirm').click();await expect(page.locator('#dialog')).not.toBeVisible();
}
async function saveReview(page,testInfo,name='review.json'){
  const pending=page.waitForEvent('download');await page.locator('#save-session').click();const download=await pending;
  const filename=testInfo.outputPath(name);await download.saveAs(filename);return JSON.parse(await fs.readFile(filename,'utf8'));
}
async function importReview(page,data){
  await page.locator('#review-input').setInputFiles({name:'review.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
}
async function linkSchedule(page,{sheet='2',both=true}={}){
  await page.locator('[data-impact-link]').first().click();await page.locator('#reference-label').fill('LP-1 / 7 schedule row');
  if(both)await pick(page,'#reference-before-pick',{sheet});
  await pick(page,'#reference-after-pick',{sheet});await page.locator('#reference-save').click();
  await expect(page.locator('#dialog')).not.toBeVisible();
}
async function checkTask(page,card=page.locator('.impact-task').first()){
  await card.locator('[data-impact-task]').click();await page.locator('#task-status').selectOption('checked');
  await page.locator('#task-note').fill('Schedule reviewed against entered changes.');await page.locator('#task-save').click();
  await expect(card.locator('.impact-status')).toHaveText('Checked');
}
async function uploadPdf(page,slot,bytes,name){
  const pending=page.waitForEvent('filechooser');await page.locator(slot==='old'?'#load-old':'#load-new').click();
  await(await pending).setFiles({name,mimeType:'application/pdf',buffer:Buffer.from(bytes)});
}

test.beforeEach(async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  const external=[];page.on('request',request=>{const url=request.url();if(/^https?:/.test(url)&&!url.startsWith('http://127.0.0.1:4322/'))external.push(url);});page.qaExternal=external;
  page.qaErrors=errors;await page.goto('/');await ready(page);await expect(page.locator('#annotation-count')).toHaveText('9');
});
test.afterEach(async({page})=>{expect(page.qaErrors).toEqual([]);expect(page.qaExternal).toEqual([]);});

test('cloud to confirmed grouped impact, linked evidence, checked review, saved restore and CSV',async({page},testInfo)=>{
  await page.locator('.change-card').first().click();await page.locator('#track-impact').click();
  await expect(page.locator('#after-va')).toHaveValue('');
  await page.locator('#impact-label').fill('Three added receptacles');await fillSide(page,'after',{quantity:3,va:180});
  await page.locator('#impact-confirm').click();await expect(page.locator('#dialog')).not.toBeVisible();
  await openImpact(page);await expect(page.locator('#review-content')).toContainText('+540 VA');
  await expect(page.locator('#review-content')).toContainText('Duplex receptacle +3');
  await expect(page.locator('.impact-task')).toHaveCount(1);await linkSchedule(page);
  await page.locator('[data-impact-task]').click();await page.locator('#task-status').selectOption('checked');
  await page.locator('#task-note').fill('Preserve this note while inspecting evidence.');
  await page.locator('[data-task-reference]').click();await expect(page.locator('.evidence-crop canvas')).toHaveCount(2);
  await expect(page.locator('.evidence-crops')).toContainText('Original · page 2');await expect(page.locator('.evidence-crops')).toContainText('Revised · page 2');
  await page.screenshot({path:testInfo.outputPath('reference-evidence.png')});await page.locator('#evidence-back').click();
  await expect(page.locator('#task-note')).toHaveValue('Preserve this note while inspecting evidence.');await expect(page.locator('#task-status')).toHaveValue('checked');
  await page.locator('[data-task-record]').click();await expect(page.locator('.evidence-crop canvas')).toHaveCount(1);await page.locator('#evidence-back').click();
  await page.locator('#task-save').click();await expect(page.locator('.impact-status')).toHaveText('Checked');
  const saved=await saveReview(page,testInfo);expect(saved.version).toBe(2);expect(saved.impact.records[0].after.quantity).toBe(3);expect(saved.impact.references[0].after.page).toBe(2);
  const sourceId=saved.impact.records[0].sourceAnnotationId;
  await page.locator('[data-tab="changes"]').click();await page.locator(`.change-card[data-select="${sourceId}"]`).click();await page.locator('#delete-annotation').click();
  await openImpact(page);await expect(page.locator('.impact-record')).toHaveCount(1);
  await page.reload();await ready(page);await importReview(page,saved);await page.locator('#confirm-review-load').click();await openImpact(page);
  await expect(page.locator('.impact-status')).toHaveText('Checked');await expect(page.locator('#review-content')).toContainText('+540 VA');
  const pending=page.waitForEvent('download');await page.locator('#impact-csv').click();const download=await pending,path=testInfo.outputPath('impact.csv');await download.saveAs(path);
  const csv=await fs.readFile(path,'utf8');expect(csv).toContain('Three added receptacles');expect(csv).toContain('"540"');expect(csv).toContain('"checked"');expect(csv).toContain('old page 2 rect');
  await page.screenshot({path:testInfo.outputPath('confirmed-impact.png'),fullPage:true});
});

test('drafts do not contribute; unknown VA and explicit zero remain distinct; undo includes impact edits',async({page},testInfo)=>{
  await openImpact(page);await page.locator('#new-impact').click();await page.locator('#impact-label').fill('Incomplete draft');await page.locator('#impact-save').click();
  await expect(page.locator('.impact-task')).toHaveCount(0);await expect(page.locator('.impact-record')).toContainText('Draft');
  await page.locator('[data-impact-edit]').click();await fillSide(page,'after');await pick(page,'#after-pick');await page.locator('#impact-confirm').click();
  await expect(page.locator('#review-content')).toContainText('Incomplete VA');await expect(page.locator('#review-content')).toContainText('1 unknown input');
  await addChange(page,{label:'Explicit zero',after:{va:0}});let saved=await saveReview(page,testInfo);expect(saved.impact.records.map(record=>record.after.va)).toEqual([null,0]);
  await page.locator('#undo').click();await expect(page.locator('.impact-record')).toHaveCount(1);
  await page.locator('[data-impact-edit]').click();await page.locator('#after-va').fill('50');await page.locator('#impact-save').click();await expect(page.locator('.impact-task')).toHaveCount(0);
  await page.locator('#undo').click();await expect(page.locator('.impact-record')).toContainText('Confirmed');saved=await saveReview(page,testInfo,'undo.json');expect(saved.impact.records[0].after.va).toBeNull();
});

test('reassignment creates two circuit effects; removals use original evidence; unlinked reviews require a reason',async({page},testInfo)=>{
  await addChange(page,{label:'Move devices to circuit 9',kind:'reassigned',before:{quantity:2,va:100},after:{quantity:2,panel:'LP-2',circuit:'9',va:100}});
  await expect(page.locator('.impact-task')).toHaveCount(2);await expect(page.locator('#review-content')).toContainText('-200 VA');await expect(page.locator('#review-content')).toContainText('+200 VA');
  await page.locator('[data-impact-task]').first().click();await expect(page.locator('#task-status option[value="checked"]')).toHaveJSProperty('disabled',true);
  await page.locator('#task-status').selectOption('not-applicable');await page.locator('#task-save').click();await expect(page.locator('#impact-error')).toContainText('reason');
  await page.locator('#task-note').fill('Reviewed relocation; this sheet has no schedule row.');await page.locator('#task-save').click();
  await addChange(page,{label:'Removed receptacle',kind:'removed',before:{quantity:1,va:50}});
  const saved=await saveReview(page,testInfo);const removed=saved.impact.records.find(record=>record.kind==='removed');expect(removed.after).toBeNull();expect(removed.before.evidence.side).toBe('old');
  await expect(page.locator('#review-content')).toContainText('-250 VA');
});

test('record and reference edits reopen linked reviews; single-line references create panel tasks',async({page})=>{
  await addChange(page,{after:{quantity:2,va:100}});await linkSchedule(page,{both:false});await checkTask(page);
  await page.locator('[data-impact-edit]').click();await page.locator('#after-quantity').fill('3');await page.locator('#impact-confirm').click();await expect(page.locator('.impact-status')).toHaveText('Pending');
  await checkTask(page);await page.locator('#impact-references').click();await page.locator('[data-reference-edit]').click();await page.locator('#reference-label').fill('Updated schedule reference');await page.locator('#reference-save').click();await page.locator('#close-dialog').click();await expect(page.locator('.impact-status')).toHaveText('Pending');
  await page.locator('#impact-references').click();await page.locator('#reference-new').click();await page.locator('#reference-type').selectOption('single-line');await page.locator('#reference-label').fill('LP-1 riser');await page.locator('#reference-panel').fill('LP-1');await pick(page,'#reference-after-pick',{sheet:'2'});await page.locator('#reference-save').click();await page.locator('#close-dialog').click();
  await expect(page.locator('.impact-task')).toHaveCount(2);await expect(page.locator('.impact-task').last()).toContainText('Single-line');
});

test('legacy review migration and invalid imports are atomic',async({page},testInfo)=>{
  await addChange(page,{after:{va:100}});const saved=await saveReview(page,testInfo);
  for(const bad of [
    {...saved,oldHash:'different-original'},
    {...saved,impact:{...saved.impact,records:[saved.impact.records[0],saved.impact.records[0]]}},
    {...saved,impact:{...saved.impact,outcomes:[{key:'orphan',status:'checked',note:''}]}},
  ]){
    await importReview(page,bad);await expect(page.locator('#toast')).toContainText('Cannot load review');await expect(page.locator('#confirm-review-load')).toHaveCount(0);
    await expect(page.locator('.impact-record')).toHaveCount(1);
  }
  const v1={version:1,newHash:saved.newHash,newPages:saved.newPages,newName:saved.newName,annotations:saved.annotations,nextId:-1};
  await importReview(page,v1);await page.locator('#confirm-review-load').click();await expect(page.locator('.impact-record')).toHaveCount(0);
  const migrated=await saveReview(page,testInfo,'migrated.json');expect(migrated.version).toBe(2);expect(migrated.annotations).toEqual(saved.annotations);expect(migrated.nextId).toBe(10);expect(migrated.impact.records).toEqual([]);
  const high={...v1,annotations:[{...saved.annotations[0],id:101}]};await importReview(page,high);await page.locator('#confirm-review-load').click();
  await importReview(page,v1);await page.locator('#confirm-review-load').click();await page.locator('#undo').click();
  await page.locator('[data-tool="note"]').click();const box=await page.locator('#markups').boundingBox();await page.mouse.click(box.x+box.width*.2,box.y+box.height*.2);
  const restored=await saveReview(page,testInfo,'undo-import.json');expect(restored.annotations.map(annotation=>annotation.id)).toEqual([101,102]);
});

test('relocated unknown loads remain zero; modified grouped quantities produce the correct delta',async({page})=>{
  await addChange(page,{label:'Relocated group',kind:'relocated',before:{quantity:2},after:{quantity:2}});
  await expect(page.locator('.impact-va')).toHaveText('0 VA');await expect(page.locator('#review-content')).not.toContainText('Incomplete VA');
  await addChange(page,{label:'Changed group load',kind:'modified',before:{quantity:2,va:100},after:{quantity:3,va:150}});
  await expect(page.locator('.impact-va')).toHaveText('+250 VA');await expect(page.locator('#review-content')).toContainText('Duplex receptacle +1');await expect(page.locator('.impact-task')).toHaveCount(1);
});

test('original replacement protects impact state and preserves revised markups; revised replacement clears all',async({page})=>{
  await addChange(page,{after:{va:100}});const original=await createDemo(false),revised=await createDemo(true);
  await uploadPdf(page,'old',original,'other-original.pdf');await expect(page.locator('#dialog-body')).toContainText('Revised markups are retained');await page.locator('#cancel-replace').click();await expect(page.locator('.impact-record')).toHaveCount(1);
  await uploadPdf(page,'old',original,'other-original.pdf');await page.locator('#confirm-replace').click();await ready(page);await expect(page.locator('.impact-record')).toHaveCount(0);await expect(page.locator('#annotation-count')).toHaveText('9');
  await addChange(page,{after:{va:100}});await uploadPdf(page,'new',revised,'other-revised.pdf');await page.locator('#confirm-replace').click();await ready(page);await expect(page.locator('.impact-record')).toHaveCount(0);await expect(page.locator('#annotation-count')).toHaveText('0');
  await expect(page.locator('#undo')).toBeDisabled();
});

test('original-only portrait evidence can use an independently selected unpaired page',async({page},testInfo)=>{
  const original=await PDFDocument.load(await createDemo(false));const font=await original.embedFont(StandardFonts.Helvetica);
  original.addPage([500,700]).drawText('Original-only portrait evidence',{x:50,y:170,size:12,font});
  await uploadPdf(page,'old',await original.save(),'original-three-pages.pdf');await ready(page);
  await openImpact(page);await page.locator('#new-impact').click();await page.locator('#impact-kind').selectOption('removed');await page.locator('#impact-label').fill('Unpaired original removal');await fillSide(page,'before',{va:50});
  await pick(page,'#before-pick',{sheet:'3',x:.2,x2:.5,y:.65,y2:.8,bottom:true});await page.locator('#impact-confirm').click();await expect(page.locator('#dialog')).not.toBeVisible();
  const saved=await saveReview(page,testInfo);expect(saved.oldPages).toBe(3);expect(saved.newPages).toBe(2);expect(saved.impact.records[0].before.evidence.page).toBe(3);expect(saved.impact.records[0].before.evidence.rect.y).toBeGreaterThan(700);
});

test('zoom, cloud dragging, takeoff, navigation and existing exports remain functional',async({page},testInfo)=>{
  const stage=await page.locator('#stage').boundingBox();await page.mouse.move(stage.x+stage.width*.4,stage.y+stage.height*.4);await page.mouse.wheel(0,-100);await expect(page.locator('#zoom-label')).not.toHaveText('100%');
  await page.locator('#fit').click();await page.locator('[data-tool="cloud"]').click();let box=await page.locator('#markups').boundingBox(),count=await page.locator('#markups [data-id]').count(),zoom=await page.locator('#zoom-label').textContent();
  await page.mouse.move(box.x+box.width*.3,box.y+box.height*.3);await page.mouse.down();await page.mouse.move(box.x+box.width*.4,box.y+box.height*.4);await page.mouse.wheel(0,-100);await page.mouse.up();await expect(page.locator('#markups [data-id]')).toHaveCount(count+1);await expect(page.locator('#zoom-label')).toHaveText(zoom);
  await page.locator('[data-tool="device"]').click();await page.mouse.click(box.x+box.width*.2,box.y+box.height*.2);await page.locator('#device-circuit').fill('QA-1');await page.locator('#device-va').fill('240');await page.locator('#load-calculator').click();await expect(page.locator('#circuit-results')).toContainText('2.00 A');await page.locator('#close-dialog').click();
  await page.locator('[data-mode="split"]').click();await expect(page.locator('#split-paper')).toBeVisible();await page.locator('#page-picker').selectOption('2');await ready(page);await expect(page.locator('#sheet-stage-label')).toHaveText('E-102');await page.locator('#expand-workspace').click();await expect(page.locator('#expand-workspace')).toHaveAttribute('aria-pressed','true');await expect(page.locator('#page-picker')).toBeVisible();await page.locator('#expand-workspace').click();
  await page.locator('#export').click();let pending=page.waitForEvent('download');await page.locator('#export-csv').click();let download=await pending,path=testInfo.outputPath('existing-register.csv');await download.saveAs(path);expect(await fs.readFile(path,'utf8')).toContain('QA-1');
  await page.locator('#export').click();pending=page.waitForEvent('download');await page.locator('#export-pdf').click();download=await pending;path=testInfo.outputPath('reviewed.pdf');await download.saveAs(path);expect((await PDFDocument.load(await fs.readFile(path))).getPageCount()).toBe(2);
});

for(const [width,height] of [[1440,900],[768,800],[390,844],[320,640]])test(`impact forms and controls fit ${width}px without horizontal overflow`,async({page},testInfo)=>{
  await page.setViewportSize({width,height});await openImpact(page);await page.locator('#new-impact').click();
  await expect(page.locator('#impact-confirm')).toBeVisible();await expect(page.locator('#after-panel')).toBeVisible();
  expect(await page.locator('#dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath(`impact-editor-${width}.png`),fullPage:true});
  await page.locator('#impact-cancel').click();await expect(page.locator('#fit')).toBeVisible();await expect(page.locator('#page-picker')).toBeVisible();
});
