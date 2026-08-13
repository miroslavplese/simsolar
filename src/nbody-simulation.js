(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  root.NBodySimulation=api;
})(typeof globalThis!=='undefined' ? globalThis : this,function(){
  const AU_KM=1.495978707e8;
  const SECONDS_PER_DAY=86400;
  const KM3_S2_TO_AU3_DAY2=SECONDS_PER_DAY*SECONDS_PER_DAY/(AU_KM*AU_KM*AU_KM);
  const GM_KM3_S2={
    Sun:1.32712440018e11,
    Mercury:22031.86855,
    Venus:324858.592,
    Earth:403503.235502,
    Mars:42828.375214,
    Jupiter:126686534.911,
    Saturn:37931207.8,
    Uranus:5793951.3,
    Neptune:6835099.5,
    Pluto:869.613817,
    Charon:105.88
  };
  const GM_BY_BODY=Object.fromEntries(
    Object.entries(GM_KM3_S2).map(([name,mu])=>[name,mu*KM3_S2_TO_AU3_DAY2])
  );

  function cloneBody(body){
    return {...body};
  }

  function kinematicState(state){
    return {
      x:state.x,y:state.y,z:state.z,
      vx:state.vx,vy:state.vy,vz:state.vz
    };
  }

  function cloneState(state){
    return {
      t:state.t,
      massive:state.massive.map(cloneBody),
      particles:state.particles.map(cloneBody)
    };
  }

  function createBarycentricState(t,massiveDefinitions,particleDefinitions){
    const massive=massiveDefinitions.map(definition=>({
      name:definition.name,
      mu:definition.mu,
      ...kinematicState(definition.state)
    }));
    const totalMu=massive.reduce((sum,body)=>sum+body.mu,0);
    if(!(totalMu>0)) throw new Error('At least one massive body is required.');

    const offset={x:0,y:0,z:0,vx:0,vy:0,vz:0};
    for(const body of massive){
      for(const key of Object.keys(offset)) offset[key]-=body.mu*body[key]/totalMu;
    }
    for(const body of massive){
      for(const key of Object.keys(offset)) body[key]+=offset[key];
    }
    const particles=particleDefinitions.map(definition=>{
      const body={
        name:definition.name,
        stepDays:definition.stepDays,
        adaptiveFactor:definition.adaptiveFactor,
        ...kinematicState(definition.state)
      };
      for(const key of Object.keys(offset)) body[key]+=offset[key];
      return body;
    });
    return {t,massive,particles};
  }

  function massiveAccelerations(bodies){
    const acceleration=bodies.map(()=>({x:0,y:0,z:0}));
    for(let i=0;i<bodies.length;i++){
      for(let j=i+1;j<bodies.length;j++){
        const dx=bodies[j].x-bodies[i].x;
        const dy=bodies[j].y-bodies[i].y;
        const dz=bodies[j].z-bodies[i].z;
        const distanceSq=dx*dx+dy*dy+dz*dz;
        if(distanceSq===0) throw new Error(`Massive bodies overlap: ${bodies[i].name} and ${bodies[j].name}`);
        const invDistance3=1/(distanceSq*Math.sqrt(distanceSq));
        const scaleI=bodies[j].mu*invDistance3;
        const scaleJ=bodies[i].mu*invDistance3;
        acceleration[i].x+=dx*scaleI;
        acceleration[i].y+=dy*scaleI;
        acceleration[i].z+=dz*scaleI;
        acceleration[j].x-=dx*scaleJ;
        acceleration[j].y-=dy*scaleJ;
        acceleration[j].z-=dz*scaleJ;
      }
    }
    return acceleration;
  }

  function particleAccelerationBetween(particle,startMassive,endMassive,fraction){
    const acceleration={x:0,y:0,z:0};
    for(let i=0;i<startMassive.length;i++){
      const start=startMassive[i], end=endMassive[i];
      const bodyX=start.x+(end.x-start.x)*fraction;
      const bodyY=start.y+(end.y-start.y)*fraction;
      const bodyZ=start.z+(end.z-start.z)*fraction;
      const dx=bodyX-particle.x;
      const dy=bodyY-particle.y;
      const dz=bodyZ-particle.z;
      const distanceSq=dx*dx+dy*dy+dz*dz;
      if(distanceSq===0){
        throw new Error(`Particle overlaps massive body: ${particle.name} and ${start.name}`);
      }
      const scale=start.mu/(distanceSq*Math.sqrt(distanceSq));
      acceleration.x+=dx*scale;
      acceleration.y+=dy*scale;
      acceleration.z+=dz*scale;
    }
    return acceleration;
  }

  function applyHalfKick(bodies,acceleration,halfStep){
    for(let i=0;i<bodies.length;i++){
      bodies[i].vx+=acceleration[i].x*halfStep;
      bodies[i].vy+=acceleration[i].y*halfStep;
      bodies[i].vz+=acceleration[i].z*halfStep;
    }
  }

  function drift(bodies,step){
    for(const body of bodies){
      body.x+=body.vx*step;
      body.y+=body.vy*step;
      body.z+=body.vz*step;
    }
  }

  function particleStepLimit(particle,massive,defaultStep){
    let limit=particle.stepDays||defaultStep;
    if(!particle.adaptiveFactor) return limit;
    for(const body of massive){
      const distance=Math.hypot(
        particle.x-body.x,
        particle.y-body.y,
        particle.z-body.z
      );
      if(distance===0){
        throw new Error(`Particle overlaps massive body: ${particle.name} and ${body.name}`);
      }
      const dynamicalTime=Math.sqrt(distance*distance*distance/body.mu);
      limit=Math.min(limit,dynamicalTime/particle.adaptiveFactor);
    }
    return limit;
  }

  function stepState(state,stepDays,particleStepDays){
    const halfStep=stepDays/2;
    const massiveStartPositions=state.massive.map(cloneBody);
    const massiveStart=massiveAccelerations(state.massive);
    applyHalfKick(state.massive,massiveStart,halfStep);
    drift(state.massive,stepDays);
    const massiveEnd=massiveAccelerations(state.massive);
    applyHalfKick(state.massive,massiveEnd,halfStep);

    for(const particle of state.particles){
      const requestedParticleStep=particleStepLimit(
        particle,massiveStartPositions,particleStepDays||Math.abs(stepDays)
      );
      const particleSubsteps=Math.max(1,Math.ceil(Math.abs(stepDays)/requestedParticleStep));
      const particleStep=stepDays/particleSubsteps;
      for(let substep=0;substep<particleSubsteps;substep++){
        const startFraction=substep/particleSubsteps;
        const endFraction=(substep+1)/particleSubsteps;
        const particleStart=particleAccelerationBetween(
          particle,massiveStartPositions,state.massive,startFraction
        );
        particle.vx+=particleStart.x*particleStep/2;
        particle.vy+=particleStart.y*particleStep/2;
        particle.vz+=particleStart.z*particleStep/2;
        particle.x+=particle.vx*particleStep;
        particle.y+=particle.vy*particleStep;
        particle.z+=particle.vz*particleStep;
        const particleEnd=particleAccelerationBetween(
          particle,massiveStartPositions,state.massive,endFraction
        );
        particle.vx+=particleEnd.x*particleStep/2;
        particle.vy+=particleEnd.y*particleStep/2;
        particle.vz+=particleEnd.z*particleStep/2;
      }
    }
    state.t+=stepDays;
    return state;
  }

  function createSimulator(initialState,options){
    const stepDays=options?.stepDays||0.25;
    const particleStepDays=options?.particleStepDays||stepDays;
    const checkpointDays=options?.checkpointDays||8;
    const checkpointStride=Math.max(1,Math.round(checkpointDays/stepDays));
    const epoch=initialState.t;
    const checkpoints=new Map([[0,cloneState(initialState)]]);
    let maxCheckpointIndex=0;

    function stateAt(targetTime){
      if(targetTime<epoch) throw new RangeError('N-body target time precedes the simulation epoch.');
      const exactIndex=(targetTime-epoch)/stepDays;
      const lowerIndex=Math.floor(exactIndex+1e-10);
      const fraction=Math.max(0,Math.min(1,exactIndex-lowerIndex));
      const desiredCheckpoint=Math.floor(lowerIndex/checkpointStride)*checkpointStride;
      const checkpointIndex=Math.min(desiredCheckpoint,maxCheckpointIndex);
      const lower=cloneState(checkpoints.get(checkpointIndex));
      for(let index=checkpointIndex;index<lowerIndex;index++){
        stepState(lower,stepDays,particleStepDays);
        lower.t=epoch+(index+1)*stepDays;
        if((index+1)%checkpointStride===0){
          checkpoints.set(index+1,cloneState(lower));
          maxCheckpointIndex=Math.max(maxCheckpointIndex,index+1);
        }
      }
      if(fraction<1e-10) return lower;
      stepState(lower,stepDays*fraction,particleStepDays);
      lower.t=targetTime;
      return lower;
    }

    async function prepareTo(targetTime,prepareOptions){
      if(targetTime<epoch) return stateAt(targetTime);
      const chunkDays=prepareOptions?.chunkDays||180;
      const totalSpan=targetTime-epoch;
      while(epoch+maxCheckpointIndex*stepDays<targetTime-checkpointDays){
        if(prepareOptions?.cancelled?.()) return null;
        const preparedTime=epoch+maxCheckpointIndex*stepDays;
        const chunkTarget=Math.min(targetTime,preparedTime+chunkDays);
        stateAt(chunkTarget);
        if(prepareOptions?.onProgress){
          prepareOptions.onProgress(Math.min(1,(chunkTarget-epoch)/totalSpan));
        }
        await new Promise(resolve=>setTimeout(resolve,0));
      }
      if(prepareOptions?.cancelled?.()) return null;
      return stateAt(targetTime);
    }

    return {epoch,stepDays,particleStepDays,stateAt,prepareTo};
  }

  function heliocentricState(state,name){
    const sun=state.massive.find(body=>body.name==='Sun');
    const body=state.massive.find(candidate=>candidate.name===name) ||
      state.particles.find(candidate=>candidate.name===name);
    if(!sun || !body) return null;
    return {
      x:body.x-sun.x,
      y:body.y-sun.y,
      z:body.z-sun.z,
      vx:body.vx-sun.vx,
      vy:body.vy-sun.vy,
      vz:body.vz-sun.vz
    };
  }

  function invariants(state){
    const momentum={x:0,y:0,z:0};
    let kinetic=0;
    let potential=0;
    for(const body of state.massive){
      momentum.x+=body.mu*body.vx;
      momentum.y+=body.mu*body.vy;
      momentum.z+=body.mu*body.vz;
      kinetic+=body.mu*(body.vx*body.vx+body.vy*body.vy+body.vz*body.vz)/2;
    }
    for(let i=0;i<state.massive.length;i++){
      for(let j=i+1;j<state.massive.length;j++){
        const a=state.massive[i], b=state.massive[j];
        potential-=a.mu*b.mu/Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
      }
    }
    return {energy:kinetic+potential,momentum};
  }

  return {
    GM_BY_BODY,cloneState,createBarycentricState,stepState,createSimulator,
    heliocentricState,invariants
  };
});
