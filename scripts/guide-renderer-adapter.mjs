// Carousel-slide renderer adapter boundary (issue #17, section 7). Pure,
// dependency-free — no network calls, no credentials, no dependency on
// any specific image-generation product or conversation.
//
// Canonical spec: docs/AUTONOMOUS_GUIDE_FACTORY_V1.md
//
// Two modes:
//   - "deterministic-template" (default, always available): renders each
//     slide spec into a self-contained SVG string using this repo's
//     existing palette/type (CLAUDE.md). No external service, no
//     credential, no network access required.
//   - "external-provider": an optional adapter interface for a future
//     image-generation service. It is never invoked unless BOTH a
//     provider config is supplied AND policy has approved it — this
//     epic's exclusions forbid adding paid API credentials, so in this
//     repository providerConfig is always absent and this path always
//     reports "blocked", never guesses, and never pretends an asset
//     exists.

export const RENDERER_MODES = Object.freeze(['deterministic-template', 'external-provider']);

// Exported (additive — no existing behavior changes) so other
// deterministic-overlay renderers, e.g. scripts/openai-hybrid-renderer.mjs
// (issue #18), can stay visually consistent with this one without
// duplicating the palette or the escaping helper.
export const PALETTE = Object.freeze({
  cream: '#F6F1E8',
  surface: '#FFFDF8',
  ink: '#0B0B0B',
  muted: '#68645D',
  border: '#DDD3C3',
  accent: '#C8941E',
});

export function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Renders one slide spec deterministically as a 1080x1350 (4:5, the same
 * mobile-safe portrait ratio the existing carousels use) SVG string. No
 * randomness, no timestamp — the same slideSpec always produces the same
 * output, so this is safe to unit-test byte-for-byte.
 */
export function renderSlideDeterministic(slideSpec) {
  const { label = '', copy = '', order = 1 } = slideSpec;
  const width = 1080;
  const height = 1350;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="${PALETTE.cream}"/>`,
    `<rect x="48" y="48" width="${width - 96}" height="${height - 96}" fill="none" stroke="${PALETTE.border}" stroke-width="2"/>`,
    `<text x="88" y="140" font-family="Oswald, Impact, sans-serif" font-weight="700" font-size="28" fill="${PALETTE.accent}" letter-spacing="4">${escapeXml(
      String(order).padStart(2, '0')
    )}</text>`,
    `<text x="88" y="220" font-family="Oswald, Impact, sans-serif" font-weight="700" font-size="56" fill="${PALETTE.ink}">${escapeXml(label)}</text>`,
    `<foreignObject x="88" y="260" width="${width - 176}" height="${height - 360}">
      <div xmlns="http://www.w3.org/1999/xhtml" style="font-family:ui-sans-serif,system-ui,sans-serif;font-size:34px;line-height:1.5;color:${PALETTE.muted}">${escapeXml(
      copy
    )}</div>
    </foreignObject>`,
    '</svg>',
  ].join('');

  return {
    mode: 'deterministic-template',
    format: 'svg',
    status: 'rendered',
    content: svg,
  };
}

/**
 * Optional external image-generation adapter. Never invoked in this
 * repository today — `providerConfig` has nowhere to come from without
 * violating this epic's "do not add paid API credentials" exclusion —
 * but the interface exists so a future, explicitly-approved provider can
 * be wired in without changing any caller of `renderSlide`.
 */
export function renderSlideExternalProvider(slideSpec, providerConfig) {
  if (!providerConfig || !providerConfig.credentialsPresent) {
    return {
      mode: 'external-provider',
      format: null,
      status: 'blocked',
      reason: 'no external renderer credentials configured — see docs/AUTONOMOUS_GUIDE_FACTORY_V1.md §7',
      content: null,
    };
  }
  if (!providerConfig.policyApproved) {
    return {
      mode: 'external-provider',
      format: null,
      status: 'blocked',
      reason: 'external renderer credentials present but not policy-approved for autonomous use',
      content: null,
    };
  }
  throw new Error(
    'renderSlideExternalProvider: no external provider implementation is wired into this repository. ' +
      'Adding one requires a maintainer decision (credentials + policy approval) outside this change.'
  );
}

/**
 * Single entry point every caller should use. Dispatches on `mode` and
 * never throws for the unconfigured external-provider case — it always
 * returns a `status: 'blocked'` result instead, so the guide factory
 * pipeline can mark visual rendering as blocked and keep going with
 * complete slide *specifications* rather than pretending assets exist
 * (issue #17 section 7's explicit requirement).
 */
export function renderSlide(slideSpec, { mode = 'deterministic-template', providerConfig = null } = {}) {
  if (!RENDERER_MODES.includes(mode)) {
    throw new Error(`renderSlide: unknown mode "${mode}" — must be one of ${RENDERER_MODES.join(', ')}`);
  }
  if (mode === 'deterministic-template') return renderSlideDeterministic(slideSpec);
  return renderSlideExternalProvider(slideSpec, providerConfig);
}

export function renderSlides(slideSpecs, options) {
  return (slideSpecs || []).map((spec) => ({ slideOrder: spec.order, ...renderSlide(spec, options) }));
}
