# ABZU 六向游泳操控改造 — 2026-11-20

## 需求
1. 空格垂直上浮；W+空格 = 前方斜上方游。
2. 游泳速度、动作动画、冲刺参考《ABZU》，原实现太迟钝。

## 诊断：为什么会"迟钝"且空格无效
- 原 `moveVector` 只用 `W/S/A/D` 沿视线方向算移动，`Space` 完全不参与移动 → 空格无上游功能。
- 巡航速度仅 1.65 m/s；加速响应 `1-exp(-dt*1.8)`、转向 `2.8` 偏慢。
- 转身瞬间 `alignment=max(0,cos(turn))` 掉到 0 → 速度归零、几乎停住，这是"粘滞感"主因。
- 摆尾动作幅度只跟 0~1 的 effort 走，没有冲刺档。

## 改动
### 14_diver.js（核心）
- 新增 `moveVector(keys,d)`：WASD 按 `targetYaw` 水平移动；`Space=+1`、`Q/ControlLeft/Right=-1` 垂直；三轴归一化后合成。W+空格自动成 45° 斜上；纯空格水平分量为 0 → 垂直上浮。
- **相机 pitch 与身体 pitch 解耦**：鼠标俯仰只转镜头，身体朝向由实际移动向量决定（`goalPitch=atan2(y,水平)`，钳制 ±0.95），斜上游时身体自然抬头。
- 速度：`CRUISE 1.65→3.0`，`SPRINT=6.4`（Shift 按住）。
- 响应：加速 `1.8→4.2`（冲刺 5.5），转向 `2.8→5.2`。
- **转身保速**：`align = 0.55 + 0.45*max(0,cos(turn))`，转身最低仍保留 55% 推力。
- 动作：冲刺时 `effort→1.75` 驱动更快更大的摆尾；`d.fovk` 冲刺视野 +0.14 产生速度感。

### 18_bubbles.js
- 冲刺时改为从脚蹼后方发射密集小气泡（周期 4.4s→1.2s、间隔 0.10→0.045、半径更小、寿命 4.5→2.6、上升更快），形成尾迹；非冲刺仍是头盔呼吸泡。

### 30_app.js / index.html
- keydown 把 Space/Q/Shift 纳入 preventDefault（防页面滚动）与 faceInput 即时响应。
- 三处操作提示更新为「WASD 游动 · 空格上浮 · Q 下潜 · Shift 冲刺 · 鼠标转向」。

### test/check.mjs
- 删除旧断言「pitch controls depth」（与新语义冲突）。
- 新增 Space/Q/W+空格/Shift 冲刺的行为断言。

## 验证
- `node minitool/build.mjs` + `node minitool/test/check.mjs`：PASS，120.4 万三角形。
- **WebGL2 真机按键实测**（.tmp/verify_controls.cjs，相对起点 [10,2,-10]）：

  | 输入 | 实测位移 | 结论 |
  |---|---|---|
  | Space | dy +2.05，水平 ≈0 | 纯垂直上浮 ✅ |
  | Q | dy -2.03 | 下潜 ✅ |
  | W | dz -2.01，dy 0 | 水平前进 ✅ |
  | W+Space | dz -1.45，dy +1.46 | 45° 斜上 ✅ |
  | Shift+W | -4.7 vs 巡航 -2.04 | 冲刺快 2.3× ✅ |

- **WebGPU**：双端编译零错误；无头 swiftshader 6 秒仅 2 帧（帧率瓶颈），Space 每帧仍产生 +0.04 上浮，方向正确。
- 巡航视觉截图 `swim-controls-cruise.png`：潜水员、海藻、光柱、焦散、鱼群正常，无渲染回退。

## 说明
- 逻辑 JS 双后端共用，WebGL2 已完整验证物理，WebGPU 只需验证编译与方向。
- 潜水员造型仍偏抽象、脚蹼发白；骨骼摆尾幅度可在下一轮进一步夸张化。
