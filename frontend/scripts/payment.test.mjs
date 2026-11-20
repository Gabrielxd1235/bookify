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
test('balance due and online balance payment', async () => {
  const { balanceDue, canPayBalance } = await import('../src/lib/payment.js');
  const future = new Date(Date.now() + 3_600_000).toISOString();
  const deposit = { status: 'CONFIRMED', payment_plan: 'DEPOSIT', total_amount: '50.00', amount_paid: '25.00', ends_at: future };
  assert.equal(balanceDue(deposit), 25);
  assert.equal(canPayBalance(deposit), true);
  assert.equal(canPayBalance({ ...deposit, amount_paid: '50.00' }), false);
  assert.equal(canPayBalance({ ...deposit, payment_plan: 'FULL', amount_paid: '50.00' }), false);
  assert.equal(canPayBalance({ ...deposit, status: 'PENDING_PAYMENT' }), false);
  assert.equal(balanceDue(null), 0);
});
