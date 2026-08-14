const assert=require('node:assert/strict');
const {
  AU_KM,
  MAJOR_MOONS,
  relativeStateAt,
  stateAt,
  outerRadiusAu,
  systemVisible,
  focusZoom,
  heliocentricPathsVisible
}=require('../src/moon-system.js');

assert.equal(MAJOR_MOONS.length,13);
assert.deepEqual(
  [...new Set(MAJOR_MOONS.map(moon=>moon.parentName))],
  ['Earth','Mars','Jupiter','Saturn','Uranus','Neptune']
);

const moon=MAJOR_MOONS.find(item=>item.name==='Moon');
const start=relativeStateAt(moon,0);
const afterPeriod=relativeStateAt(moon,moon.period);
assert.ok(Math.hypot(
  start.x-afterPeriod.x,
  start.y-afterPeriod.y,
  start.z-afterPeriod.z
)<1e-12);
assert.ok(Math.abs(Math.hypot(start.x,start.y,start.z)-moon.aKm/AU_KM)<0.0002);

const parent={x:1,y:2,z:3,vx:0.01,vy:0.02,vz:0.03};
const absolute=stateAt(moon,parent,0);
assert.ok(Math.abs(absolute.x-parent.x-start.x)<1e-15);
assert.ok(absolute.parentRelative);
assert.ok(absolute.orbitalSpeedKmS>0);

assert.equal(outerRadiusAu(MAJOR_MOONS,'Jupiter'),1882700/AU_KM);
assert.equal(systemVisible(MAJOR_MOONS,'Jupiter',1,46),false);
assert.equal(systemVisible(MAJOR_MOONS,'Jupiter',80,46),false);
assert.equal(systemVisible(MAJOR_MOONS,'Jupiter',100,46),true);
assert.ok(focusZoom(MAJOR_MOONS,'Mars',46,70,20000)>9000);
assert.equal(heliocentricPathsVisible(20),true);
assert.equal(heliocentricPathsVisible(20.01),false);

console.log('Moon system tests passed.');
