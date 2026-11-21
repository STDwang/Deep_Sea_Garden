// Diving controller and equipment from Deep-Sea-Exploration.
const Diver = (() => {
/*! Adapted from Cold Smoke, Copyright (c) 2026 Huisky. MIT license. See THIRD_PARTY_NOTICES.md. */
// ---------------------------------------------------------------- util: math, hashing, noise (CPU side)
const PI = Math.PI, TAU = Math.PI * 2;
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const sat = x => x < 0 ? 0 : x > 1 ? 1 : x;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: a => Math.hypot(a[0], a[1], a[2]),
  norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  mad: (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s],
};

function meshBuilder() {
  const v = [], idx = [];
  const B = {
    v, idx,
    vert(p, n, a) { v.push(p[0], p[1], p[2], n[0], n[1], n[2], a[0], a[1], a[2], a[3]); return v.length / 10 - 1; },
    quad(a, b, c, d) { idx.push(a, b, c, a, c, d); },
    tri(a, b, c) { idx.push(a, b, c); },
    // swept closed loop: rings[i] = array of [p, n]; connects consecutive rings
    sweep(rings, attr, capStart, capEnd) {
      const m = rings[0].length, base = v.length / 10;
      for (const r of rings) for (const pn of r) B.vert(pn[0], pn[1], attr);
      for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < m; j++) { const a = base + i * m + j, b = base + i * m + (j + 1) % m, c = base + (i + 1) * m + (j + 1) % m, d = base + (i + 1) * m + j; B.quad(a, d, c, b); }
      const cap = (ri, flip, nrm) => { const c0 = [0, 0, 0]; for (const pn of rings[ri]) { c0[0] += pn[0][0] / m; c0[1] += pn[0][1] / m; c0[2] += pn[0][2] / m; } const ci = B.vert(c0, nrm, attr), b0 = v.length / 10; for (const pn of rings[ri]) B.vert(pn[0], nrm, attr); for (let j = 0; j < m; j++) { const a = b0 + j, b = b0 + (j + 1) % m; if (flip) B.tri(ci, b, a); else B.tri(ci, a, b); } };
      if (capStart) cap(0, false, capStart); if (capEnd) cap(rings.length - 1, true, capEnd);
    },
    merge(mesh) { const base = v.length / 10; for (let i = 0; i < mesh.verts.length; i++) v.push(mesh.verts[i]); for (let i = 0; i < mesh.idx.length; i++) idx.push(mesh.idx[i] + base); },
    done() { return { verts: new Float32Array(v), idx: new Uint32Array(idx), nv: v.length / 10, ni: idx.length }; },
  };
  return B;
}
// A bounded, spatially varying flow field + meandering ocean Current Highways (Cold Smoke flow-line equivalent).
// CPU swimming, particle slipstreams, and GPU plants share the exact same analytic modes.
const GardenCurrent={
  seedPhase:[0,0],
  setSeedPhase(px,pz){this.seedPhase[0]=px||0;this.seedPhase[1]=pz||0;},
  sample(p,t){
    const [x,y,z]=p;
    const a=x*.13+z*.09-t*.31,b=z*.21-x*.07+t*.19,e=x*.31+z*.27-t*.47;
    const k=.65+.35*Math.exp(-Math.max(-y,0)*.12);
    return [(.10+.13*Math.sin(a)+.055*Math.cos(b))*k,.018*Math.sin(e*.7),(.035+.105*Math.cos(a*.83)+.07*Math.sin(b))*k];
  },
  // Analytic meandering high-speed current ribbons across the endless sea.
  // Smoothly fades out in the calm central sanctuary (coreDist < 28m) while sweeping invitingly past the outer reef.
  highway(wx,wy,wz){
    const coreFade=smooth(24,46,Math.hypot(wx-4,wz+22));
    if(coreFade<=.001)return {strength:0,dir:[0,0,-1],centerY:0,dist:999,axis:0};
    const px=this.seedPhase[0], pz=this.seedPhase[1];
    // Primary North-South meandering slipstream every 136m
    const cellX=Math.round((wx+px*13)/136)*136-px*13;
    const waveX=Math.sin(wz*.022+px)*22+Math.cos(wz*.011-pz)*11;
    const dX=wx-(cellX+waveX);
    const slopeX=Math.cos(wz*.022+px)*22*.022-Math.sin(wz*.011-pz)*11*.011;
    // Secondary East-West meandering slipstream every 152m
    const cellZ=Math.round((wz+pz*17)/152)*152-pz*17;
    const waveZ=Math.cos(wx*.020+pz)*20+Math.sin(wx*.010+px)*10;
    const dZ=wz-(cellZ+waveZ);
    const slopeZ=-Math.sin(wx*.020+pz)*20*.020+Math.cos(wx*.010+px)*10*.010;

    const useX=Math.abs(dX)<=Math.abs(dZ);
    const horizDist=useX?Math.abs(dX):Math.abs(dZ);
    const groundY=currentBedHeight(wx,wz);
    const centerY=Math.min(-4.2,groundY+4.4+Math.sin((useX?wz:wx)*.035+px)*1.4);
    const vertDist=Math.abs(wy-centerY);
    const tubeDist=Math.hypot(horizDist/5.8,vertDist/3.4);
    const strength=coreFade*(1-smooth(.35,1.25,tubeDist));
    // Direction flows smoothly along the ribbon tangent (alternating lane polarity by cell index)
    let dx,dy,dz;
    if(useX){
      const sign=(Math.round(cellX/136)&1)?1:-1;
      dx=slopeX*sign; dy=Math.cos(wz*.035+px)*.048*sign; dz=1*sign;
    }else{
      const sign=(Math.round(cellZ/152)&1)?1:-1;
      dx=1*sign; dy=Math.cos(wx*.035+px)*.048*sign; dz=slopeZ*sign;
    }
    const dir=v3.norm([dx,dy,dz]);
    return {strength,dir,centerY,dist:horizDist,axis:useX?0:1};
  },
};
// Cold Smoke's actual anatomical body, skeleton and dual-quaternion skinning, adapted to ABZU-inspired
// fluid diving with Current Highway slipstream riding, surface breaching, and dynamic camera breathing.
const GardenDiver=(()=>{
  let sk,bind,rootY,onSplash=null;
  const boneData=new Float32Array(64*8);
  const WATER_SURFACE_Y=0;
  const suit=[.018,.035,.043],trim=[.22,.29,.27],steel=[.29,.33,.32];
  function build(){
    sk=Human.Skeleton.build(Human.measure(DiverHumanMesh.parameters));bind=Human.Skeleton.fk(sk,sk.bones.map(()=>Human.q.id()));rootY=sk.bones[sk.idx.pelvis].J[1];
    const b=meshBuilder(),skin=[],D=DiverHumanMesh,neutral=Human.Skeleton.pose(sk,swimPose(0,0,0));
    for(let i=0;i<D.pos.length/3;i++){
      const p=D.pos.slice(i*3,i*3+3),n=v3.norm(D.normal.slice(i*3,i*3+3)),x=Math.abs(p[0]),y=p[1],front=p[2]>.02;
      let c=suit;if(y>1.51&&front&&x<.075)c=[.24,.13,.085];else if((y>1.12&&y<1.40&&x>.13)||(y>.46&&y<.58&&front))c=[.10,.17,.18];
      b.vert(p,n,[...c,6]);skin.push(...D.bi.slice(i*4,i*4+4),...D.bw.slice(i*4,i*4+4));
    }for(const i of D.idx)b.idx.push(i);
    const localToBind=p=>[-p[0],rootY-p[2],-p[1]];
    function vert(p,n,c,bone,kind=6){let P=localToBind(p),N=[-n[0],-n[2],-n[1]];if(bone===sk.idx.foot_L||bone===sk.idx.foot_R){P=Human.Skeleton.applyInv(neutral,sk,bone,P);N=Human.q.rot(Human.q.conj(neutral.R[bone]),N);}b.vert(P,N,[...c,kind]);const h=bone===sk.idx.thorax_mid?smooth(-.50,-.68,p[2]):0;skin.push(bone,sk.idx.head,0,0,1-h,h,0,0);}
    function ell(p,s,c,bone,kind=6){const start=b.v.length/10,nx=24,ny=14;for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){const a=i/nx*TAU,t=j/ny*PI,n=[Math.sin(t)*Math.cos(a),Math.cos(t),Math.sin(t)*Math.sin(a)];vert(p.map((q,k)=>q+n[k]*s[k]),v3.norm(n.map((q,k)=>q/s[k])),c,bone,kind);}for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const k=start+j*(nx+1)+i;b.tri(k,k+nx+1,k+1);b.tri(k+1,k+nx+1,k+nx+2);}}
    function tube(ps,rs,c,bone,kind=6){const start=b.v.length/10;for(let j=0;j<ps.length;j++){const d=v3.norm(v3.sub(ps[Math.min(j+1,ps.length-1)],ps[Math.max(0,j-1)])),X=v3.norm(v3.cross(d,Math.abs(d[1])>.95?[1,0,0]:[0,1,0])),Y=v3.cross(d,X);for(let i=0;i<=16;i++){const a=i/16*TAU,n=v3.add(v3.mul(X,Math.cos(a)),v3.mul(Y,Math.sin(a)));vert(v3.mad(ps[j],n,rs[j]),n,c,bone,kind);}}for(let j=0;j<ps.length-1;j++)for(let i=0;i<16;i++){const k=start+j*17+i;b.tri(k,k+17,k+1);b.tri(k+1,k+17,k+18);}}
    const head=sk.idx.head,back=sk.idx.thorax_mid,pelvis=sk.idx.pelvis;
    ell([0,.185,-.12],[.24,.10,.36],suit,back);
    tube([[0,.30,-.44],[0,.30,-.40],[0,.30,-.34],[0,.30,.27],[0,.30,.32]], [.035,.095,.112,.112,.075],steel,back,8);
    ell([0,.30,.30],[.105,.105,.06],steel,back,8);
    tube([[0,.30,-.49],[0,.30,-.44]],[.025,.025],[.15,.15,.13],back,8);
    for(const z of [-.25,.14])tube([[0,.30,z-.021],[0,.30,z+.021]],[.118,.118],suit,back);
    for(const s of [-1,1]){tube([[s*.14,.15,-.38],[s*.20,-.02,-.28],[s*.15,-.15,-.12]],[.023,.022,.022],trim,back);ell([s*.13,-.16,.12],[.045,.022,.028],steel,pelvis,8);}
    ell([0,-.11,-.77],[.115,.052,.08],[.035,.047,.04],head);
    for(const s of [-1,1])ell([s*.049,-.155,-.78],[.047,.018,.052],[.018,.074,.080],head,7);
    ell([0,-.13,-.68],[.052,.042,.043],[.035,.043,.038],head);
    tube([[.02,.31,-.48],[.19,.29,-.52],[.24,.13,-.64],[.19,-.10,-.68],[.045,-.13,-.68]],[.013,.013,.014,.014,.015],suit,back);
    for(const s of [-1,1]){
      const side=s<0?'L':'R',foot=sk.idx['foot_'+side],P=neutral.P[foot],anchor=[-P[0],-P[2],rootY-P[1]],x=anchor[0],y=anchor[1]-.025,z=anchor[2]+.06;
      const start=b.v.length/10;for(let j=0;j<=16;j++)for(let i=0;i<=8;i++){const t=j/16,u=i/8*2-1,w=.053+.068*Math.sin(t*PI*.72);vert([x+u*w,y-.065*t*t+.015*u*u,z+t*.56],v3.norm([-.12*u,1,.15*t]),i===0||i===8?[.075,.145,.155]:[.025,.058,.070],foot,6);}for(let j=0;j<16;j++)for(let i=0;i<8;i++){const k=start+j*9+i;b.tri(k,k+9,k+1);b.tri(k+1,k+9,k+10);}
      ell([x,y,z],[.060,.05,.09],suit,foot);
    }
    const m=b.done();m.skin=new Float32Array(skin);return m;
  }
  function swimPose(phase,e,sprintBlend=0){
    const p=Human.restPose();
    p.spine.flex=5+Math.sin(phase*2)*(1.2+e*2.4)-sprintBlend*3.5;
    p.spine.twist=Math.sin(phase)*(1.8+e*3.2);
    p.neck.flex=-50+sprintBlend*10;
    const armElev=lerp(15,8,sprintBlend), armPlane=lerp(30,-22,sprintBlend), armElbow=lerp(118,24,sprintBlend);
    for(const [side,offset] of [['L',0],['R',PI]]){
      const a=phase+offset,q=p['leg_'+side];
      q.flex=4+Math.sin(a)*(2.5+e*12.5);
      q.knee=11+Math.max(Math.sin(a-.52),0)*(5.5+e*20.5);
      q.ankle=24+Math.cos(a-.35)*(4+e*7);
      q.abd=3-sprintBlend*1.2;
      Object.assign(p['arm_'+side],{
        elev:armElev+Math.sin(a*.5+offset)*(1.5+e*1.6),
        plane:armPlane,
        axial:lerp(-30,-10,sprintBlend),
        elbow:armElbow+Math.sin(a*.5)*2.5,
        pron:50,
        grip:lerp(.55,.25,sprintBlend)
      });
    }
    return p;
  }
  function bones(d){
    const xf=Human.Skeleton.pose(sk,swimPose(d.phase,d.effort,Math.max(d.sprintBlend||0,d.streamBoost||0))),dq=Human.Skin.boneDQ(xf,bind).dq;boneData.fill(0);boneData.set(dq);return boneData;
  }
  const CRUISE=3.6,SPRINT=7.4;
  function moveVector(keys,d,analog){
    const an=analog||{};
    const k=keys||{};
    const yaw=d.targetYaw;
    const rawFw=(k.KeyW||k.ArrowUp?1:0)-(k.KeyS||k.ArrowDown?1:0)+(an.fw||0)+(an.autoSwim&&!(k.KeyS||k.ArrowDown)?.85:0);
    const fw=clamp(rawFw,-1,1);
    const lr=clamp((k.KeyD||k.ArrowRight?1:0)-(k.KeyA||k.ArrowLeft?1:0)+(an.lr||0),-1,1);
    const rise=(k.Space||k.KeyE)?1:0;
    const dive=(k.KeyC||k.KeyQ||k.KeyX||k.ControlLeft||k.ControlRight)?1:0;
    const up=clamp(rise-dive+(an.v||0),-1,1);
    // 3D pitch-guided swimming (ABZU / Subnautica / Noniv style): looking down + swimming forward dives naturally!
    // Explicit vertical keys (Space/E/C/Q/X/Ctrl or mobile ↑/↓) cleanly override pitch verticality when pressed.
    const rawPitch=d.targetPitch||0;
    const effPitch=Math.abs(up)<.05&&Math.abs(rawPitch)>.06?(rawPitch-Math.sign(rawPitch)*.06):0;
    const cp=Math.cos(effPitch), sp=Math.sin(effPitch);
    const fx=Math.sin(yaw)*cp, fy=sp, fz=-Math.cos(yaw)*cp;
    const rx=Math.cos(yaw), rz=Math.sin(yaw);
    let x=fx*fw+rx*lr, y=fy*fw+up, z=fz*fw+rz*lr;
    const n=Math.hypot(x,y,z);
    const mag=clamp(Math.hypot(fw,lr,up),0,1);
    if(n>1e-4){x/=n;y/=n;z/=n;}
    return {x,y,z,mag,moving:n>1e-4};
  }
  function create(p,yaw=0,pitch=0){
    return {
      pos:p.slice(),velocity:[0,0,0],yaw,pitch,roll:0,
      goalYaw:yaw,goalPitch:pitch,targetYaw:yaw,targetPitch:pitch,
      phase:0,effort:0,sprint:false,sprintBlend:0,streamBoost:0,
      airborne:false,floorClearance:5.0,speed:0,fovk:0,view:0,zoomDist:3.9
    };
  }
  function faceInput(d,keys,analog){
    const m=moveVector(keys,d,analog);if(!m.moving)return;
    if(Math.hypot(m.x,m.z)>.05)d.goalYaw=Math.atan2(m.x,-m.z);
    d.goalPitch=clamp(Math.atan2(m.y,Math.max(.22,Math.hypot(m.x,m.z))),-.95,.95);
  }
  function step(d,keys,dt,time,ground,obstacles,origin=[0,0,0],dynObstacles=null,analog=null){
    const m=moveVector(keys,d,analog),moving=m.moving;
    const sprint=moving&&!!((keys&&(keys.ShiftLeft||keys.ShiftRight))||(analog&&analog.sprint));d.sprint=sprint;
    d.sprintBlend=(d.sprintBlend||0)+((sprint?1:0)-(d.sprintBlend||0))*(1-Math.exp(-dt*4.5));
    const wx0=d.pos[0]+origin[0], wz0=d.pos[2]+origin[2];

    // Check meandering Current Highway slipstream
    const hw=GardenCurrent.highway?GardenCurrent.highway(wx0,d.pos[1],wz0):{strength:0,dir:[0,0,-1]};
    const hwTarget=d.airborne?0:hw.strength;
    d.streamBoost=(d.streamBoost||0)+(hwTarget-(d.streamBoost||0))*(1-Math.exp(-dt*3.8));

    if(d.airborne){
      // Ballistic dolphin-arc leap above the ocean surface
      d.velocity[1]-=12.4*dt;
      d.velocity[0]*=Math.exp(-dt*.18);
      d.velocity[2]*=Math.exp(-dt*.18);
      d.pos=d.pos.map((q,k)=>q+d.velocity[k]*dt);
      const hSpd=Math.hypot(d.velocity[0],d.velocity[2]);
      if(hSpd>.2){
        d.goalYaw=Math.atan2(d.velocity[0],-d.velocity[2]);
        d.goalPitch=clamp(Math.atan2(d.velocity[1],hSpd),-.92,.92);
      }
      const turn=Math.atan2(Math.sin(d.goalYaw-d.yaw),Math.cos(d.goalYaw-d.yaw));
      d.yaw+=turn*(1-Math.exp(-dt*5));
      d.pitch+=(d.goalPitch-d.pitch)*(1-Math.exp(-dt*6));
      d.roll=(d.roll||0)*Math.exp(-dt*4);
      if(d.pos[1]<=WATER_SURFACE_Y&&d.velocity[1]<0){
        d.airborne=false;
        d.velocity[1]*=.62;
        if(onSplash)onSplash(clamp(Math.abs(d.velocity[1])/6.5,.45,1.0),d.pos.slice());
      }
    }else{
      if(moving){
        if(Math.hypot(m.x,m.z)>.05)d.goalYaw=Math.atan2(m.x,-m.z);
        d.goalPitch=clamp(Math.atan2(m.y,Math.max(.22,Math.hypot(m.x,m.z))),-.95,.95);
      }else if(d.streamBoost>.35){
        // Gently align body along current highway when coasting inside it
        d.goalYaw=Math.atan2(hw.dir[0],-hw.dir[2]);
        d.goalPitch=clamp(Math.asin(clamp(hw.dir[1],-.8,.8)),-.5,.5);
      }
      const heading=d.goalYaw,pitch=d.goalPitch;
      const turn=Math.atan2(Math.sin(heading-d.yaw),Math.cos(heading-d.yaw)),turnK=1-Math.exp(-dt*5.5);
      d.yaw+=turn*turnK;
      d.pitch+=(pitch-d.pitch)*turnK;
      const rollTarget=clamp(-turn*(moving?.65:.30),-.52,.52)+Math.sin(d.phase)*.045*(.4+d.effort*.5);
      d.roll=(d.roll||0)+(rollTarget-(d.roll||0))*(1-Math.exp(-dt*6.0));
      const align=.55+.45*Math.max(0,Math.cos(turn));
      const baseSpeed=(sprint?SPRINT:CRUISE)*align*(m.mag||1);
      const flow=GardenCurrent.sample([wx0,d.pos[1],wz0],time);
      // High-speed Current Highway slipstream propulsion (up to +5.8 m/s along ribbon)
      const hwSpeed=d.streamBoost*(sprint?6.2:4.6);
      const desired=[
        m.x*baseSpeed+flow[0]*.24+hw.dir[0]*hwSpeed,
        m.y*baseSpeed+flow[1]*.20+hw.dir[1]*hwSpeed,
        m.z*baseSpeed+flow[2]*.24+hw.dir[2]*hwSpeed
      ];
      const blend=1-Math.exp(-dt*(sprint||d.streamBoost>.3?5.8:4.4));
      d.velocity=d.velocity.map((q,k)=>q+(desired[k]-q)*blend);
      d.pos=d.pos.map((q,k)=>q+d.velocity[k]*dt);

      // Surface breach launch when sprinting or riding a highway upward through the waves!
      if(d.pos[1]>WATER_SURFACE_Y-.42&&(sprint||d.streamBoost>.32)&&d.velocity[1]>2.1){
        d.airborne=true;
        d.pos[1]=WATER_SURFACE_Y+.15;
        d.velocity[1]=Math.max(d.velocity[1]*1.28,7.4);
        d.velocity[0]*=1.12;
        d.velocity[2]*=1.12;
        if(onSplash)onSplash(.85,d.pos.slice());
      }
    }

    const wx=d.pos[0]+origin[0], wz=d.pos[2]+origin[2];
    const floorY=ground(wx,wz);
    d.floorClearance=Math.max(0,d.pos[1]-floorY);
    if(!d.airborne){
      d.pos[1]=clamp(d.pos[1],floorY+1.05,WATER_SURFACE_Y-.35);
    }else{
      d.pos[1]=clamp(d.pos[1],floorY+1.05,WATER_SURFACE_Y+8.0);
    }

    const resolve=(list)=>{
      if(!list)return;
      for(const o of list){
        const ox=o.x-origin[0],oz=o.z-origin[2];
        const dx=d.pos[0]-ox,dz=d.pos[2]-oz,R=o.r+.6;
        const distanceSquared=dx*dx+dz*dz;
        if(distanceSquared<R*R){
          const L=Math.sqrt(distanceSquared);
          const x=L>1e-6?dx/L:1,z=L>1e-6?dz/L:0;
          d.pos[0]=ox+x*R;d.pos[2]=oz+z*R;
          const dot=d.velocity[0]*x+d.velocity[2]*z;
          if(dot<0){d.velocity[0]-=dot*x;d.velocity[2]-=dot*z;}
        }
      }
    };
    resolve(obstacles);
    resolve(dynObstacles);
    d.speed=Math.hypot(...d.velocity);
    const effortTarget=d.airborne?.25:(moving?(sprint?1.85:Math.min(1.08,.55+d.streamBoost*.45)):d.streamBoost*.8);
    d.effort+=(effortTarget-d.effort)*(1-Math.exp(-dt*3.8));
    d.phase+=dt*(.55+d.effort*3.6);
    // Adapt the ski camera speed envelope to the diver's cruise and current speeds.
    const speedFraction=clamp((d.speed-CRUISE)/(SPRINT+4.6-CRUISE),0,1);
    const lensSpeed=speedFraction*speedFraction*(3-2*speedFraction);
    const fovTarget=.30*lensSpeed+(d.airborne?.10:0);
    d.fovk+=(fovTarget-d.fovk)*(1-Math.exp(-dt*3.4));
  }
  function camera(d,cam,dt,ground,obstacles,origin=[0,0,0],dynObstacles=null){
    const f=[Math.sin(d.targetYaw)*Math.cos(d.targetPitch),Math.sin(d.targetPitch),-Math.cos(d.targetYaw)*Math.cos(d.targetPitch)];
    const pull=(d.sprintBlend||0)*.55+(d.streamBoost||0)*.65+(d.airborne?.45:0);
    const baseDist=d.view===2?6.2:(d.zoomDist||3.9);
    const distance=baseDist+pull,first=d.view===1;
    const target=v3.mad(d.pos,f,first?4:1.15);
    let eye=first?v3.add(d.pos,[f[0]*.55,.10+f[1]*.55,f[2]*.55]):v3.add(v3.mad(d.pos,f,-distance),[0,.85,0]);
    const a=dt?1-Math.exp(-dt*4.8):1;
    cam.pos=cam.pos.map((q,k)=>q+(eye[k]-q)*a);
    const avoid=(list)=>{
      if(first||!list)return;
      for(const o of list){
        const ox=o.x-origin[0],oz=o.z-origin[2];
        const dx=cam.pos[0]-ox,dz=cam.pos[2]-oz,R=o.r+.55;
        const distanceSquared=dx*dx+dz*dz;
        if(distanceSquared<R*R){
          const L=Math.sqrt(distanceSquared);
          cam.pos[0]=ox+(L>1e-5?dx/L:1)*R;
          cam.pos[2]=oz+(L>1e-5?dz/L:0)*R;
        }
      }
    };
    avoid(obstacles);
    avoid(dynObstacles);
    cam.pos[1]=Math.max(cam.pos[1],ground(cam.pos[0]+origin[0],cam.pos[2]+origin[2])+.65);
    const v=v3.sub(target,cam.pos);
    cam.yaw=Math.atan2(v[0],-v[2]);
    cam.pitch=Math.atan2(v[1],Math.hypot(v[0],v[2]));
    cam.fov=(first?1.12:.99)+d.fovk;
    cam.first=first;
  }
  return {
    build,create,step,camera,bones,faceInput,
    setSplashHook(fn){onSplash=fn;},
    WATER_SURFACE_Y,
    get rootY(){return rootY;}
  };
})();

function RNG(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function LiveRing(N, stride) {
  const L = { N, n: 0 };
  L.put = () => { if (L.n < L.N) L.n++; };                       // after each record written
  L.clear = () => { L.n = 0; };
  // drop from the old end what has died by `now` (the time the shaders get, U.camPos.w); head = the next slot to be written
  L.trim = function (cpu, head, now) {
    while (L.n > 0) {
      const o = (((head - L.n) % N + N) % N) * stride, t0 = cpu[o + 3];
      if (now - t0 < cpu[o + 10] && t0 - now < 60) break;          // (still alive, or yet to be thrown; a record far in the future is a stale clock)
      L.n--;
    }
  };
  // f(first, count) for each span to draw
  L.spans = function (head, f) {
    const n = L.n; if (!n) return;
    const s = ((head - n) % N + N) % N;
    if (s + n <= N) f(s, n); else { f(s, N - s); f(0, n - (N - s)); }
  };
  return L;
}
// Cold Smoke LiveRing unified underwater particle system:
// kind 0 = regulator / vent bubbles, kind 1 = seabed sand puffs,
// kind 2 = glowing Current Highway slipstream streaks, kind 3 = surface breach splash droplets.
const GardenBubbles=(()=>{
  const N=420,stride=12,data=new Float32Array(N*stride),live=LiveRing(N,stride),rnd=RNG(810);
  let head=0,last=0,next=0,ventNext=0,sandNext=0,hwNext=0,onExhale=null;
  // New particles occupy consecutive slots, including across circular-buffer wrap.
  const pending=LiveRing(N,stride);
  function emit(p,t,vx,vy,vz,radius,life,kind=0){
    const o=head*stride;
    data.set([p[0],p[1],p[2],t,vx,vy,vz,radius,rnd()*TAU,0,life,kind],o);
    head=(head+1)%N;
    live.put();
    pending.put();
  }
  function rebase(dx,dz){
    pending.n=N;
    for(let i=0;i<N;i++){
      const o=i*stride;
      data[o]-=dx;
      data[o+2]-=dz;
    }
  }
  function burst(pos,kind,count,speed,t){
    for(let i=0;i<count;i++){
      const a=rnd()*TAU, el=(rnd()-.2)*1.2;
      const vx=Math.cos(a)*Math.cos(el)*speed*(.4+rnd()*.8);
      const vy=(kind===3?.8+rnd()*2.2:.4+rnd()*1.3)*speed*.45;
      const vz=Math.sin(a)*Math.cos(el)*speed*(.4+rnd()*.8);
      const rad=kind===3?(.025+rnd()*.045):(.018+rnd()*.026);
      const life=kind===3?(1.1+rnd()*.7):(2.6+rnd()*1.4);
      emit([pos[0]+(rnd()-.5)*.6,pos[1]+(rnd()-.5)*.3,pos[2]+(rnd()-.5)*.6],t,vx,vy,vz,rad,life,kind);
    }
  }
  return {
    data,live,rebase,burst,
    upload(queue,buffer){
      pending.spans(head,(first,count)=>{
        const offset=first*stride;
        queue.writeBuffer(buffer,offset*data.BYTES_PER_ELEMENT,data,offset,count*stride);
      });
      pending.clear();
    },
    get head(){return head;},
    setExhaleHook(fn){onExhale=fn;},
    update(d,t,cam,origin=[0,0,0]){
      if(t<last||t-last>2){live.clear();next=t;ventNext=t;sandNext=t;hwNext=t;}
      last=t;
      live.trim(data,head,t);
      if(d&&!d.airborne){
        const sp=!!d.sprint||(d.streamBoost||0)>.35,per=sp?1.1:4.4,ph=t%per,win=sp?(ph<.98):(ph>1.1&&ph<2.7);
        const f=[Math.sin(d.yaw)*Math.cos(d.pitch),Math.sin(d.pitch),-Math.cos(d.yaw)*Math.cos(d.pitch)];
        const r=[Math.cos(d.yaw),0,Math.sin(d.yaw)];
        if(win&&t>=next){
          next=t+(sp?.036:.10);
          if(sp){
            for(const side of [-1,1]){
              const p=v3.add(v3.mad(d.pos,f,-.68),[r[0]*side*.18+(rnd()-.5)*.14,(rnd()-.5)*.16,r[2]*side*.18+(rnd()-.5)*.14]);
              const flow=GardenCurrent.sample([p[0]+origin[0],p[1],p[2]+origin[2]],t);
              emit(p,t,flow[0]*.45-f[0]*.15,.48+rnd()*.18,flow[2]*.45-f[2]*.15,.007+rnd()*.011,2.3+rnd()*.6,(d.streamBoost||0)>.35?2:0);
            }
            if(onExhale&&rnd()<.35)onExhale(true);
          }else{
            const p=v3.add(v3.mad(d.pos,f,.67),[0,-.07,0]);
            const flow=GardenCurrent.sample([p[0]+origin[0],p[1],p[2]+origin[2]],t);
            emit(p,t,flow[0]*.5,.24+rnd()*.13,flow[2]*.5,.010+rnd()*.015,4.2+rnd()*.8,0);
            if(onExhale)onExhale(false);
          }
        }
        // Tactile seabed sand kick-up clouds when swimming fast close to the sand (< 2.2m)
        if(d.speed>1.9&&t>=sandNext){
          sandNext=t+(sp?.055:.11);
          const wx=d.pos[0]+origin[0], wz=d.pos[2]+origin[2];
          const sy=currentBedHeight(wx,wz)+.16;
          const clearance=d.pos[1]-sy;
          if(clearance>=0 && clearance<2.2) for(let k=0;k<2;k++){
            const p=[d.pos[0]-f[0]*.75+(rnd()-.5)*.55,sy,d.pos[2]-f[2]*.75+(rnd()-.5)*.55];
            emit(p,t,-f[0]*.35+(rnd()-.5)*.35,.12+rnd()*.14,-f[2]*.35+(rnd()-.5)*.35,.065+rnd()*.055,2.4+rnd()*1.1,1);
          }
        }
      }
      // Visible glowing slipstream current streaks along nearby Current Highways
      const ref=cam?cam.pos:(d?d.pos:null);
      if(ref&&GardenCurrent.highway&&t>=hwNext){
        hwNext=t+.055;
        for(let s=0;s<3;s++){
          const rx=ref[0]+(rnd()-.5)*46, rz=ref[2]+(rnd()-.5)*46;
          const wx=rx+origin[0], wz=rz+origin[2];
          const hw=GardenCurrent.highway(wx,ref[1],wz);
          if(hw.strength>.12){
            const py=hw.centerY+(rnd()-.5)*3.4;
            const spd=3.8+hw.strength*4.5;
            emit([rx,py,rz],t,hw.dir[0]*spd,hw.dir[1]*spd,hw.dir[2]*spd,.022+rnd()*.020,2.2+rnd()*.9,2);
          }
        }
      }
    }
  };
})();

// rootY is initialized in build(); preserve its live getter.
return Object.assign(GardenDiver, { particles: GardenBubbles });
})();
