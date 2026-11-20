import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('building the diver supplies finite transforms for the third-person vertex shader', () => {
  const code = ['human', 'human-mesh', 'diver'].map(name =>
    readFileSync(new URL(`../src/${name}.js`, import.meta.url), 'utf8')
  ).join('\n');
  const diver = runInNewContext(code + '\nDiver');
  const mesh = diver.build();
  assert.ok(mesh.ni > 0);
  assert.ok(Number.isFinite(diver.rootY) && diver.rootY > 0);
  const pose = diver.bones(diver.create([0, -30, 0]));
  assert.ok(pose.every(Number.isFinite));
});
