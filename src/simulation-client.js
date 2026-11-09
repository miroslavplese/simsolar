(function(root,factory){
  const node=typeof module==='object' && module.exports;
  const api=factory(
    node?require('./simulation-engine.js'):root.SimulationEngine,
    !node && root.document?.currentScript
      ? new URL('simulation-worker.js',root.document.currentScript.src).href : null
  );
  if(node) module.exports=api;
  root.SimulationClient=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(engineFactory,workerUrl){
  'use strict';

  function create(options){
    const {window}=options;
    const offThread=window.location.protocol!=='file:' && typeof window.Worker==='function';
    let worker=null,engine=null,model=null,sequence=0,generation=0,failure=null;
    const pending=new Map();
    let fallbackQueue=Promise.resolve();

    function fail(error){
      failure=error;
      worker?.terminate();
      worker=null;
      for(const request of pending.values()) request.reject(error);
      pending.clear();
    }
    function cancel(){
      generation++;
      worker?.postMessage({type:'cancel'});
    }
    function dispose(){
      cancel();
      worker?.terminate();
      worker=null;
      engine=null;
      model=null;
      failure=null;
      for(const request of pending.values()) request.resolve(null);
      pending.clear();
    }
    function configure(nextModel,definition){
      if(nextModel===model && !failure) return null;
      dispose();
      model=nextModel;
      if(!offThread){
        engine=engineFactory.create(definition);
        return null;
      }
      try{
        worker=new window.Worker(options.workerUrl||workerUrl);
        const activeWorker=worker;
        worker.onmessage=({data})=>{
          if(worker!==activeWorker) return;
          const request=pending.get(data.id);
          if(!request) return;
          if(data.progress!==undefined){
            if(request.generation===generation) request.options.onProgress?.(data.progress);
            return;
          }
          pending.delete(data.id);
          if(data.error) request.reject(new Error(data.error.message));
          else request.resolve(request.generation===generation?data.result:null);
        };
        worker.onerror=event=>{
          event.preventDefault?.();
          if(worker===activeWorker) fail(new Error('Simulation worker failed: '+event.message));
        };
        worker.onmessageerror=()=>{
          if(worker===activeWorker) fail(new Error('Simulation worker returned an unreadable message.'));
        };
      } catch(error){
        fail(error);
        throw error;
      }
      return definition;
    }
    async function advance(nextModel,definition,request,advanceOptions={}){
      if(advanceOptions.cancelled?.()) return null;
      if(failure && nextModel===model) throw failure;
      const initial=configure(nextModel,definition);
      const current=generation;
      if(!offThread){
        const currentEngine=engine;
        const task=fallbackQueue.then(()=>currentEngine.advance(request,{
          ...advanceOptions,budgetMs:8,
          cancelled:()=>current!==generation || advanceOptions.cancelled?.()
        }));
        // Recover the queue, not the caller's rejected task.
        fallbackQueue=task.then(()=>undefined,()=>undefined);
        return task;
      }
      return new Promise((resolve,reject)=>{
        const id=++sequence;
        pending.set(id,{resolve,reject,options:advanceOptions,generation:current});
        try{
          worker.postMessage({
            type:'advance',id,definition:initial,request,
            progress:typeof advanceOptions.onProgress==='function'
          });
        } catch(error){
          pending.delete(id);
          fail(error);
          reject(error);
        }
      }).then(result=>advanceOptions.cancelled?.()?null:result);
    }
    return {advance,cancel,dispose,mode:offThread?'worker':'cooperative'};
  }
  return {create};
});
