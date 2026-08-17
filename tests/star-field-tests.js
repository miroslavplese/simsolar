const assert=require('node:assert/strict');
const {
  createStars,cameraCoordinates,projectStar
}=require('../src/star-field.js');

const first=createStars(100,1234);
const replay=createStars(100,1234);
assert.deepEqual(replay,first);
assert.notDeepEqual(createStars(100,4321),first);
for(const star of first){
  assert.ok(Math.abs(Math.hypot(star.x,star.y,star.z)-1)<1e-12);
  assert.ok(star.radius>0);
  assert.ok(star.alpha>0 && star.alpha<=1);
}

const yaw=0.7;
const tilt=1.1;
const forward={
  x:Math.sin(yaw)*Math.sin(tilt),
  y:Math.cos(yaw)*Math.sin(tilt),
  z:Math.cos(tilt),
  radius:1,
  alpha:1
};
const camera=cameraCoordinates(forward,yaw,tilt);
assert.ok(Math.abs(camera.x)<1e-12);
assert.ok(Math.abs(camera.y)<1e-12);
assert.ok(Math.abs(camera.depth-1)<1e-12);
assert.deepEqual(
  projectStar(forward,yaw,tilt,800,600),
  {x:400,y:300,radius:1,alpha:1,depth:camera.depth}
);

const rotated=projectStar(
  {x:0,y:1,z:0,radius:1,alpha:1},
  -0.2,Math.PI/2,800,600
);
assert.ok(rotated && Math.abs(rotated.x-400)>1);
assert.equal(
  projectStar({x:0,y:0,z:-1,radius:1,alpha:1},0,0,800,600),
  null
);

console.log('Star field tests passed.');
