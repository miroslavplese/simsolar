(function(root,factory){
  const api=factory(typeof module==='object' && module.exports
    ? require('./scenario-state.js') : root.ScenarioState);
  if(typeof module==='object' && module.exports) module.exports=api;
  root.ScenarioController=api;
})(typeof globalThis!=='undefined' ? globalThis : this,function(scenarios){
  'use strict';
  function create(options){
    let revision=0;
    async function restore(state){
      if(!scenarios.validate(state)) throw new TypeError('Invalid scenario state.');
      const current=++revision;
      const applied=options.apply(state,()=>current!==revision);
      if(applied && typeof applied.then==='function') await applied;
      if(current!==revision) return;
      if(state.missionPlan){
        const restored=await options.restoreMission(state.missionPlan);
        if(current===revision && restored && state.spacecraftView){
          options.restoreCockpit(state.spacecraftView);
        }
      }
    }
    function link(href){
      const state=options.capture();
      const encoded=scenarios.encode(state);
      if(encoded.length>4096){
        throw new RangeError('CUSTOM SYSTEM IS TOO LARGE TO SHARE (4096 LIMIT)');
      }
      return scenarios.urlWithScenario(href,state);
    }
    function cancel(){
      revision++;
    }
    return {restore,link,cancel};
  }
  return {create};
});
