import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
export async function createDemo(revised=false){
 const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);
 doc.setCreationDate(new Date('2026-11-12T00:00:00Z'));doc.setModificationDate(new Date('2026-11-12T00:00:00Z'));
 const ink=rgb(.18,.20,.24),muted=rgb(.48,.51,.56),line=rgb(.87,.88,.90);
 for(let n=0;n<2;n++){
 const p=doc.addPage([1000,700]);const text=(t,x,y,size=12,heavy=false)=>p.drawText(t,{x,y:700-y,size,font:heavy?bold:font,color:ink});
 p.drawRectangle({x:0,y:620,width:1000,height:80,color:rgb(.96,.97,.98)});
 text('SAMPLE DOCUMENT',55,43,11,true);text('PDF DIFF / COMPARISON EXAMPLE',700,43,9);
 text(n===0?'Project overview':'Delivery checklist',55,126,30,true);
 text('A simple example of changes between two document versions.',55,157,12);
 const rows=n===0?[['Project','Website refresh'],['Owner',revised?'Morgan Chen':'Alex Rivera'],['Delivery date',revised?'November 27, 2026':'November 20, 2026'],['Status','In progress']]:[['01','Confirm content and structure'],['02',revised?'Review accessibility and contrast':'Review visual design'],['03','Test document exports'],['04',revised?'Publish approved version':'Prepare launch notes']];
 rows.forEach(([a,b],i)=>{const y=220+i*62;p.drawLine({start:{x:55,y:700-y+24},end:{x:945,y:700-y+24},color:line,thickness:1});text(a,55,y,12,true);text(b,260,y,14);});
 text('Notes',55,510,15,true);text(revised?'Use the revised schedule for the next review.':'Use the current schedule for the next review.',55,540,12);
 if(revised)text('New: share the final comparison with the review team.',55,569,12);
 p.drawLine({start:{x:55,y:65},end:{x:945,y:65},color:line,thickness:1});text('Demonstration only. Replace these files with your own PDFs.',55,660,10);text(`Page ${n+1} of 2`,880,660,10);
 }
 return doc.save();
}
