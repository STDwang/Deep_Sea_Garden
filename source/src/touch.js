// ============================================================================
// 双指触控：一侧浮动摇杆负责游动，另一侧滑动负责环顾，双指捏合调整跟随距离
// ============================================================================
// 所有坐标都使用页面坐标系（竖屏时为旋转后的 body 坐标），单位为 CSS 像素。
// 本模块只处理手势逻辑，不访问 DOM，便于在 Node 中做单元测试。

/**
 * 创建触控手势控制器。
 * @param {{radius?: number}} [opt] radius 为摇杆有效半径（CSS 像素）
 * @returns 控制器状态对象：摇杆输出 fw / lr / mag / sprint，累计视角位移 lookX / lookY，捏合位移 zoom
 */
function createTouchControls(opt) {
  const o = opt || {};
  const R = o.radius || 54;   // 摇杆有效半径
  const DEAD = 0.14;          // 中心死区（占半径比例）
  const AXIS_SNAP = 0.2;      // 接近正前 / 正侧时吸附到单轴，直线游动不跑偏
  const SPRINT = 1.32;        // 手指推出外圈达到该比例时冲刺
  const FOLLOW = 1.7;         // 超过该比例后底座跟随手指，回拉时立刻有响应
  const LOOK_USED = 8;        // 视角手指移动超过该距离才算“已学会环顾”

  const s = {
    radius: R, sprintAt: SPRINT,
    stick: null, look: null, pinch: null, pinchD: 0,
    fw: 0, lr: 0, mag: 0, sprint: false,
    knobX: 0, knobY: 0,        // 摇杆圆钮相对底座的位移（像素），用于绘制
    lookX: 0, lookY: 0, zoom: 0,
    swap: false,               // true：摇杆在右侧（左手习惯）
    usedStick: false, usedLook: false,
    get active() { return !!(s.stick || s.look); },
    start, move, end, reset, takeLook,
  };

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  /** 由手指相对底座的位置计算摇杆输出 */
  function axes() {
    const p = s.stick;
    if (!p) { s.fw = s.lr = s.mag = s.knobX = s.knobY = 0; s.sprint = false; return; }
    let dx = (p.x - p.x0) / R, dy = (p.y - p.y0) / R, len = Math.hypot(dx, dy);
    if (len > FOLLOW) {
      // 底座沿拖动方向被拉走，保持手指位于 FOLLOW 倍半径处
      const k = (len - FOLLOW) / len;
      p.x0 += (p.x - p.x0) * k; p.y0 += (p.y - p.y0) * k;
      dx *= FOLLOW / len; dy *= FOLLOW / len; len = FOLLOW;
    }
    if (len < 1e-6) { s.fw = s.lr = s.mag = s.knobX = s.knobY = 0; s.sprint = false; return; }
    const ux = dx / len, uy = dy / len;
    const m = Math.min(1, Math.max(0, (len - DEAD) / (1 - DEAD)));
    s.mag = m;
    s.lr = Math.abs(ux) < AXIS_SNAP ? 0 : ux * m;
    s.fw = Math.abs(uy) < AXIS_SNAP ? 0 : -uy * m;   // 屏幕向上为前进
    s.sprint = len >= SPRINT && m > 0;
    const kr = Math.min(len, 1) * R;
    s.knobX = ux * kr; s.knobY = uy * kr;
  }

  /**
   * 新手指按下。
   * @returns {'stick'|'look'|'pinch'|''} 手指被分配的角色
   */
  function start(id, x, y, width) {
    const stickSide = s.swap ? x >= width * 0.5 : x < width * 0.5;
    if (stickSide && !s.stick) {
      s.stick = { id, x0: x, y0: y, x, y };
      s.usedStick = true; axes();
      return 'stick';
    }
    if (!s.look) { s.look = { id, x, y, moved: 0 }; return 'look'; }
    if (!s.pinch) {
      s.pinch = { id, x, y };
      s.pinchD = dist(s.look, s.pinch);
      return 'pinch';
    }
    return '';
  }

  /** 手指移动 */
  function move(id, x, y) {
    const st = s.stick, lk = s.look, pn = s.pinch;
    if (st && st.id === id) { st.x = x; st.y = y; axes(); return; }
    if (lk && lk.id === id) {
      if (pn) { lk.x = x; lk.y = y; pinchUpdate(); return; }
      const dx = x - lk.x, dy = y - lk.y;
      s.lookX += dx; s.lookY += dy; lk.x = x; lk.y = y;
      lk.moved += Math.abs(dx) + Math.abs(dy);
      if (lk.moved > LOOK_USED) s.usedLook = true;
      return;
    }
    if (pn && pn.id === id) { pn.x = x; pn.y = y; pinchUpdate(); }
  }

  function pinchUpdate() {
    const d = dist(s.look, s.pinch);
    s.zoom += d - s.pinchD; s.pinchD = d;
  }

  /** 手指抬起或被系统取消 */
  function end(id) {
    if (s.stick && s.stick.id === id) { s.stick = null; axes(); return; }
    if (s.look && s.look.id === id) {
      // 捏合中的另一根手指接管环顾，位移从当前位置继续计算，不会跳变
      s.look = s.pinch ? { id: s.pinch.id, x: s.pinch.x, y: s.pinch.y, moved: 0 } : null;
      s.pinch = null; return;
    }
    if (s.pinch && s.pinch.id === id) s.pinch = null;
  }

  /** 清空全部手势（打开菜单、切后台、失去焦点时调用） */
  function reset() {
    s.stick = s.look = s.pinch = null;
    s.lookX = s.lookY = s.zoom = 0;
    axes();
  }

  /** 取走累计的视角位移与捏合位移 */
  function takeLook(out) {
    out.x = s.lookX; out.y = s.lookY; out.zoom = s.zoom;
    s.lookX = s.lookY = s.zoom = 0;
    return out;
  }

  return s;
}
