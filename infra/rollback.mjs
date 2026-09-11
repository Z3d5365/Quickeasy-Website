/* =========================================================================
   Emergency origin swap for the QuickEasy distribution.

     node infra/rollback.mjs --to-wordpress [--dry-run]
     node infra/rollback.mjs --to-static    [--dry-run]

   Why this exists: after the cutover, quickeasysoftware.com is served by our
   distribution. If the static site turns out to be wrong in a way that cannot
   be patched at the edge, the fastest complete undo is to point the default
   cache behaviour back at the WordPress origin — no DNS change, no cooperation
   from anyone, live in the 5-15 minutes CloudFront takes to deploy. Moving the
   aliases back instead is slower and involves the other account.

   Two things change together, and both are required:

     1. The default behaviour's target origin -> wp-legacy.
     2. An origin request policy that forwards the viewer's Host header
        (AllViewer). Without it CloudFront sends Host:
        mywebsite.quickeasysoftware.com, and WordPress canonical-redirects the
        request straight back to the apex — a loop. This is also why the
        forward configuration cannot use a simple origin-group failover.

   The viewer-request function is detached at the same time: its job is
   index.html rewriting and static-site redirects, none of which apply to
   WordPress, and leaving it attached would rewrite /pricing/ to
   /pricing/index.html and 404 against the WordPress origin.
   ========================================================================= */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'deploy.config.json'), 'utf8'));
const DIST = cfg.aws.cloudfrontDistributionId;
const FN = `arn:aws:cloudfront::${cfg.aws.account}:function/${cfg.aws.edgeFunction}`;
const ALL_VIEWER = '216adef6-5c7f-47e4-b989-5492eafa07d3'; // AWS managed: AllViewer

const DRY = process.argv.includes('--dry-run');
const toWordpress = process.argv.includes('--to-wordpress');
const toStatic = process.argv.includes('--to-static');

if (toWordpress === toStatic) {
  console.error('pick exactly one: --to-wordpress or --to-static');
  process.exit(1);
}
if (!DIST) {
  console.error('no cloudfrontDistributionId in deploy.config.json');
  process.exit(1);
}

function aws(args) {
  const r = spawnSync('aws', args, { encoding: 'utf8', shell: true, maxBuffer: 32 * 1024 * 1024 });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    process.exit(1);
  }
  return r.stdout;
}

const current = JSON.parse(aws(['cloudfront', 'get-distribution-config', '--id', DIST, '--output', 'json']));
const etag = current.ETag;
const config = current.DistributionConfig;
const behavior = config.DefaultCacheBehavior;

const was = behavior.TargetOriginId;

if (toWordpress) {
  behavior.TargetOriginId = 'wp-legacy';
  behavior.OriginRequestPolicyId = ALL_VIEWER;
  behavior.FunctionAssociations = { Quantity: 0, Items: [] };
} else {
  behavior.TargetOriginId = 's3-site';
  delete behavior.OriginRequestPolicyId; // S3 origin must not receive the viewer Host
  behavior.FunctionAssociations = {
    Quantity: 1,
    Items: [{ EventType: 'viewer-request', FunctionARN: FN }],
  };
}

console.log(`distribution ${DIST}`);
console.log(`  default origin : ${was} -> ${behavior.TargetOriginId}`);
console.log(`  host forwarding: ${behavior.OriginRequestPolicyId ? 'AllViewer' : 'none (S3)'}`);
console.log(`  edge function  : ${behavior.FunctionAssociations.Quantity ? 'attached' : 'detached'}`);

if (DRY) {
  console.log('\ndry run — nothing changed');
  process.exit(0);
}

const tmp = path.join(os.tmpdir(), `dist-config-${DIST}.json`);
fs.writeFileSync(tmp, JSON.stringify(config));
aws(['cloudfront', 'update-distribution', '--id', DIST, '--if-match', etag,
  '--distribution-config', `file://${tmp}`, '--output', 'json']);
fs.rmSync(tmp, { force: true });

console.log('\nupdate submitted. CloudFront takes 5-15 minutes to deploy it.');
console.log('Then invalidate so cached static responses do not mask the swap:');
console.log(`  aws cloudfront create-invalidation --distribution-id ${DIST} --paths "/*"`);
