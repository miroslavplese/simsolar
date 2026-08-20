const assert=require('node:assert/strict');
const ScenarioState=require('../src/scenario-state.js');
const MissionPlanner=require('../src/mission-planner.js');

const coreState={
  t:9721.25,
  playing:false,
  speed:0.7,
  direction:-1,
  selected:'Voyager 1',
  follow:'Voyager 1',
  view:{zoom:0.28,panX:12,panY:-8,yaw:1.2,tilt:0.9},
  layers:{spacecraft:true,comets:false,lagrange:false,rotating:false},
  observatory:{
    body:'Earth',
    latitude:47.6062,
    longitude:-122.3321,
    azimuth:Math.PI,
    altitude:0.4,
    fov:1.1,
    speed:2,
    enhance:true,
    paths:false,
    timeZone:'America/Los_Angeles'
  }
};

const legacyState={
  ...coreState,
  v:1,
};

const noPlanState={
  ...coreState,
  v:2,
  missionPlan:null
};

const missionPlan={
  version:MissionPlanner.PLAN_VERSION,
  id:'earth-mars-window',
  name:'Earth to Mars window',
  waypoints:[
    {body:'Earth', role:'departure', earliest:100, latest:120},
    {body:'Mars', role:'target', earliest:220, latest:260, altitudeKm:300}
  ]
};

const plannedState={
  ...coreState,
  v:2,
  observatory:null,
  missionPlan:{
    ...missionPlan,
    selectedTimes:[110,240],
    selectedLongWayMask:0
  },
  spacecraftView:{
    yaw:0.2,
    pitch:-0.1,
    fov:Math.PI/3
  }
};

function encodeLegacyScenario(state){
  return Buffer.from(JSON.stringify(state),'utf8').toString('base64')
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

assert.equal(ScenarioState.VERSION,2);
assert.equal(ScenarioState.validate(legacyState),true);
assert.equal(ScenarioState.validate(noPlanState),true);
assert.equal(ScenarioState.validate(plannedState),true);

const encoded=ScenarioState.encode(plannedState);
assert.match(encoded,/^[A-Za-z0-9_-]+$/);
assert.deepEqual(ScenarioState.decode(encoded),plannedState);

const noPlanEncoded=ScenarioState.encode(noPlanState);
assert.deepEqual(ScenarioState.decode(noPlanEncoded),noPlanState);

const legacyEncoded=encodeLegacyScenario(legacyState);
assert.deepEqual(ScenarioState.decode(legacyEncoded),legacyState);

const url=ScenarioState.urlWithScenario(
  'https://example.test/solar-system.html?keep=yes#old',plannedState
);
assert.equal(new URL(url).searchParams.get('keep'),'yes');
assert.equal(new URL(url).hash,'');
assert.deepEqual(ScenarioState.scenarioFromUrl(url),plannedState);

const noPlanUrl=ScenarioState.urlWithScenario(
  'https://example.test/solar-system.html?keep=yes#old',noPlanState
);
assert.deepEqual(ScenarioState.scenarioFromUrl(noPlanUrl),noPlanState);

const legacyScenarioUrl=
  `https://example.test/solar-system.html?keep=yes&scenario=${legacyEncoded}#old`;
assert.deepEqual(ScenarioState.scenarioFromUrl(legacyScenarioUrl),legacyState);

assert.equal(ScenarioState.decode('not-json'),null);
assert.equal(ScenarioState.decode('x'.repeat(4097)),null);
assert.equal(ScenarioState.validate({...legacyState,v:2}),false);
assert.equal(ScenarioState.validate({...noPlanState,v:2}),true);
assert.equal(ScenarioState.validate({
  ...noPlanState,
  missionPlan:{...missionPlan,version:MissionPlanner.PLAN_VERSION+1}
}),false);
assert.equal(ScenarioState.validate({
  ...noPlanState,
  missionPlan:{...missionPlan,waypoints:[missionPlan.waypoints[0]]}
}),false);
assert.equal(ScenarioState.validate({
  ...noPlanState,
  spacecraftView:{yaw:0,pitch:0,fov:Math.PI/3}
}),false);
assert.equal(ScenarioState.validate({
  ...plannedState,
  spacecraftView:{...plannedState.spacecraftView,pitch:Math.PI}
}),false);
assert.equal(ScenarioState.validate({
  ...plannedState,
  observatory:coreState.observatory
}),false);
assert.equal(ScenarioState.validate({...noPlanState,t:Infinity}),false);
assert.equal(ScenarioState.validate({
  ...noPlanState,view:{...noPlanState.view,zoom:500000}
}),true);
assert.equal(ScenarioState.validate({
  ...noPlanState,view:{...noPlanState.view,zoom:2000001}
}),false);
assert.equal(ScenarioState.validate({
  ...noPlanState,
  observatory:{...noPlanState.observatory,latitude:91}
}),false);
assert.equal(ScenarioState.validate({
  ...noPlanState,
  observatory:{...noPlanState.observatory,timeZone:'Not/A_Time_Zone'}
}),false);
assert.throws(()=>ScenarioState.encode({
  ...noPlanState,
  missionPlan:{...missionPlan,version:MissionPlanner.PLAN_VERSION+1}
}),/Invalid/);
assert.throws(()=>ScenarioState.encode({...noPlanState,direction:0}),/Invalid/);

console.log('Scenario state tests passed.');
