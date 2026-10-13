import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFDocument } from 'pdf-lib';
import {cloudPath,DEVICE_TYPES,comparePixels} from './core.js';
pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;
export async function loadPdf(bytes,name) {
  const copy=new Uint8Array(bytes);
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',copy))].map(x=>x.toString(16).padStart(2,'0')).join('');
  const doc=await pdfjs.getDocument({data:copy.slice(),isEvalSupported:false}).promise;
  return {doc,bytes:copy,name,pages:doc.numPages,hash};
}
export async function renderPage(pdf,pageNumber,width=3200) {
  const page=await pdf.doc.getPage(pageNumber),base=page.getViewport({scale:1}),viewport=page.getViewport({scale:Math.min(width/base.width,Math.sqrt(24000000/(base.width*base.height)))});
  const canvas=document.createElement('canvas');canvas.width=Math.round(viewport.width);canvas.height=Math.round(viewport.height);
  await page.render({canvasContext:canvas.getContext('2d',{willReadFrequently:true}),viewport}).promise;
  return {canvas,width:base.width,height:base.height};
}
export function saveFile(data,name,type) {
  const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
// Evidence uses the same 1000-unit width as drawing markups, independently for each page.
export async function buildReviewDocuments(original,revised,impact) {
  const documents={old:original,new:revised};
  const result=Object.fromEntries(Object.entries(documents).map(([side,pdf])=>[side,pdf?{hash:pdf.hash,name:pdf.name,pages:pdf.pages,pageHeights:{}}:null]));
  const evidence=[];
  for(const record of impact?.records||[])evidence.push(record?.before?.evidence,record?.after?.evidence);
  for(const reference of impact?.references||[])evidence.push(reference?.before,reference?.after);
  for(const location of evidence){
    if(!location||!['old','new'].includes(location.side)||!Number.isInteger(location.page))continue;
    const pdf=documents[location.side],descriptor=result[location.side];
    if(!pdf||location.page<1||location.page>pdf.pages||descriptor.pageHeights[location.page]!==undefined)continue;
    pdf.pageHeights??={};
    if(pdf.pageHeights[location.page]===undefined){const page=await pdf.doc.getPage(location.page),view=page.getViewport({scale:1});pdf.pageHeights[location.page]=1000*view.height/view.width;}
    descriptor.pageHeights[location.page]=pdf.pageHeights[location.page];
  }
  return result;
}
export async function renderEvidenceCrop(pdf,evidence,width=2400) {
  if(!pdf||!evidence||!Number.isInteger(evidence.page)||evidence.page<1||evidence.page>pdf.pages)throw Error('Evidence PDF or page is unavailable.');
  const rendered=await renderPage(pdf,evidence.page,width),rect=evidence.rect,height=1000*rendered.height/rendered.width;
  if(!rect||![rect.x,rect.y,rect.w,rect.h].every(Number.isFinite)||rect.x<0||rect.y<0||rect.w<=0||rect.h<=0||rect.x+rect.w>1000+.001||rect.y+rect.h>height+.001)throw Error('Evidence area is outside the page.');
  const scale=rendered.canvas.width/1000,crop=document.createElement('canvas');
  crop.width=Math.max(1,Math.ceil(rect.w*scale));crop.height=Math.max(1,Math.ceil(rect.h*scale));
  crop.getContext('2d').drawImage(rendered.canvas,rect.x*scale,rect.y*scale,rect.w*scale,rect.h*scale,0,0,crop.width,crop.height);
  return crop;
}
export function paintComparison(canvas,revised,original,diff,opacity=50) {
  canvas.width=revised.width;canvas.height=revised.height;
  const ctx=canvas.getContext('2d');ctx.drawImage(revised,0,0);
  if(!diff)return;
  ctx.globalAlpha=opacity/100;ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.globalAlpha=.95;ctx.drawImage(diff,0,0);ctx.globalAlpha=1;
  if(opacity!==50){ctx.globalAlpha=Math.abs(opacity-50)/50;ctx.drawImage(opacity<50?revised:original,0,0,canvas.width,canvas.height);ctx.globalAlpha=1;}
}
export async function exportReviewed(pdf,annotations,onProgress,options={}) {
  const out=await PDFDocument.create();out.setTitle('PDF DIFF - reviewed drawing set');out.setSubject('Rasterized review copy with flattened markups');
  for(let n=1;n<=pdf.pages;n++) {
    onProgress?.(n,pdf.pages);
    const {canvas,width,height}=await renderPage(pdf,n,6000),ctx=canvas.getContext('2d');
    if(options.mode==='overlay'&&options.original&&n<=options.original.pages){
      const original=await renderPage(options.original,n,6000);
      if(Math.abs(original.width/original.height-width/height)>.005)throw new Error('Sheet '+n+' has different page proportions. Use Revised export or matching drawings.');
      const aligned=document.createElement('canvas');aligned.width=canvas.width;aligned.height=canvas.height;
      const oldCtx=aligned.getContext('2d');oldCtx.drawImage(original.canvas,0,0,canvas.width,canvas.height);
      const result=comparePixels(oldCtx.getImageData(0,0,canvas.width,canvas.height).data,ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height,options.threshold??55);
      const diff=document.createElement('canvas');diff.width=canvas.width;diff.height=canvas.height;diff.getContext('2d').putImageData(new ImageData(result.output,canvas.width,canvas.height),0,0);
      const revised=document.createElement('canvas');revised.width=canvas.width;revised.height=canvas.height;revised.getContext('2d').drawImage(canvas,0,0);
      paintComparison(canvas,revised,aligned,diff,options.opacity??50);
    }
    // Markups use a normalized 1000-unit drawing width.
    const scale=canvas.width/1000;ctx.save();ctx.scale(scale,scale);ctx.lineWidth=1.8;
    for(const a of annotations.filter(a=>a.page===n&&(a.type!=='cloud'||options.showClouds!==false))) {
      if(a.type==='cloud'){ctx.strokeStyle=a.status==='reviewed'?'#168374':'#df5261';ctx.stroke(new Path2D(cloudPath(a)));ctx.fillStyle=ctx.strokeStyle;ctx.font='bold 11px Arial';ctx.fillText(a.label,a.x,a.y-10);}
      else if(a.type==='device'){ctx.fillStyle=DEVICE_TYPES[a.device].color;ctx.beginPath();ctx.arc(a.x,a.y,9,0,Math.PI*2);ctx.fill();ctx.fillStyle='white';ctx.font='bold 10px Arial';ctx.textAlign='center';ctx.fillText(DEVICE_TYPES[a.device].short,a.x,a.y+3.5);ctx.textAlign='left';}
      else if(a.type==='note'){ctx.fillStyle='#d99512';ctx.fillRect(a.x-7,a.y-7,14,14);ctx.font='11px Arial';ctx.fillStyle='#865706';ctx.fillText(a.label,a.x+13,a.y+4);}
    }
    ctx.restore();const img=await out.embedPng(canvas.toDataURL('image/png'));out.addPage([width,height]).drawImage(img,{x:0,y:0,width,height});
  }
  return out.save();
}
