(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  root.WorkScheduler=api;
})(typeof globalThis!=='undefined' ? globalThis : this,function(){
  'use strict';
  function run(iterator){
    let result=iterator.next();
    while(!result.done) result=iterator.next();
    return result.value;
  }
  async function runAsync(iterator,options={}){
    options=options||{};
    const now=options.now||(()=>performance.now());
    const yieldTask=options.yieldTask||(()=>new Promise(resolve=>setTimeout(resolve,0)));
    const budgetMs=options.budgetMs??8;
    if(!(Number.isFinite(budgetMs) && budgetMs>0)){
      throw new RangeError('Work budget must be positive and finite.');
    }
    let deadline=now()+budgetMs;
    while(true){
      if(options.cancelled?.()){
        iterator.return?.();
        return null;
      }
      const result=iterator.next();
      if(result.done){
        options.onProgress?.(1);
        return result.value;
      }
      if(now()>=deadline){
        options.onProgress?.(result.value);
        await yieldTask();
        deadline=now()+budgetMs;
      }
    }
  }
  return {run,runAsync};
});
