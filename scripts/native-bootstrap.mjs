import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const requested = String(process.argv[2] || 'all').toLowerCase();
const supported = new Set(['all', 'android', 'ios']);
if (!supported.has(requested)) {
  console.error('Usage: node scripts/native-bootstrap.mjs [all|android|ios]');
  process.exit(1);
}

const configPath = path.join(root, 'native', 'app-config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function run(args) {
  const result = spawnSync(npx, args, { cwd: root, stdio: 'inherit', env: process.env });
  if (result.status !== 0) process.exit(result.status || 1);
}

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function write(file, content) {
  const absolute = path.join(root, file);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content);
}

function ensurePlatform(platform) {
  const directory = path.join(root, platform);
  if (!fs.existsSync(directory)) run(['cap', 'add', platform]);
  run(['cap', 'sync', platform]);
}

function replaceNumber(source, expression, value, label) {
  if (!expression.test(source)) throw new Error(`Could not find ${label} in generated native project.`);
  return source.replace(expression, `$1${value}`);
}

function patchAndroid() {
  const variablesPath = 'android/variables.gradle';
  let variables = read(variablesPath);
  variables = replaceNumber(variables, /(minSdkVersion\s*=\s*)\d+/, config.android.minSdk, 'Android minSdkVersion');
  variables = replaceNumber(variables, /(compileSdkVersion\s*=\s*)\d+/, config.android.compileSdk, 'Android compileSdkVersion');
  variables = replaceNumber(variables, /(targetSdkVersion\s*=\s*)\d+/, config.android.targetSdk, 'Android targetSdkVersion');
  write(variablesPath, variables);

  const manifestPath = 'android/app/src/main/AndroidManifest.xml';
  let manifest = read(manifestPath);
  if (!manifest.includes(`android:scheme="${config.urlScheme}"`)) {
    const filter = `\n            <intent-filter>\n                <action android:name="android.intent.action.VIEW" />\n                <category android:name="android.intent.category.DEFAULT" />\n                <category android:name="android.intent.category.BROWSABLE" />\n                <data android:scheme="${config.urlScheme}" android:host="oauth" />\n            </intent-filter>`;
    const activityClose = manifest.indexOf('</activity>');
    if (activityClose < 0) throw new Error('Could not find MainActivity in AndroidManifest.xml.');
    manifest = `${manifest.slice(0, activityClose)}${filter}\n        ${manifest.slice(activityClose)}`;
  }
  write(manifestPath, manifest);
}

function plistEntry(key, value) {
  return `\n\t<key>${key}</key>\n\t<string>${value}</string>`;
}

function patchIos() {
  const infoPath = 'ios/App/App/Info.plist';
  let info = read(infoPath);
  const additions = [];
  if (!info.includes('<key>NSPhotoLibraryUsageDescription</key>')) {
    additions.push(plistEntry('NSPhotoLibraryUsageDescription', config.ios.photoLibraryUsage));
  }
  if (!info.includes('<key>NSPhotoLibraryAddUsageDescription</key>')) {
    additions.push(plistEntry('NSPhotoLibraryAddUsageDescription', config.ios.photoLibraryAddUsage));
  }
  if (!info.includes(`<string>${config.urlScheme}</string>`)) {
    additions.push(`\n\t<key>CFBundleURLTypes</key>\n\t<array>\n\t\t<dict>\n\t\t\t<key>CFBundleTypeRole</key>\n\t\t\t<string>Editor</string>\n\t\t\t<key>CFBundleURLName</key>\n\t\t\t<string>${config.appId}</string>\n\t\t\t<key>CFBundleURLSchemes</key>\n\t\t\t<array>\n\t\t\t\t<string>${config.urlScheme}</string>\n\t\t\t</array>\n\t\t</dict>\n\t</array>`);
  }
  if (additions.length) {
    const closing = info.lastIndexOf('</dict>');
    if (closing < 0) throw new Error('Could not patch iOS Info.plist.');
    info = `${info.slice(0, closing)}${additions.join('')}\n${info.slice(closing)}`;
    write(infoPath, info);
  }

  const projectPath = 'ios/App/App.xcodeproj/project.pbxproj';
  let project = read(projectPath);
  if (!/IPHONEOS_DEPLOYMENT_TARGET\s*=\s*[^;]+;/.test(project)) {
    throw new Error('Could not find iOS deployment target in Xcode project.');
  }
  project = project.replace(/IPHONEOS_DEPLOYMENT_TARGET\s*=\s*[^;]+;/g, `IPHONEOS_DEPLOYMENT_TARGET = ${config.ios.deploymentTarget};`);
  write(projectPath, project);
}

try {
  if (requested === 'all' || requested === 'android') {
    ensurePlatform('android');
    patchAndroid();
  }
  if (requested === 'all' || requested === 'ios') {
    ensurePlatform('ios');
    patchIos();
  }
  console.log(`SnapNext native bootstrap completed for ${requested}.`);
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
