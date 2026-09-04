# QuickEasy Software — website

Marketing & sales website for **QuickEasy Software SA (Pty) Ltd** (QuickEasy BOS ERP).
Being converted from a WordPress static mirror into clean, standard **HTML / CSS / JS**
(no WordPress, no plugins, no build framework).

## ⭐ Always use the `web-builder-skills` plugin

Before doing website work, **invoke the matching skill and follow its guide and
reference files** — don't work from memory. These carry the vetted, South-Africa-first
approach and worked examples for this exact site:

| Task | Skill to invoke |
|------|-----------------|
| Contact forms / relay/API wiring | `web-builder-skills:contact-form-integration` |
| Homepage / landing-page sales copy & structure | `web-builder-skills:website-sales-tool` |
| Technical or content SEO, sitemap, robots, structured data, IndexNow | `web-builder-skills:website-seo` |
| Website terms of use / privacy / cookies (ECTA, CPA, POPIA) | `web-builder-skills:terms-of-use-website` |
| Software / SaaS / custom-dev terms, IP, licensing, liability | `web-builder-skills:terms-of-use-software` |

Each skill points to a `references/*.md` file with the full template/checklist — read it.
Skills are **drafting aids, not legal advice**; flag attorney review for legal pages.

## House style (see also memory + README.md)

- **Follow the web-builder-skills style** — the clean, standard HTML/CSS/JS rebuild
  aesthetic these guides produce — **except** the QuickEasy **logo icon, which stays red/colour**.
  (This supersedes the old "match the WordPress/Beaver Builder look".)
- **Brand:** font `Open Sans`; accent red `#cb333b`; ink `#2d2926`; paper `#f4f3f1`.
- **Imagery:** grayscale (CSS `filter: grayscale(100%)`); the QuickEasy **logo stays red/colour**.
- **Blog posts:** the user does **not** want images in blog posts (not seen as SEO-valuable).
- **SEO first:** preserve existing rankings — keep URLs, titles, meta, headings; use 301
  redirects for anything moved/removed (logged in `*-REDIRECTS.txt`). Never rename a page
  folder without a redirect.

## Architecture (clean rebuild)

- `assets/css/site.css` — design system (tokens, header/nav, footer, sections, cards, forms).
- `assets/js/site.js` — vanilla nav + contact-form handler (per the contact-form skill).
- `assets/img/…` — brand/hero/client images (relocated off `wp-content`).
- Pages are plain HTML using these assets with **root-relative** paths (`/assets/…`, `/pricing/`).
- Contact form: recipient switches by hostname — live `quickeasysoftware.com` →
  `info@quickeasysoftware.com`; anywhere else (localhost/staging) → `info@vibecraftedsoftware.com`.
  Set `RELAY_URL` in `site.js` once the relay endpoint is provided.

## Conventions

- Folder path = live URL (static site served at domain root).
- Preview locally: `node <scratch>/serve.mjs "C:/Projects/Quickeasy Website"` → http://localhost:8099
- Legacy WordPress dirs (`wp-admin`, `wp-content/plugins`, `wp-includes`, `wp-json`,
  `xmlrpc.php`, feeds) are being removed — do not add new references to them.
- Commit messages end with the required `Co-Authored-By` trailer.
