(function(root,factory){
  const api={create:factory};
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.SimSolarOccultations=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(deps){
  'use strict';

  const {document,window}=deps;
  const {BodySelect}=window;
  const {AU_KM,sampledStateAt}=window.TrajectoryMath;
  const {apparentOccultation,apparentSeparation,goldenMinimum}=window.OccultationSystem;
  const {
    surfaceDefinitionForBody:observatorySurfaceDefinitionForBody,
    surfaceFrame:observatorySurfaceFrame,altitudeForDirection:observatoryAltitudeForDirection
  }=window.ObservatoryMode;
  const {dominantLightBody}=window.SystemModel;
  const {planets,charon,moons,HYBRID_EPOCH_DAYS}=deps.catalog;
  const {
    isBodyActive,activeBodiesOf,referencePositionForBody:positionForBody,activeSystemBodies,hybridBranchAt,
    HYBRID_MAX_DAYS
  }=deps.simulation;
  const {observatoryBodyRadiusAu,observatoryDirection}=deps.observatoryRenderer;
  const {DEG,J2000}=deps.constants;
  const {cancelDateNavigation,playBtn}=deps.clock;

  const occultationObservers=[
    ...planets.filter(body=>body!==charon),
    ...moons,
    charon
  ];
  function activeOccultationObservers(){
    return occultationObservers.filter(isBodyActive);
  }
  let activeOccultationEvent=null;
  let occultationSearchRevision=0;

  function occultationCandidateBodies(observer){
    const bodies=activeBodiesOf([
      ...planets.filter(body=>body!==charon),
      ...moons,
      charon
    ]);
    const observerOrbit=observer.kind==='moon'
      ? observer.parent.a
      : observer===charon
        ? planets.find(body=>body.name==='Pluto').a
        : observer.a;
    return bodies.filter(candidate=>{
      if(candidate===observer || !(candidate.radius>0)) return false;
      const candidateParent=candidate.kind==='moon'
        ? candidate.parent
        : candidate===charon
          ? planets.find(body=>body.name==='Pluto')
          : candidate;
      const observerParent=observer.kind==='moon'
        ? observer.parent
        : observer===charon
          ? planets.find(body=>body.name==='Pluto')
          : observer;
      const local=candidateParent===observerParent ||
        candidate===observerParent ||
        candidate.parent===observer;
      return local || candidateParent.a<observerOrbit*0.999;
    });
  }

  function isLocalOcculter(observer,occulter){
    const observerParent=observer.kind==='moon'
      ? observer.parent
      : observer===charon
        ? planets.find(body=>body.name==='Pluto')
        : observer;
    const occulterParent=occulter.kind==='moon'
      ? occulter.parent
      : occulter===charon
        ? planets.find(body=>body.name==='Pluto')
        : occulter;
    return occulter===observerParent ||
      occulterParent===observerParent ||
      occulter.parent===observer;
  }

  function eventObserverState(observer,tDays){
    const center=occultationSearchPositionForBody(observer,tDays);
    const surface=observatorySurfaceDefinitionForBody(observer);
    if(!center || !surface || observer!==deps.observatory.observatoryObserver) return center;
    const frame=observatorySurfaceFrame(
      surface,tDays,deps.observatory.observatoryLatitude,deps.observatory.observatoryLongitude
    );
    return {
      x:center.x+frame.up.x*observer.radius/AU_KM,
      y:center.y+frame.up.y*observer.radius/AU_KM,
      z:center.z+frame.up.z*observer.radius/AU_KM,
      surfaceFrame:frame
    };
  }

  function occultationGeometryAt(observer,occulter,tDays){
    const local=isLocalOcculter(observer,occulter);
    const observerState=eventObserverState(observer,tDays);
    const occulterState=local
      ? positionForBody(occulter,tDays)
      : occultationSearchPositionForBody(occulter,tDays);
    const light=dominantLightBody(activeSystemBodies());
    const lightState=light && positionForBody(light,tDays);
    if(!observerState || !occulterState || !lightState){
      return {visible:false,clearance:Infinity,coverage:0};
    }
    const geometry=apparentOccultation(
      observerState,lightState,occulterState,
      observatoryBodyRadiusAu(light),occulter.radius/AU_KM
    );
    if(observerState.surfaceFrame){
      const sunAltitude=observatoryAltitudeForDirection(
        observatoryDirection(observerState,lightState),
        observerState.surfaceFrame
      );
      geometry.sunAltitude=sunAltitude;
      geometry.visible=geometry.visible &&
        sunAltitude>=-geometry.sourceAngularRadius;
    }
    return geometry;
  }

  function occultationSearchPositionForBody(body,tDays){
    if(deps.simulation.editableSystem) return positionForBody(body,tDays);
    if(body._ephemerisPoints){
      const sampled=sampledStateAt(body._ephemerisPoints,tDays);
      if(sampled) return sampled;
    }
    if(tDays<HYBRID_EPOCH_DAYS || body.kind==='moon'){
      return positionForBody(body,tDays);
    }
    const branch=hybridBranchAt(tDays);
    const massive=branch.simulator.massiveStateAt(tDays);
    const target=massive.find(candidate=>candidate.name===body.name);
    const sun=massive.find(candidate=>candidate.name==='Sun');
    if(!target || !sun) return positionForBody(body,tDays);
    return {
      x:target.x-sun.x,y:target.y-sun.y,z:target.z-sun.z,
      vx:target.vx-sun.vx,vy:target.vy-sun.vy,vz:target.vz-sun.vz
    };
  }

  function occultationEventLabel(observer,occulter,geometry){
    if(!isLocalOcculter(observer,occulter)){
      return geometry.geometry==='total'
        ? 'Solar occultation'
        : occulter.name+' transit';
    }
    if(geometry.geometry==='total') return 'Total solar eclipse';
    if(geometry.geometry==='contained') return 'Annular solar eclipse';
    return 'Partial solar eclipse';
  }

  function candidateSearchSettings(observer,candidate,maxDistance){
    const local=isLocalOcculter(observer,candidate);
    const candidatePeriod=candidate.displayPeriod||candidate.period||365.25;
    const observerPeriod=observer.kind==='moon'||observer===charon
      ? observer.displayPeriod||observer.period
      : Infinity;
    const period=Math.min(candidatePeriod,observerPeriod);
    const span=Math.min(
      maxDistance,
      local ? Math.max(120,Math.min(800,period*24)) : 365.25*20
    );
    return {
      span,
      step:local
        ? Math.max(0.01,Math.min(0.25,period/12))
        : 1
    };
  }

  async function searchCandidateOccultation(
    observer,candidate,direction,maxDistance,revision
  ){
    const settings=candidateSearchSettings(observer,candidate,maxDistance);
    const evaluate=time=>occultationGeometryAt(observer,candidate,time);
    const start=deps.clock.simDaysSinceJ2000+direction*1e-4;
    const limit=Math.max(
      -200*365.25,
      Math.min(HYBRID_MAX_DAYS,start+direction*settings.span)
    );
    const sampleStart=start-direction*settings.step;
    const sampleLimit=limit+direction*settings.step;
    const samples=[];
    let sampleCount=0;
    for(
      let time=sampleStart;
      direction>0 ? time<=sampleLimit : time>=sampleLimit;
      time+=direction*settings.step
    ){
      if(revision!==occultationSearchRevision) return null;
      samples.push({time,geometry:evaluate(time)});
      if(samples.length>3) samples.shift();
      if(samples.length===3){
        const [before,current,after]=samples;
        if(
          current.geometry.clearance<=before.geometry.clearance &&
          current.geometry.clearance<=after.geometry.clearance
        ){
          const minimum=goldenMinimum(
            evaluate,
            Math.min(before.time,after.time),
            Math.max(before.time,after.time),
            34
          );
          const directedDistance=
            direction*(minimum.time-deps.clock.simDaysSinceJ2000);
          if(
            minimum.geometry.visible &&
            directedDistance>1e-4 &&
            directedDistance<=settings.span
          ){
            return {
              time:minimum.time,
              observer,occulter:candidate,
              geometry:minimum.geometry,
              label:occultationEventLabel(
                observer,candidate,minimum.geometry
              )
            };
          }
        }
      }
      if(++sampleCount%180===0){
        await new Promise(resolve=>setTimeout(resolve,0));
      }
    }
    return null;
  }

  function alignmentGeometryAt(observer,bodyA,bodyB,tDays){
    const observerState=eventObserverState(observer,tDays);
    const stateA=occultationSearchPositionForBody(bodyA,tDays);
    const stateB=occultationSearchPositionForBody(bodyB,tDays);
    if(!observerState || !stateA || !stateB){
      return {visible:false,clearance:Infinity,separation:Infinity};
    }
    const separation=apparentSeparation(observerState,stateA,stateB);
    let aboveHorizon=true;
    if(observerState.surfaceFrame){
      aboveHorizon=
        observatoryAltitudeForDirection({
          x:stateA.x-observerState.x,
          y:stateA.y-observerState.y,
          z:stateA.z-observerState.z
        },observerState.surfaceFrame)>0 &&
        observatoryAltitudeForDirection({
          x:stateB.x-observerState.x,
          y:stateB.y-observerState.y,
          z:stateB.z-observerState.z
        },observerState.surfaceFrame)>0;
    }
    return {
      visible:separation<=DEG && aboveHorizon,
      clearance:separation-DEG,
      separation
    };
  }

  async function searchPlanetAlignment(
    observer,bodyA,bodyB,direction,maxDistance,revision
  ){
    const evaluate=time=>alignmentGeometryAt(
      observer,bodyA,bodyB,time
    );
    const start=deps.clock.simDaysSinceJ2000+direction*1e-4;
    const span=Math.min(maxDistance,365.25*20);
    const limit=Math.max(
      -200*365.25,
      Math.min(HYBRID_MAX_DAYS,start+direction*span)
    );
    const sampleStart=start-direction;
    const sampleLimit=limit+direction;
    const samples=[];
    let sampleCount=0;
    for(
      let time=sampleStart;
      direction>0 ? time<=sampleLimit : time>=sampleLimit;
      time+=direction
    ){
      if(revision!==occultationSearchRevision) return null;
      samples.push({time,geometry:evaluate(time)});
      if(samples.length>3) samples.shift();
      if(samples.length===3){
        const [before,current,after]=samples;
        if(
          current.geometry.clearance<=before.geometry.clearance &&
          current.geometry.clearance<=after.geometry.clearance
        ){
          const minimum=goldenMinimum(
            evaluate,
            Math.min(before.time,after.time),
            Math.max(before.time,after.time),
            34
          );
          const directedDistance=
            direction*(minimum.time-deps.clock.simDaysSinceJ2000);
          if(
            minimum.geometry.visible &&
            directedDistance>1e-4 &&
            directedDistance<=span
          ){
            return {
              type:'alignment',
              time:minimum.time,
              observer,bodyA,bodyB,
              geometry:minimum.geometry,
              label:bodyA.name+'–'+bodyB.name+' conjunction'
            };
          }
        }
      }
      if(++sampleCount%180===0){
        await new Promise(resolve=>setTimeout(resolve,0));
      }
    }
    return null;
  }

  async function findPlanetAlignment(
    observer,direction,revision,status,maxDistance=365.25*20
  ){
    const alignmentBodies=planets.filter(
      body=>body!==charon && body!==observer
    );
    const pairs=[];
    for(let index=0;index<alignmentBodies.length;index++){
      for(let other=index+1;other<alignmentBodies.length;other++){
        pairs.push([alignmentBodies[index],alignmentBodies[other]]);
      }
    }
    let nearest=null;
    for(let index=0;index<pairs.length;index++){
      if(revision!==occultationSearchRevision) return null;
      const [bodyA,bodyB]=pairs[index];
      status.textContent='Searching '+bodyA.name+'–'+bodyB.name+'… '+
        Math.round(index/pairs.length*100)+'%';
      const pairMaxDistance=nearest
        ? Math.min(
          maxDistance,Math.abs(nearest.time-deps.clock.simDaysSinceJ2000)
        )
        : maxDistance;
      const event=await searchPlanetAlignment(
        observer,bodyA,bodyB,direction,pairMaxDistance,revision
      );
      if(
        event &&
        (!nearest ||
          Math.abs(event.time-deps.clock.simDaysSinceJ2000)<
          Math.abs(nearest.time-deps.clock.simDaysSinceJ2000))
      ) nearest=event;
    }
    return nearest;
  }

  async function findOccultation(direction){
    const observerName=document.getElementById('occultationObserver').value;
    const observer=activeOccultationObservers().find(
      body=>body.name===observerName
    );
    if(!observer) return;
    const revision=++occultationSearchRevision;
    const status=document.getElementById('occultationStatus');
    const buttons=[
      document.getElementById('previousOccultationBtn'),
      document.getElementById('nextOccultationBtn')
    ];
    buttons.forEach(button=>button.disabled=true);
    const candidates=occultationCandidateBodies(observer).sort((a,b)=>
      Number(!isLocalOcculter(observer,a))-Number(!isLocalOcculter(observer,b))
    ).filter(candidate=>{
      const type=document.getElementById('occultationType').value;
      return type==='all' ||
        (type==='eclipse')===isLocalOcculter(observer,candidate);
    });
    let nearest=null;
    try{
      const eventType=document.getElementById('occultationType').value;
      if(eventType==='alignment'){
        nearest=await findPlanetAlignment(
          observer,direction,revision,status
        );
      } else {
        for(let index=0;index<candidates.length;index++){
          if(revision!==occultationSearchRevision) return;
          const candidate=candidates[index];
          status.textContent='Searching '+candidate.name+'… '+
            Math.round(index/candidates.length*100)+'%';
          const maxDistance=nearest
            ? Math.abs(nearest.time-deps.clock.simDaysSinceJ2000)
            : 365.25*20;
          const event=await searchCandidateOccultation(
            observer,candidate,direction,maxDistance,revision
          );
          if(
            event &&
            (!nearest ||
              Math.abs(event.time-deps.clock.simDaysSinceJ2000)<
              Math.abs(nearest.time-deps.clock.simDaysSinceJ2000))
          ) nearest=event;
        }
        if(eventType==='all'){
          const alignment=await findPlanetAlignment(
            observer,direction,revision,status,
            nearest
              ? Math.abs(nearest.time-deps.clock.simDaysSinceJ2000)
              : 365.25*20
          );
          if(
            alignment &&
            (!nearest ||
              Math.abs(alignment.time-deps.clock.simDaysSinceJ2000)<
              Math.abs(nearest.time-deps.clock.simDaysSinceJ2000))
          ) nearest=alignment;
        }
      }
    } catch(error){
      if(revision===occultationSearchRevision){
        status.textContent='Event search failed: '+error.message;
      }
      console.error(error);
      return;
    } finally {
      if(revision===occultationSearchRevision){
        buttons.forEach(button=>button.disabled=false);
      }
    }
    if(revision!==occultationSearchRevision) return;
    if(!nearest){
      const startDate=new Date(
        J2000+deps.clock.simDaysSinceJ2000*86400000
      ).toISOString().slice(0,10);
      const endDays=Math.max(
        -200*365.25,
        Math.min(
          HYBRID_MAX_DAYS,
          deps.clock.simDaysSinceJ2000+direction*365.25*20
        )
      );
      const endDate=new Date(J2000+endDays*86400000)
        .toISOString().slice(0,10);
      status.textContent='No selected event visible from '+observer.name+
        ' between '+(direction>0?startDate:endDate)+' and '+
        (direction>0?endDate:startDate)+'.';
      return;
    }
    await goToOccultationEvent(nearest);
  }

  function formatOccultationDate(tDays){
    return new Date(J2000+tDays*86400000).toISOString()
      .replace('T',' ').slice(0,16)+' UTC';
  }

  function updateOccultationStatus(event,geometry){
    const status=document.getElementById('occultationStatus');
    if(event.type==='alignment'){
      status.innerHTML='<strong>'+event.label+'</strong><br>'+
        'Visible from '+event.observer.name+' · '+
        (geometry.separation/DEG).toFixed(3)+'° separation<br>'+
        formatOccultationDate(event.time);
      return;
    }
    const coverage=(geometry.coverage*100).toFixed(
      geometry.coverage<0.01?2:1
    );
    status.innerHTML='<strong>'+event.label+'</strong><br>'+
      event.occulter.name+' across the Sun from '+event.observer.name+
      '<br>'+formatOccultationDate(event.time)+' · '+coverage+'% maximum coverage';
  }

  async function goToOccultationEvent(event){
    cancelDateNavigation();
    deps.clock.playing=false;
    playBtn.textContent='▶';
    if(deps.simulation.asyncEnabled){
      const revision=deps.clock.dateNavigationRevision;
      const model=deps.simulation.editableSystem;
      try{
        const prepared=await deps.simulation.prepareFrame(event.time,{
          cancelled:()=>revision!==deps.clock.dateNavigationRevision ||
            model!==deps.simulation.editableSystem
        });
        if(!prepared) return;
      } catch(error){
        console.error(error);
        document.getElementById('occultationStatus').textContent=
          'Event navigation failed: '+error.message;
        return;
      }
    }
    activeOccultationEvent=event;
    deps.clock.simDaysSinceJ2000=event.time;
    deps.clock.playing=false;
    playBtn.textContent='▶';
    deps.selection.setSelectedBody(event.observer);
    deps.observatory.setObservatoryObserver(
      event.observer,event.observer!==deps.observatory.observatoryObserver
    );
    deps.observatory.setObservatoryMode(true,true);
    deps.observatory.aimObservatoryAtEvent(event);
    setOccultationPanelVisible(true);
    updateOccultationStatus(event,event.geometry);
  }

  function refreshOccultationCatalog(){
    const select=document.getElementById('occultationObserver');
    if(!select) return;
    BodySelect.populate(select,activeOccultationObservers(),{
      catalog:activeSystemBodies()
    });
    const unavailable=!select.options.length ||
      !dominantLightBody(activeSystemBodies());
    document.getElementById('occultationBtn').disabled=unavailable;
    select.disabled=unavailable;
    document.getElementById('occultationType').disabled=unavailable;
    document.getElementById('previousOccultationBtn').disabled=unavailable;
    document.getElementById('nextOccultationBtn').disabled=unavailable;
    document.getElementById('occultationStatus').textContent=unavailable
      ? 'Sky-event searches require a built-in Solar planet or moon and an active star.'
      : 'Choose an observer and event type, then search.';
  }

  function buildOccultationControls(){
    const select=document.getElementById('occultationObserver');
    refreshOccultationCatalog();
    select.value='Earth';
    select.addEventListener('change',()=>{
      occultationSearchRevision++;
      activeOccultationEvent=null;
      const observer=activeOccultationObservers().find(
        body=>body.name===select.value
      );
      if(observatorySurfaceDefinitionForBody(observer)){
        deps.observatory.setObservatoryObserver(observer);
      }
      document.getElementById('previousOccultationBtn').disabled=false;
      document.getElementById('nextOccultationBtn').disabled=false;
      document.getElementById('occultationStatus').textContent=
        'Search for the previous or next event visible from '+select.value+'.';
    });
    document.getElementById('occultationType').addEventListener('change',()=>{
      occultationSearchRevision++;
      activeOccultationEvent=null;
      document.getElementById('previousOccultationBtn').disabled=false;
      document.getElementById('nextOccultationBtn').disabled=false;
      document.getElementById('occultationStatus').textContent=
        'Search for the selected event type visible from '+select.value+'.';
    });
    document.getElementById('previousOccultationBtn').addEventListener(
      'click',()=>findOccultation(-1)
    );
    document.getElementById('nextOccultationBtn').addEventListener(
      'click',()=>findOccultation(1)
    );
  }

  function setOccultationPanelVisible(visible){
    if(!visible){
      occultationSearchRevision++;
      activeOccultationEvent=null;
      const unavailable=document.getElementById('occultationBtn').disabled;
      document.getElementById('previousOccultationBtn').disabled=unavailable;
      document.getElementById('nextOccultationBtn').disabled=unavailable;
    }
    deps.panels.setPanelVisible('occultationPanel',visible);
    document.getElementById('occultationBtn').classList.toggle('active',visible);
    document.getElementById('occultationBtn').setAttribute(
      'aria-expanded',String(visible)
    );
    if(visible && activeOccultationObservers().includes(deps.selection.selected)){
      document.getElementById('occultationObserver').value=deps.selection.selected.name;
      if(observatorySurfaceDefinitionForBody(deps.selection.selected)){
        deps.observatory.setObservatoryObserver(deps.selection.selected);
      }
    }
  }

  let initialized=false;
  function initialize(){
    if(initialized) return;
    initialized=true;
    document.getElementById('occultationBtn').addEventListener('click',()=>{
      const panel=document.getElementById('occultationPanel');
      setOccultationPanelVisible(panel.classList.contains('panel-hidden'));
    });
    document.getElementById('occultationClose').addEventListener(
      'click',()=>setOccultationPanelVisible(false)
    );
  }

  return {
    initialize,
    get activeOccultationEvent(){ return activeOccultationEvent; },
    set activeOccultationEvent(value){ activeOccultationEvent=value; },
    occultationGeometryAt,
    isLocalOcculter,
    get occultationSearchRevision(){ return occultationSearchRevision; },
    set occultationSearchRevision(value){ occultationSearchRevision=value; },
    setOccultationPanelVisible,
    refreshOccultationCatalog,
    activeOccultationObservers,
    buildOccultationControls
  };
});
