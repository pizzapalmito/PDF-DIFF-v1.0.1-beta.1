import test from 'node:test';
import assert from 'node:assert/strict';
import { createImpactState, circuitKey, validateImpactState, upsertRecord, deleteRecord, upsertReference, deleteReference, deriveImpact, setTaskOutcome, serializeReview, parseReview, impactCsv } from '../src/impact.js';

const documents = { old: { hash: 'old-sha', name: 'A.pdf', pages: 2, pageHeights: { 1: 700, 2: 1400 } }, new: { hash: 'new-sha', name: 'B.pdf', pages: 2, pageHeights: { 1: 700, 2: 1400 } } };
const evidence = (side, x = 10) => ({ side, page: 1, rect: { x, y: 20, w: 40, h: 50 } });
const snapshot = (side, overrides = {}) => ({ device: 'receptacle', quantity: 2, panel: 'LP1', circuit: '1', va: 180, evidence: evidence(side), ...overrides });
function record(id = 1, kind = 'added', overrides = {}) {
  return { id, kind, status: 'confirmed', label: 'Change', note: '', sourceAnnotationId: null, before: kind === 'added' ? null : snapshot('old'), after: kind === 'removed' ? null : snapshot('new', kind === 'relocated' ? { evidence: evidence('new', 100) } : kind === 'reassigned' ? { circuit: '3' } : {}), ...overrides };
}
const reference = (id = 1, overrides = {}) => ({ id, type: 'schedule', panel: 'LP1', circuit: '1', label: 'Schedule', before: evidence('old'), after: evidence('new'), ...overrides });
const add = (model, r) => upsertRecord(model, r, documents);
const link = (model, r = reference()) => upsertReference(model, r, documents);
const taskKey = (model, index = 0) => deriveImpact(model).tasks[index].key;
const annotation = { id: 9, page: 1, type: 'cloud', x: 10, y: 20, w: 100, h: 70, label: 'REV', note: '', status: 'open', kind: 'modified' };
const save = impact => serializeReview({ annotations: [annotation], nextId: 400, impact, ...documents });

test('identities are normalized without delimiter collisions; display values preserved', () => {
  assert.equal(circuitKey(' lp1 ', ' a '), circuitKey('LP1', 'A'));
  assert.notEqual(circuitKey('A:B', 'C'), circuitKey('A', 'B:C'));
  const m = add(createImpactState(), record(1, 'added', { after: snapshot('new', { panel: ' lp1 ' }) }));
  assert.equal(m.records[0].after.panel, ' lp1 ');
});

test('all classifications generate signed contributions including zero-net moves', () => {
  const expected = { added: [360], removed: [-360], relocated: [0], reassigned: [-360, 360], modified: [0] };
  for (const kind of Object.keys(expected)) {
    const d = deriveImpact(add(createImpactState(), record(1, kind)));
    assert.equal(d.confirmed, 1); assert.equal(d.drafts, 0);
    assert.deepEqual(d.circuits.map(c => c.knownVaDelta), expected[kind]);
    assert.equal(d.tasks.length, expected[kind].length);
  }
});

test('grouped multi-device deltas retain known subtotal and count unknown sides', () => {
  let m = add(createImpactState(), record());
  m = add(m, record(2, 'added', { after: snapshot('new', { device: 'light', va: null, quantity: 3 }) }));
  m = add(m, record(3, 'removed', { before: snapshot('old', { va: 0, quantity: 1 }) }));
  m = add(m, record(4, 'added', { status: 'draft', after: snapshot('new', { va: 1000 }) }));
  const d = deriveImpact(m);
  assert.equal(d.drafts, 1); assert.equal(d.confirmed, 3);
  assert.deepEqual(d.circuits[0].quantities, { receptacle: 1, light: 3 });
  assert.equal(d.circuits[0].knownVaDelta, 360); assert.equal(d.circuits[0].missingVa, 1);
  assert.deepEqual(d.tasks[0].recordIds, [1, 2, 3]);
});

test('relocation and reassignment preserve required device fields', () => {
  for (const kind of ['relocated', 'reassigned']) {
    const r = record(1, kind); r.after.quantity++;
    assert.throws(() => add(createImpactState(), r));
  }
  assert.throws(() => add(createImpactState(), record(1, 'relocated', { after: snapshot('new') })));
  assert.throws(() => add(createImpactState(), record(1, 'reassigned', { after: snapshot('new', { panel: ' lp1 ' }) })));
  const r = record(1, 'modified'); r.after.device = 'light'; r.after.quantity = 4; r.after.va = 20;
  assert.equal(deriveImpact(add(createImpactState(), r)).circuits[0].knownVaDelta, -280);
});

test('drafts can be incomplete but never contain invalid numeric data', () => {
  const r = record(1, 'added', { status: 'draft', after: snapshot('new', { quantity: 0, panel: '', circuit: '', va: null, evidence: null }) });
  assert.equal(deriveImpact(add(createImpactState(), r)).tasks.length, 0);
  assert.throws(() => add(createImpactState(), { ...r, status: 'confirmed' }));
  for (const value of [NaN, Infinity, -1, 100001, '180', undefined]) assert.throws(() => add(createImpactState(), { ...r, after: { ...r.after, va: value } }));
  for (const quantity of [-1, 0.5, 10001, Infinity]) assert.throws(() => add(createImpactState(), { ...r, after: { ...r.after, quantity } }));
});

test('confirmed relocation has a known zero load delta when unchanged VA is unknown',()=>{
  const r=record(1,'relocated');r.before.va=null;r.after.va=null;
  const circuit=deriveImpact(add(createImpactState(),r)).circuits[0];
  assert.equal(circuit.knownVaDelta,0);assert.equal(circuit.missingVa,0);assert.equal(circuit.quantities.receptacle,0);
});

test('editing a confirmed record into a new draft assignment reopens both shared circuits',()=>{
  let m=add(add(createImpactState(),record()),record(2,'added',{after:snapshot('new',{circuit:'7'})}));
  for(const task of deriveImpact(m).tasks)m=setTaskOutcome(m,task.key,'not-applicable','Reviewed');
  const edited=add(m,record(1,'added',{status:'draft',after:snapshot('new',{circuit:'7'})}));
  assert.equal(deriveImpact(edited).tasks.length,1);assert.equal(deriveImpact(edited).tasks[0].status,'pending');
});

test('shared tasks reopen on draft edits, deletion and old/new assignment changes', () => {
  let m = link(add(add(createImpactState(), record()), record(2)));
  m = link(m, reference(2, { type: 'single-line', circuit: '' }));
  for (const t of deriveImpact(m).tasks) m = setTaskOutcome(m, t.key, 'checked', 'verified');
  const before = structuredClone(m);
  const edited = add(m, record(1, 'added', { status: 'draft' }));
  assert.ok(deriveImpact(edited).tasks.every(t => t.status === 'pending'));
  assert.deepEqual(m, before);
  const deleted = deleteRecord(m, 1);
  assert.ok(deriveImpact(deleted).tasks.every(t => t.status === 'pending'));
  assert.deepEqual(deleteRecord(deleted, 2).outcomes, []);
  assert.equal(deriveImpact(deleteRecord(deleted, 2)).tasks.length, 0);
  const moved = add(m, record(1, 'added', { after: snapshot('new', { circuit: '7' }) }));
  assert.ok(deriveImpact(moved).tasks.every(t => t.status === 'pending'));
});

test('reference updates and deletion reopen linked work while unrelated work survives', () => {
  let m = link(add(createImpactState(), record()));
  m = add(m, record(2, 'added', { after: snapshot('new', { panel: 'LP2' }) }));
  const keys = deriveImpact(m).tasks.map(t => t.key);
  m = setTaskOutcome(m, keys[0], 'checked', '');
  m = setTaskOutcome(m, keys[1], 'not-applicable', 'No schedule change');
  const edited = link(m, reference(1, { label: 'Updated reference' }));
  assert.deepEqual(deriveImpact(edited).tasks.map(t => t.status), ['pending', 'not-applicable']);
  assert.deepEqual(deriveImpact(deleteReference(m, 1)).tasks.map(t => t.status), ['pending', 'not-applicable']);
  let single = link(m, reference(2, { type: 'single-line', circuit: '' }));
  single = setTaskOutcome(single, 'single-line:2', 'checked', '');
  assert.ok(!deleteReference(single, 2).outcomes.some(o => o.key === 'single-line:2'));
});

test('checklist requires linked evidence for checked and a reason for NA', () => {
  const m = add(createImpactState(), record()), key = taskKey(m);
  assert.throws(() => setTaskOutcome(m, key, 'checked', ''));
  assert.throws(() => setTaskOutcome(m, key, 'not-applicable', '  '));
  assert.throws(() => setTaskOutcome(m, 'dangling', 'pending', ''));
  assert.equal(deriveImpact(setTaskOutcome(m, key, 'not-applicable', 'Reviewed exclusion')).tasks[0].status, 'not-applicable');
});

test('evidence side and actual bounds, reference shape, IDs and limits are validated', () => {
  for (const change of [e => { e.side = 'old'; }, e => { e.page = 3; }, e => { e.rect.y = 690; }, e => { e.rect.x = 980; }, e => { e.rect.h = 0; }, e => { e.rect.w = NaN; }]) {
    const r = record(); change(r.after.evidence); assert.throws(() => add(createImpactState(), r));
  }
  for (const badId of [0, -1, 1.5, '1', Infinity]) assert.throws(() => add(createImpactState(), record(badId)));
  assert.throws(() => validateImpactState({ records: [record(), record()], references: [], outcomes: [] }, documents));
  assert.throws(() => validateImpactState({ records: Array(1001).fill(record()), references: [], outcomes: [] }, documents));
  assert.throws(() => link(createImpactState(), reference(1, { before: null, after: null })));
  assert.throws(() => link(createImpactState(), reference(1, { type: 'single-line' })));
  assert.throws(() => link(createImpactState(), reference(1, { circuit: '' })));
  assert.throws(() => validateImpactState({ ...createImpactState(), outcomes: [{ key: 'gone', status: 'pending', note: '' }] }, documents));
  const tall = record(); tall.after.evidence.page = 2; tall.after.evidence.rect.y = 1000;
  assert.doesNotThrow(() => add(createImpactState(), tall));
});

test('v1 migration preserves revised-only restoration and recomputes nextId', () => {
  const v1 = { version: 1, newHash: 'new-sha', newPages: 2, annotations: [annotation], nextId: -100 };
  assert.deepEqual(parseReview(v1, { new: documents.new }), { annotations: [annotation], nextId: 10, impact: createImpactState() });
  assert.throws(() => parseReview({ ...v1, newHash: 'different' }, documents));
});

test('v2 roundtrip binds both fingerprints for impacts, including references-only', () => {
  const m = link(add(createImpactState(), record()));
  const completed = setTaskOutcome(m, taskKey(m), 'checked', 'Confirmed drawing evidence');
  const data = save(completed), parsed = parseReview(JSON.parse(JSON.stringify(data)), documents);
  assert.deepEqual(parsed.impact, completed); assert.equal(data.version, 2); assert.equal(data.nextId, 10);
  parsed.impact.records[0].label = 'Other'; assert.equal(completed.records[0].label, 'Change');
  for (const impact of [completed, link(createImpactState())]) {
    const saved = save(impact);
    assert.throws(() => parseReview(saved, { new: documents.new }));
    assert.throws(() => parseReview({ ...saved, oldHash: 'other' }, documents));
    assert.throws(() => parseReview({ ...saved, oldPages: 1 }, documents));
    assert.throws(() => parseReview({ ...saved, newPages: 1 }, documents));
  }
  assert.deepEqual(parseReview(save(createImpactState()), { new: documents.new }).impact, createImpactState());
});

test('review parsing rejects duplicates, invalid types/nonfinite geometry and orphan outcomes atomically', () => {
  const original = save(createImpactState());
  for (const annotations of [[annotation, annotation], [{ ...annotation, id: '9' }], [{ ...annotation, x: Infinity }], [{ ...annotation, label: null }], [{ ...annotation, type: 'unknown' }], [{ ...annotation, kind: {} }]]) assert.throws(() => parseReview({ ...original, annotations }, documents));
  const corrupt = save(add(createImpactState(), record()));
  corrupt.impact.outcomes.push({ key: 'missing', status: 'checked', note: '' });
  assert.throws(() => parseReview(corrupt, documents));
  assert.deepEqual(original.annotations, [annotation]);
});

test('serialization omits loaded PDF internals and CSV escapes user text and distinguishes drafts', () => {
  const data = serializeReview({ annotations: [], impact: createImpactState(), old: { ...documents.old, bytes: [1, 2], doc: {} }, new: { ...documents.new, canvas: {} } });
  assert.ok(!JSON.stringify(data).includes('bytes')); assert.ok(!JSON.stringify(data).includes('canvas'));
  let m = link(add(createImpactState(), record(1, 'added', { label: '=FORMULA("x")', note: 'line 1\nline 2' })));
  m = add(m, record(2, 'added', { status: 'draft' }));
  m = setTaskOutcome(m, taskKey(m), 'checked', '@check');
  const csv = impactCsv(m);
  assert.ok(csv.includes('"\'=FORMULA(""x"")"')); assert.ok(csv.includes('"line 1\nline 2"'));
  assert.ok(csv.includes('"draft"')); assert.ok(csv.includes('"\'@check"'));
  assert.ok(csv.includes('old page 1 rect 10,20,40,50'));
});
