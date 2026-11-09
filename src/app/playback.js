(function(root,factory){
  const api={create:factory};
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.SimSolarClock=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(deps){
  'use strict';

  const {document,window}=deps;
  const {PlaybackClock}=window;
  const {TIME_LIMIT_DAYS:EDITABLE_TIME_LIMIT_DAYS}=window.SystemModel;
  const {daysSinceJ2000,J2000}=deps.constants;
  const {HYBRID_EPOCH_DAYS}=deps.catalog;
  const {HYBRID_MAX_DAYS}=deps.simulation;
  const {updateFollowCamera,invalidateProjection}=deps.camera;

  let simDaysSinceJ2000 = daysSinceJ2000(Date.now());
  let playing = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let dateNavigationRevision=0;
  let speedExp = Math.log10(5);
  let observatorySpeedExp=0;
  let direction = 1;
  let requestedDays=null;
  function setTime(value){
    if(deps.simulation.asyncEnabled && !deps.simulation.isFrameReady(value)){
      requestedDays=value;
      deps.simulation.cancelPreparation();
    } else {
      requestedDays=null;
      simDaysSinceJ2000=value;
    }
  }
  function speedDaysPerSec(){
    return deps.observatory.observatoryActive
      ? Math.pow(10,observatorySpeedExp)/86400
      : Math.pow(10,speedExp);
  }

  function updateDateUI(){
    const ms = J2000 + simDaysSinceJ2000*86400000;
    const d = new Date(ms);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    let year=String(d.getUTCFullYear());
    let date=String(d.getUTCDate()).padStart(2,'0')+' '+months[d.getUTCMonth()];
    let time=
      String(d.getUTCHours()).padStart(2,'0')+':'+
      String(d.getUTCMinutes()).padStart(2,'0')+':'+
      String(d.getUTCSeconds()).padStart(2,'0')+' UTC';
    if(deps.observatory.observatoryActive){
      const parts=new Intl.DateTimeFormat('en-GB',{
        timeZone:deps.observatory.observatoryTimeZone,
        year:'numeric',month:'short',day:'2-digit',
        hour:'2-digit',minute:'2-digit',second:'2-digit',
        hourCycle:'h23',timeZoneName:'short'
      }).formatToParts(d);
      const value=type=>parts.find(part=>part.type===type)?.value||'';
      year=value('year');
      date=value('day')+' '+value('month');
      time=value('hour')+':'+value('minute')+':'+value('second')+' '+
        value('timeZoneName');
    }
    const yearOut = document.getElementById('yearOut');
    const dateOut = document.getElementById('dateOut');
    const timeOut = document.getElementById('timeOut');
    if(yearOut.textContent !== year) yearOut.textContent = year;
    if(dateOut.textContent !== date) dateOut.textContent = date;
    if(timeOut.textContent !== time) timeOut.textContent = time;
    const dateInput=document.getElementById('dateInput');
    const iso=d.toISOString().slice(0,10);
    if(!dateInput.disabled && document.activeElement!==dateInput && dateInput.value!==iso){
      dateInput.value=iso;
    }
    const modelOut=document.getElementById('modelOut');
    const model=deps.simulation.editableSystem
      ? 'EDITABLE BARYCENTRIC N-BODY'
      : simDaysSinceJ2000>=HYBRID_EPOCH_DAYS
        ? 'NEWTONIAN N-BODY'
        : 'JPL EPHEMERIS';
    if(modelOut.textContent!==model) modelOut.textContent=model;
  }

  const playBtn = document.getElementById('playBtn');

  function cancelDateNavigation(){
    dateNavigationRevision++;
    requestedDays=null;
    deps.simulation.cancelPreparation?.();
    document.getElementById('dateInput').disabled=false;
    deps.impacts.activeImpact=null;
    deps.impacts.ignoredImpactKey=null;
    deps.impacts.updateImpactPanel();
  }

  const speedSlider = document.getElementById('speedSlider');
  const speedVal = document.getElementById('speedVal');
  function updateSpeedLabel(){
    if(deps.observatory.observatoryActive){
      const multiplier=Math.pow(10,observatorySpeedExp);
      speedVal.textContent=multiplier<10
        ? multiplier.toFixed(1)+'× real time'
        : Math.round(multiplier)+'× real time';
      return;
    }
    const dps = speedDaysPerSec();
    let txt;
    if(dps < 1) txt = dps.toFixed(2)+' days/sec';
    else if(dps < 365) txt = dps.toFixed(dps<10?1:0)+' days/sec';
    else txt = (dps/365.25).toFixed(1)+' yrs/sec';
    speedVal.textContent = (direction<0?'−':'')+txt;
  }

  function stopAtHybridLimit(){
    setTime(HYBRID_MAX_DAYS);
    playing=false;
    playBtn.textContent='▶';
    document.getElementById('eventDetail').textContent=
      'Future N-body navigation currently ends at 2100-01-01.';
  }

  const playbackClock=PlaybackClock.create();

  let initialized=false;
  function initialize(){
    if(initialized) return;
    initialized=true;
    playBtn.textContent = '⏸';
    playBtn.addEventListener('click', ()=>{
      if(deps.impacts.activeImpact){
        deps.impacts.ignoredImpactKey=deps.impacts.activeImpact.key;
        deps.impacts.activeImpact=null;
        playing=true;
        playBtn.textContent='⏸';
        deps.impacts.updateImpactPanel();
        return;
      }
      cancelDateNavigation();
      playing=!playing;
      playBtn.textContent=playing?'⏸':'▶';
    });
    document.getElementById('rewBtn').addEventListener('click', ()=>{
      const requested=requestedDays??simDaysSinceJ2000;
      cancelDateNavigation();
      setTime(Math.max(
        deps.simulation.editableSystem?.epoch??-Infinity,
        requested-30
      ));
    });
    document.getElementById('fwdBtn').addEventListener('click', ()=>{
      const requested=requestedDays??simDaysSinceJ2000;
      cancelDateNavigation();
      if(!deps.simulation.editableSystem && requested+30>=HYBRID_MAX_DAYS){
        stopAtHybridLimit();
      } else {
        setTime(Math.min(
          deps.simulation.editableSystem ? EDITABLE_TIME_LIMIT_DAYS : HYBRID_MAX_DAYS,
          requested+30
        ));
      }
    });
    document.getElementById('todayBtn').addEventListener('click', ()=>{
      cancelDateNavigation();
      setTime(Math.max(
        deps.simulation.editableSystem?.epoch??-Infinity,
        daysSinceJ2000(Date.now())
      ));
      updateFollowCamera();
      invalidateProjection();
    });
    speedSlider.addEventListener('input', (e)=>{
      deps.simulation.cancelPreparation?.();
      if(deps.observatory.observatoryActive){
        observatorySpeedExp=parseFloat(e.target.value);
      } else {
        speedExp=parseFloat(e.target.value);
      }
      updateSpeedLabel();
    });
    updateSpeedLabel();
    document.addEventListener('visibilitychange',()=>{
      playbackClock.reset();
      if(document.hidden) deps.simulation.cancelPreparation?.();
    });
  }

  return {
    initialize,
    get simDaysSinceJ2000(){ return simDaysSinceJ2000; },
    set simDaysSinceJ2000(value){ setTime(value); },
    get requestedDays(){ return requestedDays??simDaysSinceJ2000; },
    get playing(){ return playing; },
    set playing(value){
      if(value!==playing) deps.simulation.cancelPreparation?.();
      playing=value;
    },
    playBtn,
    get speedExp(){ return speedExp; },
    set speedExp(value){ speedExp=value; },
    updateSpeedLabel,
    cancelDateNavigation,
    updateDateUI,
    get dateNavigationRevision(){ return dateNavigationRevision; },
    set dateNavigationRevision(value){ dateNavigationRevision=value; },
    get observatorySpeedExp(){ return observatorySpeedExp; },
    set observatorySpeedExp(value){ observatorySpeedExp=value; },
    get direction(){ return direction; },
    set direction(value){ direction=value; },
    playbackClock,
    speedDaysPerSec,
    stopAtHybridLimit
  };
});
