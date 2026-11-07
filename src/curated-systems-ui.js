// CuratedSystemsUI - browsable panel for pre-built custom systems.
// Creates a panel overlay with cards; clicking a card loads it.
(function(root){
  'use strict';

  let panel = null;
  let visible = false;
  let onLoad = null; // callback: (systemDef) => void
  let onVisibleChange = null;

  function buildPanel(){
    if(panel) return;
    const doc = typeof document !== 'undefined' ? document : null;
    if(!doc) return;
    panel = doc.createElement('div');
    panel.id = 'curatedSystemsPanel';
    panel.className = 'panel-hidden';
    panel.innerHTML = `
      <button class="panel-close" id="curatedClose" type="button"
        title="Close curated systems" aria-label="Close curated systems">✕</button>
      <div class="heading">Curated Systems</div>
      <p class="curated-desc">
        Loading replaces the current system and pauses playback. Non-Solar
        examples are editable, illustrative N-body models, not observed ephemerides.
        Their observing surfaces are schematic, including those on gas giants.
        AI-generated artwork is an artistic impression, not to scale.
      </p>
      <div id="curatedList"></div>
    `;
    doc.getElementById('stage').appendChild(panel);

    // Close button
    doc.getElementById('curatedClose').addEventListener('click', ()=>{
      toggle(false);
    });

    // Populate cards
    const list = doc.getElementById('curatedList');
    const systems = root.CuratedSystems ? root.CuratedSystems.SYSTEMS : [];
    for(const sys of systems){
      const card = doc.createElement('button');
      card.type = 'button';
      card.className = 'curated-card';
      card.setAttribute('data-id', sys.id);
      card.innerHTML = `
        <img class="curated-preview" src="assets/curated-systems/${sys.id}.webp"
          alt="" width="640" height="360" decoding="async">
        <span class="curated-name">${sys.name}</span>
        <span class="curated-body-count">${sys.mode==='solar' ? 'Solar preset' : sys.bodies.length+' bodies'}</span>
        <span class="curated-desc">${sys.description}</span>
      `;
      card.addEventListener('click', ()=>{
        toggle(false);
        if(onLoad) onLoad(sys);
      });
      list.appendChild(card);
    }
  }

  function toggle(show){
    if(!panel) buildPanel();
    if(!panel) return;
    const next = !!show;
    if(next === visible) return;
    visible = next;
    if(visible){
      panel.classList.remove('panel-hidden');
    } else {
      panel.classList.add('panel-hidden');
    }
    if(onVisibleChange) onVisibleChange(visible);
  }

  function show(){ toggle(true); }
  function hide(){ toggle(false); }

  function setOnLoad(fn){
    onLoad = fn;
  }

  function setVisibleListener(fn){
    onVisibleChange = fn;
  }

  root.CuratedSystemsUI = { buildPanel, toggle, show, hide, setOnLoad, setVisibleListener, get visible(){ return visible; } };
})(typeof globalThis !== 'undefined' ? globalThis : this);
