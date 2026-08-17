const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {
  createInitialState,
  createSimulator,
  bodyState,
  invariants
}=require('../src/hierarchical-moon-simulation.js');
const {
  GM_BY_BODY,MOON_GM_BY_BODY,createBarycentricState,
  createSimulator:createNBodySimulator
}=require('../src/nbody-simulation.js');
const {AU_KM,propagateState}=require('../src/trajectory-math.js');
const {MAJOR_MOONS}=require('../src/moon-system.js');

const parentMu=1e-5;
const moonMu=1e-8;
const systemMu=parentMu+moonMu;
const radius=0.01;
const speed=Math.sqrt(systemMu/radius);
const period=2*Math.PI*Math.sqrt(radius**3/systemMu);
const definition={
  parentName:'Planet',
  systemMu,
  parentState:{x:1,y:0,z:0,vx:0,vy:0,vz:0},
  moons:[{
    name:'Moon',mu:moonMu,
    state:{x:1+radius,y:0,z:0,vx:0,vy:speed,vz:0}
  }]
};
const initialized=createInitialState(0,[definition]);
const barycenter=initialized.barycenters.Planet;
assert.ok(barycenter.x>1 && barycenter.x<1+radius);

function isolatedExternal(){
  return [{
    name:'Planet',mu:systemMu,
    x:barycenter.x,y:barycenter.y,z:barycenter.z,
    vx:barycenter.vx,vy:barycenter.vy,vz:barycenter.vz
  }];
}
const isolated=createSimulator(initialized.state,isolatedExternal,{
  stepDays:period/20,checkpointDays:period
});
const initialInvariant=invariants(initialized.state);
const afterOrbits=isolated.stateAt(period*20);
const finalInvariant=invariants(afterOrbits);
assert.ok(Math.abs(
  (finalInvariant.energy-initialInvariant.energy)/initialInvariant.energy
)<1e-10);
assert.ok(Math.hypot(
  finalInvariant.momentum.x,
  finalInvariant.momentum.y,
  finalInvariant.momentum.z
)<1e-20);
const isolatedMoon=bodyState(afterOrbits,isolatedExternal(),'Moon');
assert.ok(Math.abs(Math.hypot(
  isolatedMoon.x-bodyState(afterOrbits,isolatedExternal(),'Planet').x,
  isolatedMoon.y-bodyState(afterOrbits,isolatedExternal(),'Planet').y,
  isolatedMoon.z-bodyState(afterOrbits,isolatedExternal(),'Planet').z
)-radius)<1e-10);

const sun={name:'Sun',mu:2.9591220828559093e-4,x:0,y:0,z:0,vx:0,vy:0,vz:0};
function perturbedExternal(){
  return [sun,...isolatedExternal()];
}
const perturbed=createSimulator(initialized.state,perturbedExternal,{
  stepDays:period/40,checkpointDays:period
});
const perturbedState=perturbed.stateAt(period*20);
const perturbedMoon=bodyState(perturbedState,perturbedExternal(),'Moon');
assert.ok(Math.hypot(
  perturbedMoon.x-isolatedMoon.x,
  perturbedMoon.y-isolatedMoon.y,
  perturbedMoon.z-isolatedMoon.z
)>1e-9,'external tidal gravity must perturb the moon orbit');

const replayA=perturbed.stateAt(period*7.25);
perturbed.stateAt(period*30);
assert.deepEqual(perturbed.stateAt(period*7.25),replayA);

function loadGenerated(relativePath,key){
  const context={window:{}};
  const source=fs.readFileSync(path.resolve(__dirname,'..',relativePath),'utf8');
  vm.runInNewContext(source,context,{filename:relativePath});
  return context.window[key];
}

const cutoff=loadGenerated('data/moon-cutoff-states.js','MOON_CUTOFF_STATES');
const planetData=loadGenerated(
  'data/planet-ephemerides.js','PLANET_EPHEMERIDES'
).ephemerides;
const planetCutoff=loadGenerated(
  'data/planet-cutoff-states.js','PLANET_CUTOFF_STATES'
).states;
const epoch=cutoff.states.Moon.point[0];
function pointState(point){
  return {
    x:point[1],y:point[2],z:point[3],
    vx:point[4],vy:point[5],vz:point[6]
  };
}
const parentNames=['Earth','Mars','Jupiter','Saturn','Uranus','Neptune'];
const realDefinitions=parentNames.map(parentName=>({
  parentName,
  systemMu:GM_BY_BODY[parentName],
  parentState:pointState(planetCutoff[parentName].point),
  moons:MAJOR_MOONS.filter(moon=>moon.parentName===parentName).map(moon=>({
    name:moon.name,
    mu:MOON_GM_BY_BODY[moon.name],
    state:pointState(cutoff.states[moon.name].point)
  }))
}));
const realMoonInitial=createInitialState(epoch,realDefinitions);
const globalInitial=createBarycentricState(epoch,[
  {name:'Sun',mu:GM_BY_BODY.Sun,state:{x:0,y:0,z:0,vx:0,vy:0,vz:0}},
  ...Object.keys(planetData).map(name=>({
    name,mu:GM_BY_BODY[name],
    state:realMoonInitial.barycenters[name] ||
      pointState(planetCutoff[name].point)
  }))
],[]);
const globalSimulator=createNBodySimulator(globalInitial,{
  stepDays:0.25,checkpointDays:8
});
const realMoonSimulator=createSimulator(
  realMoonInitial.state,t=>globalSimulator.massiveStateAt(t),
  {stepDays:0.05,checkpointDays:1}
);
const globalAtEpoch=globalSimulator.massiveStateAt(epoch);
const sunAtEpoch=globalAtEpoch.find(body=>body.name==='Sun');
for(const moon of MAJOR_MOONS){
  const actual=bodyState(realMoonInitial.state,globalAtEpoch,moon.name);
  const expected=pointState(cutoff.states[moon.name].point);
  for(const key of ['x','y','z','vx','vy','vz']){
    const heliocentric=actual[key]-sunAtEpoch[key];
    assert.ok(
      Math.abs(heliocentric-expected[key])<2e-14,
      `${moon.name} cutoff continuity for ${key}`
    );
  }
}
const historicalTime=epoch-56*365.25;
for(const system of realMoonInitial.state.systems){
  for(const state of system.moons){
    const historical=propagateState(
      state,historicalTime-epoch,system.parentMu+state.mu
    );
    const definition=MAJOR_MOONS.find(moon=>moon.name===state.name);
    const separation=Math.hypot(
      historical.x,historical.y,historical.z
    )*AU_KM;
    assert.ok(
      Number.isFinite(separation) &&
      separation>definition.aKm*0.65 &&
      separation<definition.aKm*1.35,
      `${state.name} historical separation: ${separation} km`
    );
  }
}
const futureTime=epoch+365.25;
const futureGlobal=globalSimulator.massiveStateAt(futureTime);
const futureMoons=realMoonSimulator.stateAt(futureTime);
for(const moon of MAJOR_MOONS){
  const actual=bodyState(futureMoons,futureGlobal,moon.name);
  const parent=bodyState(futureMoons,futureGlobal,moon.parentName);
  const separation=Math.hypot(
    actual.x-parent.x,actual.y-parent.y,actual.z-parent.z
  )*AU_KM;
  assert.ok(
    separation>moon.aKm*0.65 && separation<moon.aKm*1.35,
    `${moon.name} one-year separation: ${separation} km`
  );
}

console.log('Hierarchical moon simulation tests passed.');
