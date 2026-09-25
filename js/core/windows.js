// Pencere yöneticisinin saf mantığı: yerleşim, odak sırası, sürükleme sınırları,
// kenara yapıştırma ve döşeme. DOM'a hiç dokunmaz; arayüz bu durumu çizer.
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.PD = root.PD || {}).windows = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MIN_W = 240;
  const MIN_H = 160;
  const TITLE_H = 36;
  const GRAB = 72; // pencerenin en az bu kadarı ekranda kalmalı ki geri tutulabilsin
  const CASCADE = 28;
  const SNAP_EDGE = 14;
  const SMALL_SCREEN = 640;

  function createWm() {
    return { list: [], nextId: 1, z: 0, focusedId: null };
  }

  function find(wm, id) {
    for (const w of wm.list) if (w.id === id) return w;
    return null;
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function clampRect(rect, vp) {
    const w = clamp(Math.round(rect.w), Math.min(MIN_W, vp.w), Math.max(MIN_W, vp.w));
    const h = clamp(Math.round(rect.h), Math.min(MIN_H, vp.h), Math.max(MIN_H, vp.h));
    const x = clamp(Math.round(rect.x), Math.min(0, GRAB - w), Math.max(0, vp.w - GRAB));
    const y = clamp(Math.round(rect.y), 0, Math.max(0, vp.h - TITLE_H));
    return { x, y, w, h };
  }

  function setRect(win, r) {
    win.x = r.x; win.y = r.y; win.w = r.w; win.h = r.h;
  }

  function rectOf(win) {
    return { x: win.x, y: win.y, w: win.w, h: win.h };
  }

  function topmost(wm, exceptId) {
    let best = null;
    for (const w of wm.list) {
      if (w.minimized || w.id === exceptId) continue;
      if (!best || w.z > best.z) best = w;
    }
    return best;
  }

  // Basamaklı yerleşim: başka bir pencerenin tam üstüne düşmeyen ilk konumu bulur
  function cascadeSpot(wm, w, h, vp) {
    const taken = (x, y) => wm.list.some((o) => !o.minimized && Math.abs(o.x - x) < 10 && Math.abs(o.y - y) < 10);
    for (let k = 0; k < 40; k++) {
      const x = 40 + (k % 12) * CASCADE + Math.floor(k / 12) * 90;
      const y = 24 + (k % 12) * CASCADE;
      if (x + w > vp.w || y + h > vp.h) {
        if (k === 0) return { x: Math.max(0, (vp.w - w) >> 1), y: Math.max(0, (vp.h - h) >> 1) };
        continue;
      }
      if (!taken(x, y)) return { x, y };
    }
    return { x: 40, y: 24 };
  }

  function focus(wm, id) {
    const win = find(wm, id);
    if (!win) return false;
    win.minimized = false;
    if (wm.focusedId !== id || win.z !== wm.z) win.z = ++wm.z;
    wm.focusedId = id;
    return true;
  }

  // spec: { app, key?, singleton?, w?, h?, props? }
  function open(wm, spec, vp) {
    if (spec.singleton || spec.key) {
      const existing = wm.list.find((w) => (spec.key ? w.key === spec.key : w.app === spec.app));
      if (existing) {
        if (spec.props) Object.assign(existing.props, spec.props);
        focus(wm, existing.id);
        return existing.id;
      }
    }
    const w = Math.min(spec.w || 480, Math.max(MIN_W, vp.w - 16));
    const h = Math.min(spec.h || 360, Math.max(MIN_H, vp.h - 16));
    const pos = spec.x != null && spec.y != null ? { x: spec.x, y: spec.y } : cascadeSpot(wm, w, h, vp);
    const win = {
      id: wm.nextId++,
      app: spec.app,
      key: spec.key || null,
      x: 0, y: 0, w, h,
      z: ++wm.z,
      minimized: false,
      maximized: false,
      snapped: null,
      restore: null,
      props: Object.assign({}, spec.props)
    };
    setRect(win, clampRect({ x: pos.x, y: pos.y, w, h }, vp));
    wm.list.push(win);
    wm.focusedId = win.id;
    // küçük ekranda her pencere tam ekran açılır
    if (vp.w < SMALL_SCREEN) maximize(win, vp);
    return win.id;
  }

  function close(wm, id) {
    const idx = wm.list.findIndex((w) => w.id === id);
    if (idx < 0) return false;
    wm.list.splice(idx, 1);
    if (wm.focusedId === id) {
      const next = topmost(wm);
      wm.focusedId = next ? next.id : null;
    }
    return true;
  }

  function minimize(wm, id) {
    const win = find(wm, id);
    if (!win) return false;
    win.minimized = true;
    if (wm.focusedId === id) {
      const next = topmost(wm, id);
      wm.focusedId = next ? next.id : null;
    }
    return true;
  }

  function maximize(win, vp) {
    if (!win.restore) win.restore = rectOf(win);
    setRect(win, { x: 0, y: 0, w: vp.w, h: vp.h });
    win.maximized = true;
    win.snapped = null;
  }

  function unmaximize(win, vp) {
    const r = win.restore || { x: 40, y: 24, w: Math.min(520, vp.w), h: Math.min(380, vp.h) };
    setRect(win, clampRect(r, vp));
    win.maximized = false;
    win.snapped = null;
    win.restore = null;
  }

  function toggleMaximize(wm, id, vp) {
    const win = find(wm, id);
    if (!win) return false;
    if (win.maximized || win.snapped) unmaximize(win, vp);
    else maximize(win, vp);
    focus(wm, id);
    return true;
  }

  // Tam ekran ya da yapışık bir pencere sürüklenmeye başlarken eski boyutuna döner;
  // imleç başlık çubuğunda aynı oransal noktada kalır.
  function detach(wm, id, pointerX, vp) {
    const win = find(wm, id);
    if (!win || !(win.maximized || win.snapped) || !win.restore) return false;
    const ratio = win.w > 0 ? clamp((pointerX - win.x) / win.w, 0, 1) : 0.5;
    const r = win.restore;
    const x = pointerX - r.w * ratio;
    setRect(win, clampRect({ x, y: win.y, w: r.w, h: r.h }, vp));
    win.maximized = false;
    win.snapped = null;
    win.restore = null;
    return true;
  }

  function moveTo(wm, id, x, y, vp) {
    const win = find(wm, id);
    if (!win) return false;
    setRect(win, clampRect({ x, y, w: win.w, h: win.h }, vp));
    win.maximized = false;
    win.snapped = null;
    win.restore = null;
    return true;
  }

  // edges: "n", "se", "w" gibi; hangi kenarların sürüklendiğini söyler
  function resizeRect(start, edges, dx, dy, vp) {
    let x = start.x;
    let y = start.y;
    let w = start.w;
    let h = start.h;
    if (edges.indexOf('e') >= 0) w = start.w + dx;
    if (edges.indexOf('s') >= 0) h = start.h + dy;
    if (edges.indexOf('w') >= 0) w = start.w - dx;
    if (edges.indexOf('n') >= 0) h = start.h - dy;
    w = Math.max(MIN_W, w);
    h = Math.max(MIN_H, h);
    if (edges.indexOf('w') >= 0) x = start.x + start.w - w;
    if (edges.indexOf('n') >= 0) {
      y = start.y + start.h - h;
      if (y < 0) { h += y; y = 0; }
    }
    if (edges.indexOf('e') >= 0 && x >= 0) w = Math.max(MIN_W, Math.min(w, vp.w - x));
    if (edges.indexOf('s') >= 0) h = Math.max(MIN_H, Math.min(h, vp.h - y));
    return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
  }

  function resizeTo(wm, id, rect, vp) {
    const win = find(wm, id);
    if (!win) return false;
    setRect(win, clampRect(rect, vp));
    win.maximized = false;
    win.snapped = null;
    win.restore = null;
    return true;
  }

  function snapZone(px, py, vp) {
    if (py <= SNAP_EDGE / 2) return 'top';
    if (px <= SNAP_EDGE) return 'left';
    if (px >= vp.w - SNAP_EDGE) return 'right';
    return null;
  }

  function snapRect(zone, vp) {
    const half = Math.floor(vp.w / 2);
    if (zone === 'left') return { x: 0, y: 0, w: half, h: vp.h };
    if (zone === 'right') return { x: half, y: 0, w: vp.w - half, h: vp.h };
    if (zone === 'top') return { x: 0, y: 0, w: vp.w, h: vp.h };
    return null;
  }

  function snap(wm, id, zone, vp) {
    const win = find(wm, id);
    const r = snapRect(zone, vp);
    if (!win || !r) return false;
    if (zone === 'top') {
      maximize(win, vp);
    } else {
      if (!win.restore) win.restore = rectOf(win);
      setRect(win, r);
      win.maximized = false;
      win.snapped = zone;
    }
    focus(wm, id);
    return true;
  }

  // Ekran boyutu değişince bütün pencereler yeniden sığdırılır
  function fit(wm, vp) {
    for (const win of wm.list) {
      if (win.maximized) setRect(win, { x: 0, y: 0, w: vp.w, h: vp.h });
      else if (win.snapped) setRect(win, snapRect(win.snapped, vp));
      else setRect(win, clampRect(rectOf(win), vp));
      if (win.restore) win.restore = clampRect(win.restore, vp);
    }
  }

  function byZ(wm) {
    return wm.list.slice().sort((a, b) => a.z - b.z);
  }

  function tile(wm, vp) {
    const visible = byZ(wm).filter((w) => !w.minimized);
    const n = visible.length;
    if (!n) return 0;
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    const cellH = Math.floor(vp.h / rows);
    visible.forEach((win, i) => {
      const r = Math.floor(i / cols);
      const inRow = r === rows - 1 ? n - cols * (rows - 1) : cols;
      const c = i - r * cols;
      const cellW = Math.floor(vp.w / inRow);
      setRect(win, { x: c * cellW, y: r * cellH, w: cellW, h: cellH });
      win.maximized = false;
      win.snapped = null;
      win.restore = null;
    });
    return n;
  }

  function cascadeAll(wm, vp) {
    const visible = byZ(wm).filter((w) => !w.minimized);
    visible.forEach((win, k) => {
      const w = Math.min(540, vp.w - 16);
      const h = Math.min(400, vp.h - 16);
      const x = 40 + (k % 12) * CASCADE;
      const y = 24 + (k % 12) * CASCADE;
      setRect(win, clampRect({ x, y, w, h }, vp));
      win.maximized = false;
      win.snapped = null;
      win.restore = null;
    });
    return visible.length;
  }

  function setProps(wm, id, patch) {
    const win = find(wm, id);
    if (!win) return false;
    Object.assign(win.props, patch);
    if ('key' in patch) win.key = patch.key;
    return true;
  }

  // Sonraki/önceki pencereye geçiş (klavye kısayolu için)
  function cycle(wm, dir) {
    const order = byZ(wm);
    if (order.length < 2) return null;
    const next = dir < 0 ? order[order.length - 2] : order[0];
    focus(wm, next.id);
    return next.id;
  }

  function serialize(wm) {
    return {
      nextId: wm.nextId,
      z: wm.z,
      focusedId: wm.focusedId,
      list: wm.list.map((w) => ({
        id: w.id, app: w.app, key: w.key, x: w.x, y: w.y, w: w.w, h: w.h, z: w.z,
        minimized: w.minimized, maximized: w.maximized, snapped: w.snapped,
        restore: w.restore, props: w.props
      }))
    };
  }

  function isNum(v) {
    return typeof v === 'number' && isFinite(v);
  }

  function deserialize(obj, knownApps, vp) {
    const wm = createWm();
    if (!obj || !Array.isArray(obj.list)) return wm;
    for (const raw of obj.list) {
      if (!raw || knownApps.indexOf(raw.app) < 0) continue;
      if (![raw.id, raw.x, raw.y, raw.w, raw.h, raw.z].every(isNum)) continue;
      if (find(wm, raw.id)) continue;
      const win = {
        id: raw.id, app: raw.app, key: typeof raw.key === 'string' ? raw.key : null,
        x: 0, y: 0, w: 0, h: 0, z: raw.z,
        minimized: !!raw.minimized, maximized: !!raw.maximized,
        snapped: raw.snapped === 'left' || raw.snapped === 'right' ? raw.snapped : null,
        restore: raw.restore && [raw.restore.x, raw.restore.y, raw.restore.w, raw.restore.h].every(isNum) ? raw.restore : null,
        props: raw.props && typeof raw.props === 'object' ? raw.props : {}
      };
      setRect(win, clampRect(raw, vp));
      wm.list.push(win);
      wm.nextId = Math.max(wm.nextId, win.id + 1);
      wm.z = Math.max(wm.z, win.z);
    }
    fit(wm, vp);
    const focused = find(wm, obj.focusedId);
    wm.focusedId = focused && !focused.minimized ? focused.id : (topmost(wm) || {}).id || null;
    return wm;
  }

  return {
    MIN_W, MIN_H, TITLE_H, SNAP_EDGE,
    createWm, find, clampRect, open, close, focus, minimize, toggleMaximize, detach,
    moveTo, resizeRect, resizeTo, snapZone, snapRect, snap, fit, tile, cascadeAll,
    setProps, cycle, byZ, topmost, serialize, deserialize
  };
});
