(function(root,factory){
  const api={create:factory};
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.SimSolarOrbits=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(deps){
  'use strict';

  const {window}=deps;
  const {AsteroidBelt}=window;
  const {
    interpolateTrajectory,propagateState,appendIncrementalTrajectoryPoint,
    simplifyProjectedPath,osculatingOrbitPoints,orbitalToEcliptic
  }=window.TrajectoryMath;
  const {pathSegmentsByDepth}=window.BodyRendering;
  const {GM_BY_BODY,MOON_GM_BY_BODY}=window.NBodySimulation;
  const {HYBRID_EPOCH_DAYS,charon,planets}=deps.catalog;
  const {AU_PX,daysSinceJ2000}=deps.constants;
  const {
    hybridPositionForBody,continuationOrigin,editableSnapshotAt,editableOrbitPoints,
    trajectoryPointAt,integratedMoonRelativeStateAt,moonInitial
  }=deps.simulation;
  const {project}=deps.camera;
  const {orbitCtx,ctx}=deps.viewport;
  const {visibleBodies,visibleMoons,isMoonSystemVisible}=deps.visibility;
  const {hexToRgba}=deps.surfaces;

  const asteroidBeltPoints=AsteroidBelt.createPoints();

  const hybridTrailCache=new Map();

  function ensureHybridTrail(obj,tDays,currentState){
    const trailEpoch=deps.simulation.editableSystem?.epoch||obj.introducedAt||HYBRID_EPOCH_DAYS;
    const span=Math.max(0,tDays-trailEpoch);
    const preferredStep=obj.name==='Parker Solar Probe' ? 0.5 : 2;
    const step=span>365
      ? 8*Math.max(1,Math.ceil(span/(8*1000)))
      : preferredStep;
    const rawTolerance=0.75/(AU_PX*deps.camera.zoom);
    const tolerance=2**Math.round(Math.log2(rawTolerance));
    let cache=hybridTrailCache.get(obj);
    if(!cache){
      const origin=hybridPositionForBody(obj,trailEpoch);
      cache={
        step,tolerance,
        points:[{t:trailEpoch,...origin}]
      };
      hybridTrailCache.set(obj,cache);
    }
    cache.step=step;
    cache.tolerance=tolerance;
    const state=currentState||hybridPositionForBody(obj,tDays);
    if(!state) return cache.points;
    appendIncrementalTrajectoryPoint(
      cache.points,{...state,t:tDays},
      {minDistance:tolerance,maxSpan:step,maxPoints:4000}
    );
    return cache.points;
  }

  function ensureContinuation(obj,tDays){
    const origin=continuationOrigin(obj);
    const span=Math.max(0,tDays-origin.t);
    const preferredStep=obj.name==='Parker Solar Probe' ? 0.5 : 20;
    const step=preferredStep*Math.max(1,Math.ceil(span/(preferredStep*5000)));
    if(!obj._continuationPoints || obj._continuationStep!==step){
      obj._continuationPoints=[origin];
      obj._continuationStep=step;
    }
    const points=obj._continuationPoints;
    while(points[points.length-1].t+step<tDays){
      const nextT=points[points.length-1].t+step;
      points.push(propagateState(origin,nextT-origin.t));
    }
    return points;
  }

  function smoothTrajectoryPoints(points){
    const smoothed=[];
    const totalSpan=points[points.length-1][0]-points[0][0];
    const MAX_RENDER_STEP_DAYS=Math.max(2,totalSpan/4000);
    for(let i=0;i<points.length-1;i++){
      const start=points[i][0], span=points[i+1][0]-start;
      const steps=Math.max(1,Math.ceil(span/MAX_RENDER_STEP_DAYS));
      for(let step=0;step<steps;step++){
        const t=start+span*(step/steps);
        const p=interpolateTrajectory(points,i,t);
        smoothed.push({t,x:p.x,y:p.y,z:p.z});
      }
    }
    const last=points[points.length-1];
    smoothed.push({t:last[0],x:last[1],y:last[2],z:last[3]});
    return smoothed;
  }

  function orbitWorldPoints(obj, nuFrom, nuTo, steps){
    const p = obj.a*(1 - obj.e*obj.e);
    const pts = [];
    steps = steps || 220;
    for(let i=0;i<=steps;i++){
      const nu = nuFrom + (nuTo-nuFrom)*(i/steps);
      const r = p/(1+obj.e*Math.cos(nu));
      const xp = r*Math.cos(nu), yp = r*Math.sin(nu);
      const pos = orbitalToEcliptic(obj, xp, yp);
      pts.push({x:pos.x,y:pos.y,z:pos.z,nu});
    }
    return pts;
  }
  function fullNuRange(obj){
    if(obj.e < 1) return [-Math.PI, Math.PI];
    const nuInf = Math.acos(-1/obj.e)*0.985;
    return [-nuInf, nuInf];
  }

  function getOrbitWorldPoints(obj){
    if(!obj._orbitWorldPoints){
      if(obj._trajectoryPoints){
        obj._orbitWorldPoints = smoothTrajectoryPoints(obj._trajectoryPoints);
      } else {
        const [nuMin, nuMax] = fullNuRange(obj);
        obj._orbitWorldPoints = orbitWorldPoints(obj, nuMin, nuMax);
      }
    }
    return obj._orbitWorldPoints;
  }

  function getProjectedOrbitPoints(obj){
    if(obj._projectedRevision !== deps.camera.projectionRevision){
      const pts = getOrbitWorldPoints(obj).map(p=>project(p.x,p.y,p.z));
      let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
      for(const p of pts){
        minX=Math.min(minX,p.x); minY=Math.min(minY,p.y);
        maxX=Math.max(maxX,p.x); maxY=Math.max(maxY,p.y);
      }
      obj._pathPts = pts;
      obj._renderPathPts=obj._trajectoryPoints
        ? simplifyProjectedPath(pts,0.75)
        : pts;
      obj._pathBounds = {minX,minY,maxX,maxY};
      obj._projectedRevision = deps.camera.projectionRevision;
    }
    return obj._pathPts;
  }

  function appendProjectedTrajectoryPath(
    targetCtx,obj,startIndex=0,endIndex
  ){
    const sourcePts=getProjectedOrbitPoints(obj);
    if(!sourcePts || sourcePts.length<2) return;
    const end=Math.min(
      sourcePts.length-1,
      endIndex===undefined ? sourcePts.length-1 : endIndex
    );
    const start=Math.max(0,Math.min(startIndex,end));
    const renderPts=obj._renderPathPts;
    const margin=80;
    let previous=sourcePts[start];
    let previousIndex=start;
    let drawing=false;
    function append(next){
      const visible=
        Math.max(previous.x,next.x)>=-margin &&
        Math.min(previous.x,next.x)<=deps.viewport.W+margin &&
        Math.max(previous.y,next.y)>=-margin &&
        Math.min(previous.y,next.y)<=deps.viewport.H+margin;
      if(!visible){
        drawing=false;
      } else {
        if(!drawing) targetCtx.moveTo(previous.x,previous.y);
        targetCtx.lineTo(next.x,next.y);
        drawing=true;
      }
      previous=next;
    }
    for(const point of renderPts){
      if(point.sourceIndex<=start) continue;
      if(point.sourceIndex>end) break;
      append(point);
      previousIndex=point.sourceIndex;
    }
    if(previousIndex<end) append(sourcePts[end]);
  }

  function appendVisiblePath(targetCtx,pts,startIndex,endIndex){
    if(!pts || pts.length<2) return;
    const start=Math.max(0,startIndex||0);
    const end=Math.min(
      pts.length-1,endIndex===undefined?pts.length-1:endIndex
    );
    const margin=80;
    let drawing=false;
    for(let i=start+1;i<=end;i++){
      const a=pts[i-1], b=pts[i];
      const visible=
        Math.max(a.x,b.x)>=-margin &&
        Math.min(a.x,b.x)<=deps.viewport.W+margin &&
        Math.max(a.y,b.y)>=-margin &&
        Math.min(a.y,b.y)<=deps.viewport.H+margin;
      if(!visible){
        drawing=false;
        continue;
      }
      if(!drawing) targetCtx.moveTo(a.x,a.y);
      targetCtx.lineTo(b.x,b.y);
      drawing=true;
    }
  }

  function appendVisibleSegment(targetCtx,a,b){
    if(!a || !b) return;
    const margin=80;
    if(
      Math.max(a.x,b.x)<-margin ||
      Math.min(a.x,b.x)>deps.viewport.W+margin ||
      Math.max(a.y,b.y)<-margin ||
      Math.min(a.y,b.y)>deps.viewport.H+margin
    ) return;
    targetCtx.moveTo(a.x,a.y);
    targetCtx.lineTo(b.x,b.y);
  }

  function strokePath(targetCtx, pts){
    targetCtx.beginPath();
    appendVisiblePath(targetCtx,pts);
    targetCtx.stroke();
  }

  function projectedHybridTrail(obj,points){
    let cache=obj._projectedHybridTrail;
    if(
      !cache || cache.revision!==deps.camera.projectionRevision ||
      cache.source!==points || cache.points.length>points.length
    ){
      cache={
        revision:deps.camera.projectionRevision,
        source:points,
        points:points.map(point=>project(point.x,point.y,point.z))
      };
      obj._projectedHybridTrail=cache;
    } else {
      for(let i=cache.points.length;i<points.length;i++){
        const point=points[i];
        cache.points.push(project(point.x,point.y,point.z));
      }
      if(points.length){
        const point=points[points.length-1];
        cache.points[points.length-1]=project(point.x,point.y,point.z);
      }
    }
    return cache.points;
  }

  function appendCurrentHybridTrail(targetCtx,obj,current){
    const trail=ensureHybridTrail(obj,deps.clock.simDaysSinceJ2000,current.pos);
    const projectedTrail=projectedHybridTrail(obj,trail);
    appendVisiblePath(targetCtx,projectedTrail);
  }

  function drawOrbitLayer(){
    orbitCtx.clearRect(0,0,deps.viewport.W,deps.viewport.H);
    if(!deps.simulation.editableSystem){
      AsteroidBelt.draw(
        orbitCtx,asteroidBeltPoints,project,deps.viewport.W,deps.viewport.H,AU_PX*deps.camera.zoom
      );
    }
    if(deps.lagrange.rotatingReferenceFrame){
      deps.camera.orbitLayerDirty=false;
      return;
    }
    const drawList = visibleBodies();
    const editableSnapshot=deps.simulation.editableSystem
      ? editableSnapshotAt(deps.clock.simDaysSinceJ2000)
      : null;
    for(const b of drawList){
      if(b.hideOrbit || (!editableSnapshot && b.kind==='custom') ||
        b.kind==='lagrange'
      ) continue;
      // Deep-zoom orbit culling only applies to the precomputed sol
      // orbits: in an editable system the fitted view can be deeply
      // zoomed (small systems) while the orbits are still on screen.
      if(b.kind==='planet' && deps.camera.zoom>20 && !editableSnapshot) continue;
      const isHi = b===deps.selection.hovered || b===deps.selection.selected;
      let pts;
      if(editableSnapshot){
        if(
          b.kind==='moon' || b===charon ||
          b.kind==='spacecraft' || b.kind==='comet'
        ) continue;
        const orbitPoints=editableOrbitPoints(b,deps.clock.simDaysSinceJ2000);
        if(orbitPoints.length<2) continue;
        pts=orbitPoints.map(point=>project(
          point.x,point.y,point.z
        ));
      } else {
        pts=getProjectedOrbitPoints(b);
      }
      if(b.kind==='spacecraft'){
        orbitCtx.strokeStyle = hexToRgba(b.color, isHi?0.4:0.14);
        orbitCtx.lineWidth = isHi ? 1.1 : 0.8;
        orbitCtx.setLineDash([2,4]);
      } else if(b.kind==='comet'){
        orbitCtx.strokeStyle = hexToRgba(b.color,isHi?0.8:0.32);
        orbitCtx.lineWidth = isHi ? 1.6 : 1;
        orbitCtx.setLineDash([6,4]);
      } else {
        orbitCtx.strokeStyle = isHi ? 'rgba(242,181,68,0.55)' : 'rgba(140,150,190,0.16)';
        orbitCtx.lineWidth = isHi ? 1.4 : 1;
        orbitCtx.setLineDash([]);
      }
      let visiblePath=pts;
      if(b._trajectoryPoints){
        const worldPoints=getOrbitWorldPoints(b);
        let cutoff=0;
        while(cutoff+1<worldPoints.length &&
          worldPoints[cutoff+1].t<=HYBRID_EPOCH_DAYS) cutoff++;
        orbitCtx.beginPath();
        appendProjectedTrajectoryPath(orbitCtx,b,0,cutoff);
        orbitCtx.stroke();
      } else {
        strokePath(orbitCtx,visiblePath);
      }

      if(b.kind==='spacecraft' && (isHi || deps.camera.zoom>0.8)){
        orbitCtx.setLineDash([]);
        for(const [name,date] of b.flybys){
          const pos=trajectoryPointAt(b,daysSinceJ2000(Date.parse(date+'T00:00:00Z')));
          if(!pos) continue;
          const marker=project(pos.x,pos.y,pos.z);
          orbitCtx.beginPath();
          orbitCtx.fillStyle=b.color;
          orbitCtx.arc(marker.x,marker.y,isHi?3.2:2.2,0,Math.PI*2);
          orbitCtx.fill();
          if(isHi){
            orbitCtx.font='9px "SF Mono", Consolas, monospace';
            orbitCtx.fillStyle=hexToRgba(b.color,0.85);
            orbitCtx.fillText(name,marker.x+6,marker.y-5);
          }
        }
      }
    }
    if(
      deps.tutorial.tutorialShowPlannerArtifacts &&
      deps.planner.plannerRouteSamples.length && !deps.lagrange.rotatingReferenceFrame
    ){
      orbitCtx.save();
      orbitCtx.lineCap='round';
      deps.planner.plannerRouteSamples.forEach((leg,index)=>{
        orbitCtx.beginPath();
        strokePath(orbitCtx,leg.points.map(point=>project(
          point.x,point.y,point.z
        )));
        orbitCtx.strokeStyle=index%2
          ? 'rgba(114,230,193,0.88)'
          : 'rgba(242,181,68,0.9)';
        orbitCtx.lineWidth=2.2;
        orbitCtx.shadowColor=orbitCtx.strokeStyle;
        orbitCtx.shadowBlur=5;
        orbitCtx.stroke();
      });
      orbitCtx.shadowBlur=0;
      for(const [index,waypoint] of deps.planner.activePlannerRoute.waypoints.entries()){
        const routePoint=index===0
          ? deps.planner.plannerRouteSamples[0]?.points[0]
          : deps.planner.plannerRouteSamples[index-1]?.points.at(-1);
        if(!routePoint) continue;
        const marker=project(routePoint.x,routePoint.y,routePoint.z);
        orbitCtx.beginPath();
        orbitCtx.fillStyle=index===0
          ? '#72e6c1'
          : index===deps.planner.activePlannerRoute.waypoints.length-1
            ? '#ff8f9f'
            : '#f2b544';
        orbitCtx.arc(marker.x,marker.y,4,0,Math.PI*2);
        orbitCtx.fill();
        orbitCtx.font='9px "SF Mono", Consolas, monospace';
        orbitCtx.fillText(waypoint.name,marker.x+7,marker.y-6);
      }
      orbitCtx.restore();
    }
    orbitCtx.setLineDash([]);
    deps.camera.orbitLayerDirty = false;
  }

  function drawClosePlanetOrbits(posByBody){
    if(deps.camera.zoom<=20 || deps.lagrange.rotatingReferenceFrame || deps.simulation.editableSystem) return;
    for(const planet of planets){
      if(planet===charon) continue;
      const current=posByBody.get(planet);
      if(!current) continue;
      const margin=120;
      if(
        current.scr.x<-margin || current.scr.x>deps.viewport.W+margin ||
        current.scr.y<-margin || current.scr.y>deps.viewport.H+margin
      ) continue;
      const worldPoints=osculatingOrbitPoints(
        current.pos,GM_BY_BODY.Sun+(GM_BY_BODY[planet.name]||0),256
      );
      const points=worldPoints.map(position=>
        project(position.x,position.y,position.z)
      );
      if(points.length) points[128]=current.scr;
      ctx.beginPath();
      appendVisiblePath(ctx,points);
      ctx.strokeStyle=planet===deps.selection.selected||planet===deps.selection.hovered
        ? 'rgba(242,181,68,0.55)'
        : 'rgba(140,150,190,0.24)';
      ctx.lineWidth=planet===deps.selection.selected||planet===deps.selection.hovered?1.4:1;
      ctx.stroke();
    }
  }

  function moonOrbitGeometries(posByBody){
    const geometries=[];
    function addLocalOrbit(body,parent,origin,centralMu){
      if(!parent) return;
      const points=[];
      const speedSq=origin.vx*origin.vx+origin.vy*origin.vy+origin.vz*origin.vz;
      const semimajor=-centralMu/
        (speedSq-2*centralMu/Math.hypot(origin.x,origin.y,origin.z));
      if(!(semimajor>0) || !Number.isFinite(semimajor)) return;
      const period=2*Math.PI*Math.sqrt(semimajor*semimajor*semimajor/centralMu);
      for(let i=0;i<=72;i++){
        const relative=propagateState(origin,period*i/72,centralMu);
        const point=project(
          parent.pos.x+relative.x,
          parent.pos.y+relative.y,
          parent.pos.z+relative.z
        );
        points.push(point);
      }
      body._screenOrbit=points;
      geometries.push({
        body,
        parentBody:body.parent||parent.b,
        parentDepth:parent.scr.depth,
        points
      });
    }

    for(const moon of visibleMoons()){
      const parent=posByBody.get(moon.parent);
      if(!parent) continue;
      const moonEntry=posByBody.get(moon);
      const origin=deps.simulation.editableSystem && moonEntry ? {
        x:moonEntry.pos.x-parent.pos.x,
        y:moonEntry.pos.y-parent.pos.y,
        z:moonEntry.pos.z-parent.pos.z,
        vx:moonEntry.pos.vx-parent.pos.vx,
        vy:moonEntry.pos.vy-parent.pos.vy,
        vz:moonEntry.pos.vz-parent.pos.vz,
        mu:MOON_GM_BY_BODY[moon.name]||0
      } : integratedMoonRelativeStateAt(moon,deps.clock.simDaysSinceJ2000);
      const system=moonInitial.state.systems.find(
        item=>item.parentName===moon.parentName
      );
      const parentMu=deps.simulation.editableSystem
        ? parent.b.mu||GM_BY_BODY[parent.b.name]||0
        : system.parentMu;
      addLocalOrbit(moon,parent,origin,parentMu+origin.mu);
    }

    if(isMoonSystemVisible('Pluto')){
      const pluto=planets.find(body=>body.name==='Pluto');
      const parent=posByBody.get(pluto);
      const companion=posByBody.get(charon);
      if(parent && companion){
        addLocalOrbit(charon,parent,{
          x:companion.pos.x-parent.pos.x,
          y:companion.pos.y-parent.pos.y,
          z:companion.pos.z-parent.pos.z,
          vx:companion.pos.vx-parent.pos.vx,
          vy:companion.pos.vy-parent.pos.vy,
          vz:companion.pos.vz-parent.pos.vz
        },GM_BY_BODY.Pluto+GM_BY_BODY.Charon);
      }
    }
    return geometries;
  }

  function drawMoonOrbitSide(geometries,front,parentBody=null){
    for(const geometry of geometries){
      if(parentBody && geometry.parentBody!==parentBody) continue;
      const highlighted=geometry.body===deps.selection.selected||geometry.body===deps.selection.hovered;
      ctx.beginPath();
      for(const [start,end] of pathSegmentsByDepth(
        geometry.points,geometry.parentDepth,front
      )){
        ctx.moveTo(start.x,start.y);
        ctx.lineTo(end.x,end.y);
      }
      ctx.strokeStyle=highlighted
        ? hexToRgba(geometry.body.color,0.7)
        : 'rgba(150,160,195,0.24)';
      ctx.lineWidth=highlighted?1.3:0.8;
      ctx.stroke();
    }
  }

  return {
    ensureHybridTrail,
    getOrbitWorldPoints,
    drawOrbitLayer,
    getProjectedOrbitPoints,
    appendProjectedTrajectoryPath,
    appendCurrentHybridTrail,
    ensureContinuation,
    projectedHybridTrail,
    appendVisiblePath,
    appendVisibleSegment,
    moonOrbitGeometries,
    drawClosePlanetOrbits,
    drawMoonOrbitSide,
    clearCaches(){ hybridTrailCache.clear(); }
  };
});
