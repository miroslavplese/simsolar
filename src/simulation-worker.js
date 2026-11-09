importScripts(
  'work-scheduler.js','trajectory-math.js','nbody-simulation.js',
  'hierarchical-moon-simulation.js','collision-system.js','simulation-engine.js'
);

let engine=null;
let revision=0;
let queue=Promise.resolve();
self.onmessage=({data})=>{
  if(data.type==='cancel'){
    revision++;
    return;
  }
  if(data.type!=='advance') return;
  const current=revision;
  queue=queue.then(async()=>{
    try{
      if(data.definition) engine=SimulationEngine.create(data.definition);
      if(current!==revision){
        self.postMessage({id:data.id,result:null});
        return;
      }
      if(!engine) throw new Error('Simulation worker has not been initialized.');
      const result=await engine.advance(data.request,{
        budgetMs:8,cancelled:()=>current!==revision,
        onProgress:data.progress
          ? progress=>self.postMessage({id:data.id,progress}) : undefined
      });
      self.postMessage({id:data.id,result});
    } catch(error){
      self.postMessage({id:data.id,error:{message:error.message}});
    }
  });
};
