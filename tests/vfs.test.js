const test = require('node:test');
const assert = require('node:assert/strict');
const vfs = require('../js/core/vfs.js');

function sample() {
  const fs = vfs.createFs(0);
  const docs = vfs.mkdir(fs, vfs.ROOT, 'Docs', 0).id;
  const trash = vfs.mkdir(fs, vfs.ROOT, 'Trash', 0).id;
  fs.nodes[trash].sys = 'trash';
  const desk = vfs.mkdir(fs, vfs.ROOT, 'Desk', 0).id;
  fs.nodes[desk].sys = 'desktop';
  const note = vfs.createFile(fs, docs, 'note.txt', 'hello', 0).id;
  return { fs, docs, trash, desk, note };
}

test('creates folders and files and resolves paths', () => {
  const { fs, docs, note } = sample();
  assert.equal(vfs.resolve(fs, '/Docs/note.txt', vfs.ROOT), note);
  assert.equal(vfs.resolve(fs, 'note.txt', docs), note);
  assert.equal(vfs.resolve(fs, '../Docs/./note.txt', docs), note);
  assert.equal(vfs.resolve(fs, '/docs/NOTE.TXT', vfs.ROOT), note, 'name lookup ignores case');
  assert.equal(vfs.resolve(fs, '..', vfs.ROOT), vfs.ROOT, 'root has no parent');
  assert.equal(vfs.resolve(fs, '/Docs/missing', vfs.ROOT), null);
  assert.equal(vfs.resolve(fs, '/Docs/note.txt/x', vfs.ROOT), null, 'cannot walk through a file');
  assert.equal(vfs.pathOf(fs, note), '/Docs/note.txt');
  assert.equal(vfs.pathOf(fs, vfs.ROOT), '/');
});

test('rejects bad and duplicate names', () => {
  const { fs, docs } = sample();
  assert.equal(vfs.mkdir(fs, docs, '   ').error, 'nameEmpty');
  assert.equal(vfs.mkdir(fs, docs, 'a/b').error, 'nameInvalid');
  assert.equal(vfs.mkdir(fs, docs, '..').error, 'nameInvalid');
  assert.equal(vfs.mkdir(fs, docs, 'x'.repeat(61)).error, 'nameTooLong');
  assert.equal(vfs.createFile(fs, docs, 'Note.TXT', '').error, 'nameTaken');
  assert.equal(vfs.createFile(fs, 'nope', 'a.txt', '').error, 'notDir');
});

test('uniqueName counts up and keeps the extension', () => {
  const { fs, docs } = sample();
  assert.equal(vfs.uniqueName(fs, docs, 'fresh.txt'), 'fresh.txt');
  assert.equal(vfs.uniqueName(fs, docs, 'note.txt'), 'note (2).txt');
  vfs.createFile(fs, docs, 'note (2).txt', '');
  assert.equal(vfs.uniqueName(fs, docs, 'note (2).txt'), 'note (3).txt');
});

test('rename keeps ids stable and protects system folders', () => {
  const { fs, note, trash, docs } = sample();
  assert.ok(vfs.rename(fs, note, 'renamed.txt').ok);
  assert.equal(vfs.pathOf(fs, note), '/Docs/renamed.txt');
  assert.ok(vfs.rename(fs, note, 'RENAMED.txt').ok, 'changing only case of own name is fine');
  vfs.createFile(fs, docs, 'other.txt', '');
  assert.equal(vfs.rename(fs, note, 'other.txt').error, 'nameTaken');
  assert.equal(vfs.rename(fs, trash, 'Bin').error, 'systemItem');
});

test('move refuses to put a folder inside itself', () => {
  const { fs, docs } = sample();
  const inner = vfs.mkdir(fs, docs, 'inner').id;
  assert.equal(vfs.move(fs, docs, inner).error, 'moveIntoSelf');
  assert.equal(vfs.move(fs, docs, docs).error, 'moveIntoSelf');
  assert.equal(vfs.move(fs, docs, vfs.ROOT).ok, true, 'moving to the same parent is a no-op');
  const other = vfs.mkdir(fs, vfs.ROOT, 'Other').id;
  assert.ok(vfs.move(fs, inner, other).ok);
  assert.equal(vfs.pathOf(fs, inner), '/Other/inner');
  assert.deepEqual(fs.nodes[docs].children.includes(inner), false);
});

test('move reports conflicts unless autoRename is set', () => {
  const { fs, docs, note } = sample();
  const other = vfs.mkdir(fs, vfs.ROOT, 'Other').id;
  vfs.createFile(fs, other, 'note.txt', 'x');
  assert.equal(vfs.move(fs, note, other).error, 'nameTaken');
  assert.ok(vfs.move(fs, note, other, { autoRename: true }).ok);
  assert.equal(fs.nodes[note].name, 'note (2).txt');
  assert.equal(fs.nodes[docs].children.length, 0);
});

test('copy duplicates a whole folder with new ids', () => {
  const { fs, docs, note } = sample();
  const sub = vfs.mkdir(fs, docs, 'sub').id;
  vfs.createFile(fs, sub, 'deep.txt', 'deep');
  const before = vfs.nodeCount(fs);
  const r = vfs.copy(fs, docs, vfs.ROOT);
  assert.ok(r.ok);
  assert.equal(fs.nodes[r.id].name, 'Docs (2)');
  assert.equal(vfs.nodeCount(fs), before + 4);
  const deep = vfs.resolve(fs, '/Docs (2)/sub/deep.txt', vfs.ROOT);
  assert.ok(deep);
  assert.equal(fs.nodes[deep].content, 'deep');
  vfs.writeFile(fs, deep, 'changed');
  assert.equal(fs.nodes[vfs.resolve(fs, '/Docs/sub/deep.txt', vfs.ROOT)].content, 'deep', 'copy is independent');
  assert.equal(vfs.copy(fs, docs, sub).error, 'moveIntoSelf');
  assert.ok(vfs.copy(fs, note, docs, 'copy.txt').ok);
});

test('trash, restore and empty trash', () => {
  const { fs, docs, note, trash } = sample();
  const r = vfs.trash(fs, note);
  assert.ok(r.ok);
  assert.equal(fs.nodes[note].parent, trash);
  assert.ok(vfs.isInTrash(fs, note));
  assert.ok(vfs.restore(fs, note).ok);
  assert.equal(fs.nodes[note].parent, docs);
  // eski klasörü silinmişse masaüstüne döner
  vfs.trash(fs, note);
  vfs.remove(fs, docs);
  assert.ok(vfs.restore(fs, note).ok);
  assert.equal(vfs.get(fs, fs.nodes[note].parent).sys, 'desktop');
  // çöpteki bir şeyi tekrar çöpe atmak kalıcı siler
  vfs.trash(fs, note);
  assert.equal(vfs.trash(fs, note).deleted, true);
  assert.equal(vfs.get(fs, note), null);
  const a = vfs.createFile(fs, vfs.ROOT, 'a.txt', '').id;
  vfs.trash(fs, a);
  assert.equal(vfs.emptyTrash(fs).count, 1);
  assert.equal(vfs.get(fs, a), null);
  assert.equal(vfs.restore(fs, vfs.ROOT).error, 'notInTrash');
});

test('remove deletes whole subtrees', () => {
  const { fs, docs, note } = sample();
  const before = vfs.nodeCount(fs);
  assert.ok(vfs.remove(fs, docs).ok);
  assert.equal(vfs.get(fs, note), null);
  assert.equal(vfs.nodeCount(fs), before - 2);
  assert.equal(vfs.remove(fs, vfs.ROOT).error, 'systemItem');
});

test('list sorts folders first, then names naturally', () => {
  const fs = vfs.createFs(0);
  vfs.createFile(fs, vfs.ROOT, 'b10.txt', '');
  vfs.createFile(fs, vfs.ROOT, 'b2.txt', '');
  vfs.mkdir(fs, vfs.ROOT, 'zeta');
  assert.deepEqual(vfs.list(fs, vfs.ROOT).map((n) => n.name), ['zeta', 'b2.txt', 'b10.txt']);
  assert.deepEqual(vfs.list(fs, 'missing'), []);
});

test('parentAndName splits a new path', () => {
  const { fs, docs } = sample();
  assert.deepEqual(vfs.parentAndName(fs, 'Docs/new.txt', vfs.ROOT), { parentId: docs, name: 'new.txt' });
  assert.deepEqual(vfs.parentAndName(fs, '/top.txt', docs), { parentId: vfs.ROOT, name: 'top.txt' });
  assert.equal(vfs.parentAndName(fs, 'Nope/new.txt', vfs.ROOT), null);
});

test('system folders follow the language when possible', () => {
  const { fs, trash } = sample();
  vfs.localizeSystemFolders(fs, { trash: 'Çöp Kutusu', desktop: 'Docs' });
  assert.equal(fs.nodes[trash].name, 'Çöp Kutusu');
  assert.equal(vfs.childByName(fs, vfs.ROOT, 'Desk').sys, 'desktop', 'keeps old name on conflict');
});

test('writeFile limits size and refuses folders', () => {
  const { fs, docs, note } = sample();
  assert.equal(vfs.writeFile(fs, docs, 'x').error, 'isDir');
  assert.equal(vfs.writeFile(fs, note, 'x'.repeat(vfs.MAX_FILE + 1)).error, 'fileTooBig');
  assert.equal(vfs.readFile(fs, note).content, 'hello');
});

test('deserialize accepts a round trip and rejects broken trees', () => {
  const { fs } = sample();
  const copy = vfs.deserialize(JSON.parse(JSON.stringify(fs)));
  assert.equal(vfs.nodeCount(copy), vfs.nodeCount(fs));
  assert.ok(copy.seq >= fs.seq);

  const broken = JSON.parse(JSON.stringify(fs));
  broken.nodes.root.children.push('ghost');
  assert.throws(() => vfs.deserialize(broken));

  const cycle = JSON.parse(JSON.stringify(fs));
  const docsId = Object.keys(cycle.nodes).find((k) => cycle.nodes[k].name === 'Docs');
  cycle.nodes.root.children = cycle.nodes.root.children.filter((c) => c !== docsId);
  cycle.nodes[docsId].parent = docsId;
  cycle.nodes[docsId].children.push(docsId);
  assert.throws(() => vfs.deserialize(cycle));

  assert.throws(() => vfs.deserialize(null));
  assert.throws(() => vfs.deserialize({ nodes: {} }));
});
