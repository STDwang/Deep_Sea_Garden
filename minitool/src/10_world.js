// Underwater content built with Cold Smoke's meshBuilder, SDF mesher and seeded math.
const GardenWorld = (() => {
  let leafRecords=[];
  const points=[
    {name:'光隙海藻林',line:'阳光在海藻之间，慢慢落下来。',pos:[0,.3,13],at:[0,.2,-9]},
    {name:'鲸尾静庭',line:'在鲸尾下，等一群鱼经过。',pos:[1,.3,-16],at:[-3,.1,-29]},
    {name:'微光珊瑚湾',line:'再往深处，是一片柔和的紫。',pos:[16,-.1,-25],at:[24,-1,-37]}
  ];
  // Procedural seabed (the "noise makes terrain" rule from the making-of):
  // domain-warped fBm base + ridged reef spines + a meandering trench + a raised shelf + sand ripples.
  // The central swim corridor is flattened so cruising stays smooth; a soft tanh clamp keeps the diver clear of the floor.
  const height=(x,z)=>{
    const wx=x+fbm2(x*.04+31.7,z*.04-11.3,2,91)*3.0;
    const wz=z+fbm2(x*.04-7.9,z*.04+23.1,2,92)*3.0;
    let h=-5.4+fbm2(wx*.06,wz*.06,4,47)*2.0;
    const ridge=1-Math.abs(fbm2(wx*.11,wz*.11,4,133));
    h+=Math.pow(sat(ridge),3.0)*3.0;
    const cx=-13+Math.sin(wz*.07)*3.5;
    h-=Math.exp(-Math.pow((wx-cx)/5.5,2))*3.4;
    const shelf=smooth(0.30,0.75,fbm2(wx*.05+8,wz*.05-4,3,211));
    h+=shelf*2.2*smooth(8,20,wx)*smooth(20,34,-wz);
    h+=Math.sin(wx*.62+wz*.28+fbm2(wx*.2,wz*.2,2,7)*2.0)*.13;
    const corridor=smooth(3.0,10.0,Math.abs(x));
    h=-5.4+(h+5.4)*(.30+.70*corridor);
    return -6.3+3.8*Math.tanh((h+6.3)/3.8);
  };
  function grid(b,nx,ny,fn){const start=b.v.length/10;for(let y=0;y<=ny;y++)for(let x=0;x<=nx;x++)fn(x/nx,y/ny);for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const a=start+y*(nx+1)+x;b.tri(a,a+nx+1,a+1);b.tri(a+1,a+nx+1,a+nx+2);}}
  // A single local patch whose vertices are just offsets from a moving anchor; the GPU evaluates
  // the analytic height() at world coords, so this patch can follow the diver forever (endless floor).
  const FLOOR_HALF=112, FLOOR_N=140;
  function floorPatch(){const b=meshBuilder();grid(b,FLOOR_N,FLOOR_N,(u,v)=>{b.vert([(u-.5)*2*FLOOR_HALF,0,(v-.5)*2*FLOOR_HALF],[0,1,0],[.38,.34,.20,0]);});return b.done();}
  function tube(b,ps,rs,c,kind=0,sides=6,root=-5){
    grid(b,sides,ps.length-1,(u,v)=>{const i=Math.round(v*(ps.length-1)),p=ps[i],d=v3.norm(v3.sub(ps[Math.min(ps.length-1,i+1)],ps[Math.max(0,i-1)])),r=v3.norm(v3.cross(d,Math.abs(d[1])>.95?[1,0,0]:[0,1,0])),up=v3.cross(r,d),a=u*TAU,n=v3.add(v3.mul(r,Math.cos(a)),v3.mul(up,Math.sin(a)));b.vert(v3.mad(p,n,rs[i]),n,[...c,kind+(kind===1?Math.max(0,p[1]-root)/100:0)]);});
  }
  function sphere(b,p,s,c,kind=0,nx=16,ny=10){grid(b,nx,ny,(u,v)=>{const a=u*TAU,t=v*PI,n=[Math.sin(t)*Math.cos(a),Math.cos(t),Math.sin(t)*Math.sin(a)];b.vert(p.map((x,k)=>x+n[k]*s[k]),v3.norm(n.map((x,k)=>x/s[k])),[...c,kind]);});}
  function kelp(b,x,z,h,rnd){
    const y=height(x,z),phase=rnd()*TAU,lean=rnd()*1.4-.7,strands=2+(rnd()<.35?1:0),near=Math.abs(x)<11&&z>-30;
    const spine=(s,t)=>{const a=phase+s*TAU/strands+t*2.8;return [x+Math.cos(a)*(.22-t*.12)+lean*t+Math.sin(t*3+phase)*t*.35,y+t*h,z+Math.sin(a)*(.22-t*.12)+Math.cos(t*3+phase)*t*.35];};
    for(let s=0;s<strands;s++){const ps=[],rs=[];for(let j=0;j<=12;j++){ps.push(spine(s,j/12));rs.push(.022*(1-j/15));}tube(b,ps,rs,[phase,.24,.07],1,5,y);}
    const color=[.10+rnd()*.12,.21+rnd()*.12,.055+rnd()*.065],count=Math.round(h*(near?25:13));
    for(let j=0;j<count;j++){const t=Math.pow(rnd(),.9),p=spine(Math.floor(rnd()*strands),t),L=(.42+.85*rnd()*rnd())*(1-.3*t),yaw=rnd()*TAU,tilt=.25+rnd()*.65,w=L*(.10+rnd()*.08),c=color.map(v=>v*(.78+rnd()*.42));leafRecords.push(...p,L,yaw,tilt,y,phase,...c,w);}
  }
  function leafMesh(){const b=meshBuilder();grid(b,2,6,(u,v)=>{const edge=u*2-1;b.vert([edge*Math.pow(Math.sin(v*PI),.8),.12*Math.sin(v*PI)-v*v*.36-Math.abs(edge)*.07,v],v3.norm([edge*.38,1,.28*v]),[1,1,1,1]);});return b.done();}
  function coral(b,x,z,h,c,rnd){
    function branch(p,L,r,a,depth){const q=[p[0]+Math.cos(a)*L*.4,p[1]+L,p[2]+Math.sin(a)*L*.35],mid=v3.lerp(p,q,.5);tube(b,[p,mid,q],[r,r*.7,r*.3],c,5,6);if(depth)for(let j=0;j<3;j++)branch(q,L*(.49+rnd()*.12),r*.53,a+(j-1)*1.3,depth-1);}
    branch([x,height(x,z)-.08,z],h,.085*h,rnd()*TAU,2);
  }
  function seaFan(b,x,z,h,c,rnd){
    const yaw=rnd()*TAU,base=[x,height(x,z)-.05,z];
    function twig(p,L,r,angle,depth){const a=angle+(rnd()-.5)*.09,q=[p[0]+Math.cos(yaw)*Math.sin(a)*L,p[1]+Math.cos(a)*L,p[2]+Math.sin(yaw)*Math.sin(a)*L],mid=v3.lerp(p,q,.5);mid[2]+=.025*Math.sin(depth);tube(b,[p,mid,q],[r,r*.75,r*.42],c.map(v=>v*(1+(4-depth)*.045)),5,5);if(depth>0){twig(q,L*(.64+rnd()*.06),r*.64,a-.43-rnd()*.09,depth-1);twig(q,L*(.64+rnd()*.06),r*.64,a+.43+rnd()*.09,depth-1);}}
    twig(base,h*.48,.043*h,0,4);
  }
  function sponge(b,x,z,h,r,c){const y=height(x,z);grid(b,20,14,(u,v)=>{const a=u*TAU,inner=v>.82,t=inner?1-(v-.82)*3.5:v/.82,R=r*(.45+.55*Math.pow(t,.8))*(inner?.76:1)*(1+.08*Math.sin(a*7+t*4));const lip=1+.025*Math.sin(a*5)+.016*Math.sin(a*9);b.vert([x+R*Math.cos(a)+t*.10,y+h*t*lip,z+R*Math.sin(a)],v3.norm([Math.cos(a)*(inner?-1:1),-.14,Math.sin(a)*(inner?-1:1)]),[...c.map(x=>x*(inner?.25:.72+.28*t)),5]);});}
  function reef(b,x,z,size,c,rnd){
    const y=height(x,z),phase=rnd()*TAU;
    // Encrusted foundation and overlapping scalloped shelves, rather than isolated branches.
    sphere(b,[x,y+.08,z],[size*.75,size*.3,size*.62],c.map(v=>v*.50),5,20,12);
    for(let j=0;j<5;j++){
      const a=j*2.4+phase,r=size*(.55+rnd()*.36),px=x+Math.cos(a)*size*.28,pz=z+Math.sin(a)*size*.28,py=y+.15+j*size*.16;
      grid(b,36,7,(u,v)=>{const t=u*TAU,R=r*v*(1+.075*Math.sin(t*7+phase)+.035*Math.sin(t*13)),cup=.16*v*v+.018*Math.sin(v*35+t*3);b.vert([px+Math.cos(t)*R,py+cup*size+Math.cos(t)*v*.07,pz+Math.sin(t)*R],v3.norm([-.18*Math.cos(t),1,-.18*Math.sin(t)]),[...c.map((q,k)=>q*(.76+.24*v)*(k===0?1+j*.025:1)),5]);});
    }
    for(let j=0;j<7;j++){const a=rnd()*TAU,r=rnd()*size*.7,s=size*(.12+rnd()*.13);sphere(b,[x+Math.cos(a)*r,y+.16,z+Math.sin(a)*r],[s,s*.75,s],c.map(v=>v*.80),5,12,8);}
  }
  function transform(mesh,p,s,c){const b=meshBuilder();for(let i=0;i<mesh.nv;i++){const k=i*10,n=v3.norm([mesh.verts[k+3]/s[0],mesh.verts[k+4]/s[1],mesh.verts[k+5]/s[2]]);b.vert([p[0]+mesh.verts[k]*s[0],p[1]+mesh.verts[k+1]*s[1],p[2]+mesh.verts[k+2]*s[2]],n,[...c,0]);}b.idx.push(...mesh.idx);return b.done();}
  function arch(b,center,r,thick,color){
    grid(b,48,12,(u,v)=>{const a=u*TAU,t=v*TAU,k=r+thick*Math.cos(t),n=[Math.cos(a)*Math.cos(t),Math.sin(a)*Math.cos(t),Math.sin(t)],f=.12*Math.sin(a*9+t*3);b.vert([center[0]+k*Math.cos(a)+f,center[1]+k*Math.sin(a)*1.22+f,center[2]+thick*Math.sin(t)*1.6],v3.norm([n[0],n[1]/1.22,n[2]/1.6]),[...color,0]);});
  }
  // ABZU's deep floor is littered with the bones of giants and volcanic chimneys.
  // All of it is seeded static geometry built once, so it costs nothing per frame.
  function whaleBones(b,cx,cz){
    const y=height(cx,cz), bone=[.50,.47,.40], spine=[];
    for(let i=0;i<=10;i++){const t=i/10;spine.push([cx+t*4-2,y+.9+Math.sin(t*PI)*.6,cz-t*9]);}
    tube(b,spine,spine.map((_,i)=>.17*(1-i/15)),bone,0,6,y);
    for(const s of [-1,1])for(let i=1;i<=6;i++){
      const base=spine[Math.round(i/8*10)],t=i/8,ps=[],rr=[];
      for(let j=0;j<=8;j++){const q=j/8,a=q*PI*.92,span=2.5*(1-t*.45);ps.push([base[0]+s*Math.sin(a)*span,base[1]-Math.cos(a)*1.9,base[2]+Math.sin(a)*.6]);rr.push(.10*(1-q*.72));}
      tube(b,ps,rr,bone.map(v=>v*(.92-t*.12)),0,5,y);
    }
  }
  function vent(b,x,z,h,r,rnd){
    const y=height(x,z),rock=[.16,.17,.18];
    grid(b,14,10,(u,v)=>{const a=u*TAU,t=v,rr=r*(1-.5*t)*(1+.16*Math.sin(a*5+t*11));b.vert([x+rr*Math.cos(a),y+h*t,z+rr*Math.sin(a)],v3.norm([Math.cos(a)*.6,.65,Math.sin(a)*.6]),[...rock.map(q=>q*(1-t*.25)),0]);});
    // Soft, widening smoke column: vertex tone fades toward the surrounding water so fog finishes the blend.
    grid(b,10,18,(u,v)=>{const a=u*TAU,t=v,rr=r*(.35+t*2.3)*(1+.2*Math.sin(a*3+t*13)),wob=Math.sin(t*4.2)*.7;const smoke=[.17,.19,.20].map(q=>q*(1-t*.62));b.vert([x+rr*Math.cos(a)+wob,y+h+h*t*2.6,z+rr*Math.sin(a)+wob*.4],[0,1,0],[...smoke,0]);});
  }
  function tail(){
    // Reuses the original garden's asymmetric, rising fluke silhouette, with Cold Smoke's SDF mesher.
    const chains=[{z:.8,p:[[0,-3,1.3,.70],[0,-1.2,.7,.55],[0,.3,.15,.42],[0,1.2,0,.36]]},
      {z:.24,p:[[0,1.0,0,.45],[1.1,1.7,0,.65],[2.3,2.4,-.05,.60],[3.3,3.2,-.15,.43],[4.0,4.2,-.25,.25],[4.3,5.3,-.3,.07]]},
      {z:.24,p:[[0,1.0,0,.45],[-1.0,1.9,0,.64],[-1.9,2.9,-.05,.58],[-2.7,4.0,-.1,.42],[-3.1,5.2,-.2,.22],[-3.2,6.1,-.25,.07]]}];
    const field=(x,y,z)=>{let d=1e5;for(const chain of chains)for(let i=0;i<chain.p.length-1;i++){const a=chain.p[i],b=chain.p[i+1],e=sd.capsule(x,y,z/chain.z,a[0],a[1],a[2]/chain.z,b[0],b[1],b[2]/chain.z,a[3],b[3])*chain.z;d=sd.smin(d,e,.22);}return d;};
    return meshSDF(field,[-4,-3.8,-1.1],[5,6.8,2.2],.14,{repair:true});
  }
  function manta(){
    const b=meshBuilder();
    grid(b,48,20,(u,v)=>{const x=(u-.5)*7.4,a=Math.abs(x)/3.7,t=v*TAU,z=(.22+1.2*Math.pow(1-a,.65))*Math.cos(t)+a*.85,y=.18*Math.sin(t)*(1-a)+.16*Math.sin(t)*Math.exp(-a*8);b.vert([x,y,z],v3.norm([x*.02,Math.sin(t)*3,Math.cos(t)]),[.14,.33,.36,3+a/100]);});
    tube(b,[[0,0,1.2],[0,-.12,2.5],[.2,-.3,4.4]],[.05,.025,.002],[.12,.29,.32],3,6);
    for(const s of [-1,1])tube(b,[[s*.22,0,-1],[s*.35,.05,-1.45],[s*.3,.16,-1.64]],[.13,.09,.025],[.21,.42,.41],3,6);
    return b.done();
  }
  // Each fish carries a stable seed (mat.x) and its school-local centre (mat.yz); the vertex shader
  // turns that into an individual orbit + heading, so the school swims instead of rigidly rotating.
  function fish(){const b=meshBuilder(),rnd=RNG(3456);for(let j=0;j<80;j++){const p=[(rnd()-.5)*8,(rnd()-.5)*2.7,(rnd()-.5)*5],s=.18+rnd()*.12,m=[rnd(),p[0],p[2]];sphere(b,p,[s*.3,s*.6,s*1.6],m,2,12,8);const a=b.vert([p[0],p[1],p[2]+s*1.3],[1,0,0],[...m,2.01]),d=b.vert([p[0],p[1]+s*.85,p[2]+s*2.8],[1,0,0],[...m,2.02]),e=b.vert([p[0],p[1]-s*.85,p[2]+s*2.8],[1,0,0],[...m,2.02]);b.tri(a,d,e);}return b.done();}
  function jelly(){const b=meshBuilder();grid(b,28,14,(u,v)=>{const a=u*TAU,t=v*PI*.53,r=Math.sin(t)*.58,p=[Math.cos(a)*r,Math.cos(t)*.57,Math.sin(a)*r];b.vert(p,v3.norm([p[0],p[1]*1.4,p[2]]),[.42,.38,.68,4+v/100]);});for(let j=0;j<10;j++){const a=j*TAU/10,p=[],r=[];for(let i=0;i<=10;i++){const t=i/10;p.push([Math.cos(a)*.36+Math.sin(t*7+j)*.045,-t*2.1,Math.sin(a)*.36]);r.push(.011*(1-t*.8));}tube(b,p,r,[.34,.37,.65],4,4);}return b.done();}
  async function build(report){
    leafRecords=[];
    const rnd=RNG(20261120),ground=meshBuilder(),plants=meshBuilder(),corals=meshBuilder(),obstacles=[];
    // The floor is no longer a baked 100×100 patch: it is a local grid the GPU samples
    // against the analytic height() at world coords, so it can follow the diver forever.
    const floor=floorPatch();
    report('雕刻岩壁与鲸尾…',.27);await new Promise(r=>setTimeout(r,0));
    const proto=[];for(let i=0;i<4;i++){const f=(x,y,z)=>{const warp=fbm3(x*1.6,y*1.6,z*1.6,3,33+i);let d=sd.ellipsoid(x,y,z,0,0,0,1,1,1);d=sd.smin(d,sd.ellipsoid(x,y,z,.45,-.25,.2,.75,.72,.7),.25);return d+warp*.23+Math.abs(Math.sin(y*9+warp*3))*.055;};proto.push(meshSDF(f,[-1.45,-1.4,-1.4],[1.5,1.4,1.4],.13,{repair:true}));}
    const rocks=[[-14,0,-9,4,8,8],[14,-1,-14,4,7,8],[-16,-1,-30,6,8,7],[8,-2,-39,4,5,5],[-13,-1,-46,7,7,7],[34,-1,-41,6,9,8],[24,-1,-51,10,8,5],[36,-1,-27,5,7,8],[-12,-3,13,3,4,4],[13,-3,8,3,4,4]];
    rocks.forEach((p,i)=>{ground.merge(transform(proto[i%4],p.slice(0,3),p.slice(3),[.18,.28,.25]));obstacles.push({x:p[0],z:p[2],r:Math.min(p[3],p[5])*.85});});
    for(let i=0;i<95;i++){const x=(rnd()-.5)*65,z=15-rnd()*72,s=.13+rnd()*.65;sphere(ground,[x,height(x,z)-.12,z],[s,s*.65,s*.8],[.23,.31,.25],0,8,5);}
    // Arches sit on the sculpted floor, so their ring centre follows local height.
    for(const [cx,cz,r,thick,color] of [[0,-17,6.6,1.1,[.22,.30,.25]],[24,-41,6.1,1.6,[.23,.22,.31]]]){
      const cy=height(cx,cz)+r*.30;
      const f=(x,y,z)=>{const warp=fbm3(x*.55,y*.55,z*.55,3,14);const ring=Math.hypot(x,(y-cy)/1.22)-r;return Math.hypot(ring,z/1.6)-thick+warp*.48+Math.sin(y*4+warp*3)*.08;};
      const m=meshSDF(f,[-r-thick-1,cy-r*1.3-2,-thick*2-1],[r+thick+1,cy+r*1.3+2,thick*2+1],.24,{repair:true});ground.merge(transform(m,[cx,0,cz],[1,1,1],color));
    }
    // Volcanic vents inside the trench + a half-buried whale skeleton in the deep: ABZU's sense of an ancient sea floor.
    for(const [x,z,h,r] of [[-15,-13,7,1.5],[-12,-26,9,1.8],[-17,-38,6,1.3]]){vent(ground,x,z,h,r,rnd);obstacles.push({x,z,r:r*1.2});}
    whaleBones(ground,26,-57);obstacles.push({x:26,z:-57,r:3.2});
    for(let i=0;i<8;i++){const x=-40+rnd()*18,z=-12-rnd()*48,h=3+rnd()*6,s=.9+rnd()*1.1;ground.merge(transform(proto[i%4],[x,height(x,z)+h*.36,z],[s,h,s],[.19,.25,.24]));}
    ground.merge(transform(tail(),[-3,height(-3,-29)+3,-29],[1,1,1],[.27,.40,.36]));obstacles.push({x:-3,z:-29,r:1.3});
    report('让海藻生长…',.48);await new Promise(r=>setTimeout(r,0));
    for(let i=0;i<230;i++){const x=(rnd()-.5)*43,z=18-rnd()*68;if(Math.abs(x)<3.5||(z<-22&&x>1)||Math.hypot(x+3,z+29)<7)continue;kelp(plants,x,z,4+rnd()*10,rnd);}
    for(const p of [[-4.5,7,9],[5,4,11],[-7,-3,12],[7,-10,11],[-10,-23,11]])kelp(plants,p[0],p[1],p[2],rnd);
    // Low meadows break up bare sand while keeping the photographed channel open.
    for(let i=0;i<650;i++){const x=(rnd()-.5)*48,z=17-rnd()*64;if(Math.abs(x)<2.5&&rnd()<.8)continue;const y=height(x,z);for(let j=0;j<5;j++){const L=.18+rnd()*.55;leafRecords.push(x+(rnd()-.5)*.35,y,z+(rnd()-.5)*.35,L,rnd()*TAU,.6+rnd()*.65,y,rnd()*TAU,.11,.23+rnd()*.1,.10,L*.065);}}
    report('点亮珊瑚与水母…',.67);await new Promise(r=>setTimeout(r,0));
    for(let i=0;i<105;i++){const purple=i>35,x=purple?15+rnd()*17:(rnd()-.5)*24,z=purple?-28-rnd()*18:8-rnd()*48;if(Math.abs(x)<2.7&&z>-21)continue;const c=purple?[.20+rnd()*.11,.10+rnd()*.06,.23+rnd()*.12]:[.41+rnd()*.12,.14+rnd()*.07,.07+rnd()*.06];if(i%3===0)coral(corals,x,z,.3+rnd()*.65,c,rnd);else seaFan(corals,x,z,.7+rnd()*1.3,c,rnd);if(i%9===0)for(let j=0;j<2;j++)sponge(corals,x+(rnd()-.5),z+(rnd()-.5),.25+rnd()*.45,.12+rnd()*.13,purple?[.22,.14,.25]:[.29,.22,.08]);}
    const reefColors=[[.38,.21,.22],[.22,.22,.31],[.28,.32,.23],[.40,.29,.17],[.25,.15,.28]];
    for(let i=0;i<60;i++){const x=14+rnd()*19,z=-28-rnd()*22;if(Math.hypot(x-24,z+38)<2.2)continue;reef(corals,x,z,.45+rnd()*1.15,reefColors[i%reefColors.length],rnd);}
    for(const [x,z,s] of [[18,-31,1.7],[21,-30,1.3],[29,-33,1.9],[26,-35,1.3],[18,-37,1.7]])reef(corals,x,z,s,reefColors[Math.floor(rnd()*reefColors.length)],rnd);
    return {floor:floor,ground:ground.done(),plants:plants.done(),corals:corals.done(),manta:manta(),fish:fish(),jelly:jelly(),diver:GardenDiver.build(),leaf:leafMesh(),leafInstances:new Float32Array(leafRecords),scatter,obstacles};
  }
  // Endless rule-based scattering (the "treeInCell" rule from the making-of): the ground is cut into
  // cells; a coordinate hash decides whether a blade grows, where, how tall and what colour. Same cell
  // always yields the same blade, so vegetation follows the diver forever with nothing stored.
  const scatter=(()=>{
    const CELL=3.2, RAD=54, N=1700, data=new Float32Array(N*12);
    let lastX=1e9,lastZ=1e9,count=0;
    function update(cx,cz,time){
      if(Math.abs(cx-lastX)<CELL*.5 && Math.abs(cz-lastZ)<CELL*.5) return count;
      lastX=cx;lastZ=cz;let k=0;
      const gx=Math.round(cx/CELL),gz=Math.round(cz/CELL),R=Math.ceil(RAD/CELL);
      for(let j=-R;j<=R&&k<N-6;j++)for(let i=-R;i<=R&&k<N-6;i++){
        const ci=gx+i,cj=gz+j,h0=hash2U(ci,cj),fx=(h0&0xffff)/65536,fz=((h0>>>16)&0xffff)/65536;
        const x=(ci+.12+.76*fx)*CELL, z=(cj+.12+.76*fz)*CELL;
        const dx=x-cx,dz=z-cz;if(dx*dx+dz*dz>RAD*RAD)continue;
        if(Math.abs(x)<3.6)continue;                       // keep the swim channel open
        let dens=.30;                                       // baseline meadow density
        if(Math.hypot(x+3,z+29)<7||Math.hypot(x-24,z+38)<6)dens=.05; // clear landmark sites
        const h1=hashU(h0+0x51ed27);if((h1&0xffff)/65536>dens)continue;
        const y=height(x,z), h2=hashU(h0+0x9e3779b1),h3=hashU(h0+0x85ebca6b);
        const tall=.55+1.5*((h2&0xffff)/65536)*((h2&0xffff)/65536)+.5*((h3>>>16)/65536);
        const warm=sat(1-Math.hypot(x-11,z+9)/24), purple=sat(1-Math.hypot(x-24,z+38)/20),deep=sat((-y-4)/6);
        let r=.10+.06*((h3&0xff)/255)+warm*.05-purple*.01, g=.34+.12*((h2>>>8&0xff)/255)+warm*.01, b=.07+.05*((h1>>>16&0xff)/255)+purple*.09;
        r*=1-deep*.45;g*=1-deep*.40;b*=1-deep*.35;
        const o=k*12;
        data[o]=x;data[o+1]=y;data[o+2]=z;data[o+3]=tall;
        data[o+4]=(h1&0xffff)/65536*TAU;data[o+5]=(h3&0xffff)/65536*.7-.35;data[o+6]=y;data[o+7]=(h2&0xffff)/65536*TAU;
        data[o+8]=r;data[o+9]=g;data[o+10]=b;data[o+11]=.18+.16*((h2>>>16)/65536);k++;
      }
      count=k;return count;
    }
    return {data,update,max:N,CELL};
  })();
  return {build,points,height,scatter};
})();
