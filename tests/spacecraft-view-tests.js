const assert=require('node:assert/strict');
const {
  dot,magnitude,cameraFrame,project,currentLeg,telemetry
}=require('../src/spacecraft-view.js');

function close(actual,expected,tolerance,label){
  assert.ok(
    Math.abs(actual-expected)<=tolerance,
    `${label}: expected ${expected}, received ${actual}`
  );
}

const state={x:1,y:0,z:0,vx:0,vy:0.01,vz:0};
const camera=cameraFrame(state,0,0);
close(dot(camera.forward,{x:0,y:1,z:0}),1,1e-12,'forward follows velocity');
close(magnitude(camera.right),1,1e-12,'right unit length');
close(magnitude(camera.up),1,1e-12,'up unit length');
close(dot(camera.forward,camera.right),0,1e-12,'forward/right orthogonal');

const turned=cameraFrame(state,Math.PI/2,0);
close(dot(turned.forward,{x:-1,y:0,z:0}),1,1e-12,'yaw turns camera');
const pitched=cameraFrame(state,0,Math.PI/4);
assert.ok(pitched.forward.z>0.7,'positive pitch looks above flight plane');

const centered=project(
  {x:1,y:10,z:0},state,camera,1000,500,Math.PI/2
);
close(centered.x,500,1e-9,'forward point centered horizontally');
close(centered.y,250,1e-9,'forward point centered vertically');
assert.equal(project(
  {x:1,y:-10,z:0},state,camera,1000,500,Math.PI/2
),null);

const sampled=[
  {from:'Earth',to:'Jupiter',startTime:100,endTime:300},
  {from:'Jupiter',to:'Mars',startTime:300,endTime:500}
];
assert.equal(currentLeg(sampled,250),sampled[0]);
assert.equal(currentLeg(sampled,300),sampled[1]);
assert.equal(currentLeg(sampled,500),sampled[1]);
assert.equal(currentLeg(sampled,99),null);

const route={
  durationDays:400,
  waypoints:[
    {name:'Earth',time:100},
    {name:'Jupiter',time:300},
    {name:'Mars',time:500}
  ]
};
const data=telemetry(
  route,sampled,state,200,{x:2,y:0,z:0}
);
assert.equal(data.legNumber,1);
assert.equal(data.legCount,2);
assert.equal(data.to,'Jupiter');
close(data.speedKmS,17.314568368,1e-9,'heliocentric speed');
close(data.distanceToNextAu,1,1e-12,'next encounter distance');
assert.equal(data.remainingDays,300);
close(data.progress,0.25,1e-12,'mission progress');

console.log('Spacecraft view tests passed.');
