// Terminal kabuğu: satırı parçalar, komutu sanal dosya sistemi üzerinde çalıştırır.
// Çıktı satır listesi, yeni çalışma klasörü ve arayüze bırakılan "etkiler" olarak döner.
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const deps = isNode
    ? { vfs: require('./vfs.js'), calc: require('./calc.js') }
    : { vfs: root.PD.vfs, calc: root.PD.calc };
  const mod = factory(deps.vfs, deps.calc);
  if (isNode) module.exports = mod;
  else root.PD.shell = mod;
})(typeof self !== 'undefined' ? self : this, function (vfs, calc) {
  'use strict';

  const COMMANDS = ['help', 'ls', 'cd', 'pwd', 'tree', 'mkdir', 'touch', 'cat', 'echo', 'rm', 'mv', 'cp', 'open', 'calc', 'date', 'clear', 'lang', 'whoami'];
  const ALIASES = { yardim: 'help', 'yardım': 'help', dir: 'ls', cls: 'clear', type: 'cat' };
  const WRITES_OUTPUT = { echo: 1, cat: 1, ls: 1, pwd: 1, date: 1, calc: 1, tree: 1, whoami: 1 };

  // Tırnakları, kaçış karakterini ve > / >> yönlendirmesini tanır
  function tokenize(line) {
    const tokens = [];
    let cur = null;
    let quote = null;
    const flush = () => {
      if (cur !== null) tokens.push({ type: 'word', value: cur });
      cur = null;
    };
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quote) {
        if (ch === quote) quote = null;
        else if (ch === '\\' && quote === '"' && i + 1 < line.length) cur += line[++i];
        else cur += ch;
        continue;
      }
      if (ch === ' ' || ch === '\t') { flush(); continue; }
      if (ch === '"' || ch === "'") { quote = ch; cur = cur === null ? '' : cur; continue; }
      if (ch === '\\') { cur = (cur === null ? '' : cur) + (line[i + 1] || ''); i++; continue; }
      if (ch === '>') {
        flush();
        const append = line[i + 1] === '>';
        if (append) i++;
        tokens.push({ type: 'redir', append });
        continue;
      }
      cur = (cur === null ? '' : cur) + ch;
    }
    if (quote) return { error: 'shUnclosedQuote', tokens };
    flush();
    return { tokens };
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = new Array(b.length + 1);
    let next = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
      next[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        next[j] = Math.min(prev[j] + 1, next[j - 1] + 1, prev[j - 1] + cost);
      }
      const tmp = prev; prev = next; next = tmp;
    }
    return prev[b.length];
  }

  function suggest(name) {
    let best = null;
    let bestD = 3;
    for (const c of COMMANDS) {
      const d = levenshtein(name, c);
      if (d < bestD) { best = c; bestD = d; }
    }
    return best;
  }

  function splitFlags(args) {
    const flags = {};
    const rest = [];
    for (const a of args) {
      if (/^-[a-zA-Z]+$/.test(a)) for (const f of a.slice(1)) flags[f] = true;
      else rest.push(a);
    }
    return { flags, rest };
  }

  function fsError(env, res, path) {
    env.err(env.t('err.' + res.error, { name: res.name || path, path }));
  }

  const handlers = {
    help(args, env) {
      env.info(env.t('sh.helpIntro'));
      for (const c of COMMANDS) env.out(`  ${c.padEnd(7)} ${env.t('sh.help.' + c)}`);
      env.info(env.t('sh.helpTips'));
    },

    ls(args, env) {
      const { rest } = splitFlags(args);
      const targets = rest.length ? rest : ['.'];
      for (const p of targets) {
        const id = vfs.resolve(env.fs, p, env.cwd);
        if (!id) { env.err(env.t('sh.noSuch', { path: p })); continue; }
        const node = vfs.get(env.fs, id);
        if (targets.length > 1) env.info(p + ':');
        if (node.type === 'file') { env.out(node.name); continue; }
        const items = vfs.list(env.fs, id);
        if (!items.length) env.info(env.t('sh.emptyDir'));
        for (const it of items) env.out(it.type === 'dir' ? it.name + '/' : it.name);
      }
    },

    cd(args, env) {
      const p = args[0] || '/';
      const id = vfs.resolve(env.fs, p, env.cwd);
      if (!id) return env.err(env.t('sh.noSuch', { path: p }));
      if (!vfs.isDir(env.fs, id)) return env.err(env.t('err.notDir', { path: p }));
      env.cwd = id;
    },

    pwd(args, env) {
      env.out(vfs.pathOf(env.fs, env.cwd));
    },

    tree(args, env) {
      const p = args[0] || '.';
      const id = vfs.resolve(env.fs, p, env.cwd);
      if (!id) return env.err(env.t('sh.noSuch', { path: p }));
      const node = vfs.get(env.fs, id);
      env.out(id === vfs.ROOT ? '/' : node.name);
      let shown = 0;
      const walk = (dirId, prefix, depth) => {
        const items = vfs.list(env.fs, dirId);
        items.forEach((it, i) => {
          if (shown >= 300) return;
          shown++;
          const last = i === items.length - 1;
          env.out(prefix + (last ? '└── ' : '├── ') + it.name + (it.type === 'dir' ? '/' : ''));
          if (it.type === 'dir' && depth < 8) walk(it.id, prefix + (last ? '    ' : '│   '), depth + 1);
        });
      };
      if (node.type === 'dir') walk(id, '', 0);
    },

    mkdir(args, env) {
      const { flags, rest } = splitFlags(args);
      if (!rest.length) return env.err(env.t('sh.usage', { usage: 'mkdir <name>' }));
      for (const p of rest) {
        if (flags.p) {
          // -p: eksik ara klasörleri de oluştur
          let cur = p.startsWith('/') ? vfs.ROOT : env.cwd;
          for (const seg of p.split('/').filter((s) => s && s !== '.')) {
            const found = seg === '..' ? vfs.get(env.fs, cur).parent || vfs.ROOT : (vfs.childByName(env.fs, cur, seg) || {}).id;
            if (found) {
              if (!vfs.isDir(env.fs, found)) return env.err(env.t('err.notDir', { path: seg }));
              cur = found;
              continue;
            }
            const r = vfs.mkdir(env.fs, cur, seg, env.now);
            if (!r.ok) return fsError(env, r, seg);
            cur = r.id;
          }
          continue;
        }
        const pn = vfs.parentAndName(env.fs, p, env.cwd);
        if (!pn) { env.err(env.t('sh.noSuch', { path: p })); continue; }
        const r = vfs.mkdir(env.fs, pn.parentId, pn.name, env.now);
        if (!r.ok) fsError(env, r, p);
      }
    },

    touch(args, env) {
      if (!args.length) return env.err(env.t('sh.usage', { usage: 'touch <name>' }));
      for (const p of args) {
        const id = vfs.resolve(env.fs, p, env.cwd);
        if (id) { vfs.get(env.fs, id).mtime = env.now; continue; }
        const pn = vfs.parentAndName(env.fs, p, env.cwd);
        if (!pn) { env.err(env.t('sh.noSuch', { path: p })); continue; }
        const r = vfs.createFile(env.fs, pn.parentId, pn.name, '', env.now);
        if (!r.ok) fsError(env, r, p);
      }
    },

    cat(args, env) {
      if (!args.length) return env.err(env.t('sh.usage', { usage: 'cat <file>' }));
      for (const p of args) {
        const id = vfs.resolve(env.fs, p, env.cwd);
        if (!id) { env.err(env.t('sh.noSuch', { path: p })); continue; }
        const r = vfs.readFile(env.fs, id);
        if (!r.ok) { fsError(env, r, p); continue; }
        if (vfs.kindOf(vfs.get(env.fs, id)) === 'doodle') { env.info(env.t('sh.isDrawing', { path: p })); continue; }
        for (const line of r.content.split('\n')) env.out(line);
      }
    },

    echo(args, env) {
      env.out(args.join(' '));
    },

    rm(args, env) {
      const { flags, rest } = splitFlags(args);
      if (!rest.length) return env.err(env.t('sh.usage', { usage: 'rm [-r] <path>' }));
      for (const p of rest) {
        const id = vfs.resolve(env.fs, p, env.cwd);
        if (!id) { env.err(env.t('sh.noSuch', { path: p })); continue; }
        if (vfs.isDir(env.fs, id) && !flags.r) { env.err(env.t('sh.needR', { path: p })); continue; }
        if (id === env.cwd || vfs.isAncestor(env.fs, id, env.cwd)) { env.err(env.t('sh.busy', { path: p })); continue; }
        const r = vfs.trash(env.fs, id, env.now);
        if (!r.ok) { fsError(env, r, p); continue; }
        env.info(env.t(r.deleted ? 'sh.deleted' : 'sh.trashed', { path: p }));
      }
    },

    mv(args, env) { transfer(args, env, false); },
    cp(args, env) { transfer(args, env, true); },

    open(args, env) {
      if (!args.length) return env.effect({ type: 'open', id: env.cwd });
      for (const p of args) {
        const id = vfs.resolve(env.fs, p, env.cwd);
        if (!id) { env.err(env.t('sh.noSuch', { path: p })); continue; }
        env.effect({ type: 'open', id });
        env.info(env.t('sh.opened', { path: p }));
      }
    },

    calc(args, env) {
      const r = calc.evaluate(args.join(' '), { angle: env.angle });
      if (r.ok) env.out('= ' + r.text);
      else env.err(env.t('err.' + r.error));
    },

    date(args, env) {
      const locale = env.lang === 'tr' ? 'tr-TR' : 'en-GB';
      env.out(new Date(env.now).toLocaleString(locale, { dateStyle: 'full', timeStyle: 'short' }));
    },

    clear(args, env) {
      env.effect({ type: 'clear' });
    },

    lang(args, env) {
      const want = (args[0] || '').toLowerCase();
      if (!want) return env.out(env.lang);
      if (want !== 'tr' && want !== 'en') return env.err(env.t('sh.usage', { usage: 'lang tr|en' }));
      env.effect({ type: 'lang', value: want });
    },

    whoami(args, env) {
      env.out(env.t('sh.guest'));
    }
  };

  function transfer(args, env, isCopy) {
    const name = isCopy ? 'cp' : 'mv';
    const { rest } = splitFlags(args);
    if (rest.length !== 2) return env.err(env.t('sh.usage', { usage: `${name} <from> <to>` }));
    const [src, dest] = rest;
    const srcId = vfs.resolve(env.fs, src, env.cwd);
    if (!srcId) return env.err(env.t('sh.noSuch', { path: src }));
    if (srcId === vfs.ROOT) return env.err(env.t('err.systemItem'));
    const destId = vfs.resolve(env.fs, dest, env.cwd);
    let r;
    if (destId && vfs.isDir(env.fs, destId)) {
      r = isCopy ? vfs.copy(env.fs, srcId, destId, null, env.now) : vfs.move(env.fs, srcId, destId, { now: env.now });
    } else if (destId) {
      return env.err(env.t('err.nameTaken', { name: dest }));
    } else {
      const pn = vfs.parentAndName(env.fs, dest, env.cwd);
      if (!pn) return env.err(env.t('sh.noSuch', { path: dest }));
      const bad = vfs.validateName(pn.name);
      if (bad) return env.err(env.t('err.' + bad, { name: pn.name }));
      if (isCopy) {
        r = vfs.copy(env.fs, srcId, pn.parentId, pn.name, env.now);
      } else {
        // önce taşı, sonra adlandır; ad hedefte boş olduğu için ikinci adım başarısız olmaz
        const node = vfs.get(env.fs, srcId);
        const oldParent = node.parent;
        r = vfs.move(env.fs, srcId, pn.parentId, { now: env.now, autoRename: true });
        if (r.ok) {
          r = vfs.rename(env.fs, srcId, pn.name, env.now);
          if (!r.ok) vfs.move(env.fs, srcId, oldParent, { now: env.now, autoRename: true });
        }
      }
    }
    if (!r.ok) fsError(env, r, src);
  }

  // ctx: { fs, cwd, t, lang, now, angle }
  function execute(line, ctx) {
    const lines = [];
    const effects = [];
    const env = {
      fs: ctx.fs,
      cwd: vfs.isDir(ctx.fs, ctx.cwd) ? ctx.cwd : vfs.ROOT,
      t: ctx.t,
      lang: ctx.lang,
      now: ctx.now == null ? Date.now() : ctx.now,
      angle: ctx.angle,
      out: (text) => lines.push({ text: String(text), kind: 'out' }),
      err: (text) => lines.push({ text: String(text), kind: 'err' }),
      info: (text) => lines.push({ text: String(text), kind: 'info' }),
      effect: (e) => effects.push(e)
    };
    const result = () => ({ lines, effects, cwd: env.cwd });
    const src = String(line || '').trim();
    if (!src) return result();
    const parsed = tokenize(src);
    if (parsed.error) { env.err(ctx.t('err.' + parsed.error)); return result(); }
    const tokens = parsed.tokens;
    const redirAt = tokens.findIndex((tk) => tk.type === 'redir');
    let redirect = null;
    if (redirAt >= 0) {
      const target = tokens[redirAt + 1];
      if (!target || target.type !== 'word' || tokens.length > redirAt + 2) {
        env.err(ctx.t('err.shBadRedirect'));
        return result();
      }
      redirect = { path: target.value, append: tokens[redirAt].append };
      tokens.length = redirAt;
    }
    if (!tokens.length) { env.err(ctx.t('err.shBadRedirect')); return result(); }
    const raw = tokens[0].value;
    const cmd = ALIASES[raw.toLowerCase()] || raw.toLowerCase();
    const args = tokens.slice(1).map((tk) => tk.value);
    const fn = Object.prototype.hasOwnProperty.call(handlers, cmd) ? handlers[cmd] : null;
    if (!fn) {
      const guess = suggest(cmd);
      env.err(ctx.t(guess ? 'sh.unknownGuess' : 'sh.unknown', { cmd: raw, guess }));
      return result();
    }
    if (redirect && !WRITES_OUTPUT[cmd]) {
      env.err(ctx.t('err.shBadRedirect'));
      return result();
    }
    if (!redirect) {
      fn(args, env);
      return result();
    }
    // yönlendirmede yalnızca normal çıktı dosyaya gider, hatalar ekranda kalır
    const start = lines.length;
    fn(args, env);
    const captured = [];
    for (let k = lines.length - 1; k >= start; k--) {
      if (lines[k].kind === 'out') captured.unshift(lines.splice(k, 1)[0].text);
    }
    writeRedirect(env, redirect, captured.join('\n'));
    return result();
  }

  function writeRedirect(env, redirect, text) {
    const id = vfs.resolve(env.fs, redirect.path, env.cwd);
    if (id) {
      const node = vfs.get(env.fs, id);
      if (node.type !== 'file') return env.err(env.t('err.isDir', { path: redirect.path }));
      const content = redirect.append && node.content ? node.content + '\n' + text : text;
      const r = vfs.writeFile(env.fs, id, content, env.now);
      if (!r.ok) fsError(env, r, redirect.path);
      return;
    }
    const pn = vfs.parentAndName(env.fs, redirect.path, env.cwd);
    if (!pn) return env.err(env.t('sh.noSuch', { path: redirect.path }));
    const r = vfs.createFile(env.fs, pn.parentId, pn.name, text, env.now);
    if (!r.ok) fsError(env, r, redirect.path);
  }

  function commonPrefix(words) {
    if (!words.length) return '';
    let p = words[0];
    for (const w of words) {
      let k = 0;
      while (k < p.length && k < w.length && p[k].toLowerCase() === w[k].toLowerCase()) k++;
      p = p.slice(0, k);
    }
    return p;
  }

  // Sekme tamamlama: ilk kelimede komut, sonrakilerde yol tamamlar
  function complete(line, ctx) {
    let inQuote = false;
    let start = 0;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') inQuote = !inQuote;
      else if (line[i] === ' ' && !inQuote) start = i + 1;
    }
    const head = line.slice(0, start);
    const token = line.slice(start);
    const quoted = token.startsWith('"');
    const bare = quoted ? token.slice(1) : token;
    if (!head.trim()) {
      const opts = COMMANDS.filter((c) => c.startsWith(bare.toLowerCase()));
      if (opts.length === 1) return { line: head + opts[0] + ' ', options: [] };
      const pre = commonPrefix(opts);
      return { line: head + (pre.length > bare.length ? pre : bare), options: opts.length > 1 ? opts : [] };
    }
    const cut = bare.lastIndexOf('/');
    const dirPart = cut >= 0 ? bare.slice(0, cut + 1) : '';
    const namePart = cut >= 0 ? bare.slice(cut + 1) : bare;
    const dirId = vfs.resolve(ctx.fs, dirPart || '.', ctx.cwd);
    if (!dirId || !vfs.isDir(ctx.fs, dirId)) return { line, options: [] };
    const low = namePart.toLowerCase();
    const matches = vfs.list(ctx.fs, dirId).filter((n) => n.name.toLowerCase().startsWith(low));
    if (!matches.length) return { line, options: [] };
    const build = (name, done, isDir) => {
      const full = dirPart + name + (done && isDir ? '/' : '');
      const needQuote = quoted || /\s/.test(full);
      if (!needQuote) return head + full + (done && !isDir ? ' ' : '');
      return head + '"' + full + (done ? '"' + (isDir ? '' : ' ') : '');
    };
    if (matches.length === 1) {
      const m = matches[0];
      return { line: build(m.name, true, m.type === 'dir'), options: [] };
    }
    const names = matches.map((m) => m.name + (m.type === 'dir' ? '/' : ''));
    const pre = commonPrefix(matches.map((m) => m.name));
    return { line: pre.length > namePart.length ? build(pre, false, false) : line, options: names };
  }

  return { COMMANDS, tokenize, execute, complete, levenshtein, suggest };
});
