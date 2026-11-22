const xhs = window.xhs || {};
const miniTool = xhs.miniTool || {};
const supports = name => typeof miniTool[name] === 'function';
const onClick = (id, handler) => $(id).addEventListener('click', handler);
const panel = $('panel');
const ranks = $('ranks');
const panelStatus = $('panel-status');
const timeKey = 'garden-dive-seconds';
let activeMilliseconds = 0;
let lastTick = performance.now();
let savedSeconds = 0;
let saving = false;
let ranking = [];
let shownRanks = 5;

const seconds = () => savedSeconds + Math.floor(activeMilliseconds / 1000);
const timeLabel = value => {
  const whole = Math.floor(value);
  return whole >= 60 ? Math.floor(whole / 60) + '分' + whole % 60 + '秒' : whole + '秒';
};

const loadedTime = supports('getStorage')
  ? Promise.resolve().then(() => miniTool.getStorage({ key: timeKey })).then(result => {
    const stored = Number(result.data);
    if (Number.isSafeInteger(stored) && stored > 0) savedSeconds = stored;
  }).catch(() => {})
  : Promise.resolve();

async function saveTime() {
  if (saving || !supports('setStorage')) return;
  saving = true;
  try {
    await loadedTime;
    const elapsed = Math.floor(activeMilliseconds / 1000);
    if (elapsed > 0) {
      const result = await miniTool.setStorage({ key: timeKey, data: String(savedSeconds + elapsed) });
      if (result && result.errMsg === 'setStorage:ok') {
        activeMilliseconds -= elapsed * 1000;
        savedSeconds += elapsed;
      }
    }
  } catch (error) {
    console.warn('Unable to save dive time', error);
  } finally {
    saving = false;
  }
}

function updateTime() {
  const now = performance.now();
  if (!menu && !document.hidden && !dead) activeMilliseconds += Math.min(1000, now - lastTick);
  lastTick = now;
  const label = '累计潜水 ' + timeLabel(seconds());
  $('time').textContent = label;
  $('home-time').textContent = label;
  const mode = photo ? '摄影' : ['跟随','第一人称','远景'][diver.view];
  if ($('view').textContent !== mode) $('view').textContent = mode;
  $('view').setAttribute('aria-pressed', String(!photo && diver.view === 1));
  $('view').setAttribute('aria-label', '当前' + mode + '，' + (photo ? '返回跟随视角' : ['切换第一人称','切换远景看潜水员','切换跟随视角'][diver.view]));
}

setInterval(updateTime, 250);
setInterval(saveTime, 5000);
document.addEventListener('visibilitychange', () => {
  lastTick = performance.now();
  if (document.hidden) { release(); saveTime(); }
});
onClick('o', saveTime);
onClick('view', toggleView);

for (const [id, direction] of [['rise', 1], ['sink', -1]]) {
  const button = $(id);
  button.addEventListener('pointerdown', event => {
    if (event.button !== 0 || touchDepth || menu) return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    touchDepth = direction;
  });
  button.addEventListener('lostpointercapture', () => {
    if (touchDepth === direction) touchDepth = 0;
  });
}

onClick('audio', () => {
  sound();
  if (!OUT) {
    showPanel('声音', '当前容器暂时无法播放声音。');
    return;
  }
  mute();
  $('audio').textContent = muted ? '开启声音' : '关闭声音';
});
$('quality').addEventListener('change', () => {
  PIXMAX = Number($('quality').value);
  pix = PIXMAX;
  resize();
});
POSES.forEach((pose, index) => {
  const option = document.createElement('option');
  option.value = String(index);
  option.textContent = journalSpots[index][0];
  $('spot').appendChild(option);
});
$('spot').addEventListener('change', event => {
  const spot = event.currentTarget;
  if (spot.value === '') return;
  visitSpot(Number(spot.value));
  spot.value = '';
  go();
});

// 触控偏好：灵敏度、上下反转、摇杆位置，保存在容器 Storage，下次打开沿用
const prefsKey = 'garden-touch-prefs-v1';
function applyTouchPrefs(prefs) {
  const sens = Number(prefs.sens);
  touchSens = [0.7, 1, 1.4].indexOf(sens) >= 0 ? sens : 1;
  touchInvert = !!prefs.invert;
  touch.swap = !!prefs.swap;
  touch.reset();
  $('touch-sens').value = String(touchSens);
  $('touch-invert').checked = touchInvert;
  $('touch-swap').checked = touch.swap;
  document.documentElement.classList.toggle('swap', touch.swap);
  gameHud.measure();
}
if (supports('getStorage')) {
  Promise.resolve().then(() => miniTool.getStorage({ key: prefsKey })).then(result => {
    if (result && typeof result.data === 'string' && result.data) applyTouchPrefs(JSON.parse(result.data));
  }).catch(() => {});
}
function saveTouchPrefs() {
  applyTouchPrefs({ sens: $('touch-sens').value, invert: $('touch-invert').checked, swap: $('touch-swap').checked });
  if (!supports('setStorage')) return;
  const data = JSON.stringify({ sens: touchSens, invert: touchInvert, swap: touch.swap });
  Promise.resolve().then(() => miniTool.setStorage({ key: prefsKey, data })).catch(error => console.warn('Unable to save touch prefs', error));
}
for (const id of ['touch-sens', 'touch-invert', 'touch-swap']) $(id).addEventListener('change', saveTouchPrefs);

const canReport = !!(xhs.AI && typeof xhs.AI.createModel === 'function');

function showPanel(title, message, showRanks = false) {
  $('panel-title').textContent = title;
  panelStatus.textContent = message;
  ranks.textContent = '';
  $('refresh-rank').hidden = !showRanks;
  $('more-ranks').hidden = true;
  $('panel-report').hidden = !canReport;
  panel.hidden = false;
}

onClick('close-panel', () => { panel.hidden = true; });
onClick('d', () => { panel.hidden = true; });

function bindAction(id, available, action) {
  const button = $(id);
  button.hidden = !available;
  if (!available) return;
  onClick(id, async () => {
    button.disabled = true;
    try {
      await action();
    } catch (error) {
      console.warn(id, error);
      showPanel(button.textContent, '操作未完成，请重试或检查当前小工具的能力权限。');
    } finally {
      button.disabled = false;
    }
  });
}

onClick('start', go);

bindAction('share', supports('share'), () => miniTool.share({ type: 'card' }));
bindAction('comment', supports('interactionOpenApi'), () => miniTool.interactionOpenApi({
  payload: { action: 'post_comment', content: '我在「深海潜水员」潜水了 ' + timeLabel(seconds()) + '。' },
  saveToAlbum: false,
}));
bindAction('note', supports('postNote'), async () => {
  render();
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Unable to capture the scene');
  const image = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  if (!image.startsWith('data:image/png;base64,')) throw new Error('Unable to capture the scene');
  return miniTool.postNote({
    title: '深海潜水员 · 潜水日记',
    content: '累计潜水 ' + timeLabel(seconds()) + '。',
    pageType: 'photo_publish',
    mediaInfo: { image_resources: [{ url: image }] },
  });
});
async function openReport() {
  showPanel('AI 潜水报告', '正在生成…');
  const result = await xhs.AI.createModel('deepseek-v4-flash').generateText({
    messages: [{ role: 'user', content: '根据累计潜水时间 ' + timeLabel(seconds()) + '，写一段 80 字以内的中文深海探索日志。不要虚构本次看到的景物或编造其他统计。' }],
  });
  const choice = result.choices && result.choices[0];
  if (!choice || !choice.message || !choice.message.content) throw new Error('Empty report');
  if ($('panel-title').textContent === 'AI 潜水报告') panelStatus.textContent = choice.message.content;
}
bindAction('report', canReport, openReport);
bindAction('panel-report', canReport, openReport);

function renderRanks() {
  ranks.textContent = '';
  ranking.slice(0, shownRanks).forEach(item => {
    const row = document.createElement('li');
    const no = document.createElement('span');
    no.className = 'no';
    no.textContent = item.rank;
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = item.nickname;
    const val = document.createElement('span');
    val.className = 'val';
    val.textContent = timeLabel(item.score);
    row.append(no, who, val);
    ranks.appendChild(row);
  });
  $('more-ranks').hidden = shownRanks >= ranking.length;
}

const canRank = ['getRankList', 'getMyRank', 'submitScore'].every(supports);
let loadingRanks = false;
async function loadRanks() {
  if (loadingRanks) return;
  loadingRanks = true;
  showPanel('累计潜水时长榜', '正在读取榜单…', true);
  try {
    await loadedTime;
    const score = Math.min(seconds(), 1000000);
    if (score > 0) await miniTool.submitScore({ board: 1, score });
    const [list, mine] = await Promise.all([
      miniTool.getRankList({ board: 1, period: 'all' }),
      miniTool.getMyRank({ board: 1, period: 'all' }),
    ]);
    if ($('panel-title').textContent !== '累计潜水时长榜') return;
    ranking = list.data || [];
    shownRanks = 5;
    const position = mine.status === 'EXACT' ? '第 ' + mine.rank + ' 名' : mine.status === 'OVER_LIMIT' ? '500+' : '暂无排名';
    panelStatus.textContent = '我的排名：' + position + ' · ' + timeLabel(seconds());
    renderRanks();
  } catch (error) {
    if (Number(error && error.errCode) === 1005) {
      $('rank').hidden = true;
      $('refresh-rank').hidden = true;
    }
    if ($('panel-title').textContent === '累计潜水时长榜') panelStatus.textContent = '榜单暂不可用 · 累计潜水 ' + timeLabel(seconds());
  } finally {
    loadingRanks = false;
  }
}
bindAction('rank', canRank, () => {
  if (!document.body.classList.contains('g')) go();
  return loadRanks();
});
onClick('refresh-rank', loadRanks);
onClick('more-ranks', () => { shownRanks += 5; renderRanks(); });
