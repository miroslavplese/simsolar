(function(root,factory){
  const api={create:factory};
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.SimSolarSimulation=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(deps){
  'use strict';

  const {window}=deps;
  const {SystemModel}=window;
  const {AU_KM,sampledStateAt,propagateState,osculatingOrbitPoints,bodyPosition}=window.TrajectoryMath;
  const {MAJOR_MOONS}=window.MoonSystem;
  const {
    GM_BY_BODY,MOON_GM_BY_BODY,MASS_KG,massKgToMu,cloneState,createBarycentricState,
    createSimulator,heliocentricState,bodyState
  }=window.NBodySimulation;
  const {
    createInitialState:createMoonInitialState,createSimulator:createMoonSimulator,
    bodyState:moonBodyState
  }=window.HierarchicalMoonSimulation;
  const {
    HYBRID_EPOCH_DAYS,planetCutoffData,moonCutoffData,planets,spacecraft,comets,builtInBodies,
    sunReference
  }=deps.catalog;
  const {daysSinceJ2000}=deps.constants;

  function stateVectorAtEpoch(points){
    const sampled=sampledStateAt(points,HYBRID_EPOCH_DAYS);
    if(sampled) return sampled;
    const last=points[points.length-1];
    if(HYBRID_EPOCH_DAYS<last[0]){
      throw new Error('Hybrid epoch precedes the available state-vector range.');
    }
    return propagateState({
      t:last[0],x:last[1],y:last[2],z:last[3],
      vx:last[4],vy:last[5],vz:last[6]
    },HYBRID_EPOCH_DAYS-last[0]);
  }

  function stateVectorFromPoint(point){
    return {
      t:point[0],x:point[1],y:point[2],z:point[3],
      vx:point[4],vy:point[5],vz:point[6]
    };
  }

  const moonSystemParents=[
    'Earth','Mars','Jupiter','Saturn','Uranus','Neptune'
  ];
  const moonInitial=createMoonInitialState(
    HYBRID_EPOCH_DAYS,
    moonSystemParents.map(parentName=>({
      parentName,
      systemMu:GM_BY_BODY[parentName],
      parentState:stateVectorFromPoint(
        planetCutoffData[parentName].point
      ),
      moons:MAJOR_MOONS.filter(moon=>moon.parentName===parentName).map(moon=>({
        name:moon.name,
        mu:MOON_GM_BY_BODY[moon.name],
        state:stateVectorFromPoint(moonCutoffData[moon.name].point)
      }))
    }))
  );
  const massiveDefinitions=[
    {
      name:'Sun',mu:GM_BY_BODY.Sun,
      state:{x:0,y:0,z:0,vx:0,vy:0,vz:0}
    },
    ...planets.map(body=>({
      name:body.name,
      mu:GM_BY_BODY[body.name],
      state:moonInitial.barycenters[body.name] ||
        stateVectorFromPoint(planetCutoffData[body.name].point)
    }))
  ];
  const particleDefinitions=[
    ...spacecraft.map(body=>({
      name:body.name,
      adaptiveFactor:body.name==='Parker Solar Probe' ? 300 : undefined,
      state:stateVectorAtEpoch(body._trajectoryPoints)
    })),
    ...comets.map(body=>({
      name:body.name,
      state:stateVectorAtEpoch(body._trajectoryPoints)
    }))
  ];
  const hybridInitialState=createBarycentricState(
    HYBRID_EPOCH_DAYS,massiveDefinitions,particleDefinitions
  );
  const hybridBaseSimulator=createSimulator(hybridInitialState,{
    stepDays:0.25,particleStepDays:0.03125,checkpointDays:8
  });
  let hybridBranchSequence=0;
  const hybridBranches=[{
    id:hybridBranchSequence,
    epoch:HYBRID_EPOCH_DAYS,
    simulator:hybridBaseSimulator
  }];
  let moonBranchSequence=0;
  const moonBranches=[{
    id:moonBranchSequence,
    epoch:HYBRID_EPOCH_DAYS,
    simulator:createMoonSimulator(
      moonInitial.state,moonExternalStateAt
    )
  }];
  const customBodies=[];
  let editableSystem=null;
  let runtimeBodySequence=0;
  const HYBRID_MAX_DAYS=daysSinceJ2000(Date.parse('2100-01-01T00:00:00Z'));
  const hybridSnapshotCache=new Map();
  const moonSnapshotCache=new Map();
  const moonExternalCache=new Map();

  let editableSnapshotCache={system:null,time:NaN,state:null};

  function activeSystemBodies(){
    return editableSystem ? editableSystem.bodies : builtInBodies;
  }

  function isBodyActive(body){
    return !!body && activeSystemBodies().includes(body);
  }

  function activeBodiesOf(list){
    return list.filter(isBodyActive);
  }

  function editableSnapshotAt(tDays){
    if(!editableSystem || tDays<editableSystem.epoch) return null;
    if(
      editableSnapshotCache.system!==editableSystem ||
      editableSnapshotCache.time!==tDays
    ){
      editableSnapshotCache={
        system:editableSystem,
        time:tDays,
        state:editableSystem.simulator.stateAt(tDays)
      };
    }
    return editableSnapshotCache.state;
  }

  function gravitationalParameterForBody(body){
    return body.mu??(GM_BY_BODY[body.name]||MOON_GM_BY_BODY[body.name]||
      (body.massKg ? massKgToMu(body.massKg) : 0));
  }

  function stateDefinitionForBody(body,state){
    const mu=gravitationalParameterForBody(body);
    return {
      id:body.id,name:body.name,mu,
      adaptiveFactor:body.adaptiveFactor,state
    };
  }

  function editablePositionForBody(body,tDays){
    const snapshot=editableSnapshotAt(tDays);
    if(!snapshot || !isBodyActive(body)) return null;
    const state=bodyState(snapshot,body.id);
    if(!state) return null;
    return {
      ...state,
      r:Math.hypot(state.x,state.y,state.z),
      speedKmS:Math.hypot(state.vx,state.vy,state.vz)*AU_KM/86400,
      nbody:true,barycentric:true
    };
  }

  function editableOrbitReference(body,tDays){
    const snapshot=editableSnapshotAt(tDays);
    if(!snapshot) return null;
    return SystemModel.orbitReference(
      body,activeSystemBodies(),candidate=>bodyState(snapshot,candidate.id),
      gravitationalParameterForBody
    );
  }

  function editableOrbitPoints(body,tDays,steps=220){
    const reference=editableOrbitReference(body,tDays);
    if(!reference) return [];
    const {relative,origin,mu,scale}=reference;
    return osculatingOrbitPoints(relative,mu,steps).map(point=>({
      x:origin.x+point.x*scale,
      y:origin.y+point.y*scale,
      z:origin.z+point.z*scale
    }));
  }

  function hybridBranchAt(tDays){
    let branch=hybridBranches[0];
    for(const candidate of hybridBranches){
      if(candidate.epoch<=tDays) branch=candidate; else break;
    }
    return branch;
  }

  function hybridSnapshotAt(tDays){
    const branch=hybridBranchAt(tDays);
    const cacheKey=branch.id+':'+tDays;
    if(hybridSnapshotCache.has(cacheKey)) return hybridSnapshotCache.get(cacheKey);
    const snapshot=branch.simulator.stateAt(tDays);
    hybridSnapshotCache.set(cacheKey,snapshot);
    if(hybridSnapshotCache.size>512){
      hybridSnapshotCache.delete(hybridSnapshotCache.keys().next().value);
    }
    return snapshot;
  }

  function moonExternalStateAt(tDays){
    const branch=hybridBranchAt(tDays);
    const intervalDays=1;
    const exactIndex=(tDays-branch.epoch)/intervalDays;
    const lowerIndex=Math.floor(exactIndex+1e-10);
    const fraction=Math.max(0,Math.min(1,exactIndex-lowerIndex));
    const lowerTime=branch.epoch+lowerIndex*intervalDays;
    const cacheKey=branch.id+':'+lowerIndex;
    let interval=moonExternalCache.get(cacheKey);
    if(!interval){
      interval={
        lower:branch.simulator.massiveStateAt(lowerTime),
        upper:branch.simulator.massiveStateAt(lowerTime+intervalDays)
      };
      moonExternalCache.set(cacheKey,interval);
      if(moonExternalCache.size>64){
        moonExternalCache.delete(moonExternalCache.keys().next().value);
      }
    }
    if(fraction<1e-10) return interval.lower;
    return interval.lower.map((body,index)=>{
      const upper=interval.upper[index];
      return {
        ...body,
        x:body.x+(upper.x-body.x)*fraction,
        y:body.y+(upper.y-body.y)*fraction,
        z:body.z+(upper.z-body.z)*fraction,
        vx:body.vx+(upper.vx-body.vx)*fraction,
        vy:body.vy+(upper.vy-body.vy)*fraction,
        vz:body.vz+(upper.vz-body.vz)*fraction
      };
    });
  }

  function moonBranchAt(tDays){
    let branch=moonBranches[0];
    for(const candidate of moonBranches){
      if(candidate.epoch<=tDays) branch=candidate; else break;
    }
    return branch;
  }

  function moonSnapshotAt(tDays){
    const branch=moonBranchAt(tDays);
    const cacheKey=branch.id+':'+tDays;
    if(moonSnapshotCache.has(cacheKey)) return moonSnapshotCache.get(cacheKey);
    const snapshot=branch.simulator.stateAt(tDays);
    moonSnapshotCache.set(cacheKey,snapshot);
    if(moonSnapshotCache.size>512){
      moonSnapshotCache.delete(moonSnapshotCache.keys().next().value);
    }
    return snapshot;
  }

  function integratedMoonRelativeStateAt(moon,tDays){
    if(tDays>=HYBRID_EPOCH_DAYS){
      const system=moonSnapshotAt(tDays).systems.find(
        item=>item.parentName===moon.parentName
      );
      return system.moons.find(item=>item.name===moon.name);
    }
    const system=moonInitial.state.systems.find(
      item=>item.parentName===moon.parentName
    );
    const state=system.moons.find(item=>item.name===moon.name);
    return {
      ...propagateState(
        state,tDays-HYBRID_EPOCH_DAYS,system.parentMu+state.mu
      ),
      name:state.name,
      mu:state.mu
    };
  }

  function hierarchicalPositionForBody(obj,tDays){
    const isMoon=obj.kind==='moon';
    if(!isMoon && !moonSystemParents.includes(obj.name)) return null;
    if(tDays<HYBRID_EPOCH_DAYS){
      if(!isMoon) return null;
      const parent=planets.find(body=>body.name===obj.parentName);
      const parentState=positionForBody(parent,tDays);
      const relative=integratedMoonRelativeStateAt(obj,tDays);
      return {
        x:parentState.x+relative.x,
        y:parentState.y+relative.y,
        z:parentState.z+relative.z,
        vx:parentState.vx+relative.vx,
        vy:parentState.vy+relative.vy,
        vz:parentState.vz+relative.vz,
        r:Math.hypot(
          parentState.x+relative.x,
          parentState.y+relative.y,
          parentState.z+relative.z
        ),
        speedKmS:Math.hypot(
          parentState.vx+relative.vx,
          parentState.vy+relative.vy,
          parentState.vz+relative.vz
        )*AU_KM/86400,
        sampled:false,parentRelative:true
      };
    }
    const global=hybridSnapshotAt(tDays);
    const state=moonBodyState(
      moonSnapshotAt(tDays),global.massive,obj.name
    );
    if(!state) return null;
    const sun=global.massive.find(body=>body.name==='Sun');
    const result={
      x:state.x-sun.x,y:state.y-sun.y,z:state.z-sun.z,
      vx:state.vx-sun.vx,vy:state.vy-sun.vy,vz:state.vz-sun.vz
    };
    return {
      ...result,
      r:Math.hypot(result.x,result.y,result.z),
      speedKmS:Math.hypot(result.vx,result.vy,result.vz)*AU_KM/86400,
      sampled:false,nbody:true,parentRelative:isMoon
    };
  }

  function hybridPositionForBody(obj,tDays){
    if(
      tDays<HYBRID_EPOCH_DAYS ||
      (obj.introducedAt && tDays<obj.introducedAt) ||
      (obj.retiredAt!==undefined && tDays>=obj.retiredAt)
    ){
      return null;
    }
    const state=heliocentricState(hybridSnapshotAt(tDays),obj.name);
    if(!state) return null;
    return {
      ...state,
      r:Math.hypot(state.x,state.y,state.z),
      speedKmS:Math.hypot(state.vx,state.vy,state.vz)*AU_KM/86400,
      sampled:false,nbody:true
    };
  }

  function trajectoryPointAt(obj, tDays){
    return sampledStateAt(obj._trajectoryPoints,tDays);
  }

  function continuationOrigin(obj){
    if(!obj._continuationOrigin){
      const last=obj._trajectoryPoints[obj._trajectoryPoints.length-1];
      obj._continuationOrigin={
        t:last[0],x:last[1],y:last[2],z:last[3],
        vx:last[4],vy:last[5],vz:last[6]
      };
    }
    return obj._continuationOrigin;
  }

  function continuationPointAt(obj,tDays){
    const origin=continuationOrigin(obj);
    const state=propagateState(origin,tDays-origin.t);
    return {
      x:state.x,y:state.y,z:state.z,r:Math.hypot(state.x,state.y,state.z),
      speedKmS:Math.hypot(state.vx,state.vy,state.vz)*AU_KM/86400,
      sampled:false,propagated:true
    };
  }

  function positionForBody(obj, tDays){
    if(editableSystem) return editablePositionForBody(obj,tDays);
    if(obj===sunReference){
      return {x:0,y:0,z:0,vx:0,vy:0,vz:0,r:0,speedKmS:0};
    }
    if(obj.kind==='lagrange') return deps.lagrange.lagrangePositionForBody(obj,tDays);
    const hierarchical=hierarchicalPositionForBody(obj,tDays);
    if(hierarchical) return hierarchical;
    const integrated=hybridPositionForBody(obj,tDays);
    if(integrated) return integrated;
    if(obj.kind==='custom') return null;
    if(obj.kind==='planet' && obj._ephemerisPoints){
      const ephemeris=sampledStateAt(obj._ephemerisPoints,tDays);
      if(ephemeris) return ephemeris;
    }
    if(obj.kind==='comet' && obj._trajectoryPoints){
      return trajectoryPointAt(obj,tDays);
    }
    if(obj.kind==='spacecraft' && obj._trajectoryPoints){
      if(tDays < obj._trajectoryPoints[0][0]) return null;
      const sampled = trajectoryPointAt(obj,tDays);
      if(sampled) return sampled;
      return continuationPointAt(obj,tDays);
    }
    return bodyPosition(obj,tDays);
  }

  function rebuildEditableAt(bodies,tDays){
    const snapshot=editableSnapshotAt(tDays);
    const massive=[], particles=[];
    for(const body of bodies){
      const state=bodyState(snapshot,body.id);
      if(!state) continue;
      const definition=stateDefinitionForBody(body,state);
      if(body.dynamicClass==='particle' || !(definition.mu>0)){
        particles.push(definition);
      } else {
        massive.push(definition);
      }
    }
    const state=createBarycentricState(
      tDays,massive,particles
    );
    editableSystem={
      epoch:tDays,bodies:[...bodies],
      initialState:cloneState(state),
      simulator:createSimulator(state,{
        stepDays:0.25,particleStepDays:0.03125,checkpointDays:8
      })
    };
    customBodies.splice(0,customBodies.length,
      ...bodies.filter(body=>body.kind==='custom'));
  }

  function serializedEditableSystem(){
    if(!editableSystem) return null;
    return {
      mode:'editable',
      epoch:Number(editableSystem.epoch.toFixed(6)),
      bodies:editableSystem.bodies.map(body=>{
        const state=bodyState(editableSystem.initialState,body.id);
        return {
          id:body.id,name:body.name,kind:body.kind,
          category:body.category,appearance:body.appearance,
          color:body.color,radius:body.radius||0,
          massKg:body.massKg||MASS_KG[body.name]||0,
          mu:body.mu||GM_BY_BODY[body.name]||MOON_GM_BY_BODY[body.name]||0,
          parentId:body.parentId,parentName:body.parentName,
          orbitPrimaryIds:body.orbitPrimaryIds,
          genericSurface:body.genericSurface,
          dynamicClass:body.dynamicClass,
          initialInclination:body.initialInclination,
          notes:body.notes,
          state
        };
      })
    };
  }

  function restoreEditableSystem(system){
    const bodies=system.bodies.map(definition=>{
      const builtIn=builtInBodies.find(body=>body.id===definition.id);
      if(builtIn) return builtIn;
      return {
        id:definition.id,name:definition.name,kind:definition.kind,
        category:definition.category,appearance:definition.appearance,
        color:definition.color||'#70b7ff',radius:definition.radius,
        massKg:definition.massKg,mu:definition.mu,
        parentId:definition.parentId,parentName:definition.parentName,
        orbitPrimaryIds:definition.orbitPrimaryIds,
        genericSurface:definition.genericSurface,
        dynamicClass:definition.dynamicClass,
        adaptiveFactor:48,
        initialInclination:definition.initialInclination,
        notes:definition.notes||'Restored custom system body.'
      };
    });
    for(const body of bodies){
      if(body.parentId){
        body.parent=bodies.find(parent=>parent.id===body.parentId)||null;
      }
    }
    const massive=[],particles=[];
    for(const definition of system.bodies){
      const body=bodies.find(candidate=>candidate.id===definition.id);
      const entry={
        id:definition.id,name:definition.name,mu:definition.mu,
        adaptiveFactor:body.adaptiveFactor,
        state:definition.state
      };
      if(body.dynamicClass==='particle' ||
        body.kind==='spacecraft'||body.kind==='comet'||!(entry.mu>0)){
        body.dynamicClass='particle';
        particles.push(entry);
      } else {
        massive.push(entry);
      }
    }
    const state=createBarycentricState(system.epoch,massive,particles);
    editableSystem={
      epoch:system.epoch,bodies,initialState:cloneState(state),
      simulator:createSimulator(state,{
        stepDays:0.25,particleStepDays:0.03125,checkpointDays:8
      })
    };
    customBodies.splice(0,customBodies.length,
      ...bodies.filter(body=>body.kind==='custom'));
  }

  function clearCaches(){
    hybridSnapshotCache.clear();
    moonSnapshotCache.clear();
    moonExternalCache.clear();
    editableSnapshotCache={system:null,time:NaN,state:null};
  }

  function nextBodyId(){
    return 'custom-'+Date.now().toString(36)+'-'+(++runtimeBodySequence);
  }

  return {
    get editableSystem(){ return editableSystem; },
    set editableSystem(value){ editableSystem=value; },
    positionForBody,
    stateDefinitionForBody,
    hybridPositionForBody,
    continuationOrigin,
    activeSystemBodies,
    gravitationalParameterForBody,
    HYBRID_MAX_DAYS,
    hybridBranchAt,
    moonBranchAt,
    isBodyActive,
    activeBodiesOf,
    moonInitial,
    customBodies,
    editableSnapshotAt,
    editableOrbitPoints,
    trajectoryPointAt,
    integratedMoonRelativeStateAt,
    editableOrbitReference,
    rebuildEditableAt,
    clearCaches,
    nextBodyId,
    serializedEditableSystem,
    restoreEditableSystem
  };
});
