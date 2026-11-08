(function(root,factory){
  const api={create:factory};
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.SimSolarSelection=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(deps){
  'use strict';

  const {document,window}=deps;
  const {BodyInfo}=window;
  const {zoomForDistance}=window.MissionTimeline;
  const {zoomForPhysicalRadius}=window.BodyRendering;
  const {focusZoom:moonSystemFocusZoom}=window.MoonSystem;
  const {MASS_KG}=window.NBodySimulation;
  const {BODY_PRESETS}=deps.editor;
  const {HYBRID_EPOCH_DATE,builtInBodies,sunReference,charon,moonVisibilityDefinitions}=deps.catalog;
  const {positionForBody,editableOrbitReference,isBodyActive}=deps.simulation;
  const {SUN_RADIUS_KM,AU_PX,BASE_ZOOM_MAX}=deps.constants;
  const {setFollowTarget,updateFollowCamera,invalidateProjection,currentZoomMaximum}=deps.camera;
  const {lagrangeSystemForBody,updateLagrangeControls}=deps.lagrange;
  const {syncMissionToSpacecraft}=deps.timeline;
  const {activeOccultationObservers}=deps.occultations;
  const {buildLegend}=deps.legend;

  let selected = null;
  let hovered = null;

  const bodyInfo=BodyInfo.create({
    document,catalog:window.OBJECT_IMAGES,massByName:MASS_KG,
    bodyPresets:BODY_PRESETS,hybridEpochDate:HYBRID_EPOCH_DATE,
    onClose:()=>setSelectedBody(null)
  });
  function updateCard(){
    const position=positionForBody(selected,deps.clock.simDaysSinceJ2000);
    const osculating=!!deps.simulation.editableSystem && !builtInBodies.includes(selected) &&
      ['star','planet','moon'].includes(selected.kind) && !!position;
    bodyInfo.update(selected,{
      position,editable:!!deps.simulation.editableSystem,osculating,
      orbitReference:osculating
        ? editableOrbitReference(selected,deps.clock.simDaysSinceJ2000) : null,
      radiusKm:selected===sunReference ? SUN_RADIUS_KM :
        ['planet','moon','custom','star'].includes(selected.kind) ? selected.radius : null
    });
  }

  function setSelectedBody(body,syncMission=true){
    if(body?.kind!=='lagrange' && body && !isBodyActive(body)) body=null;
    const previous=selected;
    selected=body;
    if(body?.kind==='lagrange'){
      deps.lagrange.activeLagrangeSystem=body.system;
      deps.lagrange.showLagrangePoints=true;
      setFollowTarget(body.system.secondary);
    } else {
      const previousSystem=deps.lagrange.activeLagrangeSystem;
      const system=deps.lagrange.showLagrangePoints ? lagrangeSystemForBody(body) : null;
      deps.lagrange.activeLagrangeSystem=system;
      if(system?.key!==previousSystem?.key) deps.lagrange.rotatingYawOffset=0;
      if(!system){
        deps.lagrange.showLagrangePoints=false;
        deps.lagrange.rotatingReferenceFrame=false;
        deps.lagrange.rotatingYawOffset=0;
      }
      if(!body || (deps.camera.followTarget===previous && deps.camera.followTarget!==body)){
        setFollowTarget(null);
      }
    }
    if(body?.kind==='spacecraft'){
      if(syncMission) syncMissionToSpacecraft(body);
      deps.panels.setPanelVisible('missionPanel',true);
    } else if(previous?.kind==='spacecraft'){
      deps.panels.setPanelVisible('missionPanel',false);
    }
    updateLagrangeControls();
    if(
      activeOccultationObservers().includes(body) &&
      !document.getElementById('occultationPanel').classList.contains('panel-hidden')
    ){
      const observerSelect=document.getElementById('occultationObserver');
      if(observerSelect.value!==body.name){
        observerSelect.value=body.name;
        observerSelect.dispatchEvent(new Event('change'));
      }
    }
    buildLegend();
    deps.camera.orbitLayerDirty=true;
    bodyInfo.setVisible(!!selected);
  }
  function toggleBodySelection(body){
    if(selected===body){
      setSelectedBody(null);
      return;
    }
    setSelectedBody(body);
    if(deps.cockpit.spacecraftViewActive || deps.observatory.observatoryActive) return;
    setFollowTarget(
      body.kind==='lagrange' ? body.system.secondary : body
    );
    updateFollowCamera();
    invalidateProjection();
  }
  function toggleLegendBodySelection(body){
    if(selected===body){
      setSelectedBody(null);
      return;
    }
    setSelectedBody(body);
    if(body.kind==='lagrange'){
      setFollowTarget(body.system.secondary);
      updateFollowCamera();
      invalidateProjection();
      return;
    }
    const pos=positionForBody(body,deps.clock.simDaysSinceJ2000);
    if(pos){
      const parentName=body.kind==='moon'
        ? body.parentName
        : body===charon ? 'Pluto' : body.name;
      const systemZoom=moonSystemFocusZoom(
        moonVisibilityDefinitions,parentName,AU_PX,70,BASE_ZOOM_MAX
      );
      deps.camera.zoom=systemZoom||
        (body.kind==='planet'
          ? zoomForPhysicalRadius(body.radius,AU_PX,70,currentZoomMaximum())
          : null)||
        zoomForDistance(Math.hypot(pos.x,pos.y,pos.z));
      deps.camera.panX=0;
      deps.camera.panY=0;
    }
    setFollowTarget(body);
    updateFollowCamera();
    invalidateProjection();
    buildLegend();
  }

  return {
    setSelectedBody,
    get selected(){ return selected; },
    get hovered(){ return hovered; },
    set hovered(value){ hovered=value; },
    updateCard,
    toggleLegendBodySelection,
    toggleBodySelection,
    bodyInfo
  };
});
