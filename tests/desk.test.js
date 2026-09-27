// Store + actions + persist birlikte: arayüzsüz uçtan uca akış
const test = require('node:test');
const assert = require('node:assert/strict');
const actions = require('../js/core/actions.js');
const { createStore } = require('../js/core/store.js');
const persist = require('../js/core/persist.js');
const vfs = require('../js/core/vfs.js');
const W = require('../js/core/windows.js');

const VP = { w: 1280, h: 760 };

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    data
  };
}

function makeDesk(lang) {
  const state = actions.createState(lang || 'en', VP, 1000);
  const store = createStore(state, actions.createHandlers(() => 2000));
  const seen = [];
  store.subscribe((topics, type) => seen.push({ type, topics: [...topics].sort() }));
  return { store, state, seen };
}

test('a fresh desk is full of examples and has windows open', () => {
  const { state } = makeDesk('en');
  const desktop = vfs.findSys(state.fs, 'desktop');
  assert.ok(vfs.list(state.fs, desktop).some((n) => n.name === 'Start here.txt'));
  assert.ok(vfs.resolve(state.fs, '/Pictures/Cat.doodle', vfs.ROOT));
  assert.equal(vfs.get(state.fs, vfs.findSys(state.fs, 'trash')).children.length, 1);
  assert.deepEqual(state.wm.list.map((w) => w.app).sort(), ['doodle', 'notes', 'puzzle']);
  assert.equal(W.find(state.wm, state.wm.focusedId).app, 'notes', 'welcome note is on top');
});

test('Turkish desk uses Turkish names', () => {
  const { state } = makeDesk('tr');
  assert.ok(vfs.resolve(state.fs, '/Masaüstü/Buradan başla.txt', vfs.ROOT));
  assert.ok(vfs.resolve(state.fs, '/Belgeler/Tarifler/Pankek.txt', vfs.ROOT));
});

test('switching language renames system folders but keeps user files', () => {
  const { store, state, seen } = makeDesk('en');
  const docs = vfs.findSys(state.fs, 'documents');
  store.dispatch('fs/create', { parentId: docs, name: 'mine.txt', content: 'x' });
  assert.equal(store.dispatch('lang/set', { lang: 'tr' }), true);
  assert.equal(state.lang, 'tr');
  assert.ok(vfs.resolve(state.fs, '/Belgeler/mine.txt', vfs.ROOT));
  assert.ok(seen.at(-1).topics.includes('lang'));
  assert.equal(store.dispatch('lang/set', { lang: 'tr' }), false, 'same language is a no-op');
  assert.equal(store.dispatch('lang/set', { lang: 'fr' }), false);
});

test('an untouched sample desk is rebuilt in the new language', () => {
  const { store, state } = makeDesk('en');
  const welcome = vfs.resolve(state.fs, '/Desktop/Start here.txt', vfs.ROOT);
  store.dispatch('lang/set', { lang: 'tr' });
  assert.equal(vfs.pathOf(state.fs, welcome), '/Masaüstü/Buradan başla.txt', 'same id, Turkish name');
  assert.ok(state.wm.list.some((w) => w.props.fileId === welcome), 'welcome window still points at it');
  // kullanıcı bir şey değiştirdikten sonra içerik korunur
  store.dispatch('fs/write', { id: welcome, content: 'benim notum' });
  store.dispatch('lang/set', { lang: 'en' });
  assert.equal(state.fs.nodes[welcome].content, 'benim notum');
  assert.equal(vfs.pathOf(state.fs, welcome), '/Desktop/Buradan başla.txt');
});

test('opening a file twice focuses the same window', () => {
  const { store, state } = makeDesk('en');
  const list = vfs.resolve(state.fs, '/Documents/Shopping list.txt', vfs.ROOT);
  const a = store.dispatch('win/openNode', { id: list });
  const b = store.dispatch('win/openNode', { id: list });
  assert.equal(a, b);
  const folder = store.dispatch('win/openNode', { id: vfs.findSys(state.fs, 'pictures') });
  assert.equal(W.find(state.wm, folder).app, 'files');
  const drawing = store.dispatch('win/openNode', { id: vfs.resolve(state.fs, '/Pictures/House.doodle', vfs.ROOT) });
  assert.equal(W.find(state.wm, drawing).app, 'doodle');
  assert.equal(store.dispatch('win/openNode', { id: 'missing' }), null);
});

test('deleting a file closes its windows; deleting a folder resets file browsers', () => {
  const { store, state } = makeDesk('en');
  const list = vfs.resolve(state.fs, '/Documents/Shopping list.txt', vfs.ROOT);
  const win = store.dispatch('win/openNode', { id: list });
  const recipes = vfs.resolve(state.fs, '/Documents/Recipes', vfs.ROOT);
  const browser = store.dispatch('win/openNode', { id: recipes });
  store.dispatch('fs/trash', { id: list });
  assert.ok(W.find(state.wm, win), 'trashed file still exists, window stays');
  store.dispatch('fs/emptyTrash');
  assert.equal(W.find(state.wm, win), null);
  store.dispatch('fs/trash', { id: recipes });
  store.dispatch('fs/emptyTrash');
  assert.equal(W.find(state.wm, browser).props.dirId, vfs.ROOT);
});

test('terminal commands change files and can open windows', () => {
  const { store, state } = makeDesk('en');
  const before = state.wm.list.length;
  const res = store.dispatch('shell/run', { line: 'echo hi > /Desktop/new.txt', cwd: vfs.ROOT });
  assert.equal(res.lines.length, 0);
  assert.ok(vfs.resolve(state.fs, '/Desktop/new.txt', vfs.ROOT));
  store.dispatch('shell/run', { line: 'open /Desktop/new.txt', cwd: vfs.ROOT });
  assert.equal(state.wm.list.length, before + 1);
  store.dispatch('shell/run', { line: 'lang tr', cwd: vfs.ROOT });
  assert.equal(state.lang, 'tr');
});

test('terminal remembers its folder in window props', () => {
  const { store, state } = makeDesk('en');
  const term = store.dispatch('win/open', { app: 'terminal', props: {} });
  store.dispatch('shell/run', { line: 'cd Documents', cwd: vfs.ROOT, winId: term });
  assert.equal(W.find(state.wm, term).props.cwd, vfs.findSys(state.fs, 'documents'));
});

test('unknown actions throw, bad themes are ignored', () => {
  const { store, state } = makeDesk('en');
  assert.throws(() => store.dispatch('nope/nope'));
  assert.equal(store.dispatch('theme/set', { theme: 'plaid' }), false);
  assert.equal(store.dispatch('theme/set', { theme: 'night' }), true);
  assert.equal(state.theme, 'night');
});

test('reset brings back the sample desk', () => {
  const { store, state } = makeDesk('en');
  store.dispatch('fs/trash', { id: vfs.resolve(state.fs, '/Documents/Ideas.txt', vfs.ROOT) });
  store.dispatch('fs/emptyTrash');
  store.dispatch('desk/reset');
  assert.ok(vfs.resolve(state.fs, '/Documents/Ideas.txt', vfs.ROOT));
});

test('subscribers can dispatch without breaking the flow', () => {
  const { store, state } = makeDesk('en');
  let nested = 0;
  store.subscribe((topics) => {
    if (topics.has('theme') && nested++ === 0) store.dispatch('prefs/set', { patch: { calcAngle: 'rad' } });
  });
  const got = [];
  store.subscribe((topics) => got.push([...topics]));
  store.dispatch('theme/set', { theme: 'dusk' });
  assert.equal(state.prefs.calcAngle, 'rad');
  assert.ok(got.some((t) => t.includes('prefs')));
});

test('save and load round trip through storage', () => {
  const { store, state } = makeDesk('en');
  store.dispatch('fs/create', { parentId: vfs.ROOT, name: 'kept.txt', content: 'still here' });
  store.dispatch('theme/set', { theme: 'lagoon' });
  const storage = memoryStorage();
  assert.ok(persist.save(storage, state).ok);
  const loaded = persist.load(storage, actions.APP_IDS, VP);
  assert.ok(loaded.ok);
  assert.equal(loaded.data.theme, 'lagoon');
  const kept = vfs.resolve(loaded.data.fs, '/kept.txt', vfs.ROOT);
  assert.equal(loaded.data.fs.nodes[kept].content, 'still here');
  assert.equal(loaded.data.wm.list.length, state.wm.list.length);
  // yüklenen masa yeni bir store'a verilince çalışmaya devam eder
  const fresh = makeDesk('en');
  fresh.store.dispatch('desk/load', loaded.data);
  assert.ok(vfs.resolve(fresh.state.fs, '/kept.txt', vfs.ROOT));
  const r = fresh.store.dispatch('fs/create', { parentId: vfs.ROOT, name: 'after.txt', content: '' });
  assert.ok(r.ok);
  assert.ok(!(r.id in state.fs.nodes) || state.fs.nodes[r.id].name !== 'after.txt');
});

test('load reports missing, corrupt and old saves', () => {
  const storage = memoryStorage();
  assert.equal(persist.load(storage, actions.APP_IDS, VP).reason, 'missing');
  storage.setItem(persist.KEY, '{broken');
  assert.equal(persist.load(storage, actions.APP_IDS, VP).reason, 'corrupt');
  storage.setItem(persist.KEY, JSON.stringify({ version: 99 }));
  assert.equal(persist.load(storage, actions.APP_IDS, VP).reason, 'version');
  storage.setItem(persist.KEY, JSON.stringify({ version: 1, fs: { nodes: {} } }));
  assert.equal(persist.load(storage, actions.APP_IDS, VP).reason, 'corrupt');
  assert.equal(persist.load(null, actions.APP_IDS, VP).reason, 'missing');
});

test('save reports a full storage instead of throwing', () => {
  const { state } = makeDesk('en');
  const full = { setItem() { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; } };
  assert.deepEqual(persist.save(full, state), { ok: false, reason: 'full' });
});

test('language preference is stored separately', () => {
  const storage = memoryStorage();
  assert.equal(persist.loadLang(storage), null);
  persist.saveLang(storage, 'tr');
  assert.equal(persist.loadLang(storage), 'tr');
  storage.setItem(persist.LANG_KEY, 'xx');
  assert.equal(persist.loadLang(storage), null);
});

test('prefs from storage are cleaned', () => {
  const p = persist.cleanPrefs({ calcAngle: 'grad', puzzleBest: { 3: { moves: 20, ms: 1000 }, 4: { moves: -1, ms: 5 }, 9: {} } });
  assert.deepEqual(p, { calcAngle: 'deg', puzzleBest: { 3: { moves: 20, ms: 1000 } } });
});
