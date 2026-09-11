/* =========================================================================
   Crawl every URL the live WordPress site has indexed against a target host,
   and assert each one lands on a real page in at most one hop.

     node infra/crawl-check.mjs https://qes-stage.vibecraftedsoftware.com
     node infra/crawl-check.mjs https://quickeasysoftware.com     (after cutover)

   Source of truth is the live Yoast sitemaps, cached next to this script on
   first run. website-seo Part 7 is explicit that a spot-check is not enough:
   one uncovered high-traffic URL can cost disproportionate traffic, and a
   two-hop chain dilutes what the redirect passes on.
   ========================================================================= */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(HERE, '.live-urls.json');
const LIVE = 'https://quickeasysoftware.com';
const SITEMAPS = ['post-sitemap.xml', 'page-sitemap.xml', 'category-sitemap.xml'];
const base = (process.argv[2] || '').replace(/\/$/, '');
const CONCURRENCY = 8;

if (!base) {
  console.error('usage: node infra/crawl-check.mjs <base-url>');
  process.exit(1);
}

async function liveUrls() {
  if (fs.existsSync(CACHE)) return JSON.parse(fs.readFileSync(CACHE, 'utf8'));
  const out = new Set();
  for (const sm of SITEMAPS) {
    const xml = await (await fetch(`${LIVE}/${sm}`)).text();
    for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      out.add(m[1].trim().replace(/^https?:\/\/(www\.)?quickeasysoftware\.com/, '') || '/');
    }
  }
  const urls = [...out].sort();
  fs.writeFileSync(CACHE, JSON.stringify(urls, null, 2));
  return urls;
}

// Optional: --resolve <ip> pins the hostname to an IP, bypassing the local resolver.
// Right after a cutover the local/ISP resolver is often still holding the old answer
// (or a negative cache), which would fail every URL here for reasons that have nothing
// to do with the site. curl does the pinning; Node's fetch has no public API for it.
const pinIndex = process.argv.indexOf('--resolve');
const pinIp = pinIndex !== -1 ? process.argv[pinIndex + 1] : null;
const hostOf = (u) => new URL(u).hostname;

async function head(url) {
  if (pinIp) {
    const { execFile } = await import('node:child_process');
    return new Promise((resolve) => {
      execFile(
        'curl',
        ['-sI', '-m', '25', '--resolve', `${hostOf(url)}:443:${pinIp}`,
         '-o', process.platform === 'win32' ? 'NUL' : '/dev/null',
         '-w', '%{http_code} %{redirect_url}', url],
        (err, stdout) => {
          if (err) return resolve({ status: 0, error: err.message });
          const [code, loc] = stdout.trim().split(' ');
          resolve({ status: Number(code), location: loc || null });
        }
      );
    });
  }
  try {
    const r = await fetch(url, { method: 'HEAD', redirect: 'manual' });
    return { status: r.status, location: r.headers.get('location') };
  } catch (e) {
    return { status: 0, error: e.message };
  }
}

async function check(p) {
  const first = await head(base + p);
  if (first.status === 200) return { p, ok: true, hops: 0 };
  if (first.status !== 301 && first.status !== 302) {
    return { p, ok: false, why: `${first.status || first.error} (expected 200 or 301)` };
  }
  // Follow exactly one hop. A #fragment is client-side, so strip it to fetch.
  const target = new URL(first.location, base + p);
  const second = await head(target.origin + target.pathname + target.search);
  if (second.status === 200) return { p, ok: true, hops: 1, to: first.location };
  if (second.status === 301 || second.status === 302) {
    return { p, ok: false, why: `CHAIN: -> ${first.location} -> ${second.location}` };
  }
  return { p, ok: false, why: `-> ${first.location} then ${second.status}` };
}

const urls = await liveUrls();
console.log(`crawling ${urls.length} live-indexed URLs against ${base}\n`);

const results = [];
let cursor = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < urls.length) {
      const p = urls[cursor++];
      results.push(await check(p));
      if (results.length % 50 === 0) process.stdout.write(`  ...${results.length}\n`);
    }
  })
);

const bad = results.filter((r) => !r.ok);
const direct = results.filter((r) => r.ok && r.hops === 0).length;
const viaRedirect = results.filter((r) => r.ok && r.hops === 1).length;

console.log(`\n  ${direct} served directly`);
console.log(`  ${viaRedirect} via a single 301`);
console.log(`  ${bad.length} failed`);
for (const b of bad) console.log(`    ✗ ${b.p}\n        ${b.why}`);

process.exit(bad.length ? 1 : 0);
