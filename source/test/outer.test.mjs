import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function loadOuterEnv() {
  const qualityCode = readFileSync(new URL('../src/quality.js', import.meta.url), 'utf8');
  const mathCode = readFileSync(new URL('../src/math.js', import.meta.url), 'utf8');
  const outerCode = readFileSync(new URL('../src/outer.js', import.meta.url), 'utf8');
  const shadersCode = readFileSync(new URL('../src/shaders.js', import.meta.url), 'utf8');
  const ctx = {
    Math, Float32Array, Uint32Array, Uint16Array, ArrayBuffer, DataView, Int32Array,
    URLSearchParams,
    location: { search: '' },
    navigator: { userAgent: '' },
    document: { querySelectorAll: () => [] },
    window: { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1 },
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
  };
  return runInNewContext(
    `${qualityCode}\n${mathCode}\n${outerCode}\n${shadersCode}\n({` +
    `OUTER_SWIM_RADIUS, OUTER_LANDMARKS, OUTER_EXTRA_ARCHES, OUTER_ARCH_LIST, OUTER_WGSL,` +
    `outerEdge, outerBiomeWeights, outerPurpleZone, outerHeight, outerNormal, outerSdf,` +
    `initOuterArches, buildClipmapMesh, meshOuterArch, createOuterStreamer,` +
    `W_DENS, S_G, S_B, W_SOLID, W_RAYS, W_SAND` +
    `})`,
    ctx
  );
}

test('outerHeight is finite, bounded, smooth, and matches WGSL contract without reserved keywords', () => {
  const env = loadOuterEnv();
  const samples = [
    [0, 0], [160, 0], [176, 0], [290, -205], [365, 155],
    [-240, 325], [-360, -195], [600, 480], [-720, -610], [920, -200],
  ];
  for (const [x, z] of samples) {
    const h = env.outerHeight(x, z);
    assert.ok(Number.isFinite(h), `height at (${x},${z}) must be finite`);
    assert.ok(h >= -51.5 && h <= -16.5, `height ${h} at (${x},${z}) out of expected bounds`);
    const [nx, ny, nz] = env.outerNormal(x, z);
    assert.ok(Number.isFinite(nx) && Number.isFinite(ny) && Number.isFinite(nz));
    assert.ok(ny > 0.3, `normal ny=${ny} at (${x},${z}) should point upward`);
    const len = Math.hypot(nx, ny, nz);
    assert.ok(Math.abs(len - 1) < 1e-4, `normal must be unit length, got ${len}`);
  }

  // Smoothness check: nearby points shouldn't jump wildly
  for (let i = 0; i < 40; i++) {
    const x = -600 + i * 31;
    const z = 500 - i * 27;
    const h0 = env.outerHeight(x, z);
    const h1 = env.outerHeight(x + 0.75, z);
    assert.ok(Math.abs(h1 - h0) < 2.2, `excessive height jump ${Math.abs(h1 - h0)} at (${x},${z})`);
  }

  // Verify WGSL shaders contain required outer functions and zero WGSL reserved keywords as identifiers
  for (const fnName of ['oh2', 'on2', 'ofbm', 'outerEdge', 'outerBiome', 'outerHeight', 'outerNormal', 'outerGroundMap', 'outerVol']) {
    assert.ok(env.OUTER_WGSL.includes(`fn ${fnName}(`), `OUTER_WGSL missing fn ${fnName}`);
  }
  const wgslSources = [env.OUTER_WGSL, env.W_DENS, env.S_G, env.S_B, env.W_SOLID, env.W_RAYS, env.W_SAND];
  // Reserved WGSL keywords that frequently sneak in as variable names
  const forbiddenDecl = /\b(?:let|var|const|fn)\s+(macro|mod|filter|type|ref|self|super|match|target|sample|smooth|active|in|out|final|abstract|public|private|protected|inline|virtual|override_unused)\b/;
  for (const src of wgslSources) {
    const m = src.match(forbiddenDecl);
    assert.equal(m, null, `Found WGSL reserved keyword declaration: ${m && m[0]}`);
  }
});

test('outerSdf enforces seabed solidity and hollow pass-through outer stone arches', () => {
  const env = loadOuterEnv();
  const arches = env.initOuterArches();
  assert.equal(arches.length, 12, 'expected 4 landmark arches + 8 scenic outer arches');

  for (const a of arches) {
    // Center of arch opening must be open water (< -1m)
    const centerSdf = env.outerSdf(a.x, a.y + a.R * a.squash * 0.35, a.z);
    assert.ok(centerSdf < -1.0, `arch at (${a.x},${a.z}) center should be open water, got ${centerSdf}`);

    // Top crown of the arch ring must be solid rock (> 0)
    const crownSdf = env.outerSdf(a.x, a.y + a.R * a.squash, a.z);
    assert.ok(crownSdf > 0, `arch crown at (${a.x},${a.z}) should be solid, got ${crownSdf}`);

    // Below seabed is solid (> 0), well above seabed away from arch is open (< 0)
    const bed = env.outerHeight(a.x + 35, a.z + 35);
    assert.ok(env.outerSdf(a.x + 35, bed - 2.0, a.z + 35) > 0);
    assert.ok(env.outerSdf(a.x + 35, bed + 6.0, a.z + 35) < 0);
  }

  const archMesh = env.meshOuterArch();
  assert.ok(archMesh.p.length > 0 && archMesh.i.length > 0);
  for (let k = 0; k < archMesh.p.length; k++) {
    assert.ok(Number.isFinite(archMesh.p[k]), 'arch mesh vertex must be finite');
  }
  const built = archMesh.build();
  assert.ok(built.nv > 0 && built.ib.length === archMesh.i.length);
});

test('buildClipmapMesh builds 5-ring seamless grid within VRAM budget and upward CCW winding', () => {
  const env = loadOuterEnv();
  const clip = env.buildClipmapMesh();
  assert.equal(clip.rings, 5);
  assert.ok(clip.nv > 10000 && clip.ni > 30000);
  assert.equal(clip.ni % 3, 0);

  // VRAM check: vertex buffer (Float32Array) + index buffer (Uint32Array) < 2 MB
  const vramBytes = clip.vb.byteLength + clip.ib.byteLength;
  assert.ok(vramBytes < 2 * 1024 * 1024, `Clipmap VRAM ${vramBytes} exceeds 2 MB budget`);

  // Check index bounds and CCW +Y winding on ring 0
  const maxIdx = clip.nv - 1;
  let checkedTris = 0;
  for (let t = 0; t < clip.ni; t += 3) {
    const i0 = clip.ib[t], i1 = clip.ib[t + 1], i2 = clip.ib[t + 2];
    assert.ok(i0 <= maxIdx && i1 <= maxIdx && i2 <= maxIdx);
    if (checkedTris < 500) {
      const x0 = clip.vb[i0 * 4], z0 = clip.vb[i0 * 4 + 1];
      const x1 = clip.vb[i1 * 4], z1 = clip.vb[i1 * 4 + 1];
      const x2 = clip.vb[i2 * 4], z2 = clip.vb[i2 * 4 + 1];
      // Cross product (p1-p0) x (p2-p0) y-component = (z1-z0)*(x2-x0) - (x1-x0)*(z2-z0)
      const ny = (z1 - z0) * (x2 - x0) - (x1 - x0) * (z2 - z0);
      assert.ok(ny > 0, `Triangle ${t / 3} has inverted winding (ny=${ny})`);
      checkedTris++;
    }
  }
});

test('createOuterStreamer is deterministic, excludes core sanctuary, respects capacities, and shrinks in power-save', () => {
  const env = loadOuterEnv();
  const streamer = env.createOuterStreamer();
  const snap = () => ({
    rock0: streamer.rockCounts[0],
    rock1: streamer.rockCounts[1],
    prop: [...streamer.propCounts],
    leaf: streamer.leafCount,
    fish: streamer.fishCount,
    turtle: streamer.turtleCount,
    manta: streamer.mantaCount,
    jelly: streamer.jellyCount,
    bubble: streamer.bubbleCount,
  });

  // At origin (core sanctuary), all inner cells inside edge < 176 should be excluded
  streamer.update(0, 0, 1.0, false);
  assert.equal(streamer.rockCounts[0] + streamer.rockCounts[1], 0, 'core center should not stream outer rocks');

  // Move to outer ocean landmark 0 (翠渊巨藻塔 at 290, -205)
  const changed1 = streamer.update(290, -205, 1.0, false);
  assert.equal(changed1, true);
  const s1 = snap();
  const snapRock = Array.from(streamer.rockBufs[0].slice(0, Math.min(24, s1.rock0 * 12)));
  assert.ok(s1.rock0 + s1.rock1 > 0 && s1.leaf > 0, 'outer kelp zone should populate rocks and kelp/fronds');
  assert.ok(s1.rock0 <= streamer.caps.MAX_ROCKS && s1.rock1 <= streamer.caps.MAX_ROCKS);
  assert.ok(s1.leaf <= streamer.caps.MAX_LEAVES);
  assert.ok(s1.fish <= streamer.caps.MAX_FISH);

  // Verify no outer rock spawns inside core sanctuary (edge < 174)
  for (let b = 0; b < 2; b++) {
    for (let i = 0; i < streamer.rockCounts[b]; i++) {
      const rx = streamer.rockBufs[b][i * 12];
      const rz = streamer.rockBufs[b][i * 12 + 2];
      assert.ok(env.outerEdge(rx, rz) >= 174, `outer rock at (${rx},${rz}) encroaches core sanctuary`);
    }
  }

  // Move to Basalt Thermal Trench landmark (-360, -195), then revisit (290, -205): must be bit-identical
  streamer.update(-360, -195, 1.0, false);
  assert.ok(streamer.bubbleCount > 0, 'thermal trench biome should spawn bubble vents');
  streamer.update(290, -205, 1.0, false);
  assert.deepEqual(snap(), s1, 'revisiting same cell must yield identical counts');
  const snapRock2 = Array.from(streamer.rockBufs[0].slice(0, Math.min(24, s1.rock0 * 12)));
  assert.deepEqual(snapRock2, snapRock, 'revisiting same cell must yield identical coordinates');

  // Power-save mode shrinks window and reduces active object counts
  streamer.update(290, -205, 0.5, true);
  assert.ok(streamer.rockCounts[0] + streamer.rockCounts[1] <= s1.rock0 + s1.rock1, 'power-save should not increase rock count');
  assert.ok(streamer.leafCount <= s1.leaf, 'power-save should not increase frond count');
});

test('journal preserves legacy garden-journal-v1 saves and adds 4 outer-ocean wonders', async () => {
  const journalCode = readFileSync(new URL('../src/journal.js', import.meta.url), 'utf8');
  const els = new Map();
  const makeEl = () => ({
    textContent: '',
    hidden: false,
    className: '',
    classList: {
      classes: new Set(),
      toggle(name, force) {
        if (force === undefined) {
          if (this.classes.has(name)) { this.classes.delete(name); return false; }
          this.classes.add(name); return true;
        }
        if (force) this.classes.add(name); else this.classes.delete(name);
        return !!force;
      },
    },
    children: [],
    addEventListener() {},
    appendChild(child) { this.children.push(child); return child; },
  });
  const doc = {
    addEventListener() {},
    getElementById(id) {
      if (!els.has(id)) els.set(id, makeEl());
      return els.get(id);
    },
    createElement() { return makeEl(); },
  };
  const ctx = {
    document: doc,
    Math,
    Set,
    Array,
    Number,
    JSON,
    Promise,
    console,
    $: id => doc.getElementById(id),
  };
  const { journalSpots, createJournal } = runInNewContext(`${journalCode}\n({ journalSpots, createJournal })`, ctx);

  assert.equal(journalSpots.length, 13, 'expected 9 core + 4 outer wonders');
  const poses = Array.from({ length: 13 }, (_, i) => [i * 30, -28, 0, 0, 0]);
  poses[9] = [290, -34, -205, 0, 0];
  poses[10] = [365, -24, 155, 0, 0];
  poses[11] = [-240, -38, 325, 0, 0];
  poses[12] = [-360, -40, -195, 0, 0];

  let savedPayload = null;
  const storage = {
    read: () => Promise.resolve('[0,1,6,7,8]'),
    write: (_k, data) => { savedPayload = data; return Promise.resolve(true); },
  };

  const j = createJournal(poses, storage);
  await new Promise(resolve => setImmediate(resolve));

  // Legacy save [0,1,6,7,8] loaded intact
  assert.equal(j.goal.found, 5);
  assert.equal(j.goal.total, 13);

  // Arriving within 18m of outer wonder #9 records it
  j.update(295, -34, -200, 1000);
  assert.equal(j.goal.found, 6);
  assert.ok(doc.getElementById('journal-notice').textContent.includes('翠渊巨藻塔'));

  // Sonar locks onto next undiscovered spot (including outer wonders)
  j.scan([295, -34, -200], 0, 1500);
  assert.ok(j.goal.locked);
  assert.ok(doc.getElementById('journal-notice').textContent.includes('最近未记录'));

  // notify() helper displays custom notices cleanly
  j.notify('洋流强劲，前方已接近远海深渊边界', 2000, 3000);
  assert.equal(doc.getElementById('journal-notice').textContent, '洋流强劲，前方已接近远海深渊边界');

  await new Promise(resolve => setImmediate(resolve));
  assert.ok(savedPayload && JSON.parse(savedPayload).includes(9));
});
