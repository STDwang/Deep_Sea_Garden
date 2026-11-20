/*! Cold Smoke Human: Copyright (c) 2026 Huisky, MIT. Anatomical body, 59-bone skeleton and skinning, unmodified core. */
// ---------------------------------------------------------------- the human lab's body and motion (generated: do not edit here)
// Made by code-only-game-kit research/human/tools/export_rider.js from its dist/human.js: the skeleton, the ski and board solvers, Human.Turn
// (a whole turn from its phase, amplitude and speed) and Human.Moves (jumps and air tricks), and the riders' motion sets. Read by 08i_labride.js.
// ---------------------------------------------------------------- Human: small vector / quaternion / dual-quaternion helpers
// The human body module (human/) is self-contained: it reads no game globals and can be dropped into any page.
// Everything lives under the one global `Human`.
var Human = (typeof Human !== 'undefined' && Human) || {};
(() => {
  const V = Human.v3 = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
    mad: (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    len: a => Math.hypot(a[0], a[1], a[2]),
    norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
    lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  };
  // quaternions [x, y, z, w]
  const Q = Human.q = {
    id: () => [0, 0, 0, 1],
    axis(ax, ang) { const s = Math.sin(ang / 2), n = V.norm(ax); return [n[0] * s, n[1] * s, n[2] * s, Math.cos(ang / 2)]; },
    mul(a, b) { return [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]]; },
    conj: a => [-a[0], -a[1], -a[2], a[3]],
    norm(a) { const l = Math.hypot(a[0], a[1], a[2], a[3]) || 1; return [a[0] / l, a[1] / l, a[2] / l, a[3] / l]; },
    rot(q, v) { const x = q[0], y = q[1], z = q[2], w = q[3], tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
      return [v[0] + w * tx + y * tz - z * ty, v[1] + w * ty + z * tx - x * tz, v[2] + w * tz + x * ty - y * tx]; },
    // intrinsic X then Y then Z (radians)
    euler(x, y, z) { return Q.mul(Q.mul(Q.axis([1, 0, 0], x), Q.axis([0, 1, 0], y)), Q.axis([0, 0, 1], z)); },
    slerp(a, b, t) { let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]; if (d < 0) { b = b.map(v => -v); d = -d; }
      if (d > 0.9995) return Q.norm(a.map((v, i) => v + (b[i] - v) * t)); const th = Math.acos(d), s = Math.sin(th), wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s; return a.map((v, i) => v * wa + b[i] * wb); },
    // swing-twist about a unit axis: returns [swing, twist], q = swing * twist
    swingTwist(q, ax) { const d = q[0] * ax[0] + q[1] * ax[1] + q[2] * ax[2]; let tw = [ax[0] * d, ax[1] * d, ax[2] * d, q[3]]; const l = Math.hypot(...tw); tw = l < 1e-9 ? [0, 0, 0, 1] : tw.map(v => v / l); return [Q.mul(q, Q.conj(tw)), tw]; },
    angle(q) { return 2 * Math.atan2(Math.hypot(q[0], q[1], q[2]), Math.abs(q[3])); },
    pow(q, t) { const [x, y, z, w] = q[3] < 0 ? q.map(v => -v) : q, s = Math.hypot(x, y, z); if (s < 1e-9) return [0, 0, 0, 1]; const a = Math.atan2(s, w) * t; return [x / s * Math.sin(a), y / s * Math.sin(a), z / s * Math.sin(a), Math.cos(a)]; },
  };
  Human.clamp = (x, a, b) => x < a ? a : x > b ? b : x;
  Human.smooth = (a, b, x) => { const t = Human.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  Human.smin = (a, b, k) => { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
  Human.DEG = Math.PI / 180;
})();

// ---------------------------------------------------------------- Human: body parameters -> measurements
// A few numbers (sex, stature, mass, body fat, frame) become the measurements the body is built to: girths, breadths, landmark heights.
// All the numbers are from ANSUR II (US Army anthropometric survey, 2012, public release 2017; 4,082 men and 1,986 women), regressions fitted on the
// raw CSVs (see research/03_body_shape.md). Lengths in metres, mass in kg. sex: 0 = male, 1 = female (a blend, for the mannequin's shape only).
(() => {
  const lerp = (a, b, t) => a + (b - a) * t;
  // girth = c0 + cS * S(mm) + cM * kg  (male, female)
  const REG = {
    chest:   [[1036, -0.291, 6.23], [990, -0.329, 7.27]],
    waist:   [[1025, -0.436, 7.96], [1014, -0.472, 9.08]],
    buttock: [[808, -0.140, 5.35], [847, -0.178, 6.86]],
    thigh:   [[595, -0.184, 4.13], [584, -0.194, 5.14]],
    calf:    [[351, -0.068, 1.89], [306, -0.051, 2.23]],
    biceps:  [[380, -0.122, 2.25], [341, -0.140, 2.83]],    // flexed: the relaxed arm is taken as 0.9 of it
    neck:    [[408, -0.085, 1.63], [306, -0.047, 1.48]],
    biacromial: [[205, 0.092, 0.59], [132, 0.128, 0.36]],
  };
  // + 1 % body fat at the same stature and mass (mm): fat moves out of the limbs' muscle and into the trunk (men) or hips and thighs (women)
  const BF = { biceps: [-2.2, -0.7], forearm: [-1.7, -1.1], calf: [-1.0, -1.8], thigh: [0.1, 2.1], chest: [1.8, 2.7], buttock: [1.3, 2.9], waist: [2.5, 1.5] };
  const BF_MEAN = [21.7, 30];          // (the women's 36 % from the Navy formula is an overestimate; 30 is used as their centre)
  // landmark heights as a fraction of stature (male, female)
  const LM = { c7: [0.864, 0.857], notch: [0.819, 0.816], acromion: [0.820, 0.820], nipple: [0.735, 0.719], rib10: [0.638, 0.648], crest: [0.604, 0.611],
    navel: [0.601, 0.602], troch: [0.513, 0.519], crotch: [0.482, 0.480], patella: [0.278, 0.276], tibiale: [0.266, 0.269], malleolus: [0.042, 0.039] };
  // means for the measures with no regression (mm at the sexes' mean stature and mass): scaled as girth ~ sqrt(mass / stature)
  const MEAN = { S: [1756, 1629], kg: [85.5, 67.8], forearm: [310 * 0.9, 264 * 0.9], wrist: [176, 155], ankle: [229, 216], lowthigh: [409, 401],
    foot: [271, 246], footB: [102, 93], hand: [193, 181], head: [574, 561], headB: [154, 148], headL: [200, 190], hip: [346, 354], bicristal: [275, 273] };

  Human.DEFAULTS = { sex: 0, stature: 1.756, mass: 75, bodyFat: 18, frame: 0, def: 1 };
  Human.PRESETS = { male: { sex: 0, stature: 1.756, mass: 75, bodyFat: 18, frame: 0, def: 1 }, female: { sex: 1, stature: 1.629, mass: 60, bodyFat: 27, frame: 0, def: 1 } };

  Human.measure = (p = {}) => {
    p = Object.assign({}, Human.DEFAULTS, p);
    const s = Human.clamp(p.sex, 0, 1), S = p.stature * 1000, kg = p.mass;
    const reg = k => { const [m, f] = REG[k]; return lerp(m[0] + m[1] * S + m[2] * kg, f[0] + f[1] * S + f[2] * kg, s); };
    const dBF = p.bodyFat - lerp(BF_MEAN[0], BF_MEAN[1], s);
    const bf = k => BF[k] ? lerp(BF[k][0], BF[k][1], s) * dBF : 0;
    const mean = k => lerp(MEAN[k][0], MEAN[k][1], s);
    const sc = Math.sqrt((kg / mean('kg')) / (S / mean('S')));     // girth scale for the measures with no regression
    const G = {                                                   // girths, mm
      chest: reg('chest') + bf('chest'), waist: reg('waist') + bf('waist'), buttock: reg('buttock') + bf('buttock'), thigh: reg('thigh') + bf('thigh'),
      calf: reg('calf') + bf('calf'), arm: 0.9 * reg('biceps') + bf('biceps'), neck: reg('neck'),
      forearm: mean('forearm') * sc + bf('forearm'), wrist: mean('wrist') * Math.sqrt(sc), ankle: mean('ankle') * Math.sqrt(sc), lowthigh: mean('lowthigh') * sc + 0.5 * bf('thigh'),
    };
    const B = {                                                   // breadths and lengths, mm
      biacromial: reg('biacromial') * (1 + 0.06 * p.frame), hip: mean('hip') * Math.sqrt(sc) + bf('buttock') * 0.4, bicristal: mean('bicristal') * (S / mean('S')),
      foot: mean('foot') * S / mean('S'), footB: mean('footB') * S / mean('S'), hand: mean('hand') * S / mean('S'),
      headB: mean('headB') * Math.pow(S / mean('S'), 0.3), headL: mean('headL') * Math.pow(S / mean('S'), 0.3),
    };
    const L = {}; for (const k in LM) L[k] = lerp(LM[k][0], LM[k][1], s) * S;
    // density 1.06 kg/L at ~18 % fat (Siri: 1 / D = 4.95 / (%BF/100 + 4.5)) -> the volume the body must hold
    const dens = 4.95 / (p.bodyFat / 100 + 4.5);
    return { p, sex: s, S, kg, bfDelta: dBF, G, B, L, density: dens, volume: kg / dens /* litres */ };
  };
})();

// ---------------------------------------------------------------- Human: the skeleton (59 bones) and how a pose is turned into bone rotations
// Coordinates: metres, y up, z forward (the way the body faces), x to the body's LEFT. Canonical rest pose: the T-pose, arms straight out along
// +-x, palms down, thumbs forward; legs straight, feet forward. Every bone's rest frame is the world frame, so a bone's local rotation is simply its
// rotation relative to its parent, and a point given in canonical space x_c rides bone b to  R_b (x_c - J_b) + P_b.
// Bone list: the research/02 Tier A list (VRM / Unity Humanoid superset): scapula, twist bones, a 5-piece spine and the foot bones are driven by
// code from measured rhythms and are never set directly.
// A pose is given anatomically (degrees): spine flexion, arm elevation and plane, hip flexion ... (see Human.restPose), and turned into bone rotations
// here: the spine's bend spread over five bones by measured shares, the shoulder girdle placed by the scapulohumeral rhythm, pronation spread over the
// forearm by twist bones. The right side is computed as the left and mirrored.
(() => {
  const V = Human.v3, Q = Human.q, D = Human.DEG, clamp = Human.clamp;
  // name, parent, canonical joint position (mm, at stature 1756; left side, +x), and which landmark scale applies
  const BONES = [
    ['root', null, [0, 0, 0]],
    ['pelvis', 'root', [0, 930, -20]],
    ['lumbar_lo', 'pelvis', [0, 1010, -58]],
    ['lumbar_hi', 'lumbar_lo', [0, 1095, -60]],
    ['thorax_lo', 'lumbar_hi', [0, 1180, -64]],
    ['thorax_mid', 'thorax_lo', [0, 1280, -70]],
    ['thorax_hi', 'thorax_mid', [0, 1390, -68]],
    ['neck_lo', 'thorax_hi', [0, 1505, -58]],
    ['neck_hi', 'neck_lo', [0, 1562, -40]],
    ['head', 'neck_hi', [0, 1608, -22]],
    ['jaw', 'head', [0, 1605, 2]],
    ['eye_L', 'head', [32, 1668, 72]],
    ['eye_R', 'head', [-32, 1668, 72]],
  ];
  const SIDE = [
    ['clavicle', 'thorax_hi', [22, 1440, 48]],
    ['scapula', 'clavicle', [182, 1446, -12]],
    ['upperarm', 'scapula', [176, 1404, -6]],
    ['upperarm_twist_01', 'upperarm', [176 + 110, 1404, -6]],
    ['upperarm_twist_02', 'upperarm', [176 + 220, 1404, -6]],
    ['forearm', 'upperarm', [506, 1404, -6]],
    ['forearm_twist_01', 'forearm', [506 + 85, 1404, -6]],
    ['forearm_twist_02', 'forearm', [506 + 170, 1404, -6]],
    ['hand', 'forearm', [762, 1404, -6]],
    ['thumb_cmc', 'hand', [774, 1394, 18]],
    ['thumb_mcp', 'thumb_cmc', [806, 1388, 42]],
    ['thumb_ip', 'thumb_mcp', [834, 1386, 56]],
    ['fingers_mcp', 'hand', [858, 1402, -2]],
    ['fingers_ip', 'fingers_mcp', [902, 1401, -2]],
    ['thigh', 'pelvis', [88, 895, 4]],
    ['thigh_twist', 'thigh', [89, 683, 4]],
    ['shin', 'thigh', [91, 490, 2]],          // the knee turns about the femur's condyles, ~2 cm above the joint line (tibiale, 0.266 H)
    ['shin_twist', 'shin', [91, 272, 0]],
    ['talus', 'shin', [91, 76, -6]],
    ['foot', 'talus', [91, 50, -20]],
    ['midfoot', 'foot', [96, 36, 46]],
    ['toe_hallux', 'midfoot', [72, 20, 140]],
    ['toes_lesser', 'midfoot', [112, 16, 124]],
  ];
  for (const sd of ['L', 'R']) for (const [n, par, j] of SIDE)
    BONES.push([n + '_' + sd, par === 'pelvis' || par === 'thorax_hi' ? par : par + '_' + sd, sd === 'L' ? j : [-j[0], j[1], j[2]]]);
  Human.BONE_NAMES = BONES.map(b => b[0]);
  const REF = {}; BONES.forEach(b => REF[b[0]] = b[2]);             // reference joint positions (mm, stature 1756)

  // canonical joint positions for a body: heights scale with stature (the landmark fractions are near constant across people), the shoulders with
  // the biacromial breadth, the hips with the pelvis
  function build(M) {
    const k = M.S / 1756, sh = M.B.biacromial / 411 / k, hp = (M.B.bicristal / 275) * (1 + 0.05 * M.sex) / k * (M.S / 1756) / k;
    const bones = BONES.map(([name, parent, j], i) => {
      let x = j[0], y = j[1], z = j[2];
      const arm = /clavicle|scapula|upperarm|forearm|hand|thumb|fingers/.test(name) && !/clavicle/.test(name);
      if (arm) x = Math.sign(x) * (Math.abs(x) - 176 + 176 * sh);               // the whole arm moves out with the shoulder
      else if (/scapula/.test(name)) x *= sh;
      if (/thigh|shin|talus|foot|toe/.test(name)) x *= hp;
      return { name, parent, i, J: [x * k / 1000, y * k / 1000, z * k / 1000] };
    });
    const idx = {}; bones.forEach(b => idx[b.name] = b.i);
    bones.forEach(b => { b.p = b.parent ? idx[b.parent] : -1; });
    bones.forEach(b => { b.children = bones.filter(c => c.p === b.i).map(c => c.i); });
    return { bones, idx, M, n: bones.length };
  }

  // ---- the anatomical pose (degrees). Zero is the anatomical standing position with the palms facing the thighs (forearm mid-prone).
  // arm: elev = thoracohumeral elevation from hanging (0) through horizontal (90) to overhead (180); plane = 0 out to the side (abduction plane),
  // 90 straight forward (flexion plane), -45 behind; axial = humeral rotation (+ internal); elbow flexion; pron (+ pronation, - supination);
  // wflex (+ palm-ward), wdev (+ ulnar); grip 0..1 (fingers curl); thumb 0..1. shrug, protract: extra clavicle elevation / protraction (deg).
  // leg: flex (hip), abd (+ out), rot (+ internal), knee (flexion), ankle (+ plantarflexion, - dorsiflexion), inv (+ inversion, subtalar), toe (+ up).
  // spine: flex (+ forward), lat (+ to the left), twist (+ shoulders turned to the left). neck: flex, lat, yaw (+ to the left).
  // root: pos (metres, added to the pelvis), rot (deg, x y z intrinsic: x + tips the pelvis forward).
  Human.restPose = () => ({
    root: { pos: [0, 0, 0], rot: [0, 0, 0], spin: 0, flip: 0 }, spine: { flex: 0, lat: 0, twist: 0 }, neck: { flex: 0, lat: 0, yaw: 0 }, jaw: 0, plant: [0, 0], unbind: 0,   // plant: how far each ski pole (L, R) is planted in the snow, 0..1; unbind: 1 = the rear foot is out of its board binding (one-foot skating)
   
    arm_L: { elev: 0, plane: 0, axial: 0, elbow: 0, pron: 0, wflex: 0, wdev: 0, grip: 0.3, thumb: 0.25, shrug: 0, protract: 0 },
    arm_R: { elev: 0, plane: 0, axial: 0, elbow: 0, pron: 0, wflex: 0, wdev: 0, grip: 0.3, thumb: 0.25, shrug: 0, protract: 0 },
    leg_L: { flex: 0, abd: 0, rot: 0, knee: 0, ankle: 0, inv: 0, toe: 0 },
    leg_R: { flex: 0, abd: 0, rot: 0, knee: 0, ankle: 0, inv: 0, toe: 0 },
  });
  // joint ranges (CDC / Soucie 2011 and AAOS normative values; research/02). A pose outside them is clamped and the overrun reported.
  // Ankle dorsiflexion is the weight-bearing value (knee-to-wall lunge, about 35-45 deg in healthy adults; Bennell 1998), not the 20 deg passive value:
  // squats, landings, ski and snowboard stances all load the ankle.
  const ROM = {
    spine: { flex: [-30, 90], lat: [-35, 35], twist: [-45, 45] }, neck: { flex: [-55, 50], lat: [-40, 40], yaw: [-75, 75] },
    arm: { elev: [0, 175], plane: [-90, 135], axial: [-90, 70], elbow: [0, 148], pron: [-85, 80], wflex: [-65, 75], wdev: [-20, 30], grip: [0, 1], thumb: [0, 1], shrug: [-10, 30], protract: [-20, 30] },
    leg: { flex: [-18, 130], abd: [-20, 45], rot: [-45, 45], knee: [0, 140], ankle: [-35, 55], inv: [-10, 25], toe: [-35, 80] },
  };
  Human.ROM = ROM;
  Human.clampPose = pose => {
    const over = [];
    const cl = (o, R, tag) => { for (const k in R) if (o[k] != null) { const [a, b] = R[k], v = clamp(o[k], a, b); if (v !== o[k]) over.push([tag + '.' + k, o[k] - v]); o[k] = v; } };
    cl(pose.spine, ROM.spine, 'spine'); cl(pose.neck, ROM.neck, 'neck');
    for (const s of ['L', 'R']) { cl(pose['arm_' + s], ROM.arm, 'arm_' + s); cl(pose['leg_' + s], ROM.leg, 'leg_' + s); }
    // hip internal rotation shrinks as the hip flexes (est.); deep flexion with the knee straight is limited by the hamstrings
    for (const s of ['L', 'R']) { const l = pose['leg_' + s]; const lim = 45 - 15 * clamp(l.flex / 110, 0, 1); if (l.rot > lim) { over.push(['leg_' + s + '.rot', l.rot - lim]); l.rot = lim; }
      const ham = 80 + 1.0 * l.knee; if (l.flex > ham) { over.push(['leg_' + s + '.flex(hamstrings)', l.flex - ham]); l.flex = ham; } }
    return over;
  };

  // shares of the trunk's bend per spine bone (lumbar_lo .. thorax_hi) and of the neck's per neck bone (neck_lo, neck_hi, head)
  const SPINE = { flex: [0.32, 0.24, 0.16, 0.14, 0.14], lat: [0.18, 0.22, 0.24, 0.22, 0.14], twist: [0.04, 0.06, 0.25, 0.35, 0.30] };
  const NECK = { flex: [0.30, 0.35, 0.35], lat: [0.35, 0.35, 0.30], yaw: [0.2, 0.3, 0.5] };
  const mirror = q => [q[0], -q[1], -q[2], q[3]];
  const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];
  const ax = (a, deg) => Q.axis(a, deg * D);
  const HANG = ax(Z, -90);                         // T-pose arm (+x, palm down) -> hanging (palm toward the thigh)

  // the left arm's rotations in the thorax frame (as if the thorax were at rest): clavicle, scapula, humerus; then local rotations below the humerus
  function armLocal(a) {
    const e = a.elev, s = clamp((e - 15) / 135, 0, 1);
    // scapulohumeral rhythm (McClure 2001): through the raise the clavicle lifts 10 deg and draws back 20, the scapula turns upward 50, tilts back 30
    const clav = Q.mul(ax(Y, 20 * s - a.protract), ax(Z, 10 * s + a.shrug));
    const scapTh = Q.mul(clav, Q.mul(ax(Z, 40 * s), Q.mul(ax(X, -30 * s), ax(Y, 4 * s))));
    // humerus: from hanging, swung up by elev in the chosen plane, then turned about its own axis
    const pl = a.plane * D, swingAx = [-Math.sin(pl), 0, Math.cos(pl)];
    const sw = Q.axis(swingAx, e * D);
    const dir = Q.rot(sw, [0, -1, 0]);
    // the humerus keeps the palm's natural turn when raised in front (Codman): axial counted from that
    const humTh = Q.mul(Q.axis(dir, -a.axial * D), Q.mul(sw, HANG));
    const pr = a.pron * D;
    return {
      clavicle: clav,
      scapula: Q.mul(Q.conj(clav), scapTh),
      upperarm: Q.mul(Q.conj(scapTh), humTh),
      forearm: ax(Y, -a.elbow),
      hand: Q.mul(Q.axis(X, pr), Q.mul(ax(Z, -a.wflex), ax(Y, a.wdev))),
      fingers_mcp: ax(Z, -80 * a.grip), fingers_ip: ax(Z, -95 * a.grip),
      thumb_cmc: Q.mul(ax(X, 35 * a.thumb), ax(Z, -15 * a.thumb)), thumb_mcp: ax(Y, -35 * a.thumb), thumb_ip: ax(Y, -45 * a.thumb),
    };
  }
  const SUBTALAR = V.norm([-Math.sin(16 * D) * Math.cos(42 * D), Math.sin(42 * D), Math.cos(16 * D) * Math.cos(42 * D)]);
  const TALOCRURAL = V.norm([1, -Math.tan(8 * D), 0]);      // ~82 deg from vertical (Inman), the lateral end lower
  function legLocal(l) {
    return {
      thigh: Q.mul(ax(X, -l.flex), Q.mul(ax(Z, l.abd), ax(Y, -l.rot))),
      thigh_twist: ax(Y, l.rot * 0.5),                                       // the upper thigh's flesh follows half of the femur's own turn
      shin: Q.mul(ax(X, l.knee), ax(Y, -12 * clamp(l.knee / 90, 0, 1) + 4 * clamp(1 - l.knee / 15, 0, 1))),  // tibia turns in as the knee bends (screw-home)
      shin_twist: Q.id(),
      talus: Q.axis(TALOCRURAL, l.ankle * D),
      foot: Q.axis(SUBTALAR, -l.inv * D),
      midfoot: Q.id(),
      toe_hallux: ax(X, -l.toe), toes_lesser: ax(X, -l.toe * 0.85),
    };
  }

  // anatomical pose -> local rotation per bone (array of quaternions) + root position
  function poseLocals(sk, pose) {
    const L = sk.bones.map(() => Q.id()), I = sk.idx;
    const r = pose.root.rot;
    // root.spin: a turn about the vertical in the world (deg), root.flip: a turn about the side-to-side axis (- = backflip), both outside the
    // body's own lean, for tricks in the air
    L[I.pelvis] = Q.mul(Q.mul(Q.axis([0, 1, 0], (pose.root.spin || 0) * D), Q.axis([1, 0, 0], (pose.root.flip || 0) * D)), pose.root.yf ? Q.mul(Q.mul(Q.axis([0, 1, 0], r[1] * D), Q.axis([1, 0, 0], r[0] * D)), Q.axis([0, 0, 1], r[2] * D)) : Q.euler(r[0] * D, r[1] * D, r[2] * D));
    // (root.yf: the yaw outermost, so pitch and roll stay the body's own when it is turned across the hill: review adjust9)
    const sp = pose.spine, nk = pose.neck;
    ['lumbar_lo', 'lumbar_hi', 'thorax_lo', 'thorax_mid', 'thorax_hi'].forEach((n, i) =>
      L[I[n]] = Q.mul(ax(X, sp.flex * SPINE.flex[i]), Q.mul(ax(Z, -sp.lat * SPINE.lat[i]), ax(Y, sp.twist * SPINE.twist[i]))));
    ['neck_lo', 'neck_hi', 'head'].forEach((n, i) =>
      L[I[n]] = Q.mul(ax(X, nk.flex * NECK.flex[i]), Q.mul(ax(Z, -nk.lat * NECK.lat[i]), ax(Y, nk.yaw * NECK.yaw[i]))));
    L[I.jaw] = ax(X, pose.jaw || 0);
    for (const s of ['L', 'R']) {
      const set = (o, mir) => { for (const k in o) { const q = o[k]; L[I[k + '_' + s]] = mir ? mirror(q) : q; } };
      const arm = armLocal(pose['arm_' + s]);
      // forearm twist bones as absolute shares of the pronation about the forearm axis (they are children of the forearm, which does not pronate)
      const pr = pose['arm_' + s].pron * D;
      arm.forearm_twist_01 = Q.axis(X, pr * 0.33); arm.forearm_twist_02 = Q.axis(X, pr * 0.66);
      // upper-arm twist bones: the humerus carries the full axial turn; the flesh near the shoulder is turned back by half, mid-arm by a quarter
      const axl = pose['arm_' + s].axial * D, hdir = [1, 0, 0];
      arm.upperarm_twist_01 = Q.axis(hdir, axl * 0.5); arm.upperarm_twist_02 = Q.axis(hdir, axl * 0.25);
      set(arm, s === 'R');
      set(legLocal(pose['leg_' + s]), s === 'R');
    }
    return L;
  }

  // forward kinematics: world rotation R and position P per bone
  function fk(sk, L, rootPos) {
    const n = sk.n, R = new Array(n), P = new Array(n);
    for (const b of sk.bones) {
      if (b.p < 0) { R[b.i] = L[b.i]; P[b.i] = b.J.slice(); continue; }
      const pr = R[b.p];
      R[b.i] = Q.norm(Q.mul(pr, L[b.i]));
      P[b.i] = V.add(P[b.p], Q.rot(pr, V.sub(b.J, sk.bones[b.p].J)));
      if (b.name === 'pelvis' && rootPos) P[b.i] = V.add(P[b.i], rootPos);
    }
    return { R, P };
  }
  // a pose -> world transforms (clamped to the joint ranges first; the overrun is returned)
  function pose(sk, anat) {
    const p = JSON.parse(JSON.stringify(anat)), over = Human.clampPose(p);
    const xf = fk(sk, poseLocals(sk, p), p.root.pos);
    xf.over = over; xf.anat = p;
    return xf;
  }
  // canonical point -> posed point on bone b
  const apply = (xf, sk, b, x) => V.add(xf.P[b], Q.rot(xf.R[b], V.sub(x, sk.bones[b].J)));
  const applyInv = (xf, sk, b, p) => V.add(sk.bones[b].J, Q.rot(Q.conj(xf.R[b]), V.sub(p, xf.P[b])));

  // interpolate two anatomical poses (every number linearly; the joint maths downstream keeps it smooth)
  Human.lerpPose = (a, b, t) => {
    // spin and flip are whole turns in the air: they take the short way round, so -358 to 0 is a 2 degree step and not a turn backwards
    const wrap = (x, y) => x + ((((y - x) % 360) + 540) % 360 - 180) * t;
    const f = (x, y, k) => (k === 'spin' || k === 'flip') ? wrap(x || 0, y || 0) : typeof x === 'number' ? x + (y - x) * t : Array.isArray(x) ? x.map((v, i) => f(v, y[i])) : Object.fromEntries(Object.keys(x).map(k => [k, f(x[k], y[k] != null ? y[k] : x[k], k)]));
    return f(a, b);
  };
  Human.Skeleton = { REF, build, pose, poseLocals, fk, apply, applyInv, armLocal, legLocal, SPINE, NECK };
})();

// ---------------------------------------------------------------- Human: the body's volume, as a signed distance field riding the bones
// Three kinds of piece, all given on a reference man (stature 1756 mm) in mm and carried to any body through the bones they ride:
//   loft     a stack of cross-sections along a segment: at each station a superellipse with four radii (to either side and to front and back),
//            the way ANSUR measures a body (breadth, depth, girth). A loft is cut into slabs, one per bone it spans, each slab riding its own bone
//            (the trunk's loft rides the five spine bones, the forearm's the twist bones), so the volume bends and twists where the skeleton does.
//   muscle   a belly on its action line, from an origin on one bone to an insertion on another; as the line shortens the belly thickens and as it
//            lengthens it thins, r = r0 * sqrt(L0 / L), which holds its volume (Scheepers 1997; Aubel & Thalmann 2000).
//   ellipsoid for the head's mannequin forms.
// The base lofts are the body under the superficial muscles; their radii are scaled per measured level (chest, waist, thigh ...) until the body's
// girths, measured the way a tape measures them, are the girths ANSUR predicts for its stature, mass and body fat (Human.Body.calibrate).
// Groups (trunk, neck and head, each arm, each leg) are joined to the trunk with a smooth minimum; the legs and the arms never with each other, so the
// thighs touch without webbing and an arm against the side stays an arm.
(() => {
  const V = Human.v3, Q = Human.q, REF = () => Human.Skeleton.REF, smin = Human.smin;

  // ---- the pieces (reference man; mm). Loft station: [t, rU+, rU-, rV+, rV-, n, cu, cv, girth key]
  // trunk: y from 800 to 1530, u = x (to the side), v = z (front); centre line z = cv
  const TRUNK = [
    // y     w    zF    zB   zW   n    girth     back half wider (lats, scapulae)
    [800, 26, 10, -34, -22, 2.0, 'buttock', 1],
    [822, 50, 26, -58, -26, 2.1, 'buttock', 1],
    [848, 112, 48, -90, -32, 2.3, 'buttock', 1],
    [878, 140, 62, -116, -38, 2.4, 'buttock', 1],
    [905, 146, 72, -124, -36, 2.5, 'buttock', 1],
    [950, 140, 80, -120, -28, 2.5, 'buttock', 1],
    [1000, 134, 90, -114, -18, 2.5, 'waist', 1],   // (review adjust3: waist about 88 % of the hips' width, not a box)
    [1055, 128, 96, -110, -12, 2.5, 'waist', 1],
    [1110, 134, 98, -116, -10, 2.5, 'waist', 1.02],
    [1180, 146, 100, -120, -10, 2.5, 'chest', 1.06],
    [1240, 145, 106, -124, -8, 2.5, 'chest', 1.12],
    [1290, 140, 112, -126, -8, 2.4, 'chest', 1.15],
    [1350, 136, 112, -124, -10, 2.3, 'chest', 1.14],
    [1410, 126, 98, -118, -15, 2.2, 'chest', 1.08],
    [1452, 106, 70, -106, -22, 2.1, 'chest', 1.02],
    [1490, 76, 34, -92, -30, 2.0, 'neck', 1],
    [1530, 40, 10, -72, -36, 2.0, 'neck', 1],
  ];
  const trunkLoft = { name: 'trunk', group: 'trunk', A: ['pelvis', [0, 800, 0]], B: ['pelvis', [0, 1530, 0]], u: [1, 0, 0], v: [0, 0, 1],
    st: TRUNK.map(([y, w, zF, zB, zW, n, g, wb]) => [(y - 800) / 730, w, w, zF - zW, zW - zB, n, 0, zW, g, wb]),
    slabs: [['pelvis', -1, 1000], ['lumbar_lo', 1000, 1080], ['lumbar_hi', 1080, 1170], ['thorax_lo', 1170, 1260], ['thorax_mid', 1260, 1370], ['thorax_hi', 1370, 2]].map(([b, a, c]) => [b, a < 0 ? -1 : (a - 800) / 730, c < 10 ? c : (c - 800) / 730]) };
  const NECKL = [[1462, 62, 56, 64, -40, 2.1], [1500, 58, 50, 60, -36, 2.1], [1545, 55, 47, 54, -30, 2.1], [1590, 53, 44, 52, -22, 2.1], [1625, 46, 36, 48, -14, 2.1]];
  const neckLoft = { name: 'neck', group: 'neck', A: ['neck_lo', [0, 1462, 0]], B: ['neck_lo', [0, 1625, 0]], u: [1, 0, 0], v: [0, 0, 1],
    st: NECKL.map(([y, w, zF, zB, zW, n]) => [(y - 1462) / 163, w, w, zF, zB, n, 0, zW, 'neck']),
    slabs: [['neck_lo', -1, (1560 - 1462) / 163], ['neck_hi', (1560 - 1462) / 163, 2]] };
  // left arm (T-pose, along +x), one loft from the shoulder joint to the wrist, cut into slabs on the upper arm, its twist bones, the forearm and
  // its twist bones (so the elbow is one continuous surface). u = +y (top: the outside of the arm), v = +z (front). Stations at x (mm).
  // (the loft starts as a dome inside the shoulder, not a flat cut: with the arm down, that end is the round top of the shoulder)
  // (the stations up to 230 are the deltoid: they keep their size, the arm's girth is fitted on the stations below)
  const ARMS = [[112, 10, 10, 12, 12, 'shoulder'], [124, 30, 28, 34, 34, 'shoulder'], [138, 42, 38, 46, 46, 'shoulder'], [154, 46, 43, 52, 52, 'shoulder'], [176, 51, 46, 56, 56, 'shoulder'], [230, 55, 46, 55, 56, 'shoulder'], [290, 45, 55, 50, 54, 'arm'], [350, 41, 55, 59, 47, 'arm'],
    [400, 41, 50, 60, 39, 'arm'], [450, 41, 45, 53, 29, 'arm'], [490, 40, 44, 46, 30, 'forearm'], [506, 38, 42, 44, 32, 'forearm'], [530, 41, 43, 46, 33, 'forearm'],
    [560, 41, 42, 45, 34, 'forearm'], [610, 35, 38, 36, 33, 'forearm'], [660, 32, 30, 32, 30, 'wrist'], [720, 27, 22, 33, 26, 'wrist'], [770, 18, 19, 30, 29, 'wrist']];
  const ARM = { name: 'arm', group: 'arm', A: ['upperarm', null], B: ['hand', null], u: [0, 1, 0], v: [0, 0, 1],
    st: ARMS.map(([x, a, b, c, d, g]) => [(x - 176) / 586, a, b, c, d, x < 480 ? 2.2 : x < 650 ? 2.3 : 2.6, 0, -2, g]),
    slabs: [['upperarm_twist_01', -1, 0.19], ['upperarm_twist_02', 0.19, 0.38], ['upperarm', 0.38, 0.563], ['forearm', 0.563, 0.71], ['forearm_twist_01', 0.71, 0.85], ['forearm_twist_02', 0.85, 2]] };
  // the hand is a glove: the palm, the four fingers as one padded block (it curls at two rows of knuckles) and the thumb
  const PALM = { name: 'palm', group: 'arm', blend: 0.022, A: ['hand', null], B: ['fingers_mcp', null], u: [0, 1, 0], v: [0, 0, 1],
    st: [[-0.05, 18, 19, 30, 29, 2.6, 0, 0, 'wrist'], [0.3, 17, 19, 38, 36, 2.8, 0, 0, 'wrist'], [0.75, 16, 18, 41, 39, 2.8, 0, 0, 'wrist'], [1.0, 14, 15, 40, 38, 2.7, 0, 0, 'wrist']],
    slabs: [['hand', -1, 2]] };
  const FING = { name: 'fingers', group: 'arm', A: ['fingers_mcp', null], B: ['fingers_mcp', [952, 1402, -2]], u: [0, 1, 0], v: [0, 0, 1],
    st: [[0.0, 13, 14, 39, 37, 2.6, 0, 0, 'wrist'], [0.45, 12, 13, 37, 35, 2.6, 0, 0, 'wrist'], [0.78, 11, 11, 33, 31, 2.5, 0, 0, 'wrist'], [0.93, 9, 9, 26, 24, 2.3, 0, 0, 'wrist'], [1.0, 5, 5, 14, 13, 2, 0, 0, 'wrist']],
    slabs: [['fingers_mcp', -1, 0.47], ['fingers_ip', 0.47, 2]] };
  const THUMB = { name: 'thumb', group: 'arm', A: ['thumb_cmc', null], B: ['thumb_ip', [860, 1384, 68]], u: [0, 1, 0], v: [0, 0, 1],
    st: [[-0.1, 14, 16, 16, 16, 2.2, 0, 0, 'wrist'], [0.2, 13, 14, 15, 15, 2.2, 0, 0, 'wrist'], [0.55, 12, 12, 13, 13, 2.2, 0, 0, 'wrist'], [0.9, 10, 10, 11, 11, 2.2, 0, 0, 'wrist'], [1.0, 6, 6, 7, 7, 2, 0, 0, 'wrist']],
    slabs: [['thumb_cmc', -1, 0.42], ['thumb_mcp', 0.42, 0.72], ['thumb_ip', 0.72, 2]] };
  // left leg, one loft from the hip joint to the ankle, cut into slabs on the thigh, its twist bone, the shin and its twist bone. u = +x
  // (outside), v = +z (front). Stations at height y (mm): rU+ (outside), rU- (inside), rV+ (front), rV- (back), centre offset back
  const LEGS = [[937, 44, 50, 40, 52, -10, 'thigh'], [880, 75, 65, 82, 79, -8, 'thigh'], [846, 101, 67, 102, 89, -6, 'thigh'], [800, 85, 73, 107, 67, -4, 'thigh'],
    [740, 70, 80, 105, 56, -2, 'thigh'], [680, 69, 87, 106, 64, 0, 'lowthigh'], [600, 54, 81, 86, 63, 0, 'lowthigh'], [530, 48, 73, 65, 66, 0, 'lowthigh'],
    [490, 45, 59, 52, 68, -1, 'lowthigh'], [470, 43, 51, 45, 70, -2, 'calf'], [440, 45, 43, 38, 74, -2, 'calf'], [400, 49, 37, 30, 78, -3, 'calf'],
    [360, 55, 38, 28, 80, -4, 'calf'], [300, 50, 36, 28, 71, -6, 'calf'], [240, 44, 27, 25, 52, -6, 'calf'], [180, 36, 20, 25, 40, -6, 'ankle'],
    [120, 30, 17, 35, 37, -5, 'ankle'], [80, 33, 33, 31, 33, -4, 'ankle'], [55, 28, 28, 28, 30, -6, 'ankle']];
  const LEG = { name: 'leg', group: 'leg', A: ['thigh', null], B: ['talus', null], u: [1, 0, 0], v: [0, 0, 1],
    st: LEGS.map(([y, a, b, c, d, cv, g]) => [(895 - y) / 819, a, b, c, d, 2.3, 0, cv, g]),
    slabs: [['thigh_twist', -1, 0.25], ['thigh', 0.25, 0.495], ['shin', 0.495, 0.76], ['shin_twist', 0.76, 2]] };
  // foot: along z from the heel, u = +x, v = +y (up); cv = height of the section's centre above the sole
  const FOOTS = [[-70, 10, 10, 12, 12, 2.0, 0, 30], [-58, 27, 27, 30, 30, 2.1, 0, 32], [-30, 31, 31, 44, 40, 2.2, 0, 42], [0, 35, 33, 46, 38, 2.4, -2, 40],
    [40, 39, 35, 34, 32, 2.6, -4, 34], [90, 45, 39, 24, 24, 2.8, -6, 26], [130, 49, 43, 17, 18, 3.0, -7, 19], [165, 45, 41, 12, 14, 3.0, -9, 15], [190, 36, 36, 10, 11, 2.8, -10, 12], [202, 16, 16, 6, 7, 2.2, -10, 9]];
  const FOOT = { name: 'foot', group: 'leg', A: ['foot', [91, 0, -70]], B: ['foot', [91, 0, 202]], u: [1, 0, 0], v: [0, 1, 0],
    st: FOOTS.map(([z, a, b, c, d, n, cu, cv]) => [(z + 70) / 272, a, b, c, d, n, cu, cv, 'foot']),
    slabs: [['foot', -1, (25 + 70) / 272], ['midfoot', (25 + 70) / 272, (128 + 70) / 272], ['toe_hallux', (128 + 70) / 272, 2]] };
  // the shoulder's top, neck to acromion (the trapezius slope over the clavicle and the scapula's spine). u = +y (up), v = +z
  const SHOULDER = { name: 'shoulder', group: 'trunk', blend: 0.045, A: ['thorax_hi', [22, 1482, -46]], B: ['scapula', [174, 1428, -12]], u: [0, 1, 0], v: [0, 0, 1],
    st: [[-0.05, 24, 50, 40, 52, 2.2, 0, 0, 'chest'], [0.3, 21, 46, 42, 52, 2.2, 0, 0, 'chest'], [0.7, 17, 38, 40, 46, 2.2, 0, 0, 'chest'], [1.0, 12, 26, 32, 34, 2.2, 0, 0, 'chest'], [1.1, 8, 16, 20, 22, 2.0, 0, 0, 'chest']],
    slabs: [['thorax_hi', -1, 0.35], ['clavicle', 0.35, 0.7], ['scapula', 0.7, 2]] };
  const LOFTS_SIDE = [SHOULDER, ARM, PALM, FING, THUMB, LEG, FOOT];

  // head (mannequin forms): ellipsoids on the head and jaw, centre and radii in mm
  const HEAD = [   // (forms join with a 3 cm blend)
    ['head', [0, 1668, -8], [76, 90, 97]],         // cranium
    ['head', [0, 1614, 22], [64, 72, 74]],         // face
    ['head', [0, 1682, 62], [52, 16, 24]],         // brow
    ['head', [0, 1636, 88], [11, 20, 14]],         // nose
    ['head', [73, 1648, -6], [9, 29, 17]], ['head', [-73, 1648, -6], [9, 29, 17]],     // ears
    ['jaw', [0, 1566, 40], [57, 34, 52]],          // jaw
    ['jaw', [0, 1542, 66], [27, 20, 20]],          // chin
  ];

  // muscles (left side): name, group, origin bone, origin, insertion bone, insertion, belly radius, flatness (thickness / width), thickness
  // direction (reference frame), where along the line the belly peaks, blend (mm), how much of its thickness stands out of the base
  const MUSCLES = [
    ['deltoid_ant', 'arm', 'scapula', [150, 1452, 40], 'upperarm', [302, 1398, 18], 26, 0.6, [0, 0.6, 1], 0.4, 12, 0.38],
    ['deltoid_mid', 'arm', 'scapula', [190, 1446, -8], 'upperarm', [306, 1404, 0], 28, 0.6, [0, 1, 0], 0.35, 12, 0.34],
    ['deltoid_post', 'arm', 'scapula', [150, 1448, -64], 'upperarm', [302, 1400, -16], 25, 0.6, [0, 0.6, -1], 0.4, 12, 0.38],
    ['biceps', 'arm', 'scapula', [215, 1400, 24], 'forearm', [535, 1400, 10], 25, 0.85, [0, 0, 1], 0.6, 10, 0.45],
    ['triceps_long', 'arm', 'scapula', [168, 1386, -30], 'forearm', [500, 1408, -36], 26, 0.7, [0, 0, -1], 0.4, 10, 0.42],
    ['triceps_lat', 'arm', 'upperarm', [230, 1416, -24], 'forearm', [500, 1412, -34], 22, 0.7, [0, 0.7, -1], 0.45, 10, 0.4],
    ['brachioradialis', 'arm', 'upperarm', [440, 1420, 8], 'forearm_twist_02', [735, 1404, 20], 17, 0.8, [0, 1, 0.5], 0.25, 8, 0.22],
    ['flexors', 'arm', 'upperarm', [500, 1382, -8], 'forearm_twist_02', [720, 1394, 0], 21, 0.75, [0, -1, 0], 0.25, 8, 0.2],
    ['extensors', 'arm', 'upperarm', [505, 1428, -4], 'forearm_twist_02', [725, 1414, -4], 18, 0.75, [0, 1, -0.3], 0.3, 8, 0.2],
    ['pec_clav', 'trunk', 'thorax_hi', [70, 1430, 72], 'upperarm', [232, 1402, 24], 25, 0.45, [0, 0.3, 1], 0.35, 14, 0.2],
    // the pectoral as one broad slab from the sternum to the arm (its lower edge is the fold in front of the armpit)
    ['pec_sternal', 'trunk', 'thorax_mid', [26, 1338, 112], 'upperarm', [205, 1392, 44], 60, 0.3, [0, 0, 1], 0.4, 16, 0.24, 1],
    ['lat', 'trunk', 'lumbar_hi', [45, 1120, -116], 'upperarm', [215, 1392, -8], 36, 0.35, [1, 0, -1], 0.45, 16, 0.28],
    ['teres', 'trunk', 'scapula', [110, 1330, -108], 'upperarm', [212, 1395, -6], 19, 0.6, [0.3, -0.5, -1], 0.4, 12, 0.12],
    ['infraspinatus', 'trunk', 'scapula', [86, 1420, -104], 'scapula', [100, 1305, -108], 30, 0.33, [0.2, 0, -1], 0.5, 14, 0.1],
    ['trap_upper', 'trunk', 'neck_lo', [8, 1562, -60], 'scapula', [176, 1458, -24], 24, 0.5, [0, 1, -0.3], 0.35, 16, 0.3],
    ['trap_mid', 'trunk', 'thorax_hi', [5, 1420, -108], 'scapula', [150, 1446, -55], 22, 0.35, [0, 0, -1], 0.4, 14, 0.2],
    ['trap_low', 'trunk', 'thorax_mid', [5, 1270, -112], 'scapula', [95, 1410, -100], 22, 0.35, [0, 0, -1], 0.45, 14, 0.2],
    // rectus abdominis in four bellies between its tendinous bands (the bands and the linea alba are the gaps between them)
    ['rectus_abd1', 'trunk', 'pelvis', [36, 948, 96], 'pelvis', [38, 1042, 101], 31, 0.4, [0, 0, 1], 0.55, 10, 0.14, 1],
    ['rectus_abd2', 'trunk', 'lumbar_lo', [38, 1050, 102], 'lumbar_hi', [40, 1124, 106], 31, 0.4, [0, 0, 1], 0.5, 10, 0.17, 1],
    ['rectus_abd3', 'trunk', 'lumbar_hi', [40, 1132, 107], 'thorax_lo', [42, 1198, 110], 31, 0.4, [0, 0, 1], 0.5, 10, 0.17, 1],
    ['rectus_abd4', 'trunk', 'thorax_lo', [42, 1206, 111], 'thorax_mid', [52, 1264, 113], 30, 0.4, [0, 0, 1], 0.5, 10, 0.14, 1],
    ['serratus1', 'trunk', 'thorax_mid', [108, 1292, 86], 'thorax_mid', [134, 1262, 42], 16, 0.5, [1, 0, 1], 0.45, 8, 0.16, 1],
    ['serratus2', 'trunk', 'thorax_mid', [112, 1258, 88], 'thorax_lo', [138, 1228, 44], 16, 0.5, [1, 0, 1], 0.45, 8, 0.16, 1],
    ['serratus3', 'trunk', 'thorax_lo', [116, 1224, 86], 'thorax_lo', [140, 1194, 46], 15, 0.5, [1, 0, 1], 0.45, 8, 0.14, 1],
    ['oblique', 'trunk', 'thorax_mid', [125, 1240, 45], 'pelvis', [112, 1030, 52], 34, 0.4, [1, 0, 0.3], 0.62, 18, 0.15],
    ['erector', 'trunk', 'pelvis', [32, 980, -116], 'thorax_mid', [32, 1330, -100], 26, 0.6, [0, 0, -1], 0.4, 14, 0.2],
    ['glute_max', 'trunk', 'pelvis', [40, 1010, -132], 'thigh', [118, 815, -72], 50, 0.6, [0.3, 0, -1], 0.35, 18, 0.0],
    ['glute_med', 'trunk', 'pelvis', [125, 1030, -50], 'thigh', [150, 885, -15], 34, 0.6, [1, 0, 0], 0.4, 16, 0.15],
    ['scm', 'neck', 'thorax_hi', [24, 1442, 58], 'head', [62, 1625, -22], 11, 0.8, [1, 0, 1], 0.45, 8, 0.45],
    ['rectus_fem', 'leg', 'pelvis', [95, 880, 62], 'shin', [92, 440, 55], 30, 0.75, [0, 0, 1], 0.5, 12, 0.18],
    ['vastus_lat', 'leg', 'thigh', [150, 860, 10], 'shin', [118, 470, 40], 36, 0.65, [1, 0, 0.3], 0.5, 12, 0.2],
    ['vastus_med', 'leg', 'thigh', [75, 720, 30], 'shin', [70, 470, 40], 32, 0.8, [-0.7, 0, 0.7], 0.7, 12, 0.3],
    ['adductors', 'leg', 'pelvis', [25, 840, 10], 'thigh', [75, 600, -5], 42, 0.7, [-1, 0, 0], 0.35, 14, 0.08],
    ['ham_bf', 'leg', 'pelvis', [100, 860, -80], 'shin', [130, 430, -35], 30, 0.8, [0, 0, -1], 0.45, 12, 0.12],
    ['ham_sm', 'leg', 'pelvis', [70, 860, -80], 'shin', [60, 430, -35], 30, 0.8, [0, 0, -1], 0.45, 12, 0.12],
    ['gastro_med', 'leg', 'thigh', [68, 500, -42], 'shin', [88, 175, -58], 33, 0.75, [-0.5, 0, -1], 0.32, 10, 0.35],
    ['gastro_lat', 'leg', 'thigh', [118, 500, -42], 'shin', [98, 195, -55], 27, 0.75, [0.5, 0, -1], 0.3, 10, 0.35],
    ['tib_ant', 'leg', 'shin', [112, 440, 40], 'shin', [92, 110, 40], 15, 0.8, [0.5, 0, 1], 0.3, 8, 0.2],
    ['patella', 'leg', 'thigh', [91, 505, 56], 'shin', [91, 448, 58], 22, 0.6, [0, 0, 1], 0.5, 12, 0.15],
  ];

  // ---- build a body for a skeleton (sk.M holds the measurements)
  function build(sk, F) {
    const M = sk.M, k = M.S / 1756 / 1000, ref = REF();
    F = F || { buttock: 1, waist: 1, chest: 1, neck: 1, arm: 1, forearm: 1, wrist: 1, thigh: 1, lowthigh: 1, calf: 1, ankle: 1, foot: 1 };
    // muscle size: with mass at the same stature (girth ~ sqrt(mass / length)), less with fat, less for the female blend
    const msc = Math.sqrt((M.kg / 75) / (M.S / 1756)) * (1 - 0.008 * M.bfDelta) * (1 - 0.22 * M.sex);
    const I = sk.idx;
    // a reference point on bone b -> canonical point of this body
    const map = (b, x) => V.add(sk.bones[I[b]].J, V.mul(V.sub(x, ref[b]), k));
    const parts = [], lofts = [];
    const addLoft = (L, side) => {
      const sx = side === 'R' ? -1 : 1, nm = b => (b === 'pelvis' || b.startsWith('thorax') || b.startsWith('lumbar') || b.startsWith('neck') || b === 'head') ? b : b + '_' + side;
      const grp = L.group === 'trunk' || L.group === 'neck' ? L.group : L.group + (side ? '_' + side : '');
      const mir = x => [x[0] * sx, x[1], x[2]];
      const pA = L.A[1] ? map(nm(L.A[0]), mir(L.A[1])) : sk.bones[I[nm(L.A[0])]].J;
      const pB = L.B[1] ? map(nm(L.B[0]), mir(L.B[1])) : sk.bones[I[nm(L.B[0])]].J;
      const len = V.len(V.sub(pB, pA)), ax = V.norm(V.sub(pB, pA));
      // cross-section frame: u, v from the spec, made square to the axis; mirrored, u flips with x for the side-to-side radii
      let u = mir(L.u), v = mir(L.v);
      v = V.norm(V.sub(v, V.mul(ax, V.dot(v, ax)))); u = V.norm(V.cross(v, ax)); if (V.dot(u, mir(L.u)) < 0) u = V.mul(u, -1);
      // a fine table along t (Catmull-Rom through the stations), radii in metres scaled by the girth factors
      const S = L.st, NT = 160, t0 = S[0][0], t1 = S[S.length - 1][0], tab = new Float32Array(NT * 8);
      const fld = (i, j) => { const s = S[Math.max(0, Math.min(S.length - 1, i))]; if (j === 9) return s[9] || 1; if (j < 5) return s[j] * (F[s[8]] || 1); return s[j]; };
      // piecewise linear through the stations, then smoothed along the loft (a Gaussian of ~2.5 % of its length): no ridges at the stations
      for (let q = 0; q < NT; q++) {
        const t = t0 + (t1 - t0) * q / (NT - 1);
        let i = 0; while (i < S.length - 2 && S[i + 1][0] < t) i++;
        const f = Math.min(1, Math.max(0, (t - S[i][0]) / (S[i + 1][0] - S[i][0])));
        for (const j of [1, 2, 3, 4, 5, 6, 7, 9]) { const v2 = fld(i, j) + (fld(i + 1, j) - fld(i, j)) * f; tab[q * 8 + (j === 9 ? 7 : j - 1)] = j < 5 || j === 6 || j === 7 ? v2 * k : v2; }
      }
      const sig = 0.025 * NT, R = Math.ceil(2.5 * sig), wts = []; for (let r = -R; r <= R; r++) wts.push(Math.exp(-r * r / (2 * sig * sig)));
      const tmp = Float32Array.from(tab);
      for (let q = 0; q < NT; q++) for (let j = 0; j < 8; j++) { let sw = 0, sv = 0; for (let r = -R; r <= R; r++) { const qq = q + r; if (qq < 0 || qq >= NT) continue; sw += wts[r + R]; sv += wts[r + R] * tmp[qq * 8 + j]; } tab[q * 8 + j] = sv / sw; }
      for (let q = 0; q < NT; q++) tab[q * 8 + 4] = Math.max(1.6, tab[q * 8 + 4]);
      const lo = { name: L.name + (side ? '_' + side : ''), group: grp, blend: L.blend, A: pA, ax, u, v, len, t0, t1, tab, NT, inv: (NT - 1) / (t1 - t0), knee: L.name === 'leg' ? (side === 'R' ? 1 : 0) : -1, kscale: M.S / 1756 };
      lofts.push(lo);
      let rmax = 0; for (let q = 0; q < NT; q++) rmax = Math.max(rmax, tab[q * 8] * tab[q * 8 + 7], tab[q * 8 + 1] * tab[q * 8 + 7], tab[q * 8 + 2], tab[q * 8 + 3]);
      for (const [b, c0, c1] of L.slabs) {
        const ca = Math.max(c0, t0), cb = Math.min(c1, t1), mid = V.add(pA, V.mul(ax, len * (ca + cb) / 2));
        parts.push({ kind: 'loft', loft: lo, bone: I[nm(b)], c0, c1, group: lo.group, cen: mid, rad: Math.hypot(len * (cb - ca) / 2 + 0.04, rmax + 0.04) });
      }
    };
    addLoft(trunkLoft, ''); addLoft(neckLoft, '');
    for (const s of ['L', 'R']) for (const L of LOFTS_SIDE) addLoft(L, s);
    // the shoulder's masses, which a tube for the arm and a barrel for the chest leave out: the deltoid capping the joint, and the two folds
    // of the armpit (the pectoral in front, the latissimus / teres behind) that carry the chest's surface out onto the arm
    for (const s of ['L', 'R']) { const sx = s === 'L' ? 1 : -1, E = (bone, c, r, group, blend) => { const cc = map(bone, [c[0] * sx, c[1], c[2]]);
        parts.push({ kind: 'ell', bone: I[bone], c: cc, r: V.mul(r, k), group, blend, cen: cc, rad: Math.max(...r) * k + 0.04 }); };
      E('upperarm_twist_01_' + s, [198, 1408, -2], [60, 50, 57], 'arm_' + s, 0.03);
      E('thorax_hi', [122, 1368, 50], [50, 50, 36], 'trunk', 0.04);
      E('scapula_' + s, [126, 1352, -66], [48, 64, 34], 'trunk', 0.04);
    }
    for (const [b, c, r] of HEAD) parts.push({ kind: 'ell', bone: I[b], c: map(b, c), r: V.mul(r, k), group: 'neck', cen: map(b, c), rad: Math.max(...r) * k + 0.03 });
    // the buttocks' two cheeks (the trunk's loft cannot make the cleft between them)
    for (const sx of [1, -1]) { const c = map('pelvis', [sx * 64, 878, -88]); parts.push({ kind: 'ell', bone: I.pelvis, c, r: V.mul([70 * (F.buttock || 1), 80, 60 * (F.buttock || 1)], k), group: 'trunk', blend: 0.035, cen: c, rad: 0.11 }); }
    // female blend: breast volume (a mannequin's smooth form), sized with the sex blend and body fat
    if (M.sex > 0.05) for (const sx of [1, -1]) {
      const r = (38 + 30 * Math.max(0, (M.p.bodyFat - 15) / 20)) * M.sex * Math.sqrt(M.kg / 60);
      const c = map('thorax_mid', [sx * 92, 1262, 112]);
      parts.push({ kind: 'ell', bone: I.thorax_mid, c, r: V.mul([r * 1.05, r * 0.95, r * 0.8], k), group: 'trunk', blend: 0.03, cen: c, rad: r * k + 0.04 });
    }
    const muscles = [];
    // muscle definition: how far the bellies stand out of the skin. M.p.def is the user's setting (1 = a fit, active man); fat smooths it away
    // (compared side by side with SMPL's scanned average man: at 18 % fat a man shows his muscles' outline, not carved abs, a spine groove or
    // ridges round the limbs; definition comes in as fat drops below ~20 %, strongly only below ~10 %)
    const lean = Math.pow(Math.max(0.08, Math.min(1, (24 - M.p.bodyFat) / 16)), 1.5), DEF = 1.5 * (M.p.def != null ? M.p.def : 1) * lean;
    for (const s of ['L', 'R']) for (const [name, group, ob, oa, ib, ia, r0, flat, out, tp, kb, show, pad] of MUSCLES) {
      const sx = s === 'R' ? -1 : 1, nm = b => (b === 'pelvis' || b.startsWith('thorax') || b.startsWith('lumbar') || b.startsWith('neck') || b === 'head') ? b : b + '_' + s;
      const mir = x => [x[0] * sx, x[1], x[2]];
      const A = map(nm(ob), mir(oa)), B = map(nm(ib), mir(ia));
      const m = { kind: 'muscle', name: name + '_' + s, group: group === 'neck' ? 'neck' : group === 'trunk' ? 'trunk' : group + '_' + s, ob: I[nm(ob)], ib: I[nm(ib)], A, B,
        L0: V.len(V.sub(B, A)), r0: r0 * k * msc, flat, out: V.norm(mir(out)), tp, blend: kb / 1000 * 1.8, show, pad: !!pad };
      muscles.push(m); parts.push(m);
    }
    const groups = ['trunk', 'neck', 'arm_L', 'arm_R', 'leg_L', 'leg_R'];
    parts.forEach(p => p.gi = groups.indexOf(p.group));
    const body = { sk, M, F, parts, lofts, muscles, groups, msc, k };
    // each muscle's line is laid on the base surface (the coordinates above are surface landmarks): its two ends are moved onto it
    const c0 = prepare(body, Human.Skeleton.fk(sk, sk.bones.map(() => Q.id())), true);
    const snap = P => { for (let it = 0; it < 3; it++) { const d = dist(c0, P[0], P[1], P[2]), g = V.norm(grad(c0, P[0], P[1], P[2])); P = V.sub(P, V.mul(g, d)); } return P; };
    for (const m of muscles) {
      m.A = snap(m.A); m.B = snap(m.B); m.L0 = V.len(V.sub(m.B, m.A));
      m.h0 = m.r0 * m.flat * (m.show != null ? m.show : 0.3) * DEF;
    }
    return body;
  }

  // ---- per pose: the transforms every piece needs (from Human.Skeleton.pose)
  function prepare(body, xf, noMuscle) {
    const sk = body.sk, n = sk.n, inv = new Float64Array(n * 15);
    for (let b = 0; b < n; b++) {
      const q = Q.conj(xf.R[b]), ex = Q.rot(q, [1, 0, 0]), ey = Q.rot(q, [0, 1, 0]), ez = Q.rot(q, [0, 0, 1]), o = b * 15;
      // canonical = J + R^T (p - P): rows of R^T
      inv[o] = ex[0]; inv[o + 1] = ey[0]; inv[o + 2] = ez[0]; inv[o + 3] = ex[1]; inv[o + 4] = ey[1]; inv[o + 5] = ez[1]; inv[o + 6] = ex[2]; inv[o + 7] = ey[2]; inv[o + 8] = ez[2];
      inv[o + 9] = xf.P[b][0]; inv[o + 10] = xf.P[b][1]; inv[o + 11] = xf.P[b][2]; inv[o + 12] = sk.bones[b].J[0]; inv[o + 13] = sk.bones[b].J[1]; inv[o + 14] = sk.bones[b].J[2];
    }
    const pc = body.parts.map(p => {
      if (p.kind === 'muscle') {
        const A = Human.Skeleton.apply(xf, sk, p.ob, p.A), B = Human.Skeleton.apply(xf, sk, p.ib, p.B), ab = V.sub(B, A), L = V.len(ab), an = V.mul(ab, 1 / L);
        let out = Q.rot(xf.R[p.ob], p.out); out = V.norm(V.sub(out, V.mul(an, V.dot(out, an)))); const e2 = V.cross(an, out);
        const sq = Math.sqrt(p.L0 / L), r = p.r0 * sq, h = p.h0 * sq;             // shorter -> thicker and wider, the same volume
        return { A, an, L, e1: out, e2, r, h, cen: V.lerp(A, B, 0.5), rad: L / 2 + r + 0.02 };
      }
      return { cen: Human.Skeleton.apply(xf, sk, p.bone, p.cen), rad: p.rad };
    });
    const np = body.parts.length, cb = new Float64Array(np * 4);
    pc.forEach((q, i) => { cb[i * 4] = q.cen[0]; cb[i * 4 + 1] = q.cen[1]; cb[i * 4 + 2] = q.cen[2]; cb[i * 4 + 3] = q.rad; });
    if (!body.li) {
      const li = new Int16Array(np).fill(-1), lg = [], lk = []; const ids = new Map();
      body.parts.forEach((p, i) => { if (p.kind === 'muscle') return; const key = p.kind === 'loft' ? p.loft : p; if (!ids.has(key)) { ids.set(key, lg.length); lg.push(p.gi); lk.push(p.kind === 'ell' ? (p.blend || 0.03) : (p.loft.blend || 0.015)); } li[i] = ids.get(key); });
      body.li = li; body.lg = Int8Array.from(lg); body.lk = Float64Array.from(lk);
    }
    return { body, xf, inv, pc, cb, knee: xf.anat ? [xf.anat.leg_L.knee, xf.anat.leg_R.knee] : null, li: body.li, lg: body.lg, lk: body.lk, ld: new Float64Array(body.lg.length), lb: new Int32Array(body.lg.length), cd: new Float64Array(np), gd: new Float64Array(6), gb: new Int32Array(6),
      kind: Int8Array.from(body.parts, p => p.kind === 'loft' ? 0 : p.kind === 'ell' ? 1 : noMuscle ? 3 : 2), gi: Int8Array.from(body.parts, p => p.gi) };
  }

  const OV = 0.03;
  // distance to one piece
  function partDist(p, c, pc, x, y, z) {
    if (p.kind === 'muscle') {
      // relief: how far the belly lifts the skin at this point (>= 0)
      const dx = x - pc.A[0], dy = y - pc.A[1], dz = z - pc.A[2];
      const t = (dx * pc.an[0] + dy * pc.an[1] + dz * pc.an[2]) / pc.L; if (t <= 0 || t >= 1) return 0;
      const qx = dx - pc.an[0] * t * pc.L, qy = dy - pc.an[1] * t * pc.L, qz = dz - pc.an[2] * t * pc.L;
      const a = qx * pc.e1[0] + qy * pc.e1[1] + qz * pc.e1[2], b = qx * pc.e2[0] + qy * pc.e2[1] + qz * pc.e2[2];
      const tt = t < p.tp ? 0.5 * t / p.tp : 0.5 + 0.5 * (t - p.tp) / (1 - p.tp);
      // a belly tapers to its tendons; a pad (the abdominal segments, the serratus digits) is flat-topped with soft edges
      const sn = Math.sin(Math.PI * tt), e4 = (2 * tt - 1) ** 4, prof = p.pad ? 1 - e4 : Math.sqrt(sn) * (1.5 - 0.5 * sn), w = pc.r * (p.pad ? 1 : prof);
      if (w < 1e-4) return 0;
      const rho = b / w, r2 = rho * rho; if (r2 >= 1) return 0;
      const s1 = Human.smooth(-1.2 * w, 0, a) * (1 - Human.smooth(1.5 * w, 3.5 * w, a)); if (s1 <= 0) return 0;
      const side = s1;
      const f = p.pad ? (1 - r2) * (1 + 0.6 * r2) : (1 - r2) * (1 - r2);
      return pc.h * prof * f * side;
    }
    const o = p.bone * 15, inv = c.inv, px = x - inv[o + 9], py = y - inv[o + 10], pz = z - inv[o + 11];
    const cx = inv[o + 12] + inv[o] * px + inv[o + 1] * py + inv[o + 2] * pz, cy = inv[o + 13] + inv[o + 3] * px + inv[o + 4] * py + inv[o + 5] * pz, cz = inv[o + 14] + inv[o + 6] * px + inv[o + 7] * py + inv[o + 8] * pz;
    if (p.kind === 'ell') {
      const ex = (cx - p.c[0]) / p.r[0], ey = (cy - p.c[1]) / p.r[1], ez = (cz - p.c[2]) / p.r[2], k0 = Math.hypot(ex, ey, ez), k1 = Math.hypot(ex / p.r[0], ey / p.r[1], ez / p.r[2]);
      return k1 < 1e-9 ? -Math.min(...p.r) : k0 * (k0 - 1) / k1;
    }
    // loft slab
    const L = p.loft, rx = cx - L.A[0], ry = cy - L.A[1], rz = cz - L.A[2], ax = L.ax, U = L.u, W = L.v;
    const t = (rx * ax[0] + ry * ax[1] + rz * ax[2]) / L.len;
    const tt = t < L.t0 ? L.t0 : t > L.t1 ? L.t1 : t;
    const s = (tt - L.t0) * L.inv, i = s >= L.NT - 1 ? L.NT - 2 : s | 0, f = s - i, T = L.tab, a = i * 8, b = a + 8, f1 = 1 - f;
    const du = rx * U[0] + ry * U[1] + rz * U[2] - (T[a + 5] * f1 + T[b + 5] * f), dv = rx * W[0] + ry * W[1] + rz * W[2] - (T[a + 6] * f1 + T[b + 6] * f);
    let ru = du > 0 ? T[a] * f1 + T[b] * f : T[a + 1] * f1 + T[b + 1] * f, rv = dv > 0 ? T[a + 2] * f1 + T[b + 2] * f : T[a + 3] * f1 + T[b + 3] * f; const n = T[a + 4] * f1 + T[b + 4] * f;
    // a bent knee squeezes the leg (measured on SMPL from 0 to 120 deg, data/smpl_lofts.json 'knee'): above the knee the front swells about
    // 20 mm (the quadriceps bunch) and the back flattens about 30 mm against the calf; below it the shin widens about 10 mm
    if (L.knee >= 0 && c.knee) { const fk = Math.min(1.2, Math.max(0, c.knee[L.knee] / 120)) * L.kscale;
      if (fk > 0) { const wt = Human.smooth(0.30, 0.42, tt) * (1 - Human.smooth(0.50, 0.54, tt)), ws = Human.smooth(0.50, 0.53, tt) * (1 - Human.smooth(0.58, 0.66, tt));
        if (wt > 0) rv = dv > 0 ? rv + 0.020 * fk * wt : Math.max(0.3 * rv, rv - 0.030 * fk * wt); if (ws > 0) ru += 0.010 * fk * ws; } }
    if (dv < 0) { const wb = T[a + 7] * f1 + T[b + 7] * f; if (wb !== 1) { const e = -dv / rv / 0.6, sm = e >= 1 ? 1 : e * e * (3 - 2 * e); ru *= 1 + (wb - 1) * sm; } }
    const qu = (du < 0 ? -du : du) / ru, qv = (dv < 0 ? -dv : dv) / rv, rp = Math.sqrt(du * du + dv * dv);
    const fq = qu + qv < 1e-9 ? 0 : Math.exp(Math.log(Math.exp(n * Math.log(qu + 1e-12)) + Math.exp(n * Math.log(qv + 1e-12))) / n);
    const rm = ru < rv ? ru : rv;
    let d = fq > 1e-6 ? rp * (1 - 1 / fq) : -rm;
    if (d < -rm) d = -rm;
    const ov = (t < L.t0 ? L.t0 - t : t - L.t1) * L.len; if (ov > d) d = ov;
    // (the slabs overlap by OV on either side of their cut: where they meet, the inside stays the loft's own inside)
    if (p.c0 > L.t0) { const e = (p.c0 - t) * L.len - OV; if (e > d) d = e; }
    if (p.c1 < L.t1) { const e = (t - p.c1) * L.len - OV; if (e > d) d = e; }
    return d;
  }

  // the body's distance at a point. opt.groups: a mask of group indices to include (for measuring). Returns the distance; with out, also fills
  // out.g (the nearest group) and out.part (the nearest base piece)
  const GK = [0, 0.02, 0.055, 0.055, 0.045, 0.045];          // how softly each group is joined to the trunk (m)
  function dist(c, x, y, z, mask, out) {
    const parts = c.body.parts, pc = c.pc, np = parts.length, gd = c.gd, gb = c.gb, cd = c.cd, CB = c.cb, kind = c.kind, gi = c.gi, li = c.li, ld = c.ld, lb = c.lb, nl = ld.length;
    for (let g = 0; g < 6; g++) { gd[g] = 1e9; gb[g] = -1; }
    for (let l = 0; l < nl; l++) ld[l] = 1e9;
    // cheap bounds first; the nearest piece is evaluated first so that everything far beyond it can be skipped
    let i0 = -1, m0 = 1e9;
    for (let i = 0; i < np; i++) {
      const o = i * 4, ex = x - CB[o], ey = y - CB[o + 1], ez = z - CB[o + 2], d = Math.sqrt(ex * ex + ey * ey + ez * ez) - CB[o + 3]; cd[i] = d;
      if (kind[i] < 2 && d < m0 && (!mask || mask >> gi[i] & 1)) { m0 = d; i0 = i; }
    }
    if (i0 < 0) return 1e9;
    if (m0 > 0.05 && !out) return m0;                                  // far from everything: a lower bound is enough
    // base pieces: the slabs of one loft by plain minimum (they are one surface cut in pieces), then the lofts and forms of a group blended
    let U = 1e9;
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < np; i++) {
      if (pass === 0 ? i !== i0 : i === i0) continue;
      const k = kind[i]; if (k >= 2) continue; const g = gi[i]; if (mask && !(mask >> g & 1)) continue;
      if (pass && cd[i] > U + 0.06) continue;
      const d = partDist(parts[i], c, pc[i], x, y, z), l = li[i];
      if (d < ld[l]) { ld[l] = d; lb[l] = i; }
      if (d < U) U = d;
      if (!pass) break;
    }
    const LG = c.lg, LK = c.lk;
    for (let l = 0; l < nl; l++) { const d = ld[l]; if (d > 1e8) continue; const g = LG[l];
      if (gd[g] > 1e8) { gd[g] = d; gb[g] = lb[l]; } else { if (d < gd[g]) gb[g] = lb[l]; gd[g] = smin(gd[g], d, LK[l]); } }
    for (let g = 0; g < 6; g++) if (gd[g] < U) U = gd[g];
    for (let i = 0; i < np; i++) {
      if (kind[i] !== 2) continue; const g = gi[i]; if (gd[g] > 0.04 || gd[g] < -0.04) continue; if (cd[i] > 0.04) continue;
      gd[g] -= partDist(parts[i], c, pc[i], x, y, z);
    }
    let best = gd[0], bg = 0;
    for (let g = 1; g < 6; g++) { if (gd[g] > 1e8) continue; const d = gd[0] < 1e8 ? smin(gd[0], gd[g], GK[g]) : gd[g]; if (d < best) { best = d; bg = g; } }
    if (out) { out.g = bg; out.part = gb[bg]; out.gd = Array.from(gd); }
    return best;
  }
  function grad(c, x, y, z, mask, h = 0.0015) {
    // tetrahedral differences: 4 samples
    const a = dist(c, x + h, y - h, z - h, mask), b = dist(c, x - h, y - h, z + h, mask), d = dist(c, x - h, y + h, z - h, mask), e = dist(c, x + h, y + h, z + h, mask);
    return [a - b - d + e, -a - b + d + e, -a + b - d + e].map(v => v / (4 * h));
  }
  Human.Body = { build, prepare, dist, grad, partDist, MUSCLES, TRUNK };
})();

// ---------------------------------------------------------------- Human: ski clothes, as a distance field over the body's
// Clothes are the body's own field pushed outward by how far each garment stands off the skin, plus a few hard forms the body does not have
// (boots, helmet, goggles). All of it is given in the bind pose (the A-pose the mesh is made in) from the skeleton's own joints, meshed once and
// skinned with the body's weights, so it moves with any clip; nothing is sprung.
//   jacket  2.6-3.2 cm off the trunk and arms, down past the seat (the hem 13 cm below the hip joints), a high collar round the neck, folds in the
//           crook of the elbow; the look of the game's skier (orange shell, navy forearms, a pale band round the upper sleeve)
//   pants   2.2 cm off the legs, fuller at the knee, belled over the boot cuff
//   gloves  1 cm off the hand, a gauntlet over the sleeve's cuff
//   boots   a shell round the foot and shin up to 34 cm, flat soled
//   helmet  a shell over the skull down to the brow in front and the nape behind; goggles across the eyes
// The material of each vertex comes from the same rules (Clothes.mat), so the colours follow the cut exactly.
(() => {
  const B = Human.Body, S = Human.Skeleton, smooth = Human.smooth;
  const MAT = ['skin', 'jacket', 'sleeve', 'band', 'pants', 'glove', 'boot', 'helmet', 'goggle', 'lens'];
  const COL = { skin: [0.56, 0.34, 0.25], jacket: [0.95, 0.255, 0.026], sleeve: [0.018, 0.030, 0.055], band: [0.86, 0.87, 0.85], pants: [0.045, 0.05, 0.06],
    glove: [0.018, 0.018, 0.02], boot: [0.62, 0.64, 0.68], helmet: [0.78, 0.79, 0.80], goggle: [0.02, 0.02, 0.025], lens: [0.95, 0.45, 0.08] };
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = a => Math.hypot(a[0], a[1], a[2]);
  const rbox = (p, c, h, r) => { const q = [Math.abs(p[0] - c[0]) - h[0] + r, Math.abs(p[1] - c[1]) - h[1] + r, Math.abs(p[2] - c[2]) - h[2] + r];
    return len([Math.max(q[0], 0), Math.max(q[1], 0), Math.max(q[2], 0)]) + Math.min(Math.max(q[0], q[1], q[2]), 0) - r; };
  const ell = (p, c, r) => { const ex = (p[0] - c[0]) / r[0], ey = (p[1] - c[1]) / r[1], ez = (p[2] - c[2]) / r[2], k0 = Math.hypot(ex, ey, ez), k1 = Math.hypot(ex / r[0], ey / r[1], ez / r[2]); return k1 < 1e-9 ? -Math.min(...r) : k0 * (k0 - 1) / k1; };
  const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }, smax = (a, b, k) => -smin(-a, -b, k);

  // the joints of the bind pose this is cut to
  function prepare(body, sk, xf, cB) {
    const I = sk.idx, J = n => S.apply(xf, sk, I[n], sk.bones[I[n]].J);
    const c = { cB, out: {}, J: {}, pc: cB.pc, body: cB.body };
    for (const n of ['pelvis', 'thigh_L', 'thigh_R', 'shin_L', 'shin_R', 'talus_L', 'talus_R', 'upperarm_L', 'upperarm_R', 'forearm_L', 'forearm_R', 'hand_L', 'hand_R', 'neck_hi', 'head', 'eye_L', 'eye_R'])
      c.J[n] = J(n);
    c.hip = (c.J.thigh_L[1] + c.J.thigh_R[1]) / 2; c.hem = c.hip - 0.12;
    // the jacket's skirt: below the waist it hangs straight down over the seat and between the legs instead of following them (a rounded
    // cylinder as wide and deep as the hips and the seat, measured on the body's own field)
    const far = (dir, y) => { let lo = 0, hi = 0.4; for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2, q = [c.J.pelvis[0] + dir[0] * m, y, c.J.pelvis[2] + dir[1] * m]; if (B.dist(cB, q[0], q[1], q[2], 0) < 0) lo = m; else hi = m; } return lo; };
    const ys = [c.hip - 0.02, c.hip - 0.06, c.hip - 0.10];
    c.sk = { x: Math.max(...ys.map(y => far([1, 0], y))), zf: Math.max(...ys.map(y => far([0, 1], y))), zb: Math.max(...ys.map(y => far([0, -1], y))), cx: c.J.pelvis[0], cz: c.J.pelvis[2] };
    const e = c.J.eye_L, hd = c.J.head; c.eyeY = e[1]; c.eyeZ = e[2];
    c.hc = [0, e[1] + 0.018, (hd[2] + e[2]) / 2 - 0.012];          // the middle of the cranium
    return c;
  }
  // a point along an arm: t 0 at the shoulder .. 1 at the wrist; s: metres past the wrist (negative: before it)
  function armAt(c, p, sd) { const a = c.J['upperarm_' + sd], w = c.J['hand_' + sd], ax = sub(w, a), L = len(ax), t = dot(sub(p, a), ax) / (L * L); return { t, s: (t - 1) * L, el: dot(sub(p, c.J['forearm_' + sd]), ax) / L }; }
  // how far the cloth stands off the skin here, and which cloth it is
  function region(c, p, g) {
    const y = p[1];
    if (g === 1) { const k = smooth(c.J.neck_hi[1] - 0.005, c.J.neck_hi[1] + 0.012, y); return { off: 0.028 * (1 - k), mat: k > 0.5 ? 'skin' : 'jacket' }; }      // collar, then the face
    if (g === 2 || g === 3) {
      const A = armAt(c, p, g === 2 ? 'L' : 'R');
      // folds in the crook of the elbow and round the forearm
      const fold = 0.0022 * Math.sin(A.el / 0.024 * 2 * Math.PI + 3 * p[1]) * smooth(-0.06, -0.025, A.el) * (1 - smooth(0.0, 0.035, A.el));
      const sleeve = 0.030 + (0.025 - 0.030) * smooth(0, 0.35, A.t) + fold, gaunt = 0.032, hand = 0.010;
      const gw = smooth(-0.052, -0.044, A.s), hw = smooth(0.022, 0.032, A.s);
      const off = sleeve + (gaunt - sleeve) * gw + (hand - gaunt) * hw;
      const sh = A.t * len(sub(c.J['hand_' + (g === 2 ? 'L' : 'R')], c.J['upperarm_' + (g === 2 ? 'L' : 'R')]));
      const mat = gw > 0.5 ? 'glove' : A.el > 0.045 ? 'sleeve' : Math.abs(sh - 0.16) < 0.0125 ? 'band' : 'jacket';
      return { off, mat };
    }
    // trunk and legs: the jacket down to its hem, the pants below
    const jw = smooth(c.hem - 0.006, c.hem + 0.006, y), back = p[2] < c.J.pelvis[2] - 0.06 ? 0.004 * smooth(c.hem, c.hem + 0.25, y) : 0;
    let pants = 0.022;
    if (g === 4 || g === 5) { const k = c.J['shin_' + (g === 4 ? 'L' : 'R')]; pants += 0.005 * Math.exp(-(((y - k[1]) / 0.07) ** 2)) + (p[2] < k[2] ? 0.0012 * Math.sin((y - k[1]) / 0.026 * 2 * Math.PI) * Math.exp(-(((y - k[1] + 0.01) / 0.04) ** 2)) : 0);
      pants += 0.008 * smooth(0.385, 0.33, y) * smooth(0.27, 0.30, y) - 0.04 * smooth(0.28, 0.24, y); }       // (belled over the boot's cuff; inside the boot it is the boot)
    return { off: pants + (0.031 + back - pants) * jw, mat: jw > 0.5 ? 'jacket' : 'pants' };
  }
  function skirt(c, p) {
    const k = c.sk, dx = (p[0] - k.cx) / (k.x + 0.03), dz = (p[2] - k.cz) / ((p[2] > k.cz ? k.zf : k.zb) + 0.03), n = 3, r = Math.pow(Math.pow(Math.abs(dx), n) + Math.pow(Math.abs(dz), n), 1 / n);
    return Math.max((r - 1) * (k.x + 0.03), c.hem - p[1], p[1] - c.hip - 0.02);
  }
  function boot(c, p, sd) {
    // a ski boot: the shaft leans forward (about 12 deg) round the shin, the shell narrows to the toe, a sole with a heel and a toe lug
    const t = c.J['talus_' + sd], ax = t[0], az = t[2] + 0.006 + 0.05 * Math.max(0, p[1] - 0.08);
    const dx = (p[0] - ax) / 0.062, dz = (p[2] - az) / (p[2] > az ? 0.08 : 0.068), rr = Math.hypot(dx, dz), rad = (rr - 1) * 0.065;
    const top = 0.28 + 0.02 * Math.max(0, Math.min(1, (p[2] - az) / 0.08));        // (the cuff higher in front, where the tongue is)
    const shaft = smax(Math.max(rad, 0.03 - p[1]), p[1] - top, 0.008);
    const z0 = t[2] + 0.05, hw = 0.056 - 0.016 * smooth(z0 + 0.06, z0 + 0.17, p[2]), q = [ax + (p[0] - ax) * 0.056 / hw, p[1], p[2]];
    const shell = rbox(q, [ax, 0.06, z0], [0.056, 0.06 - 0.012 * smooth(z0 + 0.08, z0 + 0.17, p[2]), 0.16], 0.028);
    const sole = rbox(p, [ax, 0.012, z0], [0.05, 0.012, 0.168], 0.008);
    return Math.max(smin(smin(shaft, shell, 0.04), sole, 0.01), -0.002 - p[1]);
  }
  function helmet(c, p) {
    const h = ell(p, c.hc, [0.103, 0.115, 0.123]), cut = c.eyeY + 0.03 + (c.J.head[1] - 0.012 - c.eyeY - 0.03) * smooth(0.06, -0.02, p[2] - c.hc[2]);      // (down to the brow in front, the nape behind)
    return smax(h, cut - p[1], 0.008);
  }
  function goggles(c, p) {
    const gy = c.eyeY + 0.003, e = ell(p, c.hc, [0.096, 0.108, 0.118]);
    return smax(smax(e, Math.abs(p[1] - gy) - 0.027, 0.006), c.hc[2] + 0.025 - p[2], 0.01);
  }
  // the whole field; mat (optional object) gets the material of the nearest surface
  function dist(c, x, y, z, mask, out) {
    const p = [x, y, z], o = c.out, d0 = B.dist(c.cB, x, y, z, mask, o);
    if (d0 > 0.15 && !out) return d0 - 0.035;
    const r = region(c, p, o.g), db = d0 - r.off;
    let d = db, m = r.mat;
    if (o.g === 0 || o.g === 4 || o.g === 5) { const sk = skirt(c, p), j = smin(r.mat === 'jacket' ? db : 1e9, sk, 0.04); if (j < d) { d = j; m = 'jacket'; } }
    for (const sd of ['L', 'R']) { const b = boot(c, p, sd); if (b < d) m = 'boot'; d = smin(d, b, 0.006); }
    const hl = helmet(c, p); if (hl < d) m = 'helmet'; d = smin(d, hl, 0.006);
    const gg = goggles(c, p); if (gg < d) { m = (p[2] > c.hc[2] + 0.07 && Math.abs(p[1] - c.eyeY - 0.003) < 0.021) ? 'lens' : 'goggle'; } d = smin(d, gg, 0.004);
    if (out) { out.mat = m; out.g = o.g; out.part = o.part; }
    return d;
  }
  function grad(c, x, y, z, mask, h = 0.0015) {
    const a = dist(c, x + h, y - h, z - h, mask), b = dist(c, x - h, y - h, z + h, mask), d = dist(c, x - h, y + h, z - h, mask), e = dist(c, x + h, y + h, z + h, mask);
    return [a - b - d + e, -a - b + d + e, -a + b - d + e].map(v => v / (4 * h));
  }
  // the colour of every vertex of a clothed mesh, and which vertices are boots (they bend at the ankle, not at the toes)
  function colours(c, mesh) {
    const nv = mesh.nv, col = new Float32Array(nv * 3), mat = new Uint8Array(nv), o = {};
    for (let v = 0; v < nv; v++) { dist(c, mesh.pos[v * 3], mesh.pos[v * 3 + 1], mesh.pos[v * 3 + 2], 0, o); const k = MAT.indexOf(o.mat); mat[v] = k; col.set(COL[o.mat], v * 3); }
    const adj = mesh.adj || (mesh.adj = Human.Mesh.adjacency(nv, mesh.idx)), tmp = new Float32Array(col.length);
    for (let it = 0; it < 2; it++) { tmp.set(col);
      for (let v = 0; v < nv; v++) { const a0 = adj.off[v], a1 = adj.off[v + 1]; let mixd = false; for (let k = a0; k < a1; k++) if (mat[adj.nb[k]] !== mat[v]) { mixd = true; break; }
        if (!mixd) continue; for (let ch = 0; ch < 3; ch++) { let sum = tmp[v * 3 + ch]; for (let k = a0; k < a1; k++) sum += tmp[adj.nb[k] * 3 + ch]; col[v * 3 + ch] = sum / (a1 - a0 + 1); } } }
    return { col, mat };
  }
  // boots are rigid below the cuff: the weights of the toe and midfoot bones go to the foot
  function stiffBoots(sk, W, mat) {
    const I = sk.idx, to = { L: I.foot_L, R: I.foot_R }, from = {};
    for (const sd of ['L', 'R']) for (const n of ['midfoot', 'toe_hallux', 'toes_lesser']) from[I[n + '_' + sd]] = to[sd];
    const k = MAT.indexOf('boot');
    for (let v = 0; v < mat.length; v++) if (mat[v] === k) for (let j = 0; j < 4; j++) { const b = W.bi[v * 4 + j]; if (from[b] != null) W.bi[v * 4 + j] = from[b]; }
  }
  Human.Clothes = { prepare, dist, grad, colours, stiffBoots, MAT, COL };
})();

// ---------------------------------------------------------------- Human: the body's surface, meshed once in the bind pose
// Sparse surface nets over the posed distance field: a coarse pass finds the blocks the surface passes through, only those are sampled finely, one
// vertex per cell the surface crosses (the mean of its edge crossings), one quad per crossed edge; then every vertex is moved onto the surface
// along the field's gradient. (The topology is fixed per body shape; research/03 wants one fixed template for every shape later.)
(() => {
  const B = Human.Body;
  function mesh(c, h = 0.008, opt = {}) {
    const t0 = performance.now(), D = opt.dist || B.dist, GR = opt.grad || B.grad, pad = opt.pad || 0;
    // bounds from the pieces' spheres
    let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    c.pc.forEach((q, i) => { const p = c.body.parts[i]; if (p.kind === 'muscle') return; const r = Math.min(q.rad, 0.5); for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], q.cen[a] - r); hi[a] = Math.max(hi[a], q.cen[a] + r); } });
    lo = lo.map(v => v - 2 * h - pad); hi = hi.map(v => v + 2 * h + pad);
    const BS = 4, nx = Math.ceil((hi[0] - lo[0]) / h / BS) * BS, ny = Math.ceil((hi[1] - lo[1]) / h / BS) * BS, nz = Math.ceil((hi[2] - lo[2]) / h / BS) * BS;
    const cx = nx + 1, cy = ny + 1, cz = nz + 1, G = new Float32Array(cx * cy * cz).fill(NaN);
    const id = (i, j, k) => (k * cy + j) * cx + i;
    let mask = opt.mask;
    const f = (i, j, k) => { const o = id(i, j, k); let v = G[o]; if (v !== v) { v = G[o] = D(c, lo[0] + i * h, lo[1] + j * h, lo[2] + k * h, mask); } return v; };
    // coarse blocks
    const bx = nx / BS, by = ny / BS, bz = nz / BS, act = new Uint8Array(bx * by * bz), half = Math.sqrt(3) * BS * h / 2;
    let nact = 0;
    for (let k = 0; k < bz; k++) for (let j = 0; j < by; j++) for (let i = 0; i < bx; i++) {
      const d = D(c, lo[0] + (i + 0.5) * BS * h, lo[1] + (j + 0.5) * BS * h, lo[2] + (k + 0.5) * BS * h, mask);
      if (Math.abs(d) < half * 1.2 + 0.004) { act[(k * by + j) * bx + i] = 1; nact++; }
    }
    // cells
    const vid = new Int32Array(nx * ny * nz).fill(-1), P = [];
    const cid = (i, j, k) => (k * ny + j) * nx + i;
    const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    const cv = new Float32Array(8);
    for (let K = 0; K < bz; K++) for (let J = 0; J < by; J++) for (let Ii = 0; Ii < bx; Ii++) {
      if (!act[(K * by + J) * bx + Ii]) continue;
      for (let k = K * BS; k < K * BS + BS; k++) for (let j = J * BS; j < J * BS + BS; j++) for (let i = Ii * BS; i < Ii * BS + BS; i++) {
        let neg = 0;
        for (let q = 0; q < 8; q++) { cv[q] = f(i + (q & 1), j + (q >> 1 & 1), k + (q >> 2 & 1)); if (cv[q] < 0) neg++; }
        if (neg === 0 || neg === 8) continue;
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (const [a, b] of E) { const va = cv[a], vb = cv[b]; if ((va < 0) === (vb < 0)) continue; const t = va / (va - vb);
          sx += (a & 1) + ((b & 1) - (a & 1)) * t; sy += (a >> 1 & 1) + ((b >> 1 & 1) - (a >> 1 & 1)) * t; sz += (a >> 2 & 1) + ((b >> 2 & 1) - (a >> 2 & 1)) * t; n++; }
        vid[cid(i, j, k)] = P.length / 3;
        P.push(lo[0] + (i + sx / n) * h, lo[1] + (j + sy / n) * h, lo[2] + (k + sz / n) * h);
      }
    }
    // quads: for each grid edge with a sign change, the four cells around it
    const T = [];
    const quad = (a, b, c2, d, flip) => { if (a < 0 || b < 0 || c2 < 0 || d < 0) return; if (!flip) T.push(a, c2, b, a, d, c2); else T.push(a, b, c2, a, c2, d); };
    for (let k = 1; k < nz; k++) for (let j = 1; j < ny; j++) for (let i = 1; i < nx; i++) {
      const o = id(i, j, k), v0 = G[o]; if (v0 !== v0) continue;
      const vx = G[o + 1], vy = G[o + cx], vz = G[o + cx * cy];
      if (vx === vx && i < nx && (v0 < 0) !== (vx < 0)) quad(vid[cid(i, j - 1, k - 1)], vid[cid(i, j, k - 1)], vid[cid(i, j, k)], vid[cid(i, j - 1, k)], v0 < 0);
      if (vy === vy && j < ny && (v0 < 0) !== (vy < 0)) quad(vid[cid(i - 1, j, k - 1)], vid[cid(i - 1, j, k)], vid[cid(i, j, k)], vid[cid(i, j, k - 1)], v0 < 0);
      if (vz === vz && k < nz && (v0 < 0) !== (vz < 0)) quad(vid[cid(i - 1, j - 1, k)], vid[cid(i, j - 1, k)], vid[cid(i, j, k)], vid[cid(i - 1, j, k)], v0 < 0);
    }
    const pos = new Float32Array(P), nv = pos.length / 3;
    // onto the surface
    for (let v = 0; v < nv; v++) {
      for (let it = 0; it < 2; it++) {
        const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2], d = D(c, x, y, z, mask);
        if (Math.abs(d) < 1e-5) break;
        const g = GR(c, x, y, z, mask), gl = g[0] * g[0] + g[1] * g[1] + g[2] * g[2]; if (gl < 1e-6) break;
        const s = Math.max(-h, Math.min(h, d / gl * Math.sqrt(gl))) / Math.sqrt(gl);
        pos[v * 3] -= g[0] * s; pos[v * 3 + 1] -= g[1] * s; pos[v * 3 + 2] -= g[2] * s;
      }
    }
    const idx = new Uint32Array(T);
    return { pos, idx, nv, nt: idx.length / 3, h, ms: performance.now() - t0, cells: nact * BS * BS * BS };
  }
  // per-vertex normals from the triangles (area weighted)
  function normals(pos, idx, out) {
    const N = out || new Float32Array(pos.length); N.fill(0);
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const o of [a, b, c]) { N[o] += nx; N[o + 1] += ny; N[o + 2] += nz; }
    }
    for (let i = 0; i < N.length; i += 3) { const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1; N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; }
    return N;
  }
  // enclosed volume (litres) by the divergence theorem
  function volume(pos, idx) {
    let v = 0;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      v += pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]) - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c]) + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c]);
    }
    return v / 6 * 1000;
  }
  // vertex neighbours (for smoothing)
  function adjacency(nv, idx) {
    const sets = Array.from({ length: nv }, () => new Set());
    for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) { const a = idx[t + e], b = idx[t + (e + 1) % 3]; sets[a].add(b); sets[b].add(a); }
    const off = new Uint32Array(nv + 1); let n = 0; sets.forEach((s, i) => { off[i] = n; n += s.size; }); off[nv] = n;
    const nb = new Uint32Array(n); sets.forEach((s, i) => { let o = off[i]; for (const j of s) nb[o++] = j; });
    return { off, nb };
  }
  Human.Mesh = { mesh, normals, volume, adjacency };
})();

// ---------------------------------------------------------------- Human: measuring the body like a tape measure, and fitting it to ANSUR
// A girth is the perimeter of the convex hull of a slice (a tape bridges hollows; research/03). The body is measured in the canonical T-pose, at the
// ANSUR landmark heights, and its base radii are scaled per level until each girth is the one ANSUR predicts.
(() => {
  const V = Human.v3, Q = Human.q, B = Human.Body;
  // slice through centre C in the plane (e1, e2): the hull perimeter, and the points
  function slice(c, C, e1, e2, mask, n = 96) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = i / n * 2 * Math.PI, dx = Math.cos(a), dy = Math.sin(a);
      const at = r => B.dist(c, C[0] + (e1[0] * dx + e2[0] * dy) * r, C[1] + (e1[1] * dx + e2[1] * dy) * r, C[2] + (e1[2] * dx + e2[2] * dy) * r, mask);
      let r0 = 0, r1 = 0.004, guard = 0;
      // walk out to the last surface crossing (from outside in, so hollows are skipped as a tape would)
      r1 = 0.45; if (at(r1) < 0) continue;
      let r = r1; while (r > 0 && at(r) > 0 && guard++ < 400) r -= Math.max(0.002, at(r) * 0.9);
      if (r <= 0) continue;
      r0 = r; r1 = r + 0.004; for (let k = 0; k < 20; k++) { const m = (r0 + r1) / 2; if (at(m) < 0) r0 = m; else r1 = m; }
      pts.push([dx * r0, dy * r0]);
    }
    if (pts.length < 3) return { girth: 0, pts };
    // convex hull (monotone chain)
    const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], hi = [];
    for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
    const H = lo.slice(0, -1).concat(hi.slice(0, -1));
    let g = 0; for (let i = 0; i < H.length; i++) { const a = H[i], b = H[(i + 1) % H.length]; g += Math.hypot(b[0] - a[0], b[1] - a[1]); }
    return { girth: g, pts, hull: H };
  }
  const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];
  const G = { trunk: 1, neck: 2, armL: 4, legL: 16, legs: 48 };
  // the girths of a body (mm), measured the ANSUR way
  function girths(body) {
    const sk = body.sk, M = body.M, S = M.S / 1000, J = n => sk.bones[sk.idx[n]].J;
    const c = B.prepare(body, Human.Skeleton.fk(sk, sk.bones.map(() => Q.id())));
    const hz = (y, mask, cx = 0, cz = -0.01) => slice(c, [cx, y, cz], X, Z, mask).girth * 1000;
    // a limb's centre at a height (the leg's line from hip to ankle)
    const legX = y => { const h = J('thigh_L'), k = J('shin_L'), a = J('talus_L'); const p = y > k[1] ? V.lerp(k, h, (y - k[1]) / (h[1] - k[1])) : V.lerp(a, k, (y - a[1]) / (k[1] - a[1])); return p; };
    const legAt = y => { const p = legX(y); return slice(c, [p[0], y, p[2]], X, Z, G.legL).girth * 1000; };
    const armAt = x => slice(c, [x, J('upperarm_L')[1], J('upperarm_L')[2]], Y, Z, G.armL).girth * 1000;
    const gh = J('upperarm_L')[0], el = J('forearm_L')[0], wr = J('hand_L')[0];
    const maxOf = (f, a, b, n = 8) => { let m = 0; for (let i = 0; i <= n; i++) m = Math.max(m, f(a + (b - a) * i / n)); return m; };
    const minOf = (f, a, b, n = 8) => { let m = 1e9; for (let i = 0; i <= n; i++) m = Math.min(m, f(a + (b - a) * i / n)); return m; };
    return {
      chest: hz(M.L.nipple / 1000, G.trunk), waist: hz(M.L.navel / 1000, G.trunk), buttock: hz(0.505 * S, G.trunk | G.legs, 0, -0.03),
      thigh: legAt(M.L.crotch / 1000 - 0.012 * S), lowthigh: legAt(0.31 * S), calf: maxOf(legAt, 0.17 * S, 0.25 * S), ankle: minOf(legAt, 0.05 * S, 0.1 * S),
      arm: armAt(gh + 0.5 * (el - gh)), forearm: maxOf(armAt, el + 0.05 * (wr - el), el + 0.35 * (wr - el), 6), wrist: armAt(wr - 0.012),
      neck: hz(0.86 * S, G.neck, 0, -0.03),
    };
  }
  // scale the base radii until the girths are ANSUR's (a few rounds; each girth moves almost in proportion to its level's radii)
  function calibrate(sk, rounds = 4) {
    let F = null, body = B.build(sk), log = [];
    for (let r = 0; r < rounds; r++) {
      const g = girths(body), T = sk.M.G; F = Object.assign({}, body.F);
      const err = {};
      for (const k in g) if (T[k] && g[k] > 0) { F[k] *= Math.pow(T[k] / g[k], 1.1); err[k] = g[k] - T[k]; }
      log.push(err);
      body = B.build(sk, F);
    }
    body.calib = log; body.girths = girths(body);
    return body;
  }
  Human.Measure = { slice, girths, calibrate };
})();

// ---------------------------------------------------------------- Human: skin weights and deformation
// Weights come from the body itself: each vertex belongs to the bones whose pieces it lies on, by how far it is from each (the slabs of a loft
// overlap a little at their cuts, so the weights cross a joint over a few centimetres), never across a gap (a thigh's vertex is never weighted to
// the other thigh, an arm's never to the ribs), then smoothed over the surface. Up to four bones per vertex.
// Three ways to deform, for comparison (Variants a / b / c in the lab):
//   a  linear blend (LBS): what most games ship. Loses volume at a bent joint ("collapsing elbow") and twists into a candy wrapper.
//   b  dual quaternions (DQS, Kavan 2008): blends rigid motions, so no collapse; a slight bulge outside a bend.
//   c  DQS, then every vertex is moved onto the posed body's own surface along its gradient (the idea of implicit skinning, Vaillant 2013): the
//      posed distance field has the right volume at every joint and the muscles' bulge, so the skin takes both. No sculpted correctives.
(() => {
  const V = Human.v3, Q = Human.q, B = Human.Body;
  function weights(body, mesh, cBind, opt = {}) {
    const sk = body.sk, parts = body.parts, nv = mesh.nv, pos = mesh.pos, sig = opt.sigma || 0.011;
    // which group each bone's pieces are in
    const boneGroup = new Int8Array(sk.n).fill(-1); parts.forEach(p => { if (p.kind !== 'muscle') boneGroup[p.bone] = p.gi; });
    const ok = (vg, bg) => bg === vg || bg === 0 || (vg === 0 && bg >= 0) || (vg === 1 && bg === 0);
    const W = new Float32Array(nv * sk.n), vg = new Int8Array(nv), out = {};
    for (let v = 0; v < nv; v++) {
      const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
      B.dist(cBind, x, y, z, 0, out); vg[v] = out.g;
      const db = new Float64Array(sk.n).fill(1e9);
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i]; if (p.kind === 'muscle') continue; const bg = boneGroup[p.bone]; if (!ok(out.g, bg)) continue;
        const q = cBind.pc[i]; if (Math.hypot(x - q.cen[0], y - q.cen[1], z - q.cen[2]) - q.rad > 0.08) continue;
        const d = B.partDist(p, cBind, q, x, y, z); if (d < db[p.bone]) db[p.bone] = d;
      }
      let m = 1e9; for (let b = 0; b < sk.n; b++) m = Math.min(m, db[b]);
      for (let b = 0; b < sk.n; b++) if (db[b] < m + 6 * sig) W[v * sk.n + b] = Math.exp(-(db[b] - m) / sig);
    }
    // smooth over the surface (the weights become a smooth field; a few Jacobi steps)
    const adj = mesh.adj || (mesh.adj = Human.Mesh.adjacency(nv, mesh.idx));
    let A = W, Bf = new Float32Array(W.length);
    for (let it = 0; it < (opt.smooth || 6); it++) {
      for (let v = 0; v < nv; v++) {
        const o = v * sk.n, a0 = adj.off[v], a1 = adj.off[v + 1], n = a1 - a0;
        for (let b = 0; b < sk.n; b++) { let s = 0; for (let k = a0; k < a1; k++) s += A[adj.nb[k] * sk.n + b]; Bf[o + b] = 0.5 * A[o + b] + 0.5 * s / Math.max(1, n); }
      }
      const t = A; A = Bf; Bf = t;
    }
    // top four, normalised
    const bi = new Uint8Array(nv * 4), bw = new Float32Array(nv * 4);
    for (let v = 0; v < nv; v++) {
      const o = v * sk.n, top = [];
      for (let b = 0; b < sk.n; b++) { const w = A[o + b]; if (w > 1e-4) top.push([w, b]); }
      top.sort((a, b) => b[0] - a[0]); const s = top.slice(0, 4).reduce((s, t) => s + t[0], 0) || 1;
      for (let k = 0; k < 4; k++) { const t = top[k]; bi[v * 4 + k] = t ? t[1] : 0; bw[v * 4 + k] = t ? t[0] / s : 0; }
    }
    return { bi, bw, vg };
  }

  // skinning transforms for a pose: bone b moves a bind-pose point by  R_b R0_b^-1 (x - P0_b) + P_b
  function boneDQ(xf, bind) {
    const n = xf.R.length, dq = new Float64Array(n * 8), mat = new Float64Array(n * 12);
    for (let b = 0; b < n; b++) {
      const r = Q.norm(Q.mul(xf.R[b], Q.conj(bind.R[b]))), t = V.sub(xf.P[b], Q.rot(r, bind.P[b]));
      const o = b * 8; dq[o] = r[0]; dq[o + 1] = r[1]; dq[o + 2] = r[2]; dq[o + 3] = r[3];
      // dual part: 0.5 * t * r
      const d = Q.mul([t[0], t[1], t[2], 0], r); dq[o + 4] = d[0] * 0.5; dq[o + 5] = d[1] * 0.5; dq[o + 6] = d[2] * 0.5; dq[o + 7] = d[3] * 0.5;
      const ex = Q.rot(r, [1, 0, 0]), ey = Q.rot(r, [0, 1, 0]), ez = Q.rot(r, [0, 0, 1]), m = b * 12;
      mat[m] = ex[0]; mat[m + 1] = ey[0]; mat[m + 2] = ez[0]; mat[m + 3] = t[0]; mat[m + 4] = ex[1]; mat[m + 5] = ey[1]; mat[m + 6] = ez[1]; mat[m + 7] = t[1]; mat[m + 8] = ex[2]; mat[m + 9] = ey[2]; mat[m + 10] = ez[2]; mat[m + 11] = t[2];
    }
    return { dq, mat };
  }
  function deform(mesh, W, xf, bind, mode, out) {
    const nv = mesh.nv, P = mesh.pos, o3 = out || new Float32Array(nv * 3), { dq, mat } = boneDQ(xf, bind), bi = W.bi, bw = W.bw;
    for (let v = 0; v < nv; v++) {
      const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
      if (mode === 'a') {
        let X = 0, Y = 0, Z = 0;
        for (let k = 0; k < 4; k++) { const w = bw[v * 4 + k]; if (!w) continue; const m = bi[v * 4 + k] * 12;
          X += w * (mat[m] * x + mat[m + 1] * y + mat[m + 2] * z + mat[m + 3]); Y += w * (mat[m + 4] * x + mat[m + 5] * y + mat[m + 6] * z + mat[m + 7]); Z += w * (mat[m + 8] * x + mat[m + 9] * y + mat[m + 10] * z + mat[m + 11]); }
        o3[v * 3] = X; o3[v * 3 + 1] = Y; o3[v * 3 + 2] = Z;
      } else {
        // blend dual quaternions (sign-aligned to the first), normalise, apply
        let r0 = 0, r1 = 0, r2 = 0, r3 = 0, d0 = 0, d1 = 0, d2 = 0, d3 = 0; const f = bi[v * 4] * 8;
        for (let k = 0; k < 4; k++) { let w = bw[v * 4 + k]; if (!w) continue; const o = bi[v * 4 + k] * 8;
          if (dq[o] * dq[f] + dq[o + 1] * dq[f + 1] + dq[o + 2] * dq[f + 2] + dq[o + 3] * dq[f + 3] < 0) w = -w;
          r0 += w * dq[o]; r1 += w * dq[o + 1]; r2 += w * dq[o + 2]; r3 += w * dq[o + 3]; d0 += w * dq[o + 4]; d1 += w * dq[o + 5]; d2 += w * dq[o + 6]; d3 += w * dq[o + 7]; }
        const l = Math.hypot(r0, r1, r2, r3); r0 /= l; r1 /= l; r2 /= l; r3 /= l; d0 /= l; d1 /= l; d2 /= l; d3 /= l;
        // rotate
        const tx = 2 * (r1 * z - r2 * y), ty = 2 * (r2 * x - r0 * z), tz = 2 * (r0 * y - r1 * x);
        let X = x + r3 * tx + r1 * tz - r2 * ty, Y = y + r3 * ty + r2 * tx - r0 * tz, Z = z + r3 * tz + r0 * ty - r1 * tx;
        // translation = 2 * dual * conj(real)
        X += 2 * (-d3 * r0 + d0 * r3 - d1 * r2 + d2 * r1); Y += 2 * (-d3 * r1 + d1 * r3 - d2 * r0 + d0 * r2); Z += 2 * (-d3 * r2 + d2 * r3 - d0 * r1 + d1 * r0);
        o3[v * 3] = X; o3[v * 3 + 1] = Y; o3[v * 3 + 2] = Z;
      }
    }
    return o3;
  }
  // c: move each vertex onto the posed surface along the field's gradient (up to maxMove; a vertex whose field turns sharply, meaning it is in
  // contact with another part, stops there, as in implicit skinning). Only vertices near a joint need it: the rest ride one bone rigidly.
  function project(c, pos, W, opt = {}) {
    const nv = pos.length / 3, maxMove = opt.maxMove || 0.03, out = new Float32Array(pos), moved = new Float32Array(nv);
    for (let v = 0; v < nv; v++) {
      if (W.bw[v * 4] > (opt.rigid || 0.985) && !opt.all) continue;
      let x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2], g0 = null;
      for (let it = 0; it < 3; it++) {
        const d = B.dist(c, x, y, z); if (Math.abs(d) < 2e-4) break;
        const g = B.grad(c, x, y, z), gl = Math.hypot(g[0], g[1], g[2]); if (gl < 1e-6) break;
        const n = [g[0] / gl, g[1] / gl, g[2] / gl];
        if (g0 && n[0] * g0[0] + n[1] * g0[1] + n[2] * g0[2] < 0.55) break;            // contact: stop
        g0 = g0 || n;
        const s = d / gl;
        x -= n[0] * s; y -= n[1] * s; z -= n[2] * s;
      }
      let dx = x - pos[v * 3], dy = y - pos[v * 3 + 1], dz = z - pos[v * 3 + 2]; const m = Math.hypot(dx, dy, dz);
      if (m > maxMove) { const k = maxMove / m; dx *= k; dy *= k; dz *= k; }
      out[v * 3] += dx; out[v * 3 + 1] += dy; out[v * 3 + 2] += dz; moved[v] = Math.min(m, maxMove);
    }
    // the moves are smoothed over the surface (a vertex stopped by a contact and its neighbour that was not would otherwise make a step)
    if (opt.adj) {
      const adj = opt.adj; let D = new Float32Array(nv * 3), E = new Float32Array(nv * 3);
      for (let i = 0; i < nv * 3; i++) D[i] = out[i] - pos[i];
      for (let it = 0; it < (opt.smooth || 4); it++) {
        for (let v = 0; v < nv; v++) { const a0 = adj.off[v], a1 = adj.off[v + 1]; let sx = 0, sy = 0, sz = 0;
          for (let k = a0; k < a1; k++) { const u = adj.nb[k] * 3; sx += D[u]; sy += D[u + 1]; sz += D[u + 2]; }
          const n = Math.max(1, a1 - a0); E[v * 3] = 0.5 * D[v * 3] + 0.5 * sx / n; E[v * 3 + 1] = 0.5 * D[v * 3 + 1] + 0.5 * sy / n; E[v * 3 + 2] = 0.5 * D[v * 3 + 2] + 0.5 * sz / n; }
        const t = D; D = E; E = t;
      }
      for (let i = 0; i < nv * 3; i++) out[i] = pos[i] + D[i];
    }
    return { pos: out, moved };
  }
  Human.Skin = { weights, deform, project, boneDQ };
})();

