(function(root,factory){
  const api={create:factory};
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.SimSolarTransitions=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(deps){
  'use strict';

  const {document,window}=deps;
  const {MissionPlannerUI,CuratedSystemsUI,CuratedSystems}=window;
  const {cloneState,createBarycentricState,createSimulator}=window.NBodySimulation;
  const {deletionClosure,dominantLightBody}=window.SystemModel;
  const {J2000,ZOOM_MIN,BASE_ZOOM_MAX,AU_PX,DEFAULT_TILT}=deps.constants;
  const {builtInBodies}=deps.catalog;
  const {
    positionForBody,stateDefinitionForBody,activeSystemBodies,isBodyActive,rebuildEditableAt,
    customBodies,HYBRID_MAX_DAYS
  }=deps.simulation;
  const {playBtn,cancelDateNavigation,playbackClock,updateSpeedLabel,updateDateUI}=deps.clock;
  const {setSelectedBody}=deps.selection;
  const {setFollowTarget,selectViewPreset,invalidateProjection}=deps.camera;
  const {setObservatoryMode,refreshObservatoryTelescopeTargets,refreshObservatoryCatalog}=deps.observatory;
  const {setLagrangeVisibility,setRotatingReferenceFrame,updateLagrangeControls}=deps.lagrange;
  const {setOccultationPanelVisible,refreshOccultationCatalog}=deps.occultations;
  const {setSpacecraftView}=deps.cockpit;
  const {refreshMissionTimelineCatalog,renderMissionEvents}=deps.timeline;
  const {updateImpactPanel}=deps.impacts;
  const {buildLegend}=deps.legend;
  const {resetBodyInsertion}=deps.editor;

  function updateSystemDateBounds(){
    for(const id of [
      'dateInput','plannerDepartureStart','plannerDepartureEnd',
      'plannerArrivalStart','plannerArrivalEnd'
    ]){
      const input=document.getElementById(id);
      if(deps.simulation.editableSystem) input.removeAttribute('max');
      else input.max='2100-01-01';
      if(id!=='dateInput'){
        if(deps.simulation.editableSystem){
          input.min=MissionPlannerUI.isoFromDays(Math.ceil(deps.simulation.editableSystem.epoch),J2000);
        } else {
          input.removeAttribute('min');
        }
      }
    }
  }

  function restoreEditableSystem(system){
    deps.simulation.restoreEditableSystem(system);
    updateSystemDateBounds();
  }

  function detachSolarSystem(){
    if(deps.simulation.editableSystem) return;
    const bodies=[];
    const massive=[], particles=[];
    for(const body of builtInBodies){
      const state=positionForBody(body,deps.clock.simDaysSinceJ2000);
      if(!state) continue;
      bodies.push(body);
      const definition=stateDefinitionForBody(body,state);
      if(body.kind==='spacecraft'||body.kind==='comet'){
        body.dynamicClass='particle';
        particles.push(definition);
      } else {
        massive.push(definition);
      }
    }
    const state=createBarycentricState(
      deps.clock.simDaysSinceJ2000,massive,particles
    );
    deps.simulation.editableSystem={
      epoch:deps.clock.simDaysSinceJ2000,bodies,
      initialState:cloneState(state),
      simulator:createSimulator(state,{
        stepDays:0.25,particleStepDays:0.03125,checkpointDays:8
      })
    };
    updateSystemDateBounds();
    deps.clock.playing=false;
    playBtn.textContent='▶';
    clearSimulationCaches();
  }

  function cleanAfterSystemChange(removed=new Set()){
    const activeIds=new Set(activeSystemBodies().map(body=>body.id));
    for(const body of activeSystemBodies()){
      if(body.orbitPrimaryIds){
        body.orbitPrimaryIds=body.orbitPrimaryIds.filter(id=>activeIds.has(id));
      }
    }
    if(removed.has(deps.selection.selected?.id)) setSelectedBody(null,false);
    if(removed.has(deps.camera.followTarget?.id)) setFollowTarget(null);
    if(removed.has(deps.selection.hovered?.id)) deps.selection.hovered=null;
    if(removed.has(deps.observatory.observatoryObserver?.id) && deps.observatory.observatoryActive){
      setObservatoryMode(false,true);
    }
    if(removed.has(deps.observatory.observatoryTelescopeTarget?.id)){
      deps.observatory.observatoryTelescopeTarget=null;
      refreshObservatoryTelescopeTargets();
    }
    if(
      removed.has(deps.lagrange.activeLagrangeSystem?.primary?.id) ||
      removed.has(deps.lagrange.activeLagrangeSystem?.secondary?.id)
    ){
      setLagrangeVisibility(false);
      setRotatingReferenceFrame(false);
    }
    deps.timeline.activeMissionEvent=null;
    deps.occultations.activeOccultationEvent=null;
    deps.occultations.occultationSearchRevision++;
    if(!dominantLightBody(activeSystemBodies())){
      setOccultationPanelVisible(false);
    }
    deps.impacts.activeImpact=null;
    deps.impacts.ignoredImpactKey=null;
    deps.planner.plannerPreviewActive=false;
    if(deps.cockpit.spacecraftViewActive) setSpacecraftView(false);
    deps.lagrange.clearCache();
    deps.planner.missionPlannerController?.catalogChanged();
    refreshMissionTimelineCatalog();
    refreshOccultationCatalog();
    refreshObservatoryCatalog();
    renderMissionEvents();
    clearSimulationCaches();
    updateImpactPanel();
    updateLagrangeControls();
    buildLegend();
  }

  function deleteSystemBody(body){
    if(!body || !isBodyActive(body)) return;
    detachSolarSystem();
    const removed=deletionClosure(deps.simulation.editableSystem.bodies,body.id);
    rebuildEditableAt(
      deps.simulation.editableSystem.bodies.filter(candidate=>!removed.has(candidate.id)),
      deps.clock.simDaysSinceJ2000
    );
    cleanAfterSystemChange(removed);
  }

  function restoreSolarSystem(){
    const removed=new Set(activeSystemBodies().map(body=>body.id));
    deps.simulation.editableSystem=null;
    customBodies.length=0;
    updateSystemDateBounds();
    deps.clock.simDaysSinceJ2000=Math.min(deps.clock.simDaysSinceJ2000,HYBRID_MAX_DAYS);
    deps.clock.playing=false;
    playBtn.textContent='▶';
    cleanAfterSystemChange(removed);
    deps.scenarios.showScenarioStatus('SOLAR SYSTEM RESTORED');
  }

  function clearSimulationCaches(){
    deps.simulation.clearCaches();
    deps.orbits.clearCaches();
    deps.observatoryRenderer.clearPaths();
    deps.camera.orbitLayerDirty=true;
  }

  let initialized=false;
  function initialize(){
    if(initialized) return;
    initialized=true;
    document.getElementById('curatedBtn').addEventListener('click',()=>{
      const panel=document.getElementById('curatedSystemsPanel');
      const isHidden=!panel||panel.classList.contains('panel-hidden');
      CuratedSystemsUI.toggle(isHidden);
    });
    CuratedSystemsUI.setVisibleListener((vis)=>{
      const btn=document.getElementById('curatedBtn');
      btn.classList.toggle('active',vis);
      btn.setAttribute('aria-expanded',String(vis));
    });
    CuratedSystemsUI.setOnLoad((sysDef)=>{
      let system;
      try{
        system=sysDef.mode==='solar' ? null :
          CuratedSystems.buildEditableSystem(sysDef,deps.clock.simDaysSinceJ2000);
      } catch(error){
        console.error(error);
        deps.scenarios.showScenarioStatus('Unable to load system: '+error.message,true);
        return;
      }
      const removed=new Set(activeSystemBodies().map(body=>body.id));
      cancelDateNavigation();
      deps.planner.missionPlannerController?.cancelSearch();
      setOccultationPanelVisible(false);
      if(deps.cockpit.spacecraftViewActive) setSpacecraftView(false);
      if(deps.observatory.observatoryActive) setObservatoryMode(false);
      setLagrangeVisibility(false);
      setRotatingReferenceFrame(false);
      setSelectedBody(null,false);
      setFollowTarget(null);
      deps.selection.hovered=null;
      if(system){
        restoreEditableSystem(system);
        cleanAfterSystemChange(removed);
      } else {
        restoreSolarSystem();
      }
      deps.clock.playing=false;
      deps.clock.direction=1;
      playBtn.textContent='▶';
      playbackClock.reset();
      updateSpeedLabel();
      const extent=system?.extentAU||sysDef.extentAU;
      deps.camera.zoom=Math.max(ZOOM_MIN,Math.min(
        BASE_ZOOM_MAX,Math.min(deps.viewport.W,deps.viewport.H)*0.4/(extent*AU_PX)
      ));
      deps.camera.panX=0; deps.camera.panY=0;
      deps.camera.viewYaw=0; deps.camera.viewTilt=DEFAULT_TILT;
      selectViewPreset('Current');
      invalidateProjection();
      updateDateUI();
      for(const id of [
        'aboutPanel','missionPanel','plannerPanel',
        'occultationPanel','impactPanel'
      ]){
        const panel=document.getElementById(id);
        if(panel && !panel.classList.contains('panel-hidden')){
          deps.panels.setPanelVisible(id,false);
        }
      }
      const bodyInsertion=document.getElementById('bodyPanel');
      if(bodyInsertion.classList.contains('show')){
        bodyInsertion.classList.remove('show');
        const addBtn=document.getElementById('addBodyBtn');
        addBtn.classList.remove('active');
        addBtn.setAttribute('aria-expanded','false');
        resetBodyInsertion();
      }
      deps.profiler.setProfilerVisible(false);
      deps.scenarios.showScenarioStatus('Loaded: '+sysDef.name+'. '+
        activeSystemBodies().length+' bodies. Space to play.');
    });
  }

  return {
    initialize,
    deleteSystemBody,
    restoreSolarSystem,
    restoreEditableSystem,
    detachSolarSystem,
    cleanAfterSystemChange,
    clearSimulationCaches,
    updateSystemDateBounds
  };
});
