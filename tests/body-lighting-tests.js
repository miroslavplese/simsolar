const assert=require('node:assert/strict');
const {
  normalizeVector,
  sphereBrightness,
  pointInSphereShadow,
  ringLightFactor,
  shadowConeMayIntersectTarget
}=require('../src/body-lighting.js');

assert.deepEqual(normalizeVector({x:3,y:0,z:4}),{x:0.6,y:0,z:0.8});
assert.equal(sphereBrightness({x:1,y:0,z:0},{x:1,y:0,z:0}),1);
assert.equal(sphereBrightness({x:-1,y:0,z:0},{x:1,y:0,z:0}),0.08);
assert.equal(pointInSphereShadow({x:-2,y:0,z:0},{x:1,y:0,z:0},1),true);
assert.equal(pointInSphereShadow({x:2,y:0,z:0},{x:1,y:0,z:0},1),false);
assert.equal(pointInSphereShadow({x:-2,y:2,z:0},{x:1,y:0,z:0},1),false);
assert.equal(ringLightFactor({x:0,y:0,z:1},{x:0,y:0,z:1}),1);
assert.equal(ringLightFactor({x:0,y:0,z:1},{x:1,y:0,z:0}),0.18);
assert.equal(shadowConeMayIntersectTarget(
  {x:100,y:0,z:0},10,{x:10,y:0,z:0},0.1
),true);
assert.equal(shadowConeMayIntersectTarget(
  {x:100,y:0,z:0},10,{x:-10,y:0,z:0},0.1
),false);
assert.equal(shadowConeMayIntersectTarget(
  {x:100,y:0,z:0},10,{x:10,y:3,z:0},0.1
),false);
assert.equal(shadowConeMayIntersectTarget(
  {x:100,y:0,z:0},10,{x:110,y:0,z:0},0.1
),false);
const jupiterLight={
  x:7001.5518098462935,y:4618.431853597027,z:-7616.82711074352
};
const galileanGeometry=[
  {x:-2.018942882662806,y:-2.8582979988317807,z:4.906750282557342,r:0.026055985467236913},
  {x:1.6949660573232839,y:-4.773431496960273,z:8.24892882062248,r:0.022325528171532376},
  {x:13.89252972392489,y:3.3318018939583856,z:-5.407340534389524,r:0.037677904764629316},
  {x:-20.7369361797648,y:-8.98064157544416,z:14.87168342211309,r:0.03447669179385219}
];
assert.equal(galileanGeometry.some(moon=>shadowConeMayIntersectTarget(
  jupiterLight,9.960378195133814,moon,moon.r
)),false);

console.log('Body lighting tests passed.');
