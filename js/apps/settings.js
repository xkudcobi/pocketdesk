// Ayarlar: dil, duvar kâğıdı, kayıt bilgisi ve masaüstünü sıfırlama.
(function (root) {
  'use strict';
  const PD = root.PD;
  const { h, clear } = PD.dom;
  const vfs = PD.vfs;

  function mount(body, api) {
    const t = api.t;
    const wrap = h('div', { class: 'settings' });
    body.appendChild(wrap);

    function section(title, ...content) {
      return h('section', { class: 'set-section' }, h('h3', { text: title }), ...content);
    }

    function render() {
      const s = api.state();
      clear(wrap);
      const langRow = h('div', { class: 'set-row' },
        ...['tr', 'en'].map((lang) => h('button', {
          class: 'choice' + (s.lang === lang ? ' on' : ''), type: 'button', 'aria-pressed': String(s.lang === lang),
          text: lang === 'tr' ? 'Türkçe' : 'English',
          onclick: () => api.dispatch('lang/set', { lang })
        })));
      const themeRow = h('div', { class: 'set-row themes' },
        ...PD.persist.THEMES.map((theme) => h('button', {
          class: 'theme-choice' + (s.theme === theme ? ' on' : ''), type: 'button',
          'aria-pressed': String(s.theme === theme),
          onclick: () => api.dispatch('theme/set', { theme })
        }, h('span', { class: 'theme-swatch', dataset: { theme } }), h('span', { text: t('theme.' + theme) }))));
      const files = Object.values(s.fs.nodes).filter((n) => n.type === 'file').length;
      const kb = Math.max(1, Math.round(vfs.totalSize(s.fs) / 1024));
      const resetBtn = h('button', { class: 'btn danger', type: 'button', text: t('settings.reset'), onclick: reset });
      wrap.append(
        section(t('settings.language'), langRow, h('p', { class: 'muted', text: t('settings.languageHint') })),
        section(t('settings.wallpaper'), themeRow),
        section(t('settings.storage'),
          h('p', { text: t('settings.storageInfo', { files, kb }) }),
          h('p', { class: 'muted', text: t('settings.storageHint') }),
          resetBtn),
        section(t('settings.about'), h('p', { text: t('settings.aboutText') }), h('p', { class: 'muted', text: t('settings.shortcuts') }))
      );
    }

    async function reset() {
      const yes = await api.confirm(t('settings.resetTitle'), t('settings.resetMsg'), t('settings.reset'));
      if (!yes) return;
      api.dispatch('desk/reset');
      api.toast(t('settings.resetDone'), 'ok');
    }

    render();
    return {
      title() { return t('app.settings'); },
      update(topics) {
        if (topics.has('lang') || topics.has('theme') || topics.has('fs')) render();
      }
    };
  }

  PD.appRegistry.settings = { mount };
})(self);
