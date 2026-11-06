const assert=require('node:assert/strict');
const Curated=require('../data/curated-systems.js');
const Gravity=require('../src/nbody-simulation.js');
const Math3D=require('../src/trajectory-math.js');
const Model=require('../src/system-model.js');
const Observatory=require('../src/observatory-mode.js');

function near(actual,expected,tolerance=1e-10){
  assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);
}

function reference(body,system,snapshot){
  return Model.orbitReference(
    body,system.bodies,candidate=>Gravity.bodyState(snapshot,candidate.id)
  );
}

function energy(state){
  let total=0;
  for(let i=0;i<state.massive.length;i++){
    const a=state.massive[i];
    total+=a.mu*(a.vx**2+a.vy**2+a.vz**2)/2;
    for(let j=i+1;j<state.massive.length;j++){
      const b=state.massive[j];
      total-=a.mu*b.mu/Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
    }
  }
  return total;
}

assert.deepEqual(Curated.SYSTEMS.map(system=>system.id),[
  'solar-system','tatooine','alpha-centauri','trappist-1','kepler-16',
  'hd-189733','binary-duet','kepler-442','compact-four'
]);
assert.equal(Curated.findById('missing'),null);
assert.equal(Curated.findById('solar-system').mode,'solar');
assert.throws(()=>Curated.buildEditableSystem(
  Curated.findById('solar-system')
),/must be restored/);

for(const definition of Curated.SYSTEMS.filter(system=>system.mode!=='solar')){
  const original=JSON.stringify(definition);
  const system=Curated.buildEditableSystem(definition,0);
  assert.equal(system.epoch,0,'Epochs are days since J2000, including zero.');
  assert.equal(Model.validateEditableSystem(system),true,definition.id);
  assert.equal(system.bodies.length,definition.bodies.length);
  assert.ok(system.extentAU>0);
  const initial=Gravity.createBarycentricState(
    system.epoch,system.bodies.map(body=>({...body,adaptiveFactor:48})),[]
  );
  const totalMu=system.bodies.reduce((sum,body)=>sum+body.mu,0);
  for(const key of Model.STATE_KEYS){
    near(system.bodies.reduce(
      (sum,body)=>sum+body.state[key]*body.mu/totalMu,0
    ),0,1e-14);
  }
  for(const body of system.bodies){
    assert.ok(body.massKg>0 && body.mu>0);
    assert.ok(Model.STATE_KEYS.every(key=>Number.isFinite(body.state[key])));
    assert.equal(
      !!Observatory.surfaceDefinitionForBody(body),body.kind==='planet'
    );
    if(body.kind!=='planet') continue;
    const orbit=reference(body,system,initial);
    const elements=Math3D.orbitalElementsFromState(orbit.relative,orbit.mu);
    near(elements.semimajorAxis,body.a);
    near(elements.eccentricity,body.e||0);
    near(elements.inclination,body.i||0);
    assert.ok(Number.isFinite(elements.period) && elements.period>0);
  }
  const simulator=Gravity.createSimulator(initial,{
    stepDays:0.25,particleStepDays:0.03125,checkpointDays:8
  });
  const evolved=simulator.stateAt(100);
  assert.ok(
    Math.abs((energy(evolved)-energy(initial))/energy(initial))<1e-4,
    definition.id+' conserves energy during 100 days of playback'
  );
  assert.deepEqual(simulator.stateAt(100),evolved,'Replay is deterministic.');
  if(definition.id==='compact-four'){
    const inner=system.bodies.find(body=>body.id==='compact-1');
    const orbit=reference(inner,system,evolved);
    const radius=Math.hypot(orbit.relative.x,orbit.relative.y,orbit.relative.z);
    assert.ok(radius>0.019 && radius<0.021,'Inner planet remains bound.');
  }
  assert.equal(JSON.stringify(definition),original,'Builder does not mutate catalog.');
}

const binary=Curated.buildEditableSystem(Curated.findById('binary-duet'),100);
const binaryState=Gravity.createBarycentricState(100,binary.bodies,[]);
for(const body of binary.bodies){
  const orbit=reference(body,binary,binaryState);
  near(orbit.scale,0.5);
  near(orbit.origin.x,0);
  near(orbit.origin.y,0);
  const points=Math3D.osculatingOrbitPoints(orbit.relative,orbit.mu,220);
  for(const point of points){
    near(Math.hypot(point.x,point.y,point.z)*orbit.scale,2.5);
  }
}
const shifted=Gravity.cloneState(binaryState);
for(const body of shifted.massive){
  body.x+=12; body.y-=3; body.vx+=0.1;
}
const shiftedReference=reference(binary.bodies[0],binary,shifted);
near(shiftedReference.origin.x,12);
near(shiftedReference.origin.y,-3);
near(shiftedReference.origin.vx,0.1);

const triple=Curated.buildEditableSystem(Curated.findById('alpha-centauri'),100);
const tripleState=Gravity.createBarycentricState(100,triple.bodies,[]);
for(const body of triple.bodies.filter(body=>body.kind==='star')){
  const orbit=reference(body,triple,tripleState);
  const elements=Math3D.orbitalElementsFromState(orbit.relative,orbit.mu);
  near(elements.eccentricity,0);
}
assert.deepEqual(triple.bodies[2].orbitPrimaryIds,['alfa-cen-a','alfa-cen-b']);

const compact=Curated.findById('compact-four');
for(const invalid of [
  {...compact,bodies:compact.bodies.map((body,index)=>index===1?{...body,e:1}:body)},
  {...compact,bodies:compact.bodies.map((body,index)=>index===1?{...body,earthMass:0}:body)},
  {...compact,bodies:compact.bodies.map((body,index)=>index===1?{...body,parentId:'missing'}:body)},
  {...compact,bodies:compact.bodies.map((body,index)=>index===1?{...body,id:compact.bodies[0].id}:body)}
]){
  assert.throws(()=>Curated.buildEditableSystem(invalid,100));
}
assert.throws(()=>Curated.buildEditableSystem(compact,Infinity));
assert.throws(()=>Curated.buildEditableSystem(compact,NaN));

console.log('Curated catalog, orbital initialization, stability, and guide tests passed.');
