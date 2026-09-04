/* =========================================================================
   QuickEasy Software — static site test suite
   Dependency-free. Run with:  node test/site-check.mjs   (or: npm test)
   Exits non-zero if any check fails, so it can gate a deploy/CI.
   ========================================================================= */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ---------- tiny test harness ---------- */
const results = [];
function test(name, fn) {
  let errors = [];
  try {
    const r = fn();
    if (Array.isArray(r)) errors = r.filter(Boolean);
  } catch (e) {
    errors = ['threw: ' + (e && e.message ? e.message : String(e))];
  }
  results.push({ name, errors });
}

/* ---------- helpers ---------- */
function walk(dir) {
  let out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walk(full));
    else if (e.name.endsWith('.html')) out.push(full);
  }
  return out;
}
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
const read = (f) => fs.readFileSync(f, 'utf8');
const count = (s, re) => (s.match(re) || []).length;

// Does a root-relative URL resolve to a real file or folder/index.html?
function resolves(urlPath) {
  let p = urlPath.split('#')[0].split('?')[0];
  if (p === '' || p === '/') return fs.existsSync(path.join(ROOT, 'index.html'));
  const fsPath = path.join(ROOT, p.replace(/^\//, ''));
  if (fs.existsSync(fsPath) && fs.statSync(fsPath).isFile()) return true;
  if (fs.existsSync(path.join(fsPath, 'index.html'))) return true;
  if (fs.existsSync(fsPath.replace(/\/$/, '') + '.html')) return true;
  return false;
}

const files = walk(ROOT);
const pages = files.map((f) => ({ f, rel: rel(f), html: read(f) }));
const navPages = pages.filter((p) => p.html.includes('id="site-nav"'));
const blogPosts = pages.filter((p) => /^20\d\d\/\d\d\/\d\d\//.test(p.rel));
const get = (r) => pages.find((p) => p.rel === r);

/* =========================================================================
   A. Global hygiene
   ========================================================================= */
test('A1 no WordPress/CMS fingerprints', () =>
  pages.filter((p) => /wp-content|wp-includes|wp-json|wp-emoji|elementor-|name="generator"/.test(p.html))
       .map((p) => 'fingerprint in ' + p.rel));

test('A2 no legacy site.css / site.js references', () =>
  pages.filter((p) => /\/assets\/(css\/site\.css|js\/site\.js)/.test(p.html))
       .map((p) => 'old asset ref in ' + p.rel));

test('A3 stylesheet pages use main.css', () =>
  pages.filter((p) => p.html.includes('rel="stylesheet"') && !p.html.includes('/assets/css/main.css'))
       .map((p) => 'no main.css in ' + p.rel));

test('A4 every page has lang, <title> and viewport', () =>
  pages.flatMap((p) => {
    const errs = [];
    if (!/<html[^>]*\blang=/.test(p.html)) errs.push('missing lang: ' + p.rel);
    if (!/<title>[^<]+<\/title>/.test(p.html)) errs.push('missing title: ' + p.rel);
    if (!/name="viewport"/.test(p.html)) errs.push('missing viewport: ' + p.rel);
    return errs;
  }));

/* =========================================================================
   B. Navigation & footer consistency (pages that carry the nav)
   ========================================================================= */
test('B0 nav pages exist', () => (navPages.length > 0 ? [] : ['no pages contain id="site-nav"']));

test('B1 no removed menus (Products / Resources)', () =>
  navPages.filter((p) => />Products<|>Resources<|>All articles</.test(p.html))
          .map((p) => 'stale menu item in ' + p.rel));

test('B2 nav has Support submenu + All Blogs', () =>
  navPages.filter((p) => !(p.html.includes('>Documentation<') && p.html.includes('>Customer Service<') && p.html.includes('>All Blogs<')))
          .map((p) => 'incomplete new nav in ' + p.rel));

test('B3 footer present, Explore has Support and not Blog', () =>
  navPages.flatMap((p) => {
    const errs = [];
    if (!p.html.includes('site-footer')) errs.push('no footer: ' + p.rel);
    if (!p.html.includes('<li><a href="/support/">Support</a></li>')) errs.push('no footer Support: ' + p.rel);
    if (p.html.includes('<li><a href="/blog/">Blog</a></li>')) errs.push('footer still has Blog: ' + p.rel);
    return errs;
  }));

/* =========================================================================
   C. Link integrity
   ========================================================================= */
test('C1 all internal links resolve', () => {
  const bad = [];
  for (const p of pages) {
    const re = /href="(\/[^"]*)"/g; let m;
    while ((m = re.exec(p.html))) {
      const href = m[1];
      if (href.startsWith('//') || href.startsWith('/assets/')) continue;
      if (!resolves(href)) bad.push(`${href} <- ${p.rel}`);
    }
  }
  return bad;
});

test('C2 referenced /assets files exist', () => {
  const bad = new Set();
  for (const p of pages) {
    const re = /(?:src|href)="(\/assets\/[^"]+)"/g; let m;
    while ((m = re.exec(p.html))) {
      const a = m[1].split('#')[0].split('?')[0];
      if (!fs.existsSync(path.join(ROOT, a.replace(/^\//, '')))) bad.add(a);
    }
  }
  return [...bad];
});

/* =========================================================================
   D. Redirects (SITE-REDIRECTS.txt)
   ========================================================================= */
test('D SITE-REDIRECTS: old paths gone, new targets resolve', () => {
  const file = path.join(ROOT, 'SITE-REDIRECTS.txt');
  if (!fs.existsSync(file)) return ['SITE-REDIRECTS.txt missing'];
  const errs = [];
  for (const line of read(file).split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const m = t.match(/^(\/\S+)\s*->\s*(\/\S+)/);
    if (!m) continue;
    const [, oldp, newp] = m;
    if (resolves(oldp)) errs.push('removed page still present: ' + oldp);
    if (!resolves(newp)) errs.push('redirect target missing: ' + newp + ' (from ' + oldp + ')');
  }
  return errs;
});

/* =========================================================================
   E. Blog
   ========================================================================= */
test('E1 all blog posts link "Back to all Blogs"', () =>
  blogPosts.flatMap((p) => {
    const errs = [];
    if (p.html.includes('Back to all articles')) errs.push('stale back-link: ' + p.rel);
    if (!p.html.includes('Back to all Blogs')) errs.push('missing back-link: ' + p.rel);
    return errs;
  }));

test('E2 blog listing uses redesigned post-list', () => {
  const b = get('blog/index.html');
  if (!b) return ['blog/index.html missing'];
  const errs = [];
  if (!b.html.includes('class="post-list"')) errs.push('no .post-list');
  const n = count(b.html, /post-list__title/g);
  if (n < 100) errs.push('too few post rows: ' + n);
  return errs;
});

/* =========================================================================
   F. Page-specific content
   ========================================================================= */
test('F1 homepage', () => {
  const h = get('index.html');
  if (!h) return ['index.html missing'];
  const errs = [];
  if (!h.html.includes('class="hero-mock"')) errs.push('no hero mock');
  if (count(h.html, /class="vertical"/g) !== 6) errs.push('expected 6 verticals');
  if (count(h.html, /class="card mod-card"/g) !== 10) errs.push('expected 10 module cards');
  if (!/>Global</.test(h.html)) errs.push('missing "Global" tile');
  if (h.html.includes('SARS')) errs.push('SARS still present');
  if (h.html.includes('South African software company')) errs.push('"South African software company" still present');
  return errs;
});

test('F2 apps hero uses the shared mock', () => {
  const a = get('apps/index.html');
  if (!a) return ['apps/index.html missing'];
  return a.html.includes('class="hero-mock"') ? [] : ['apps hero not using hero-mock'];
});

test('F3 pricing redesign', () => {
  const p = get('pricing/index.html');
  if (!p) return ['pricing/index.html missing'];
  const errs = [];
  if (!p.html.includes('class="currency-toggle"')) errs.push('no currency toggle');
  if (count(p.html, /data-cur="(ZAR|USD|THB)"/g) !== 3) errs.push('expected 3 currency buttons');
  if (count(p.html, /class="price-card/g) < 3) errs.push('expected >=3 price cards');
  if (!/data-zar="820"/.test(p.html)) errs.push('BOS License base price missing');
  for (const gone of ['ZAR17.83', 'pricing cycle', 'Average Rate of Exchange', 'class="clients"']) {
    if (p.html.includes(gone)) errs.push('stale content: ' + gone);
  }
  return errs;
});

test('F4 documentation page', () => {
  const d = get('documentation/index.html');
  if (!d) return ['documentation/index.html missing'];
  const errs = [];
  if (count(d.html, /class="doc-mark"/g) !== 3) errs.push('expected 3 product wordmarks');
  if (!d.html.includes('/implementation-methodology/')) errs.push('no Implementation Methodology link');
  return errs;
});

test('F5 customer service page', () => {
  const s = get('support/index.html');
  if (!s) return ['support/index.html missing'];
  const errs = [];
  if (!/<title>Customer Service/.test(s.html)) errs.push('title not "Customer Service"');
  if (!s.html.includes('class="contact-form"')) errs.push('no support form');
  return errs;
});

/* =========================================================================
   G. Design system assets
   ========================================================================= */
test('G1 main.css has the new components', () => {
  const css = read(path.join(ROOT, 'assets/css/main.css'));
  return ['.verticals', '.mod-card', '.price-card', '.currency-toggle', '.post-list', '.doc-mark', '.hero-mock']
    .filter((sel) => !css.includes(sel)).map((sel) => 'missing CSS: ' + sel);
});

test('G2 main.js has nav, contact form and currency toggle', () => {
  const js = read(path.join(ROOT, 'assets/js/main.js'));
  return ['nav-toggle', 'contact-form', 'renderPrices', 'currency-toggle__btn']
    .filter((k) => !js.includes(k)).map((k) => 'missing JS: ' + k);
});

/* =========================================================================
   H. Pricing currency math (mirrors main.js: USD=zar*0.056, THB=zar*1.90)
   ========================================================================= */
test('H pricing conversions round correctly', () => {
  const js = read(path.join(ROOT, 'assets/js/main.js'));
  const usdRate = parseFloat((js.match(/USD:\s*\{\s*rate:\s*([\d.]+)/) || [])[1]);
  const thbRate = parseFloat((js.match(/THB:\s*\{\s*rate:\s*([\d.]+)/) || [])[1]);
  const errs = [];
  if (usdRate !== 0.056) errs.push('USD rate changed: ' + usdRate);
  if (thbRate !== 1.90) errs.push('THB rate changed: ' + thbRate);
  // Expected rounded values for the published ZAR bases.
  const expect = [
    [820, 46, 1558], [1230, 69, 2337], [499, 28, 948],
    [927, 52, 1761], [1480, 83, 2812], [2746, 154, 5217],
    [5153, 289, 9791], [89, 5, 169],
  ];
  for (const [zar, usd, thb] of expect) {
    const gotUsd = Math.round(zar * usdRate), gotThb = Math.round(zar * thbRate);
    if (gotUsd !== usd) errs.push(`R${zar} -> USD ${gotUsd}, expected ${usd}`);
    if (gotThb !== thb) errs.push(`R${zar} -> THB ${gotThb}, expected ${thb}`);
  }
  return errs;
});

/* =========================================================================
   Report
   ========================================================================= */
let passed = 0, failed = 0;
for (const r of results) {
  if (r.errors.length === 0) { passed++; console.log('  ✓ ' + r.name); }
  else {
    failed++;
    console.log('  ✗ ' + r.name);
    for (const e of r.errors.slice(0, 12)) console.log('      - ' + e);
    if (r.errors.length > 12) console.log(`      … and ${r.errors.length - 12} more`);
  }
}
console.log(`\n${passed} passed, ${failed} failed  (${pages.length} pages, ${blogPosts.length} blog posts checked)`);
process.exit(failed ? 1 : 0);
