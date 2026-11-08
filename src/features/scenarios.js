(function(root,factory){
  const api={create:factory};
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.SimSolarScenarios=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(deps){
  'use strict';

  const {document,window}=deps;
  const {ScenarioState,ScenarioController}=window;
  const {activeSystemBodies,serializedEditableSystem,customBodies}=deps.simulation;
  const {restoreEditableSystem}=deps.transitions;
  const {updateLagrangeControls}=deps.lagrange;
  const {refreshMissionTimelineCatalog,syncMissionToSpacecraft}=deps.timeline;
  const {refreshOccultationCatalog}=deps.occultations;
  const {
    refreshObservatoryCatalog,observatoryObserverBodies,setObservatoryObserver,
    isEarthObservatoryBody,observatoryTelescopeTargets,setObservatoryMode,
    setObservatoryTelescopeMode
  }=deps.observatory;
  const {clearSimulationCaches}=deps.transitions;
  const {DEG}=deps.constants;
  const {syncObservatoryCloudControls}=deps.clouds;
  const {setSelectedBody}=deps.selection;
  const {setFollowTarget,invalidateProjection}=deps.camera;
  const {playBtn,updateSpeedLabel}=deps.clock;
  const {buildLegend}=deps.legend;
  const {setSpacecraftView}=deps.cockpit;

  function scenarioBodyByName(name){
    if(!name) return null;
    return activeSystemBodies().find(body=>body.name===name)||null;
  }

  function currentScenarioState(){
    return {
      v:ScenarioState.VERSION,
      t:Number(deps.clock.simDaysSinceJ2000.toFixed(6)),
      playing:deps.clock.playing,
      speed:Number(deps.clock.speedExp.toFixed(4)),
      direction:deps.clock.direction,
      selected:deps.selection.selected?.name||null,
      follow:deps.camera.followTarget?.name||null,
      selectedId:deps.selection.selected?.id||null,
      followId:deps.camera.followTarget?.id||null,
      view:{
        zoom:Number(deps.camera.zoom.toFixed(6)),
        panX:Number(deps.camera.panX.toFixed(2)),
        panY:Number(deps.camera.panY.toFixed(2)),
        yaw:Number(deps.camera.viewYaw.toFixed(6)),
        tilt:Number(deps.camera.viewTilt.toFixed(6))
      },
      layers:{
        spacecraft:deps.visibility.showSpacecraft,
        comets:deps.visibility.showComets,
        lagrange:deps.lagrange.showLagrangePoints,
        rotating:deps.lagrange.rotatingReferenceFrame
      },
      observatory:deps.observatory.observatoryActive ? {
        body:deps.observatory.observatoryObserver.name,
        latitude:Number(deps.observatory.observatoryLatitude.toFixed(6)),
        longitude:Number(deps.observatory.observatoryLongitude.toFixed(6)),
        azimuth:Number(deps.observatory.observatoryAzimuth.toFixed(6)),
        altitude:Number(deps.observatory.observatoryAltitude.toFixed(6)),
        fov:Number(deps.observatory.observatoryFov.toFixed(6)),
        speed:Number(deps.clock.observatorySpeedExp.toFixed(4)),
        enhance:deps.observatory.observatoryEnhance,
        paths:deps.observatory.observatoryShowPaths,
        clouds:deps.clouds.observatoryCloudsEnabled,
        timeZone:deps.observatory.observatoryTimeZone,
        telescope:deps.observatory.observatoryTelescopeActive ? {
          target:deps.observatory.observatoryTelescopeTarget?.name||null,
          tracking:deps.observatory.observatoryTelescopeTracking,
          reticle:deps.observatory.observatoryTelescopeReticle,
          exposure:Number(deps.observatory.observatoryExposure.toFixed(2)),
          wideFov:Number(deps.observatory.observatoryWideFov.toFixed(6))
        } : null
      } : null,
      spacecraftView:deps.cockpit.spacecraftViewActive ? {
        yaw:Number(deps.cockpit.spacecraftLookYaw.toFixed(6)),
        pitch:Number(deps.cockpit.spacecraftLookPitch.toFixed(6)),
        fov:Number(deps.cockpit.spacecraftFov.toFixed(6))
      } : null,
      missionPlan:deps.planner.missionPlannerController?.plan()||null,
      system:serializedEditableSystem()
    };
  }

  function applyScenarioSnapshot(state){
    if(state.v>=3 && state.system){
      restoreEditableSystem(state.system);
    } else {
      deps.simulation.editableSystem=null;
      customBodies.length=0;
    }
    deps.lagrange.clearCache();
    deps.planner.missionPlannerController?.catalogChanged();
    refreshMissionTimelineCatalog();
    refreshOccultationCatalog();
    refreshObservatoryCatalog();
    clearSimulationCaches();
    deps.clock.simDaysSinceJ2000=Math.max(
      deps.simulation.editableSystem?.epoch??-Infinity,state.t
    );
    deps.clock.speedExp=state.speed;
    deps.clock.direction=state.direction;
    deps.camera.zoom=state.view.zoom;
    deps.camera.panX=state.view.panX;
    deps.camera.panY=state.view.panY;
    deps.camera.viewYaw=state.view.yaw;
    deps.camera.viewTilt=state.view.tilt;
    deps.visibility.showSpacecraft=state.layers.spacecraft;
    deps.visibility.showComets=state.layers.comets;
    deps.lagrange.showLagrangePoints=state.layers.lagrange;
    deps.lagrange.rotatingReferenceFrame=state.layers.rotating;
    const selectedBody=activeSystemBodies().find(
      body=>body.id===state.selectedId
    )||scenarioBodyByName(state.selected);
    const followedBody=activeSystemBodies().find(
      body=>body.id===state.followId
    )||scenarioBodyByName(state.follow);
    if(state.observatory){
      const observer=observatoryObserverBodies().find(
        body=>body.name===state.observatory.body
      );
      if(observer){
        setObservatoryObserver(observer);
        deps.observatory.observatoryLatitude=state.observatory.latitude;
        deps.observatory.observatoryLongitude=state.observatory.longitude;
        deps.observatory.observatoryAzimuth=state.observatory.azimuth;
        deps.observatory.observatoryAltitude=state.observatory.altitude;
        deps.observatory.observatoryFov=state.observatory.fov;
        deps.clock.observatorySpeedExp=state.observatory.speed;
        deps.observatory.observatoryEnhance=state.observatory.enhance;
        deps.observatory.observatoryShowPaths=state.observatory.paths;
        deps.clouds.observatoryCloudsEnabled=
          isEarthObservatoryBody(observer) &&
          (state.observatory.clouds??false);
        deps.observatory.observatoryTimeZone=state.observatory.timeZone;
        const telescopeState=state.observatory.telescope;
        deps.observatory.observatoryTelescopeTarget=telescopeState
          ? observatoryTelescopeTargets().find(
            body=>body.name===telescopeState.target
          )||null
          : null;
        deps.observatory.observatoryTelescopeTracking=telescopeState?.tracking??true;
        deps.observatory.observatoryTelescopeReticle=telescopeState?.reticle??true;
        deps.observatory.observatoryExposure=telescopeState?.exposure??1;
        deps.observatory.observatoryWideFov=telescopeState?.wideFov??70*DEG;
        document.getElementById('observatoryPreset').value='custom';
        document.getElementById('observatoryLatitude').value=
          deps.observatory.observatoryLatitude.toFixed(4);
        document.getElementById('observatoryLongitude').value=
          deps.observatory.observatoryLongitude.toFixed(4);
        document.getElementById('observatoryEnhance').checked=deps.observatory.observatoryEnhance;
        document.getElementById('observatoryPaths').checked=deps.observatory.observatoryShowPaths;
        syncObservatoryCloudControls();
        setObservatoryMode(true,true);
        if(telescopeState){
          setObservatoryTelescopeMode(true,true);
        }
      }
    }
    setSelectedBody(selectedBody,false);
    if(selectedBody?.kind==='spacecraft') syncMissionToSpacecraft(selectedBody);
    setFollowTarget(followedBody);
    deps.clock.playing=state.playing;
    playBtn.textContent=deps.clock.playing?'⏸':'▶';
    const slider=document.getElementById('speedSlider');
    slider.value=String(deps.observatory.observatoryActive?deps.clock.observatorySpeedExp:deps.clock.speedExp);
    updateSpeedLabel();
    updateLagrangeControls();
    buildLegend();
    invalidateProjection();
  }

  const scenarioController=ScenarioController.create({
    capture:currentScenarioState,
    apply:applyScenarioSnapshot,
    restoreMission(plan){
      deps.panels.setPanelVisible('plannerPanel',true);
      return deps.planner.missionPlannerController.restore(plan);
    },
    restoreCockpit(view){
      deps.cockpit.spacecraftLookYaw=view.yaw;
      deps.cockpit.spacecraftLookPitch=view.pitch;
      deps.cockpit.spacecraftFov=view.fov;
      setSpacecraftView(true,true);
    }
  });

  let scenarioStatusTimer=null;
  function showScenarioStatus(message,error=false){
    const status=document.getElementById('scenarioStatus');
    status.textContent=message;
    status.style.color=error?'#ff8f9f':'var(--accent)';
    status.classList.add('show');
    clearTimeout(scenarioStatusTimer);
    scenarioStatusTimer=setTimeout(()=>status.classList.remove('show'),2500);
  }

  async function copyScenarioLink(){
    let url;
    try{
      url=scenarioController.link(window.location.href);
      history.replaceState(null,'',url);
    } catch(error){
      showScenarioStatus(error.message,true);
      return;
    }
    try{
      if(!navigator.clipboard?.writeText){
        throw new Error('Clipboard API is unavailable.');
      }
      await navigator.clipboard.writeText(url);
      showScenarioStatus('SCENARIO LINK COPIED');
    } catch(error){
      showScenarioStatus('LINK READY IN THE ADDRESS BAR',true);
    }
  }

  let initialized=false;
  function initialize(){
    if(initialized) return;
    initialized=true;
    document.getElementById('shareScenarioBtn').addEventListener(
      'click',copyScenarioLink
    );
  }

  return {
    initialize,
    showScenarioStatus,
    scenarioController
  };
});
