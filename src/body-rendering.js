(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  root.BodyRendering=api;
})(typeof globalThis!=='undefined' ? globalThis : this,function(){
  const AU_KM=1.495978707e8;

  function smoothstep(start,end,value){
    if(value<=start) return 0;
    if(value>=end) return 1;
    const t=(value-start)/(end-start);
    return t*t*(3-2*t);
  }

  function physicalRadiusPixels(radiusKm,zoom,auPixels){
    return radiusKm/AU_KM*zoom*auPixels;
  }

  function zoomForPhysicalRadius(radiusKm,auPixels,targetPixels,maxZoom){
    if(!(radiusKm>0) || !(auPixels>0)) return null;
    const zoom=(targetPixels||70)*AU_KM/(radiusKm*auPixels);
    return Math.min(maxZoom||2000000,zoom);
  }

  function maximumZoomForRadius(options){
    const baseMaximum=options.baseMaximum||20000;
    const hardMaximum=options.hardMaximum||2000000;
    if(!(options.radiusKm>0) || !(options.auPixels>0) ||
       !(options.viewportPixels>0)) return baseMaximum;
    const targetRadius=options.viewportPixels*(options.targetFraction||0.42);
    const bodyMaximum=targetRadius*AU_KM/(options.radiusKm*options.auPixels);
    return Math.min(hardMaximum,Math.max(baseMaximum,bodyMaximum));
  }

  function planetMarkerRadiusPixels(radiusKm){
    return Math.max(2.2,Math.min(Math.sqrt(radiusKm)*0.022,22));
  }

  function customMarkerRadiusPixels(appearance){
    if(appearance==='star') return 7;
    if(appearance==='black-hole') return 6;
    return 5;
  }

  function displayRadiusPixels(options){
    const physical=physicalRadiusPixels(
      options.radiusKm,options.zoom,options.auPixels
    );
    const systemPixels=(options.systemRadiusAu||0)*options.zoom*options.auPixels;
    const blend=systemPixels>0
      ? smoothstep(20,50,systemPixels)
      : smoothstep(2,8,physical);
    return {
      radius:blend===1?physical:options.markerRadius,
      physicalRadius:physical,
      scaleBlend:blend,
      scaleAccurate:blend===1
    };
  }

  function circleIntersectsViewport(x,y,radius,width,height){
    if(
      !Number.isFinite(x) || !Number.isFinite(y) ||
      !Number.isFinite(radius) || radius<0 ||
      !(width>=0) || !(height>=0)
    ) return false;
    return x+radius>=0 && x-radius<=width &&
      y+radius>=0 && y-radius<=height;
  }

  function distanceToSegment(px,py,x1,y1,x2,y2){
    const dx=x2-x1;
    const dy=y2-y1;
    const lengthSq=dx*dx+dy*dy;
    const t=lengthSq>0
      ? Math.max(0,Math.min(1,((px-x1)*dx+(py-y1)*dy)/lengthSq))
      : 0;
    return Math.hypot(px-(x1+t*dx),py-(y1+t*dy));
  }

  function distanceToPolyline(px,py,points){
    let closest=Infinity;
    for(let i=0;i<points.length-1;i++){
      closest=Math.min(closest,distanceToSegment(
        px,py,points[i].x,points[i].y,points[i+1].x,points[i+1].y
      ));
    }
    return closest;
  }

  function pathSegmentsByDepth(points,centerDepth,front){
    const segments=[];
    for(let i=0;i<points.length-1;i++){
      const averageDepth=(points[i].depth+points[i+1].depth)/2;
      if((averageDepth>=centerDepth)===front){
        segments.push([points[i],points[i+1]]);
      }
    }
    return segments;
  }

  return {
    AU_KM,smoothstep,physicalRadiusPixels,zoomForPhysicalRadius,
    planetMarkerRadiusPixels,
    maximumZoomForRadius,customMarkerRadiusPixels,
    displayRadiusPixels,
    circleIntersectsViewport,
    distanceToSegment,distanceToPolyline,pathSegmentsByDepth
  };
});
