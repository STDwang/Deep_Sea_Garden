// Cold Smoke LiveRing particle allocation and alive-span drawing, adapted to regulator bubbles.
const GardenBubbles=(()=>{const N=96,stride=12,data=new Float32Array(N*stride),live=LiveRing(N,stride),rnd=RNG(810);let head=0,last=0,next=0;
  return {data,live,get head(){return head;},update(d,t){if(t<last||t-last>2){live.clear();next=t;}last=t;live.trim(data,head,t);if(!d)return;
    const sp=!!d.sprint,per=sp?1.2:4.4,ph=t%per,win=sp?(ph<.98):(ph>1.1&&ph<2.7);
    if(win&&t>=next){next=t+(sp?.045:.10);const f=[Math.sin(d.yaw)*Math.cos(d.pitch),Math.sin(d.pitch),-Math.cos(d.yaw)*Math.cos(d.pitch)],p=sp?v3.add(v3.mad(d.pos,f,-.55),[(rnd()-.5)*.30,(rnd()-.5)*.22,(rnd()-.5)*.30]):v3.add(v3.mad(d.pos,f,.67),[0,-.07,0]),o=head*stride,flow=GardenCurrent.sample(p,t);data.set([...p,t,flow[0]*.5,(sp?.55:.24)+rnd()*.12,flow[2]*.5,(sp?.006:.010)+rnd()*.014,rnd()*TAU,0,sp?2.6:4.5,0],o);head=(head+1)%N;live.put();}
  }};
})();
