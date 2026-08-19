const assert=require('node:assert/strict');
const {
  inclinedVelocity,orbitalInclination
}=require('../src/body-placement.js');

const position={x:1,y:0,z:0};
const prograde={x:0.1,y:1,z:0};
const retrograde={x:0.1,y:-1,z:0};

for(const degrees of [0,30,90,120,180]){
  const radians=degrees*Math.PI/180;
  for(const planar of [prograde,retrograde]){
    const velocity=inclinedVelocity(position,planar,radians);
    const actual=orbitalInclination(position,velocity);
    assert.ok(Math.abs(actual-radians)<1e-12);
    assert.ok(
      Math.abs(Math.hypot(velocity.x,velocity.y,velocity.z)-
        Math.hypot(planar.x,planar.y,planar.z))<1e-12
    );
    assert.ok(Math.abs(velocity.x-planar.x)<1e-12);
  }
}

assert.ok(inclinedVelocity(position,prograde,Math.PI/3).z>0);
assert.ok(inclinedVelocity(position,retrograde,Math.PI/3).z<0);
assert.equal(orbitalInclination(position,{x:1,y:0,z:0}),null);
assert.throws(
  ()=>inclinedVelocity(position,prograde,-0.1),
  /between 0 and 180/
);

console.log('Body placement tests passed.');
