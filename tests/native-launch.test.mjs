import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(file) { return fs.readFileSync(file, 'utf8'); }

test('native launch configuration remains store-safe', () => {
  const config = JSON.parse(read('native/app-config.json'));
  assert.equal(config.appId, 'ai.snapnext.app');
  assert.equal(config.appUrl, 'https://snapnext.ai');
  assert.equal(config.urlScheme, 'snapnext');
  assert.ok(config.android.compileSdk >= 36);
  assert.ok(config.android.targetSdk >= 36);
  assert.ok(Number(config.ios.deploymentTarget) >= 15);
  assert.match(config.ios.photoLibraryUsage, /photos and videos you choose/i);
});

test('native scripts and CI gates are wired', () => {
  const pkg = JSON.parse(read('package.json'));
  for (const name of ['native:bootstrap', 'native:bootstrap:android', 'native:bootstrap:ios', 'native:preflight', 'policy:android', 'policy:ios']) {
    assert.ok(pkg.scripts[name], `missing ${name}`);
  }
  const capacitor = read('capacitor.config.ts');
  assert.match(capacitor, /https:\/\/snapnext\.ai/);
  assert.match(capacitor, /cleartext:\s*false/);
  const workflow = read('.github/workflows/native-preflight.yml');
  assert.match(workflow, /Android API 36 debug build/);
  assert.match(workflow, /runs-on: macos-26/);
  assert.match(workflow, /CODE_SIGNING_ALLOWED=NO/);
});

test('bootstrap does not add unrelated sensitive permissions', () => {
  const source = [
    read('scripts/native-bootstrap.mjs'),
    read('scripts/android-policy-check.mjs'),
    read('scripts/ios-policy-check.mjs'),
  ].join('\n');
  for (const permission of ['READ_CALL_LOG', 'WRITE_CALL_LOG', 'READ_CONTACTS', 'ACCESS_FINE_LOCATION', 'READ_SMS', 'MANAGE_EXTERNAL_STORAGE']) {
    assert.doesNotMatch(read('scripts/native-bootstrap.mjs'), new RegExp(permission));
  }
  assert.match(source, /snapnext:\/\/oauth/);
});
