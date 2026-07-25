const DEFAULT_KEY = 'wearwyzer.personalization.prototype.v1';

export function createPersonalizationStore(storage, key = DEFAULT_KEY) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    throw new TypeError('A Web Storage-compatible adapter is required.');
  }

  function read() {
    const raw = storage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  }

  function save(value) {
    const record = {
      schemaVersion: 'personalization-prototype-v1',
      savedAt: new Date().toISOString(),
      data: value,
    };
    storage.setItem(key, JSON.stringify(record));
    return record;
  }

  function exportJson() {
    const record = read();
    return JSON.stringify(record ?? {
      schemaVersion: 'personalization-prototype-v1',
      savedAt: null,
      data: null,
    }, null, 2);
  }

  function deleteAll() {
    storage.removeItem(key);
    return read() === null;
  }

  return Object.freeze({ key, read, save, exportJson, deleteAll });
}
