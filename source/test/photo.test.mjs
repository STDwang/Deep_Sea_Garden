import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function loadPhotoEnv() {
  const code = readFileSync(new URL('../src/photo.js', import.meta.url), 'utf8');
  const ctx = { Math, Date, String, Number, Array };
  return runInNewContext(`${code}\n({ analyzePhotoSubject, PHOTO_QUOTES })`, ctx);
}

test('analyzePhotoSubject 准确定位并识别正前方的生物目标为三星特写', () => {
  const { analyzePhotoSubject } = loadPhotoEnv();
  const camPos = [0, -20, 0];
  const camDir = [0, 0, 1]; // 正对 +Z 方向
  const targets = {
    creatures: [
      { name: '深渊蝠鲼', x: 0, y: -20, z: 15 }, // 距离 15m，完全居中
      { name: '巡游海龟', x: 25, y: -20, z: 5 },  // 偏侧面
    ],
  };

  const result = analyzePhotoSubject(camPos, camDir, targets);
  assert.equal(result.name, '深渊蝠鲼');
  assert.equal(result.category, '深海生物');
  assert.equal(result.stars, 3);
  assert.match(result.ratingLabel, /★★★ 绝景/);
  assert.equal(result.depth, '20.0');
  assert.ok(Number(result.waterTemp) > 0);
});

test('analyzePhotoSubject 识别偏角目标为二星或一星', () => {
  const { analyzePhotoSubject } = loadPhotoEnv();
  const camPos = [100, -15, 100];
  const camDir = [0, 0, 1];
  const targets = {
    landmarks: [
      { name: '石鲸尾', x: 108, y: -15, z: 130 }, // 距离约 31m，轻微偏角
    ],
  };

  const result = analyzePhotoSubject(camPos, camDir, targets);
  assert.equal(result.name, '石鲸尾');
  assert.equal(result.category, '远海奇迹');
  assert.ok(result.stars >= 1);
});

test('analyzePhotoSubject 在无特定目标时返回深海风光记录', () => {
  const { analyzePhotoSubject } = loadPhotoEnv();
  const camPos = [500, -42, 500];
  const camDir = [0, 0, 1];
  const targets = { creatures: [], landmarks: [] };

  const result = analyzePhotoSubject(camPos, camDir, targets);
  assert.equal(result.category, '深海风光');
  assert.equal(result.stars, 1);
  assert.equal(result.depth, '42.0');
  assert.ok(result.quote.length > 0);
});
