(function(root,factory){
  const node=typeof module==='object' && module.exports;
  const api=factory(
    node?require('./nbody-simulation.js'):root.NBodySimulation,
    node?require('./hierarchical-moon-simulation.js'):root.HierarchicalMoonSimulation,
    node?require('./collision-system.js'):root.CollisionSystem
  );
  if(node) module.exports=api;
  root.SimulationEngine=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(nbody,moons,collisions){
  'use strict';

  function create(definition){
    if(!Number.isFinite(definition.epoch) || definition.initialState.t!==definition.epoch){
      throw new TypeError('Simulation definition must have a matching finite epoch.');
    }
    const options={stepDays:0.25,particleStepDays:0.03125,checkpointDays:8};
    const global=nbody.createSimulator(definition.initialState,options);
    const externalCache=new Map();
    function externalStateAt(time){
      const exactIndex=time-definition.epoch;
      const index=Math.floor(exactIndex+1e-10);
      const fraction=Math.max(0,Math.min(1,exactIndex-index));
      let interval=externalCache.get(index);
      if(!interval){
        interval={
          lower:global.massiveStateAt(definition.epoch+index),
          upper:global.massiveStateAt(definition.epoch+index+1)
        };
        externalCache.set(index,interval);
        if(externalCache.size>64) externalCache.delete(externalCache.keys().next().value);
      }
      if(fraction<1e-10) return interval.lower;
      return interval.lower.map((body,index)=>{
        const upper=interval.upper[index];
        const state={...body};
        for(const key of ['x','y','z','vx','vy','vz']){
          state[key]=body[key]+(upper[key]-body[key])*fraction;
        }
        return state;
      });
    }
    const hierarchy=definition.moonState
      ? moons.createSimulator(definition.moonState,externalStateAt) : null;

    function detectImpact(start,end,ignoredKey){
      if(!(end>start) || start<definition.epoch) return {impact:null,ignoredKey};
      const bodies=definition.bodies.filter(body=>body.radiusKm>0);
      if(!bodies.some(body=>body.kind==='custom')) return {impact:null,ignoredKey};
      const positionAt=collisions.memoizedStateSampler(
        time=>global.stateAt(time),
        (state,body)=>nbody.bodyState(state,body.id)
      );
      let impact=null;
      for(let i=0;i<bodies.length;i++){
        for(let j=i+1;j<bodies.length;j++){
          const a=bodies[i],b=bodies[j];
          if(a.kind!=='custom' && b.kind!=='custom') continue;
          const startA=positionAt(a,start),startB=positionAt(b,start);
          if(!startA || !startB) continue;
          const key=[a.id,b.id].sort().join('|');
          const radius=(a.radiusKm+b.radiusKm)/1.495978707e8;
          if(ignoredKey===key){
            if(collisions.impactStillInProgress(startA,startB,radius)) continue;
            ignoredKey=null;
          }
          const hit=collisions.refinedSweptSphereImpact(
            start,end,time=>positionAt(a,time),time=>positionAt(b,time),radius
          );
          if(hit && (!impact || hit.time<impact.time)){
            const stateA=positionAt(a,hit.time),stateB=positionAt(b,hit.time);
            impact={
              aId:a.id,bId:b.id,key,time:hit.time,
              speedKmS:Math.hypot(
                stateA.vx-stateB.vx,stateA.vy-stateB.vy,stateA.vz-stateB.vz
              )*1.495978707e8/86400
            };
          }
        }
      }
      return {impact,ignoredKey};
    }

    async function advance(request,options={}){
      if(!Number.isFinite(request.time)){
        throw new RangeError('Simulation target time must be finite.');
      }
      const prepared=await global.prepareTo(request.time,{
        ...options,onProgress:progress=>options.onProgress?.(progress*(hierarchy?0.4:1))
      });
      if(!prepared || options.cancelled?.()) return null;
      if(hierarchy){
        const ready=await hierarchy.prepareTo(request.time,{
          ...options,onProgress:progress=>options.onProgress?.(0.4+progress*0.6)
        });
        if(!ready || options.cancelled?.()) return null;
      }
      const result=detectImpact(request.start,request.time,request.ignoredKey);
      if(options.cancelled?.()) return null;
      const time=result.impact?.time??request.time;
      return {
        time,global:global.stateAt(time),
        moons:hierarchy?hierarchy.stateAt(time):null,...result
      };
    }
    return {advance};
  }
  return {create};
});
