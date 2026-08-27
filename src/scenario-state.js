(function(root,factory){
  const api=factory(root);
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.ScenarioState=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';

  const VERSION=3;
  const LEGACY_VERSION=1;
  const MISSION_VERSION=2;
  const TIME_LIMIT_DAYS=10000000;
  const PARAM='scenario';
  let missionPlannerApi=null;
  let systemModelApi=null;

  function finite(value,min,max){
    return typeof value==='number' && Number.isFinite(value) &&
      value>=min && value<=max;
  }

  function optionalName(value){
    return value===null ||
      (typeof value==='string' && value.length>0 && value.length<=80);
  }

  function validTimeZone(value){
    if(typeof value!=='string' || !value || value.length>80) return false;
    try{
      new Intl.DateTimeFormat('en',{timeZone:value}).format(0);
      return true;
    } catch(error){
      return false;
    }
  }

  function getMissionPlanner(){
    if(missionPlannerApi) return missionPlannerApi;
    if(root && root.MissionPlanner) return missionPlannerApi=root.MissionPlanner;
    if(typeof module==='object' && module.exports){
      try{
        missionPlannerApi=require('./mission-planner.js');
      } catch(error){
        missionPlannerApi=null;
      }

    }
    return missionPlannerApi;
  }

  function getSystemModel(){
    if(systemModelApi) return systemModelApi;
    if(root && root.SystemModel) return systemModelApi=root.SystemModel;
    if(typeof module==='object' && module.exports){
      try{
        systemModelApi=require('./system-model.js');
      } catch(error){
        systemModelApi=null;
      }
    }
    return systemModelApi;
  }

  function validMissionPlan(value){
    if(value===null) return true;
    const missionPlanner=getMissionPlanner();
    try{
      return !!missionPlanner &&
        typeof missionPlanner.validatePlan==='function' &&
        missionPlanner.validatePlan(value);
    } catch(error){
      return false;
    }
  }

  function validate(state){
    if(!state || ![LEGACY_VERSION,MISSION_VERSION,VERSION].includes(state.v)){
      return false;
    }
    const editable=state.v===VERSION && state.system!==null &&
      state.system!==undefined;
    if(!finite(
      state.t,
      editable ? -TIME_LIMIT_DAYS : -200000,
      editable ? TIME_LIMIT_DAYS : 36600
    )) return false;
    if(typeof state.playing!=='boolean') return false;
    if(!finite(state.speed,-2,4.2)) return false;
    if(state.direction!==1 && state.direction!==-1) return false;
    if(!optionalName(state.selected) || !optionalName(state.follow)) return false;
    const view=state.view;
    if(!view || !finite(view.zoom,0.018,2000000) ||
      !finite(view.panX,-100000,100000) ||
      !finite(view.panY,-100000,100000) ||
      !finite(view.yaw,-1000,1000) ||
      !finite(view.tilt,0,Math.PI)) return false;
    const layers=state.layers;
    if(!layers || ['spacecraft','comets','lagrange','rotating'].some(
      key=>typeof layers[key]!=='boolean'
    )) return false;
    if(state.observatory!==null){
      const obs=state.observatory;
      if(!(!!obs &&
        typeof obs.body==='string' && obs.body.length<=80 &&
        finite(obs.latitude,-90,90) &&
        finite(obs.longitude,-180,180) &&
        finite(obs.azimuth,0,Math.PI*2) &&
        finite(obs.altitude,-Math.PI/2,Math.PI/2) &&
        finite(obs.fov,0.05*Math.PI/180,120*Math.PI/180) &&
        finite(obs.speed,0,3.6) &&
        typeof obs.enhance==='boolean' &&
        typeof obs.paths==='boolean' &&
        (
          obs.clouds===undefined ||
          (
            typeof obs.clouds==='boolean' &&
            (!obs.clouds || obs.body==='Earth')
          )
        ) &&
        validTimeZone(obs.timeZone))) return false;
      if(obs.telescope!==undefined && obs.telescope!==null){
        const telescope=obs.telescope;
        if(!(!!telescope &&
          optionalName(telescope.target) &&
          typeof telescope.tracking==='boolean' &&
          (
            telescope.reticle===undefined ||
            typeof telescope.reticle==='boolean'
          ) &&
          finite(telescope.exposure,0.5,3) &&
          finite(telescope.wideFov,8*Math.PI/180,120*Math.PI/180))){
          return false;
        }
      }
    }
    if(state.spacecraftView!==undefined && state.spacecraftView!==null){
      const view=state.spacecraftView;
      if(state.observatory!==null) return false;
      if(!(!!view &&
        finite(view.yaw,-1000,1000) &&
        finite(view.pitch,-Math.PI/2,Math.PI/2) &&
        finite(view.fov,8*Math.PI/180,120*Math.PI/180))) return false;
      if(!state.missionPlan ||
        !Array.isArray(state.missionPlan.selectedTimes)) return false;
    }
    if(state.v>=MISSION_VERSION && !('missionPlan' in state)) return false;
    if(state.v>=MISSION_VERSION && !validMissionPlan(state.missionPlan)) return false;
    if(state.v===VERSION){
      if(!('system' in state)) return false;
      if(state.system!==null){
        const model=getSystemModel();
        if(!model || !model.validateEditableSystem(state.system)) return false;
        if(state.t<state.system.epoch) return false;
      }
    }
    return true;
  }

  function base64Encode(text){
    if(typeof Buffer!=='undefined'){
      return Buffer.from(text,'utf8').toString('base64');
    }
    const bytes=new TextEncoder().encode(text);
    let binary='';
    for(const byte of bytes) binary+=String.fromCharCode(byte);
    return btoa(binary);
  }

  function base64Decode(text){
    if(typeof Buffer!=='undefined'){
      return Buffer.from(text,'base64').toString('utf8');
    }
    const binary=atob(text);
    const bytes=Uint8Array.from(binary,char=>char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function encode(state){
    if(!validate(state)) throw new TypeError('Invalid scenario state.');
    const scenario={...state,v:VERSION};
    scenario.missionPlan=state.v>=MISSION_VERSION ? state.missionPlan : null;
    scenario.system=state.v===VERSION ? state.system : null;
    return base64Encode(JSON.stringify(scenario))
      .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }

  function decode(value){
    if(typeof value!=='string' || !value || value.length>4096) return null;
    try{
      const padded=value.replace(/-/g,'+').replace(/_/g,'/')+
        '='.repeat((4-value.length%4)%4);
      const state=JSON.parse(base64Decode(padded));
      return validate(state)?state:null;
    } catch(error){
      return null;
    }
  }

  function scenarioFromUrl(href){
    try{
      return decode(new URL(href).searchParams.get(PARAM));
    } catch(error){
      return null;
    }
  }

  function urlWithScenario(href,state){
    const url=new URL(href);
    url.searchParams.set(PARAM,encode(state));
    url.hash='';
    return url.toString();
  }

  return {VERSION,PARAM,validate,encode,decode,scenarioFromUrl,urlWithScenario};
});
