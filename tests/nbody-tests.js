const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {
  GM_BY_BODY,
  MOON_GM_BY_BODY,
  MASS_KG,
  massKgToMu,
  cloneState,
  recenterBarycentricState,
  createBarycentricState,
  createSimulator,
  heliocentricState,
  invariants
}=require('../src/nbody-simulation.js');
const {AU_KM,sampledStateAt,propagateState}=require('../src/trajectory-math.js');

const year=365.25;
assert.equal(MASS_KG.Earth,5.97237e24);
assert.equal(MASS_KG.Pluto,1.303e22);
assert.equal(MASS_KG.Charon,1.586e21);
assert.ok(MOON_GM_BY_BODY.Moon>MOON_GM_BY_BODY.Triton);
assert.ok(MOON_GM_BY_BODY.Phobos<MOON_GM_BY_BODY.Deimos*10);
assert.ok(Math.abs(massKgToMu(MASS_KG.Sun)-GM_BY_BODY.Sun)/GM_BY_BODY.Sun<1e-4);
assert.throws(()=>massKgToMu(0),/positive finite/);
const circularSpeed=Math.sqrt((GM_BY_BODY.Sun+GM_BY_BODY.Earth)/1);
const initial=createBarycentricState(0,[
  {name:'Sun',mu:GM_BY_BODY.Sun,state:{x:0,y:0,z:0,vx:0,vy:0,vz:0}},
  {name:'Earth',mu:GM_BY_BODY.Earth,state:{x:1,y:0,z:0,vx:0,vy:circularSpeed,vz:0}}
],[
  {name:'Test particle',state:{x:1.5,y:0,z:0,vx:0,vy:Math.sqrt(GM_BY_BODY.Sun/1.5),vz:0}}
]);

const initialInvariant=invariants(initial);
assert.ok(Math.hypot(
  initialInvariant.momentum.x,
  initialInvariant.momentum.y,
  initialInvariant.momentum.z
)<1e-18);

const simulator=createSimulator(initial,{
  stepDays:0.25,particleStepDays:0.03125,checkpointDays:8
});
const afterYear=simulator.stateAt(year);
const earth=heliocentricState(afterYear,'Earth');
assert.ok(Math.abs(Math.hypot(earth.x,earth.y,earth.z)-1)<2e-5);

const finalInvariant=invariants(afterYear);
const relativeEnergyDrift=Math.abs(
  (finalInvariant.energy-initialInvariant.energy)/initialInvariant.energy
);
assert.ok(relativeEnergyDrift<1e-8,`energy drift: ${relativeEnergyDrift}`);
assert.ok(Math.hypot(
  finalInvariant.momentum.x,
  finalInvariant.momentum.y,
  finalInvariant.momentum.z
)<1e-16);

const replayA=simulator.stateAt(123.456);
simulator.stateAt(500);
const replayB=simulator.stateAt(123.456);
assert.deepEqual(replayB,replayA);
assert.deepEqual(
  simulator.massiveStateAt(123.456),
  replayA.massive,
  'massive-only sampling must match the full integration'
);

const withoutParticle=createBarycentricState(0,[
  {name:'Sun',mu:GM_BY_BODY.Sun,state:{x:0,y:0,z:0,vx:0,vy:0,vz:0}},
  {name:'Earth',mu:GM_BY_BODY.Earth,state:{x:1,y:0,z:0,vx:0,vy:circularSpeed,vz:0}}
],[]);
const massiveOnly=createSimulator(withoutParticle,{stepDays:0.25}).stateAt(50).massive;
const withParticle=createSimulator(initial,{stepDays:0.25}).stateAt(50).massive;
assert.deepEqual(withParticle,massiveOnly);

const branchEpoch=20;
const branchState=cloneState(simulator.stateAt(branchEpoch));
const branchSun=branchState.massive.find(body=>body.name==='Sun');
branchState.massive.push({
  name:'Inserted planet',
  mu:massKgToMu(MASS_KG.Jupiter),
  x:branchSun.x+2,y:branchSun.y,z:branchSun.z,
  vx:branchSun.vx,vy:branchSun.vy+Math.sqrt(GM_BY_BODY.Sun/2),vz:branchSun.vz
});
recenterBarycentricState(branchState);
const branchMomentum=invariants(branchState).momentum;
assert.ok(Math.hypot(branchMomentum.x,branchMomentum.y,branchMomentum.z)<1e-15);
const branched=createSimulator(branchState,{stepDays:0.25}).stateAt(branchEpoch+20);
const baseline=simulator.stateAt(branchEpoch+20);
const branchedEarth=heliocentricState(branched,'Earth');
const baselineEarth=heliocentricState(baseline,'Earth');
assert.ok(Math.hypot(
  branchedEarth.x-baselineEarth.x,
  branchedEarth.y-baselineEarth.y,
  branchedEarth.z-baselineEarth.z
)>1e-10,'inserted massive body must perturb existing bodies');

assert.throws(()=>simulator.stateAt(-1),/precedes the simulation epoch/);

function loadGenerated(relativePath,key){
  const context={window:{}};
  const source=fs.readFileSync(path.resolve(__dirname,'..',relativePath),'utf8');
  vm.runInNewContext(source,context,{filename:relativePath});
  return context.window[key];
}

const planets=loadGenerated('data/planet-ephemerides.js','PLANET_EPHEMERIDES').ephemerides;
const planetCutoff=loadGenerated(
  'data/planet-cutoff-states.js','PLANET_CUTOFF_STATES'
).states;
const spacecraft=loadGenerated('data/spacecraft-trajectories.js','SPACECRAFT_TRAJECTORIES').trajectories;
const comets=loadGenerated('data/comet-ephemerides.js','COMET_EPHEMERIDES').ephemerides;
const j2000=Date.UTC(2000,0,1,12);
const hybridEpoch=(Date.parse('2026-08-12T00:00:00Z')-j2000)/86400000;
assert.equal(planetCutoff.Mercury.point[0],hybridEpoch);
const mercuryCutoff=planetCutoff.Mercury.point;
const mercuryRadius=Math.hypot(
  mercuryCutoff[1],mercuryCutoff[2],mercuryCutoff[3]
);
const mercurySpeedSq=
  mercuryCutoff[4]**2+mercuryCutoff[5]**2+mercuryCutoff[6]**2;
const mercurySemimajor=1/(
  2/mercuryRadius-mercurySpeedSq/GM_BY_BODY.Sun
);
assert.ok(
  Math.abs(mercurySemimajor-0.3871)<1e-4,
  `Mercury cutoff osculating semimajor axis: ${mercurySemimajor}`
);

function stateAtEpoch(points){
  const sampled=sampledStateAt(points,hybridEpoch);
  if(sampled) return sampled;
  const last=points[points.length-1];
  return propagateState({
    t:last[0],x:last[1],y:last[2],z:last[3],
    vx:last[4],vy:last[5],vz:last[6]
  },hybridEpoch-last[0]);
}

const realMassive=[
  {name:'Sun',mu:GM_BY_BODY.Sun,state:{x:0,y:0,z:0,vx:0,vy:0,vz:0}},
  ...Object.keys(planets).map(name=>({
    name,mu:GM_BY_BODY[name],
    state:{
      x:planetCutoff[name].point[1],
      y:planetCutoff[name].point[2],
      z:planetCutoff[name].point[3],
      vx:planetCutoff[name].point[4],
      vy:planetCutoff[name].point[5],
      vz:planetCutoff[name].point[6]
    }
  }))
];
const realParticles=[
  ...Object.entries(spacecraft),
  ...Object.entries(comets)
].map(([name,record])=>({name,state:stateAtEpoch(record.points)}));
const realInitial=createBarycentricState(hybridEpoch,realMassive,realParticles);
const plutoInitial=heliocentricState(realInitial,'Pluto');
const charonInitial=heliocentricState(realInitial,'Charon');
const plutoCharonDistance=Math.hypot(
  plutoInitial.x-charonInitial.x,
  plutoInitial.y-charonInitial.y,
  plutoInitial.z-charonInitial.z
)*AU_KM;
assert.ok(
  plutoCharonDistance>18000 && plutoCharonDistance<21000,
  `Pluto-Charon cutoff separation: ${plutoCharonDistance} km`
);

for(const definition of [...realMassive.slice(1),...realParticles]){
  const actual=heliocentricState(realInitial,definition.name);
  for(const key of ['x','y','z','vx','vy','vz']){
    assert.ok(Math.abs(actual[key]-definition.state[key])<2e-14,
      `${definition.name} hybrid continuity for ${key}`);
  }
}

const realSimulator=createSimulator(realInitial,{
  stepDays:0.25,particleStepDays:0.03125,checkpointDays:8
});
const realFuture=realSimulator.stateAt(hybridEpoch+30);
for(const body of [...realFuture.massive,...realFuture.particles]){
  for(const key of ['x','y','z','vx','vy','vz']){
    assert.ok(Number.isFinite(body[key]),`${body.name} future ${key} must be finite`);
  }
}
const realInitialInvariant=invariants(realInitial);
const realYear=realSimulator.stateAt(hybridEpoch+365.25);
const realYearInvariant=invariants(realYear);
const realEnergyDrift=Math.abs(
  (realYearInvariant.energy-realInitialInvariant.energy)/realInitialInvariant.energy
);
assert.ok(realEnergyDrift<1e-6,`real-system energy drift: ${realEnergyDrift}`);
assert.ok(Math.hypot(
  realYearInvariant.momentum.x,
  realYearInvariant.momentum.y,
  realYearInvariant.momentum.z
)<1e-14);
assert.deepEqual(
  realSimulator.stateAt(hybridEpoch+30),
  realFuture,
  'real-system checkpoint replay must be deterministic'
);

const parkerA=0.38793;
const parkerQ=0.046;
const parkerSpeed=Math.sqrt(GM_BY_BODY.Sun*(2/parkerQ-1/parkerA));
const parkerReference=createBarycentricState(0,[
  {name:'Sun',mu:GM_BY_BODY.Sun,state:{x:0,y:0,z:0,vx:0,vy:0,vz:0}}
],[
  {
    name:'Parker',
    adaptiveFactor:300,
    state:{x:parkerQ,y:0,z:0,vx:0,vy:parkerSpeed,vz:0}
  }
]);
const parkerSimulator=createSimulator(parkerReference,{
  stepDays:0.25,particleStepDays:0.03125,checkpointDays:8
});
const parkerMidStep=heliocentricState(parkerSimulator.stateAt(0.125),'Parker');
const parkerMidStepEnergyDrift=Math.abs(
  (particleEnergy(parkerMidStep)-particleEnergy(heliocentricState(parkerReference,'Parker')))/
  particleEnergy(heliocentricState(parkerReference,'Parker'))
);
assert.ok(
  parkerMidStepEnergyDrift<1e-4,
  `Parker-like fractional-step energy drift: ${parkerMidStepEnergyDrift}`
);
const parkerAfter=heliocentricState(parkerSimulator.stateAt(88.25),'Parker');
function particleEnergy(state){
  return (state.vx**2+state.vy**2+state.vz**2)/2-
    GM_BY_BODY.Sun/Math.hypot(state.x,state.y,state.z);
}
const parkerEnergyDrift=Math.abs(
  (particleEnergy(parkerAfter)-particleEnergy(heliocentricState(parkerReference,'Parker')))/
  particleEnergy(heliocentricState(parkerReference,'Parker'))
);
assert.ok(parkerEnergyDrift<1e-4,`Parker-like energy drift: ${parkerEnergyDrift}`);

async function testAsyncPreparation(){
  const prepared=await simulator.prepareTo(700,{chunkDays:50});
  assert.deepEqual(prepared,simulator.stateAt(700));
  const cancelled=await simulator.prepareTo(800,{cancelled:()=>true});
  assert.equal(cancelled,null);
}

testAsyncPreparation()
  .then(()=>console.log('N-body simulation tests passed.'))
  .catch(error=>{
    console.error(error);
    process.exitCode=1;
  });
