// Alt çubuk: başlat menüsü, açık pencereler, her an görünen TR | EN düğmesi ve saat.
(function (root) {
  'use strict';
  const PD = root.PD;
  const { h, clear } = PD.dom;
  const MENU_APPS = ['files', 'notes', 'doodle', 'terminal', 'calc', 'puzzle', 'settings'];

  function createTaskbar(host, store, layer, actionsUi) {
    const t = (k, p) => PD.t(k, p);
    const startBtn = h('button', { class: 'start-btn', type: 'button', 'aria-haspopup': 'true', 'aria-expanded': 'false' },
      h('span', { class: 'start-logo', html: PD.icons.ICONS.sun }),
      h('span', { class: 'start-text' }));
    const tasks = h('div', { class: 'tasks', role: 'toolbar' });
    const langTr = h('button', { class: 'lang-opt', type: 'button', text: 'TR', onclick: () => setLang('tr') });
    const langEn = h('button', { class: 'lang-opt', type: 'button', text: 'EN', onclick: () => setLang('en') });
    const langBox = h('div', { class: 'lang-switch', role: 'group' }, langTr, h('span', { class: 'lang-sep', text: '|' }), langEn);
    const clock = h('time', { class: 'clock' });
    const startMenu = h('div', { class: 'start-menu', hidden: true, role: 'menu' });
    host.append(startBtn, tasks, langBox, clock);
    document.body.appendChild(startMenu);

    function setLang(lang) {
      store.dispatch('lang/set', { lang });
    }

    function toggleMenu(force) {
      const open = force == null ? startMenu.hidden : force;
      startMenu.hidden = !open;
      startBtn.setAttribute('aria-expanded', String(open));
      if (open) {
        renderMenu();
        const first = startMenu.querySelector('button');
        if (first) first.focus();
      }
    }

    function renderMenu() {
      clear(startMenu);
      startMenu.appendChild(h('div', { class: 'start-head', text: t('start.greeting') }));
      for (const app of MENU_APPS) {
        startMenu.appendChild(h('button', {
          class: 'start-item', type: 'button', role: 'menuitem',
          onclick: () => { toggleMenu(false); actionsUi.openApp(app); }
        }, h('span', { class: 'start-icon', html: PD.icons.iconFor(app) }),
        h('span', { class: 'start-label' }, h('strong', { text: t('app.' + app) }), h('small', { text: t('about.' + app) }))));
      }
      startMenu.appendChild(h('hr'));
      const row = h('div', { class: 'start-row' },
        h('button', { class: 'btn', type: 'button', text: t('desk.tile'), onclick: () => { toggleMenu(false); store.dispatch('win/tile'); } }),
        h('button', { class: 'btn', type: 'button', text: t('desk.cascade'), onclick: () => { toggleMenu(false); store.dispatch('win/cascade'); } }),
        h('button', { class: 'btn', type: 'button', text: t('desk.showDesk'), onclick: () => { toggleMenu(false); store.dispatch('win/minimizeAll'); } }));
      startMenu.appendChild(row);
    }

    startBtn.addEventListener('click', () => toggleMenu());
    document.addEventListener('pointerdown', (e) => {
      if (!startMenu.hidden && !startMenu.contains(e.target) && !startBtn.contains(e.target)) toggleMenu(false);
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !startMenu.hidden) toggleMenu(false); });

    function renderTasks() {
      const s = store.getState();
      clear(tasks);
      // görev düğmeleri açılış sırasıyla durur, odak değişince yer değiştirmez
      const list = s.wm.list.slice().sort((a, b) => a.id - b.id);
      for (const win of list) {
        const active = win.id === s.wm.focusedId && !win.minimized;
        const title = layer.titleOf(win.id) || t('app.' + win.app);
        tasks.appendChild(h('button', {
          class: 'task' + (active ? ' active' : '') + (win.minimized ? ' minimized' : ''),
          type: 'button',
          title,
          'aria-pressed': String(active),
          onclick: () => store.dispatch(active ? 'win/minimize' : 'win/focus', { id: win.id })
        }, h('span', { class: 'task-icon', html: PD.icons.iconFor(win.app) }), h('span', { class: 'task-text', text: title })));
      }
    }

    function renderStatic() {
      const s = store.getState();
      startBtn.querySelector('.start-text').textContent = t('start.button');
      startBtn.setAttribute('aria-label', t('start.button'));
      langBox.setAttribute('aria-label', t('ui.language'));
      langTr.classList.toggle('on', s.lang === 'tr');
      langEn.classList.toggle('on', s.lang === 'en');
      langTr.setAttribute('aria-pressed', String(s.lang === 'tr'));
      langEn.setAttribute('aria-pressed', String(s.lang === 'en'));
      langTr.title = 'Türkçe';
      langEn.title = 'English';
      if (!startMenu.hidden) renderMenu();
      tick();
    }

    function tick() {
      const now = new Date();
      const lang = store.getState().lang;
      clock.textContent = now.toLocaleTimeString(lang === 'tr' ? 'tr-TR' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
      clock.title = now.toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-GB', { dateStyle: 'full' });
      clock.setAttribute('datetime', now.toISOString());
    }
    setInterval(tick, 15000);

    return {
      sync(topics) {
        if (topics.has('lang')) renderStatic();
        renderTasks();
      },
      renderStatic
    };
  }

  PD.createTaskbar = createTaskbar;
})(self);
