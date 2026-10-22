(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  root.PlaybackClock=api;
})(typeof globalThis!=='undefined' ? globalThis : this,function(){
  'use strict';
  function create(maxDeltaSeconds=0.1){
    let last=null;
    return {
      reset(){ last=null; },
      tick(timestamp,hidden=false){
        if(hidden){ last=null; return {elapsed:0,playback:0}; }
        const elapsed=last===null ? 0 : Math.max(0,(timestamp-last)/1000);
        last=timestamp;
        return {elapsed,playback:Math.min(maxDeltaSeconds,elapsed)};
      }
    };
  }
  return {create};
});
