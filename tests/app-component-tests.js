const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const Constants=require('../src/app/constants.js');
const Catalog=require('../src/app/catalog.js');
const Simulation=require('../src/app/simulation.js');
const Camera=require('../src/app/camera.js');
const Clock=require('../src/app/playback.js');
const Animation=require('../src/app/animation.js');
const Curated=require('../data/curated-systems.js');
const reference=require('./fixtures/refactor-reference.json');
const root=path.resolve(__dirname,'..');
const window={
  SpacecraftCatalog:require('../src/spacecraft-catalog.js'),
  MoonSystem:require('../src/moon-system.js'),
  NBodySimulation:require('../src/nbody-simulation.js'),
  HierarchicalMoonSimulation:require('../src/hierarchical-moon-simulation.js'),
  TrajectoryMath:require('../src/trajectory-math.js'),
  SystemModel:require('../src/system-model.js'),
  ViewTransform:require('../src/view-transform.js'),
  BodyRendering:require('../src/body-rendering.js'),
  PlaybackClock:require('../src/playback-clock.js'),
  matchMedia:()=>({matches:true})
};
for(const name of [
  'planet-ephemerides','planet-cutoff-states','moon-cutoff-states',
  'spacecraft-trajectories','recent-spacecraft-trajectories','comet-ephemerides'
]){
  vm.runInNewContext(fs.readFileSync(path.join(root,'data',name+'.js'),'utf8'),{window});
}
const constants=Constants.create({});
const catalog=Catalog.create({window,constants});
const otherCatalog=Catalog.create({window,constants});
assert.notEqual(catalog.builtInBodies,otherCatalog.builtInBodies);
for(let i=0;i<catalog.builtInBodies.length;i++){
  assert.notEqual(catalog.builtInBodies[i],otherCatalog.builtInBodies[i]);
  assert.equal(catalog.builtInBodies[i].id,otherCatalog.builtInBodies[i].id);
}
assert.equal(catalog.moons.find(body=>body.name==='Moon').parent,
  catalog.planets.find(body=>body.name==='Earth'));

function near(actual,expected,label){
  assert.ok(Number.isFinite(actual),label+' must be finite');
  assert.ok(Math.abs(actual-expected)<=1e-12+Math.abs(expected)*1e-11,
    `${label}: ${actual} != ${expected}`);
}

function compare(actual,expected,label){
  if(typeof expected==='number') near(actual,expected,label);
  else if(expected && typeof expected==='object'){
    assert.deepEqual(Object.keys(actual),Object.keys(expected),label+' keys');
    for(const key of Object.keys(expected)) compare(actual[key],expected[key],label+'.'+key);
  }else assert.equal(actual,expected,label);
}

// The simulation adapter must match the pre-extraction numerical references,
// not merely agree with another path through the new component.
const simulation=Simulation.create({window,constants,catalog});
const otherSimulation=Simulation.create({window,constants,catalog:otherCatalog});
for(const definition of Curated.SYSTEMS.filter(system=>system.mode!=='solar')){
  const system=Curated.buildEditableSystem(definition,5672);
  const previousBody=simulation.activeSystemBodies()[0];
  simulation.restoreEditableSystem(system);
  assert.equal(simulation.isBodyActive(previousBody),false);
  assert.equal(otherSimulation.editableSystem,null);
  const bodies=simulation.activeSystemBodies();
  assert.equal(simulation.positionForBody(bodies[0],5671),null);
  for(const sample of reference.curated[definition.id]){
    const time=5672+sample.offset;
    for(const expected of sample.bodies){
      const body=bodies.find(candidate=>candidate.id===expected.id);
      const position=simulation.positionForBody(body,time);
      window.SystemModel.STATE_KEYS.forEach((key,index)=>
        near(position[key],expected.state[index],definition.id+':'+body.id+':'+key));
      const orbit=simulation.editableOrbitReference(body,time);
      if(expected.elements){
        const elements=window.TrajectoryMath.orbitalElementsFromState(orbit.relative,orbit.mu);
        compare(elements,expected.elements,body.id+' elements');
        assert.ok(simulation.editableOrbitPoints(body,time,32).length>0);
      } else {
        assert.equal(orbit,null);
      }
    }
  }
  const saved=simulation.serializedEditableSystem();
  const positions=bodies.map(body=>simulation.positionForBody(body,5672));
  simulation.restoreEditableSystem(saved);
  simulation.activeSystemBodies().forEach((body,index)=>{
    const restored=simulation.positionForBody(body,5672);
    for(const key of window.SystemModel.STATE_KEYS){
      near(restored[key],positions[index][key],body.id+' round trip '+key);
    }
  });
}
let samples=0;
const snapshot={massive:[],particles:[]};
simulation.editableSystem={
  epoch:0,bodies:[],simulator:{stateAt(){ samples++; return snapshot; }}
};
assert.equal(simulation.editableSnapshotAt(2),snapshot);
assert.equal(simulation.editableSnapshotAt(2),snapshot);
assert.equal(samples,1,'same-system/time samples are cached');
simulation.clearCaches();
simulation.editableSnapshotAt(2);
assert.equal(samples,2,'cache invalidation belongs to the simulation');
simulation.editableSnapshotAt(3);
assert.equal(samples,3,'time changes invalidate the editable snapshot');
simulation.editableSystem=null;
assert.equal(simulation.editableSnapshotAt(3),null);
assert.equal(simulation.activeSystemBodies(),catalog.builtInBodies);
assert.deepEqual(simulation.positionForBody(catalog.sunReference,5672),
  {x:0,y:0,z:0,vx:0,vy:0,vz:0,r:0,speedKmS:0});
assert.notEqual(simulation.nextBodyId(),simulation.nextBodyId());
assert.equal('hybridSnapshotCache' in simulation,false);
assert.equal('editableSnapshotCache' in simulation,false);
assert.equal('runtimeBodySequence' in simulation,false);

{
  const time=catalog.HYBRID_EPOCH_DAYS+2;
  const earth=catalog.planets.find(body=>body.name==='Earth');
  const before=simulation.referencePositionForBody(earth,time);
  const global=simulation.hybridBranchAt(time);
  const moons=simulation.moonBranchAt(time);
  const origin=simulation.continuationOrigin(catalog.spacecraft[0]);
  simulation.reset();
  assert.notEqual(simulation.hybridBranchAt(time).simulator,global.simulator,
    'Solar replacement must discard reference-integrator checkpoints');
  assert.notEqual(simulation.moonBranchAt(time).simulator,moons.simulator,
    'Solar replacement must discard moon-integrator checkpoints');
  assert.notEqual(simulation.continuationOrigin(catalog.spacecraft[0]),origin);
  compare(simulation.referencePositionForBody(earth,time),before,'fresh Solar state');
  const editable=Curated.buildEditableSystem(Curated.SYSTEMS[1],5672);
  editable.bodies.at(-1).kind='custom';
  simulation.restoreEditableSystem(editable);
  assert.ok(simulation.customBodies.length);
  simulation.reset();
  assert.equal(simulation.editableSystem,null);
  assert.equal(simulation.customBodies.length,0);
  assert.equal(simulation.activeSystemBodies(),catalog.builtInBodies);
}

class Element{
  constructor(){
    this.listeners=new Map();
    this.textContent='';
    this.value='';
    this.disabled=false;
    const classes=new Set();
    this.classList={toggle:(name,on)=>on?classes.add(name):classes.delete(name)};
  }
  addEventListener(name,listener){
    if(!this.listeners.has(name)) this.listeners.set(name,new Set());
    this.listeners.get(name).add(listener);
  }
  emit(name){
    for(const listener of this.listeners.get(name)||[]) listener({target:this});
  }
}
const elements=new Map();
const document=new Element();
document.getElementById=id=>{
  if(!elements.has(id)) elements.set(id,new Element());
  return elements.get(id);
};
const selection={selected:null};
const body={kind:'planet',name:'test',radius:6371};
const position={x:1,y:2,z:0};
const cameraDeps={
  window,document,constants,catalog,selection,
  viewport:{cx:720,cy:500,W:1440,H:1000},
  simulation:{isBodyActive:candidate=>candidate===body,positionForBody:()=>position},
  clock:{simDaysSinceJ2000:0},
  profiler:{updateProfilerUI(){}},
  lagrange:{updateLagrangeControls(){}},
  visibility:{showSpacecraft:false},legend:{buildLegend(){}}
};
const camera=Camera.create(cameraDeps);
const otherCamera=Camera.create(cameraDeps);
camera.initialize();
camera.initialize();
assert.equal(elements.get('viewPreset').listeners.get('change').size,1);
camera.viewTilt=0.4;
camera.viewYaw=0.3;
camera.panX=12;
camera.panY=-23;
const screen=camera.project(position.x,position.y,0);
const world=camera.screenToEcliptic(screen.x,screen.y);
near(world.x,position.x,'inverse projection x');
near(world.y,position.y,'inverse projection y');
camera.applyZoom(5,screen.x,screen.y);
const anchored=camera.project(position.x,position.y,0);
near(anchored.x,screen.x,'zoom anchor x');
near(anchored.y,screen.y,'zoom anchor y');
assert.equal(otherCamera.zoom,1,'camera state is instance-owned');
camera.setFollowTarget(body);
camera.updateFollowCamera();
const followed=camera.project(position.x,position.y,0);
near(followed.x,720,'follow x');
near(followed.y,500,'follow y');
camera.viewTilt=Math.PI/2;
assert.equal(camera.screenToEcliptic(720,500),null,'edge-on placement remains unavailable');
camera.applyZoom(0,720,500);
assert.equal(camera.zoom,constants.ZOOM_MIN);

let impactUpdates=0;
const observatory={observatoryActive:false};
const clock=Clock.create({
  document,window,constants,catalog,simulation,camera,observatory,
  impacts:{updateImpactPanel(){ impactUpdates++; }}
});
clock.initialize();
clock.initialize();
assert.equal(elements.get('playBtn').listeners.get('click').size,1);
assert.equal(document.listeners.get('visibilitychange').size,1);
assert.equal(clock.playing,false,'reduced-motion startup remains paused');
clock.playing=true;
clock.simDaysSinceJ2000=simulation.HYBRID_MAX_DAYS-10;
elements.get('fwdBtn').emit('click');
assert.equal(clock.simDaysSinceJ2000,simulation.HYBRID_MAX_DAYS);
assert.equal(clock.playing,false);
simulation.editableSystem={epoch:100};
clock.simDaysSinceJ2000=110;
elements.get('rewBtn').emit('click');
assert.equal(clock.simDaysSinceJ2000,100);
assert.ok(impactUpdates>=2);
const revision=clock.dateNavigationRevision;
clock.cancelDateNavigation();
assert.equal(clock.dateNavigationRevision,revision+1);
clock.speedExp=2;
assert.equal(clock.speedDaysPerSec(),100);
observatory.observatoryActive=true;
clock.observatorySpeedExp=1;
assert.equal(clock.speedDaysPerSec(),10/86400);
observatory.observatoryActive=false;

{
  let cancellations=0;
  const pendingClock=Clock.create({
    document,window,constants,catalog,camera,observatory,
    simulation:{
      asyncEnabled:true,HYBRID_MAX_DAYS:simulation.HYBRID_MAX_DAYS,
      isFrameReady:()=>false,cancelPreparation(){ cancellations++; }
    },
    impacts:{updateImpactPanel(){}}
  });
  pendingClock.simDaysSinceJ2000=20000;
  pendingClock.direction=-1;
  pendingClock.playing=true;
  const previousRevision=pendingClock.dateNavigationRevision;
  const time=constants.daysSinceJ2000(Date.parse('2018-01-02T03:04:05.678Z'));
  pendingClock.resetTime(time);
  assert.equal(pendingClock.simDaysSinceJ2000,time);
  assert.equal(pendingClock.requestedDays,time,'replacement discards the queued navigation');
  assert.equal(pendingClock.dateNavigationRevision,previousRevision+1);
  assert.equal(pendingClock.playing,false);
  assert.equal(pendingClock.direction,1);
  assert.equal(elements.get('dateInput').value,'2018-01-02');
  assert.equal(elements.get('timeOut').textContent,'03:04:05 UTC');
  assert.ok(cancellations>0);
}

const frames=new Map();
let sequence=0,draws=0,resets=0,onDraw=null;
const frameClock={
  playing:false,simDaysSinceJ2000:10,direction:1,
  speedDaysPerSec:()=>1,playBtn:{},
  playbackClock:{reset(){ resets++; },tick:()=>({elapsed:0.01,playback:1})},
  stopAtHybridLimit(){ frameClock.playing=false; }
};
const frameSimulation={editableSystem:null,HYBRID_MAX_DAYS:100};
const planner={plannerPreviewActive:false,activePlannerRoute:null};
const animation=Animation.create({
  window:{...window,
    requestAnimationFrame(callback){ frames.set(++sequence,callback); return sequence; },
    cancelAnimationFrame(id){ frames.delete(id); }
  },
  document,clock:frameClock,camera:{},observatory,
  profiler:{frameProfiler:{record(){}},updateProfilerUI(){}},
  impacts:{lastImpactPredictionUpdate:0,detectImpact:()=>null,handleImpact(){},updateImpactPanel(){}},
  planner,cockpit:{spacecraftViewActive:false},simulation:frameSimulation,
  sceneRenderer:{draw(){ draws++; onDraw?.(); }}
});
function frame(){
  assert.equal(frames.size,1,'only one animation frame may be pending');
  const [id,callback]=frames.entries().next().value;
  frames.delete(id);
  callback(20);
}
animation.start();
animation.start();
assert.equal(frames.size,1);
frame();
assert.equal(draws,1);
frameClock.playing=true;
frame();
assert.equal(frameClock.simDaysSinceJ2000,11);
planner.plannerPreviewActive=true;
planner.activePlannerRoute={waypoints:[{time:10},{time:12}]};
frame();
assert.equal(frameClock.simDaysSinceJ2000,12);
assert.equal(frameClock.playing,false);
assert.equal(planner.plannerPreviewActive,false);
frameSimulation.editableSystem={epoch:11.5};
frameClock.direction=-1;
frameClock.playing=true;
frame();
assert.equal(frameClock.simDaysSinceJ2000,11.5);
assert.equal(frameClock.playing,false);
const lateFrame=frames.values().next().value;
animation.stop();
animation.stop();
assert.equal(frames.size,0);
const stoppedDraws=draws;
lateFrame(50);
assert.equal(draws,stoppedDraws,'a cancelled frame cannot restart the loop');
animation.start();
lateFrame(60);
assert.equal(draws,stoppedDraws,'a stale frame cannot join a restarted loop');
assert.equal(frames.size,1);
onDraw=()=>{
  onDraw=null;
  animation.stop();
  animation.start();
};
frame();
assert.equal(frames.size,1,'a restart during drawing cannot queue a second frame');
frame();
animation.stop();
assert.ok(resets>=4,'resume never includes suspended wall time');

const html=fs.readFileSync(path.join(root,'solar-system.html'),'utf8');
const scripts=Array.from(html.matchAll(/<script src="([^"?]+)/g),match=>match[1]);
assert.equal(new Set(scripts).size,scripts.length);
for(const folder of ['app','features','rendering']){
  for(const file of fs.readdirSync(path.join(root,'src',folder))){
    const relative='src/'+folder+'/'+file;
    if(file.endsWith('.js')){
      assert.ok(scripts.includes(relative),relative+' must be loaded by the static page');
      const registration={
        TrajectoryMath:window.TrajectoryMath,
        ObjectImages:require('../src/object-images.js')
      };
      vm.runInNewContext(fs.readFileSync(path.join(root,'src',folder,file),'utf8'),registration);
      const registered=Object.entries(registration)
        .filter(([name])=>!['TrajectoryMath','ObjectImages'].includes(name));
      assert.equal(registered.length,1,relative+' registers only its factory');
      assert.equal(typeof registered[0][1].create,'function');
    }else if(file.endsWith('.css')){
      assert.ok(html.includes('href="'+relative+'?'),relative+' must be loaded by the static page');
    }
  }
}
{
  let projections=0,simplifications=0;
  const view={zoom:500,viewYaw:0.2,viewTilt:0.4,panX:0,panY:0,projectionRevision:0};
  const viewport={cx:720,cy:500};
  function project(x,y,z){
    projections++;
    const rotated=window.ViewTransform.viewCoordinates(x,y,z,view.viewYaw,view.viewTilt);
    return {
      x:viewport.cx+view.panX+rotated.x*view.zoom,
      y:viewport.cy+view.panY+rotated.y*view.zoom,depth:rotated.depth
    };
  }
  const orbits=require('../src/rendering/orbit-layer.js').create({
    window:{...window,AsteroidBelt:require('../src/asteroid-belt.js'),
      TrajectoryMath:{...window.TrajectoryMath,simplifyProjectedPath(...args){
        simplifications++;
        return window.TrajectoryMath.simplifyProjectedPath(...args);
      }}},
    catalog,constants,simulation,viewport,camera:Object.assign(view,{project}),
    visibility:{},surfaces:{}
  });
  const body={_trajectoryPoints:true,_orbitWorldPoints:Array.from({length:5000},(_,i)=>({
    x:Math.cos(i/200),y:Math.sin(i/200),z:i/5000
  }))};
  const points=orbits.getProjectedOrbitPoints(body);
  const renderPoints=body._renderPathPts;
  const indices=renderPoints.map(point=>point.sourceIndex);
  const bounds={...body._pathBounds};
  assert.equal(projections,5000);
  assert.equal(simplifications,1);
  view.panX=17; view.panY=-9; viewport.cx+=30; viewport.cy+=20;
  view.projectionRevision++;
  assert.equal(orbits.getProjectedOrbitPoints(body),points);
  assert.equal(body._renderPathPts,renderPoints);
  assert.equal(projections,5000,'pan/follow must not project the world path again');
  assert.equal(simplifications,1,'pan/follow must not re-simplify the path');
  assert.deepEqual(renderPoints.map(point=>point.sourceIndex),indices);
  near(body._pathBounds.minX,bounds.minX+47,'translated hit-test bounds x');
  near(body._pathBounds.minY,bounds.minY+11,'translated hit-test bounds y');
  for(const index of [0,2500,4999]){
    const source=body._orbitWorldPoints[index];
    compare(points[index],project(source.x,source.y,source.z),'translated point '+index);
  }
  for(const point of renderPoints){
    const source=points[point.sourceIndex];
    near(point.x,source.x,'render/hit-test x');
    near(point.y,source.y,'render/hit-test y');
  }
  for(const key of ['zoom','viewYaw','viewTilt']){
    view[key]+=0.1; view.projectionRevision++;
    const count=projections;
    assert.notEqual(orbits.getProjectedOrbitPoints(body),points);
    assert.equal(projections,count+5000,key+' must rebuild the projection');
  }
  body._orbitWorldPoints=[{x:0,y:0,z:0},{x:1,y:1,z:1}];
  view.projectionRevision++;
  assert.equal(orbits.getProjectedOrbitPoints(body).length,2,'replaced source must rebuild');
  const conic={_orbitWorldPoints:[{x:0,y:0,z:0},{x:2,y:1,z:0}]};
  const conicPoints=orbits.getProjectedOrbitPoints(conic);
  const x=conicPoints[1].x;
  view.panX+=5; view.projectionRevision++;
  orbits.getProjectedOrbitPoints(conic);
  near(conicPoints[1].x,x+5,'unsimplified path must translate only once');
  simulation.reset();
  const craft=catalog.spacecraft[0];
  const world=orbits.getOrbitWorldPoints(craft);
  const projected=orbits.getProjectedOrbitPoints(craft);
  const trail=orbits.ensureHybridTrail(craft,catalog.HYBRID_EPOCH_DAYS+1,
    {x:1,y:2,z:3});
  orbits.projectedHybridTrail(craft,trail);
  const continuation=orbits.ensureContinuation(craft,catalog.HYBRID_EPOCH_DAYS+40);
  const trajectory=craft._trajectoryPoints;
  orbits.clearCaches();
  for(const key of [
    '_orbitWorldPoints','_projectedRevision','_projectedView','_pathPts',
    '_renderPathPts','_pathBounds','_continuationPoints','_continuationStep',
    '_projectedHybridTrail'
  ]) assert.equal(key in craft,false,key+' must be released');
  assert.equal(craft._trajectoryPoints,trajectory,'bundled ephemerides are preserved');
  assert.notEqual(orbits.getOrbitWorldPoints(craft),world);
  assert.notEqual(orbits.getProjectedOrbitPoints(craft),projected);
  const freshTrail=orbits.ensureHybridTrail(craft,catalog.HYBRID_EPOCH_DAYS);
  assert.notEqual(freshTrail,trail);
  assert.equal(freshTrail.length,1,'no accumulated trail survives replacement');
  assert.notEqual(orbits.ensureContinuation(craft,catalog.HYBRID_EPOCH_DAYS),continuation);
}
console.log('Application component ownership, numerical adapters, camera, clock, animation, and orbit-cache contracts passed.');
