// Consolidate SITE-/BLOG-/LEGAL-REDIRECTS.txt into one machine-readable 301
// map for the host to serve (website-deployment consumes this).
// Flattens any residual chains to a single hop and fails on cycles/dupes.
// Run:  node seo/gen-redirect-map.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['SITE-REDIRECTS.txt', 'BLOG-REDIRECTS.txt', 'LEGAL-REDIRECTS.txt'];

const map = new Map();
const dupes = [];
for (const f of FILES) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) continue;
  for (const raw of fs.readFileSync(p, 'utf8').split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    const m = line.match(/^(\/\S+)\s*->\s*(\/\S*)$/); // \S* so a bare "/" target is kept
    if (!m) continue;
    const [, from, to] = m;
    if (map.has(from) && map.get(from) !== to) dupes.push(`${from} -> ${map.get(from)} / ${to}`);
    map.set(from, to);
  }
}

// Flatten chains: follow a target while it is itself a source.
function resolve(to) {
  const seen = new Set();
  while (map.has(to)) {
    if (seen.has(to)) throw new Error(`redirect cycle at ${to}`);
    seen.add(to);
    to = map.get(to);
  }
  return to;
}
const rows = [...map.keys()].sort().map(from => [from, resolve(map.get(from))]);

// Validation
const chained = rows.filter(([, to]) => map.has(to));
if (dupes.length) { console.error('DUPLICATE SOURCES:\n' + dupes.join('\n')); process.exit(1); }
if (chained.length) { console.error('RESIDUAL CHAINS:\n' + chained.map(r => r.join(' -> ')).join('\n')); process.exit(1); }

const csv = 'old,new\n' + rows.map(([a, b]) => `${a},${b}`).join('\n') + '\n';
fs.writeFileSync(path.join(ROOT, 'seo', 'redirect-map.csv'), csv);
console.log(`Wrote seo/redirect-map.csv with ${rows.length} 301s (0 chains, 0 dupes)`);
