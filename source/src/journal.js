const journalKey = 'garden-journal-v1';
const journalSpots = [
  ['石鲸尾', '一道巨大的石鲸尾立在峡谷入口，光从它上方落下。', '就在初次潜入的位置附近。'],
  ['沉木船', '断裂的木船肋骨伸出沙地，鱼群在船身旁穿行。', '沿峡谷向东，到开阔的沙坡找木船。'],
  ['海藻林', '高大的海藻随水摇摆，叶片之间浮着细碎光点。', '沿峡谷向北，找成片的高海藻。'],
  ['海绵峡谷', '桶状海绵聚在西侧岩壁脚下。', '往西侧峡谷游，留意岩壁前的海绵。'],
  ['海藻盆地', '海藻沿海床缓坡铺开，远处立着一座石丘。', '从中央峡谷往北，留意海藻林南面的缓坡。'],
  ['紫光洞窟', '紫色微光从洞口漫出，珊瑚沿岩底生长。', '向南游，找水色开始泛紫的地方。'],
  ['潮门测站', '已取得单拱回声。', '从沉船继续向东，寻找独立石拱。'],
  ['双环测站', '已取得双拱回声。', '从潮门向北游，寻找并列石拱。'],
  ['回声海图', '两份声学样本已在石鲸尾归档。', '完成两站采样后，回到石鲸尾发出声呐。'],
  ['翠渊巨藻塔', '外海巨藻环抱高耸石拱，翠绿光瀑倾泻而下。', '穿出东北双环测站，驶入翠光巨藻深渊。'],
  ['暖礁双拱台', '暖光珊瑚阶梯层叠铺开，巨拱横跨礁台之上。', '穿过东侧潮门测站，向东南寻找浅水珊瑚礁台。'],
  ['幽渊荧光盆', '深紫微光在广袤海盆间流动，水母群于环礁起舞。', '穿出南侧紫光洞窟，驶向西南方荧光深盆。'],
  ['玄岩热泉门', '漆黑玄岩巨拱矗立海沟之上，热泉气泡连绵升腾。', '穿出西侧海绵峡谷，向西北方深邃海沟潜行。'],
];

function createJournal(poses, storage) {
  const count = $('journal-count');
  const list = $('journal-entries');
  const notice = $('journal-notice');
  const saveStatus = $('journal-save');
  const found = new Set();
  const entries = journalSpots.map(() => list.appendChild(document.createElement('li')));
  let saved = 0, saving = false, canSave = false, nextCheck = 0, hideAt = 0;
  // 当前目标：HUD 罗盘与任务栏读取。locked 为声呐锁定后才在罗盘上标出方位
  const goal = { index: -1, name: '', x: 0, y: 0, z: 0, locked: false, label: '', found: 0, total: journalSpots.length, version: 0 };
  let lockedIndex = -1;
  const surveyNext = () => [6, 7, 8].find(i => !found.has(i));
  const exploreIndices = () => {
    const out = [0, 1, 2, 3, 4, 5];
    for (let i = 9; i < journalSpots.length && i < poses.length; i++) out.push(i);
    return out;
  };

  /** 重新计算当前目标与任务栏文案 */
  function refreshGoal(pos) {
    const target = surveyNext();
    let index = -1;
    if (target !== undefined) {
      index = target;
      const step = target - 5;
      goal.name = target === 8 ? '返航石鲸尾' : journalSpots[target][0];
      goal.label = `外海测绘 ${step}/3 · ${goal.name}`;
    } else {
      const rest = exploreIndices().filter(i => !found.has(i));
      if (!rest.length) { goal.name = ''; goal.label = '全部海域已记录 · 无尽深海畅游'; }
      else {
        // 测绘完成后，声呐改为寻找最近的未记录地点（含远海奇观）
        if (lockedIndex >= 0 && rest.includes(lockedIndex)) index = lockedIndex;
        else if (pos) index = rest.reduce((a, b) => Math.hypot(poses[a][0] - pos[0], poses[a][2] - pos[2]) <= Math.hypot(poses[b][0] - pos[0], poses[b][2] - pos[2]) ? a : b);
        goal.name = index >= 0 ? journalSpots[index][0] : '';
        goal.label = `远海探索 · 还有 ${rest.length} 处未记录`;
      }
    }
    goal.index = index;
    if (index >= 0) { const p = poses[index === 8 ? 0 : index]; goal.x = p[0]; goal.y = p[1]; goal.z = p[2]; }
    goal.locked = index >= 0 && lockedIndex === index;
    goal.found = found.size;
    goal.version++;
  }

  function refresh() {
    refreshGoal();
    count.textContent = `海底日志 ${found.size}/${journalSpots.length}`;
    entries.forEach((entry, index) => {
      const [name, description, clue] = journalSpots[index];
      entry.textContent = `${name} · ${found.has(index) ? description : clue}`;
      entry.classList.toggle('recorded', found.has(index));
    });
  }

  async function save() {
    if (!canSave || saving || saved === found.size) return;
    saving = true;
    while (saved !== found.size) {
      const snapshot = Array.from(found);
      try {
        await storage.write(journalKey, JSON.stringify(snapshot));
        saved = snapshot.length;
        saveStatus.textContent = '';
      } catch {
        saveStatus.textContent = '有记录尚未保存，稍后将重试。';
        break;
      }
    }
    saving = false;
  }

  refresh();
  Promise.resolve().then(() => storage.read(journalKey)).then(data => {
    const records = data ? JSON.parse(data) : [];
    if (!Array.isArray(records)) throw new Error('Invalid journal');
    const valid = new Set(records.filter(index => Number.isInteger(index) && index >= 0 && index < entries.length));
    saved = valid.size;
    valid.forEach(index => found.add(index));
    canSave = true;
    refresh();
    save();
  }).catch(() => { saveStatus.textContent = '日志暂时只能在本次潜水中查看。'; });
  $('journal-details').addEventListener('toggle', save);
  document.addEventListener('visibilitychange', save);

  /** 相对视线的方位描述 */
  function bearing(dx, dz, yaw) {
    const angle = Math.atan2(dx, -dz) - yaw;
    return ['前方', '右前', '右侧', '右后', '后方', '左后', '左侧', '左前'][(Math.round(angle / (Math.PI / 4)) % 8 + 8) % 8];
  }

  return {
    goal,
    notify(message, now, ms = 3200) {
      notice.textContent = message;
      hideAt = now + ms;
    },
    scan(pos, yaw, now) {
      const target = surveyNext();
      if (target === undefined) {
        // 测绘已完成：声呐锁定最近的未记录地点（核心区 + 远海奇观）
        lockedIndex = -1;
        refreshGoal(pos);
        if (goal.index < 0) notice.textContent = '全海域测绘已完成 · 全部奇观均已记录';
        else {
          lockedIndex = goal.index; refreshGoal(pos);
          const dx = goal.x - pos[0], dy = goal.y - pos[1], dz = goal.z - pos[2];
          notice.textContent = '最近未记录 · ' + goal.name + ' · ' + bearing(dx, dz, yaw) + ' ' + Math.round(Math.hypot(dx, dy, dz)) + ' 米' + (Math.abs(dy) > 6 ? (dy > 0 ? ' · 上浮' : ' · 下潜') : '');
        }
      } else {
        const [x, y, z] = poses[target === 8 ? 0 : target];
        const dx = x - pos[0], dy = y - pos[1], dz = z - pos[2];
        const distance = Math.hypot(dx, dy, dz);
        if (distance <= 12) {
          found.add(target);
          // 采样成功后自动锁定下一站，罗盘直接给出方向
          const next = surveyNext(); lockedIndex = next === undefined ? -1 : next;
          refresh();
          save();
          notice.textContent = target === 8 ? '测绘完成 · 获得回声海图，可向远海奇观进发' : journalSpots[target][0] + '采样成功 · 下一站已标在罗盘上';
        } else {
          lockedIndex = target; refreshGoal(pos);
          notice.textContent = (target === 8 ? '返航石鲸尾' : journalSpots[target][0]) + ' · ' + bearing(dx, dz, yaw) + ' ' + Math.round(distance) + ' 米' + (Math.abs(dy) > 5 ? (dy > 0 ? ' · 上浮' : ' · 下潜') : '');
        }
      }
      hideAt = now + 4500;
    },
    update(x, y, z, now) {
      if (now < nextCheck) return;
      nextCheck = now + 200;
      if (now >= hideAt && notice.textContent) notice.textContent = '';
      for (const i of exploreIndices()) {
        const [px, py, pz] = poses[i];
        const radius = i >= 9 ? 18 : 10;
        if (found.has(i) || Math.hypot(x - px, y - py, z - pz) > radius) continue;
        found.add(i);
        if (lockedIndex === i) lockedIndex = -1;
        refresh();
        notice.textContent = i >= 9
          ? `已发现远海奇观 · ${journalSpots[i][0]}`
          : `已记录 ${journalSpots[i][0]} · 发出声呐寻找测站`;
        hideAt = now + 3600;
        save();
        break;
      }
    },
  };
}

