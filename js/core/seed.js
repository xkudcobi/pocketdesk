// İlk açılışta masaüstünü boş bırakmamak için örnek klasörler, notlar ve çizimler.
// İçerik seçili dilde üretilir.
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const deps = isNode
    ? { vfs: require('./vfs.js'), doodle: require('./doodle.js') }
    : { vfs: root.PD.vfs, doodle: root.PD.doodle };
  const mod = factory(deps.vfs, deps.doodle);
  if (isNode) module.exports = mod;
  else root.PD.seed = mod;
})(typeof self !== 'undefined' ? self : this, function (vfs, doodle) {
  'use strict';

  const SYSTEM = ['desktop', 'documents', 'pictures', 'trash'];

  function circle(cx, cy, rx, ry, from, to, steps) {
    const p = [];
    for (let i = 0; i <= steps; i++) {
      const a = from + (to - from) * (i / steps);
      p.push(Math.round((cx + Math.cos(a) * rx) * 10) / 10, Math.round((cy + Math.sin(a) * ry) * 10) / 10);
    }
    return p;
  }

  function stroke(p, c, s) {
    return { c, s, p };
  }

  function catDrawing() {
    const doc = doodle.blank();
    const ink = '#2b2d42';
    const T = Math.PI * 2;
    // gövde, sonra yüzün içi eş merkezli kalın halkalarla boyanır
    doc.strokes.push(
      stroke(circle(320, 420, 140, 110, Math.PI, T, 30), '#f4a261', 30),
      stroke(circle(505, 360, 40, 60, Math.PI * 0.5, Math.PI * 1.6, 14), '#f4a261', 16),
      stroke(circle(320, 190, 104, 90, 0, T, 48), '#ffd6a5', 34),
      stroke(circle(320, 190, 72, 62, 0, T, 40), '#ffd6a5', 34),
      stroke(circle(320, 190, 40, 34, 0, T, 28), '#ffd6a5', 34),
      stroke([320, 190], '#ffd6a5', 40),
      stroke(circle(320, 190, 120, 105, 0, T, 48), '#f4a261', 14),
      stroke(circle(320, 190, 127, 112, 0, T, 48), ink, 6),
      stroke([215, 140, 225, 45, 285, 95], ink, 6),
      stroke([355, 95, 415, 45, 425, 140], ink, 6),
      stroke([272, 175], ink, 22),
      stroke([368, 175], ink, 22),
      stroke([320, 212, 308, 200, 332, 200, 320, 212], '#e63946', 8),
      stroke(circle(304, 222, 16, 14, 0, Math.PI, 10), ink, 5),
      stroke(circle(336, 222, 16, 14, 0, Math.PI, 10), ink, 5),
      stroke([250, 210, 175, 195], ink, 3),
      stroke([250, 222, 172, 228], ink, 3),
      stroke([390, 210, 465, 195], ink, 3),
      stroke([390, 222, 468, 228], ink, 3)
    );
    return doc;
  }

  function houseDrawing() {
    const doc = doodle.blank();
    doc.bg = '#eaf6ff';
    const ink = '#2b2d42';
    const rays = [];
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      rays.push(stroke([540 + Math.cos(a) * 52, 90 + Math.sin(a) * 52, 540 + Math.cos(a) * 74, 90 + Math.sin(a) * 74], '#e9c46a', 7));
    }
    doc.strokes.push(
      stroke(circle(540, 90, 34, 34, 0, Math.PI * 2, 28), '#e9c46a', 30),
      ...rays,
      stroke([0, 392, 160, 380, 320, 396, 480, 382, 640, 394], '#2a9d8f', 40),
      stroke([190, 380, 190, 230, 430, 230, 430, 380, 190, 380], ink, 7),
      stroke([170, 238, 310, 120, 450, 238], '#e63946', 9),
      stroke([285, 380, 285, 300, 335, 300, 335, 380], '#457b9d', 7),
      stroke([325, 342], '#e9c46a', 8),
      stroke([220, 260, 265, 260, 265, 300, 220, 300, 220, 260], '#457b9d', 6),
      stroke([355, 260, 400, 260, 400, 300, 355, 300, 355, 260], '#457b9d', 6),
      stroke([380, 180, 380, 140, 405, 140, 405, 200], ink, 6),
      stroke(circle(395, 118, 10, 7, 0, Math.PI * 2, 10), '#bbbbbb', 5),
      stroke(circle(412, 92, 14, 9, 0, Math.PI * 2, 12), '#cccccc', 5),
      stroke(circle(80, 110, 50, 20, Math.PI, Math.PI * 2.02, 16), '#ffffff', 24)
    );
    return doc;
  }

  // t: (anahtar) => metin; dönen: { fs, ids }
  function buildFs(t, now) {
    const fs = vfs.createFs(now);
    const ids = {};
    for (const sys of SYSTEM) {
      const r = vfs.mkdir(fs, vfs.ROOT, t('folder.' + sys), now);
      fs.nodes[r.id].sys = sys;
      ids[sys] = r.id;
    }
    const add = (dir, name, content) => vfs.createFile(fs, ids[dir], name, content, now).id;
    ids.welcome = add('desktop', t('seed.welcomeName'), t('seed.welcomeBody'));
    ids.list = add('documents', t('seed.listName'), t('seed.listBody'));
    ids.ideas = add('documents', t('seed.ideasName'), t('seed.ideasBody'));
    ids.cat = add('pictures', t('seed.catName'), doodle.encode(catDrawing()));
    ids.house = add('pictures', t('seed.houseName'), doodle.encode(houseDrawing()));
    ids.recipes = vfs.mkdir(fs, ids.documents, t('seed.recipesName'), now).id;
    vfs.createFile(fs, ids.recipes, t('seed.pancakeName'), t('seed.pancakeBody'), now);
    const old = add('desktop', t('seed.oldName'), t('seed.oldBody'));
    vfs.trash(fs, old, now);
    return { fs, ids };
  }

  function systemNames(t) {
    const names = {};
    for (const sys of SYSTEM) names[sys] = t('folder.' + sys);
    return names;
  }

  return { SYSTEM, buildFs, systemNames, catDrawing, houseDrawing };
});
