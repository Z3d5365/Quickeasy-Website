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

const enNavPages = navPages.filter((p) => !p.rel.startsWith('th/'));

test('B2 nav has Support submenu + All Blogs', () =>
  enNavPages.filter((p) => !(p.html.includes('>Documentation<') && p.html.includes('>Customer Service<') && p.html.includes('>All Blogs<')))
          .map((p) => 'incomplete new nav in ' + p.rel));

test('B3 footer present, Explore has Support and not Blog', () =>
  enNavPages.flatMap((p) => {
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
  if (!/data-zar="790"/.test(p.html)) errs.push('BOS License base price missing');
  for (const gone of ['ZAR17.83', 'pricing cycle', 'Average Rate of Exchange', 'class="clients"']) {
    if (p.html.includes(gone)) errs.push('stale content: ' + gone);
  }
  return errs;
});

test('F4 documentation page', () => {
  const d = get('documentation/index.html');
  if (!d) return ['documentation/index.html missing'];
  const errs = [];
  if (count(d.html, /class="doc-(mark|media)"/g) !== 3) errs.push('expected 3 edition cards (doc-mark/doc-media)');
  if (!d.html.includes('/implementation-methodology/')) errs.push('no Implementation Methodology link');
  for (const img of ['/assets/img/bos-pro.png', '/assets/img/bos-enterprise.png'])
    if (!d.html.includes(img)) errs.push('missing edition image: ' + img);
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
   H. Pricing currency math (mirrors main.js: USD=zar*0.056, THB=zar*1.90,
   except a plan carrying a published data-usd override, which shows that
   fixed price instead of the computed conversion)
   ========================================================================= */
test('H pricing conversions round correctly', () => {
  const js = read(path.join(ROOT, 'assets/js/main.js'));
  const usdRate = parseFloat((js.match(/USD:\s*\{\s*rate:\s*([\d.]+)/) || [])[1]);
  const thbRate = parseFloat((js.match(/THB:\s*\{\s*rate:\s*([\d.]+)/) || [])[1]);
  const errs = [];
  if (usdRate !== 0.056) errs.push('USD rate changed: ' + usdRate);
  if (thbRate !== 1.90) errs.push('THB rate changed: ' + thbRate);
  // Expected THB (always rate-derived — no THB overrides published) and USD
  // (rate-derived unless a data-usd override applies) for every ZAR base.
  const expect = [
    [790, 49, 1501], [1185, 74, 2252], [499, 28, 948],
    [927, 55, 1761], [1480, 83, 2812], [2746, 154, 5217],
    [5153, 289, 9791], [89, 5, 169],
  ];
  const overrides = { 790: 49, 1185: 74, 927: 55 };
  const html = read(path.join(ROOT, 'pricing/index.html'));
  for (const [zar, usd, thb] of expect) {
    const gotThb = Math.round(zar * thbRate);
    if (gotThb !== thb) errs.push(`R${zar} -> THB ${gotThb}, expected ${thb}`);
    if (overrides[zar] !== undefined) {
      const re = new RegExp(`data-zar="${zar}" data-usd="${overrides[zar]}"`);
      if (!re.test(html)) errs.push(`pricing/index.html missing data-usd override for R${zar}`);
    } else {
      const gotUsd = Math.round(zar * usdRate);
      if (gotUsd !== usd) errs.push(`R${zar} -> USD ${gotUsd}, expected ${usd}`);
    }
  }
  return errs;
});

/* =========================================================================
   I. SEO migration (robots, sitemap, canonicals, JSON-LD, redirect map)
   ========================================================================= */
const indexPages = pages.filter((p) => p.rel.endsWith('index.html'));
const pageUrl = (r) => '/' + r.replace(/index\.html$/, ''); // 'blog/index.html' -> '/blog/'
const canonPath = (html) => {
  const m = html.match(/<link rel="canonical" href="https:\/\/quickeasysoftware\.com([^"]*)"/);
  return m ? m[1] : null;
};

test('I1 robots.txt: present, points to sitemap, no Disallow', () => {
  const f = path.join(ROOT, 'robots.txt');
  if (!fs.existsSync(f)) return ['robots.txt missing'];
  const t = read(f); const errs = [];
  if (!/Sitemap:\s*https:\/\/quickeasysoftware\.com\/sitemap\.xml/.test(t)) errs.push('no sitemap directive');
  if (/Disallow:\s*\//.test(t)) errs.push('robots.txt contains a Disallow rule (must be open in production)');
  return errs;
});

test('I2 sitemap.xml: valid, complete, no redirect sources', () => {
  const f = path.join(ROOT, 'sitemap.xml');
  if (!fs.existsSync(f)) return ['sitemap.xml missing'];
  const xml = read(f); const errs = [];
  const locs = [...xml.matchAll(/<loc>https:\/\/quickeasysoftware\.com([^<]*)<\/loc>/g)].map((m) => m[1]);
  // redirect sources across all three logs must never appear
  const sources = new Set();
  for (const rf of ['SITE-REDIRECTS.txt', 'BLOG-REDIRECTS.txt', 'LEGAL-REDIRECTS.txt']) {
    const p = path.join(ROOT, rf); if (!fs.existsSync(p)) continue;
    for (const line of read(p).split(/\r?\n/)) {
      const m = line.replace(/#.*/, '').match(/^\s*(\/\S+)\s*->/); if (m) sources.add(m[1]);
    }
  }
  for (const l of locs) { if (!resolves(l)) errs.push('sitemap loc does not resolve: ' + l);
    if (sources.has(l)) errs.push('sitemap lists a redirect source: ' + l); }
  const want = new Set(indexPages.map((p) => pageUrl(p.rel)));
  if (locs.length !== want.size) errs.push(`sitemap has ${locs.length} locs, ${want.size} live pages`);
  for (const u of want) if (!locs.includes(u)) errs.push('live page missing from sitemap: ' + u);
  return errs;
});

test('I3 every page canonical present + self-referencing', () =>
  indexPages.flatMap((p) => {
    const c = canonPath(p.html);
    if (c === null) return ['no quickeasysoftware.com canonical: ' + p.rel];
    return c === pageUrl(p.rel) ? [] : [`canonical ${c} != ${pageUrl(p.rel)} (${p.rel})`];
  }));

test('I4 formerly-syndicated posts now canonical to local', () => {
  const posts = [
    '2023/05/29/is-quickeasy-bos-the-most-comprehensive-erp-solution/index.html',
    '2024/09/17/the-astonishing-benefits-of-cloud-based-erp/index.html',
    '2025/01/06/business-owners-take-the-break-you-deserve/index.html',
    '2025/02/21/how-to-master-multi-level-boms/index.html',
  ];
  return posts.flatMap((r) => {
    const p = get(r); if (!p) return ['missing: ' + r];
    if (/rel="canonical"[^>]*(bizcommunity|itweb)/.test(p.html)) return ['off-site canonical still set: ' + r];
    return canonPath(p.html) === pageUrl(r) ? [] : ['canonical not self-referencing: ' + r];
  });
});

test('I5 JSON-LD valid; Organization/BlogPosting/BreadcrumbList where expected', () =>
  indexPages.flatMap((p) => {
    const m = p.html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (!m) return ['no JSON-LD: ' + p.rel];
    let graph;
    try { graph = JSON.parse(m[1])['@graph']; } catch (e) { return ['invalid JSON-LD: ' + p.rel + ' (' + e.message + ')']; }
    if (!Array.isArray(graph)) return ['JSON-LD @graph not array: ' + p.rel];
    const types = graph.map((n) => n['@type']);
    const url = pageUrl(p.rel); const errs = [];
    if (!types.includes('Organization')) errs.push('no Organization: ' + p.rel);
    if (url === '/' && !types.includes('WebSite')) errs.push('home missing WebSite');
    if (url !== '/' && !types.includes('BreadcrumbList')) errs.push('no BreadcrumbList: ' + p.rel);
    if (/^\/20\d\d\/\d\d\/\d\d\/[^/]+\/$/.test(url) && !types.includes('BlogPosting')) errs.push('post missing BlogPosting: ' + p.rel);
    return errs;
  }));

test('I6 consolidated redirect map: no chains, no dup sources', () => {
  const f = path.join(ROOT, 'seo/redirect-map.csv');
  if (!fs.existsSync(f)) return ['seo/redirect-map.csv missing'];
  const rows = read(f).trim().split(/\r?\n/).slice(1).map((l) => l.split(','));
  const errs = []; const sources = new Set(); const seen = new Set();
  for (const [o] of rows) { if (seen.has(o)) errs.push('duplicate source: ' + o); seen.add(o); sources.add(o); }
  for (const [o, n] of rows) if (sources.has(n)) errs.push(`chained redirect: ${o} -> ${n} (target is itself a source)`);
  return errs;
});

/* =========================================================================
   J. Light / dark theme
   ========================================================================= */
test('J1 every nav page has a theme toggle', () =>
  navPages.filter((p) => !p.html.includes('class="theme-toggle"'))
          .map((p) => 'no theme toggle: ' + p.rel));

test('J2 every page has the theme-init script before main.css', () =>
  indexPages.flatMap((p) => {
    const s = p.html.indexOf("localStorage.getItem('theme')");
    const c = p.html.indexOf('/assets/css/main.css');
    if (s === -1) return ['no theme-init script: ' + p.rel];
    if (c === -1 || s > c) return ['init script not before main.css: ' + p.rel];
    return [];
  }));

test('J3 main.css defines dark tokens, media fallback and .theme-toggle', () => {
  const css = read(path.join(ROOT, 'assets/css/main.css'));
  return ['[data-theme="dark"]', '@media (prefers-color-scheme:dark)', '.theme-toggle', '--bg:']
    .filter((s) => !css.includes(s)).map((s) => 'missing in main.css: ' + s);
});

test('J4 main.js has the theme toggle handler', () => {
  const js = read(path.join(ROOT, 'assets/js/main.js'));
  return ['theme-toggle', 'data-theme', "localStorage.setItem(\"theme\""]
    .filter((k) => !js.includes(k)).map((k) => 'missing in main.js: ' + k);
});

/* =========================================================================
   K. Thai (i18n) pages
   ========================================================================= */
const thPages = indexPages.filter((p) => p.rel === 'th/index.html' || p.rel.startsWith('th/'));

test('K1 Thai pages declare lang="th" and a Thai title', () =>
  thPages.flatMap((p) => {
    const errs = [];
    if (!/<html[^>]*\blang="th"/.test(p.html)) errs.push('lang!=th: ' + p.rel);
    if (!/[฀-๿]/.test(p.html)) errs.push('no Thai text: ' + p.rel);
    return errs;
  }));

test('K2 Thai pages link back to English (lang-toggle)', () =>
  thPages.filter((p) => {
    const m = p.html.replace(/\n/g, ' ').match(/class="lang-toggle"[^>]*href="([^"]*)"[^>]*hreflang="en"/);
    return !m || m[1].startsWith('/th/'); // must point at a non-Thai (English) URL
  }).map((p) => 'no EN lang-toggle: ' + p.rel));

test('K3 Thai + paired EN pages carry hreflang alternates', () => {
  const errs = [];
  for (const p of [...thPages, get('index.html')]) {
    if (!p) continue;
    if (!p.html.includes('hreflang="en"') || !p.html.includes('hreflang="th"'))
      errs.push('missing hreflang pair: ' + p.rel);
  }
  return errs;
});

test('K4 EN home has a Thai language switcher', () => {
  const h = get('index.html');
  return h && /class="lang-toggle"[^>]*href="\/th\/"/.test(h.html) ? [] : ['EN home missing ไทย switcher'];
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
