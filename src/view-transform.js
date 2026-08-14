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

  return {
    MIN_TILT,MAX_TILT,viewCoordinates,rotationFromDrag,panForRotationPivot
  };
});
