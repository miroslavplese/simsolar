(function(root,factory){
  const api={create:factory};
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.SimSolarPlanner=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(deps){
  'use strict';

  const {document,window}=deps;
  const {SystemModel,MissionPlanner,MissionPlannerUI}=window;
  const {orbitalElementsFromState}=window.TrajectoryMath;
  const {fitViewToPoints}=window.ViewTransform;
  const {GM_BY_BODY,MOON_GM_BY_BODY,massKgToMu,bodyState}=window.NBodySimulation;
  const {catalogEntries}=window.SystemModel;
  const {
    activeSystemBodies,referencePositionForBody:positionForBody,gravitationalParameterForBody,HYBRID_MAX_DAYS,
    hybridBranchAt,moonBranchAt
  }=deps.simulation;
  const {HYBRID_EPOCH_DAYS}=deps.catalog;
  const {setFollowTarget,selectViewPreset,invalidateProjection}=deps.camera;
  const {DEFAULT_TILT,AU_PX,ZOOM_MIN,BASE_ZOOM_MAX,J2000}=deps.constants;
  const {playBtn,updateSpeedLabel}=deps.clock;

  let missionPlannerController=null;
  let activePlannerRoute=null;
  let activePlannerPlan=null;
  let plannerRouteSamples=[];
  let plannerPreviewActive=false;

  function plannerBodyByName(name){
    return activeSystemBodies().find(body=>body.name===name)||null;
  }

  function plannerStateAt(name,tDays){
    const body=plannerBodyByName(name);
    if(!body) return null;
    return positionForBody(body,tDays);
  }

  function plannerBodyInfo(name){
    const body=plannerBodyByName(name);
    if(!body) return {};
    const mu=body.mu || (body.massKg ? massKgToMu(body.massKg) : 0) ||
      MOON_GM_BY_BODY[name]||GM_BY_BODY[name]||0;
    return {mu,radiusKm:body.radius||0};
  }

  function plannerCentralMu(){
    if(!deps.simulation.editableSystem) return GM_BY_BODY.Sun;
    return activeSystemBodies().reduce((total,body)=>
      total+(body.dynamicClass==='particle'
        ? 0
        : body.mu||GM_BY_BODY[body.name]||MOON_GM_BY_BODY[body.name]||
          (body.massKg ? massKgToMu(body.massKg) : 0)
      ),0
    );
  }

  function plannerCatalog(){
    const bodies=activeSystemBodies();
    return catalogEntries(bodies).map(entry=>{
      const body=bodies.find(candidate=>candidate.id===entry.id);
      const reference=deps.simulation.editableSystem && entry.target!==false
        ? SystemModel.orbitReference(
          body,bodies,
          body=>bodyState(deps.simulation.editableSystem.initialState,body.id),
          gravitationalParameterForBody
        ) : null;
      return {
        ...entry,
        periodDays:reference
          ? orbitalElementsFromState(reference.relative,reference.mu)?.period : null,
        assist:entry.target!==false && (entry.assist ||
          !!GM_BY_BODY[entry.name] && entry.name!=='Charon' ||
          !!deps.simulation.editableSystem && ['planet','moon','custom'].includes(body.kind) &&
            gravitationalParameterForBody(body)>0
        )
      };
    });
  }

  async function prepareMissionEphemerides(tDays,onProgress,cancelled){
    if(deps.simulation.editableSystem){
      if(tDays<deps.simulation.editableSystem.epoch){
        throw new RangeError('Mission dates cannot precede the editable-system epoch.');
      }
      return deps.simulation.editableSystem.simulator.prepareTo(tDays,{
        budgetMs:8,onProgress,cancelled
      });
    }
    if(tDays<HYBRID_EPOCH_DAYS) return true;
    if(tDays>HYBRID_MAX_DAYS){
      throw new RangeError('Mission dates must be on or before 1 January 2100.');
    }
    const hybrid=await hybridBranchAt(tDays).simulator.prepareTo(tDays,{
      budgetMs:8,
      cancelled,
      onProgress:progress=>onProgress?.(progress*0.4)
    });
    if(!hybrid) return false;
    return moonBranchAt(tDays).simulator.prepareTo(tDays,{
      budgetMs:8,
      cancelled,
      onProgress:progress=>onProgress?.(0.4+progress*0.6)
    });
  }

  function focusPlannerRoute(){
    if(!plannerRouteSamples.length || deps.cockpit.spacecraftViewActive || deps.observatory.observatoryActive){
      return;
    }
    deps.lagrange.setLagrangeVisibility(false);
    deps.lagrange.setRotatingReferenceFrame(false);
    setFollowTarget(null);
    deps.camera.viewYaw=0;
    deps.camera.viewTilt=DEFAULT_TILT;
    const margin=56;
    let right=deps.viewport.W-margin;
    let bottom=deps.viewport.H-margin;
    const plannerPanel=document.getElementById('plannerPanel');
    if(!plannerPanel.classList.contains('panel-hidden')){
      const rect=plannerPanel.getBoundingClientRect();
      if(rect.left-margin>280) right=Math.min(right,rect.left-24);
    }
    const dock=document.getElementById('dock');
    if(!dock.classList.contains('panel-hidden')){
      const rect=dock.getBoundingClientRect();
      if(rect.top-margin>240) bottom=Math.min(bottom,rect.top-24);
    }
    const fitted=fitViewToPoints(
      plannerRouteSamples.flatMap(leg=>leg.points),
      {
        yaw:deps.camera.viewYaw,tilt:deps.camera.viewTilt,pixelsPerUnit:AU_PX,
        left:margin,right,top:88,bottom,
        centerX:deps.viewport.cx,centerY:deps.viewport.cy,minZoom:ZOOM_MIN,maxZoom:BASE_ZOOM_MAX
      }
    );
    if(!fitted) return;
    deps.camera.zoom=fitted.zoom;
    deps.camera.panX=fitted.panX;
    deps.camera.panY=fitted.panY;
    selectViewPreset('Current');
    invalidateProjection();
  }

  function setPlannerRoute(route,plan,changeOptions={}){
    activePlannerRoute=route;
    activePlannerPlan=plan||null;
    plannerPreviewActive=false;
    plannerRouteSamples=route
      ? MissionPlanner.sampleRoute(route,plannerStateAt,180)
      : [];
    const cockpitButton=document.getElementById('spacecraftViewBtn');
    if(cockpitButton) cockpitButton.disabled=!route;
    if(!route && deps.cockpit.spacecraftViewActive) deps.cockpit.setSpacecraftView(false);
    deps.camera.orbitLayerDirty=true;
    if(route && changeOptions.focus) focusPlannerRoute();
  }

  function plannerNodeSelected(index){
    if(!activePlannerRoute) return;
    const waypoint=activePlannerRoute.waypoints[index];
    const body=plannerBodyByName(waypoint.name);
    deps.clock.simDaysSinceJ2000=waypoint.time;
    deps.clock.playing=false;
    playBtn.textContent='▶';
    if(body){
      deps.selection.setSelectedBody(body,false);
      setFollowTarget(body);
    }
    invalidateProjection();
  }

  function previewPlannerRoute(){
    if(!activePlannerRoute) return;
    plannerPreviewActive=true;
    deps.clock.simDaysSinceJ2000=activePlannerRoute.waypoints[0].time;
    deps.clock.speedExp=Math.log10(Math.max(
      5,Math.min(120,activePlannerRoute.durationDays/24)
    ));
    document.getElementById('speedSlider').value=String(deps.clock.speedExp);
    setFollowTarget(null);
    deps.clock.playing=true;
    playBtn.textContent='⏸';
    updateSpeedLabel();
  }

  function buildMissionPlanner(){
    missionPlannerController=MissionPlannerUI.create({
      document,window,j2000:J2000,
      nowDays:()=>deps.clock.simDaysSinceJ2000,
      earliestDays:()=>deps.simulation.editableSystem?.epoch??-Infinity,
      catalog:plannerCatalog,
      stateAt:plannerStateAt,
      bodyInfo:plannerBodyInfo,
      centralMu:plannerCentralMu,
      prepareTo:prepareMissionEphemerides,
      storage:()=>window.localStorage,
      onRouteChange:setPlannerRoute,
      onNodeSelect:plannerNodeSelected,
      onPreview:previewPlannerRoute,
      onCockpit:()=>deps.cockpit.setSpacecraftView(true)
    });
  }

  return {
    get plannerRouteSamples(){ return plannerRouteSamples; },
    get activePlannerRoute(){ return activePlannerRoute; },
    plannerStateAt,
    get activePlannerPlan(){ return activePlannerPlan; },
    get plannerPreviewActive(){ return plannerPreviewActive; },
    set plannerPreviewActive(value){ plannerPreviewActive=value; },
    get missionPlannerController(){ return missionPlannerController; },
    buildMissionPlanner
  };
});
