const assert=require('node:assert/strict');
const {
  AU_KM,
  PLANETARY_RINGS,
  relativePoint,
  outerRadiusKm,
  normalVector
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
}

console.log('Ring system tests passed.');
