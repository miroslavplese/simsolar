const assert=require('node:assert/strict');
const {
  collinearCoordinates,lagrangePoints,rotatingFrameYaw
}=require('../src/lagrange-system.js');

const sunMu=2.9591220828559093e-4;
const earthMu=8.997011394e-10;
const earthSpeed=Math.sqrt((sunMu+earthMu));
const primary={x:0,y:0,z:0,vx:0,vy:0,vz:0};
const secondary={x:1,y:0,z:0,vx:0,vy:earthSpeed,vz:0};
const points=lagrangePoints(primary,secondary,sunMu,earthMu);
assert.deepEqual(points.map(point=>point.name),['L1','L2','L3','L4','L5']);

const byName=Object.fromEntries(points.map(point=>[point.name,point]));
assert.ok(byName.L1.x>0 && byName.L1.x<1);
assert.ok(byName.L2.x>1);
assert.ok(byName.L3.x<0);
assert.ok(Math.abs(byName.L4.x-0.5)<1e-5);
assert.ok(Math.abs(byName.L4.y-Math.sqrt(3)/2)<1e-12);
assert.ok(Math.abs(byName.L5.y+Math.sqrt(3)/2)<1e-12);
assert.ok(Math.abs(byName.L4.distanceFromPrimary-1)<1e-12);
assert.ok(Math.abs(byName.L4.distanceFromSecondary-1)<1e-12);

const hillApproximation=(earthMu/(3*sunMu))**(1/3);
assert.ok(Math.abs(byName.L1.distanceFromSecondary-hillApproximation)<6e-5);
assert.ok(Math.abs(byName.L2.distanceFromSecondary-hillApproximation)<6e-5);

const coordinates=collinearCoordinates(earthMu/(sunMu+earthMu));
assert.ok(coordinates.L3<0);
const tinyCoordinates=collinearCoordinates(5e-17);
assert.ok(tinyCoordinates.L1<1 && tinyCoordinates.L2>1);
assert.ok(Math.abs(rotatingFrameYaw(primary,secondary))<1e-12);
assert.ok(Math.abs(
  rotatingFrameYaw(primary,{...secondary,x:0,y:1})+Math.PI/2
)<1e-12);
const tiltedSecondary={...secondary,z:0.1};
const tiltedYaw=rotatingFrameYaw(primary,tiltedSecondary,0.8);
const rotatedY=(
  tiltedSecondary.x*Math.sin(tiltedYaw)+
  tiltedSecondary.y*Math.cos(tiltedYaw)
)*Math.cos(0.8)-tiltedSecondary.z*Math.sin(0.8);
assert.ok(Math.abs(rotatedY)<1e-12);

for(const point of points){
  for(const key of ['x','y','z','vx','vy','vz']){
    assert.ok(Number.isFinite(point[key]),`${point.name} ${key} must be finite`);
  }
}

assert.throws(
  ()=>lagrangePoints(primary,primary,sunMu,earthMu),
  /positions must differ/
);
assert.throws(
  ()=>collinearCoordinates(0),
  /mass ratio/
);

console.log('Lagrange system tests passed.');
