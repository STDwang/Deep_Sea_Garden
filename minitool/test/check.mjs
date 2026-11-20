import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const root=new URL('../',import.meta.url),context=vm.createContext({console,setTimeout,performance,self:{},window:{}});
const files=['vendor/00_util.js','vendor/01_gfx.js','vendor/02_shaderlib.js','vendor/06_sdfmesh.js','vendor/08_human.js','src/10_world.js','src/12_current.js','src/13_human_mesh.js','src/14_diver.js','src/17_experience.js','src/18_bubbles.js','src/20_render.js'];
for(const file of files)vm.runInContext(await readFile(new URL(file,root),'utf8'),context,{filename:file});
vm.runInContext('globalThis.testAPI={world:GardenWorld,current:GardenCurrent,diver:GardenDiver,buildShader,VS_FULLSCREEN,OCEAN_VERT,OCEAN_FRAG,JELLY_FRAG,WATER_SSL,WATER_COMPOSITE,SL};',context);
const api=context.testAPI,start=performance.now(),world=await api.world.build(()=>{});
let total=0,bytes=0;
for(const name of ['ground','plants','corals','manta','fish','jelly','diver','leaf']){
  const m=world[name];assert(m.nv>0&&m.ni>0,name+' empty');assert.equal(m.verts.length,m.nv*10);assert.equal(m.idx.length,m.ni);assert.equal(m.ni%3,0);
  assert(m.verts.every(Number.isFinite),name+' invalid coordinates');assert(m.idx.every(i=>i<m.nv),name+' index bounds');
  for(let i=0;i<m.nv;i++){const k=i*10;const n=Math.hypot(m.verts[k+3],m.verts[k+4],m.verts[k+5]);assert(Math.abs(n-1)<.02,name+' invalid normal');}
  total+=m.ni/3;bytes+=m.verts.byteLength+m.idx.byteLength;console.log(name+': '+m.nv+' vertices, '+m.ni/3+' triangles');
}
assert.equal(world.leafInstances.length%12,0);assert(world.leafInstances.every(Number.isFinite));
const leafCount=world.leafInstances.length/12;total+=world.leaf.ni/3*leafCount;bytes+=world.leafInstances.byteLength;console.log(leafCount+' instanced kelp / meadow blades');
for(const p of api.world.points){assert(p.pos[1]>api.world.height(p.pos[0],p.pos[2])+1,'camera below terrain');for(const o of world.obstacles)assert(Math.hypot(p.pos[0]-o.x,p.pos[2]-o.z)>o.r+.5,p.name+' inside obstacle');}
// Swimming direction, drag, frame-rate independence and flow variation are behavior, not mesh snapshots.
function swim(keys,hz=60,yaw=0,pitch=0){const d=api.diver.create([0,0,0],yaw,pitch);for(let i=0;i<hz*3;i++)api.diver.step(d,keys,1/hz,i/hz,()=>-20,[]);return d;}
assert(swim({KeyW:true}).pos[2]<-3,'W forward');const backwards=swim({KeyS:true});assert(backwards.pos[2]>1.5,'S swims toward lens after turning');assert(Math.abs(Math.abs(backwards.yaw)-Math.PI)<.02,'S faces player');assert.equal(backwards.targetYaw,0,'S does not spin camera');assert(swim({KeyA:true}).pos[0]<-2,'A left');assert(swim({KeyD:true}).pos[0]>2,'D right');assert(swim({KeyW:true},60,Math.PI/2).pos[0]>3,'heading controls forward');
// ABZU-style six-way swim: Space rises vertically, Q sinks, W+Space composes a forward-up diagonal; camera pitch no longer drives depth.
assert(swim({Space:true}).pos[1]>2,'Space rises vertically');assert(swim({KeyQ:true}).pos[1]<-2,'Q sinks');const diag=swim({KeyW:true,Space:true});assert(diag.pos[2]<-2&&diag.pos[1]>2,'W+Space swims forward-and-up');assert(Math.abs(swim({KeyW:true},60,0,.5).pos[1])<.6,'camera pitch does not drive depth');
const cruise=swim({KeyW:true},60),dash=swim({KeyW:true,ShiftLeft:true},60);assert(dash.pos[2]<cruise.pos[2]*1.4,'Shift sprints faster than cruise');assert(dash.sprint,'sprint flag set');assert(dash.effort>cruise.effort,'sprint drives stronger kick');
const a=swim({KeyW:true},30),b=swim({KeyW:true},120);assert(Math.hypot(...a.pos.map((q,k)=>q-b.pos[k]))<.10,'frame-rate independence');
const d=swim({KeyW:true});for(let i=0;i<180;i++)api.diver.step(d,{},1/60,2+i/60,()=>-20,[]);assert(Math.hypot(...d.velocity)<.2,'water drag settles after key release');
const touching=api.diver.create([0,0,0]);api.diver.step(touching,{},1/60,0,()=>-20,[{x:0,z:0,r:1}]);assert(Math.hypot(touching.pos[0],touching.pos[2])>=1.59,'obstacle center resolves');
assert.equal(world.diver.skin.length,world.diver.nv*8);for(let i=0;i<world.diver.nv;i++){const w=world.diver.skin.slice(i*8,i*8+8);assert(w.every(Number.isFinite));assert(w.slice(0,4).every(q=>q>=0&&q<59));assert(Math.abs(w.slice(4).reduce((a,b)=>a+b,0)-1)<.0001,'skin weights normalised');}assert(api.diver.bones(backwards).every(Number.isFinite),'59 bone transforms finite');
for(let t=0;t<100;t+=.7)for(const p of [[0,-4,0],[14,-2,-20],[-8,3,10]])assert(Math.hypot(...api.current.sample(p,t))<.45,'bounded water flow');
assert(Math.hypot(...api.current.sample([0,-4,0],3).map((q,k)=>q-api.current.sample([12,-4,-17],3)[k]))>.04,'spatially varying flow');
const tap=api.diver.create([0,0,0]);api.diver.faceInput(tap,{KeyS:true});for(let i=0;i<180;i++)api.diver.step(tap,{},1/60,i/60,()=>-20,[]);assert(Math.abs(Math.abs(tap.yaw)-Math.PI)<.002,'short S tap completes turn after release');assert(Math.hypot(...tap.pos)<.3,'turning without held input does not propel backwards');
console.log('PASS: WASD, Space/Q depth, W+Space diagonal, sprint, drag, frame-rate independence, collision and spatial flow');
const desc={buffers:[{attrs:[['pos','vec3f'],['normal','vec3f'],['mat','vec4f']]}],varyings:{world:'vec3f',normal:'vec3f',mat:'vec4f'},uniforms:{p:'vec4f',q:'vec4f'},lib:[api.SL.common,api.WATER_SSL],textures:{tShadow:'shadow',tDetail:'2d'},vs:api.OCEAN_VERT,fs:api.OCEAN_FRAG};
for(const language of ['glsl','wgsl']){const src=api.buildShader(desc,language);assert(language==='wgsl'?src.code.includes('@vertex'):src.vs.startsWith('#version 300 es'));if(language==='glsl')assert(!/\bfn\s+|\b(?:let|var)\s+\w+\s*:/.test(src.vs+src.fs));}
const html=await readFile(new URL('dist/index.html',root),'utf8'),app=await readFile(new URL('dist/app.js',root),'utf8');
assert(!/<script(?![^>]*\bsrc=)/i.test(html));assert(!/\b(?:eval|Function)\s*\(/.test(app));assert(!/requestFullscreen|requestPointerLock|WebGLRenderingContext/.test(app));
console.log(`PASS: ${total} triangles; ${(bytes/1048576).toFixed(2)} MiB mesh buffers; generation ${(performance.now()-start).toFixed(0)} ms. Both shader source paths generated; runtime compilation verified separately in browser.`);
