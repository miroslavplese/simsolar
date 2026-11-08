(function(root,factory){
  const api={create:factory};
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.SimSolarObservatory=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(deps){
  'use strict';

  const {document,window}=deps;
  const {BodySelect}=window;
  const {AU_KM}=window.TrajectoryMath;
  const {
    surfaceDefinitionForBody:observatorySurfaceDefinitionForBody,
    locationPresetsForBody:observatoryLocationPresetsForBody,
    surfaceFrame:observatorySurfaceFrame,
    horizontalCoordinates:observatoryHorizontalCoordinates,telescopeFovFromSlider,
    telescopeSliderFromFov,telescopeMagnification,normalize:normalizeObservatoryVector
  }=window.ObservatoryMode;
  const {dominantLightBody}=window.SystemModel;
  const {DEG,J2000}=deps.constants;
  const {activeSystemBodies,positionForBody}=deps.simulation;
  const {sky,scene,skyCtx}=deps.viewport;
  const {setSelectedBody}=deps.selection;
  const {
    clearObservatoryCloudRequest,syncObservatoryCloudControls,scheduleObservatoryCloudRequest
  }=deps.clouds;
  const {observatoryDirection}=deps.observatoryRenderer;
  const {resetBodyInsertion}=deps.editor;
  const {updateImpactPanel}=deps.impacts;
  const {playBtn,updateSpeedLabel}=deps.clock;
  const {drawStars}=deps.stars;
  const {invalidateProjection}=deps.camera;

  let observatoryActive=false;
  let observatoryObserver=null;
  let observatoryLatitude=51.4779;
  let observatoryLongitude=0;
  let observatoryAzimuth=180*DEG;
  let observatoryAltitude=20*DEG;
  let observatoryFov=70*DEG;
  let observatoryEnhance=true;
  let observatoryShowPaths=false;

  let observatoryTelescopeActive=false;
  let observatoryTelescopeTarget=null;
  let observatoryTelescopeTracking=true;
  let observatoryTelescopeReticle=true;
  let observatoryExposure=1;
  let observatoryWideFov=70*DEG;
  let observatoryTimeZone='UTC';
  let observatoryPreviousPlaying=true;

  function observatoryObserverBodies(){
    return activeSystemBodies().filter(body=>
      !!observatorySurfaceDefinitionForBody(body)
    );
  }

  function isEarthObservatoryBody(body){
    return body?.kind==='planet' && body.name==='Earth';
  }

  function observatorySceneBodies(){
    return activeSystemBodies().filter(body=>
      (body.kind!=='spacecraft'||deps.visibility.showSpacecraft) &&
      (body.kind!=='comet'||deps.visibility.showComets)
    );
  }

  function refreshObservatoryCatalog(){
    const select=document.getElementById('observatoryBody');
    if(!select) return;
    const observers=observatoryObserverBodies();
    const previous=observatoryObserver;
    BodySelect.populate(select,observers,{
      catalog:activeSystemBodies(),uppercase:true
    });
    if(previous && observers.includes(previous)){
      select.value=previous.name;
    } else {
      observatoryObserver=observers[0]||null;
      if(observatoryObserver){
        select.value=observatoryObserver.name;
        buildObservatoryPresets(true);
      }
    }
    document.getElementById('observatoryBtn').disabled=!observers.length;
    refreshObservatoryTelescopeTargets();
    if(observatoryTelescopeActive) syncObservatoryTelescopeControls();
  }

  function observatoryTelescopeTargets(){
    return observatorySceneBodies().filter(body=>
      body!==observatoryObserver && body.kind!=='lagrange'
    );
  }

  function refreshObservatoryTelescopeTargets(){
    const select=document.getElementById('observatoryTelescopeTarget');
    if(!select) return;
    const targets=observatoryTelescopeTargets();
    const previous=observatoryTelescopeTarget;
    BodySelect.populate(select,targets,{
      catalog:activeSystemBodies(),uppercase:true,placeholder:'NO TRACKED TARGET'
    });
    if(previous && targets.includes(previous)){
      select.value=previous.name;
      return;
    }
    observatoryTelescopeTarget=null;
    observatoryTelescopeTracking=false;
    select.value='';
  }

  function updateObservatoryExposure(){
    const filter=observatoryActive && observatoryTelescopeActive
      ? `brightness(${observatoryExposure})`
      : '';
    sky.style.filter=filter;
    scene.style.filter=filter;
    document.getElementById('observatoryExposureValue').textContent=
      observatoryExposure.toFixed(2)+'×';
  }

  function syncObservatoryTelescopeControls(){
    const panel=document.getElementById('observatoryPanel');
    panel.classList.toggle('telescope-active',observatoryTelescopeActive);
    document.getElementById('stage').classList.toggle(
      'telescope-active',observatoryActive && observatoryTelescopeActive
    );
    document.getElementById('stage').classList.toggle(
      'telescope-reticle-hidden',!observatoryTelescopeReticle
    );
    const button=document.getElementById('observatoryTelescopeBtn');
    button.classList.toggle('active',observatoryTelescopeActive);
    button.textContent=observatoryTelescopeActive
      ? 'EXIT TELESCOPE'
      : 'TELESCOPE';
    const fovDegrees=observatoryFov/DEG;
    document.getElementById('observatoryTelescopeFov').value=
      String(telescopeSliderFromFov(observatoryFov));
    document.getElementById('observatoryTelescopeFovValue').textContent=
      (fovDegrees<1?fovDegrees.toFixed(2):fovDegrees.toFixed(1))+'°';
    document.getElementById('observatoryTelescopeMagnification').textContent=
      Math.round(telescopeMagnification(observatoryFov))+'×';
    document.getElementById('observatoryTelescopeTracking').checked=
      observatoryTelescopeTracking;
    document.getElementById('observatoryTelescopeTracking').disabled=
      !observatoryTelescopeTarget;
    document.getElementById('observatoryTelescopeReticle').checked=
      observatoryTelescopeReticle;
    document.getElementById('telescopeTargetReadout').textContent=
      observatoryTelescopeTarget?.name||'Telescope';
    updateObservatoryExposure();
    deps.stars.starBackdropKey='';
  }

  function setObservatoryTelescopeTarget(body,selectBody=true){
    if(!observatoryTelescopeTargets().includes(body)) return false;
    observatoryTelescopeTarget=body;
    observatoryTelescopeTracking=true;
    document.getElementById('observatoryTelescopeTarget').value=body.name;
    if(selectBody) setSelectedBody(body,false);
    syncObservatoryTelescopeControls();
    return true;
  }

  function setObservatoryTelescopeTracking(enabled){
    observatoryTelescopeTracking=enabled && !!observatoryTelescopeTarget;
    document.getElementById('observatoryTelescopeTracking').checked=
      observatoryTelescopeTracking;
  }

  function setObservatoryTelescopeMode(enabled,preserveFov=false){
    observatoryTelescopeActive=enabled;
    if(enabled){
      if(!preserveFov){
        observatoryWideFov=observatoryFov;
        observatoryFov=2*DEG;
        observatoryTelescopeTarget=null;
        observatoryTelescopeTracking=false;
        refreshObservatoryTelescopeTargets();
      } else {
        refreshObservatoryTelescopeTargets();
      }
      observatoryTelescopeTracking=preserveFov
        ? observatoryTelescopeTracking && !!observatoryTelescopeTarget
        : !!observatoryTelescopeTarget;
    } else if(!preserveFov){
      observatoryFov=observatoryWideFov;
    }
    syncObservatoryTelescopeControls();
  }

  function captureObservatoryPhoto(){
    if(!observatoryActive || !observatoryTelescopeActive) return;
    const capture=document.createElement('canvas');
    capture.width=deps.viewport.W;
    capture.height=deps.viewport.H;
    const captureContext=capture.getContext('2d');
    captureContext.filter=`brightness(${observatoryExposure})`;
    captureContext.drawImage(sky,0,0);
    captureContext.drawImage(scene,0,0);
    captureContext.filter='none';
    const status=document.getElementById('observatoryPhotoStatus');
    status.textContent='Preparing image…';
    capture.toBlob(blob=>{
      if(!blob){
        status.textContent='Unable to create image.';
        return;
      }
      const date=new Date(J2000+deps.clock.simDaysSinceJ2000*86400000)
        .toISOString().replace(/[:]/g,'-').replace(/\.\d{3}Z$/,'Z');
      const target=(observatoryTelescopeTarget?.name||'sky')
        .replace(/[^A-Za-z0-9_-]+/g,'-');
      const link=document.createElement('a');
      link.href=URL.createObjectURL(blob);
      link.download=`simsolar-${target}-${date}.png`;
      link.click();
      setTimeout(()=>URL.revokeObjectURL(link.href),1000);
      status.textContent='PNG captured at '+deps.viewport.W+'×'+deps.viewport.H+'.';
    },'image/png');
  }

  function applyObservatoryPreset(index){
    const preset=observatoryLocationPresetsForBody(observatoryObserver)[index];
    if(!preset) return;
    observatoryLatitude=preset.latitude;
    observatoryLongitude=preset.longitude;
    observatoryTimeZone=preset.timeZone||'UTC';
    document.getElementById('observatoryLatitude').value=
      observatoryLatitude.toFixed(4);
    document.getElementById('observatoryLongitude').value=
      observatoryLongitude.toFixed(4);
    clearObservatoryCloudRequest();
  }

  function buildObservatoryPresets(selectFirst){
    const select=document.getElementById('observatoryPreset');
    select.innerHTML='';
    for(const [index,preset] of observatoryLocationPresetsForBody(
      observatoryObserver
    ).entries()){
      const option=document.createElement('option');
      option.value=String(index);
      option.textContent=preset.name.toUpperCase();
      select.appendChild(option);
    }
    const custom=document.createElement('option');
    custom.value='custom';
    custom.textContent='CUSTOM COORDINATES';
    select.appendChild(custom);
    if(selectFirst){
      const presets=observatoryLocationPresetsForBody(observatoryObserver);
      const defaultIndex=isEarthObservatoryBody(observatoryObserver)
        ? Math.max(0,presets.findIndex(preset=>preset.name==='Greenwich'))
        : 0;
      select.value=String(defaultIndex);
      applyObservatoryPreset(defaultIndex);
    }
  }

  function setObservatoryObserver(body,selectFirst=true){
    if(!observatorySurfaceDefinitionForBody(body)) return;
    if(body===observatoryObserver && !selectFirst){
      document.getElementById('observatoryBody').value=body.name;
      return;
    }
    observatoryObserver=body;
    if(!isEarthObservatoryBody(body)){
      deps.clouds.observatoryCloudsEnabled=false;
    }
    observatoryTelescopeTarget=null;
    document.getElementById('observatoryBody').value=body.name;
    buildObservatoryPresets(selectFirst);
    refreshObservatoryTelescopeTargets();
    clearObservatoryCloudRequest();
    syncObservatoryCloudControls();
    if(observatoryTelescopeActive) syncObservatoryTelescopeControls();
  }

  function aimObservatoryAtEvent(event){
    const surface=observatorySurfaceDefinitionForBody(event.observer);
    const observerCenter=positionForBody(event.observer,event.time);
    if(!surface || !observerCenter) return;
    const frame=observatorySurfaceFrame(
      surface,event.time,observatoryLatitude,observatoryLongitude
    );
    const observerPosition={
      x:observerCenter.x+frame.up.x*event.observer.radius/AU_KM,
      y:observerCenter.y+frame.up.y*event.observer.radius/AU_KM,
      z:observerCenter.z+frame.up.z*event.observer.radius/AU_KM
    };
    let direction;
    if(event.type==='alignment'){
      const stateA=positionForBody(event.bodyA,event.time);
      const stateB=positionForBody(event.bodyB,event.time);
      if(!stateA || !stateB) return;
      const directionA=normalizeObservatoryVector(
        observatoryDirection(observerPosition,stateA)
      );
      const directionB=normalizeObservatoryVector(
        observatoryDirection(observerPosition,stateB)
      );
      direction={
        x:directionA.x+directionB.x,
        y:directionA.y+directionB.y,
        z:directionA.z+directionB.z
      };
      observatoryFov=20*DEG;
    } else {
      const light=dominantLightBody(activeSystemBodies());
      const lightPosition=light && positionForBody(light,event.time);
      if(!lightPosition) return;
      direction=observatoryDirection(
        observerPosition,lightPosition
      );
      observatoryFov=12*DEG;
    }
    const coordinates=observatoryHorizontalCoordinates(direction,frame);
    observatoryAzimuth=coordinates.azimuth;
    observatoryAltitude=coordinates.altitude;
  }

  function buildObservatoryControls(){
    const select=document.getElementById('observatoryBody');
    refreshObservatoryCatalog();
    setObservatoryObserver(
      observatoryObserverBodies().find(body=>body.name==='Earth')
    );
    select.addEventListener('change',()=>{
      setObservatoryObserver(
        observatoryObserverBodies().find(body=>body.name===select.value)
      );
    });
    document.getElementById('observatoryPreset').addEventListener(
      'change',event=>{
        if(event.target.value!=='custom'){
          applyObservatoryPreset(Number(event.target.value));
        }
      }
    );
    function updateCoordinates(){
      const latitude=Number(
        document.getElementById('observatoryLatitude').value
      );
      const longitude=Number(
        document.getElementById('observatoryLongitude').value
      );
      if(!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
      observatoryLatitude=Math.max(-90,Math.min(90,latitude));
      observatoryLongitude=Math.max(-180,Math.min(180,longitude));
      observatoryTimeZone='UTC';
      document.getElementById('observatoryPreset').value='custom';
      clearObservatoryCloudRequest();
    }
    document.getElementById('observatoryLatitude').addEventListener(
      'input',updateCoordinates
    );
    document.getElementById('observatoryLongitude').addEventListener(
      'input',updateCoordinates
    );
    document.getElementById('observatoryEnhance').addEventListener(
      'change',event=>{ observatoryEnhance=event.target.checked; }
    );
    document.getElementById('observatoryPaths').addEventListener(
      'change',event=>{ observatoryShowPaths=event.target.checked; }
    );
    document.getElementById('observatoryClouds').addEventListener(
      'change',event=>{
        deps.clouds.observatoryCloudsEnabled=
          event.target.checked &&
          isEarthObservatoryBody(observatoryObserver);
        clearObservatoryCloudRequest();
        syncObservatoryCloudControls();
        if(deps.clouds.observatoryCloudsEnabled) scheduleObservatoryCloudRequest();
      }
    );
    document.getElementById('observatoryTelescopeBtn').addEventListener(
      'click',()=>setObservatoryTelescopeMode(!observatoryTelescopeActive)
    );
    document.getElementById('observatoryTelescopeTarget').addEventListener(
      'change',event=>{
        if(!event.target.value){
          observatoryTelescopeTarget=null;
          setObservatoryTelescopeTracking(false);
          syncObservatoryTelescopeControls();
          return;
        }
        const body=observatoryTelescopeTargets().find(
          candidate=>candidate.name===event.target.value
        );
        if(body) setObservatoryTelescopeTarget(body);
      }
    );
    document.getElementById('observatoryTelescopeTracking').addEventListener(
      'change',event=>setObservatoryTelescopeTracking(event.target.checked)
    );
    document.getElementById('observatoryTelescopeReticle').addEventListener(
      'change',event=>{
        observatoryTelescopeReticle=event.target.checked;
        syncObservatoryTelescopeControls();
      }
    );
    document.getElementById('observatoryTelescopeFov').addEventListener(
      'input',event=>{
        observatoryFov=telescopeFovFromSlider(Number(event.target.value));
        syncObservatoryTelescopeControls();
      }
    );
    document.getElementById('observatoryExposure').addEventListener(
      'input',event=>{
        observatoryExposure=Math.max(
          0.5,Math.min(3,Number(event.target.value)||1)
        );
        updateObservatoryExposure();
      }
    );
    document.getElementById('observatoryCaptureBtn').addEventListener(
      'click',captureObservatoryPhoto
    );
    syncObservatoryTelescopeControls();
  }

  function setObservatoryMode(enabled,preservePlayback=false){
    if(enabled && deps.cockpit.spacecraftViewActive) deps.cockpit.setSpacecraftView(false);
    const wasActive=observatoryActive;
    if(enabled && !wasActive) observatoryPreviousPlaying=deps.clock.playing;
    observatoryActive=enabled;
    deps.stars.starBackdropKey='';
    if(enabled){
      resetBodyInsertion();
      if(deps.impacts.activeImpact){
        deps.impacts.ignoredImpactKey=deps.impacts.activeImpact.key;
        deps.impacts.activeImpact=null;
        updateImpactPanel();
      }

      if(!preservePlayback){
        deps.clock.playing=true;
        playBtn.textContent='⏸';
      }
      const selectedObserver=observatoryObserverBodies().find(
        body=>body===deps.selection.selected
      );
      if(selectedObserver && selectedObserver!==observatoryObserver){
        setObservatoryObserver(selectedObserver);
      }
    }
    document.getElementById('stage').classList.toggle(
      'observatory-active',enabled
    );
    document.getElementById('observatoryPanel').classList.toggle(
      'panel-hidden',!enabled
    );
    const button=document.getElementById('observatoryBtn');
    button.classList.toggle('active',enabled);
    button.setAttribute('aria-pressed',String(enabled));
    for(const buttonId of ['legendBtn','missionBtn','plannerBtn','addBodyBtn']){
      document.getElementById(buttonId).disabled=enabled;
    }
    const slider=document.getElementById('speedSlider');
    if(enabled){
      slider.min='0';
      slider.max='3.6';
      slider.step='0.01';
      slider.value=String(deps.clock.observatorySpeedExp);
    } else {
      slider.min='-2';
      slider.max='4.2';
      slider.step='0.01';
      slider.value=String(deps.clock.speedExp);
    }
    updateSpeedLabel();
    if(!enabled){
      if(observatoryTelescopeActive){
        setObservatoryTelescopeMode(false);
      }
      deps.clock.playing=observatoryPreviousPlaying;
      playBtn.textContent=deps.clock.playing?'⏸':'▶';
      skyCtx.clearRect(0,0,deps.viewport.W,deps.viewport.H);
      drawStars(true);
      invalidateProjection();
    } else {
      syncObservatoryTelescopeControls();
      syncObservatoryCloudControls();
    }
  }

  let initialized=false;
  function initialize(){
    if(initialized) return;
    initialized=true;
    document.getElementById('observatoryBtn').addEventListener('click',()=>{
      setObservatoryMode(!observatoryActive);
    });
    document.getElementById('observatoryClose').addEventListener(
      'click',()=>setObservatoryMode(false)
    );
  }

  return {
    initialize,
    get observatoryActive(){ return observatoryActive; },
    get observatoryObserver(){ return observatoryObserver; },
    get observatoryLatitude(){ return observatoryLatitude; },
    set observatoryLatitude(value){ observatoryLatitude=value; },
    get observatoryLongitude(){ return observatoryLongitude; },
    set observatoryLongitude(value){ observatoryLongitude=value; },
    setObservatoryObserver,
    setObservatoryMode,
    aimObservatoryAtEvent,
    get observatoryEnhance(){ return observatoryEnhance; },
    set observatoryEnhance(value){ observatoryEnhance=value; },
    get observatoryFov(){ return observatoryFov; },
    set observatoryFov(value){ observatoryFov=value; },
    isEarthObservatoryBody,
    get observatoryAzimuth(){ return observatoryAzimuth; },
    set observatoryAzimuth(value){ observatoryAzimuth=value; },
    get observatoryAltitude(){ return observatoryAltitude; },
    set observatoryAltitude(value){ observatoryAltitude=value; },
    observatorySceneBodies,
    get observatoryTelescopeActive(){ return observatoryTelescopeActive; },
    get observatoryTelescopeTracking(){ return observatoryTelescopeTracking; },
    set observatoryTelescopeTracking(value){ observatoryTelescopeTracking=value; },
    get observatoryTelescopeTarget(){ return observatoryTelescopeTarget; },
    set observatoryTelescopeTarget(value){ observatoryTelescopeTarget=value; },
    setObservatoryTelescopeTracking,
    get observatoryShowPaths(){ return observatoryShowPaths; },
    set observatoryShowPaths(value){ observatoryShowPaths=value; },
    get observatoryTimeZone(){ return observatoryTimeZone; },
    set observatoryTimeZone(value){ observatoryTimeZone=value; },
    refreshObservatoryTelescopeTargets,
    refreshObservatoryCatalog,
    syncObservatoryTelescopeControls,
    setObservatoryTelescopeTarget,
    get observatoryTelescopeReticle(){ return observatoryTelescopeReticle; },
    set observatoryTelescopeReticle(value){ observatoryTelescopeReticle=value; },
    get observatoryExposure(){ return observatoryExposure; },
    set observatoryExposure(value){ observatoryExposure=value; },
    get observatoryWideFov(){ return observatoryWideFov; },
    set observatoryWideFov(value){ observatoryWideFov=value; },
    observatoryObserverBodies,
    observatoryTelescopeTargets,
    setObservatoryTelescopeMode,
    buildObservatoryControls
  };
});
