(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.SystemModel=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const MAX_BODIES=128;
  const TIME_LIMIT_DAYS=10000000;
  const STATE_KEYS=['x','y','z','vx','vy','vz'];

  function runtimeId(body,index=0){
    if(typeof body?.id==='string' && body.id) return body.id;
    const stem=String(body?.name||'body').toLowerCase()
      .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'body';
    return 'body-'+stem+'-'+index;
  }

  function deletionClosure(bodies,targetId){
    const removedIds=new Set([targetId]);
    const removedNames=new Set();
    let changed=true;
    while(changed){
      changed=false;
      for(const body of bodies){
        if(removedIds.has(body.id)){
          if(!removedNames.has(body.name)){
            removedNames.add(body.name);
            changed=true;
          }
          continue;
        }
        if(
          removedIds.has(body.parentId) ||
          (body.parentName && removedNames.has(body.parentName))
        ){
          removedIds.add(body.id);
          changed=true;
        }
      }
    }
    return removedIds;
  }

  function isLuminous(body){
    return body?.luminous===true || body?.kind==='sun' ||
      body?.appearance==='star';
  }

  function gravityStrength(body){
    if(Number.isFinite(body?.mu)) return body.mu;
    return Number.isFinite(body?.massKg) ? body.massKg : 0;
  }

  function dominantLightBody(bodies){
    return bodies.filter(isLuminous).reduce(
      (best,body)=>!best || gravityStrength(body)>gravityStrength(best)
        ? body : best,
      null
    );
  }

  function catalogEntries(bodies){
    return bodies.map(body=>({
      id:body.id,
      name:body.name,
      assist:body.assist===true,
      target:body.target!==false && !isLuminous(body)
    }));
  }

  function finite(value,min,max){
    return typeof value==='number' && Number.isFinite(value) &&
      value>=min && value<=max;
  }

  function optionalString(value,max=80){
    return value===undefined || value===null ||
      (typeof value==='string' && value.length<=max);
  }

  function validBody(body){
    if(!body || typeof body.id!=='string' || !body.id || body.id.length>100 ||
      typeof body.name!=='string' || !body.name || body.name.length>80 ||
      typeof body.kind!=='string' || !body.kind || body.kind.length>40 ||
      !optionalString(body.category) || !optionalString(body.appearance,40) ||
      !optionalString(body.color,20) || !optionalString(body.parentId,100) ||
      !optionalString(body.parentName,80) ||
      !optionalString(body.dynamicClass,20) ||
      !optionalString(body.notes,500) ||
      (body.dynamicClass!==undefined && body.dynamicClass!=='particle') ||
      (body.initialInclination!==undefined &&
        !finite(body.initialInclination,0,180)) ||
      !finite(body.radius===undefined?0:body.radius,0,1e12) ||
      !finite(body.massKg===undefined?0:body.massKg,0,1e35) ||
      !finite(body.mu===undefined?0:body.mu,0,1e8) ||
      !body.state) return false;
    return STATE_KEYS.every(key=>finite(body.state[key],-1e9,1e9));
  }

  function validateEditableSystem(system){
    if(!system || system.mode!=='editable' ||
      !finite(system.epoch,-TIME_LIMIT_DAYS,TIME_LIMIT_DAYS) ||
      !Array.isArray(system.bodies) || system.bodies.length>MAX_BODIES ||
      !system.bodies.every(validBody)) return false;
    const ids=new Set(), names=new Set();
    for(const body of system.bodies){
      if(ids.has(body.id) || names.has(body.name)) return false;
      ids.add(body.id);
      names.add(body.name);
    }
    return system.bodies.every(body=>
      !body.parentId || ids.has(body.parentId)
    );
  }

  return {
    MAX_BODIES,TIME_LIMIT_DAYS,STATE_KEYS,runtimeId,deletionClosure,isLuminous,
    dominantLightBody,catalogEntries,validateEditableSystem
  };
});
