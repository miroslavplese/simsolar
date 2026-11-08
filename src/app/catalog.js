(function(root,factory){
  const api={create:factory};
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.SimSolarCatalog=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(deps){
  'use strict';

  const {window}=deps;
  const {SpacecraftCatalog}=window;
  const {MAJOR_MOONS}=window.MoonSystem;
  const {GM_BY_BODY}=window.NBodySimulation;
  const {runtimeId}=window.SystemModel;
  const {daysSinceJ2000}=deps.constants;

  const planets = [
    {kind:'planet', name:'Mercury', a:0.387, e:0.206, period:87.97,  radius:2438,  color:'#a9a29a', i:7.005, Omega:48.331, omega:29.124, M0:174.8, n:null},
    {kind:'planet', name:'Venus',   a:0.723, e:0.007, period:224.70, radius:6052,  color:'#e8c88a', i:3.395, Omega:76.680, omega:54.884, M0:50.4,  n:null},
    {kind:'planet', name:'Earth',   a:1.000, e:0.017, period:365.25, radius:6371,  color:'#5fa8e8', i:0.000, Omega:0,      omega:102.947,M0:357.5, n:null},
    {kind:'planet', name:'Mars',    a:1.524, e:0.093, period:686.98, radius:3390,  color:'#c1653b', i:1.850, Omega:49.558, omega:286.502,M0:19.4,  n:null},
    {kind:'planet', name:'Jupiter', a:5.203, e:0.049, period:4332.6, radius:69911, color:'#d8b98a', i:1.303, Omega:100.464,omega:273.867,M0:20.0,  n:null},
    {kind:'planet', name:'Saturn',  a:9.537, e:0.056, period:10759.2,radius:58232, color:'#e3d2a0', i:2.485, Omega:113.665,omega:339.392,M0:317.0, n:null},
    {kind:'planet', name:'Uranus',  a:19.19, e:0.047, period:30688.5,radius:25362, color:'#9fd4dd', i:0.773, Omega:74.006, omega:96.998, M0:141.0, n:null},
    {kind:'planet', name:'Neptune', a:30.07, e:0.010, period:60182,  radius:24622, color:'#5c7fe0', i:1.770, Omega:131.784,omega:273.187,M0:256.2, n:null},
    {kind:'planet', category:'Dwarf planet', name:'Pluto', a:39.482, e:0.249, period:90560, radius:1188, color:'#d8c3aa', i:17.16, Omega:110.299, omega:113.834, M0:14.53, n:null,
     notes:'New Horizons made the first and only close flyby of Pluto on 14 July 2015.'},
    {kind:'planet', category:'Moon', name:'Charon', a:39.482, e:0.249, period:90560, displayPeriod:6.387, radius:606, color:'#aaaeb8', i:17.16, Omega:110.299, omega:113.834, M0:14.53, n:null, hideOrbit:true,
     parentName:'Pluto',
     notes:'New Horizons observed Charon during its 14 July 2015 passage. Marker separation from Pluto is exaggerated for visibility.'},
  ];
  for(const p of planets){ p.n = 360/p.period; p.epochDays = 0; }
  const moons=MAJOR_MOONS.map(moon=>({
    ...moon,
    parent:planets.find(planet=>planet.name===moon.parentName),
    notes:'Major moon of '+moon.parentName+'.'
  }));
  const charon=planets.find(planet=>planet.name==='Charon');
  const sunReference={
    kind:'sun',name:'Sun',color:'#f2b544',mu:GM_BY_BODY.Sun
  };
  const moonVisibilityDefinitions=[
    ...moons,
    {name:'Charon',parentName:'Pluto',aKm:19596}
  ];

  const spacecraft=SpacecraftCatalog.create();
  const comets = [
    {kind:'comet', name:'Halley', color:'#7ee7ff', massKg:2.2e14, massEstimated:true, e:0.967, i:162.26, period:27510, q:0.586, perihelion:'1986-02-09',
     notes:'The best-known periodic comet; its retrograde orbit returns it to the inner solar system roughly every 75 years.'},
    {kind:'comet', name:'Hale-Bopp', color:'#b8a6ff', massKg:1.9e14, massEstimated:true, e:0.995, i:89.4, period:925000, q:0.914, perihelion:'1997-04-01',
     notes:'A long-period comet that remained visible to the unaided eye for a record 18 months around its 1997 apparition.'},
    {kind:'comet', name:'Encke', color:'#73e6b1', massKg:2.9e13, massEstimated:true, e:0.848, i:11.8, period:1204, q:0.339, perihelion:'2023-10-22',
     notes:'A short-period comet with the shortest known orbital period of a bright periodic comet, about 3.3 years.'},
    {kind:'comet', name:'67P/Churyumov-Gerasimenko', color:'#ff9f80', massKg:9.982e12, e:0.641, i:7.04, period:2352, q:1.21, perihelion:'2015-08-13',
     notes:'Destination of ESA\'s Rosetta mission and the Philae lander.'},
    {kind:'comet', name:'NEOWISE', color:'#ffe28a', massKg:3.3e13, massEstimated:true, e:0.9992, i:128.9, period:2460000, q:0.295, perihelion:'2020-07-03',
     notes:'A long-period comet that became a prominent naked-eye object in July 2020.'},
  ];

  const builtInBodies=[
    sunReference,...planets,...moons,
    ...spacecraft.slice(0,SpacecraftCatalog.LEGACY_COUNT),...comets,
    ...spacecraft.slice(SpacecraftCatalog.LEGACY_COUNT)
  ];
  builtInBodies.forEach((body,index)=>{
    body.id='solar-'+runtimeId(body,index);
  });
  for(const body of [...planets,...moons]){
    if(body.parentName){
      body.parentId=builtInBodies.find(parent=>parent.name===body.parentName)?.id;
    }
  }
  const trajectoryBundle = window.SPACECRAFT_TRAJECTORIES;
  const trajectoryData = {
    ...trajectoryBundle.trajectories,
    ...window.RECENT_SPACECRAFT_TRAJECTORIES.trajectories
  };
  const planetBundle = window.PLANET_EPHEMERIDES;
  const planetData = planetBundle ? planetBundle.ephemerides : {};
  const planetCutoffBundle=window.PLANET_CUTOFF_STATES;
  const planetCutoffData=planetCutoffBundle ? planetCutoffBundle.states : {};
  const moonCutoffBundle=window.MOON_CUTOFF_STATES;
  const moonCutoffData=moonCutoffBundle ? moonCutoffBundle.states : {};
  const cometBundle = window.COMET_EPHEMERIDES;
  const cometData = cometBundle ? cometBundle.ephemerides : {};
  for(const s of spacecraft){
    const trajectory = trajectoryData[s.name];
    s._trajectoryPoints = trajectory ? trajectory.points : null;
  }
  for(const p of planets){
    const ephemeris = planetData[p.name];
    p._ephemerisPoints = ephemeris ? ephemeris.points : null;
  }
  for(const comet of comets){
    const ephemeris=cometData[comet.name];
    comet._trajectoryPoints=ephemeris ? ephemeris.points : null;
  }
  const HYBRID_EPOCH_DAYS=daysSinceJ2000(Date.parse(trajectoryBundle.through+'T00:00:00Z'));
  const HYBRID_EPOCH_DATE=trajectoryBundle.through;

  return {
    HYBRID_EPOCH_DAYS,
    planetCutoffData,
    moonCutoffData,
    planets,
    spacecraft,
    comets,
    builtInBodies,
    sunReference,
    charon,
    moons,
    moonVisibilityDefinitions,
    HYBRID_EPOCH_DATE
  };
});
