// Masaüstü: uygulama kısayolları, Masaüstü klasöründeki dosyalar ve Çöp Kutusu.
// Simgeler çift tıkla (dokunmatikte tek dokunuşla) açılır; dosyalar çöpe sürüklenebilir.
(function (root) {
  'use strict';
  const PD = root.PD;
  const { h, clear } = PD.dom;
  const vfs = PD.vfs;
  const SHORTCUTS = ['files', 'notes', 'doodle', 'terminal', 'calc', 'puzzle', 'settings'];
  const DRAG_TYPE = 'application/x-pocketdesk-node';
  PD.desktopDragType = DRAG_TYPE;

  function createDesktop(host, store, actionsUi) {
    const t = (k, p) => PD.t(k, p);
    let selected = null;

    function select(key) {
      selected = key;
      host.querySelectorAll('.icon').forEach((el) => el.classList.toggle('selected', el.dataset.key === key));
    }

    function iconEl(key, svg, text, open, extra) {
      const el = h('button', { class: 'icon', type: 'button', dataset: { key }, title: text },
        h('span', { class: 'icon-img', html: svg }),
        h('span', { class: 'icon-label', text }));
      el.addEventListener('click', (e) => {
        select(key);
        // dokunmatik ekranda çift dokunuş beklemeden aç
        if (e.pointerType === 'touch' || (e.detail === 0 && e.pointerType !== 'mouse')) open();
      });
      el.addEventListener('dblclick', open);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); open(); } });
      if (extra) extra(el);
      return el;
    }

    function trashTarget(el) {
      el.addEventListener('dragover', (e) => {
        if (e.dataTransfer.types.indexOf(DRAG_TYPE) >= 0) { e.preventDefault(); el.classList.add('drop'); }
      });
      el.addEventListener('dragleave', () => el.classList.remove('drop'));
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.classList.remove('drop');
        const id = e.dataTransfer.getData(DRAG_TYPE);
        if (id) actionsUi.trashNode(id);
      });
    }

    function render() {
      const s = store.getState();
      clear(host);
      for (const app of SHORTCUTS) {
        host.appendChild(iconEl('app:' + app, PD.icons.iconFor(app), t('app.' + app), () => actionsUi.openApp(app)));
      }
      const desktopId = vfs.findSys(s.fs, 'desktop');
      for (const node of vfs.list(s.fs, desktopId)) {
        host.appendChild(iconEl('node:' + node.id, PD.icons.nodeIcon(node), node.name, () => store.dispatch('win/openNode', { id: node.id }), (el) => {
          el.draggable = true;
          el.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData(DRAG_TYPE, node.id);
            e.dataTransfer.effectAllowed = 'move';
          });
          el.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            select('node:' + node.id);
            PD.dom.menu(e.clientX, e.clientY, [
              { label: t('ui.open'), action: () => store.dispatch('win/openNode', { id: node.id }) },
              { label: t('ui.rename'), action: () => actionsUi.renameNode(node.id) },
              'sep',
              { label: t('ui.toTrash'), danger: true, action: () => actionsUi.trashNode(node.id) }
            ]);
          });
        }));
      }
      const trashId = vfs.findSys(s.fs, 'trash');
      const trashNode = vfs.get(s.fs, trashId);
      if (trashNode) {
        host.appendChild(iconEl('node:' + trashId, PD.icons.nodeIcon(trashNode), trashNode.name, () => store.dispatch('win/openNode', { id: trashId }), trashTarget));
      }
      if (selected) select(selected);
    }

    // sağ tık menüsü simge sütununda değil bütün masaüstünde çalışır; pencerelerin içi hariç
    const deskEl = host.parentElement;
    deskEl.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.icon, .win')) return;
      e.preventDefault();
      PD.dom.menu(e.clientX, e.clientY, [
        { label: t('desk.newNote'), action: () => actionsUi.newNote() },
        { label: t('desk.newDrawing'), action: () => actionsUi.openApp('doodle') },
        { label: t('desk.newFolder'), action: () => actionsUi.newFolder(vfs.findSys(store.getState().fs, 'desktop')) },
        'sep',
        { label: t('desk.tile'), action: () => store.dispatch('win/tile') },
        { label: t('desk.cascade'), action: () => store.dispatch('win/cascade') },
        { label: t('desk.wallpaper'), action: () => actionsUi.openApp('settings') }
      ]);
    });
    deskEl.addEventListener('pointerdown', (e) => { if (!e.target.closest('.icon, .win')) select(null); });

    return {
      sync(topics) {
        if (topics.has('fs') || topics.has('lang')) render();
      },
      render,
      DRAG_TYPE
    };
  }

  PD.createDesktop = createDesktop;
})(self);
