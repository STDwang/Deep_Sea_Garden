// ============================================================================
// Outer Ocean: analytic seabed, 4 macro biomes, 5-ring Geometry Clipmap,
// hybrid SDF landmarks, and toroidal ecological streaming pool.
// ============================================================================

const OUTER_SWIM_RADIUS = 960;
const OUTER_PUSH_START = 900;
const OUTER_CELL = 24;
const SAND_SIZE = 48;

// 4 iconic outer-ocean landmarks (matching journalSpots[9..12]) + 4 scenic outer arches
const OUTER_LANDMARKS = [
  { id: 9, name: '翠渊巨藻塔', x: 290, z: -205, biome: 0, archR: 12, archTube: 2.3, archYaw: 0.72, lookOff: [-24, 6, 18] },
  { id: 10, name: '暖礁双拱台', x: 365, z: 155, biome: 1, archR: 13.5, archTube: 2.5, archYaw: -0.45, lookOff: [-26, 7, -14] },
  { id: 11, name: '幽渊荧光盆', x: -240, z: 325, biome: 2, archR: 11.5, archTube: 2.2, archYaw: 1.15, lookOff: [20, 6, -22] },
  { id: 12, name: '玄岩热泉门', x: -360, z: -195, biome: 3, archR: 14, archTube: 2.7, archYaw: 0.35, lookOff: [26, 7, 16] },
];

const OUTER_EXTRA_ARCHES = [
  { x: 245, z: 45, r: 9.5, tube: 1.9, yaw: 1.35, squash: 1.15 },
  { x: 225, z: -135, r: 8.5, tube: 1.7, yaw: 0.92, squash: 1.18 },
  { x: 40, z: -265, r: 11, tube: 2.1, yaw: 0.15, squash: 1.2 },
  { x: -35, z: 255, r: 10.5, tube: 2.0, yaw: 0.25, squash: 1.18 },
  { x: -255, z: -30, r: 10, tube: 1.95, yaw: 1.48, squash: 1.16 },
  { x: 520, z: -80, r: 13, tube: 2.4, yaw: 1.1, squash: 1.22 },
  { x: -510, z: 140, r: 12.5, tube: 2.3, yaw: -0.6, squash: 1.2 },
  { x: 140, z: 480, r: 12, tube: 2.2, yaw: 0.4, squash: 1.18 },
];

// Bit-exact integer 2D hash matching WGSL oh2() bit-for-bit
function oh2(ix, iz) {
  let b = (Math.imul(ix | 0, 1597334677) + Math.imul(iz | 0, 3812015801)) >>> 0;
  b = Math.imul(b ^ (b >>> 16), 2246822519) >>> 0;
  return ((b ^ (b >>> 13)) >>> 0) / 4294967296;
}

function on2(x, z) {
  const ix = floor(x), iz = floor(z);
  let fx = x - ix, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx);
  fz = fz * fz * (3 - 2 * fz);
  const a = mix(oh2(ix, iz), oh2(ix + 1, iz), fx);
  const b = mix(oh2(ix, iz + 1), oh2(ix + 1, iz + 1), fx);
  return mix(a, b, fz);
}

function ofbm(x, z, oct = 4) {
  let a = 0.5, s = 0, norm = 0;
  let px = x, pz = z;
  for (let i = 0; i < oct; i++) {
    s += a * on2(px, pz);
    norm += a;
    px = px * 2.02 + 13.7;
    pz = pz * 2.02 + 29.3;
    a *= 0.5;
  }
  return s / norm;
}

function outerEdge(x, z) {
  return max(hypot(x, z) * 0.92, max(abs(x), abs(z)));
}

// 4-biome macro weights: x = kelp, y = coral, z = purple, w = trench (sum = 1)
function outerBiomeWeights(x, z) {
  const bx = ofbm(x * 0.0042 + 3.1, z * 0.0042 - 1.7, 3);
  const bz = ofbm(x * 0.0042 - 5.4, z * 0.0042 + 4.8, 3);
  let kelp = sstep(0.32, 0.68, 1 - bx) * sstep(0.30, 0.66, 1 - bz) + 0.08;
  let coral = sstep(0.32, 0.68, bx) * sstep(0.30, 0.66, 1 - bz) + 0.08;
  let purple = sstep(0.32, 0.68, 1 - bx) * sstep(0.30, 0.66, bz) + 0.06;
  let trench = sstep(0.32, 0.68, bx) * sstep(0.30, 0.66, bz) + 0.06;
  // Pull each outer landmark region strongly toward its signature biome
  const lm0 = sstep(140, 45, hypot(x - 290, z + 205));
  const lm1 = sstep(140, 45, hypot(x - 365, z - 155));
  const lm2 = sstep(140, 45, hypot(x + 240, z - 325));
  const lm3 = sstep(140, 45, hypot(x + 360, z + 195));
  kelp += lm0 * 2.4;
  coral += lm1 * 2.4;
  purple += lm2 * 2.4;
  trench += lm3 * 2.4;
  const inv = 1 / (kelp + coral + purple + trench);
  return [kelp * inv, coral * inv, purple * inv, trench * inv];
}

// Unified purple water-scattering zone (preserves core PURPLE = [6, 84], extends to outer purple basins)
function outerPurpleZone(x, z) {
  const core = sstep(44, 26, hypot(x - 6, z - 84));
  const edge = outerEdge(x, z);
  if (edge <= 155) return core;
  const w = outerBiomeWeights(x, z);
  const outer = sstep(0.34, 0.64, w[2]) * sstep(155, 205, edge);
  return max(core, outer);
}

// Deterministic analytic seabed height shared bit-for-bit with GPU shaders
function outerHeight(x, z) {
  const edge = outerEdge(x, z);
  const w = outerBiomeWeights(x, z);
  const wx = (ofbm(x * 0.011 + 7.1, z * 0.011 + 2.3, 3) - 0.5) * 26;
  const wz = (ofbm(x * 0.011 - 4.5, z * 0.011 + 11.7, 3) - 0.5) * 26;
  const qx = x + wx, qz = z + wz;
  const broad = ofbm(qx * 0.0085, qz * 0.0085, 4) - 0.5;
  const ridge = 1 - abs(ofbm(qx * 0.016 + 4.2, qz * 0.016 - 6.1, 3) * 2 - 1);
  const detail = (ofbm(qx * 0.048 + 1.3, qz * 0.048 + 8.9, 3) - 0.5) * 2.4;
  // Coral biome forms sunlit limestone terraces
  const rawTerrace = (broad + 0.5) * 3.8;
  const stepped = (floor(rawTerrace) + sstep(0.18, 0.82, rawTerrace - floor(rawTerrace))) / 3.8 - 0.5;
  // Basalt trench carves dramatic ridge-flanked channels
  const trenchCut = -7.5 * sstep(0.68, 0.92, ridge) + 9.5 * sstep(0.55, 0.86, 1 - ridge);
  const hKelp = -43.0 + broad * 11.5 + ridge * ridge * 4.5 + detail;
  const hCoral = -33.5 + stepped * 14.5 + ridge * 3.5 + detail * 0.85;
  const hPurple = -44.8 + broad * 9.5 + ridge * ridge * 3.0 + detail * 0.8;
  const hTrench = -41.0 + broad * 10.0 + trenchCut + detail * 1.15;
  const biomeH = hKelp * w[0] + hCoral * w[1] + hPurple * w[2] + hTrench * w[3];
  // Calm apron around core transition (edge 155..198) so core & outer floors meet smoothly near -44m
  const apron = sstep(162, 208, edge);
  const rimBase = -44.5 + broad * 5.2 + detail * 0.5;
  let h = mix(rimBase, biomeH, apron);
  // Keep gentle landing clearings directly around each outer landmark arch base
  const d0 = hypot(x - 290, z + 205), d1 = hypot(x - 365, z - 155);
  const d2 = hypot(x + 240, z - 325), d3 = hypot(x + 360, z + 195);
  h = mix(h, -41.5, sstep(34, 14, d0) * 0.65);
  h = mix(h, -31.0, sstep(34, 14, d1) * 0.65);
  h = mix(h, -44.0, sstep(34, 14, d2) * 0.65);
  h = mix(h, -42.5, sstep(34, 14, d3) * 0.65);
  return clamp(h, -51.5, -16.5);
}

function outerNormal(x, z) {
  const e = 0.65;
  const hx = outerHeight(x + e, z) - outerHeight(x - e, z);
  const hz = outerHeight(x, z + e) - outerHeight(x, z - e);
  const l = hypot(-hx, 2 * e, -hz) || 1;
  return [-hx / l, (2 * e) / l, -hz / l];
}

// Precompute world-space outer arch descriptors (used for both rendering and hybrid SDF collision)
const OUTER_ARCH_LIST = [];
function initOuterArches() {
  if (OUTER_ARCH_LIST.length) return OUTER_ARCH_LIST;
  for (const lm of OUTER_LANDMARKS) {
    const gy = outerHeight(lm.x, lm.z);
    OUTER_ARCH_LIST.push({ x: lm.x, y: gy - 1.5, z: lm.z, yaw: lm.archYaw, R: lm.archR, tube: lm.archTube, squash: 1.18, biome: lm.biome });
  }
  for (const a of OUTER_EXTRA_ARCHES) {
    const gy = outerHeight(a.x, a.z);
    OUTER_ARCH_LIST.push({ x: a.x, y: gy - 1.2, z: a.z, yaw: a.yaw, R: a.r, tube: a.tube, squash: a.squash, biome: -1 });
  }
  return OUTER_ARCH_LIST;
}

// Analytic outer SDF (> 0 inside seabed or stone arch, < 0 in open water)
function outerSdf(px, py, pz) {
  let d = outerHeight(px, pz) - py;
  const arches = initOuterArches();
  for (let i = 0; i < arches.length; i++) {
    const a = arches[i];
    const dx = px - a.x, dz = pz - a.z;
    const bound = a.R + a.tube + 2.5;
    if (abs(dx) > bound || abs(dz) > bound) continue;
    const dy = py - a.y;
    if (dy < -a.tube - 2 || dy > a.R * a.squash + a.tube + 2) continue;
    const cs = cos(a.yaw), sn = sin(a.yaw);
    const rx = cs * dx + sn * dz;
    const rz = -sn * dx + cs * dz;
    const ry = dy / a.squash;
    const da = a.tube - hypot(hypot(rx, ry) - a.R, rz);
    if (da > d) d = da;
  }
  return d;
}

// Exact matching WGSL code shared by W_DENS, S_B, and W_SOLID
const OUTER_WGSL = /*wgsl*/`
fn oh2(p: vec2i) -> f32 {
  let ix = bitcast<vec2u>(p);
  var b = ix.x * 1597334677u + ix.y * 3812015801u;
  b = (b ^ (b >> 16u)) * 2246822519u;
  return f32(b ^ (b >> 13u)) / 4294967296.;
}
fn on2(p: vec2f) -> f32 {
  let i = vec2i(floor(p));
  let f = fract(p);
  let u = f * f * (3. - 2. * f);
  return mix(
    mix(oh2(i), oh2(i + vec2i(1, 0)), u.x),
    mix(oh2(i + vec2i(0, 1)), oh2(i + vec2i(1, 1)), u.x),
    u.y
  );
}
fn ofbm(p: vec2f, oct: i32) -> f32 {
  var a = .5; var s = 0.; var norm = 0.; var q = p;
  for (var i = 0; i < oct; i++) {
    s += a * on2(q);
    norm += a;
    q = q * 2.02 + vec2f(13.7, 29.3);
    a *= .5;
  }
  return s / norm;
}
fn outerEdge(xz: vec2f) -> f32 {
  return max(length(xz) * .92, max(abs(xz.x), abs(xz.y)));
}
fn outerBiome(xz: vec2f) -> vec4f {
  let bx = ofbm(xz * .0042 + vec2f(3.1, -1.7), 3);
  let bz = ofbm(xz * .0042 + vec2f(-5.4, 4.8), 3);
  var kelp = ss(.32, .68, 1. - bx) * ss(.30, .66, 1. - bz) + .08;
  var coral = ss(.32, .68, bx) * ss(.30, .66, 1. - bz) + .08;
  var purple = ss(.32, .68, 1. - bx) * ss(.30, .66, bz) + .06;
  var trench = ss(.32, .68, bx) * ss(.30, .66, bz) + .06;
  kelp += ss(140., 45., length(xz - vec2f(290., -205.))) * 2.4;
  coral += ss(140., 45., length(xz - vec2f(365., 155.))) * 2.4;
  purple += ss(140., 45., length(xz - vec2f(-240., 325.))) * 2.4;
  trench += ss(140., 45., length(xz - vec2f(-360., -195.))) * 2.4;
  return vec4f(kelp, coral, purple, trench) / (kelp + coral + purple + trench);
}
fn outerHeight(xz: vec2f) -> f32 {
  let edge = outerEdge(xz);
  let w = outerBiome(xz);
  let wx = (ofbm(xz * .011 + vec2f(7.1, 2.3), 3) - .5) * 26.;
  let wz = (ofbm(xz * .011 + vec2f(-4.5, 11.7), 3) - .5) * 26.;
  let q = xz + vec2f(wx, wz);
  let broad = ofbm(q * .0085, 4) - .5;
  let ridge = 1. - abs(ofbm(q * .016 + vec2f(4.2, -6.1), 3) * 2. - 1.);
  let detail = (ofbm(q * .048 + vec2f(1.3, 8.9), 3) - .5) * 2.4;
  let rawT = (broad + .5) * 3.8;
  let stepped = (floor(rawT) + ss(.18, .82, fract(rawT))) / 3.8 - .5;
  let trenchCut = -7.5 * ss(.68, .92, ridge) + 9.5 * ss(.55, .86, 1. - ridge);
  let hKelp = -43. + broad * 11.5 + ridge * ridge * 4.5 + detail;
  let hCoral = -33.5 + stepped * 14.5 + ridge * 3.5 + detail * .85;
  let hPurple = -44.8 + broad * 9.5 + ridge * ridge * 3.0 + detail * .8;
  let hTrench = -41. + broad * 10. + trenchCut + detail * 1.15;
  let biomeH = hKelp * w.x + hCoral * w.y + hPurple * w.z + hTrench * w.w;
  let apron = ss(162., 208., edge);
  let rimBase = -44.5 + broad * 5.2 + detail * .5;
  var h = mix(rimBase, biomeH, apron);
  h = mix(h, -41.5, ss(34., 14., length(xz - vec2f(290., -205.))) * .65);
  h = mix(h, -31.0, ss(34., 14., length(xz - vec2f(365., 155.))) * .65);
  h = mix(h, -44.0, ss(34., 14., length(xz - vec2f(-240., 325.))) * .65);
  h = mix(h, -42.5, ss(34., 14., length(xz - vec2f(-360., -195.))) * .65);
  return clamp(h, -51.5, -16.5);
}
fn outerNormal(xz: vec2f) -> vec3f {
  let e = .65;
  let hx = outerHeight(xz + vec2f(e, 0.)) - outerHeight(xz - vec2f(e, 0.));
  let hz = outerHeight(xz + vec2f(0., e)) - outerHeight(xz - vec2f(0., e));
  return normalize(vec3f(-hx, 2. * e, -hz));
}
fn outerGroundMap(xz: vec2f) -> vec4f {
  let w = outerBiome(xz);
  let nSand = ss(.36, .62, ofbm(xz * .038 + vec2f(5.2, 9.1), 3));
  let sand = clamp(nSand * (.58 + w.y * .45 + w.x * .2 - w.w * .35), 0., 1.);
  let nMag = ss(.46, .68, ofbm(xz * .045 + vec2f(-8.1, 3.7), 3));
  let mag = clamp(nMag * (w.z * 1.15 + w.y * .32), 0., 1.);
  let purp = ss(.34, .64, w.z);
  return vec4f(mag, w.y, purp, sand);
}
fn outerVol(p: vec3f) -> vec4f {
  let h = p.y - outerHeight(p.xz);
  let open = clamp(.5 + h / 12., 0., 1.);
  let sky = clamp(.66 + .32 * ss(0., 15., h), .45, .98);
  return vec4f(open, sky, 0., 1.);
}
`;

// ---------------------------------------------------------------- 5-ring Geometry Clipmap
// Static vertex/index buffers: ~51k tris, ~1.05 MB VRAM, 1 draw call.
// Shared 24m snapped anchor guarantees zero T-junctions and zero vertex swimming across all 5 rings.
function buildClipmapMesh() {
  const HALF = 40; // even; inner hole for L > 0 is [-20, +20]
  const HOLE = HALF >> 1;
  const RINGS = 5;
  const BASE_STEP = VS; // 0.75m matching core voxel spacing
  const verts = [];
  const idx = [];
  for (let L = 0; L < RINGS; L++) {
    const step = BASE_STEP * (1 << L);
    const N = HALF * 2 + 1;
    const baseV = verts.length / 4;
    for (let gz = -HALF; gz <= HALF; gz++) {
      for (let gx = -HALF; gx <= HALF; gx++) {
        verts.push(gx, gz, L, step);
      }
    }
    for (let gz = -HALF; gz < HALF; gz++) {
      for (let gx = -HALF; gx < HALF; gx++) {
        if (L > 0 && gx >= -HOLE && gx < HOLE && gz >= -HOLE && gz < HOLE) continue;
        const ix = gx + HALF, iz = gz + HALF;
        const a = baseV + iz * N + ix;
        const b = a + 1;
        const c = a + N;
        const d = c + 1;
        // Front face upward (+Y) with standard counter-clockwise winding seen from above
        if (((gx + gz) & 1) === 0) {
          idx.push(a, c, b, b, c, d);
        } else {
          idx.push(a, c, d, a, d, b);
        }
      }
    }
  }
  return {
    vb: new Float32Array(verts),
    ib: new Uint32Array(idx),
    nv: verts.length / 4,
    ni: idx.length,
    half: HALF,
    rings: RINGS,
    baseStep: BASE_STEP,
  };
}

// Sculpted stone arch mesh (unit radius = 1, tube = 0.185, y squash = 1.18) scaled per arch instance.
function meshOuterArch() {
  rseed(312);
  const m = new Mesh();
  const segU = LV > 1 ? 26 : 36;
  const segV = LV > 1 ? 10 : 14;
  const rings = [];
  for (let i = 0; i <= segU; i++) {
    const t = i / segU;
    const ang = -0.14 * PI + t * 1.28 * PI; // extends slightly below seabed so pillars root solidly
    const cx = cos(ang), cy = sin(ang) * 1.18;
    const tx = -sin(ang), ty = cos(ang) * 1.18;
    const tl = hypot(tx, ty) || 1;
    const nx0 = ty / tl, ny0 = -tx / tl;
    const ring = [];
    const baseThick = 0.185 * (1.28 - 0.34 * sin(t * PI));
    for (let j = 0; j < segV; j++) {
      const phi = (j / segV) * TAU;
      const cs = cos(phi), sn = sin(phi);
      const rough = 1 + 0.22 * (fbm(cx * 3.1 + cs * 1.4, cy * 3.1 + sn * 1.4, j * 0.37, 2) - 0.5);
      const r = baseThick * rough;
      const px = cx + nx0 * cs * r;
      const py = cy + ny0 * cs * r;
      const pz = sn * r * 1.15;
      ring.push(m.v(px, py, pz, clamp(0.45 + 0.55 * (sin(ang) * 0.5 + 0.5), 0.25, 1)));
    }
    rings.push(ring);
  }
  for (let i = 0; i < segU; i++) {
    for (let j = 0; j < segV; j++) {
      const j2 = (j + 1) % segV;
      m.quad(rings[i][j], rings[i][j2], rings[i + 1][j2], rings[i + 1][j]);
    }
  }
  return m;
}

// ---------------------------------------------------------------- Toroidal Outer-Ocean Ecological Streamer
// Maintains fixed-capacity GPU instance pools around the camera, regenerating cells only when crossing 24m boundaries.
function createOuterStreamer(caps = {}) {
  const MAX_ROCKS = caps.rocks ?? (LV > 1 ? 840 : 1360);
  const MAX_PROPS = caps.props ?? (LV > 1 ? 1050 : 1760);
  const MAX_LEAVES = caps.leaves ?? (LV > 1 ? 9200 : 16400);
  const MAX_FISH = caps.fish ?? (LV > 1 ? 560 : 960);
  const MAX_TURTLES = caps.turtles ?? 10;
  const MAX_MANTAS = caps.mantas ?? 8;
  const MAX_JELLIES = caps.jellies ?? 28;
  const MAX_BUBBLES = caps.bubbles ?? (LV > 1 ? 360 : 620);

  // Preallocated CPU staging buffers (zero per-frame heap allocations)
  const rockBufs = [new Float32Array(MAX_ROCKS * 12), new Float32Array(MAX_ROCKS * 12)];
  const rockCounts = [0, 0];
  const propBufs = [
    new Float32Array(MAX_PROPS * 12), // barrel sponge (mesh 4)
    new Float32Array(MAX_PROPS * 12), // tube sponge (mesh 9)
    new Float32Array(MAX_PROPS * 12), // branching coral (mesh 7)
    new Float32Array(MAX_PROPS * 12), // fan coral (mesh 8)
  ];
  const propCounts = [0, 0, 0, 0];
  const leafBuf = new ArrayBuffer(MAX_LEAVES * 36);
  const leafF = new Float32Array(leafBuf);
  const leafU8 = new Uint8Array(leafBuf);
  let leafCount = 0;
  const fishBuf = new Float32Array(MAX_FISH * 8);
  let fishCount = 0;
  const turtleBuf = new Float32Array(MAX_TURTLES * 8);
  let turtleCount = 0;
  const mantaBuf = new Float32Array(MAX_MANTAS * 8);
  let mantaCount = 0;
  const jellyBuf = new Float32Array(MAX_JELLIES * 8);
  let jellyCount = 0;
  const bubbleBuf = new Float32Array(MAX_BUBBLES * 8);
  let bubbleCount = 0;

  // Static arch instances (landmarks + scenic arches)
  const arches = initOuterArches();
  const archBuf = new Float32Array(arches.length * 12);
  for (let i = 0; i < arches.length; i++) {
    const a = arches[i];
    const q = qAxis(0, 1, 0, -a.yaw);
    const o = i * 12;
    archBuf[o] = a.x; archBuf[o + 1] = a.y; archBuf[o + 2] = a.z; archBuf[o + 3] = a.R;
    archBuf[o + 4] = q[0]; archBuf[o + 5] = q[1]; archBuf[o + 6] = q[2]; archBuf[o + 7] = q[3];
    archBuf[o + 8] = 1; archBuf[o + 9] = (i * 0.173) % 1; archBuf[o + 10] = 1; archBuf[o + 11] = 0;
  }

  let lastCX = 1e9, lastCZ = 1e9, lastWin = -1, dirty = false;

  // Local deterministic PRNG per world cell (cx, cz)
  function cellRng(cx, cz, salt = 0) {
    let s = (Math.imul(cx | 0, 374761393) ^ Math.imul(cz | 0, 668265263) ^ Math.imul(salt | 0, 1274126177) ^ 0x9e3779b9) >>> 0;
    return () => {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pushSolid(arr, idx, cap, x, y, z, sc, q, mat, sd, fadeDist = 135) {
    if (idx >= cap) return idx;
    const o = idx * 12;
    arr[o] = x; arr[o + 1] = y; arr[o + 2] = z; arr[o + 3] = sc;
    arr[o + 4] = q[0]; arr[o + 5] = q[1]; arr[o + 6] = q[2]; arr[o + 7] = q[3];
    arr[o + 8] = mat; arr[o + 9] = sd; arr[o + 10] = fadeDist; arr[o + 11] = 0;
    return idx + 1;
  }

  function pushLeaf(x, y, z, len, yaw, tilt, wid, hA, type, s1, s2, bend) {
    if (leafCount >= MAX_LEAVES) return;
    const k = leafCount++;
    const f0 = k * 9;
    leafF[f0] = x; leafF[f0 + 1] = y; leafF[f0 + 2] = z; leafF[f0 + 3] = len;
    leafF[f0 + 4] = yaw; leafF[f0 + 5] = tilt; leafF[f0 + 6] = wid * (1 + LV * 0.32); leafF[f0 + 7] = hA;
    const u0 = k * 36 + 32;
    leafU8[u0] = type; leafU8[u0 + 1] = (s1 * 255) | 0; leafU8[u0 + 2] = (s2 * 255) | 0; leafU8[u0 + 3] = (bend * 255) | 0;
  }

  function update(camX, camZ, detScale = 1, powerSave = false) {
    const win = powerSave || detScale < 0.65 ? 4 : 5;
    const cx0 = floor(camX / OUTER_CELL);
    const cz0 = floor(camZ / OUTER_CELL);
    if (cx0 === lastCX && cz0 === lastCZ && win === lastWin) return false;
    lastCX = cx0; lastCZ = cz0; lastWin = win;
    // Reset counts
    rockCounts[0] = rockCounts[1] = 0;
    propCounts[0] = propCounts[1] = propCounts[2] = propCounts[3] = 0;
    leafCount = fishCount = turtleCount = mantaCount = jellyCount = bubbleCount = 0;

    // Fast skip when deep inside the core sanctuary
    const minDistToOuter = 176 - (win + 1.5) * OUTER_CELL;
    if (outerEdge(camX, camZ) < max(0, minDistToOuter)) {
      dirty = true;
      return true;
    }

    // Visit cells nearest-first so fixed budgets always prioritize close-to-camera detail
    const coords = [];
    for (let dz = -win; dz <= win; dz++) {
      for (let dx = -win; dx <= win; dx++) {
        const d2 = dx * dx + dz * dz;
        if (d2 > (win + 0.45) * (win + 0.45)) continue;
        coords.push([dx, dz, d2]);
      }
    }
    coords.sort((a, b) => a[2] - b[2]);

    const leafThin = powerSave ? 0.55 : (LV > 1 ? 0.68 : 1.0);
    for (let ci = 0; ci < coords.length; ci++) {
      const gx = cx0 + coords[ci][0], gz = cz0 + coords[ci][1];
      const baseX = (gx + 0.5) * OUTER_CELL, baseZ = (gz + 0.5) * OUTER_CELL;
      if (outerEdge(baseX, baseZ) < 176 || hypot(baseX, baseZ) > OUTER_SWIM_RADIUS + 80) continue;

      const r = cellRng(gx, gz, 11);
      const w = outerBiomeWeights(baseX, baseZ);
      const kelpW = w[0], coralW = w[1], purpleW = w[2], trenchW = w[3];
      const cellDist = sqrt(coords[ci][2]) * OUTER_CELL;

      // 1. Reef boulders & basalt outcrops (all cells)
      const nRocks = 2 + floor(r() * 4 + trenchW * 3 + coralW * 2);
      for (let i = 0; i < nRocks; i++) {
        const x = baseX + (r() - 0.5) * OUTER_CELL;
        const z = baseZ + (r() - 0.5) * OUTER_CELL;
        if (outerEdge(x, z) < 174) continue;
        const y = outerHeight(x, z);
        const sc = (0.7 + pow(r(), 1.9) * (2.6 + trenchW * 2.2));
        const q = qMul(qAxis(0, 1, 0, r() * TAU), qAxis(1, 0, 0, (r() - 0.5) * 0.9));
        const bucket = sc > 1.65 ? 1 : 0;
        rockCounts[bucket] = pushSolid(rockBufs[bucket], rockCounts[bucket], MAX_ROCKS, x, y - sc * 0.28, z, sc, q, 1, r(), 148);
      }

      // 2. Sponges & branching corals (richer in Coral Reefs & Purple Basins)
      if (cellDist < 125) {
        const nProps = floor((2.2 + coralW * 7.5 + purpleW * 4.0 + kelpW * 1.5) * (0.65 + r() * 0.7));
        for (let i = 0; i < nProps; i++) {
          const x = baseX + (r() - 0.5) * OUTER_CELL;
          const z = baseZ + (r() - 0.5) * OUTER_CELL;
          if (outerEdge(x, z) < 175) continue;
          const y = outerHeight(x, z);
          const n = outerNormal(x, z);
          if (n[1] < 0.58) continue;
          const pick = r();
          let ux = n[0] * 0.45, uy = n[1] + 0.9, uz = n[2] * 0.45;
          const ul = hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
          const q = qMul(qFromY(ux, uy, uz), qAxis(0, 1, 0, r() * TAU));
          const isCoral = pick < 0.42 + coralW * 0.34;
          const bucket = isCoral ? (r() < 0.58 ? 2 : 3) : (r() < 0.65 ? 0 : 1);
          const sc = isCoral ? (0.65 + r() * 1.25) : (0.55 + r() * 0.95);
          propCounts[bucket] = pushSolid(propBufs[bucket], propCounts[bucket], MAX_PROPS, x, y - 0.1 * sc, z, sc, q, isCoral ? 5 : 4, r(), 120);
        }
      }

      // 3. Giant kelp columns + seagrass & luminous fronds
      if (cellDist < 132) {
        const nCols = floor((kelpW * 3.8 + purpleW * 1.4 + coralW * 0.5) * (0.5 + r()) * leafThin + (r() < kelpW * 0.7 ? 1 : 0));
        for (let c = 0; c < nCols; c++) {
          const x = baseX + (r() - 0.5) * (OUTER_CELL - 2);
          const z = baseZ + (r() - 0.5) * (OUTER_CELL - 2);
          if (outerEdge(x, z) < 176) continue;
          const y = outerHeight(x, z);
          const H = min(-y - 3.5, 14 + r() * (kelpW > 0.35 ? 21 : 11));
          if (H < 8) continue;
          const kind = purpleW > 0.38 ? 3 : (r() < 0.08 ? 4 : 0);
          const ph = r() * TAU, tw = 0.14 + r() * 0.16, sr = 0.25 + r() * 0.35;
          // Kelp stem segments
          for (let h = 0; h < H - 1.5; h += 2.2) {
            const a = ph + h * tw, rad = sr * (1 - 0.55 * h / H);
            pushLeaf(x + cos(a) * rad, y + h, z + sin(a) * rad, 2.5, a + PI * 0.5, 0.1, 0.19, h, 1, r(), r(), 0.3);
          }
          // Kelp blades (LOD-scaled by cell distance)
          const bladeCount = floor(H * (cellDist < 60 ? 5.5 : 3.0) * leafThin);
          for (let b = 0; b < bladeCount; b++) {
            const t = pow(r(), 0.85), h = t * H;
            const a = ph + h * tw, rad = sr * (1 - 0.55 * t);
            const L = (0.75 + r() * 0.95) * (1 - 0.45 * t * t) + 0.35;
            const tilt = mix(0.45 + r() * 0.55, 0.18 + r() * 0.3, t);
            pushLeaf(x + cos(a) * rad, y + h, z + sin(a) * rad, L, r() * TAU, tilt, L * 0.2 + 0.05, h, kind, r(), r(), 0.45 + r() * 0.5);
          }
        }
        // Floor ribbon clusters (seagrass / purple glowing tufts)
        if (cellDist < 84) {
          const nTufts = floor((4 + purpleW * 12 + coralW * 8 + kelpW * 6) * leafThin);
          for (let i = 0; i < nTufts; i++) {
            const x = baseX + (r() - 0.5) * OUTER_CELL;
            const z = baseZ + (r() - 0.5) * OUTER_CELL;
            if (outerEdge(x, z) < 175) continue;
            const y = outerHeight(x, z);
            const ty = purpleW > 0.36 ? (r() < 0.55 ? 5 : 3) : coralW > 0.36 ? (r() < 0.45 ? 6 : 2) : (r() < 0.5 ? 2 : 7);
            const blades = 3 + floor(r() * 4);
            for (let j = 0; j < blades; j++) {
              const a = r() * TAU;
              const L = ty === 5 ? (0.28 + r() * 0.45) : (0.9 + r() * 1.6);
              pushLeaf(x + cos(a) * 0.25, y - 0.08, z + sin(a) * 0.25, L, a, 0.12 + r() * 0.65, ty === 5 ? 0.08 : 0.18, 1.2, ty, r(), r(), 0.35 + r() * 0.45);
            }
          }
        }
      }

      // 4. Regional fish schools (1 school every ~4th cell)
      if (((gx * 73856093) ^ (gz * 19349663)) % 5 === 0 && fishCount + 36 <= MAX_FISH) {
        const y = min(-9, outerHeight(baseX, baseZ) + 6 + r() * 12);
        const rad = 9 + r() * 10;
        const dir = r() < 0.5 ? 1 : -1;
        const kind = coralW > 0.35 ? 1 : purpleW > 0.35 ? 2 : 0;
        const phase = r() * 0.9;
        const count = min(MAX_FISH - fishCount, floor((26 + r() * 24) * leafThin));
        for (let i = 0; i < count; i++) {
          const o = (fishCount++) * 8;
          fishBuf[o] = baseX; fishBuf[o + 1] = y; fishBuf[o + 2] = baseZ; fishBuf[o + 3] = rad;
          fishBuf[o + 4] = r(); fishBuf[o + 5] = (dir * 1.75) / rad; fishBuf[o + 6] = 0.28 + r() * 0.12; fishBuf[o + 7] = phase + kind;
        }
      }

      // 5. Outer sea turtles, mantas & bioluminescent jellyfish
      const cellHash = oh2(gx + 19, gz - 31);
      if (cellHash > 0.90 && turtleCount < MAX_TURTLES && (coralW > 0.25 || kelpW > 0.25)) {
        const o = (turtleCount++) * 8;
        const y = min(-8, outerHeight(baseX, baseZ) + 7 + r() * 10);
        turtleBuf[o] = baseX; turtleBuf[o + 1] = y; turtleBuf[o + 2] = baseZ; turtleBuf[o + 3] = 7 + r() * 5;
        turtleBuf[o + 4] = r() * TAU; turtleBuf[o + 5] = (r() < 0.5 ? 1 : -1) * (0.11 + r() * 0.05); turtleBuf[o + 6] = 2.0 + r() * 0.55; turtleBuf[o + 7] = 0;
      }
      if (cellHash < 0.08 && mantaCount < MAX_MANTAS) {
        const o = (mantaCount++) * 8;
        const y = min(-9, outerHeight(baseX, baseZ) + 14 + r() * 10);
        mantaBuf[o] = baseX; mantaBuf[o + 1] = y; mantaBuf[o + 2] = baseZ; mantaBuf[o + 3] = 20 + r() * 16;
        mantaBuf[o + 4] = r() * TAU; mantaBuf[o + 5] = (r() < 0.5 ? 1 : -1) * (0.055 + r() * 0.03); mantaBuf[o + 6] = 3.8 + r() * 1.6; mantaBuf[o + 7] = r();
      }
      if (purpleW > 0.34 && cellHash > 0.62 && jellyCount + 3 <= MAX_JELLIES) {
        const nj = min(3, MAX_JELLIES - jellyCount);
        for (let j = 0; j < nj; j++) {
          const x = baseX + (r() - 0.5) * 16, z = baseZ + (r() - 0.5) * 16;
          const y = min(-10, outerHeight(x, z) + 5 + r() * 11);
          const o = (jellyCount++) * 8;
          jellyBuf[o] = x; jellyBuf[o + 1] = y; jellyBuf[o + 2] = z; jellyBuf[o + 3] = 0;
          jellyBuf[o + 4] = r() * TAU; jellyBuf[o + 5] = 0; jellyBuf[o + 6] = 0.72 + r() * 0.45; jellyBuf[o + 7] = 0;
        }
      }

      // 6. Thermal bubble vents (especially dramatic in Basalt Thermal Trenches)
      if ((trenchW > 0.30 || cellHash > 0.88) && bubbleCount + 24 <= MAX_BUBBLES) {
        const vx = baseX + (r() - 0.5) * 14, vz = baseZ + (r() - 0.5) * 14;
        const vy = outerHeight(vx, vz);
        const nb = min(MAX_BUBBLES - bubbleCount, floor(18 + trenchW * 30));
        for (let b = 0; b < nb; b++) {
          const sz = r() < 0.25 ? (0.1 + r() * 0.18) : (0.03 + r() * 0.06);
          const o = (bubbleCount++) * 8;
          bubbleBuf[o] = vx + (r() - 0.5) * 0.8; bubbleBuf[o + 1] = vy; bubbleBuf[o + 2] = vz + (r() - 0.5) * 0.8; bubbleBuf[o + 3] = sz;
          bubbleBuf[o + 4] = r(); bubbleBuf[o + 5] = (1.1 + r() * 1.4) * (0.6 + sz * 3); bubbleBuf[o + 6] = -vy - 0.2; bubbleBuf[o + 7] = 0.06 + r() * 0.12;
        }
      }
    }
    dirty = true;
    return true;
  }

  return {
    caps: { MAX_ROCKS, MAX_PROPS, MAX_LEAVES, MAX_FISH, MAX_TURTLES, MAX_MANTAS, MAX_JELLIES, MAX_BUBBLES },
    archBuf, archCount: arches.length,
    rockBufs, rockCounts,
    propBufs, propCounts,
    leafBuf, get leafCount() { return leafCount; },
    fishBuf, get fishCount() { return fishCount; },
    turtleBuf, get turtleCount() { return turtleCount; },
    mantaBuf, get mantaCount() { return mantaCount; },
    jellyBuf, get jellyCount() { return jellyCount; },
    bubbleBuf, get bubbleCount() { return bubbleCount; },
    get dirty() { return dirty; },
    clearDirty() { dirty = false; },
    update,
  };
}
