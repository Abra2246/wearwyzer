# WEARWYZER — Site Handbook

"You bought it. Now wear it wyzer."

**What this is today:** a static, front-end content site and affiliate storefront prototype — no backend, no database, no accounts. See `ENGINEERING_AUDIT.md` for a full audit, `ARCHITECTURE.md` for the incremental plan toward a real platform, and `ROADMAP.md` for milestone sequencing. This file stays focused on day-to-day content editing and deployment.

## File map
- `index.dc.html` — Home (announcement bar text is editable via Tweaks or `js/site-data.js`)
- `guides.dc.html` — searchable/filterable guide library
- `guide-on-cloud-x4.dc.html` — reusable guide detail template (Post #1)
- `shop.dc.html` — affiliate storefront (search + category/occasion/price/match filters)
- `products.dc.html` — featured product profiles
- `about.dc.html`, `contact.dc.html`
- `affiliate-disclosure.dc.html`, `privacy.dc.html`, `terms.dc.html`, `404.dc.html`
- `Site Nav.dc.html` / `Site Footer.dc.html` — shared header/footer components
- `js/site-data.js`, `js/guides.js`, `js/products.js` — ALL content lives here
- `robots.txt`, `sitemap.xml`
- `assets/images/…` — placeholder images (labeled "PLACEHOLDER — REPLACE")

## Adding a new Instagram post / style guide
1. Duplicate the first object in `js/guides.js`; update every field (id, title, slug, outfits, tags…).
2. Drop slide images in `assets/images/guides/<id>/` and a cover image.
3. Duplicate `guide-on-cloud-x4.dc.html`, rename to match `slug`, change the
   `GUIDE_ID` constant at the top of its logic, and update the `<helmet>` title/meta.
4. Add the page to `sitemap.xml`.
The library, home "latest" section, and related-guides cards read from `js/guides.js`.

## Adding affiliate links
In `js/products.js`, set `affiliateUrl` (and `retailer`) on the product.
Cards automatically switch from "Link coming soon" to a live "Shop →" button
with `rel="sponsored noopener"`.

## Updating prices / availability
In `js/products.js`: set `price` (number), `priceStatus: "confirmed"`, and
`lastChecked` (date string). Until then the UI honestly shows "Price TBD".

## Assets you still need to add
- Real product + carousel slide photography (replace every PLACEHOLDER image; webp recommended)
- Real Instagram profile URL + post URLs (`js/site-data.js`, `js/guides.js`)
- Real contact email (`js/site-data.js`)
- Affiliate links + retailers + confirmed prices (`js/products.js`)
- Legal entity name + dates in `privacy` / `terms` / `affiliate-disclosure` ([BRACKETED] placeholders)
- Email provider for the newsletter form; form backend (Formspree / Netlify Forms) for contact
- Real domain in `robots.txt` + `sitemap.xml`

## Deployment (after exporting to static HTML)
- **Netlify:** drag the folder into app.netlify.com, or `netlify deploy --prod`. Add a `_redirects` file with `/* /404.html 404` for the 404 page. Contact form can use Netlify Forms (add `data-netlify="true"`).
- **Vercel:** `vercel --prod` from the folder. 404 works automatically if the file is named `404.html`.
- **GitHub Pages:** push to a repo, enable Pages on the main branch. `404.html` at the root is picked up automatically.

## Repository status
Not yet pushed to GitHub — GitHub isn't connected to this project. Once connected, a repo named `wearwyzer-platform` (per current engineering direction) can be created and this codebase pushed to `main`.
