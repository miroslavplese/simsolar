(function(root,factory){
  const api={create:factory};
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.SimSolarObservatoryRenderer=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(deps){
  'use strict';

  const {document,window}=deps;
  const {AU_KM,propagateState,osculatingOrbitPoints}=window.TrajectoryMath;
  const {customMarkerRadiusPixels}=window.BodyRendering;
  const {normalizeVector}=window.BodyLighting;
  const {PLANETARY_RINGS,outerRadiusKm:ringOuterRadiusKm}=window.RingSystem;
  const {
    surfaceDefinitionForBody:observatorySurfaceDefinitionForBody,
    surfaceFrame:observatorySurfaceFrame,horizontalDirection:observatoryHorizontalDirection,
    horizontalCoordinates:observatoryHorizontalCoordinates,cameraFrame:observatoryCameraFrame,
    projectDirection:projectObservatoryDirection,
    altitudeForDirection:observatoryAltitudeForDirection,
    angularRadius:observatoryAngularRadius,daylightFactor:observatoryDaylightFactor,
    collapsedSatelliteLabels:collapsedObservatorySatelliteLabels,
    normalize:normalizeObservatoryVector
  }=window.ObservatoryMode;
  const {GM_BY_BODY}=window.NBodySimulation;
  const {isLuminous,dominantLightBody}=window.SystemModel;
  const {sunReference,charon,planets}=deps.catalog;
  const {SUN_RADIUS_KM,DEG}=deps.constants;
  const {ctx,skyCtx}=deps.viewport;
  const {
    hexToRgba,observatoryTextureViewBasis,drawCustomStar,drawCustomBlackHole,
    drawCustomCometTail,drawBodyTexture,bodyShadowGeometry,textureViewVector
  }=deps.surfaces;
  const {ensureCatalogStars,backdropComponent,renderStarBackdrop,starBackdrop}=deps.stars;
  const {
    positionForBody,editableOrbitPoints,integratedMoonRelativeStateAt,moonInitial,
    activeSystemBodies
  }=deps.simulation;
  const {ensureHybridTrail,getOrbitWorldPoints}=deps.orbits;
  const {observatoryPlanetRingGeometry,drawPlanetRingSide}=deps.rings;

  let observatoryProjectedBodies=[];
  const observatoryPathCache=new Map();

  function observatoryBodyRadiusAu(body){
    if(body===sunReference) return SUN_RADIUS_KM/AU_KM;
    return (body.radius||0)/AU_KM;
  }

  function observatoryBodyMarkerRadius(
    body,physicalRadius,enhance=deps.observatory.observatoryEnhance
  ){
    if(!enhance) return Math.max(0.25,physicalRadius);
    if(body===sunReference) return Math.max(physicalRadius,3);
    if(body.kind==='custom'){
      return Math.max(
        physicalRadius,
        Math.max(2.5,customMarkerRadiusPixels(body.appearance)/2)
      );
    }
    if(body.kind==='spacecraft') return Math.max(physicalRadius,3.2);
    if(body.kind==='comet') return Math.max(physicalRadius,2.6);
    return Math.max(physicalRadius,2.2);
  }

  function observatoryDirection(from,to){
    return {
      x:to.x-from.x,
      y:to.y-from.y,
      z:to.z-from.z
    };
  }

  function strokeObservatoryCurve(points,camera,color,width){
    ctx.beginPath();
    let drawing=false;
    for(const direction of points){
      if(!direction){
        drawing=false;
        continue;
      }
      const projected=projectObservatoryDirection(
        direction,camera,deps.viewport.W,deps.viewport.H,deps.observatory.observatoryFov
      );
      if(
        !projected ||
        projected.x<-deps.viewport.W || projected.x>deps.viewport.W*2 ||
        projected.y<-deps.viewport.H || projected.y>deps.viewport.H*2
      ){
        drawing=false;
        continue;
      }
      if(drawing) ctx.lineTo(projected.x,projected.y);
      else {
        ctx.moveTo(projected.x,projected.y);
        drawing=true;
      }
    }
    ctx.strokeStyle=color;
    ctx.lineWidth=width;
    ctx.stroke();
  }

  function drawObservatoryGrid(frame,camera){
    const gridColor='rgba(184,211,232,0.14)';
    for(const altitudeDeg of [0,15,30,45,60,75]){
      const points=[];
      for(let azimuthDeg=0;azimuthDeg<=360;azimuthDeg+=3){
        points.push(observatoryHorizontalDirection(
          frame,azimuthDeg*DEG,altitudeDeg*DEG
        ));
      }
      strokeObservatoryCurve(
        points,camera,
        altitudeDeg===0?'rgba(210,230,242,0.34)':gridColor,
        altitudeDeg===0?1.2:0.7
      );
    }
    for(let azimuthDeg=0;azimuthDeg<360;azimuthDeg+=30){
      const points=[];
      for(let altitudeDeg=0;altitudeDeg<=90;altitudeDeg+=2){
        points.push(observatoryHorizontalDirection(
          frame,azimuthDeg*DEG,altitudeDeg*DEG
        ));
      }
      strokeObservatoryCurve(points,camera,gridColor,0.7);
    }
    ctx.save();
    ctx.font='10px "SF Mono", Consolas, monospace';
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    for(const [label,azimuth] of [['N',0],['E',90],['S',180],['W',270]]){
      const projected=projectObservatoryDirection(
        observatoryHorizontalDirection(frame,azimuth*DEG,1.5*DEG),
        camera,deps.viewport.W,deps.viewport.H,deps.observatory.observatoryFov
      );
      if(!projected || projected.x<10 || projected.x>deps.viewport.W-10 ||
         projected.y<10 || projected.y>deps.viewport.H-10) continue;
      ctx.fillStyle='rgba(220,235,245,0.75)';
      ctx.fillText(label,projected.x,projected.y);
    }
    ctx.restore();
  }

  function drawObservatoryAtmosphere(surface,sunAltitude,horizonY){
    const daylight=observatoryDaylightFactor(
      sunAltitude,surface.atmosphereDensity||0
    );
    skyCtx.fillStyle='#050812';
    skyCtx.fillRect(0,0,deps.viewport.W,deps.viewport.H);
    if(daylight>0){
      const color=surface.atmosphere||'#4d8ed8';
      const topAlpha=0.18*daylight;
      const horizonAlpha=Math.min(0.92,0.4+0.48*daylight)*
        (surface.atmosphereDensity||0);
      const gradient=skyCtx.createLinearGradient(0,0,0,deps.viewport.H);
      gradient.addColorStop(0,hexToRgba(color,topAlpha));
      gradient.addColorStop(
        Math.max(0.05,Math.min(0.95,horizonY/deps.viewport.H)),
        hexToRgba(color,horizonAlpha)
      );
      gradient.addColorStop(1,hexToRgba(color,topAlpha));
      skyCtx.fillStyle=gradient;
      skyCtx.fillRect(0,0,deps.viewport.W,deps.viewport.H);
    }
    return daylight;
  }

  function drawObservatoryStars(frame,camera,daylight){
    ensureCatalogStars();
    const cameraPrecision=Math.max(500,Math.ceil(deps.viewport.H/deps.observatory.observatoryFov));
    const vectors=[
      camera.forward,camera.right,camera.up,frame.up
    ].flatMap(vector=>[
      backdropComponent(vector.x,cameraPrecision),
      backdropComponent(vector.y,cameraPrecision),
      backdropComponent(vector.z,cameraPrecision)
    ]);
    const key='observatory:'+deps.viewport.W+':'+deps.viewport.H+':'+vectors.join(':')+':'+
      backdropComponent(deps.observatory.observatoryFov,1000000)+':'+
      backdropComponent(daylight,100);
    renderStarBackdrop(key,backdrop=>{
      for(const star of deps.stars.stars){
        const altitude=observatoryAltitudeForDirection(star,frame);
        if(altitude<0) continue;
        const projected=projectObservatoryDirection(
          star,camera,deps.viewport.W,deps.viewport.H,deps.observatory.observatoryFov
        );
        if(!projected || projected.x<0 || projected.x>deps.viewport.W ||
           projected.y<0 || projected.y>deps.viewport.H) continue;
        const horizonFade=Math.min(1,Math.max(0,altitude/(8*DEG)));
        const alpha=star.alpha*horizonFade*(1-daylight*0.96);
        if(alpha<0.015) continue;
        backdrop.beginPath();
        backdrop.fillStyle=`rgba(${star.rgb},${alpha})`;
        backdrop.arc(
          projected.x,projected.y,star.radius,0,Math.PI*2
        );
        backdrop.fill();
      }
    },false);
    skyCtx.drawImage(starBackdrop,0,0);
  }

  function drawObservatoryGround(surface,horizonY,daylight){
    const groundTop=Math.max(0,Math.min(deps.viewport.H,horizonY));
    if(groundTop>=deps.viewport.H) return;
    const gradient=ctx.createLinearGradient(0,groundTop,0,deps.viewport.H);
    gradient.addColorStop(0,hexToRgba(
      surface.atmosphere||surface.ground,
      surface.atmosphereDensity ? 0.88 : 1
    ));
    gradient.addColorStop(0.08,surface.ground);
    gradient.addColorStop(1,daylight>0?surface.ground:'#12131a');
    ctx.fillStyle=gradient;
    ctx.fillRect(0,groundTop,deps.viewport.W,deps.viewport.H-groundTop);
  }

  function observatoryLocalOrbitPoints(body,parent,origin,centralMu){
    if(!parent || !origin) return [];
    const speedSq=origin.vx**2+origin.vy**2+origin.vz**2;
    const radius=Math.hypot(origin.x,origin.y,origin.z);
    const semimajor=-centralMu/(speedSq-2*centralMu/radius);
    if(!(semimajor>0) || !Number.isFinite(semimajor)) return [];
    const period=2*Math.PI*Math.sqrt(semimajor**3/centralMu);
    const points=[];
    for(let index=0;index<=96;index++){
      const relative=propagateState(
        origin,period*index/96,centralMu
      );
      points.push({
        x:parent.x+relative.x,
        y:parent.y+relative.y,
        z:parent.z+relative.z
      });
    }
    return points;
  }

  function observatoryPathWorldPoints(body){
    const bucket=Math.floor(deps.clock.simDaysSinceJ2000*24);
    const cached=observatoryPathCache.get(body);
    if(cached?.bucket===bucket) return cached.points;
    const current=positionForBody(body,deps.clock.simDaysSinceJ2000);
    let points=[];
    if(current && deps.simulation.editableSystem &&
      ['planet','moon','star'].includes(body.kind)){
      points=editableOrbitPoints(body,deps.clock.simDaysSinceJ2000,192);
    } else if(current && body.kind==='moon'){
      const parent=positionForBody(body.parent,deps.clock.simDaysSinceJ2000);
      const origin=integratedMoonRelativeStateAt(body,deps.clock.simDaysSinceJ2000);
      const system=moonInitial.state.systems.find(
        item=>item.parentName===body.parentName
      );
      points=observatoryLocalOrbitPoints(
        body,parent,origin,
        system.parentMu+origin.mu
      );
    } else if(current && body===charon){
      const pluto=planets.find(candidate=>candidate.name==='Pluto');
      const parent=positionForBody(pluto,deps.clock.simDaysSinceJ2000);
      points=observatoryLocalOrbitPoints(body,parent,{
        x:current.x-parent.x,
        y:current.y-parent.y,
        z:current.z-parent.z,
        vx:current.vx-parent.vx,
        vy:current.vy-parent.vy,
        vz:current.vz-parent.vz
      },GM_BY_BODY.Pluto+GM_BY_BODY.Charon);
    } else if(current && body.kind==='planet' && !deps.simulation.editableSystem){
      points=osculatingOrbitPoints(
        current,GM_BY_BODY.Sun+(GM_BY_BODY[body.name]||0),192
      );
    } else if(current && body.kind==='custom'){
      points=ensureHybridTrail(body,deps.clock.simDaysSinceJ2000,current);
    } else if(current && (body.kind==='spacecraft'||body.kind==='comet')){
      points=getOrbitWorldPoints(body);
    }
    observatoryPathCache.set(body,{bucket,points});
    return points;
  }

  function drawObservatoryPaths(observerPosition,frame,camera){
    const bodies=deps.observatory.observatorySceneBodies().filter(
      body=>!isLuminous(body)
    );
    ctx.save();
    for(const body of bodies){
      if(body===deps.observatory.observatoryObserver) continue;
      const worldPoints=observatoryPathWorldPoints(body);
      if(worldPoints.length<2) continue;
      const directions=worldPoints.map(point=>{
        const offset=observatoryDirection(observerPosition,point);
        if(Math.hypot(offset.x,offset.y,offset.z)<1e-12) return null;
        const direction=normalizeObservatoryVector(offset);
        return observatoryAltitudeForDirection(direction,frame)>=0
          ? direction
          : null;
      });
      ctx.setLineDash(
        body.kind==='spacecraft'||body.kind==='comet' ? [5,4] : []
      );
      strokeObservatoryCurve(
        directions,camera,
        hexToRgba(
          body.color||'#99a4c8',
          body===deps.selection.selected ? 0.75 : 0.3
        ),
        body===deps.selection.selected ? 1.4 : 0.8
      );
    }
    ctx.restore();
  }

  function drawObservatoryBody(
    body,position,distance,observerPosition,frame,camera,sunProjected,options={}
  ){
    const fov=options.fov||deps.observatory.observatoryFov;
    const horizon=options.horizon!==false;
    const projectedBodies=options.projectedBodies||observatoryProjectedBodies;
    const offset=observatoryDirection(observerPosition,position);
    const direction=normalizeObservatoryVector(offset);
    const angularRadius=observatoryAngularRadius(
      observatoryBodyRadiusAu(body),distance
    );
    if(horizon){
      const altitude=observatoryAltitudeForDirection(direction,frame);
      if(altitude<-angularRadius) return;
    }
    const projected=projectObservatoryDirection(
      direction,camera,deps.viewport.W,deps.viewport.H,fov
    );
    if(!projected) return;
    const physicalRadius=Math.min(
      deps.viewport.H*2,projected.focal*Math.tan(angularRadius)
    );
    const radius=observatoryBodyMarkerRadius(
      body,physicalRadius,options.enhance
    );
    const ring=PLANETARY_RINGS[body.name];
    const ringRadius=ring && body.radius
      ? physicalRadius*ringOuterRadiusKm(ring)/body.radius
      : 0;
    const visibleRadius=Math.max(radius,ringRadius);
    if(
      projected.x+visibleRadius<0 || projected.x-visibleRadius>deps.viewport.W ||
      projected.y+visibleRadius<0 || projected.y-visibleRadius>deps.viewport.H
    ) return;
    const color=body.color||'#e8ecf7';
    const textureBasis=observatoryTextureViewBasis(direction,camera);
    const ringGeometry=ringRadius>=0.5
      ? observatoryPlanetRingGeometry(
          body,position,observerPosition,camera,fov,direction
        )
      : null;
    drawPlanetRingSide(ringGeometry,false);
    if(body.kind==='custom'){
      if(body.appearance==='star'){
        drawCustomStar(
          body,projected.x,projected.y,radius,
          physicalRadius>=radius-1e-6
        );
      } else if(body.appearance==='black-hole'){
        drawCustomBlackHole(body,projected.x,projected.y,radius);
      } else {
        if(body.appearance==='comet' && sunProjected){
          drawCustomCometTail(
            body,projected.x,projected.y,radius,
            sunProjected.x,sunProjected.y
          );
        }
        const lightX=sunProjected
          ? sunProjected.x-projected.x
          : -1;
        const lightY=sunProjected
          ? sunProjected.y-projected.y
          : -1;
        const lightLength=Math.hypot(lightX,lightY)||1;
        const lit=ctx.createRadialGradient(
          projected.x+lightX/lightLength*radius*0.35,
          projected.y+lightY/lightLength*radius*0.35,
          Math.max(0.1,radius*0.08),
          projected.x,projected.y,Math.max(0.2,radius*1.15)
        );
        lit.addColorStop(0,color);
        lit.addColorStop(0.72,hexToRgba(color,0.8));
        lit.addColorStop(1,'rgba(2,3,7,0.92)');
        ctx.fillStyle=lit;
        ctx.beginPath();
        ctx.arc(projected.x,projected.y,radius,0,Math.PI*2);
        ctx.fill();
      }
    } else if(isLuminous(body)){
      const glow=ctx.createRadialGradient(
        projected.x,projected.y,radius,
        projected.x,projected.y,Math.max(radius*4,14)
      );
      glow.addColorStop(0,body===sunReference
        ? 'rgba(255,229,150,0.8)' : hexToRgba(color,0.8));
      glow.addColorStop(1,body===sunReference
        ? 'rgba(255,190,70,0)' : hexToRgba(color,0));
      ctx.fillStyle=glow;
      ctx.beginPath();
      ctx.arc(
        projected.x,projected.y,Math.max(radius*4,14),0,Math.PI*2
      );
      ctx.fill();
      if((horizon && body===sunReference) || !drawBodyTexture(
        body,projected.x,projected.y,radius,ctx,
        {x:0,y:0,z:1},
        textureBasis
      )){
        ctx.fillStyle=body===sunReference?'#fff1c7':color;
        ctx.beginPath();
        ctx.arc(projected.x,projected.y,radius,0,Math.PI*2);
        ctx.fill();
      }
    } else {
      const lightBody=dominantLightBody(activeSystemBodies());
      const lightPosition=lightBody &&
        positionForBody(lightBody,deps.clock.simDaysSinceJ2000);
      const worldLight=lightPosition && normalizeVector({
        x:lightPosition.x-position.x,
        y:lightPosition.y-position.y,
        z:lightPosition.z-position.z
      });
      const shadows=bodyShadowGeometry(
        body,position,lightBody,lightPosition,textureBasis
      );
      if(!worldLight || !drawBodyTexture(
        body,projected.x,projected.y,radius,ctx,
        worldLight ? textureViewVector(worldLight,textureBasis) : {x:0,y:0,z:1},
        textureBasis,shadows
      )){
        ctx.fillStyle=color;
        ctx.beginPath();
        ctx.arc(projected.x,projected.y,radius,0,Math.PI*2);
        ctx.fill();
      }
    }
    drawPlanetRingSide(ringGeometry,true);
    if(body===deps.selection.selected && options.showSelection!==false){
      ctx.strokeStyle='#f2b544';
      ctx.lineWidth=1.4;
      ctx.beginPath();
      ctx.arc(projected.x,projected.y,radius+4,0,Math.PI*2);
      ctx.stroke();
    }
    if(options.showLabel!==false){
      ctx.font='9px "SF Mono", Consolas, monospace';
      ctx.fillStyle=body===deps.selection.selected?'#f2b544':'rgba(232,236,247,0.72)';
      ctx.fillText(body.name,projected.x+radius+5,projected.y-4);
    }
    projectedBodies.push({
      body,x:projected.x,y:projected.y,r:Math.max(7,radius)
    });
  }

  function updateObservatoryTelescopeAim(frame,observerPosition){
    if(
      !deps.observatory.observatoryTelescopeActive ||
      !deps.observatory.observatoryTelescopeTracking ||
      !deps.observatory.observatoryTelescopeTarget
    ) return;
    const position=positionForBody(
      deps.observatory.observatoryTelescopeTarget,deps.clock.simDaysSinceJ2000
    );
    if(!position){
      deps.observatory.setObservatoryTelescopeTracking(false);
      return;
    }
    const direction=observatoryDirection(observerPosition,position);
    if(Math.hypot(direction.x,direction.y,direction.z)<1e-12) return;
    const coordinates=observatoryHorizontalCoordinates(direction,frame);
    deps.observatory.observatoryAzimuth=coordinates.azimuth;
    deps.observatory.observatoryAltitude=coordinates.altitude;
  }

  function drawObservatory(){
    const surface=observatorySurfaceDefinitionForBody(deps.observatory.observatoryObserver);
    const center=deps.observatory.observatoryObserver &&
      positionForBody(deps.observatory.observatoryObserver,deps.clock.simDaysSinceJ2000);
    if(!surface || !center){
      deps.observatory.setObservatoryMode(false);
      return;
    }
    const frame=observatorySurfaceFrame(
      surface,deps.clock.simDaysSinceJ2000,deps.observatory.observatoryLatitude,deps.observatory.observatoryLongitude
    );
    const observerPosition={
      x:center.x+frame.up.x*deps.observatory.observatoryObserver.radius/AU_KM,
      y:center.y+frame.up.y*deps.observatory.observatoryObserver.radius/AU_KM,
      z:center.z+frame.up.z*deps.observatory.observatoryObserver.radius/AU_KM
    };
    updateObservatoryTelescopeAim(frame,observerPosition);
    const camera=observatoryCameraFrame(
      frame,deps.observatory.observatoryAzimuth,deps.observatory.observatoryAltitude
    );
    const lightBody=dominantLightBody(activeSystemBodies());
    const sunPosition=lightBody &&
      positionForBody(lightBody,deps.clock.simDaysSinceJ2000);
    const sunDirection=sunPosition &&
      observatoryDirection(observerPosition,sunPosition);
    const sunProjected=sunDirection ? projectObservatoryDirection(
      normalizeObservatoryVector(sunDirection),
      camera,deps.viewport.W,deps.viewport.H,deps.observatory.observatoryFov
    ) : null;
    const sunAltitude=sunDirection
      ? observatoryAltitudeForDirection(sunDirection,frame)
      : -Math.PI/2;
    const focal=deps.viewport.H/(2*Math.tan(deps.observatory.observatoryFov/2));
    const horizonY=deps.viewport.H/2+focal*Math.tan(deps.observatory.observatoryAltitude);
    const daylight=drawObservatoryAtmosphere(
      surface,sunAltitude,horizonY
    );
    drawObservatoryStars(frame,camera,daylight);
    ctx.clearRect(0,0,deps.viewport.W,deps.viewport.H);
    observatoryProjectedBodies=[];
    if(deps.observatory.observatoryShowPaths && !deps.observatory.observatoryTelescopeActive){
      drawObservatoryPaths(observerPosition,frame,camera);
    }
    const bodyEntries=[];
    for(const body of deps.observatory.observatorySceneBodies()){
      if(body===deps.observatory.observatoryObserver) continue;
      const position=positionForBody(body,deps.clock.simDaysSinceJ2000);
      if(!position) continue;
      const distance=Math.hypot(
        position.x-observerPosition.x,
        position.y-observerPosition.y,
        position.z-observerPosition.z
      );
      if(distance>0) bodyEntries.push({body,position,distance});
    }
    bodyEntries.sort((a,b)=>b.distance-a.distance);
    const suppressedLabels=collapsedObservatorySatelliteLabels(
      bodyEntries,
      entry=>projectObservatoryDirection(
        normalizeObservatoryVector(
          observatoryDirection(observerPosition,entry.position)
        ),
        camera,deps.viewport.W,deps.viewport.H,deps.observatory.observatoryFov
      )
    );
    for(const {body,position,distance} of bodyEntries){
      drawObservatoryBody(
        body,position,distance,observerPosition,frame,camera,sunProjected,{
          enhance:deps.observatory.observatoryTelescopeActive ? false : undefined,
          showLabel:!deps.observatory.observatoryTelescopeActive &&
            !suppressedLabels.has(body),
          showSelection:!deps.observatory.observatoryTelescopeActive
        }
      );
    }
    deps.clouds.drawObservatoryClouds(frame,camera,daylight);
    if(!deps.observatory.observatoryTelescopeActive) drawObservatoryGrid(frame,camera);
    drawObservatoryGround(surface,horizonY,daylight);
    const readout=document.getElementById('observatoryReadout');
    readout.textContent=
      'Az '+((deps.observatory.observatoryAzimuth/DEG+360)%360).toFixed(1)+'° · Alt '+
      (deps.observatory.observatoryAltitude/DEG).toFixed(1)+'° · FOV '+
      (
        deps.observatory.observatoryFov<DEG
          ? (deps.observatory.observatoryFov/DEG).toFixed(2)
          : (deps.observatory.observatoryFov/DEG).toFixed(1)
      )+'°\n'+
      (
        deps.observatory.observatoryTelescopeActive
          ? (
            deps.observatory.observatoryTelescopeTracking
              ? 'Tracking '+(deps.observatory.observatoryTelescopeTarget?.name||'target')
              : 'Manual telescope aiming'
          )+' · wheel to zoom'
          : 'Drag to look around · wheel to zoom'
      );
  }

  return {
    observatoryBodyRadiusAu,
    observatoryDirection,
    drawObservatoryBody,
    drawObservatory,
    get observatoryProjectedBodies(){ return observatoryProjectedBodies; },
    clearPaths(){ observatoryPathCache.clear(); }
  };
});
