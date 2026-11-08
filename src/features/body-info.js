(function(root,factory){
  const node=typeof module==='object' && module.exports;
  const api=factory(
    node ? require('../trajectory-math.js') : root.TrajectoryMath,
    node ? require('../body-placement.js') : root.BodyPlacement,
    node ? require('../object-images.js') : root.ObjectImages,
    node ? require('../../data/curated-systems.js') : root.CuratedSystems
  );
  if(node) module.exports=api;
  root.BodyInfo=api;
})(typeof globalThis!=='undefined' ? globalThis : this,function(
  TrajectoryMath,BodyPlacement,ObjectImages,CuratedSystems
){
  'use strict';
  const {AU_KM,orbitalElementsFromState,orbitalSpeedKmS}=TrajectoryMath;
  const DEG=Math.PI/180;
  const WIKIPEDIA_TITLES={
    Sun:'Sun',Mercury:'Mercury (planet)',Venus:'Venus',Earth:'Earth',Mars:'Mars',
    Jupiter:'Jupiter',Saturn:'Saturn',Uranus:'Uranus',Neptune:'Neptune',
    Pluto:'Pluto',Charon:'Charon (moon)',
    Moon:'Moon',Phobos:'Phobos (moon)',Deimos:'Deimos (moon)',
    Io:'Io (moon)',Europa:'Europa (moon)',Ganymede:'Ganymede (moon)',
    Callisto:'Callisto (moon)',Rhea:'Rhea (moon)',Titan:'Titan (moon)',
    Iapetus:'Iapetus (moon)',Titania:'Titania (moon)',Oberon:'Oberon (moon)',
    Triton:'Triton (moon)',
    'Voyager 1':'Voyager 1','Voyager 2':'Voyager 2',
    'Pioneer 10':'Pioneer 10','Pioneer 11':'Pioneer 11',
    'New Horizons':'New Horizons','Parker Solar Probe':'Parker Solar Probe',
    Halley:"Halley's Comet",'Hale-Bopp':'Comet Hale-Bopp',
    Encke:"Encke's Comet",
    '67P/Churyumov-Gerasimenko':'67P/Churyumov-Gerasimenko',
    NEOWISE:'Comet NEOWISE'
  };
  const VALUE_ORIGINS={
    arbitrary:{
      label:'Arbitrary',
      description:'Chosen for the model, or calculated from invented inputs; not measured.'
    },
    approximate:{label:'Approximate',description:'Rounded reference parameter, not an exact measurement.'},
    estimated:{label:'Estimated',description:'Inferred or estimated, not directly measured.'},
    simulated:{label:'Simulated',description:'Calculated from the simulation, not an observation.'},
    edited:{label:'Edited',description:'Changed from the curated reference value; no measured provenance is claimed.'}
  };
  const PROVENANCE_FIELDS={
    Mass:'mass',Radius:'radius',Dist:'distance',Period:'period',
    Speed:'speed',Ecc:'eccentricity',Incl:'inclination'
  };

  function formatPeriod(days){
    if(!Number.isFinite(days) || !(days>0)) return 'Not specified';
    return days<400 ? days.toFixed(1)+' days' : (days/365.25).toFixed(2)+' years';
  }
  function wikipediaUrl(title){
    const path=title.replace(/ /g,'_').split('/').map(encodeURIComponent).join('/');
    return 'https://en.wikipedia.org/wiki/'+path;
  }

  function create(options){
    const elements={};
    for(const id of [
      'card','cardClose','cardKind','cardName','cardMass','cardWiki','cardMission',
      'cardImageContainer','cardImageCaption','cardProvenanceNote','cardNote',
      'cardRadius','cardDist','cardSpeed','cardEcc','cardIncl','cardPeriod',
      'rowRadius','rowDist','rowSpeed','rowEcc','rowIncl','rowPeriod',
      ...Object.keys(PROVENANCE_FIELDS).map(id=>'card'+id+'Provenance')
    ]){
      const element=options.document.getElementById(id);
      if(!element) throw new Error('BodyInfo requires #'+id+'.');
      elements[id]=element;
    }
    const images=ObjectImages.create({
      document:options.document,catalog:options.catalog,
      container:elements.cardImageContainer,caption:elements.cardImageCaption
    });
    const provenanceFields=Object.entries(PROVENANCE_FIELDS).map(([id,field])=>({
      element:elements['card'+id+'Provenance'],field
    }));
    let disposed=false;
    const onClose=()=>options.onClose();
    elements.cardClose.addEventListener('click',onClose);

    function assertActive(){
      if(disposed) throw new Error('BodyInfo has been disposed.');
    }
    function formatMass(body){
      if(body.kind==='lagrange') return '0 kg (equilibrium point)';
      const mass=body.massKg||options.massByName[body.name];
      if(!mass) return body.kind==='spacecraft'
        ? 'Not specified (test particle)' : '0 kg (test particle)';
      const formatted=mass<1e6
        ? mass.toLocaleString(undefined,{maximumFractionDigits:3})
        : mass.toExponential(3).replace('e+','e');
      return (body.massEstimated?'\u2248 ':'')+formatted+' kg'+
        (body.massAtLaunch?' (at launch)':body.massDry?' (dry)':'');
    }
    function wikipediaTitle(body){
      if(body.wikipedia) return body.wikipedia;
      if(body.kind==='lagrange') return 'Lagrange point';
      if(WIKIPEDIA_TITLES[body.name]) return WIKIPEDIA_TITLES[body.name];
      if(body.kind==='custom') return options.bodyPresets[body.appearance]?.label||null;
      return null;
    }
    function updateProvenance(body){
      const provenance=CuratedSystems.valueProvenance(body);
      for(const {element,field} of provenanceFields){
        const origin=provenance?.[field];
        element.hidden=!origin;
        if(origin){
          const {label,description}=VALUE_ORIGINS[origin];
          element.textContent=label;
          element.title=description;
          element.dataset.origin=origin;
        } else {
          element.textContent='';
          element.removeAttribute('title');
          delete element.dataset.origin;
        }
      }
      elements.cardProvenanceNote.hidden=!provenance;
      elements.cardProvenanceNote.textContent=provenance?.note||'';
    }

    function update(body,frame){
      assertActive();
      images.show(body);
      updateProvenance(body);
      const {position:pos,radiusKm,editable,osculating,orbitReference}=frame;
      elements.cardKind.textContent=body.category ||
        (body.kind==='sun'?'Star':body.kind==='planet'?'Planet':
          body.kind==='comet'?'Comet':'Spacecraft');
      elements.cardName.textContent=body.name;
      elements.cardMass.textContent=formatMass(body);
      const wikiTitle=wikipediaTitle(body);
      elements.cardWiki.style.display=wikiTitle?'block':'none';
      if(wikiTitle){
        elements.cardWiki.href=wikipediaUrl(wikiTitle);
        elements.cardWiki.textContent='Wikipedia: '+wikiTitle;
      }
      elements.cardMission.hidden=!body.sourceUrl;
      if(body.sourceUrl) elements.cardMission.href=body.sourceUrl;
      const {rowPeriod,rowEcc,rowIncl,rowRadius,rowDist,rowSpeed,cardNote}=elements;
      rowDist.style.display='';
      rowDist.firstElementChild.textContent=editable
        ? 'Distance from barycenter' : 'Distance from Sun';
      rowSpeed.style.display='';
      rowRadius.style.display=Number.isFinite(radiusKm) && radiusKm>0 ? '' : 'none';
      if(rowRadius.style.display!=='none'){
        elements.cardRadius.textContent=radiusKm.toLocaleString(
          undefined,{maximumFractionDigits:radiusKm<100 ? 2 : 1}
        )+' km';
      }
      const custom=body.kind==='custom';
      if(osculating){
        const orbital=orbitReference && orbitalElementsFromState(
          orbitReference.relative,orbitReference.mu
        );
        elements.cardDist.textContent=pos.r.toFixed(3)+' AU';
        elements.cardSpeed.textContent=pos.speedKmS.toFixed(2)+' km/s';
        rowEcc.style.display=orbital?'':'none';
        rowIncl.style.display=orbital?'':'none';
        rowPeriod.style.display=orbital?'':'none';
        if(orbital){
          elements.cardEcc.textContent=orbital.eccentricity.toFixed(3);
          elements.cardIncl.textContent=orbital.inclination.toFixed(2)+'\u00b0';
          elements.cardPeriod.textContent=orbital.period===null
            ? 'Unbound' : formatPeriod(orbital.period);
        }
        cardNote.style.display='';
        cardNote.textContent=body.notes+
          ' Orbital elements are instantaneous two-body estimates.'+
          (body.genericSurface ? ' The observing surface is schematic.' : '');
        return;
      }
      if(body.kind==='sun'){
        rowDist.style.display='none';
        rowSpeed.style.display='none';
        rowEcc.style.display='none';
        rowIncl.style.display='none';
        rowPeriod.style.display='none';
        cardNote.style.display='';
        cardNote.textContent='The star at the center of the Solar System.';
        return;
      }
      if(body.kind==='lagrange'){
        rowEcc.style.display='none';
        rowIncl.style.display='none';
        rowPeriod.style.display='';
        elements.cardPeriod.textContent='Co-rotating';
        cardNote.style.display='';
        if(!pos){
          elements.cardDist.textContent='Outside branch range';
          elements.cardSpeed.textContent='\u2014';
          cardNote.textContent='The selected system does not exist at this simulation date.';
          return;
        }
        elements.cardDist.textContent=pos.r.toFixed(3)+' AU';
        elements.cardSpeed.textContent=pos.speedKmS.toFixed(2)+' km/s';
        const primary=body.system.primary.name;
        const secondary=body.system.secondary.name;
        cardNote.textContent=body.name+
          ' is an instantaneous circular restricted three-body '+
          'equilibrium estimate for '+primary+' and '+secondary+'. Distance from '+
          secondary+': '+(pos.distanceFromSecondary*AU_KM).toLocaleString(
            undefined,{maximumFractionDigits:0}
          )+' km.';
        return;
      }
      rowEcc.style.display=custom?'none':'';
      rowIncl.style.display='';
      if(!pos){
        elements.cardDist.textContent=body.kind==='comet'?'Outside data range':'Not launched';
        elements.cardSpeed.textContent='\u2014';
        if(!custom){
          elements.cardEcc.textContent=Number.isFinite(body.e) ? body.e.toFixed(3) : 'Not specified';
          elements.cardIncl.textContent=Number.isFinite(body.i) ? body.i.toFixed(2)+'\u00b0' : 'Not specified';
        } else {
          elements.cardIncl.textContent=Number.isFinite(body.initialInclination)
            ? body.initialInclination.toFixed(0)+'\u00b0 initial' : '\u2014';
        }
        rowPeriod.style.display='none';
        cardNote.style.display='';
        cardNote.textContent=body.kind==='comet'
          ? 'Bundled comet ephemerides cover 1950 through 2080.'
          : 'Launch date: '+body.launch+'.';
        return;
      }
      elements.cardDist.textContent=pos.r.toFixed(3)+' AU';
      const speed=pos.speedKmS==null ? orbitalSpeedKmS(body,pos.r) : pos.speedKmS;
      elements.cardSpeed.textContent=speed.toFixed(2)+' km/s';
      if(!custom){
        elements.cardEcc.textContent=Number.isFinite(body.e)
          ? body.e.toFixed(3)+(body.e>1?' (hyperbolic)':'') : 'Not specified';
        elements.cardIncl.textContent=Number.isFinite(body.i)
          ? body.i.toFixed(2)+'\u00b0' : 'Not specified';
      } else {
        const inclination=BodyPlacement.orbitalInclination(pos,{x:pos.vx,y:pos.vy,z:pos.vz});
        elements.cardIncl.textContent=inclination===null
          ? 'Radial trajectory' : (inclination/DEG).toFixed(2)+'\u00b0';
      }
      if(custom){
        rowPeriod.style.display='none';
      } else if(['planet','moon','comet'].includes(body.kind)){
        rowPeriod.style.display='';
        elements.cardPeriod.textContent=formatPeriod(body.displayPeriod||body.period);
      } else {
        rowPeriod.style.display=body.e<1 ? '' : 'none';
        if(body.e<1) elements.cardPeriod.textContent=(360/body.n).toFixed(1)+' days';
      }
      if(custom){
        cardNote.style.display='';
        cardNote.textContent=body.notes;
      } else if(body.kind==='spacecraft'){
        cardNote.style.display='';
        const source=pos.nbody
          ? ' Position uses Newtonian N-body integration from '+options.hybridEpochDate+'.'
          : pos.sampled ? ' Position and prior path use NASA/JPL Horizons vectors.' :
          ' Position is beyond the bundled Horizons range and is propagated from the final JPL state under solar gravity.';
        cardNote.textContent='Launched '+body.launch+'.'+source+' '+body.notes;
      } else if(body.kind==='comet'){
        cardNote.style.display='';
        const source=pos.nbody
          ? 'Position uses Newtonian N-body integration from '+options.hybridEpochDate+'. '
          : 'Position uses NASA/JPL Horizons state vectors. ';
        cardNote.textContent='Perihelion '+body.perihelion+' at '+body.q.toFixed(3)+' AU. '+source+body.notes;
      } else if(body.kind==='moon'){
        cardNote.style.display='';
        cardNote.textContent=body.notes+
          ' Future motion uses hierarchical perturbation integration from '+options.hybridEpochDate+'.';
      } else if(pos.nbody){
        cardNote.style.display='';
        cardNote.textContent='Position and speed use Newtonian N-body integration from '+
          options.hybridEpochDate+'.'+(body.notes?' '+body.notes:'');
      } else if(pos.ephemeris){
        cardNote.style.display='';
        cardNote.textContent='Position and speed use NASA/JPL Horizons state vectors.'+
          (body.notes?' '+body.notes:'');
      } else {
        cardNote.style.display='none';
      }
    }
    function setVisible(visible){
      assertActive();
      elements.card.classList.toggle('show',!!visible);
    }
    function dispose(){
      if(disposed) return;
      elements.cardClose.removeEventListener('click',onClose);
      images.clear();
      elements.card.classList.remove('show');
      disposed=true;
    }
    return {update,setVisible,dispose};
  }
  return {create};
});
