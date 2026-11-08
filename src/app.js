(function(){
  'use strict';

  const constants=SimSolarConstants.create({});
  const catalog=SimSolarCatalog.create({
    window,
    constants
  });
  // Forward dependencies are read by callbacks after all components exist.
  const viewport=SimSolarViewport.create({
    document,window,
    get stars(){ return stars; },
    get camera(){ return camera; }
  });
  const camera=SimSolarCamera.create({
    document,window,
    constants,
    viewport,
    get simulation(){ return simulation; },
    get clock(){ return clock; },
    get selection(){ return selection; },
    catalog,
    get profiler(){ return profiler; },
    get lagrange(){ return lagrange; },
    get visibility(){ return visibility; },
    get legend(){ return legend; }
  });
  const simulation=SimSolarSimulation.create({
    window,
    catalog,
    constants,
    get lagrange(){ return lagrange; }
  });
  const visibility=SimSolarVisibility.create({
    window,
    catalog,
    camera,
    constants,
    viewport,
    get selection(){ return selection; },
    simulation,
    get clock(){ return clock; },
    get lagrange(){ return lagrange; }
  });
  const stars=SimSolarStars.create({
    document,window,
    viewport,
    camera,
    constants
  });
  const surfaces=SimSolarSurfaces.create({
    document,window,
    camera,
    catalog,
    constants,
    simulation,
    get clock(){ return clock; },
    viewport
  });
  const orbits=SimSolarOrbits.create({
    window,
    simulation,
    catalog,
    constants,
    camera,
    viewport,
    get clock(){ return clock; },
    get lagrange(){ return lagrange; },
    visibility,
    get selection(){ return selection; },
    surfaces,
    get tutorial(){ return tutorial; },
    get planner(){ return planner; }
  });
  const rings=SimSolarRings.create({
    window,
    constants,
    camera,
    viewport,
    surfaces,
    simulation,
    get clock(){ return clock; },
    get observatoryRenderer(){ return observatoryRenderer; }
  });
  const overlays=SimSolarOverlays.create({
    get editor(){ return editor; },
    camera,
    viewport,
    get lagrange(){ return lagrange; },
    get clock(){ return clock; },
    get occultations(){ return occultations; },
    simulation
  });
  const sceneRenderer=SimSolarSceneRenderer.create({
    window,
    get lagrange(){ return lagrange; },
    get cockpit(){ return cockpit; },
    get cockpitRenderer(){ return cockpitRenderer; },
    get clock(){ return clock; },
    get selection(){ return selection; },
    get observatory(){ return observatory; },
    get observatoryRenderer(){ return observatoryRenderer; },
    stars,
    camera,
    visibility,
    get legend(){ return legend; },
    viewport,
    orbits,
    simulation,
    catalog,
    surfaces,
    overlays,
    rings,
    get tutorial(){ return tutorial; },
    get planner(){ return planner; }
  });
  const observatoryRenderer=SimSolarObservatoryRenderer.create({
    document,window,
    catalog,
    constants,
    get observatory(){ return observatory; },
    viewport,
    surfaces,
    stars,
    get clock(){ return clock; },
    simulation,
    orbits,
    get selection(){ return selection; },
    rings,
    get clouds(){ return clouds; }
  });
  const clouds=SimSolarClouds.create({
    document,window,
    get observatory(){ return observatory; },
    constants,
    get clock(){ return clock; },
    viewport
  });
  const cockpitRenderer=SimSolarCockpitRenderer.create({
    document,window,
    get observatory(){ return observatory; },
    stars,
    viewport,
    get cockpit(){ return cockpit; },
    get planner(){ return planner; },
    get clock(){ return clock; },
    simulation,
    observatoryRenderer
  });
  const clock=SimSolarClock.create({
    document,window,
    constants,
    get observatory(){ return observatory; },
    simulation,
    catalog,
    get impacts(){ return impacts; },
    camera
  });
  const planner=SimSolarPlanner.create({
    document,window,
    simulation,
    catalog,
    get cockpit(){ return cockpit; },
    get observatory(){ return observatory; },
    get lagrange(){ return lagrange; },
    camera,
    constants,
    viewport,
    clock,
    get selection(){ return selection; }
  });
  const timeline=SimSolarTimeline.create({
    document,window,
    catalog,
    constants,
    simulation,
    camera,
    clock,
    get selection(){ return selection; },
    visibility,
    get legend(){ return legend; }
  });
  const occultations=SimSolarOccultations.create({
    document,window,
    catalog,
    simulation,
    get observatory(){ return observatory; },
    observatoryRenderer,
    clock,
    constants,
    get selection(){ return selection; },
    get panels(){ return panels; }
  });
  const lagrange=SimSolarLagrange.create({
    document,window,
    simulation,
    catalog,
    get selection(){ return selection; },
    clock,
    viewport,
    camera,
    constants,
    get legend(){ return legend; }
  });
  const editor=SimSolarEditor.create({
    document,window,
    simulation,
    camera,
    constants,
    clock,
    get transitions(){ return transitions; },
    planner,
    get selection(){ return selection; }
  });
  const impacts=SimSolarImpacts.create({
    document,window,
    catalog,
    constants,
    simulation,
    get panels(){ return panels; },
    clock,
    get transitions(){ return transitions; },
    get selection(){ return selection; }
  });
  const legend=SimSolarLegend.create({
    document,window,
    get selection(){ return selection; },
    get transitions(){ return transitions; },
    get panels(){ return panels; },
    simulation,
    catalog,
    visibility,
    camera,
    lagrange
  });
  const selection=SimSolarSelection.create({
    document,window,
    editor,
    catalog,
    simulation,
    clock,
    constants,
    lagrange,
    camera,
    timeline,
    get panels(){ return panels; },
    occultations,
    legend,
    get cockpit(){ return cockpit; },
    get observatory(){ return observatory; }
  });
  const observatory=SimSolarObservatory.create({
    document,window,
    constants,
    simulation,
    visibility,
    viewport,
    stars,
    selection,
    clock,
    clouds,
    observatoryRenderer,
    get cockpit(){ return cockpit; },
    editor,
    impacts,
    camera
  });
  const cockpit=SimSolarCockpit.create({
    document,window,
    constants,
    planner,
    get scenarios(){ return scenarios; },
    observatory,
    stars,
    editor,
    get panels(){ return panels; },
    lagrange,
    clock,
    cockpitRenderer,
    viewport,
    camera
  });
  const transitions=SimSolarTransitions.create({
    document,window,
    simulation,
    constants,
    catalog,
    clock,
    selection,
    camera,
    observatory,
    lagrange,
    timeline,
    occultations,
    impacts,
    planner,
    cockpit,
    legend,
    get scenarios(){ return scenarios; },
    orbits,
    observatoryRenderer,
    viewport,
    get panels(){ return panels; },
    editor,
    get profiler(){ return profiler; }
  });
  const scenarios=SimSolarScenarios.create({
    document,window,
    simulation,
    clock,
    selection,
    camera,
    visibility,
    lagrange,
    observatory,
    clouds,
    cockpit,
    planner,
    timeline,
    occultations,
    transitions,
    constants,
    legend,
    get panels(){ return panels; }
  });
  const tutorial=SimSolarTutorial.create({
    document,window,
    cockpit,
    observatory,
    clouds,
    get profiler(){ return profiler; },
    get panels(){ return panels; },
    editor,
    camera,
    lagrange,
    selection,
    constants,
    visibility,
    legend,
    simulation,
    transitions,
    planner,
    timeline,
    occultations,
    clock,
    catalog
  });
  const panels=SimSolarPanels.create({
    document,window
  });
  const profiler=SimSolarProfiler.create({
    document,window,
    camera
  });
  const input=SimSolarInput.create({
    document,window,
    observatoryRenderer,
    cockpitRenderer,
    cockpit,
    observatory,
    visibility,
    simulation,
    catalog,
    orbits,
    viewport,
    selection,
    camera,
    surfaces,
    clock,
    editor,
    constants,
    lagrange,
    profiler,
    panels,
    occultations
  });
  const animation=SimSolarAnimation.create({
    document,window,
    clock,
    camera,
    profiler,
    observatory,
    impacts,
    planner,
    cockpit,
    simulation,
    sceneRenderer
  });

  camera.initialize();
  clock.initialize();
  occultations.initialize();
  lagrange.initialize();
  editor.initialize();
  impacts.initialize();
  observatory.initialize();
  cockpit.initialize();
  transitions.initialize();
  scenarios.initialize();
  tutorial.initialize();
  panels.initialize();
  profiler.initialize();
  input.initialize();

  timeline.buildMissionTimeline();
  planner.buildMissionPlanner();
  occultations.buildOccultationControls();
  observatory.buildObservatoryControls();
  const initialScenario=ScenarioState.scenarioFromUrl(window.location.href);
  if(initialScenario){
    scenarios.scenarioController.restore(initialScenario).catch(error=>
      scenarios.showScenarioStatus('SCENARIO RESTORE FAILED: '+error.message,true));
  }
  legend.buildLegend();
  lagrange.updateLagrangeControls();
  viewport.resize();
  window.addEventListener('resize', viewport.resize);
  animation.start();
  tutorial.scheduleAutoStart();
  window.addEventListener('pagehide',()=>{
    animation.stop();
    tutorial.cancelAutoStart();
    clock.cancelDateNavigation();
    planner.missionPlannerController?.cancelSearch();
    clouds.clearObservatoryCloudRequest();
  });
  window.addEventListener('pageshow',event=>{
    if(event.persisted){
      animation.start();
      tutorial.scheduleAutoStart();
    }
  });
})();
