// Hesap makinesi motoru: kendi tokenizer'ı ve özyinelemeli iniş parser'ı.
// eval kullanılmaz; hatalar kod + konum olarak döner, metne arayüz çevirir.
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.PD = root.PD || {}).calc = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAX_LEN = 500;
  const OPS = { '+': '+', '-': '-', '−': '-', '*': '*', '×': '*', '/': '/', '÷': '/', '^': '^', '!': '!', '%': '%' };
  const CONSTS = { pi: Math.PI, 'π': Math.PI, e: Math.E, tau: Math.PI * 2 };

  function CalcError(code, pos) {
    this.code = code;
    this.pos = pos;
  }

  function snapTiny(v) {
    return Math.abs(v) < 1e-12 ? 0 : v;
  }

  function makeFuncs(angle) {
    const toRad = angle === 'rad' ? 1 : Math.PI / 180;
    const fromRad = angle === 'rad' ? 1 : 180 / Math.PI;
    return {
      sqrt: (x) => { if (x < 0) throw new CalcError('calcRange'); return Math.sqrt(x); },
      cbrt: Math.cbrt,
      abs: Math.abs,
      round: Math.round,
      floor: Math.floor,
      ceil: Math.ceil,
      ln: (x) => { if (x <= 0) throw new CalcError('calcRange'); return Math.log(x); },
      log: (x) => { if (x <= 0) throw new CalcError('calcRange'); return Math.log10(x); },
      exp: Math.exp,
      sin: (x) => snapTiny(Math.sin(x * toRad)),
      cos: (x) => snapTiny(Math.cos(x * toRad)),
      tan: (x) => {
        const c = snapTiny(Math.cos(x * toRad));
        if (c === 0) throw new CalcError('calcRange');
        return snapTiny(Math.sin(x * toRad) / c);
      },
      asin: (x) => { if (x < -1 || x > 1) throw new CalcError('calcRange'); return Math.asin(x) * fromRad; },
      acos: (x) => { if (x < -1 || x > 1) throw new CalcError('calcRange'); return Math.acos(x) * fromRad; },
      atan: (x) => Math.atan(x) * fromRad
    };
  }

  const isDigit = (c) => c >= '0' && c <= '9';

  function tokenize(src) {
    const tokens = [];
    let i = 0;
    while (i < src.length) {
      const ch = src[i];
      if (ch === ' ' || ch === '\t' || ch === '\n') { i++; continue; }
      const start = i;
      // sayı: "3,5" Türkçe ondalık yazımı da kabul edilir
      if (isDigit(ch) || ((ch === '.' || ch === ',') && isDigit(src[i + 1] || ''))) {
        let text = '';
        let seenDot = false;
        while (i < src.length) {
          const c = src[i];
          if (isDigit(c)) { text += c; i++; }
          else if ((c === '.' || c === ',') && !seenDot && isDigit(src[i + 1] || '')) { seenDot = true; text += '.'; i++; }
          else if ((c === '.' || c === ',') && !seenDot && text && !isDigit(src[i + 1] || '')) { seenDot = true; i++; }
          else break;
        }
        // üs kısmı yalnızca arkasından rakam geliyorsa: "2e3" = 2000 ama "2e" = 2·e
        if ((src[i] === 'e' || src[i] === 'E') && (isDigit(src[i + 1] || '') || ((src[i + 1] === '-' || src[i + 1] === '+') && isDigit(src[i + 2] || '')))) {
          text += 'e' + src[i + 1];
          i += 2;
          while (i < src.length && isDigit(src[i])) text += src[i++];
        }
        if (src[i] === '.' || src[i] === ',') throw new CalcError('calcSyntax', i);
        tokens.push({ type: 'num', value: Number(text), pos: start });
        continue;
      }
      if (ch === '*' && src[i + 1] === '*') {
        tokens.push({ type: 'op', value: '^', pos: start });
        i += 2;
        continue;
      }
      if (OPS[ch]) { tokens.push({ type: 'op', value: OPS[ch], pos: start }); i++; continue; }
      if (ch === '(') { tokens.push({ type: 'lp', pos: start }); i++; continue; }
      if (ch === ')') { tokens.push({ type: 'rp', pos: start }); i++; continue; }
      if (/[a-zA-Zπ]/.test(ch)) {
        let name = '';
        while (i < src.length && /[a-zA-Zπ0-9]/.test(src[i])) name += src[i++];
        tokens.push({ type: 'id', value: name.toLowerCase(), pos: start });
        continue;
      }
      throw new CalcError('calcSyntax', i);
    }
    return tokens;
  }

  function factorial(n) {
    if (n < 0 || !Number.isInteger(n) || n > 170) throw new CalcError('calcRange');
    let r = 1;
    for (let k = 2; k <= n; k++) r *= k;
    return r;
  }

  function parse(tokens, funcs, srcLen) {
    let i = 0;
    const peek = () => tokens[i];
    const endPos = () => (tokens[i] ? tokens[i].pos : srcLen);
    const isOp = (t, v) => t && t.type === 'op' && t.value === v;

    function expr() {
      let left = term();
      for (;;) {
        const t = peek();
        if (isOp(t, '+')) { i++; left += term(); }
        else if (isOp(t, '-')) { i++; left -= term(); }
        else return left;
      }
    }

    function term() {
      let left = unary();
      for (;;) {
        const t = peek();
        if (isOp(t, '*')) { i++; left *= unary(); }
        else if (isOp(t, '/')) {
          i++;
          const right = unary();
          if (right === 0) throw new CalcError('calcDivZero', t.pos);
          left /= right;
        } else if (t && (t.type === 'lp' || t.type === 'id')) {
          // örtük çarpma: 2π, 3(4+1)
          left *= unary();
        } else return left;
      }
    }

    function unary() {
      const t = peek();
      if (isOp(t, '-')) { i++; return -unary(); }
      if (isOp(t, '+')) { i++; return unary(); }
      return power();
    }

    function power() {
      const base = postfix();
      if (isOp(peek(), '^')) {
        i++;
        return Math.pow(base, unary());
      }
      return base;
    }

    function postfix() {
      let v = primary();
      for (;;) {
        const t = peek();
        if (isOp(t, '!')) { i++; v = factorial(v); }
        else if (isOp(t, '%')) { i++; v = v / 100; }
        else return v;
      }
    }

    function primary() {
      const t = peek();
      if (!t) throw new CalcError('calcSyntax', srcLen);
      if (t.type === 'num') { i++; return t.value; }
      if (t.type === 'lp') {
        i++;
        const v = expr();
        if (!peek() || peek().type !== 'rp') throw new CalcError('calcParen', endPos());
        i++;
        return v;
      }
      if (t.type === 'id') {
        i++;
        if (Object.prototype.hasOwnProperty.call(funcs, t.value)) {
          const arg = peek() && peek().type === 'lp' ? primary() : power();
          return funcs[t.value](arg);
        }
        if (Object.prototype.hasOwnProperty.call(CONSTS, t.value)) return CONSTS[t.value];
        throw new CalcError('calcUnknown', t.pos);
      }
      if (t.type === 'rp') throw new CalcError('calcParen', t.pos);
      throw new CalcError('calcSyntax', t.pos);
    }

    const value = expr();
    if (i < tokens.length) {
      const t = tokens[i];
      throw new CalcError(t.type === 'rp' ? 'calcParen' : 'calcSyntax', t.pos);
    }
    return value;
  }

  function formatNumber(v) {
    if (!isFinite(v)) return String(v);
    if (v === 0) return '0';
    const a = Math.abs(v);
    if (a >= 1e15 || a < 1e-9) {
      return v.toExponential(8).replace(/\.?0+e/, 'e').replace('e+', 'e');
    }
    return String(parseFloat(v.toPrecision(12)));
  }

  function evaluate(src, opts) {
    const angle = opts && opts.angle === 'rad' ? 'rad' : 'deg';
    if (typeof src !== 'string' || !src.trim()) return { ok: false, error: 'calcEmpty', pos: 0 };
    if (src.length > MAX_LEN) return { ok: false, error: 'calcTooLong', pos: MAX_LEN };
    try {
      const tokens = tokenize(src);
      const value = parse(tokens, makeFuncs(angle), src.length);
      if (!isFinite(value) || Number.isNaN(value)) return { ok: false, error: 'calcRange', pos: 0 };
      const clean = Object.is(value, -0) ? 0 : value;
      return { ok: true, value: clean, text: formatNumber(clean) };
    } catch (e) {
      if (e instanceof CalcError) return { ok: false, error: e.code, pos: e.pos == null ? 0 : e.pos };
      throw e;
    }
  }

  return { evaluate, tokenize, formatNumber, CONSTS };
});
