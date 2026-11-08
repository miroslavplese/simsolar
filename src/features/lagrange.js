(function(root,factory){
  const api={create:factory};
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.SimSolarLagrange=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(deps){
  'use strict';

  const {document,window}=deps;
  const {AU_KM}=window.TrajectoryMath;
  const {lagrangePoints:calculateLagrangePoints,rotatingFrameYaw}=window.LagrangeSystem;
  const {GM_BY_BODY,MOON_GM_BY_BODY,massKgToMu}=window.NBodySimulation;
  const {dominantLightBody}=window.SystemModel;
  const {isBodyActive,activeSystemBodies,positionForBody,moonInitial}=deps.simulation;
  const {charon,planets,sunReference}=deps.catalog;
  const {ZOOM_MIN,BASE_ZOOM_MAX,AU_PX}=deps.constants;
  const {setFollowTarget,selectViewPreset,invalidateProjection}=deps.camera;

  let showLagrangePoints=false;
  let rotatingReferenceFrame=false;
  let rotatingYawOffset=0;
  let activeLagrangeSystem=null;
  const lagrangeSystemCache=new Map();

  function lagrangeSystemForBody(body){
    if(!body || !isBodyActive(body)) return null;
    if(body.kind==='lagrange') return body.system;
    let primary;
    if(body.kind==='moon'){
      primary=body.parent;
    } else if(body===charon){
      primary=planets.find(candidate=>candidate.name==='Pluto');
    } else if(body.kind==='planet' || body.kind==='custom'){
      primary=dominantLightBody(activeSystemBodies());
      if(!primary || primary===body) return null;
    } else {
      return null;
    }
    if(body.kind==='custom'){
      const customMu=body.mu||massKgToMu(body.massKg);
      const primaryMu=lagrangeBodyMu(primary);
      const ratio=Math.min(customMu,primaryMu)/(customMu+primaryMu);
      if(ratio<1e-28) return null;
    }
    const key=primary.id+'|'+body.id;
    if(!lagrangeSystemCache.has(key)){
      const system={key,primary,secondary:body,points:[]};
      system.points=['L1','L2','L3','L4','L5'].map(name=>({
        kind:'lagrange',
        category:'Lagrange point',
        name,
        color:name==='L4'||name==='L5'?'#72e6c1':'#66c7ff',
        system
      }));
      lagrangeSystemCache.set(key,system);
    }
    return lagrangeSystemCache.get(key);
  }

  function lagrangeBodyState(body,tDays){
    if(body===sunReference && !deps.simulation.editableSystem){
      return {x:0,y:0,z:0,vx:0,vy:0,vz:0};
    }
    return positionForBody(body,tDays);
  }

  function lagrangeBodyMu(body,system){
    if(body===sunReference) return body.mu||GM_BY_BODY.Sun;
    if(body.kind==='custom') return body.mu||massKgToMu(body.massKg);
    if(body.kind==='moon'){
      return MOON_GM_BY_BODY[body.name];
    }
    if(system?.secondary?.kind==='moon' && body===system.primary){
      return moonInitial.state.systems.find(
        item=>item.parentName===body.name
      ).parentMu;
    }
    return GM_BY_BODY[body.name];
  }

  function calculatedLagrangeStates(system,tDays){
    const primary=lagrangeBodyState(system.primary,tDays);
    const secondary=lagrangeBodyState(system.secondary,tDays);
    if(!primary || !secondary) return null;
    return calculateLagrangePoints(
      primary,secondary,
      lagrangeBodyMu(system.primary,system),
      lagrangeBodyMu(system.secondary,system)
    );
  }

  function lagrangePositionForBody(point,tDays){
    const states=calculatedLagrangeStates(point.system,tDays);
    const state=states?.find(candidate=>candidate.name===point.name);
    if(!state) return null;
    return {
      ...state,
      r:Math.hypot(state.x,state.y,state.z),
      speedKmS:Math.hypot(state.vx,state.vy,state.vz)*AU_KM/86400,
      calculated:true
    };
  }

  function updateLagrangeControls(){
    const eligible=lagrangeSystemForBody(deps.selection.selected);
    const lagrangeButton=document.getElementById('lagrangeBtn');
    const rotatingButton=document.getElementById('rotatingFrameBtn');
    lagrangeButton.disabled=!eligible;
    lagrangeButton.classList.toggle('active',showLagrangePoints&&!!activeLagrangeSystem);
    lagrangeButton.setAttribute(
      'aria-pressed',String(showLagrangePoints&&!!activeLagrangeSystem)
    );
    rotatingButton.disabled=!activeLagrangeSystem;
    rotatingButton.classList.toggle('active',rotatingReferenceFrame);
    rotatingButton.setAttribute('aria-pressed',String(rotatingReferenceFrame));
  }

  function autoFitLagrangeSystem(system){
    const primary=lagrangeBodyState(system.primary,deps.clock.simDaysSinceJ2000);
    const secondary=lagrangeBodyState(system.secondary,deps.clock.simDaysSinceJ2000);
    if(!primary || !secondary) return;
    const separation=Math.hypot(
      secondary.x-primary.x,secondary.y-primary.y,secondary.z-primary.z
    );
    const viewport=Math.max(320,Math.min(deps.viewport.W||900,deps.viewport.H||700));
    deps.camera.zoom=Math.max(
      ZOOM_MIN,Math.min(BASE_ZOOM_MAX,viewport/(AU_PX*5*separation))
    );
    deps.camera.panX=0;
    deps.camera.panY=0;
    setFollowTarget(system.secondary);
    selectViewPreset('Current');
    invalidateProjection();
  }

  function setLagrangeVisibility(visible){
    const system=lagrangeSystemForBody(deps.selection.selected);
    if(visible && !system) return;
    showLagrangePoints=visible;
    activeLagrangeSystem=visible ? system : null;
    if(!visible){
      rotatingReferenceFrame=false;
      rotatingYawOffset=0;
      if(deps.selection.selected?.kind==='lagrange') deps.selection.setSelectedBody(system?.secondary||null);
    } else {
      autoFitLagrangeSystem(system);
    }
    updateLagrangeControls();
    invalidateProjection();
    deps.legend.buildLegend();
  }

  function setRotatingReferenceFrame(enabled){
    if(enabled && !activeLagrangeSystem) return;
    rotatingReferenceFrame=enabled;
    rotatingYawOffset=0;
    updateLagrangeControls();
    invalidateProjection();
  }

  function rotatingBaseYaw(){
    if(!activeLagrangeSystem) return null;
    const primary=lagrangeBodyState(
      activeLagrangeSystem.primary,deps.clock.simDaysSinceJ2000
    );
    const secondary=lagrangeBodyState(
      activeLagrangeSystem.secondary,deps.clock.simDaysSinceJ2000
    );
    if(!primary || !secondary) return null;
    return rotatingFrameYaw(primary,secondary,deps.camera.viewTilt);
  }

  function updateRotatingReferenceFrame(){
    if(!rotatingReferenceFrame) return;
    const baseYaw=rotatingBaseYaw();
    if(baseYaw===null) return;
    const nextYaw=baseYaw+rotatingYawOffset;
    if(Math.abs(nextYaw-deps.camera.viewYaw)>1e-8){
      deps.camera.viewYaw=nextYaw;
      invalidateProjection();
    }
  }

  let initialized=false;
  function initialize(){
    if(initialized) return;
    initialized=true;
    document.getElementById('lagrangeBtn').addEventListener('click',()=>{
      setLagrangeVisibility(!showLagrangePoints);
      deps.legend.buildLegend();
    });
    document.getElementById('rotatingFrameBtn').addEventListener('click',()=>{
      setRotatingReferenceFrame(!rotatingReferenceFrame);
    });
  }

  return {
    initialize,
    lagrangePositionForBody,
    setLagrangeVisibility,
    setRotatingReferenceFrame,
    get showLagrangePoints(){ return showLagrangePoints; },
    set showLagrangePoints(value){ showLagrangePoints=value; },
    get activeLagrangeSystem(){ return activeLagrangeSystem; },
    set activeLagrangeSystem(value){ activeLagrangeSystem=value; },
    get rotatingReferenceFrame(){ return rotatingReferenceFrame; },
    set rotatingReferenceFrame(value){ rotatingReferenceFrame=value; },
    lagrangeBodyState,
    calculatedLagrangeStates,
    updateRotatingReferenceFrame,
    clearCache(){ lagrangeSystemCache.clear(); },
    updateLagrangeControls,
    lagrangeSystemForBody,
    get rotatingYawOffset(){ return rotatingYawOffset; },
    set rotatingYawOffset(value){ rotatingYawOffset=value; },
    rotatingBaseYaw
  };
});
