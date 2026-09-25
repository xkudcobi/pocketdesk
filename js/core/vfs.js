// Sanal dosya sistemi: düz bir düğüm tablosu üzerinde klasör ağacı.
// Düğümler kimlikle tutulur; yollar her seferinde isimlerden hesaplanır,
// böylece yeniden adlandırma açık pencereleri bozmaz.
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.PD = root.PD || {}).vfs = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ROOT = 'root';
  const MAX_NAME = 60;
  const MAX_FILE = 400000;
  const MAX_NODES = 5000;
  const hasOwn = Object.prototype.hasOwnProperty;

  function ok(id) { return { ok: true, id }; }
  function fail(error, extra) { return Object.assign({ ok: false, error }, extra); }

  function createFs(now) {
    const t = now == null ? Date.now() : now;
    return {
      seq: 0,
      rev: 0,
      nodes: { [ROOT]: { id: ROOT, type: 'dir', name: '', parent: null, children: [], mtime: t } }
    };
  }

  function newId(fs) {
    fs.seq += 1;
    return 'n' + fs.seq.toString(36);
  }

  function get(fs, id) {
    return typeof id === 'string' && hasOwn.call(fs.nodes, id) ? fs.nodes[id] : null;
  }

  function isDir(fs, id) {
    const n = get(fs, id);
    return !!n && n.type === 'dir';
  }

  function validateName(name) {
    if (typeof name !== 'string' || !name.trim()) return 'nameEmpty';
    const trimmed = name.trim();
    if (trimmed.length > MAX_NAME) return 'nameTooLong';
    if (trimmed === '.' || trimmed === '..' || /[/\\\u0000-\u001f]/.test(trimmed)) return 'nameInvalid';
    return null;
  }

  function sameName(a, b) {
    return a.toLowerCase() === b.toLowerCase();
  }

  function childByName(fs, dirId, name) {
    const dir = get(fs, dirId);
    if (!dir || dir.type !== 'dir') return null;
    for (const cid of dir.children) {
      const c = fs.nodes[cid];
      if (sameName(c.name, name)) return c;
    }
    return null;
  }

  function nameTaken(fs, dirId, name, ignoreId) {
    const c = childByName(fs, dirId, name);
    return !!c && c.id !== ignoreId;
  }

  function splitExt(name) {
    const i = name.lastIndexOf('.');
    return i > 0 ? [name.slice(0, i), name.slice(i)] : [name, ''];
  }

  function extOf(name) {
    return splitExt(name)[1].toLowerCase();
  }

  // "Not.txt" doluysa "Not (2).txt", "Not (3).txt"... dener
  function uniqueName(fs, dirId, name, ignoreId) {
    if (!nameTaken(fs, dirId, name, ignoreId)) return name;
    const parts = splitExt(name);
    const base = parts[0].replace(/ \(\d+\)$/, '');
    for (let n = 2; n < 10000; n++) {
      const candidate = `${base} (${n})${parts[1]}`;
      if (!nameTaken(fs, dirId, candidate, ignoreId)) return candidate;
    }
    return `${base} ${Date.now()}${parts[1]}`;
  }

  function nodeCount(fs) {
    return Object.keys(fs.nodes).length;
  }

  // Her değişiklikte artan sayaç; "masa hiç ellenmedi mi?" sorusunu ucuzca yanıtlar
  function bump(fs) {
    fs.rev = (fs.rev || 0) + 1;
  }

  function attach(fs, parentId, node, now) {
    bump(fs);
    const parent = fs.nodes[parentId];
    parent.children.push(node.id);
    parent.mtime = now;
    node.parent = parentId;
  }

  function detach(fs, node, now) {
    bump(fs);
    const parent = fs.nodes[node.parent];
    const idx = parent.children.indexOf(node.id);
    if (idx >= 0) parent.children.splice(idx, 1);
    parent.mtime = now;
  }

  function checkCreate(fs, parentId, name) {
    if (!isDir(fs, parentId)) return 'notDir';
    const bad = validateName(name);
    if (bad) return bad;
    if (nameTaken(fs, parentId, name.trim())) return 'nameTaken';
    if (nodeCount(fs) >= MAX_NODES) return 'tooMany';
    return null;
  }

  function mkdir(fs, parentId, name, now) {
    const t = now == null ? Date.now() : now;
    const err = checkCreate(fs, parentId, name);
    if (err) return fail(err, { name });
    const node = { id: newId(fs), type: 'dir', name: name.trim(), parent: null, children: [], mtime: t };
    fs.nodes[node.id] = node;
    attach(fs, parentId, node, t);
    return ok(node.id);
  }

  function createFile(fs, parentId, name, content, now) {
    const t = now == null ? Date.now() : now;
    const text = content == null ? '' : String(content);
    const err = checkCreate(fs, parentId, name);
    if (err) return fail(err, { name });
    if (text.length > MAX_FILE) return fail('fileTooBig');
    const node = { id: newId(fs), type: 'file', name: name.trim(), parent: null, content: text, mtime: t };
    fs.nodes[node.id] = node;
    attach(fs, parentId, node, t);
    return ok(node.id);
  }

  function writeFile(fs, id, content, now) {
    const node = get(fs, id);
    if (!node) return fail('notFound');
    if (node.type !== 'file') return fail('isDir');
    const text = content == null ? '' : String(content);
    if (text.length > MAX_FILE) return fail('fileTooBig');
    node.content = text;
    node.mtime = now == null ? Date.now() : now;
    bump(fs);
    return ok(id);
  }

  function readFile(fs, id) {
    const node = get(fs, id);
    if (!node) return fail('notFound');
    if (node.type !== 'file') return fail('isDir');
    return { ok: true, id, content: node.content };
  }

  function isAncestor(fs, ancestorId, id) {
    let cur = get(fs, id);
    while (cur) {
      if (cur.id === ancestorId) return true;
      cur = cur.parent ? fs.nodes[cur.parent] : null;
    }
    return false;
  }

  function rename(fs, id, name, now) {
    const node = get(fs, id);
    if (!node) return fail('notFound');
    if (node.id === ROOT || node.sys) return fail('systemItem');
    const bad = validateName(name);
    if (bad) return fail(bad, { name });
    const clean = name.trim();
    if (nameTaken(fs, node.parent, clean, id)) return fail('nameTaken', { name: clean });
    node.name = clean;
    node.mtime = now == null ? Date.now() : now;
    bump(fs);
    return ok(id);
  }

  function move(fs, id, targetId, opts) {
    const t = opts && opts.now != null ? opts.now : Date.now();
    const node = get(fs, id);
    if (!node) return fail('notFound');
    if (node.id === ROOT || node.sys) return fail('systemItem');
    if (!isDir(fs, targetId)) return fail('notDir');
    if (node.parent === targetId) return ok(id);
    if (isAncestor(fs, id, targetId)) return fail('moveIntoSelf');
    let name = node.name;
    if (nameTaken(fs, targetId, name, id)) {
      if (!(opts && opts.autoRename)) return fail('nameTaken', { name });
      name = uniqueName(fs, targetId, name, id);
    }
    detach(fs, node, t);
    node.name = name;
    attach(fs, targetId, node, t);
    return ok(id);
  }

  function subtreeSize(fs, id) {
    const node = fs.nodes[id];
    if (node.type === 'file') return 1;
    let n = 1;
    for (const c of node.children) n += subtreeSize(fs, c);
    return n;
  }

  function copyInto(fs, src, parentId, name, t) {
    const node = { id: newId(fs), type: src.type, name, parent: null, mtime: t };
    if (src.type === 'file') node.content = src.content;
    else node.children = [];
    fs.nodes[node.id] = node;
    attach(fs, parentId, node, t);
    if (src.type === 'dir') {
      // kopyalanan klasörün kendi çocuk listesi büyürken dolaşmamak için önce anlık kopya al
      for (const cid of src.children.slice()) {
        const child = fs.nodes[cid];
        copyInto(fs, child, node.id, child.name, t);
      }
    }
    return node.id;
  }

  function copy(fs, id, targetId, newName, now) {
    const t = now == null ? Date.now() : now;
    const node = get(fs, id);
    if (!node || node.id === ROOT) return fail('notFound');
    if (!isDir(fs, targetId)) return fail('notDir');
    if (node.type === 'dir' && isAncestor(fs, id, targetId)) return fail('moveIntoSelf');
    if (nodeCount(fs) + subtreeSize(fs, id) > MAX_NODES) return fail('tooMany');
    let name = node.name;
    if (newName != null) {
      const bad = validateName(newName);
      if (bad) return fail(bad, { name: newName });
      name = newName.trim();
      if (nameTaken(fs, targetId, name)) return fail('nameTaken', { name });
    } else {
      name = uniqueName(fs, targetId, name);
    }
    return ok(copyInto(fs, node, targetId, name, t));
  }

  function dropSubtree(fs, id) {
    const node = fs.nodes[id];
    if (node.type === 'dir') for (const c of node.children) dropSubtree(fs, c);
    delete fs.nodes[id];
  }

  function remove(fs, id, now) {
    const node = get(fs, id);
    if (!node) return fail('notFound');
    if (node.id === ROOT || node.sys) return fail('systemItem');
    detach(fs, node, now == null ? Date.now() : now);
    dropSubtree(fs, id);
    return ok(id);
  }

  function findSys(fs, sys) {
    for (const id in fs.nodes) if (fs.nodes[id].sys === sys) return id;
    return null;
  }

  function isInTrash(fs, id) {
    const trash = findSys(fs, 'trash');
    return !!trash && id !== trash && isAncestor(fs, trash, id);
  }

  // Çöpe atma bir taşımadır; zaten çöpteyse kalıcı olarak silinir.
  function trash(fs, id, now) {
    const t = now == null ? Date.now() : now;
    const node = get(fs, id);
    if (!node) return fail('notFound');
    if (node.id === ROOT || node.sys) return fail('systemItem');
    const trashId = findSys(fs, 'trash');
    if (!trashId || isInTrash(fs, id)) {
      const r = remove(fs, id, t);
      return r.ok ? Object.assign(r, { deleted: true }) : r;
    }
    const from = node.parent;
    const r = move(fs, id, trashId, { autoRename: true, now: t });
    if (r.ok) node.from = from;
    return r;
  }

  function restore(fs, id, now) {
    const t = now == null ? Date.now() : now;
    const node = get(fs, id);
    const trashId = findSys(fs, 'trash');
    if (!node || !trashId || node.parent !== trashId) return fail('notInTrash');
    let target = node.from;
    if (!isDir(fs, target) || isInTrash(fs, target) || target === trashId) {
      target = findSys(fs, 'desktop') || ROOT;
    }
    const r = move(fs, id, target, { autoRename: true, now: t });
    if (r.ok) delete node.from;
    return r;
  }

  function emptyTrash(fs, now) {
    const trashId = findSys(fs, 'trash');
    if (!trashId) return fail('notFound');
    const kids = fs.nodes[trashId].children.slice();
    for (const c of kids) dropSubtree(fs, c);
    fs.nodes[trashId].children = [];
    bump(fs);
    fs.nodes[trashId].mtime = now == null ? Date.now() : now;
    return Object.assign(ok(trashId), { count: kids.length });
  }

  function list(fs, dirId) {
    const dir = get(fs, dirId);
    if (!dir || dir.type !== 'dir') return [];
    const out = dir.children.map((c) => fs.nodes[c]);
    out.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });
    return out;
  }

  function pathOf(fs, id) {
    const parts = [];
    let cur = get(fs, id);
    while (cur && cur.id !== ROOT) {
      parts.push(cur.name);
      cur = fs.nodes[cur.parent];
    }
    return '/' + parts.reverse().join('/');
  }

  function resolve(fs, path, cwdId) {
    if (typeof path !== 'string') return null;
    let cur = path.startsWith('/') || path.startsWith('~') || !isDir(fs, cwdId) ? ROOT : cwdId;
    const segs = path.replace(/^~/, '').split('/');
    for (const raw of segs) {
      const seg = raw.trim();
      if (!seg || seg === '.') continue;
      const node = fs.nodes[cur];
      if (node.type !== 'dir') return null;
      if (seg === '..') {
        cur = node.parent || ROOT;
        continue;
      }
      const child = childByName(fs, cur, seg);
      if (!child) return null;
      cur = child.id;
    }
    return cur;
  }

  // Henüz var olmayan bir hedef için: "a/b/yeni.txt" -> { parentId: b, name: "yeni.txt" }
  function parentAndName(fs, path, cwdId) {
    if (typeof path !== 'string') return null;
    const trimmed = path.replace(/\/+$/, '');
    const cut = trimmed.lastIndexOf('/');
    const dirPart = cut < 0 ? '.' : trimmed.slice(0, cut) || '/';
    const name = cut < 0 ? trimmed : trimmed.slice(cut + 1);
    const parentId = resolve(fs, dirPart, cwdId);
    if (!parentId || !isDir(fs, parentId) || !name) return null;
    return { parentId, name };
  }

  function kindOf(node) {
    if (!node) return null;
    if (node.type === 'dir') return 'dir';
    return extOf(node.name) === '.doodle' ? 'doodle' : 'text';
  }

  // Dil değişince sistem klasörlerinin adları da değişir; çakışma varsa eski ad kalır.
  function localizeSystemFolders(fs, names) {
    let changed = 0;
    for (const id in fs.nodes) {
      const node = fs.nodes[id];
      const wanted = node.sys && names[node.sys];
      if (!wanted || node.name === wanted) continue;
      if (validateName(wanted) || nameTaken(fs, node.parent, wanted, id)) continue;
      node.name = wanted;
      changed++;
    }
    return changed;
  }

  function totalSize(fs) {
    let n = 0;
    for (const id in fs.nodes) {
      const node = fs.nodes[id];
      if (node.type === 'file') n += node.content.length;
    }
    return n;
  }

  // Kayıttan gelen veriye güvenmiyoruz: ağaç tutarlı değilse hata fırlatılır.
  function deserialize(obj) {
    if (!obj || typeof obj !== 'object' || !obj.nodes || typeof obj.nodes !== 'object') throw new Error('corrupt');
    const nodes = obj.nodes;
    const root = nodes[ROOT];
    if (!root || root.type !== 'dir' || root.parent !== null) throw new Error('corrupt');
    const ids = Object.keys(nodes);
    if (ids.length > MAX_NODES) throw new Error('corrupt');
    let maxSeq = 0;
    for (const id of ids) {
      const n = nodes[id];
      if (!n || n.id !== id || typeof n.name !== 'string') throw new Error('corrupt');
      if (n.type === 'dir') {
        if (!Array.isArray(n.children)) throw new Error('corrupt');
      } else if (n.type === 'file') {
        if (typeof n.content !== 'string') throw new Error('corrupt');
      } else throw new Error('corrupt');
      if (id !== ROOT) {
        const p = nodes[n.parent];
        if (!p || p.type !== 'dir' || p.children.indexOf(id) < 0) throw new Error('corrupt');
      }
      if (typeof n.mtime !== 'number') n.mtime = 0;
      const m = /^n([0-9a-z]+)$/.exec(id);
      if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 36));
    }
    // kökten erişilebilirlik ve döngü kontrolü
    const seen = new Set([ROOT]);
    const stack = [ROOT];
    while (stack.length) {
      const n = nodes[stack.pop()];
      if (n.type !== 'dir') continue;
      for (const c of n.children) {
        if (seen.has(c) || !nodes[c] || nodes[c].parent !== n.id) throw new Error('corrupt');
        seen.add(c);
        stack.push(c);
      }
    }
    if (seen.size !== ids.length) throw new Error('corrupt');
    return { seq: Math.max(maxSeq, Number(obj.seq) || 0), rev: Number(obj.rev) || 0, nodes };
  }

  return {
    ROOT, MAX_NAME, MAX_FILE, MAX_NODES,
    createFs, get, isDir, validateName, childByName, uniqueName, extOf, splitExt,
    mkdir, createFile, writeFile, readFile, rename, move, copy, remove,
    trash, restore, emptyTrash, findSys, isInTrash, isAncestor,
    list, pathOf, resolve, parentAndName, kindOf, localizeSystemFolders,
    nodeCount, totalSize, deserialize
  };
});
