(function(root,factory){
  const api={create:factory};
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.SimSolarOverlays=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(deps){
  'use strict';

  const {project}=deps.camera;
  const {ctx}=deps.viewport;
  const {positionForBody}=deps.simulation;

  function drawBodyInsertionPreview(){
    if(!deps.editor.bodyDraft?.position || deps.editor.bodyInsertionPhase==='idle') return;
    const marker=project(
      deps.editor.bodyDraft.position.x,deps.editor.bodyDraft.position.y,deps.editor.bodyDraft.position.z
    );
    ctx.save();
    ctx.setLineDash([4,4]);
    ctx.strokeStyle='#f2b544';
    ctx.lineWidth=1.5;
    ctx.beginPath();
    ctx.arc(marker.x,marker.y,7,0,Math.PI*2);
    ctx.stroke();
    ctx.setLineDash([]);
    if(deps.editor.bodyDraft.velocity){
      const endpoint=project(
        deps.editor.bodyDraft.position.x+deps.editor.bodyDraft.direction.x,
        deps.editor.bodyDraft.position.y+deps.editor.bodyDraft.direction.y,
        deps.editor.bodyDraft.position.z+deps.editor.bodyDraft.direction.z
      );
      const dx=endpoint.x-marker.x, dy=endpoint.y-marker.y;
      const length=Math.hypot(dx,dy)||1;
      const arrowLength=Math.min(180,Math.max(12,deps.editor.bodyDraft.speedKmS*2));
      const endX=marker.x+dx/length*arrowLength;
      const endY=marker.y+dy/length*arrowLength;
      ctx.strokeStyle='#f2b544';
      ctx.fillStyle='#f2b544';
      ctx.beginPath();
      ctx.moveTo(marker.x,marker.y);
      ctx.lineTo(endX,endY);
      ctx.stroke();
      const angle=Math.atan2(endY-marker.y,endX-marker.x);
      ctx.beginPath();
      ctx.moveTo(endX,endY);
      ctx.lineTo(endX-9*Math.cos(angle-0.45),endY-9*Math.sin(angle-0.45));
      ctx.lineTo(endX-9*Math.cos(angle+0.45),endY-9*Math.sin(angle+0.45));
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawLagrangeGeometry(){
    if(!deps.lagrange.showLagrangePoints || !deps.lagrange.activeLagrangeSystem) return;
    const primary=deps.lagrange.lagrangeBodyState(
      deps.lagrange.activeLagrangeSystem.primary,deps.clock.simDaysSinceJ2000
    );
    const secondary=deps.lagrange.lagrangeBodyState(
      deps.lagrange.activeLagrangeSystem.secondary,deps.clock.simDaysSinceJ2000
    );
    const states=deps.lagrange.calculatedLagrangeStates(
      deps.lagrange.activeLagrangeSystem,deps.clock.simDaysSinceJ2000
    );
    if(!primary || !secondary || !states) return;
    const primaryScreen=project(primary.x,primary.y,primary.z);
    const secondaryScreen=project(secondary.x,secondary.y,secondary.z);
    ctx.save();
    ctx.setLineDash([4,5]);
    ctx.strokeStyle='rgba(102,199,255,0.2)';
    ctx.lineWidth=0.8;
    ctx.beginPath();
    ctx.moveTo(primaryScreen.x,primaryScreen.y);
    ctx.lineTo(secondaryScreen.x,secondaryScreen.y);
    for(const name of ['L4','L5']){
      const state=states.find(point=>point.name===name);
      const screen=project(state.x,state.y,state.z);
      ctx.moveTo(primaryScreen.x,primaryScreen.y);
      ctx.lineTo(screen.x,screen.y);
      ctx.lineTo(secondaryScreen.x,secondaryScreen.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawOccultationEvent(){
    if(!deps.occultations.activeOccultationEvent) return;
    const event=deps.occultations.activeOccultationEvent;
    if(event.type==='alignment') return;
    const observer=positionForBody(event.observer,deps.clock.simDaysSinceJ2000);
    const occulter=positionForBody(event.occulter,deps.clock.simDaysSinceJ2000);
    if(!observer || !occulter) return;
    const geometry=deps.occultations.occultationGeometryAt(
      event.observer,event.occulter,deps.clock.simDaysSinceJ2000
    );
    if(deps.occultations.isLocalOcculter(event.observer,event.occulter)){
      const observerScreen=project(observer.x,observer.y,observer.z);
      const occulterScreen=project(occulter.x,occulter.y,occulter.z);
      ctx.save();
      ctx.setLineDash([5,5]);
      ctx.strokeStyle='rgba(114,230,193,0.42)';
      ctx.lineWidth=1;
      ctx.beginPath();
      ctx.moveTo(observerScreen.x,observerScreen.y);
      ctx.lineTo(occulterScreen.x,occulterScreen.y);
      ctx.stroke();
      ctx.restore();
    }
    if(
      !Number.isFinite(geometry.separation) ||
      geometry.separation>
        5*(geometry.sourceAngularRadius+geometry.occulterAngularRadius)
    ) return;

    const centerX=Math.min(deps.viewport.W-90,Math.max(90,deps.viewport.cx));
    const centerY=92;
    const sunRadius=34;
    const ratio=geometry.occulterAngularRadius/geometry.sourceAngularRadius;
    const occulterRadius=Math.max(2,Math.min(70,sunRadius*ratio));
    const offset=Math.min(
      100,
      sunRadius*geometry.separation/geometry.sourceAngularRadius
    );
    ctx.save();
    ctx.fillStyle='rgba(10,14,26,0.88)';
    ctx.strokeStyle='rgba(114,230,193,0.36)';
    ctx.lineWidth=1;
    ctx.beginPath();
    ctx.roundRect(centerX-82,centerY-58,164,116,10);
    ctx.fill();
    ctx.stroke();
    const glow=ctx.createRadialGradient(
      centerX,centerY,0,centerX,centerY,sunRadius*1.5
    );
    glow.addColorStop(0,'rgba(255,243,214,1)');
    glow.addColorStop(0.62,'rgba(242,181,68,0.92)');
    glow.addColorStop(1,'rgba(242,181,68,0)');
    ctx.fillStyle=glow;
    ctx.beginPath();
    ctx.arc(centerX,centerY,sunRadius*1.5,0,Math.PI*2);
    ctx.fill();
    ctx.fillStyle='#fff1c7';
    ctx.beginPath();
    ctx.arc(centerX,centerY,sunRadius,0,Math.PI*2);
    ctx.fill();
    ctx.fillStyle='#080b13';
    ctx.strokeStyle=event.occulter.color||'#b9c1d9';
    ctx.beginPath();
    ctx.arc(centerX+offset,centerY,occulterRadius,0,Math.PI*2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle='#72e6c1';
    ctx.font='8.5px "SF Mono", Consolas, monospace';
    ctx.textAlign='center';
    ctx.fillText(
      event.label.toUpperCase()+' · '+
      (geometry.coverage*100).toFixed(geometry.coverage<0.01?2:1)+'%',
      centerX,centerY+51
    );
    ctx.textAlign='start';
    ctx.restore();
  }

  return {
    drawLagrangeGeometry,
    drawOccultationEvent,
    drawBodyInsertionPreview
  };
});
