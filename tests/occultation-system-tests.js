const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {
  angularRadius,apparentSeparation,circleOverlapArea,apparentOccultation,
  findOccultationEvents
}=require('../src/occultation-system.js');
const {AU_KM,sampledStateAt}=require('../src/trajectory-math.js');

assert.ok(Math.abs(angularRadius(1,2)-Math.PI/6)<1e-12);
assert.equal(circleOverlapArea(1,1,2),0);
assert.ok(Math.abs(circleOverlapArea(1,1,0)-Math.PI)<1e-12);

const observer={x:0,y:0,z:0};
assert.ok(Math.abs(apparentSeparation(
  observer,{x:1,y:0,z:0},{x:0,y:1,z:0}
)-Math.PI/2)<1e-12);
const source={x:10,y:0,z:0};
let event=apparentOccultation(
  observer,source,{x:5,y:0,z:0},1,0.6
);
assert.equal(event.geometry,'total');
assert.equal(event.coverage,1);

event=apparentOccultation(observer,source,{x:5,y:0,z:0},1,0.2);
assert.equal(event.geometry,'contained');
assert.ok(event.coverage>0 && event.coverage<0.2);

event=apparentOccultation(observer,source,{x:5,y:0.55,z:0},1,0.4);
assert.equal(event.geometry,'partial');
assert.ok(event.coverage>0 && event.coverage<1);

event=apparentOccultation(observer,source,{x:11,y:0,z:0},1,1);
assert.equal(event.visible,false);

const synthetic=findOccultationEvents({
  start:0,end:20,step:1,
  evaluate:time=>({
    clearance:(time-5.25)**2-0.04,
    visible:Math.abs(time-5.25)<=0.2
  })
});
assert.equal(synthetic.length,1);
assert.ok(Math.abs(synthetic[0].time-5.25)<1e-6);

assert.throws(
  ()=>findOccultationEvents({start:1,end:0,step:1,evaluate:()=>null}),
  /increasing range/
);

const context={window:{}};
vm.runInNewContext(
  fs.readFileSync(
    path.resolve(__dirname,'..','data','planet-ephemerides.js'),'utf8'
  ),
  context
);
const planets=context.window.PLANET_EPHEMERIDES.ephemerides;
const j2000=Date.UTC(2000,0,1,12);
const mercuryTransit=(
  Date.parse('2032-11-13T08:54:00Z')-j2000
)/86400000;
const earthState=sampledStateAt(planets.Earth.points,mercuryTransit);
const mercuryState=sampledStateAt(planets.Mercury.points,mercuryTransit);
const transit=apparentOccultation(
  earthState,{x:0,y:0,z:0},mercuryState,
  696340/AU_KM,2438/AU_KM
);
assert.equal(transit.visible,true);
assert.equal(transit.geometry,'contained');
assert.ok(transit.coverage>0 && transit.coverage<0.001);

console.log('Occultation system tests passed.');
