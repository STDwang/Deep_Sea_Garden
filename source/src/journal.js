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
];

function createJournal(poses, storage) {
  const count = $('journal-count');
  const list = $('journal-entries');
  const notice = $('journal-notice');
  const saveStatus = $('journal-save');
  const found = new Set();
  const entries = journalSpots.map(() => list.appendChild(document.createElement('li')));
  let saved = 0, saving = false, canSave = false, nextCheck = 0, hideAt = 0;

  function refresh() {
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

  return {
    scan(pos,yaw,now) {
      const target=[6,7,8].find(i=>!found.has(i));
      if(target===undefined) {
        notice.textContent='外海测绘已完成 · 回声海图已归档';
      } else {
        const [x,y,z]=poses[target===8?0:target];
        const dx=x-pos[0], dy=y-pos[1], dz=z-pos[2];
        const distance=Math.hypot(dx,dy,dz);
        if(distance<=12) {
          found.add(target);
          refresh();
          save();
          notice.textContent=target===8?'测绘完成 · 获得回声海图':journalSpots[target][0]+'采样成功 · '+journalSpots[target+1][2];
        } else {
          const angle=Math.atan2(dx,-dz)-yaw;
          const direction=['前方','右前','右侧','右后','后方','左后','左侧','左前'][(Math.round(angle/(Math.PI/4))%8+8)%8];
          notice.textContent=(target===8?'返航石鲸尾':journalSpots[target][0])+' · '+direction+' '+Math.round(distance)+' 米'+(Math.abs(dy)>5?(dy>0?' · 上浮':' · 下潜'):'');
        }
      }
      hideAt=now+4500;
    },
    update(x, y, z, now) {
      if (now < nextCheck) return;
      nextCheck = now + 200;
      if (now >= hideAt && notice.textContent) notice.textContent = '';
      for (let i = 0; i < 6; i++) {
        const [px, py, pz] = poses[i];
        if (found.has(i) || Math.hypot(x - px, y - py, z - pz) > 10) continue;
        found.add(i);
        refresh();
        notice.textContent = `已记录 ${journalSpots[i][0]} · 发出声呐寻找测站`;
        hideAt = now + 3400;
        save();
        break;
      }
    },
  };
}
