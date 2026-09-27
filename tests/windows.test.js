const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../js/core/windows.js');

const VP = { w: 1200, h: 800 };

test('opening windows cascades them and focuses the newest', () => {
  const wm = W.createWm();
  const a = W.open(wm, { app: 'notes', w: 400, h: 300 }, VP);
  const b = W.open(wm, { app: 'notes', w: 400, h: 300 }, VP);
  const wa = W.find(wm, a);
  const wb = W.find(wm, b);
  assert.notDeepEqual([wa.x, wa.y], [wb.x, wb.y]);
  assert.equal(wm.focusedId, b);
  assert.ok(wb.z > wa.z);
});

test('singleton and keyed windows are reused', () => {
  const wm = W.createWm();
  const a = W.open(wm, { app: 'calc', singleton: true }, VP);
  W.open(wm, { app: 'notes' }, VP);
  assert.equal(W.open(wm, { app: 'calc', singleton: true }, VP), a);
  assert.equal(wm.focusedId, a);
  const k = W.open(wm, { app: 'notes', key: 'notes:n1' }, VP);
  assert.equal(W.open(wm, { app: 'notes', key: 'notes:n1' }, VP), k);
  assert.equal(wm.list.length, 3);
});

test('closing and minimising hands focus to the next window on top', () => {
  const wm = W.createWm();
  const a = W.open(wm, { app: 'a' }, VP);
  const b = W.open(wm, { app: 'b' }, VP);
  const c = W.open(wm, { app: 'c' }, VP);
  W.minimize(wm, c);
  assert.equal(wm.focusedId, b);
  W.close(wm, b);
  assert.equal(wm.focusedId, a);
  W.close(wm, a);
  assert.equal(wm.focusedId, null, 'minimised windows do not take focus');
  W.focus(wm, c);
  assert.equal(W.find(wm, c).minimized, false);
});

test('moving keeps a grabbable part on screen', () => {
  const wm = W.createWm();
  const id = W.open(wm, { app: 'a', w: 400, h: 300 }, VP);
  W.moveTo(wm, id, -5000, -100, VP);
  const win = W.find(wm, id);
  assert.ok(win.x + win.w >= 72);
  assert.equal(win.y, 0);
  W.moveTo(wm, id, 5000, 5000, VP);
  assert.ok(win.x <= VP.w - 72);
  assert.ok(win.y <= VP.h - W.TITLE_H);
});

test('resizeRect respects minimum size and anchors the opposite edge', () => {
  const start = { x: 100, y: 100, w: 400, h: 300 };
  const r = W.resizeRect(start, 'nw', 1000, 1000, VP);
  assert.equal(r.w, W.MIN_W);
  assert.equal(r.h, W.MIN_H);
  assert.equal(r.x + r.w, 500, 'right edge stays put');
  assert.equal(r.y + r.h, 400, 'bottom edge stays put');
  const grow = W.resizeRect(start, 'se', 5000, 5000, VP);
  assert.equal(grow.x + grow.w, VP.w);
  assert.equal(grow.y + grow.h, VP.h);
  const up = W.resizeRect(start, 'n', 0, -500, VP);
  assert.equal(up.y, 0);
  assert.equal(up.h, 400);
});

test('maximise and snap remember the previous size', () => {
  const wm = W.createWm();
  const id = W.open(wm, { app: 'a', w: 420, h: 320 }, VP);
  const win = W.find(wm, id);
  const before = { x: win.x, y: win.y, w: win.w, h: win.h };
  W.toggleMaximize(wm, id, VP);
  assert.deepEqual([win.x, win.y, win.w, win.h], [0, 0, VP.w, VP.h]);
  W.toggleMaximize(wm, id, VP);
  assert.deepEqual({ x: win.x, y: win.y, w: win.w, h: win.h }, before);
  W.snap(wm, id, 'right', VP);
  assert.deepEqual([win.x, win.w], [600, 600]);
  assert.equal(win.snapped, 'right');
  // yapışık pencere sürüklenince eski boyutuna döner
  W.detach(wm, id, 900, VP);
  assert.equal(win.w, before.w);
  assert.equal(win.snapped, null);
});

test('snapZone detects screen edges', () => {
  assert.equal(W.snapZone(3, 300, VP), 'left');
  assert.equal(W.snapZone(1198, 300, VP), 'right');
  assert.equal(W.snapZone(500, 2, VP), 'top');
  assert.equal(W.snapZone(500, 300, VP), null);
});

test('tile fills the screen without overlaps', () => {
  const wm = W.createWm();
  for (let i = 0; i < 5; i++) W.open(wm, { app: 'a' + i }, VP);
  assert.equal(W.tile(wm, VP), 5);
  let area = 0;
  for (const w of wm.list) area += w.w * w.h;
  assert.ok(Math.abs(area - VP.w * VP.h) < VP.w * 3, 'cells cover the screen');
  const a = wm.list[0];
  for (const b of wm.list.slice(1)) {
    const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    assert.equal(overlap, false);
  }
});

test('fit shrinks windows when the screen gets smaller', () => {
  const wm = W.createWm();
  const id = W.open(wm, { app: 'a', w: 900, h: 700 }, VP);
  const small = { w: 700, h: 500 };
  W.fit(wm, small);
  const win = W.find(wm, id);
  assert.ok(win.w <= small.w && win.h <= small.h);
});

test('small screens open windows maximised', () => {
  const wm = W.createWm();
  const id = W.open(wm, { app: 'a' }, { w: 390, h: 700 });
  assert.equal(W.find(wm, id).maximized, true);
});

test('serialize and deserialize keep layout and drop unknown apps', () => {
  const wm = W.createWm();
  const a = W.open(wm, { app: 'notes', props: { fileId: 'n3' } }, VP);
  W.open(wm, { app: 'ghost' }, VP);
  const back = W.deserialize(JSON.parse(JSON.stringify(W.serialize(wm))), ['notes'], VP);
  assert.equal(back.list.length, 1);
  assert.equal(back.list[0].id, a);
  assert.equal(back.list[0].props.fileId, 'n3');
  assert.ok(back.nextId > a);
  assert.equal(W.deserialize(null, ['notes'], VP).list.length, 0);
  assert.equal(W.deserialize({ list: [{ app: 'notes', id: 'x' }] }, ['notes'], VP).list.length, 0);
});
