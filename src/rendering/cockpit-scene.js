(function(root,factory){
  const api={create:factory};
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.SimSolarCockpitRenderer=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(deps){
  'use strict';

  const {document,window}=deps;
  const {SpacecraftView,MissionPlannerUI,MissionPlanner}=window;
  const {AU_KM}=window.TrajectoryMath;
  const {
    projectDirection:projectObservatoryDirection,
    collapsedSatelliteLabels:collapsedObservatorySatelliteLabels
  }=window.ObservatoryMode;
  const {dominantLightBody}=window.SystemModel;
  const {ensureCatalogStars,backdropComponent,renderStarBackdrop,starBackdrop}=deps.stars;
  const {skyCtx,ctx}=deps.viewport;
  const {positionForBody,activeSystemBodies}=deps.simulation;
  const {drawObservatoryBody}=deps.observatoryRenderer;

  let spacecraftProjectedBodies=[];

  function spacecraftSceneBodies(){
    return deps.observatory.observatorySceneBodies();
  }

  function drawSpacecraftStars(camera){
    ensureCatalogStars();
    const vectors=[camera.forward,camera.right,camera.up].flatMap(vector=>[
      backdropComponent(vector.x,500),
      backdropComponent(vector.y,500),
      backdropComponent(vector.z,500)
    ]);
    const key='spacecraft:'+deps.viewport.W+':'+deps.viewport.H+':'+vectors.join(':')+':'+
      backdropComponent(deps.cockpit.spacecraftFov,1000);
    renderStarBackdrop(key,backdrop=>{
      for(const star of deps.stars.stars){
        const projected=projectObservatoryDirection(
          star,camera,deps.viewport.W,deps.viewport.H,deps.cockpit.spacecraftFov
        );
        if(!projected || projected.x<0 || projected.x>deps.viewport.W ||
           projected.y<0 || projected.y>deps.viewport.H) continue;
        backdrop.beginPath();
        backdrop.fillStyle=`rgba(${star.rgb},${star.alpha})`;
        backdrop.arc(
          projected.x,projected.y,star.radius,0,Math.PI*2
        );
        backdrop.fill();
      }
    },false);
    skyCtx.fillStyle='#03060d';
    skyCtx.fillRect(0,0,deps.viewport.W,deps.viewport.H);
    skyCtx.drawImage(starBackdrop,0,0);
  }

  function spacecraftDistanceText(distanceAu){
    if(!Number.isFinite(distanceAu)) return '—';
    const distanceKm=distanceAu*AU_KM;
    if(distanceKm<1000000){
      return Math.round(distanceKm).toLocaleString()+' km';
    }
    if(distanceAu<0.1){
      return (distanceKm/1000000).toFixed(2)+'M km';
    }
    return distanceAu.toFixed(distanceAu<10?3:2)+' AU';
  }

  function updateSpacecraftMilestones(){
    const milestones=SpacecraftView.routeMilestones(
      deps.planner.activePlannerRoute,deps.clock.simDaysSinceJ2000
    );
    document.getElementById('spacecraftProgressStart').textContent=
      milestones[0]?.name||'Departure';
    document.getElementById('spacecraftProgressEnd').textContent=
      milestones.at(-1)?.name||'Arrival';
    const container=document.getElementById('spacecraftProgressMilestones');
    if(container.children.length!==milestones.length){
      container.replaceChildren(...milestones.map(()=>document.createElement('i')));
    }
    milestones.forEach((milestone,index)=>{
      const marker=container.children[index];
      marker.className='spacecraftProgressMilestone '+milestone.role+
        (milestone.reached?' reached':'')+
        (
          milestone.reached && !milestones[index+1]?.reached
            ? ' current'
            : ''
        );
      marker.style.left=(milestone.progress*100).toFixed(3)+'%';
      marker.style.color=milestone.role==='departure'
        ? '#67d7ff'
        : milestone.role==='arrival' ? '#bd92ff' : '#72e6c1';
      marker.title=milestone.name+' · '+milestone.role;
      marker.setAttribute('role','img');
      marker.setAttribute('aria-label',marker.title);
    });
  }

  function updateSpacecraftHud(state){
    const leg=SpacecraftView.currentLeg(
      deps.planner.plannerRouteSamples,deps.clock.simDaysSinceJ2000
    );
    if(!leg) return;
    const legIndex=deps.planner.plannerRouteSamples.indexOf(leg);
    const nextWaypoint=deps.planner.activePlannerRoute.waypoints[legIndex+1];
    const nextState=deps.planner.plannerStateAt(nextWaypoint.name,deps.clock.simDaysSinceJ2000);
    const telemetry=SpacecraftView.telemetry(
      deps.planner.activePlannerRoute,deps.planner.plannerRouteSamples,state,
      deps.clock.simDaysSinceJ2000,nextState
    );
    document.getElementById('spacecraftHudMission').textContent=
      (deps.planner.activePlannerPlan?.name||'Planned mission')+' · FLIGHT COMPUTER';
    document.getElementById('spacecraftHudLeg').textContent=
      telemetry.legNumber+'/'+telemetry.legCount+' · '+
      telemetry.from+' → '+telemetry.to;
    document.getElementById('spacecraftHudSpeed').textContent=
      telemetry.speedKmS.toFixed(2)+' km/s';
    document.getElementById('spacecraftHudNext').textContent=telemetry.to;
    document.getElementById('spacecraftHudDistance').textContent=
      spacecraftDistanceText(telemetry.distanceToNextAu);
    document.getElementById('spacecraftHudEta').textContent=
      MissionPlannerUI.formatDuration(telemetry.legRemainingDays);
    document.getElementById('spacecraftHudRemaining').textContent=
      MissionPlannerUI.formatDuration(telemetry.remainingDays);
    document.getElementById('spacecraftProgressBar').style.width=
      (telemetry.progress*100).toFixed(2)+'%';
    document.getElementById('spacecraftProgress').setAttribute(
      'aria-valuenow',(telemetry.progress*100).toFixed(1)
    );
    updateSpacecraftMilestones();
  }

  function drawSpacecraftView(){
    let state=MissionPlanner.stateAlongSamples(
      deps.planner.plannerRouteSamples,deps.clock.simDaysSinceJ2000
    );
    if(!state){
      const start=deps.planner.activePlannerRoute?.waypoints[0].time;
      const end=deps.planner.activePlannerRoute?.waypoints.at(-1).time;
      if(Number.isFinite(start) && Number.isFinite(end)){
        deps.clock.simDaysSinceJ2000=Math.max(start,Math.min(end,deps.clock.simDaysSinceJ2000));
        state=MissionPlanner.stateAlongSamples(
          deps.planner.plannerRouteSamples,deps.clock.simDaysSinceJ2000
        );
      }
      if(!state){
        deps.cockpit.setSpacecraftView(false);
        return;
      }
    }
    const camera=SpacecraftView.cameraFrame(
      state,deps.cockpit.spacecraftLookYaw,deps.cockpit.spacecraftLookPitch
    );
    const velocityIndicator=SpacecraftView.directionIndicator(
      camera,deps.viewport.W,deps.viewport.H,deps.cockpit.spacecraftFov
    );
    const reticle=document.getElementById('spacecraftReticle');
    reticle.style.left=velocityIndicator.x+'px';
    reticle.style.top=velocityIndicator.y+'px';
    reticle.classList.toggle('offscreen',!velocityIndicator.onScreen);
    drawSpacecraftStars(camera);
    ctx.clearRect(0,0,deps.viewport.W,deps.viewport.H);
    spacecraftProjectedBodies=[];
    const entries=[];
    for(const body of spacecraftSceneBodies()){
      const position=positionForBody(body,deps.clock.simDaysSinceJ2000);
      if(!position) continue;
      const distance=Math.hypot(
        position.x-state.x,position.y-state.y,position.z-state.z
      );
      if(distance>1e-10) entries.push({body,position,distance});
    }
    entries.sort((a,b)=>b.distance-a.distance);
    const suppressedLabels=collapsedObservatorySatelliteLabels(
      entries,
      entry=>SpacecraftView.project(
        entry.position,state,camera,deps.viewport.W,deps.viewport.H,deps.cockpit.spacecraftFov
      )
    );
    const lightBody=dominantLightBody(activeSystemBodies());
    const sunPosition=lightBody &&
      positionForBody(lightBody,deps.clock.simDaysSinceJ2000);
    const sunProjected=sunPosition ? SpacecraftView.project(
      sunPosition,state,camera,deps.viewport.W,deps.viewport.H,deps.cockpit.spacecraftFov
    ) : null;
    for(const {body,position,distance} of entries){
      drawObservatoryBody(
        body,position,distance,state,null,camera,sunProjected,{
          fov:deps.cockpit.spacecraftFov,
          horizon:false,
          enhance:true,
          showLabel:!suppressedLabels.has(body),
          projectedBodies:spacecraftProjectedBodies
        }
      );
    }
    updateSpacecraftHud(state);
  }

  return {
    drawSpacecraftView,
    get spacecraftProjectedBodies(){ return spacecraftProjectedBodies; },
    set spacecraftProjectedBodies(value){ spacecraftProjectedBodies=value; }
  };
});
