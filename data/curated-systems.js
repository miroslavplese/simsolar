// Curated pre-built systems for SimSolar.
// Each entry: {id, name, description, preview, bodies[]}
// Bodies are specified with orbital parameters; converted to barycentric state at load.
//
// Units: the N-body integrator works in AU and days.
//   mu  : AU^3/day^2  (Sun = 2.959e-4)
//   vel : AU/day
// Star handling: a system's primary star sits at the origin; a secondary star
// with {parentId, a} orbits its parent. Two-star systems get an exact circular
// binary orbit; a tertiary star orbits the central mass on a circular path.
// Planets orbit the barycenter using the total stellar mass as the enclosed
// mass; a planet with a star parent orbits that star directly.
(function(root){
  'use strict';

  // -- orbital mechanics helpers -----------------------------------
  var GM_SUN_YR = 39.47841760435743; // AU^3/yr^2
  var DEG2RAD = Math.PI / 180;
  var DAYS_PER_YR = 365.25;
  var GM_SUN = GM_SUN_YR / (DAYS_PER_YR * DAYS_PER_YR); // AU^3/day^2
  var EARTH_MU = 8.89e-10; // AU^3/day^2

  // Circular orbit state at t=0 (perihelion on +x axis, rotated by
  // phaseDeg in the orbital plane).
  // mu in AU^3/day^2; velocity returned in AU/day.
  function circularOrbitState(semiMajorAU, inclinationDeg, mu, phaseDeg){
    var iRad = (inclinationDeg || 0) * DEG2RAD;
    var pRad = (phaseDeg || 0) * DEG2RAD;
    var cosI = Math.cos(iRad);
    var sinI = Math.sin(iRad);
    var m = (mu !== undefined && mu > 0) ? mu : GM_SUN;
    var v = Math.sqrt(m / semiMajorAU); // AU/day
    var x = semiMajorAU * Math.cos(pRad);
    var y = semiMajorAU * Math.sin(pRad);
    var z = 0;
    var vx = -v * Math.sin(pRad);
    var vy = v * Math.cos(pRad);
    var vz = 0;
    return {
      x: x,
      y: y * cosI - z * sinI,
      z: y * sinI + z * cosI,
      vx: vx,
      vy: vy * cosI - vz * sinI,
      vz: vy * sinI + vz * cosI
    };
  }

  function massToMu(solarMasses){ return solarMasses * GM_SUN; }
  function solarMassToKg(solarMasses){ return solarMasses * 1.98847e30; }
  function kgToSolarMasses(kg){ return kg / 1.98847e30; }

  // Center-of-mass correction (positions and velocities)
  function centerOfMassCorrection(bodies){
    var totalMu = 0, comX = 0, comY = 0, comZ = 0;
    var comVX = 0, comVY = 0, comVZ = 0;
    for(var i = 0; i < bodies.length; i++){
      if(bodies[i].mu > 0){
        totalMu += bodies[i].mu;
        comX += bodies[i].mu * bodies[i].x;
        comY += bodies[i].mu * bodies[i].y;
        comZ += bodies[i].mu * bodies[i].z;
        comVX += bodies[i].mu * bodies[i].vx;
        comVY += bodies[i].mu * bodies[i].vy;
        comVZ += bodies[i].mu * bodies[i].vz;
      }
    }
    if(totalMu > 0){
      comX /= totalMu; comY /= totalMu; comZ /= totalMu;
      comVX /= totalMu; comVY /= totalMu; comVZ /= totalMu;
      for(var j = 0; j < bodies.length; j++){
        bodies[j].x -= comX; bodies[j].y -= comY; bodies[j].z -= comZ;
        bodies[j].vx -= comVX; bodies[j].vy -= comVY; bodies[j].vz -= comVZ;
      }
    }
    return bodies;
  }

  // -- curated system definitions ----------------------------------
  var SYSTEMS = [

    // 1. Our Solar System
    {
      id:'solar-system',name:'Our Solar System',
      description:'The eight-planet system we call home. JPL-anchored ephemerides through 2035, future N-body gravity after 2026-08-12.',
      preview:'#f2b544',
      bodies:[
        {id:'sun',name:'Sun',kind:'star',appearance:'star',solarMass:1,color:'#ffd36a',radius:696340},
        {id:'mercury',name:'Mercury',kind:'planet',appearance:'planet',a:0.387,e:0.2056,i:7.0,color:'#b5a7a7',radius:2440},
        {id:'venus',name:'Venus',kind:'planet',appearance:'planet',a:0.723,e:0.0068,i:3.39,color:'#e8cda0',radius:6052},
        {id:'earth',name:'Earth',kind:'planet',appearance:'planet',a:1.0,e:0.0167,i:0.0,color:'#70b7ff',radius:6371},
        {id:'mars',name:'Mars',kind:'planet',appearance:'planet',a:1.524,e:0.0934,i:1.85,color:'#c1440e',radius:3390},
        {id:'jupiter',name:'Jupiter',kind:'planet',appearance:'planet',a:5.203,e:0.0489,i:1.30,color:'#d4a574',radius:69911},
        {id:'saturn',name:'Saturn',kind:'planet',appearance:'planet',a:9.537,e:0.0565,i:2.49,color:'#ead6a6',radius:58232},
        {id:'uranus',name:'Uranus',kind:'planet',appearance:'planet',a:19.19,e:0.0457,i:0.77,color:'#d1e7e7',radius:25362},
        {id:'neptune',name:'Neptune',kind:'planet',appearance:'planet',a:30.07,e:0.0113,i:1.77,color:'#5b5ddf',radius:24622},
        {id:'pluto',name:'Pluto',kind:'planet',appearance:'planet',a:39.48,e:0.2488,i:17.16,color:'#c9b8a8',radius:1188},
        {id:'charon',name:'Charon',kind:'moon',appearance:'moon',parentId:'pluto',a:0.00255,e:0.0001,i:0.0001,color:'#a0a0a0',radius:606}
      ]
    },

    // 2. Tatooine (Star Wars)
    {
      id:'tatooine',name:'Tatooine',
      description:'The desert planet from Star Wars. A binary star system (Tatoo I & II) with a habitable-zone planet orbiting both stars at 1.2 AU.',
      preview:'#e8a040',
      bodies:[
        {id:'tatoo1',name:'Tatoo I',kind:'star',appearance:'star',solarMass:0.9,color:'#ffd36a',radius:627000},
        {id:'tatoo2',name:'Tatoo II',kind:'star',appearance:'star',solarMass:0.7,a:0.3,parentId:'tatoo1',color:'#ffe8a0',radius:560000},
        {id:'tatooine-planet',name:'Tatooine',kind:'planet',appearance:'planet',a:1.2,e:0.05,i:2.0,color:'#c49238',radius:6400}
      ]
    },

    // 3. Alpha Centauri (demo scale)
    {
      id:'alpha-centauri',name:'Alpha Centauri',
      description:'Our nearest stellar neighbor (4.37 ly). A binary pair orbiting each other, with Proxima Centauri (C) as a wide companion and Proxima d in its habitable zone. Distances compressed for the demo view.',
      preview:'#a0c4ff',
      bodies:[
        {id:'alfa-cen-a',name:'Alpha Cen A',kind:'star',appearance:'star',solarMass:1.1,color:'#fff4e0',radius:760000},
        {id:'alfa-cen-b',name:'Alpha Cen B',kind:'star',appearance:'star',solarMass:0.9,a:0.23,parentId:'alfa-cen-a',color:'#a0c4ff',radius:600000},
        {id:'alfa-cen-c',name:'Proxima Cen',kind:'star',appearance:'star',solarMass:0.12,a:2.6,parentId:'alfa-cen-a',color:'#ff6644',radius:150000},
        {id:'proxima-d',name:'Proxima d',kind:'planet',appearance:'planet',a:0.038,e:0.02,i:5.0,parentId:'alfa-cen-c',color:'#88aacc',radius:3000}
      ]
    },

    // 4. TRAPPIST-1
    {
      id:'trappist-1',name:'TRAPPIST-1',
      description:'An ultra-cool dwarf with seven Earth-sized planets, all locked in orbital resonance. The most studied multi-habitable-zone system known.',
      preview:'#ff8866',
      bodies:[
        {id:'trappist-star',name:'TRAPPIST-1',kind:'star',appearance:'star',solarMass:0.055,color:'#ff6633',radius:72000},
        {id:'trappist-b',name:'TRAPPIST-1b',kind:'planet',appearance:'planet',a:0.0115,e:0.006,i:1.5,color:'#bb8866',radius:5800},
        {id:'trappist-c',name:'TRAPPIST-1c',kind:'planet',appearance:'planet',a:0.0159,e:0.005,i:1.5,color:'#cc9977',radius:5900},
        {id:'trappist-d',name:'TRAPPIST-1d',kind:'planet',appearance:'planet',a:0.0215,e:0.008,i:1.5,color:'#ddaa88',radius:4500},
        {id:'trappist-e',name:'TRAPPIST-1e',kind:'planet',appearance:'planet',a:0.0282,e:0.005,i:1.5,color:'#66aaff',radius:5700},
        {id:'trappist-f',name:'TRAPPIST-1f',kind:'planet',appearance:'planet',a:0.0371,e:0.010,i:1.5,color:'#77bbcc',radius:6200},
        {id:'trappist-g',name:'TRAPPIST-1g',kind:'planet',appearance:'planet',a:0.0458,e:0.006,i:1.5,color:'#88ccaa',radius:6500},
        {id:'trappist-h',name:'TRAPPIST-1h',kind:'planet',appearance:'planet',a:0.0619,e:0.004,i:1.5,color:'#99ddbb',radius:4800}
      ]
    },

    // 5. Kepler-16 (real circumbinary planet)
    {
      id:'kepler-16',name:'Kepler-16',
      description:'The real-life Tatooine. A circumbinary planet orbits both stars - the first confirmed planet around a binary star.',
      preview:'#d4a574',
      bodies:[
        {id:'kepler-16-a',name:'Kepler-16 A',kind:'star',appearance:'star',solarMass:0.698,color:'#ffe0a0',radius:630000},
        {id:'kepler-16-b',name:'Kepler-16 B',kind:'star',appearance:'star',solarMass:0.2,a:0.225,parentId:'kepler-16-a',color:'#d4a060',radius:340000},
        {id:'kepler-16-ab',name:'Kepler-16b',kind:'planet',appearance:'planet',a:0.708,e:0.16,i:3.0,color:'#6688aa',radius:30000}
      ]
    },

    // 6. HD 189733 (extreme weather)
    {
      id:'hd-189733',name:'HD 189733',
      description:'Home to HD 189733 b, a hot Jupiter that orbits in just 2.2 days. Wind speeds reach 8,700 km/h and it literally rains molten glass sideways.',
      preview:'#3366cc',
      bodies:[
        {id:'hd-189733-a',name:'HD 189733 A',kind:'star',appearance:'star',solarMass:0.95,color:'#fff4e0',radius:700000},
        {id:'hd-189733-b',name:'HD 189733 b',kind:'planet',appearance:'planet',a:0.0314,e:0.0,i:3.5,color:'#3366cc',radius:58000}
      ]
    },

    // 7. Binary star duet (clean)
    {
      id:'binary-duet',name:'Binary Duet',
      description:'A clean, simple binary star system. Two equal-mass stars orbiting their common center of mass at 5 AU separation.',
      preview:'#ffcc88',
      bodies:[
        {id:'binary-a',name:'Star A',kind:'star',appearance:'star',solarMass:0.5,color:'#ffd36a',radius:650000},
        {id:'binary-b',name:'Star B',kind:'star',appearance:'star',solarMass:0.5,a:5,parentId:'binary-a',color:'#ffe8a0',radius:650000}
      ]
    },

    // 8. Kepler-442 (habitable zone super-Earth)
    {
      id:'kepler-442',name:'Kepler-442',
      description:'One of the best super-Earth candidates for habitability. Kepler-442b orbits an M-dwarf star in the conservative habitable zone.',
      preview:'#55bb88',
      bodies:[
        {id:'kepler-442-star',name:'Kepler-442',kind:'star',appearance:'star',solarMass:0.27,color:'#ff9944',radius:370000},
        {id:'kepler-442-b',name:'Kepler-442 b',kind:'planet',appearance:'planet',a:0.409,e:0.0,i:3.0,color:'#55bb88',radius:9500}
      ]
    },

    // 9. Four-planet compact system
    {
      id:'compact-four',name:'Compact Four',
      description:'Four Earth-mass planets tightly packed within 0.1 AU. Ideal for observing resonant interactions and gravitational perturbations.',
      preview:'#72e6c1',
      bodies:[
        {id:'compact-star',name:'Central Star',kind:'star',appearance:'star',solarMass:0.8,color:'#fff8e0',radius:580000},
        {id:'compact-1',name:'Planet 1',kind:'planet',appearance:'planet',a:0.02,e:0.02,i:2.0,color:'#aaccdd',radius:6000},
        {id:'compact-2',name:'Planet 2',kind:'planet',appearance:'planet',a:0.04,e:0.04,i:3.0,color:'#88bbcc',radius:6200},
        {id:'compact-3',name:'Planet 3',kind:'planet',appearance:'planet',a:0.06,e:0.03,i:1.5,color:'#66aabb',radius:5800},
        {id:'compact-4',name:'Planet 4',kind:'planet',appearance:'planet',a:0.09,e:0.05,i:4.0,color:'#5599aa',radius:6400}
      ]
    }
  ];

  // -- system builder: converts definitions to editable system ----
  function buildEditableSystem(systemDef, epoch){
    // Deep clone
    var bodies = JSON.parse(JSON.stringify(systemDef.bodies));

    // Compute mu for all bodies (AU^3/day^2)
    for(var i = 0; i < bodies.length; i++){
      var b = bodies[i];
      if(b.solarMass !== undefined){
        b.mu = massToMu(b.solarMass);
        b.massKg = solarMassToKg(b.solarMass);
      } else if(b.massKg !== undefined){
        b.mu = massToMu(kgToSolarMasses(b.massKg));
      } else if(b.kind === 'planet' || b.kind === 'moon'){
        b.mu = EARTH_MU;
        b.massKg = 5.9722e24;
      } else {
        b.mu = 0;
        b.massKg = 0;
      }
    }

    var byId = {};
    for(var bi = 0; bi < bodies.length; bi++) byId[bodies[bi].id] = bodies[bi];

    var stars = bodies.filter(function(x){ return x.kind === 'star'; });
    var starMuTotal = stars.reduce(function(s, x){ return s + x.mu; }, 0);

    // --- Star placement ------------------------------------------------
    // Primary star(s) start at the origin; secondaries get real orbits so
    // no two massive bodies ever occupy the same point (the integrator
    // throws on overlap).
    for(var s = 0; s < stars.length; s++){
      var st = stars[s];
      st.x = 0; st.y = 0; st.z = 0;
      st.vx = 0; st.vy = 0; st.vz = 0;
    }
    if(stars.length === 2){
      // Exact circular binary orbit about the common barycenter.
      var s1 = stars.filter(function(x){ return !x.parentId; })[0] || stars[0];
      var s2 = stars.filter(function(x){ return x !== s1; })[0];
      var d = s2.a || 1;
      var M = s1.mu + s2.mu;
      var r1 = d * s2.mu / M;
      var r2 = d * s1.mu / M;
      var v1 = (s2.mu / M) * Math.sqrt(M / d);
      var v2 = (s1.mu / M) * Math.sqrt(M / d);
      s1.x = -r1; s1.y = 0; s1.z = 0;
      s1.vx = 0; s1.vy = -v1; s1.vz = 0;
      s2.x = r2; s2.y = 0; s2.z = 0;
      s2.vx = 0; s2.vy = v2; s2.vz = 0;
      s2.parentName = s1.name;
    } else if(stars.length > 2){
      // Secondary stars: circular orbit about the central mass, spread
      // around the circle so their starting points never coincide.
      var centralMu = stars
        .filter(function(x){ return !x.parentId; })
        .reduce(function(sum, x){ return sum + x.mu; }, 0);
      var secondaries = stars.filter(function(x){ return x.parentId; });
      for(var sc = 0; sc < secondaries.length; sc++){
        var star = secondaries[sc];
        var sep = star.a || 1;
        var angle = (sc / secondaries.length) * 2 * Math.PI;
        var v = Math.sqrt(centralMu / sep);
        star.x = Math.cos(angle) * sep;
        star.y = Math.sin(angle) * sep;
        star.z = 0;
        star.vx = -Math.sin(angle) * v;
        star.vy = Math.cos(angle) * v;
        star.vz = 0;
        var sp = byId[star.parentId];
        if(sp) star.parentName = sp.name;
      }
    }

    // --- Planet placement ---------------------------------------------
    // Planets orbit the barycenter; enclosed mass is the total stellar mass.
    // A planet with a star parent orbits that star directly.
    var planetCount = 0;
    for(var j = 0; j < bodies.length; j++){
      var b2 = bodies[j];
      if(b2.kind !== 'planet') continue;
      // Distinct initial orbital phase per planet (explicit `phase` in
      // degrees, otherwise golden-angle spread) so planets never all
      // start on one radius vector and appear as a straight line.
      var phase = (b2.phase !== undefined && b2.phase !== null)
        ? b2.phase : (planetCount * 137.508) % 360;
      planetCount++;
      var parent = b2.parentId ? byId[b2.parentId] : null;
      if(parent && parent.kind === 'star'){
        b2.parentName = parent.name;
        var pState = circularOrbitState(b2.a, b2.i || 0, parent.mu, phase);
        b2.x = parent.x + pState.x;
        b2.y = parent.y + pState.y;
        b2.z = parent.z + pState.z;
        b2.vx = parent.vx + pState.vx;
        b2.vy = parent.vy + pState.vy;
        b2.vz = parent.vz + pState.vz;
      } else {
        var state = circularOrbitState(b2.a, b2.i || 0, starMuTotal, phase);
        b2.x = state.x; b2.y = state.y; b2.z = state.z;
        b2.vx = state.vx; b2.vy = state.vy; b2.vz = state.vz;
      }
    }

    // --- Moon placement -------------------------------------------------
    for(var k = 0; k < bodies.length; k++){
      var m = bodies[k];
      if(m.kind !== 'moon') continue;
      var parentBody = byId[m.parentId] || null;
      if(parentBody){
        var moonState = circularOrbitState(m.a || 0.001, m.i || 0, parentBody.mu);
        m.x = parentBody.x + moonState.x;
        m.y = parentBody.y + moonState.y;
        m.z = parentBody.z + moonState.z;
        m.vx = parentBody.vx + moonState.vx;
        m.vy = parentBody.vy + moonState.vy;
        m.vz = parentBody.vz + moonState.vz;
        m.parentName = parentBody.name;
        m.mu = 0; // moons are particles in N-body
      }
    }

    // Center-of-mass correction
    centerOfMassCorrection(bodies);

    // Attach a state snapshot to every body (after the correction)
    for(var sn = 0; sn < bodies.length; sn++){
      bodies[sn].state = {
        x: bodies[sn].x, y: bodies[sn].y, z: bodies[sn].z,
        vx: bodies[sn].vx, vy: bodies[sn].vy, vz: bodies[sn].vz
      };
    }

    // Ensure all required fields
    for(var l = 0; l < bodies.length; l++){
      var bb = bodies[l];
      bb.category = bb.kind === 'star' ? 'Stars' :
                    bb.kind === 'planet' ? 'Planets' :
                    bb.kind === 'moon' ? 'Moons' : 'Comets';
      bb.notes = bb.notes || 'Curated system body.';
      if(!bb.radius) bb.radius = 0;
      if(!bb.color) bb.color = '#70b7ff';
      if(!bb.appearance) bb.appearance = bb.kind === 'star' ? 'star' : 'planet';
    }

    // View-fit extent: the largest orbital radius in the system
    var extent = 0;
    for(var e = 0; e < bodies.length; e++){
      if(bodies[e].a && bodies[e].a > extent) extent = bodies[e].a;
    }

    return {
      mode: 'editable',
      epoch: epoch || 2461088.5,
      extentAU: extent,
      bodies: bodies
    };
  }

  // -- API --------------------------------------------------------
  root.CuratedSystems = {
    SYSTEMS: SYSTEMS,
    buildEditableSystem: buildEditableSystem,
    findById: function(id){
      return SYSTEMS.find(function(s){ return s.id === id; }) || null;
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
