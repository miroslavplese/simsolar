(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  root.StarField=api;
})(typeof globalThis!=='undefined' ? globalThis : this,function(){
  function seededRandom(seed){
    let state=seed>>>0;
    return function(){
      state=(1664525*state+1013904223)>>>0;
      return state/4294967296;
    };
  }

  function createStars(count,seed){
    const random=seededRandom(seed===undefined?0x51a7f13d:seed);
    const stars=[];
    for(let index=0;index<count;index++){
      const z=random()*2-1;
      const angle=random()*Math.PI*2;
      const radial=Math.sqrt(Math.max(0,1-z*z));
      stars.push({
        x:radial*Math.cos(angle),
        y:radial*Math.sin(angle),
        z,
        radius:0.25+random()*1.15,
        alpha:0.16+random()*0.62
      });
    }
    return stars;
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

  return {createStars,cameraCoordinates,projectStar};
});
