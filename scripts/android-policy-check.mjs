import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const files = [
  'android/app/src/main/AndroidManifest.xml',
  'android/variables.gradle',
  'android/app/build.gradle',
].map((file) => path.join(root, file));

const existing = files.filter(fs.existsSync);
if (existing.length === 0) {
  console.error('Android project not found. Run: npm run native:add:android (first setup) and npm run native:sync');
  process.exit(1);
}

const source = existing.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const forbiddenPermissions = [
  'android.permission.READ_CALL_LOG',
  'android.permission.WRITE_CALL_LOG',
  'android.permission.PROCESS_OUTGOING_CALLS',
];

const violations = forbiddenPermissions.filter((permission) => source.includes(permission));
if (violations.length) {
  console.error(`Forbidden call-log permissions found: ${violations.join(', ')}`);
  process.exit(1);
}

const targetMatches = [...source.matchAll(/targetSdk(?:Version)?\s*[=:]?\s*(\d+)/g)].map((match) => Number(match[1]));
const targetSdk = targetMatches.length ? Math.max(...targetMatches) : null;
if (!targetSdk) {
  console.error('Unable to determine Android targetSdk. Confirm android/variables.gradle or app/build.gradle defines it.');
  process.exit(1);
}
if (targetSdk < 36) {
  console.error(`targetSdk ${targetSdk} is below Google Play's API 36 requirement for app updates from August 31, 2026.`);
  process.exit(1);
}

console.log(`Android policy preflight passed: targetSdk ${targetSdk}; no prohibited call-log permissions.`);
