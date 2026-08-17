(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  root.OccultationSystem=api;
})(typeof globalThis!=='undefined' ? globalThis : this,function(){
  function clamp(value,min,max){
    return Math.max(min,Math.min(max,value));
  }

  function vectorFrom(observer,target){
    return {
      x:target.x-observer.x,
      y:target.y-observer.y,
      z:target.z-observer.z
    };
  }

  function angularRadius(radius,distance){
    if(!(radius>0) || !(distance>radius)){
      throw new RangeError('Angular radius requires a positive radius and exterior observer.');
    }

    return Math.asin(clamp(radius/distance,0,1));
  }

  function apparentSeparation(observer,targetA,targetB){
    const a=vectorFrom(observer,targetA);
    const b=vectorFrom(observer,targetB);
    const distanceA=Math.hypot(a.x,a.y,a.z);
    const distanceB=Math.hypot(b.x,b.y,b.z);
    if(!(distanceA>0) || !(distanceB>0)){
      throw new RangeError('Apparent separation requires distinct targets.');
    }
    const cosine=clamp(
      (a.x*b.x+a.y*b.y+a.z*b.z)/(distanceA*distanceB),-1,1
    );
    return Math.acos(cosine);
  }

  function circleOverlapArea(radiusA,radiusB,separation){
    if(separation>=radiusA+radiusB) return 0;
    if(separation<=Math.abs(radiusA-radiusB)){
      return Math.PI*Math.min(radiusA,radiusB)**2;
    }
    const a=radiusA**2*Math.acos(clamp(
      (separation**2+radiusA**2-radiusB**2)/(2*separation*radiusA),-1,1
    ));
    const b=radiusB**2*Math.acos(clamp(
      (separation**2+radiusB**2-radiusA**2)/(2*separation*radiusB),-1,1
    ));
    const lens=Math.sqrt(
      (-separation+radiusA+radiusB)*
      (separation+radiusA-radiusB)*
      (separation-radiusA+radiusB)*
      (separation+radiusA+radiusB)
    )/2;
    return a+b-lens;
  }

  function apparentOccultation(
    observer,source,occulter,sourceRadius,occulterRadius
  ){
    const sourceVector=vectorFrom(observer,source);
    const occulterVector=vectorFrom(observer,occulter);
    const sourceDistance=Math.hypot(
      sourceVector.x,sourceVector.y,sourceVector.z
    );
    const occulterDistance=Math.hypot(
      occulterVector.x,occulterVector.y,occulterVector.z
    );
    if(!(occulterDistance<sourceDistance)){
      return {
        visible:false,clearance:Infinity,coverage:0,
        sourceDistance,occulterDistance
      };
    }
    const sourceAngularRadius=angularRadius(sourceRadius,sourceDistance);
    const occulterAngularRadius=angularRadius(
      occulterRadius,occulterDistance
    );
    const cosine=clamp(
      (
        sourceVector.x*occulterVector.x+
        sourceVector.y*occulterVector.y+
        sourceVector.z*occulterVector.z
      )/(sourceDistance*occulterDistance),
      -1,1
    );
    const separation=Math.acos(cosine);
    const clearance=separation-sourceAngularRadius-occulterAngularRadius;
    const overlap=circleOverlapArea(
      sourceAngularRadius,occulterAngularRadius,separation
    );
    const coverage=overlap/(Math.PI*sourceAngularRadius**2);
    let geometry='none';
    if(clearance<=0){
      if(
        occulterAngularRadius>=sourceAngularRadius &&
        separation<=occulterAngularRadius-sourceAngularRadius
      ){
        geometry='total';
      } else if(
        sourceAngularRadius>occulterAngularRadius &&
        separation<=sourceAngularRadius-occulterAngularRadius
      ){
        geometry='contained';
      } else {
        geometry='partial';
      }
    }
    return {
      visible:clearance<=0,geometry,clearance,coverage,
      separation,sourceAngularRadius,occulterAngularRadius,
      sourceDistance,occulterDistance
    };
  }

  function goldenMinimum(evaluate,left,right,iterations){
    const ratio=(Math.sqrt(5)-1)/2;
    let x1=right-ratio*(right-left);
    let x2=left+ratio*(right-left);
    let f1=evaluate(x1).clearance;
    let f2=evaluate(x2).clearance;
    for(let index=0;index<(iterations||36);index++){
      if(f1<f2){
        right=x2;
        x2=x1;
        f2=f1;
        x1=right-ratio*(right-left);
        f1=evaluate(x1).clearance;
      } else {
        left=x1;
        x1=x2;
        f1=f2;
        x2=left+ratio*(right-left);
        f2=evaluate(x2).clearance;
      }
    }
    const time=(left+right)/2;
    return {time,geometry:evaluate(time)};
  }

  function findOccultationEvents(options){
    const {start,end,step,evaluate}=options;
    if(!(end>start) || !(step>0)){
      throw new RangeError('Event search requires an increasing range and positive step.');
    }
    const samples=[];
    for(let time=start;time<end;time+=step){
      samples.push({time,geometry:evaluate(time)});
    }
    samples.push({time:end,geometry:evaluate(end)});
    const events=[];
    for(let index=1;index<samples.length-1;index++){
      const before=samples[index-1];
      const current=samples[index];
      const after=samples[index+1];
      if(
        current.geometry.clearance>before.geometry.clearance ||
        current.geometry.clearance>after.geometry.clearance
      ) continue;
      const minimum=goldenMinimum(
        evaluate,before.time,after.time,options.iterations
      );
      if(!minimum.geometry.visible) continue;
      if(
        events.length &&
        Math.abs(events[events.length-1].time-minimum.time)<step
      ){
        if(
          minimum.geometry.clearance<
          events[events.length-1].geometry.clearance
        ) events[events.length-1]=minimum;
      } else {
        events.push(minimum);
      }
    }
    return events;
  }

  return {
    angularRadius,apparentSeparation,circleOverlapArea,apparentOccultation,
    goldenMinimum,findOccultationEvents
  };
});
