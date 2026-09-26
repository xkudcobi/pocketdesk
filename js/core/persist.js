// Masaüstünü tarayıcının yerel deposuna yazar ve geri okur.
// Depo dışarıdan verilir (localStorage ya da testte sahte bir nesne).
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const deps = isNode
    ? { vfs: require('./vfs.js'), windows: require('./windows.js') }
    : { vfs: root.PD.vfs, windows: root.PD.windows };
  const mod = factory(deps.vfs, deps.windows);
  if (isNode) module.exports = mod;
  else root.PD.persist = mod;
})(typeof self !== 'undefined' ? self : this, function (vfs, windows) {
  'use strict';

  const KEY = 'pocketdesk.desk.v1';
  const LANG_KEY = 'pocketdesk.lang';
  const VERSION = 1;
  const THEMES = ['meadow', 'dusk', 'lagoon', 'night'];

  function snapshot(state) {
    return {
      version: VERSION,
      savedAt: Date.now(),
      theme: state.theme,
      prefs: state.prefs,
      seedRev: state.seedRev,
      fs: { seq: state.fs.seq, rev: state.fs.rev, nodes: state.fs.nodes },
      wm: windows.serialize(state.wm)
    };
  }

  function save(storage, state) {
    if (!storage) return { ok: false, reason: 'noStorage' };
    try {
      const text = JSON.stringify(snapshot(state));
      storage.setItem(KEY, text);
      return { ok: true, bytes: text.length };
    } catch (e) {
      return { ok: false, reason: e && e.name === 'QuotaExceededError' ? 'full' : 'failed' };
    }
  }

  function cleanPrefs(raw) {
    const prefs = { calcAngle: 'deg', puzzleBest: {} };
    if (!raw || typeof raw !== 'object') return prefs;
    if (raw.calcAngle === 'rad') prefs.calcAngle = 'rad';
    if (raw.puzzleBest && typeof raw.puzzleBest === 'object') {
      for (const k of ['3', '4']) {
        const b = raw.puzzleBest[k];
        if (b && Number.isInteger(b.moves) && b.moves > 0 && typeof b.ms === 'number') prefs.puzzleBest[k] = { moves: b.moves, ms: b.ms };
      }
    }
    return prefs;
  }

  // Dönen: { ok: true, data } ya da { ok: false, reason: 'missing' | 'corrupt' | 'version' }
  function load(storage, knownApps, vp) {
    if (!storage) return { ok: false, reason: 'missing' };
    let text = null;
    try { text = storage.getItem(KEY); } catch (e) { return { ok: false, reason: 'missing' }; }
    if (!text) return { ok: false, reason: 'missing' };
    let raw;
    try { raw = JSON.parse(text); } catch (e) { return { ok: false, reason: 'corrupt' }; }
    if (!raw || typeof raw !== 'object') return { ok: false, reason: 'corrupt' };
    if (raw.version !== VERSION) return { ok: false, reason: 'version' };
    let fs;
    try { fs = vfs.deserialize(raw.fs); } catch (e) { return { ok: false, reason: 'corrupt' }; }
    const wm = windows.deserialize(raw.wm, knownApps, vp);
    return {
      ok: true,
      data: {
        fs,
        wm,
        seedRev: typeof raw.seedRev === 'number' ? raw.seedRev : -1,
        theme: THEMES.indexOf(raw.theme) >= 0 ? raw.theme : THEMES[0],
        prefs: cleanPrefs(raw.prefs)
      }
    };
  }

  function clear(storage) {
    try { storage.removeItem(KEY); } catch (e) { /* depo yoksa yapacak bir şey yok */ }
  }

  function loadLang(storage) {
    try {
      const v = storage && storage.getItem(LANG_KEY);
      return v === 'tr' || v === 'en' ? v : null;
    } catch (e) {
      return null;
    }
  }

  function saveLang(storage, lang) {
    try { if (storage) storage.setItem(LANG_KEY, lang); } catch (e) { /* yok say */ }
  }

  // Art arda gelen değişiklikleri tek yazmaya indirir
  function createSaver(storage, getState, delay, onResult) {
    let timer = null;
    function now() {
      if (timer) { clearTimeout(timer); timer = null; }
      const r = save(storage, getState());
      if (onResult) onResult(r);
      return r;
    }
    function schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(now, delay);
    }
    return { schedule, now };
  }

  return { KEY, LANG_KEY, VERSION, THEMES, snapshot, save, load, clear, loadLang, saveLang, createSaver, cleanPrefs };
});
