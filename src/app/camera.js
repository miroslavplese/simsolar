(function(root,factory){
  const api={create:factory};
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.SimSolarCamera=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(deps){
  'use strict';

  const {document,window}=deps;
  const {viewCoordinates}=window.ViewTransform;
  const {maximumZoomForRadius}=window.BodyRendering;
  const {DEFAULT_TILT,AU_PX,SUN_RADIUS_KM,BASE_ZOOM_MAX,HARD_ZOOM_MAX,ZOOM_MIN}=deps.constants;
  const {sunReference}=deps.catalog;

  let zoom = 1;

  let followTarget = null;

  let panX = 0, panY = 0;
  let viewYaw = 0, viewTilt = DEFAULT_TILT;
  let projectionRevision = 0;
  let orbitLayerDirty = true;

  function screenToEcliptic(screenX,screenY){
    const cosTilt=Math.cos(viewTilt);
    if(Math.abs(cosTilt)<0.08) return null;
    const viewX=(screenX-deps.viewport.cx-panX)/(AU_PX*zoom);
    const viewY=(screenY-deps.viewport.cy-panY)/(AU_PX*zoom);
    const rotatedY=viewY/cosTilt;
    const cosYaw=Math.cos(viewYaw), sinYaw=Math.sin(viewYaw);
    return {
      x:viewX*cosYaw+rotatedY*sinYaw,
      y:-viewX*sinYaw+rotatedY*cosYaw,
      z:0
    };
  }

  function invalidateProjection(){
    projectionRevision++;
    orbitLayerDirty = true;
  }

  function setFollowTarget(target){
    followTarget = target||null;
    const followingSpacecraft=followTarget?.kind==='spacecraft';
    document.getElementById('followBtn').classList.toggle('active',followingSpacecraft);
    document.getElementById('followBtn').textContent=followingSpacecraft?'FOLLOWING':'FOLLOW';
    if(followTarget) selectViewPreset('Current');
  }

  function updateFollowCamera(){
    if(!followTarget) return;
    const pos=deps.simulation.positionForBody(followTarget,deps.clock.simDaysSinceJ2000);
    if(!pos) return;
    const view=viewCoordinates(pos.x,pos.y,pos.z,viewYaw,viewTilt);
    const targetPanX=-view.x*AU_PX*zoom;
    const targetPanY=-view.y*AU_PX*zoom;
    if(Math.abs(targetPanX-panX)>0.2 || Math.abs(targetPanY-panY)>0.2){
      panX=targetPanX;
      panY=targetPanY;
      invalidateProjection();
    }
  }

  function project(x,y,z){
    const view=viewCoordinates(x,y,z,viewYaw,viewTilt);
    return {
      x:deps.viewport.cx+panX+view.x*AU_PX*zoom,
      y:deps.viewport.cy+panY+view.y*AU_PX*zoom,
      depth:view.depth
    };
  }

  function activeZoomBody(){
    if(deps.simulation.isBodyActive(deps.selection.selected) && (deps.selection.selected?.radius>0 || deps.selection.selected===sunReference)){
      return deps.selection.selected;
    }
    if(deps.simulation.isBodyActive(followTarget) &&
      (followTarget?.radius>0 || followTarget===sunReference)){
      return followTarget;
    }
    return null;
  }

  function currentZoomMaximum(){
    const body=activeZoomBody();
    const radiusKm=body===sunReference ? SUN_RADIUS_KM : body?.radius;
    return maximumZoomForRadius({
      radiusKm,
      auPixels:AU_PX,
      viewportPixels:Math.max(320,Math.min(deps.viewport.W||900,deps.viewport.H||700)),
      baseMaximum:BASE_ZOOM_MAX,
      hardMaximum:HARD_ZOOM_MAX
    });
  }

  function constrainedZoom(newZoom){
    if(newZoom<=zoom) return Math.max(ZOOM_MIN,newZoom);
    return Math.min(currentZoomMaximum(),newZoom);
  }

  function applyZoom(newZoom, anchorX, anchorY){
    newZoom=constrainedZoom(newZoom);
    const preX = (anchorX - deps.viewport.cx - panX)/zoom;
    const preY = (anchorY - deps.viewport.cy - panY)/zoom;
    zoom = newZoom;
    panX = anchorX - deps.viewport.cx - preX*zoom;
    panY = anchorY - deps.viewport.cy - preY*zoom;
    selectViewPreset('Current');
    invalidateProjection();
  }

  let activeViewPreset='Current';

  function selectViewPreset(name){
    if(activeViewPreset===name){
      document.getElementById('viewPreset').value=name;
      return;
    }
    activeViewPreset=name;
    document.getElementById('viewPreset').value=name;
    deps.profiler.updateProfilerUI();
  }

  let initialized=false;
  function initialize(){
    if(initialized) return;
    initialized=true;
    document.getElementById('viewPreset').addEventListener('change',(e)=>{
      const name=e.target.value;
      if(name==='Current'){
        selectViewPreset(name);
        return;
      }
      const zoomByPreset={Inner:4.5,Outer:0.28,Deep:0.045};
      zoom=zoomByPreset[name];
      panX=0; panY=0; viewYaw=0; viewTilt=DEFAULT_TILT;
      deps.lagrange.rotatingReferenceFrame=false;
      deps.lagrange.rotatingYawOffset=0;
      deps.lagrange.updateLagrangeControls();
      if(name!=='Inner') deps.visibility.showSpacecraft=true;
      setFollowTarget(null);
      invalidateProjection();
      deps.legend.buildLegend();
      selectViewPreset(name);
    });
  }

  return {
    initialize,
    invalidateProjection,
    get viewYaw(){ return viewYaw; },
    set viewYaw(value){ viewYaw=value; },
    get viewTilt(){ return viewTilt; },
    set viewTilt(value){ viewTilt=value; },
    get orbitLayerDirty(){ return orbitLayerDirty; },
    set orbitLayerDirty(value){ orbitLayerDirty=value; },
    get zoom(){ return zoom; },
    set zoom(value){ zoom=value; },
    setFollowTarget,
    get panX(){ return panX; },
    set panX(value){ panX=value; },
    get panY(){ return panY; },
    set panY(value){ panY=value; },
    selectViewPreset,
    screenToEcliptic,
    project,
    get followTarget(){ return followTarget; },
    get projectionRevision(){ return projectionRevision; },
    updateFollowCamera,
    currentZoomMaximum,
    constrainedZoom,
    applyZoom,
    get activeViewPreset(){ return activeViewPreset; }
  };
});
