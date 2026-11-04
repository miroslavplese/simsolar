// CuratedSystemsUI - browsable panel for pre-built custom systems.
// Creates a panel overlay with cards; clicking a card loads it.
(function(root){
  'use strict';

  let panel = null;
  let visible = false;
  let onLoad = null; // callback: (systemDef) => void

  function buildPanel(){
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
        Pre-built gravitational systems to explore. Loading replaces the current
        simulation with an editable N-body mode.
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
      card.className = 'curated-card';
      card.setAttribute('data-id', sys.id);
      card.innerHTML = `
        <span class="curated-preview" style="background:${sys.preview || '#555'}"></span>
        <span class="curated-name">${sys.name}</span>
        <span class="curated-body-count">${sys.bodies.length} bodies</span>
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
    visible = !!show;
    if(show){
      panel.classList.remove('panel-hidden');
    } else {
      panel.classList.add('panel-hidden');
    }
  }

  function show(){ toggle(true); }
  function hide(){ toggle(false); }

  function setOnLoad(fn){ onLoad = fn; }

  root.CuratedSystemsUI = { buildPanel, toggle, show, hide, setOnLoad, get visible(){ return visible; } };
})(typeof globalThis !== 'undefined' ? globalThis : this);
