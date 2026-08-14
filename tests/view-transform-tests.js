const assert=require('node:assert/strict');
const {
  MIN_TILT,
  MAX_TILT,
  viewCoordinates,
  rotationFromDrag,
  panForRotationPivot
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

const pivot={x:3,y:-2,z:1};
const pivotPan=panForRotationPivot(420,260,pivot,0.8,1.2,50,400,300);
const pivotView=viewCoordinates(pivot.x,pivot.y,pivot.z,0.8,1.2);
assert.ok(Math.abs(400+pivotPan.panX+pivotView.x*50-420)<1e-12);
assert.ok(Math.abs(300+pivotPan.panY+pivotView.y*50-260)<1e-12);

console.log('View transform tests passed.');
