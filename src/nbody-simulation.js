(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  root.NBodySimulation=api;
})(typeof globalThis!=='undefined' ? globalThis : this,function(){
  const AU_KM=1.495978707e8;
  const SECONDS_PER_DAY=86400;
  const G_KM3_KG_S2=6.67430e-20;
  const KM3_S2_TO_AU3_DAY2=SECONDS_PER_DAY*SECONDS_PER_DAY/(AU_KM*AU_KM*AU_KM);
  const GM_KM3_S2={
    Sun:1.3271244004127942e11,
    Mercury:22031.8685514,
    Venus:324858.592,
    Earth:403503.23562548019,
    Mars:42828.375815756102,
    Jupiter:126712764.09999998,
    Saturn:37940584.841799997,
    Uranus:5794556.3999999985,
    Neptune:6836527.100580399,
    Pluto:869.3261226311508,
    Charon:106.1011388236118
  };
  const MOON_GM_KM3_S2={
    Moon:4902.80011845755,
    Phobos:0.0007087546066894452,
    Deimos:0.00009615569648120313,
    Io:5959.915466180539,
    Europa:3202.712099607295,
    Ganymede:9887.832752719638,
    Callisto:7179.283402579837,
    Rhea:153.9417519146563,
    Titan:8978.137095521046,
    Iapetus:120.5151060137642,
    Titania:222.8006351879754,
    Oberon:214.2098399407347,
    Triton:1428.495462910464
  };
  const GM_BY_BODY=Object.fromEntries(
    Object.entries(GM_KM3_S2).map(([name,mu])=>[name,mu*KM3_S2_TO_AU3_DAY2])
  );
  const MOON_GM_BY_BODY=Object.fromEntries(
    Object.entries(MOON_GM_KM3_S2).map(([name,mu])=>[name,mu*KM3_S2_TO_AU3_DAY2])
  );
  const MASS_KG={
    Sun:1.98847e30,
    Mercury:3.3011e23,
    Venus:4.8675e24,
    Earth:5.97237e24,
    Mars:6.4171e23,
    Jupiter:1.8982e27,
    Saturn:5.6834e26,
    Uranus:8.6810e25,
    Neptune:1.02413e26,
    Pluto:1.303e22,
    Charon:1.586e21
  };

  function massKgToMu(massKg){
    if(!Number.isFinite(massKg) || massKg<=0){
      throw new RangeError('Mass must be a positive finite value.');
    }
    return massKg*G_KM3_KG_S2*KM3_S2_TO_AU3_DAY2;
  }

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
      adaptiveFactor:definition.adaptiveFactor,
      ...kinematicState(definition.state)
    }));
    const particles=particleDefinitions.map(definition=>{
      const body={
        name:definition.name,
        stepDays:definition.stepDays,
        adaptiveFactor:definition.adaptiveFactor,
        ...kinematicState(definition.state)
      };
      return body;
    });
    return recenterBarycentricState({t,massive,particles});
  }

  function recenterBarycentricState(state){
    const totalMu=state.massive.reduce((sum,body)=>sum+body.mu,0);
    if(!(totalMu>0)) throw new Error('At least one massive body is required.');
    const offset={x:0,y:0,z:0,vx:0,vy:0,vz:0};
    for(const body of state.massive){
      for(const key of Object.keys(offset)){
        offset[key]-=body.mu*body[key]/totalMu;
      }
    }
    for(const body of [...state.massive,...state.particles]){
      for(const key of Object.keys(offset)) body[key]+=offset[key];
    }
    return state;
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

  function massiveStepLimit(bodies,stepDays){
    const span=Math.abs(stepDays);
    let limit=span;
    for(let i=0;i<bodies.length;i++){
      for(let j=i+1;j<bodies.length;j++){
        const a=bodies[i], b=bodies[j];
        const adaptiveFactor=Math.max(
          a.adaptiveFactor||0,b.adaptiveFactor||0
        );
        if(!adaptiveFactor) continue;
        const position={
          x:a.x-b.x,y:a.y-b.y,z:a.z-b.z
        };
        const velocity={
          x:a.vx-b.vx,y:a.vy-b.vy,z:a.vz-b.vz
        };
        const speedSq=
          velocity.x**2+velocity.y**2+velocity.z**2;
        const approachTime=speedSq===0 ? 0 : Math.max(0,Math.min(
          span,
          -(
            position.x*velocity.x+
            position.y*velocity.y+
            position.z*velocity.z
          )/speedSq
        ));
        const direction=Math.sign(stepDays)||1;
        const closestDistance=Math.max(1e-9,Math.hypot(
          position.x+velocity.x*approachTime*direction,
          position.y+velocity.y*approachTime*direction,
          position.z+velocity.z*approachTime*direction
        ));
        const dynamicalTime=Math.sqrt(
          closestDistance**3/(a.mu+b.mu)
        );
        limit=Math.min(limit,dynamicalTime/adaptiveFactor);
        if(speedSq>0){
          limit=Math.min(
            limit,closestDistance/Math.sqrt(speedSq)/adaptiveFactor
          );
        }
      }
    }
    return Math.max(limit,span/1024);
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
    const requestedMassiveStep=massiveStepLimit(state.massive,stepDays);
    const massiveSubsteps=Math.max(
      1,Math.ceil(Math.abs(stepDays)/requestedMassiveStep)
    );
    const massiveStep=stepDays/massiveSubsteps;
    for(let massiveSubstep=0;massiveSubstep<massiveSubsteps;massiveSubstep++){
      const halfStep=massiveStep/2;
      const massiveStartPositions=state.massive.map(cloneBody);
      const massiveStart=massiveAccelerations(state.massive);
      applyHalfKick(state.massive,massiveStart,halfStep);
      drift(state.massive,massiveStep);
      const massiveEnd=massiveAccelerations(state.massive);
      applyHalfKick(state.massive,massiveEnd,halfStep);

      for(const particle of state.particles){
        const requestedParticleStep=particleStepLimit(
          particle,massiveStartPositions,
          particleStepDays||Math.abs(massiveStep)
        );
        const particleSubsteps=Math.max(
          1,Math.ceil(Math.abs(massiveStep)/requestedParticleStep)
        );
        const particleStep=massiveStep/particleSubsteps;
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
    let stateCursor=cloneState(initialState);
    let stateCursorIndex=0;
    const massiveCheckpoints=new Map([[
      0,{t:initialState.t,massive:initialState.massive.map(cloneBody),particles:[]}
    ]]);
    let maxCheckpointIndex=0;
    let maxMassiveCheckpointIndex=0;
    let massiveCursor=cloneState(massiveCheckpoints.get(0));
    let massiveCursorIndex=0;

    function stateAt(targetTime){
      if(targetTime<epoch) throw new RangeError('N-body target time precedes the simulation epoch.');
      const exactIndex=(targetTime-epoch)/stepDays;
      const lowerIndex=Math.floor(exactIndex+1e-10);
      const fraction=Math.max(0,Math.min(1,exactIndex-lowerIndex));
      const desiredCheckpoint=Math.floor(lowerIndex/checkpointStride)*checkpointStride;
      let checkpointIndex=Math.min(desiredCheckpoint,maxCheckpointIndex);
      let lower;
      if(stateCursorIndex>=checkpointIndex && stateCursorIndex<=lowerIndex){
        checkpointIndex=stateCursorIndex;
        lower=cloneState(stateCursor);
      } else {
        lower=cloneState(checkpoints.get(checkpointIndex));
      }
      for(let index=checkpointIndex;index<lowerIndex;index++){
        stepState(lower,stepDays,particleStepDays);
        lower.t=epoch+(index+1)*stepDays;
        if((index+1)%checkpointStride===0){
          checkpoints.set(index+1,cloneState(lower));
          maxCheckpointIndex=Math.max(maxCheckpointIndex,index+1);
        }
      }
      if(lowerIndex>=stateCursorIndex){
        stateCursor=cloneState(lower);
        stateCursorIndex=lowerIndex;
      }
      if(fraction<1e-10) return lower;
      stepState(lower,stepDays*fraction,particleStepDays);
      lower.t=targetTime;
      return lower;
    }

    function massiveStateAt(targetTime){
      if(targetTime<epoch) throw new RangeError('N-body target time precedes the simulation epoch.');
      const exactIndex=(targetTime-epoch)/stepDays;
      const lowerIndex=Math.floor(exactIndex+1e-10);
      const fraction=Math.max(0,Math.min(1,exactIndex-lowerIndex));
      const desiredCheckpoint=Math.floor(lowerIndex/checkpointStride)*checkpointStride;
      let checkpointIndex=Math.min(
        desiredCheckpoint,maxMassiveCheckpointIndex
      );
      let lower;
      if(massiveCursorIndex>=checkpointIndex && massiveCursorIndex<=lowerIndex){
        checkpointIndex=massiveCursorIndex;
        lower=cloneState(massiveCursor);
      } else {
        lower=cloneState(massiveCheckpoints.get(checkpointIndex));
      }
      for(let index=checkpointIndex;index<lowerIndex;index++){
        stepState(lower,stepDays,stepDays);
        lower.t=epoch+(index+1)*stepDays;
        if((index+1)%checkpointStride===0){
          massiveCheckpoints.set(index+1,cloneState(lower));
          maxMassiveCheckpointIndex=Math.max(
            maxMassiveCheckpointIndex,index+1
          );
        }
      }
      if(fraction>=1e-10){
        stepState(lower,stepDays*fraction,stepDays);
        lower.t=targetTime;
      } else if(lowerIndex>=massiveCursorIndex){
        massiveCursor=cloneState(lower);
        massiveCursorIndex=lowerIndex;
      }
      return lower.massive;
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

    return {epoch,stepDays,particleStepDays,stateAt,massiveStateAt,prepareTo};
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
    GM_BY_BODY,MOON_GM_BY_BODY,MASS_KG,massKgToMu,cloneState,
    createBarycentricState,stepState,
    recenterBarycentricState,createSimulator,heliocentricState,invariants
  };
});
