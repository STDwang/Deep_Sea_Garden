// Endless seabed: bit-compatible mirrors of the CPU hashU/hash3/vnoise2/fbm2 in vendor/00_util.js.
// The GPU evaluates the SAME height() as the CPU, so hand-placed features stay glued to an infinite floor.
const ENDLESS_SSL = `
fn jsHashU(v0:u32)->u32{var v:u32=v0;v=(v^(v>>16u))*0x7feb352du;v=(v^(v>>15u))*0x846ca68bu;return v^(v>>16u);}
fn jsHash2U(x:i32,y:i32)->u32{return jsHashU(u32(x)+jsHashU(u32(y))*0x9e3779b1u);}
fn jsHash3U(x:i32,y:i32,z:i32)->u32{return jsHashU(u32(x)+jsHash2U(y,z)*0x9e3779b1u);}
fn jsHash3(x:f32,y:f32,z:f32)->f32{return f32(jsHash3U(i32(floor(x)),i32(floor(y)),i32(floor(z)))>>8u)*(1.0/16777216.0);}
fn jsVnoise2(x:f32,y:f32,seed:f32)->f32{let ix:f32=floor(x);let iy:f32=floor(y);let fx:f32=x-ix;let fy:f32=y-iy;let ux:f32=fx*fx*fx*(fx*(fx*6.0-15.0)+10.0);let uy:f32=fy*fy*fy*(fy*(fy*6.0-15.0)+10.0);let a:f32=jsHash3(ix,iy,seed);let b:f32=jsHash3(ix+1.0,iy,seed);let c:f32=jsHash3(ix,iy+1.0,seed);let d:f32=jsHash3(ix+1.0,iy+1.0,seed);return mix(mix(a,b,ux),mix(c,d,ux),uy)*2.0-1.0;}
fn jsFbm2(x0:f32,y0:f32,oct:i32,seed:f32)->f32{var a:f32=.5;var s:f32=0.0;var n:f32=0.0;var x:f32=x0;var y:f32=y0;for(var i:i32=0;i<oct;i++){s+=a*jsVnoise2(x,y,seed+f32(i)*131.0);n+=a;x*=2.0;y*=2.0;a*=.5;}return s/n;}
fn terrainH(x:f32,z:f32)->f32{
  let wx:f32=x+jsFbm2(x*.04+31.7,z*.04-11.3,2,91.0)*3.0;
  let wz:f32=z+jsFbm2(x*.04-7.9,z*.04+23.1,2,92.0)*3.0;
  var h:f32=-5.4+jsFbm2(wx*.06,wz*.06,4,47.0)*2.0;
  let ridge:f32=1.0-abs(jsFbm2(wx*.11,wz*.11,4,133.0));
  h+=pow(saturate(ridge),3.0)*3.0;
  let cx:f32=-13.0+sin(wz*.07)*3.5;
  h-=exp(-pow((wx-cx)/5.5,2.0))*3.4;
  let shelf:f32=smoothstep(.30,.75,jsFbm2(wx*.05+8.0,wz*.05-4.0,3,211.0));
  h+=shelf*2.2*smoothstep(8.0,20.0,wx)*smoothstep(20.0,34.0,-wz);
  h+=sin(wx*.62+wz*.28+jsFbm2(wx*.2,wz*.2,2,7.0)*2.0)*.13;
  let corridor:f32=smoothstep(3.0,10.0,abs(x));
  h=-5.4+(h+5.4)*(.30+.70*corridor);
  return -6.3+3.8*tanh((h+6.3)/3.8);
}
`;
const ENDLESS_VERT = ENDLESS_SSL+`
fn vert(a:VIn)->VOut {
  var v:VOut;
  let wx:f32=a.pos.x+M.p.x; let wz:f32=a.pos.z+M.p.z;
  let y:f32=terrainH(wx,wz); let e:f32=0.32;
  let n:vec3f=normalize(vec3f(terrainH(wx-e,wz)-terrainH(wx+e,wz),2.0*e,terrainH(wx,wz-e)-terrainH(wx,wz+e)));
  let slope:f32=saturate(1.0-n.y*1.15); let deep:f32=saturate((-y-2.5)/7.0);
  let warm:f32=saturate(1.0-length(vec2f(wx-11.0,wz+9.0))/22.0)*(1.0-smoothstep(10.0,22.0,wx)*smoothstep(20.0,36.0,-wz));
  let purple:f32=saturate(1.0-length(vec2f(wx-24.0,wz+38.0))/18.0);
  var c:vec3f=mix(vec3f(.40,.35,.21),vec3f(.20,.27,.26),slope);
  c=mix(c,vec3f(.13),deep*.7);
  c=c+vec3f(warm*.12-purple*.05,warm*.02-purple*.08,-warm*.06+purple*.16);
  v.world=vec3f(wx,y,wz); v.normal=n; v.mat=vec4f(c,0.0); v.clip=U.viewProj*vec4f(v.world,1.0); return v;
}`;
// Shares Cold Smoke's real dual-backend renderer, camera globals and film curve.
const WATER_SSL = `
fn waterColor(d: vec3f) -> vec3f {
  let top: f32 = smoothstep(-0.45, 0.85, d.y);
  let shallow: vec3f = mix(vec3f(0.008,0.050,0.115), vec3f(0.055,0.225,0.255), top);
  let purple: f32 = smoothstep(9.0, 21.0, U.camPos.x) * smoothstep(13.0, 29.0, -U.camPos.z);
  return mix(shallow, vec3f(0.072,0.040,0.135), purple*0.82)*mix(0.10,1.0,U.ambSky.w);
}
fn diverLamp(p:vec3f)->f32 {let d:vec3f=p-U.lamp.xyz;let L:f32=length(d);return U.lamp.w*smoothstep(0.80,0.97,dot(d/max(L,0.01),U.lampDir.xyz))/(1.0+L*L*0.10);}
fn wave(p: vec2f) -> f32 {
  let t: f32 = U.camPos.w;
  var q: vec2f = p;
  // Two rounds of domain warping: the net breathes and folds like real refracted sunlight.
  q += vec2f(sin(q.y * 1.8 + t * 0.21), cos(q.x * 1.3 - t * 0.17)) * 0.34;
  q += vec2f(sin(q.y * 3.1 - t * 0.29), cos(q.x * 2.7 + t * 0.23)) * 0.12;
  let a: f32 = abs(sin(q.x * 2.1 + sin(q.y * 1.8)) + sin(q.y * 2.6 + sin(q.x * 1.7)));
  let net: f32 = pow(max(1.0 - a * 1.55, 0.0), 3.2);
  // Thin bright filaments ride the crests of the net.
  let fil: f32 = pow(max(1.0 - abs(a - 0.35) * 4.5, 0.0), 6.0);
  return saturate(net * 0.82 + fil * 0.30);
}
fn caustic(p: vec3f) -> f32 {
  let t: f32 = U.camPos.w;
  let a: f32 = wave(p.xz * 0.72 + p.y * 0.11 + vec2f(t * 0.035, t * -0.018));
  let b: f32 = wave(p.zx * 1.13 - p.y * 0.07 + vec2f(-t * 0.023, t * 0.031) + vec2f(11.3, 5.7));
  return saturate(a * 0.72 + b * 0.42);
}
fn oceanFog(col: vec3f, p: vec3f) -> vec3f {
  let delta: vec3f = p - U.camPos.xyz; let dist: f32 = length(delta);
  // Stronger red/green absorption -> distant water stays deep blue-teal instead of washing out grey.
  let trans: vec3f = exp(-dist * vec3f(0.105,0.052,0.034));
  return col * trans + waterColor(delta / max(dist,0.01)) * (vec3f(1.0) - trans);
}
fn shadeSun(p: vec3f) -> f32 {
  let s: vec4f = U.shadowVP * vec4f(p,1.0);
  let uv: vec2f = vec2f(s.x*0.5+0.5,0.5-s.y*0.5);
  if (max(abs(s.x),abs(s.y)) > 0.96 || s.z < 0.0 || s.z > 1.0) { return 1.0; }
  let t: f32 = 1.0 / texSize(tShadow).x; let z: f32 = s.z - 0.0014;
  return 0.25 * (texShadow(tShadow,uv+vec2f(-0.75,-0.25)*t,z)+texShadow(tShadow,uv+vec2f(0.25,-0.75)*t,z)+texShadow(tShadow,uv+vec2f(0.75,0.25)*t,z)+texShadow(tShadow,uv+vec2f(-0.25,0.75)*t,z));
}
`;
const OCEAN_VERT = GardenCurrent.ssl+`
fn vert(a: VIn) -> VOut {
  var v: VOut; var p: vec3f = a.pos; var n: vec3f = a.normal;
  let kind: f32 = floor(a.mat.w+0.0001); let flex: f32 = fract(a.mat.w+0.00001)*100.0; let time: f32 = U.camPos.w;
  if (kind > 0.5 && kind < 1.5) {
    p += plantOffset(p,flex,a.mat.x);
    n = normalize(n+plantOffset(a.pos,flex+0.1,a.mat.x)-plantOffset(a.pos,flex,a.mat.x));
  }
  if (kind > 1.5 && kind < 2.5) {
    // Individual bait-ball orbit: seed drives radius/speed/phase, centre (mat.yz) is the anchor.
    let sd: f32 = a.mat.x; let cen: vec2f = a.mat.yz;
    let ph: f32 = sd*53.7; let sp: f32 = 0.40+0.45*fract(sd*7.31);
    let rad: f32 = 0.18+0.70*fract(sd*13.7);
    let an: f32 = time*sp+ph;
    let o: vec2f = vec2f(cos(an),sin(an))*rad;
    // Heading along the tangent -> rotate the fish body to face where it swims.
    let th: f32 = atan2(-sin(an),cos(an)); let cs: f32 = cos(th); let sn: f32 = sin(th);
    let rel: vec2f = p.xz-cen;
    p.x = cen.x+rel.x*cs+rel.y*sn+o.x;
    p.z = cen.y-rel.x*sn+rel.y*cs+o.y;
    p.y += sin(an*1.3+ph)*0.28 + sin(time*4.0+ph)*0.03;
    n = normalize(vec3f(n.x*cs+n.z*sn,n.y,-n.x*sn+n.z*cs));
  }
  if (kind > 2.5 && kind < 3.5) { p.y += sin(time*1.15-abs(p.x)*0.64)*flex*0.46; n = normalize(n+vec3f(sign(p.x)*cos(time*1.15-abs(p.x)*0.64)*0.22,0.0,0.0)); }
  if (kind > 3.5 && kind < 4.5) { p.x *= 1.0+sin(time*1.4)*0.065; p.z *= 1.0+sin(time*1.4)*0.065; p.x += sin(time*0.7-p.y*2.0)*max(-p.y,0.0)*0.09; }
  if (kind > 5.5) {
    var bone:f32=round(flex);var joint:vec3f=vec3f(0.0);var angle:f32=0.0;
    if(bone>4.5){bone-=4.0;let side:f32=select(-1.0,1.0,bone>1.5);let phase:f32=M.q.z+select(0.0,3.14159,bone>1.5);let knee:f32=-0.08-max(sin(phase-0.55),0.0)*M.q.w*0.35;let ck:f32=cos(knee);let sk:f32=sin(knee);let pivot:vec3f=vec3f(side*0.15,-0.04,0.71);let fin:f32=max(p.z-1.15,0.0);p.y+=sin(phase-0.8)*fin*fin*(0.12+M.q.w*0.28);p-=pivot;p=vec3f(p.x,p.y*ck-p.z*sk,p.y*sk+p.z*ck)+pivot;n=vec3f(n.x,n.y*ck-n.z*sk,n.y*sk+n.z*ck);}
    if (bone > 0.5 && bone < 2.5) {joint=vec3f(select(-0.13,0.13,bone>1.5),0.0,0.27);angle=sin(M.q.z+select(0.0,3.14159,bone>1.5))*(0.07+M.q.w*0.26);}
    if (bone > 2.5 && bone < 4.5) {joint=vec3f(select(-0.23,0.23,bone>3.5),0.005,-0.30);angle=sin(M.q.z*0.5+bone)*0.06;}
    p-=joint;let c:f32=cos(angle);let s:f32=sin(angle);p=vec3f(p.x,p.y*c-p.z*s,p.y*s+p.z*c)+joint;n=vec3f(n.x,n.y*c-n.z*s,n.y*s+n.z*c);
    let cp:f32=cos(M.q.y);let sp:f32=sin(M.q.y);p=vec3f(p.x,p.y*cp-p.z*sp,p.y*sp+p.z*cp);n=vec3f(n.x,n.y*cp-n.z*sp,n.y*sp+n.z*cp);
  }
  let cs: f32 = cos(M.p.w); let sn: f32 = sin(M.p.w);
  p = p*M.q.x; p = vec3f(cs*p.x+sn*p.z,p.y,-sn*p.x+cs*p.z)+M.p.xyz;
  n = vec3f(cs*n.x+sn*n.z,n.y,-sn*n.x+cs*n.z);
  v.world=p; v.normal=n; v.mat=a.mat;if(kind>0.5&&kind<1.5){v.mat=vec4f(0.12,0.24,0.07,1.0);}v.clip=U.viewProj*vec4f(p,1.0); return v;
}`;
// GPU dual-quaternion deformation follows Human.Skin.deform: sign-align, blend, normalise, rotate/translate.
const DIVER_VERT=`
fn qr(q:vec4f,p:vec3f)->vec3f {return p+2.0*cross(q.xyz,cross(q.xyz,p)+q.w*p);}
fn vert(a:VIn)->VOut {
 var v:VOut;let q0:vec4f=texFetch(tBones,vec2i(0,i32(a.bones.x)),0);let q1:vec4f=texFetch(tBones,vec2i(0,i32(a.bones.y)),0);let q2:vec4f=texFetch(tBones,vec2i(0,i32(a.bones.z)),0);let q3:vec4f=texFetch(tBones,vec2i(0,i32(a.bones.w)),0);
 let w:vec4f=a.weights*vec4f(1.0,select(-1.0,1.0,dot(q0,q1)>=0.0),select(-1.0,1.0,dot(q0,q2)>=0.0),select(-1.0,1.0,dot(q0,q3)>=0.0));
 var q:vec4f=q0*w.x+q1*w.y+q2*w.z+q3*w.w;
 var d:vec4f=texFetch(tBones,vec2i(1,i32(a.bones.x)),0)*w.x+texFetch(tBones,vec2i(1,i32(a.bones.y)),0)*w.y+texFetch(tBones,vec2i(1,i32(a.bones.z)),0)*w.z+texFetch(tBones,vec2i(1,i32(a.bones.w)),0)*w.w;
 let L:f32=max(length(q),0.00001);q/=L;d/=L;
 let P:vec3f=qr(q,a.pos)+2.0*(q.w*d.xyz-d.w*q.xyz+cross(q.xyz,d.xyz));let N:vec3f=qr(q,a.normal);
 var p:vec3f=vec3f(-P.x,-P.z,-(P.y-M.q.z));var n:vec3f=vec3f(-N.x,-N.z,-N.y);
 let cp:f32=cos(M.q.y);let sp:f32=sin(M.q.y);p=vec3f(p.x,p.y*cp-p.z*sp,p.y*sp+p.z*cp);n=vec3f(n.x,n.y*cp-n.z*sp,n.y*sp+n.z*cp);
 let c:f32=cos(M.p.w);let s:f32=sin(M.p.w);p=vec3f(c*p.x+s*p.z,p.y,-s*p.x+c*p.z)+M.p.xyz;n=vec3f(c*n.x+s*n.z,n.y,-s*n.x+c*n.z);
 v.world=p;v.normal=n;v.mat=a.mat;v.clip=U.viewProj*vec4f(p,1.0);return v;
}`;
const OCEAN_FRAG = `
fn frag(v: VOut) -> FOut {
  var o: FOut; let kind: f32 = floor(v.mat.w+0.0001); var N: vec3f = normalize(v.normal);
  let coord: vec2f = mix(v.world.xz,v.world.zy,step(0.65,abs(N.x)));
  let detail: vec4f = texLod(tDetail,coord*0.32,0.0);
  if (kind < 0.5 || (kind > 4.5 && kind < 5.5)) { N = normalize(N+vec3f(detail.x-0.5,detail.z-0.5,detail.y-0.5)*0.75); }
  let V: vec3f = normalize(U.camPos.xyz-v.world); let L: vec3f = U.sunDir.xyz;
  let diffuse: f32 = max(dot(N,L),0.0); let shade: f32 = shadeSun(v.world);
  let depth: f32 = max(12.0-v.world.y,0.0); let attenuation: f32 = exp(-depth*0.026);
  let zone: f32 = smoothstep(10.0,24.0,v.world.x)*smoothstep(20.0,38.0,-v.world.z);
  // A warm reef zone near the wreck and a cool violet grotto deeper in: ABZU-style colour scripting per biome.
  let warm: f32 = smoothstep(6.0,18.0,v.world.x)*smoothstep(20.0,4.0,-v.world.z)*(1.0-zone);
  var ambient: vec3f = mix(vec3f(0.14,0.25,0.27),vec3f(0.40,0.57,0.50),N.y*0.5+0.5)*mix(0.12,1.0,U.ambSky.w);
  ambient = mix(ambient, ambient*vec3f(1.22,1.05,0.72), warm*0.7);
  ambient = mix(ambient, ambient*vec3f(0.82,0.70,1.18), zone*0.8);
  var bounce: vec3f = U.sunCol.rgb*(0.40+1.15*diffuse)*shade*attenuation*mix(1.0,0.55,zone);
  bounce = mix(bounce, bounce*vec3f(1.10,0.92,0.66), warm*0.6);
  var col: vec3f = v.mat.rgb*(ambient+bounce);
  let C: f32 = caustic(v.world)*shade*attenuation*U.ambSky.w;
  col += v.mat.rgb*vec3f(1.06,1.16,0.66)*C*(0.55+max(N.y,0.0)*0.95)*mix(1.0,0.42,zone)*1.35;
  let H: vec3f = normalize(V+L);
  col += vec3f(0.30,0.54,0.45)*pow(max(dot(N,H),0.0),36.0)*shade*0.11;
  if (kind > 0.5 && kind < 1.5) { col += v.mat.rgb*pow(max(dot(-L,V),0.0),2.0)*0.9; }
  if (kind > 4.5 && kind < 5.5) { let pores: f32 = texLod(tDetail,coord*3.8,0.0).x;col *= 0.65+pores*0.55;col += v.mat.rgb*0.11; }
  if (kind > 1.5 && kind < 2.5) { let sd: f32 = fract(v.mat.x*53.7); let s: f32 = fract(sd*13.7); col = mix(vec3f(.13,.30,.34),vec3f(.32,.46,.42),s)*vec3f(1.0,1.0,0.86)*(ambient+bounce)*1.15; col += vec3f(.20,.34,.26)*pow(max(dot(N,H),0.0),22.0)*0.4; }
  if (kind > 5.5) { col+=v.mat.rgb*0.12+vec3f(0.12,0.21,0.22)*pow(1.0-max(dot(N,V),0.0),3.0)*0.35; }
  if (kind > 5.5 && kind < 6.5) {let cloth:f32=texLod(tDetail,coord*60.0,0.0).x;col*=0.88+cloth*0.20;}
  if (kind > 6.5) { col+=vec3f(0.55,0.72,0.75)*pow(max(dot(N,H),0.0),select(80.0,28.0,kind>7.5))*shade*select(0.9,0.32,kind>7.5); }
  let lamp:vec3f=v.world-vec3f(23.0,1.4,-36.0);let glow:f32=zone/(1.0+dot(lamp,lamp)*0.22);
  col += vec3f(0.065,0.025,0.18)*glow;
  col+=v.mat.rgb*vec3f(1.8,2.0,1.85)*diverLamp(v.world)*(0.35+0.65*max(dot(N,normalize(U.lamp.xyz-v.world)),0.0));
  if (kind > 1.5 && kind < 2.5) { col *= mix(1.2,0.52,N.y*0.5+0.5); col += vec3f(0.18,0.26,0.25)*pow(max(dot(N,H),0.0),20.0)*0.65; }
  if (kind < 0.5) {
    // Sand on flats, exposed rock on the new ridges (triplanar detail), cool bands in the trench.
    // Two-scale sediment detail: broad mottling plus fine grain, at low contrast to avoid tiling streaks.
    let rockN: vec4f = texLod(tDetail,v.world.zy*0.32,0.0);
    let steep: f32 = 1.0-smoothstep(0.25,0.72,N.y);
    col = mix(col*vec3f(1.08,1.00,0.80)*(0.66+detail.z*0.50), col*vec3f(0.74,0.86,0.86)*(0.74+rockN.z*0.34), steep);
    let band: f32 = sin(v.world.y*3.1+detail.x*2.0)*0.5+0.5;
    col *= 1.0-smoothstep(-4.0,-9.0,v.world.y)*band*0.12;
  }
  o.color=vec4f(oceanFog(col,v.world),1.0); return o;
}`;
const KELP_VERT = GardenCurrent.ssl+`
fn vert(a: VIn) -> VOut {
  var v: VOut;
  var p: vec3f = vec3f(a.pos.x*a.iColor.w,a.pos.y*a.iPos.w,a.pos.z*a.iPos.w);
  let cs: f32 = cos(a.iPose.x); let sn: f32 = sin(a.iPose.x);
  let ct: f32 = cos(a.iPose.y); let st: f32 = sin(a.iPose.y);
  let bend: vec3f = vec3f(p.x,p.y*ct+p.z*st,-p.y*st+p.z*ct);
  p = vec3f(cs*bend.x+sn*bend.z,bend.y,-sn*bend.x+cs*bend.z)+a.iPos.xyz;
  let flex: f32 = max(p.y-a.iPose.z,0.0);
  p += plantOffset(p,flex,a.iPose.w);
  p.y += sin(U.camPos.w*(0.9+0.2*sin(a.iPose.w))+a.iPose.w+a.pos.z*4.0+a.iPose.x)*a.pos.z*a.iPos.w*0.028;
  let n0: vec3f = vec3f(a.normal.x,a.normal.y*ct+a.normal.z*st,-a.normal.y*st+a.normal.z*ct);
  v.normal=normalize(vec3f(cs*n0.x+sn*n0.z,n0.y,-sn*n0.x+cs*n0.z));
  v.world=p;v.mat=vec4f(a.iColor.rgb,1.0);v.clip=U.viewProj*vec4f(p,1.0);return v;
}`;
const JELLY_FRAG = `
fn frag(v: VOut) -> FOut {
  var o: FOut; let V: vec3f = normalize(U.camPos.xyz-v.world); let N: vec3f = normalize(v.normal);
  let rim: f32 = pow(1.0-abs(dot(V,N)),1.7);
  let stripe: f32 = pow(abs(sin(atan2(v.normal.x,v.normal.z)*7.0)),6.0);
  let pulse: f32 = 0.85+0.35*sin(U.camPos.w*1.3+v.world.z*0.5);
  let glow: vec3f = v.mat.rgb*(0.62+rim*2.3+stripe*0.5)*pulse;
  let dist: f32 = length(U.camPos.xyz-v.world); let alpha: f32 = (0.24+rim*0.58+stripe*0.16)*exp(-dist*0.014);
  o.color=vec4f(oceanFog(glow,v.world)*alpha,alpha); return o;
}`;
const BACKGROUND_FRAG = `
fn frag(v: VOut) -> FOut {
  var o: FOut; let d: vec3f = normalize(screenRay(vec2f(v.uv.x*2.0-1.0,1.0-v.uv.y*2.0)));
  var col: vec3f = waterColor(d);
  // Layered distant seamounts: big silhouettes guide the eye before detail, the way ABZU frames a space.
  // Sampling the normalised horizontal direction keeps the ridges seamless all around the horizon.
  let dir: vec2f = normalize(d.xz+vec2f(0.0001));
  let rFar: f32 = -0.04-0.18*fbm2(dir*3.1+vec2f(3.0,8.0));
  let rMid: f32 = -0.13-0.26*fbm2(dir*5.3+vec2f(11.0,2.0));
  let rNear: f32 = -0.26-0.34*fbm2(dir*8.1+vec2f(21.0,5.0));
  let mFar: f32 = 1.0-smoothstep(rFar-0.02,rFar+0.02,d.y);
  let mMid: f32 = 1.0-smoothstep(rMid-0.02,rMid+0.02,d.y);
  let mNear: f32 = 1.0-smoothstep(rNear-0.02,rNear+0.02,d.y);
  let warm: vec3f = vec3f(0.10,0.13,0.10);
  col = mix(col, mix(waterColor(d)*0.72, warm, 0.20*smoothstep(6.0,20.0,U.camPos.x)), mFar*0.55);
  col = mix(col, vec3f(0.045,0.115,0.135), mMid*0.80);
  col = mix(col, vec3f(0.028,0.075,0.105), mNear*0.92);
  let mu: f32 = max(dot(d,U.sunDir.xyz),0.0);
  col += (vec3f(0.30,0.43,0.31)*pow(mu,24.0)+vec3f(0.55,0.63,0.39)*pow(mu,200.0))*U.ambSky.w;
  let surface: f32 = smoothstep(0.1,0.85,d.y);
  col += vec3f(0.06,0.13,0.11)*surface*(0.5+0.5*sin(d.x*33.0+sin(d.z*28.0)+U.camPos.w*0.3))*U.ambSky.w;
  o.color=vec4f(col,1.0); return o;
}`;
const WATER_COMPOSITE = `
fn frag(v: VOut) -> FOut {
  var o: FOut;
  let ndc: vec2f = vec2f(v.uv.x*2.0-1.0,1.0-v.uv.y*2.0);
  var col: vec3f = texLod(tScene,v.uv,0.0).rgb;
  // Dreamy depth of field: a gentle 9-tap defocus that grows with distance from the focal plane (M.p.z = strength).
  if (M.p.z > 0.001) {
    let raw: f32 = texFetchD(tDepth,clamp(vec2i(v.uv*U.res.xy),vec2i(0),vec2i(U.res.xy)-vec2i(1)),0);
    let dist: f32 = linDepth(raw);
    let coc: f32 = clamp((dist-13.0)/40.0,0.0,1.0)*M.p.z;
    if (coc > 0.02) {
      let r: f32 = coc*3.6;
      let tx: f32 = r*U.res.z; let ty: f32 = r*U.res.w;
      var sum: vec3f = col*4.0; var w: f32 = 4.0;
      sum += texLod(tScene,v.uv+vec2f(tx,0.0),0.0).rgb+texLod(tScene,v.uv-vec2f(tx,0.0),0.0).rgb;
      sum += texLod(tScene,v.uv+vec2f(0.0,ty),0.0).rgb+texLod(tScene,v.uv-vec2f(0.0,ty),0.0).rgb; w += 4.0;
      sum += texLod(tScene,v.uv+vec2f(tx,ty),0.0).rgb+texLod(tScene,v.uv+vec2f(tx,-ty),0.0).rgb;
      sum += texLod(tScene,v.uv+vec2f(-tx,ty),0.0).rgb+texLod(tScene,v.uv+vec2f(-tx,-ty),0.0).rgb; w += 4.0;
      col = mix(col, sum/w, smoothstep(0.02,0.85,coc)*0.78);
    }
  }
  if (M.p.w > 0.5) { col += texLod(tAir,v.uv,0.0).rgb; }
  let bloom: vec3f = texLod(tBloom,v.uv,0.0).rgb;
  col += max(bloom-vec3f(0.13),vec3f(0.0))*M.p.y;
  let lum: f32 = luma(col); col=mix(vec3f(lum),col,1.13);
  col = toSRGB(filmCurve(col*M.p.x));
  let corner: f32 = dot(ndc*vec2f(0.62,0.46),ndc*vec2f(0.62,0.46));col*=1.0-corner*0.16;
  o.color=vec4f(col,1.0); return o;
}`;
// The same low-resolution, depth-aware light integration used by Cold Smoke's Shafts.
const AIR_MARCH = `
fn frag(v:VOut)->FOut {
  var o:FOut;let ray:vec3f=screenRay(vec2f(v.uv.x*2.0-1.0,1.0-v.uv.y*2.0));let d:vec3f=normalize(ray);
  let raw:f32=texFetchD(tDepth,clamp(vec2i(v.uv*U.res.xy),vec2i(0),vec2i(U.res.xy)-vec2i(1)),0);
  let dist:f32=min(linDepth(raw)*length(ray),65.0);let jitter:f32=ign(v.clip.xy);var light:f32=0.0;
  for(var i:i32=0;i<24;i++){
    let u:f32=(f32(i)+jitter)/24.0;let t:f32=dist*u*u;let p:vec3f=U.camPos.xyz+d*t;
    let above:vec2f=p.xz-U.sunDir.xz*(p.y-12.0)/U.sunDir.y;
    let noise:f32=texLod(tDetail,above*0.018+vec2f(U.camPos.w*0.0003,0.0),0.0).z;
    let beam:f32=pow(max(0.0,0.5+0.5*sin(above.x*0.8+sin(above.y*0.49)+U.camPos.w*0.07)),4.0);
    let beam2:f32=pow(max(0.0,0.5+0.5*sin(above.x*1.7-above.y*0.6-U.camPos.w*0.05)),7.0);
    let rays:f32=beam*0.72+beam2*0.46;
    light += (shadeSun(p)*(0.10+1.35*rays)*mix(0.30,1.5,noise)*U.ambSky.w+diverLamp(p)*1.3)*exp(-t*0.019)*u;
  }
  let phase:f32=0.40+pow(max(dot(d,U.sunDir.xyz),0.0),4.0)*1.7;
  o.color=vec4f(vec3f(0.42,0.50,0.33)*light*dist*(2.0/24.0)*0.036*phase,dist/120.0);return o;
}`;
const AIR_BLUR = `
fn frag(v:VOut)->FOut {var o:FOut;let center:vec4f=texLod(tA,v.uv,0.0);var sum:vec3f=vec3f(0.0);var weights:f32=0.0;
for(var i:i32=0;i<9;i++){let off:vec2f=vec2f(f32(i%3)-1.0,f32(i/3)-1.0)*M.p.xy;let s:vec4f=texLod(tA,v.uv+off,0.0);let w:f32=exp(-abs(s.w-center.w)*120.0/(1.0+center.w*12.0));sum+=s.rgb*w;weights+=w;}o.color=vec4f(sum/max(weights,0.001),center.w);return o;}
`;
// Adapted from Cold Smoke's analytic dust boxes: no particle simulation or allocation.
const SEA_DUST_VERT = `
fn vert(a:VIn)->VOut {
  var v:VOut;let corner:vec2f=vec2f(f32(a.vid&1u),f32((a.vid>>1u)&1u))*2.0-1.0;
  let h:vec3f=hashu3(a.iid*3u+7u);let h2:vec3f=hashu3(a.iid*3u+1013u);let W:f32=M.p.x;
  let ctr:vec3f=U.camPos.xyz+U.camFwd.xyz*(W*0.36);
  let q:vec3f=h*W+vec3f(U.camPos.w*(0.012+h2.x*0.025),U.camPos.w*(0.018+h2.y*0.028),U.camPos.w*0.008);
  let rel:vec3f=(fract((q-ctr)/W+0.5)-0.5)*W;let pos:vec3f=ctr+rel;
  let edge:f32=max(abs(rel.x),max(abs(rel.y),abs(rel.z)))/W;let fade:f32=1.0-smoothstep(0.38,0.5,edge);
  let size:f32=(0.008+h2.z*h2.z*0.018)*M.p.y;
  let wp:vec3f=pos+(U.camRight.xyz*corner.x+U.camUp.xyz*corner.y)*size;
  v.clip=U.viewProj*vec4f(wp,1.0);v.uv=corner;
  let light:f32=shadeSun(pos);let dist:f32=length(pos-U.camPos.xyz);
  v.col=vec4f(mix(vec3f(0.11,0.29,0.31),vec3f(0.70,0.81,0.45),h2.x)*light,fade*exp(-dist*0.045)*M.p.z);
  return v;
}`;
const SEA_DUST_FRAG = `fn frag(v:VOut)->FOut {var o:FOut;let r:f32=dot(v.uv,v.uv);let a:f32=exp(-r*3.0)*(1.0-smoothstep(0.40,1.0,r))*v.col.w;o.color=vec4f(v.col.rgb*a,0.0);return o;}`;

const BUBBLE_VERT=`fn vert(a:VIn)->VOut{var v:VOut;let age:f32=max(U.camPos.w-a.birth.w,0.0);let life:f32=a.life.z;let corner:vec2f=vec2f(f32(a.vid&1u),f32((a.vid>>1u)&1u))*2.0-1.0;let p:vec3f=a.birth.xyz+a.velocity.xyz*age+vec3f(sin(age*2.0+a.life.x)*0.025,0.0,cos(age*1.7+a.life.x)*0.025);let size:f32=a.velocity.w*(1.0+age*0.12);v.clip=U.viewProj*vec4f(p+(U.camRight.xyz*corner.x+U.camUp.xyz*corner.y)*size,1.0);v.uv=corner;v.alpha=(1.0-smoothstep(life-1.0,life,age))*smoothstep(0.0,0.15,age);return v;}`;
const BUBBLE_FRAG=`fn frag(v:VOut)->FOut{var o:FOut;let r:f32=length(v.uv);if(r>1.0){discard;}let rim:f32=pow(r,5.0)*0.32;let shine:f32=pow(max(1.0-length(v.uv-vec2f(-0.3,-0.4))*2.5,0.0),3.0);let a:f32=(rim+shine*0.45)*v.alpha;o.color=vec4f(vec3f(0.45,0.73,0.76)*a,a);return o;}`;
const GardenRender = (()=>{
  const R={g:null,W:0,H:0,frame:0,time:0,level:1,stats:{}};
  let canvas,world,meshes,scene,depth,color,shadowTex,shadowT,bloomA,bloomB,bloomAT,bloomBT,airA,airB,airAT,airBT,solidP,floorP,floorShadowP,shadowP,jellyP,bgP,postP,downP,blurP,kelpP,kelpShadowP,airP,airBlurP,dustP,diverP,diverShadowP,boneTex,bubbleP,bubbleBuffer,scatterBuffer,scatterCount=0;
  const G=new Float32Array(GLOBALS_SIZE),sun=v3.norm([-.28,.85,-.34]);
  const layout=[{attrs:[['pos','vec3f'],['normal','vec3f'],['mat','vec4f']]}];
  const model={p:[0,0,0,0],q:[1,0,0,0]};
  R.init=async function(cv,content,backend){
    canvas=cv;world=content;let g;
    if(backend!=='webgl2')try{g=await createGPU(canvas);}catch(e){console.warn('WebGPU unavailable; WebGL2 follows',e.message);}
    if(!g){if(canvas.getContext('webgpu')){const next=canvas.cloneNode(false);canvas.replaceWith(next);canvas=next;}g=createGL(canvas);}
    if(!g)throw new Error('此场景需要支持 WebGPU 或 WebGL2 的设备。');R.g=g;R.canvas=canvas;
    const format=g.caps.hdr?'rgba16f':'rgba8';R.format=format;
    const base={buffers:layout,varyings:{world:'vec3f',normal:'vec3f',mat:'vec4f'},uniforms:{p:'vec4f',q:'vec4f'},lib:[SL.common,WATER_SSL],textures:{tShadow:'shadow',tDetail:'2d'},vs:OCEAN_VERT,cull:'none',colorFormat:format};
    solidP=g.pipeline(Object.assign({},base,{name:'oceanSolid',fs:OCEAN_FRAG}));
    // Endless floor: analytic height in the vertex shader, patch follows the camera anchor (M.p.xyz).
    floorP=g.pipeline(Object.assign({},base,{name:'endlessFloor',vs:ENDLESS_VERT,fs:OCEAN_FRAG}));
    floorShadowP=g.pipeline({name:'endlessFloorShadow',buffers:layout,varyings:base.varyings,uniforms:{p:'vec4f',q:'vec4f'},vs:ENDLESS_VERT.replace('U.viewProj*','U.shadowVP*'),colorFormat:null,cull:'none',depthBias:2});
    const skinLayout=layout.concat([{attrs:[['bones','vec4f'],['weights','vec4f']]}]);
    diverP=g.pipeline(Object.assign({},base,{name:'humanDiverDQS',buffers:skinLayout,textures:{tShadow:'shadow',tDetail:'2d',tBones:'fetch'},vs:DIVER_VERT,fs:OCEAN_FRAG}));
    diverShadowP=g.pipeline({name:'humanDiverShadow',buffers:skinLayout,varyings:base.varyings,uniforms:base.uniforms,textures:{tBones:'fetch'},vs:DIVER_VERT.replace('U.viewProj*','U.shadowVP*'),colorFormat:null,cull:'none',depthBias:2});
    boneTex=g.texture({w:2,h:64,format:'rgba32f',filter:'nearest'});
    const leafLayout=layout.concat([{instanced:true,attrs:[['iPos','vec4f'],['iPose','vec4f'],['iColor','vec4f']]}]);
    kelpP=g.pipeline(Object.assign({},base,{name:'instancedKelp',buffers:leafLayout,vs:KELP_VERT,fs:OCEAN_FRAG}));
    kelpShadowP=g.pipeline({name:'kelpShadow',buffers:leafLayout,varyings:base.varyings,uniforms:base.uniforms,vs:KELP_VERT.replace('U.viewProj*','U.shadowVP*'),colorFormat:null,cull:'none',depthBias:2});
    shadowP=g.pipeline({name:'oceanShadow',buffers:layout,varyings:{world:'vec3f',normal:'vec3f',mat:'vec4f'},uniforms:{p:'vec4f',q:'vec4f'},vs:OCEAN_VERT.replace('U.viewProj*','U.shadowVP*'),colorFormat:null,cull:'none',depthBias:2});
    jellyP=g.pipeline(Object.assign({},base,{name:'jelly',fs:JELLY_FRAG,blend:'premul',depthWrite:false}));
    const screen={buffers:[],varyings:{uv:'vec2f'},vs:VS_FULLSCREEN,cull:'none'};
    bgP=g.pipeline(Object.assign({},screen,{name:'oceanBackground',lib:[SL.common,SL.hash,SL.noise,WATER_SSL],textures:{tShadow:'shadow'},fs:BACKGROUND_FRAG,depthWrite:false,depthTest:false,colorFormat:format}));
    const post={...screen,depth:false,uniforms:{p:'vec4f'}};
    // Cold Smoke's weighted downsample and tent blur, at a controlled quarter resolution.
    downP=g.pipeline(Object.assign({},post,{name:'oceanBloomDown',textures:{tA:'2d'},colorFormat:format,fs:`fn frag(v: VOut) -> FOut {var o:FOut; let t:vec2f=M.p.xy; var c:vec3f=texLod(tA,v.uv,0.0).rgb*4.0; c+=texLod(tA,v.uv+t*vec2f(-1.0,-1.0),0.0).rgb+texLod(tA,v.uv+t*vec2f(1.0,-1.0),0.0).rgb+texLod(tA,v.uv+t*vec2f(-1.0,1.0),0.0).rgb+texLod(tA,v.uv+t*vec2f(1.0,1.0),0.0).rgb;o.color=vec4f(c*0.125,1.0);return o;}`}));
    blurP=g.pipeline(Object.assign({},post,{name:'oceanBloomBlur',textures:{tA:'2d'},colorFormat:format,fs:`fn frag(v:VOut)->FOut {var o:FOut;let t:vec2f=M.p.xy;var c:vec3f=texLod(tA,v.uv,0.0).rgb*4.0;c+=texLod(tA,v.uv+vec2f(t.x,0.0),0.0).rgb*2.0+texLod(tA,v.uv-vec2f(t.x,0.0),0.0).rgb*2.0+texLod(tA,v.uv+vec2f(0.0,t.y),0.0).rgb*2.0+texLod(tA,v.uv-vec2f(0.0,t.y),0.0).rgb*2.0;c+=texLod(tA,v.uv+t,0.0).rgb+texLod(tA,v.uv-t,0.0).rgb+texLod(tA,v.uv+vec2f(t.x,-t.y),0.0).rgb+texLod(tA,v.uv+vec2f(-t.x,t.y),0.0).rgb;o.color=vec4f(c/16.0,1.0);return o;}`}));
    airP=g.pipeline(Object.assign({},post,{name:'underwaterShafts',lib:[SL.common,SL.depth,SL.tonemap,WATER_SSL],textures:{tDepth:'depth',tShadow:'shadow',tDetail:'2d'},colorFormat:format,fs:AIR_MARCH}));
    airBlurP=g.pipeline(Object.assign({},post,{name:'depthAwareShaftBlur',textures:{tA:'2d'},colorFormat:format,fs:AIR_BLUR}));
    dustP=g.pipeline({name:'seaDust',lib:[SL.common,SL.hash,WATER_SSL],buffers:[],varyings:{uv:'vec2f',col:'vec4f'},uniforms:{p:'vec4f'},textures:{tShadow:'shadow'},vs:SEA_DUST_VERT,fs:SEA_DUST_FRAG,colorFormat:format,depthWrite:false,blend:'add',topology:'strip',cull:'none'});
    bubbleP=g.pipeline({name:'regulatorBubbles',buffers:[{instanced:true,attrs:[['birth','vec4f'],['velocity','vec4f'],['life','vec4f']]}],varyings:{uv:'vec2f',alpha:'f32'},vs:BUBBLE_VERT,fs:BUBBLE_FRAG,colorFormat:format,depthWrite:false,blend:'premul',topology:'strip',cull:'none'});bubbleBuffer=g.buffer(GardenBubbles.data,'vertex');
    postP=g.pipeline(Object.assign({},post,{name:'oceanComposite',lib:[SL.common,SL.depth,SL.tonemap,WATER_SSL],textures:{tScene:'2d',tBloom:'2d',tDepth:'depth',tShadow:'shadow',tAir:'2d'},colorFormat:'canvas',fs:WATER_COMPOSITE}));
    const pipes=[solidP,floorP,floorShadowP,shadowP,jellyP,bgP,downP,blurP,postP,kelpP,kelpShadowP,airP,airBlurP,dustP,diverP,diverShadowP,bubbleP];for(const p of pipes){if(g.finishPipelineAsync)await g.finishPipelineAsync(p);else g.finishPipeline(p);}
    makeNoiseTextures(g);
    meshes={};for(const name of ['floor','ground','plants','corals','manta','fish','jelly','diver','leaf']){const m=world[name];meshes[name]={vb:[g.buffer(m.verts,'vertex')],ib:g.buffer(m.idx,'index'),count:m.ni};}
    meshes.leaf.vb.push(g.buffer(world.leafInstances,'vertex'));meshes.leaf.instances=world.leafInstances.length/12;
  // Dynamic rule-based meadow that follows the diver: same leaf mesh + pipeline, a streamed instance buffer.
  scatterBuffer=g.buffer(world.scatter.data,'vertex');scatterCount=0;
    meshes.diver.vb.push(g.buffer(world.diver.skin,'vertex'));
    R.stats.triangles=Object.values(world).filter(m=>m&&m.ni).reduce((n,m)=>n+m.ni/3,0)+world.leaf.ni/3*meshes.leaf.instances;R.stats.meshBytes=Object.values(world).filter(m=>m&&m.verts).reduce((n,m)=>n+m.verts.byteLength+m.idx.byteLength,0)+world.leafInstances.byteLength;
    R.setLevel(1);return R;
  };
  R.setLevel=function(n){R.level=n;const g=R.g,res=n===0?2048:n===1?1536:1024;if(shadowT)g.destroyTarget(shadowT);if(shadowTex)g.destroyTexture(shadowTex);shadowTex=g.texture({w:res,h:res,format:'depth',filter:'linear',compare:true});shadowT=g.target({depth:shadowTex});R.shadowRes=res;};
  R.resize=function(w,h){w=Math.max(2,w|0);h=Math.max(2,h|0);if(w===R.W&&h===R.H)return;const g=R.g;for(const t of [scene,bloomAT,bloomBT,airAT,airBT])if(t)g.destroyTarget(t);for(const t of [color,depth,bloomA,bloomB,airA,airB])if(t)g.destroyTexture(t);R.W=canvas.width=w;R.H=canvas.height=h;const format=R.format;color=g.texture({w,h,format,filter:'linear'});depth=g.texture({w,h,format:'depth',filter:'nearest'});scene=g.target({color,depth});const bw=Math.max(2,w>>2),bh=Math.max(2,h>>2);bloomA=g.texture({w:bw,h:bh,format,filter:'linear'});bloomB=g.texture({w:bw,h:bh,format,filter:'linear'});bloomAT=g.target({color:bloomA});bloomBT=g.target({color:bloomB});airA=g.texture({w:bw,h:bh,format,filter:'linear'});airB=g.texture({w:bw,h:bh,format,filter:'linear'});airAT=g.target({color:airA});airBT=g.target({color:airB});g.resize();};
  function setGlobals(cam,time,diver){
    const environment=GardenScene.sample(time);sun.splice(0,3,...environment.sun);G.set([...environment.color.map(q=>q*(.10+.9*environment.day)),1],GOFF.sunCol);G.set([0,0,0,environment.day],GOFF.ambSky);
    const facing=diver?[Math.sin(diver.yaw)*Math.cos(diver.pitch),Math.sin(diver.pitch),-Math.cos(diver.yaw)*Math.cos(diver.pitch)]:[0,0,-1],lampPos=diver?v3.add(v3.mad(diver.pos,facing,.6),[0,.10,0]):[0,0,0];G.set([...lampPos,diver&&GardenScene.lamp?(.20+2.3*(1-environment.day)):0],GOFF.lamp);G.set([...v3.norm(v3.add(facing,[0,-.22,0])),0],GOFF.lampDir);
    const f=[Math.sin(cam.yaw)*Math.cos(cam.pitch),Math.sin(cam.pitch),-Math.cos(cam.yaw)*Math.cos(cam.pitch)],r=[Math.cos(cam.yaw),0,Math.sin(cam.yaw)],up=v3.cross(r,f),target=v3.add(cam.pos,f),aspect=R.W/R.H,proj=m4.perspective(cam.fov,aspect,CAM_NEAR,CAM_FAR),vp=m4.mul(proj,m4.lookAt(cam.pos,target,[0,1,0]));
    G.set(vp,GOFF.viewProj);G.set(m4.invert(vp),GOFF.invViewProj);G.set(vp,GOFF.prevViewProj);G.set([...cam.pos,time],GOFF.camPos);G.set([...r,Math.tan(cam.fov/2)],GOFF.camRight);G.set([...up,aspect],GOFF.camUp);G.set([...f,CAM_NEAR],GOFF.camFwd);G.set([...sun,1],GOFF.sunDir);G.set([R.W,R.H,1/R.W,1/R.H],GOFF.res);G.set([0,0,0,R.frame],GOFF.origin);
    const center=[8,-1,-20],eye=v3.mad(center,sun,70),shadow=m4.mul(m4.ortho(-46,46,-46,46,1,150),m4.lookAt(eye,center,[0,1,0]));G.set(shadow,GOFF.shadowVP);R.g.setGlobals(G);
  }
  function draw(p,name,at=[0,0,0,0],scale=1,pose=[0,0,0]){model.p=at;model.q=[scale,...pose];R.g.draw(p,{...meshes[name],u:model,tex:{tShadow:shadowTex,tDetail:Tex.detail,tBones:boneTex}});}
  // Snap the floor anchor to one grid cell so the moving patch never swims under the diver.
  const FLOOR_STEP=224/140;
  const camAnchor=[0,0,0];
  function floorUV(){return [Math.round(camAnchor[0]/FLOOR_STEP)*FLOOR_STEP,0,Math.round(camAnchor[2]/FLOOR_STEP)*FLOOR_STEP,0];}
  function drawFloor(){model.p=floorUV();model.q=[1,0,0,0];R.g.draw(floorP,{...meshes.floor,u:model,tex:{tShadow:shadowTex,tDetail:Tex.detail}});}
  function drawFloorShadow(){model.p=floorUV();model.q=[1,0,0,0];R.g.draw(floorShadowP,{...meshes.floor,u:model});}
  R.render=function(cam,time,diver){
    const g=R.g;if(g.lost)throw new Error('图形设备已中断，请重试。');R.time=time;R.frame++;setGlobals(cam,time,diver);g.beginFrame();
    camAnchor[0]=cam.pos[0];camAnchor[1]=cam.pos[1];camAnchor[2]=cam.pos[2];
    const mantaAt=[Math.sin(time*.075)*9,2.7+Math.sin(time*.2)*.65,-12-Math.cos(time*.075)*8,time*.075+.25];
    const fishAt=[-3+Math.sin(time*.08)*3,-1.3+Math.sin(time*.13)*.4,-32+Math.cos(time*.08)*2,time*.08];
    const diverAt=diver?[...diver.pos,-diver.yaw]:null,diverPose=diver?[diver.pitch,GardenDiver.rootY,diver.effort]:null;if(diver)g.updateTexture(boneTex,0,0,2,64,GardenDiver.bones(diver));
    g.beginPass(shadowT,{depth:1});drawFloorShadow();draw(shadowP,'ground');draw(shadowP,'plants');draw(kelpShadowP,'leaf');draw(shadowP,'corals');draw(shadowP,'manta',mantaAt);if(diver)draw(diverShadowP,'diver',diverAt,1,diverPose);g.endPass();
    // Stream rule-based meadow instances around the diver (deterministic world-cell hashing).
    scatterCount=world.scatter.update(cam.pos[0],cam.pos[2],time);
    if(scatterCount>0)g.updateBuffer(scatterBuffer,0,world.scatter.data.subarray(0,scatterCount*12));
    g.beginPass(scene,{color:[.015,.08,.12,1],depth:1});g.draw(bgP,{count:3,tex:{tShadow:shadowTex}});drawFloor();draw(solidP,'ground');draw(solidP,'plants');draw(kelpP,'leaf');draw(solidP,'corals');draw(solidP,'manta',mantaAt);
    if(scatterCount>0)g.draw(kelpP,{...meshes.leaf,vb:[meshes.leaf.vb[0],scatterBuffer],instances:scatterCount,tex:{tShadow:shadowTex,tDetail:Tex.detail}});
    draw(solidP,'fish',fishAt);draw(solidP,'fish',[23+Math.sin(time*.1)*2,-1.8,-40,time*.1+1],.55);
    draw(solidP,'fish',[-5+Math.cos(time*.06)*3,.6,-15,time*.06+2],.42);
    draw(solidP,'fish',[17+Math.sin(time*.09)*2.5,-2.6,-34,time*.09+.6],.38);
    draw(solidP,'fish',[2+Math.cos(time*.05)*4,2.2,-6,time*.05+1.7],.30);
    if(diver&&!cam.first)draw(diverP,'diver',diverAt,1,diverPose);
    GardenBubbles.update(diver,time);g.updateBuffer(bubbleBuffer,0,GardenBubbles.data);GardenBubbles.live.spans(GardenBubbles.head,(base,instances)=>g.draw(bubbleP,{count:4,instances,base,vb:[bubbleBuffer]}));
    // Back-to-front order, no depth writes for translucent jellyfish.
    for(const a of [[25,1,-41,0],[21,1.8,-35,0],[16,.3,-31,0]])draw(jellyP,'jelly',[a[0]+Math.sin(time*.12+a[0])*.4,a[1]+Math.sin(time*.3+a[0])*.3,a[2],time*.025],.65);
    if(R.level<2){g.draw(dustP,{count:4,instances:900,u:{p:[32,1,.32,0]},tex:{tShadow:shadowTex}});g.draw(dustP,{count:4,instances:120,u:{p:[8,.5,.20,0]},tex:{tShadow:shadowTex}});}
    g.endPass();
    g.beginPass(airAT,{color:[0,0,0,1]});if(R.level<2)g.draw(airP,{count:3,u:{p:[0,0,0,0]},tex:{tDepth:depth,tShadow:shadowTex,tDetail:Tex.detail}});g.endPass();g.beginPass(airBT,{color:[0,0,0,1]});g.draw(airBlurP,{count:3,u:{p:[1/airA.w,1/airA.h,0,0]},tex:{tA:airA}});g.endPass();
    g.beginPass(bloomAT,{color:[0,0,0,1]});g.draw(downP,{count:3,u:{p:[1/R.W,1/R.H,0,0]},tex:{tA:color}});g.endPass();g.beginPass(bloomBT,{color:[0,0,0,1]});g.draw(blurP,{count:3,u:{p:[1/bloomA.w,1/bloomA.h,0,0]},tex:{tA:bloomA}});g.endPass();
    g.beginPass(null,{color:[0,0,0,1]});g.draw(postP,{count:3,u:{p:[1.14,R.level===2?.12:.22,R.level===2?0:0.7,R.level===2?0:1]},tex:{tScene:color,tBloom:bloomB,tDepth:depth,tShadow:shadowTex,tAir:airB}});g.endPass();g.endFrame();
    R.stats.drawCalls=24;
  };
  R.resetForRetry=function(){if(R.g&&R.g.device)R.g.device.destroy();R.g=null;R.W=R.H=0;scene=depth=color=shadowTex=shadowT=bloomA=bloomB=bloomAT=bloomBT=airA=airB=airAT=airBT=null;};
  R.capture=async function(){const g=R.g;if(g.caps.backend==='webgl2')return g.capture();const cv=document.createElement('canvas');cv.width=R.W;cv.height=R.H;const ctx=cv.getContext('2d');ctx.drawImage(canvas,0,0);return {w:R.W,h:R.H,data:ctx.getImageData(0,0,R.W,R.H).data};};
  return R;
})();


