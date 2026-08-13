(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  root.TrajectoryMath=api;
})(typeof globalThis!=='undefined' ? globalThis : this,function(){
  const AU_KM=1.495978707e8;
  const GM_SUN_KM=1.32712440018e11;
  const GM_SUN_AU_DAY=GM_SUN_KM*86400*86400/(AU_KM*AU_KM*AU_KM);

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

  function propagateState(origin,days){
    if(days===0) return {...origin};
    const r0=Math.hypot(origin.x,origin.y,origin.z);
    const v0sq=origin.vx*origin.vx+origin.vy*origin.vy+origin.vz*origin.vz;
    const rv=origin.x*origin.vx+origin.y*origin.vy+origin.z*origin.vz;
    const alpha=2/r0-v0sq/GM_SUN_AU_DAY;
    const sqrtMu=Math.sqrt(GM_SUN_AU_DAY);
    let chi;
    if(alpha>1e-10){
      chi=sqrtMu*alpha*days;
    } else if(alpha<-1e-10){
      const sign=Math.sign(days)||1;
      const root=Math.sqrt(-GM_SUN_AU_DAY/alpha);
      const argument=(-2*GM_SUN_AU_DAY*alpha*days)/(rv+sign*root*(1-r0*alpha));
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
    AU_KM,GM_SUN_AU_DAY,trajectorySegment,interpolateTrajectory,
    sampledStateAt,propagateState
  };
});
