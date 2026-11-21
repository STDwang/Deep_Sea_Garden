import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// 在独立上下文中加载触控模块，避免依赖浏览器 DOM
const load = () => runInNewContext(
  readFileSync(new URL('../src/touch.js', import.meta.url), 'utf8') + '\ncreateTouchControls'
)({ radius: 50 });
const W = 800;

test('左侧手指成为摇杆，右侧手指负责环顾', () => {
  const t = load();
  assert.equal(t.start(1, 100, 300, W), 'stick');
  assert.equal(t.start(2, 600, 300, W), 'look');
  t.move(1, 100, 250);           // 向上推满一个半径
  assert.ok(t.fw > 0.99 && t.lr === 0, '向上推应当前进且不横移');
  assert.equal(t.sprint, false);
  t.move(2, 640, 290);
  const look = t.takeLook({});
  assert.deepEqual([look.x, look.y], [40, -10]);
  assert.deepEqual([t.lookX, t.lookY], [0, 0], '读取后清零');
});

test('死区内不移动，推出外圈触发冲刺，底座会跟随手指', () => {
  const t = load();
  t.start(1, 100, 300, W);
  t.move(1, 103, 300);
  assert.equal(t.mag, 0, '死区内无输出');
  t.move(1, 100, 300 - 50 * 1.4);
  assert.equal(t.sprint, true, '超出外圈冲刺');
  t.move(1, 100, 300 - 50 * 3);
  assert.ok(t.stick.y0 < 300, '底座被拉走');
  t.move(1, 100, t.stick.y0 + 10);  // 回拉到底座下方
  assert.ok(t.fw < 0, '回拉立刻后退，没有空行程');
});

test('同侧第二根手指也能环顾，抬起摇杆手指后停止游动', () => {
  const t = load();
  t.start(1, 100, 300, W);
  assert.equal(t.start(2, 150, 200, W), 'look');
  t.move(1, 150, 300);
  assert.ok(t.lr > 0.9);
  t.end(1);
  assert.equal(t.fw + t.lr + t.mag, 0);
  assert.equal(t.sprint, false);
});

test('双指捏合只调整距离，不转动视角，松开一指后另一指接管', () => {
  const t = load();
  t.start(1, 500, 300, W);
  assert.equal(t.start(2, 600, 300, W), 'pinch');
  t.move(2, 650, 300);
  t.move(1, 480, 300);
  const g = t.takeLook({});
  assert.equal(g.x, 0);
  assert.equal(g.zoom, 70);
  t.end(1);
  t.move(2, 660, 300);
  assert.equal(t.takeLook({}).x, 10, '剩余手指继续环顾且无跳变');
});

test('左手模式把摇杆放到右侧，reset 清空全部状态', () => {
  const t = load();
  t.swap = true;
  assert.equal(t.start(1, 100, 300, W), 'look');
  assert.equal(t.start(2, 700, 300, W), 'stick');
  t.move(2, 700, 240);
  t.reset();
  assert.equal(t.active, false);
  assert.equal(t.fw, 0);
});
