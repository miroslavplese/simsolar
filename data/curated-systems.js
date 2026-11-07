(function(root,factory){
  const api=factory(
    typeof module==='object' && module.exports
      ? require('../src/trajectory-math.js') : root.TrajectoryMath,
    typeof module==='object' && module.exports
      ? require('../src/nbody-simulation.js') : root.NBodySimulation,
    typeof module==='object' && module.exports
      ? require('../src/system-model.js') : root.SystemModel
  );
  if(typeof module==='object' && module.exports) module.exports=api;
  root.CuratedSystems=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(math,gravity,model){
  'use strict';

  const SOLAR_MASS_KG=1.98847e30;
  const EARTH_MASS_KG=5.9722e24;
  const STATE_KEYS=model.STATE_KEYS;
  const MODEL_NOTE='Illustrative N-body model, not an observed ephemeris.';

  // Rounded example parameters and their limitations are documented in DESIGN.md.
  // Distances are AU, angles degrees, radii km, and epochs days since J2000.
  const SYSTEMS=[
    {
      id:'solar-system',name:'Our Solar System',mode:'solar',extentAU:40,
      description:'Restore the original Solar preset, including JPL-backed planets, moons, spacecraft, and comets. This is not an editable approximation.'
    },
    {
      id:'tatooine',name:'Tatooine',
      description:'A fictional Star Wars-inspired model: two close stars and a desert planet orbiting their barycenter. Masses and orbits are invented for exploration.',
      bodies:[
        {id:'tatoo1',name:'Tatoo I',kind:'star',solarMass:0.9,color:'#ffd36a',radius:627000},
        {id:'tatoo2',name:'Tatoo II',kind:'star',solarMass:0.7,a:0.12,parentId:'tatoo1',color:'#ffab4a',radius:560000},
        {id:'tatooine-planet',name:'Tatooine',kind:'planet',earthMass:1,a:1.2,e:0.05,i:2,color:'#c49238',radius:6400}
      ]
    },
    {
      id:'alpha-centauri',name:'Alpha Centauri',
      description:'An illustrative hierarchical triple with Proxima d orbiting Proxima Centauri. Stellar separations are compressed; this is not the measured Alpha Centauri system.',
      bodies:[
        {id:'alfa-cen-a',name:'Alpha Cen A',kind:'star',solarMass:1.1,color:'#ffe4a3',radius:760000},
        {id:'alfa-cen-b',name:'Alpha Cen B',kind:'star',solarMass:0.9,a:0.23,parentId:'alfa-cen-a',color:'#ffc06c',radius:600000},
        {id:'alfa-cen-c',name:'Proxima Cen',kind:'star',solarMass:0.12,a:2.6,phase:180,parentId:'alfa-cen-a',color:'#ff6644',radius:150000},
        {id:'proxima-d',name:'Proxima d',kind:'planet',earthMass:0.26,a:0.029,e:0.02,i:5,parentId:'alfa-cen-c',color:'#b78678',radius:3000}
      ]
    },
    {
      id:'trappist-1',name:'TRAPPIST-1',
      description:'Seven roughly Earth-sized planets around an ultra-cool dwarf. Rounded masses and orbital sizes illustrate a compact system; the observed resonant phases are not reproduced.',
      bodies:[
        {id:'trappist-star',name:'TRAPPIST-1',kind:'star',solarMass:0.0898,color:'#ff6633',radius:83000},
        {id:'trappist-b',name:'TRAPPIST-1b',kind:'planet',earthMass:1.374,a:0.01154,e:0.006,i:1.5,color:'#86533d',radius:7110},
        {id:'trappist-c',name:'TRAPPIST-1c',kind:'planet',earthMass:1.308,a:0.01580,e:0.005,i:1.5,color:'#8c8586',radius:6990},
        {id:'trappist-d',name:'TRAPPIST-1d',kind:'planet',earthMass:0.388,a:0.02227,e:0.008,i:1.5,color:'#b58a4e',radius:5020},
        {id:'trappist-e',name:'TRAPPIST-1e',kind:'planet',earthMass:0.692,a:0.02925,e:0.005,i:1.5,color:'#839aa8',radius:5860},
        {id:'trappist-f',name:'TRAPPIST-1f',kind:'planet',earthMass:1.039,a:0.03849,e:0.010,i:1.5,color:'#58a7ae',radius:6660},
        {id:'trappist-g',name:'TRAPPIST-1g',kind:'planet',earthMass:1.321,a:0.04683,e:0.006,i:1.5,color:'#c6c7cb',radius:7190},
        {id:'trappist-h',name:'TRAPPIST-1h',kind:'planet',earthMass:0.326,a:0.06189,e:0.004,i:1.5,color:'#b89183',radius:4810}
      ]
    },
    {
      id:'kepler-16',name:'Kepler-16',
      description:'An approximate model of the first confirmed transiting circumbinary planet. A Saturn-mass planet orbits a stellar pair; orbital orientation and phase are illustrative.',
      bodies:[
        {id:'kepler-16-a',name:'Kepler-16 A',kind:'star',solarMass:0.6897,color:'#ffb357',radius:452000},
        {id:'kepler-16-b',name:'Kepler-16 B',kind:'star',solarMass:0.20255,a:0.22431,e:0.15944,parentId:'kepler-16-a',color:'#ff6445',radius:157500},
        {id:'kepler-16-ab',name:'Kepler-16b',kind:'planet',earthMass:105.8,a:0.7048,e:0.0069,i:0.3,color:'#a0afba',radius:53900}
      ]
    },
    {
      id:'hd-189733',name:'HD 189733',
      description:'An approximate hot-Jupiter model with a roughly 2.2-day orbit. The distant stellar companion and atmospheric weather are not simulated.',
      bodies:[
        {id:'hd-189733-a',name:'HD 189733 A',kind:'star',solarMass:0.719,color:'#ffb753',radius:531000},
        {id:'hd-189733-b',name:'HD 189733 b',kind:'planet',earthMass:329,a:0.02984,e:0.0041,i:3.5,color:'#2877f5',radius:82400}
      ]
    },
    {
      id:'binary-duet',name:'Binary Duet',
      description:'An idealized circular binary: two equal-mass stars orbit their common barycenter at 5 AU separation.',
      bodies:[
        {id:'binary-a',name:'Star A',kind:'star',solarMass:0.5,color:'#ffd36a',radius:650000},
        {id:'binary-b',name:'Star B',kind:'star',solarMass:0.5,a:5,parentId:'binary-a',color:'#ffd36a',radius:650000}
      ]
    },
    {
      id:'kepler-442',name:'Kepler-442',
      description:'A super-Earth candidate for habitability orbiting a K-type star. The planet mass is estimated; this schematic model does not establish surface conditions or habitability.',
      bodies:[
        {id:'kepler-442-star',name:'Kepler-442',kind:'star',solarMass:0.61,color:'#ffb653',radius:418000},
        {id:'kepler-442-b',name:'Kepler-442 b',kind:'planet',earthMass:2.36,a:0.3864,e:0.04,i:3,color:'#779d86',radius:8540}
      ]
    },
    {
      id:'compact-four',name:'Compact Four',
      description:'Four hypothetical Earth-mass planets within 0.1 AU. Explore fast orbits and mutual gravitational perturbations; this is not an observed resonant system.',
      bodies:[
        {id:'compact-star',name:'Central Star',kind:'star',solarMass:0.8,color:'#ff866e',radius:580000},
        {id:'compact-1',name:'Planet 1',kind:'planet',earthMass:1,a:0.02,e:0.02,i:2,color:'#86533d',radius:6000},
        {id:'compact-2',name:'Planet 2',kind:'planet',earthMass:1,a:0.04,e:0.04,i:3,color:'#b48b50',radius:6200},
        {id:'compact-3',name:'Planet 3',kind:'planet',earthMass:1,a:0.06,e:0.03,i:1.5,color:'#72969d',radius:5800},
        {id:'compact-4',name:'Planet 4',kind:'planet',earthMass:1,a:0.09,e:0.05,i:4,color:'#9cb6cf',radius:6400}
      ]
    }
  ];

  function orbitalState(body,mu,phase){
    const e=body.e??0, inclination=body.i??0;
    if(!(body.a>0) || !Number.isFinite(body.a) ||
      !Number.isFinite(e) || e<0 || e>=1 ||
      !Number.isFinite(inclination) || inclination<0 || inclination>180 ||
      !Number.isFinite(phase)){
      throw new RangeError('Invalid curated orbit for '+body.name+'.');
    }
    const E=math.solveKeplerElliptical(
      ((phase%360+360)%360)*Math.PI/180,e
    );
    const rotation={Omega:0,omega:0,i:inclination};
    const position=math.orbitalToEcliptic(
      rotation,body.a*(Math.cos(E)-e),
      body.a*Math.sqrt(1-e*e)*Math.sin(E)
    );
    const speed=Math.sqrt(mu/body.a)/(1-e*Math.cos(E));
    const velocity=math.orbitalToEcliptic(
      rotation,-speed*Math.sin(E),speed*Math.sqrt(1-e*e)*Math.cos(E)
    );
    return {...position,vx:velocity.x,vy:velocity.y,vz:velocity.z};
  }

  function buildEditableSystem(systemDef,epoch=0){
    if(systemDef?.mode==='solar' || !Array.isArray(systemDef?.bodies)){
      throw new TypeError('The Solar preset must be restored, not synthesized.');
    }
    const bodies=systemDef.bodies.map(definition=>{
      const body={...definition};
      if(!['star','planet'].includes(body.kind)){
        throw new TypeError('Unsupported curated body kind.');
      }
      body.massKg=body.kind==='star'
        ? body.solarMass*SOLAR_MASS_KG : body.earthMass*EARTH_MASS_KG;
      body.mu=gravity.massKgToMu(body.massKg);
      body.appearance=body.kind;
      body.category=body.kind==='star'?'Star':'Planet';
      body.genericSurface=body.kind==='planet';
      body.notes=MODEL_NOTE;
      body.state={x:0,y:0,z:0,vx:0,vy:0,vz:0};
      return body;
    });
    const byId=new Map(bodies.map(body=>[body.id,body]));
    const stars=bodies.filter(body=>body.kind==='star');
    if(!stars.length) throw new TypeError('A curated system needs a star.');
    // Each additional star orbits the inner group's barycenter. Recoil moves
    // the whole inner group, preserving its already-initialized relative orbits.
    for(let index=1;index<stars.length;index++){
      const star=stars[index], inner=stars.slice(0,index);
      const innerMu=inner.reduce((sum,body)=>sum+body.mu,0);
      const relative=orbitalState(star,innerMu+star.mu,star.phase??0);
      for(const key of STATE_KEYS){
        for(const body of inner){
          body.state[key]-=relative[key]*star.mu/(innerMu+star.mu);
        }
        star.state[key]=relative[key]*innerMu/(innerMu+star.mu);
      }
      star.orbitPrimaryIds=inner.map(body=>body.id);
      if(index===1) stars[0].orbitPrimaryIds=[star.id];
    }
    let planetIndex=0;
    for(const body of bodies){
      if(body.parentId){
        const parent=byId.get(body.parentId);
        if(!parent) throw new TypeError('Unknown curated parent: '+body.parentId);
        body.parentName=parent.name;
      }
      if(body.kind!=='planet') continue;
      const primaries=body.parentId ? [byId.get(body.parentId)] : stars;
      if(primaries.some(primary=>primary.kind!=='star')){
        throw new TypeError('A curated planet must orbit stars.');
      }
      const mu=primaries.reduce((sum,primary)=>sum+primary.mu,0);
      const relative=orbitalState(
        body,mu+body.mu,body.phase??(planetIndex*137.508)%360
      );
      planetIndex++;
      for(const key of STATE_KEYS){
        body.state[key]=relative[key]+primaries.reduce(
          (sum,primary)=>sum+primary.state[key]*primary.mu/mu,0
        );
      }
    }
    const state=gravity.createBarycentricState(epoch,bodies,[]);
    let extentAU=0;
    for(const body of bodies){
      body.state=gravity.bodyState(state,body.id);
      extentAU=Math.max(
        extentAU,Math.hypot(body.state.x,body.state.y,body.state.z),
        (body.a||0)*(1+(body.e||0))
      );
    }
    const system={mode:'editable',epoch,extentAU,bodies};
    if(!model.validateEditableSystem(system)){
      throw new TypeError('Invalid curated system: '+systemDef.name);
    }
    return system;
  }

  return {
    SYSTEMS,buildEditableSystem,
    findById:id=>SYSTEMS.find(system=>system.id===id)||null
  };
});
