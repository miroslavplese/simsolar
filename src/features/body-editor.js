(function(root,factory){
  const api={create:factory};
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.SimSolarEditor=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(deps){
  'use strict';

  const {document,window}=deps;
  const {AU_KM}=window.TrajectoryMath;
  const {inclinedVelocity:inclinedBodyVelocity}=window.BodyPlacement;
  const {estimatedRadiusKm}=window.CollisionSystem;
  const {massKgToMu,cloneState,recenterBarycentricState,createSimulator}=window.NBodySimulation;
  const {screenToEcliptic,project}=deps.camera;
  const {DEG}=deps.constants;
  const {cancelDateNavigation,playBtn}=deps.clock;
  const {editableSnapshotAt,customBodies}=deps.simulation;

  const BODY_PRESETS={
    star:{label:'Star',name:'New Star',mass:1.98847e30,color:'#ffd36a'},
    'black-hole':{label:'Black hole',name:'New Black Hole',mass:1.98847e31,color:'#9b7cff'},
    planet:{label:'Planet',name:'New Planet',mass:5.97237e24,color:'#70b7ff'},
    comet:{label:'Comet',name:'New Comet',mass:1e14,color:'#8ff0df'}
  };
  let bodyInsertionPhase='idle';
  let bodyVelocityPointer=null;
  let bodyDraft=null;

  function updateBodyReadout(){
    const readout=document.getElementById('bodyReadout');
    if(!bodyDraft?.position){
      readout.textContent='Position: not set\nVelocity: not set';
      return;
    }
    const p=bodyDraft.position;
    const position='Position: '+p.x.toFixed(3)+', '+p.y.toFixed(3)+', 0.000 AU';
    const velocity=bodyDraft.speedKmS==null
      ? 'Velocity: not set'
      : 'Velocity: '+bodyDraft.speedKmS.toFixed(2)+' km/s  ('+
        bodyDraft.direction.x.toFixed(3)+', '+
        bodyDraft.direction.y.toFixed(3)+', '+
        bodyDraft.direction.z.toFixed(3)+')';
    const inclination='Inclination: '+
      Number(document.getElementById('bodyInclination').value).toFixed(0)+'°';
    readout.textContent=position+'\n'+velocity+'\n'+inclination;
  }

  function resetBodyInsertion(){
    bodyInsertionPhase='idle';
    bodyVelocityPointer=null;
    bodyDraft=null;
    document.getElementById('bodyInsertBtn').disabled=true;
    document.getElementById('bodyPlaceBtn').textContent='PLACE';
    document.getElementById('bodyInstructions').textContent=
      deps.simulation.editableSystem && deps.simulation.editableSystem.bodies.length===0
        ? 'Press PLACE to create the first body at the origin with zero velocity.'
        : 'Choose an inclination, press PLACE, then tap the ecliptic plane to set a barycentric position.';
    updateBodyReadout();
  }

  function updateDraftVelocity(screenX,screenY){
    const endpoint=screenToEcliptic(screenX,screenY);
    if(!endpoint || !bodyDraft?.position) return;
    const dx=endpoint.x-bodyDraft.position.x;
    const dy=endpoint.y-bodyDraft.position.y;
    const length=Math.hypot(dx,dy);
    if(length<1e-8) return;
    const startScreen=project(
      bodyDraft.position.x,bodyDraft.position.y,bodyDraft.position.z
    );
    const screenLength=Math.hypot(screenX-startScreen.x,screenY-startScreen.y);
    bodyDraft.speedKmS=Math.min(1000,screenLength*0.5);
    bodyDraft.planarVelocity={
      x:dx/length*bodyDraft.speedKmS*86400/AU_KM,
      y:dy/length*bodyDraft.speedKmS*86400/AU_KM,
      z:0
    };
    applyDraftInclination();
  }

  function applyDraftInclination(){
    const input=document.getElementById('bodyInclination');
    const degrees=Number(input.value);
    document.getElementById('bodyInclinationValue').textContent=degrees+'°';
    if(!bodyDraft?.position || !bodyDraft.planarVelocity){
      updateBodyReadout();
      return;
    }
    bodyDraft.velocity=inclinedBodyVelocity(
      bodyDraft.position,bodyDraft.planarVelocity,degrees*DEG
    );
    const magnitude=Math.hypot(
      bodyDraft.velocity.x,bodyDraft.velocity.y,bodyDraft.velocity.z
    );
    bodyDraft.direction={
      x:bodyDraft.velocity.x/magnitude,
      y:bodyDraft.velocity.y/magnitude,
      z:bodyDraft.velocity.z/magnitude
    };
    updateBodyReadout();
  }

  function applyBodyPreset(){
    const preset=BODY_PRESETS[document.getElementById('bodyType').value];
    document.getElementById('bodyName').value=preset.name;
    document.getElementById('bodyMass').value=String(preset.mass);
    resetBodyInsertion();
  }
  function beginBodyPlacement(){
    cancelDateNavigation();
    if(!deps.simulation.editableSystem) deps.transitions.detachSolarSystem();
    if(deps.simulation.editableSystem.bodies.length===0){
      deps.clock.playing=false;
      playBtn.textContent='▶';
      bodyDraft={
        position:{x:0,y:0,z:0},
        planarVelocity:{x:0,y:0,z:0},
        velocity:{x:0,y:0,z:0},
        direction:{x:0,y:0,z:0},speedKmS:0
      };
      bodyInsertionPhase='ready';
      document.getElementById('bodyInsertBtn').disabled=false;
      document.getElementById('bodyPlaceBtn').textContent='RESTART';
      document.getElementById('bodyInstructions').textContent=
        'The first body will be created at the barycentric origin with zero velocity.';
      updateBodyReadout();
      return;
    }
    if(Math.abs(Math.cos(deps.camera.viewTilt))<0.08){
      document.getElementById('bodyInstructions').textContent=
        'Rotate away from an edge-on ecliptic view before placing a body.';
      return;
    }
    deps.clock.playing=false;
    playBtn.textContent='▶';
    bodyDraft={
      position:null,planarVelocity:null,velocity:null,
      direction:null,speedKmS:null
    };
    bodyInsertionPhase='position';
    document.getElementById('bodyInsertBtn').disabled=true;
    document.getElementById('bodyPlaceBtn').textContent='RESTART';
    document.getElementById('bodyInstructions').textContent=
      'Tap the main view to place the body on the ecliptic plane.';
    updateBodyReadout();
  }
  function closeBodyPanel(){
    resetBodyInsertion();
    document.getElementById('bodyPanel').classList.remove('show');
    document.getElementById('addBodyBtn').classList.remove('active');
    document.getElementById('addBodyBtn').setAttribute('aria-expanded','false');
  }

  function insertDraftBody(){
    if(bodyInsertionPhase!=='ready' || !bodyDraft?.velocity ||
      !deps.simulation.editableSystem) return;
    const name=document.getElementById('bodyName').value.trim();
    const massKg=Number(document.getElementById('bodyMass').value);
    const preset=BODY_PRESETS[document.getElementById('bodyType').value];
    const detail=document.getElementById('bodyInstructions');
    if(!name){
      detail.textContent='Enter a name before inserting the body.';
      return;
    }
    if(massKg>1e35){
      detail.textContent='Mass must not exceed 1e35 kg in this simulation.';
      return;
    }
    const currentState=cloneState(editableSnapshotAt(deps.clock.simDaysSinceJ2000));
    if(deps.simulation.editableSystem.bodies.some(body=>body.name===name)){
      detail.textContent='A body named "'+name+'" already exists at this date.';
      return;
    }
    let mu;
    try{
      mu=massKgToMu(massKg);
    } catch(error){
      detail.textContent=error.message;
      return;
    }
    const position={
      x:bodyDraft.position.x,
      y:bodyDraft.position.y,
      z:bodyDraft.position.z
    };
    const closest=Math.min(...currentState.massive.map(body=>Math.hypot(
      position.x-body.x,position.y-body.y,position.z-body.z
    )));
    if(closest<0.005){
      detail.textContent='Place the body at least 0.005 AU from every massive body.';
      return;
    }
    const id=deps.simulation.nextBodyId();
    currentState.massive.push({
      id,name,mu,adaptiveFactor:48,
      x:position.x,y:position.y,z:position.z,
      vx:bodyDraft.velocity.x,
      vy:bodyDraft.velocity.y,
      vz:bodyDraft.velocity.z
    });
    recenterBarycentricState(currentState);
    const body={
      id,
      kind:'custom',
      category:preset.label,
      appearance:document.getElementById('bodyType').value,
      name,massKg,mu,color:preset.color,
      adaptiveFactor:48,
      initialInclination:Number(
        document.getElementById('bodyInclination').value
      ),
      radius:estimatedRadiusKm(
        document.getElementById('bodyType').value,massKg
      ),
      notes:'Introduced by the user as a massive Newtonian body.'
    };
    const bodies=[...deps.simulation.editableSystem.bodies,body];
    deps.simulation.editableSystem={
      epoch:deps.clock.simDaysSinceJ2000,bodies,
      initialState:cloneState(currentState),
      simulator:createSimulator(currentState,{
        stepDays:0.25,particleStepDays:0.03125,checkpointDays:8
      })
    };
    customBodies.push(body);
    deps.planner.missionPlannerController?.catalogChanged();
    deps.transitions.clearSimulationCaches();
    deps.selection.setSelectedBody(body);
    closeBodyPanel();
  }

  let initialized=false;
  function initialize(){
    if(initialized) return;
    initialized=true;
    document.getElementById('bodyType').addEventListener('change',applyBodyPreset);
    document.getElementById('bodyInclination').addEventListener(
      'input',applyDraftInclination
    );
    document.getElementById('bodyPlaceBtn').addEventListener('click',beginBodyPlacement);
    document.getElementById('bodyInsertBtn').addEventListener('click',insertDraftBody);
    document.getElementById('bodyClose').addEventListener('click',closeBodyPanel);
    document.getElementById('addBodyBtn').addEventListener('click',()=>{
      const panel=document.getElementById('bodyPanel');
      const visible=panel.classList.toggle('show');
      document.getElementById('addBodyBtn').classList.toggle('active',visible);
      document.getElementById('addBodyBtn').setAttribute(
        'aria-expanded',String(visible)
      );
      if(!visible) resetBodyInsertion();
    });
  }

  return {
    initialize,
    get bodyDraft(){ return bodyDraft; },
    get bodyInsertionPhase(){ return bodyInsertionPhase; },
    set bodyInsertionPhase(value){ bodyInsertionPhase=value; },
    BODY_PRESETS,
    updateBodyReadout,
    get bodyVelocityPointer(){ return bodyVelocityPointer; },
    set bodyVelocityPointer(value){ bodyVelocityPointer=value; },
    updateDraftVelocity,
    resetBodyInsertion,
    closeBodyPanel
  };
});
