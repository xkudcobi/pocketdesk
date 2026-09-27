const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const i18n = require('../js/core/i18n.js');

test('both languages have exactly the same keys', () => {
  const en = Object.keys(i18n.STRINGS.en).sort();
  const tr = Object.keys(i18n.STRINGS.tr).sort();
  assert.deepEqual(tr.filter((k) => !en.includes(k)), [], 'keys only in Turkish');
  assert.deepEqual(en.filter((k) => !tr.includes(k)), [], 'keys only in English');
});

test('no translation is empty and placeholders match', () => {
  const holders = (s) => (s.match(/\{\w+\}/g) || []).sort().join(',');
  for (const key of Object.keys(i18n.STRINGS.en)) {
    const en = i18n.STRINGS.en[key];
    const tr = i18n.STRINGS.tr[key];
    assert.ok(en.trim() && tr.trim(), key);
    assert.equal(holders(tr), holders(en), `placeholders differ in ${key}`);
  }
});

// Kodda kullanılan her sabit anahtar sözlükte olmalı
test('every key used in the code exists', () => {
  const root = path.join(__dirname, '..', 'js');
  const files = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (f.endsWith('.js')) files.push(p);
    }
  };
  walk(root);
  const missing = [];
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    // yalnızca sabit anahtarlar: t('a.b') ya da t('a.b', {...}); 'a.' + x gibi birleştirmeler atlanır
    const re = /\bt\(\s*'([a-z][\w.]*)'\s*[,)]/g;
    let m;
    while ((m = re.exec(src))) {
      if (!(m[1] in i18n.STRINGS.en)) missing.push(path.basename(file) + ': ' + m[1]);
    }
    // koşullu seçimlerde geçen anahtarlar: t(ok ? 'a.b' : 'a.c')
    const loose = /'((?:notes|files|toast|puzzle|doodle|sh|calc)\.[a-zA-Z]+)'(?!\s*\+)/g;
    while ((m = loose.exec(src))) {
      if (!(m[1] in i18n.STRINGS.en) && !file.endsWith('i18n.js')) missing.push(path.basename(file) + ': ' + m[1]);
    }
  }
  assert.deepEqual(missing, []);
});

test('dynamic key families are complete', () => {
  const shell = require('../js/core/shell.js');
  for (const c of shell.COMMANDS) assert.ok(i18n.STRINGS.en['sh.help.' + c], c);
  for (const a of ['files', 'notes', 'doodle', 'calc', 'terminal', 'puzzle', 'settings']) {
    assert.ok(i18n.STRINGS.en['app.' + a]);
    assert.ok(i18n.STRINGS.en['about.' + a]);
  }
  for (const e of ['nameEmpty', 'nameTooLong', 'nameInvalid', 'nameTaken', 'notDir', 'isDir', 'notFound', 'tooMany',
    'fileTooBig', 'systemItem', 'moveIntoSelf', 'notInTrash', 'calcEmpty', 'calcSyntax', 'calcParen', 'calcDivZero',
    'calcUnknown', 'calcRange', 'calcTooLong', 'shUnclosedQuote', 'shBadRedirect']) {
    assert.ok(i18n.STRINGS.en['err.' + e], e);
  }
  for (const th of require('../js/core/persist.js').THEMES) assert.ok(i18n.STRINGS.en['theme.' + th]);
});

test('translate fills placeholders, handles plurals and falls back', () => {
  assert.equal(i18n.translate('en', 'files.itemCount', { count: 3 }), '3 items');
  assert.equal(i18n.translate('en', 'files.itemCount', { count: 1 }), '1 item');
  assert.equal(i18n.translate('tr', 'files.itemCount', { count: 1 }), '1 öğe');
  assert.equal(i18n.translate('tr', 'sh.noSuch', { path: 'x' }), 'Burada "x" diye bir şey yok.');
  assert.equal(i18n.translate('de', 'ui.ok'), 'OK', 'unknown language falls back to English');
  assert.equal(i18n.translate('en', 'no.such.key'), 'no.such.key');
  assert.equal(i18n.translate('en', 'sh.usage'), 'Usage: {usage}', 'missing params stay visible');
});

test('language detection', () => {
  assert.equal(i18n.detectLanguage('tr-TR'), 'tr');
  assert.equal(i18n.detectLanguage('TR'), 'tr');
  assert.equal(i18n.detectLanguage('en-US'), 'en');
  assert.equal(i18n.detectLanguage('de'), 'en');
  assert.equal(i18n.detectLanguage(undefined), 'en');
});
