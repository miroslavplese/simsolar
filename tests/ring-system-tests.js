const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {
  AU_KM,
  PLANETARY_RINGS,
  relativePoint,
  outerRadiusKm,
  normalVector,
  viewDepth
}=require('../src/ring-system.js');

assert.deepEqual(Object.keys(PLANETARY_RINGS),[
  'Jupiter','Saturn','Uranus','Neptune'
]);
assert.equal(outerRadiusKm(PLANETARY_RINGS.Saturn),140500);

for(const ring of Object.values(PLANETARY_RINGS)){
  let previousOuter=0;
  for(const band of ring.bands){
    assert.ok(band.innerKm>=previousOuter);
    assert.ok(band.outerKm>band.innerKm);
    previousOuter=band.outerKm;
  }
  const radiusKm=outerRadiusKm(ring);
  const point=relativePoint(ring,radiusKm,1.2);
  assert.ok(Math.abs(Math.hypot(point.x,point.y,point.z)-radiusKm/AU_KM)<1e-15);
  const normal=normalVector(ring);
  assert.ok(Math.abs(Math.hypot(normal.x,normal.y,normal.z)-1)<1e-15);
  assert.ok(Math.abs(point.x*normal.x+point.y*normal.y+point.z*normal.z)<1e-15);
}

const context={window:{}};
for(const file of ['planet-cutoff-states.js','moon-cutoff-states.js']){
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','data',file),'utf8'),context);
}
// Compare against the actual relative states used to draw moon orbits, not
// the legacy schematic orbital elements in moon-system.js.
for(const [moon,parent,maxDegrees] of [
  ['Io','Jupiter',0.1],['Europa','Jupiter',0.6],
  ['Ganymede','Jupiter',0.6],['Callisto','Jupiter',1],
  ['Rhea','Saturn',0.5],['Titan','Saturn',0.6],
  ['Titania','Uranus',0.2],['Oberon','Uranus',0.2]
]){
  const m=context.window.MOON_CUTOFF_STATES.states[moon].point;
  const p=context.window.PLANET_CUTOFF_STATES.states[parent].point;
  const r=m.slice(1,4).map((value,index)=>value-p[index+1]);
  const v=m.slice(4).map((value,index)=>value-p[index+4]);
  const h=[
    r[1]*v[2]-r[2]*v[1],r[2]*v[0]-r[0]*v[2],r[0]*v[1]-r[1]*v[0]
  ];
  const pole=normalVector(PLANETARY_RINGS[parent]);
  const cosine=Math.abs((h[0]*pole.x+h[1]*pole.y+h[2]*pole.z)/Math.hypot(...h));
  assert.ok(cosine>Math.cos(maxDegrees*Math.PI/180),moon+' plane aligns with its planet');
}

assert.equal(viewDepth({x:-2,y:0,z:0},{x:1,y:0,z:0}),2);
assert.equal(viewDepth({x:2,y:0,z:0},{x:1,y:0,z:0}),-2);

console.log('Ring system tests passed.');
