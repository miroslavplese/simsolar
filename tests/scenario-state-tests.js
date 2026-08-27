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
    timeZone:'America/Los_Angeles',
    telescope:{
      target:'Jupiter',
      tracking:true,
      exposure:1.4,
      wideFov:70*Math.PI/180
    }
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

const editableSystem={
  mode:'editable',
  epoch:9721,
  bodies:[{
    id:'custom-a',name:'A',kind:'custom',category:'Star',
    appearance:'star',color:'#fff',radius:1000,massKg:1e20,mu:1e-14,
    state:{x:0,y:0,z:0,vx:0,vy:0,vz:0}
  }]
};

const editableState={
  ...plannedState,
  v:3,
  system:editableSystem
};

function encodeLegacyScenario(state){
  return Buffer.from(JSON.stringify(state),'utf8').toString('base64')
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

assert.equal(ScenarioState.VERSION,3);
assert.equal(ScenarioState.validate(legacyState),true);
assert.equal(ScenarioState.validate(noPlanState),true);
assert.equal(ScenarioState.validate(plannedState),true);
assert.equal(ScenarioState.validate(editableState),true);

const encoded=ScenarioState.encode(editableState);
assert.match(encoded,/^[A-Za-z0-9_-]+$/);
assert.deepEqual(ScenarioState.decode(encoded),editableState);

const noPlanEncoded=ScenarioState.encode({...noPlanState,v:3,system:null});
assert.deepEqual(
  ScenarioState.decode(noPlanEncoded),
  {...noPlanState,v:3,system:null}
);

const legacyEncoded=encodeLegacyScenario(legacyState);
assert.deepEqual(ScenarioState.decode(legacyEncoded),legacyState);

const url=ScenarioState.urlWithScenario(
  'https://example.test/solar-system.html?keep=yes#old',editableState
);
assert.equal(new URL(url).searchParams.get('keep'),'yes');
assert.equal(new URL(url).hash,'');
assert.deepEqual(ScenarioState.scenarioFromUrl(url),editableState);

const noPlanUrl=ScenarioState.urlWithScenario(
  'https://example.test/solar-system.html?keep=yes#old',
  {...noPlanState,v:3,system:null}
);
assert.deepEqual(
  ScenarioState.scenarioFromUrl(noPlanUrl),
  {...noPlanState,v:3,system:null}
);

const legacyScenarioUrl=
  `https://example.test/solar-system.html?keep=yes&scenario=${legacyEncoded}#old`;
assert.deepEqual(ScenarioState.scenarioFromUrl(legacyScenarioUrl),legacyState);

assert.equal(ScenarioState.decode('not-json'),null);
assert.equal(ScenarioState.decode('x'.repeat(4097)),null);
assert.equal(ScenarioState.validate({...legacyState,v:2}),false);
assert.equal(ScenarioState.validate({...noPlanState,v:2}),true);
assert.equal(ScenarioState.validate({...noPlanState,v:3}),false);
assert.equal(ScenarioState.validate({
  ...editableState,
  system:{...editableSystem,bodies:[
    ...editableSystem.bodies,{...editableSystem.bodies[0]}
  ]}
}),false);
assert.equal(ScenarioState.validate({
  ...editableState,t:editableSystem.epoch-1
}),false);
assert.equal(ScenarioState.validate({
  ...noPlanState,v:3,system:null,t:36601
}),false);
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
assert.equal(ScenarioState.validate({
  ...noPlanState,
  observatory:{
    ...noPlanState.observatory,
    fov:0.05*Math.PI/180,
    telescope:{
      target:'Moon',tracking:true,exposure:1,wideFov:70*Math.PI/180
    }
  }
}),true);
assert.equal(ScenarioState.validate({
  ...noPlanState,
  observatory:{
    ...noPlanState.observatory,
    telescope:{
      target:'Moon',tracking:true,exposure:4,wideFov:70*Math.PI/180
    }
  }
}),false);
assert.throws(()=>ScenarioState.encode({
  ...noPlanState,
  missionPlan:{...missionPlan,version:MissionPlanner.PLAN_VERSION+1}
}),/Invalid/);
assert.throws(()=>ScenarioState.encode({...noPlanState,direction:0}),/Invalid/);

console.log('Scenario state tests passed.');
