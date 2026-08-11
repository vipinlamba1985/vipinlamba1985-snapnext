import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

test('native face bridge is count-only and keeps the working copy bounded on device', () => {
  const source = read('lib/intelligence/native-face-analysis.js');
  assert.match(source, /registerPlugin\('LocalFaceAnalysis'\)/);
  assert.match(source, /MAX_DETECTION_DIMENSION = 2048/);
  assert.match(source, /canvas\.toDataURL\('image\/jpeg'/);
  assert.match(source, /faceCount: validatedCount/);
  assert.match(source, /faceDetectionConfidence: boundedConfidence/);
  assert.doesNotMatch(source, /Rekognition|IndexFacesCommand|SearchFaces|AssociateFaces/);
  assert.doesNotMatch(source, /embedding\s*:/i);
  assert.doesNotMatch(source, /faceId\s*:/i);
  assert.doesNotMatch(source, /boundingBox\s*:/i);
});

test('Android bootstrap uses the bundled ML Kit face detector without new sensitive permissions', () => {
  const template = read('native/local-face-analysis/android/MainActivity.java');
  const bootstrap = read('scripts/native-bootstrap.mjs');
  assert.match(template, /@CapacitorPlugin\(name = "LocalFaceAnalysis"\)/);
  assert.match(template, /FaceDetection\.getClient\(options\)/);
  assert.match(template, /faces\.size\(\)/);
  assert.match(template, /PERFORMANCE_MODE_ACCURATE/);
  assert.match(template, /faceDetectionConfidence", 0\.0/);
  assert.match(bootstrap, /com\.google\.mlkit:face-detection:16\.1\.7/);
  assert.match(bootstrap, /native\/local-face-analysis\/android\/MainActivity\.java/);
  assert.doesNotMatch(template, /READ_MEDIA_IMAGES|READ_EXTERNAL_STORAGE|CAMERA|RECORD_AUDIO/);
  assert.doesNotMatch(template, /Rekognition|AWS|upload|http/i);
});

test('iOS bootstrap uses Apple Vision and returns no biometric identity material', () => {
  const template = read('native/local-face-analysis/ios/LocalFaceAnalysisPlugin.swift');
  const bootstrap = read('scripts/native-bootstrap.mjs');
  assert.match(template, /@objc\(LocalFaceAnalysis\)/);
  assert.match(template, /VNDetectFaceRectanglesRequest\(\)/);
  assert.match(template, /"faceCount": faces\.count/);
  assert.match(template, /face\.confidence/);
  assert.match(bootstrap, /import Vision/);
  assert.match(bootstrap, /LocalFaceAnalysisPlugin\.swift/);
  assert.doesNotMatch(template, /embedding|personId|faceId|crop|Rekognition|AWS/i);
});

test('Capacitor prefers native face count but safely falls back to self-hosted MediaPipe', () => {
  const source = read('lib/intelligence/web-face-analysis.js');
  const capability = source.indexOf('nativeFaceAnalysisCapability()');
  const nativeDetection = source.indexOf('detectNativeFaceCount(blob)');
  const webDetection = source.indexOf('detectWebFaceCount(blob)', nativeDetection + 1);
  assert.ok(capability > 0);
  assert.ok(nativeDetection > capability);
  assert.ok(webDetection > nativeDetection);
  assert.match(source, /platform: 'web'/);
  assert.match(source, /buildLocalFaceAnalysis/);
});

test('native count producer does not masquerade as the future People identity scanner', () => {
  const peopleContract = read('lib/native/people-scan-contract.js');
  assert.match(peopleContract, /supported: false/);
  assert.match(peopleContract, /native_plugin_missing/);
  const android = read('native/local-face-analysis/android/MainActivity.java');
  const ios = read('native/local-face-analysis/ios/LocalFaceAnalysisPlugin.swift');
  assert.doesNotMatch(`${android}\n${ios}`, /confirmedPersonIds|clusterId|displayName|associateFace/i);
});
