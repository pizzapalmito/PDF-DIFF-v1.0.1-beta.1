// Historical alternatives remain available in development. Revision bench is
// now native app markup and state handling, without the old study observers.
import '../src/app.js';
import './preview.css';

const direction = new URLSearchParams(location.search).get('direction');
document.body.dataset.direction = ['bench', 'ledger', 'table'].includes(direction) ? direction : 'bench';
document.querySelector('.app-footer > span:first-child').textContent = 'Design study · sample drawings · not for construction';
document.title = 'PDF DIFF — ' + {bench:'Revision bench',ledger:'Review ledger',table:'Light table'}[document.body.dataset.direction] + ' study';
if (document.body.dataset.direction === 'table') document.querySelector('[data-mode="split"]').click();
