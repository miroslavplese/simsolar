const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const Engine=require('../src/simulation-engine.js');
const Client=require('../src/simulation-client.js');
const Gravity=require('../src/nbody-simulation.js');
const Moons=require('../src/hierarchical-moon-simulation.js');
const Animation=require('../src/app/animation.js');
const directory=path.resolve(__dirname,'../src');
const initialState=Gravity.createBarycentricState(0,[
  {id:'sun',name:'Sun',mu:Gravity.GM_BY_BODY.Sun,
    state:{x:0,y:0,z:0,vx:0,vy:0,vz:0}},
  {id:'earth',name:'Earth',mu:Gravity.GM_BY_BODY.Earth,
    state:{x:1,y:0,z:0,vx:0,vy:Math.sqrt(Gravity.GM_BY_BODY.Sun),vz:0}}
],[]);
const definition={epoch:0,initialState,bodies:[]};

class Worker{
  constructor(){
    this.terminated=false;
    const self={
      postMessage:data=>queueMicrotask(()=>{
        if(!this.terminated) this.onmessage?.({data:structuredClone(data)});
      })
    };
    const context=vm.createContext({self,performance,setTimeout,clearTimeout});
    context.importScripts=(...files)=>{
      for(const file of files){
        vm.runInContext(fs.readFileSync(path.join(directory,file),'utf8'),context,{
          filename:path.join(directory,file)
        });
      }
    };
    vm.runInContext(fs.readFileSync(path.join(directory,'simulation-worker.js'),'utf8'),context,{
      filename:path.join(directory,'simulation-worker.js')
    });
    this.self=self;
  }
  postMessage(data){
    if(this.terminated) throw new Error('Worker has been terminated.');
    this.self.onmessage({data:structuredClone(data)});
  }
  terminate(){ this.terminated=true; }
}

async function main(){
  const options={stepDays:0.25,particleStepDays:0.03125,checkpointDays:8};
  const reference=Gravity.createSimulator(initialState,options);
  const engine=Engine.create(definition);
  for(const time of [0,0.125,4.25,12.125,2,15.75]){
    const snapshot=await engine.advance({time});
    assert.deepEqual(snapshot.global,reference.stateAt(time));
    assert.equal(snapshot.time,time);
    assert.equal(snapshot.moons,null);
  }
  const moonInitial=Moons.createInitialState(0,[{
    parentName:'Earth',systemMu:Gravity.GM_BY_BODY.Earth,
    parentState:{x:1,y:0,z:0,vx:0,vy:0.0172,vz:0},
    moons:[{name:'Moon',mu:Gravity.MOON_GM_BY_BODY.Moon,
      state:{x:1.00257,y:0,z:0,vx:0,vy:0.0178,vz:0}}]
  }]);
  const lunarDefinition={...definition,moonState:moonInitial.state};
  const global=Gravity.createSimulator(initialState,options);
  const lunarReference=Moons.createSimulator(moonInitial.state,time=>{
    const index=Math.floor(time+1e-10);
    const fraction=Math.max(0,Math.min(1,time-index));
    const lower=global.massiveStateAt(index);
    if(fraction<1e-10) return lower;
    const upper=global.massiveStateAt(index+1);
    return lower.map((body,index)=>{
      const result={...body};
      for(const key of ['x','y','z','vx','vy','vz']){
        result[key]=body[key]+(upper[index][key]-body[key])*fraction;
      }
      return result;
    });
  });
  const lunar=Engine.create(lunarDefinition);
  for(const time of [0.025,2.125,0.5,3.25]){
    const result=await lunar.advance({time});
    assert.deepEqual(result.moons,lunarReference.stateAt(time));
  }

  for(const protocol of ['file:','http:']){
    const client=Client.create({window:{location:{protocol},Worker},workerUrl:'test'});
    const model={};
    for(const time of [0.125,4.25,1.5]){
      const result=await client.advance(model,definition,{time});
      assert.deepEqual(result.global,reference.stateAt(time));
    }
    const pending=client.advance(model,definition,{time:36525});
    client.cancel();
    assert.equal(await pending,null,'cancelled work cannot publish a snapshot');
    const recovered=await client.advance(model,definition,{time:0.125});
    assert.deepEqual(recovered.global,reference.stateAt(0.125));
    const obsolete=client.advance(model,definition,{time:36525});
    const replacement=client.advance({},definition,{time:0.25});
    assert.equal(await obsolete,null,'model replacement invalidates the old request');
    assert.deepEqual((await replacement).global,reference.stateAt(0.25));
    const stopped=client.advance({},definition,{time:36525});
    client.dispose();
    assert.equal(await stopped,null,'disposing resolves outstanding requests');
    client.dispose();
    assert.equal(client.mode,protocol==='file:'?'cooperative':'worker');
  }
  const initialCancellation=Client.create({
    window:{location:{protocol:'http:'},Worker},workerUrl:'test'
  });
  const model={};
  const cancelled=initialCancellation.advance(model,definition,{time:10});
  initialCancellation.cancel();
  assert.equal(await cancelled,null);
  assert.deepEqual((await initialCancellation.advance(model,definition,{time:1})).global,
    reference.stateAt(1),'cancelling initialization does not lose the engine');
  initialCancellation.dispose();
  const preCancelled=Client.create({
    window:{location:{protocol:'http:'},Worker},workerUrl:'test'
  });
  assert.equal(await preCancelled.advance(model,definition,{time:1},{
    cancelled:()=>true
  }),null);
  assert.deepEqual((await preCancelled.advance(model,definition,{time:1})).global,
    reference.stateAt(1),'cancellation before dispatch leaves initialization intact');
  preCancelled.dispose();
  const noWorker=Client.create({window:{location:{protocol:'http:'}}});
  assert.equal(noWorker.mode,'cooperative');
  assert.deepEqual((await noWorker.advance(model,definition,{time:1})).global,
    reference.stateAt(1));
  noWorker.dispose();
  const broken=Client.create({
    window:{location:{protocol:'http:'},Worker:class{
      constructor(){throw new Error('Worker unavailable');}
    }},workerUrl:'test'
  });
  await assert.rejects(broken.advance(model,definition,{time:1}),/Worker unavailable/);
  await assert.rejects(broken.advance(model,definition,{time:1}),/Worker unavailable/);
  broken.dispose();

  const impactBodies=[0,1].map(index=>({
    id:'impact-'+index,name:'Impact '+index,kind:'custom',radiusKm:1000,
    mu:Gravity.massKgToMu((index+1)*1e20),
    state:{x:(index?1:-1)*0.000005,y:0,z:0,vx:0,vy:0,vz:0}
  }));
  const impactDefinition={
    epoch:100,bodies:impactBodies,
    initialState:Gravity.createBarycentricState(100,impactBodies,[])
  };
  const collision=await Engine.create(impactDefinition).advance({start:100,time:100.01});
  assert.equal(collision.impact.time,100);
  assert.equal(collision.time,100);
  assert.equal(collision.impact.key,'impact-0|impact-1');
  const resumed=await Engine.create(impactDefinition).advance({
    start:100,time:100.001,ignoredKey:collision.impact.key
  });
  assert.equal(resumed.impact,null,'resume preserves ignored-contact behavior');
  await assert.rejects(engine.advance({time:-1}),/precedes/);
  await assert.rejects(engine.advance({time:NaN}),/finite/);
  assert.throws(()=>Engine.create({...definition,epoch:1}),/matching finite epoch/);

  const frames=new Map();
  let nextFrame=0,readyTime=20,draws=0;
  const advances=[];
  const clock={
    simDaysSinceJ2000:20,playing:true,direction:1,dateNavigationRevision:0,
    get requestedDays(){return this.simDaysSinceJ2000;},
    playBtn:{},speedDaysPerSec:()=>10,
    playbackClock:{reset(){},tick:()=>({elapsed:0.1,playback:0.1})},
    stopAtHybridLimit(){}
  };
  const simulation={
    asyncEnabled:true,editableSystem:null,HYBRID_MAX_DAYS:100,
    isFrameReady:time=>time===readyTime,
    cancelPreparation(){},
    prepareFrame(time,options){
      return new Promise(resolve=>advances.push({
        time,finish(){
          if(options.cancelled()) resolve(null);
          else {
            readyTime=time;
            resolve({time,impact:null,ignoredKey:null});
          }
        }
      }));
    }
  };
  const animation=Animation.create({
    document:{hidden:false},
    window:{
      SystemModel:{TIME_LIMIT_DAYS:1000},
      requestAnimationFrame(callback){frames.set(++nextFrame,callback);return nextFrame;},
      cancelAnimationFrame(id){frames.delete(id);}
    },
    clock,simulation,camera:{},profiler:{frameProfiler:{}},
    observatory:{observatoryActive:false},
    impacts:{lastImpactPredictionUpdate:0,updateImpactPanel(){},ignoredImpactKey:null},
    planner:{},cockpit:{},sceneRenderer:{draw(){draws++;}},
    onError:message=>assert.fail(message)
  });
  function frame(){
    assert.equal(frames.size,1);
    const [id,callback]=frames.entries().next().value;
    frames.delete(id);
    callback(10);
  }
  animation.start();
  frame();
  frame();
  assert.equal(clock.simDaysSinceJ2000,20,'time waits for a completed snapshot');
  assert.equal(advances.length,1,'live requests do not build an unbounded queue');
  assert.equal(draws,2,'the previous snapshot remains renderable while the Worker is busy');
  advances[0].finish();
  await new Promise(setImmediate);
  assert.equal(clock.simDaysSinceJ2000,21);
  frame();
  clock.playing=false;
  advances[1].finish();
  await new Promise(setImmediate);
  assert.equal(clock.simDaysSinceJ2000,21,'pausing invalidates an outstanding advance');
  clock.playing=true;
  frame();
  animation.stop();
  advances[2].finish();
  await new Promise(setImmediate);
  assert.equal(clock.simDaysSinceJ2000,21,'a stopped loop cannot commit an old snapshot');
  assert.equal(frames.size,0);
  console.log('Simulation worker, cooperative fallback, exact states, moons, cancellation, and collisions passed.');
}
main().catch(error=>{console.error(error); process.exitCode=1;});
