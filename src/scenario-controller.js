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
      options.apply(state);
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
    return {restore,link};
  }
  return {create};
});
