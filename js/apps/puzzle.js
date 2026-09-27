// Kaydırmaca: renkli karoları sıraya diz. Karolar bir kez oluşturulur,
// hamlelerde yalnızca konumları (transform) değişir, böylece kayma animasyonu akıcıdır.
(function (root) {
  'use strict';
  const PD = root.PD;
  const { h, clear } = PD.dom;
  const P = PD.puzzle;

  function mount(body, api) {
    const t = api.t;
    let size = 3;
    let tiles = [];
    let moves = 0;
    let startedAt = 0;
    let elapsed = 0;
    let solvedNow = false;
    let hintIdx = -1;
    let timer = null;
    let tileEls = [];
    let lastWin = null;

    const board = h('div', { class: 'pz-board', role: 'grid' });
    const stats = h('div', { class: 'pz-stats' });
    const best = h('div', { class: 'pz-best' });
    const btnNew = h('button', { class: 'tb-btn', type: 'button', onclick: () => newGame(size) });
    const btn3 = h('button', { class: 'tb-btn seg', type: 'button', text: '3×3', onclick: () => newGame(3) });
    const btn4 = h('button', { class: 'tb-btn seg', type: 'button', text: '4×4', onclick: () => newGame(4) });
    const btnHint = h('button', { class: 'tb-btn', type: 'button', onclick: showHint });
    const banner = h('div', { class: 'pz-banner', hidden: true });
    body.append(h('div', { class: 'toolbar' }, btn3, btn4, btnNew, btnHint), stats, h('div', { class: 'pz-wrap' }, board, banner), best);

    function fmtTime(ms) {
      const s = Math.floor(ms / 1000);
      return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    }

    function currentMs() {
      return startedAt ? elapsed + (Date.now() - startedAt) : elapsed;
    }

    function tileColor(v) {
      const n = size * size - 1;
      const hue = Math.round(((v - 1) / n) * 300);
      return `hsl(${hue} 78% 62%)`;
    }

    function buildTiles() {
      clear(board);
      board.style.setProperty('--n', size);
      tileEls = [];
      for (let v = 1; v < size * size; v++) {
        const el = h('button', { class: 'pz-tile', type: 'button', text: String(v), style: { background: tileColor(v) } });
        el.addEventListener('click', () => clickTile(tiles.indexOf(v)));
        board.appendChild(el);
        tileEls[v] = el;
      }
    }

    function layout() {
      for (let i = 0; i < tiles.length; i++) {
        const v = tiles[i];
        if (!v) continue;
        const el = tileEls[v];
        el.style.transform = `translate(${(i % size) * 100}%, ${Math.floor(i / size) * 100}%)`;
        el.classList.toggle('home', v === i + 1);
        el.classList.toggle('hint', i === hintIdx);
        el.setAttribute('aria-label', t('puzzle.tileLabel', { n: v }));
      }
    }

    function renderStats() {
      stats.textContent = t('puzzle.stats', { moves, time: fmtTime(currentMs()) });
      const b = api.state().prefs.puzzleBest[String(size)];
      best.textContent = b ? t('puzzle.best', { moves: b.moves, time: fmtTime(b.ms) }) : t('puzzle.noBest');
    }

    function tickStart() {
      if (timer) return;
      startedAt = Date.now();
      timer = setInterval(renderStats, 500);
    }

    function tickStop() {
      if (timer) { clearInterval(timer); timer = null; }
      if (startedAt) { elapsed += Date.now() - startedAt; startedAt = 0; }
    }

    function newGame(n) {
      tickStop();
      size = n;
      tiles = P.shuffle(size, P.rng((Date.now() ^ (Math.random() * 1e9)) >>> 0));
      moves = 0;
      elapsed = 0;
      solvedNow = false;
      hintIdx = -1;
      lastWin = null;
      banner.hidden = true;
      btn3.classList.toggle('on', n === 3);
      btn4.classList.toggle('on', n === 4);
      buildTiles();
      layout();
      renderStats();
    }

    function clickTile(index) {
      if (solvedNow) return;
      const moved = P.slide(tiles, size, index);
      if (!moved) return;
      tickStart();
      moves += moved;
      hintIdx = -1;
      layout();
      if (P.isSolved(tiles)) win();
      renderStats();
    }

    function win() {
      tickStop();
      solvedNow = true;
      const key = String(size);
      const prev = api.state().prefs.puzzleBest[key];
      const ms = currentMs();
      const record = !prev || moves < prev.moves || (moves === prev.moves && ms < prev.ms);
      if (record) {
        const puzzleBest = Object.assign({}, api.state().prefs.puzzleBest, { [key]: { moves, ms } });
        api.dispatch('prefs/set', { patch: { puzzleBest } });
      }
      lastWin = { record, moves, ms };
      renderBanner();
    }

    function renderBanner() {
      banner.hidden = !lastWin;
      clear(banner);
      if (!lastWin) return;
      banner.append(h('strong', { text: t('puzzle.solved') }),
        h('span', { text: t(lastWin.record ? 'puzzle.newRecord' : 'puzzle.solvedIn', { moves: lastWin.moves, time: fmtTime(lastWin.ms) }) }),
        h('button', { class: 'btn primary', type: 'button', text: t('puzzle.again'), onclick: () => newGame(size) }));
    }

    function showHint() {
      if (solvedNow) return;
      const r = P.hint(tiles, size, size === 3 ? 200000 : 60000);
      if (!r) return;
      hintIdx = r.index;
      layout();
      if (r.exact) api.toast(t('puzzle.hintExact', { n: r.remaining }), 'info');
    }

    // ok tuşları boşluğa doğru karo kaydırır
    board.tabIndex = 0;
    board.addEventListener('keydown', (e) => {
      const blank = tiles.indexOf(0);
      const r = Math.floor(blank / size);
      const c = blank % size;
      const map = { ArrowUp: r < size - 1 ? blank + size : -1, ArrowDown: r > 0 ? blank - size : -1, ArrowLeft: c < size - 1 ? blank + 1 : -1, ArrowRight: c > 0 ? blank - 1 : -1 };
      if (!(e.key in map)) return;
      e.preventDefault();
      if (map[e.key] >= 0) clickTile(map[e.key]);
    });

    function labels() {
      btnNew.textContent = t('puzzle.shuffle');
      btnHint.textContent = t('puzzle.hint');
      board.setAttribute('aria-label', t('puzzle.boardLabel'));
      layout();
      renderStats();
      renderBanner();
    }

    newGame(3);
    labels();

    return {
      title() { return t('app.puzzle'); },
      update(topics) { if (topics.has('lang') || topics.has('prefs')) labels(); },
      destroy() { tickStop(); }
    };
  }

  PD.appRegistry.puzzle = { mount };
})(self);
