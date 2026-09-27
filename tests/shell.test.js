const test = require('node:test');
const assert = require('node:assert/strict');
const shell = require('../js/core/shell.js');
const vfs = require('../js/core/vfs.js');
const i18n = require('../js/core/i18n.js');

function setup() {
  const fs = vfs.createFs(0);
  const trash = vfs.mkdir(fs, vfs.ROOT, 'Trash').id;
  fs.nodes[trash].sys = 'trash';
  const docs = vfs.mkdir(fs, vfs.ROOT, 'Documents').id;
  vfs.createFile(fs, docs, 'list.txt', 'eggs\nmilk');
  vfs.createFile(fs, docs, 'my notes.txt', 'hi');
  let cwd = vfs.ROOT;
  const t = (k, p) => i18n.translate('en', k, p);
  const run = (line) => {
    const r = shell.execute(line, { fs, cwd, t, lang: 'en', now: 1 });
    cwd = r.cwd;
    return r;
  };
  const text = (r) => r.lines.map((l) => l.text);
  return { fs, run, text, cwd: () => cwd, docs, trash };
}

test('tokenize handles quotes, escapes and redirection', () => {
  const r = shell.tokenize('echo "a b" c\\ d \'e"f\'>>out.txt');
  assert.deepEqual(r.tokens.map((t) => t.type === 'word' ? t.value : (t.append ? '>>' : '>')), ['echo', 'a b', 'c d', 'e"f', '>>', 'out.txt']);
  assert.equal(shell.tokenize('echo "open').error, 'shUnclosedQuote');
  assert.deepEqual(shell.tokenize('say ""').tokens.map((t) => t.value), ['say', '']);
});

test('cd, pwd and ls move around the file system', () => {
  const { run, text } = setup();
  assert.deepEqual(text(run('ls')), ['Documents/', 'Trash/']);
  run('cd Documents');
  assert.deepEqual(text(run('pwd')), ['/Documents']);
  assert.deepEqual(text(run('ls')), ['list.txt', 'my notes.txt']);
  run('cd ..');
  assert.deepEqual(text(run('pwd')), ['/']);
  const bad = run('cd nowhere');
  assert.equal(bad.lines[0].kind, 'err');
  assert.equal(text(run('pwd'))[0], '/', 'failed cd keeps the old folder');
  assert.equal(run('cd Documents/list.txt').lines[0].kind, 'err');
});

test('cat prints files and names with spaces need quotes', () => {
  const { run, text } = setup();
  assert.deepEqual(text(run('cat Documents/list.txt')), ['eggs', 'milk']);
  assert.deepEqual(text(run('cat "Documents/my notes.txt"')), ['hi']);
  assert.equal(run('cat Documents/my notes.txt').lines[0].kind, 'err');
});

test('echo with > and >> writes files', () => {
  const { run, text, fs } = setup();
  const r = run('echo hello there > greet.txt');
  assert.equal(r.lines.length, 0, 'output goes into the file, not the screen');
  run('echo second line >> greet.txt');
  assert.deepEqual(text(run('cat greet.txt')), ['hello there', 'second line']);
  run('echo replaced > greet.txt');
  assert.equal(fs.nodes[vfs.resolve(fs, '/greet.txt', vfs.ROOT)].content, 'replaced');
  assert.equal(run('echo x > Documents').lines[0].kind, 'err');
  assert.equal(run('echo x >').lines[0].text, i18n.translate('en', 'err.shBadRedirect'));
  assert.equal(run('cd / > a.txt').lines[0].kind, 'err', 'commands without output cannot redirect');
  run('ls Documents > listing.txt');
  assert.deepEqual(text(run('cat listing.txt')), ['list.txt', 'my notes.txt']);
});

test('mkdir -p, touch, mv and cp', () => {
  const { run, text, fs } = setup();
  run('mkdir -p a/b/c');
  assert.ok(vfs.resolve(fs, '/a/b/c', vfs.ROOT));
  run('touch a/b/c/file.txt');
  run('mv a/b/c/file.txt a/renamed.txt');
  assert.ok(vfs.resolve(fs, '/a/renamed.txt', vfs.ROOT));
  run('mv a/renamed.txt Documents');
  assert.ok(vfs.resolve(fs, '/Documents/renamed.txt', vfs.ROOT));
  run('cp Documents/list.txt Documents/copy.txt');
  assert.deepEqual(text(run('cat Documents/copy.txt')), ['eggs', 'milk']);
  assert.equal(run('cp a a').lines[0].kind, 'err');
  assert.equal(vfs.resolve(fs, '/a/a', vfs.ROOT), null, 'copying a folder into itself is refused');
  run('cp a a2');
  assert.ok(vfs.resolve(fs, '/a2/b/c', vfs.ROOT), 'folders are copied deeply');
  const bad = run('mv Documents Documents/list.txt');
  assert.equal(bad.lines[0].kind, 'err');
  assert.equal(run('mv onlyone').lines[0].kind, 'err');
  assert.equal(run('mkdir Documents').lines[0].kind, 'err');
});

test('rm sends things to the trash and needs -r for folders', () => {
  const { run, fs, trash } = setup();
  assert.equal(run('rm Documents').lines[0].kind, 'err');
  run('rm Documents/list.txt');
  assert.equal(fs.nodes[trash].children.length, 1);
  run('cd Documents');
  assert.equal(run('rm -r ../Documents').lines[0].kind, 'err', 'cannot delete the folder you are in');
  run('cd /');
  run('rm -r Documents');
  assert.equal(fs.nodes[trash].children.length, 2);
  const r = run('rm Trash/list.txt');
  assert.match(r.lines[0].text, /for good/);
});

test('open, lang and clear produce effects for the interface', () => {
  const { run, docs } = setup();
  assert.deepEqual(run('open Documents').effects, [{ type: 'open', id: docs }]);
  assert.deepEqual(run('lang tr').effects, [{ type: 'lang', value: 'tr' }]);
  assert.equal(run('lang xx').lines[0].kind, 'err');
  assert.deepEqual(run('clear').effects, [{ type: 'clear' }]);
});

test('calc, help and unknown commands', () => {
  const { run, text } = setup();
  assert.deepEqual(text(run('calc 2 ^ 10')), ['= 1024']);
  assert.equal(run('calc 1/0').lines[0].kind, 'err');
  assert.ok(run('help').lines.length > shell.COMMANDS.length);
  assert.ok(run('yardım').lines.length > 1, 'Turkish alias works');
  assert.match(text(run('lss'))[0], /Did you mean ls\?/);
  assert.match(text(run('xyzzy'))[0], /Unknown command/);
  assert.equal(run('   ').lines.length, 0);
});

test('tree draws nested folders', () => {
  const { run, text } = setup();
  const out = text(run('tree'));
  assert.equal(out[0], '/');
  assert.ok(out.includes('├── Documents/'));
  assert.ok(out.includes('│   ├── list.txt'));
});

test('tab completion for commands and paths', () => {
  const { fs } = setup();
  const ctx = { fs, cwd: vfs.ROOT };
  assert.equal(shell.complete('ec', ctx).line, 'echo ');
  assert.deepEqual(shell.complete('c', ctx).options.sort(), ['calc', 'cat', 'cd', 'clear', 'cp']);
  assert.equal(shell.complete('cd Doc', ctx).line, 'cd Documents/');
  assert.equal(shell.complete('cat Documents/my', ctx).line, 'cat "Documents/my notes.txt" ');
  assert.equal(shell.complete('cat Documents/li', ctx).line, 'cat Documents/list.txt ');
  assert.deepEqual(shell.complete('cat Documents/', ctx).options, ['list.txt', 'my notes.txt']);
  assert.equal(shell.complete('cat zz', ctx).line, 'cat zz');
});

test('levenshtein distance', () => {
  assert.equal(shell.levenshtein('kitten', 'sitting'), 3);
  assert.equal(shell.levenshtein('', 'abc'), 3);
  assert.equal(shell.levenshtein('same', 'same'), 0);
});
