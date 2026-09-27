// Hesap makinesi: tuş takımı, yazarken canlı sonuç ve tıklanınca geri gelen geçmiş.
(function (root) {
  'use strict';
  const PD = root.PD;
  const { h, clear } = PD.dom;
  const MAX_HISTORY = 30;
  const KEYS = [
    ['C', '(', ')', '÷'],
    ['7', '8', '9', '×'],
    ['4', '5', '6', '−'],
    ['1', '2', '3', '+'],
    ['0', '.', '⌫', '=']
  ];
  const EXTRA = ['√', '^', '%', 'π', 'sin', 'cos', 'tan', '!'];

  function mount(body, api) {
    const t = api.t;
    const history = [];
    const expr = h('input', { class: 'calc-expr', type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false' });
    const live = h('div', { class: 'calc-live', 'aria-live': 'polite' });
    const angleBtn = h('button', { class: 'calc-angle', type: 'button', onclick: toggleAngle });
    const histList = h('ol', { class: 'calc-history' });
    const pad = h('div', { class: 'calc-pad' });
    const extra = h('div', { class: 'calc-extra' });
    body.append(h('div', { class: 'calc-screen' }, h('div', { class: 'calc-top' }, angleBtn), expr, live), extra, pad, histList);

    function angle() {
      return api.state().prefs.calcAngle;
    }

    function toggleAngle() {
      api.dispatch('prefs/set', { patch: { calcAngle: angle() === 'deg' ? 'rad' : 'deg' } });
      preview();
    }

    function insert(text) {
      const s = expr.selectionStart == null ? expr.value.length : expr.selectionStart;
      const e = expr.selectionEnd == null ? s : expr.selectionEnd;
      expr.setRangeText(text, s, e, 'end');
      preview();
    }

    function preview() {
      const src = expr.value;
      live.classList.remove('bad');
      if (!src.trim()) { live.textContent = ''; return; }
      const r = PD.calc.evaluate(src, { angle: angle() });
      // yazarken yarım ifade normaldir; yalnızca geçerli sonucu göster
      live.textContent = r.ok ? '= ' + r.text : '';
    }

    function commit() {
      const src = expr.value;
      if (!src.trim()) return;
      const r = PD.calc.evaluate(src, { angle: angle() });
      if (!r.ok) {
        live.textContent = t('err.' + r.error);
        live.classList.add('bad');
        if (r.pos != null) expr.setSelectionRange(r.pos, Math.min(src.length, r.pos + 1));
        return;
      }
      history.unshift({ src, text: r.text });
      if (history.length > MAX_HISTORY) history.pop();
      expr.value = r.text;
      live.textContent = '';
      renderHistory();
    }

    function press(key) {
      if (key === '=') commit();
      else if (key === 'C') { expr.value = ''; preview(); }
      else if (key === '⌫') {
        const s = expr.selectionStart;
        const e = expr.selectionEnd;
        if (s !== e) expr.setRangeText('', s, e, 'end');
        else if (s > 0) expr.setRangeText('', s - 1, s, 'end');
        preview();
      } else if (key === '√') insert('sqrt(');
      else if (key === 'sin' || key === 'cos' || key === 'tan') insert(key + '(');
      else insert(key);
      expr.focus();
    }

    function renderPad() {
      clear(pad);
      for (const row of KEYS) {
        for (const k of row) {
          const cls = 'calc-key' + (/[÷×−+=]/.test(k) ? ' op' : '') + (k === '=' ? ' eq' : '') + (k === 'C' ? ' clear' : '');
          const label = k === 'C' ? t('calc.clear') : k === '⌫' ? t('calc.back') : k;
          pad.appendChild(h('button', { class: cls, type: 'button', text: k, 'aria-label': label, title: label, onclick: () => press(k) }));
        }
      }
      clear(extra);
      for (const k of EXTRA) extra.appendChild(h('button', { class: 'calc-key small', type: 'button', text: k, onclick: () => press(k) }));
    }

    function renderHistory() {
      clear(histList);
      if (!history.length) {
        histList.appendChild(h('li', { class: 'calc-hint', text: t('calc.hint') }));
        return;
      }
      for (const item of history) {
        histList.appendChild(h('li', null, h('button', {
          class: 'calc-hist', type: 'button', title: t('calc.reuse'),
          onclick: () => { expr.value = item.src; preview(); expr.focus(); }
        }, h('span', { text: item.src }), h('strong', { text: '= ' + item.text }))));
      }
    }

    function labels() {
      angleBtn.textContent = angle() === 'deg' ? t('calc.deg') : t('calc.rad');
      angleBtn.title = t('calc.angleTip');
      expr.setAttribute('aria-label', t('calc.input'));
      expr.placeholder = t('calc.placeholder');
      renderPad();
      renderHistory();
    }

    expr.addEventListener('input', preview);
    expr.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === '=') { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') { expr.value = ''; preview(); }
    });

    labels();
    setTimeout(() => expr.focus(), 0);

    return {
      update(topics) {
        if (topics.has('lang')) labels();
        if (topics.has('prefs')) { angleBtn.textContent = angle() === 'deg' ? t('calc.deg') : t('calc.rad'); preview(); }
      }
    };
  }

  PD.appRegistry.calc = { mount };
})(self);
