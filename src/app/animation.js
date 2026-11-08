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
    if(deps.clock.playing){
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
    if(t-deps.impacts.lastImpactPredictionUpdate>1000){
      updateImpactPanel();
      deps.impacts.lastImpactPredictionUpdate=t;
    }
    draw();
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
    if(frameId!==null) window.cancelAnimationFrame(frameId);
    frameId=null;
    playbackClock.reset();
  }

  return {
    start,
    stop
  };
});
