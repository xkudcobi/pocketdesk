// Küçük DOM yardımcıları: öğe üretimi, bildirimler, soru pencereleri ve sağ tık menüsü.
(function (root) {
  'use strict';
  const PD = root.PD;

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    appendAll(el, children);
    return el;
  }

  function appendAll(el, children) {
    for (const c of children) {
      if (c == null || c === false) continue;
      if (Array.isArray(c)) appendAll(el, c);
      else el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    }
  }

  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function toast(text, kind) {
    const host = document.getElementById('toasts');
    const el = h('div', { class: 'toast ' + (kind || 'info'), role: 'status', text });
    host.appendChild(el);
    setTimeout(() => el.classList.add('leaving'), 2600);
    setTimeout(() => el.remove(), 3000);
  }

  // Tarayıcının prompt() kutusu yerine sayfa içi, dil destekli bir kutu
  function ask(opts) {
    const t = PD.t;
    return new Promise((resolve) => {
      const overlay = document.getElementById('overlay');
      const input = opts.input === false ? null : h('input', { class: 'dlg-input', type: 'text', value: opts.value || '', maxlength: '60', 'aria-label': opts.title });
      const done = (val) => {
        overlay.hidden = true;
        clear(overlay);
        document.removeEventListener('keydown', onKey, true);
        resolve(val);
      };
      const okBtn = h('button', { class: 'btn primary', text: opts.ok || t('ui.ok'), onclick: () => done(input ? input.value : true) });
      const cancelBtn = h('button', { class: 'btn', text: t('ui.cancel'), onclick: () => done(input ? null : false) });
      const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); done(input ? null : false); }
        else if (e.key === 'Enter') { e.preventDefault(); done(input ? input.value : true); }
      };
      clear(overlay);
      overlay.appendChild(h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title },
        h('h2', { text: opts.title }),
        opts.message ? h('p', { text: opts.message }) : null,
        input,
        h('div', { class: 'dlg-actions' }, cancelBtn, okBtn)));
      overlay.hidden = false;
      document.addEventListener('keydown', onKey, true);
      if (input) {
        input.focus();
        // uzantıyı seçime katma: "Not.txt" -> yalnızca "Not" seçili gelir
        const dot = input.value.lastIndexOf('.');
        input.setSelectionRange(0, dot > 0 ? dot : input.value.length);
      } else okBtn.focus();
    });
  }

  function prompt(title, value, ok) {
    return ask({ title, value, ok });
  }

  function confirm(title, message, ok) {
    return ask({ title, message, ok, input: false });
  }

  // items: [{ label, action, danger? } | 'sep']
  let menuEl = null;
  function closeMenu() {
    if (menuEl) { menuEl.remove(); menuEl = null; }
  }

  function menu(x, y, items) {
    closeMenu();
    menuEl = h('div', { class: 'ctx-menu', role: 'menu' });
    for (const it of items) {
      if (it === 'sep') { menuEl.appendChild(h('hr')); continue; }
      menuEl.appendChild(h('button', {
        class: 'ctx-item' + (it.danger ? ' danger' : ''),
        role: 'menuitem',
        text: it.label,
        disabled: it.disabled || null,
        onclick: () => { closeMenu(); it.action(); }
      }));
    }
    document.body.appendChild(menuEl);
    const r = menuEl.getBoundingClientRect();
    menuEl.style.left = Math.min(x, window.innerWidth - r.width - 6) + 'px';
    menuEl.style.top = Math.min(y, window.innerHeight - r.height - 6) + 'px';
    const first = menuEl.querySelector('button:not([disabled])');
    if (first) first.focus();
  }

  document.addEventListener('pointerdown', (e) => {
    if (menuEl && !menuEl.contains(e.target)) closeMenu();
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

  function formatDate(ms, lang) {
    return new Date(ms).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  }

  PD.appRegistry = PD.appRegistry || {};
  PD.dom = { h, clear, toast, prompt, confirm, menu, closeMenu, formatDate };
})(self);
