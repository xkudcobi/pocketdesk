const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/core/puzzle.js');

function applyPath(tiles, size, path) {
  for (const idx of path) assert.equal(P.slide(tiles, size, idx), 1, 'every step moves exactly one tile');
  return tiles;
}

test('solved boards and solvability', () => {
  assert.deepEqual(P.solved(3), [1, 2, 3, 4, 5, 6, 7, 8, 0]);
  assert.ok(P.isSolved(P.solved(4)));
  assert.ok(P.isSolvable(P.solved(3), 3));
  assert.equal(P.isSolvable([2, 1, 3, 4, 5, 6, 7, 8, 0], 3), false, 'one swapped pair cannot be solved');
  assert.ok(P.isSolvable(P.solved(4), 4));
  const s4 = P.solved(4);
  [s4[0], s4[1]] = [s4[1], s4[0]];
  assert.equal(P.isSolvable(s4, 4), false);
  assert.equal(P.isSolvable([1, 1, 2, 3, 4, 5, 6, 7, 0], 3), false, 'duplicates are rejected');
  assert.equal(P.isSolvable([1, 2, 3], 3), false, 'wrong length is rejected');
});

test('shuffle is repeatable with a seed and always solvable', () => {
  const a = P.shuffle(4, P.rng(42));
  const b = P.shuffle(4, P.rng(42));
  assert.deepEqual(a, b);
  for (let seed = 1; seed < 40; seed++) {
    const s = P.shuffle(3, P.rng(seed));
    assert.ok(P.isSolvable(s, 3));
    assert.equal(P.isSolved(s), false);
  }
});

test('slide moves a whole row or column toward the gap', () => {
  const t = P.solved(3); // boşluk 8. indekste
  assert.equal(P.slide(t, 3, 6), 2);
  assert.deepEqual(t, [1, 2, 3, 4, 5, 6, 0, 7, 8]);
  assert.equal(P.slide(t, 3, 0), 2);
  assert.deepEqual(t, [0, 2, 3, 1, 5, 6, 4, 7, 8]);
  assert.equal(P.slide(t, 3, 4), 0, 'diagonal tiles do not move');
  assert.equal(P.slide(t, 3, 0), 0, 'clicking the gap does nothing');
  assert.equal(P.slide(t, 3, 99), 0);
});

test('manhattan distance', () => {
  assert.equal(P.manhattan(P.solved(3), 3), 0);
  assert.equal(P.manhattan([1, 2, 3, 4, 5, 6, 7, 0, 8], 3), 1);
  assert.equal(P.manhattan([8, 2, 3, 4, 5, 6, 7, 1, 0], 3), 3 + 3);
});

test('IDA* finds optimal solutions for 3x3 boards', () => {
  const easy = [1, 2, 3, 4, 5, 6, 0, 7, 8];
  assert.deepEqual(P.solve(easy, 3), [7, 8]);
  assert.deepEqual(P.solve(P.solved(3), 3), []);
  // bilinen en zor 8-bulmaca konumlarından biri: 31 hamle
  const hardest = [8, 6, 7, 2, 5, 4, 3, 0, 1];
  const path = P.solve(hardest, 3, 5000000);
  assert.equal(path.length, 31);
  assert.ok(P.isSolved(applyPath(hardest.slice(), 3, path)));
  assert.equal(P.solve([2, 1, 3, 4, 5, 6, 7, 8, 0], 3), null, 'unsolvable board');
});

test('random 3x3 boards get solved and the input is not modified', () => {
  for (let seed = 100; seed < 110; seed++) {
    const board = P.shuffle(3, P.rng(seed));
    const copy = board.slice();
    const path = P.solve(board, 3, 3000000);
    assert.deepEqual(board, copy);
    assert.ok(path, 'solution found');
    assert.ok(P.isSolved(applyPath(board.slice(), 3, path)));
  }
});

test('solver gives up within its node budget', () => {
  const board = P.shuffle(4, P.rng(7), 400);
  assert.equal(P.solve(board, 4, 50), null);
});

test('hint points at a tile next to the gap', () => {
  const board = P.shuffle(4, P.rng(3), 400);
  const h = P.hint(board, 4, 2000);
  const blank = board.indexOf(0);
  assert.ok(P.neighborTable(4)[blank].includes(h.index));
  const near = [1, 2, 3, 4, 5, 6, 0, 7, 8];
  const exact = P.hint(near, 3);
  assert.deepEqual(exact, { index: 7, exact: true, remaining: 2 });
  assert.equal(P.hint(P.solved(3), 3), null);
});
