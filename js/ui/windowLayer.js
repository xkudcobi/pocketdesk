// Pencere katmanı: pencere yöneticisi durumunu DOM'a yansıtır, sürükleme ve
// boyutlandırmayı yönetir. Sürükleme sırasında durum değil yalnızca stil değişir;
// bırakınca tek bir dispatch yapılır.
(function (root) {
  'use strict';
  const PD = root.PD;
  const { h } = PD.dom;
  const W = PD.windows;
  const EDGES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

  function createWindowLayer(host, preview, store, makeApi) {
    const recs = new Map();
    const t = (k, p) => PD.t(k, p);

    function deskPoint(e) {
      const r = host.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    function build(win) {
      const app = PD.appRegistry[win.app];
      const titleText = h('span', { class: 'win-title-text' });
      const btn = (cls, onclick) => h('button', { class: 'win-btn ' + cls, type: 'button', onclick });
      const minBtn = btn('min', () => store.dispatch('win/minimize', { id: win.id }));
      const maxBtn = btn('max', () => store.dispatch('win/toggleMax', { id: win.id }));
      const closeBtn = btn('close', () => requestClose(win.id));
      const titleBar = h('div', { class: 'win-titlebar' },
        h('span', { class: 'win-icon', html: PD.icons.iconFor(win.app) }),
        titleText,
        h('div', { class: 'win-buttons' }, minBtn, maxBtn, closeBtn));
      const body = h('div', { class: 'win-body' });
      const el = h('section', { class: 'win app-' + win.app, role: 'dialog', tabindex: '-1', dataset: { id: String(win.id) } }, titleBar, body);
      for (const edge of EDGES) el.appendChild(h('div', { class: 'win-edge edge-' + edge, dataset: { edge } }));
      host.appendChild(el);

      const rec = { id: win.id, app: win.app, el, body, titleText, minBtn, maxBtn, closeBtn, inst: null };
      el.addEventListener('pointerdown', () => store.dispatch('win/focus', { id: win.id }), true);
      titleBar.addEventListener('pointerdown', (e) => startDrag(e, rec));
      titleBar.addEventListener('dblclick', (e) => {
        if (!e.target.closest('.win-btn')) store.dispatch('win/toggleMax', { id: win.id });
      });
      el.querySelectorAll('.win-edge').forEach((edgeEl) => {
        edgeEl.addEventListener('pointerdown', (e) => startResize(e, rec, edgeEl.dataset.edge));
      });
      try {
        rec.inst = app.mount(body, makeApi(win.id), win.props) || {};
      } catch (err) {
        console.error(err);
        body.appendChild(h('p', { class: 'app-error', text: t('ui.appCrashed') }));
        rec.inst = {};
      }
      el.classList.add('opening');
      setTimeout(() => el.classList.remove('opening'), 220);
      return rec;
    }

    async function requestClose(id) {
      const rec = recs.get(id);
      if (rec && rec.inst.beforeClose) {
        const okToClose = await rec.inst.beforeClose();
        if (!okToClose) return;
      }
      store.dispatch('win/close', { id });
    }

    function place(rec, win, focusedId) {
      const s = rec.el.style;
      s.left = win.x + 'px';
      s.top = win.y + 'px';
      s.width = win.w + 'px';
      s.height = win.h + 'px';
      s.zIndex = String(win.z);
      rec.el.classList.toggle('focused', win.id === focusedId);
      rec.el.classList.toggle('minimized', win.minimized);
      rec.el.classList.toggle('maximized', win.maximized || !!win.snapped);
      rec.el.setAttribute('aria-hidden', win.minimized ? 'true' : 'false');
    }

    function label(rec) {
      const title = rec.inst.title ? rec.inst.title() : t('app.' + rec.app);
      if (rec.titleText.textContent !== title) rec.titleText.textContent = title;
      rec.el.setAttribute('aria-label', title);
      rec.minBtn.setAttribute('aria-label', t('win.minimize'));
      rec.minBtn.title = t('win.minimize');
      rec.maxBtn.setAttribute('aria-label', t('win.maximize'));
      rec.maxBtn.title = t('win.maximize');
      rec.closeBtn.setAttribute('aria-label', t('win.close'));
      rec.closeBtn.title = t('win.close');
    }

    function sync(topics) {
      const s = store.getState();
      const alive = new Set();
      for (const win of s.wm.list) {
        alive.add(win.id);
        let rec = recs.get(win.id);
        if (!rec) {
          rec = build(win);
          recs.set(win.id, rec);
        }
        place(rec, win, s.wm.focusedId);
      }
      for (const [id, rec] of recs) {
        if (alive.has(id)) continue;
        if (rec.inst.destroy) rec.inst.destroy();
        rec.el.remove();
        recs.delete(id);
      }
      for (const rec of recs.values()) {
        if (rec.inst.update) {
          try { rec.inst.update(topics); } catch (err) { console.error(err); }
        }
        label(rec);
      }
    }

    function titleOf(id) {
      const rec = recs.get(id);
      return rec ? rec.titleText.textContent : '';
    }

    // --- sürükleme ---
    function startDrag(e, rec) {
      if (e.button !== 0 || e.target.closest('.win-btn')) return;
      e.preventDefault();
      let win = W.find(store.getState().wm, rec.id);
      if (!win) return;
      const p0 = deskPoint(e);
      let detached = false;
      let dx = 0;
      let dy = 0;
      let zone = null;
      let frame = 0;
      const titleBar = e.currentTarget;
      titleBar.setPointerCapture(e.pointerId);
      rec.el.classList.add('dragging');

      const paint = () => {
        frame = 0;
        rec.el.style.transform = `translate(${dx}px, ${dy}px)`;
        const r = zone ? W.snapRect(zone, store.getState().viewport) : null;
        if (r) {
          preview.hidden = false;
          preview.style.cssText = `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px`;
        } else preview.hidden = true;
      };
      const onMove = (ev) => {
        const p = deskPoint(ev);
        if (!detached && (Math.abs(p.x - p0.x) > 3 || Math.abs(p.y - p0.y) > 3)) {
          detached = true;
          if (win.maximized || win.snapped) {
            store.dispatch('win/detach', { id: rec.id, px: p0.x });
            win = W.find(store.getState().wm, rec.id);
          }
        }
        if (!detached) return;
        dx = p.x - p0.x;
        dy = p.y - p0.y;
        zone = W.snapZone(p.x, p.y, store.getState().viewport);
        if (!frame) frame = requestAnimationFrame(paint);
      };
      const onUp = () => {
        titleBar.removeEventListener('pointermove', onMove);
        titleBar.removeEventListener('pointerup', onUp);
        titleBar.removeEventListener('pointercancel', onUp);
        if (frame) cancelAnimationFrame(frame);
        rec.el.style.transform = '';
        rec.el.classList.remove('dragging');
        preview.hidden = true;
        if (!detached) return;
        if (zone) store.dispatch('win/snap', { id: rec.id, zone });
        else store.dispatch('win/move', { id: rec.id, x: win.x + dx, y: win.y + dy });
      };
      titleBar.addEventListener('pointermove', onMove);
      titleBar.addEventListener('pointerup', onUp);
      titleBar.addEventListener('pointercancel', onUp);
    }

    // --- boyutlandırma ---
    function startResize(e, rec, edge) {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const win = W.find(store.getState().wm, rec.id);
      if (!win || win.minimized) return;
      const start = { x: win.x, y: win.y, w: win.w, h: win.h };
      const p0 = deskPoint(e);
      const target = e.currentTarget;
      let rect = start;
      let frame = 0;
      target.setPointerCapture(e.pointerId);
      rec.el.classList.add('resizing');
      const paint = () => {
        frame = 0;
        const s = rec.el.style;
        s.left = rect.x + 'px';
        s.top = rect.y + 'px';
        s.width = rect.w + 'px';
        s.height = rect.h + 'px';
      };
      const onMove = (ev) => {
        const p = deskPoint(ev);
        rect = W.resizeRect(start, edge, p.x - p0.x, p.y - p0.y, store.getState().viewport);
        if (!frame) frame = requestAnimationFrame(paint);
      };
      const onUp = () => {
        target.removeEventListener('pointermove', onMove);
        target.removeEventListener('pointerup', onUp);
        target.removeEventListener('pointercancel', onUp);
        if (frame) cancelAnimationFrame(frame);
        rec.el.classList.remove('resizing');
        store.dispatch('win/resize', { id: rec.id, rect });
      };
      target.addEventListener('pointermove', onMove);
      target.addEventListener('pointerup', onUp);
      target.addEventListener('pointercancel', onUp);
    }

    return { sync, requestClose, titleOf };
  }

  PD.createWindowLayer = createWindowLayer;
})(self);
