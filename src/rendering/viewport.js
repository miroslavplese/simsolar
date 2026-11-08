(function(root,factory){
  const api={create:factory};
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.SimSolarViewport=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(deps){
  'use strict';

  const {document,window}=deps;

  const sky = document.getElementById('sky');
  const orbits = document.getElementById('orbits');
  const scene = document.getElementById('scene');
  const skyCtx = sky.getContext('2d');
  const orbitCtx = orbits.getContext('2d');
  const ctx = scene.getContext('2d');

  let W, H, cx, cy;
  function resize(){
    W = sky.width = orbits.width = scene.width = window.innerWidth;
    H = sky.height = orbits.height = scene.height = window.innerHeight;
    deps.stars.starBackdrop.width=W;
    deps.stars.starBackdrop.height=H;
    deps.stars.starBackdropKey='';
    cx = W/2; cy = H/2;
    deps.stars.drawStars(true);
    deps.camera.invalidateProjection();
  }

  return {
    get W(){ return W; },
    get H(){ return H; },
    skyCtx,
    get cx(){ return cx; },
    get cy(){ return cy; },
    orbitCtx,
    ctx,
    scene,
    sky,
    resize
  };
});
