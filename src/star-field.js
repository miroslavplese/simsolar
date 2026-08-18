(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  root.StarField=api;
})(typeof globalThis!=='undefined' ? globalThis : this,function(){
  const DEG=Math.PI/180;
  const OBLIQUITY=23.4392911*DEG;

  function clamp(value,min,max){
    return Math.max(min,Math.min(max,value));
  }

  function bvToRgb(bv){
    if(!Number.isFinite(bv)) return [232,236,247];
    const value=clamp(bv,-0.4,2);
    if(value<0.4){
      const blend=(value+0.4)/0.8;
      return [
        Math.round(170+85*blend),
        Math.round(195+45*blend),
        255
      ];
    }
    const blend=(value-0.4)/1.6;
    return [
      255,
      Math.round(240-75*blend),
      Math.round(235-155*blend)
    ];
  }

  function catalogStar(record){
    const [hip,raDegrees,decDegrees,magnitude,bv]=record;
    const ra=raDegrees*DEG;
    const dec=decDegrees*DEG;
    const cosDec=Math.cos(dec);
    const equatorial={
      x:cosDec*Math.cos(ra),
      y:cosDec*Math.sin(ra),
      z:Math.sin(dec)
    };
    const flux=10**(-0.4*(magnitude+1.46));
    return {
      hip,
      x:equatorial.x,
      y:equatorial.y*Math.cos(OBLIQUITY)+
        equatorial.z*Math.sin(OBLIQUITY),
      z:-equatorial.y*Math.sin(OBLIQUITY)+
        equatorial.z*Math.cos(OBLIQUITY),
      magnitude,
      radius:0.28+1.7*flux**0.2,
      alpha:clamp(0.16+0.84*flux**0.28,0.16,1),
      rgb:bvToRgb(bv).join(',')
    };
  }

  function createStars(records){
    if(!Array.isArray(records)){
      throw new TypeError('Star catalog records must be an array.');
    }
    return records.map(catalogStar);
  }

  function cameraCoordinates(direction,yaw,tilt){
    const cosYaw=Math.cos(yaw), sinYaw=Math.sin(yaw);
    const cosTilt=Math.cos(tilt), sinTilt=Math.sin(tilt);
    const rotatedX=direction.x*cosYaw-direction.y*sinYaw;
    const rotatedY=direction.x*sinYaw+direction.y*cosYaw;
    return {
      x:rotatedX,
      y:rotatedY*cosTilt-direction.z*sinTilt,
      depth:rotatedY*sinTilt+direction.z*cosTilt
    };
  }

  function projectStar(star,yaw,tilt,width,height,verticalFov){
    const camera=cameraCoordinates(star,yaw,tilt);
    if(camera.depth<=0) return null;
    const fov=verticalFov===undefined?Math.PI/2:verticalFov;
    const focal=height/(2*Math.tan(fov/2));
    const x=width/2+camera.x/camera.depth*focal;
    const y=height/2+camera.y/camera.depth*focal;
    if(x<-star.radius || x>width+star.radius ||
      y<-star.radius || y>height+star.radius) return null;
    return {x,y,radius:star.radius,alpha:star.alpha,depth:camera.depth};
  }

  return {OBLIQUITY,bvToRgb,catalogStar,createStars,cameraCoordinates,projectStar};
});
