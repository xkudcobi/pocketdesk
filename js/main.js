// Açılış: kayıtlı masaüstünü yükle (yoksa örnek masaüstü kur), store'u oluştur,
// arayüz parçalarını bağla ve değişiklikleri otomatik kaydet.
(function (root) {
  'use strict';
  const PD = root.PD;
  const { i18n, persist, actions, vfs, windows } = PD;

  const deskEl = document.getElementById('desk');
  const winHost = document.getElementById('windows');
  const preview = document.getElementById('snap-preview');

  function storage() {
    try {
      const s = root.localStorage;
      const probe = '__pd_probe__';
      s.setItem(probe, '1');
      s.removeItem(probe);
      return s;
    } catch (e) {
      return null;
    }
  }
  const store0 = storage();

  function viewport() {
    const r = winHost.getBoundingClientRect();
    return { w: Math.max(200, Math.round(r.width)), h: Math.max(200, Math.round(r.height)) };
  }

  // --- durum ---
  const lang = persist.loadLang(store0) || i18n.detectLanguage(navigator.languages && navigator.languages[0] || navigator.language);
  const vp = viewport();
  const loaded = persist.load(store0, actions.APP_IDS, vp);
  // simge ızgarasıyla aynı ölçüler (desk.css): 96px satır + 6px boşluk, 92px sütun
  const rows = Math.max(1, Math.floor((vp.h - 24 + 6) / 102));
  const iconCols = Math.ceil(9 / rows);
  const state = actions.createState(lang, vp, Date.now(), { left: 12 + iconCols * 98 + 14 });
  const store = PD.store.createStore(state, actions.createHandlers());
  PD.t = (k, p) => i18n.translate(store.getState().lang, k, p);
  if (loaded.ok) store.dispatch('desk/load', loaded.data);
  const startupNotice = !loaded.ok && loaded.reason !== 'missing' ? 'toast.corrupt' : null;

  // --- uygulamalara verilen arayüz ---
  const dom = PD.dom;
  const t = PD.t;

  function fsError(res) {
    if (!res || res.ok) return;
    dom.toast(t('err.' + res.error, { name: res.name || '' }), 'bad');
  }

  const actionsUi = {
    openApp(app, props) {
      return store.dispatch('win/open', { app, props: props || {} });
    },
    async trashNode(id) {
      const fs = store.getState().fs;
      const node = vfs.get(fs, id);
      if (!node) return;
      if (vfs.isInTrash(fs, id)) {
        const yes = await dom.confirm(t('files.deleteForever'), t('files.deleteMsg', { name: node.name }), t('files.deleteForever'));
        if (!yes) return;
      }
      const r = store.dispatch('fs/trash', { id });
      if (!r.ok) fsError(r);
      else dom.toast(t(r.deleted ? 'toast.deleted' : 'toast.trashed', { name: node.name }), 'info');
    },
    async renameNode(id) {
      const node = vfs.get(store.getState().fs, id);
      if (!node) return;
      if (node.sys) { fsError({ ok: false, error: 'systemItem' }); return; }
      const name = await dom.prompt(t('ui.renameTitle'), node.name, t('ui.rename'));
      if (name == null || name.trim() === node.name) return;
      fsError(store.dispatch('fs/rename', { id, name }));
    },
    async newFolder(parentId) {
      const fs = store.getState().fs;
      const name = await dom.prompt(t('files.newFolder'), vfs.uniqueName(fs, parentId, t('files.folderName')), t('ui.create'));
      if (name == null) return;
      fsError(store.dispatch('fs/mkdir', { parentId, name }));
    },
    newNote(parentId) {
      const fs = store.getState().fs;
      const dir = parentId || vfs.findSys(fs, 'desktop') || vfs.ROOT;
      const r = store.dispatch('fs/create', { parentId: dir, name: vfs.uniqueName(fs, dir, t('notes.defaultName')), content: '' });
      if (!r.ok) return fsError(r);
      store.dispatch('win/openNode', { id: r.id });
    }
  };

  function makeApi(winId) {
    return {
      winId,
      t: PD.t,
      state: () => store.getState(),
      dispatch: (type, payload) => store.dispatch(type, payload),
      props: () => (windows.find(store.getState().wm, winId) || { props: {} }).props,
      setProps: (patch) => store.dispatch('win/props', { id: winId, patch }),
      openApp: actionsUi.openApp,
      openNode: (id) => store.dispatch('win/openNode', { id }),
      close: () => layer.requestClose(winId),
      toast: dom.toast,
      prompt: dom.prompt,
      confirm: dom.confirm,
      fsError,
      ui: actionsUi
    };
  }

  // --- arayüz ---
  const layer = PD.createWindowLayer(winHost, preview, store, makeApi);
  const desktop = PD.createDesktop(document.getElementById('icons'), store, actionsUi);
  const taskbar = PD.createTaskbar(document.getElementById('taskbar'), store, layer, actionsUi);

  function applyLang() {
    const s = store.getState();
    document.documentElement.lang = s.lang;
    document.title = t('app.title');
    document.getElementById('desk-hint').textContent = t('desk.hint');
    persist.saveLang(store0, s.lang);
  }

  function applyTheme() {
    document.body.dataset.theme = store.getState().theme;
  }

  let warnedFull = false;
  const saver = persist.createSaver(store0, () => store.getState(), 400, (r) => {
    if (!r.ok && r.reason === 'full' && !warnedFull) {
      warnedFull = true;
      dom.toast(t('toast.storageFull'), 'bad');
    }
  });

  store.subscribe((topics) => {
    if (topics.has('lang')) applyLang();
    if (topics.has('theme')) applyTheme();
    layer.sync(topics);
    desktop.sync(topics);
    taskbar.sync(topics);
    saver.schedule();
  });

  applyLang();
  applyTheme();
  desktop.render();
  taskbar.renderStatic();
  layer.sync(new Set(['fs', 'wm', 'lang', 'theme', 'prefs']));
  taskbar.sync(new Set(['wm']));
  if (startupNotice) dom.toast(t(startupNotice), 'bad');
  if (!store0) dom.toast(t('toast.noStorage'), 'bad');

  // Ekran boyutu değişince pencereler sığdırılır (kare başına en fazla bir kez)
  let resizeFrame = 0;
  new ResizeObserver(() => {
    if (resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      const v = viewport();
      const cur = store.getState().viewport;
      if (v.w !== cur.w || v.h !== cur.h) store.dispatch('viewport/set', v);
    });
  }).observe(winHost);

  root.addEventListener('pagehide', () => saver.now());
  document.addEventListener('visibilitychange', () => { if (document.hidden) saver.now(); });

  // Klavye: Alt+Shift+N yeni not, Alt+Shift+W pencereyi kapat, Alt+Shift+→ sonraki pencere
  document.addEventListener('keydown', (e) => {
    if (!(e.altKey && e.shiftKey)) return;
    const s = store.getState();
    const k = e.key.toLowerCase();
    if (k === 'n') actionsUi.newNote();
    else if (k === 'w' && s.wm.focusedId) layer.requestClose(s.wm.focusedId);
    else if (e.key === 'ArrowRight') store.dispatch('win/cycle', { dir: 1 });
    else if (e.key === 'ArrowLeft') store.dispatch('win/cycle', { dir: -1 });
    else return;
    e.preventDefault();
  });

  deskEl.classList.add('ready');
  PD.app = { store, actionsUi };
})(self);
