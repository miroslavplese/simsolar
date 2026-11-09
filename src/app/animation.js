(function(root,factory){
  const api={create:factory};
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.SimSolarAnimation=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(deps){
  'use strict';

  const {document,window}=deps;
  const {TIME_LIMIT_DAYS:EDITABLE_TIME_LIMIT_DAYS}=window.SystemModel;
  const {playbackClock,speedDaysPerSec,playBtn,stopAtHybridLimit}=deps.clock;
  const {frameProfiler,updateProfilerUI}=deps.profiler;
  const {detectImpact,handleImpact,updateImpactPanel}=deps.impacts;
  const {HYBRID_MAX_DAYS}=deps.simulation;
  const {draw}=deps.sceneRenderer;

  let activeLoop=null;
  let frameId=null;
  let preparation=null;
  let failedRevision=null;
  let failedModel=null;

  function advanceAsync(dt,run){
    if(preparation || document.hidden) return;
    const clock=deps.clock;
    const previous=clock.simDaysSinceJ2000;
    const requested=clock.requestedDays;
    const revision=clock.dateNavigationRevision;
    const model=deps.simulation.editableSystem;
    if(failedRevision===revision && failedModel===model) return;
    const playing=clock.playing;
    const direction=deps.observatory.observatoryActive?1:clock.direction;
    const speed=speedDaysPerSec();
    const seeking=requested!==previous || !deps.simulation.isFrameReady(previous);
    if(!seeking && !playing) return;
    let target=seeking?requested:previous+direction*speed*dt;
    const route=(deps.planner.plannerPreviewActive || deps.cockpit.spacecraftViewActive)
      ? deps.planner.activePlannerRoute:null;
    const minimum=model?.epoch??-Infinity;
    const maximum=model?EDITABLE_TIME_LIMIT_DAYS:HYBRID_MAX_DAYS;
    if(route){
      target=Math.max(route.waypoints[0].time,Math.min(route.waypoints.at(-1).time,target));
    }
    target=Math.max(minimum,Math.min(maximum,target));
    const cancelled=()=>activeLoop!==run || document.hidden ||
      deps.simulation.editableSystem!==model ||
      clock.dateNavigationRevision!==revision ||
      clock.simDaysSinceJ2000!==previous || clock.requestedDays!==requested ||
      clock.playing!==playing ||
      (deps.observatory.observatoryActive?1:clock.direction)!==direction ||
      speedDaysPerSec()!==speed;
    const task=deps.simulation.prepareFrame(target,{
      start:seeking?undefined:previous,
      ignoredKey:deps.impacts.ignoredImpactKey,
      cancelled
    });
    preparation=task;
    task.then(result=>{
      if(!result || cancelled()) return;
      if(result.impact){
        const bodies=deps.simulation.activeSystemBodies();
        const a=bodies.find(body=>body.id===result.impact.aId);
        const b=bodies.find(body=>body.id===result.impact.bId);
        if(!a || !b) throw new Error('Simulation returned an impact for an inactive body.');
        deps.impacts.handleImpact({...result.impact,a,b});
      } else {
        clock.simDaysSinceJ2000=result.time;
        if(!seeking) deps.impacts.ignoredImpactKey=result.ignoredKey;
        if(!seeking && (
          result.time===maximum || direction<0 && result.time===minimum ||
          route && (direction>0 && result.time===route.waypoints.at(-1).time ||
            direction<0 && result.time===route.waypoints[0].time)
        )){
          clock.playing=false;
          deps.planner.plannerPreviewActive=false;
          playBtn.textContent='▶';
          if(!model && result.time===HYBRID_MAX_DAYS) stopAtHybridLimit();
        }
      }
      if(model || seeking) deps.camera.orbitLayerDirty=true;
    }).catch(error=>{
      if(cancelled()) return;
      failedRevision=revision;
      failedModel=model;
      clock.playing=false;
      playBtn.textContent='▶';
      console.error(error);
      deps.onError('Simulation failed: '+error.message);
    }).finally(()=>{
      if(preparation===task) preparation=null;
    });
  }

  function loop(t,run){
    if(activeLoop!==run) return;
    frameId=null;
    const {elapsed,playback:dt}=playbackClock.tick(t,document.hidden);
    if(deps.camera.activeViewPreset && elapsed>0 && elapsed<0.25){
      frameProfiler.record(deps.camera.activeViewPreset,elapsed*1000);
      if(deps.profiler.profilerVisible && t-deps.profiler.lastProfilerUpdate>500){
        updateProfilerUI();
        deps.profiler.lastProfilerUpdate=t;
      }
    }
    if(deps.simulation.asyncEnabled){
      advanceAsync(dt,run);
    } else if(deps.clock.playing){
      const previousDays=deps.clock.simDaysSinceJ2000;
      const playbackDirection=deps.observatory.observatoryActive?1:deps.clock.direction;
      const nextDays=deps.clock.simDaysSinceJ2000+
        playbackDirection*speedDaysPerSec()*dt;
      const impact=playbackDirection>0
        ? detectImpact(previousDays,nextDays)
        : null;
      if(impact){
        handleImpact(impact);
      } else {
        deps.clock.simDaysSinceJ2000=nextDays;
      }
      if((deps.planner.plannerPreviewActive || deps.cockpit.spacecraftViewActive) && deps.planner.activePlannerRoute){
        const routeStart=deps.planner.activePlannerRoute.waypoints[0].time;
        const routeEnd=deps.planner.activePlannerRoute.waypoints.at(-1).time;
        if(deps.clock.simDaysSinceJ2000<=routeStart && playbackDirection<0){
          deps.clock.simDaysSinceJ2000=routeStart;
          deps.clock.playing=false;
          deps.planner.plannerPreviewActive=false;
          playBtn.textContent='▶';
        } else if(deps.clock.simDaysSinceJ2000>=routeEnd && playbackDirection>0){
          deps.clock.simDaysSinceJ2000=routeEnd;
          deps.clock.playing=false;
          deps.planner.plannerPreviewActive=false;
          playBtn.textContent='▶';
        }
      }
      if(deps.simulation.editableSystem && deps.clock.simDaysSinceJ2000<=deps.simulation.editableSystem.epoch &&
        playbackDirection<0){
        deps.clock.simDaysSinceJ2000=deps.simulation.editableSystem.epoch;
        deps.clock.playing=false;
        playBtn.textContent='▶';
      }
      if(deps.simulation.editableSystem &&
        deps.clock.simDaysSinceJ2000>=EDITABLE_TIME_LIMIT_DAYS &&
        playbackDirection>0){
        deps.clock.simDaysSinceJ2000=EDITABLE_TIME_LIMIT_DAYS;
        deps.clock.playing=false;
        playBtn.textContent='▶';
      }
      if(!deps.simulation.editableSystem && deps.clock.simDaysSinceJ2000>=HYBRID_MAX_DAYS){
        stopAtHybridLimit();
      }
      if(deps.simulation.editableSystem && deps.clock.simDaysSinceJ2000!==previousDays){
        deps.camera.orbitLayerDirty=true;
      }
    }
    const ready=!deps.simulation.asyncEnabled ||
      deps.simulation.isFrameReady(deps.clock.simDaysSinceJ2000) &&
      deps.clock.requestedDays===deps.clock.simDaysSinceJ2000;
    if(ready && t-deps.impacts.lastImpactPredictionUpdate>1000){
      updateImpactPanel();
      deps.impacts.lastImpactPredictionUpdate=t;
    }
    if(ready) draw();
    if(activeLoop===run) frameId=window.requestAnimationFrame(run);
  }

  function start(){
    if(activeLoop) return;
    const run=t=>loop(t,run);
    activeLoop=run;
    playbackClock.reset();
    frameId=window.requestAnimationFrame(run);
  }

  function stop(){
    activeLoop=null;
    deps.simulation.cancelPreparation?.();
    if(frameId!==null) window.cancelAnimationFrame(frameId);
    frameId=null;
    playbackClock.reset();
  }

  return {
    start,
    stop
  };
});
