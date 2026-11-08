(function(root,factory){
  const api={create:factory};
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.SimSolarImpacts=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(deps){
  'use strict';

  const {document,window}=deps;
  const {AU_KM}=window.TrajectoryMath;
  const {
    refinedSweptSphereImpact,linearImpactTime,impactStillInProgress,mergeKinematics,
    mergedRadius,memoizedStateSampler
  }=window.CollisionSystem;
  const {cloneState,recenterBarycentricState,createSimulator,bodyState}=window.NBodySimulation;
  const {sunReference,HYBRID_EPOCH_DAYS}=deps.catalog;
  const {SUN_RADIUS_KM,J2000}=deps.constants;
  const {positionForBody,activeSystemBodies,editableSnapshotAt,customBodies}=deps.simulation;
  const {playBtn}=deps.clock;

  let activeImpact=null;
  let ignoredImpactKey=null;
  let lastImpactPredictionUpdate=-Infinity;

  function collisionRadiusKm(body){
    return body===sunReference ? SUN_RADIUS_KM : body.radius;
  }
  function collisionPairsAt(tDays,positionAt=positionForBody){
    const candidates=activeSystemBodies().filter(
      body=>collisionRadiusKm(body)>0 && positionAt(body,tDays)
    );
    const pairs=[];
    for(let i=0;i<candidates.length;i++){
      for(let j=i+1;j<candidates.length;j++){
        if(candidates[i].kind==='custom'||candidates[j].kind==='custom'){
          pairs.push([candidates[i],candidates[j]]);
        }
      }
    }
    return pairs;
  }
  function impactKey(a,b){
    return [a.id,b.id].sort().join('|');
  }
  function relativeSpeedKmS(a,b){
    return Math.hypot(a.vx-b.vx,a.vy-b.vy,a.vz-b.vz)*AU_KM/86400;
  }
  function impactDate(tDays){
    return new Date(J2000+tDays*86400000).toISOString().replace('.000','');
  }
  function setImpactPanelVisible(visible){
    deps.panels.setPanelVisible('impactPanel',visible);
    document.getElementById('impactBtn').classList.toggle('active',visible);
    document.getElementById('impactBtn').setAttribute(
      'aria-expanded',String(visible)
    );
  }
  function updateImpactPanel(){
    const status=document.getElementById('impactStatus');
    const mergeButton=document.getElementById('impactMergeBtn');
    if(activeImpact){
      const supported=activeImpact.a.kind==='custom' && activeImpact.b.kind==='custom';
      status.textContent=
        activeImpact.a.name+' impacted '+activeImpact.b.name+'\n'+
        impactDate(activeImpact.time)+'\n'+
        'Relative speed: '+activeImpact.speedKmS.toFixed(2)+' km/s\n'+
        (supported
          ? 'A momentum-conserving merge is available.'
          : 'Natural-body impacts are report-only.');
      mergeButton.disabled=!supported;
      return;
    }
    mergeButton.disabled=true;
    let nearest=null;
    for(const [a,b] of collisionPairsAt(deps.clock.simDaysSinceJ2000)){
      const stateA=positionForBody(a,deps.clock.simDaysSinceJ2000);
      const stateB=positionForBody(b,deps.clock.simDaysSinceJ2000);
      if(!stateA || !stateB) continue;
      const radius=(collisionRadiusKm(a)+collisionRadiusKm(b))/AU_KM;
      const days=linearImpactTime(stateA,stateB,radius,365);
      if(days!==null && (!nearest || days<nearest.days)) nearest={a,b,days};
    }
    status.textContent=nearest
      ? 'Linear estimate: '+nearest.a.name+' → '+nearest.b.name+'\n'+
        impactDate(deps.clock.simDaysSinceJ2000+nearest.days)+'\n'+
        'Estimated time: '+nearest.days.toFixed(2)+' days'
      : 'No predicted custom-body impacts within 365 days.';
  }
  function detectImpact(startDays,endDays){
    const epoch=deps.simulation.editableSystem?.epoch??HYBRID_EPOCH_DAYS;
    if(endDays<=startDays || startDays<epoch) return null;
    const positionAt=deps.simulation.editableSystem
      ? memoizedStateSampler(
          time=>deps.simulation.editableSystem.simulator.stateAt(time),
          (state,body)=>bodyState(state,body.id)
        )
      : (body,time)=>positionForBody(body,time);
    let earliest=null;
    for(const [a,b] of collisionPairsAt(startDays,positionAt)){
      const key=impactKey(a,b);
      const startA=positionAt(a,startDays);
      const startB=positionAt(b,startDays);
      if(!startA || !startB) continue;
      const radius=(collisionRadiusKm(a)+collisionRadiusKm(b))/AU_KM;
      if(ignoredImpactKey===key){
        if(impactStillInProgress(startA,startB,radius)) continue;
        ignoredImpactKey=null;
      }
      const hit=refinedSweptSphereImpact(
        startDays,endDays,
        time=>positionAt(a,time),
        time=>positionAt(b,time),
        radius
      );
      if(!hit) continue;
      const time=hit.time;
      if(!earliest || time<earliest.time){
        const stateA=positionAt(a,time), stateB=positionAt(b,time);
        earliest={
          a,b,key,time,
          speedKmS:relativeSpeedKmS(stateA,stateB)
        };
      }
    }
    return earliest;
  }
  function handleImpact(impact){
    activeImpact=impact;
    ignoredImpactKey=null;
    deps.clock.simDaysSinceJ2000=impact.time;
    deps.clock.playing=false;
    playBtn.textContent='▶';
    setImpactPanelVisible(true);
    updateImpactPanel();
  }

  function mergeActiveImpact(){
    if(!activeImpact || !deps.simulation.editableSystem ||
      activeImpact.a.kind!=='custom' || activeImpact.b.kind!=='custom') return;
    const {a,b,time}=activeImpact;
    const currentState=cloneState(editableSnapshotAt(time));
    const stateA=currentState.massive.find(body=>body.id===a.id);
    const stateB=currentState.massive.find(body=>body.id===b.id);
    if(!stateA || !stateB) return;
    const merged=mergeKinematics(stateA,stateB);
    currentState.massive=currentState.massive.filter(
      body=>body!==stateA && body!==stateB
    );
    let name=a.name+' + '+b.name+' remnant';
    let suffix=2;
    while(deps.simulation.editableSystem.bodies.some(body=>body.name===name)){
      name=a.name+' + '+b.name+' remnant '+suffix++;
    }
    const id=deps.simulation.nextBodyId();
    currentState.massive.push({id,name,...merged});
    currentState.massive[currentState.massive.length-1].adaptiveFactor=Math.max(
      stateA.adaptiveFactor||0,stateB.adaptiveFactor||0
    );
    recenterBarycentricState(currentState);
    const dominant=a.massKg>=b.massKg ? a : b;
    const body={
      id,
      kind:'custom',category:'Merged body',appearance:dominant.appearance,
      name,massKg:a.massKg+b.massKg,mu:merged.mu,color:dominant.color,
      adaptiveFactor:48,
      radius:mergedRadius(a.radius,b.radius),
      notes:'Momentum-conserving remnant of '+a.name+' and '+b.name+'.'
    };
    const removed=new Set([a.id,b.id]);
    const bodies=deps.simulation.editableSystem.bodies.filter(
      candidate=>!removed.has(candidate.id)
    );
    bodies.push(body);
    for(const candidate of bodies){
      if(removed.has(candidate.parentId)){
        candidate.parentId=id;
        candidate.parentName=name;
        candidate.parent=body;
      }
    }
    deps.simulation.editableSystem={
      epoch:time,bodies,initialState:cloneState(currentState),
      simulator:createSimulator(currentState,{
        stepDays:0.25,particleStepDays:0.03125,checkpointDays:8
      })
    };
    customBodies.splice(0,customBodies.length,
      ...bodies.filter(candidate=>candidate.kind==='custom'));
    activeImpact=null;
    ignoredImpactKey=null;
    deps.transitions.cleanAfterSystemChange(removed);
    deps.selection.setSelectedBody(body);
    updateImpactPanel();
  }

  let initialized=false;
  function initialize(){
    if(initialized) return;
    initialized=true;
    document.getElementById('impactBtn').addEventListener('click',()=>{
      const panel=document.getElementById('impactPanel');
      setImpactPanelVisible(panel.classList.contains('panel-hidden'));
      updateImpactPanel();
    });
    document.getElementById('impactClose').addEventListener(
      'click',()=>setImpactPanelVisible(false)
    );
    document.getElementById('impactResumeBtn').addEventListener('click',()=>{
      if(activeImpact) ignoredImpactKey=activeImpact.key;
      activeImpact=null;
      deps.clock.playing=true;
      playBtn.textContent='⏸';
      updateImpactPanel();
    });
    document.getElementById('impactMergeBtn').addEventListener('click',mergeActiveImpact);
  }

  return {
    initialize,
    get activeImpact(){ return activeImpact; },
    set activeImpact(value){ activeImpact=value; },
    get ignoredImpactKey(){ return ignoredImpactKey; },
    set ignoredImpactKey(value){ ignoredImpactKey=value; },
    updateImpactPanel,
    detectImpact,
    handleImpact,
    get lastImpactPredictionUpdate(){ return lastImpactPredictionUpdate; },
    set lastImpactPredictionUpdate(value){ lastImpactPredictionUpdate=value; }
  };
});
