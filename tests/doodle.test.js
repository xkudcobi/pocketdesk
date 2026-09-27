const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../js/core/doodle.js');

test('simplify drops points on straight lines and keeps corners', () => {
  const line = [];
  for (let i = 0; i <= 100; i++) line.push(i, i * 0.5);
  assert.deepEqual(D.simplify(line, 0.5), [0, 0, 100, 50]);
  const corner = [0, 0, 5, 0, 10, 0, 10, 5, 10, 10];
  assert.deepEqual(D.simplify(corner, 0.5), [0, 0, 10, 0, 10, 10]);
});

test('simplify handles tiny inputs and very long strokes', () => {
  assert.deepEqual(D.simplify([], 1), []);
  assert.deepEqual(D.simplify([3, 4], 1), [3, 4]);
  assert.deepEqual(D.simplify([1, 1, 2, 2], 1), [1, 1, 2, 2]);
  const wave = [];
  for (let i = 0; i < 50000; i++) wave.push(i, Math.sin(i / 50) * 40);
  const out = D.simplify(wave, 1);
  assert.ok(out.length < wave.length / 10, 'long stroke shrinks a lot');
  assert.deepEqual(out.slice(0, 2), [0, 0]);
  assert.deepEqual(out.slice(-2), wave.slice(-2));
});

test('makeStroke rounds coordinates', () => {
  const s = D.makeStroke([1.234, 5.678, 30.01, 40.06], '#e63946', 7);
  assert.deepEqual(s, { c: '#e63946', s: 7, p: [1.2, 5.7, 30, 40.1] });
});

test('encode and decode round trip', () => {
  const doc = D.blank();
  doc.strokes.push(D.makeStroke([0, 0, 10, 10, 20, 0], '#2a9d8f', 3));
  const back = D.decode(D.encode(doc));
  assert.deepEqual(back.strokes, doc.strokes);
  assert.equal(D.pointCount(back), 3);
});

test('decode is defensive', () => {
  assert.equal(D.decode('not json'), null);
  assert.equal(D.decode('{"strokes": 5}'), null);
  assert.deepEqual(D.decode('').strokes, [], 'an empty file is a blank page');
  const messy = JSON.stringify({
    bg: 'javascript:alert(1)',
    strokes: [
      { c: 'red', s: 999, p: [1, 2, 3, 4] },
      { c: '#123456', s: 4, p: [1, 2, 3] },
      { c: '#123456', s: 4, p: [1, 'x'] },
      null
    ]
  });
  const doc = D.decode(messy);
  assert.equal(doc.bg, D.BACKGROUND);
  assert.equal(doc.strokes.length, 1);
  assert.equal(doc.strokes[0].c, '#2b2d42');
  assert.equal(doc.strokes[0].s, 4);
});
