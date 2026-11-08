(function(root,factory){
  const api={create:factory};
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.SimSolarConstants=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(deps){
  'use strict';


  const DEG = Math.PI/180;
  const AU_PX = 46;
  const DEFAULT_TILT = 58*DEG;
  const J2000 = Date.UTC(2000,0,1,12,0,0);

  function daysSinceJ2000(dateMs){ return (dateMs - J2000)/86400000; }

  const ZOOM_MIN=0.018,BASE_ZOOM_MAX=20000,HARD_ZOOM_MAX=2000000;

  const SUN_RADIUS_KM=696340;

  return {
    DEFAULT_TILT,
    daysSinceJ2000,
    J2000,
    AU_PX,
    ZOOM_MIN,
    BASE_ZOOM_MAX,
    DEG,
    SUN_RADIUS_KM,
    HARD_ZOOM_MAX
  };
});
