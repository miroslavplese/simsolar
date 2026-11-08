(function(root,factory){
  const api={create:factory};
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.SimSolarVisibility=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(deps){
  'use strict';

  const {window}=deps;
  const {systemVisible:moonSystemVisibleAtZoom}=window.MoonSystem;
  const {charon,moonVisibilityDefinitions,planets,moons,sunReference,spacecraft,comets}=deps.catalog;
  const {AU_PX}=deps.constants;
  const {positionForBody,activeBodiesOf,activeSystemBodies,customBodies}=deps.simulation;
  const {project}=deps.camera;

  let showSpacecraft = false;
  let showComets = false;

  function moonSystemForBody(body){
    if(body?.kind==='moon') return body.parentName;
    return body===charon ? 'Pluto' : null;
  }

  function isMoonSystemVisible(parentName){
    if(!moonSystemVisibleAtZoom(
      moonVisibilityDefinitions,parentName,deps.camera.zoom,AU_PX,50
    )) return false;
    if(!deps.viewport.W || !deps.viewport.H) return false;
    const activeSystem=moonSystemForBody(deps.selection.selected)||
      moonSystemForBody(deps.camera.followTarget);
    if(activeSystem===parentName) return true;
    const parent=planets.find(body=>body.name===parentName);
    const pos=parent && positionForBody(parent,deps.clock.simDaysSinceJ2000);
    if(!pos) return false;
    const screen=project(pos.x,pos.y,pos.z);
    const margin=80;
    return screen.x>=-margin && screen.x<=deps.viewport.W+margin &&
      screen.y>=-margin && screen.y<=deps.viewport.H+margin;
  }

  function visibleMoons(){
    return activeBodiesOf(moons).filter(
      moon=>isMoonSystemVisible(moon.parentName)
    );
  }

  function moonVisibilityKey(){
    return [...new Set(moonVisibilityDefinitions.map(moon=>moon.parentName))]
      .filter(isMoonSystemVisible)
      .join('|');
  }

  function visibleBodies(){
    if(deps.simulation.editableSystem){
      const bodies=activeSystemBodies().filter(body=>
        body!==sunReference &&
        (body.kind!=='spacecraft'||showSpacecraft) &&
        (body.kind!=='comet'||showComets) &&
        (body.kind!=='moon'||isMoonSystemVisible(body.parentName)) &&
        (body!==charon||isMoonSystemVisible('Pluto'))
      );
      if(deps.lagrange.showLagrangePoints && deps.lagrange.activeLagrangeSystem){
        bodies.push(...deps.lagrange.activeLagrangeSystem.points);
      }
      return bodies;
    }
    const bodies=planets.filter(body=>body!==charon);
    bodies.push(...visibleMoons());
    if(isMoonSystemVisible('Pluto')) bodies.push(charon);
    if(showSpacecraft) bodies.push(...spacecraft);
    if(showComets) bodies.push(...comets);
    bodies.push(...customBodies.filter(body=>
      body.introducedAt<=deps.clock.simDaysSinceJ2000 &&
      (body.retiredAt===undefined || deps.clock.simDaysSinceJ2000<body.retiredAt)
    ));
    if(deps.lagrange.showLagrangePoints && deps.lagrange.activeLagrangeSystem){
      bodies.push(...deps.lagrange.activeLagrangeSystem.points);
    }
    return bodies;
  }

  return {
    visibleBodies,
    visibleMoons,
    isMoonSystemVisible,
    get showSpacecraft(){ return showSpacecraft; },
    set showSpacecraft(value){ showSpacecraft=value; },
    get showComets(){ return showComets; },
    set showComets(value){ showComets=value; },
    moonVisibilityKey
  };
});
