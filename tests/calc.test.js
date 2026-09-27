const test = require('node:test');
const assert = require('node:assert/strict');
const calc = require('../js/core/calc.js');

const val = (s, o) => {
  const r = calc.evaluate(s, o);
  assert.ok(r.ok, `${s} -> ${r.error}`);
  return r.value;
};
const err = (s) => calc.evaluate(s).error;

test('respects precedence and associativity', () => {
  assert.equal(val('2 + 3 * 4'), 14);
  assert.equal(val('(2 + 3) * 4'), 20);
  assert.equal(val('2 ^ 3 ^ 2'), 512);
  assert.equal(val('-2 ^ 2'), -4);
  assert.equal(val('2 ^ -1'), 0.5);
  assert.equal(val('10 - 4 - 3'), 3);
  assert.equal(val('100 / 10 / 5'), 2);
  assert.equal(val('--3'), 3);
});

test('understands friendly symbols and Turkish decimal commas', () => {
  assert.equal(val('6 × 7'), 42);
  assert.equal(val('9 ÷ 3 − 1'), 2);
  assert.equal(val('3,5 + 1'), 4.5);
  assert.equal(val('2 ** 10'), 1024);
  assert.equal(val('.5 + 1.'), 1.5);
});

test('percent, factorial, implicit multiplication and constants', () => {
  assert.equal(val('50%'), 0.5);
  assert.equal(val('200 * 15%'), 30);
  assert.equal(val('5!'), 120);
  assert.equal(val('2(3 + 4)'), 14);
  assert.equal(val('2pi'), 2 * Math.PI);
  assert.equal(val('1e3 + 2e-1'), 1000.2);
  assert.equal(val('2e'), 2 * Math.E);
});

test('functions work in degrees by default and in radians on request', () => {
  assert.equal(val('sin(30)'), 0.49999999999999994);
  assert.equal(calc.evaluate('sin(30)').text, '0.5');
  assert.equal(val('cos 90'), 0);
  assert.equal(val('sin(pi/2)', { angle: 'rad' }), 1);
  assert.equal(val('sqrt(16) + abs(-2)'), 6);
  assert.equal(val('log(1000)'), 3);
  assert.equal(val('asin(1)'), 90);
});

test('reports errors with a code instead of throwing', () => {
  assert.equal(err(''), 'calcEmpty');
  assert.equal(err('1 / 0'), 'calcDivZero');
  assert.equal(err('(1 + 2'), 'calcParen');
  assert.equal(err('1 + 2)'), 'calcParen');
  assert.equal(err('2 +'), 'calcSyntax');
  assert.equal(err('1..2'), 'calcSyntax');
  assert.equal(err('foo(2)'), 'calcUnknown');
  assert.equal(err('sqrt(-1)'), 'calcRange');
  assert.equal(err('tan(90)'), 'calcRange');
  assert.equal(err('171!'), 'calcRange');
  assert.equal(err('2.5!'), 'calcRange');
  assert.equal(err('10^400'), 'calcRange');
  assert.equal(err('#'), 'calcSyntax');
  assert.equal(err('1+'.repeat(300) + '1'), 'calcTooLong');
});

test('formats numbers without float noise', () => {
  assert.equal(calc.evaluate('0.1 + 0.2').text, '0.3');
  assert.equal(calc.evaluate('1 / 3').text, '0.333333333333');
  assert.equal(calc.formatNumber(1e20), '1e20');
  assert.equal(calc.formatNumber(-0.5), '-0.5');
  assert.equal(calc.evaluate('-0').text, '0');
});
