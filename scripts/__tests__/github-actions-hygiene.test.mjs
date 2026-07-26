import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const workflowDirectories = [
  '.github/workflows',
  'docs/automation/workflows',
];
const expectedMajors = new Map([
  ['actions/checkout', 'v7'],
  ['actions/setup-node', 'v7'],
  ['actions/configure-pages', 'v6'],
  ['actions/upload-pages-artifact', 'v5'],
  ['actions/deploy-pages', 'v5'],
]);

function workflowFiles(directory) {
  return readdirSync(new URL(`${directory}/`, root))
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .map((name) => ({
      path: join(directory, name),
      text: readFileSync(new URL(`${directory}/${name}`, root), 'utf8'),
    }));
}

const workflows = workflowDirectories.flatMap(workflowFiles);

test('first-party JavaScript actions use the verified Node 24 majors', () => {
  const seen = new Set();
  for (const workflow of workflows) {
    const references = workflow.text.matchAll(
      /uses:\s+(actions\/(?:checkout|setup-node|configure-pages|upload-pages-artifact|deploy-pages))@(v\d+)/g,
    );
    for (const [, action, major] of references) {
      seen.add(action);
      assert.equal(
        major,
        expectedMajors.get(action),
        `${workflow.path} must use ${action}@${expectedMajors.get(action)}`,
      );
    }
  }
  assert.deepEqual(seen, new Set(expectedMajors.keys()));
});

test('active and staged workflows agree on checkout and setup-node majors', () => {
  for (const action of ['actions/checkout', 'actions/setup-node']) {
    const majorPattern = new RegExp(`${action.replace('/', '\\/')}@(v\\d+)`, 'g');
    const active = new Set(
      workflows
        .filter(({ path }) => path.startsWith('.github/workflows/'))
        .flatMap(({ text }) => [...text.matchAll(majorPattern)].map((match) => match[1])),
    );
    const staged = new Set(
      workflows
        .filter(({ path }) => path.startsWith('docs/automation/workflows/'))
        .flatMap(({ text }) => [...text.matchAll(majorPattern)].map((match) => match[1])),
    );
    assert.deepEqual(active, staged, `${action} major must match in active and staged workflows`);
  }
});

test('Pages upload uses the action version that owns include-hidden-files', () => {
  const pages = readFileSync(new URL('../../.github/workflows/pages.yml', import.meta.url), 'utf8');
  assert.match(pages, /uses:\s+actions\/upload-pages-artifact@v5/);
  assert.match(pages, /include-hidden-files:\s+true/);
  assert.doesNotMatch(pages, /uses:\s+actions\/upload-artifact@/);
});
