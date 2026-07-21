import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const requirePlatforms = process.argv.includes('--require-platforms');
const failures = [];
const notes = [];

function exists(file) { return fs.existsSync(path.join(root, file)); }
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function check(condition, message) { if (!condition) failures.push(message); }

check(exists('capacitor.config.ts'), 'capacitor.config.ts is missing.');
check(exists('native/app-config.json'), 'native/app-config.json is missing.');
check(exists('native-web/index.html'), 'native-web/index.html is missing.');
check(exists('docs/NATIVE_LAUNCH_RUNBOOK.md'), 'Native launch runbook is missing.');

if (exists('capacitor.config.ts')) {
  const source = read('capacitor.config.ts');
  check(source.includes("appId: 'ai.snapnext.app'"), 'Capacitor appId must remain ai.snapnext.app.');
  check(source.includes("url: 'https://snapnext.ai'"), 'Native shell must load the HTTPS production origin.');
  check(source.includes('cleartext: false'), 'Native shell must keep cleartext traffic disabled.');
}

if (exists('package.json')) {
  const pkg = JSON.parse(read('package.json'));
  for (const script of ['native:bootstrap', 'native:bootstrap:android', 'native:bootstrap:ios', 'native:preflight', 'policy:android', 'policy:ios']) {
    check(Boolean(pkg.scripts?.[script]), `package.json is missing script ${script}.`);
  }
}

for (const platform of ['android', 'ios']) {
  if (!exists(platform)) {
    const message = `${platform}/ is not generated. Run npm run native:bootstrap:${platform}.`;
    if (requirePlatforms) failures.push(message); else notes.push(message);
  }
}

function runPolicy(script) {
  const result = spawnSync(process.execPath, [path.join(root, script)], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) failures.push(`${script} failed.`);
}

if (exists('android')) runPolicy('scripts/android-policy-check.mjs');
if (exists('ios')) runPolicy('scripts/ios-policy-check.mjs');

for (const note of notes) console.warn(`NOTE: ${note}`);
if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}
console.log('SnapNext native preflight passed.');
