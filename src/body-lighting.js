(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  root.BodyLighting=api;
})(typeof globalThis!=='undefined' ? globalThis : this,function(){
  function normalizeVector(vector){
    const length=Math.hypot(vector.x,vector.y,vector.z);
    if(length===0) return {x:0,y:0,z:0};
    return {x:vector.x/length,y:vector.y/length,z:vector.z/length};
  }

  function sphereBrightness(normal,lightDirection,ambient){
    const light=normalizeVector(lightDirection);
    const diffuse=Math.max(
      0,normal.x*light.x+normal.y*light.y+normal.z*light.z
    );
    const base=ambient===undefined?0.08:ambient;
    return base+(1-base)*diffuse;
  }

  function pointInSphereShadow(point,lightDirection,sphereRadius){
    const light=normalizeVector(lightDirection);
    const projection=-(point.x*light.x+point.y*light.y+point.z*light.z);
    if(projection<=0) return false;
    const distanceSq=point.x*point.x+point.y*point.y+point.z*point.z-
      projection*projection;
    return distanceSq<sphereRadius*sphereRadius;
  }

  function ringLightFactor(normal,lightDirection,ambient){
    const n=normalizeVector(normal);
    const light=normalizeVector(lightDirection);
    const incidence=Math.abs(n.x*light.x+n.y*light.y+n.z*light.z);
    const base=ambient===undefined?0.18:ambient;
    return base+(1-base)*incidence;
  }

  function shadowConeMayIntersectTarget(
    lightPosition,lightRadius,occluderPosition,occluderRadius,targetRadius
  ){
    targetRadius=targetRadius===undefined?1:targetRadius;
    const lightDistance=Math.hypot(
      lightPosition.x,lightPosition.y,lightPosition.z
    );
    if(
      !(lightDistance>0) || !(lightRadius>0) ||
      !(occluderRadius>0) || !(targetRadius>0)
    ) return false;
    const lightDirection={
      x:lightPosition.x/lightDistance,
      y:lightPosition.y/lightDistance,
      z:lightPosition.z/lightDistance
    };
    const along=
      occluderPosition.x*lightDirection.x+
      occluderPosition.y*lightDirection.y+
      occluderPosition.z*lightDirection.z;
    if(along<=targetRadius || along>=lightDistance) return false;
    const perpendicular=Math.hypot(
      occluderPosition.x-lightDirection.x*along,
      occluderPosition.y-lightDirection.y*along,
      occluderPosition.z-lightDirection.z*along
    );
    const stellarConeRadius=lightRadius*along/lightDistance;
    return perpendicular<=
      targetRadius+occluderRadius+stellarConeRadius;
  }

  return {
    normalizeVector,sphereBrightness,pointInSphereShadow,ringLightFactor,
    shadowConeMayIntersectTarget
  };
});
