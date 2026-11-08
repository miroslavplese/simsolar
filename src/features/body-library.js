(function(root,factory){
  const api={create:factory};
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.SimSolarLegend=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(deps){
  'use strict';

  const {document,window}=deps;
  const {isLuminous}=window.SystemModel;
  const {activeSystemBodies,activeBodiesOf}=deps.simulation;
  const {spacecraft,comets}=deps.catalog;
  const {moonVisibilityKey}=deps.visibility;

  let legendMoonVisibilityKey='';

  function appendLegendRow(container,body,options={}){
    const row=document.createElement('div');
    row.className='item'+(options.moon?' moon-item':'')+
      (options.off?' off':'');
    const marker=document.createElement('span');
    marker.className=options.diamond?'diamond':'dot';
    marker.style.background=body.color||'#aaa';
    const name=document.createElement('button');
    name.type='button';
    name.disabled=!!options.off;
    name.className='body-name';
    name.textContent=body.name;
    row.append(marker,name);
    if(!options.off){
      row.addEventListener('click',()=>deps.selection.toggleLegendBodySelection(body));
    }
    const remove=document.createElement('button');
    remove.className='body-delete';
    remove.type='button';
    remove.textContent='×';
    remove.title='Delete '+body.name;
    remove.setAttribute('aria-label','Delete '+body.name);
    remove.addEventListener('click',event=>{
      event.stopPropagation();
      deps.transitions.deleteSystemBody(body);
    });
    row.appendChild(remove);
    container.appendChild(row);
  }

  function appendLegendHierarchy(container,bodies){
    const bodyIds=new Set(bodies.map(body=>body.id));
    const bodyNames=new Set(bodies.map(body=>body.name));
    const appendFamily=body=>{
      appendLegendRow(container,body);
      const expanded=
        deps.selection.selected===body ||
        deps.selection.selected?.parentId===body.id ||
        deps.selection.selected?.parentName===body.name;
      if(expanded){
        for(const child of bodies){
          if(child.parentId===body.id || child.parentName===body.name){
            // A luminous parented body is a binary companion star,
            // listed at top level already - never shown as a child.
            if(isLuminous(child)) continue;
            appendLegendRow(container,child,{moon:true});
          }
        }
      }
    };
    for(const body of bodies){
      // Companion stars (parentId pointing at another star) are
      // listed at top level, never collapsed under their parent.
      const hasListedParent=!isLuminous(body) && (
        bodyIds.has(body.parentId) || bodyNames.has(body.parentName)
      );
      if(!hasListedParent) appendFamily(body);
    }
  }

  function buildLegend(){
    const el = document.getElementById('legend');
    el.innerHTML = '';
    const close = document.createElement('button');
    close.className='panel-close';
    close.type='button';
    close.title='Close bodies and spacecraft (L to reopen)';
    close.setAttribute('aria-label','Close bodies and spacecraft');
    close.textContent='✕';
    close.addEventListener('click',()=>deps.panels.setPanelVisible('legend',false));
    el.appendChild(close);
    const heading=document.createElement('div');
    heading.className='heading';
    heading.textContent='Bodies & spacecraft';
    el.appendChild(heading);
    if(deps.simulation.editableSystem){
      const status=document.createElement('div');
      status.className='system-status';
      status.textContent='EDITABLE SYSTEM · '+deps.simulation.editableSystem.bodies.length+
        ' BODIES';
      el.appendChild(status);
    }
    const active=activeSystemBodies();
    const natural=active.filter(body=>
      body.kind!=='spacecraft' && body.kind!=='comet' &&
      body.kind!=='custom'
    );
    const custom=active.filter(body=>body.kind==='custom');
    if(natural.length){
      const label=document.createElement('div');
      label.className='grp-label';
      label.textContent='Stars, planets & moons';
      el.appendChild(label);
      appendLegendHierarchy(el,natural);
    }
    if(custom.length){
      const label=document.createElement('div');
      label.className='grp-label';
      label.textContent='Custom bodies';
      el.appendChild(label);
      appendLegendHierarchy(el,custom);
    }
    const activeSpacecraft=activeBodiesOf(spacecraft);
    if(activeSpacecraft.length){
      const label=document.createElement('div');
      label.className='grp-label';
      label.textContent='Spacecraft (click to toggle all)';
      label.style.cursor='pointer';
      label.addEventListener('click',()=>{
        deps.visibility.showSpacecraft=!deps.visibility.showSpacecraft;
        deps.camera.orbitLayerDirty=true;
        buildLegend();
      });
      el.appendChild(label);
      for(const body of activeSpacecraft){
        appendLegendRow(el,body,{diamond:true,off:!deps.visibility.showSpacecraft});
      }
    }
    const activeComets=activeBodiesOf(comets);
    if(activeComets.length){
      const label=document.createElement('div');
      label.className='grp-label';
      label.textContent='Comets (click to toggle all)';
      label.style.cursor='pointer';
      label.addEventListener('click',()=>{
        deps.visibility.showComets=!deps.visibility.showComets;
        deps.camera.orbitLayerDirty=true;
        buildLegend();
      });
      el.appendChild(label);
      for(const body of activeComets){
        appendLegendRow(el,body,{off:!deps.visibility.showComets});
      }
    }
    if(!active.length){
      const empty=document.createElement('div');
      empty.className='plannerEmpty';
      empty.textContent='Blank system. Add a body to begin.';
      el.appendChild(empty);
    }
    if(deps.simulation.editableSystem){
      const actions=document.createElement('div');
      actions.className='system-actions';
      const restore=document.createElement('button');
      restore.type='button';
      restore.textContent='RESTORE SOLAR';
      restore.addEventListener('click',deps.transitions.restoreSolarSystem);
      actions.appendChild(restore);
      el.appendChild(actions);
    }
    if(deps.lagrange.showLagrangePoints && deps.lagrange.activeLagrangeSystem){
      const label=document.createElement('div');
      label.className='grp-label';
      label.textContent=deps.lagrange.activeLagrangeSystem.primary.name+'–'+
        deps.lagrange.activeLagrangeSystem.secondary.name+' Lagrange points';
      el.appendChild(label);
      for(const point of deps.lagrange.activeLagrangeSystem.points){
        const row=document.createElement('div');
        row.className='item';
        row.innerHTML=`<span class="diamond" style="background:${point.color}"></span>${point.name}`;
        row.addEventListener('click',()=>deps.selection.toggleLegendBodySelection(point));
        el.appendChild(row);
      }
    }
    legendMoonVisibilityKey=moonVisibilityKey();
  }

  return {
    buildLegend,
    get legendMoonVisibilityKey(){ return legendMoonVisibilityKey; }
  };
});
