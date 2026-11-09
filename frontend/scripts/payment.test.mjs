import test from 'node:test';
import assert from 'node:assert/strict';
import { estimatedHalf, canDemoPay } from '../src/lib/payment.js';
test('50% estimated deposits round to currency cents', () => {
  assert.equal(estimatedHalf(40), 20);
  assert.equal(estimatedHalf(23.99), 12);
  assert.equal(estimatedHalf(0), 0);
  assert.equal(estimatedHalf('wrong'), null);
});
test('only an unexpired PENDING_PAYMENT reservation is payable', () => {
  const until = new Date(Date.now() + 60_000).toISOString();
  const ago = new Date(Date.now() - 60_000).toISOString();
  assert.equal(canDemoPay({status:'PENDING_PAYMENT',payment_expires_at:until}), true);
  assert.equal(canDemoPay({status:'CONFIRMED',payment_expires_at:until}), false);
  assert.equal(canDemoPay({status:'PENDING_PAYMENT',payment_expires_at:ago}), false);
  assert.equal(canDemoPay(null), false);
});
