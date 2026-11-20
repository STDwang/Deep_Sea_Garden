import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
const from='D:/Ai_RedTool/red_skiing',to=new URL('../minitool/vendor/',import.meta.url);
await mkdir(to,{recursive:true});
for(const name of ['00_util.js','01_gfx.js','02_shaderlib.js','06_sdfmesh.js']){
  let text=await readFile(path.join(from,'src',name),'utf8');
  text=text.replace(/\/\*native\{\*\/[\s\S]*?\/\*\}native\*\//g,'');
  if(name==='01_gfx.js'){
    const old="try { const v = Function('return (' + x + ')')(); return isFinite(v) ? v : null; } catch (e) { return null; }";
    if(!text.includes(old))throw new Error('Upstream smoothstep evaluator changed');
    text=text.replace(old,"const v = Number(x); return Number.isFinite(v) ? v : null;");
  }
  if(name==='02_shaderlib.js')text=text.replace('CAM_FAR = 14000','CAM_FAR = 120');
  const header='/*! Adapted from Cold Smoke, Copyright (c) 2026 Huisky. MIT license. See THIRD_PARTY_NOTICES.md. */\n';
  await writeFile(new URL(name,to),header+text);
}
await copyFile(path.join(from,'LICENSE'),new URL('LICENSE',to));
const terrain=await readFile(path.join(from,'src/04_terrain.js'),'utf8');
await writeFile(new URL('04_textures.js',to),'/*! Cold Smoke procedural noise/detail textures, Copyright (c) 2026 Huisky, MIT. */\n'+terrain.slice(0,terrain.indexOf('Par.jobs.noiseData')));
console.log('Vendored Cold Smoke util, WebGPU/WebGL2 gfx, shared shader library and SDF mesher.');
