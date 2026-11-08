(function(root,factory){
  const api={create:factory};
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.SimSolarCockpit=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(deps){
  'use strict';

  const {document,window}=deps;
  const {SpacecraftView,MissionPlanner}=window;
  const {DEG}=deps.constants;
  const {setObservatoryMode}=deps.observatory;
  const {resetBodyInsertion}=deps.editor;
  const {setLagrangeVisibility,setRotatingReferenceFrame}=deps.lagrange;
  const {playBtn,updateSpeedLabel,cancelDateNavigation,updateDateUI}=deps.clock;
  const {skyCtx}=deps.viewport;
  const {drawStars}=deps.stars;
  const {invalidateProjection}=deps.camera;

  let spacecraftViewActive=false;
  let spacecraftLookYaw=0;
  let spacecraftLookPitch=0;
  let spacecraftFov=70*DEG;

  function setSpacecraftView(enabled,preserveTime=false){
    if(enabled && (!deps.planner.activePlannerRoute || !deps.planner.plannerRouteSamples.length)){
      deps.scenarios.showScenarioStatus('SOLVE AND SELECT A MISSION ROUTE FIRST',true);
      return false;
    }
    if(enabled && deps.observatory.observatoryActive) setObservatoryMode(false,true);
    spacecraftViewActive=enabled;
    deps.stars.starBackdropKey='';
    if(enabled){
      resetBodyInsertion();
      deps.panels.setPanelVisible('plannerPanel',false);
      setLagrangeVisibility(false);
      setRotatingReferenceFrame(false);
      const start=deps.planner.activePlannerRoute.waypoints[0].time;
      const end=deps.planner.activePlannerRoute.waypoints.at(-1).time;
      if(!preserveTime || deps.clock.simDaysSinceJ2000<start || deps.clock.simDaysSinceJ2000>end){
        deps.clock.simDaysSinceJ2000=start;
      }
      if(!preserveTime){
        spacecraftLookYaw=0;
        spacecraftLookPitch=0;
        deps.clock.direction=1;
        deps.clock.speedExp=Math.log10(Math.max(
          1,Math.min(120,deps.planner.activePlannerRoute.durationDays/45)
        ));
        deps.clock.playing=true;
        playBtn.textContent='⏸';
      }
      document.getElementById('speedSlider').value=String(deps.clock.speedExp);
      updateSpeedLabel();
    }
    document.getElementById('stage').classList.toggle(
      'spacecraft-view-active',enabled
    );
    const button=document.getElementById('spacecraftViewBtn');
    button.classList.toggle('active',enabled);
    button.setAttribute('aria-pressed',String(enabled));
    for(const buttonId of [
      'observatoryBtn','addBodyBtn','lagrangeBtn','rotatingFrameBtn'
    ]){
      document.getElementById(buttonId).disabled=enabled;
    }
    if(!enabled){
      deps.cockpitRenderer.spacecraftProjectedBodies=[];
      skyCtx.clearRect(0,0,deps.viewport.W,deps.viewport.H);
      drawStars(true);
      invalidateProjection();
    }
    return true;
  }

  const spacecraftProgress=document.getElementById('spacecraftProgress');
  let spacecraftProgressPointer=null;
  function seekSpacecraftProgress(clientX){
    const rect=spacecraftProgress.getBoundingClientRect();
    if(!(rect.width>0)) return;
    const time=SpacecraftView.timeAtProgress(
      deps.planner.activePlannerRoute,(clientX-rect.left)/rect.width
    );
    if(!Number.isFinite(time)) return;
    cancelDateNavigation();
    deps.clock.simDaysSinceJ2000=time;
    deps.clock.playing=false;
    playBtn.textContent='▶';
    updateDateUI();
  }

  function finishSpacecraftProgressSeek(event){
    if(event.pointerId!==spacecraftProgressPointer) return;
    spacecraftProgressPointer=null;
    if(spacecraftProgress.hasPointerCapture(event.pointerId)){
      spacecraftProgress.releasePointerCapture(event.pointerId);
    }
  }

  let initialized=false;
  function initialize(){
    if(initialized) return;
    initialized=true;
    document.getElementById('spacecraftViewBtn').addEventListener('click',()=>{
      setSpacecraftView(!spacecraftViewActive);
    });
    document.getElementById('spacecraftViewExit').addEventListener(
      'click',()=>setSpacecraftView(false)
    );
    document.getElementById('spacecraftForwardBtn').addEventListener('click',()=>{
      spacecraftLookYaw=0;
      spacecraftLookPitch=0;
    });
    spacecraftProgress.addEventListener('pointerdown',event=>{
      if(!spacecraftViewActive || !deps.planner.activePlannerRoute) return;
      spacecraftProgressPointer=event.pointerId;
      spacecraftProgress.setPointerCapture(event.pointerId);
      seekSpacecraftProgress(event.clientX);
      event.preventDefault();
    });
    spacecraftProgress.addEventListener('pointermove',event=>{
      if(event.pointerId!==spacecraftProgressPointer) return;
      seekSpacecraftProgress(event.clientX);
    });
    spacecraftProgress.addEventListener('pointerup',finishSpacecraftProgressSeek);
    spacecraftProgress.addEventListener(
      'pointercancel',finishSpacecraftProgressSeek
    );
    spacecraftProgress.addEventListener('keydown',event=>{
      const current=SpacecraftView.telemetry(
        deps.planner.activePlannerRoute,deps.planner.plannerRouteSamples,
        MissionPlanner.stateAlongSamples(
          deps.planner.plannerRouteSamples,deps.clock.simDaysSinceJ2000
        ),
        deps.clock.simDaysSinceJ2000,null
      )?.progress;
      if(!Number.isFinite(current)) return;
      const progress=event.key==='Home'
        ? 0
        : event.key==='End'
          ? 1
          : event.key==='ArrowLeft' || event.key==='ArrowDown'
            ? current-0.01
            : event.key==='ArrowRight' || event.key==='ArrowUp'
              ? current+0.01
              : null;
      if(progress===null) return;
      const time=SpacecraftView.timeAtProgress(deps.planner.activePlannerRoute,progress);
      if(Number.isFinite(time)){
        deps.clock.simDaysSinceJ2000=time;
        deps.clock.playing=false;
        playBtn.textContent='▶';
        updateDateUI();
      }
      event.preventDefault();
    });
  }

  return {
    initialize,
    get spacecraftViewActive(){ return spacecraftViewActive; },
    setSpacecraftView,
    get spacecraftFov(){ return spacecraftFov; },
    set spacecraftFov(value){ spacecraftFov=value; },
    get spacecraftLookYaw(){ return spacecraftLookYaw; },
    set spacecraftLookYaw(value){ spacecraftLookYaw=value; },
    get spacecraftLookPitch(){ return spacecraftLookPitch; },
    set spacecraftLookPitch(value){ spacecraftLookPitch=value; }
  };
});
