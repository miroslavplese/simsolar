(function(root,factory){
  const api={create:factory};
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.SimSolarSceneRenderer=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(deps){
  'use strict';

  const {window}=deps;
  const {MissionPlanner}=window;
  const {circleIntersectsViewport}=window.BodyRendering;
  const {isLuminous,dominantLightBody}=window.SystemModel;
  const {drawStars}=deps.stars;
  const {updateFollowCamera,project}=deps.camera;
  const {moonVisibilityKey,visibleBodies}=deps.visibility;
  const {ctx}=deps.viewport;
  const {
    drawOrbitLayer,getOrbitWorldPoints,getProjectedOrbitPoints,appendProjectedTrajectoryPath,
    appendCurrentHybridTrail,ensureContinuation,projectedHybridTrail,appendVisiblePath,
    appendVisibleSegment,moonOrbitGeometries,drawClosePlanetOrbits,drawMoonOrbitSide
  }=deps.orbits;
  const {positionForBody,customBodies,activeSystemBodies,isBodyActive}=deps.simulation;
  const {spacecraft,HYBRID_EPOCH_DAYS,comets,sunReference}=deps.catalog;
  const {
    hexToRgba,bodyRadiusRendering,drawBodyTexture,systemTextureViewBasis,drawCustomBody,
    drawBodySphere
  }=deps.surfaces;
  const {drawLagrangeGeometry,drawOccultationEvent,drawBodyInsertionPreview}=deps.overlays;
  const {planetRingGeometry,drawPlanetRingSide}=deps.rings;

  function draw(){
    deps.lagrange.updateRotatingReferenceFrame();
    if(deps.cockpit.spacecraftViewActive){
      deps.cockpitRenderer.drawSpacecraftView();
      deps.clock.updateDateUI();
      if(deps.selection.selected) deps.selection.updateCard();
      return;
    }
    if(deps.observatory.observatoryActive){
      deps.observatoryRenderer.drawObservatory();
      deps.clock.updateDateUI();
      if(deps.selection.selected) deps.selection.updateCard();
      return;
    }
    drawStars(false);
    updateFollowCamera();
    const nextMoonVisibilityKey=moonVisibilityKey();
    if(nextMoonVisibilityKey!==deps.legend.legendMoonVisibilityKey) deps.legend.buildLegend();
    ctx.clearRect(0,0,deps.viewport.W,deps.viewport.H);
    if(deps.camera.orbitLayerDirty) drawOrbitLayer();

    const drawList = visibleBodies();

    // positions first, so spacecraft trails can end exactly at the marker
    const withPos = [];
    for(const b of drawList){
      const pos = positionForBody(b, deps.clock.simDaysSinceJ2000);
      if(!pos) continue;
      const scr = project(pos.x,pos.y,pos.z);
      withPos.push({b,pos,scr});
    }
    const plutoEntry=withPos.find(entry=>entry.b.name==='Pluto');
    const charonEntry=withPos.find(entry=>entry.b.name==='Charon');
    if(plutoEntry && charonEntry){
      const dx=charonEntry.scr.x-plutoEntry.scr.x;
      const dy=charonEntry.scr.y-plutoEntry.scr.y;
      const distance=Math.hypot(dx,dy);
      const phase=deps.clock.simDaysSinceJ2000*(Math.PI*2/6.387);
      const ux=distance>1e-4 ? dx/distance : Math.cos(phase);
      const uy=distance>1e-4 ? dy/distance : Math.sin(phase);
      const separation=Math.max(distance,16);
      charonEntry.scr.x=plutoEntry.scr.x+ux*separation;
      charonEntry.scr.y=plutoEntry.scr.y+uy*separation;
    }
    const posByBody = new Map(withPos.map(w=>[w.b,w]));
    withPos.sort((A,B)=> A.scr.depth - B.scr.depth);

    if(!deps.lagrange.rotatingReferenceFrame){
      // Keep traveled trajectories visible at every zoom.
      for(const b of spacecraft){
        if(!deps.visibility.showSpacecraft) break;
        const current = posByBody.get(b);
        if(!current) continue;
        const worldPts = getOrbitWorldPoints(b);
        const projectedPts = getProjectedOrbitPoints(b);
        let end = 0;
        if(b._trajectoryPoints){
          const historicalEnd=Math.min(deps.clock.simDaysSinceJ2000,HYBRID_EPOCH_DAYS);
          while(end+1 < worldPts.length && worldPts[end+1].t <= historicalEnd) end++;
        } else {
          while(end+1 < worldPts.length && worldPts[end+1].nu <= current.pos.nu) end++;
        }
        ctx.beginPath();
        appendProjectedTrajectoryPath(ctx,b,0,end);
        if(deps.clock.simDaysSinceJ2000>HYBRID_EPOCH_DAYS){
          appendCurrentHybridTrail(ctx,b,current);
        } else if(b._trajectoryPoints && deps.clock.simDaysSinceJ2000 > worldPts[worldPts.length-1].t){
          const continuation=ensureContinuation(b,deps.clock.simDaysSinceJ2000);
          const projectedContinuation=projectedHybridTrail(b,continuation);
          let continuationEnd=0;
          while(
            continuationEnd+1<continuation.length &&
            continuation[continuationEnd+1].t<deps.clock.simDaysSinceJ2000
          ) continuationEnd++;
          appendVisiblePath(
            ctx,projectedContinuation,0,continuationEnd
          );
          appendVisibleSegment(
            ctx,projectedContinuation[continuationEnd],current.scr
          );
        } else if(b._trajectoryPoints){
          appendVisibleSegment(ctx,projectedPts[end],current.scr);
        }
        const isHi = b===deps.selection.hovered || b===deps.selection.selected;
        ctx.strokeStyle = hexToRgba(b.color, isHi?0.95:0.55);
        ctx.lineWidth = isHi ? 1.6 : 1.1;
        ctx.stroke();
      }

      if(deps.visibility.showComets && deps.clock.simDaysSinceJ2000>HYBRID_EPOCH_DAYS){
        for(const comet of comets){
          const current=posByBody.get(comet);
          if(!current) continue;
          ctx.beginPath();
          appendCurrentHybridTrail(ctx,comet,current);
          ctx.setLineDash([6,4]);
          ctx.strokeStyle=hexToRgba(comet.color,comet===deps.selection.selected||comet===deps.selection.hovered?0.9:0.48);
          ctx.lineWidth=comet===deps.selection.selected||comet===deps.selection.hovered?1.6:1;
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      for(const body of customBodies){
        const current=posByBody.get(body);
        if(!current || deps.clock.simDaysSinceJ2000<=body.introducedAt) continue;
        ctx.beginPath();
        appendCurrentHybridTrail(ctx,body,current);
        ctx.strokeStyle=hexToRgba(body.color,body===deps.selection.selected||body===deps.selection.hovered?0.9:0.5);
        ctx.lineWidth=body===deps.selection.selected||body===deps.selection.hovered?1.6:1;
        ctx.stroke();
      }
    }
    const moonOrbitGeometry=moonOrbitGeometries(posByBody);
    drawClosePlanetOrbits(posByBody);
    drawMoonOrbitSide(moonOrbitGeometry,false);
    drawLagrangeGeometry();

    const lightBody=dominantLightBody(activeSystemBodies());
    const lightPosition=lightBody &&
      positionForBody(lightBody,deps.clock.simDaysSinceJ2000);
    // Every luminous body in the scene is drawn with the Sun's
    // glow-and-disk path: sol gets the Sun, curated systems get
    // their stars (dominant first).
    const sceneLuminous=isBodyActive(sunReference)
      ? [sunReference]
      : (lightBody?[lightBody]:[])
        .concat(activeSystemBodies().filter(
          body=>isLuminous(body) && body!==lightBody
        ));
    let sunP=null, sunR=0, sunDiskVisible=false;
    for(const lum of sceneLuminous){
      const lumPosition=positionForBody(lum,deps.clock.simDaysSinceJ2000);
      const lumP=lumPosition?project(
        lumPosition.x,lumPosition.y,lumPosition.z
      ):null;
      if(!lumP){ delete lum._screen; continue; }
      const lumRadiusRendering=bodyRadiusRendering(
        lum===sunReference?null:lum, lum===sunReference
      );
      const lumR=lumRadiusRendering.radius;
      const lumGlowR=lumR*(lumRadiusRendering.scaleAccurate?3.2:2);
      const lumGlowVisible=lumP.x+lumGlowR>=0 && lumP.x-lumGlowR<=deps.viewport.W &&
        lumP.y+lumGlowR>=0 && lumP.y-lumGlowR<=deps.viewport.H;
      const lumDiskVisible=lumP.x+lumR>=0 && lumP.x-lumR<=deps.viewport.W &&
        lumP.y+lumR>=0 && lumP.y-lumR<=deps.viewport.H;
      if(lumGlowVisible){
        const grad=ctx.createRadialGradient(
          lumP.x,lumP.y,0,lumP.x,lumP.y,lumGlowR
        );
        grad.addColorStop(0,lum===sunReference
          ? 'rgba(255,225,140,1)' : hexToRgba(lum.color,1));
        grad.addColorStop(0.35,lum===sunReference
          ? 'rgba(242,181,68,0.9)' : hexToRgba(lum.color,0.9));
        grad.addColorStop(1,lum===sunReference
          ? 'rgba(242,181,68,0)' : hexToRgba(lum.color,0));
        ctx.fillStyle=grad;
        ctx.beginPath();
        ctx.arc(lumP.x,lumP.y,lumGlowR,0,Math.PI*2);
        ctx.fill();
        if(lumDiskVisible){
          const textured=drawBodyTexture(
            lum,lumP.x,lumP.y,lumR,ctx,
            {x:0,y:0,z:1},systemTextureViewBasis()
          );
          if(!textured){
            ctx.fillStyle=lum===sunReference?'#fff3d6':lum.color;
            ctx.beginPath();
            ctx.arc(lumP.x,lumP.y,lumR,0,Math.PI*2);
            ctx.fill();
          }
        }
      }
      lum._screen={
        x:lumP.x,y:lumP.y,r:Math.max(lumR,6),occulted:false
      };
      if(lumDiskVisible &&
        (lum===deps.selection.selected || lum===deps.selection.hovered)){
        ctx.strokeStyle='rgba(242,181,68,0.9)';
        ctx.lineWidth=1.5;
        ctx.beginPath();
        ctx.arc(lumP.x,lumP.y,lumR+5,0,Math.PI*2);
        ctx.stroke();
        ctx.font='10px "SF Mono", Consolas, monospace';
        ctx.fillStyle=lum===deps.selection.selected
          ? '#f2b544'
          : 'rgba(232,236,247,0.72)';
        ctx.fillText(lum.name,lumP.x+lumR+6,lumP.y+3);
      }
      // Occultation clipping uses the dominant star's disc.
      if(lum===sceneLuminous[0]){
        sunP=lumP; sunR=lumR; sunDiskVisible=lumDiskVisible;
      }
    }
    if(!sceneLuminous.includes(sunReference)){
      delete sunReference._screen;
    }
    const lightScreen=lightPosition
      ? project(lightPosition.x,lightPosition.y,lightPosition.z)
      : null;
    // bodies, depth sorted (far first)
    for(const {b,pos,scr} of withPos){
      const px=scr.x, py=scr.y;
      if(b.kind==='star') continue; // drawn via the sun path above
      const behindSun=!!sunP && scr.depth<sunP.depth;
      const clipForSun=behindSun&&sunDiskVisible;
      if(clipForSun){
        ctx.save();
        ctx.beginPath();
        ctx.rect(0,0,deps.viewport.W,deps.viewport.H);
        ctx.arc(sunP.x,sunP.y,sunR,0,Math.PI*2);
        ctx.clip('evenodd');
      }
      if(b.kind==='lagrange'){
        const highlighted=b===deps.selection.selected||b===deps.selection.hovered;
        const radius=highlighted?5:3.5;
        ctx.save();
        ctx.translate(px,py);
        ctx.strokeStyle=b.color;
        ctx.fillStyle=hexToRgba(b.color,highlighted?0.42:0.24);
        ctx.lineWidth=highlighted?1.8:1.1;
        ctx.beginPath();
        ctx.arc(0,0,radius,0,Math.PI*2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-radius-3,0); ctx.lineTo(radius+3,0);
        ctx.moveTo(0,-radius-3); ctx.lineTo(0,radius+3);
        ctx.stroke();
        ctx.restore();
        ctx.font='9px "SF Mono", Consolas, monospace';
        ctx.fillStyle=highlighted?b.color:'rgba(160,220,244,0.72)';
        ctx.fillText(b.name,px+radius+5,py-5);
        b._screen={x:px,y:py,r:Math.max(radius,6)};
      } else if(b.kind==='custom'){
        const radiusRendering=bodyRadiusRendering(b,false);
        const r=radiusRendering.radius;
        if(b===deps.selection.selected){
          ctx.beginPath();
          ctx.strokeStyle='rgba(242,181,68,0.9)';
          ctx.lineWidth=1.5;
          ctx.arc(px,py,r+5,0,Math.PI*2);
          ctx.stroke();
        }
        if(circleIntersectsViewport(px,py,r,deps.viewport.W,deps.viewport.H)){
          drawCustomBody(b,pos,px,py,radiusRendering,lightScreen);
        }
        ctx.font='9.5px "SF Mono", Consolas, monospace';
        ctx.fillStyle=b===deps.selection.selected?b.color:'rgba(232,236,247,0.6)';
        ctx.fillText(b.name,px+r+6,py+3);
        b._screen={x:px,y:py,r:Math.max(r,7)};
      } else if(b.kind==='moon'){
        const radiusRendering=bodyRadiusRendering(b,false);
        const r=radiusRendering.radius;
        if(b===deps.selection.selected){
          ctx.beginPath();
          ctx.strokeStyle='rgba(242,181,68,0.9)';
          ctx.lineWidth=1.4;
          ctx.arc(px,py,r+4,0,Math.PI*2);
          ctx.stroke();
        }
        if(circleIntersectsViewport(px,py,r,deps.viewport.W,deps.viewport.H)){
          drawBodySphere(b,pos,px,py,radiusRendering);
        }
        ctx.font='8.5px "SF Mono", Consolas, monospace';
        ctx.fillStyle=b===deps.selection.selected?'#f2b544':'rgba(232,236,247,0.58)';
        ctx.fillText(b.name,px+r+5,py+3);
        b._screen={x:px,y:py,r:Math.max(r,6)};
      } else if(b.kind==='planet'){
        const radiusRendering=bodyRadiusRendering(b,false);
        const r=radiusRendering.radius;
        const ringGeometry=planetRingGeometry(
          b,pos,scr,radiusRendering.scaleBlend
        );
        drawPlanetRingSide(ringGeometry,false);
        if(b===deps.selection.selected){ ctx.beginPath(); ctx.strokeStyle='rgba(242,181,68,0.9)'; ctx.lineWidth=1.5; ctx.arc(px,py,r+5,0,Math.PI*2); ctx.stroke(); }
        if(circleIntersectsViewport(px,py,r,deps.viewport.W,deps.viewport.H)){
          drawBodySphere(b,pos,px,py,radiusRendering);
        }
        drawMoonOrbitSide(moonOrbitGeometry,true,b);
        drawPlanetRingSide(ringGeometry,true);
        if(deps.camera.zoom>0.4 || b===deps.selection.selected || b===deps.selection.hovered){
          ctx.font = '10px "SF Mono", Consolas, monospace';
          ctx.fillStyle = b===deps.selection.selected ? '#f2b544' : 'rgba(232,236,247,0.55)';
          ctx.fillText(b.name, px+r+6, py+3);
        }
        b._screen = {x:px,y:py,r:Math.max(r,6)};
      } else if(b.kind==='comet'){
        const r=(b===deps.selection.selected||b===deps.selection.hovered)?5:3.5;
        if(lightScreen){
          const tailX=px-lightScreen.x, tailY=py-lightScreen.y;
          const tailLen=Math.hypot(tailX,tailY)||1;
          const tailScale=Math.min(22,8+18/(pos.r+0.4));
          const tx=tailX/tailLen*tailScale, ty=tailY/tailLen*tailScale;
          const tail=ctx.createLinearGradient(px,py,px+tx,py+ty);
          tail.addColorStop(0,hexToRgba(b.color,0.8));
          tail.addColorStop(1,hexToRgba(b.color,0));
          ctx.strokeStyle=tail;
          ctx.lineWidth=r*0.9;
          ctx.beginPath();
          ctx.moveTo(px,py);
          ctx.lineTo(px+tx,py+ty);
          ctx.stroke();
        }
        ctx.fillStyle=b.color;
        ctx.beginPath(); ctx.arc(px,py,r,0,Math.PI*2); ctx.fill();
        if(deps.camera.zoom>0.08 || b===deps.selection.selected || b===deps.selection.hovered){
          ctx.font='9.5px "SF Mono", Consolas, monospace';
          ctx.fillStyle=b===deps.selection.selected?b.color:'rgba(232,236,247,0.55)';
          ctx.fillText(b.name,px+r+6,py+3);
        }
        b._screen={x:px,y:py,r:Math.max(r,7)};
      } else {
        const r = (b===deps.selection.selected||b===deps.selection.hovered) ? 5.5 : 4;
        ctx.save();
        ctx.translate(px,py); ctx.rotate(Math.PI/4);
        ctx.fillStyle = b.color;
        if(b===deps.selection.selected){ ctx.shadowColor=b.color; ctx.shadowBlur=10; }
        ctx.fillRect(-r,-r,r*2,r*2);
        ctx.restore();
        if(deps.camera.zoom>0.06 || b===deps.selection.selected || b===deps.selection.hovered){
          ctx.font = '9.5px "SF Mono", Consolas, monospace';
          ctx.fillStyle = b===deps.selection.selected ? b.color : 'rgba(232,236,247,0.5)';
          ctx.fillText(b.name, px+r+7, py+3);
        }
        b._screen = {x:px,y:py,r:Math.max(r,7)};
      }
      if(clipForSun){
        ctx.restore();
        b._screen.occulted=
          Math.hypot(px-sunP.x,py-sunP.y)+b._screen.r<=sunR;
      } else {
        b._screen.occulted=false;
      }
    }
    drawOccultationEvent();
    if(deps.tutorial.tutorialShowPlannerArtifacts && deps.planner.plannerRouteSamples.length){
      const state=MissionPlanner.stateAlongSamples(
        deps.planner.plannerRouteSamples,deps.clock.simDaysSinceJ2000
      );
      if(state){
        const marker=project(state.x,state.y,state.z);
        ctx.save();
        ctx.shadowColor='#72e6c1';
        ctx.shadowBlur=12;
        ctx.fillStyle='#e9fff8';
        ctx.beginPath();
        ctx.arc(marker.x,marker.y,4.5,0,Math.PI*2);
        ctx.fill();
        ctx.shadowBlur=0;
        ctx.font='9px "SF Mono", Consolas, monospace';
        ctx.fillStyle='#72e6c1';
        ctx.fillText('PLANNED SPACECRAFT',marker.x+8,marker.y-7);
        ctx.restore();
      }
    }
    drawBodyInsertionPreview();

    deps.clock.updateDateUI();
    if(deps.selection.selected) deps.selection.updateCard();
  }

  return {
    draw
  };
});
