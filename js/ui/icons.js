// Elle çizilmiş SVG simgeler. Harici dosya ya da yazı tipi gerekmez.
(function (root) {
  'use strict';

  const wrap = (body) => `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">${body}</svg>`;
  const ink = '#2b2d42';

  const ICONS = {
    files: wrap(`<path d="M5 14a4 4 0 0 1 4-4h10l4 5h16a4 4 0 0 1 4 4v17a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z" fill="#f4b942" stroke="${ink}" stroke-width="2.5"/><path d="M5 20h38" stroke="${ink}" stroke-width="2.5"/>`),
    folder: wrap(`<path d="M5 14a4 4 0 0 1 4-4h10l4 5h16a4 4 0 0 1 4 4v17a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z" fill="#ffd166" stroke="${ink}" stroke-width="2.5"/>`),
    folderSys: wrap(`<path d="M5 14a4 4 0 0 1 4-4h10l4 5h16a4 4 0 0 1 4 4v17a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z" fill="#8ecae6" stroke="${ink}" stroke-width="2.5"/><circle cx="24" cy="27" r="4" fill="#fff" stroke="${ink}" stroke-width="2"/>`),
    notes: wrap(`<rect x="10" y="6" width="28" height="36" rx="4" fill="#fff6d5" stroke="${ink}" stroke-width="2.5"/><path d="M16 16h16M16 23h16M16 30h10" stroke="${ink}" stroke-width="2.5" stroke-linecap="round"/>`),
    doodle: wrap(`<rect x="6" y="8" width="36" height="32" rx="5" fill="#e0fbfc" stroke="${ink}" stroke-width="2.5"/><path d="M12 32c5-10 9-12 12-6s7 4 12-8" fill="none" stroke="#e63946" stroke-width="3.5" stroke-linecap="round"/><circle cx="33" cy="16" r="3.5" fill="#f4a261"/>`),
    calc: wrap(`<rect x="10" y="5" width="28" height="38" rx="5" fill="#cdb4db" stroke="${ink}" stroke-width="2.5"/><rect x="15" y="10" width="18" height="8" rx="2" fill="#fff" stroke="${ink}" stroke-width="2"/><g fill="${ink}"><circle cx="18" cy="25" r="2.2"/><circle cx="24" cy="25" r="2.2"/><circle cx="30" cy="25" r="2.2"/><circle cx="18" cy="31" r="2.2"/><circle cx="24" cy="31" r="2.2"/><circle cx="30" cy="31" r="2.2"/><circle cx="18" cy="37" r="2.2"/><circle cx="24" cy="37" r="2.2"/><circle cx="30" cy="37" r="2.2"/></g>`),
    terminal: wrap(`<rect x="5" y="8" width="38" height="32" rx="5" fill="#264653" stroke="${ink}" stroke-width="2.5"/><path d="M12 18l6 5-6 5" fill="none" stroke="#e9f5db" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M22 30h12" stroke="#e9c46a" stroke-width="3" stroke-linecap="round"/>`),
    puzzle: wrap(`<rect x="6" y="6" width="36" height="36" rx="5" fill="#fff" stroke="${ink}" stroke-width="2.5"/><rect x="10" y="10" width="12" height="12" rx="2" fill="#ef476f"/><rect x="26" y="10" width="12" height="12" rx="2" fill="#ffd166"/><rect x="10" y="26" width="12" height="12" rx="2" fill="#06d6a0"/>`),
    settings: wrap(`<circle cx="24" cy="24" r="15" fill="#b8c0ff" stroke="${ink}" stroke-width="2.5"/><circle cx="24" cy="24" r="5.5" fill="#fff" stroke="${ink}" stroke-width="2.5"/><g stroke="${ink}" stroke-width="4" stroke-linecap="round"><path d="M24 3v5M24 40v5M3 24h5M40 24h5M9 9l3.5 3.5M35.5 35.5L39 39M9 39l3.5-3.5M35.5 12.5L39 9"/></g>`),
    trash: wrap(`<path d="M12 14h24l-2 26a3 3 0 0 1-3 3H17a3 3 0 0 1-3-3z" fill="#e9ecef" stroke="${ink}" stroke-width="2.5"/><path d="M9 14h30M19 14v-4h10v4" fill="none" stroke="${ink}" stroke-width="2.5" stroke-linecap="round"/><path d="M20 21v15M28 21v15" stroke="${ink}" stroke-width="2" stroke-linecap="round"/>`),
    trashFull: wrap(`<path d="M12 14h24l-2 26a3 3 0 0 1-3 3H17a3 3 0 0 1-3-3z" fill="#e9ecef" stroke="${ink}" stroke-width="2.5"/><path d="M14 13c2-6 6-9 10-5 3-5 8-3 10 5" fill="#ffd166" stroke="${ink}" stroke-width="2"/><path d="M9 14h30" stroke="${ink}" stroke-width="2.5" stroke-linecap="round"/><path d="M20 21v15M28 21v15" stroke="${ink}" stroke-width="2" stroke-linecap="round"/>`),
    sun: wrap(`<circle cx="24" cy="24" r="10" fill="#ffd166" stroke="${ink}" stroke-width="2.5"/><g stroke="${ink}" stroke-width="3" stroke-linecap="round"><path d="M24 4v5M24 39v5M4 24h5M39 24h5M10 10l3 3M35 35l3 3M10 38l3-3M35 13l3-3"/></g>`)
  };

  function iconFor(key) {
    return ICONS[key] || ICONS.notes;
  }

  // Dosya sistemi düğümü için uygun simge
  function nodeIcon(node) {
    if (node.type === 'dir') {
      if (node.sys === 'trash') return node.children.length ? ICONS.trashFull : ICONS.trash;
      return node.sys ? ICONS.folderSys : ICONS.folder;
    }
    return /\.doodle$/i.test(node.name) ? ICONS.doodle : ICONS.notes;
  }

  root.PD.icons = { ICONS, iconFor, nodeIcon };
})(self);
