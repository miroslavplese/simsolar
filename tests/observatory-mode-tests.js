const assert=require('node:assert/strict');
const {
  DEG,SURFACES,locationPresets,locationPresetsForBody,
  surfaceDefinitionForBody,
  surfaceFrame,horizontalCoordinates,
  cameraFrame,projectDirection,
  altitudeForDirection,angularRadius,daylightFactor,
  TELESCOPE_MIN_FOV,TELESCOPE_MAX_FOV,
  telescopeFovFromSlider,telescopeSliderFromFov,telescopeMagnification,
  collapsedSatelliteLabels,dot
}=require('../src/observatory-mode');

function close(actual,expected,tolerance=1e-12){
  assert.ok(
    Math.abs(actual-expected)<=tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`
  );
}

const definition={rotationHours:24,tiltDeg:0,phaseDeg:0};
const equator=surfaceFrame(definition,0,0,0);
close(dot(equator.east,equator.north),0);
close(dot(equator.east,equator.up),0);
close(dot(equator.north,equator.up),0);
close(altitudeForDirection(equator.up,equator),Math.PI/2);
close(altitudeForDirection(equator.north,equator),0);

const northPole=surfaceFrame(definition,0,90,0);
close(northPole.up.z,1);
const earth=surfaceFrame(SURFACES.Earth,0,90,0);
assert.ok(earth.pole.y>0,'Earth north pole must face the positive ecliptic Y side.');
assert.ok(SURFACES.Venus.rotationHours>0 && SURFACES.Venus.tiltDeg>90);
assert.ok(SURFACES.Pluto.rotationHours>0 && SURFACES.Pluto.tiltDeg>90);
assert.ok(SURFACES.Triton.rotationHours>0 && SURFACES.Triton.tiltDeg>90);
assert.equal(surfaceDefinitionForBody(null),null);
assert.equal(surfaceDefinitionForBody({
  name:'Second Earth',kind:'custom',appearance:'star',radius:1000
}),null);
const customPlanetSurface=surfaceDefinitionForBody({
  name:'Second Earth',kind:'custom',appearance:'planet',
  radius:6371,color:'#70b7ff'
});
assert.deepEqual(customPlanetSurface,{
  rotationHours:24,tiltDeg:0,phaseDeg:0,ground:'#70b7ff'
});
assert.equal(
  surfaceDefinitionForBody({name:'Earth',kind:'planet'}),
  SURFACES.Earth
);
assert.equal(locationPresetsForBody({
  name:'Earth',kind:'custom',appearance:'planet'
})[0].name,'Prime meridian');
assert.equal(locationPresetsForBody({name:'Earth',kind:'planet'})[0].name,'Auckland');
const seattle=locationPresets('Earth').find(
  preset=>preset.name==='Seattle'
);
assert.deepEqual(seattle,{
  name:'Seattle',latitude:47.6062,longitude:-122.3321,
  timeZone:'America/Los_Angeles'
});
assert.equal(
  locationPresets('Earth').find(preset=>preset.name==='Belgrade').timeZone,
  'Europe/Belgrade'
);
const northCoordinates=horizontalCoordinates(equator.north,equator);
close(northCoordinates.azimuth,0);
close(northCoordinates.altitude,0);

const camera=cameraFrame(equator,0,0);
const north=projectDirection(equator.north,camera,800,600,Math.PI/2);
close(north.x,400);
close(north.y,300);
const east=projectDirection(equator.east,camera,800,600,Math.PI/2);
assert.ok(east===null,'A direction 90 degrees from the view center is not projectable.');
assert.equal(projectDirection(
  {x:-equator.north.x,y:-equator.north.y,z:-equator.north.z},
  camera,800,600,Math.PI/2
),null);

close(angularRadius(1,2),Math.PI/6);
assert.equal(angularRadius(0,2),0);
assert.equal(daylightFactor(-13*DEG,1),0);
assert.equal(daylightFactor(6*DEG,1),1);
assert.ok(daylightFactor(-3*DEG,0.5)>0);
close(telescopeFovFromSlider(Math.log10(2)),2*DEG);
close(telescopeSliderFromFov(2*DEG),Math.log10(2));
close(telescopeFovFromSlider(-10),TELESCOPE_MIN_FOV);
close(telescopeFovFromSlider(10),TELESCOPE_MAX_FOV);
close(telescopeMagnification(2*DEG),35);

const planet={name:'Jupiter'};
const moon={name:'Europa',parentName:'Jupiter'};
const distantLabels=collapsedSatelliteLabels([
  {body:planet,x:100,y:100},
  {body:moon,x:112,y:106}
],entry=>entry,30);
assert.equal(distantLabels.has(moon),true);
assert.equal(distantLabels.has(planet),false);
const resolvedLabels=collapsedSatelliteLabels([
  {body:planet,x:100,y:100},
  {body:moon,x:160,y:100}
],entry=>entry,30);
assert.equal(resolvedLabels.has(moon),false);

console.log('observatory mode tests passed');
