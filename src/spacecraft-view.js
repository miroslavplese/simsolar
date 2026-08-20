(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  root.SpacecraftView=api;
})(typeof globalThis!=='undefined' ? globalThis : this,function(){
  'use strict';

  const DAY_SECONDS=86400;
  const AU_KM=149597870.7;

  function add(a,b){
    return {x:a.x+b.x,y:a.y+b.y,z:a.z+b.z};
  }

  function subtract(a,b){
    return {x:a.x-b.x,y:a.y-b.y,z:a.z-b.z};
  }

  function scale(vector,factor){
    return {x:vector.x*factor,y:vector.y*factor,z:vector.z*factor};
  }

  function dot(a,b){
    return a.x*b.x+a.y*b.y+a.z*b.z;
  }

  function cross(a,b){
    return {
      x:a.y*b.z-a.z*b.y,
      y:a.z*b.x-a.x*b.z,
      z:a.x*b.y-a.y*b.x
    };
  }

  function magnitude(vector){
    return Math.hypot(vector.x,vector.y,vector.z);
  }

  function normalize(vector){
    const length=magnitude(vector);
    if(!(length>0)) throw new RangeError('Cannot normalize a zero vector.');
    return scale(vector,1/length);
  }

  function rotate(vector,axis,angle){
    const unit=normalize(axis);
    const cosine=Math.cos(angle);
    const sine=Math.sin(angle);
    return add(
      add(scale(vector,cosine),scale(cross(unit,vector),sine)),
      scale(unit,dot(unit,vector)*(1-cosine))
    );
  }

  function cameraFrame(state,yaw=0,pitch=0){
    if(!state || !Number.isFinite(state.vx) ||
       !Number.isFinite(state.vy) || !Number.isFinite(state.vz)){
      throw new TypeError('A velocity state is required.');
    }
    const flightForward=normalize({x:state.vx,y:state.vy,z:state.vz});
    const reference=Math.abs(flightForward.z)>0.94
      ? {x:0,y:1,z:0}
      : {x:0,y:0,z:1};
    const flightRight=normalize(cross(flightForward,reference));
    const flightUp=normalize(cross(flightRight,flightForward));
    const yawedForward=normalize(rotate(flightForward,flightUp,yaw));
    const yawedRight=normalize(rotate(flightRight,flightUp,yaw));
    const forward=normalize(rotate(yawedForward,yawedRight,pitch));
    const up=normalize(cross(yawedRight,forward));
    return {
      forward,right:yawedRight,up,
      flightForward,flightRight,flightUp
    };
  }

  function project(position,observer,camera,width,height,verticalFov){
    const offset=subtract(position,observer);
    const distance=magnitude(offset);
    if(!(distance>0)) return null;
    const direction=scale(offset,1/distance);
    const depth=dot(direction,camera.forward);
    if(depth<=1e-8) return null;
    const focal=height/(2*Math.tan(verticalFov/2));
    return {
      x:width/2+dot(direction,camera.right)/depth*focal,
      y:height/2-dot(direction,camera.up)/depth*focal,
      depth,focal,distance,direction
    };
  }

  function currentLeg(sampledRoute,time){
    if(!Array.isArray(sampledRoute)) return null;
    return sampledRoute.find((leg,index)=>
      time>=leg.startTime &&
      (time<leg.endTime ||
       index===sampledRoute.length-1 && time<=leg.endTime)
    )||null;
  }

  function telemetry(route,sampledRoute,state,time,nextBodyState){
    const leg=currentLeg(sampledRoute,time);
    if(!route || !leg || !state) return null;
    const legIndex=sampledRoute.indexOf(leg);
    const nextWaypoint=route.waypoints[legIndex+1];
    const speedKmS=magnitude({
      x:state.vx,y:state.vy,z:state.vz
    })*AU_KM/DAY_SECONDS;
    const distanceToNextAu=nextBodyState
      ? magnitude(subtract(nextBodyState,state))
      : null;
    return {
      legIndex,
      legNumber:legIndex+1,
      legCount:sampledRoute.length,
      from:leg.from,
      to:leg.to,
      nextWaypoint,
      speedKmS,
      distanceToNextAu,
      elapsedDays:time-route.waypoints[0].time,
      legRemainingDays:leg.endTime-time,
      remainingDays:route.waypoints.at(-1).time-time,
      progress:Math.max(0,Math.min(
        1,
        (time-route.waypoints[0].time)/route.durationDays
      ))
    };
  }

  function routeMilestones(route,time){
    const waypoints=route?.waypoints;
    if(!Array.isArray(waypoints) || waypoints.length<2) return [];
    const start=waypoints[0].time;
    const duration=waypoints.at(-1).time-start;
    if(!Number.isFinite(start) || !Number.isFinite(duration) || duration<=0){
      return [];
    }
    return waypoints.map((waypoint,index)=>({
      name:waypoint.name,
      role:index===0
        ? 'departure'
        : index===waypoints.length-1 ? 'arrival' : 'flyby',
      progress:Math.max(0,Math.min(1,(waypoint.time-start)/duration)),
      reached:time>=waypoint.time
    }));
  }

  return {
    DAY_SECONDS,AU_KM,
    add,subtract,scale,dot,cross,magnitude,normalize,rotate,
    cameraFrame,project,currentLeg,telemetry,routeMilestones
  };
});
