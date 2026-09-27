// Karalama: fırçayla çiz, geri al, .doodle dosyası olarak kaydet.
// Çizerken yalnızca yeni parça tuvale eklenir; tam yeniden çizim darbe bitince yapılır.
(function (root) {
  'use strict';
  const PD = root.PD;
  const { h, clear } = PD.dom;
  const vfs = PD.vfs;
  const D = PD.doodle;
  const AUTOSAVE_MS = 800;

  function mount(body, api, props) {
    const t = api.t;
    let fileId = null;
    let doc = D.blank();
    let color = D.PALETTE[1];
    let size = D.SIZES[1];
    let dirty = false;
    let timer = null;
    const undone = [];

    const canvas = h('canvas', { class: 'dd-canvas', tabindex: '0' });
    const ctx = canvas.getContext('2d');
    const stage = h('div', { class: 'dd-stage' }, canvas);
    const swatches = h('div', { class: 'dd-swatches', role: 'radiogroup' });
    const sizes = h('div', { class: 'dd-sizes', role: 'radiogroup' });
    const btnUndo = h('button', { class: 'tb-btn', type: 'button', onclick: undo });
    const btnRedo = h('button', { class: 'tb-btn', type: 'button', onclick: redo });
    const btnClear = h('button', { class: 'tb-btn danger', type: 'button', onclick: wipe });
    const btnSave = h('button', { class: 'tb-btn', type: 'button', onclick: () => save() });
    const btnNew = h('button', { class: 'tb-btn', type: 'button', onclick: () => api.openApp('doodle') });
    const status = h('div', { class: 'statusbar' });
    body.append(h('div', { class: 'toolbar' }, swatches, sizes),
      h('div', { class: 'toolbar sub' }, btnUndo, btnRedo, btnClear, h('span', { class: 'grow' }), btnNew, btnSave),
      stage, status);

    let scale = 1;
    function fit() {
      const r = stage.getBoundingClientRect();
      if (!r.width || !r.height) return;
      // iç boşluk ve çerçeve payı düşülür ki tuval taşmasın
      const s = Math.max(0.1, Math.min((r.width - 22) / doc.w, (r.height - 22) / doc.h));
      const dpr = window.devicePixelRatio || 1;
      canvas.style.width = Math.floor(doc.w * s) + 'px';
      canvas.style.height = Math.floor(doc.h * s) + 'px';
      canvas.width = Math.floor(doc.w * s * dpr);
      canvas.height = Math.floor(doc.h * s * dpr);
      scale = s * dpr;
      redraw();
    }

    function redraw() {
      D.render(ctx, doc, scale);
    }

    const ro = new ResizeObserver(() => fit());
    ro.observe(stage);

    // --- çizim ---
    let live = null;
    function toDoc(e) {
      const r = canvas.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * doc.w, ((e.clientY - r.top) / r.height) * doc.h];
    }

    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      canvas.focus({ preventScroll: true });
      canvas.setPointerCapture(e.pointerId);
      const [x, y] = toDoc(e);
      live = { points: [x, y], color, size };
      ctx.save();
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!live) return;
      const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      ctx.save();
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.strokeStyle = live.color;
      ctx.lineWidth = live.size;
      ctx.lineCap = 'round';
      ctx.beginPath();
      const p = live.points;
      ctx.moveTo(p[p.length - 2], p[p.length - 1]);
      for (const ev of events.length ? events : [e]) {
        const [x, y] = toDoc(ev);
        const dx = x - p[p.length - 2];
        const dy = y - p[p.length - 1];
        if (dx * dx + dy * dy < 0.25) continue;
        p.push(x, y);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    });
    const finish = () => {
      if (!live) return;
      if (doc.strokes.length < 2000) doc.strokes.push(D.makeStroke(live.points, live.color, live.size));
      live = null;
      undone.length = 0;
      changed();
    };
    canvas.addEventListener('pointerup', finish);
    canvas.addEventListener('pointercancel', finish);

    function changed() {
      dirty = true;
      redraw();
      if (fileId) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(writeNow, AUTOSAVE_MS);
      }
      renderStatus();
    }

    function undo() {
      if (!doc.strokes.length) return;
      undone.push(doc.strokes.pop());
      changed();
    }

    function redo() {
      if (!undone.length) return;
      doc.strokes.push(undone.pop());
      changed();
    }

    async function wipe() {
      if (!doc.strokes.length) return;
      const yes = await api.confirm(t('doodle.clearTitle'), t('doodle.clearMsg'), t('doodle.clear'));
      if (!yes) return;
      undone.length = 0;
      doc.strokes = [];
      changed();
    }

    // --- kaydetme ---
    function writeNow() {
      if (timer) { clearTimeout(timer); timer = null; }
      if (!fileId || !dirty || !vfs.get(api.state().fs, fileId)) return true;
      const r = api.dispatch('fs/write', { id: fileId, content: D.encode(doc) });
      if (!r.ok) { api.fsError(r); return false; }
      dirty = false;
      renderStatus();
      return true;
    }

    async function save() {
      if (fileId) {
        dirty = true;
        if (writeNow()) api.toast(t('notes.savedToast'), 'ok');
        return true;
      }
      const fs = api.state().fs;
      const dir = vfs.findSys(fs, 'pictures') || vfs.ROOT;
      const name = await api.prompt(t('doodle.saveTitle'), vfs.uniqueName(fs, dir, t('doodle.defaultName')));
      if (name == null) return false;
      const clean = /\.doodle$/i.test(name.trim()) ? name.trim() : name.trim() + '.doodle';
      const r = api.dispatch('fs/create', { parentId: dir, name: clean, content: D.encode(doc) });
      if (!r.ok) { api.fsError(r); return false; }
      fileId = r.id;
      dirty = false;
      api.setProps({ fileId: r.id, key: 'doodle:' + r.id });
      api.toast(t('notes.savedAs', { name: clean }), 'ok');
      renderStatus();
      return true;
    }

    function load(id) {
      const r = id ? vfs.readFile(api.state().fs, id) : null;
      if (!r || !r.ok) return;
      const parsed = D.decode(r.content);
      if (!parsed) {
        api.toast(t('doodle.badFile'), 'bad');
        return;
      }
      fileId = id;
      doc = parsed;
    }

    function renderTools() {
      clear(swatches);
      swatches.setAttribute('aria-label', t('doodle.colors'));
      D.PALETTE.forEach((c, i) => {
        swatches.appendChild(h('button', {
          class: 'dd-swatch' + (c === color ? ' on' : ''), type: 'button', role: 'radio',
          'aria-checked': String(c === color), 'aria-label': t('doodle.color' + i), title: t('doodle.color' + i),
          style: { background: c },
          onclick: () => { color = c; renderTools(); }
        }));
      });
      clear(sizes);
      sizes.setAttribute('aria-label', t('doodle.sizes'));
      D.SIZES.forEach((s, i) => {
        sizes.appendChild(h('button', {
          class: 'dd-size' + (s === size ? ' on' : ''), type: 'button', role: 'radio',
          'aria-checked': String(s === size), 'aria-label': t('doodle.size' + i), title: t('doodle.size' + i),
          onclick: () => { size = s; renderTools(); }
        }, h('span', { style: { width: Math.min(22, s) + 'px', height: Math.min(22, s) + 'px' } })));
      });
    }

    function renderStatus() {
      const key = !fileId ? (doc.strokes.length ? 'notes.unsaved' : 'doodle.start') : dirty ? 'notes.saving' : 'notes.saved';
      status.textContent = t('doodle.count', { count: doc.strokes.length }) + ' · ' + t(key);
      btnUndo.disabled = !doc.strokes.length;
      btnRedo.disabled = !undone.length;
    }

    function labels() {
      btnUndo.textContent = t('doodle.undo');
      btnRedo.textContent = t('doodle.redo');
      btnClear.textContent = t('doodle.clear');
      btnSave.textContent = t('ui.save');
      btnNew.textContent = t('ui.new');
      canvas.setAttribute('aria-label', t('doodle.canvas'));
      renderTools();
      renderStatus();
    }

    body.addEventListener('keydown', (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
      else if (k === 's') { e.preventDefault(); save(); }
    });

    load(props.fileId);
    labels();

    return {
      title() {
        const node = fileId && vfs.get(api.state().fs, fileId);
        return t('app.doodle') + ' — ' + (node ? node.name : t('doodle.untitled'));
      },
      update(topics) {
        if (topics.has('lang')) labels();
        // dosya dışarıdan değiştiyse (ör. örnek masa yeni dilde üretildi) yeniden oku
        if (topics.has('fs') && fileId && !dirty && !live) {
          const r = vfs.readFile(api.state().fs, fileId);
          if (r.ok && r.content !== D.encode(doc)) {
            load(fileId);
            undone.length = 0;
            redraw();
            renderStatus();
          }
        }
      },
      async beforeClose() {
        if (fileId) return writeNow();
        if (!doc.strokes.length) return true;
        return api.confirm(t('doodle.discardTitle'), t('notes.discardMsg'), t('ui.discard'));
      },
      destroy() {
        writeNow();
        ro.disconnect();
      }
    };
  }

  PD.appRegistry.doodle = { mount };
})(self);
