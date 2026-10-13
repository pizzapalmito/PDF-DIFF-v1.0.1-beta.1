import { DEVICE_TYPES, csvCell } from './core.js';

const kinds = ['added', 'removed', 'relocated', 'reassigned', 'modified'];
const statuses = ['pending', 'checked', 'not-applicable'];
const clone = value => structuredClone(value);
const canonical = value => value.trim().toUpperCase();
const assert = (condition, message) => { if (!condition) throw Error(message); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max) => typeof value === 'string' && value.length <= max;
const id = value => Number.isSafeInteger(value) && value > 0;
const number = (value, max) => Number.isFinite(value) && value >= 0 && value <= max;
export const createImpactState = () => ({ records: [], references: [], outcomes: [] });
export const circuitKey = (panel, circuit) => JSON.stringify([canonical(panel), canonical(circuit)]);

function validateEvidence(e, side, documents) {
  assert(object(e) && e.side === side && id(e.page), 'Invalid evidence side or page.');
  const doc = documents?.[side], r = e.rect, height = doc?.pageHeights?.[e.page];
  assert(doc && e.page <= doc.pages && Number.isFinite(height) && height > 0, 'Evidence requires the matching PDF page bounds.');
  assert(object(r) && number(r.x, 1000) && number(r.y, height) && Number.isFinite(r.w) && r.w > 0 && Number.isFinite(r.h) && r.h > 0 && r.x + r.w <= 1000 + 1e-6 && r.y + r.h <= height + 1e-6, 'Evidence rectangle is outside its PDF page.');
}
function validateRecord(r, documents) {
  assert(object(r) && id(r.id) && kinds.includes(r.kind) && ['draft', 'confirmed'].includes(r.status) && text(r.label, 80) && text(r.note, 600) && (r.sourceAnnotationId === null || id(r.sourceAnnotationId)), 'Invalid impact record.');
  assert(r.kind === 'added' ? r.before === null && object(r.after) : r.kind === 'removed' ? object(r.before) && r.after === null : object(r.before) && object(r.after), 'Invalid change sides.');
  for (const [field, side] of [['before', 'old'], ['after', 'new']]) {
    const s = r[field]; if (s === null) continue;
    assert(object(s) && Object.hasOwn(DEVICE_TYPES, s.device) && Number.isInteger(s.quantity) && number(s.quantity, 10000) && text(s.panel, 40) && text(s.circuit, 40) && (s.va === null || number(s.va, 100000)), 'Invalid device snapshot.');
    if (s.evidence !== null) validateEvidence(s.evidence, side, documents);
    if (r.status === 'confirmed') assert(s.quantity > 0 && canonical(s.panel) && canonical(s.circuit) && s.evidence !== null, 'Confirmed changes require quantity, assignment and evidence.');
  }
  if (r.status !== 'confirmed' || !r.before || !r.after) return;
  const a = r.before, b = r.after;
  const sameDevice = a.device === b.device && a.quantity === b.quantity && a.va === b.va;
  const sameAssignment = circuitKey(a.panel, a.circuit) === circuitKey(b.panel, b.circuit);
  if (r.kind === 'reassigned') assert(sameDevice && !sameAssignment, 'Reassigned changes must change only assignment and location.');
  if (r.kind === 'relocated') {
    const location = e => JSON.stringify([e.page, e.rect.x, e.rect.y, e.rect.w, e.rect.h]);
    assert(sameDevice && sameAssignment && location(a.evidence) !== location(b.evidence), 'Relocated changes require unchanged device data and a different location.');
  }
}
function validateReference(r, documents) {
  assert(object(r) && id(r.id) && ['schedule', 'single-line'].includes(r.type) && text(r.panel, 40) && canonical(r.panel) && text(r.circuit, 40) && (r.type === 'schedule' ? canonical(r.circuit) : r.circuit === '') && text(r.label, 80) && (r.before !== null || r.after !== null), 'Invalid drawing reference.');
  if (r.before !== null) validateEvidence(r.before, 'old', documents);
  if (r.after !== null) validateEvidence(r.after, 'new', documents);
}

export function deriveImpact(model) {
  const confirmed = model.records.filter(r => r.status === 'confirmed'), drafts = model.records.filter(r => r.status === 'draft');
  const groups = new Map();
  for (const r of confirmed) for (const [s, sign] of [[r.before, -1], [r.after, 1]]) {
    if (!s) continue;
    const key = circuitKey(s.panel, s.circuit);
    if (!groups.has(key)) groups.set(key, { key, panel: s.panel.trim(), circuit: s.circuit.trim(), quantities: {}, knownVaDelta: 0, missingVa: 0, recordIds: [] });
    const g = groups.get(key);
    g.quantities[s.device] = (g.quantities[s.device] || 0) + sign * s.quantity;
    // A confirmed relocation explicitly preserves the same load, even when its value is unknown.
    if (s.va === null) { if (r.kind !== 'relocated') g.missingVa++; } else g.knownVaDelta += sign * s.quantity * s.va;
    if (!g.recordIds.includes(r.id)) g.recordIds.push(r.id);
  }
  const circuits = [...groups.values()], tasks = [];
  const task = data => {
    const outcome = model.outcomes.find(o => o.key === data.key);
    tasks.push({ ...data, status: outcome?.status || 'pending', note: outcome?.note || '' });
  };
  for (const c of circuits) task({ key: `schedule:${c.key}`, type: 'schedule', panel: c.panel, circuit: c.circuit, referenceIds: model.references.filter(r => r.type === 'schedule' && circuitKey(r.panel, r.circuit) === c.key).map(r => r.id), recordIds: [...c.recordIds] });
  for (const r of model.references.filter(r => r.type === 'single-line')) {
    const affected = circuits.filter(c => canonical(c.panel) === canonical(r.panel));
    if (affected.length) task({ key: `single-line:${r.id}`, type: 'single-line', panel: r.panel.trim(), circuit: '', referenceIds: [r.id], recordIds: [...new Set(affected.flatMap(c => c.recordIds))] });
  }
  return clone({ confirmed: confirmed.length, drafts: drafts.length, circuits, tasks });
}

function validateOutcomes(model) {
  const tasks = deriveImpact({ ...model, outcomes: [] }).tasks, keys = new Set();
  for (const o of model.outcomes) {
    assert(object(o) && typeof o.key === 'string' && !keys.has(o.key) && statuses.includes(o.status) && text(o.note, 600), 'Invalid task outcome.');
    const task = tasks.find(t => t.key === o.key);
    assert(task, 'Orphan task outcome.');
    assert(o.status !== 'checked' || task.referenceIds.length > 0, 'Link a drawing reference before checking a task.');
    assert(o.status !== 'not-applicable' || o.note.trim(), 'Not applicable requires a reason.');
    keys.add(o.key);
  }
}
export function validateImpactState(model, documents) {
  assert(object(model) && Array.isArray(model.records) && model.records.length <= 1000 && Array.isArray(model.references) && model.references.length <= 1000 && Array.isArray(model.outcomes) && model.outcomes.length <= 5000, 'Invalid impact state.');
  for (const [items, validate] of [[model.records, validateRecord], [model.references, validateReference]]) {
    const ids = new Set();
    for (const item of items) { validate(item, documents); assert(!ids.has(item.id), 'Duplicate impact ID.'); ids.add(item.id); }
  }
  validateOutcomes(model);
}

// Reopen shared tasks on either side of an edit; unrelated completed work survives.
function changed(model, collection, value, remove = false) {
  const result = clone(model), before = deriveImpact(model).tasks;
  result[collection] = result[collection].filter(r => r.id !== value.id);
  if (!remove) result[collection].push(clone(value));
  const after = deriveImpact(result).tasks;
  const linked = task => (collection === 'records' ? task.recordIds : task.referenceIds).includes(value.id);
  const reopen = new Set([...before, ...after].filter(linked).map(t => t.key));
  if(collection==='records'){
    const old=model.records.find(record=>record.id===value.id);
    if(old?.status==='confirmed'||value.status==='confirmed'){
      const sides=[old?.before,old?.after,value.before,value.after].filter(Boolean);
      const assignments=new Set(sides.map(side=>circuitKey(side.panel,side.circuit))),panels=new Set(sides.map(side=>canonical(side.panel)));
      for(const task of [...before,...after])if(task.type==='schedule'?assignments.has(circuitKey(task.panel,task.circuit)):panels.has(canonical(task.panel)))reopen.add(task.key);
    }
  }
  const valid = new Set(after.map(t => t.key));
  result.outcomes = result.outcomes.filter(o => valid.has(o.key) && !reopen.has(o.key));
  return result;
}
export function upsertRecord(model, record, documents) {
  validateRecord(record, documents);
  const result = changed(model, 'records', record); validateImpactState(result, documents); return result;
}
export function deleteRecord(model, recordId) { assert(id(recordId), 'Invalid record ID.'); return changed(model, 'records', { id: recordId }, true); }
export function upsertReference(model, reference, documents) {
  validateReference(reference, documents);
  const result = changed(model, 'references', reference); validateImpactState(result, documents); return result;
}
export function deleteReference(model, referenceId) { assert(id(referenceId), 'Invalid reference ID.'); return changed(model, 'references', { id: referenceId }, true); }
export function setTaskOutcome(model, key, status, note) {
  const result = clone(model);
  result.outcomes = result.outcomes.filter(o => o.key !== key);
  result.outcomes.push({ key, status, note }); validateOutcomes(result); return result;
}

function validateAnnotations(annotations, doc) {
  assert(Array.isArray(annotations) && annotations.length <= 10000, 'Invalid annotations.');
  const ids = new Set();
  for (const a of annotations) {
    assert(object(a) && id(a.id) && a.id < Number.MAX_SAFE_INTEGER && !ids.has(a.id) && ['cloud', 'device', 'note'].includes(a.type) && id(a.page) && a.page <= doc.pages && number(a.x, 1000) && number(a.y, 10000) && text(a.label, 80) && text(a.note, 600) && ['open', 'reviewed'].includes(a.status) && (a.kind === undefined || ['added', 'removed', 'modified'].includes(a.kind)), 'Invalid annotation data.');
    ids.add(a.id);
    if (a.type === 'cloud') assert(Number.isFinite(a.w) && a.w > 0 && a.w <= 1000 && Number.isFinite(a.h) && a.h > 0 && a.h <= 10000, 'Invalid cloud geometry.');
    if (a.type === 'device') assert(Object.hasOwn(DEVICE_TYPES, a.device) && number(a.va, 100000) && text(a.circuit, 40), 'Invalid device data.');
  }
}
export function parseReview(data, documents) {
  assert(object(data) && [1, 2].includes(data.version), 'Unsupported review file.');
  const revised = documents?.new;
  assert(revised && typeof revised.hash === 'string' && revised.hash && id(revised.pages) && data.newHash === revised.hash && data.newPages === revised.pages, 'Load the matching revised PDF first.');
  validateAnnotations(data.annotations, revised);
  const impact = data.version === 1 ? createImpactState() : data.impact;
  validateImpactState(impact, documents);
  if (impact.records.length || impact.references.length) {
    const original = documents?.old;
    assert(original && typeof original.hash === 'string' && original.hash && id(original.pages) && data.oldHash === original.hash && data.oldPages === original.pages, 'Impact reviews require both matching original and revised PDFs.');
  }
  return clone({ annotations: data.annotations, nextId: Math.max(0, ...data.annotations.map(a => a.id)) + 1, impact });
}
export function serializeReview({ annotations, impact, old, new: revised }) {
  const data = { version: 2, oldName: old?.name ?? null, oldHash: old?.hash ?? null, oldPages: old?.pages ?? null, newName: revised?.name ?? null, newHash: revised?.hash ?? null, newPages: revised?.pages ?? null, annotations, impact };
  const parsed = parseReview(data, { old, new: revised });
  return JSON.parse(JSON.stringify({ ...data, ...parsed }));
}

export function impactCsv(model) {
  const columns = ['Row', 'ID / Task', 'State', 'Classification', 'Label', 'Before device', 'Before quantity', 'Before panel', 'Before circuit', 'Before unit VA', 'Before evidence', 'After device', 'After quantity', 'After panel', 'After circuit', 'After unit VA', 'After evidence', 'Signed quantities by circuit', 'Known VA delta', 'Missing VA sides', 'Note', 'Linked references'];
  const evidence = e => e ? `${e.side} page ${e.page} rect ${e.rect.x},${e.rect.y},${e.rect.w},${e.rect.h}` : '';
  const snapshot = s => s ? [s.device, s.quantity, s.panel, s.circuit, s.va ?? '', evidence(s.evidence)] : ['', '', '', '', '', ''];
  const rows = [columns];
  for (const r of model.records) {
    const delta = deriveImpact({ records: [r], references: [], outcomes: [] }).circuits;
    rows.push(['change', r.id, r.status, r.kind, r.label, ...snapshot(r.before), ...snapshot(r.after), JSON.stringify(delta.map(c => ({ panel: c.panel, circuit: c.circuit, quantities: c.quantities }))), r.status === 'confirmed' ? delta.reduce((n, c) => n + c.knownVaDelta, 0) : '', r.status === 'confirmed' ? delta.reduce((n, c) => n + c.missingVa, 0) : '', r.note, '']);
  }
  for (const t of deriveImpact(model).tasks) rows.push(['task', t.key, t.status, t.type, '', '', '', '', '', '', '', '', '', t.panel, t.circuit, '', '', '', '', '', t.note, t.referenceIds.map(id => { const r = model.references.find(r => r.id === id); return `${r.id} ${r.label}: ${evidence(r.before)} / ${evidence(r.after)}`; }).join('; ')]);
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}

