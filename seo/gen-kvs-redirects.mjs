// Turn seo/redirect-map.csv into the flat JSON a CloudFront KeyValueStore imports,
// so the edge can serve every legacy 301 on the first request.
// Run:  node seo/gen-kvs-redirects.mjs   (after gen-redirect-map.mjs)
//
// The lookup in the CloudFront Function runs against the RAW request.uri, before any
// normalisation, so a key only matches if it is byte-identical to what the browser
// asked for. Two consequences shape this script:
//
//   1. Slash variants. WordPress served /pricing and 301'd it to /pricing/, so both
//      forms are in the wild and in Google's index. A key ending in "/" therefore also
//      gets its slash-less twin (and vice versa for extensionless paths). Emitting both
//      is what keeps /old -> /new a single hop instead of /old -> /old/ -> /new.
//   2. Percent-encoding. The three Thai-slugged posts are indexed in percent-encoded
//      form. We emit both that and the decoded UTF-8 form, because which one reaches
//      the function depends on CloudFront's normalisation; the unused one costs a few
//      bytes against a 5 MB budget.
//
// Paths carrying a file extension (/sitemap_index.xml) get no slash variants.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'seo', 'redirect-map.csv');
const OUT = path.join(ROOT, 'seo', 'redirects.json');

if (!fs.existsSync(SRC)) {
  console.error('missing ' + path.relative(ROOT, SRC) + ' — run gen-redirect-map.mjs first');
  process.exit(1);
}

const hasExtension = (p) => /\.[a-z0-9]{2,5}$/i.test(p.replace(/\/$/, '').split('/').pop() || '');

const rows = fs
  .readFileSync(SRC, 'utf8')
  .trim()
  .split(/\r?\n/)
  .slice(1) // drop the "old,new" header
  .map((l) => l.split(','))
  .filter((r) => r.length === 2 && r[0].startsWith('/'));

const map = new Map();
const collisions = [];
function put(key, value) {
  const existing = map.get(key);
  if (existing !== undefined && existing !== value) {
    collisions.push(`${key} -> ${existing} / ${value}`);
    return;
  }
  map.set(key, value);
}

for (const [from, to] of rows) {
  const variants = new Set([from]);

  if (!hasExtension(from)) {
    if (from.endsWith('/')) {
      if (from !== '/') variants.add(from.replace(/\/$/, ''));
    } else {
      variants.add(from + '/');
    }
  }

  // Percent-encoding is case-insensitive (RFC 3986) and normalisers are told to
  // UPPERCASE the hex digits. WordPress published these URLs lowercase, so that is
  // what is indexed, but curl, Googlebot and most clients send %E0 where the sitemap
  // says %e0. Hold every form: as published, uppercase-normalised, and decoded.
  for (const v of [...variants]) {
    const upper = v.replace(/%[0-9a-f]{2}/g, (m) => m.toUpperCase());
    if (upper !== v) variants.add(upper);
    try {
      const decoded = decodeURI(v);
      if (decoded !== v) variants.add(decoded);
    } catch {
      // malformed escape — keep the literal form only
    }
  }

  for (const v of variants) put(v, to);
}

// A key that is also a target would mean the edge serves a redirect to a redirect.
const chains = [...map.keys()].filter((k) => {
  const t = map.get(k);
  return map.has(t) || map.has(t.replace(/#.*$/, ''));
});

if (collisions.length) {
  console.error('COLLIDING KEYS (same source, different targets):');
  collisions.forEach((c) => console.error('  ' + c));
  process.exit(1);
}
if (chains.length) {
  console.error('REDIRECT CHAINS (target is itself a key):');
  chains.forEach((c) => console.error(`  ${c} -> ${map.get(c)}`));
  process.exit(1);
}

// CloudFront's KVS --import-source wants {"data":[{"key":…,"value":…}]}, not flat
// pairs. This file has exactly one consumer (create-key-value-store), so it is
// written in that shape rather than translated at import time.
const data = [...map.keys()].sort().map((key) => ({ key, value: map.get(key) }));

fs.writeFileSync(OUT, JSON.stringify({ data }, null, 2) + '\n');
const bytes = fs.statSync(OUT).size;
console.log(
  `Wrote seo/redirects.json with ${map.size} keys from ${rows.length} rules ` +
    `(${(bytes / 1024).toFixed(1)} KB of the 5 MB KVS budget, 0 chains, 0 collisions)`
);
