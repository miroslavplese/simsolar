(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  root.FrameProfiler=api;
})(typeof globalThis!=='undefined' ? globalThis : this,function(){
  function summarize(samples){
    if(samples.length===0) return null;
    const sorted=[...samples].sort((a,b)=>a-b);
    const total=samples.reduce((sum,value)=>sum+value,0);
    const averageMs=total/samples.length;
    return {
      count:samples.length,
      averageMs,
      p95Ms:sorted[Math.ceil(samples.length*0.95)-1],
      fps:1000/averageMs
    };
  }

  function createFrameProfiler(presets,maxSamples){
    const limit=maxSamples||300;
    const samplesByPreset=new Map(presets.map(preset=>[preset,[]]));

    function record(preset,durationMs){
      const samples=samplesByPreset.get(preset);
      if(!samples) throw new Error(`Unknown profiler preset: ${preset}`);
      if(!Number.isFinite(durationMs) || durationMs<=0) return;
      samples.push(durationMs);
      if(samples.length>limit) samples.splice(0,samples.length-limit);
    }

    function summary(preset){
      const samples=samplesByPreset.get(preset);
      if(!samples) throw new Error(`Unknown profiler preset: ${preset}`);
      return summarize(samples);
    }

    return {record,summary};
  }

  return {summarize,createFrameProfiler};
});
