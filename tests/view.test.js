import test from 'node:test';
import assert from 'node:assert/strict';
import {fittedDrawingWidth} from '../src/view.js';

test('landscape paper fits the height of a wide drawing stage', () => {
  assert.equal(fittedDrawingWidth(1000, 350, 10 / 7), 500);
});
test('portrait paper fits by height without being stretched to the stage width', () => {
  const width = fittedDrawingWidth(800, 600, 0.75);
  assert.equal(width, 450);
  assert.equal(width / 0.75, 600);
});
test('a narrow stage limits the paper width', () => {
  assert.equal(fittedDrawingWidth(300, 600, 10 / 7), 300);
});
test('split fit includes two complete pages and the space between them', () => {
  const strip = fittedDrawingWidth(1200, 350, 10 / 7, true);
  assert.equal(strip, 1016);
  assert.equal((strip - 16) / 2 / (10 / 7), 350);
  assert.equal(fittedDrawingWidth(600, 350, 10 / 7, true), 600);
});
test('unavailable or invalid layout dimensions yield a safe finite width', () => {
  for (const dimensions of [[0,600,1], [600,-1,1], [600,600,0], [NaN,600,1], [600,600,Infinity]]) {
    assert.equal(fittedDrawingWidth(...dimensions), 1);
  }
});
