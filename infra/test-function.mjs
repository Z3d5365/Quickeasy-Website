/* =========================================================================
   Exercise every branch of infra/cloudfront-function.js at the edge, against
   the DEVELOPMENT stage, before publishing it.
   Run:  node infra/test-function.mjs

   This covers the function's *logic*: host canonicalisation, KVS hits on both
   slash forms, slash normalisation, clean-URL rewriting, pass-through. It does
   not attempt all 214 KVS keys — that is the job of the full crawl against the
   staging alias, which is far cheaper per URL than an API call each.
   ========================================================================= */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const NAME = 'quickeasy-edge-router';
const STAGE = 'DEVELOPMENT';
const tmp = path.join(os.tmpdir(), 'cf-event.json');

// [description, uri, host, expectation]
//   {redirect:'/x'} - a 301 to exactly /x
//   {rewrite:'/x'}  - passed to origin with request.uri === /x
const CASES = [
  ['www is canonicalised to the apex',        '/',                  'www.quickeasysoftware.com', { redirect: 'https://quickeasysoftware.com/' }],
  ['www canonicalises deep paths too',        '/pricing/',          'www.quickeasysoftware.com', { redirect: 'https://quickeasysoftware.com/pricing/' }],
  ['KVS hit, slashed key as asked for',       '/apps/',             'quickeasysoftware.com',     { redirect: '/' }],
  ['KVS hit, slash-less form, ONE hop',       '/apps',              'quickeasysoftware.com',     { redirect: '/' }],
  ['KVS hit keeps a #fragment target',        '/category/erp/',     'quickeasysoftware.com',     { redirect: '/blog/#erp-business-systems' }],
  ['KVS hit on a legacy Thai page',           '/th/bos-overview/',  'quickeasysoftware.com',     { redirect: '/th/business-operating-system/' }],
  ['KVS hit on a retired Yoast sitemap',      '/sitemap_index.xml', 'quickeasysoftware.com',     { redirect: '/sitemap.xml' }],
  ['unmapped folder URL gains its slash',     '/pricing',           'quickeasysoftware.com',     { redirect: '/pricing/' }],
  ['slashed URL is rewritten to index.html',  '/pricing/',          'quickeasysoftware.com',     { rewrite: '/pricing/index.html' }],
  ['site root rewrites to index.html',        '/',                  'quickeasysoftware.com',     { rewrite: '/index.html' }],
  ['a real file passes through untouched',    '/assets/css/main.css', 'quickeasysoftware.com',   { rewrite: '/assets/css/main.css' }],
  ['sitemap.xml passes through untouched',    '/sitemap.xml',       'quickeasysoftware.com',     { rewrite: '/sitemap.xml' }],
  ['unknown folder still reaches the origin', '/no-such-page/',     'quickeasysoftware.com',     { rewrite: '/no-such-page/index.html' }],
  ['staging alias takes the same code path',  '/pricing',           'qes-stage.vibecraftedsoftware.com', { redirect: '/pricing/' }],
];

const etag = spawnSync('aws', ['cloudfront', 'describe-function', '--name', NAME, '--query', 'ETag', '--output', 'text'],
  { encoding: 'utf8', shell: true }).stdout.trim();
if (!etag) { console.error('could not read the function ETag'); process.exit(1); }

let failed = 0;
for (const [desc, uri, host, want] of CASES) {
  fs.writeFileSync(tmp, JSON.stringify({
    version: '1.0',
    context: { eventType: 'viewer-request' },
    viewer: { ip: '198.51.100.1' },
    request: { method: 'GET', uri, querystring: {}, headers: { host: { value: host } }, cookies: {} },
  }));

  const r = spawnSync('aws', ['cloudfront', 'test-function', '--name', NAME, '--if-match', etag,
    '--stage', STAGE, '--event-object', `fileb://${tmp}`, '--output', 'json'],
    { encoding: 'utf8', shell: true });
  if (r.status !== 0) { console.log(`  ✗ ${desc}\n      aws error: ${(r.stderr || '').trim().split('\n')[0]}`); failed++; continue; }

  const result = JSON.parse(r.stdout).TestResult;
  if (result.FunctionErrorMessage) {
    console.log(`  ✗ ${desc}\n      function error: ${result.FunctionErrorMessage}`);
    failed++; continue;
  }
  const out = JSON.parse(result.FunctionOutput);

  let got, pass;
  if (out.response) {
    got = `${out.response.statusCode} -> ${out.response.headers?.location?.value}`;
    pass = want.redirect !== undefined
      && out.response.statusCode === 301
      && out.response.headers?.location?.value === want.redirect;
  } else {
    got = `origin, uri=${out.request.uri}`;
    pass = want.rewrite !== undefined && out.request.uri === want.rewrite;
  }

  if (pass) console.log(`  ✓ ${desc}`);
  else { console.log(`  ✗ ${desc}\n      want ${JSON.stringify(want)}\n      got  ${got}`); failed++; }
}

fs.rmSync(tmp, { force: true });
console.log(`\n${CASES.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
