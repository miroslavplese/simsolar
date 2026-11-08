(function(root,factory){
  const api={create:factory};
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.SimSolarInput=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(deps){
  'use strict';

  const {document,window}=deps;
  const {SpacecraftView}=window;
  const {rotationFromDrag,panForRotationPivot}=window.ViewTransform;
  const {distanceToPolyline}=window.BodyRendering;
  const {TELESCOPE_MIN_FOV,TELESCOPE_MAX_FOV}=window.ObservatoryMode;
  const {visibleBodies}=deps.visibility;
  const {isBodyActive,positionForBody}=deps.simulation;
  const {sunReference}=deps.catalog;
  const {getProjectedOrbitPoints}=deps.orbits;
  const {scene}=deps.viewport;
  const {bodyRadiusRendering}=deps.surfaces;
  const {
    project,screenToEcliptic,setFollowTarget,selectViewPreset,invalidateProjection,
    constrainedZoom,applyZoom
  }=deps.camera;
  const {updateBodyReadout,updateDraftVelocity}=deps.editor;
  const {
    setObservatoryTelescopeTracking,syncObservatoryTelescopeControls,
    setObservatoryTelescopeTarget,setObservatoryMode
  }=deps.observatory;
  const {DEG,AU_PX}=deps.constants;
  const {rotatingBaseYaw,setLagrangeVisibility,setRotatingReferenceFrame}=deps.lagrange;
  const {toggleBodySelection}=deps.selection;
  const {playBtn,updateSpeedLabel}=deps.clock;
  const {toggleProfiler}=deps.profiler;
  const {togglePanel}=deps.panels;
  const {setSpacecraftView}=deps.cockpit;
  const {setOccultationPanelVisible}=deps.occultations;

  function observatoryHitTest(mx,my){
    let best=null;
    let bestDistance=Infinity;
    for(const entry of deps.observatoryRenderer.observatoryProjectedBodies){
      const distance=Math.hypot(mx-entry.x,my-entry.y);
      if(distance<=entry.r+5 && distance<=bestDistance){
        best=entry.body;
        bestDistance=distance;
      }
    }
    return best;
  }

  function spacecraftHitTest(mx,my){
    let best=null;
    let bestDistance=Infinity;
    for(const entry of deps.cockpitRenderer.spacecraftProjectedBodies){
      const distance=Math.hypot(mx-entry.x,my-entry.y);
      if(distance<=entry.r+6 && distance<=bestDistance){
        best=entry.body;
        bestDistance=distance;
      }
    }
    return best;
  }

  function hitTest(mx,my){
    if(deps.cockpit.spacecraftViewActive) return spacecraftHitTest(mx,my);
    if(deps.observatory.observatoryActive) return observatoryHitTest(mx,my);
    const list = visibleBodies();
    const marker = list.find(b=> b.kind==='lagrange' && b._screen &&
      Math.hypot(mx-b._screen.x,my-b._screen.y)<b._screen.r+6) ||
      list.find(b=> b.kind==='moon' && b._screen && !b._screen.occulted &&
      Math.hypot(mx-b._screen.x, my-b._screen.y) < b._screen.r+7) ||
      list.find(b=> b._screen && !b._screen.occulted &&
      Math.hypot(mx-b._screen.x, my-b._screen.y) < b._screen.r+5);
    if(marker) return marker;
    if(isBodyActive(sunReference) && sunReference._screen && Math.hypot(
      mx-sunReference._screen.x,my-sunReference._screen.y
    )<sunReference._screen.r+5){
      return sunReference;
    }
    // fall back to proximity to the trajectory line itself
    const LINE_TOL = 9;
    let best = null, bestDist = LINE_TOL;
    for(const b of list){
      if(b.kind==='moon'){
        if(!b._screenOrbit) continue;
        const distance=distanceToPolyline(mx,my,b._screenOrbit);
        if(distance<bestDist){ bestDist=distance; best=b; }
        continue;
      }
      if(b.hideOrbit || b.kind==='custom') continue;
      const pts = getProjectedOrbitPoints(b);
      if(!pts) continue;
      const bounds = b._pathBounds;
      if(mx < bounds.minX-LINE_TOL || mx > bounds.maxX+LINE_TOL ||
         my < bounds.minY-LINE_TOL || my > bounds.maxY+LINE_TOL) continue;
      const distance=distanceToPolyline(
        mx,my,b._trajectoryPoints ? b._renderPathPts : pts
      );
      if(distance<bestDist){ bestDist=distance; best=b; }
    }
    return best;
  }

  const activePointers = new Map();
  let dragMode = null;
  let dragMoved = false;
  let dragStartInfo = null;
  let pinchStartInfo = null;
  let tapStart = null;

  function pointersArray(){ return Array.from(activePointers.values()); }
  function midpoint(a,b){ return {x:(a.x+b.x)/2, y:(a.y+b.y)/2}; }
  function dist(a,b){ return Math.hypot(a.x-b.x, a.y-b.y); }
  function selectedRotationPivot(){
    if(!deps.selection.selected) return null;
    const rendering=bodyRadiusRendering(deps.selection.selected,deps.selection.selected===sunReference);
    if(!rendering.scaleAccurate) return null;
    const position=positionForBody(deps.selection.selected,deps.clock.simDaysSinceJ2000);
    if(!position) return null;
    const screen=project(position.x,position.y,position.z);
    return {
      body:deps.selection.selected,
      position,
      anchorX:screen.x,
      anchorY:screen.y
    };
  }
  function pointerDragStart(x,y){
    return {
      x,y,panX:deps.camera.panX,panY:deps.camera.panY,yaw:deps.camera.viewYaw,tilt:deps.camera.viewTilt,
      observatoryAzimuth:deps.observatory.observatoryAzimuth,observatoryAltitude:deps.observatory.observatoryAltitude,observatoryFov:deps.observatory.observatoryFov,
      spacecraftLookYaw:deps.cockpit.spacecraftLookYaw,spacecraftLookPitch:deps.cockpit.spacecraftLookPitch,spacecraftFov:deps.cockpit.spacecraftFov,
      rotationPivot:selectedRotationPivot()
    };
  }

  function endPointer(e){
    if(deps.editor.bodyVelocityPointer===e.pointerId){
      updateDraftVelocity(e.clientX,e.clientY);
      deps.editor.bodyVelocityPointer=null;
      if(deps.editor.bodyDraft?.velocity){
        deps.editor.bodyInsertionPhase='ready';
        document.getElementById('bodyInsertBtn').disabled=false;
        document.getElementById('bodyInstructions').textContent=
          'Review the vector, then press INSERT or PLACE to start over.';
      }
      return;
    }
    activePointers.delete(e.pointerId);
    if(activePointers.size===0){
      if(!dragMoved && tapStart && (performance.now()-tapStart.t) < 500){
        const hit = hitTest(tapStart.x, tapStart.y);
        if(hit){
          if(deps.observatory.observatoryActive && deps.observatory.observatoryTelescopeActive){
            setObservatoryTelescopeTarget(hit);
          } else {
            toggleBodySelection(hit);
          }
        }
      }
      dragMode = null; dragStartInfo = null; pinchStartInfo = null; tapStart = null; dragMoved=false;
      scene.style.cursor = 'grab';
    } else if(activePointers.size===1){
      const [p] = pointersArray();
      dragMode=deps.cockpit.spacecraftViewActive
        ? 'spacecraft'
        : deps.observatory.observatoryActive ? 'observatory' : p.pan ? 'pan' : 'rotate';
      dragMoved = true;
      dragStartInfo=pointerDragStart(p.x,p.y);
    }
  }

  let initialized=false;
  function initialize(){
    if(initialized) return;
    initialized=true;
    scene.addEventListener('mousemove', (e)=>{
      if(activePointers.size>0) return; // dragging/pinching takes priority
      const nextHovered = hitTest(e.clientX, e.clientY);
      if(nextHovered !== deps.selection.hovered){ deps.selection.hovered = nextHovered; deps.camera.orbitLayerDirty=true; }
      scene.style.cursor = deps.selection.hovered ? 'pointer' : 'grab';
    });
    scene.addEventListener('pointerdown', (e)=>{
      const rightMouseButton=e.pointerType==='mouse' && e.button===2;
      if(e.pointerType==='mouse' && e.button!==0 && !rightMouseButton) return;
      if(deps.editor.bodyInsertionPhase==='position' && !rightMouseButton){
        const position=screenToEcliptic(e.clientX,e.clientY);
        if(!position){
          document.getElementById('bodyInstructions').textContent=
            'Rotate away from an edge-on ecliptic view, then try placement again.';
          return;
        }
        deps.editor.bodyDraft.position=position;
        deps.editor.bodyInsertionPhase='velocity';
        document.getElementById('bodyInstructions').textContent=
          'Drag to set direction and speed; the inclination slider tilts the velocity out of the ecliptic.';
        updateBodyReadout();
        return;
      }
      if(deps.editor.bodyInsertionPhase==='velocity' && !rightMouseButton){
        deps.editor.bodyVelocityPointer=e.pointerId;
        scene.setPointerCapture(e.pointerId);
        updateDraftVelocity(e.clientX,e.clientY);
        return;
      }
      scene.setPointerCapture(e.pointerId);
      activePointers.set(e.pointerId, {
        x:e.clientX,y:e.clientY,pan:rightMouseButton
      });
      if(activePointers.size===1){
        dragMode=deps.cockpit.spacecraftViewActive
          ? 'spacecraft'
          : deps.observatory.observatoryActive
          ? 'observatory'
          : rightMouseButton ? 'pan' : 'rotate';
        dragMoved = false;
        dragStartInfo=pointerDragStart(e.clientX,e.clientY);
        tapStart=rightMouseButton
          ? null
          : {x:e.clientX,y:e.clientY,t:performance.now()};
        scene.style.cursor = 'grabbing';
      } else if(activePointers.size===2){
        const [a,b] = pointersArray();
        pinchStartInfo = {
          dist:dist(a,b),mid:midpoint(a,b),zoom:deps.camera.zoom,panX:deps.camera.panX,panY:deps.camera.panY,
          observatoryFov:deps.observatory.observatoryFov,spacecraftFov:deps.cockpit.spacecraftFov
        };
        dragMode = 'two'; dragMoved = true; tapStart = null;
      }
    });
    scene.addEventListener('pointermove', (e)=>{
      if(deps.editor.bodyVelocityPointer===e.pointerId){
        updateDraftVelocity(e.clientX,e.clientY);
        return;
      }
      if(!activePointers.has(e.pointerId)) return;
      const pointer=activePointers.get(e.pointerId);
      activePointers.set(e.pointerId, {
        x:e.clientX,y:e.clientY,pan:pointer.pan
      });

      if(dragMode==='spacecraft' && activePointers.size===1){
        const dx=e.clientX-dragStartInfo.x;
        const dy=e.clientY-dragStartInfo.y;
        if(Math.hypot(dx,dy)>6) dragMoved=true;
        const look=SpacecraftView.lookFromDrag(
          dragStartInfo.spacecraftLookYaw,
          dragStartInfo.spacecraftLookPitch,
          dx,dy
        );
        deps.cockpit.spacecraftLookYaw=look.yaw;
        deps.cockpit.spacecraftLookPitch=look.pitch;
      } else if(dragMode==='observatory' && activePointers.size===1){
        const dx=e.clientX-dragStartInfo.x;
        const dy=e.clientY-dragStartInfo.y;
        if(Math.hypot(dx,dy)>6){
          dragMoved=true;
          if(deps.observatory.observatoryTelescopeActive){
            setObservatoryTelescopeTracking(false);
          }
        }
        const sensitivity=deps.observatory.observatoryTelescopeActive
          ? dragStartInfo.observatoryFov/Math.max(320,deps.viewport.H)
          : 0.004;
        deps.observatory.observatoryAzimuth=dragStartInfo.observatoryAzimuth-dx*sensitivity;
        deps.observatory.observatoryAltitude=Math.max(
          -89*DEG,Math.min(
            89*DEG,
            dragStartInfo.observatoryAltitude+dy*sensitivity
          )
        );
      } else if(dragMode==='rotate' && activePointers.size===1){
        const dx=e.clientX-dragStartInfo.x, dy=e.clientY-dragStartInfo.y;
        if(Math.hypot(dx,dy)>6){
          dragMoved=true;
          if(!dragStartInfo.rotationPivot) setFollowTarget(null);
        }
        const rotation=rotationFromDrag(dragStartInfo.yaw,dragStartInfo.tilt,dx,dy);
        deps.camera.viewYaw=rotation.yaw;
        deps.camera.viewTilt=rotation.tilt;
        if(deps.lagrange.rotatingReferenceFrame){
          const baseYaw=rotatingBaseYaw();
          if(baseYaw!==null) deps.lagrange.rotatingYawOffset=deps.camera.viewYaw-baseYaw;
        }
        if(dragStartInfo.rotationPivot){
          const pivot=dragStartInfo.rotationPivot;
          const currentPosition=positionForBody(pivot.body,deps.clock.simDaysSinceJ2000)||
            pivot.position;
          const nextPan=panForRotationPivot(
            pivot.anchorX,pivot.anchorY,currentPosition,deps.camera.viewYaw,deps.camera.viewTilt,
            AU_PX*deps.camera.zoom,deps.viewport.cx,deps.viewport.cy
          );
          deps.camera.panX=nextPan.panX;
          deps.camera.panY=nextPan.panY;
        }
        selectViewPreset('Current');
        invalidateProjection();
      } else if(dragMode==='pan' && activePointers.size===1){
        const dx = e.clientX - dragStartInfo.x, dy = e.clientY - dragStartInfo.y;
        if(Math.hypot(dx,dy) > 6){
          dragMoved = true;
          setFollowTarget(null);
        }
        deps.camera.panX = dragStartInfo.panX + dx;
        deps.camera.panY = dragStartInfo.panY + dy;
        selectViewPreset('Current');
        invalidateProjection();
      } else if(dragMode==='two' && activePointers.size===2){
        const [a,b] = pointersArray();
        const newDist = dist(a,b);
        const mid = midpoint(a,b);
        const scale = newDist / pinchStartInfo.dist;
        if(deps.cockpit.spacecraftViewActive){
          deps.cockpit.spacecraftFov=Math.max(
            8*DEG,Math.min(120*DEG,pinchStartInfo.spacecraftFov/scale)
          );
          return;
        }
        if(deps.observatory.observatoryActive){
          const minimum=deps.observatory.observatoryTelescopeActive
            ? TELESCOPE_MIN_FOV
            : 8*DEG;
          const maximum=deps.observatory.observatoryTelescopeActive
            ? TELESCOPE_MAX_FOV
            : 120*DEG;
          deps.observatory.observatoryFov=Math.max(
            minimum,Math.min(maximum,pinchStartInfo.observatoryFov/scale)
          );
          if(deps.observatory.observatoryTelescopeActive) syncObservatoryTelescopeControls();
          return;
        }
        const newZoom=constrainedZoom(pinchStartInfo.zoom*scale);
        // anchor zoom at the pinch's original midpoint, then add any midpoint drift as pan
        const preX = (pinchStartInfo.mid.x - deps.viewport.cx - pinchStartInfo.panX)/pinchStartInfo.zoom;
        const preY = (pinchStartInfo.mid.y - deps.viewport.cy - pinchStartInfo.panY)/pinchStartInfo.zoom;
        deps.camera.zoom = newZoom;
        deps.camera.panX = mid.x - deps.viewport.cx - preX*deps.camera.zoom;
        deps.camera.panY = mid.y - deps.viewport.cy - preY*deps.camera.zoom;
        setFollowTarget(null);
        selectViewPreset('Current');
        invalidateProjection();
      } else {
        const nextHovered = hitTest(e.clientX, e.clientY);
        if(nextHovered !== deps.selection.hovered){ deps.selection.hovered = nextHovered; deps.camera.orbitLayerDirty=true; }
      }
    });
    scene.addEventListener('pointerup', endPointer);
    scene.addEventListener('pointercancel', endPointer);
    scene.addEventListener('contextmenu',e=>e.preventDefault());
    scene.addEventListener('pointerleave', (e)=>{
      if(e.pointerType==='mouse' && activePointers.size===0 && deps.selection.hovered){
        deps.selection.hovered=null;
        deps.camera.orbitLayerDirty=true;
      }
    });
    document.getElementById('zoomInBtn').addEventListener('click', ()=>{
      if(deps.cockpit.spacecraftViewActive){
        deps.cockpit.spacecraftFov=Math.max(8*DEG,deps.cockpit.spacecraftFov/1.25);
      } else if(deps.observatory.observatoryActive){
        deps.observatory.observatoryFov=Math.max(
          deps.observatory.observatoryTelescopeActive ? TELESCOPE_MIN_FOV : 8*DEG,
          deps.observatory.observatoryFov/1.25
        );
        if(deps.observatory.observatoryTelescopeActive) syncObservatoryTelescopeControls();
      } else {
        applyZoom(deps.camera.zoom*1.35,deps.viewport.cx,deps.viewport.cy);
      }
    });
    document.getElementById('zoomOutBtn').addEventListener('click', ()=>{
      if(deps.cockpit.spacecraftViewActive){
        deps.cockpit.spacecraftFov=Math.min(120*DEG,deps.cockpit.spacecraftFov*1.25);
      } else if(deps.observatory.observatoryActive){
        deps.observatory.observatoryFov=Math.min(
          deps.observatory.observatoryTelescopeActive ? TELESCOPE_MAX_FOV : 120*DEG,
          deps.observatory.observatoryFov*1.25
        );
        if(deps.observatory.observatoryTelescopeActive) syncObservatoryTelescopeControls();
      } else {
        applyZoom(deps.camera.zoom/1.35,deps.viewport.cx,deps.viewport.cy);
      }
    });
    scene.addEventListener('wheel', (e)=>{
      e.preventDefault();
      if(deps.cockpit.spacecraftViewActive){
        const factor=e.deltaY<0?0.9:1.1;
        deps.cockpit.spacecraftFov=Math.max(
          8*DEG,Math.min(120*DEG,deps.cockpit.spacecraftFov*factor)
        );
      } else if(deps.observatory.observatoryActive){
        const factor=e.deltaY<0?0.9:1.1;
        const minimum=deps.observatory.observatoryTelescopeActive
          ? TELESCOPE_MIN_FOV
          : 8*DEG;
        const maximum=deps.observatory.observatoryTelescopeActive
          ? TELESCOPE_MAX_FOV
          : 120*DEG;
        deps.observatory.observatoryFov=Math.max(
          minimum,Math.min(maximum,deps.observatory.observatoryFov*factor)
        );
        if(deps.observatory.observatoryTelescopeActive) syncObservatoryTelescopeControls();
      } else {
        applyZoom(deps.camera.zoom*(e.deltaY<0?1.1:0.9),e.clientX,e.clientY);
      }
    }, {passive:false});
    window.addEventListener('keydown', (e)=>{
      const shortcutBlocked=['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)||e.target.isContentEditable;
      if(e.code==='Space' && !shortcutBlocked){
        e.preventDefault();
        if(!e.repeat) playBtn.click();
        return;
      }
      if(shortcutBlocked) return;
      if(e.key==='-'){ deps.clock.direction = -deps.clock.direction; updateSpeedLabel(); }
      if(e.repeat) return;
      if(e.code==='KeyP') toggleProfiler();
      if(e.code==='KeyM') togglePanel('missionPanel');
      if(e.code==='KeyW') togglePanel('plannerPanel');
      if(e.code==='KeyL') togglePanel('legend');
      if(e.code==='KeyT') togglePanel('dock');
      if(e.code==='KeyG') setLagrangeVisibility(!deps.lagrange.showLagrangePoints);
      if(e.code==='KeyR') setRotatingReferenceFrame(!deps.lagrange.rotatingReferenceFrame);
      if(e.code==='KeyO') setObservatoryMode(!deps.observatory.observatoryActive);
      if(e.code==='KeyV') setSpacecraftView(!deps.cockpit.spacecraftViewActive);
      if(e.code==='KeyE'){
        const panel=document.getElementById('occultationPanel');
        setOccultationPanelVisible(panel.classList.contains('panel-hidden'));
      }
    });
  }

  return {
    initialize
  };
});
