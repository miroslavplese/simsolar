(function(root,factory){
  const api={create:factory};
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.SimSolarTutorial=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(deps){
  'use strict';

  const {document,window}=deps;
  const {GuidedTutorial}=window;
  const {setSpacecraftView}=deps.cockpit;
  const {
    setObservatoryMode,refreshObservatoryCatalog,setObservatoryTelescopeMode,
    observatoryTelescopeTargets,syncObservatoryTelescopeControls
  }=deps.observatory;
  const {clearObservatoryCloudRequest,syncObservatoryCloudControls}=deps.clouds;
  const {closeBodyPanel,resetBodyInsertion}=deps.editor;
  const {setLagrangeVisibility,setRotatingReferenceFrame}=deps.lagrange;
  const {setSelectedBody,bodyInfo}=deps.selection;
  const {setFollowTarget,invalidateProjection}=deps.camera;
  const {DEFAULT_TILT}=deps.constants;
  const {buildLegend}=deps.legend;
  const {customBodies}=deps.simulation;
  const {clearSimulationCaches}=deps.transitions;
  const {refreshMissionTimelineCatalog}=deps.timeline;
  const {refreshOccultationCatalog}=deps.occultations;
  const {planets}=deps.catalog;

  const tutorialPanelIds=[
    'legend','missionPanel','plannerPanel','occultationPanel','impactPanel','dock'
  ];
  let tutorialSnapshot=null;
  let tutorialSystemSnapshot=null;
  let tutorialShowPlannerArtifacts=true;

  function tutorialPanelVisibility(){
    return Object.fromEntries(tutorialPanelIds.map(id=>[
      id,!document.getElementById(id).classList.contains('panel-hidden')
    ]));
  }

  function prepareTutorialView(){
    if(deps.cockpit.spacecraftViewActive) setSpacecraftView(false);
    if(deps.observatory.observatoryActive) setObservatoryMode(false,true);
    deps.clouds.observatoryCloudsEnabled=false;
    clearObservatoryCloudRequest();
    syncObservatoryCloudControls();
    deps.profiler.setProfilerVisible(false);
    document.getElementById('bodyPanel').classList.remove('show');
    document.getElementById('addBodyBtn').classList.remove('active');
    for(const id of tutorialPanelIds) deps.panels.setPanelVisible(id,false);
    deps.panels.setPanelVisible('dock',true);
  }

  function setTutorialBodyPanel(visible){
    if(!visible){
      closeBodyPanel();
      return;
    }
    resetBodyInsertion();
    const panel=document.getElementById('bodyPanel');
    panel.classList.add('show');
    const button=document.getElementById('addBodyBtn');
    button.classList.add('active');
    button.setAttribute('aria-expanded','true');
  }

  function setTutorialScene(options={}){
    if(deps.cockpit.spacecraftViewActive) setSpacecraftView(false);
    if(deps.observatory.observatoryActive && !options.observatory){
      setObservatoryMode(false,true);
    }
    deps.profiler.setProfilerVisible(false);
    for(const id of tutorialPanelIds) deps.panels.setPanelVisible(id,false);
    setTutorialBodyPanel(false);
    tutorialShowPlannerArtifacts=options.plannerArtifacts===true;
    deps.camera.orbitLayerDirty=true;
    setLagrangeVisibility(false);
    setRotatingReferenceFrame(false);
    setSelectedBody(null,false);
    setFollowTarget(null);
    if(options.observatory){
      setObservatoryMode(true,true);
      return;
    }
    deps.camera.viewYaw=0;
    deps.camera.viewTilt=DEFAULT_TILT;
    deps.camera.panX=0;
    deps.camera.panY=0;
    deps.camera.zoom=options.zoom||1;
    deps.visibility.showSpacecraft=options.spacecraft===true;
    deps.visibility.showComets=options.comets===true;
    invalidateProjection();
    buildLegend();
    for(const id of options.panels||[]) deps.panels.setPanelVisible(id,true);
    setTutorialBodyPanel(options.bodyPanel===true);
  }

  function restoreTutorialView(){
    if(!tutorialSnapshot) return;
    if(tutorialSystemSnapshot){
      deps.simulation.editableSystem=tutorialSystemSnapshot;
      customBodies.splice(0,customBodies.length,
        ...deps.simulation.editableSystem.bodies.filter(body=>body.kind==='custom'));
      tutorialSystemSnapshot=null;
    }
    clearSimulationCaches();
    deps.lagrange.clearCache();
    deps.planner.missionPlannerController?.catalogChanged();
    refreshMissionTimelineCatalog();
    refreshOccultationCatalog();
    refreshObservatoryCatalog();
    deps.clock.simDaysSinceJ2000=Math.max(
      deps.simulation.editableSystem?.epoch??-Infinity,tutorialSnapshot.time
    );
    tutorialShowPlannerArtifacts=true;
    deps.visibility.showSpacecraft=tutorialSnapshot.spacecraft;
    deps.visibility.showComets=tutorialSnapshot.comets;
    setSelectedBody(tutorialSnapshot.selected,false);
    if(tutorialSnapshot.lagrange) setLagrangeVisibility(true);
    if(tutorialSnapshot.rotating) setRotatingReferenceFrame(true);
    deps.camera.zoom=tutorialSnapshot.view.zoom;
    deps.camera.panX=tutorialSnapshot.view.panX;
    deps.camera.panY=tutorialSnapshot.view.panY;
    deps.camera.viewYaw=tutorialSnapshot.view.yaw;
    deps.camera.viewTilt=tutorialSnapshot.view.tilt;
    setFollowTarget(tutorialSnapshot.follow);
    deps.clouds.observatoryCloudsEnabled=tutorialSnapshot.clouds;
    clearObservatoryCloudRequest();
    syncObservatoryCloudControls();
    if(deps.observatory.observatoryActive!==tutorialSnapshot.observatory){
      setObservatoryMode(tutorialSnapshot.observatory,true);
    }
    if(tutorialSnapshot.observatory){
      if(deps.observatory.observatoryTelescopeActive){
        setObservatoryTelescopeMode(false,true);
      }
      deps.observatory.observatoryFov=tutorialSnapshot.telescope.fov;
      deps.observatory.observatoryWideFov=tutorialSnapshot.telescope.wideFov;
      deps.observatory.observatoryExposure=tutorialSnapshot.telescope.exposure;
      deps.observatory.observatoryTelescopeTracking=tutorialSnapshot.telescope.tracking;
      deps.observatory.observatoryTelescopeReticle=tutorialSnapshot.telescope.reticle;
      deps.observatory.observatoryTelescopeTarget=observatoryTelescopeTargets().find(
        body=>body.name===tutorialSnapshot.telescope.target
      )||null;
      if(tutorialSnapshot.telescope.active){
        setObservatoryTelescopeMode(true,true);
      } else {
        syncObservatoryTelescopeControls();
      }
    }
    if(tutorialSnapshot.spacecraftView) setSpacecraftView(true,true);
    for(const [id,visible] of Object.entries(tutorialSnapshot.panels)){
      deps.panels.setPanelVisible(id,visible);
    }
    document.getElementById('bodyPanel').classList.toggle(
      'show',tutorialSnapshot.bodyPanel
    );
    document.getElementById('addBodyBtn').classList.toggle(
      'active',tutorialSnapshot.bodyPanel
    );
    document.getElementById('addBodyBtn').setAttribute(
      'aria-expanded',String(tutorialSnapshot.bodyPanel)
    );
    invalidateProjection();
    buildLegend();
    tutorialSnapshot=null;
  }

  const guidedTutorial=GuidedTutorial.create({
    document,
    window,
    onStart(){
      tutorialSnapshot={
        observatory:deps.observatory.observatoryActive,
        clouds:deps.clouds.observatoryCloudsEnabled,
        telescope:{
          active:deps.observatory.observatoryTelescopeActive,
          target:deps.observatory.observatoryTelescopeTarget?.name||null,
          tracking:deps.observatory.observatoryTelescopeTracking,
          reticle:deps.observatory.observatoryTelescopeReticle,
          exposure:deps.observatory.observatoryExposure,
          fov:deps.observatory.observatoryFov,
          wideFov:deps.observatory.observatoryWideFov
        },
        spacecraftView:deps.cockpit.spacecraftViewActive,
        spacecraft:deps.visibility.showSpacecraft,
        comets:deps.visibility.showComets,
        selected:deps.selection.selected,
        follow:deps.camera.followTarget,
        lagrange:deps.lagrange.showLagrangePoints,
        rotating:deps.lagrange.rotatingReferenceFrame,
        time:deps.clock.simDaysSinceJ2000,
        view:{zoom:deps.camera.zoom,panX:deps.camera.panX,panY:deps.camera.panY,yaw:deps.camera.viewYaw,tilt:deps.camera.viewTilt},
        panels:tutorialPanelVisibility(),
        bodyPanel:document.getElementById('bodyPanel').classList.contains('show')
      };
      if(deps.simulation.editableSystem){
        tutorialSystemSnapshot=deps.simulation.editableSystem;
        deps.simulation.editableSystem=null;
        customBodies.length=0;
        clearSimulationCaches();
        deps.lagrange.clearCache();
        deps.planner.missionPlannerController?.catalogChanged();
        refreshMissionTimelineCatalog();
        refreshOccultationCatalog();
        refreshObservatoryCatalog();
      }
      prepareTutorialView();
    },
    onFinish:restoreTutorialView,
    steps:[
      {
        title:'Welcome to SimSolar',
        text:'Explore the Solar System across time, follow real mission trajectories, observe the sky from planetary surfaces, and experiment with gravity.\n\nUse NEXT to tour the essentials, or SKIP TUTORIAL at any time.',
        before(){ setTutorialScene(); }
      },
      {
        target:'#scene',
        interactive:true,
        title:'Navigate and select',
        text:'Drag with the left mouse button to rotate. Hold the right button and drag to pan. Use the wheel to zoom.\n\nClick a body or trajectory to select it and open its properties. On touch screens, drag to rotate and use two fingers to pan and zoom.',
        before(){ setTutorialScene({zoom:1.4}); }
      },
      {
        target:'#dock',
        interactive:true,
        title:'Control time and view',
        text:'Play, pause, jump by 30 days, change simulation speed, zoom, choose Inner/Outer/Deep presets, or return to today. Press T whenever you need to show or hide these controls.',
        before(){
          setTutorialScene({panels:['dock'],zoom:1.4});
        }
      },
      {
        target:'#legend',
        interactive:true,
        title:'Find and follow objects',
        text:'Choose planets, moons, spacecraft, and comets here. Selecting an entry focuses it, follows its motion, and opens properties with a reference image. Click the image to open its original source. Custom bodies and Lagrange points show labeled schematics.',
        before(){
          setTutorialScene({panels:['legend'],zoom:1});
        }
      },
      {
        target:'#missionPanel',
        interactive:true,
        title:'Replay historic missions',
        text:'The mission timeline includes Voyager, Pioneer, New Horizons, Parker Solar Probe, Webb, Lucy, Psyche, and Europa Clipper. Jump to launches, flybys, and milestones using bundled JPL trajectories. After the cutoff, future gravity-only paths omit planned burns and station-keeping.',
        before(){
          setTutorialScene({
            panels:['missionPanel'],spacecraft:true,zoom:0.32
          });
        }
      },
      {
        target:'#plannerPanel',
        interactive:true,
        title:'Design an interplanetary mission',
        text:'Choose an Earth launch window and a final target, optionally add planetary gravity assists, then compare patched-conic routes. Inspect encounters, save plans locally, preview the flight, or enter Spacecraft View to ride inside the planned vehicle with live telemetry.',
        before(){
          setTutorialScene({
            panels:['plannerPanel'],plannerArtifacts:true,zoom:0.65
          });
        }
      },
      {
        target:'#occultationPanel',
        interactive:true,
        title:'Search the sky',
        text:'Find eclipses, planetary transits, and close planet alignments for a selected surface observer. Results can open directly in Observatory Mode.',
        before(){
          setTutorialScene({panels:['occultationPanel'],zoom:1});
        }
      },
      {
        target:'#observatoryPanel',
        interactive:true,
        title:'Stand on another world',
        text:'Observatory Mode shows the local sky from cities on Earth or modeled planetary surfaces. Choose a location, look around, accelerate time, and optionally show projected orbit paths.',
        before(){
          setTutorialScene({observatory:true});
        }
      },
      {
        target:'#bodyPanel',
        interactive:true,
        title:'Experiment with gravity',
        text:'Click ✦ to introduce a star, black hole, planet, or comet in the future N-body simulation. Choose a 0–180° inclination, place its orbital node, set velocity, and watch for predicted impacts. Zoom in—or enter Observatory Mode—to see its physical size and appearance.',
        before(){
          setTutorialScene({bodyPanel:true,zoom:1});
        }
      },
      {
        target:'#impactPanel',
        interactive:true,
        title:'Monitor close encounters',
        text:'The impact monitor predicts physical contact involving custom bodies. When a collision occurs, you can inspect it, continue, or merge custom bodies while conserving momentum.',
        before(){
          setTutorialScene({panels:['impactPanel'],zoom:1});
        }
      },
      {
        target:'#lagrangeBtn',
        interactive:true,
        title:'Explore orbital geometry',
        text:'Select a planet or moon, then click L₅ to reveal its five Lagrange points. The ↻ button beside it switches to a co-rotating frame.',
        before(){
          setTutorialScene({zoom:1});
          const earth=planets.find(body=>body.name==='Earth');
          setSelectedBody(earth,false);
          setLagrangeVisibility(true);
          bodyInfo.setVisible(false);
        }
      },
      {
        target:'#shareScenarioBtn',
        interactive:true,
        title:'Share what you discover',
        text:'Click ↗ to copy a link containing the current date, camera, selected object, visible layers, and Observatory setup. Anyone opening it sees the same scenario.',
        before(){ setTutorialScene({zoom:1}); }
      },
      {
        target:'#tutorialBtn',
        title:'You are ready to explore',
        text:'The tutorial will not open automatically again after you finish or skip it. Click ? in the top toolbar whenever you want to replay it.\n\nKeyboard shortcuts include Space for play/pause and V, W, M, L, T, E, O, G, R, and P for major tools.',
        before(){ setTutorialScene(); }
      }
    ]
  });

  let initialized=false;
  function initialize(){
    if(initialized) return;
    initialized=true;
    document.getElementById('tutorialBtn').addEventListener(
      'click',()=>guidedTutorial.start()
    );
  }

  let autoStartTimer=null;
  function scheduleAutoStart(){
    if(autoStartTimer!==null || !guidedTutorial.shouldStart()) return;
    autoStartTimer=window.setTimeout(()=>{
      autoStartTimer=null;
      guidedTutorial.start();
    },500);
  }

  function cancelAutoStart(){
    if(autoStartTimer!==null) window.clearTimeout(autoStartTimer);
    autoStartTimer=null;
  }

  return {
    initialize,
    scheduleAutoStart,
    cancelAutoStart,
    get tutorialShowPlannerArtifacts(){ return tutorialShowPlannerArtifacts; }
  };
});
