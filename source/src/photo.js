// ============================================================================
// Deep Sea Photography: Subject Analysis, Rating, and Polaroid Share Card
// ============================================================================

const PHOTO_QUOTES = {
  creature: [
    '静谧的暗蓝洋流中，生灵优雅地穿巡于万年古石间。',
    '微光浮动，与古老的海底原住民在深渊不期而遇。',
    '鳍翼拂开细碎光斑，记录下深海最轻盈的律动。',
  ],
  landmark: [
    '庞大的自然奇迹横跨海床，倾泻下直击心灵的光瀑。',
    '古老的岩拱经万年海潮雕琢，守护着幽蓝的秘境。',
    '在无尽深海的边缘，沉默的地标见证时间的沉淀。',
  ],
  abyss: [
    '光芒被层层深蓝吞噬，唯有永恒的宁静与浩瀚。',
    '海床在声呐回波中延展，无垠深渊蕴藏着无限可能。',
    '潜入午夜水体，聆听来自地球深处的低沉呼吸。',
  ],
};

/**
 * 分析相机前方的主体目标并进行科考评级
 * @param {number[]} camPos - 相机坐标 [x, y, z]
 * @param {number[]} camDir - 相机视线方向归一化向量 [fx, fy, fz]
 * @param {Object} targets - 候选目标列表
 * @returns {Object} 评级分析结果
 */
function analyzePhotoSubject(camPos, camDir, targets = {}) {
  const [cx, cy, cz] = camPos;
  const [fx, fy, fz] = camDir;
  let bestCandidate = null;
  let bestScore = -1e9;

  // 1. 扫描地标与景观
  const landmarks = targets.landmarks || [];
  for (let i = 0; i < landmarks.length; i++) {
    const lm = landmarks[i];
    if (!lm) continue;
    const lx = lm.x !== undefined ? lm.x : lm[0];
    const ly = lm.y !== undefined ? lm.y : lm[1];
    const lz = lm.z !== undefined ? lm.z : lm[2];
    const name = lm.name || (Array.isArray(lm) ? lm[0] : `观测点 #${i + 1}`);

    const dx = lx - cx, dy = ly - cy, dz = lz - cz;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 4 || dist > 140) continue; // 超出有效取景距离

    const inv = 1 / (dist || 1);
    const dot = (dx * inv) * fx + (dy * inv) * fy + (dz * inv) * fz;
    if (dot < 0.65) continue; // 不在视野正前方（张角约大于 50 度）

    // 评分权重：对中度权重高，距离适中（15~45m）得分最高
    const distFactor = 1 - Math.abs(dist - 30) / 110;
    const score = dot * 0.7 + distFactor * 0.3;

    if (score > bestScore) {
      bestScore = score;
      bestCandidate = {
        name,
        category: '远海奇迹',
        type: 'landmark',
        dist,
        dot,
        coord: [lx, lz],
      };
    }
  }

  // 2. 扫描动态生物（海龟、蝠鲼、水母、潜水员）
  const creatures = targets.creatures || [];
  for (let i = 0; i < creatures.length; i++) {
    const c = creatures[i];
    if (!c) continue;
    const dx = c.x - cx, dy = c.y - cy, dz = c.z - cz;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 2.5 || dist > 60) continue;

    const inv = 1 / (dist || 1);
    const dot = (dx * inv) * fx + (dy * inv) * fy + (dz * inv) * fz;
    if (dot < 0.70) continue;

    // 生物距离较近时加分更高
    const distFactor = 1 - Math.abs(dist - 15) / 50;
    const score = (dot * 0.65 + distFactor * 0.35) * 1.15; // 生物有优先吸引力权重

    if (score > bestScore) {
      bestScore = score;
      bestCandidate = {
        name: c.name || '深海生灵',
        category: '深海生物',
        type: 'creature',
        dist,
        dot,
        coord: [c.x, c.z],
      };
    }
  }

  const depth = Math.max(0, -cy);
  // 模拟水温：表层 22℃，35m 约 5℃，深层 2.8℃
  const temp = Math.max(2.8, (22 - depth * 0.52)).toFixed(1);

  if (!bestCandidate) {
    // 未对准特定目标：深海全景记录
    const quotes = PHOTO_QUOTES.abyss;
    const quote = quotes[Math.floor((cx * 13 + cz * 7) & 0x7fffffff) % quotes.length];
    return {
      name: depth > 30 ? '深渊幽境' : '蔚蓝海域',
      category: '深海风光',
      type: 'abyss',
      stars: 1,
      ratingLabel: '★ 远景生态观察',
      dist: 0,
      depth: depth.toFixed(1),
      waterTemp: temp,
      coord: [Math.round(cx), Math.round(cz)],
      quote,
    };
  }

  // 计算星级（1~3 星）
  let stars = 1;
  let ratingLabel = '★ 远景生态记录';
  if (bestCandidate.dot > 0.94 && bestCandidate.dist <= (bestCandidate.type === 'creature' ? 24 : 55)) {
    stars = 3;
    ratingLabel = '★★★ 绝景居中特写';
  } else if (bestCandidate.dot > 0.82) {
    stars = 2;
    ratingLabel = '★★ 精准科考抓拍';
  }

  const quoteList = PHOTO_QUOTES[bestCandidate.type] || PHOTO_QUOTES.abyss;
  const quoteIdx = Math.floor(Math.abs(bestCandidate.coord[0] * 3 + bestCandidate.coord[1] * 5 + stars)) % quoteList.length;
  const quote = quoteList[quoteIdx];

  return {
    name: bestCandidate.name,
    category: bestCandidate.category,
    type: bestCandidate.type,
    stars,
    ratingLabel,
    dist: Math.round(bestCandidate.dist),
    depth: depth.toFixed(1),
    waterTemp: temp,
    coord: [Math.round(bestCandidate.coord[0]), Math.round(bestCandidate.coord[1])],
    quote,
  };
}

/**
 * 绘制高质感拍立得科考卡片
 * @param {HTMLCanvasElement} srcCanvas - 游戏主渲染画布
 * @param {Object} info - analyzePhotoSubject 返回的分析对象
 * @returns {string} 卡片的 DataURL (image/png)
 */
function createPolaroidCard(srcCanvas, info) {
  if (typeof document === 'undefined') return '';
  const card = document.createElement('canvas');
  const cardW = 960, cardH = 1280;
  card.width = cardW;
  card.height = cardH;
  const ctx = card.getContext('2d');
  if (!ctx) return '';

  // 1. 底卡相纸底色（复古柔白，带微妙渐变）
  const bgGrad = ctx.createLinearGradient(0, 0, cardW, cardH);
  bgGrad.addColorStop(0, '#f9f8f4');
  bgGrad.addColorStop(1, '#f1ede3');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, cardW, cardH);

  // 边框轻微阴影与质感描边
  ctx.strokeStyle = '#d6cebd';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, cardW - 2, cardH - 2);

  // 2. 主体相片视窗（边距 48px，高度 860px）
  const pad = 48;
  const photoW = cardW - pad * 2;
  const photoH = 860;
  const photoX = pad;
  const photoY = pad;

  ctx.save();
  ctx.beginPath();
  ctx.rect(photoX, photoY, photoW, photoH);
  ctx.clip();

  // 保持比例居中绘制主画布内容
  const sw = srcCanvas.width, sh = srcCanvas.height;
  const sAspect = sw / sh, pAspect = photoW / photoH;
  let sx = 0, sy = 0, sCropW = sw, sCropH = sh;
  if (sAspect > pAspect) {
    sCropW = sh * pAspect;
    sx = (sw - sCropW) / 2;
  } else {
    sCropH = sw / pAspect;
    sy = (sh - sCropH) / 2;
  }
  ctx.drawImage(srcCanvas, sx, sy, sCropW, sCropH, photoX, photoY, photoW, photoH);

  // 照片暗角（Vignette）提升水下电影感
  const vignette = ctx.createRadialGradient(
    photoX + photoW / 2, photoY + photoH / 2, photoW * 0.35,
    photoX + photoW / 2, photoY + photoH / 2, photoW * 0.72
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(3,19,28,0.55)');
  ctx.fillStyle = vignette;
  ctx.fillRect(photoX, photoY, photoW, photoH);

  // 照片内阴影边框
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = 3;
  ctx.strokeRect(photoX, photoY, photoW, photoH);
  ctx.restore();

  // 3. 底部信息书写区（Y 从 930 开始）
  const textY = 948;

  // 类别标签 + 评级星级
  ctx.font = '800 22px system-ui, sans-serif';
  ctx.fillStyle = '#0f6174';
  ctx.fillText(`【${info.category}】`, pad + 2, textY);

  const starStr = '★'.repeat(info.stars) + '☆'.repeat(3 - info.stars);
  ctx.font = '900 24px system-ui, sans-serif';
  ctx.fillStyle = '#f59e0b';
  ctx.fillText(starStr, pad + 180, textY);

  ctx.font = '700 18px system-ui, sans-serif';
  ctx.fillStyle = '#6b7280';
  ctx.fillText(info.ratingLabel, pad + 270, textY - 2);

  // 科考印章（圆形 stamp 右上偏右）
  ctx.save();
  ctx.translate(cardW - pad - 60, textY + 18);
  ctx.rotate(-0.16);
  ctx.strokeStyle = '#c2410c';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, 48, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 43, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = '900 12px system-ui, sans-serif';
  ctx.fillStyle = '#c2410c';
  ctx.textAlign = 'center';
  ctx.fillText('DEEP SEA', 0, -16);
  ctx.font = '900 17px system-ui, sans-serif';
  ctx.fillText('SURVEY', 0, 4);
  ctx.font = '700 10px system-ui, sans-serif';
  ctx.fillText('★ 官方认证 ★', 0, 22);
  ctx.restore();

  // 主题名称（大号黑体）
  ctx.textAlign = 'left';
  ctx.font = '900 46px system-ui, sans-serif';
  ctx.fillStyle = '#111827';
  ctx.fillText(info.name, pad + 2, textY + 62);

  // 遥测数据条（水深、水温、坐标）
  ctx.font = '700 20px system-ui, sans-serif';
  ctx.fillStyle = '#374151';
  const metaText = `水深: ${info.depth} m   水温: ${info.waterTemp} ℃   坐标: [${info.coord[0]}, ${info.coord[1]}]`;
  ctx.fillText(metaText, pad + 4, textY + 104);

  // 分割虚线
  ctx.strokeStyle = '#d1d5db';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(pad + 4, textY + 128);
  ctx.lineTo(cardW - pad - 4, textY + 128);
  ctx.stroke();
  ctx.setLineDash([]);

  // 科考诗意题词
  ctx.font = 'italic 500 22px system-ui, serif';
  ctx.fillStyle = '#4b5563';
  ctx.fillText(`“${info.quote}”`, pad + 4, textY + 168);

  // 底部品牌与时间水印
  const now = new Date();
  const dateStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`;
  ctx.font = '700 16px system-ui, sans-serif';
  ctx.fillStyle = '#9ca3af';
  ctx.fillText('小红书「深海潜水员」探险图鉴', pad + 4, cardH - 36);
  ctx.textAlign = 'right';
  ctx.fillText(`科考记录 · ${dateStr}`, cardW - pad - 4, cardH - 36);

  return card.toDataURL('image/png');
}


