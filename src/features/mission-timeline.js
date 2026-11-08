(function(root,factory){
  const api={create:factory};
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.SimSolarTimeline=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(deps){
  'use strict';

  const {document,window}=deps;
  const {BodySelect}=window;
  const {zoomForTarget,findRelativeEvent}=window.MissionTimeline;
  const {focusZoom:moonSystemFocusZoom}=window.MoonSystem;
  const {TIME_LIMIT_DAYS:EDITABLE_TIME_LIMIT_DAYS}=window.SystemModel;
  const {spacecraft,moonVisibilityDefinitions,HYBRID_EPOCH_DAYS}=deps.catalog;
  const {daysSinceJ2000,AU_PX,BASE_ZOOM_MAX}=deps.constants;
  const {activeBodiesOf,HYBRID_MAX_DAYS,hybridBranchAt,moonBranchAt}=deps.simulation;
  const {setFollowTarget,updateFollowCamera,invalidateProjection}=deps.camera;
  const {cancelDateNavigation,playBtn}=deps.clock;

  const missionEvents = [];
  for(const craft of spacecraft){
    missionEvents.push({
      craft, date:craft.launch,
      days:craft._trajectoryPoints ? craft._trajectoryPoints[0][0] : daysSinceJ2000(Date.parse(craft.launch+'T12:00:00Z')),
      title:'Launch', target:'Earth', description:craft.name+' launches from Earth.'
    });
    for(const [target,date] of craft.flybys){
      missionEvents.push({
        craft, date, days:daysSinceJ2000(Date.parse(date+'T12:00:00Z')),
        title:target+' flyby', target:target.replace(/\s+\d+$/,''),
        description:craft.name+' encounters '+target.replace(/\s+\d+$/,'')+'.'
      });
    }
    for(const event of craft.events||[]){
      missionEvents.push({
        ...event,craft,days:daysSinceJ2000(Date.parse(event.date+'T12:00:00Z'))
      });
    }
  }
  missionEvents.sort((a,b)=>a.days-b.days);

  let activeMissionEvent = null;

  function refreshMissionTimelineCatalog(){
    const select=document.getElementById('missionSelect');
    if(!select) return;
    BodySelect.populate(select,activeBodiesOf(spacecraft));
  }

  function zoomForEvent(event){
    const parentName=event.target==='Pluto & Charon'?'Pluto':event.target;
    return moonSystemFocusZoom(
      moonVisibilityDefinitions,parentName,AU_PX,70,BASE_ZOOM_MAX
    )||zoomForTarget(event.target);
  }

  function missionEventsForSelection(){
    const name=document.getElementById('missionSelect').value;
    return missionEvents.filter(event=>
      event.craft.name===name &&
      (!deps.simulation.editableSystem || event.days>=deps.simulation.editableSystem.epoch)
    );
  }

  function renderMissionEvents(){
    const list=document.getElementById('eventList');
    list.innerHTML='';
    for(const event of missionEventsForSelection()){
      const button=document.createElement('button');
      button.type='button';
      button.className='event'+(event===activeMissionEvent?' active':'');
      button.innerHTML=`<span>${event.date}</span>${event.title}`;
      button.addEventListener('click',()=>goToMissionEvent(event));
      list.appendChild(button);
    }
  }

  function syncMissionToSpacecraft(craft){
    const select=document.getElementById('missionSelect');
    select.value=craft.name;
    activeMissionEvent=null;
    if(deps.camera.followTarget && deps.camera.followTarget!==craft) setFollowTarget(null);
    document.getElementById('eventDetail').textContent='Showing mission events for '+craft.name+'.';
    renderMissionEvents();
  }

  function goToMissionEvent(event){
    cancelDateNavigation();
    activeMissionEvent=event;
    deps.clock.simDaysSinceJ2000=Math.max(
      deps.simulation.editableSystem?.epoch??-Infinity,event.days
    );
    deps.clock.playing=false;
    playBtn.textContent='▶';
    deps.selection.setSelectedBody(event.craft,false);
    deps.visibility.showSpacecraft=true;
    deps.camera.zoom=zoomForEvent(event);
    deps.camera.panX=0; deps.camera.panY=0;
    document.getElementById('missionSelect').value=event.craft.name;
    document.getElementById('eventDetail').textContent=event.date+' · '+event.description;
    setFollowTarget(event.craft);
    updateFollowCamera();
    invalidateProjection();
    deps.legend.buildLegend();
    renderMissionEvents();
  }

  function jumpRelativeEvent(direction){
    const events=missionEventsForSelection();
    const event=findRelativeEvent(events,deps.clock.simDaysSinceJ2000,direction);
    if(event) goToMissionEvent(event);
  }

  function buildMissionTimeline(){
    const select=document.getElementById('missionSelect');
    refreshMissionTimelineCatalog();
    select.value='Voyager 1';
    select.addEventListener('change',()=>{
      const craft=activeBodiesOf(spacecraft).find(
        item=>item.name===select.value
      );
      if(!craft) return;
      deps.visibility.showSpacecraft=true;
      deps.selection.setSelectedBody(craft,false);
      deps.legend.buildLegend();
      syncMissionToSpacecraft(craft);
    });
    document.getElementById('prevEventBtn').addEventListener('click',()=>jumpRelativeEvent(-1));
    document.getElementById('nextEventBtn').addEventListener('click',()=>jumpRelativeEvent(1));
    document.getElementById('followBtn').addEventListener('click',()=>{
      if(deps.camera.followTarget){
        setFollowTarget(null);
      } else {
        const craft=activeBodiesOf(spacecraft).find(
          item=>item.name===select.value
        );
        if(!craft) return;
        deps.visibility.showSpacecraft=true;
        deps.selection.setSelectedBody(craft,false);
        deps.legend.buildLegend();
        setFollowTarget(craft);
      }
    });
    document.getElementById('dateInput').addEventListener('change',async(e)=>{
      if(!e.target.value) return;
      const requestedDate=e.target.value;
      const [year,month,day]=e.target.value.split('-').map(Number);
      let targetDays=daysSinceJ2000(Date.UTC(year,month-1,day,12));
      if(deps.simulation.editableSystem){
        targetDays=Math.max(
          deps.simulation.editableSystem.epoch,
          Math.min(EDITABLE_TIME_LIMIT_DAYS,targetDays)
        );
      } else {
        targetDays=Math.min(HYBRID_MAX_DAYS,targetDays);
      }
      deps.clock.playing=false;
      playBtn.textContent='▶';
      activeMissionEvent=null;
      renderMissionEvents();
      const revision=++deps.clock.dateNavigationRevision;
      if(deps.simulation.editableSystem || targetDays>=HYBRID_EPOCH_DAYS){
        e.target.disabled=true;
        const detail=document.getElementById('eventDetail');
        detail.textContent='Preparing future N-body state for '+requestedDate+'…';
        let prepared;
        try{
          const simulator=deps.simulation.editableSystem
            ? deps.simulation.editableSystem.simulator
            : hybridBranchAt(targetDays).simulator;
          prepared=await simulator.prepareTo(targetDays,{
            budgetMs:8,
            cancelled:()=>revision!==deps.clock.dateNavigationRevision,
            onProgress:progress=>{
              if(revision===deps.clock.dateNavigationRevision){
                detail.textContent='Preparing future N-body state for '+requestedDate+
                  '… '+Math.round(progress*35)+'%';
              }
            }
          });
          if(prepared && !deps.simulation.editableSystem){
            prepared=await moonBranchAt(targetDays).simulator.prepareTo(targetDays,{
              budgetMs:8,
              cancelled:()=>revision!==deps.clock.dateNavigationRevision,
              onProgress:progress=>{
                if(revision===deps.clock.dateNavigationRevision){
                  detail.textContent='Preparing future N-body state for '+requestedDate+
                    '… '+Math.round(35+progress*65)+'%';
                }
              }
            });
          }
        } catch(error){
          if(revision===deps.clock.dateNavigationRevision){
            e.target.disabled=false;
            detail.textContent='Future integration failed: '+error.message;
          }
          console.error(error);
          return;
        }
        if(revision!==deps.clock.dateNavigationRevision || !prepared) return;
        e.target.disabled=false;
      }
      deps.clock.simDaysSinceJ2000=targetDays;
      document.getElementById('eventDetail').textContent='Showing '+requestedDate+' UTC.';
    });
    renderMissionEvents();
  }

  return {
    get activeMissionEvent(){ return activeMissionEvent; },
    set activeMissionEvent(value){ activeMissionEvent=value; },
    refreshMissionTimelineCatalog,
    renderMissionEvents,
    syncMissionToSpacecraft,
    buildMissionTimeline
  };
});
