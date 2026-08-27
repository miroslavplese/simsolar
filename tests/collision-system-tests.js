const assert=require('node:assert/strict');
const {
  sweptSphereImpact,refinedSweptSphereImpact,
  linearImpactTime,impactStillInProgress,mergeKinematics,
  mergedRadius,estimatedRadiusKm,memoizedStateSampler
}=require('../src/collision-system.js');

const stationary={x:0,y:0,z:0,vx:0,vy:0,vz:0};
const incoming={x:10,y:0,z:0,vx:-2,vy:0,vz:0};
assert.equal(linearImpactTime(incoming,stationary,2,10),4);
assert.equal(
  linearImpactTime({...incoming,vx:2},stationary,2,10),
  null
);
assert.equal(linearImpactTime(incoming,stationary,2,3),null);
assert.equal(impactStillInProgress(incoming,stationary,2),true);
assert.equal(
  impactStillInProgress({...incoming,x:-10},stationary,2),
  false
);
assert.equal(
  impactStillInProgress({...incoming,x:1,vx:2},stationary,2),
  true
);

const swept=sweptSphereImpact(
  {x:10,y:0,z:0},{x:-10,y:0,z:0},
  stationary,stationary,2
);
assert.ok(Math.abs(swept.fraction-0.4)<1e-12);
assert.equal(
  sweptSphereImpact(
    {x:10,y:3,z:0},{x:-10,y:3,z:0},
    stationary,stationary,2
  ),
  null
);
const refinedLinear=refinedSweptSphereImpact(
  0,10,
  time=>({x:10-2*time,y:0,z:0}),
  ()=>stationary,
  2
);
assert.ok(Math.abs(refinedLinear.time-4)<1e-12);
const curvedFalsePositive=refinedSweptSphereImpact(
  0,1,
  time=>({
    x:2*Math.cos(Math.PI*(1-time)),
    y:2*Math.sin(Math.PI*(1-time)),
    z:0
  }),
  ()=>stationary,
  0.5
);
assert.equal(curvedFalsePositive,null);

let stateSamples=0;
const sampleBody=memoizedStateSampler(
  time=>{
    stateSamples++;
    return new Map([
      ['a',{x:time,y:0,z:0}],
      ['b',{x:0,y:time,z:0}]
    ]);
  },
  (state,body)=>state.get(body)
);
assert.deepEqual(sampleBody('a',2),{x:2,y:0,z:0});
assert.deepEqual(sampleBody('b',2),{x:0,y:2,z:0});
assert.deepEqual(sampleBody('a',3),{x:3,y:0,z:0});
assert.equal(stateSamples,2);

const merged=mergeKinematics(
  {mu:1,x:-1,y:0,z:0,vx:2,vy:0,vz:0},
  {mu:3,x:1,y:0,z:0,vx:-2,vy:0,vz:0}
);
assert.deepEqual(merged,{
  mu:4,x:0.5,y:0,z:0,vx:-1,vy:0,vz:0
});
assert.ok(Math.abs(mergedRadius(1,1)-Math.cbrt(2))<1e-12);

assert.ok(Math.abs(estimatedRadiusKm('planet',5.97237e24)-6371)<1e-9);
assert.ok(Math.abs(estimatedRadiusKm('star',1.98847e30)-696340)<1e-9);
assert.ok(estimatedRadiusKm('black-hole',1.98847e30)<4);
assert.ok(estimatedRadiusKm('comet',1e14)>1);

assert.throws(
  ()=>estimatedRadiusKm('planet',0),
  /positive and finite/
);

console.log('Collision system tests passed.');
