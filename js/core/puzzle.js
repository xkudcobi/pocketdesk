// Kaydırmalı karo bulmacası: karıştırma, çözülebilirlik, hamle ve IDA* ile ipucu.
// Tahta düz bir dizi; 0 boş hücredir, çözülmüş hâl [1, 2, ..., n*n-1, 0].
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.PD = root.PD || {}).puzzle = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const FOUND = -1;
  const ABORT = -2;

  // Tekrar üretilebilir karıştırma için küçük bir tohumlu rastgele sayı üreteci
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function solved(size) {
    const n = size * size;
    const tiles = new Array(n);
    for (let i = 0; i < n - 1; i++) tiles[i] = i + 1;
    tiles[n - 1] = 0;
    return tiles;
  }

  function isSolved(tiles) {
    const n = tiles.length;
    for (let i = 0; i < n - 1; i++) if (tiles[i] !== i + 1) return false;
    return tiles[n - 1] === 0;
  }

  function neighborTable(size) {
    const table = [];
    for (let i = 0; i < size * size; i++) {
      const r = (i / size) | 0;
      const c = i % size;
      const list = [];
      if (r > 0) list.push(i - size);
      if (r < size - 1) list.push(i + size);
      if (c > 0) list.push(i - 1);
      if (c < size - 1) list.push(i + 1);
      table.push(list);
    }
    return table;
  }

  // Tersinme sayısı ve boş hücrenin satırı ile klasik çözülebilirlik kuralı
  function isSolvable(tiles, size) {
    const n = size * size;
    if (!Array.isArray(tiles) || tiles.length !== n) return false;
    const seen = new Array(n).fill(false);
    for (const v of tiles) {
      if (!Number.isInteger(v) || v < 0 || v >= n || seen[v]) return false;
      seen[v] = true;
    }
    let inversions = 0;
    for (let i = 0; i < n; i++) {
      if (!tiles[i]) continue;
      for (let j = i + 1; j < n; j++) if (tiles[j] && tiles[j] < tiles[i]) inversions++;
    }
    if (size % 2 === 1) return inversions % 2 === 0;
    const blankRowFromBottom = size - Math.floor(tiles.indexOf(0) / size);
    return (inversions + blankRowFromBottom) % 2 === 1;
  }

  // Çözülmüş hâlden rastgele geçerli hamlelerle uzaklaşır, bu yüzden her zaman çözülebilir
  function shuffle(size, random, steps) {
    const tiles = solved(size);
    const nb = neighborTable(size);
    const count = steps || size * size * 20;
    let blank = tiles.length - 1;
    let prev = -1;
    for (let k = 0; k < count; k++) {
      const options = nb[blank];
      let next;
      do next = options[Math.floor(random() * options.length)]; while (next === prev && options.length > 1);
      tiles[blank] = tiles[next];
      tiles[next] = 0;
      prev = blank;
      blank = next;
    }
    if (isSolved(tiles)) return shuffle(size, random, count + 1);
    return tiles;
  }

  // Tıklanan karo boşlukla aynı satır ya da sütundaysa aradaki bütün karolar kayar.
  // Tahtayı yerinde değiştirir, kaç karonun kaydığını döndürür.
  function slide(tiles, size, index) {
    const blank = tiles.indexOf(0);
    if (index === blank || index < 0 || index >= tiles.length) return 0;
    const br = Math.floor(blank / size);
    const bc = blank % size;
    const r = Math.floor(index / size);
    const c = index % size;
    let step;
    if (r === br) step = c < bc ? -1 : 1;
    else if (c === bc) step = r < br ? -size : size;
    else return 0;
    let moved = 0;
    let hole = blank;
    while (hole !== index) {
      tiles[hole] = tiles[hole + step];
      hole += step;
      moved++;
    }
    tiles[index] = 0;
    return moved;
  }

  function manhattan(tiles, size) {
    let d = 0;
    for (let i = 0; i < tiles.length; i++) {
      const v = tiles[i];
      if (!v) continue;
      const g = v - 1;
      d += Math.abs(((i / size) | 0) - ((g / size) | 0)) + Math.abs((i % size) - (g % size));
    }
    return d;
  }

  // IDA*: bellek dostu, tahta yerinde değiştirilir, sezgisel artımlı güncellenir.
  // Dönen dizi tıklanması gereken karo indeksleridir; bütçe aşılırsa null.
  function solve(tiles, size, maxNodes) {
    if (!isSolvable(tiles, size)) return null;
    if (isSolved(tiles)) return [];
    const budget = maxNodes || 400000;
    const board = Uint8Array.from(tiles);
    const nb = neighborTable(size);
    const rowOf = new Int8Array(board.length);
    const colOf = new Int8Array(board.length);
    for (let i = 0; i < board.length; i++) { rowOf[i] = (i / size) | 0; colOf[i] = i % size; }
    const dist = (v, at) => Math.abs(rowOf[at] - rowOf[v - 1]) + Math.abs(colOf[at] - colOf[v - 1]);
    let blank = board.indexOf(0);
    let h = manhattan(tiles, size);
    let nodes = 0;
    const path = [];

    function search(g, bound, prevBlank) {
      const f = g + h;
      if (f > bound) return f;
      if (h === 0) return FOUND;
      if (++nodes > budget) return ABORT;
      let min = Infinity;
      const options = nb[blank];
      for (let k = 0; k < options.length; k++) {
        const from = options[k];
        if (from === prevBlank) continue;
        const v = board[from];
        const dh = dist(v, blank) - dist(v, from);
        const oldBlank = blank;
        board[oldBlank] = v;
        board[from] = 0;
        blank = from;
        h += dh;
        path.push(from);
        const res = search(g + 1, bound, oldBlank);
        if (res === FOUND) return FOUND;
        path.pop();
        h -= dh;
        blank = oldBlank;
        board[from] = v;
        board[oldBlank] = 0;
        if (res === ABORT) return ABORT;
        if (res < min) min = res;
      }
      return min;
    }

    let bound = h;
    for (;;) {
      const res = search(0, bound, -1);
      if (res === FOUND) return path.slice();
      if (res === ABORT || res === Infinity) return null;
      bound = res;
    }
  }

  // İpucu: tam çözüm bulunursa ilk hamlesi; bulunamazsa sezgiyi en çok azaltan hamle
  function hint(tiles, size, maxNodes) {
    if (isSolved(tiles)) return null;
    const path = solve(tiles, size, maxNodes || 150000);
    if (path && path.length) return { index: path[0], exact: true, remaining: path.length };
    const nb = neighborTable(size);
    const blank = tiles.indexOf(0);
    const work = tiles.slice();
    let best = -1;
    let bestH = Infinity;
    for (const from of nb[blank]) {
      work[blank] = work[from];
      work[from] = 0;
      const h = manhattan(work, size);
      if (h < bestH) { bestH = h; best = from; }
      work[from] = work[blank];
      work[blank] = 0;
    }
    return best < 0 ? null : { index: best, exact: false, remaining: null };
  }

  return { rng, solved, isSolved, isSolvable, shuffle, slide, manhattan, solve, hint, neighborTable };
});
