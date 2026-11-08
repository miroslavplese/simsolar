(function(root,factory){
  const api={create:factory};
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.SimSolarRings=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(deps){
  'use strict';

  const {window}=deps;
  const {AU_KM}=window.TrajectoryMath;
  const {normalizeVector,pointInSphereShadow,ringLightFactor}=window.BodyLighting;
  const {
    PLANETARY_RINGS,relativePoint:ringRelativePoint,outerRadiusKm:ringOuterRadiusKm,
    normalVector:ringNormalVector,viewDepth:ringViewDepth
  }=window.RingSystem;
  const {projectDirection:projectObservatoryDirection}=window.ObservatoryMode;
  const {dominantLightBody}=window.SystemModel;
  const {AU_PX}=deps.constants;
  const {project}=deps.camera;
  const {ctx}=deps.viewport;
  const {hexToRgba}=deps.surfaces;
  const {activeSystemBodies,positionForBody}=deps.simulation;

  function planetRingGeometry(body,pos,scr,scaleBlend){
    const ring=PLANETARY_RINGS[body.name];
    if(!ring || scaleBlend<1) return null;
    const outerPixels=ringOuterRadiusKm(ring)/AU_KM*AU_PX*deps.camera.zoom;
    if(scr.x+outerPixels<0 || scr.x-outerPixels>deps.viewport.W ||
       scr.y+outerPixels<0 || scr.y-outerPixels>deps.viewport.H) return null;
    const segments=96;
    const sunDirection=normalizeVector({x:-pos.x,y:-pos.y,z:-pos.z});
    const lightFactor=ringLightFactor(
      ringNormalVector(ring),sunDirection
    );
    const planetRadiusAu=body.radius/AU_KM;
    return {
      scaleBlend,
      centerDepth:scr.depth,
      lightFactor,
      bands:ring.bands.map(band=>{
        const outer=[], inner=[], shadowed=[];
        for(let i=0;i<=segments;i++){
          const angle=Math.PI*2*i/segments;
          const outerRelative=ringRelativePoint(ring,band.outerKm,angle);
          const innerRelative=ringRelativePoint(ring,band.innerKm,angle);
          outer.push(project(
            pos.x+outerRelative.x,pos.y+outerRelative.y,pos.z+outerRelative.z
          ));
          inner.push(project(
            pos.x+innerRelative.x,pos.y+innerRelative.y,pos.z+innerRelative.z
          ));
          if(i<segments){
            const centerRelative=ringRelativePoint(
              ring,(band.innerKm+band.outerKm)/2,
              Math.PI*2*(i+0.5)/segments
            );
            shadowed.push(pointInSphereShadow(
              centerRelative,sunDirection,planetRadiusAu
            ));
          }
        }
        return {band,outer,inner,shadowed};
      })
    };
  }

  function drawPlanetRingSide(geometry,front){
    if(!geometry) return;
    for(const {band,outer,inner,shadowed} of geometry.bands){
      for(const shadowPass of [false,true]){
        ctx.beginPath();
        for(let i=0;i<outer.length-1;i++){
          const relativeDepth=(
            outer[i].depth+outer[i+1].depth+
            inner[i].depth+inner[i+1].depth
          )/4-geometry.centerDepth;
          if((relativeDepth>=0)!==front || shadowed[i]!==shadowPass) continue;
          ctx.moveTo(outer[i].x,outer[i].y);
          ctx.lineTo(outer[i+1].x,outer[i+1].y);
          ctx.lineTo(inner[i+1].x,inner[i+1].y);
          ctx.lineTo(inner[i].x,inner[i].y);
          ctx.closePath();
        }
        ctx.fillStyle=shadowPass
          ? `rgba(4,6,12,${Math.min(0.85,band.alpha*1.7*geometry.scaleBlend)})`
          : hexToRgba(
            band.color,
            band.alpha*geometry.scaleBlend*geometry.lightFactor
          );
        ctx.fill();
      }
    }
  }

  function observatoryPlanetRingGeometry(
    body,position,observerPosition,camera,fov,viewDirection
  ){
    const ring=PLANETARY_RINGS[body.name];
    if(!ring) return null;
    const lightBody=dominantLightBody(activeSystemBodies());
    const lightPosition=lightBody &&
      positionForBody(lightBody,deps.clock.simDaysSinceJ2000);
    const lightDirection=lightPosition && normalizeVector({
      x:lightPosition.x-position.x,
      y:lightPosition.y-position.y,
      z:lightPosition.z-position.z
    });
    const lightFactor=lightDirection
      ? ringLightFactor(ringNormalVector(ring),lightDirection)
      : 1;
    const planetRadiusAu=body.radius/AU_KM;
    const segments=96;
    const projectRelative=relative=>{
      const projected=projectObservatoryDirection(
        deps.observatoryRenderer.observatoryDirection(observerPosition,{
          x:position.x+relative.x,
          y:position.y+relative.y,
          z:position.z+relative.z
        }),
        camera,deps.viewport.W,deps.viewport.H,fov
      );
      if(!projected) return null;
      projected.depth=ringViewDepth(relative,viewDirection);
      return projected;
    };
    const bands=[];
    for(const band of ring.bands){
      const outer=[],inner=[],shadowed=[];
      for(let i=0;i<=segments;i++){
        const angle=Math.PI*2*i/segments;
        const outerRelative=ringRelativePoint(ring,band.outerKm,angle);
        const innerRelative=ringRelativePoint(ring,band.innerKm,angle);
        const outerProjected=projectRelative(outerRelative);
        const innerProjected=projectRelative(innerRelative);
        if(!outerProjected || !innerProjected) return null;
        outer.push(outerProjected);
        inner.push(innerProjected);
        if(i<segments){
          const centerRelative=ringRelativePoint(
            ring,(band.innerKm+band.outerKm)/2,
            Math.PI*2*(i+0.5)/segments
          );
          shadowed.push(
            lightDirection
              ? pointInSphereShadow(
                  centerRelative,lightDirection,planetRadiusAu
                )
              : false
          );
        }
      }
      bands.push({band,outer,inner,shadowed});
    }
    return {scaleBlend:1,centerDepth:0,lightFactor,bands};
  }

  return {
    observatoryPlanetRingGeometry,
    drawPlanetRingSide,
    planetRingGeometry
  };
});
