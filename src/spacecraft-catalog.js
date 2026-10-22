(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  root.SpacecraftCatalog=api;
})(typeof globalThis!=='undefined' ? globalThis : this,function(){
  function create(){
  const daysSinceJ2000=ms=>(ms-Date.UTC(2000,0,1,12))/86400000;
  // Spacecraft — heliocentric osculating elements.
  // Legacy elements below are fallback display metadata, not mission ephemerides.
  // Voyager 1/2, Pioneer 10/11: hyperbolic orbit shape (a, e, i, Omega, omega) from
  // Franz & Harper 2002 ("Heliospheric Coordinate Systems"), fitted post-final-
  // encounter solutions from NSSDC tracking data -- valid indefinitely since no
  // further gravity assists occur after the listed encounter. Each orbit's mean
  // anomaly is then recalibrated (epochDays/M0) against a real, dated heliocentric
  // distance (JPL/NASA tracking reports), so the propagated position matches
  // publicly reported distances rather than depending on the paper's own epoch
  // convention.
  // New Horizons: post-Jupiter (2007) hyperbolic orbit built from published
  // perihelion/eccentricity/inclination (q=2.2 AU, e=1.40, i=2.3 deg), with orbit
  // orientation (Omega/omega) fitted to the 2015-07-14 Pluto encounter geometry
  // (r=32.9 AU) -- orientation is an approximation; size/shape/speed are real.
  // Parker Solar Probe: final post-7th-Venus-flyby orbit (from Nov 2024), true
  // perihelion/aphelion/period; orbit orientation approximated near Venus's plane.
  const spacecraft = [
    {kind:'spacecraft', name:'Voyager 1', color:'#ffd479', icon:'diamond',
     massKg:721.9, massAtLaunch:true,
     a:-3.203, e:3.742, i:35.71, Omega:178.95, omega:-21.60, M0:1670.742, n:62.642/365.25, epochDays:2417.50,
     launch:'1977-09-05', notes:'Post-Saturn (1980) orbit shape from fitted NSSDC tracking data; position calibrated to its documented 100 AU crossing on 2006-08-15. Now the most distant human-made object.'},
    {kind:'spacecraft', name:'Voyager 2', color:'#ffb0e0', icon:'diamond',
     massKg:721.9, massAtLaunch:true,
     a:-4.021, e:6.2853, i:78.92, Omega:101.65, omega:130.01, M0:1828.142, n:44.661/365.25, epochDays:8858.50,
     launch:'1977-08-20', notes:'Post-Neptune (1989) orbit shape from fitted NSSDC tracking data; position calibrated to a reported distance of 136.2 AU on 2024-04-03. Steep inclination is real -- a result of the final Neptune flyby geometry.'},
    {kind:'spacecraft', name:'Pioneer 10', color:'#8fd8a0', icon:'diamond',
     massKg:258, massAtLaunch:true,
     a:-6.942, e:1.727, i:3.14, Omega:-28.57, omega:-13.45, M0:995.375, n:19.700/365.25, epochDays:8858.50,
     launch:'1972-03-03', notes:'Post-Jupiter (1973) orbit shape from fitted NSSDC tracking data; position calibrated to a reported distance of 136.2 AU on 2024-04-03. Silent since 2003 -- position shown is the coasted ballistic path.'},
    {kind:'spacecraft', name:'Pioneer 11', color:'#a0c8ff', icon:'diamond',
     massKg:258.5, massAtLaunch:true,
     a:-8.059, e:2.161, i:16.63, Omega:160.40, omega:12.81, M0:523.950, n:15.668/365.25, epochDays:4634.50,
     launch:'1973-04-06', notes:'Post-Saturn (1979) orbit shape from fitted NSSDC tracking data; position calibrated to a reported distance of 86.4 AU on 2012-09-09. Silent since 1995 -- position shown is the coasted ballistic path.'},
    {kind:'spacecraft', name:'New Horizons', color:'#ff8f6b', icon:'diamond',
     massKg:478, massAtLaunch:true,
     a:-5.5, e:1.40, i:2.3, Omega:100, omega:56.65, M0:253.85, n:0.076417, epochDays:daysSinceJ2000(Date.UTC(2015,6,14)),
     launch:'2006-01-19', notes:'Post-Jupiter (2007) hyperbolic orbit. Size/shape/speed from published elements (q=2.2 AU, e=1.40); orbit orientation fitted to the 2015 Pluto flyby rather than full ephemeris.'},
    {kind:'spacecraft', name:'Parker Solar Probe', color:'#ffe27a', icon:'diamond',
     massKg:685, massAtLaunch:true,
     a:0.38793, e:0.8818, i:3.4, Omega:76.7, omega:90, M0:0, n:360/88.24, epochDays:daysSinceJ2000(Date.UTC(2024,11,24)),
     launch:'2018-08-12', notes:'Final orbit after 7th Venus flyby (Nov 2024): true perihelion 9.86 solar radii, aphelion ~0.73 AU, 88.2-day period. Orbit orientation approximated near Venus\'s orbital plane.'},
  ];
  const flybys = {
    'Voyager 1': [['Jupiter','1979-03-05'],['Saturn','1980-11-12']],
    'Voyager 2': [['Jupiter','1979-07-09'],['Saturn','1981-08-26'],['Uranus','1986-01-24'],['Neptune','1989-08-25']],
    'Pioneer 10': [['Jupiter','1973-12-04']],
    'Pioneer 11': [['Jupiter','1974-12-03'],['Saturn','1979-09-01']],
    'New Horizons': [['Jupiter','2007-02-28'],['Pluto & Charon','2015-07-14'],['Arrokoth','2019-01-01']],
    'Parker Solar Probe': [
      ['Venus 1','2018-10-03'],['Venus 2','2019-12-26'],['Venus 3','2020-07-11'],
      ['Venus 4','2021-02-20'],['Venus 5','2021-10-16'],['Venus 6','2023-08-21'],['Venus 7','2024-11-06']
    ]
  };

  for(const body of spacecraft) body.flybys=flybys[body.name]||[];
  spacecraft.push(
    {
      kind:'spacecraft',name:'James Webb Space Telescope',color:'#f3db86',icon:'diamond',
      launch:'2021-12-25',massKg:6200,massAtLaunch:true,
      wikipedia:'James Webb Space Telescope',
      sourceUrl:'https://science.nasa.gov/mission/webb/',
      notes:'NASA/ESA/CSA infrared observatory with a 6.5-meter segmented mirror and five-layer sunshield. Launched on Ariane 5 to a halo orbit around Sun-Earth L2. NIRCam, NIRSpec, MIRI, and FGS/NIRISS study galaxies, star formation, and exoplanets. Future simulation omits station-keeping; it is not a prediction of Webb operations.',
      flybys:[],
      events:[
        {date:'2022-01-24',title:'L2 orbit insertion',target:'Earth',
          description:'Webb completed its insertion burn into a halo orbit around Sun-Earth L2.'},
        {date:'2022-07-12',title:'First full-color images',target:'Earth',
          description:'NASA, ESA, and CSA released Webb science images and spectra.'}
      ]
    },
    {
      kind:'spacecraft',name:'Lucy',color:'#c3a5ff',icon:'diamond',
      launch:'2021-10-16',massKg:1550,massAtLaunch:true,
      wikipedia:'Lucy (spacecraft)',sourceUrl:'https://science.nasa.gov/mission/lucy/',
      notes:'NASA Discovery mission launched on Atlas V to investigate Jupiter Trojan asteroid systems. Two circular solar arrays power L\u2019Ralph, L\u2019LORRI, and L\u2019TES. Horizons includes reconstructed and mission-reference trajectory segments. Later burns and Trojan encounters are not reproduced by the future gravity-only simulation.',
      flybys:[['Earth 1','2022-10-16'],['Dinkinesh','2023-11-01'],
        ['Earth 2','2024-12-13'],['Donaldjohanson','2025-04-20']]
    },
    {
      kind:'spacecraft',name:'Psyche',color:'#89d5ef',icon:'diamond',
      launch:'2023-10-13',wikipedia:'Psyche (spacecraft)',
      sourceUrl:'https://science.nasa.gov/mission/psyche/',
      notes:'NASA Discovery mission launched on Falcon Heavy toward metal-rich asteroid 16 Psyche. Solar-electric Hall thrusters provide cruise propulsion. Its payload includes multispectral imagers, a magnetometer, and a gamma-ray/neutron spectrometer; it also carried the Deep Space Optical Communications demonstration. Future simulation omits ion thrust and asteroid capture.',
      flybys:[['Mars','2026-05-15']]
    },
    {
      kind:'spacecraft',name:'Europa Clipper',color:'#93e4c4',icon:'diamond',
      launch:'2024-10-14',massKg:3241,massDry:true,
      wikipedia:'Europa Clipper',sourceUrl:'https://science.nasa.gov/mission/europa-clipper/',
      notes:'NASA orbiter launched on Falcon Heavy to assess the habitability of Europa. Large solar arrays power cameras, spectrometers, ice-penetrating radar, and magnetic/plasma instruments. The mission plans repeated Europa flybys from Jupiter orbit. Earth assist, Jupiter insertion, and later targeting burns are not modeled after the simulation cutoff.',
      flybys:[['Mars','2025-03-01']]
    }
  );
  return spacecraft;
  }
  return {create,LEGACY_COUNT:6};
});
