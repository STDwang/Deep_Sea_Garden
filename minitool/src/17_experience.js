// Underwater adaptations of Cold Smoke's day cycle, Views, pause/photo and quality governor.
const GardenScene={light:0,lamp:true,auto:false,
  sample(time){const phases=[.8,.13,-.55],a=this.auto?Math.sin(time/180+.93):phases[this.light],day=smooth(-.12,.55,a),warm=1-smooth(.08,.5,a);return {day,warm,sun:v3.norm([-.28,Math.max(.18,Math.abs(a)), -.34]),color:[.35+day*.65,.50+day*.40-warm*.10,.70+day*.08-warm*.20]};}
};
const GardenQuality={auto:true,scale:1,elapsed:0,slow:0,count:0,room:0,raised:false,
  observe(dt){if(!this.auto||dt>.25)return;this.elapsed+=dt;this.count++;if(dt>.035)this.slow++;this.room=dt<.020?this.room+dt:Math.max(0,this.room-dt*3);
    if(this.elapsed>6){if(this.slow/this.count>.25){if(this.scale>.76){this.scale=Math.max(.75,this.scale*.9);fit();}else if(Garden.level<2){this.scale=1;setLevel(Garden.level+1);}this.room=0;}this.elapsed=this.count=this.slow=0;}
    if(this.room>45&&!this.raised){if(this.scale<1){this.scale=Math.min(1,this.scale+.1);fit();}else if(Garden.level>0){setLevel(Garden.level-1);this.raised=true;}this.room=0;}
  },cycle(){if(this.auto){this.auto=false;setLevel(0);}else if(Garden.level<2)setLevel(Garden.level+1);else{this.auto=true;this.scale=1;setLevel(0);}this.elapsed=this.count=this.slow=this.room=0;}
};
