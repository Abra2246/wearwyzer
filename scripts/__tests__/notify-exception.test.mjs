import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyEvent, buildNotification, EXCEPTION_TYPES } from '../notify-exception.mjs';

test('routine-success events are logged only, never notified', () => {
  const result = classifyEvent({ type: 'routine-success', summary: 'Guide published.' });
  assert.equal(result.shouldNotify, false);
  assert.equal(result.logOnly, true);
});

for (const type of EXCEPTION_TYPES) {
  test(`"${type}" is a notify-worthy exception with a needs-human label`, () => {
    const result = classifyEvent({ type, summary: 'x' });
    assert.equal(result.shouldNotify, true);
    assert.ok(result.labels.includes('needs-human'));
  });
}

test('deploy-health-failure additionally carries the site-incident label', () => {
  const result = classifyEvent({ type: 'deploy-health-failure', summary: 'x' });
  assert.ok(result.labels.includes('site-incident'));
});

test('protected-path-or-high-risk additionally carries the risk-high label', () => {
  const result = classifyEvent({ type: 'protected-path-or-high-risk', summary: 'x' });
  assert.ok(result.labels.includes('risk-high'));
});

test('an unrecognized event type fails safe to notify-worthy rather than being silently dropped', () => {
  const result = classifyEvent({ type: 'something-nobody-defined', summary: 'x' });
  assert.equal(result.shouldNotify, true);
  assert.equal(result.fallback, true);
  assert.deepEqual(result.labels, ['needs-human']);
});

test('buildNotification produces a concise title and includes the next action when given one', () => {
  const notification = buildNotification({
    type: 'unverifiable-product-facts',
    summary: 'Guide job fx-1 references an unresolved productId.',
    nextAction: 'Add the product to js/products.js or fix the manifest.',
  });
  assert.match(notification.title, /unverifiable-product-facts/);
  assert.match(notification.body, /Next action/);
  assert.ok(notification.labels.includes('needs-human'));
});

test('buildNotification never throws when optional fields are absent', () => {
  const notification = buildNotification({ type: 'ambiguous-editorial-decision' });
  assert.equal(typeof notification.title, 'string');
  assert.equal(typeof notification.body, 'string');
});
