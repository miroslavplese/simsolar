(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  root.RingSystem=api;
})(typeof globalThis!=='undefined' ? globalThis : this,function(){
  const AU_KM=1.495978707e8;
  const DEG=Math.PI/180;
  const J2000_OBLIQUITY=23.439291111*DEG;

  // Mean J2000 equatorial poles from NAIF pck00011.tpc (degrees).
  // https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc
  const PLANETARY_RINGS={
    Jupiter:{
      poleRA:268.056595,poleDec:64.495303,
      bands:[
        {innerKm:92000,outerKm:122500,color:'#c7b99a',alpha:0.07},
        {innerKm:122500,outerKm:129000,color:'#d8c7a5',alpha:0.14}
      ]
    },
    Saturn:{
      poleRA:40.589,poleDec:83.537,
      bands:[
        {innerKm:74658,outerKm:91975,color:'#a79a82',alpha:0.18},
        {innerKm:92000,outerKm:117580,color:'#e0cfaa',alpha:0.48},
        {innerKm:122170,outerKm:136775,color:'#c9b991',alpha:0.38},
        {innerKm:140180,outerKm:140500,color:'#d8ccb0',alpha:0.34}
      ]
    },
    Uranus:{
      poleRA:257.311,poleDec:-15.175,
      bands:[
        {innerKm:38000,outerKm:41800,color:'#9eb7bb',alpha:0.12},
        {innerKm:42200,outerKm:48300,color:'#a8c1c5',alpha:0.16},
        {innerKm:50000,outerKm:51150,color:'#bdd2d5',alpha:0.24}
      ]
    },
    Neptune:{
      poleRA:299.36,poleDec:43.46,
      bands:[
        {innerKm:41900,outerKm:42900,color:'#8291b5',alpha:0.1},
        {innerKm:53000,outerKm:57300,color:'#98a5c4',alpha:0.12},
        {innerKm:62900,outerKm:62950,color:'#b3bbcf',alpha:0.28}
      ]
    }
  };

  function relativePoint(ring,radiusKm,angle){
    const radius=radiusKm/AU_KM;
    const xOrb=radius*Math.cos(angle);
    const yOrb=radius*Math.sin(angle);
    const normal=normalVector(ring);
    const length=Math.hypot(normal.x,normal.y);
    const equatorX=length>1e-12
      ? {x:-normal.y/length,y:normal.x/length,z:0}
      : {x:1,y:0,z:0};
    const equatorY={
      x:-normal.z*equatorX.y,
      y:normal.z*equatorX.x,
      z:normal.x*equatorX.y-normal.y*equatorX.x
    };
    return {
      x:xOrb*equatorX.x+yOrb*equatorY.x,
      y:xOrb*equatorX.y+yOrb*equatorY.y,
      z:yOrb*equatorY.z
    };
  }

  function outerRadiusKm(ring){
    return Math.max(...ring.bands.map(band=>band.outerKm));
  }

  function normalVector(ring){
    if(Number.isFinite(ring.poleRA) && Number.isFinite(ring.poleDec)){
      const ra=ring.poleRA*DEG,dec=ring.poleDec*DEG;
      const x=Math.cos(dec)*Math.cos(ra);
      const y=Math.cos(dec)*Math.sin(ra);
      const z=Math.sin(dec);
      return {
        x,
        y:y*Math.cos(J2000_OBLIQUITY)+z*Math.sin(J2000_OBLIQUITY),
        z:-y*Math.sin(J2000_OBLIQUITY)+z*Math.cos(J2000_OBLIQUITY)
      };
    }
    const inclination=ring.i*DEG;
    const ascendingNode=ring.Omega*DEG;
    return {
      x:Math.sin(ascendingNode)*Math.sin(inclination),
      y:-Math.cos(ascendingNode)*Math.sin(inclination),
      z:Math.cos(inclination)
    };
  }

  function viewDepth(point,viewDirection){
    return -(
      point.x*viewDirection.x+
      point.y*viewDirection.y+
      point.z*viewDirection.z
    );
  }

  return {
    AU_KM,PLANETARY_RINGS,relativePoint,outerRadiusKm,normalVector,viewDepth
  };
});
