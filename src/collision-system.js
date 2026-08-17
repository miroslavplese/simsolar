(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  root.CollisionSystem=api;
})(typeof globalThis!=='undefined' ? globalThis : this,function(){
  const SOLAR_MASS_KG=1.98847e30;
  const SOLAR_RADIUS_KM=696340;
  const EARTH_MASS_KG=5.97237e24;
  const EARTH_RADIUS_KM=6371;
  const G_KM3_KG_S2=6.67430e-20;
  const LIGHT_SPEED_KM_S=299792.458;

  function relativeVector(a,b){
    return {x:a.x-b.x,y:a.y-b.y,z:a.z-b.z};
  }

  function sweptSphereImpact(startA,endA,startB,endB,radius){
    if(!(radius>0)) throw new RangeError('Collision radius must be positive.');
    const start=relativeVector(startA,startB);
    const end=relativeVector(endA,endB);
    const delta={
      x:end.x-start.x,y:end.y-start.y,z:end.z-start.z
    };
    const c=start.x**2+start.y**2+start.z**2-radius**2;
    if(c<=0) return {fraction:0,distance:Math.sqrt(Math.max(0,c+radius**2))};
    const a=delta.x**2+delta.y**2+delta.z**2;
    if(a===0) return null;
    const b=2*(start.x*delta.x+start.y*delta.y+start.z*delta.z);
    const discriminant=b*b-4*a*c;
    if(discriminant<0) return null;
    const root=Math.sqrt(discriminant);
    const first=(-b-root)/(2*a);
    const second=(-b+root)/(2*a);
    const fraction=first>=0&&first<=1
      ? first
      : second>=0&&second<=1
        ? second
        : null;
    if(fraction===null) return null;
    return {fraction,distance:radius};
  }

  function refinedSweptSphereImpact(
    startTime,endTime,sampleA,sampleB,radius,maxDepth
  ){
    if(!(endTime>=startTime)){
      throw new RangeError('Impact interval must not run backward.');
    }
    const depthLimit=maxDepth===undefined ? 12 : maxDepth;
    const startA=sampleA(startTime), endA=sampleA(endTime);
    const startB=sampleB(startTime), endB=sampleB(endTime);
    if(!startA || !endA || !startB || !endB) return null;

    function search(t0,t1,a0,a1,b0,b1,depth){
      const hit=sweptSphereImpact(a0,a1,b0,b1,radius);
      if(!hit) return null;
      const candidateTime=t0+(t1-t0)*hit.fraction;
      const candidateA=sampleA(candidateTime);
      const candidateB=sampleB(candidateTime);
      if(!candidateA || !candidateB) return null;
      const actualDistance=Math.hypot(
        candidateA.x-candidateB.x,
        candidateA.y-candidateB.y,
        candidateA.z-candidateB.z
      );
      if(actualDistance<=radius*(1+1e-7)){
        return {
          time:candidateTime,
          fraction:(candidateTime-startTime)/(endTime-startTime||1),
          distance:actualDistance
        };
      }
      if(depth>=depthLimit) return null;
      const midpoint=(t0+t1)/2;
      const midpointA=sampleA(midpoint);
      const midpointB=sampleB(midpoint);
      if(!midpointA || !midpointB) return null;
      return search(
        t0,midpoint,a0,midpointA,b0,midpointB,depth+1
      ) || search(
        midpoint,t1,midpointA,a1,midpointB,b1,depth+1
      );
    }

    return search(startTime,endTime,startA,endA,startB,endB,0);
  }

  function linearImpactTime(a,b,radius,maxDays){
    if(!(radius>0)) throw new RangeError('Collision radius must be positive.');
    const position=relativeVector(a,b);
    const velocity={
      x:(a.vx||0)-(b.vx||0),
      y:(a.vy||0)-(b.vy||0),
      z:(a.vz||0)-(b.vz||0)
    };
    const c=position.x**2+position.y**2+position.z**2-radius**2;
    if(c<=0) return 0;
    const quadratic=velocity.x**2+velocity.y**2+velocity.z**2;
    if(quadratic===0) return null;
    const linear=2*(
      position.x*velocity.x+
      position.y*velocity.y+
      position.z*velocity.z
    );
    if(linear>=0) return null;
    const discriminant=linear**2-4*quadratic*c;
    if(discriminant<0) return null;
    const time=(-linear-Math.sqrt(discriminant))/(2*quadratic);
    if(time<0 || (maxDays!==undefined && time>maxDays)) return null;
    return time;
  }

  function impactStillInProgress(a,b,radius){
    if(!(radius>0)) throw new RangeError('Collision radius must be positive.');
    const position=relativeVector(a,b);
    const distanceSq=
      position.x**2+position.y**2+position.z**2;
    if(distanceSq<=radius**2*(1+1e-9)) return true;
    const velocity={
      x:(a.vx||0)-(b.vx||0),
      y:(a.vy||0)-(b.vy||0),
      z:(a.vz||0)-(b.vz||0)
    };
    return position.x*velocity.x+
      position.y*velocity.y+
      position.z*velocity.z<0;
  }

  function mergeKinematics(a,b){
    const totalMu=a.mu+b.mu;
    if(!(a.mu>0) || !(b.mu>0) || !(totalMu>0)){
      throw new RangeError('Merged bodies require positive gravitational parameters.');
    }
    const merged={mu:totalMu};
    for(const key of ['x','y','z','vx','vy','vz']){
      merged[key]=(a.mu*a[key]+b.mu*b[key])/totalMu;
    }
    return merged;
  }

  function mergedRadius(radiusA,radiusB){
    if(!(radiusA>0) || !(radiusB>0)){
      throw new RangeError('Merged radii must be positive.');
    }
    return Math.cbrt(radiusA**3+radiusB**3);
  }

  function estimatedRadiusKm(appearance,massKg){
    if(!(massKg>0) || !Number.isFinite(massKg)){
      throw new RangeError('Body mass must be positive and finite.');
    }
    if(appearance==='black-hole'){
      return 2*G_KM3_KG_S2*massKg/(LIGHT_SPEED_KM_S**2);
    }
    if(appearance==='star'){
      return SOLAR_RADIUS_KM*(massKg/SOLAR_MASS_KG)**0.8;
    }
    if(appearance==='comet'){
      const densityKgKm3=500*1e9;
      return Math.cbrt(3*massKg/(4*Math.PI*densityKgKm3));
    }
    return EARTH_RADIUS_KM*Math.cbrt(massKg/EARTH_MASS_KG);
  }

  return {
    sweptSphereImpact,refinedSweptSphereImpact,
    linearImpactTime,impactStillInProgress,mergeKinematics,
    mergedRadius,estimatedRadiusKm
  };
});
