// ============================================================================
// renderer, camera and input
// ============================================================================
const $ = (id) => document.getElementById(id);
const canvas = $('c'), info = $('i'), body = document.body;
// a phone held upright gets the page turned on its side (see xhs/index.html)
const rot = matchMedia('(orientation: portrait)');
// loading bar: each stage glides it to `to` (the share done) over ~`ms` on the compositor, so it moves while this
// thread is busy
let loaded = 0, dead; // dead: the graphics device was lost
const say = (m, to, ms) => {
  if (!dead) $('s').textContent = m;
  const a = $('b').animate({ transform: [`scaleX(${loaded})`, `scaleX(${to})`] }, { duration: ms, fill: 'forwards', easing: 'cubic-bezier(.3,.5,.5,1)' });
  loaded = to;
  // go on once the animation runs: one not started before the thread gets busy stays stuck (timer: hidden tabs)
  return new Promise((r) => { a.ready.then(() => setTimeout(r)); setTimeout(r, document.hidden ? 0 : 1e3); });
};
const fail = (m) => {
  body.className = 'l e';
  $('s').textContent = m;
  $('w').hidden = false;
  $('w').textContent = '请在支持 WebGPU 的 HTTPS 容器或新版桌面浏览器中打开；iOS / 小程序内核若不支持，请升级容器或返回桌面端预览。';
  $('retry').hidden = false;
  throw new Error(m, { cause: 1 });
}; // cause marks a message that is shown as it is
$('retry').addEventListener('click', () => location.reload());
if (!navigator.gpu) {
  fail(!window.isSecureContext
    ? '无法启动：当前页面不是安全连接。请使用 HTTPS 或本机预览。'
    : '无法启动：当前浏览器或小红书容器未开启 WebGPU。');
}
let adapter;
try {
  adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
} catch (error) {
  adapter = null;
}
// Some browsers reject a high-performance preference while still exposing a usable default adapter.
if (!adapter) {
  try { adapter = await navigator.gpu.requestAdapter(); }
  catch (error) { adapter = null; }
}
if (!adapter) fail('未找到可用的 WebGPU 适配器，请确认显卡加速已开启。');
$('w').hidden = !!navigator.userAgentData; // only Chromium-based browsers have it
const hasTS = adapter.features.has('timestamp-query');
let device;
try {
  device = await adapter.requestDevice({ requiredFeatures: hasTS ? ['timestamp-query'] : [] });
} catch (error) {
  try { device = await adapter.requestDevice(); }
  catch (fallbackError) { fail('无法启动：显卡不支持当前版本的 WebGPU 渲染设备。'); }
}
device.addEventListener('uncapturederror', (e) => console.error('GPU: ' + e.error.message));
// 在初始化与首帧渲染期间开启错误作用域，避免移动端 WebGPU 校验失败时静默黑屏
device.pushErrorScope('out-of-memory');
device.pushErrorScope('validation');
// out of memory or a GPU timeout: reload a level lower, or on Low say what happened
device.lost.then((l) => {
  if (l.reason === 'destroyed') return; // the page is closing
  dead = body.className = 'l e'; $('s').textContent = '显卡设备已丢失，请刷新页面重试。'; $('retry').hidden = false;
});
const ctx = canvas.getContext('webgpu');
if (!ctx) fail('无法启动：当前容器未能创建 WebGPU 画布上下文。');
const FMT = navigator.gpu.getPreferredCanvasFormat();
const Q = device.queue, HDR = 'rgba16float', DEPTH = 'depth32float';
const TU = GPUTextureUsage, BU = GPUBufferUsage, SS = GPUShaderStage;

const mod = (code) => device.createShaderModule({ code });
const buf = (data, usage) => { const b = device.createBuffer({ size: (data.byteLength + 3) & ~3, usage: usage | BU.COPY_DST }); Q.writeBuffer(b, 0, data.buffer || data, data.byteOffset || 0, data.byteLength); return b; };
const tex = (w, h, format, usage, o = {}) => device.createTexture({ size: [w, h, o.d || 1], format, usage, mipLevelCount: o.mips || 1, sampleCount: o.samples || 1, dimension: o.d ? '3d' : '2d' });

// ---------------------------------------------------------------- static resources
const sRep = device.createSampler({ addressModeU: 'repeat', addressModeV: 'repeat', magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', maxAnisotropy: LV > 1 ? 1 : 8 });
const sClamp = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
const sCmp = device.createSampler({ compare: 'less-equal', magFilter: 'linear', minFilter: 'linear' });
const tShadow = tex(SHADOW, SHADOW, DEPTH, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING);
const tDummy = tex(1, 1, DEPTH, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING);
const tWater = tex(WATER, WATER, HDR, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING, { mips: 5 });
const tDetail = tex(1024, 1024, 'rgba8unorm', TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING, { mips: 11 });
const tVol = tex(NX / 2, NY / 2, 'rg8unorm', TU.TEXTURE_BINDING | TU.COPY_DST, { d: NZ / 2 });
const tMap = tex(512, 512, 'rgba8unorm', TU.TEXTURE_BINDING | TU.COPY_DST);

const SAND_DIM = LV > 1 ? 256 : 512;
const tSandA = tex(SAND_DIM, SAND_DIM, 'rg16float', TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING);
const tSandB = tex(SAND_DIM, SAND_DIM, 'rg16float', TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING);
const UB = new Float32Array(80), UBS = new Float32Array(80);
const ubo = device.createBuffer({ size: UB.byteLength, usage: BU.UNIFORM | BU.COPY_DST }), uboS = device.createBuffer({ size: UBS.byteLength, usage: BU.UNIFORM | BU.COPY_DST });
const WT = new Float32Array(4), uboW = device.createBuffer({ size: 16, usage: BU.UNIFORM | BU.COPY_DST });
const SU = new Float32Array(16), uboSand = device.createBuffer({ size: 64, usage: BU.UNIFORM | BU.COPY_DST });

const VF = SS.VERTEX | SS.FRAGMENT;
const bgl0 = device.createBindGroupLayout({ entries: [
  { binding: 0, visibility: VF, buffer: {} },
  { binding: 1, visibility: VF, sampler: {} }, { binding: 2, visibility: VF, sampler: {} }, { binding: 3, visibility: VF, sampler: { type: 'comparison' } },
  { binding: 4, visibility: VF, texture: { sampleType: 'depth' } },
  { binding: 5, visibility: VF, texture: {} }, { binding: 6, visibility: VF, texture: {} },
  { binding: 7, visibility: VF, texture: { viewDimension: '3d' } }, { binding: 8, visibility: VF, texture: {} },
  { binding: 9, visibility: VF, texture: {} }] });
const mkBG0 = (u, sh, ts) => device.createBindGroup({ layout: bgl0, entries: [
  { binding: 0, resource: { buffer: u } }, { binding: 1, resource: sRep }, { binding: 2, resource: sClamp }, { binding: 3, resource: sCmp },
  { binding: 4, resource: sh.createView() }, { binding: 5, resource: tWater.createView() }, { binding: 6, resource: tDetail.createView() },
  { binding: 7, resource: tVol.createView() }, { binding: 8, resource: tMap.createView() }, { binding: 9, resource: ts.createView() }] });
const bg0A = mkBG0(ubo, tShadow, tSandA), bg0B = mkBG0(ubo, tShadow, tSandB), bg0s = mkBG0(uboS, tDummy, tSandA);
const pl0 = device.createPipelineLayout({ bindGroupLayouts: [bgl0] });

const bglBlit = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: SS.FRAGMENT, texture: {} }, { binding: 1, visibility: SS.FRAGMENT, sampler: {} }] });
const plBlit = device.createPipelineLayout({ bindGroupLayouts: [bglBlit] });
const mBlit = mod(W_BLIT);
const blitPipe = (entry, format, add) => device.createRenderPipeline({ layout: plBlit, vertex: { module: mBlit, entryPoint: 'vs' },
  fragment: { module: mBlit, entryPoint: entry, targets: [{ format, blend: add ? { color: { srcFactor: 'one', dstFactor: 'one' }, alpha: { srcFactor: 'one', dstFactor: 'one' } } : undefined }] } });
const pMip8 = blitPipe('fsMip', 'rgba8unorm'), pMip16 = blitPipe('fsMip', HDR), pDown0 = blitPipe('fsDown0', HDR), pDown = blitPipe('fsDown', HDR), pUp = blitPipe('fsUp', HDR, true);
const blitBG = (view) => device.createBindGroup({ layout: bglBlit, entries: [{ binding: 0, resource: view }, { binding: 1, resource: sClamp }] });
const colorAtt = (view, clear) => ({ view, loadOp: clear ? 'clear' : 'load', storeOp: 'store', clearValue: [0, 0, 0, 0] });

// vertex layouts
const A = (shaderLocation, offset, format) => ({ shaderLocation, offset, format });
const vbSolid = { arrayStride: 16, attributes: [A(0, 0, 'float32x3'), A(1, 12, 'snorm8x4')] };
const ibSolid = { arrayStride: 48, stepMode: 'instance', attributes: [A(2, 0, 'float32x4'), A(3, 16, 'float32x4'), A(4, 32, 'float32x4')] };
const ibLeaf = { arrayStride: 36, stepMode: 'instance', attributes: [A(0, 0, 'float32x4'), A(1, 16, 'float32x4'), A(2, 32, 'unorm8x4')] };
const ibAnim = { arrayStride: 32, stepMode: 'instance', attributes: [A(2, 0, 'float32x4'), A(3, 16, 'float32x4')] };
const ibBub = { arrayStride: 32, stepMode: 'instance', attributes: [A(0, 0, 'float32x4'), A(1, 16, 'float32x4')] };
const ibSnow = { arrayStride: 16, stepMode: 'instance', attributes: [A(0, 0, 'float32x4')] };

const scenePipe = (m, vsE, fsE, buffers, o = {}) => device.createRenderPipeline({ layout: pl0,
  vertex: { module: m, entryPoint: vsE, buffers, constants: o.constants },
  fragment: { module: m, entryPoint: fsE, targets: [{ format: HDR, blend: o.blend }] },
  primitive: { topology: o.strip ? 'triangle-strip' : 'triangle-list', cullMode: o.cull || 'none' },
  depthStencil: { format: DEPTH, depthWriteEnabled: !o.blend, depthCompare: 'greater' }, multisample: { count: AA } });
const shadowPipe = (m, vsE, buffers, o = {}) => device.createRenderPipeline({ layout: pl0,
  vertex: { module: m, entryPoint: vsE, buffers, constants: o.constants },
  primitive: { topology: o.strip ? 'triangle-strip' : 'triangle-list', cullMode: o.cull || 'none' },
  depthStencil: { format: DEPTH, depthWriteEnabled: true, depthCompare: 'less', depthBias: 2, depthBiasSlopeScale: 1.5 } });

await say('Compiling shaders…', 0.05, 300);
const mSolid = mod(W_SOLID), mLeaf = mod(W_LEAF), mAnim = mod(W_ANIM), mSurf = mod(W_SURF), mSpr = mod(W_SPR);
const pTerrain = scenePipe(mSolid, 'vs', 'fs', [vbSolid, ibSolid], { cull: 'back' });
const vbClipLayout = { arrayStride: 16, attributes: [A(0, 0, 'float32x4')] };
const pClipmap = scenePipe(mSolid, 'vsClip', 'fs', [vbClipLayout], { cull: 'back' });
const pSolid = scenePipe(mSolid, 'vs', 'fs', [vbSolid, ibSolid]);
const pLeaf = scenePipe(mLeaf, 'vs', 'fs', [ibLeaf], { strip: true, constants: { ROWS: 9 } });
const pLeaf5 = scenePipe(mLeaf, 'vs', 'fs', [ibLeaf], { strip: true, constants: { ROWS: 5 } });
const pLeafS = scenePipe(mLeaf, 'vs', 'fs', [ibLeaf], { strip: true, constants: { ROWS: 3, FAR: 70 } });
const pLeafF = scenePipe(mLeaf, 'vs', 'fs', [ibLeaf], { strip: true, constants: { ROWS: 3 } });
const pFish = scenePipe(mAnim, 'vsFish', 'fsFish', [vbSolid, ibAnim]);
const pManta = scenePipe(mAnim, 'vsManta', 'fsManta', [vbSolid, ibAnim]);
const pTurtle = scenePipe(mAnim, 'vsTurtle', 'fsTurtle', [vbSolid, ibAnim]);
const pSurf = scenePipe(mSurf, 'vs', 'fs', [], { strip: true }), pOcean = scenePipe(mSurf, 'vsOcean', 'fsOcean', []), pBack = scenePipe(mSurf, 'vsB', 'fsB', [], { strip: true });
const pBub = scenePipe(mSpr, 'vsBub', 'fsBub', [ibBub], { strip: true, blend: { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } } });
const ADD = { color: { srcFactor: 'one', dstFactor: 'one' }, alpha: { srcFactor: 'one', dstFactor: 'one' } };
const diverParticleLayout = { arrayStride: 48, stepMode: 'instance',
  attributes: [A(0,0,'float32x4'), A(1,16,'float32x4'), A(2,32,'float32x4')] };
const pWake = scenePipe(mSpr,'vsWake','fsWake',[diverParticleLayout],{strip:true,blend:ADD});
const pJelly = scenePipe(mAnim, 'vsJelly', 'fsJelly', [vbSolid, ibAnim], { blend: ADD });
const pSnow = scenePipe(mSpr, 'vsSnow', 'fsSnow', [ibSnow], { strip: true, blend: ADD });
const pGl = scenePipe(mLeaf, 'vsGl', 'fsGl', [ibBub], { strip: true, blend: ADD });
const pSolidSh = shadowPipe(mSolid, 'vs', [vbSolid, ibSolid]), pTerrSh = shadowPipe(mSolid, 'vs', [vbSolid, ibSolid], { cull: 'front' });
const pLeafSh = shadowPipe(mLeaf, 'vs', [ibLeaf], { strip: true, constants: { ROWS: 3 } });

// third-person diver: its own bind group keeps the shared scene bindings intact
const mDiver = mod(W_DIVER);
const UBD = new Float32Array(520), uboD = device.createBuffer({ size: UBD.byteLength, usage: BU.UNIFORM | BU.COPY_DST });
const bglD = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: VF, buffer: {} }] });
const plD = device.createPipelineLayout({ bindGroupLayouts: [bgl0, bglD] });
const vbDiver = { arrayStride: 40, attributes: [A(0, 0, 'float32x3'), A(1, 12, 'float32x3'), A(2, 24, 'float32x4')] };
const pDiver = device.createRenderPipeline({ layout: plD,
  vertex: { module: mDiver, entryPoint: 'vs', buffers: [vbDiver, { arrayStride: 32, attributes: [A(3, 0, 'float32x4'), A(4, 16, 'float32x4')] }] },
  fragment: { module: mDiver, entryPoint: 'fs', targets: [{ format: HDR }] },
  primitive: { topology: 'triangle-list', cullMode: 'none' },
  depthStencil: { format: DEPTH, depthWriteEnabled: true, depthCompare: 'greater' }, multisample: { count: AA } });
const bgD = device.createBindGroup({ layout: bglD, entries: [{ binding: 0, resource: { buffer: uboD } }] });
const diverParticles = Diver.particles;
const particleBuffer = buf(diverParticles.data, BU.VERTEX);
const dvData = Diver.build();
const dvMesh = { vb: buf(dvData.verts, BU.VERTEX), skin: buf(dvData.skin, BU.VERTEX),
  ib: buf(dvData.idx, BU.INDEX), ic: dvData.ni };

const mWater = mod(W_WATER);
const pWater = device.createRenderPipeline({ layout: 'auto', vertex: { module: mWater, entryPoint: 'vs' }, fragment: { module: mWater, entryPoint: 'fs', targets: [{ format: HDR }] } });
const bgWater = device.createBindGroup({ layout: pWater.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uboW } }] });
const waterViews = [0, 1, 2, 3, 4].map((m) => tWater.createView({ baseMipLevel: m, mipLevelCount: 1 }));
const waterBG = waterViews.map((v) => blitBG(v));
const waterPass = waterViews.map((v) => ({ colorAttachments: [colorAtt(v, true)] }));

const mSand = mod(W_SAND);
const pSand = device.createRenderPipeline({ layout: 'auto', vertex: { module: mSand, entryPoint: 'vs' }, fragment: { module: mSand, entryPoint: 'fs', targets: [{ format: 'rg16float' }] } });
const sandViews = [tSandA.createView(), tSandB.createView()];
const bgSand = [0, 1].map((i) => device.createBindGroup({ layout: pSand.getBindGroupLayout(0), entries: [
  { binding: 0, resource: { buffer: uboSand } }, { binding: 1, resource: sandViews[i] }, { binding: 2, resource: sRep }] }));
const sandPass = [0, 1].map((i) => ({ colorAttachments: [colorAtt(sandViews[i], false)] }));
{
  const e = device.createCommandEncoder();
  for (let i = 0; i < 2; i++) e.beginRenderPass({ colorAttachments: [colorAtt(sandViews[i], true)] }).end();
  Q.submit([e.finish()]);
}
let sandFlip = 0, sandInit = false, sandPrevX = 0, sandPrevZ = 0, sandLastT = 0;

const mRays = mod(W_RAYS), mPost = mod(W_POST), mRB = mod(W_RBLUR);
const pRB = device.createRenderPipeline({ layout: 'auto', vertex: { module: mRB, entryPoint: 'vs' }, fragment: { module: mRB, entryPoint: 'fs', targets: [{ format: HDR }] } });
const pRays = device.createRenderPipeline({ layout: 'auto', vertex: { module: mRays, entryPoint: 'vs' }, fragment: { module: mRays, entryPoint: 'fs', targets: [{ format: HDR }] } });
const pPost = device.createRenderPipeline({ layout: 'auto', vertex: { module: mPost, entryPoint: 'vs' }, fragment: { module: mPost, entryPoint: 'fs', targets: [{ format: FMT }] } });

// ---------------------------------------------------------------- sun + shadow matrix
const SUN = (() => { const v = [0.27, 1, -0.24], l = hypot(...v); return v.map((c) => c / l); })();
{
  const L = SUN, lr = [L[1], -L[0], 0], ll = hypot(...lr); lr[0] /= ll; lr[1] /= ll;
  const lu = [L[1] * lr[2] - L[2] * lr[1], L[2] * lr[0] - L[0] * lr[2], L[0] * lr[1] - L[1] * lr[0]];
  const R = 225, d0 = -175, d1 = 125, m = UBS;
  m[0] = lr[0] / R; m[4] = lr[1] / R; m[8] = lr[2] / R; m[12] = 0;
  m[1] = lu[0] / R; m[5] = lu[1] / R; m[9] = lu[2] / R; m[13] = 0;
  m[2] = -L[0] / (d1 - d0); m[6] = -L[1] / (d1 - d0); m[10] = -L[2] / (d1 - d0); m[14] = d1 / (d1 - d0);
  m[3] = 0; m[7] = 0; m[11] = 0; m[15] = 1;
  for (let i = 0; i < 16; i++) { UBS[16 + i] = m[i]; UB[16 + i] = m[i]; }
  for (let i = 0; i < 3; i++) { UB[48 + i] = UBS[48 + i] = SUN[i]; }
  UBS[32] = 0; UBS[33] = -20; UBS[34] = 0; UBS[35] = 0; UBS[58] = 1;
  Q.writeBuffer(uboS, 0, UBS);
}

// ---------------------------------------------------------------- world generation
await say('正在雕刻海床…', 0.25, 1200);
let D;
{
  const prims = primBuffer();
  const m = mod(W_DENS), p = device.createComputePipeline({ layout: 'auto', compute: { module: m, entryPoint: 'main' } });
  const size = NX * NY * NZ * 4;
  const u = new ArrayBuffer(48), uu = new Uint32Array(u), uf = new Float32Array(u);
  uu[0] = NX; uu[1] = NY; uu[2] = NZ; uf[4] = OX; uf[5] = OY; uf[6] = OZ; uf[7] = VS;
  uu[8] = MESAS.length; uu[9] = ARCHES.length; uu[10] = HOLES.length; uu[11] = CLEARS.length;
  const bu = buf(new Uint8Array(u), BU.UNIFORM), bp = buf(prims, BU.STORAGE);
  const bd = device.createBuffer({ size, usage: BU.STORAGE | BU.COPY_SRC }), br = device.createBuffer({ size, usage: BU.MAP_READ | BU.COPY_DST });
  const bg = device.createBindGroup({ layout: p.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: bu } }, { binding: 1, resource: { buffer: bd } }, { binding: 2, resource: { buffer: bp } }] });
  const e = device.createCommandEncoder(), c = e.beginComputePass();
  c.setPipeline(p); c.setBindGroup(0, bg); c.dispatchWorkgroups(NX / 4, NY / 4, NZ / 4); c.end();
  e.copyBufferToBuffer(bd, 0, br, 0, size);
  Q.submit([e.finish()]);
  await br.mapAsync(GPUMapMode.READ);
  D = new Float32Array(br.getMappedRange().slice(0));
  br.unmap(); br.destroy(); bd.destroy();
  // rock connected to the seabed: each column's unbroken run up from the bottom is, and the rock above a gap
  // (overhangs, specks) is when it touches rock that is. What never connects is a speck of noise floating in
  // the water (surface nets would make it a small box), so it becomes water
  const S = NX * NY, R = new Uint8Array(D.length), O = [1, -1, NX, -NX, S, -S], b = new Uint8Array(NX), L = [];
  for (let i = 0; i < D.length;) { b.fill(1); for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++, i++) if (D[i] <= 0) b[x] = 0; else if (b[x]) R[i] = 1; else L.push(i); }
  for (let k = 1; k; L.reverse()) { k = 0; for (const i of L) if (!R[i] && O.some((o) => R[i + o])) R[i] = k = 1; }
  for (const i of L) if (!R[i]) D[i] = -D[i];
}
// Distance to the rock for collide(), in 1/127 m (> 0 in rock, clamped to ±1 m), kept only in the 4x4x4-voxel
// bricks near the surface within the camera's reach (~2 MB). CI per brick: 0 all water, 1 all rock, n brick n-2 in CG.
const SWIM_RADIUS = OUTER_SWIM_RADIUS;
const CO = 8, CN = 124, CI = new Uint32Array(CN * CN * NY / 4);
let CG = new Int8Array(64 * 65534);
{
  let n = 0;
  for (let bz = 0; bz < CN; bz++) for (let by = 1; by < NY / 4 - 1; by++) for (let bx = 0; bx < CN; bx++) {
    if (hypot(bx - CN / 2 + 0.5, bz - CN / 2 + 0.5) > 61) continue; // Includes room for the trailing camera.
    if ((n+1)*64 > CG.length) { const larger=new Int8Array(CG.length*2); larger.set(CG); CG=larger; }
    let lo = 127, hi = -127;
    for (let z = 0; z < 4; z++) for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const i = CO + bx * 4 + x + NX * (by * 4 + y + NY * (CO + bz * 4 + z)), gz = D[i + NX * NY] - D[i - NX * NY];
      const gx = D[i + 1] - D[i - 1], g = D[i + NX] - D[i - NX], l = sqrt(gx * gx + g * g + gz * gz) / 1.5;
      const q = round(clamp(D[i] / max(l, 0.05), -1, 1) * 127);
      CG[n * 64 + x + 4 * y + 16 * z] = q; if (q < lo) lo = q; if (q > hi) hi = q;
    }
    CI[bx + CN * (by + NY / 4 * bz)] = lo === hi && lo * lo === 16129 ? +(lo > 0) : (n++, n + 1);
  }
  CG = CG.slice(0, n * 64);
}
await say('Carving canyons…', 0.32, 400);
const T = buildTerrain(D);

// preset viewpoints (position, look-at), keys 1-6; the world generator dresses the scene around them
const POSES = [
  [10, 1.3, 7, -9, -31, -10],
  [50, 1.3, 34, 58, -23, 8],
  [-26, 2.2, -100, 0, -9, -108],
  [-55, 1.5, -18, -60, -30, 8],
  [10, 1.2, -62, 6, -22, -90],
  [3, 1.6, 62, 1, -28, 100],
  [152, 4, 25, 163, -28, 25],
  [142, 4, -82, 151, -30, -82],
];
// 60 s camera path (position + look-at, Catmull-Rom): the world generator keeps it clear, dev.js flies along it
const FLY = new Float32Array([
  10, -42.2, 7, -9, -31, -10,
  7.5, -41.8, 5.5, -10, -31, -12,
  9, -40.5, 18, 17, -37, 42,
  22, -39.2, 40, 48, -36, 45,
  38, -39.2, 46, 57, -27, 18,
  50, -40.4, 35, 58, -24, 8,
  55, -39, 20, 60, -18, -10,
  58, -34, -12, 40, -26, -60,
  50, -30, -44, 10, -26, -80,
  30, -30, -70, 4, -28, -90,
  12, -38.5, -62, 6, -27, -90,
  -4, -36.5, -70, 0, -14, -100,
  -16, -37, -84, 0, -22, -108,
  -29, -38, -90, -44, -34, -60,
  -41, -38, -70, -56, -34, -40,
  -53, -38, -50, -60, -34, -20,
  -58, -38, -28, -60, -32, 0,
  -57, -38, -10, -60, -30, 16,
  -60, -38, 10, -50, -36, 40,
  -52, -37, 36, -20, -35, 44,
  -22, -38, 43, 4, -38, 52,
  -6, -39.2, 44.5, 4, -37, 70,
  3, -40.6, 53, 3, -35, 84,
  3, -41.5, 62, 1, -30, 100,
  4, -39, 76, 3, -22, 100,
]);
const FLYN = FLY.length / 6, FLYT = 60, LUTN = 1024, flyLUT = new Float32Array(LUTN + 1);
const flyPts = [];
// per-frame float state lives in one preallocated array, so the frame loop allocates no heap numbers
const F = new Float64Array(32), P6 = new Float64Array(6);
// RC: rendered camera position. F[CX..CZ] is the diver's body; in third person
// the two differ. POSES uses F for the camera presets.
const RC = new Float64Array(3);
let diver = null;
const CX = 0, CY = 1, CZ = 2, YAW = 3, PIT = 4, FX = 5, FY = 6, FZ = 7, RX = 8, RZ = 9, UX = 10, UY = 11, UZ = 12, VX = 13, VY = 14, VZ = 15, TIME = 16, FLT = 17, LAST = 18, GPU = 19, HUDT = 20, SPL = 21, MX = 22, MY = 23, MZ = 24;
// aim the camera from P6 = position + look-at point
function aim() {
  const dx = P6[3] - P6[0], dy = P6[4] - P6[1], dz = P6[5] - P6[2];
  F[CX] = P6[0]; F[CY] = P6[1]; F[CZ] = P6[2];
  F[YAW] = atan2(dx, -dz); F[PIT] = atan2(dy, sqrt(dx * dx + dz * dz));
}
const lookAt = (x, y, z, tx, ty, tz) => { P6[0] = x; P6[1] = y; P6[2] = z; P6[3] = tx; P6[4] = ty; P6[5] = tz; aim(); };
// camera spline (Catmull-Rom over position + look-at) at parameter F[SPL]
function flyRaw() {
  const s = F[SPL]; let i = floor(s) | 0; if (i > FLYN - 2) i = FLYN - 2;
  const u = s - i, i0 = (i > 0 ? i - 1 : 0) * 6, i1 = i * 6, i2 = (i + 1) * 6, i3 = (i + 2 < FLYN ? i + 2 : FLYN - 1) * 6;
  for (let o = 0; o < 6; o++) {
    const a = FLY[i0 + o], b = FLY[i1 + o], c = FLY[i2 + o], d = FLY[i3 + o];
    P6[o] = 0.5 * (2 * b + (c - a) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (3 * b - a - 3 * c + d) * u * u * u);
  }
  aim();
}
{ // arc-length table: flyLUT[k] = spline parameter at fraction k/LUTN of the total path length
  const M = 4096, len = new Float32Array(M + 1); let px = 0, py = 0, pz = 0;
  for (let k = 0; k <= M; k++) { F[SPL] = k / M * (FLYN - 1); flyRaw(); if (k) len[k] = len[k - 1] + hypot(F[CX] - px, F[CY] - py, F[CZ] - pz); px = F[CX]; py = F[CY]; pz = F[CZ]; }
  for (let k = 0, j = 0; k <= LUTN; k++) { const d = k / LUTN * len[M]; while (j < M - 1 && len[j + 1] < d) j++; flyLUT[k] = (j + (d - len[j]) / max(len[j + 1] - len[j], 1e-6)) / M * (FLYN - 1); }
}
// camera on the scripted path at time F[FLT]
function flyAt() {
  let s = F[FLT] / FLYT; s = s < 0 ? 0 : s > 1 ? 1 : s; s = s * s * (3 - 2 * s) * 0.25 + s * 0.75;
  s *= LUTN; let k = floor(s) | 0; if (k > LUTN - 1) k = LUTN - 1;
  F[SPL] = flyLUT[k] + (flyLUT[k + 1] - flyLUT[k]) * (s - k); flyRaw();
}
for (let t = 0; t <= FLYT; t += 0.1) { F[FLT] = t; flyAt(); flyPts.push([F[CX], F[CY], F[CZ]]); }
for (const p of POSES) flyPts.push([p[0], -40, p[2]]);

await say('正在种植海藻…', 0.73, 2500);
const Wd = makeWorld(D, T, flyPts, POSES);
for (const p of POSES) p[1] += Wd.gy(p[0], p[2]);
// Index 8 mirrors the whale fluke for the return-home journal entry; indices 9..12 are the 4 outer-ocean wonders.
POSES.push(POSES[0].slice());
for (const lm of OUTER_LANDMARKS) {
  const gy = outerHeight(lm.x, lm.z);
  POSES.push([lm.x + lm.lookOff[0], gy + lm.lookOff[1], lm.z + lm.lookOff[2], lm.x, gy + lm.archR * 0.55, lm.z]);
}
// Keep a coarse seabed map for locating currents after releasing the generator, seamlessly blended into outerHeight().
const currentBed = Float32Array.from({length: 47 * 47}, (_,i) =>
  Wd.gy((i % 47 - 23) * 8, (Math.floor(i / 47) - 23) * 8));
function currentBedHeight(x,z) {
  const edge = outerEdge(x, z);
  if (edge >= 178) return outerHeight(x, z);
  const gx=clamp(x/8+23,0,46), gz=clamp(z/8+23,0,46);
  const ix=min(45,floor(gx)), iz=min(45,floor(gz));
  const i=iz*47+ix;
  const near=mix(currentBed[i],currentBed[i+1],gx-ix);
  const far=mix(currentBed[i+47],currentBed[i+48],gx-ix);
  const coreH = mix(near,far,gz-iz);
  if (edge <= 166) return coreH;
  return mix(coreH, outerHeight(x, z), sstep(166, 178, edge));
}
D = Wd.gy = T.smp = null; // with gy goes the generator's working memory (about 200 MB)

await say('正在搭建场景亮点…', 0.94, 1200);
// mesh ids: 0-3 boulders, 4-6 sponges, 7-8 coral, 9 tube sponge, 10 whale fluke, 11 ship, 12 manta, 13 fish,
// 14-20 rock chunks + pebbles, 21-22 coral LOD, 23-25 far LOD of the large rock chunks
const meshes = [meshChunk(1, 3), meshChunk(7, 3), meshChunk(13, 3), meshChunk(22, 3),
  meshLathe([[0, 0, 0.5], [0.34, 0, 0.6], [0.5, 0.2, 0.85], [0.6, 0.6, 1], [0.55, 0.95, 1], [0.47, 1.08, 1], [0.38, 1.1, 0.9], [0.3, 1.0, 0.45], [0.26, 0.6, 0.15], [0, 0.35, 0.05]], 18, 0.3, 9),
  meshLathe([[0, 0, 0.5], [0.2, 0, 0.6], [0.26, 0.5, 0.85], [0.4, 1.25, 1], [0.4, 1.42, 1], [0.33, 1.48, 0.9], [0.26, 1.38, 0.4], [0.18, 0.8, 0.12], [0, 0.5, 0.05]], 16, 0.35, 8),
  meshLathe([[0, 0, 0.5], [0.5, 0, 0.7], [0.72, 0.18, 1], [0.74, 0.38, 1], [0.62, 0.5, 0.9], [0.48, 0.42, 0.45], [0.4, 0.2, 0.15], [0, 0.14, 0.06]], 18, 0.25, 10),
  meshCoral(0), meshCoral(1), meshTubes()].map((m) => m.build());
meshes.push(meshFluke(), meshShip().build(), meshManta().build(), meshFish().build(),
  meshChunk(3).build(), meshChunk(11).build(), meshChunk(29).build(), meshChunk(5, 3).build(), meshChunk(17, 3).build(), meshChunk(41, 3).build(), meshChunk(9, 1).build(), meshCoral(0, 1).build(), meshCoral(1, 1).build(), meshChunk(5, 2, 1).build(), meshChunk(17, 2, 1).build(), meshChunk(41, 2, 1).build());
const TURTLE = meshTurtle().build();
const JELLY = meshJelly().build();
const OUTER_ARCH = meshOuterArch().build();
meshes.push(TURTLE, JELLY, OUTER_ARCH);
// center xyz, patrol radius, initial angle, angular speed, body scale, padding
const turtles = new Float32Array([
  -.5, -38, .5, 6, -1.32, .146, 2.2, 0,
  52, -31, 18, 7, .36, -.123, 2.45, 0,
  -12, -30, -102, 8, 2.15, .104, 2.05, 0,
]);
const ibTurtle = buf(turtles, BU.VERTEX);
const jellies = new Float32Array([
  1, -32, 76, 0, .4, 0, .72, 0,
  6, -31, 82, 0, 1.8, 0, .95, 0,
  -1, -30, 81, 0, 3.1, 0, 1.02, 0,
  5, -29, 88, 0, 4.7, 0, 1.15, 0,
  2, -33, 92, 0, 5.4, 0, .76, 0,
]);
const ibJelly = buf(jellies, BU.VERTEX);
let nV = 0, nI = 0;
for (const m of meshes) { m.v0 = nV; m.i0 = nI; nV += m.nv; nI += m.ib.length; }
const allV = new Uint8Array(nV * 16), allI = new Uint32Array(nI);
for (const m of meshes) { allV.set(new Uint8Array(m.vb), m.v0 * 16); allI.set(m.ib, m.i0); }
const vbMesh = buf(allV, BU.VERTEX), ibMesh = buf(allI, BU.INDEX);
const vbTerrain = buf(new Uint8Array(T.vb), BU.VERTEX), ibTerrain = buf(T.ib, BU.INDEX);
const nSolid = Wd.solids.data.length / 12;
const solidData = new Float32Array((nSolid + 1) * 12); solidData.set(Wd.solids.data); solidData.set([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0], nSolid * 12);
const ibSolids = buf(solidData, BU.VERTEX);
const ibChunk = Wd.chunks.map((c) => buf(c.data, BU.VERTEX)), ibProp = Wd.props.map((c) => buf(c.data, BU.VERTEX));
const ibBig = buf(new Uint8Array(Wd.big.buf), BU.VERTEX), ibBigF = buf(new Uint8Array(Wd.bigF.buf), BU.VERTEX), ibSmall = buf(new Uint8Array(Wd.small.buf), BU.VERTEX);
const ibFish = buf(Wd.fish, BU.VERTEX), ibManta = buf(Wd.mantas, BU.VERTEX), ibBubbles = buf(Wd.bubbles, BU.VERTEX), ibSnowB = buf(Wd.snow, BU.VERTEX);
const ibGl = buf(Wd.glints, BU.VERTEX), nGl = Wd.glints.length / 8;
const nFish = Wd.fish.length / 8, nManta = Wd.mantas.length / 8, nBub = Wd.bubbles.length / 8, nSnow = Wd.snow.length / 4;
const MANTA = meshes[12], FISH = meshes[13];
const clipMesh = buildClipmapMesh();
const vbClip = buf(clipMesh.vb, BU.VERTEX), ibClip = buf(clipMesh.ib, BU.INDEX);
const outerStream = createOuterStreamer();
const ibOuterArch = buf(outerStream.archBuf, BU.VERTEX);
const ibOuterRock = outerStream.rockBufs.map((a) => device.createBuffer({ size: a.byteLength, usage: BU.VERTEX | BU.COPY_DST }));
const ibOuterProp = outerStream.propBufs.map((a) => device.createBuffer({ size: a.byteLength, usage: BU.VERTEX | BU.COPY_DST }));
const ibOuterLeaf = device.createBuffer({ size: outerStream.leafBuf.byteLength, usage: BU.VERTEX | BU.COPY_DST });
const ibOuterFish = device.createBuffer({ size: outerStream.fishBuf.byteLength, usage: BU.VERTEX | BU.COPY_DST });
const ibOuterTurtle = device.createBuffer({ size: outerStream.turtleBuf.byteLength, usage: BU.VERTEX | BU.COPY_DST });
const ibOuterManta = device.createBuffer({ size: outerStream.mantaBuf.byteLength, usage: BU.VERTEX | BU.COPY_DST });
const ibOuterJelly = device.createBuffer({ size: outerStream.jellyBuf.byteLength, usage: BU.VERTEX | BU.COPY_DST });
const ibOuterBub = device.createBuffer({ size: outerStream.bubbleBuf.byteLength, usage: BU.VERTEX | BU.COPY_DST });
function uploadOuterStream() {
  if (!outerStream.dirty) return;
  for (let i = 0; i < 2; i++) if (outerStream.rockCounts[i]) Q.writeBuffer(ibOuterRock[i], 0, outerStream.rockBufs[i], 0, outerStream.rockCounts[i] * 12);
  for (let i = 0; i < 4; i++) if (outerStream.propCounts[i]) Q.writeBuffer(ibOuterProp[i], 0, outerStream.propBufs[i], 0, outerStream.propCounts[i] * 12);
  if (outerStream.leafCount) Q.writeBuffer(ibOuterLeaf, 0, outerStream.leafBuf, 0, outerStream.leafCount * 36);
  if (outerStream.fishCount) Q.writeBuffer(ibOuterFish, 0, outerStream.fishBuf, 0, outerStream.fishCount * 8);
  if (outerStream.turtleCount) Q.writeBuffer(ibOuterTurtle, 0, outerStream.turtleBuf, 0, outerStream.turtleCount * 8);
  if (outerStream.mantaCount) Q.writeBuffer(ibOuterManta, 0, outerStream.mantaBuf, 0, outerStream.mantaCount * 8);
  if (outerStream.jellyCount) Q.writeBuffer(ibOuterJelly, 0, outerStream.jellyBuf, 0, outerStream.jellyCount * 8);
  if (outerStream.bubbleCount) Q.writeBuffer(ibOuterBub, 0, outerStream.bubbleBuf, 0, outerStream.bubbleCount * 8);
  outerStream.clearDirty();
}
Q.writeTexture({ texture: tVol }, Wd.volD, { bytesPerRow: NX, rowsPerImage: NY / 2 }, [NX / 2, NY / 2, NZ / 2]);
Q.writeTexture({ texture: tMap }, Wd.gm, { bytesPerRow: 2048 }, [512, 512]);

// ---------------------------------------------------------------- one-time bakes: detail texture, shadow map
{
  const m = mod(W_DETAIL), p = device.createRenderPipeline({ layout: 'auto', vertex: { module: m, entryPoint: 'vs' }, fragment: { module: m, entryPoint: 'fs', targets: [{ format: 'rgba8unorm' }] } });
  const e = device.createCommandEncoder();
  let r = e.beginRenderPass({ colorAttachments: [colorAtt(tDetail.createView({ baseMipLevel: 0, mipLevelCount: 1 }), true)] });
  r.setPipeline(p); r.draw(3); r.end();
  for (let i = 1; i < 11; i++) {
    r = e.beginRenderPass({ colorAttachments: [colorAtt(tDetail.createView({ baseMipLevel: i, mipLevelCount: 1 }), true)] });
    r.setPipeline(pMip8); r.setBindGroup(0, blitBG(tDetail.createView({ baseMipLevel: i - 1, mipLevelCount: 1 }))); r.draw(3); r.end();
  }
  r = e.beginRenderPass({ colorAttachments: [], depthStencilAttachment: { view: tShadow.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' } });
  r.setBindGroup(0, bg0s);
  r.setPipeline(pTerrSh);
  r.setVertexBuffer(0, vbTerrain); r.setVertexBuffer(1, ibSolids); r.setIndexBuffer(ibTerrain, 'uint32');
  r.drawIndexed(T.ib.length, 1, 0, 0, nSolid);
  r.setPipeline(pSolidSh); r.setVertexBuffer(0, vbMesh); r.setIndexBuffer(ibMesh, 'uint32');
  for (let i = 0; i < 12; i++) { const g = Wd.solids.ranges[i]; if (g[1]) r.drawIndexed(meshes[i].ib.length, g[1], meshes[i].i0, meshes[i].v0, g[0]); }
  // small rocks, sponges and corals (~35M triangles) only on High: too much for a phone's driver
  if (!LV) for (let i = 0; i < NCHUNK; i++) { r.setVertexBuffer(1, ibChunk[i]); r.drawIndexed(meshes[14 + i].ib.length, Wd.chunks[i].n, meshes[14 + i].i0, meshes[14 + i].v0, 0); }
  if (!LV) for (let i = 0; i < 6; i++) if (Wd.props[i].n) { r.setVertexBuffer(1, ibProp[i]); r.drawIndexed(meshes[4 + i].ib.length, Wd.props[i].n, meshes[4 + i].i0, meshes[4 + i].v0, 0); }
  r.setPipeline(pLeafSh); r.setVertexBuffer(0, ibBig); r.draw(6, Wd.big.n);
  r.end();
  Q.submit([e.finish()]);
}
// the GPU has its own copies now: let go of the generator's (about 300 MB)
for (const o of [Wd.big, Wd.bigF, Wd.small, ...Wd.chunks, ...Wd.props]) o.buf = o.data = 0;
Wd.glints = Wd.volD = Wd.gm = T.vb = T.ib = T.wp = T.wn = 0;

// ---------------------------------------------------------------- render targets (rebuilt on resize)
// The scene is drawn at `pix` pixels and scaled up to the window. frame() tunes it and the draw distance scale `det`
// for 60 fps.
let PIXMAX = 410000;
const PIXMIN = 250000, DETMIN = 0.4;
let W = 0, H = 0, DW = 0, DH = 0, pix = PIXMAX, det = 1, dynN = 0, dynT = 0, dynG = 0, dynGN = 0, dynBad = 0, dynOk = 0, dynWait = 3;
let passScene, passRays, passBlur, bgBlur, passPost, bgRays, bgPost, bloomPass = [], bloomBG = [], targets = [];
const NB = 6;
function resize() {
  DW = max(2, round(canvas.clientWidth * devicePixelRatio)); DH = max(2, round(canvas.clientHeight * devicePixelRatio));
  const s = min(1, sqrt(pix / (DW * DH)));
  const w = max(2, round(DW * s) & ~1), h = max(2, round(DH * s) & ~1);
  if (w === W && h === H) return;
  dynN = dynG = dynGN = 0; dynT = -300; // let the new size settle before measuring again
  W = w; H = h; canvas.width = W; canvas.height = H;
  ctx.configure({ device, format: FMT, alphaMode: 'opaque' });
  for (const t of targets) t.destroy();
  const tMS = tex(AA > 1 ? W : 1, H, HDR, TU.RENDER_ATTACHMENT, { samples: AA }), tDp = tex(W, H, DEPTH, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING, { samples: AA });
  const tRes = tex(W, H, HDR, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING), tRay = tex(W / 2, H / 2, HDR, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING), tRay2 = tex(W / 2, H / 2, HDR, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING);
  targets = [tMS, tDp, tRes, tRay, tRay2];
  const bl = [];
  for (let i = 0; i < NB; i++) { const t = tex(max(1, W >> (i + 1)), max(1, H >> (i + 1)), HDR, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING); bl.push(t); targets.push(t); }
  const vDp = tDp.createView(), vRes = tRes.createView(), vRay = tRay.createView(), vRay2 = tRay2.createView(), vBl = bl.map((t) => t.createView());
  // without anti-aliasing (Low) the scene goes straight into the resolve target, and tMS is one unused column
  passScene = { colorAttachments: [{ view: AA > 1 ? tMS.createView() : vRes, resolveTarget: AA > 1 ? vRes : undefined, loadOp: 'clear', storeOp: AA > 1 ? 'discard' : 'store', clearValue: [0, 0, 0, 1] }],
    depthStencilAttachment: { view: vDp, depthClearValue: 0, depthLoadOp: 'clear', depthStoreOp: 'store' } };
  passRays = { colorAttachments: [colorAtt(vRay, true)] };
  passBlur = { colorAttachments: [colorAtt(vRay2, true)] };
  bgBlur = device.createBindGroup({ layout: pRB.getBindGroupLayout(0), entries: [{ binding: 0, resource: vRay }] });
  passPost = { colorAttachments: [{ view: null, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] };
  bgRays = device.createBindGroup({ layout: pRays.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: ubo } }, { binding: 1, resource: sRep }, { binding: 2, resource: sCmp },
    { binding: 3, resource: tShadow.createView() }, { binding: 4, resource: tWater.createView() }, { binding: 5, resource: vDp }, { binding: 6, resource: tVol.createView() }, { binding: 7, resource: sClamp }] });
  bgPost = device.createBindGroup({ layout: pPost.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: ubo } }, { binding: 1, resource: sClamp }, { binding: 2, resource: vRes },
    { binding: 3, resource: vRay2 }, { binding: 4, resource: vBl[0] }, { binding: 5, resource: vDp }] });
  bloomPass = []; bloomBG = [];
  // down: res -> b0 -> ... -> b5 ; up: b5 -> b4 (additive) ... -> b0
  for (let i = 0; i < NB; i++) { bloomPass.push({ colorAttachments: [colorAtt(vBl[i], true)] }); bloomBG.push(blitBG(i ? vBl[i - 1] : vRes)); }
  for (let i = NB - 1; i > 0; i--) { bloomPass.push({ colorAttachments: [colorAtt(vBl[i - 1], false)] }); bloomBG.push(blitBG(vBl[i])); }
  UB[52] = W; UB[53] = H; UB[54] = 1 / W; UB[55] = 1 / H;
}
resize();
addEventListener('resize', resize);

// ---------------------------------------------------------------- timing (GPU timestamp queries)
let qs, qResolve, qRead = [], tsBegin, tsEnd;
if (hasTS) {
  qs = device.createQuerySet({ type: 'timestamp', count: 2 });
  qResolve = device.createBuffer({ size: 16, usage: BU.QUERY_RESOLVE | BU.COPY_SRC });
  for (let i = 0; i < 6; i++) {
    const b = device.createBuffer({ size: 16, usage: BU.MAP_READ | BU.COPY_DST });
    const o = { b, busy: false, done: null };
    o.done = () => {
      const a = new BigInt64Array(b.getMappedRange());
      const ms = Number(a[1] - a[0]) / 1e6; F[GPU] = ms; b.unmap(); o.busy = false;
      if (dynT > 0 && ms > 0 && ms < 1e3) { dynG += ms; dynGN++; }
    };
    qRead.push(o);
  }
  tsBegin = { querySet: qs, beginningOfPassWriteIndex: 0 }; tsEnd = { querySet: qs, endOfPassWriteIndex: 1 };
}

// ---------------------------------------------------------------- frame
let hud = false;
let mdx = 0, mdy = 0, lkx = 0, lky = 0, l2x = 0, l2y = 0, hN = 0, hMax = 0, hMin = 1e9, hPer = 1e9, hLate = 0, hTot = 0;
let touchDepth = 0;
// 双指触控：左侧浮动摇杆游动，右侧滑动环顾，捏合调整跟随距离（见 touch.js）
const touch = createTouchControls({ radius: 54 });
const touchLook = { x: 0, y: 0, zoom: 0 };
let touchSens = 1, touchInvert = false;
let TANH = 0.6;
const NEAR = 0.1, EXPO = 0.62, RAYS = 0.54;
const submitList = [null];
const rowOrd = new Uint8Array(CELLS);
// Draws the cells of a cell-sorted buffer that are in view and within [minD, maxD) (scaled by `det`, but not for the
// terrain) as merged runs, nearest rows first.
function drawCells(r, start, lo, hi, mar, indexed, verts, minD, maxD) {
  const cx = RC[0], cy = RC[1], cz = RC[2], fx = F[FX], fy = F[FY], fz = F[FZ], rx = F[RX], rz = F[RZ], ux = F[UX], uy = F[UY], uz = F[UZ];
  const ds = indexed === 1 ? 1 : det * det;
  const tx = TANH * W / H, hw = CELLW * 0.5, ex = hw + mar, min2 = minD * minD * ds, max2 = maxD * maxD * ds;
  for (let k = 0; k < CELLS; k++) {
    const rw = rowOrd[k], row = rw * CELLS, pz = OZ + (rw + 0.5) * CELLW - cz, hz = max(abs(pz) - hw, 0);
    let run = -1;
    for (let x = 0; x <= CELLS; x++) {
      const c = row + x; let v = false;
      if (x < CELLS) {
        const l = lo[c], h = hi[c];
        if (l <= h) {
          const px = OX + (x + 0.5) * CELLW - cx, py = (l + h) * 0.5 - cy, ey = (h - l) * 0.5 + mar, hx = max(abs(px) - hw, 0), h2 = hx * hx + hz * hz;
          if (h2 < max2 && h2 >= min2) {
            const lim = px * fx + py * fy + pz * fz + ex * abs(fx) + ey * abs(fy) + ex * abs(fz);
            if (lim >= 0 && abs(px * rx + pz * rz) - ex * (abs(rx) + abs(rz)) <= lim * tx) v = abs(px * ux + py * uy + pz * uz) - ex * (abs(ux) + abs(uz)) - ey * abs(uy) <= lim * TANH;
          }
        }
      }
      if (v) { if (run < 0) run = c; } else if (run >= 0) {
        const a = start[run], n = start[c] - a;
        if (n > 0) { if (indexed === 1) r.drawIndexed(n * 6, 1, a * 6, 0, nSolid); else if (indexed) r.drawIndexed(indexed.ib.length, n, indexed.i0, indexed.v0, a); else r.draw(verts, n, 0, a); }
        run = -1;
      }
    }
  }
}
function render() {
  // camera basis (right vector is horizontal)
  const cx = RC[0], cy = RC[1], cz = RC[2], pitch = F[PIT], yaw = F[YAW];
  const cp = cos(pitch), fy = sin(pitch), rx = cos(yaw), rz = sin(yaw), fx = cp * rz, fz = -cp * rx;
  const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
  F[FX] = fx; F[FY] = fy; F[FZ] = fz; F[RX] = rx; F[RZ] = rz; F[UX] = ux; F[UY] = uy; F[UZ] = uz;
  const asp = W / H, sx = 1 / (TANH * asp), sy = 1 / TANH, m = UB;
  m[0] = rx * sx; m[4] = 0; m[8] = rz * sx; m[12] = -(rx * cx + rz * cz) * sx;
  m[1] = ux * sy; m[5] = uy * sy; m[9] = uz * sy; m[13] = -(ux * cx + uy * cy + uz * cz) * sy;
  m[2] = 0; m[6] = 0; m[10] = 0; m[14] = NEAR;
  m[3] = fx; m[7] = fy; m[11] = fz; m[15] = -(fx * cx + fy * cy + fz * cz);
  m[32] = cx; m[33] = cy; m[34] = cz; m[35] = F[TIME];
  m[36] = rx; m[37] = 0; m[38] = rz; m[39] = TANH * asp;
  m[40] = ux; m[41] = uy; m[42] = uz; m[43] = TANH;
  m[44] = fx; m[45] = fy; m[46] = fz; m[47] = NEAR;
  m[51] = outerPurpleZone(cx, cz);
  let ek = (-cy - 8) / 26; ek = ek < 0 ? 0 : ek > 1 ? 1 : ek;
  m[56] = EXPO * (0.6 + 0.4 * ek); m[57] = RAYS; m[58] = det;
  m[60] = F[CX]; m[61] = F[CY]; m[62] = F[CZ]; m[63] = menu ? 0 : 1;
  m.set(pulsePos,64); m[67] = F[TIME]-pulseTime;
  m[68]=sin(diver.yaw)*cos(diver.pitch); m[69]=sin(diver.pitch); m[70]=-cos(diver.yaw)*cos(diver.pitch); m[71]=Number(lamp);
  m.set(splashPos,72); m[75]=F[TIME]-splashTime;
  const powerSave = PIXMAX <= PIXMIN;
  const sandActive = !powerSave;
  const sandCenterX = diver ? diver.pos[0] : cx;
  const sandCenterZ = diver ? diver.pos[2] : cz;
  m[76] = sandCenterX; m[77] = sandCenterZ; m[78] = 1 / SAND_SIZE; m[79] = sandActive ? 1 : 0;
  Q.writeBuffer(ubo, 0, UB);
  WT[0] = F[TIME]; Q.writeBuffer(uboW, 0, WT);

  // Update toroidal outer-ocean ecological instance pools when crossing 24m cell boundaries
  if (outerStream.update(cx, cz, det, powerSave)) uploadOuterStream();

  { let cr = floor((cz - OZ) / CELLW) | 0; cr = cr < 0 ? 0 : cr > CELLS - 1 ? CELLS - 1 : cr; let n = 0; rowOrd[n++] = cr; for (let d = 1; d < CELLS; d++) { if (cr - d >= 0) rowOrd[n++] = cr - d; if (cr + d < CELLS) rowOrd[n++] = cr + d; } }
  const e = device.createCommandEncoder();
  let slot = null;
  if (hasTS) { for (let i = 0; i < qRead.length; i++) if (!qRead[i].busy) { slot = qRead[i]; break; } }
  waterPass[0].timestampWrites = slot ? tsBegin : undefined;
  passPost.timestampWrites = slot ? tsEnd : undefined;
  // animated water texture + mips
  let r = e.beginRenderPass(waterPass[0]); r.setPipeline(pWater); r.setBindGroup(0, bgWater); r.draw(3); r.end();
  for (let i = 1; i < 5; i++) { r = e.beginRenderPass(waterPass[i]); r.setPipeline(pMip16); r.setBindGroup(0, waterBG[i - 1]); r.draw(3); r.end(); }
  // toroidal sand-trail deformation ping-pong pass (disabled in power-saving mode)
  if (sandActive && diver) {
    const sdt = clamp(F[TIME] - sandLastT, 0, 0.1);
    sandLastT = F[TIME];
    const bedY = currentBedHeight(diver.pos[0], diver.pos[2]);
    const clear = diver.airborne ? 99 : (diver.pos[1] - bedY);
    const fxD = sin(diver.yaw), fzD = -cos(diver.yaw);
    SU[0] = sandPrevX; SU[1] = sandPrevZ; SU[2] = SAND_SIZE; SU[3] = sandInit ? 1 : 0;
    SU[4] = sandCenterX; SU[5] = sandCenterZ; SU[6] = SAND_SIZE; SU[7] = sdt;
    SU[8] = diver.pos[0]; SU[9] = diver.pos[1]; SU[10] = diver.pos[2]; SU[11] = clear;
    SU[12] = fxD; SU[13] = 0; SU[14] = fzD; SU[15] = diver.speed || 0;
    Q.writeBuffer(uboSand, 0, SU);
    const nextFlip = 1 - sandFlip;
    r = e.beginRenderPass(sandPass[nextFlip]);
    r.setPipeline(pSand); r.setBindGroup(0, bgSand[sandFlip]); r.draw(3); r.end();
    sandFlip = nextFlip;
    sandPrevX = sandCenterX; sandPrevZ = sandCenterZ; sandInit = true;
  }
  const curBg0 = sandFlip ? bg0B : bg0A;
  // scene
  r = e.beginRenderPass(passScene);
  r.setBindGroup(0, curBg0);
  if (cy < 0) {
    r.setPipeline(pTerrain); r.setVertexBuffer(0, vbTerrain); r.setVertexBuffer(1, ibSolids); r.setIndexBuffer(ibTerrain, 'uint32');
    drawCells(r, T.start, T.lo, T.hi, 1.5, 1, 0, 0, 240);
    // 5-ring Geometry Clipmap extending seamless seabed to 1000m+ in 1 draw call
    r.setPipeline(pClipmap); r.setVertexBuffer(0, vbClip); r.setIndexBuffer(ibClip, 'uint32');
    r.drawIndexed(clipMesh.ni);
    r.setPipeline(pSolid); r.setVertexBuffer(0, vbMesh); r.setIndexBuffer(ibMesh, 'uint32');
    r.setVertexBuffer(1, ibSolids);
    for (let i = 0; i < 12; i++) { const g = Wd.solids.ranges[i]; if (g[1]) r.drawIndexed(meshes[i].ib.length, g[1], meshes[i].i0, meshes[i].v0, g[0]); }
    // Outer-ocean stone arches (landmarks & reef gateways)
    if (outerStream.archCount) {
      r.setVertexBuffer(1, ibOuterArch);
      r.drawIndexed(OUTER_ARCH.ib.length, outerStream.archCount, OUTER_ARCH.i0, OUTER_ARCH.v0, 0);
    }
    // Streamed outer-ocean boulders, sponges & corals
    const outerRockMesh = [meshes[14], meshes[17]];
    for (let i = 0; i < 2; i++) if (outerStream.rockCounts[i]) {
      r.setVertexBuffer(1, ibOuterRock[i]);
      r.drawIndexed(outerRockMesh[i].ib.length, outerStream.rockCounts[i], outerRockMesh[i].i0, outerRockMesh[i].v0, 0);
    }
    const outerPropMesh = [meshes[4], meshes[9], LV > 1 ? meshes[21] : meshes[7], LV > 1 ? meshes[22] : meshes[8]];
    for (let i = 0; i < 4; i++) if (outerStream.propCounts[i]) {
      r.setVertexBuffer(1, ibOuterProp[i]);
      r.drawIndexed(outerPropMesh[i].ib.length, outerStream.propCounts[i], outerPropMesh[i].i0, outerPropMesh[i].v0, 0);
    }
    for (let i = 0; i < NCHUNK; i++) {
      const c = Wd.chunks[i], big = i > 2 && i < 6; r.setVertexBuffer(1, ibChunk[i]);
      drawCells(r, c.start, c.lo, c.hi, 3, meshes[14 + i], 0, 0, i > 5 ? 30 : big ? 40 : 96);
      if (big) drawCells(r, c.start, c.lo, c.hi, 3, meshes[20 + i], 0, 40, 150);
    }
    for (let i = 0; i < 6; i++) {
      const lod = i === 3 || i === 4; r.setVertexBuffer(1, ibProp[i]);
      drawCells(r, Wd.props[i].start, Wd.props[i].lo, Wd.props[i].hi, 3, meshes[4 + i], 0, 0, lod ? 6 : 110);
      if (lod) drawCells(r, Wd.props[i].start, Wd.props[i].lo, Wd.props[i].hi, 3, meshes[18 + i], 0, 6, 110);
    }
    r.setPipeline(pManta); r.setVertexBuffer(1, ibManta); r.drawIndexed(MANTA.ib.length, nManta, MANTA.i0, MANTA.v0, 0);
    if (outerStream.mantaCount) { r.setVertexBuffer(1, ibOuterManta); r.drawIndexed(MANTA.ib.length, outerStream.mantaCount, MANTA.i0, MANTA.v0, 0); }
    r.setPipeline(pTurtle); r.setVertexBuffer(1, ibTurtle); r.drawIndexed(TURTLE.ib.length, turtles.length / 8, TURTLE.i0, TURTLE.v0, 0);
    if (outerStream.turtleCount) { r.setVertexBuffer(1, ibOuterTurtle); r.drawIndexed(TURTLE.ib.length, outerStream.turtleCount, TURTLE.i0, TURTLE.v0, 0); }
    r.setPipeline(pFish); r.setVertexBuffer(1, ibFish); r.drawIndexed(FISH.ib.length, nFish, FISH.i0, FISH.v0, 0);
    if (outerStream.fishCount) { r.setVertexBuffer(1, ibOuterFish); r.drawIndexed(FISH.ib.length, outerStream.fishCount, FISH.i0, FISH.v0, 0); }
    // kelp and plants: 9-row blades up close, 5 rows mid-range, a decimated set far away
    r.setPipeline(pLeaf); r.setVertexBuffer(0, ibBig); drawCells(r, Wd.big.start, Wd.big.lo, Wd.big.hi, 5, false, 18, 0, 24);
    r.setPipeline(pLeaf5); drawCells(r, Wd.big.start, Wd.big.lo, Wd.big.hi, 5, false, 10, 24, 58);
    if (outerStream.leafCount) { r.setVertexBuffer(0, ibOuterLeaf); r.draw(10, outerStream.leafCount); }
    r.setPipeline(pLeafF); r.setVertexBuffer(0, ibBigF); drawCells(r, Wd.bigF.start, Wd.bigF.lo, Wd.bigF.hi, 5, false, 6, 58, 150);
    r.setPipeline(pLeafS); r.setVertexBuffer(0, ibSmall); drawCells(r, Wd.small.start, Wd.small.lo, Wd.small.hi, 1.5, false, 6, 0, 70);
  }
  if (cy >= 0) { r.setPipeline(pOcean); r.draw(64 * 64 * 6); }
  else { r.setPipeline(pSurf); r.draw(4); }
  r.setPipeline(pBack); r.draw(4);
  if (cy < 0) {
    r.setPipeline(pBub); r.setVertexBuffer(0, ibBubbles); r.draw(4, nBub);
    if (outerStream.bubbleCount) { r.setVertexBuffer(0, ibOuterBub); r.draw(4, outerStream.bubbleCount); }
    r.setPipeline(pGl); r.setVertexBuffer(0, ibGl); r.draw(4, nGl);
    r.setPipeline(pSnow); r.setVertexBuffer(0, ibSnowB); r.draw(4, nSnow);
  }
  // third-person diver, drawn last so its extra bind group cannot affect scene shaders.
  // In first person the body is hidden to avoid clipping the near plane.
  if (diver && diver.view !== 1) {
    UBD.set(Diver.bones(diver), 8);
    UBD[0] = diver.pos[0]; UBD[1] = diver.pos[1]; UBD[2] = diver.pos[2]; UBD[3] = Diver.rootY;
    UBD[4] = diver.yaw; UBD[5] = diver.pitch; UBD[6] = diver.roll; UBD[7] = 0;
    Q.writeBuffer(uboD, 0, UBD);
    r.setPipeline(pDiver); r.setBindGroup(1, bgD); r.setVertexBuffer(0, dvMesh.vb); r.setVertexBuffer(1, dvMesh.skin); r.setIndexBuffer(dvMesh.ib, 'uint32');
    r.drawIndexed(dvMesh.ic);
  }
  if (!menu) {
    diverParticles.update(diver,F[TIME],camera);
    diverParticles.upload(Q,particleBuffer);
    r.setPipeline(pWake); r.setVertexBuffer(0,particleBuffer);
    diverParticles.live.spans(diverParticles.head,(first,count)=>r.draw(4,count,0,first));
  }
  if (cy < 0) {
    r.setPipeline(pJelly); r.setVertexBuffer(0, vbMesh); r.setIndexBuffer(ibMesh, 'uint32'); r.setVertexBuffer(1, ibJelly);
    r.drawIndexed(JELLY.ib.length, jellies.length / 8, JELLY.i0, JELLY.v0, 0);
    if (outerStream.jellyCount) { r.setVertexBuffer(1, ibOuterJelly); r.drawIndexed(JELLY.ib.length, outerStream.jellyCount, JELLY.i0, JELLY.v0, 0); }
  }
  r.end();
  // light shafts
  r = e.beginRenderPass(passRays); r.setPipeline(pRays); r.setBindGroup(0, bgRays); r.draw(3); r.end();
  r = e.beginRenderPass(passBlur); r.setPipeline(pRB); r.setBindGroup(0, bgBlur); r.draw(3); r.end();
  // bloom
  for (let i = 0; i < bloomPass.length; i++) {
    r = e.beginRenderPass(bloomPass[i]); r.setPipeline(i === 0 ? pDown0 : i < NB ? pDown : pUp); r.setBindGroup(0, bloomBG[i]); r.draw(3); r.end();
  }
  // composite
  passPost.colorAttachments[0].view = ctx.getCurrentTexture().createView();
  r = e.beginRenderPass(passPost); r.setPipeline(pPost); r.setBindGroup(0, bgPost); r.draw(3); r.end();
  if (slot) { e.resolveQuerySet(qs, 0, 2, qResolve, 0); e.copyBufferToBuffer(qResolve, 0, slot.b, 0, 16); }
  submitList[0] = e.finish();
  Q.submit(submitList);
  if (slot) { slot.busy = true; slot.b.mapAsync(GPUMapMode.READ).then(slot.done); }
}

// CS[j] = distance to the rock (metres, < 0 in water) at the camera + CE[3j..3j+2]: the camera, then ±0.375 m on
// each axis for the gradient
const CE = new Float64Array([0, 0, 0, .375, 0, 0, -.375, 0, 0, 0, .375, 0, 0, -.375, 0, 0, 0, .375, 0, 0, -.375]), CS = new Float64Array(7);
const cv = (x, y, z) => { const b = CI[(x >> 2) + CN * ((y >> 2) + NY / 4 * (z >> 2))]; return b > 1 ? CG[b * 64 - 128 + (x & 3) + 4 * (y & 3) + 16 * (z & 3)] : b * 254 - 127; };
function rockDistance(px,py,pz) {
  if (py >= 0 || py < OY - 2) return -1;
  const edge = outerEdge(px, pz);
  if (edge >= 178) return outerSdf(px, py, pz);
  const maxC = CN * 4 - 2;
  const x = clamp((px - OX) / VS - CO, 0, maxC), y = clamp((py - OY) / VS, 0, NY - 2), z = clamp((pz - OZ) / VS - CO, 0, maxC);
  const ix = x | 0, iy = y | 0, iz = z | 0, u = x - ix, v = y - iy, a = cv(ix, iy, iz), b = cv(ix, iy + 1, iz), c = cv(ix, iy, iz + 1), d = cv(ix, iy + 1, iz + 1);
  const p = a + (cv(ix + 1, iy, iz) - a) * u, q = b + (cv(ix + 1, iy + 1, iz) - b) * u, r = c + (cv(ix + 1, iy, iz + 1) - c) * u, s = d + (cv(ix + 1, iy + 1, iz + 1) - d) * u;
  const e = p + (q - p) * v;
  const coreD = (e + (r + (s - r) * v - e) * (z - iz)) / 127;
  if (edge <= 166) return coreD;
  return mix(coreD, outerSdf(px, py, pz), sstep(166, 178, edge));
}
function sd(j) { CS[j] = rockDistance(F[CX]+CE[3*j], F[CY]+CE[3*j+1], F[CZ]+CE[3*j+2]); }
// Moves the camera by F[MX..MZ] in steps shorter than its radius CR (so it can't pass through thin rock), pushing it
// back out after each step and dropping velocity into the rock, so it slides along.
const CR = 0.5;
function collide() {
  const n = floor(sqrt(F[MX] * F[MX] + F[MY] * F[MY] + F[MZ] * F[MZ]) / 0.4) + 1;
  for (let i = 0; i < n; i++) {
    F[CX] += F[MX] / n; F[CY] += F[MY] / n; F[CZ] += F[MZ] / n;
    for (let k = 0; k < 2; k++) {
      sd(0); const s = CS[0] + CR; if (s <= 0) break;
      for (let j = 1; j < 7; j++) sd(j);
      let gx = CS[1] - CS[2], gy = CS[3] - CS[4], gz = CS[5] - CS[6]; const l = sqrt(gx * gx + gy * gy + gz * gz);
      if (l < 0.075) break; // flat: deep in rock
      gx /= l; gy /= l; gz /= l; const vn = F[VX] * gx + F[VY] * gy + F[VZ] * gz;
      F[CX] -= gx * s; F[CY] -= gy * s; F[CZ] -= gz * s;
      if (vn > 0) { F[VX] -= gx * vn; F[VY] -= gy * vn; F[VZ] -= gz * vn; }
    }
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dtr = now - F[LAST]; F[LAST] = now;
  let dt = dtr / 1000; if (dt > 0.1) dt = 0.1;
  // Dynamic resolution for 60 fps: every second (0.4 s behind the menu) scale the load by k
  if (dtr < 1e3 && (dynT += dtr) > 0 && (dynN++, dynT > (menu ? 400 : 1000))) {
    const a = dynT / dynN, g = dynGN ? dynG / dynGN : 0; let k = 1;
    // with GPU timing: keep it between 9.8 and 13.6 ms
    if (g) { if (g > 13.6 || g < 9.8) k = 11.7 / g; }
    // without: slow for two periods in a row means fewer pixels, and twice as long before trying to go back up
    else if (a > 17.6) { dynOk = 0; if (++dynBad > 1) { k = 15 / a; dynBad = 0; dynWait = min(dynWait * 2, 60); } }
    // at the display's rate there is no telling if there is room, so try a little more now and then
    else { dynBad = 0; if (a < 12.5) k = 15 / a; else if (++dynOk > dynWait) { k = 1.17; dynOk = 0; } }
    k = k < 0.5 ? 0.5 : k > 1.7 ? 1.7 : k; const top = min(PIXMAX, DW * DH), mid = max(top / 2, PIXMIN);
    // too slow: pixels down to `mid` first, then draw distance, then the remaining pixels; faster goes back the same way
    if (k < 1 ? pix > mid || det <= DETMIN : pix < mid || det >= 1) {
      const end = k < 1 ? (det > DETMIN ? mid : PIXMIN) : det < 1 ? mid : top;
      pix *= k; if (k < 1 ? pix < end : pix > end) pix = end;
    } else { det *= sqrt(k); det = det < DETMIN ? DETMIN : det > 1 ? 1 : det; }
    dynN = dynT = dynG = dynGN = 0; resize();
  }
  F[TIME] += dt;
  {
    // 触控视角：手指位移直接换算为转角（以屏幕短边为基准，不同尺寸手机手感一致）
    touch.takeLook(touchLook);
    if (touchLook.x || touchLook.y) {
      const s = touchSens * 1000 / (innerWidth < innerHeight ? innerWidth : innerHeight);
      mdx += touchLook.x * s; mdy += touchLook.y * s * 0.85 * (touchInvert ? -1 : 1);
    }
    if (touchLook.zoom && diver && diver.view !== 1) diver.zoomDist = clamp(diver.zoomDist - touchLook.zoom * 0.02, 2.2, 7.8);
    // 摇杆明显后拉时取消自动巡游，与键盘 S 一致
    if (autoSwim && touch.fw < -0.5) autoSwim = false;
    // mouse look through two cascaded low-pass stages
    const kq = 1 - exp(-dt * 30); lkx += mdx * 0.0022; lky += mdy * 0.0022; mdx = 0; mdy = 0;
    const ax = lkx * kq, ay = lky * kq; lkx -= ax; lky -= ay; l2x += ax; l2y += ay;
    const dyw = l2x * kq, dpt = l2y * kq; l2x -= dyw; l2y -= dpt;
    if (diver && !menu && !photo) {
      diver.targetYaw += dyw + orbitYaw * dt;
      diver.targetPitch = clampLook(diver.targetPitch - dpt + orbitPitch * dt);
      orbitYaw *= exp(-dt * 10.5); orbitPitch *= exp(-dt * 10.5);
      const analog = { fw: touch.fw, lr: touch.lr, v: touchDepth, sprint: touch.sprint, autoSwim };
      Diver.step(diver, keys, dt, F[TIME], floorLimit, null, undefined, null, analog);
      let [x, y, z] = diver.pos;
      const rad = hypot(x, z);
      if (rad > OUTER_PUSH_START) {
        // Gentle perimeter ocean current smoothly guides the diver back from the far abyss
        const push = sstep(OUTER_PUSH_START, SWIM_RADIUS, rad);
        const ix = x / rad, iz = z / rad;
        const nudge = push * dt * 8.5;
        x -= ix * nudge; z -= iz * nudge;
        diver.velocity[0] -= ix * push * dt * 6;
        diver.velocity[2] -= iz * push * dt * 6;
        if (rad > OUTER_PUSH_START + 20 && now - lastEdgeNotice > 6000) {
          lastEdgeNotice = now;
          journal.notify('前方为深海外缘海流，已顺流折返', now, 3000);
        }
        const rad2 = hypot(x, z);
        if (rad2 > SWIM_RADIUS) { x *= SWIM_RADIUS / rad2; z *= SWIM_RADIUS / rad2; }
      }
      y = max(-54, min(8, y));
      F[MX] = x - F[CX]; F[MY] = y - F[CY]; F[MZ] = z - F[CZ];
      F[VX] = diver.velocity[0]; F[VY] = diver.velocity[1]; F[VZ] = diver.velocity[2];
      collide();
      diver.pos[0] = F[CX]; diver.pos[1] = F[CY]; diver.pos[2] = F[CZ];
      diver.velocity[0] = F[VX]; diver.velocity[1] = F[VY]; diver.velocity[2] = F[VZ];
      follow(dt);
    } else if (photo && !menu) movePhoto(dt);
  }
  if (!menu && !document.hidden && !dead) journal.update(F[CX], F[CY], F[CZ], now);
  render();
  if (!menu) gameHud.frame();
  if (hud) {
    hN++; if (dtr > hMax) hMax = dtr; if (dtr < hMin) hMin = dtr; if (dtr > hPer * 1.5) { hLate++; hTot++; }
    F[HUDT] += dtr / 1000;
    if (F[HUDT] > 0.5) { info.textContent = `${(hN / F[HUDT]).toFixed(0)} 帧率  ·  最差帧 ${hMax.toFixed(1)} ms  ·  掉帧 ${hLate}（共 ${hTot}）  ·  GPU ${F[GPU].toFixed(2)} ms  ·  ${W}x${H}（${W * 100 / DW | 0}%）`; F[HUDT] = 0; hPer = hMin; hN = 0; hMax = 0; hMin = 1e9; hLate = 0; }
  }
}

// ---------------------------------------------------------------- input
const keys = Object.create(null);
const floorLimit = () => -55; // Cave ceilings, core floors, and outer seabed are resolved by collide().
let lastEdgeNotice = -1e9;
const camera = { pos: [0,0,0] };
let orbitYaw = 0, orbitPitch = 0, drag = null, autoSwim = false, photo = false;
let lamp = false, pulseTime = -100, pulsePos = [0,0,0];
let splashTime=-100, splashPos=[0,0,0];
Diver.setSplashHook((strength,pos)=>{ splashTime=F[TIME]; splashPos=pos;
  diverParticles.burst(pos,3,Math.round(14+16*strength),3.6,F[TIME]); });
const clampLook = pitch => Math.max(-1.15, Math.min(1.15, pitch));
function follow(dt) {
  Diver.camera(diver, camera, dt, floorLimit);
  const [x,y,z] = diver.pos;
  const dx=camera.pos[0]-x, dy=camera.pos[1]-y, dz=camera.pos[2]-z;
  const steps=Math.ceil(Math.hypot(dx,dy,dz)/.22);
  for (let i=1; i<=steps; i++) {
    const t=i/steps;
    if (rockDistance(x+dx*t,y+dy*t,z+dz*t)>-.24) {
      const safe=(i-1)/steps;
      camera.pos=[x+dx*safe,y+dy*safe,z+dz*safe];
      const reach=diver.view===1 ? 4 : 1.15;
      const ax=reach*sin(diver.targetYaw)*cos(diver.targetPitch)-dx*safe;
      const ay=reach*sin(diver.targetPitch)-dy*safe;
      const az=-reach*cos(diver.targetYaw)*cos(diver.targetPitch)-dz*safe;
      camera.yaw=atan2(ax,-az); camera.pitch=atan2(ay,hypot(ax,az)); break;
    }
  }
  RC.set(camera.pos); F[YAW] = camera.yaw; F[PIT] = camera.pitch;
  TANH = Math.tan(camera.fov / 2);
}
function toggleView() {
  if (photo) { photo = false; diver.view = 0; }
  else diver.view = (diver.view + 1) % 3;
  follow(0);
}
function sonar() {
  if (F[TIME] - pulseTime < 1.15) return;
  pulseTime = F[TIME]; pulsePos = diver.pos.slice();
  diverParticles.burst(pulsePos,2,14,2.8,F[TIME]);
  journal.scan(diver.pos,diver.targetYaw,performance.now());
  pingSonar();

  // 声呐环境共鸣扫描：检查视线方向 140 米内是否有大型奇迹与地标
  if (typeof POSES !== 'undefined') {
    const fwdX = Math.sin(diver.targetYaw), fwdZ = -Math.cos(diver.targetYaw);
    let closestLm = null, minD = 1e9;
    for (let i = 0; i < POSES.length; i++) {
      if (!journalSpots[i]) continue;
      const p = POSES[i];
      const dx = p[0] - diver.pos[0], dz = p[2] - diver.pos[2];
      const dist = Math.hypot(dx, dz);
      if (dist > 12 && dist < 140) {
        const dot = (dx * fwdX + dz * fwdZ) / dist;
        if (dot > 0.65 && dist < minD) {
          minD = dist;
          closestLm = journalSpots[i][0];
        }
      }
    }
    if (closestLm) {
      const delay = Math.max(0.18, Math.min(0.72, minD * 0.005));
      pingResonance(delay, 460 - minD * 1.5);
      journal.notify(`【${closestLm}】捕获声学回波共鸣 · 距约 ${Math.round(minD)} 米`, performance.now(), 3200);
    }
  }
}
function movePhoto(dt) {
  const axis = (a,b) => Number(a.some(k=>keys[k])) - Number(b.some(k=>keys[k]));
  const fw = axis(['KeyW','ArrowUp'],['KeyS','ArrowDown']), lr = axis(['KeyD','ArrowRight'],['KeyA','ArrowLeft']);
  const up = axis(['Space','KeyE'],['KeyQ','KeyC','KeyX','ControlLeft','ControlRight']);
  const d = dt * (keys.ShiftLeft || keys.ShiftRight ? 4.6 : 1.8);
  RC[0] += d * (F[FX]*fw + F[RX]*lr); RC[1] += d * (F[FY]*fw + up); RC[2] += d * (F[FZ]*fw + F[RZ]*lr);
}
let lastCardDataUrl = '';
function collectPhotoTargets() {
  const creatures = [];
  if (typeof turtles !== 'undefined') {
    for (let i = 0; i < turtles.length; i += 8) {
      const t = turtles, a = t[i + 4] + F[TIME] * t[i + 5];
      creatures.push({ name: '巡游海龟', x: t[i] + Math.cos(a) * t[i + 3], y: t[i + 1], z: t[i + 2] + Math.sin(a) * t[i + 3] });
    }
  }
  if (typeof jellies !== 'undefined') {
    for (let i = 0; i < jellies.length; i += 8) {
      const j = jellies, a = j[i + 4] + F[TIME] * j[i + 5];
      creatures.push({ name: '幽光水母', x: j[i] + Math.cos(a) * j[i + 3], y: j[i + 1] + Math.sin(F[TIME] * 0.4 + i) * 1.5, z: j[i + 2] + Math.sin(a) * j[i + 3] });
    }
  }
  if (typeof Wd !== 'undefined' && Wd.mantas) {
    for (let i = 0; i < Wd.mantas.length; i += 8) {
      const m = Wd.mantas, a = m[i + 4] + F[TIME] * m[i + 5];
      creatures.push({ name: '深渊蝠鲼', x: m[i] + Math.cos(a) * m[i + 3], y: m[i + 1], z: m[i + 2] + Math.sin(a) * m[i + 3] });
    }
  }
  if (diver && (photo || diver.view !== 1)) {
    creatures.push({ name: '潜水探险家', x: diver.pos[0], y: diver.pos[1], z: diver.pos[2] });
  }
  const landmarks = [];
  if (typeof POSES !== 'undefined') {
    POSES.forEach((p, idx) => {
      if (journalSpots[idx]) landmarks.push({ name: journalSpots[idx][0], x: p[0], y: p[1], z: p[2] });
    });
  }
  return { creatures, landmarks };
}
function takePhoto() {
  render();
  const targets = collectPhotoTargets();
  const info = analyzePhotoSubject(RC, [F[FX], F[FY], F[FZ]], targets);
  const cardUrl = createPolaroidCard(canvas, info);
  lastCardDataUrl = cardUrl;

  const modal = $('photo-modal');
  const img = $('photo-preview-img');
  if (modal && img && cardUrl) {
    img.src = cardUrl;
    modal.hidden = false;
  }
  journal.notify(`【${info.name}】${info.ratingLabel} · 已生成科考拍立得`, performance.now(), 4500);
}
addEventListener('keydown', e => {
  if (['INPUT','TEXTAREA'].includes(e.target.tagName) || menu && !['KeyH','KeyM'].includes(e.code)) return;
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  keys[e.code] = true;
  if (e.code === 'KeyS' || e.code === 'ArrowDown') autoSwim = false;
  if (e.repeat) return;
  sound();
  if (e.code === 'KeyH') { hud = !hud; hTot = 0; hPer = 1e9; info.textContent = ''; }
  else if (e.code === 'KeyM') mute();
  else if (e.code === 'Escape') { if (photo) { photo = false; follow(0); } else ui(true); }
  else if (e.code === 'KeyP') { if (photo) takePhoto(); else { release(); photo = true; } }
  else if (photo && e.code === 'Enter') takePhoto();
  else if (e.code === 'KeyR') { if (photo) follow(0); else autoSwim = !autoSwim; }
  else if (!photo && e.code === 'KeyV') toggleView();
  else if (!photo && e.code === 'KeyF') sonar();
  else if (e.code === 'KeyL') lamp = !lamp;
  else if (e.code >= 'Digit1' && e.code <= 'Digit8') visitSpot(Number(e.code.slice(5))-1);
});
addEventListener('keyup', e => { delete keys[e.code]; });
const release = () => {
  for (const key of Object.keys(keys)) delete keys[key];
  drag = null; orbitPitch = orbitYaw = mdx = mdy = lkx = lky = l2x = l2y = 0;
  touchDepth = 0; touch.reset();
};
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  if (menu || e.pointerType !== 'mouse' || ![0,2].includes(e.button)) return;
  drag = { id:e.pointerId, x:e.clientX, y:e.clientY, button:e.button, time:performance.now(), moved:0 };
  orbitYaw = orbitPitch = 0; canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (!drag || drag.id !== e.pointerId) return;
  const dx = e.clientX-drag.x, dy = e.clientY-drag.y;
  drag.x=e.clientX; drag.y=e.clientY; drag.moved += Math.hypot(dx,dy);
  const yaw=dx*.0038, pitch=-dy*.0038*.88;
  if (photo) { F[YAW]-=yaw*.85; F[PIT]=clampLook(F[PIT]-pitch*.85); return; }
  diver.targetYaw+=yaw; diver.targetPitch=clampLook(diver.targetPitch+pitch);
  orbitYaw=Math.max(-3.8,Math.min(3.8,yaw*32)); orbitPitch=Math.max(-2.8,Math.min(2.8,pitch*32));
});
for (const name of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(name,e=>{
  if (!drag || e.pointerId!==drag.id) return;
  if (name==='pointerup' && !photo && drag.button===2 && drag.moved<8 && performance.now()-drag.time<220) sonar();
  drag=null;
});
canvas.addEventListener('wheel',e=>{
  if (menu) return;
  e.preventDefault();
  if (photo) TANH=Math.tan(Math.max(.28,Math.min(1.38,2*Math.atan(TANH)+e.deltaY*.001))/2);
  else diver.zoomDist=Math.max(2.2,Math.min(7.8,diver.zoomDist+e.deltaY*.0028));
},{passive:false});
addEventListener('blur', release);
// 触控：只处理落在画布上的手指（changedTouches），按住 HUD 按钮的手指不会被误判为第二指
const touchPoint = { x: 0, y: 0 };
function toPage(t) {
  // 竖屏时页面整体旋转 90°，把屏幕坐标换算回页面坐标
  if (rot.matches) { touchPoint.x = t.clientY; touchPoint.y = body.clientHeight - t.clientX; }
  else { touchPoint.x = t.clientX; touchPoint.y = t.clientY; }
  return touchPoint;
}
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault(); sound(); document.documentElement.classList.add('touch');
  if (menu || photo) return;
  const c = e.changedTouches;
  for (let i = 0; i < c.length; i++) { const p = toPage(c[i]); touch.start(c[i].identifier, p.x, p.y, body.clientWidth); }
}, { passive: false });
canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const c = e.changedTouches;
  for (let i = 0; i < c.length; i++) { const p = toPage(c[i]); touch.move(c[i].identifier, p.x, p.y); }
}, { passive: false });
for (const n of ['touchend', 'touchcancel']) canvas.addEventListener(n, (e) => {
  e.preventDefault();
  const c = e.changedTouches;
  for (let i = 0; i < c.length; i++) touch.end(c[i].identifier);
}, { passive: false });

// ---------------------------------------------------------------- menu
// The scene keeps rendering (blurred by CSS) behind the menu. Esc, losing the mouse or the corner button open it.
let menu = true;
const bDive = $('d');
const ui = (m) => {
  if (dead) return;
  menu = m; body.className = m ? 'm' : 'g';
  // focus the dive button so Enter works (delayed: it can't take focus while still hidden)
  if (m) { release(); setTimeout(() => menu && bDive.focus(), 100); } else document.activeElement.blur();
};
const go = () => {
  sound(); ui(false); bDive.textContent = '继续潜水';
  gameHud.dive();
};
bDive.addEventListener('click', go); $('o').addEventListener('click', () => ui(true));
// detail buttons: the current level is lit, the others reload the page with theirs


// draw the first frame and wait for the GPU to finish it (pipelines get compiled on first use) before the reveal
function visitSpot(index) {
  lookAt(...POSES[index]);
  mdx = mdy = lkx = lky = l2x = l2y = 0;
  diver.pos[0] = F[CX]; diver.pos[1] = F[CY]; diver.pos[2] = F[CZ];
  diver.velocity.fill(0);
  diver.yaw = diver.goalYaw = diver.targetYaw = F[YAW];
  diver.pitch = diver.goalPitch = diver.targetPitch = F[PIT];
  diverParticles.live.clear(); diver.airborne = false; autoSwim = false; photo = false; sandInit = false; release(); follow(0);
}

lookAt(...POSES[0]);
diver = Diver.create([F[CX], F[CY], F[CZ]], F[YAW], F[PIT]);
visitSpot(0);
const journal = createJournal(POSES, journalStorage);
const gameHud = createHud(touch);
$('survey-sonar').addEventListener('click', () => { if (!menu && !photo) sonar(); });
$('cruise').addEventListener('click', () => { if (!menu && !photo) autoSwim = !autoSwim; });
$('lamp').addEventListener('click', () => { if (!menu) lamp = !lamp; });
$('hud-photo').addEventListener('click', () => { if (!menu) takePhoto(); });

await say('Letting the light in…', 1, 400);
render(); await Q.onSubmittedWorkDone();
const [valErr, oomErr] = await Promise.all([device.popErrorScope(), device.popErrorScope()]);
if (valErr || oomErr) fail('当前设备渲染初始化异常，请刷新重试。' + ((valErr || oomErr).message ? ` (${(valErr || oomErr).message.slice(0, 120)})` : ''));
ui(true);
requestAnimationFrame((t) => { F[LAST] = t; requestAnimationFrame(frame); });
