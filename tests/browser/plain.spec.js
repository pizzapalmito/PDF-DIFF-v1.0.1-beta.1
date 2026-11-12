import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {PDFDocument} from 'pdf-lib';
import {createDemo} from '../../src/demo.js';
async function ready(page){await expect(page.locator('#loading')).not.toHaveClass(/visible/);await expect(page.locator('#drawing')).toHaveJSProperty('width',3200);}
test.beforeEach(async({page})=>{page.errors=[];page.on('pageerror',e=>page.errors.push(e.message));await page.goto('/');await ready(page);});
test.afterEach(async({page})=>expect(page.errors).toEqual([]));
test('generic comparison, modes, page navigation and repeated dialogs',async({page},info)=>{
 await expect(page.locator('body')).not.toContainText(/Electrical|MEP|Northline|POWER & SYSTEMS/);
 await expect(page.locator('[data-tool=device]')).toHaveCount(0);await expect(page.locator('.change-card').first()).toBeVisible();
 for(const mode of ['split','revised','overlay']){await page.locator(`[data-mode=${mode}]`).click();await expect(page.locator(`[data-mode=${mode}]`)).toHaveClass(/active/);}
 await page.locator('#page-picker').selectOption('2');await ready(page);await expect(page.locator('#sheet-stage-label')).toHaveText('Page 2');
 for(let i=0;i<2;i++){await page.locator('#compare-settings').click();await page.locator('#close-dialog').click();await expect(page.locator('#dialog')).not.toBeVisible();}
 await page.locator('#expand-workspace').click();await expect(page.locator('#expand-workspace')).toHaveAttribute('aria-pressed','true');await page.locator('#expand-workspace').click();
 await page.screenshot({path:info.outputPath('desktop.png'),fullPage:true});
});
test('review editing, undo, save and restore, CSV/PDF exports',async({page},info)=>{
 await page.locator('.change-card').first().click();await page.locator('#annotation-note').fill('Checked text update');await page.locator('#mark-reviewed').click();
 await page.locator('#undo').click();await page.locator('.change-card').first().click();await expect(page.locator('#mark-reviewed')).toHaveText(/Mark reviewed/);
 let pending=page.waitForEvent('download');await page.locator('#save-session').click();let d=await pending;let path=info.outputPath('review.json');await d.saveAs(path);const data=JSON.parse(await fs.readFile(path,'utf8'));expect(data.annotations.length).toBeGreaterThan(0);
 await page.locator('#review-input').setInputFiles({name:'review.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});await page.locator('#confirm-review-load').click();await expect(page.locator('#toast')).toContainText('Saved review loaded');
 await page.locator('#export').click();pending=page.waitForEvent('download');await page.locator('#export-csv').click();d=await pending;path=info.outputPath('changes.csv');await d.saveAs(path);expect(await fs.readFile(path,'utf8')).toContain('Checked text update');
 await page.locator('#export').click();pending=page.waitForEvent('download');await page.locator('#export-pdf').click();d=await pending;path=info.outputPath('reviewed.pdf');await d.saveAs(path);expect((await PDFDocument.load(await fs.readFile(path))).getPageCount()).toBe(2);
});
test('PDF replacement cancel and confirm, invalid review remains atomic',async({page})=>{
 const count=await page.locator('.change-card').count();await page.locator('#review-input').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{}')});await expect(page.locator('#toast')).toContainText('Cannot load review');expect(await page.locator('.change-card').count()).toBe(count);
 const buffer=Buffer.from(await createDemo(true));await page.locator('#load-new').click();await page.locator('#file-input').setInputFiles({name:'new.pdf',mimeType:'application/pdf',buffer});await page.locator('#cancel-replace').click();expect(await page.locator('.change-card').count()).toBe(count);
 await page.locator('#file-input').setInputFiles({name:'new2.pdf',mimeType:'application/pdf',buffer});await page.locator('#confirm-replace').click();await ready(page);await expect(page.locator('#old-name')).toHaveText('Sample_Original.pdf');await expect(page.locator('#new-name')).toHaveText('new2.pdf');await expect(page.locator('.change-card')).toHaveCount(0);
});
for(const [width,height] of [[1440,900],[768,800],[390,844],[320,640]])test(`layout at ${width}px`,async({page},info)=>{
 await page.setViewportSize({width,height});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.locator('#compare-settings').click();expect(await page.locator('#dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);await page.locator('#close-dialog').click();await page.screenshot({path:info.outputPath(`layout-${width}.png`),fullPage:true});
});

test('manual cloud and note, drag undo, settings and no removed device shortcut',async({page})=>{
 await page.locator('#fit').click();await page.locator('[data-tool=cloud]').click();let box=await page.locator('#markups').boundingBox();const count=await page.locator('#markups [data-id]').count();await page.mouse.move(box.x+box.width*.1,box.y+box.height*.2);await page.mouse.down();await page.mouse.move(box.x+box.width*.25,box.y+box.height*.3,{steps:4});await page.mouse.up();await expect(page.locator('#markups [data-id]')).toHaveCount(count+1);
 await page.locator('[data-tool=note]').click();await page.mouse.click(box.x+box.width*.3,box.y+box.height*.3);await expect(page.locator('#annotation-label')).toHaveValue('Review note');await page.locator('#annotation-label').fill('Check this paragraph');await page.locator('#deselect').click();await page.keyboard.press('v');await page.keyboard.press('d');await expect(page.locator('[data-tool=select]')).toHaveClass(/active/);
 await page.locator('#compare-settings').click();await page.locator('#show-clouds').uncheck();await page.locator('#apply-settings').click();await ready(page);await expect(page.locator('#markups path')).toHaveCount(0);
 await expect(page.locator('#load-review')).toBeVisible();await page.setViewportSize({width:390,height:844});await expect(page.locator('#load-review')).toBeVisible();
});
