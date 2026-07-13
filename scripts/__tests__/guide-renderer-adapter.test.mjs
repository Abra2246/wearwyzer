import test from 'node:test';
import assert from 'node:assert/strict';
import { renderSlide, renderSlides, renderSlideDeterministic } from '../guide-renderer-adapter.mjs';

test('deterministic renderer produces a rendered SVG slide', () => {
  const result = renderSlideDeterministic({ order: 1, label: 'Cover', copy: 'Hello' });
  assert.equal(result.status, 'rendered');
  assert.equal(result.mode, 'deterministic-template');
  assert.match(result.content, /<svg/);
  assert.match(result.content, /Cover/);
});

test('deterministic renderer is byte-for-byte deterministic for the same input', () => {
  const spec = { order: 3, label: 'Weekend', copy: 'Some copy.' };
  assert.equal(renderSlideDeterministic(spec).content, renderSlideDeterministic(spec).content);
});

test('deterministic renderer escapes XML-unsafe characters', () => {
  const result = renderSlideDeterministic({ order: 1, label: 'A & B <script>', copy: '"quoted"' });
  assert.doesNotMatch(result.content, /<script>/);
  assert.match(result.content, /&amp;/);
});

test('external-provider renderer reports blocked when no credentials are configured', () => {
  const result = renderSlide({ order: 1, label: 'Cover', copy: 'x' }, { mode: 'external-provider', providerConfig: null });
  assert.equal(result.status, 'blocked');
  assert.equal(result.content, null);
  assert.match(result.reason, /no external renderer credentials/);
});

test('external-provider renderer reports blocked when credentials present but not policy-approved', () => {
  const result = renderSlide(
    { order: 1, label: 'Cover', copy: 'x' },
    { mode: 'external-provider', providerConfig: { credentialsPresent: true, policyApproved: false } }
  );
  assert.equal(result.status, 'blocked');
  assert.match(result.reason, /not policy-approved/);
});

test('renderSlide rejects an unknown mode', () => {
  assert.throws(() => renderSlide({ order: 1 }, { mode: 'made-up-mode' }));
});

test('renderSlides renders every spec and preserves slideOrder', () => {
  const specs = [{ order: 1, label: 'A', copy: 'x' }, { order: 2, label: 'B', copy: 'y' }];
  const results = renderSlides(specs, { mode: 'deterministic-template' });
  assert.deepEqual(results.map((r) => r.slideOrder), [1, 2]);
  assert.ok(results.every((r) => r.status === 'rendered'));
});
