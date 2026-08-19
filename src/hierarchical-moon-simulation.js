(function(root,factory){
  const trajectory=typeof module==='object' && module.exports
    ? require('./trajectory-math.js')
    : root.TrajectoryMath;
  const api=factory(trajectory);
  if(typeof module==='object' && module.exports) module.exports=api;
  root.HierarchicalMoonSimulation=api;
})(typeof globalThis!=='undefined' ? globalThis : this,function(trajectory){
  const {propagateState}=trajectory;

  function cloneVector(state){
    return {
      x:state.x,y:state.y,z:state.z,
      vx:state.vx,vy:state.vy,vz:state.vz
    };
  }

  function cloneState(state){
    return {
      t:state.t,
      systems:state.systems.map(system=>({
        parentName:system.parentName,
        systemMu:system.systemMu,
        parentMu:system.parentMu,
        moons:system.moons.map(moon=>({
          name:moon.name,mu:moon.mu,...cloneVector(moon)
        }))
      }))
    };
  }

  function weightedBarycenter(parentMu,parentState,moons,systemMu){
    const center={x:0,y:0,z:0,vx:0,vy:0,vz:0};
    for(const key of Object.keys(center)){
      center[key]=parentMu*parentState[key];
      for(const moon of moons) center[key]+=moon.mu*moon.state[key];
      center[key]/=systemMu;
    }
    return center;
  }

  function createInitialState(t,definitions){
    const barycenters={};
    const systems=definitions.map(definition=>{
      const moonMu=definition.moons.reduce((sum,moon)=>sum+moon.mu,0);
      const parentMu=definition.systemMu-moonMu;
      if(!(parentMu>0)){
        throw new RangeError(`${definition.parentName} system GM must exceed integrated moon GMs.`);
      }
      barycenters[definition.parentName]=weightedBarycenter(
        parentMu,definition.parentState,definition.moons,definition.systemMu
      );
      return {
        parentName:definition.parentName,
        systemMu:definition.systemMu,
        parentMu,
        moons:definition.moons.map(moon=>({
          name:moon.name,
          mu:moon.mu,
          x:moon.state.x-definition.parentState.x,
          y:moon.state.y-definition.parentState.y,
          z:moon.state.z-definition.parentState.z,
          vx:moon.state.vx-definition.parentState.vx,
          vy:moon.state.vy-definition.parentState.vy,
          vz:moon.state.vz-definition.parentState.vz
        }))
      };
    });
    return {state:{t,systems},barycenters};
  }

  function parentOffset(system){
    const offset={x:0,y:0,z:0,vx:0,vy:0,vz:0};
    for(const key of Object.keys(offset)){
      for(const moon of system.moons) offset[key]-=moon.mu*moon[key];
      offset[key]/=system.systemMu;
    }
    return offset;
  }

  function absoluteSystemStates(system,externalMassive){
    const barycenter=externalMassive.find(body=>body.name===system.parentName);
    if(!barycenter){
      throw new Error(`Missing external barycenter for ${system.parentName}.`);
    }
    const offset=parentOffset(system);
    const parent={
      name:system.parentName,mu:system.parentMu,
      x:barycenter.x+offset.x,y:barycenter.y+offset.y,z:barycenter.z+offset.z,
      vx:barycenter.vx+offset.vx,vy:barycenter.vy+offset.vy,vz:barycenter.vz+offset.vz
    };
    const moons=system.moons.map(moon=>({
      name:moon.name,mu:moon.mu,
      x:parent.x+moon.x,y:parent.y+moon.y,z:parent.z+moon.z,
      vx:parent.vx+moon.vx,vy:parent.vy+moon.vy,vz:parent.vz+moon.vz
    }));
    return {parent,moons};
  }

  function accelerationFromExternal(point,externalMassive,excludedName){
    const acceleration={x:0,y:0,z:0};
    for(const body of externalMassive){
      if(body.name===excludedName) continue;
      const dx=body.x-point.x;
      const dy=body.y-point.y;
      const dz=body.z-point.z;
      const distanceSq=dx*dx+dy*dy+dz*dz;
      if(distanceSq===0){
        throw new Error(`External body overlaps ${excludedName} subsystem.`);
      }
      const scale=body.mu/(distanceSq*Math.sqrt(distanceSq));
      acceleration.x+=dx*scale;
      acceleration.y+=dy*scale;
      acceleration.z+=dz*scale;
    }
    return acceleration;
  }

  function perturbationAccelerations(state,externalMassive){
    return state.systems.map(system=>{
      const absolute=absoluteSystemStates(system,externalMassive);
      const parentExternal=accelerationFromExternal(
        absolute.parent,externalMassive,system.parentName
      );
      return system.moons.map((moon,index)=>{
        const moonExternal=accelerationFromExternal(
          absolute.moons[index],externalMassive,system.parentName
        );
        const acceleration={
          x:moonExternal.x-parentExternal.x,
          y:moonExternal.y-parentExternal.y,
          z:moonExternal.z-parentExternal.z
        };
        for(let otherIndex=0;otherIndex<system.moons.length;otherIndex++){
          if(otherIndex===index) continue;
          const other=system.moons[otherIndex];
          const dx=other.x-moon.x;
          const dy=other.y-moon.y;
          const dz=other.z-moon.z;
          const moonDistanceSq=dx*dx+dy*dy+dz*dz;
          const parentDistanceSq=other.x*other.x+other.y*other.y+other.z*other.z;
          if(moonDistanceSq===0 || parentDistanceSq===0){
            throw new Error(`Overlapping moons in ${system.parentName} subsystem.`);
          }
          const moonScale=other.mu/(moonDistanceSq*Math.sqrt(moonDistanceSq));
          const parentScale=other.mu/(parentDistanceSq*Math.sqrt(parentDistanceSq));
          acceleration.x+=dx*moonScale-other.x*parentScale;
          acceleration.y+=dy*moonScale-other.y*parentScale;
          acceleration.z+=dz*moonScale-other.z*parentScale;
        }
        return acceleration;
      });
    });
  }

  function applyKick(state,accelerations,step){
    for(let systemIndex=0;systemIndex<state.systems.length;systemIndex++){
      const system=state.systems[systemIndex];
      for(let moonIndex=0;moonIndex<system.moons.length;moonIndex++){
        const moon=system.moons[moonIndex];
        const acceleration=accelerations[systemIndex][moonIndex];
        moon.vx+=acceleration.x*step;
        moon.vy+=acceleration.y*step;
        moon.vz+=acceleration.z*step;
      }
    }
  }

  function driftKepler(state,step){
    for(const system of state.systems){
      for(const moon of system.moons){
        const propagated=propagateState(
          {t:state.t,...cloneVector(moon)},
          step,
          system.parentMu+moon.mu
        );
        Object.assign(moon,cloneVector(propagated));
      }
    }
  }

  function stepState(state,step,externalStateAt){
    const startAcceleration=perturbationAccelerations(
      state,externalStateAt(state.t)
    );
    applyKick(state,startAcceleration,step/2);
    driftKepler(state,step);
    state.t+=step;
    const endAcceleration=perturbationAccelerations(
      state,externalStateAt(state.t)
    );
    applyKick(state,endAcceleration,step/2);
    return state;
  }

  function createSimulator(initialState,externalStateAt,options){
    const stepDays=options?.stepDays||0.05;
    const checkpointDays=options?.checkpointDays||1;
    const checkpointStride=Math.max(1,Math.round(checkpointDays/stepDays));
    const epoch=initialState.t;
    const checkpoints=new Map([[0,cloneState(initialState)]]);
    let maxCheckpointIndex=0;
    let stateCursor=cloneState(initialState);
    let stateCursorIndex=0;

    function stateAt(targetTime){
      if(targetTime<epoch){
        throw new RangeError('Moon target time precedes the simulation epoch.');
      }
      const exactIndex=(targetTime-epoch)/stepDays;
      const lowerIndex=Math.floor(exactIndex+1e-10);
      const fraction=Math.max(0,Math.min(1,exactIndex-lowerIndex));
      const desiredCheckpoint=Math.floor(lowerIndex/checkpointStride)*checkpointStride;
      let checkpointIndex=Math.min(desiredCheckpoint,maxCheckpointIndex);
      let state;
      if(stateCursorIndex>=checkpointIndex && stateCursorIndex<=lowerIndex){
        checkpointIndex=stateCursorIndex;
        state=cloneState(stateCursor);
      } else {
        state=cloneState(checkpoints.get(checkpointIndex));
      }
      for(let index=checkpointIndex;index<lowerIndex;index++){
        stepState(state,stepDays,externalStateAt);
        state.t=epoch+(index+1)*stepDays;
        if((index+1)%checkpointStride===0){
          checkpoints.set(index+1,cloneState(state));
          maxCheckpointIndex=Math.max(maxCheckpointIndex,index+1);
        }
      }
      if(lowerIndex>=stateCursorIndex){
        stateCursor=cloneState(state);
        stateCursorIndex=lowerIndex;
      }
      if(fraction>=1e-10){
        stepState(state,stepDays*fraction,externalStateAt);
        state.t=targetTime;
      }
      return state;
    }

    async function prepareTo(targetTime,prepareOptions){
      const chunkDays=prepareOptions?.chunkDays||30;
      const total=Math.max(stepDays,targetTime-epoch);
      while(epoch+maxCheckpointIndex*stepDays<targetTime-checkpointDays){
        if(prepareOptions?.cancelled?.()) return null;
        const prepared=epoch+maxCheckpointIndex*stepDays;
        const chunkTarget=Math.min(targetTime,prepared+chunkDays);
        stateAt(chunkTarget);
        prepareOptions?.onProgress?.(Math.min(1,(chunkTarget-epoch)/total));
        await new Promise(resolve=>setTimeout(resolve,0));
      }
      if(prepareOptions?.cancelled?.()) return null;
      return stateAt(targetTime);
    }

    return {epoch,stepDays,stateAt,prepareTo};
  }

  function bodyState(state,externalMassive,name){
    for(const system of state.systems){
      if(system.parentName!==name && !system.moons.some(moon=>moon.name===name)){
        continue;
      }
      const absolute=absoluteSystemStates(system,externalMassive);
      if(system.parentName===name) return absolute.parent;
      return absolute.moons.find(moon=>moon.name===name)||null;
    }
    return null;
  }

  function invariants(state){
    let energy=0;
    const momentum={x:0,y:0,z:0};
    for(const system of state.systems){
      const parent=parentOffset(system);
      energy+=system.parentMu*(
        parent.vx*parent.vx+parent.vy*parent.vy+parent.vz*parent.vz
      )/2;
      momentum.x+=system.parentMu*parent.vx;
      momentum.y+=system.parentMu*parent.vy;
      momentum.z+=system.parentMu*parent.vz;
      for(const moon of system.moons){
        const vx=parent.vx+moon.vx;
        const vy=parent.vy+moon.vy;
        const vz=parent.vz+moon.vz;
        energy+=moon.mu*(vx*vx+vy*vy+vz*vz)/2;
        energy-=system.parentMu*moon.mu/Math.hypot(moon.x,moon.y,moon.z);
        momentum.x+=moon.mu*vx;
        momentum.y+=moon.mu*vy;
        momentum.z+=moon.mu*vz;
      }
      for(let i=0;i<system.moons.length;i++){
        for(let j=i+1;j<system.moons.length;j++){
          const a=system.moons[i], b=system.moons[j];
          energy-=a.mu*b.mu/Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
        }
      }
    }
    return {energy,momentum};
  }

  return {
    cloneState,createInitialState,parentOffset,absoluteSystemStates,
    perturbationAccelerations,stepState,createSimulator,bodyState,invariants
  };
});
