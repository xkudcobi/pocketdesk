// Dosyalar: klasörlerde gezinme, oluşturma, yeniden adlandırma, sürükle-bırak ile taşıma ve çöp.
(function (root) {
  'use strict';
  const PD = root.PD;
  const { h, clear } = PD.dom;
  const vfs = PD.vfs;
  const PLACES = ['desktop', 'documents', 'pictures', 'trash'];

  function mount(body, api, props) {
    const t = api.t;
    let selectedId = null;
    let shownDir = null;
    const fs = () => api.state().fs;
    const dirId = () => {
      const d = api.props().dirId;
      return vfs.isDir(fs(), d) ? d : vfs.ROOT;
    };
    const DRAG = PD.desktopDragType;

    const btnUp = h('button', { class: 'tb-btn icon-only', type: 'button', text: '↑', onclick: () => goUp() });
    const crumbs = h('nav', { class: 'crumbs' });
    const actions = h('div', { class: 'tb-actions' });
    const side = h('div', { class: 'files-side' });
    const grid = h('div', { class: 'files-grid', tabindex: '0', role: 'listbox' });
    const status = h('div', { class: 'statusbar' });
    body.append(h('div', { class: 'toolbar' }, btnUp, crumbs), h('div', { class: 'toolbar sub' }, actions),
      h('div', { class: 'files-main' }, side, grid), status);

    if (!props.dirId) api.setProps({ dirId: vfs.findSys(fs(), 'desktop') || vfs.ROOT });

    function go(id) {
      selectedId = null;
      api.setProps({ dirId: id });
    }

    function goUp() {
      const node = vfs.get(fs(), dirId());
      if (node && node.parent) go(node.parent);
    }

    function open(node) {
      if (node.type === 'dir') go(node.id);
      else api.openNode(node.id);
    }

    function dropTarget(el, targetId) {
      el.addEventListener('dragover', (e) => {
        if (e.dataTransfer.types.indexOf(DRAG) < 0) return;
        e.preventDefault();
        el.classList.add('drop');
      });
      el.addEventListener('dragleave', () => el.classList.remove('drop'));
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.classList.remove('drop');
        const id = e.dataTransfer.getData(DRAG);
        if (!id || id === targetId) return;
        if (vfs.get(fs(), targetId).sys === 'trash') { api.ui.trashNode(id); return; }
        const r = api.dispatch('fs/move', { id, targetId });
        if (!r.ok) api.fsError(r);
      });
    }

    function itemMenu(e, node) {
      e.preventDefault();
      e.stopPropagation();
      selectedId = node.id;
      render();
      const inTrash = vfs.isInTrash(fs(), node.id) && node.parent === vfs.findSys(fs(), 'trash');
      const items = [{ label: t('ui.open'), action: () => open(node) }];
      if (inTrash) {
        items.push({ label: t('files.restore'), action: () => restore(node.id) });
        items.push('sep', { label: t('files.deleteForever'), danger: true, action: () => api.ui.trashNode(node.id) });
      } else if (!node.sys) {
        items.push({ label: t('ui.rename'), action: () => api.ui.renameNode(node.id) });
        items.push({ label: t('files.duplicate'), action: () => duplicate(node.id) });
        items.push('sep', { label: t('ui.toTrash'), danger: true, action: () => api.ui.trashNode(node.id) });
      }
      PD.dom.menu(e.clientX, e.clientY, items);
    }

    function duplicate(id) {
      const node = vfs.get(fs(), id);
      const r = api.dispatch('fs/copy', { id, targetId: node.parent });
      if (!r.ok) api.fsError(r);
      else selectedId = r.id;
    }

    function restore(id) {
      const r = api.dispatch('fs/restore', { id });
      if (!r.ok) api.fsError(r);
      else api.toast(t('files.restored', { name: vfs.get(fs(), id).name }), 'ok');
    }

    async function emptyTrash() {
      const trash = vfs.get(fs(), vfs.findSys(fs(), 'trash'));
      if (!trash || !trash.children.length) return;
      const yes = await api.confirm(t('files.emptyTitle'), t('files.emptyMsg', { count: trash.children.length }), t('files.emptyTrash'));
      if (yes) api.dispatch('fs/emptyTrash');
    }

    function tbButton(text, onclick, disabled, danger) {
      return h('button', { class: 'tb-btn' + (danger ? ' danger' : ''), type: 'button', text, onclick, disabled: disabled || null });
    }

    function renderActions(dir, isTrash) {
      clear(actions);
      const sel = selectedId && vfs.get(fs(), selectedId);
      if (isTrash) {
        actions.append(
          tbButton(t('files.restore'), () => restore(selectedId), !sel),
          tbButton(t('files.emptyTrash'), emptyTrash, !dir.children.length, true));
        return;
      }
      actions.append(
        tbButton(t('files.newFolder'), () => api.ui.newFolder(dirId())),
        tbButton(t('files.newNote'), () => api.ui.newNote(dirId())),
        tbButton(t('ui.rename'), () => api.ui.renameNode(selectedId), !sel || !!sel.sys),
        tbButton(t('ui.toTrash'), () => api.ui.trashNode(selectedId), !sel || !!sel.sys, true));
    }

    function renderCrumbs() {
      clear(crumbs);
      const chain = [];
      for (let cur = vfs.get(fs(), dirId()); cur; cur = cur.parent ? vfs.get(fs(), cur.parent) : null) chain.unshift(cur);
      chain.forEach((node, i) => {
        if (i > 0) crumbs.appendChild(h('span', { class: 'crumb-sep', text: '›' }));
        const b = h('button', { class: 'crumb', type: 'button', text: node.id === vfs.ROOT ? t('files.computer') : node.name, onclick: () => go(node.id) });
        dropTarget(b, node.id);
        crumbs.appendChild(b);
      });
    }

    function renderSide() {
      clear(side);
      const rootBtn = h('button', { class: 'place' + (dirId() === vfs.ROOT ? ' on' : ''), type: 'button', onclick: () => go(vfs.ROOT) },
        h('span', { class: 'place-icon', html: PD.icons.ICONS.files }), t('files.computer'));
      side.appendChild(rootBtn);
      for (const sys of PLACES) {
        const id = vfs.findSys(fs(), sys);
        const node = vfs.get(fs(), id);
        if (!node) continue;
        const b = h('button', { class: 'place' + (dirId() === id ? ' on' : ''), type: 'button', onclick: () => go(id) },
          h('span', { class: 'place-icon', html: PD.icons.nodeIcon(node) }), node.name);
        dropTarget(b, id);
        side.appendChild(b);
      }
    }

    // Seçim değişince bütün ızgarayı yeniden kurmak çift tıklamayı bozar; yalnızca sınıflar güncellenir
    function markSelection() {
      for (const el of grid.children) {
        const on = el.dataset.id === selectedId;
        el.classList.toggle('selected', on);
        if (el.dataset.id) el.setAttribute('aria-selected', String(on));
        if (on) el.scrollIntoView({ block: 'nearest' });
      }
      const dir = vfs.get(fs(), dirId());
      renderActions(dir, dir.id === vfs.findSys(fs(), 'trash'));
    }

    function render() {
      const dir = vfs.get(fs(), dirId());
      const trashId = vfs.findSys(fs(), 'trash');
      const isTrash = dir.id === trashId;
      if (selectedId && (vfs.get(fs(), selectedId) || {}).parent !== dir.id) selectedId = null;
      shownDir = dir.id;
      btnUp.disabled = !dir.parent;
      btnUp.title = t('files.up');
      btnUp.setAttribute('aria-label', t('files.up'));
      renderCrumbs();
      renderSide();
      renderActions(dir, isTrash);
      clear(grid);
      grid.setAttribute('aria-label', dir.id === vfs.ROOT ? t('files.computer') : dir.name);
      const items = vfs.list(fs(), dir.id);
      if (!items.length) grid.appendChild(h('p', { class: 'files-empty', text: t(isTrash ? 'files.trashEmpty' : 'files.emptyFolder') }));
      for (const node of items) {
        const meta = node.type === 'dir'
          ? t('files.itemCount', { count: node.children.length })
          : PD.dom.formatDate(node.mtime, api.state().lang);
        const el = h('div', {
          class: 'file-item' + (node.id === selectedId ? ' selected' : ''),
          role: 'option', tabindex: '-1', draggable: node.sys ? 'false' : 'true',
          'aria-selected': String(node.id === selectedId), title: node.name
        }, h('span', { class: 'file-icon', html: PD.icons.nodeIcon(node) }),
        h('span', { class: 'file-name', text: node.name }),
        h('span', { class: 'file-meta', text: meta }));
        el.dataset.id = node.id;
        el.addEventListener('click', (e) => {
          selectedId = node.id;
          if (e.pointerType === 'touch') open(node);
          else markSelection();
        });
        el.addEventListener('dblclick', () => open(node));
        el.addEventListener('contextmenu', (e) => itemMenu(e, node));
        el.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData(DRAG, node.id);
          e.dataTransfer.effectAllowed = 'move';
        });
        if (node.type === 'dir') dropTarget(el, node.id);
        grid.appendChild(el);
      }
      status.textContent = t('files.itemCount', { count: items.length }) + (isTrash ? ' · ' + t('files.trashHint') : '');
    }

    grid.addEventListener('keydown', (e) => {
      const items = vfs.list(fs(), dirId());
      const idx = items.findIndex((n) => n.id === selectedId);
      const sel = idx >= 0 ? items[idx] : null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { selectedId = (items[Math.min(items.length - 1, idx + 1)] || {}).id || null; markSelection(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { selectedId = (items[Math.max(0, idx - 1)] || {}).id || null; markSelection(); }
      else if (e.key === 'Enter' && sel) open(sel);
      else if (e.key === 'Delete' && sel && !sel.sys) api.ui.trashNode(sel.id);
      else if (e.key === 'F2' && sel && !sel.sys) api.ui.renameNode(sel.id);
      else if (e.key === 'Backspace') goUp();
      else return;
      e.preventDefault();
    });
    grid.addEventListener('click', (e) => {
      if (e.target === grid) { selectedId = null; markSelection(); }
    });

    render();

    return {
      title() {
        const d = vfs.get(fs(), dirId());
        return t('app.files') + ' — ' + (d.id === vfs.ROOT ? t('files.computer') : d.name);
      },
      update(topics) {
        // pencere odağı değişince yeniden çizmek tıklamayı yutar; yalnızca klasör değişince çiz
        if (topics.has('fs') || topics.has('lang') || (topics.has('wm') && dirId() !== shownDir)) render();
      }
    };
  }

  PD.appRegistry.files = { mount };
})(self);
