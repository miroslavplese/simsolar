(function(root,factory){
  const planner=typeof module==='object' && module.exports
    ? require('./mission-planner.js')
    : root.MissionPlanner;
  const api=factory(planner);
  if(typeof module==='object' && module.exports) module.exports=api;
  root.MissionPlannerUI=api;
})(typeof globalThis!=='undefined' ? globalThis : this,function(planner){
  'use strict';

  const DAY_MS=86400000;

  function isoFromDays(days,j2000){
    return new Date(j2000+days*DAY_MS).toISOString().slice(0,10);
  }

  function daysFromIso(value,j2000){
    const milliseconds=Date.parse(value+'T12:00:00Z');
    return Number.isFinite(milliseconds)
      ? (milliseconds-j2000)/DAY_MS
      : NaN;
  }

  function createDefaultPlan(nowDays){
    const departure=Math.ceil(nowDays+45);
    return {
      version:planner.PLAN_VERSION,
      id:'mission-'+Date.now().toString(36),
      name:'New interplanetary mission',
      waypoints:[
        {
          body:'Earth',role:'departure',
          earliest:departure,latest:departure+180,altitudeKm:300
        },
        {
          body:'Mars',role:'target',
          earliest:departure+220,latest:departure+720,
          altitudeKm:1000,arrivalMode:'flyby'
        }
      ]
    };
  }

  function formatDuration(days){
    if(!Number.isFinite(days)) return '—';
    if(days<730) return Math.round(days)+' days';
    return (days/365.25).toFixed(1)+' years';
  }

  function formatAngle(radians){
    return Number.isFinite(radians)
      ? (radians*180/Math.PI).toFixed(1)+'°'
      : '—';
  }

  function create(options){
    const document=options.document;
    const window=options.window;
    const j2000=options.j2000;
    const element=id=>document.getElementById(id);
    const panel=element('plannerPanel');
    if(!panel) throw new Error('Mission planner panel is missing.');
    let plan=createDefaultPlan(options.nowDays());
    let routes=[];
    let activeRoute=null;
    let searchRevision=0;

    const tabs=[...panel.querySelectorAll('[data-planner-tab]')];
    const panes=[...panel.querySelectorAll('[data-planner-pane]')];

    function catalog(){
      return options.catalog().filter(entry=>entry.name!=='Sun');
    }

    function bodyOption(entry){
      const option=document.createElement('option');
      option.value=entry.name;
      option.textContent=entry.name;
      return option;
    }

    function populateTargets(){
      const select=element('plannerTarget');
      const previous=select.value||
        plan.waypoints[plan.waypoints.length-1].body;
      select.innerHTML='';
      for(const entry of catalog().filter(item=>item.target!==false)){
        select.appendChild(bodyOption(entry));
      }
      if([...select.options].some(option=>option.value===previous)){
        select.value=previous;
      }
    }

    function setTab(name){
      tabs.forEach(tab=>tab.classList.toggle(
        'active',tab.dataset.plannerTab===name
      ));
      panes.forEach(pane=>pane.classList.toggle(
        'active',pane.dataset.plannerPane===name
      ));
    }

    function renderAssists(){
      const list=element('plannerAssistList');
      list.innerHTML='';
      const assists=plan.waypoints.slice(1,-1);
      if(!assists.length){
        const empty=document.createElement('div');
        empty.className='plannerEmpty';
        empty.textContent='No gravity assists. This is a direct transfer.';
        list.appendChild(empty);
        return;
      }
      const assistCatalog=catalog().filter(entry=>entry.assist);
      assists.forEach((assist,index)=>{
        const row=document.createElement('div');
        row.className='plannerAssist';
        const select=document.createElement('select');
        select.setAttribute('aria-label','Gravity-assist body');
        for(const entry of assistCatalog) select.appendChild(bodyOption(entry));
        select.value=assist.body;
        const earliest=document.createElement('input');
        earliest.type='date';
        earliest.value=isoFromDays(assist.earliest,j2000);
        earliest.setAttribute('aria-label','Earliest flyby date');
        const latest=document.createElement('input');
        latest.type='date';
        latest.value=isoFromDays(assist.latest,j2000);
        latest.setAttribute('aria-label','Latest flyby date');
        const altitude=document.createElement('input');
        altitude.type='number';
        altitude.min='0';
        altitude.step='100';
        altitude.value=String(assist.altitudeKm??1000);
        altitude.setAttribute('aria-label','Flyby altitude in kilometers');
        const remove=document.createElement('button');
        remove.type='button';
        remove.className='plannerIconButton';
        remove.textContent='✕';
        remove.title='Remove flyby';
        function update(){
          assist.body=select.value;
          assist.earliest=daysFromIso(earliest.value,j2000);
          assist.latest=daysFromIso(latest.value,j2000);
          assist.altitudeKm=Number(altitude.value);
          clearSolution();
        }
        select.addEventListener('change',update);
        earliest.addEventListener('change',update);
        latest.addEventListener('change',update);
        altitude.addEventListener('change',update);
        remove.addEventListener('click',()=>{
          plan.waypoints.splice(index+1,1);
          clearSolution();
          renderAssists();
        });
        row.append(select,earliest,latest,altitude,remove);
        list.appendChild(row);
      });
    }

    function renderLibrary(){
      const select=element('plannerLibrary');
      const saved=planner.loadPlans(options.storage());
      select.innerHTML='<option value="">UNSAVED PLAN</option>';
      for(const savedPlan of saved){
        const option=document.createElement('option');
        option.value=savedPlan.id;
        option.textContent=savedPlan.name;
        select.appendChild(option);
      }
      if(saved.some(candidate=>candidate.id===plan.id)) select.value=plan.id;
    }

    function syncFormFromPlan(){
      const departure=plan.waypoints[0];
      const target=plan.waypoints.at(-1);
      element('plannerName').value=plan.name;
      populateTargets();
      element('plannerTarget').value=target.body;
      element('plannerDepartureAltitude').value=String(
        departure.altitudeKm??300
      );
      element('plannerArrivalMode').value=target.arrivalMode||'flyby';
      element('plannerArrivalAltitude').value=String(target.altitudeKm??1000);
      element('plannerDepartureStart').value=isoFromDays(
        departure.earliest,j2000
      );
      element('plannerDepartureEnd').value=isoFromDays(
        departure.latest,j2000
      );
      element('plannerArrivalStart').value=isoFromDays(
        target.earliest,j2000
      );
      element('plannerArrivalEnd').value=isoFromDays(
        target.latest,j2000
      );
      renderAssists();
      renderLibrary();
    }

    function syncPlanFromForm(){
      const departure=plan.waypoints[0];
      const target=plan.waypoints.at(-1);
      plan.name=element('plannerName').value.trim()||'Untitled mission';
      departure.earliest=daysFromIso(
        element('plannerDepartureStart').value,j2000
      );
      departure.latest=daysFromIso(
        element('plannerDepartureEnd').value,j2000
      );
      target.body=element('plannerTarget').value;
      departure.altitudeKm=Number(element('plannerDepartureAltitude').value);
      target.arrivalMode=element('plannerArrivalMode').value;
      target.altitudeKm=Number(element('plannerArrivalAltitude').value);
      target.earliest=daysFromIso(
        element('plannerArrivalStart').value,j2000
      );
      target.latest=daysFromIso(
        element('plannerArrivalEnd').value,j2000
      );
    }

    function showStatus(message,error=false){
      const status=element('plannerStatus');
      status.textContent=message;
      status.classList.toggle('error',error);
      options.onStatus?.(message,error);
    }

    function clearSolution(cancelSearch=true){
      if(cancelSearch) searchRevision++;
      routes=[];
      activeRoute=null;
      delete plan.selectedTimes;
      delete plan.selectedLongWayMask;
      renderRoutes();
      options.onRouteChange?.(null,plan);
    }

    function routeLabel(route,index){
      const status=!route.captureAvailable
        ? 'CAPTURE UNAVAILABLE'
        : route.feasible ? 'FEASIBLE' : 'POWERED ASSIST';
      return 'ROUTE '+(index+1)+' · '+status+' · '+
        route.totalDeltaVKmS.toFixed(2)+' km/s Δv · '+
        formatDuration(route.durationDays);
    }

    function selectRoute(index){
      activeRoute=routes[index]||null;
      if(activeRoute){
        plan.selectedTimes=activeRoute.waypoints.map(item=>item.time);
        plan.selectedLongWayMask=activeRoute.longWayMask;
      }
      renderRoutes();
      renderManeuvers();
      renderReview();
      options.onRouteChange?.(activeRoute,plan,{focus:true});
    }

    function renderRoutes(){
      const list=element('plannerRouteList');
      list.innerHTML='';
      if(!routes.length){
        list.innerHTML='<div class="plannerEmpty">Search a launch and arrival window to compare routes.</div>';
        return;
      }
      routes.forEach((route,index)=>{
        const button=document.createElement('button');
        button.type='button';
        button.className='plannerRoute'+
          (route===activeRoute?' selected':'');
        button.innerHTML='<b>'+routeLabel(route,index)+'</b>'+
          '<span>Arrival '+route.arrivalSpeedKmS.toFixed(1)+
          ' km/s · '+(route.arrivalMode==='orbit'
            ? 'capture '+route.arrivalDeltaVKmS.toFixed(1)+' km/s'
            : 'flyby')+' · '+
          route.flybys.length+' assist'+
          (route.flybys.length===1?'':'s')+'</span>';
        button.addEventListener('click',()=>selectRoute(index));
        list.appendChild(button);
      });
    }

    function renderManeuvers(){
      const list=element('plannerManeuverList');
      list.innerHTML='';
      if(!activeRoute){
        list.innerHTML='<div class="plannerEmpty">Select a computed route first.</div>';
        return;
      }
      const departure=document.createElement('button');
      departure.type='button';
      departure.className='plannerManeuver';
      departure.dataset.nodeIndex='0';
      departure.innerHTML='<span class="plannerNodeDot"></span><b>'+
        activeRoute.waypoints[0].name+' injection burn</b>'+
        '<small>'+isoFromDays(activeRoute.waypoints[0].time,j2000)+
        ' · '+activeRoute.departureDeltaVKmS.toFixed(2)+' km/s from '+
        Math.round(activeRoute.waypoints[0].altitudeKm)+' km parking orbit</small>';
      departure.addEventListener('click',()=>options.onNodeSelect?.(0));
      list.appendChild(departure);
      activeRoute.flybys.forEach((flyby,index)=>{
        const node=document.createElement('button');
        node.type='button';
        node.className='plannerManeuver';
        node.dataset.nodeIndex=String(index+1);
        node.innerHTML='<span class="plannerNodeDot flyby"></span><b>'+
          flyby.name+' gravity assist</b><small>'+
          isoFromDays(flyby.time,j2000)+' · turn '+
          formatAngle(flyby.requiredTurnRad)+' / '+
          formatAngle(flyby.maximumTurnRad)+' · powered correction '+
          flyby.poweredDeltaVKmS.toFixed(2)+' km/s</small>';
        node.addEventListener('click',()=>options.onNodeSelect?.(index+1));
        list.appendChild(node);
      });
      const arrival=document.createElement('button');
      arrival.type='button';
      arrival.className='plannerManeuver';
      arrival.dataset.nodeIndex=String(activeRoute.waypoints.length-1);
      const arrivalAction=activeRoute.arrivalMode==='orbit'
        ? 'orbit insertion burn'
        : 'flyby encounter';
      arrival.innerHTML='<span class="plannerNodeDot target"></span><b>'+
        activeRoute.waypoints.at(-1).name+' '+arrivalAction+'</b><small>'+
        isoFromDays(activeRoute.waypoints.at(-1).time,j2000)+' · relative speed '+
        activeRoute.arrivalSpeedKmS.toFixed(2)+' km/s · '+
        Math.round(activeRoute.waypoints.at(-1).altitudeKm)+' km altitude'+
        (activeRoute.arrivalMode==='orbit'
          ? ' · capture Δv '+activeRoute.arrivalDeltaVKmS.toFixed(2)+' km/s'
          : '')+'</small>';
      arrival.addEventListener('click',()=>
        options.onNodeSelect?.(activeRoute.waypoints.length-1)
      );
      list.appendChild(arrival);
    }

    function renderReview(){
      const route=activeRoute;
      element('plannerMetricDuration').textContent=
        route?formatDuration(route.durationDays):'—';
      element('plannerMetricDeltaV').textContent=
        route?route.totalDeltaVKmS.toFixed(2)+' km/s':'—';
      element('plannerMetricArrival').textContent=
        route?route.arrivalSpeedKmS.toFixed(2)+' km/s':'—';
      element('plannerMetricStatus').textContent=
        route
          ? !route.captureAvailable
            ? 'CAPTURE UNAVAILABLE'
            : route.feasible ? 'FEASIBLE' : 'POWERED ASSIST'
          : '—';
      element('plannerPreviewBtn').disabled=!route;
      element('plannerCockpitBtn').disabled=!route;
      element('plannerSaveBtn').disabled=!route;
    }

    async function search(){
      syncPlanFromForm();
      if(!planner.validatePlan(plan)){
        showStatus('Check that every date window is complete and ordered.',true);
        return;
      }
      const revision=++searchRevision;
      const searchPlan=JSON.parse(JSON.stringify(plan));
      element('plannerSearchBtn').disabled=true;
      showStatus('Preparing ephemerides…');
      try{
        const latest=Math.max(...searchPlan.waypoints.map(item=>item.latest));
        await options.prepareTo?.(latest,progress=>{
          if(revision===searchRevision){
            showStatus('Preparing ephemerides… '+Math.round(progress*100)+'%');
          }
        });
        if(revision!==searchRevision) return;
        showStatus('Solving Lambert branches…');
        await new Promise(resolve=>window.setTimeout(resolve,0));
        const samplesPerWindow=searchPlan.waypoints.length>=5
          ? 2
          : searchPlan.waypoints.length===4 ? 3 : 4;
        routes=planner.searchRoutes(searchPlan,options.stateAt,{
          bodyInfo:options.bodyInfo,
          samplesPerWindow,
          maxCombinations:256,
          maxCandidates:8
        });
        if(!routes.length){
          throw new RangeError('No route connects the selected windows.');
        }
        selectRoute(0);
        setTab('review');
        showStatus(routes.length+' candidate routes found.');
      } catch(error){
        clearSolution(false);
        showStatus(error.message||'Mission search failed.',true);
      } finally{
        if(revision===searchRevision){
          element('plannerSearchBtn').disabled=false;
        }
      }
    }

    function addAssist(){
      syncPlanFromForm();
      if(plan.waypoints.length>=planner.MAX_WAYPOINTS){
        showStatus('A plan can contain at most four gravity assists.',true);
        return;
      }
      const departure=plan.waypoints[0];
      const target=plan.waypoints.at(-1);
      const assistIndex=plan.waypoints.length-1;
      const fraction=assistIndex/(assistIndex+1);
      const center=departure.latest+
        (target.earliest-departure.latest)*fraction;
      plan.waypoints.splice(-1,0,{
        body:'Jupiter',role:'assist',
        earliest:center-120,latest:center+120,altitudeKm:100000
      });
      clearSolution();
      renderAssists();
    }

    function newPlan(){
      searchRevision++;
      plan=createDefaultPlan(options.nowDays());
      routes=[];
      activeRoute=null;
      syncFormFromPlan();
      renderRoutes();
      renderManeuvers();
      renderReview();
      setTab('launch');
      options.onRouteChange?.(null,plan);
      showStatus('New mission ready.');
    }

    function save(){
      syncPlanFromForm();
      if(!activeRoute || !planner.validatePlan(plan)){
        showStatus('Compute and select a route before saving.',true);
        return;
      }
      try{
        planner.savePlan(options.storage(),plan);
        renderLibrary();
        showStatus('Mission saved locally.');
      } catch(error){
        showStatus(error.message,true);
      }
    }

    function load(id){
      if(!id) return;
      const saved=planner.loadPlans(options.storage()).find(item=>item.id===id);
      if(saved) restore(saved);
    }

    function remove(){
      planner.deletePlan(options.storage(),plan.id);
      newPlan();
      showStatus('Saved mission deleted.');
    }

    async function restore(nextPlan){
      if(!planner.validatePlan(nextPlan)) return false;
      const available=new Set(catalog().map(item=>item.name));
      if(nextPlan.waypoints.some(waypoint=>!available.has(waypoint.body))){
        showStatus('This mission references a body unavailable in this scenario.',true);
        return false;
      }
      const revision=++searchRevision;
      plan=JSON.parse(JSON.stringify(nextPlan));
      routes=[];
      activeRoute=null;
      syncFormFromPlan();
      if(Array.isArray(plan.selectedTimes)){
        try{
          const latest=Math.max(...plan.selectedTimes);
          await options.prepareTo?.(latest);
          if(revision!==searchRevision) return false;
          const route=planner.routeFromPlanSelection(
            plan,options.stateAt,{bodyInfo:options.bodyInfo}
          );
          if(route){
            routes=[route];
            activeRoute=route;
            showStatus('Saved route restored.');
          } else {
            showStatus('Saved route needs to be searched again.',true);
          }
        } catch(error){
          if(revision===searchRevision){
            showStatus('Saved route needs to be searched again.',true);
          }
          return false;
        }
      }
      if(revision!==searchRevision) return false;
      renderRoutes();
      renderManeuvers();
      renderReview();
      options.onRouteChange?.(activeRoute,plan);
      return true;
    }

    tabs.forEach(tab=>tab.addEventListener(
      'click',()=>setTab(tab.dataset.plannerTab)
    ));
    for(const id of [
      'plannerName','plannerTarget','plannerDepartureStart',
      'plannerDepartureEnd','plannerArrivalStart','plannerArrivalEnd',
      'plannerDepartureAltitude','plannerArrivalMode','plannerArrivalAltitude'
    ]){
      element(id).addEventListener('change',()=>{
        syncPlanFromForm();
        clearSolution();
      });
    }
    element('plannerAddAssistBtn').addEventListener('click',addAssist);
    element('plannerSearchBtn').addEventListener('click',search);
    element('plannerNewBtn').addEventListener('click',newPlan);
    element('plannerSaveBtn').addEventListener('click',save);
    element('plannerDeleteBtn').addEventListener('click',remove);
    element('plannerLibrary').addEventListener('change',event=>load(event.target.value));
    element('plannerPreviewBtn').addEventListener('click',()=>{
      if(activeRoute) options.onPreview?.(activeRoute,plan);
    });
    element('plannerCockpitBtn').addEventListener('click',()=>{
      if(activeRoute) options.onCockpit?.(activeRoute,plan);
    });

    syncFormFromPlan();
    renderRoutes();
    renderManeuvers();
    renderReview();

    return {
      refreshTargets:populateTargets,
      plan:()=>JSON.parse(JSON.stringify(plan)),
      route:()=>activeRoute,
      restore,
      setTab,
      cancelSearch:()=>{ searchRevision++; }
    };
  }

  return {
    create,createDefaultPlan,isoFromDays,daysFromIso,formatDuration
  };
});
