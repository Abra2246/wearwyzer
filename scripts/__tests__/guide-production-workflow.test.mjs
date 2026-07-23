import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const activePath = new URL('../../.github/workflows/guide-factory-dispatch.yml', import.meta.url);
const referencePath = new URL('../../docs/automation/workflows/guide-factory-dispatch.yml', import.meta.url);

function workflowText(path) {
  return readFileSync(path, 'utf8');
}

test('active and reference Guide Factory workflows stay synchronized', () => {
  const normalize = (text) => text.slice(text.indexOf('name: Guide Factory Dispatcher'));
  assert.equal(normalize(workflowText(activePath)), normalize(workflowText(referencePath)));
});

test('Guide Factory runs the production writer and persists output as a review PR', () => {
  const text = workflowText(activePath);
  assert.match(text, /contents: write/);
  assert.match(text, /pull-requests: write/);
  assert.match(text, /node scripts\/guide-production-writer-cli\.mjs/);
  assert.match(text, /node scripts\/validate-content-data\.mjs/);
  assert.match(text, /git ls-files --others --exclude-standard -- 'assets\/images\/guides\/\*\*'/);
  assert.match(text, /git add -- .*assets\/images\/guides/);
  assert.match(text, /git switch -c "\$branch"/);
  assert.match(text, /git push --set-upstream origin "\$branch"/);
  assert.match(text, /gh pr create --base main/);
  assert.doesNotMatch(text, /gh pr merge/);
});

test('Guide Factory creates no PR only when content, pages, and generated assets are unchanged', () => {
  const text = workflowText(activePath);
  assert.match(text, /git diff --quiet -- js\/guides\.js js\/products\.js sitemap\.xml assets\/images\/guides/);
  assert.match(text, /\[ -z "\$new_assets" \]/);
  assert.match(text, /No publishable guide changes were produced/);
});
