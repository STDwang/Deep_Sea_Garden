// A bounded, spatially varying flow field. CPU swimming and GPU plants use the same modes.
// This is an analytic flow approximation, not a Navier–Stokes fluid simulation.
const GardenCurrent={
  sample(p,t){const [x,y,z]=p,a=x*.13+z*.09-t*.31,b=z*.21-x*.07+t*.19,e=x*.31+z*.27-t*.47,k=.65+.35*Math.exp(-Math.max(-y,0)*.12);return [(.10+.13*Math.sin(a)+.055*Math.cos(b))*k,.018*Math.sin(e*.7),(.035+.105*Math.cos(a*.83)+.07*Math.sin(b))*k];},
  ssl:`
fn seaFlow(p:vec3f,t:f32)->vec3f {
  let a:f32=p.x*0.13+p.z*0.09-t*0.31;let b:f32=p.z*0.21-p.x*0.07+t*0.19;let e:f32=p.x*0.31+p.z*0.27-t*0.47;
  let k:f32=0.65+0.35*exp(-max(-p.y,0.0)*0.12);
  return vec3f((0.10+0.13*sin(a)+0.055*cos(b))*k,0.018*sin(e*0.7),(0.035+0.105*cos(a*0.83)+0.07*sin(b))*k);
}
fn plantOffset(p:vec3f,h:f32,seed:f32)->vec3f {
  let t:f32=U.camPos.w-h*(0.065+0.035*sin(seed));
  let root:vec3f=vec3f(p.x,p.y-h,p.z);
  let flow:vec3f=seaFlow(root,t)*0.65+seaFlow(root,t-0.85)*0.35;
  let compliance:f32=0.68+0.32*sin(seed*1.7+0.8);
  let reach:f32=pow(max(h,0.0),1.32)*0.20*compliance;
  let ripple:f32=sin(t*(0.55+0.12*sin(seed))+h*0.72+seed)*0.025*h;
  return vec3f(flow.x*reach+ripple, -min(dot(flow.xz,flow.xz)*reach*reach*0.045,h*0.10),flow.z*reach+ripple*0.45);
}`
};
