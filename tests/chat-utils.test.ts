import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalPair, compareMessagePosition } from '../src/lib/chat-utils';

const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';

test('canonical pair is independent of user order', () => {
  assert.deepEqual(canonicalPair(alice, bob), [alice, bob]);
  assert.deepEqual(canonicalPair(bob, alice), [alice, bob]);
});

test('same-user direct chat is invalid', () => {
  assert.throws(() => canonicalPair(alice, alice), /two different users/);
});

test('last-seen message ordering checks nanoseconds and ID tie-breaker', () => {
  const first = { seconds: 10, nanoseconds: 12 };
  const next = { seconds: 10, nanoseconds: 13 };
  assert.equal(compareMessagePosition(first, 'b', next, 'a'), -1);
  assert.equal(compareMessagePosition(next, 'a', first, 'b'), 1);
  assert.equal(compareMessagePosition(next, 'a', next, 'b'), -1);
  assert.equal(compareMessagePosition(next, 'b', next, 'b'), 0);
});
