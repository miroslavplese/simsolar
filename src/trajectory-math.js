(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  root.TrajectoryMath=api;
})(typeof globalThis!=='undefined' ? globalThis : this,function(){
  const AU_KM=1.495978707e8;
  const GM_SUN_KM=1.32712440018e11;
  const GM_SUN_AU_DAY=GM_SUN_KM*86400*86400/(AU_KM*AU_KM*AU_KM);
  const DEG=Math.PI/180;

  function solveKeplerElliptical(M,e){
    let E=e>0.8 ? Math.PI : M;
    for(let i=0;i<50;i++){
      const delta=(E-e*Math.sin(E)-M)/(1-e*Math.cos(E));
      E-=delta;
      if(Math.abs(delta)<1e-12) break;
    }
    return E;
  }

  function solveKeplerHyperbolic(M,e){
    let H=Math.sign(M||1)*Math.log(2*Math.abs(M)/e+1.8);
    for(let i=0;i<60;i++){
      const delta=(e*Math.sinh(H)-H-M)/(e*Math.cosh(H)-1);
      H-=delta;
      if(Math.abs(delta)<1e-12) break;
    }
    return H;
  }

  function orbitalRotation(obj){
    if(obj._rotation) return obj._rotation;
    const O=obj.Omega*DEG, I=obj.i*DEG, W=obj.omega*DEG;
    const cO=Math.cos(O), sO=Math.sin(O), cI=Math.cos(I), sI=Math.sin(I);
    const cW=Math.cos(W), sW=Math.sin(W);
    obj._rotation={
      xx:cO*cW-sO*sW*cI,
      xy:-cO*sW-sO*cW*cI,
      yx:sO*cW+cO*sW*cI,
      yy:-sO*sW+cO*cW*cI,
      zx:sW*sI,
      zy:cW*sI
    };
    return obj._rotation;
  }

  function orbitalToEcliptic(obj,xp,yp){
    const m=orbitalRotation(obj);
    return {
      x:m.xx*xp+m.xy*yp,
      y:m.yx*xp+m.yy*yp,
      z:m.zx*xp+m.zy*yp
    };
  }

  function bodyPosition(obj,tDays){
    const dt=tDays-(obj.epochDays||0);
    let M=(obj.M0+obj.n*dt)*DEG;
    let r,nu;
    if(obj.e<1){
      M%=2*Math.PI;
      if(M<0) M+=2*Math.PI;
      const E=solveKeplerElliptical(M,obj.e);
      nu=2*Math.atan2(
        Math.sqrt(1+obj.e)*Math.sin(E/2),
        Math.sqrt(1-obj.e)*Math.cos(E/2)
      );
      r=obj.a*(1-obj.e*Math.cos(E));
    } else {
      const H=solveKeplerHyperbolic(M,obj.e);
      nu=2*Math.atan2(
        Math.sqrt(obj.e+1)*Math.sinh(H/2),
        Math.sqrt(obj.e-1)*Math.cosh(H/2)
      );
      r=obj.a*(1-obj.e*Math.cosh(H));
    }
    const pos=orbitalToEcliptic(obj,r*Math.cos(nu),r*Math.sin(nu));
    return {x:pos.x,y:pos.y,z:pos.z,r,nu};
  }

  function orbitalSpeedKmS(obj,rAu){
    const aKm=obj.a*AU_KM, rKm=rAu*AU_KM;
    return Math.sqrt(GM_SUN_KM*(2/rKm-1/aKm));
  }

  function trajectorySegment(points,tDays){
    let lo=0, hi=points.length-1;
    while(lo+1<hi){
      const mid=(lo+hi)>>1;
      if(points[mid][0]<=tDays) lo=mid; else hi=mid;
    }
    return lo;
  }

  function trajectoryTangent(points,index,axis){
    if(points[index].length>=7) return points[index][axis+3];
    if(index===0){
      return (points[1][axis]-points[0][axis])/(points[1][0]-points[0][0]);
    }
    if(index===points.length-1){
      const prev=points.length-2;
      return (points[index][axis]-points[prev][axis])/(points[index][0]-points[prev][0]);
    }
    return (points[index+1][axis]-points[index-1][axis])/(points[index+1][0]-points[index-1][0]);
  }

  function interpolateTrajectory(points,index,tDays){
    const a=points[index], b=points[index+1];
    const span=b[0]-a[0];
    const u=span>0 ? Math.max(0,Math.min(1,(tDays-a[0])/span)) : 0;
    const u2=u*u, u3=u2*u;
    const h00=2*u3-3*u2+1, h10=u3-2*u2+u;
    const h01=-2*u3+3*u2, h11=u3-u2;
    const dh00=6*u2-6*u, dh10=3*u2-4*u+1;
    const dh01=-6*u2+6*u, dh11=3*u2-2*u;
    const values=[];
    const rates=[];
    for(let axis=1;axis<=3;axis++){
      const m0=trajectoryTangent(points,index,axis);
      const m1=trajectoryTangent(points,index+1,axis);
      values.push(h00*a[axis]+h10*span*m0+h01*b[axis]+h11*span*m1);
      rates.push((dh00*a[axis]+dh10*span*m0+dh01*b[axis]+dh11*span*m1)/span);
    }
    return {x:values[0],y:values[1],z:values[2],rates};
  }

  function sampledStateAt(points,tDays){
    if(!points || tDays<points[0][0] || tDays>points[points.length-1][0]) return null;
    const index=trajectorySegment(points,tDays);
    const sample=interpolateTrajectory(points,index,tDays);
    const {x,y,z}=sample;
    const [vx,vy,vz]=sample.rates;
    return {
      x,y,z,vx,vy,vz,r:Math.hypot(x,y,z),
      speedKmS:Math.hypot(vx,vy,vz)*AU_KM/86400,
      sampled:true,ephemeris:true
    };
  }

  function adaptiveTrajectoryPoints(start,end,sampleAt,options){
    const tolerance=options?.tolerance;
    if(!(tolerance>0)){
      throw new RangeError('Adaptive trajectory tolerance must be positive.');
    }
    const maxDepth=options?.maxDepth??10;
    const minSpan=options?.minSpan??1/1440;
    function refine(a,b,depth){
      const span=b.t-a.t;
      if(depth>=maxDepth || span<=minSpan) return [b];
      const midpoint=sampleAt((a.t+b.t)/2);
      const linear={
        x:(a.x+b.x)/2,
        y:(a.y+b.y)/2,
        z:(a.z+b.z)/2
      };
      const positionError=Math.hypot(
        midpoint.x-linear.x,
        midpoint.y-linear.y,
        midpoint.z-linear.z
      );
      const chordVelocity={
        x:(b.x-a.x)/span,
        y:(b.y-a.y)/span,
        z:(b.z-a.z)/span
      };
      const velocityError=(
        Number.isFinite(midpoint.vx) &&
        Number.isFinite(midpoint.vy) &&
        Number.isFinite(midpoint.vz)
      ) ? Math.hypot(
        midpoint.vx-chordVelocity.x,
        midpoint.vy-chordVelocity.y,
        midpoint.vz-chordVelocity.z
      )*span/8 : 0;
      if(Math.max(positionError,velocityError)<=tolerance) return [b];
      return [
        ...refine(a,midpoint,depth+1),
        ...refine(midpoint,b,depth+1)
      ];
    }
    return [start,...refine(start,end,0)];
  }

  function osculatingOrbitPoints(state,mu,steps){
    if(!(mu>0)) throw new RangeError('Orbit gravitational parameter must be positive.');
    const count=Math.max(32,steps||256);
    const radius=Math.hypot(state.x,state.y,state.z);
    const h={
      x:state.y*state.vz-state.z*state.vy,
      y:state.z*state.vx-state.x*state.vz,
      z:state.x*state.vy-state.y*state.vx
    };
    const hMagnitude=Math.hypot(h.x,h.y,h.z);
    if(!(radius>0) || !(hMagnitude>0)) return [];
    const velocityCrossH={
      x:state.vy*h.z-state.vz*h.y,
      y:state.vz*h.x-state.vx*h.z,
      z:state.vx*h.y-state.vy*h.x
    };
    const eccentricityVector={
      x:velocityCrossH.x/mu-state.x/radius,
      y:velocityCrossH.y/mu-state.y/radius,
      z:velocityCrossH.z/mu-state.z/radius
    };
    const eccentricity=Math.hypot(
      eccentricityVector.x,eccentricityVector.y,eccentricityVector.z
    );
    if(eccentricity>=1) return [];
    const pAxis=eccentricity>1e-10
      ? {
          x:eccentricityVector.x/eccentricity,
          y:eccentricityVector.y/eccentricity,
          z:eccentricityVector.z/eccentricity
        }
      : {x:state.x/radius,y:state.y/radius,z:state.z/radius};
    const hAxis={x:h.x/hMagnitude,y:h.y/hMagnitude,z:h.z/hMagnitude};
    const qAxis={
      x:hAxis.y*pAxis.z-hAxis.z*pAxis.y,
      y:hAxis.z*pAxis.x-hAxis.x*pAxis.z,
      z:hAxis.x*pAxis.y-hAxis.y*pAxis.x
    };
    const currentAnomaly=Math.atan2(
      state.x*qAxis.x+state.y*qAxis.y+state.z*qAxis.z,
      state.x*pAxis.x+state.y*pAxis.y+state.z*pAxis.z
    );
    const semilatusRectum=hMagnitude*hMagnitude/mu;
    const points=[];
    for(let index=0;index<=count;index++){
      if(index===count/2 && count%2===0){
        points.push({x:state.x,y:state.y,z:state.z});
        continue;
      }
      const anomaly=currentAnomaly-Math.PI+2*Math.PI*index/count;
      const orbitRadius=semilatusRectum/(1+eccentricity*Math.cos(anomaly));
      points.push({
        x:orbitRadius*(pAxis.x*Math.cos(anomaly)+qAxis.x*Math.sin(anomaly)),
        y:orbitRadius*(pAxis.y*Math.cos(anomaly)+qAxis.y*Math.sin(anomaly)),
        z:orbitRadius*(pAxis.z*Math.cos(anomaly)+qAxis.z*Math.sin(anomaly))
      });
    }
    return points;
  }

  function stumpffC(z){
    if(z>1e-8) return (1-Math.cos(Math.sqrt(z)))/z;
    if(z<-1e-8) return (Math.cosh(Math.sqrt(-z))-1)/(-z);
    return 0.5-z/24+z*z/720;
  }

  function stumpffS(z){
    if(z>1e-8){
      const root=Math.sqrt(z);
      return (root-Math.sin(root))/(root*root*root);
    }
    if(z<-1e-8){
      const root=Math.sqrt(-z);
      return (Math.sinh(root)-root)/(root*root*root);
    }
    return 1/6-z/120+z*z/5040;
  }

  function propagateState(origin,days,mu){
    if(days===0) return {...origin};
    const gravitationalParameter=mu||GM_SUN_AU_DAY;
    const r0=Math.hypot(origin.x,origin.y,origin.z);
    const v0sq=origin.vx*origin.vx+origin.vy*origin.vy+origin.vz*origin.vz;
    const rv=origin.x*origin.vx+origin.y*origin.vy+origin.z*origin.vz;
    const alpha=2/r0-v0sq/gravitationalParameter;
    const sqrtMu=Math.sqrt(gravitationalParameter);
    let chi;
    if(alpha>1e-10){
      chi=sqrtMu*alpha*days;
    } else if(alpha<-1e-10){
      const sign=Math.sign(days)||1;
      const root=Math.sqrt(-gravitationalParameter/alpha);
      const argument=(-2*gravitationalParameter*alpha*days)/(rv+sign*root*(1-r0*alpha));
      chi=sign*Math.sqrt(-1/alpha)*Math.log(Math.max(argument,1e-12));
    } else {
      chi=sqrtMu*days/r0;
    }
    for(let i=0;i<50;i++){
      const z=alpha*chi*chi;
      const C=stumpffC(z), S=stumpffS(z);
      const f=(rv/sqrtMu)*chi*chi*C+(1-alpha*r0)*chi*chi*chi*S+r0*chi-sqrtMu*days;
      const fp=(rv/sqrtMu)*chi*(1-z*S)+(1-alpha*r0)*chi*chi*C+r0;
      const delta=f/fp;
      chi-=delta;
      if(Math.abs(delta)<1e-11) break;
    }
    const z=alpha*chi*chi;
    const C=stumpffC(z), S=stumpffS(z);
    const f=1-(chi*chi/r0)*C;
    const g=days-(chi*chi*chi/sqrtMu)*S;
    const x=f*origin.x+g*origin.vx;
    const y=f*origin.y+g*origin.vy;
    const zPos=f*origin.z+g*origin.vz;
    const r=Math.hypot(x,y,zPos);
    const fdot=(sqrtMu/(r*r0))*(alpha*chi*chi*chi*S-chi);
    const gdot=1-(chi*chi/r)*C;
    return {
      t:origin.t+days,x,y,z:zPos,
      vx:fdot*origin.x+gdot*origin.vx,
      vy:fdot*origin.y+gdot*origin.vy,
      vz:fdot*origin.z+gdot*origin.vz
    };
  }

  return {
    AU_KM,GM_SUN_AU_DAY,solveKeplerElliptical,solveKeplerHyperbolic,
    orbitalToEcliptic,bodyPosition,orbitalSpeedKmS,trajectorySegment,
    interpolateTrajectory,sampledStateAt,adaptiveTrajectoryPoints,
    osculatingOrbitPoints,propagateState
  };
});
