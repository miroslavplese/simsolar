const assert=require('node:assert/strict');
const {
  GM_SUN_AU_DAY,propagateState
}=require('../src/trajectory-math.js');
const {
  solveLambert,sampleTransfer,flybyAssessment,evaluateRoute,searchRoutes,
  routeFromPlanSelection,sampleRoute,stateAlongSamples,
  validatePlan,loadPlans,savePlan,deletePlan
}=require('../src/mission-planner.js');

function close(actual,expected,tolerance,message){
  assert.ok(Math.abs(actual-expected)<=tolerance,
    `${message}: expected ${expected}, received ${actual}`);
}

const circularSpeed=Math.sqrt(GM_SUN_AU_DAY);
const quarterPeriod=Math.PI/(2*circularSpeed);
const quarter=solveLambert(
  {x:1,y:0,z:0},{x:0,y:1,z:0},quarterPeriod
);
close(quarter.departureVelocity.x,0,1e-8,'quarter departure vx');
close(quarter.departureVelocity.y,circularSpeed,1e-8,'quarter departure vy');
close(quarter.arrivalVelocity.x,-circularSpeed,1e-8,'quarter arrival vx');
close(quarter.arrivalVelocity.y,0,1e-8,'quarter arrival vy');
const propagated=propagateState({
  t:0,x:1,y:0,z:0,
  vx:quarter.departureVelocity.x,
  vy:quarter.departureVelocity.y,
  vz:quarter.departureVelocity.z
},quarterPeriod,GM_SUN_AU_DAY);
close(propagated.x,0,1e-8,'Lambert propagated x');
close(propagated.y,1,1e-8,'Lambert propagated y');
const samples=sampleTransfer(quarter,100,24);
assert.equal(samples.length,25);
assert.equal(samples[0].t,100);
close(samples.at(-1).x,0,1e-8,'sampled endpoint x');
close(samples.at(-1).y,1,1e-8,'sampled endpoint y');

assert.throws(
  ()=>solveLambert({x:1,y:0,z:0},{x:1,y:0,z:0},10),
  /singular/
);
assert.throws(
  ()=>solveLambert({x:1,y:0,z:0},{x:0,y:1,z:0},-1),
  /positive time/
);

const earthStart={
  x:1,y:0,z:0,vx:0,vy:circularSpeed,vz:0
};
const targetEnd={
  x:0,y:1,z:0,vx:-circularSpeed,vy:0,vz:0
};
const direct=evaluateRoute([
  {name:'Earth',role:'departure',time:0,state:earthStart},
  {name:'Target',role:'target',time:quarterPeriod,state:targetEnd}
]);
close(direct.departureDeltaVKmS,0,1e-6,'circular departure delta-v');
close(direct.arrivalSpeedKmS,0,1e-6,'circular arrival speed');
assert.equal(direct.legs.length,1);
assert.equal(direct.flybys.length,0);

const flyby=flybyAssessment(
  {x:0,y:circularSpeed+0.0001,z:0},
  {x:0,y:circularSpeed+0.0001,z:0},
  earthStart,
  {mu:8.887692e-10,radiusKm:6371,altitudeKm:300}
);
assert.equal(flyby.feasible,true);
close(flyby.poweredDeltaVKmS,0,1e-12,'matching flyby delta-v');

const plan={
  version:1,id:'quarter-transfer',name:'Quarter transfer',
  waypoints:[
    {body:'Earth',role:'departure',earliest:0,latest:0},
    {body:'Target',role:'target',earliest:quarterPeriod,latest:quarterPeriod}
  ]
};
assert.equal(validatePlan(plan),true);
assert.equal(validatePlan({...plan,id:''}),false);
assert.equal(validatePlan({
  ...plan,waypoints:[...plan.waypoints,{body:'Extra',role:'target',earliest:20,latest:21}]
}),false);
const searched=searchRoutes(plan,(name,time)=>
  name==='Earth' ? earthStart : targetEnd
);
assert.equal(searched.length,1);
close(searched[0].departureDeltaVKmS,0,1e-6,'searched departure delta-v');
const selectedPlan={
  ...plan,
  selectedTimes:[0,quarterPeriod],
  selectedLongWayMask:searched[0].longWayMask
};
assert.equal(validatePlan(selectedPlan),true);
const restoredRoute=routeFromPlanSelection(
  selectedPlan,
  name=>name==='Earth' ? earthStart : targetEnd
);
close(restoredRoute.arrivalSpeedKmS,0,1e-6,'restored arrival speed');
const sampledRoute=sampleRoute(
  restoredRoute,name=>name==='Earth' ? earthStart : targetEnd,21
);
assert.equal(sampledRoute[0].points.length,22);
const routeMidpoint=stateAlongSamples(sampledRoute,quarterPeriod/2);
close(
  Math.hypot(routeMidpoint.x,routeMidpoint.y),1,2e-3,
  'sampled route midpoint radius'
);
assert.equal(stateAlongSamples(sampledRoute,-1),null);
assert.equal(validatePlan({...selectedPlan,selectedTimes:[1,0]}),false);

const values=new Map();
const storage={
  getItem:key=>values.has(key)?values.get(key):null,
  setItem:(key,value)=>values.set(key,value)
};
assert.deepEqual(loadPlans(storage),[]);
assert.equal(savePlan(storage,plan).length,1);
assert.deepEqual(loadPlans(storage),[plan]);
const renamed={...plan,name:'Renamed'};
assert.equal(savePlan(storage,renamed).length,1);
assert.equal(loadPlans(storage)[0].name,'Renamed');
assert.deepEqual(deletePlan(storage,plan.id),[]);

console.log('Mission planner tests passed.');
