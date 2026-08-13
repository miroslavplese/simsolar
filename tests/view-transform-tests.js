const assert=require('node:assert/strict');
const {
  MIN_TILT,
  MAX_TILT,
  viewCoordinates,
  rotationFromDrag
}=require('../src/view-transform.js');

const identity=viewCoordinates(1,2,3,0,0);
assert.deepEqual(identity,{x:1,y:2,depth:3});

const rotated=viewCoordinates(1,0,0,Math.PI/2,Math.PI/2);
assert.ok(Math.abs(rotated.x)<1e-12);
assert.ok(Math.abs(rotated.y)<1e-12);
assert.ok(Math.abs(rotated.depth-1)<1e-12);

const sourceLength=Math.hypot(3,-4,5);
const projected=viewCoordinates(3,-4,5,0.7,1.1);
assert.ok(Math.abs(Math.hypot(projected.x,projected.y,projected.depth)-sourceLength)<1e-12);

assert.equal(rotationFromDrag(0,1,100,0).yaw,0.6);
assert.equal(rotationFromDrag(0,1,0,-1000).tilt,MIN_TILT);
assert.equal(rotationFromDrag(0,1,0,1000).tilt,MAX_TILT);

console.log('View transform tests passed.');
