importScripts('trajectory-math.js','work-scheduler.js','mission-planner.js');
self.onmessage=({data})=>{
  try{
    const states=new Map(data.states);
    const result=MissionPlanner.searchRoutes(
      data.plan,(name,time)=>states.get(name+'@'+time.toFixed(8)),
      {...data.options,bodyInfo:name=>data.bodies[name]}
    );
    self.postMessage({result});
  } catch(error){
    self.postMessage({error:{name:error.name,message:error.message}});
  }
};
