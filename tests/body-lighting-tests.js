const assert=require('node:assert/strict');
const {
  normalizeVector,
  sphereBrightness,
  pointInSphereShadow,
  ringLightFactor
}=require('../src/body-lighting.js');

assert.deepEqual(normalizeVector({x:3,y:0,z:4}),{x:0.6,y:0,z:0.8});
assert.equal(sphereBrightness({x:1,y:0,z:0},{x:1,y:0,z:0}),1);
assert.equal(sphereBrightness({x:-1,y:0,z:0},{x:1,y:0,z:0}),0.08);
assert.equal(pointInSphereShadow({x:-2,y:0,z:0},{x:1,y:0,z:0},1),true);
assert.equal(pointInSphereShadow({x:2,y:0,z:0},{x:1,y:0,z:0},1),false);
assert.equal(pointInSphereShadow({x:-2,y:2,z:0},{x:1,y:0,z:0},1),false);
assert.equal(ringLightFactor({x:0,y:0,z:1},{x:0,y:0,z:1}),1);
assert.equal(ringLightFactor({x:0,y:0,z:1},{x:1,y:0,z:0}),0.18);

console.log('Body lighting tests passed.');
