import test from 'node:test';
import assert from 'node:assert/strict';
import { createPersonalizationStore } from '../personalization-store.mjs';
import { FIXTURE_PROTOTYPE_DATA } from '../__fixtures__/personalization.mjs';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test('prototype personal data can be saved, exported, and deleted', () => {
  const store = createPersonalizationStore(memoryStorage());
  assert.equal(store.read(), null);

  const saved = store.save(FIXTURE_PROTOTYPE_DATA);
  assert.equal(saved.data.fixtureOnly, true);
  assert.equal(store.read().data.profile.id, FIXTURE_PROTOTYPE_DATA.profile.id);

  const exported = JSON.parse(store.exportJson());
  assert.equal(exported.schemaVersion, 'personalization-prototype-v1');
  assert.equal(exported.data.wardrobe.length, FIXTURE_PROTOTYPE_DATA.wardrobe.length);

  assert.equal(store.deleteAll(), true);
  assert.equal(store.read(), null);
});

test('store rejects adapters that cannot honor export and deletion semantics', () => {
  assert.throws(() => createPersonalizationStore({}), /Web Storage-compatible/);
});
