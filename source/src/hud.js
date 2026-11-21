// ============================================================================
// 游戏内 HUD：深度计、罗盘与目标标记、任务栏、声呐冷却、洋流提示、触控摇杆与新手引导
// ============================================================================
// 与 main.js 共享同一作用域（构建时拼接），在每帧末尾由 frame() 调用 hud.frame()。
// 所有 DOM 写入都先与上次的值比较，避免每帧触发无意义的样式重算。

const HUD_FOV = Math.PI / 2;     // 罗盘可见范围：左右各 90°
const SONAR_COOLDOWN = 1.15;     // 与 sonar() 中的冷却时间保持一致
const HUD_MAX_DEPTH = 52;        // 可下潜的最大深度（米）

/**
 * 创建 HUD 控制器。
 * @param {object} touchState createTouchControls() 返回的触控状态
 * @returns {{frame: Function, dive: Function, measure: Function}}
 */
function createHud(touchState) {
  const root = document.documentElement;
  const el = id => document.getElementById(id);
  const depthText = el('depth'), depthFill = el('depth-fill'), depthTip = el('depth-tip');
  const objective = el('objective'), objectiveHint = el('objective-hint'), logCount = el('log-count');
  const compass = el('compass'), ticksBox = el('compass-ticks');
  const goalMark = el('compass-goal'), goalText = el('compass-goal-text');
  const streamChip = el('stream-chip'), sonarBtn = el('survey-sonar');
  const cruiseBtn = el('cruise'), lampBtn = el('lamp');
  const stick = el('stick'), knob = stick.querySelector('.stick-knob'), guide = el('touch-guide');

  // 罗盘刻度：每 15° 一格，八方位带文字
  const NAMES = { 0: '北', 45: '东北', 90: '东', 135: '东南', 180: '南', 225: '西南', 270: '西', 315: '西北' };
  const ticks = [];
  for (let d = 0; d < 360; d += 15) {
    const t = document.createElement('i'), name = NAMES[d];
    t.className = name ? (d % 90 ? 'tick mid' : 'tick major') : 'tick';
    if (name) t.textContent = name;
    ticksBox.appendChild(t);
    ticks.push({ el: t, a: d * Math.PI / 180, op: '' });
  }

  let width = 0, lastYaw = 1e9, lastDepth = -1, lastTip = '', lastLocked = null, lastGoalText = '', lastEdge = null;
  let lastVersion = -1, lastHint = null, lastCd = -1, lastStream = null, lastCruise = null, lastLamp = null;
  let stickOn = null, sprintOn = false, guideOn = null, guideStart = 0;
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  const px = rel => (rel / HUD_FOV * width * 0.5).toFixed(1);

  /** 尺寸变化后重新测量罗盘宽度与摇杆默认位置 */
  function measure() {
    width = compass.clientWidth; lastYaw = 1e9; stickOn = null;
  }
  addEventListener('resize', measure);

  /** 摇杆空闲时停在拇指自然落点，提示这里可以拖动 */
  function parkStick() {
    const w = body.clientWidth, h = body.clientHeight, r = Math.min(110, h * 0.26);
    stick.style.transform = `translate(${touchState.swap ? w - r * 1.25 : r * 1.25}px,${h - r}px)`;
    knob.style.transform = '';
  }

  function frame() {
    if (!width) measure();
    const p = diver.pos, yaw = F[YAW];

    // ---- 罗盘刻度
    if (Math.abs(yaw - lastYaw) > 0.002) {
      lastYaw = yaw;
      for (const t of ticks) {
        const rel = wrap(t.a - yaw), a = Math.abs(rel);
        const op = a < HUD_FOV ? (1 - a / HUD_FOV * 0.85).toFixed(2) : '0';
        if (op !== '0' || t.op !== '0') t.el.style.transform = `translateX(${px(rel)}px)`;
        if (op !== t.op) { t.el.style.opacity = op; t.op = op; }
      }
    }

    // ---- 任务栏与目标标记
    const g = journal.goal;
    if (g.version !== lastVersion) {
      lastVersion = g.version;
      objective.textContent = g.label;
      logCount.textContent = `日志 ${g.found}/${g.total}`;
    }
    const hint = g.index >= 0 && !g.locked;
    if (hint !== lastHint) { objectiveHint.hidden = !hint; lastHint = hint; }
    if (g.locked !== lastLocked) { goalMark.hidden = !g.locked; lastLocked = g.locked; lastGoalText = ''; }
    if (g.locked) {
      const dx = g.x - p[0], dy = g.y - p[1], dz = g.z - p[2];
      const rel = wrap(Math.atan2(dx, -dz) - yaw), lim = HUD_FOV * 0.9, edge = Math.abs(rel) > lim;
      goalMark.style.transform = `translateX(${px(Math.max(-lim, Math.min(lim, rel)))}px)`;
      const v = dy > 5 ? ' ↑' : dy < -5 ? ' ↓' : '';
      const txt = (edge && rel < 0 ? '◀ ' : '') + g.name + ' ' + Math.round(Math.hypot(dx, dy, dz)) + '米' + v + (edge && rel > 0 ? ' ▶' : '');
      if (txt !== lastGoalText) { goalText.textContent = txt; lastGoalText = txt; }
      if (edge !== lastEdge) { goalMark.classList.toggle('edge', edge); lastEdge = edge; }
    }

    // ---- 深度计
    const depth = Math.max(0, Math.round(-p[1]));
    if (depth !== lastDepth) {
      lastDepth = depth;
      depthText.textContent = depth + ' 米';
      depthFill.style.transform = `scaleY(${Math.min(1, depth / HUD_MAX_DEPTH).toFixed(3)})`;
    }
    const tip = diver.airborne ? '跃出水面' : -p[1] < 2.5 ? '接近水面' : p[1] - currentBedHeight(p[0], p[2]) < 2.4 ? '贴近海床' : diver.sprint ? '冲刺中' : '深度';
    if (tip !== lastTip) { depthTip.textContent = tip; lastTip = tip; }

    // ---- 声呐冷却：环形进度
    const cd = Math.round(Math.min(1, Math.max(0, (F[TIME] - pulseTime) / SONAR_COOLDOWN)) * 40) / 40;
    if (cd !== lastCd) {
      sonarBtn.style.setProperty('--cd', String(cd));
      sonarBtn.classList.toggle('cooling', cd < 1);
      lastCd = cd;
    }

    // ---- 洋流与开关状态
    const stream = !diver.airborne && diver.streamBoost > 0.3;
    if (stream !== lastStream) { streamChip.hidden = !stream; lastStream = stream; }
    if (autoSwim !== lastCruise) { cruiseBtn.setAttribute('aria-pressed', String(autoSwim)); lastCruise = autoSwim; }
    if (lamp !== lastLamp) { lampBtn.setAttribute('aria-pressed', String(lamp)); lastLamp = lamp; }

    // ---- 触控摇杆
    const ts = touchState.stick;
    if (!!ts !== stickOn) {
      stickOn = !!ts;
      stick.classList.toggle('on', stickOn);
      if (!stickOn) parkStick();
    }
    if (ts) {
      stick.style.transform = `translate(${ts.x0.toFixed(1)}px,${ts.y0.toFixed(1)}px)`;
      knob.style.transform = `translate(${touchState.knobX.toFixed(1)}px,${touchState.knobY.toFixed(1)}px)`;
    }
    if (touchState.sprint !== sprintOn) {
      sprintOn = touchState.sprint;
      stick.classList.toggle('sprint', sprintOn);
      // 进入冲刺时给一下轻触感反馈（容器不支持时静默跳过）
      if (sprintOn && navigator.vibrate) try { navigator.vibrate(12); } catch (e) { /* 忽略 */ }
    }

    // ---- 新手引导：两只手都用过或 15 秒后淡出
    if (root.classList.contains('touch')) {
      const show = !(touchState.usedStick && touchState.usedLook) && performance.now() - guideStart < 15000;
      if (show !== guideOn) { guide.classList.toggle('show', show); guideOn = show; }
    }
  }

  return {
    frame, measure,
    /** 每次潜入时重新计时引导并刷新尺寸 */
    dive() { guideStart = performance.now(); guideOn = null; measure(); },
  };
}
