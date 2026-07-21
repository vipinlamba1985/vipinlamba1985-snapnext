import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const infoPath = path.join(root, 'ios/App/App/Info.plist');
const projectPath = path.join(root, 'ios/App/App.xcodeproj/project.pbxproj');
if (!fs.existsSync(infoPath) || !fs.existsSync(projectPath)) {
  console.error('iOS project is incomplete. Run npm run native:bootstrap:ios.');
  process.exit(1);
}

const info = fs.readFileSync(infoPath, 'utf8');
const project = fs.readFileSync(projectPath, 'utf8');
for (const key of ['NSPhotoLibraryUsageDescription', 'NSPhotoLibraryAddUsageDescription']) {
  if (!info.includes(`<key>${key}</key>`)) {
    console.error(`iOS permission explanation missing: ${key}.`);
    process.exit(1);
  }
}
if (!info.includes('<string>snapnext</string>')) {
  console.error('iOS OAuth URL scheme snapnext:// is missing.');
  process.exit(1);
}
if (/<key>NSAllowsArbitraryLoads<\/key>\s*<true\/>/.test(info)) {
  console.error('iOS App Transport Security must not allow arbitrary loads.');
  process.exit(1);
}

const forbiddenUsageKeys = ['NSLocationWhenInUseUsageDescription', 'NSLocationAlwaysUsageDescription', 'NSContactsUsageDescription', 'NSMicrophoneUsageDescription'];
const violations = forbiddenUsageKeys.filter(key => info.includes(`<key>${key}</key>`));
if (violations.length) {
  console.error(`Unapproved iOS permission descriptions found: ${violations.join(', ')}`);
  process.exit(1);
}

const targets = [...project.matchAll(/IPHONEOS_DEPLOYMENT_TARGET\s*=\s*([0-9.]+);/g)].map(match => Number(match[1]));
const minimum = targets.length ? Math.min(...targets) : 0;
if (minimum < 15) {
  console.error(`iOS deployment target ${minimum || 'unknown'} must be at least 15.0.`);
  process.exit(1);
}

if (process.platform === 'darwin') {
  const result = spawnSync('xcodebuild', ['-version'], { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error('xcodebuild is unavailable.');
    process.exit(1);
  }
  const major = Number((result.stdout.match(/Xcode\s+(\d+)/) || [])[1]);
  if (!major || major < 26) {
    console.error(`Xcode ${major || 'unknown'} is below the App Store build requirement.`);
    process.exit(1);
  }
}

console.log(`iOS policy preflight passed: deployment target ${minimum}, photo permission copy, secure transport, OAuth URL scheme.`);
