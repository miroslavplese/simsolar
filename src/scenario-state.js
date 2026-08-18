(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.ScenarioState=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const VERSION=1;
  const PARAM='scenario';

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

  function validate(state){
    if(!state || state.v!==VERSION) return false;
    if(!finite(state.t,-200000,100000)) return false;
    if(typeof state.playing!=='boolean') return false;
    if(!finite(state.speed,-2,4.2)) return false;
    if(state.direction!==1 && state.direction!==-1) return false;
    if(!optionalName(state.selected) || !optionalName(state.follow)) return false;
    const view=state.view;
    if(!view || !finite(view.zoom,0.018,20000) ||
      !finite(view.panX,-100000,100000) ||
      !finite(view.panY,-100000,100000) ||
      !finite(view.yaw,-1000,1000) ||
      !finite(view.tilt,0,Math.PI)) return false;
    const layers=state.layers;
    if(!layers || ['spacecraft','comets','lagrange','rotating'].some(
      key=>typeof layers[key]!=='boolean'
    )) return false;
    if(state.observatory===null) return true;
    const obs=state.observatory;
    return !!obs &&
      typeof obs.body==='string' && obs.body.length<=80 &&
      finite(obs.latitude,-90,90) &&
      finite(obs.longitude,-180,180) &&
      finite(obs.azimuth,0,Math.PI*2) &&
      finite(obs.altitude,-Math.PI/2,Math.PI/2) &&
      finite(obs.fov,8*Math.PI/180,120*Math.PI/180) &&
      finite(obs.speed,0,3.6) &&
      typeof obs.enhance==='boolean' &&
      typeof obs.paths==='boolean' &&
      validTimeZone(obs.timeZone);
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
    return base64Encode(JSON.stringify(state))
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
