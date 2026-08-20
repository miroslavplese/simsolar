(function(root,factory){
  const trajectory=typeof module==='object' && module.exports
    ? require('./trajectory-math.js')
    : root.TrajectoryMath;
  const api=factory(trajectory);
  if(typeof module==='object' && module.exports) module.exports=api;
  root.MissionPlanner=api;
})(typeof globalThis!=='undefined' ? globalThis : this,function(trajectory){
  'use strict';

  const {
    AU_KM,GM_SUN_AU_DAY,propagateState
  }=trajectory;
  const PLAN_VERSION=1;
  const STORAGE_KEY='simsolar:mission-plans';
  const DAY_SECONDS=86400;
  const MAX_WAYPOINTS=6;

  function vector(x=0,y=0,z=0){ return {x,y,z}; }
  function add(a,b){ return vector(a.x+b.x,a.y+b.y,a.z+b.z); }
  function subtract(a,b){ return vector(a.x-b.x,a.y-b.y,a.z-b.z); }
  function scale(a,factor){ return vector(a.x*factor,a.y*factor,a.z*factor); }
  function dot(a,b){ return a.x*b.x+a.y*b.y+a.z*b.z; }
  function cross(a,b){
    return vector(
      a.y*b.z-a.z*b.y,
      a.z*b.x-a.x*b.z,
      a.x*b.y-a.y*b.x
    );
  }
  function magnitude(a){ return Math.hypot(a.x,a.y,a.z); }
  function normalize(a){
    const length=magnitude(a);
    return length>0 ? scale(a,1/length) : vector();
  }
  function clamp(value,min,max){ return Math.max(min,Math.min(max,value)); }
  function speedKmS(value){ return magnitude(value)*AU_KM/DAY_SECONDS; }
  function muKm3S2(mu){
    return mu*AU_KM*AU_KM*AU_KM/(DAY_SECONDS*DAY_SECONDS);
  }
  function velocityAuDay(speedKmSValue){
    return speedKmSValue*DAY_SECONDS/AU_KM;
  }

  function stumpffC(z){
    if(z>1e-8) return (1-Math.cos(Math.sqrt(z)))/z;
    if(z<-1e-8) return (Math.cosh(Math.sqrt(-z))-1)/(-z);
    return 0.5-z/24+z*z/720-z*z*z/40320;
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
    return 1/6-z/120+z*z/5040-z*z*z/362880;
  }

  function transferTimeForZ(z,r1Magnitude,r2Magnitude,A,mu){
    const C=stumpffC(z);
    const S=stumpffS(z);
    if(!(C>0) || !Number.isFinite(C) || !Number.isFinite(S)) return null;
    const y=r1Magnitude+r2Magnitude+
      A*(z*S-1)/Math.sqrt(C);
    if(!(y>0) || !Number.isFinite(y)) return null;
    const x=Math.sqrt(y/C);
    const time=(x*x*x*S+A*Math.sqrt(y))/Math.sqrt(mu);
    return Number.isFinite(time) && time>0 ? {time,y,C,S} : null;
  }

  function solveLambert(start,end,timeOfFlightDays,options){
    options=options||{};
    const mu=options.mu||GM_SUN_AU_DAY;
    if(!(timeOfFlightDays>0) || !(mu>0)){
      throw new RangeError('Lambert transfer requires positive time and gravity.');
    }
    const r1=vector(start.x,start.y,start.z);
    const r2=vector(end.x,end.y,end.z);
    const r1Magnitude=magnitude(r1);
    const r2Magnitude=magnitude(r2);
    if(!(r1Magnitude>0) || !(r2Magnitude>0)){
      throw new RangeError('Lambert endpoints must not be at the central body.');
    }
    const cosine=clamp(dot(r1,r2)/(r1Magnitude*r2Magnitude),-1,1);
    const geometryCross=cross(r1,r2);
    let sine=Math.sqrt(Math.max(0,1-cosine*cosine));
    const prograde=options.prograde!==false;
    const referenceNormal=normalize(options.referenceNormal||{x:0,y:0,z:1});
    const positiveDirection=dot(geometryCross,referenceNormal)>=0;
    if(prograde!==positiveDirection) sine=-sine;
    if(options.longWay) sine=-sine;
    const denominator=1-cosine;
    if(Math.abs(sine)<1e-12 || denominator<1e-12){
      throw new RangeError('Lambert geometry is singular for this transfer angle.');
    }
    const A=sine*Math.sqrt(r1Magnitude*r2Magnitude/denominator);
    if(Math.abs(A)<1e-14) throw new RangeError('Lambert geometry is singular.');

    const targetTime=timeOfFlightDays;
    const lowerLimit=-4*Math.PI*Math.PI;
    const upperLimit=4*Math.PI*Math.PI-1e-7;
    const samples=320;
    let bracket=null;
    let previous=null;
    for(let index=0;index<=samples;index++){
      const z=lowerLimit+(upperLimit-lowerLimit)*index/samples;
      const result=transferTimeForZ(z,r1Magnitude,r2Magnitude,A,mu);
      if(!result) continue;
      const difference=result.time-targetTime;
      if(Math.abs(difference)<1e-10){
        bracket={low:z,high:z,result};
        break;
      }
      if(previous && Math.sign(previous.difference)!==Math.sign(difference)){
        bracket={low:previous.z,high:z};
        break;
      }
      previous={z,difference};
    }
    if(!bracket){
      throw new RangeError('No zero-revolution Lambert solution for this time.');
    }

    let z;
    let solved=bracket.result||null;
    if(bracket.low===bracket.high){
      z=bracket.low;
    } else {
      let low=bracket.low,high=bracket.high;
      for(let iteration=0;iteration<90;iteration++){
        z=(low+high)/2;
        solved=transferTimeForZ(z,r1Magnitude,r2Magnitude,A,mu);
        if(!solved) {
          low=z;
          continue;
        }
        const difference=solved.time-targetTime;
        if(Math.abs(difference)<1e-10) break;
        if(difference>0) high=z; else low=z;
      }
    }
    solved=solved||
      transferTimeForZ(z,r1Magnitude,r2Magnitude,A,mu);
    if(!solved) throw new RangeError('Lambert solver did not converge.');
    const f=1-solved.y/r1Magnitude;
    const g=A*Math.sqrt(solved.y/mu);
    const gDot=1-solved.y/r2Magnitude;
    if(Math.abs(g)<1e-14) throw new RangeError('Lambert solution has zero g.');
    const departureVelocity=scale(subtract(r2,scale(r1,f)),1/g);
    const arrivalVelocity=scale(subtract(scale(r2,gDot),r1),1/g);
    return {
      start:r1,end:r2,timeOfFlightDays,mu,prograde,
      longWay:!!options.longWay,
      departureVelocity,arrivalVelocity,
      residualDays:solved.time-targetTime
    };
  }

  function sampleTransfer(solution,startTime,count=96){
    const points=[];
    const origin={
      t:startTime,
      x:solution.start.x,y:solution.start.y,z:solution.start.z,
      vx:solution.departureVelocity.x,
      vy:solution.departureVelocity.y,
      vz:solution.departureVelocity.z
    };
    for(let index=0;index<=count;index++){
      const elapsed=solution.timeOfFlightDays*index/count;
      const state=propagateState(origin,elapsed,solution.mu);
      points.push({
        t:startTime+elapsed,
        x:state.x,y:state.y,z:state.z,
        vx:state.vx,vy:state.vy,vz:state.vz
      });
    }
    return points;
  }

  function angleBetween(a,b){
    const denominator=magnitude(a)*magnitude(b);
    if(!(denominator>0)) return 0;
    return Math.acos(clamp(dot(a,b)/denominator,-1,1));
  }

  function flybyAssessment(incomingVelocity,outgoingVelocity,bodyState,bodyInfo){
    const bodyVelocity=vector(bodyState.vx,bodyState.vy,bodyState.vz);
    const incomingExcess=subtract(incomingVelocity,bodyVelocity);
    const outgoingExcess=subtract(outgoingVelocity,bodyVelocity);
    const incomingSpeed=speedKmS(incomingExcess);
    const outgoingSpeed=speedKmS(outgoingExcess);
    const requiredTurn=angleBetween(incomingExcess,outgoingExcess);
    const mu=bodyInfo?.mu||0;
    const radiusKm=bodyInfo?.radiusKm||0;
    const altitudeKm=Math.max(0,bodyInfo?.altitudeKm||0);
    const averageSpeed=(incomingSpeed+outgoingSpeed)/2;
    const maximumTurn=mu>0 && radiusKm>0 && averageSpeed>0
      ? 2*Math.asin(clamp(
          1/(1+(radiusKm+altitudeKm)*averageSpeed*averageSpeed/
            (mu*AU_KM*AU_KM*AU_KM/(DAY_SECONDS*DAY_SECONDS))),
          -1,1
        ))
      : 0;
    const speedMismatch=Math.abs(outgoingSpeed-incomingSpeed);
    const excessTurn=Math.max(0,requiredTurn-maximumTurn);
    const turningCorrection=2*Math.min(incomingSpeed,outgoingSpeed)*
      Math.sin(excessTurn/2);
    const poweredDeltaV=Math.hypot(speedMismatch,turningCorrection);
    return {
      incomingSpeedKmS:incomingSpeed,
      outgoingSpeedKmS:outgoingSpeed,
      requiredTurnRad:requiredTurn,
      maximumTurnRad:maximumTurn,
      poweredDeltaVKmS:poweredDeltaV,
      feasible:poweredDeltaV<=0.5,
      incomingExcessVelocity:incomingExcess,
      outgoingExcessVelocity:outgoingExcess
    };
  }

  function periapsisBurn(vInfinityKmS,bodyInfo,altitudeKm){
    const mu=muKm3S2(bodyInfo?.mu||0);
    const radiusKm=bodyInfo?.radiusKm||0;
    const periapsisKm=radiusKm+Math.max(0,altitudeKm||0);
    if(!(mu>0) || !(periapsisKm>0)) return vInfinityKmS;
    const hyperbolicSpeed=Math.sqrt(
      vInfinityKmS*vInfinityKmS+2*mu/periapsisKm
    );
    const circularSpeed=Math.sqrt(mu/periapsisKm);
    return Math.max(0,hyperbolicSpeed-circularSpeed);
  }

  function periapsisSpeed(vInfinityKmS,bodyInfo,altitudeKm){
    const mu=muKm3S2(bodyInfo?.mu||0);
    const periapsisKm=(bodyInfo?.radiusKm||0)+Math.max(0,altitudeKm||0);
    return mu>0 && periapsisKm>0
      ? Math.sqrt(vInfinityKmS*vInfinityKmS+2*mu/periapsisKm)
      : vInfinityKmS;
  }

  function circularSpeed(bodyInfo,altitudeKm){
    const mu=muKm3S2(bodyInfo?.mu||0);
    const radiusKm=(bodyInfo?.radiusKm||0)+Math.max(0,altitudeKm||0);
    return mu>0 && radiusKm>0 ? Math.sqrt(mu/radiusKm) : 0;
  }

  function encounterGeometry(incoming,outgoing,bodyState,periapsisKm){
    const incomingDirection=incoming && normalize(incoming);
    const outgoingDirection=outgoing && normalize(outgoing);
    let tangent;
    if(incomingDirection && outgoingDirection){
      tangent=normalize(add(incomingDirection,outgoingDirection));
      if(magnitude(tangent)<1e-8) tangent=outgoingDirection;
    } else {
      tangent=incomingDirection||outgoingDirection;
    }
    if(!tangent || !(periapsisKm>0)){
      return {offset:vector(),tangent:vector()};
    }
    const bodyPosition=vector(bodyState.x,bodyState.y,bodyState.z);
    const bodyVelocity=vector(bodyState.vx,bodyState.vy,bodyState.vz);
    let normal=incoming && outgoing
      ? normalize(cross(incoming,outgoing))
      : vector();
    if(magnitude(normal)<1e-8){
      normal=normalize(cross(bodyPosition,bodyVelocity));
    }
    if(magnitude(normal)<1e-8) normal=vector(0,0,1);
    let radial=normalize(cross(normal,tangent));
    if(magnitude(radial)<1e-8) radial=vector(0,1,0);
    return {
      offset:scale(radial,periapsisKm/AU_KM),
      tangent
    };
  }

  function encounterOffset(incoming,outgoing,bodyState,periapsisKm){
    return encounterGeometry(
      incoming,outgoing,bodyState,periapsisKm
    ).offset;
  }

  function routeForBranches(waypoints,longWayMask,options){
    const legs=[];
    for(let index=0;index<waypoints.length-1;index++){
      const start=waypoints[index];
      const end=waypoints[index+1];
      const solution=solveLambert(start.state,end.state,end.time-start.time,{
        mu:options?.mu||GM_SUN_AU_DAY,
        prograde:options?.prograde!==false,
        longWay:!!(longWayMask&(1<<index))
      });
      legs.push({
        from:start.name,to:end.name,startTime:start.time,endTime:end.time,
        solution
      });
    }
    const departureBodyVelocity=vector(
      waypoints[0].state.vx,waypoints[0].state.vy,waypoints[0].state.vz
    );
    const departureExcess=subtract(
      legs[0].solution.departureVelocity,departureBodyVelocity
    );
    const departureSpeed=speedKmS(departureExcess);
    const departureInfo=options?.bodyInfo?.(waypoints[0].name)||{};
    const departureAltitude=Math.max(0,waypoints[0].altitudeKm??300);
    const departureDeltaV=periapsisBurn(
      departureSpeed,departureInfo,departureAltitude
    );
    const departureGeometry=encounterGeometry(
      null,departureExcess,waypoints[0].state,
      (departureInfo.radiusKm||0)+departureAltitude
    );
    const departurePeriapsisVelocity=add(
      departureBodyVelocity,
      scale(
        departureGeometry.tangent,
        velocityAuDay(periapsisSpeed(
          departureSpeed,departureInfo,departureAltitude
        ))
      )
    );
    const encounterOffsets=[
      departureGeometry.offset
    ];
    const flybys=[];
    for(let index=1;index<waypoints.length-1;index++){
      const waypoint=waypoints[index];
      const info=options?.bodyInfo?.(waypoint.name)||{};
      const altitudeKm=Math.max(0,waypoint.altitudeKm||0);
      const assessment=flybyAssessment(
        legs[index-1].solution.arrivalVelocity,
        legs[index].solution.departureVelocity,
        waypoint.state,
        {...info,altitudeKm}
      );
      const geometry=encounterGeometry(
        assessment.incomingExcessVelocity,
        assessment.outgoingExcessVelocity,
        waypoint.state,(info.radiusKm||0)+altitudeKm
      );
      encounterOffsets.push(geometry.offset);
      flybys.push({
        name:waypoint.name,time:waypoint.time,
        altitudeKm,periapsisOffset:geometry.offset,...assessment,
        incomingPeriapsisVelocity:add(
          vector(waypoint.state.vx,waypoint.state.vy,waypoint.state.vz),
          scale(
            geometry.tangent,
            velocityAuDay(periapsisSpeed(
              assessment.incomingSpeedKmS,info,altitudeKm
            ))
          )
        ),
        outgoingPeriapsisVelocity:add(
          vector(waypoint.state.vx,waypoint.state.vy,waypoint.state.vz),
          scale(
            geometry.tangent,
            velocityAuDay(periapsisSpeed(
              assessment.outgoingSpeedKmS,info,altitudeKm
            ))
          )
        )
      });
    }
    const target=waypoints[waypoints.length-1];
    const targetVelocity=vector(
      target.state.vx,target.state.vy,target.state.vz
    );
    const arrivalExcess=subtract(
      legs[legs.length-1].solution.arrivalVelocity,targetVelocity
    );
    const arrivalSpeed=speedKmS(arrivalExcess);
    const targetInfo=options?.bodyInfo?.(target.name)||{};
    const arrivalAltitude=Math.max(0,target.altitudeKm??1000);
    const arrivalMode=target.arrivalMode==='orbit'?'orbit':'flyby';
    const arrivalDeltaV=arrivalMode==='orbit'
      ? periapsisBurn(arrivalSpeed,targetInfo,arrivalAltitude)
      : 0;
    const captureAvailable=arrivalMode!=='orbit' ||
      targetInfo.mu>0 && targetInfo.radiusKm>0;
    const arrivalGeometry=encounterGeometry(
      arrivalExcess,null,target.state,
      (targetInfo.radiusKm||0)+arrivalAltitude
    );
    encounterOffsets.push(arrivalGeometry.offset);
    const arrivalPeriapsisVelocity=add(
      targetVelocity,
      scale(
        arrivalGeometry.tangent,
        velocityAuDay(
          arrivalMode==='orbit'
            ? circularSpeed(targetInfo,arrivalAltitude)
            : periapsisSpeed(arrivalSpeed,targetInfo,arrivalAltitude)
        )
      )
    );
    const poweredFlybyDeltaV=flybys.reduce(
      (total,flyby)=>total+flyby.poweredDeltaVKmS,0
    );
    const totalDeltaV=departureDeltaV+poweredFlybyDeltaV+arrivalDeltaV;
    const score=totalDeltaV+arrivalSpeed*0.04+
      flybys.filter(flyby=>!flyby.feasible).length*25+
      (captureAvailable?0:50);
    return {
      waypoints:waypoints.map((waypoint,index)=>({
        name:waypoint.name,time:waypoint.time,role:waypoint.role,
        altitudeKm:index===0
          ? departureAltitude
          : index===waypoints.length-1 ? arrivalAltitude : waypoint.altitudeKm,
        arrivalMode:waypoint.arrivalMode,
        encounterOffset:encounterOffsets[index]
      })),
      legs,flybys,departureDeltaVKmS:departureDeltaV,
      departureExcessSpeedKmS:departureSpeed,
      departurePeriapsisVelocity,
      arrivalSpeedKmS:arrivalSpeed,arrivalDeltaVKmS:arrivalDeltaV,
      arrivalMode,arrivalPeriapsisVelocity,
      captureAvailable,totalDeltaVKmS:totalDeltaV,
      durationDays:target.time-waypoints[0].time,
      feasible:flybys.every(flyby=>flyby.feasible) && captureAvailable,
      score,longWayMask
    };
  }

  function evaluateRoute(waypoints,options){
    if(!Array.isArray(waypoints) || waypoints.length<2){
      throw new TypeError('A route requires at least two waypoints.');
    }
    for(let index=1;index<waypoints.length;index++){
      if(!(waypoints[index].time>waypoints[index-1].time)){
        throw new RangeError('Waypoint times must increase.');
      }
    }
    const legCount=waypoints.length-1;
    let best=null;
    const branchCount=Math.min(1<<legCount,32);
    for(let mask=0;mask<branchCount;mask++){
      try{
        const route=routeForBranches(waypoints,mask,options);
        if(!best || route.score<best.score) best=route;
      } catch(error){
        if(!(error instanceof RangeError)) throw error;
      }
    }
    if(!best) throw new RangeError('No Lambert branch connects these waypoints.');
    return best;
  }

  function sampleWindow(earliest,latest,count){
    if(count<=1 || earliest===latest) return [earliest];
    return Array.from({length:count},(_,index)=>
      earliest+(latest-earliest)*index/(count-1)
    );
  }

  function searchRoutes(plan,stateAt,options){
    if(!validatePlan(plan)) throw new TypeError('Invalid mission plan.');
    if(typeof stateAt!=='function') throw new TypeError('Mission search requires stateAt.');
    options=options||{};
    const samplesPerWindow=clamp(options.samplesPerWindow||5,2,9);
    const maxCandidates=options.maxCandidates||8;
    const maxCombinations=options.maxCombinations||256;
    const timeSets=plan.waypoints.map((waypoint,index)=>sampleWindow(
      waypoint.earliest,waypoint.latest,
      index===plan.waypoints.length-1
        ? Math.min(9,samplesPerWindow+2)
        : samplesPerWindow
    ));
    const stateCache=new Map();
    function waypointState(waypoint,time){
      const key=waypoint.body+'@'+time.toFixed(8);
      if(!stateCache.has(key)) stateCache.set(key,stateAt(waypoint.body,time));
      const state=stateCache.get(key);
      return state ? {
        name:waypoint.body,role:waypoint.role,time,state,
        altitudeKm:waypoint.altitudeKm,arrivalMode:waypoint.arrivalMode
      } : null;
    }
    const routes=[];
    const chosen=[];
    let combinations=0;
    function visit(index){
      if(index===plan.waypoints.length){
        if(combinations>=maxCombinations) return;
        combinations++;
        try{
          routes.push(evaluateRoute(chosen,options));
        } catch(error){
          if(!(error instanceof RangeError)) throw error;
        }
        return;
      }
      const waypoint=plan.waypoints[index];
      for(const time of timeSets[index]){
        if(combinations>=maxCombinations) break;
        if(chosen.length && time<=chosen[chosen.length-1].time) continue;
        const resolved=waypointState(waypoint,time);
        if(!resolved) continue;
        chosen.push(resolved);
        visit(index+1);
        chosen.pop();
      }
    }
    visit(0);
    routes.sort((a,b)=>a.score-b.score);
    return routes.slice(0,maxCandidates);
  }

  function routeFromPlanSelection(plan,stateAt,options){
    if(!validatePlan(plan) || !Array.isArray(plan.selectedTimes)){
      return null;
    }
    const waypoints=plan.waypoints.map((waypoint,index)=>{
      const time=plan.selectedTimes[index];
      const state=stateAt(waypoint.body,time);
      return state ? {
        name:waypoint.body,role:waypoint.role,time,state,
        altitudeKm:waypoint.altitudeKm,arrivalMode:waypoint.arrivalMode
      } : null;
    });
    if(waypoints.some(waypoint=>!waypoint)) return null;
    if(Number.isInteger(plan.selectedLongWayMask)){
      try{
        return routeForBranches(
          waypoints,plan.selectedLongWayMask,options||{}
        );
      } catch(error){
        if(!(error instanceof RangeError)) throw error;
      }
    }
    return evaluateRoute(waypoints,options);
  }

  function sampleRoute(route,stateAt,count){
    if(!route || !Array.isArray(route.legs) || typeof stateAt!=='function'){
      throw new TypeError('Route sampling requires a solved route and stateAt.');
    }
    return route.legs.map((leg,index)=>{
      if(!stateAt(leg.from,leg.startTime)){
        throw new RangeError('Route body state is unavailable.');
      }
      const points=sampleTransfer(leg.solution,leg.startTime,count||160);
      const offsets=[
        {offset:route.waypoints[index].encounterOffset,start:true},
        {offset:route.waypoints[index+1].encounterOffset,start:false}
      ];
      for(const {offset,start} of offsets){
        if(!offset || magnitude(offset)<=0) continue;
        const blendCount=Math.min(14,Math.floor((points.length-1)/3));
        for(let step=0;step<=blendCount;step++){
          const pointIndex=start ? step : points.length-1-step;
          const blend=1-step/blendCount;
          const weight=blend*blend*(3-2*blend);
          points[pointIndex].x+=offset.x*weight;
          points[pointIndex].y+=offset.y*weight;
          points[pointIndex].z+=offset.z*weight;
        }
      }
      for(let pointIndex=0;pointIndex<points.length;pointIndex++){
        const previous=points[Math.max(0,pointIndex-1)];
        const next=points[Math.min(points.length-1,pointIndex+1)];
        const elapsed=next.t-previous.t;
        if(!(elapsed>0)) continue;
        points[pointIndex].vx=(next.x-previous.x)/elapsed;
        points[pointIndex].vy=(next.y-previous.y)/elapsed;
        points[pointIndex].vz=(next.z-previous.z)/elapsed;
      }
      const startVelocity=index===0
        ? route.departurePeriapsisVelocity
        : route.flybys[index-1]?.outgoingPeriapsisVelocity;
      const endVelocity=index===route.legs.length-1
        ? route.arrivalPeriapsisVelocity
        : route.flybys[index]?.incomingPeriapsisVelocity;
      if(startVelocity){
        Object.assign(points[0],{
          vx:startVelocity.x,vy:startVelocity.y,vz:startVelocity.z
        });
      }
      if(endVelocity){
        Object.assign(points.at(-1),{
          vx:endVelocity.x,vy:endVelocity.y,vz:endVelocity.z
        });
      }
      return {
        from:leg.from,to:leg.to,startTime:leg.startTime,endTime:leg.endTime,
        points
      };
    });
  }

  function stateAlongSamples(sampledRoute,time){
    if(!Array.isArray(sampledRoute)) return null;
    const leg=sampledRoute.find(candidate=>
      time>=candidate.startTime && time<=candidate.endTime
    );
    if(!leg) return null;
    const points=leg.points;
    const exact=(time-leg.startTime)/(leg.endTime-leg.startTime)*
      (points.length-1);
    const lower=Math.max(0,Math.min(points.length-1,Math.floor(exact)));
    const upper=Math.min(points.length-1,lower+1);
    const fraction=exact-lower;
    return {
      x:points[lower].x+(points[upper].x-points[lower].x)*fraction,
      y:points[lower].y+(points[upper].y-points[lower].y)*fraction,
      z:points[lower].z+(points[upper].z-points[lower].z)*fraction,
      vx:points[lower].vx+(points[upper].vx-points[lower].vx)*fraction,
      vy:points[lower].vy+(points[upper].vy-points[lower].vy)*fraction,
      vz:points[lower].vz+(points[upper].vz-points[lower].vz)*fraction
    };
  }

  function validName(value){
    return typeof value==='string' && value.trim().length>0 && value.length<=80;
  }

  function validatePlan(plan){
    if(!plan || plan.version!==PLAN_VERSION || !validName(plan.id) ||
       !validName(plan.name) || !Array.isArray(plan.waypoints) ||
       plan.waypoints.length<2 || plan.waypoints.length>MAX_WAYPOINTS) return false;
    if(plan.waypoints[0].body!=='Earth' ||
       plan.waypoints[0].role!=='departure' ||
       plan.waypoints[plan.waypoints.length-1].role!=='target') return false;
    const waypointsValid=plan.waypoints.every((waypoint,index)=>{
      const expectedRole=index===0
        ? 'departure'
        : index===plan.waypoints.length-1 ? 'target' : 'assist';
      return waypoint.role===expectedRole && validName(waypoint.body) &&
        Number.isFinite(waypoint.earliest) &&
        Number.isFinite(waypoint.latest) &&
        waypoint.latest>=waypoint.earliest &&
        (waypoint.altitudeKm===undefined ||
          Number.isFinite(waypoint.altitudeKm) && waypoint.altitudeKm>=0);
    });
    if(!waypointsValid) return false;
    const arrivalMode=plan.waypoints.at(-1).arrivalMode;
    if(arrivalMode!==undefined &&
       arrivalMode!=='flyby' && arrivalMode!=='orbit') return false;
    if(plan.selectedTimes!==undefined){
      if(!Array.isArray(plan.selectedTimes) ||
         plan.selectedTimes.length!==plan.waypoints.length ||
         plan.selectedTimes.some(time=>!Number.isFinite(time))) return false;
      for(let index=1;index<plan.selectedTimes.length;index++){
        if(!(plan.selectedTimes[index]>plan.selectedTimes[index-1])) return false;
      }
    }
    return plan.selectedLongWayMask===undefined ||
      Number.isInteger(plan.selectedLongWayMask) &&
      plan.selectedLongWayMask>=0 &&
      plan.selectedLongWayMask<(1<<(plan.waypoints.length-1));
  }

  function clonePlan(plan){ return JSON.parse(JSON.stringify(plan)); }

  function loadPlans(storage){
    try{
      const parsed=JSON.parse(storage?.getItem(STORAGE_KEY)||'[]');
      return Array.isArray(parsed)
        ? parsed.filter(validatePlan).map(clonePlan)
        : [];
    } catch(error){
      return [];
    }
  }

  function savePlan(storage,plan){
    if(!validatePlan(plan)) throw new TypeError('Invalid mission plan.');
    if(!storage) throw new Error('Mission storage is unavailable.');
    const plans=loadPlans(storage);
    const index=plans.findIndex(candidate=>candidate.id===plan.id);
    if(index>=0) plans[index]=clonePlan(plan); else plans.push(clonePlan(plan));
    storage.setItem(STORAGE_KEY,JSON.stringify(plans));
    return plans;
  }

  function deletePlan(storage,id){
    if(!validName(id) || !storage) return loadPlans(storage);
    const plans=loadPlans(storage).filter(plan=>plan.id!==id);
    storage.setItem(STORAGE_KEY,JSON.stringify(plans));
    return plans;
  }

  return {
    PLAN_VERSION,STORAGE_KEY,MAX_WAYPOINTS,
    solveLambert,sampleTransfer,flybyAssessment,evaluateRoute,searchRoutes,
    routeFromPlanSelection,sampleRoute,stateAlongSamples,
    validatePlan,loadPlans,savePlan,deletePlan,
    vector,add,subtract,scale,dot,cross,magnitude,speedKmS,
    periapsisBurn,periapsisSpeed,circularSpeed,
    encounterGeometry,encounterOffset
  };
});
