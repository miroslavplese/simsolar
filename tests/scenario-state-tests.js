const assert=require('node:assert/strict');
const ScenarioState=require('../src/scenario-state.js');

const state={
  v:1,
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

assert.equal(ScenarioState.validate(state),true);
const encoded=ScenarioState.encode(state);
assert.match(encoded,/^[A-Za-z0-9_-]+$/);
assert.deepEqual(ScenarioState.decode(encoded),state);

const url=ScenarioState.urlWithScenario(
  'https://example.test/solar-system.html?keep=yes#old',state
);
assert.equal(new URL(url).searchParams.get('keep'),'yes');
assert.equal(new URL(url).hash,'');
assert.deepEqual(ScenarioState.scenarioFromUrl(url),state);

assert.equal(ScenarioState.decode('not-json'),null);
assert.equal(ScenarioState.decode('x'.repeat(4097)),null);
assert.equal(ScenarioState.validate({...state,v:2}),false);
assert.equal(ScenarioState.validate({...state,t:Infinity}),false);
assert.equal(ScenarioState.validate({
  ...state,
  observatory:{...state.observatory,latitude:91}
}),false);
assert.equal(ScenarioState.validate({
  ...state,
  observatory:{...state.observatory,timeZone:'Not/A_Time_Zone'}
}),false);
assert.throws(()=>ScenarioState.encode({...state,direction:0}),/Invalid/);

console.log('Scenario state tests passed.');
