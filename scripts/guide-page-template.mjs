// Reusable `.dc.html` guide-page template for the autonomous guide
// factory (issue #17, section 2's "generate the website guide page ...
// from reusable templates"). Pure string templating — no dependencies,
// no build step.
//
// The generated page is structurally identical to the existing
// hand-authored guide pages (guide-on-cloud-x4.dc.html,
// guide-nb9060.dc.html): it imports Site Nav/Site Footer via
// <dc-import>, reads its content from js/guides.js and js/products.js at
// runtime through the same DCLogic controller pattern, and computes
// every cross-page link (hero product page, related guides) from actual
// data instead of hardcoding it — see CLAUDE.md's "a page's guideHref
// must be computed from the actual data" rule. This template is the
// single place that pattern is authored; a new guide never needs a new
// hand-written page file.

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeJs(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * @param {object} params
 * @param {string} params.guideId - matches the `id` field the factory writes into js/guides.js
 * @param {string} params.heroProductId - product id whose hero page (if any) gets linked
 * @param {string} params.title
 * @param {string} params.description
 * @param {string} params.coverImage
 * @param {string} params.publishedDateIso - ISO date string for the JSON-LD `datePublished`
 * @param {string} params.breadcrumbLabel - short label for the breadcrumb trail
 */
export function renderGuidePageHtml({
  guideId,
  heroProductId,
  title,
  description,
  coverImage,
  publishedDateIso,
  breadcrumbLabel,
}) {
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeCover = escapeHtml(coverImage);
  const safeBreadcrumb = escapeHtml(breadcrumbLabel);
  const jsGuideId = escapeJs(guideId);
  const jsHeroProductId = escapeJs(heroProductId || '');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <title>${safeTitle} — WearWyzer</title>
  <meta name="description" content="${safeDescription}">
  <meta property="og:title" content="${safeTitle}">
  <meta property="og:description" content="${safeDescription}">
  <meta property="og:type" content="article">
  <meta property="og:image" content="${safeCover}">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" href="assets/favicon.png">
  <link rel="apple-touch-icon" href="apple-touch-icon.png">
  <link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&amp;display=swap" rel="stylesheet">
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"Article","headline":"${safeTitle}","description":"${safeDescription}","image":"${safeCover}","datePublished":"${escapeHtml(publishedDateIso || '')}","author":{"@type":"Organization","name":"WearWyzer"}}
  </script>
  <style>body { margin: 0; background: #F6F1E8; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }</style>
</helmet>

<div style="font-family:ui-sans-serif,system-ui,-apple-system,'Helvetica Neue',Arial,sans-serif;background:#F6F1E8;color:#0B0B0B;min-height:100vh">
  <a href="#main" style="position:absolute;left:-9999px;top:0;background:#0B0B0B;color:#F6F1E8;padding:12px 20px;z-index:200;text-decoration:none;font-size:14px" style-focus="left:16px;top:16px">Skip to content</a>
  <div style="position:sticky;top:0;z-index:100">
    <dc-import name="Site Nav" active="Style Guides" hint-size="100%,66px"></dc-import>
  </div>

  <main id="main">
    <nav aria-label="Breadcrumb" style="max-width:1200px;margin:0 auto;padding:18px 20px 0">
      <ol style="list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:8px;font-size:13px;color:#68645D">
        <li><a href="index.dc.html" style="color:#68645D;text-decoration:none" style-hover="color:#C8941E">Home</a> <span aria-hidden="true">/</span></li>
        <li><a href="guides.dc.html" style="color:#68645D;text-decoration:none" style-hover="color:#C8941E">Style Guides</a> <span aria-hidden="true">/</span></li>
        <li aria-current="page" style="color:#0B0B0B;font-weight:600">${safeBreadcrumb}</li>
      </ol>
    </nav>

    <section style="border-bottom:1px solid #DDD3C3">
      <div style="max-width:1200px;margin:0 auto;padding:clamp(32px,5vw,64px) 20px;display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:48px;align-items:center">
        <img src="{{ coverImage }}" alt="{{ coverAlt }}" width="1254" height="1254" style="width:min(100%,440px);height:auto;display:block;border:1px solid #DDD3C3;background:#F0EEE8;justify-self:center" loading="lazy">
        <div>
          <p style="font-size:12px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#C8941E;margin:0 0 14px">{{ heroMeta }}</p>
          <h1 style="font-family:'Oswald',Impact,sans-serif;font-weight:700;font-size:clamp(30px,4vw,48px);text-transform:uppercase;line-height:1.05;margin:0 0 12px;text-wrap:balance">{{ title }}</h1>
          <p style="font-size:17px;color:#68645D;margin:0 0 20px">{{ tagline }}</p>
          <div style="border-left:3px solid #C8941E;padding:4px 0 4px 18px;margin:0 0 28px">
            <p style="font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#68645D;margin:0 0 6px">The Verdict</p>
            <p style="font-size:15px;line-height:1.6;margin:0;max-width:480px">{{ verdict }}</p>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:12px">
            <a href="#shop-the-look" style="background:#0B0B0B;color:#F6F1E8;text-decoration:none;font-size:13px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;padding:15px 26px" style-hover="background:#C8941E;color:#0B0B0B">Shop the Look</a>
            <a href="#outfits" style="background:transparent;color:#0B0B0B;border:1px solid #0B0B0B;text-decoration:none;font-size:13px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;padding:14px 26px" style-hover="background:#FFFDF8">Shop the Outfits</a>
            <sc-if value="{{ hasHeroProductPage }}" hint-placeholder-val="{{ true }}">
              <a href="{{ heroProductPageHref }}" style="background:transparent;color:#0B0B0B;border:1px solid #0B0B0B;text-decoration:none;font-size:13px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;padding:14px 26px" style-hover="background:#FFFDF8">Full Product Profile</a>
            </sc-if>
            <a href="{{ instagramHref }}" rel="noopener" style="background:transparent;color:#68645D;border:1px solid #DDD3C3;text-decoration:none;font-size:13px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;padding:14px 26px" style-hover="border-color:#0B0B0B;color:#0B0B0B">{{ instagramLabel }}</a>
          </div>
        </div>
      </div>
    </section>

    <section aria-labelledby="carousel-heading" style="background:#FFFDF8;border-bottom:1px solid #DDD3C3">
      <div style="max-width:1200px;margin:0 auto;padding:clamp(40px,5vw,64px) 20px">
        <p style="font-size:12px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#C8941E;margin:0 0 12px">The Carousel</p>
        <h2 id="carousel-heading" style="font-family:'Oswald',Impact,sans-serif;font-weight:600;font-size:clamp(26px,3.5vw,40px);text-transform:uppercase;line-height:1.08;margin:0 0 8px">All {{ slideCount }} slides</h2>
        <p style="font-size:14px;color:#68645D;margin:0 0 28px">Swipe or scroll — same order as the Instagram post.</p>
        <div role="list" aria-label="Carousel slides" style="display:flex;gap:16px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:12px;-webkit-overflow-scrolling:touch">
          <sc-for list="{{ slides }}" as="s" hint-placeholder-count="7">
            <figure role="listitem" style="margin:0;flex:0 0 min(72vw,280px);scroll-snap-align:start">
              <img src="{{ s.src }}" alt="{{ s.alt }}" width="1080" height="1350" style="width:100%;height:auto;display:block;border:1px solid #DDD3C3;background:#F0EEE8" loading="lazy">
              <figcaption style="font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#68645D;margin-top:10px">{{ s.caption }}</figcaption>
            </figure>
          </sc-for>
        </div>
      </div>
    </section>

    <section id="outfits" aria-labelledby="outfits-heading" style="border-bottom:1px solid #DDD3C3">
      <div style="max-width:1200px;margin:0 auto;padding:clamp(40px,5vw,64px) 20px">
        <p style="font-size:12px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#C8941E;margin:0 0 12px">The Outfits</p>
        <h2 id="outfits-heading" style="font-family:'Oswald',Impact,sans-serif;font-weight:600;font-size:clamp(26px,3.5vw,40px);text-transform:uppercase;line-height:1.08;margin:0 0 36px">{{ outfitCount }} ways to wear it</h2>
        <div style="display:flex;flex-direction:column;gap:24px">
          <sc-for list="{{ outfits }}" as="o" hint-placeholder-count="4">
            <article style="border:1px solid #DDD3C3;background:#FFFDF8;padding:clamp(22px,3vw,36px);display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:28px">
              <div>
                <p style="font-family:'Oswald',Impact,sans-serif;font-weight:600;font-size:13px;letter-spacing:2px;color:#C8941E;margin:0 0 8px">{{ o.num }}</p>
                <h3 style="font-family:'Oswald',Impact,sans-serif;font-weight:600;font-size:26px;text-transform:uppercase;line-height:1.1;margin:0 0 10px">{{ o.name }}</h3>
                <p style="font-size:14px;color:#68645D;line-height:1.6;margin:0 0 16px"><strong style="color:#0B0B0B">When:</strong> {{ o.when }}</p>
                <p style="font-size:14px;color:#68645D;line-height:1.6;margin:0"><strong style="color:#0B0B0B">Why it works:</strong> {{ o.why }}</p>
              </div>
              <div>
                <p style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#68645D;margin:0 0 12px">The pieces</p>
                <ul style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px">
                  <sc-for list="{{ o.items }}" as="it" hint-placeholder-count="4">
                    <li style="display:flex;justify-content:space-between;align-items:center;gap:12px;border-bottom:1px solid #F0EEE8;padding-bottom:8px">
                      <span style="font-size:14px">{{ it.name }}</span>
                      <a href="{{ it.href }}" style="font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#C8941E;text-decoration:none;white-space:nowrap" style-hover="color:#0B0B0B">Shop ↓</a>
                    </li>
                  </sc-for>
                </ul>
              </div>
            </article>
          </sc-for>
        </div>
      </div>
    </section>

    <section id="shop-the-look" aria-labelledby="shop-heading" style="background:#FFFDF8;border-bottom:1px solid #DDD3C3">
      <div style="max-width:1200px;margin:0 auto;padding:clamp(40px,5vw,64px) 20px">
        <p style="font-size:12px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#C8941E;margin:0 0 12px">Shop the Look</p>
        <h2 id="shop-heading" style="font-family:'Oswald',Impact,sans-serif;font-weight:600;font-size:clamp(26px,3.5vw,40px);text-transform:uppercase;line-height:1.08;margin:0 0 10px">Every piece in this guide</h2>
        <p style="font-size:13px;color:#68645D;margin:0 0 32px;max-width:560px">{{ disclosure }}</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:24px">
          <sc-for list="{{ shopProducts }}" as="p" hint-placeholder-count="8">
            <article id="{{ p.anchorId }}" style="border:1px solid #DDD3C3;background:#F6F1E8;display:flex;flex-direction:column" style-hover="border-color:#C8941E">
              <div style="position:relative">
                <img src="{{ p.image }}" alt="{{ p.alt }}" width="1200" height="1200" style="width:100%;height:auto;display:block;background:#F0EEE8" loading="lazy">
                <span style="{{ p.badgeStyle }}">{{ p.exactOrSimilar }}</span>
              </div>
              <div style="padding:16px;display:flex;flex-direction:column;gap:4px;flex:1">
                <p style="font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#68645D;margin:0">{{ p.brandLine }}</p>
                <h3 style="font-size:15px;font-weight:700;margin:0;line-height:1.3">{{ p.name }}</h3>
                <p style="font-size:13px;color:#68645D;margin:0">{{ p.priceLine }}</p>
                <div style="margin-top:auto;padding-top:12px">
                  <a href="{{ p.shopHref }}" rel="{{ p.rel }}" aria-disabled="{{ p.disabled }}" style="{{ p.ctaStyle }}">{{ p.ctaLabel }}</a>
                </div>
              </div>
            </article>
          </sc-for>
        </div>
      </div>
    </section>

    <section aria-labelledby="related-heading">
      <div style="max-width:1200px;margin:0 auto;padding:clamp(40px,5vw,64px) 20px">
        <p style="font-size:12px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#C8941E;margin:0 0 12px">Keep Going</p>
        <h2 id="related-heading" style="font-family:'Oswald',Impact,sans-serif;font-weight:600;font-size:clamp(26px,3.5vw,40px);text-transform:uppercase;line-height:1.08;margin:0 0 32px">Related guides</h2>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:24px">
          <sc-for list="{{ related }}" as="r" hint-placeholder-count="1">
            <article style="border:1px solid #DDD3C3;background:#FFFDF8" style-hover="border-color:#C8941E">
              <a href="{{ r.slug }}" style="text-decoration:none;color:#0B0B0B;display:block">
                <img src="{{ r.coverImage }}" alt="{{ r.title }} — guide cover" width="1254" height="1254" style="width:100%;height:auto;display:block;background:#F0EEE8" loading="lazy">
                <div style="padding:18px">
                  <p style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#C8941E;margin:0 0 6px">{{ r.category }}</p>
                  <h3 style="font-family:'Oswald',Impact,sans-serif;font-weight:600;font-size:18px;text-transform:uppercase;margin:0 0 6px">{{ r.title }}</h3>
                  <p style="font-size:13px;color:#68645D;margin:0">{{ r.description }}</p>
                </div>
              </a>
            </article>
          </sc-for>
        </div>
      </div>
    </section>
  </main>

  <dc-import name="Site Footer" hint-size="100%,380px"></dc-import>
</div>
</x-dc>
<script type="text/x-dc" data-dc-script>
// Autonomously generated guide page — scripts/guide-page-template.mjs.
// Do not hand-edit the GUIDE_ID/HERO_PRODUCT_ID below without also
// updating the matching entry in js/guides.js; see
// docs/AUTONOMOUS_GUIDE_FACTORY_V1.md.
const GUIDE_ID = '${jsGuideId}';
const HERO_PRODUCT_ID = '${jsHeroProductId}';

class Component extends DCLogic {
  state = { guide: null, products: [], related: [], heroProductPageHref: null };

  async componentDidMount() {
    const [gm, pm, hm] = await Promise.all([import('./js/guides.js'), import('./js/products.js'), import('./js/hero-pages.js')]);
    const guide = gm.guides.find(g => g.id === GUIDE_ID) || null;
    this.setState({
      guide,
      products: pm.products,
      related: gm.guides.filter(g => g.id !== GUIDE_ID && !g.comingSoon).slice(0, 2),
      heroProductPageHref: HERO_PRODUCT_ID ? hm.getHeroProductPageHref(HERO_PRODUCT_ID) : null,
    });
  }

  renderVals() {
    const g = this.state.guide;
    const products = this.state.products;
    const byId = Object.fromEntries(products.map(p => [p.id, p]));

    const shopProducts = (g ? g.relatedProducts : []).map(id => byId[id]).filter(Boolean).map(p => {
      const exact = p.exactOrSimilar === 'Exact item';
      const hasLink = !!p.affiliateUrl;
      return {
        anchorId: 'product-' + p.id,
        image: p.image,
        alt: p.name + (p.colorway ? ' in ' + p.colorway : ''),
        exactOrSimilar: p.exactOrSimilar,
        badgeStyle: {
          position: 'absolute', top: '10px', left: '10px', fontSize: '10px', fontWeight: 700,
          letterSpacing: '1.5px', textTransform: 'uppercase', padding: '5px 10px',
          background: exact ? '#0B0B0B' : '#FFFDF8',
          color: exact ? '#F6F1E8' : '#68645D',
          border: exact ? 'none' : '1px solid #DDD3C3',
        },
        brandLine: (p.brand || 'Any brand') + ' · ' + p.category,
        name: p.name,
        priceLine: p.price != null ? '$' + p.price + (p.retailer ? ' · ' + p.retailer : '')
          : 'Price TBD' + (p.retailer ? ' · ' + p.retailer : ''),
        shopHref: hasLink ? p.affiliateUrl : 'shop.dc.html',
        rel: hasLink ? 'sponsored noopener' : undefined,
        disabled: hasLink ? 'false' : 'true',
        ctaLabel: hasLink ? 'Shop →' : 'Link coming soon',
        ctaStyle: {
          display: 'inline-block', fontSize: '12px', fontWeight: 700, letterSpacing: '1.5px',
          textTransform: 'uppercase', textDecoration: 'none', padding: '11px 18px',
          background: hasLink ? '#0B0B0B' : 'transparent',
          color: hasLink ? '#F6F1E8' : '#68645D',
          border: hasLink ? 'none' : '1px solid #DDD3C3',
        },
      };
    });

    return {
      title: g ? g.title : '${safeTitle}',
      heroMeta: g ? [g.category, g.brand, g.colorway].filter(Boolean).join(' · ') : '',
      tagline: g ? g.description : '${safeDescription}',
      verdict: g ? g.verdict : '',
      coverImage: g ? g.coverImage : '${safeCover}',
      coverAlt: 'Guide cover: ' + (g ? g.title : '${safeTitle}'),
      instagramHref: g && g.instagramUrl ? g.instagramUrl : '#',
      instagramLabel: g && g.instagramUrl ? 'View Instagram Post' : 'Instagram Post Soon',
      hasHeroProductPage: !!this.state.heroProductPageHref,
      heroProductPageHref: this.state.heroProductPageHref || undefined,
      slideCount: g ? g.slideImages.length : 0,
      slides: (g ? g.slideImages : []).map((s, i) => ({
        src: s.src,
        alt: 'Slide ' + (i + 1) + ': ' + s.label,
        caption: (i + 1 < 10 ? '0' : '') + (i + 1) + ' — ' + s.label,
      })),
      outfitCount: g ? g.outfits.length : 0,
      outfits: (g ? g.outfits : []).map((o, i) => ({
        num: 'Outfit 0' + (i + 1),
        name: o.name,
        when: o.when,
        why: o.why,
        items: o.items.map(it => ({ name: it.name, href: it.productId ? '#product-' + it.productId : '#shop-the-look' })),
      })),
      shopProducts,
      related: this.state.related.map(r => ({
        slug: r.slug, coverImage: r.coverImage, category: r.category, title: r.title, description: r.description,
      })),
      disclosure: 'Some links may be affiliate links. We only recommend items that fit the outfit. Prices shown reflect confirmed prices at time of publishing and may change.',
    };
  }
}
</script>
</body>
</html>
`;
}
