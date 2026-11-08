(function(root,factory){
  const api={create:factory};
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.SimSolarProfiler=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(deps){
  'use strict';

  const {document,window}=deps;

  const profilerViews=['Current','Inner','Outer','Deep'];
  const frameProfiler=window.FrameProfiler.createFrameProfiler(profilerViews,300);

  let profilerVisible=false;
  let lastProfilerUpdate=0;

  function updateProfilerUI(){
    for(const name of profilerViews){
      const row=document.getElementById('perf'+name);
      const stats=frameProfiler.summary(name);
      row.classList.toggle('active',name===deps.camera.activeViewPreset);
      if(!stats) continue;
      row.children[1].textContent=stats.averageMs.toFixed(1)+' ms';
      row.children[2].textContent=stats.p95Ms.toFixed(1)+' ms';
      row.children[3].textContent=stats.fps.toFixed(0);
    }
  }

  function setProfilerVisible(visible){
    profilerVisible=visible;
    document.getElementById('perfPanel').classList.toggle('show',profilerVisible);
    const button=document.getElementById('perfBtn');
    if(button){
      button.classList.toggle('active',profilerVisible);
      button.setAttribute('aria-expanded',String(profilerVisible));
    }
    if(profilerVisible) updateProfilerUI();
  }
  function toggleProfiler(){ setProfilerVisible(!profilerVisible); }

  let initialized=false;
  function initialize(){
    if(initialized) return;
    initialized=true;
    document.getElementById('perfClose').addEventListener('click',()=>setProfilerVisible(false));
  }

  return {
    initialize,
    setProfilerVisible,
    updateProfilerUI,
    toggleProfiler,
    frameProfiler,
    get profilerVisible(){ return profilerVisible; },
    get lastProfilerUpdate(){ return lastProfilerUpdate; },
    set lastProfilerUpdate(value){ lastProfilerUpdate=value; }
  };
});
