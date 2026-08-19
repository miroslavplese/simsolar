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

  return {
    AU_KM,smoothstep,physicalRadiusPixels,planetMarkerRadiusPixels,
    customMarkerRadiusPixels,
    displayRadiusPixels,
    distanceToSegment,distanceToPolyline
  };
});
