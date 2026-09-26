// Uygulamadaki bütün durum değişiklikleri burada tanımlı. Arayüz yalnızca
// store.dispatch ile bu işleyicileri çağırır; böylece akış tek yerden geçer.
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const deps = isNode
    ? {
      vfs: require('./vfs.js'), windows: require('./windows.js'), seed: require('./seed.js'),
      shell: require('./shell.js'), i18n: require('./i18n.js'), persist: require('./persist.js')
    }
    : root.PD;
  const mod = factory(deps.vfs, deps.windows, deps.seed, deps.shell, deps.i18n, deps.persist);
  if (isNode) module.exports = mod;
  else root.PD.actions = mod;
})(typeof self !== 'undefined' ? self : this, function (vfs, windows, seed, shell, i18n, persist) {
  'use strict';

  // Pencere varsayılanları; hangi uygulamanın tek pencereli olduğu da burada
  const APPS = {
    files: { w: 600, h: 420 },
    notes: { w: 460, h: 380 },
    doodle: { w: 660, h: 540 },
    calc: { w: 300, h: 470, singleton: true },
    terminal: { w: 620, h: 380 },
    puzzle: { w: 380, h: 520, singleton: true },
    settings: { w: 460, h: 480, singleton: true }
  };
  const APP_IDS = Object.keys(APPS);

  function defaultPrefs() {
    return { calcAngle: 'deg', puzzleBest: {} };
  }

  // layout.left: masaüstü simgelerinin kapladığı genişlik; ilk pencereler bunun sağında açılır
  function createState(lang, vp, now, layout) {
    const t = (k, p) => i18n.translate(lang, k, p);
    const built = seed.buildFs(t, now);
    const state = {
      lang,
      theme: 'meadow',
      prefs: defaultPrefs(),
      viewport: { w: vp.w, h: vp.h },
      fs: built.fs,
      seedRev: built.fs.rev,
      layout: { left: layout && layout.left > 0 ? layout.left : 124 },
      wm: windows.createWm()
    };
    seedWindows(state, built.ids);
    return state;
  }

  // İlk ekran boş kalmasın: hoş geldin notu, bir çizim ve bulmaca açık gelir
  function seedWindows(state, ids) {
    const vp = state.viewport;
    const left = vp.w >= 760 ? state.layout.left : 24;
    if (vp.w >= 1000 && vp.h >= 560) {
      // bulmaca sağ kenarda, çizim notla bulmacanın arasında kalan boşluğa ortalanır
      const puzzleX = vp.w - 350;
      const doodleX = Math.max(left + 200, Math.min(left + 450, puzzleX - 470));
      openApp(state, 'doodle', { fileId: ids.cat }, { x: doodleX, y: 56, w: 540, h: 450 });
      openApp(state, 'puzzle', {}, { x: puzzleX, y: Math.max(16, vp.h - 500), w: 336, h: 470 });
    }
    openApp(state, 'notes', { fileId: ids.welcome }, { x: left, y: 24, w: 430, h: 420 });
  }

  function openApp(state, app, props, place) {
    const meta = APPS[app];
    if (!meta) return null;
    const p = props || {};
    const key = p.fileId && (app === 'notes' || app === 'doodle') ? app + ':' + p.fileId : null;
    const spec = Object.assign({ app, key, singleton: !!meta.singleton, w: meta.w, h: meta.h, props: p }, place);
    return windows.open(state.wm, spec, state.viewport);
  }

  function openNode(state, id) {
    const node = vfs.get(state.fs, id);
    if (!node) return null;
    const kind = vfs.kindOf(node);
    if (kind === 'dir') return openApp(state, 'files', { dirId: id });
    return openApp(state, kind === 'doodle' ? 'doodle' : 'notes', { fileId: id });
  }

  // Dosya silinince ona bağlı pencereler kapanır, klasörü silinen gezgin köke döner
  function pruneWindows(state) {
    let changed = false;
    for (const win of state.wm.list.slice()) {
      const p = win.props;
      if (p.fileId && !vfs.get(state.fs, p.fileId)) {
        windows.close(state.wm, win.id);
        changed = true;
      } else if (p.dirId && !vfs.isDir(state.fs, p.dirId)) {
        p.dirId = vfs.ROOT;
        changed = true;
      } else if (p.cwd && !vfs.isDir(state.fs, p.cwd)) {
        p.cwd = vfs.ROOT;
        changed = true;
      }
    }
    return changed;
  }

  function fsResult(state, r) {
    const topics = ['fs'];
    if (pruneWindows(state)) topics.push('wm');
    return { topics, result: r };
  }

  // Örnek masaya hiç dokunulmadıysa örnek dosyalar yeni dilde yeniden üretilir.
  // Üretim sırası sabit olduğu için kimlikler aynı kalır; açık pencereler bozulmaz.
  function setLang(state, lang, now) {
    if (i18n.LANGS.indexOf(lang) < 0 || state.lang === lang) return false;
    state.lang = lang;
    const t = (k, p) => i18n.translate(lang, k, p);
    if (state.fs.rev === state.seedRev) {
      state.fs = seed.buildFs(t, now).fs;
      state.seedRev = state.fs.rev;
    } else {
      vfs.localizeSystemFolders(state.fs, seed.systemNames(t));
    }
    return true;
  }

  function createHandlers(clock) {
    const now = clock || (() => Date.now());
    const wmDo = (fn) => (s, p) => {
      const result = fn(s, p);
      return { topics: result ? ['wm'] : [], result };
    };

    return {
      'lang/set'(s, p) {
        return setLang(s, p.lang, now()) ? { topics: ['lang', 'fs', 'wm'], result: true } : { result: false };
      },
      'theme/set'(s, p) {
        if (persist.THEMES.indexOf(p.theme) < 0) return { result: false };
        s.theme = p.theme;
        return { topics: ['theme'], result: true };
      },
      'prefs/set'(s, p) {
        Object.assign(s.prefs, p.patch);
        return { topics: ['prefs'], result: true };
      },
      'viewport/set'(s, p) {
        if (!(p.w > 0 && p.h > 0)) return { result: false };
        s.viewport = { w: Math.round(p.w), h: Math.round(p.h) };
        windows.fit(s.wm, s.viewport);
        return { topics: ['wm'], result: true };
      },

      'win/open'(s, p) {
        const id = openApp(s, p.app, p.props, p.place);
        return { topics: id ? ['wm'] : [], result: id };
      },
      'win/openNode'(s, p) {
        const id = openNode(s, p.id);
        return { topics: id ? ['wm'] : [], result: id };
      },
      'win/close': wmDo((s, p) => windows.close(s.wm, p.id)),
      'win/focus'(s, p) {
        const win = windows.find(s.wm, p.id);
        if (!win || (s.wm.focusedId === p.id && win.z === s.wm.z && !win.minimized)) return { result: false };
        return { topics: ['wm'], result: windows.focus(s.wm, p.id) };
      },
      'win/minimize': wmDo((s, p) => windows.minimize(s.wm, p.id)),
      'win/toggleMax': wmDo((s, p) => windows.toggleMaximize(s.wm, p.id, s.viewport)),
      'win/detach': wmDo((s, p) => windows.detach(s.wm, p.id, p.px, s.viewport)),
      'win/move': wmDo((s, p) => windows.moveTo(s.wm, p.id, p.x, p.y, s.viewport)),
      'win/resize': wmDo((s, p) => windows.resizeTo(s.wm, p.id, p.rect, s.viewport)),
      'win/snap': wmDo((s, p) => windows.snap(s.wm, p.id, p.zone, s.viewport)),
      'win/tile': wmDo((s) => windows.tile(s.wm, s.viewport) > 0),
      'win/cascade': wmDo((s) => windows.cascadeAll(s.wm, s.viewport) > 0),
      'win/cycle': wmDo((s, p) => windows.cycle(s.wm, p.dir || 1) != null),
      'win/props': wmDo((s, p) => windows.setProps(s.wm, p.id, p.patch)),
      'win/minimizeAll': wmDo((s) => {
        s.wm.list.forEach((w) => { w.minimized = true; });
        s.wm.focusedId = null;
        return s.wm.list.length > 0;
      }),

      'fs/mkdir': (s, p) => fsResult(s, vfs.mkdir(s.fs, p.parentId, p.name, now())),
      'fs/create': (s, p) => fsResult(s, vfs.createFile(s.fs, p.parentId, p.name, p.content, now())),
      'fs/write': (s, p) => fsResult(s, vfs.writeFile(s.fs, p.id, p.content, now())),
      'fs/rename': (s, p) => fsResult(s, vfs.rename(s.fs, p.id, p.name, now())),
      'fs/move': (s, p) => fsResult(s, vfs.move(s.fs, p.id, p.targetId, { now: now(), autoRename: !!p.autoRename })),
      'fs/copy': (s, p) => fsResult(s, vfs.copy(s.fs, p.id, p.targetId, null, now())),
      'fs/trash': (s, p) => fsResult(s, vfs.trash(s.fs, p.id, now())),
      'fs/restore': (s, p) => fsResult(s, vfs.restore(s.fs, p.id, now())),
      'fs/emptyTrash': (s) => fsResult(s, vfs.emptyTrash(s.fs, now())),

      // Terminal satırı: dosya sistemi değişir, "aç" ve "dil" etkileri burada uygulanır
      'shell/run'(s, p) {
        const t = (k, prm) => i18n.translate(s.lang, k, prm);
        const res = shell.execute(p.line, { fs: s.fs, cwd: p.cwd, t, lang: s.lang, now: now(), angle: s.prefs.calcAngle });
        const topics = ['fs'];
        for (const e of res.effects) {
          if (e.type === 'open' && openNode(s, e.id)) topics.push('wm');
          if (e.type === 'lang' && setLang(s, e.value, now())) topics.push('lang', 'wm');
        }
        if (p.winId) windows.setProps(s.wm, p.winId, { cwd: res.cwd });
        if (pruneWindows(s)) topics.push('wm');
        return { topics, result: res };
      },

      'desk/reset'(s) {
        const fresh = createState(s.lang, s.viewport, now(), s.layout);
        s.fs = fresh.fs;
        s.seedRev = fresh.seedRev;
        s.wm = fresh.wm;
        s.theme = fresh.theme;
        s.prefs = fresh.prefs;
        return { topics: ['fs', 'wm', 'theme', 'prefs'], result: true };
      },
      'desk/load'(s, p) {
        s.fs = p.fs;
        s.seedRev = p.seedRev == null ? -1 : p.seedRev;
        s.wm = p.wm;
        s.theme = p.theme;
        s.prefs = p.prefs;
        // kayıt başka dilde yapıldıysa sistem klasörleri güncel dile uyar
        vfs.localizeSystemFolders(s.fs, seed.systemNames((k) => i18n.translate(s.lang, k)));
        pruneWindows(s);
        return { topics: ['fs', 'wm', 'theme', 'prefs'], result: true };
      }
    };
  }

  return { APPS, APP_IDS, createState, createHandlers, openNode, pruneWindows };
});
