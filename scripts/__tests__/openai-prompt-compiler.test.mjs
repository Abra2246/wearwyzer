import test from 'node:test';
import assert from 'node:assert/strict';
import { compileEditorialPrompt, compileFinalLayoutPrompt, PROMPT_SCHEMA_VERSION, HARD_EXCLUSIONS } from '../openai-prompt-compiler.mjs';

const MANIFEST = {
  jobId: 'fx-pilot-guide',
  heroProductId: 'fx-hero-jacket-b',
  outfits: [
    {
      name: 'Office Commute',
      when: 'Weekday mornings',
      items: [{ name: 'Weatherproof Shell', productId: 'fx-hero-jacket-b' }, { name: 'Crew Tee', productId: 'fx-tee' }],
    },
  ],
};

test('compiled prompt includes hero identity, colorway, outfit composition, and every hard exclusion', () => {
  const compiled = compileEditorialPrompt({
    manifest: MANIFEST,
    heroProduct: { name: 'Weatherproof Trail Shell', colorway: 'moss green' },
    slideSpec: { order: 2, label: 'Office Commute', copy: 'Shell over a crew tee.' },
    referenceImageSupplied: true,
  });
  assert.equal(compiled.version, PROMPT_SCHEMA_VERSION);
  assert.equal(compiled.layer, 'editorial-imagery');
  assert.match(compiled.editorialPrompt, /Weatherproof Trail Shell/);
  assert.match(compiled.editorialPrompt, /moss green/);
  assert.match(compiled.editorialPrompt, /Crew Tee/);
  assert.match(compiled.editorialPrompt, /verified reference image of the hero product is attached/);
  for (const exclusion of HARD_EXCLUSIONS) {
    assert.ok(compiled.editorialPrompt.includes(exclusion), `expected prompt to include exclusion: ${exclusion}`);
  }
});

test('compiled prompt flags unverified hero identity when no reference image is supplied', () => {
  const compiled = compileEditorialPrompt({
    manifest: MANIFEST,
    heroProduct: { name: 'Weatherproof Trail Shell' },
    slideSpec: { order: 2, label: 'Office Commute', copy: 'x' },
    referenceImageSupplied: false,
  });
  assert.equal(compiled.referenceImageSupplied, false);
  assert.match(compiled.editorialPrompt, /unverified; this generation must be routed to human review/);
});

test('never generates a prompt for the final layout layer', () => {
  assert.throws(() => compileFinalLayoutPrompt(), /never sends final typography\/layout/);
});
