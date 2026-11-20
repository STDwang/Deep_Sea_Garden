// Cold Smoke's actual anatomical body, skeleton and dual-quaternion skinning, adapted to diving.
const GardenDiver=(()=>{
  let sk,bind,rootY;const boneData=new Float32Array(64*8);
  const suit=[.018,.035,.043],trim=[.22,.29,.27],steel=[.29,.33,.32];
  function build(){
    sk=Human.Skeleton.build(Human.measure(DiverHumanMesh.parameters));bind=Human.Skeleton.fk(sk,sk.bones.map(()=>Human.q.id()));rootY=sk.bones[sk.idx.pelvis].J[1];
    const b=meshBuilder(),skin=[],D=DiverHumanMesh,neutral=Human.Skeleton.pose(sk,swimPose(0,0));
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
    // A neutral steel cylinder, rounded shoulders, valve and a separate BCD vest.
    ell([0,.185,-.12],[.24,.10,.36],suit,back);
    tube([[0,.30,-.44],[0,.30,-.40],[0,.30,-.34],[0,.30,.27],[0,.30,.32]], [.035,.095,.112,.112,.075],steel,back,8);
    ell([0,.30,.30],[.105,.105,.06],steel,back,8);
    tube([[0,.30,-.49],[0,.30,-.44]],[.025,.025],[.15,.15,.13],back,8);
    for(const z of [-.25,.14])tube([[0,.30,z-.021],[0,.30,z+.021]],[.118,.118],suit,back);
    for(const s of [-1,1]){tube([[s*.14,.15,-.38],[s*.20,-.02,-.28],[s*.15,-.15,-.12]],[.023,.022,.022],trim,back);ell([s*.13,-.16,.12],[.045,.022,.028],steel,pelvis,8);}
    // Mask skirt and two dark glass lenses, a regulator and its curved hose.
    ell([0,-.11,-.77],[.115,.052,.08],[.035,.047,.04],head);
    for(const s of [-1,1])ell([s*.049,-.155,-.78],[.047,.018,.052],[.018,.074,.080],head,7);
    ell([0,-.13,-.68],[.052,.042,.043],[.035,.043,.038],head);
    tube([[.02,.31,-.48],[.19,.29,-.52],[.24,.13,-.64],[.19,-.10,-.68],[.045,-.13,-.68]],[.013,.013,.014,.014,.015],suit,back);
    for(const s of [-1,1]){
      const side=s<0?'L':'R',foot=sk.idx['foot_'+side],P=neutral.P[foot],anchor=[-P[0],-P[2],rootY-P[1]],x=anchor[0],y=anchor[1]-.025,z=anchor[2]+.06;
      const start=b.v.length/10;for(let j=0;j<=16;j++)for(let i=0;i<=8;i++){const t=j/16,u=i/8*2-1,w=.053+.065*Math.sin(t*PI*.72);vert([x+u*w,y-.065*t*t+.015*u*u,z+t*.53],v3.norm([-.12*u,1,.15*t]),i===0||i===8?[.12,.17,.17]:[.065,.13,.15],foot,6);}for(let j=0;j<16;j++)for(let i=0;i<8;i++){const k=start+j*9+i;b.tri(k,k+9,k+1);b.tri(k+1,k+9,k+10);}
      ell([x,y,z],[.060,.05,.09],suit,foot);
    }
    const m=b.done();m.skin=new Float32Array(skin);return m;
  }
  function swimPose(phase,e){
    const p=Human.restPose();
    p.spine.flex=5;p.neck.flex=-50;
    for(const [side,offset] of [['L',0],['R',PI]]){const a=phase+offset,q=p['leg_'+side];q.flex=4+Math.sin(a)*(2+e*10);q.knee=12+Math.max(Math.sin(a-.55),0)*(5+e*17);q.ankle=22;q.abd=3;
      Object.assign(p['arm_'+side],{elev:15,plane:30,axial:-30,elbow:120+Math.sin(a*.5)*2,pron:50,grip:.55});}return p;
  }
  function bones(d){
    const xf=Human.Skeleton.pose(sk,swimPose(d.phase,d.effort)),dq=Human.Skin.boneDQ(xf,bind).dq;boneData.fill(0);boneData.set(dq);return boneData;
  }
  // ABZU-style swim: WASD steers on the horizontal plane (yaw only), Space rises straight up,
  // Q / Ctrl sinks. W+Space therefore composes into a forward-and-up diagonal automatically.
  // Mouse pitch only aims the camera; the body banks toward the actual travel vector.
  const CRUISE=3.0,SPRINT=6.4;
  function moveVector(keys,d){
    const yaw=d.targetYaw,fx=Math.sin(yaw),fz=-Math.cos(yaw),rx=Math.cos(yaw),rz=Math.sin(yaw);
    const fw=(keys.KeyW?1:0)-(keys.KeyS?1:0),lr=(keys.KeyD?1:0)-(keys.KeyA?1:0),up=(keys.Space?1:0)-((keys.KeyQ||keys.ControlLeft||keys.ControlRight)?1:0);
    let x=fx*fw+rx*lr,z=fz*fw+rz*lr,y=up;const n=Math.hypot(x,y,z);
    if(n>1e-4){x/=n;y/=n;z/=n;}return {x,y,z,moving:n>1e-4};
  }
  function create(p,yaw=0,pitch=0){return {pos:p.slice(),velocity:[0,0,0],yaw,pitch,goalYaw:yaw,goalPitch:pitch,targetYaw:yaw,targetPitch:pitch,phase:0,effort:0,sprint:false,fovk:0,view:0};}
  function faceInput(d,keys){const m=moveVector(keys,d);if(!m.moving)return;if(Math.hypot(m.x,m.z)>.05)d.goalYaw=Math.atan2(m.x,-m.z);d.goalPitch=clamp(Math.atan2(m.y,Math.hypot(m.x,m.z)),-.95,.95);}
  function step(d,keys,dt,time,ground,obstacles){
    const m=moveVector(keys,d),moving=m.moving;
    const sprint=moving&&!!(keys.ShiftLeft||keys.ShiftRight);d.sprint=sprint;
    if(moving){if(Math.hypot(m.x,m.z)>.05)d.goalYaw=Math.atan2(m.x,-m.z);d.goalPitch=clamp(Math.atan2(m.y,Math.hypot(m.x,m.z)),-.95,.95);}
    const heading=d.goalYaw,pitch=d.goalPitch;
    // Snappier turn-in, but never bleed all forward drive mid-corner (the old sticky feeling).
    const turn=Math.atan2(Math.sin(heading-d.yaw),Math.cos(heading-d.yaw)),turnK=1-Math.exp(-dt*5.2);d.yaw+=turn*turnK;d.pitch+=(pitch-d.pitch)*turnK;
    const align=.55+.45*Math.max(0,Math.cos(turn)),speed=(sprint?SPRINT:CRUISE)*align,flow=GardenCurrent.sample(d.pos,time);
    const desired=[m.x*speed+flow[0]*.24,m.y*speed+flow[1]*.20,m.z*speed+flow[2]*.24],blend=1-Math.exp(-dt*(sprint?5.5:4.2));
    d.velocity=d.velocity.map((q,k)=>q+(desired[k]-q)*blend);d.pos=d.pos.map((q,k)=>q+d.velocity[k]*dt);d.pos[0]=clamp(d.pos[0],-8000,8000);d.pos[2]=clamp(d.pos[2],-8000,8000);d.pos[1]=clamp(d.pos[1],ground(d.pos[0],d.pos[2])+1.05,ground(d.pos[0],d.pos[2])+26.0);
    for(const o of obstacles){const dx=d.pos[0]-o.x,dz=d.pos[2]-o.z,L=Math.hypot(dx,dz),R=o.r+.6;if(L<R){const x=L>1e-6?dx/L:1,z=L>1e-6?dz/L:0;d.pos[0]=o.x+x*R;d.pos[2]=o.z+z*R;const dot=d.velocity[0]*x+d.velocity[2]*z;if(dot<0){d.velocity[0]-=dot*x;d.velocity[2]-=dot*z;}}}
    const effortTarget=moving?(sprint?1.75:Math.min(1.05,.55+align*.5)):0;d.effort+=(effortTarget-d.effort)*(1-Math.exp(-dt*3.4));d.phase+=dt*(.55+d.effort*3.4);
    d.fovk+=((sprint?.14:0)-d.fovk)*(1-Math.exp(-dt*3));
  }
  function camera(d,cam,dt){
    const f=[Math.sin(d.targetYaw)*Math.cos(d.targetPitch),Math.sin(d.targetPitch),-Math.cos(d.targetYaw)*Math.cos(d.targetPitch)],distance=d.view===2?5.7:3.6,first=d.view===1,target=v3.mad(d.pos,f,first?4:1.0),eye=first?v3.add(d.pos,[f[0]*.55,.10+f[1]*.55,f[2]*.55]):v3.add(v3.mad(d.pos,f,-distance),[0,.85,0]),a=dt?1-Math.exp(-dt*4):1;
    cam.pos=cam.pos.map((q,k)=>q+(eye[k]-q)*a);cam.pos[1]=Math.max(cam.pos[1],GardenWorld.height(cam.pos[0],cam.pos[2])+.6);const v=v3.sub(target,cam.pos);cam.yaw=Math.atan2(v[0],-v[2]);cam.pitch=Math.atan2(v[1],Math.hypot(v[0],v[2]));cam.fov=(first?1.12:.99)+d.fovk;cam.first=first;
  }
  return {build,create,step,camera,bones,faceInput,get rootY(){return rootY;}};
})();
