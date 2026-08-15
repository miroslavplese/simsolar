(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  root.LagrangeSystem=api;
})(typeof globalThis!=='undefined' ? globalThis : this,function(){
  function cross(a,b){
    return {
      x:a.y*b.z-a.z*b.y,
      y:a.z*b.x-a.x*b.z,
      z:a.x*b.y-a.y*b.x
    };
  }

  function normalized(vector){
    const length=Math.hypot(vector.x,vector.y,vector.z);
    if(!(length>0)) throw new RangeError('Cannot normalize a zero-length vector.');
    return {x:vector.x/length,y:vector.y/length,z:vector.z/length};
  }

  function collinearEquation(x,massRatio){
    const primaryOffset=x+massRatio;
    const secondaryOffset=x-(1-massRatio);
    return x-
      (1-massRatio)*primaryOffset/Math.abs(primaryOffset)**3-
      massRatio*secondaryOffset/Math.abs(secondaryOffset)**3;
  }

  function bisectCollinear(massRatio,left,right){
    let leftValue=collinearEquation(left,massRatio);
    let rightValue=collinearEquation(right,massRatio);
    if(Math.sign(leftValue)===Math.sign(rightValue)){
      throw new Error('Lagrange-point root is not bracketed.');
    }
    for(let iteration=0;iteration<100;iteration++){
      const middle=(left+right)/2;
      const middleValue=collinearEquation(middle,massRatio);
      if(Math.abs(middleValue)<1e-14) return middle;
      if(Math.sign(middleValue)===Math.sign(leftValue)){
        left=middle;
        leftValue=middleValue;
      } else {
        right=middle;
        rightValue=middleValue;
      }
    }
    return (left+right)/2;
  }

  function collinearCoordinates(massRatio){
    if(!(massRatio>=1e-28 && massRatio<0.5)){
      throw new RangeError(
        'Secondary mass ratio must be at least 1e-28 and less than one half.'
      );
    }
    const epsilon=Math.max(
      1e-15,Math.min(1e-7,Math.sqrt(massRatio)*0.1)
    );
    const primary=-massRatio;
    const secondary=1-massRatio;
    return {
      L1:bisectCollinear(massRatio,primary+epsilon,secondary-epsilon),
      L2:bisectCollinear(massRatio,secondary+epsilon,2.5),
      L3:bisectCollinear(massRatio,-2.5,primary-epsilon)
    };
  }

  function lagrangePoints(primary,secondary,primaryMu,secondaryMu){
    if(!(primaryMu>0) || !(secondaryMu>0)){
      throw new RangeError('Both gravitational parameters must be positive.');
    }
    const relative={
      x:secondary.x-primary.x,
      y:secondary.y-primary.y,
      z:secondary.z-primary.z
    };
    const relativeVelocity={
      x:(secondary.vx||0)-(primary.vx||0),
      y:(secondary.vy||0)-(primary.vy||0),
      z:(secondary.vz||0)-(primary.vz||0)
    };
    const distance=Math.hypot(relative.x,relative.y,relative.z);
    if(!(distance>0)) throw new RangeError('Primary and secondary positions must differ.');
    const axis=normalized(relative);
    const angularMomentum=cross(relative,relativeVelocity);
    let normal=angularMomentum;
    if(Math.hypot(normal.x,normal.y,normal.z)<1e-15){
      normal=Math.abs(axis.z)<0.9 ? {x:0,y:0,z:1} : {x:0,y:1,z:0};
    }
    normal=normalized(normal);
    const transverse=normalized(cross(normal,axis));
    const totalMu=primaryMu+secondaryMu;
    const massRatio=secondaryMu/totalMu;
    if(!(massRatio<0.5)){
      throw new RangeError('The primary must be more massive than the secondary.');
    }
    const barycenter={};
    for(const key of ['x','y','z','vx','vy','vz']){
      barycenter[key]=(
        primaryMu*(primary[key]||0)+secondaryMu*(secondary[key]||0)
      )/totalMu;
    }
    const angularSpeed=Math.hypot(
      angularMomentum.x,angularMomentum.y,angularMomentum.z
    )/distance**2;
    const angularVelocity={
      x:normal.x*angularSpeed,
      y:normal.y*angularSpeed,
      z:normal.z*angularSpeed
    };
    const collinear=collinearCoordinates(massRatio);
    const coordinates=[
      ['L1',collinear.L1,0],
      ['L2',collinear.L2,0],
      ['L3',collinear.L3,0],
      ['L4',0.5-massRatio,Math.sqrt(3)/2],
      ['L5',0.5-massRatio,-Math.sqrt(3)/2]
    ];
    return coordinates.map(([name,xCoordinate,yCoordinate])=>{
      const offset={
        x:distance*(axis.x*xCoordinate+transverse.x*yCoordinate),
        y:distance*(axis.y*xCoordinate+transverse.y*yCoordinate),
        z:distance*(axis.z*xCoordinate+transverse.z*yCoordinate)
      };
      const rotationalVelocity=cross(angularVelocity,offset);
      const point={
        name,
        x:barycenter.x+offset.x,
        y:barycenter.y+offset.y,
        z:barycenter.z+offset.z,
        vx:barycenter.vx+rotationalVelocity.x,
        vy:barycenter.vy+rotationalVelocity.y,
        vz:barycenter.vz+rotationalVelocity.z
      };
      point.distanceFromPrimary=Math.hypot(
        point.x-primary.x,point.y-primary.y,point.z-primary.z
      );
      point.distanceFromSecondary=Math.hypot(
        point.x-secondary.x,point.y-secondary.y,point.z-secondary.z
      );
      return point;
    });
  }

  function rotatingFrameYaw(primary,secondary,tilt){
    const x=secondary.x-primary.x;
    const y=secondary.y-primary.y;
    const z=secondary.z-primary.z;
    const planarDistance=Math.hypot(x,y);
    if(!(planarDistance>0)){
      throw new RangeError('Rotating-frame bodies need distinct planar positions.');
    }
    const target=z*Math.tan(tilt||0)/planarDistance;
    const correction=Math.asin(Math.max(-1,Math.min(1,target)));
    return correction-Math.atan2(y,x);
  }

  return {
    collinearCoordinates,lagrangePoints,rotatingFrameYaw
  };
});
