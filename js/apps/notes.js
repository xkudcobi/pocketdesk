// Notlar: düz metin düzenleyici. Kayıtlı bir dosyada yazdıkça kendiliğinden kaydeder.
(function (root) {
  'use strict';
  const PD = root.PD;
  const { h } = PD.dom;
  const vfs = PD.vfs;
  const AUTOSAVE_MS = 700;

  function mount(body, api, props) {
    const t = api.t;
    let fileId = props.fileId && vfs.get(api.state().fs, props.fileId) ? props.fileId : null;
    let dirty = false;
    let timer = null;
    let status = 'idle';

    const area = h('textarea', { class: 'notes-area', spellcheck: 'false' });
    const info = h('span', { class: 'notes-info' });
    const state = h('span', { class: 'notes-state' });
    const btnNew = h('button', { class: 'tb-btn', type: 'button', onclick: () => api.openApp('notes') });
    const btnSave = h('button', { class: 'tb-btn', type: 'button', onclick: () => save() });
    const btnSaveAs = h('button', { class: 'tb-btn', type: 'button', onclick: () => saveAs() });
    const bar = h('div', { class: 'toolbar' }, btnNew, btnSave, btnSaveAs);
    body.append(bar, area, h('div', { class: 'statusbar' }, info, state));

    function load() {
      const r = fileId ? vfs.readFile(api.state().fs, fileId) : null;
      area.value = r && r.ok ? r.content : '';
      dirty = false;
    }

    function counts() {
      const text = area.value;
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      info.textContent = t('notes.counts', { words, chars: text.length });
      const key = !fileId ? (text ? 'notes.unsaved' : 'notes.empty') : status === 'saving' ? 'notes.saving' : status === 'error' ? 'notes.saveFailed' : 'notes.saved';
      state.textContent = t(key);
      state.className = 'notes-state ' + (!fileId && text ? 'warn' : status === 'error' ? 'bad' : '');
    }

    function labels() {
      btnNew.textContent = t('ui.new');
      btnSave.textContent = t('ui.save');
      btnSaveAs.textContent = t('ui.saveAs');
      area.setAttribute('aria-label', t('app.notes'));
      area.placeholder = t('notes.placeholder');
      counts();
    }

    function writeNow() {
      if (timer) { clearTimeout(timer); timer = null; }
      if (!fileId || !dirty || !vfs.get(api.state().fs, fileId)) return true;
      const r = api.dispatch('fs/write', { id: fileId, content: area.value });
      if (!r.ok) {
        status = 'error';
        api.fsError(r);
        counts();
        return false;
      }
      dirty = false;
      status = 'idle';
      counts();
      return true;
    }

    function adopt(id) {
      fileId = id;
      dirty = false;
      status = 'idle';
      api.setProps({ fileId: id, key: 'notes:' + id });
      counts();
    }

    function defaultDir() {
      const fs = api.state().fs;
      const cur = fileId && vfs.get(fs, fileId);
      return cur ? cur.parent : vfs.findSys(fs, 'documents') || vfs.ROOT;
    }

    async function saveAs() {
      const fs = api.state().fs;
      const dir = defaultDir();
      const base = fileId ? vfs.get(fs, fileId).name : t('notes.defaultName');
      const name = await api.prompt(t('notes.saveAsTitle'), vfs.uniqueName(fs, dir, base));
      if (name == null) return false;
      const clean = /\.[a-z0-9]{1,8}$/i.test(name.trim()) ? name.trim() : name.trim() + '.txt';
      const r = api.dispatch('fs/create', { parentId: dir, name: clean, content: area.value });
      if (!r.ok) { api.fsError(r); return false; }
      adopt(r.id);
      api.toast(t('notes.savedAs', { name: clean }), 'ok');
      return true;
    }

    function save() {
      if (!fileId) return saveAs();
      dirty = true;
      if (writeNow()) api.toast(t('notes.savedToast'), 'ok');
      return Promise.resolve(true);
    }

    area.addEventListener('input', () => {
      dirty = true;
      if (fileId) {
        status = 'saving';
        if (timer) clearTimeout(timer);
        timer = setTimeout(writeNow, AUTOSAVE_MS);
      }
      counts();
    });
    area.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
      // sekme tuşu odaktan çıkmak yerine girinti ekler
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        area.setRangeText('  ', area.selectionStart, area.selectionEnd, 'end');
        area.dispatchEvent(new Event('input'));
      }
    });

    load();
    labels();

    return {
      title() {
        const node = fileId && vfs.get(api.state().fs, fileId);
        return node ? node.name : t('notes.untitled') + (area.value ? ' •' : '');
      },
      update(topics) {
        if (topics.has('lang')) labels();
        if (topics.has('fs') && fileId && !dirty) {
          // dosya başka yerden (ör. terminal) değiştiyse yeniden oku
          const r = vfs.readFile(api.state().fs, fileId);
          if (r.ok && r.content !== area.value) {
            const pos = area.selectionStart;
            area.value = r.content;
            area.setSelectionRange(pos, pos);
            counts();
          }
        }
      },
      async beforeClose() {
        if (fileId) return writeNow();
        if (!area.value.trim()) return true;
        return api.confirm(t('notes.discardTitle'), t('notes.discardMsg'), t('ui.discard'));
      },
      destroy() {
        writeNow();
      }
    };
  }

  PD.appRegistry.notes = { mount };
})(self);
