import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
  'android/app/src/main/AndroidManifest.xml',
  'android/variables.gradle',
  'android/app/build.gradle',
];

for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) {
    console.error(`Android project file missing: ${file}. Run npm run native:bootstrap:android.`);
    process.exit(1);
  }
}

const source = required.map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
const manifest = fs.readFileSync(path.join(root, required[0]), 'utf8');
const forbiddenPermissions = [
  'android.permission.READ_CALL_LOG',
  'android.permission.WRITE_CALL_LOG',
  'android.permission.PROCESS_OUTGOING_CALLS',
  'android.permission.READ_CONTACTS',
  'android.permission.WRITE_CONTACTS',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.RECORD_AUDIO',
  'android.permission.READ_SMS',
  'android.permission.SEND_SMS',
  'android.permission.MANAGE_EXTERNAL_STORAGE',
];

const violations = forbiddenPermissions.filter(permission => source.includes(permission));
if (violations.length) {
  console.error(`Unapproved Android permissions found: ${violations.join(', ')}`);
  process.exit(1);
}

function maxVersion(expression) {
  const values = [...source.matchAll(expression)].map(match => Number(match[1]));
  return values.length ? Math.max(...values) : null;
}

const compileSdk = maxVersion(/compileSdk(?:Version)?\s*[=:]?\s*(\d+)/g);
const targetSdk = maxVersion(/targetSdk(?:Version)?\s*[=:]?\s*(\d+)/g);
if (!compileSdk || compileSdk < 36) {
  console.error(`Android compileSdk ${compileSdk || 'unknown'} must be at least 36.`);
  process.exit(1);
}
if (!targetSdk || targetSdk < 36) {
  console.error(`Android targetSdk ${targetSdk || 'unknown'} must be at least 36.`);
  process.exit(1);
}
if (!manifest.includes('android:scheme="snapnext"') || !manifest.includes('android:host="oauth"')) {
  console.error('Android OAuth deep-link intent for snapnext://oauth is missing.');
  process.exit(1);
}

console.log(`Android policy preflight passed: compileSdk ${compileSdk}, targetSdk ${targetSdk}, minimal permissions, OAuth deep link present.`);
