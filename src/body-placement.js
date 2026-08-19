(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.BodyPlacement=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  function cross(a,b){
    return {
      x:a.y*b.z-a.z*b.y,
      y:a.z*b.x-a.x*b.z,
      z:a.x*b.y-a.y*b.x
    };
  }

  function inclinedVelocity(position,planarVelocity,inclination){
    if(!Number.isFinite(inclination) || inclination<0 || inclination>Math.PI){
      throw new RangeError('Inclination must be between 0 and 180 degrees.');
    }
    const radius=Math.hypot(position.x,position.y,position.z);
    if(!(radius>0)) throw new RangeError('Placement radius must be positive.');
    const axis={
      x:position.x/radius,y:position.y/radius,z:position.z/radius
    };
    const baseNormal=cross(position,planarVelocity);
    const rotation=baseNormal.z>=0
      ? inclination
      : Math.PI-inclination;
    const cosine=Math.cos(rotation);
    const sine=Math.sin(rotation);
    const axisCrossVelocity=cross(axis,planarVelocity);
    const axisDotVelocity=
      axis.x*planarVelocity.x+
      axis.y*planarVelocity.y+
      axis.z*planarVelocity.z;
    return {
      x:planarVelocity.x*cosine+
        axisCrossVelocity.x*sine+
        axis.x*axisDotVelocity*(1-cosine),
      y:planarVelocity.y*cosine+
        axisCrossVelocity.y*sine+
        axis.y*axisDotVelocity*(1-cosine),
      z:planarVelocity.z*cosine+
        axisCrossVelocity.z*sine+
        axis.z*axisDotVelocity*(1-cosine)
    };
  }

  function orbitalInclination(position,velocity){
    const angularMomentum=cross(position,velocity);
    const magnitude=Math.hypot(
      angularMomentum.x,angularMomentum.y,angularMomentum.z
    );
    if(!(magnitude>0)) return null;
    return Math.acos(Math.max(
      -1,Math.min(1,angularMomentum.z/magnitude)
    ));
  }

  return {inclinedVelocity,orbitalInclination};
});
