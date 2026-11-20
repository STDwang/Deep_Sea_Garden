const Garden = {ready:false,mode:'welcome',time:0,route:0,place:0,level:1,reduced:false,paused:false,photos:[],camera:null,metrics:{frames:[],errors:[]}};
const el=id=>document.getElementById(id);
let viewCanvas=el('sea'),toastTimer,photoRect,photoRatio=.75,photoBusy=false,lastMode='cruise',lastPaused=false,drag=null,stick=null,stickX=0,stickY=0,lastNow=0,governTime=0,slowFrames=0,governFrames=0,muted=true,audio;
const keys={},look={yaw:0,pitch:0},mouse={active:false,last:null,edge:0};
function resetDiver(n){const p=pointCamera(GardenWorld.points[n]);Garden.diver=GardenDiver.create(p.pos,p.yaw,p.pitch);Garden.camera=p;GardenDiver.camera(Garden.diver,Garden.camera,0);}
function toast(s){el('toast').textContent=s;el('toast').style.opacity=1;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el('toast').style.opacity=0,3000);}
function status(s,t){el('load-status').textContent=s;el('progress').style.width=Math.round(t*100)+'%';}
function fatal(error){console.error(error);Garden.metrics.errors.push(error.message||String(error));Garden.paused=true;el('fatal-message').textContent=error.message||'场景暂时无法启动。';el('fatal').hidden=false;}
const pointCamera=p=>{const d=v3.sub(p.at,p.pos);return {pos:p.pos.slice(),yaw:Math.atan2(d[0],-d[2]),pitch:Math.atan2(d[1],Math.hypot(d[0],d[2])),fov:.99};};
function placeName(n){Garden.place=n;const p=GardenWorld.points[n];el('place-name').textContent=p.name;el('place-line').textContent=p.line;document.querySelectorAll('[data-place]').forEach(b=>b.classList.toggle('on',+b.dataset.place===n));}
function switchPlace(n,park=true){if(!Garden.ready||photoBusy)return;document.body.classList.add('switching');setTimeout(()=>{if(Garden.mode==='dive')resetDiver(n);else Garden.camera=pointCamera(GardenWorld.points[n]);Garden.route=n===0?0:n===1?1:2;look.yaw=look.pitch=0;if(park&&Garden.mode!=='art'&&Garden.mode!=='dive'){Garden.paused=true;el('pause').textContent='▷';el('pause').setAttribute('aria-label','继续');}placeName(n);document.body.classList.remove('switching');},260);}
function fit(){if(!Garden.ready)return;const sizes=[{dpr:1.5,max:2e6},{dpr:1.25,max:1.2e6},{dpr:1,max:.7e6}],q=sizes[Garden.level],dpr=Math.min(devicePixelRatio||1,q.dpr),scale=Math.min(1,Math.sqrt(q.max/(innerWidth*innerHeight*dpr*dpr)))*GardenQuality.scale;GardenRender.resize(Math.round(innerWidth*dpr*scale),Math.round(innerHeight*dpr*scale));if(Garden.mode==='photo')layoutFrame();}
function setLevel(n){Garden.level=n;GardenRender.setLevel(n);el('quality').lastElementChild.textContent=(GardenQuality.auto?'自动 · ':'')+['高','均衡','流畅'][n];fit();}
function toggleOptions(open){const opening=open===undefined?el('options').hidden:open;if(opening){Garden.menuPaused=Garden.paused;Garden.paused=true;releaseControls();}else Garden.paused=!!Garden.menuPaused;el('options').hidden=!opening;}
function changeView(){if(!Garden.diver)return;Garden.diver.view=(Garden.diver.view+1)%3;GardenDiver.camera(Garden.diver,Garden.camera,0);el('view-label').textContent=['跟随','第一人称','远景'][Garden.diver.view];}
function changeLight(){GardenScene.light=(GardenScene.light+1)%4;GardenScene.auto=GardenScene.light===3;el('day-label').textContent=['白昼','暮光','夜潜','自动昼夜'][GardenScene.light];}
const routePoints=[[0,.3,13],[1,.15,-15],[16,-.1,-25],[10,.8,-10]];
const routeTargets=[[0,.4,-9],[-3,.1,-29],[24,-1,-37],[0,1,-9]];
function curve(ps,t){const i=Math.floor(t)%ps.length,f=t-Math.floor(t),a=ps[(i+ps.length-1)%ps.length],b=ps[i],c=ps[(i+1)%ps.length],d=ps[(i+2)%ps.length];return b.map((v,k)=>.5*(2*v+(-a[k]+c[k])*f+(2*a[k]-5*v+4*c[k]-d[k])*f*f+(-a[k]+3*v-3*c[k]+d[k])*f*f*f));}
// The seabed is now endless: only avoid real obstacles and stay above the analytic floor.
// Bounds are far wider than any practical swim and exist only to guard against runaway coordinates.
function constrain(p){p[0]=clamp(p[0],-8000,8000);p[2]=clamp(p[2],-8000,8000);for(const o of Garden.world.obstacles){const dx=p[0]-o.x,dz=p[2]-o.z,d=Math.hypot(dx,dz),r=o.r+.65;if(d<r&&d>.00001){p[0]=o.x+dx/d*r;p[2]=o.z+dz/d*r;}}p[1]=Math.max(p[1],GardenWorld.height(p[0],p[2])+1.2);return p;}
function step(dt){
  if(Garden.paused||Garden.mode==='preview'||Garden.mode==='welcome')return;
  Garden.time+=dt*(Garden.reduced?.25:1);
  const c=Garden.camera;
  if(Garden.mode==='dive'){
    if(mouse.active)Garden.diver.targetYaw+=mouse.edge*dt*1.1;
    GardenDiver.step(Garden.diver,mouse.active&&el('options').hidden?keys:{},dt,Garden.time,GardenWorld.height,Garden.world.obstacles);GardenDiver.camera(Garden.diver,c,dt);
  }else if(Garden.mode==='cruise'&&!Garden.reduced){
    Garden.route=(Garden.route+dt/45)%4;const p=curve(routePoints,Garden.route),at=curve(routeTargets,Garden.route),d=v3.sub(at,p);c.pos=constrain(p);c.yaw=Math.atan2(d[0],-d[2])+look.yaw;c.pitch=clamp(Math.atan2(d[1],Math.hypot(d[0],d[2]))+look.pitch,-1.1,1.1);const n=Garden.route<.65?0:Garden.route<1.6?1:Garden.route<2.7?2:0;if(n!==Garden.place)placeName(n);
  }else if(Garden.mode==='manual'){
    const f=[Math.sin(c.yaw),0,-Math.cos(c.yaw)],r=[Math.cos(c.yaw),0,Math.sin(c.yaw)],forward=(keys.KeyW||keys.ArrowUp?1:0)-(keys.KeyS||keys.ArrowDown?1:0)-stickY,side=(keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0)+stickX,speed=1.25*dt/Math.max(1,Math.hypot(forward,side));c.pos=constrain(v3.add(c.pos,v3.add(v3.mul(f,forward*speed),v3.mul(r,side*speed))));
  }
}
function frame(now){
  const raw=lastNow?(now-lastNow)/1000:1/60;lastNow=now;
  if(Garden.ready&&!document.hidden&&!photoBusy){try{if(Garden.mode==='photo')photoMove(Math.min(raw,.05));step(Math.min(raw,.05));GardenRender.render(Garden.camera,Garden.time,Garden.diver);}catch(e){fatal(e);return;}
    if(Garden.mode!=='welcome'&&Garden.mode!=='preview'&&!Garden.paused&&raw<.25){Garden.metrics.frames.push(raw*1000);if(Garden.metrics.frames.length>900)Garden.metrics.frames.shift();GardenQuality.observe(raw);}
    if(!el('stats').hidden&&GardenRender.frame%20===0){const fps=Garden.metrics.frames.length?1000/(Garden.metrics.frames.reduce((a,b)=>a+b,0)/Garden.metrics.frames.length):0;el('stats').textContent=GardenRender.g.caps.name+' · '+['高','均衡','流畅'][Garden.level]+'\n'+GardenRender.W+' × '+GardenRender.H+' · '+fps.toFixed(1)+' fps\n'+Math.round(GardenRender.stats.triangles)+' triangles';}
  }
  requestAnimationFrame(frame);
}
function setMode(mode){Garden.mode=mode;el('mode').textContent=mode==='manual'?'自己游':'随流漫游';el('joystick').hidden=mode!=='manual';if(mode==='cruise'){
    // Return through a short fade to the current scenic anchor; never fly through rocks.
    switchPlace(Garden.place,false);
  }}
function enter(){if(!Garden.ready)return;document.body.classList.add('playing');el('run-ui').hidden=false;Garden.mode='cruise';Garden.paused=false;startAudio();}
function layoutFrame(){const availableW=innerWidth-38,availableH=innerHeight-190,h=Math.min(availableH,availableW/photoRatio),w=h*photoRatio;photoRect={x:(innerWidth-w)/2,y:(innerHeight-h)/2-8,w,h};Object.assign(el('frame').style,{left:photoRect.x+'px',top:photoRect.y+'px',width:w+'px',height:h+'px'});}
function enterPhoto(){if(!Garden.ready||photoBusy)return;if(!el('options').hidden)toggleOptions(false);lastMode=Garden.mode;lastPaused=Garden.paused;Garden.photoStart=Object.assign({},Garden.camera,{pos:Garden.camera.pos.slice()});releaseControls();Garden.mode='photo';Garden.paused=true;el('photo-ui').hidden=false;el('joystick').hidden=true;document.body.classList.add('photo');layoutFrame();}
function exitPhoto(){Garden.mode=lastMode;Garden.paused=lastPaused;if(Garden.photoStart)Garden.camera=Object.assign({},Garden.photoStart,{pos:Garden.photoStart.pos.slice()});el('photo-ui').hidden=true;document.body.classList.remove('photo');el('joystick').hidden=lastMode!=='manual';el('preview').hidden=true;releaseControls();}
function photoMove(dt){const c=Garden.camera,f=[Math.sin(c.yaw)*Math.cos(c.pitch),Math.sin(c.pitch),-Math.cos(c.yaw)*Math.cos(c.pitch)],r=[Math.cos(c.yaw),0,Math.sin(c.yaw)],fw=(keys.KeyW?1:0)-(keys.KeyS?1:0),lr=(keys.KeyD?1:0)-(keys.KeyA?1:0),up=(keys.KeyE?1:0)-(keys.KeyQ?1:0),speed=dt*(keys.ShiftLeft?4:1.5);c.pos=c.pos.map((q,k)=>q+(f[k]*fw+r[k]*lr+(k===1?up:0))*speed);}
async function shoot(){
  if(photoBusy||Garden.mode!=='photo')return;if(Garden.photos.length>=12){toast('本次已保留 12 张照片，请先保存喜欢的照片，再重新打开花园。');return;}
  photoBusy=true;el('shoot').disabled=true;
  try{
    GardenRender.render(Garden.camera,Garden.time,Garden.diver);const image=await GardenRender.capture();if(!image)throw new Error('无法读取这一帧，请重试。');
    const cv=document.createElement('canvas');cv.width=image.w;cv.height=image.h;const ctx=cv.getContext('2d');ctx.putImageData(new ImageData(image.data,image.w,image.h),0,0);
    const sx=photoRect.x/innerWidth*image.w,sy=photoRect.y/innerHeight*image.h,sw=photoRect.w/innerWidth*image.w,sh=photoRect.h/innerHeight*image.h;
    const scale=Math.min(1,(Garden.level===2?1080:1440)/Math.max(sw,sh)),out=document.createElement('canvas');out.width=Math.max(1,Math.round(sw*scale));out.height=Math.max(1,Math.round(sh*scale));out.getContext('2d').drawImage(cv,sx,sy,sw,sh,0,0,out.width,out.height);
    const url=out.toDataURL('image/jpeg',.93),shot={url,name:GardenWorld.points[Garden.place].name,w:out.width,h:out.height,time:Garden.time};Garden.photos.push(shot);showPhoto(shot);cv.width=cv.height=out.width=out.height=1;
  }catch(e){toast('这张照片没有拍成：'+e.message);}finally{photoBusy=false;el('shoot').disabled=false;lastNow=performance.now();}
}
let selectedPhoto=null;
function showPhoto(shot){selectedPhoto=shot;Garden.mode='preview';el('photo-image').src=shot.url;el('photo-caption').textContent=shot.name+' · '+shot.w+' × '+shot.h;el('preview').hidden=false;el('gallery').hidden=true;}
function miniTool(){return window.xhs&&window.xhs.miniTool;}
async function clientVersion(){const x=window.xhs;if(!x)return null;let options=x.launchOptions;if(!options&&miniTool()&&typeof miniTool().getLaunchOptions==='function')try{options=await miniTool().getLaunchOptions();}catch(e){return null;}const raw=options&&options.miniToolEnv&&options.miniToolEnv.buildVersion;if(!/^[1-9]\d{6,}$/.test(String(raw)))return null;return Math.floor(Number(raw)/1000);}
async function exportPhoto(publish){const shot=selectedPhoto;if(!shot)return;const mt=miniTool();if(!mt){toast('当前是浏览器试玩；在小红书小工具内可以保存相册和发笔记。');return;}const button=el(publish?'publish':'save');button.disabled=true;try{const v=await clientVersion();if(!publish&&(v===null||v<9420))throw new Error('当前客户端尚未确认支持保存相册');const method=publish?'postNote':'saveImageToPhotosAlbum';if(typeof mt[method]!=='function')throw new Error('当前环境暂未提供此能力');let filePath=shot.url;if(typeof mt.writeTempFile==='function'){const result=await mt.writeTempFile({data:shot.url});filePath=result.filePath;if(!filePath)throw new Error('照片临时文件未生成');}
    if(publish){await mt.postNote({title:'在深海花园，留住这一刻',content:'在'+shot.name+'，遇见一片安静的海。',pageType:'photo_publish',mediaInfo:{image_resources:[{url:filePath}]}});toast('已返回笔记发布流程。');}else{await mt.saveImageToPhotosAlbum({filePath});toast('已保存到相册。');}
  }catch(e){toast('未完成：'+(e.errMsg||e.message||'请重试'));}finally{button.disabled=false;}}
function gallery(){lastMode=Garden.mode;lastPaused=Garden.paused;Garden.paused=true;const box=el('gallery-images');box.textContent='';if(!Garden.photos.length){const p=document.createElement('p');p.className='empty';p.textContent='还没有照片。喜欢一个画面时，按下相机。';box.appendChild(p);}else for(const shot of Garden.photos.slice().reverse()){const b=document.createElement('button'),img=document.createElement('img');img.src=shot.url;img.alt=shot.name;b.appendChild(img);b.addEventListener('click',()=>{if(!document.body.classList.contains('photo')){el('photo-ui').hidden=false;document.body.classList.add('photo');layoutFrame();}showPhoto(shot);});box.appendChild(b);}el('gallery').hidden=false;}
function startAudio(){
  if(!audio){const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;try{const ac=new AC(),gain=ac.createGain(),filter=ac.createBiquadFilter(),noise=ac.createBuffer(1,ac.sampleRate*4,ac.sampleRate),data=noise.getChannelData(0),rnd=RNG(44);let b=0;for(let i=0;i<data.length;i++){b=(b+.018*(rnd()*2-1))/1.018;data[i]=b*3;}const source=ac.createBufferSource();source.buffer=noise;source.loop=true;filter.type='lowpass';filter.frequency.value=220;source.connect(filter);filter.connect(gain);gain.connect(ac.destination);gain.gain.value=0;source.start();for(const hz of [73.42,110,164.81]){const osc=ac.createOscillator(),g=ac.createGain();osc.frequency.value=hz;g.gain.value=.025;osc.connect(g);g.connect(gain);osc.start();}audio={ac,gain};}catch(e){console.warn('Audio unavailable',e);return;}}
  muted=false;audio.ac.resume().catch(()=>{});audio.gain.gain.setTargetAtTime(.35,audio.ac.currentTime,.8);el('sound').setAttribute('aria-pressed','true');el('sound').setAttribute('aria-label','关闭声音');
}
function stopAudio(){muted=true;if(audio)audio.gain.gain.setTargetAtTime(0,audio.ac.currentTime,.15);el('sound').setAttribute('aria-pressed','false');el('sound').setAttribute('aria-label','开启声音');}
function bindCanvas(){
  viewCanvas.addEventListener('pointerdown',e=>{if(!Garden.ready||Garden.mode==='preview'||(Garden.paused&&Garden.mode!=='photo')||e.button>0)return;if(Garden.mode==='dive'){mouse.active=true;mouse.last=[e.clientX,e.clientY];viewCanvas.focus();el('pc-hint').textContent='WASD 游动 · 空格上浮 · Q 下潜 · Shift 冲刺 · 鼠标转向 · C 镜头 · P 拍照';return;}drag={id:e.pointerId,x:e.clientX,y:e.clientY};if(viewCanvas.setPointerCapture)viewCanvas.setPointerCapture(e.pointerId);});
  viewCanvas.addEventListener('pointermove',e=>{if(Garden.mode==='dive'){if(!mouse.active)return;if(mouse.last){Garden.diver.targetYaw+=(e.clientX-mouse.last[0])*.0032;Garden.diver.targetPitch=clamp(Garden.diver.targetPitch-(e.clientY-mouse.last[1])*.0028,-.9,.9);}mouse.last=[e.clientX,e.clientY];const r=viewCanvas.getBoundingClientRect(),x=(e.clientX-r.left)/r.width;mouse.edge=x<.08?-(.08-x)/.08:x>.92?(x-.92)/.08:0;return;}if(!drag||e.pointerId!==drag.id)return;const dx=(e.clientX-drag.x)*.0032,dy=(e.clientY-drag.y)*.0032;drag.x=e.clientX;drag.y=e.clientY;if(Garden.mode==='cruise'){look.yaw-=dx;look.pitch=clamp(look.pitch+dy,-.9,.9);}else{Garden.camera.yaw-=dx;Garden.camera.pitch=clamp(Garden.camera.pitch+dy,-1.1,1.1);}});
  viewCanvas.addEventListener('pointerleave',()=>{mouse.last=null;mouse.edge=0;});
  viewCanvas.addEventListener('wheel',e=>{if(Garden.mode==='photo'){e.preventDefault();Garden.camera.fov=clamp(Garden.camera.fov+e.deltaY*.001,.25,1.4);}},{passive:false});
  for(const name of ['pointerup','pointercancel','lostpointercapture'])viewCanvas.addEventListener(name,()=>drag=null);
}
el('enter').addEventListener('click',enter);el('camera').addEventListener('click',enterPhoto);el('photo-back').addEventListener('click',exitPhoto);el('shoot').addEventListener('click',shoot);el('preview-back').addEventListener('click',()=>{Garden.mode='photo';el('preview').hidden=true;});el('resume-photo').addEventListener('click',exitPhoto);el('save').addEventListener('click',()=>exportPhoto(false));el('publish').addEventListener('click',()=>exportPhoto(true));el('album').addEventListener('click',gallery);
el('mode').addEventListener('click',()=>{Garden.paused=false;el('pause').textContent='Ⅱ';setMode(Garden.mode==='manual'?'cruise':'manual');});
el('pause').addEventListener('click',()=>{Garden.paused=!Garden.paused;el('pause').textContent=Garden.paused?'▷':'Ⅱ';el('pause').setAttribute('aria-label',Garden.paused?'继续':'停驻');});
document.querySelectorAll('[data-place]').forEach(b=>b.addEventListener('click',()=>switchPlace(+b.dataset.place)));
document.querySelectorAll('[data-ratio]').forEach(b=>b.addEventListener('click',()=>{photoRatio=+b.dataset.ratio;document.querySelectorAll('[data-ratio]').forEach(x=>x.classList.toggle('on',x===b));layoutFrame();}));
el('settings').addEventListener('click',()=>toggleOptions());
el('view').addEventListener('click',changeView);el('photo-open').addEventListener('click',enterPhoto);el('day').addEventListener('click',changeLight);el('lamp').addEventListener('click',()=>{GardenScene.lamp=!GardenScene.lamp;el('lamp-label').textContent=GardenScene.lamp?'开启':'关闭';});
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.close==='options')toggleOptions(false);else el(b.dataset.close).hidden=true;if(b.dataset.close==='gallery')Garden.paused=lastPaused;}));
el('quality').addEventListener('click',()=>{if(Garden.ready)GardenQuality.cycle();});el('motion').addEventListener('click',()=>{Garden.reduced=!Garden.reduced;el('motion').lastElementChild.textContent=Garden.reduced?'开启':'关闭';});el('center').addEventListener('click',()=>{look.yaw=look.pitch=0;switchPlace(Garden.place);toggleOptions(false);});el('sound').addEventListener('click',()=>muted?startAudio():stopAudio());el('retry').addEventListener('click',()=>location.reload());
const joy=el('joystick');joy.addEventListener('pointerdown',e=>{stick=e.pointerId;joy.setPointerCapture(e.pointerId);});joy.addEventListener('pointermove',e=>{if(e.pointerId!==stick)return;const r=joy.getBoundingClientRect(),dx=e.clientX-r.left-r.width/2,dy=e.clientY-r.top-r.height/2,k=Math.max(29,Math.hypot(dx,dy));stickX=dx/k;stickY=dy/k;joy.firstElementChild.style.transform='translate('+stickX*27+'px,'+stickY*27+'px)';});for(const name of ['pointerup','pointercancel','lostpointercapture'])joy.addEventListener(name,()=>{stick=null;stickX=stickY=0;joy.firstElementChild.style.transform='';});
function releaseControls(){for(const k in keys)keys[k]=false;stickX=stickY=0;drag=null;mouse.active=false;mouse.last=null;mouse.edge=0;el('pc-hint').textContent='点击画面开始 · WASD 游动 · 空格上浮 · Q 下潜 · Shift 冲刺 · 鼠标转向';}
addEventListener('keydown',e=>{keys[e.code]=true;if(mouse.active&&Garden.mode==='dive'&&['KeyW','KeyA','KeyS','KeyD','Space','KeyQ'].includes(e.code))GardenDiver.faceInput(Garden.diver,keys);if(mouse.active&&['KeyW','KeyA','KeyS','KeyD','Space','KeyQ','ShiftLeft','ShiftRight'].includes(e.code))e.preventDefault();if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();if(e.code==='KeyH'&&!e.repeat)el('stats').hidden=!el('stats').hidden;if(!e.repeat&&Garden.mode==='dive'){if(e.code==='KeyC')changeView();if(e.code==='KeyP'){enterPhoto();return;}if(e.code==='KeyL')el('lamp').click();}if(!e.repeat&&Garden.mode==='photo'){if(e.code==='Enter'||e.code==='KeyP')shoot();if(e.code==='KeyR'&&Garden.photoStart)Garden.camera=Object.assign({},Garden.photoStart,{pos:Garden.photoStart.pos.slice()});}if(e.code==='Escape'){if(Garden.mode==='photo'||Garden.mode==='preview')exitPhoto();else toggleOptions();}});addEventListener('keyup',e=>keys[e.code]=false);addEventListener('blur',()=>{releaseControls();if(Garden.ready&&Garden.mode==='dive'&&el('options').hidden)toggleOptions(true);});addEventListener('resize',fit);
document.addEventListener('visibilitychange',()=>{if(document.hidden){Garden.paused=true;releaseControls();if(audio)audio.ac.suspend();}else{lastNow=performance.now();if((Garden.mode==='art'||Garden.mode==='dive')&&el('options').hidden)Garden.paused=false;el('pause').textContent=Garden.paused?'▷':'Ⅱ';if(!muted&&audio)audio.ac.resume().catch(()=>{});}});
async function boot(){try{status('生成海床与光线…',.1);Garden.world=await GardenWorld.build(status);status('编译水体与生物着色器…',.76);const qs=new URLSearchParams(location.search);await GardenRender.init(viewCanvas,Garden.world,qs.get('backend'));viewCanvas=GardenRender.canvas;bindCanvas();resetDiver(0);Garden.reduced=!!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);Garden.ready=true;GardenQuality.auto=qs.get('quality')===null;setLevel(qs.get('quality')===null?0:clamp(+qs.get('quality'),0,2));fit();GardenRender.render(Garden.camera,0,Garden.diver);status('海底已经准备好',1);el('enter').disabled=false;el('enter').textContent='潜入花园';el('backend-label').textContent=GardenRender.g.caps.name+' / Cold Smoke core';document.body.classList.remove('loading');document.body.classList.add('playing');el('run-ui').hidden=false;Garden.mode='dive';requestAnimationFrame(frame);}catch(e){fatal(e);}}
window.__garden={state:Garden,renderer:GardenRender,points:GardenWorld.points};
boot();





