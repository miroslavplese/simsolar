const assert=require('node:assert/strict');
const scheduler=require('../src/work-scheduler.js');
const Clock=require('../src/playback-clock.js');
const NBody=require('../src/nbody-simulation.js');
const Moons=require('../src/hierarchical-moon-simulation.js');
const Planner=require('../src/mission-planner.js');
const Scenarios=require('../src/scenario-controller.js');

async function main(){
  const clock=Clock.create();
  assert.deepEqual(clock.tick(0),{elapsed:0,playback:0});
  assert.equal(clock.tick(16).playback,0.016);
  assert.equal(clock.tick(60000).playback,0.1);
  assert.equal(clock.tick(70000,true).playback,0);
  assert.equal(clock.tick(80000).playback,0);
  clock.reset();
  assert.equal(clock.tick(90000).playback,0);

  let ticks=0,yields=0,cancelled=false;
  const options={
    now:()=>ticks++,budgetMs:8,
    yieldTask:async()=>{ yields++; }
  };
  function* sequence(){ for(let i=0;i<40;i++) yield i/40; return 42; }
  assert.equal(await scheduler.runAsync(sequence(),options),42);
  assert.ok(yields>=4,'work must yield at its wall-clock budget');
  assert.equal(await scheduler.runAsync(sequence(),{
    ...options,cancelled:()=>cancelled,
    yieldTask:async()=>{ cancelled=true; }
  }),null);
  await assert.rejects(scheduler.runAsync(sequence(),{budgetMs:0}),/positive/);

  const initial=NBody.createBarycentricState(0,[
    {name:'Sun',mu:NBody.GM_BY_BODY.Sun,state:{x:0,y:0,z:0,vx:0,vy:0,vz:0}},
    {name:'Earth',mu:NBody.GM_BY_BODY.Earth,
      state:{x:1,y:0,z:0,vx:0,vy:Math.sqrt(NBody.GM_BY_BODY.Sun),vz:0}}
  ],[]);
  const expected=NBody.createSimulator(initial).stateAt(123.456);
  const asynchronous=NBody.createSimulator(initial);
  assert.deepEqual(await asynchronous.prepareTo(123.456,options),expected);
  assert.deepEqual(asynchronous.stateAt(123.456),expected);
  const interrupted=NBody.createSimulator(initial);
  cancelled=false;
  assert.equal(await interrupted.prepareTo(123.456,{
    ...options,cancelled:()=>cancelled,
    yieldTask:async()=>{ cancelled=true; }
  }),null);
  assert.deepEqual(await interrupted.prepareTo(123.456,options),expected);
  assert.deepEqual(await asynchronous.prepareTo(10.125,options),
    NBody.createSimulator(initial).stateAt(10.125));
  const moon=Moons.createInitialState(0,[{
    parentName:'Earth',systemMu:NBody.GM_BY_BODY.Earth,
    parentState:{x:1,y:0,z:0,vx:0,vy:0.0172,vz:0},
    moons:[{name:'Moon',mu:NBody.MOON_GM_BY_BODY.Moon,
      state:{x:1.00257,y:0,z:0,vx:0,vy:0.0178,vz:0}}]
  }]);
  const external=()=>[
    {name:'Sun',mu:NBody.GM_BY_BODY.Sun,x:0,y:0,z:0,vx:0,vy:0,vz:0},
    {name:'Earth',mu:NBody.GM_BY_BODY.Earth,...moon.barycenters.Earth}
  ];
  assert.deepEqual(
    await Moons.createSimulator(moon.state,external).prepareTo(23.456,options),
    Moons.createSimulator(moon.state,external).stateAt(23.456)
  );

  const plan={version:1,id:'async',name:'Async',waypoints:[
    {body:'Earth',role:'departure',earliest:0,latest:10},
    {body:'Mars',role:'target',earliest:200,latest:300}
  ]};
  const stateAt=(name,t)=>{
    const r=name==='Earth'?1:1.524;
    const n=Math.sqrt(NBody.GM_BY_BODY.Sun/r**3);
    return {x:r*Math.cos(n*t),y:r*Math.sin(n*t),z:0,
      vx:-r*n*Math.sin(n*t),vy:r*n*Math.cos(n*t),vz:0};
  };
  assert.deepEqual(await Planner.searchRoutesAsync(plan,stateAt,options),
    Planner.searchRoutes(plan,stateAt));
  assert.deepEqual(Planner.searchRoutes(plan,stateAt,null),Planner.searchRoutes(plan,stateAt));
  assert.equal(await Planner.searchRoutesAsync(plan,stateAt,{
    cancelled:()=>true
  }),null);
  const state={
    v:3,t:100,playing:false,speed:1,direction:1,selected:null,follow:null,
    view:{zoom:1,panX:0,panY:0,yaw:0,tilt:0.5},
    layers:{spacecraft:true,comets:true,lagrange:false,rotating:false},
    observatory:null,system:null,missionPlan:null
  };
  let applied;
  const controller=Scenarios.create({capture:()=>state,apply:s=>{ applied=s; }});
  await controller.restore(state);
  assert.equal(applied,state);
  assert.ok(controller.link('file:///solar-system.html').includes('?scenario='));
  await assert.rejects(controller.restore({...state,v:99}),/Invalid/);
  console.log('Application scheduling, playback, and scenario tests passed.');
}
main().catch(error=>{ console.error(error); process.exitCode=1; });
