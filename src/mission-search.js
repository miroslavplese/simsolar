(function(root){
  'use strict';
  const workerUrl=new URL('mission-worker.js',document.currentScript.src);
  async function search(plan,stateAt,options={}){
    if(!root.MissionPlanner.validatePlan(plan)) throw new TypeError('Invalid mission plan.');
    if(root.location.protocol==='file:' || typeof root.Worker!=='function'){
      return root.MissionPlanner.searchRoutesAsync(plan,stateAt,options);
    }
    const states=new Map(),bodies={};
    const times=root.MissionPlanner.searchTimeSets(plan,options);
    function* collect(){
      for(let index=0;index<plan.waypoints.length;index++){
        const name=plan.waypoints[index].body;
        bodies[name]=options.bodyInfo?.(name);
        for(const time of times[index]){
          states.set(name+'@'+time.toFixed(8),stateAt(name,time));
          yield;
        }
      }
      return true;
    }
    if(!await root.WorkScheduler.runAsync(collect(),options)) return null;
    return new Promise((resolve,reject)=>{
      const worker=new Worker(workerUrl);
      let cancellationTimer;
      function finish(error,result){
        clearInterval(cancellationTimer);
        worker.terminate();
        if(error) reject(error); else resolve(result);
      }
      worker.onmessage=({data})=>{
        finish(data.error ? new Error(data.error.message) : null,data.result);
      };
      worker.onerror=event=>finish(new Error('Mission worker failed: '+event.message));
      cancellationTimer=setInterval(()=>{
        if(options.cancelled?.()) finish(null,null);
      },25);
      worker.postMessage({
        plan,states:[...states],bodies,
        options:{
          mu:options.mu,prograde:options.prograde,samplesPerWindow:options.samplesPerWindow,
          maxCombinations:options.maxCombinations,maxCandidates:options.maxCandidates
        }
      });
    });
  }
  root.MissionSearch={search};
})(globalThis);
