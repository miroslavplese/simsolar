const assert=require('node:assert/strict');
const {
  AU_KM,
  smoothstep,
  physicalRadiusPixels,
  maximumZoomForRadius,
  planetMarkerRadiusPixels,
  customMarkerRadiusPixels,
  displayRadiusPixels,
  distanceToSegment,
  distanceToPolyline,
  pathSegmentsByDepth
}=require('../src/body-rendering.js');

assert.equal(smoothstep(20,50,10),0);
assert.equal(smoothstep(20,50,35),0.5);
assert.equal(smoothstep(20,50,60),1);
assert.equal(physicalRadiusPixels(AU_KM,2,46),92);
const earthMaximum=maximumZoomForRadius({
  radiusKm:6371,auPixels:46,viewportPixels:700
});
const mercuryMaximum=maximumZoomForRadius({
  radiusKm:2440,auPixels:46,viewportPixels:700
});
assert.ok(earthMaximum>20000);
assert.ok(mercuryMaximum>earthMaximum);
assert.equal(maximumZoomForRadius({
  radiusKm:69911,auPixels:46,viewportPixels:700
}),20000);
assert.equal(maximumZoomForRadius({
  radiusKm:1,auPixels:46,viewportPixels:700
}),2000000);
assert.equal(maximumZoomForRadius({
  radiusKm:0,auPixels:46,viewportPixels:700
}),20000);
assert.equal(planetMarkerRadiusPixels(6371),2.2);
assert.ok(planetMarkerRadiusPixels(69911)>5);
assert.equal(planetMarkerRadiusPixels(69911),Math.sqrt(69911)*0.022);
assert.equal(customMarkerRadiusPixels('star'),7);
assert.equal(customMarkerRadiusPixels('black-hole'),6);
assert.equal(customMarkerRadiusPixels('planet'),5);
assert.equal(customMarkerRadiusPixels('comet'),5);

const marker=displayRadiusPixels({
  radiusKm:6371,zoom:1,auPixels:46,markerRadius:4,systemRadiusAu:0.00257
});
assert.equal(marker.radius,4);
assert.equal(marker.scaleAccurate,false);

const transition=displayRadiusPixels({
  radiusKm:6371,zoom:35/(0.00257*46),auPixels:46,
  markerRadius:22,systemRadiusAu:0.00257
});
assert.equal(transition.scaleBlend,0.5);
assert.equal(transition.radius,22);
assert.equal(transition.scaleAccurate,false);

const close=displayRadiusPixels({
  radiusKm:6371,zoom:70/(0.00257*46),auPixels:46,
  markerRadius:22,systemRadiusAu:0.00257
});
assert.equal(close.radius,close.physicalRadius);
assert.equal(close.scaleAccurate,true);

assert.equal(distanceToSegment(5,3,0,0,10,0),3);
assert.equal(distanceToSegment(-2,0,0,0,10,0),2);
assert.equal(distanceToPolyline(10,4,[{x:0,y:0},{x:10,y:0},{x:10,y:10}]),0);

const depthPoints=[
  {x:0,y:0,depth:8},
  {x:1,y:0,depth:10},
  {x:2,y:0,depth:12},
  {x:3,y:0,depth:6}
];
assert.deepEqual(pathSegmentsByDepth(depthPoints,10,false),[
  [depthPoints[0],depthPoints[1]],
  [depthPoints[2],depthPoints[3]]
]);
assert.deepEqual(pathSegmentsByDepth(depthPoints,10,true),[
  [depthPoints[1],depthPoints[2]]
]);

console.log('Body rendering tests passed.');
