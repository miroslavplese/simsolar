(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  root.ViewTransform=api;
})(typeof globalThis!=='undefined' ? globalThis : this,function(){
  const MIN_TILT=5*Math.PI/180;
  const MAX_TILT=175*Math.PI/180;

  function viewCoordinates(x,y,z,yaw,tilt){
    const cosYaw=Math.cos(yaw), sinYaw=Math.sin(yaw);
    const cosTilt=Math.cos(tilt), sinTilt=Math.sin(tilt);
    const rotatedX=x*cosYaw-y*sinYaw;
    const rotatedY=x*sinYaw+y*cosYaw;
    return {
      x:rotatedX,
      y:rotatedY*cosTilt-z*sinTilt,
      depth:rotatedY*sinTilt+z*cosTilt
    };
  }

  function rotationFromDrag(startYaw,startTilt,deltaX,deltaY,sensitivity){
    const scale=sensitivity||0.006;
    return {
      yaw:startYaw+deltaX*scale,
      tilt:Math.max(MIN_TILT,Math.min(MAX_TILT,startTilt+deltaY*scale))
    };
  }

  function panForRotationPivot(anchorX,anchorY,pivot,yaw,tilt,pixelsPerUnit,centerX,centerY){
    const view=viewCoordinates(pivot.x,pivot.y,pivot.z,yaw,tilt);
    return {
      panX:anchorX-centerX-view.x*pixelsPerUnit,
      panY:anchorY-centerY-view.y*pixelsPerUnit
    };
  }

  function fitViewToPoints(points,options){
    const projected=points
      .filter(point=>
        Number.isFinite(point.x) &&
        Number.isFinite(point.y) &&
        Number.isFinite(point.z)
      )
      .map(point=>viewCoordinates(
        point.x,point.y,point.z,options.yaw,options.tilt
      ));
    if(!projected.length) return null;
    const xs=projected.map(point=>point.x);
    const ys=projected.map(point=>point.y);
    const minX=Math.min(...xs), maxX=Math.max(...xs);
    const minY=Math.min(...ys), maxY=Math.max(...ys);
    const width=Math.max(1,options.right-options.left);
    const height=Math.max(1,options.bottom-options.top);
    const spanX=maxX-minX;
    const spanY=maxY-minY;
    const zoom=Math.max(options.minZoom,Math.min(
      options.maxZoom,
      spanX>1e-12 ? width/(spanX*options.pixelsPerUnit) : options.maxZoom,
      spanY>1e-12 ? height/(spanY*options.pixelsPerUnit) : options.maxZoom
    ));
    const targetX=(options.left+options.right)/2;
    const targetY=(options.top+options.bottom)/2;
    return {
      zoom,
      panX:targetX-options.centerX-(minX+maxX)/2*options.pixelsPerUnit*zoom,
      panY:targetY-options.centerY-(minY+maxY)/2*options.pixelsPerUnit*zoom
    };
  }

  return {
    MIN_TILT,MAX_TILT,viewCoordinates,rotationFromDrag,panForRotationPivot,
    fitViewToPoints
  };
});
