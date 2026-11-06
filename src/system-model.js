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
      kind:body.kind,
      parentId:body.parentId,
      parentName:body.parentName,
      assist:body.assist===true,
      target:body.target!==false && !isLuminous(body)
    }));
  }

  function orbitReference(body,bodies,stateAt,muForBody=body=>body.mu||0){
    const current=stateAt(body);
    if(!current) return null;
    const stars=bodies.filter(isLuminous);
    const parent=bodies.find(candidate=>
      candidate.id===body.parentId || candidate.name===body.parentName
    );
    let primaries;
    if(isLuminous(body)){
      primaries=body.orbitPrimaryIds?.length
        ? bodies.filter(candidate=>body.orbitPrimaryIds.includes(candidate.id))
        : stars.length===2 ? stars.filter(candidate=>candidate!==body)
          : parent ? [parent] : [];
    } else {
      primaries=parent ? [parent] :
        body.kind==='custom' && stars.length<2 ? [] : stars;
    }
    const sources=primaries.filter(primary=>primary!==body).map(primary=>({
      state:stateAt(primary),mu:muForBody(primary)
    })).filter(source=>source.state && source.mu>0);
    const primaryMu=sources.reduce((sum,source)=>sum+source.mu,0);
    if(!(primaryMu>0)) return null;
    const origin={},relative={};
    for(const key of STATE_KEYS){
      origin[key]=sources.reduce(
        (sum,source)=>sum+source.state[key]*source.mu/primaryMu,0
      );
      relative[key]=current[key]-origin[key];
    }
    const mu=primaryMu+muForBody(body);
    const scale=isLuminous(body) ? primaryMu/mu : 1;
    if(isLuminous(body)){
      // Convert the relative two-body conic into this star's own trajectory
      // about the pair/group barycenter, rather than a moving parent.
      for(const key of STATE_KEYS) origin[key]=current[key]-relative[key]*scale;
    }
    return {origin,relative,mu,scale};
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
      (body.genericSurface!==undefined &&
        typeof body.genericSurface!=='boolean') ||
      (body.orbitPrimaryIds!==undefined && (
        !Array.isArray(body.orbitPrimaryIds) ||
        body.orbitPrimaryIds.length>MAX_BODIES ||
        !body.orbitPrimaryIds.every(id=>typeof id==='string' && id.length<=100) ||
        new Set(body.orbitPrimaryIds).size!==body.orbitPrimaryIds.length
      )) ||
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
      (!body.parentId || ids.has(body.parentId)) &&
      (!body.orbitPrimaryIds || body.orbitPrimaryIds.every(
        id=>id!==body.id && ids.has(id)
      ))
    );
  }

  return {
    MAX_BODIES,TIME_LIMIT_DAYS,STATE_KEYS,runtimeId,deletionClosure,isLuminous,
    dominantLightBody,catalogEntries,orbitReference,validateEditableSystem
  };
});
