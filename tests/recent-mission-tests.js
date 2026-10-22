const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const Catalog=require('../src/spacecraft-catalog.js');
const {sampledStateAt}=require('../src/trajectory-math.js');
function load(file,key){
  const context={window:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../data',file),'utf8'),context);
  return context.window[key];
}
const bundle=load('recent-spacecraft-trajectories.js','RECENT_SPACECRAFT_TRAJECTORIES');
const planets=load('planet-ephemerides.js','PLANET_EPHEMERIDES').ephemerides;
const days=date=>(Date.parse(date)-Date.UTC(2000,0,1,12))/86400000;
const catalog=Catalog.create();
assert.equal(catalog.length,10);
const expected={
  'James Webb Space Telescope':'-170',Lucy:'-49',Psyche:'-255','Europa Clipper':'-159'
};
for(const [name,target] of Object.entries(expected)){
  const record=bundle.trajectories[name],body=catalog.find(body=>body.name===name);
  assert.equal(record.targetId,target);
  assert.equal(record.frame,'Ecliptic J2000');
  assert.equal(record.timeScale,'TDB');
  assert.equal(record.points.at(-1)[0],days('2026-08-12T00:00:00Z'));
  assert.ok(record.points.length>300);
  let previous=-Infinity;
  for(const point of record.points){
    assert.ok(point[0]>previous,`${name}: sorted unique samples`);
    assert.equal(point.length,7);
    assert.ok(point.every(Number.isFinite));
    const state=sampledStateAt(record.points,point[0]);
    assert.ok(Math.abs(state.x-point[1])<1e-10);
    previous=point[0];
  }
  assert.equal(new Date(Date.UTC(2000,0,1,12)+record.points[0][0]*86400000)
    .toISOString().slice(0,10),body.launch);
  const first=sampledStateAt(record.points,record.points[0][0]);
  const earth=sampledStateAt(planets.Earth.points,record.points[0][0]);
  assert.ok(Math.hypot(first.x-earth.x,first.y-earth.y,first.z-earth.z)<0.003);
  for(const event of body.flybys){
    assert.ok(days(event[1]+'T12:00:00Z')<=record.points.at(-1)[0]);
  }
}
for(const [name,planet,date] of [
  ['Lucy','Earth','2022-10-16'],['Lucy','Earth','2024-12-13'],
  ['Psyche','Mars','2026-05-15'],['Europa Clipper','Mars','2025-03-01']
]){
  const t=days(date+'T12:00:00Z');
  const a=sampledStateAt(bundle.trajectories[name].points,t);
  const b=sampledStateAt(planets[planet].points,t);
  assert.ok(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)<0.01,`${name} ${planet} encounter`);
}
const t=days('2024-01-24T12:00:00Z');
const webb=sampledStateAt(bundle.trajectories['James Webb Space Telescope'].points,t);
const earth=sampledStateAt(planets.Earth.points,t);
const distance=Math.hypot(webb.x-earth.x,webb.y-earth.y,webb.z-earth.z);
assert.ok(distance>0.005 && distance<0.02,'Webb stays near Sun-Earth L2 in bundled data');
console.log('Recent spacecraft metadata and trajectory tests passed.');
