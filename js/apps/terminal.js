// Terminal: sanal dosya sistemi üzerinde çalışan küçük bir komut satırı.
// Komutlar çekirdekteki kabukta çalışır; burası yalnızca giriş, geçmiş ve çıktıyı yönetir.
(function (root) {
  'use strict';
  const PD = root.PD;
  const { h } = PD.dom;
  const vfs = PD.vfs;
  const MAX_LINES = 600;
  const MAX_HISTORY = 100;

  function mount(body, api, props) {
    const t = api.t;
    const history = [];
    let histIdx = 0;
    let draft = '';

    const out = h('div', { class: 'term-out', role: 'log', 'aria-live': 'polite' });
    const promptEl = h('span', { class: 'term-prompt' });
    const input = h('input', { class: 'term-input', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
    const line = h('label', { class: 'term-line' }, promptEl, input);
    const screen = h('div', { class: 'term-screen' }, out, line);
    body.appendChild(screen);

    if (!props.cwd) api.setProps({ cwd: vfs.findSys(api.state().fs, 'documents') || vfs.ROOT });
    const cwd = () => {
      const c = api.props().cwd;
      return vfs.isDir(api.state().fs, c) ? c : vfs.ROOT;
    };

    function print(text, kind) {
      out.appendChild(h('div', { class: 'term-row ' + (kind || 'out'), text }));
      // eski satırları at ki uzun oturumlarda DOM şişmesin
      while (out.childElementCount > MAX_LINES) out.removeChild(out.firstChild);
    }

    function promptText() {
      return t('term.user') + ':' + vfs.pathOf(api.state().fs, cwd()) + ' $';
    }

    function scroll() {
      screen.scrollTop = screen.scrollHeight;
    }

    function banner() {
      print(t('term.banner'), 'info');
      print(t('term.bannerTip'), 'info');
    }

    function run(text) {
      print(promptText() + ' ' + text, 'cmd');
      if (text.trim()) {
        if (history[history.length - 1] !== text) history.push(text);
        if (history.length > MAX_HISTORY) history.shift();
      }
      histIdx = history.length;
      draft = '';
      const res = api.dispatch('shell/run', { line: text, cwd: cwd(), winId: api.winId });
      if (!res) return;
      for (const e of res.effects) if (e.type === 'clear') out.textContent = '';
      for (const l of res.lines) print(l.text, l.kind);
      promptEl.textContent = promptText();
      scroll();
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const text = input.value;
        input.value = '';
        run(text);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (histIdx === history.length) draft = input.value;
        if (histIdx > 0) input.value = history[--histIdx];
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (histIdx < history.length) {
          histIdx++;
          input.value = histIdx === history.length ? draft : history[histIdx];
        }
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const r = PD.shell.complete(input.value, { fs: api.state().fs, cwd: cwd() });
        input.value = r.line;
        if (r.options.length) {
          print(promptText() + ' ' + input.value, 'cmd');
          print(r.options.join('   '), 'info');
          scroll();
        }
      } else if (e.key === 'l' && e.ctrlKey) {
        e.preventDefault();
        out.textContent = '';
      }
    });
    screen.addEventListener('click', () => {
      if (!window.getSelection().toString()) input.focus();
    });

    banner();
    promptEl.textContent = promptText();
    input.setAttribute('aria-label', t('app.terminal'));

    return {
      title() {
        return t('app.terminal') + ' — ' + vfs.pathOf(api.state().fs, cwd());
      },
      update(topics) {
        if (topics.has('fs') || topics.has('lang') || topics.has('wm')) promptEl.textContent = promptText();
        if (topics.has('lang')) input.setAttribute('aria-label', t('app.terminal'));
      }
    };
  }

  PD.appRegistry.terminal = { mount };
})(self);
