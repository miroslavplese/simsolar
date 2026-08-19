const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {
  GM_SUN_AU_DAY,
  solveKeplerElliptical,
  solveKeplerHyperbolic,
  bodyPosition,
  sampledStateAt,
  adaptiveTrajectoryPoints,
  appendIncrementalTrajectoryPoint,
  osculatingOrbitPoints,
  propagateState
}=require('../src/trajectory-math.js');
const {
  zoomForTarget,
  zoomForDistance,
  findRelativeEvent
}=require('../src/mission-timeline.js');

const root=path.resolve(__dirname,'..');

function loadGenerated(relativePath,key){
  const context={window:{}};
  const source=fs.readFileSync(path.join(root,relativePath),'utf8');
  vm.runInNewContext(source,context,{filename:relativePath});
  return context.window[key];
}

function close(actual,expected,tolerance,message){
  assert.ok(Math.abs(actual-expected)<=tolerance,
    `${message}: expected ${expected}, received ${actual}`);
}

function finiteState(state,message){
  for(const key of ['x','y','z','vx','vy','vz']){
    assert.ok(Number.isFinite(state[key]),`${message}: ${key} is not finite`);
  }
}

function energy(state){
  const r=Math.hypot(state.x,state.y,state.z);
  const v2=state.vx**2+state.vy**2+state.vz**2;
  return v2/2-GM_SUN_AU_DAY/r;
}

function daysSinceJ2000(isoDate){
  return (Date.parse(isoDate+'T12:00:00Z')-Date.UTC(2000,0,1,12))/86400000;
}

function dateFromJ2000(days){
  return new Date(Date.UTC(2000,0,1,12)+days*86400000).toISOString().slice(0,10);
}

const straight=adaptiveTrajectoryPoints(
  {t:0,x:0,y:0,z:0,vx:1,vy:0,vz:0},
  {t:10,x:10,y:0,z:0,vx:1,vy:0,vz:0},
  t=>({t,x:t,y:0,z:0,vx:1,vy:0,vz:0}),
  {tolerance:0.01}
);
assert.equal(straight.length,2);
const curved=adaptiveTrajectoryPoints(
  {t:-1,x:-1,y:1,z:0,vx:1,vy:-2,vz:0},
  {t:1,x:1,y:1,z:0,vx:1,vy:2,vz:0},
  t=>({t,x:t,y:t*t,z:0,vx:1,vy:2*t,vz:0}),
  {tolerance:0.01}
);
assert.ok(curved.length>8);
for(let i=1;i<curved.length;i++) assert.ok(curved[i].t>curved[i-1].t);
const incremental=[{t:0,x:0,y:0,z:0}];
appendIncrementalTrajectoryPoint(
  incremental,{t:0.1,x:0.01,y:0,z:0},
  {minDistance:0.1,maxSpan:1,maxPoints:5}
);
appendIncrementalTrajectoryPoint(
  incremental,{t:0.2,x:0.02,y:0,z:0},
  {minDistance:0.1,maxSpan:1,maxPoints:5}
);
assert.deepEqual(incremental,[
  {t:0,x:0,y:0,z:0},
  {t:0.2,x:0.02,y:0,z:0}
]);
appendIncrementalTrajectoryPoint(
  incremental,{t:0.3,x:0.2,y:0,z:0},
  {minDistance:0.1,maxSpan:1,maxPoints:5}
);
assert.equal(incremental.length,3);
appendIncrementalTrajectoryPoint(
  incremental,{t:0.15,x:0.015,y:0,z:0},
  {minDistance:0.1,maxSpan:1,maxPoints:5}
);
assert.equal(incremental.at(-1).t,0.15);
const currentOrbitState={
  x:1,y:0,z:0,vx:0,vy:Math.sqrt(GM_SUN_AU_DAY),vz:0
};
const osculating=osculatingOrbitPoints(
  currentOrbitState,GM_SUN_AU_DAY,256
);
assert.equal(osculating.length,257);
assert.deepEqual(osculating[128],{x:1,y:0,z:0});
for(const point of osculating){
  close(Math.hypot(point.x,point.y,point.z),1,1e-12,'circular osculating radius');
}

const spacecraft=loadGenerated('data/spacecraft-trajectories.js','SPACECRAFT_TRAJECTORIES').trajectories;
const planets=loadGenerated('data/planet-ephemerides.js','PLANET_EPHEMERIDES').ephemerides;
const comets=loadGenerated('data/comet-ephemerides.js','COMET_EPHEMERIDES').ephemerides;

let assertions=0;

const ellipticalCases=[
  [0,0],
  [0.2,1e-12],
  [1.7,0.5],
  [Math.PI,0.999999],
  [1e-6,0.999999]
];
for(const [meanAnomaly,eccentricity] of ellipticalCases){
  const eccentricAnomaly=solveKeplerElliptical(meanAnomaly,eccentricity);
  close(
    eccentricAnomaly-eccentricity*Math.sin(eccentricAnomaly),
    meanAnomaly,
    1e-11,
    `elliptical Kepler residual at e=${eccentricity}`
  );
  assertions++;
}

const hyperbolicCases=[
  [0,1.000001],
  [1e-6,1.000001],
  [-2.5,1.2],
  [10,3.7]
];
for(const [meanAnomaly,eccentricity] of hyperbolicCases){
  const hyperbolicAnomaly=solveKeplerHyperbolic(meanAnomaly,eccentricity);
  close(
    eccentricity*Math.sinh(hyperbolicAnomaly)-hyperbolicAnomaly,
    meanAnomaly,
    1e-11,
    `hyperbolic Kepler residual at e=${eccentricity}`
  );
  assertions++;
}

const circularBody={
  a:1,e:0,i:0,Omega:0,omega:0,M0:0,n:1,epochDays:0
};
const circularPosition=bodyPosition(circularBody,90);
close(circularPosition.r,1,1e-12,'circular orbit radius');
close(Math.hypot(circularPosition.x,circularPosition.y),1,1e-12,'circular orbit plane distance');
assert.ok(Number.isFinite(circularPosition.z),'circular orbit z position must be finite');
assertions+=3;

for(const [name,record] of Object.entries({...spacecraft,...planets,...comets})){
  const points=record.points;
  assert.ok(points.length>1,`${name} must contain multiple state vectors`);
  assertions++;
  for(const point of points){
    const state=sampledStateAt(points,point[0]);
    close(state.x,point[1],2e-10,`${name} x interpolation`);
    close(state.y,point[2],2e-10,`${name} y interpolation`);
    close(state.z,point[3],2e-10,`${name} z interpolation`);
    assertions+=3;
  }
}

const cometPerihelia=[
  ['Halley','1986-02-09',0.586],
  ['Hale-Bopp','1997-04-01',0.914],
  ['67P/Churyumov-Gerasimenko','2015-08-13',1.21],
  ['NEOWISE','2020-07-03',0.295]
];
for(const [name,date,expectedDistance] of cometPerihelia){
  const state=sampledStateAt(comets[name].points,daysSinceJ2000(date));
  assert.ok(Math.abs(state.r-expectedDistance)<0.08,
    `${name} perihelion distance is ${state.r.toFixed(3)} AU`);
  assertions++;
}

for(const [name,record] of Object.entries(spacecraft)){
  const last=record.points[record.points.length-1];
  const origin={t:last[0],x:last[1],y:last[2],z:last[3],vx:last[4],vy:last[5],vz:last[6]};
  const endpoint=propagateState(origin,0);
  assert.deepEqual(endpoint,origin,`${name} propagation must begin at the ephemeris endpoint`);
  assertions++;

  const initialEnergy=energy(origin);
  for(const days of [1,365,3650,36525]){
    const state=propagateState(origin,days);
    finiteState(state,`${name} propagation at ${days} days`);
    const relativeError=Math.abs((energy(state)-initialEnergy)/initialEnergy);
    assert.ok(relativeError<1e-7,`${name} energy drift at ${days} days: ${relativeError}`);
    assertions+=7;
  }
}

const localMu=1e-6;
const localRadius=0.01;
const localPeriod=2*Math.PI*Math.sqrt(localRadius**3/localMu);
const localOrigin={
  t:0,x:localRadius,y:0,z:0,
  vx:0,vy:Math.sqrt(localMu/localRadius),vz:0
};
const localOrbit=propagateState(localOrigin,localPeriod,localMu);
close(localOrbit.x,localOrigin.x,1e-11,'arbitrary-mu orbit x closure');
close(localOrbit.y,localOrigin.y,1e-11,'arbitrary-mu orbit y closure');
close(localOrbit.vx,localOrigin.vx,1e-11,'arbitrary-mu orbit vx closure');
close(localOrbit.vy,localOrigin.vy,1e-11,'arbitrary-mu orbit vy closure');
assertions+=4;

const flybys=[
  ['Voyager 1','Jupiter','1979-03-05',0.03],
  ['Voyager 1','Saturn','1980-11-12',0.03],
  ['Voyager 2','Jupiter','1979-07-09',0.03],
  ['Voyager 2','Saturn','1981-08-26',0.03],
  ['Voyager 2','Uranus','1986-01-24',0.02],
  ['Voyager 2','Neptune','1989-08-25',0.01],
  ['Pioneer 10','Jupiter','1973-12-04',0.03],
  ['Pioneer 11','Jupiter','1974-12-03',0.03],
  ['Pioneer 11','Saturn','1979-09-01',0.03],
  ['New Horizons','Jupiter','2007-02-28',0.03],
  ['New Horizons','Pluto','2015-07-14',0.001],
  ['New Horizons','Charon','2015-07-14',0.001],
  ['Parker Solar Probe','Venus','2024-11-06',0.03]
];

for(const [craft,planet,date,maxDistance] of flybys){
  const t=daysSinceJ2000(date);
  const craftState=sampledStateAt(spacecraft[craft].points,t);
  const planetState=sampledStateAt(planets[planet].points,t);
  const distance=Math.hypot(
    craftState.x-planetState.x,
    craftState.y-planetState.y,
    craftState.z-planetState.z
  );
  assert.ok(distance<maxDistance,
    `${craft} ${planet} flyby is ${distance.toFixed(5)} AU, expected < ${maxDistance}`);
  assertions++;
}

for(const [name,record] of Object.entries(spacecraft)){
  const first=record.points[0];
  const craftState=sampledStateAt(record.points,first[0]);
  const earthState=sampledStateAt(planets.Earth.points,first[0]);
  const distance=Math.hypot(
    craftState.x-earthState.x,
    craftState.y-earthState.y,
    craftState.z-earthState.z
  );
  assert.ok(distance<0.03,`${name} begins ${distance.toFixed(5)} AU from Earth`);
  assertions++;
}

const launchDates={
  'Voyager 1':'1977-09-05',
  'Voyager 2':'1977-08-20',
  'Pioneer 10':'1972-03-03',
  'Pioneer 11':'1973-04-06',
  'New Horizons':'2006-01-19',
  'Parker Solar Probe':'2018-08-12'
};

for(const [name,date] of Object.entries(launchDates)){
  assert.equal(dateFromJ2000(spacecraft[name].points[0][0]),date,
    `${name} first vector must be on its UTC launch date`);
  assertions++;
}

const navigationEvents=[
  {days:10,title:'Launch'},
  {days:20,title:'First flyby'},
  {days:30,title:'Second flyby'}
];
assert.equal(findRelativeEvent(navigationEvents,20,-1).title,'Launch');
assert.equal(findRelativeEvent(navigationEvents,20,1).title,'Second flyby');
assert.equal(findRelativeEvent(navigationEvents,5,-1),null);
assert.equal(findRelativeEvent(navigationEvents,35,1),null);
assert.equal(zoomForTarget('Jupiter'),1.15);
assert.equal(zoomForTarget('Unknown'),1);
assert.equal(zoomForDistance(0),4.5);
assert.equal(zoomForDistance(5.5),1);
assert.equal(zoomForDistance(200),0.045);
assert.equal(zoomForDistance(Number.NaN),1);
assertions+=10;

console.log(`Trajectory regression tests passed (${assertions.toLocaleString()} assertions).`);
