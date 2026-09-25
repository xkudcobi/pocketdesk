// Çizim belgeleri: fırça darbeleri düz [x0, y0, x1, y1, ...] dizileri olarak tutulur.
// Kaydetmeden önce Ramer-Douglas-Peucker ile gereksiz noktalar ayıklanır.
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.PD = root.PD || {}).doodle = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const WIDTH = 640;
  const HEIGHT = 440;
  const MAX_STROKES = 2000;
  const MAX_POINTS = 200000;
  const PALETTE = ['#2b2d42', '#e63946', '#f4a261', '#e9c46a', '#2a9d8f', '#457b9d', '#9b5de5', '#ffffff'];
  const SIZES = [3, 7, 14, 26];
  const BACKGROUND = '#fffdf6';

  function blank() {
    return { v: 1, w: WIDTH, h: HEIGHT, bg: BACKGROUND, strokes: [] };
  }

  // Noktanın a-b doğru parçasına uzaklığının karesi
  function segDist2(px, py, ax, ay, bx, by) {
    let dx = bx - ax;
    let dy = by - ay;
    const len2 = dx * dx + dy * dy;
    if (len2 > 0) {
      let t = ((px - ax) * dx + (py - ay) * dy) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      ax += t * dx;
      ay += t * dy;
    }
    dx = px - ax;
    dy = py - ay;
    return dx * dx + dy * dy;
  }

  // Özyinelemesiz RDP: uzun darbelerde yığın taşmaz
  function simplify(points, epsilon) {
    const count = points.length >> 1;
    if (count <= 2) return points.slice(0, count * 2);
    const eps2 = epsilon * epsilon;
    const keep = new Uint8Array(count);
    keep[0] = 1;
    keep[count - 1] = 1;
    const stack = [0, count - 1];
    while (stack.length) {
      const last = stack.pop();
      const first = stack.pop();
      let maxD = 0;
      let idx = -1;
      const ax = points[first * 2], ay = points[first * 2 + 1];
      const bx = points[last * 2], by = points[last * 2 + 1];
      for (let i = first + 1; i < last; i++) {
        const d = segDist2(points[i * 2], points[i * 2 + 1], ax, ay, bx, by);
        if (d > maxD) { maxD = d; idx = i; }
      }
      if (idx >= 0 && maxD > eps2) {
        keep[idx] = 1;
        stack.push(first, idx, idx, last);
      }
    }
    const out = [];
    for (let i = 0; i < count; i++) if (keep[i]) out.push(points[i * 2], points[i * 2 + 1]);
    return out;
  }

  function round1(v) {
    return Math.round(v * 10) / 10;
  }

  function makeStroke(points, color, size) {
    const simple = simplify(points, Math.max(0.6, size * 0.12));
    for (let i = 0; i < simple.length; i++) simple[i] = round1(simple[i]);
    return { c: color, s: size, p: simple };
  }

  function isColor(c) {
    return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c);
  }

  function encode(doc) {
    return JSON.stringify({ v: 1, w: doc.w, h: doc.h, bg: doc.bg, strokes: doc.strokes });
  }

  // Bozuk ya da yabancı içerik gelirse null döner; geçerli darbeler korunur
  function decode(text) {
    if (typeof text !== 'string' || !text.trim()) return blank();
    let raw;
    try { raw = JSON.parse(text); } catch (e) { return null; }
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.strokes)) return null;
    const doc = blank();
    if (isColor(raw.bg)) doc.bg = raw.bg;
    let points = 0;
    for (const s of raw.strokes.slice(0, MAX_STROKES)) {
      if (!s || !Array.isArray(s.p) || s.p.length < 2 || s.p.length % 2) continue;
      if (!s.p.every((n) => typeof n === 'number' && isFinite(n))) continue;
      points += s.p.length;
      if (points > MAX_POINTS) break;
      const size = typeof s.s === 'number' && s.s > 0 && s.s <= 80 ? s.s : 4;
      doc.strokes.push({ c: isColor(s.c) ? s.c : '#2b2d42', s: size, p: s.p });
    }
    return doc;
  }

  function pointCount(doc) {
    let n = 0;
    for (const s of doc.strokes) n += s.p.length >> 1;
    return n;
  }

  // Tek noktalı darbe nokta olarak çizilir; çizim tuvale bağımlı değildir (2D context yeter)
  function render(ctx, doc, scale) {
    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = doc.bg;
    ctx.fillRect(0, 0, doc.w, doc.h);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const s of doc.strokes) drawStroke(ctx, s.p, s.c, s.s);
    ctx.restore();
  }

  function drawStroke(ctx, p, color, size) {
    if (p.length < 2) return;
    if (p.length === 2) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p[0], p[1], size / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    // orta noktalardan geçen ikinci derece eğrilerle yumuşak çizgi
    for (let i = 2; i < p.length - 2; i += 2) {
      const mx = (p[i] + p[i + 2]) / 2;
      const my = (p[i + 1] + p[i + 3]) / 2;
      ctx.quadraticCurveTo(p[i], p[i + 1], mx, my);
    }
    ctx.lineTo(p[p.length - 2], p[p.length - 1]);
    ctx.stroke();
  }

  return {
    WIDTH, HEIGHT, PALETTE, SIZES, BACKGROUND,
    blank, simplify, makeStroke, encode, decode, pointCount, render, drawStroke
  };
});
