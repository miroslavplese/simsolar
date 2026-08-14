(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  root.MoonSystem=api;
})(typeof globalThis!=='undefined' ? globalThis : this,function(){
  const AU_KM=1.495978707e8;
  const SECONDS_PER_DAY=86400;
  const DEG=Math.PI/180;
  const TAU=Math.PI*2;

  const MAJOR_MOONS=[
    {name:'Moon',parentName:'Earth',aKm:384400,e:0.0549,period:27.321661,radius:1737.4,massKg:7.342e22,i:5.145,Omega:125.08,phase:115,color:'#c8c6bd'},
    {name:'Phobos',parentName:'Mars',aKm:9376,e:0.0151,period:0.31891,radius:11.27,massKg:1.0659e16,i:25.2,Omega:49.6,phase:30,color:'#a99a8b'},
    {name:'Deimos',parentName:'Mars',aKm:23463,e:0.0003,period:1.26244,radius:6.2,massKg:1.4762e15,i:26.0,Omega:49.6,phase:180,color:'#b9aa98'},
    {name:'Io',parentName:'Jupiter',aKm:421700,e:0.0041,period:1.769138,radius:1821.6,massKg:8.9319e22,i:3.1,Omega:100.5,phase:200,color:'#e7cf72'},
    {name:'Europa',parentName:'Jupiter',aKm:671100,e:0.009,period:3.551181,radius:1560.8,massKg:4.7998e22,i:3.6,Omega:100.5,phase:80,color:'#d6c5a8'},
    {name:'Ganymede',parentName:'Jupiter',aKm:1070400,e:0.0013,period:7.154553,radius:2634.1,massKg:1.4819e23,i:3.3,Omega:100.5,phase:300,color:'#a99b86'},
    {name:'Callisto',parentName:'Jupiter',aKm:1882700,e:0.0074,period:16.689018,radius:2410.3,massKg:1.0759e23,i:3.3,Omega:100.5,phase:20,color:'#77736f'},
    {name:'Rhea',parentName:'Saturn',aKm:527108,e:0.001,period:4.518212,radius:763.8,massKg:2.3065e21,i:27.0,Omega:113.7,phase:90,color:'#d5d4cd'},
    {name:'Titan',parentName:'Saturn',aKm:1221870,e:0.0288,period:15.945421,radius:2574.7,massKg:1.3452e23,i:27.0,Omega:113.7,phase:220,color:'#d6a65f'},
    {name:'Iapetus',parentName:'Saturn',aKm:3560820,e:0.0283,period:79.3215,radius:734.5,massKg:1.8056e21,i:15.5,Omega:113.7,phase:330,color:'#aaa39a'},
    {name:'Titania',parentName:'Uranus',aKm:435910,e:0.0011,period:8.705872,radius:788.9,massKg:3.527e21,i:97.8,Omega:74.0,phase:45,color:'#b8c3c7'},
    {name:'Oberon',parentName:'Uranus',aKm:583520,e:0.0014,period:13.463239,radius:761.4,massKg:3.014e21,i:97.9,Omega:74.0,phase:240,color:'#92999d'},
    {name:'Triton',parentName:'Neptune',aKm:354759,e:0.00002,period:5.876854,radius:1353.4,massKg:2.14e22,i:129.6,Omega:131.8,phase:100,color:'#c4b8b1'}
  ].map(moon=>({...moon,kind:'moon',category:'Moon',hideOrbit:true}));

  function eccentricAnomaly(meanAnomaly,eccentricity){
    let E=meanAnomaly;
    for(let i=0;i<8;i++){
      const delta=(E-eccentricity*Math.sin(E)-meanAnomaly)/
        (1-eccentricity*Math.cos(E));
      E-=delta;
      if(Math.abs(delta)<1e-12) break;
    }
    return E;
  }

  function relativeStateAt(moon,tDays){
    const a=moon.aKm/AU_KM;
    const e=moon.e||0;
    const rawMean=(moon.phase||0)*DEG+TAU*tDays/moon.period;
    const mean=((rawMean%TAU)+TAU)%TAU;
    const E=eccentricAnomaly(mean,e);
    const denominator=1-e*Math.cos(E);
    const root=Math.sqrt(1-e*e);
    const xOrb=a*(Math.cos(E)-e);
    const yOrb=a*root*Math.sin(E);
    const meanMotion=TAU/moon.period;
    const vxOrb=-a*Math.sin(E)*meanMotion/denominator;
    const vyOrb=a*root*Math.cos(E)*meanMotion/denominator;
    const inclination=(moon.i||0)*DEG;
    const ascendingNode=(moon.Omega||0)*DEG;
    const cosI=Math.cos(inclination), sinI=Math.sin(inclination);
    const cosO=Math.cos(ascendingNode), sinO=Math.sin(ascendingNode);

    function rotate(x,y){
      return {
        x:x*cosO-y*cosI*sinO,
        y:x*sinO+y*cosI*cosO,
        z:y*sinI
      };
    }

    const position=rotate(xOrb,yOrb);
    const velocity=rotate(vxOrb,vyOrb);
    return {
      ...position,
      vx:velocity.x,vy:velocity.y,vz:velocity.z,
      orbitalSpeedKmS:Math.hypot(velocity.x,velocity.y,velocity.z)*AU_KM/SECONDS_PER_DAY
    };
  }

  function stateAt(moon,parentState,tDays){
    if(!parentState) return null;
    const relative=relativeStateAt(moon,tDays);
    const vx=(parentState.vx||0)+relative.vx;
    const vy=(parentState.vy||0)+relative.vy;
    const vz=(parentState.vz||0)+relative.vz;
    const x=parentState.x+relative.x;
    const y=parentState.y+relative.y;
    const z=parentState.z+relative.z;
    return {
      x,y,z,vx,vy,vz,
      r:Math.hypot(x,y,z),
      speedKmS:Math.hypot(vx,vy,vz)*AU_KM/SECONDS_PER_DAY,
      orbitalSpeedKmS:relative.orbitalSpeedKmS,
      parentRelative:true
    };
  }

  function outerRadiusAu(moons,parentName){
    return moons
      .filter(moon=>moon.parentName===parentName)
      .reduce((largest,moon)=>Math.max(largest,moon.aKm/AU_KM),0);
  }

  function systemVisible(moons,parentName,zoom,auPixels,minPixels){
    const radius=outerRadiusAu(moons,parentName);
    const threshold=minPixels===undefined ? 50 : minPixels;
    return radius>0 && radius*auPixels*zoom>=threshold;
  }

  function focusZoom(moons,parentName,auPixels,targetPixels,maxZoom){
    const radius=outerRadiusAu(moons,parentName);
    if(!radius) return null;
    return Math.min(maxZoom||20000,(targetPixels||70)/(radius*auPixels));
  }

  function heliocentricPathsVisible(zoom,maxZoom){
    return zoom<=(maxZoom||20);
  }

  return {
    AU_KM,MAJOR_MOONS,relativeStateAt,stateAt,outerRadiusAu,systemVisible,
    focusZoom,heliocentricPathsVisible
  };
});
