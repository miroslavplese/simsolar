(function(root,factory){
  const api={create:factory};
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.SimSolarStars=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(deps){
  'use strict';

  const {document,window}=deps;
  const {StarField}=window;
  const {DEFAULT_TILT}=deps.constants;
  const {skyCtx}=deps.viewport;

  const starBackdrop=document.createElement('canvas');
  const starBackdropCtx=starBackdrop.getContext('2d');

  let stars = [];
  let starBackdropKey='';
  let starBackdropRenderedAt=-Infinity;
  const STAR_BACKDROP_INTERVAL_MS=50;

  function ensureCatalogStars(){
    if(stars.length) return;
    const records=window.HIPPARCOS_STAR_CATALOG?.stars;
    if(!records) throw new Error('Hipparcos star catalog is unavailable.');
    stars=StarField.createStars(records);
  }

  function backdropComponent(value,precision){
    return Math.round(value*precision);
  }

  function renderStarBackdrop(key,render,force){
    const now=performance.now();
    if(key===starBackdropKey) return;
    if(
      !force && starBackdropKey &&
      now-starBackdropRenderedAt<STAR_BACKDROP_INTERVAL_MS
    ) return;
    starBackdropCtx.clearRect(0,0,deps.viewport.W,deps.viewport.H);
    render(starBackdropCtx);
    starBackdropKey=key;
    starBackdropRenderedAt=now;
  }

  function drawStars(force){
    ensureCatalogStars();
    const backdropOrientation=StarField.systemBackdropOrientation(
      deps.camera.viewYaw,deps.camera.viewTilt,DEFAULT_TILT
    );
    const key='system:'+deps.viewport.W+':'+deps.viewport.H+':'+
      backdropComponent(backdropOrientation.yaw,1000)+':'+
      backdropComponent(backdropOrientation.tilt,1000);
    renderStarBackdrop(key,backdrop=>{
      for(const star of stars){
        const projected=StarField.projectStar(
          star,backdropOrientation.yaw,backdropOrientation.tilt,deps.viewport.W,deps.viewport.H
        );
        if(!projected) continue;
        backdrop.beginPath();
        backdrop.fillStyle=`rgba(${star.rgb},${projected.alpha})`;
        backdrop.arc(
          projected.x,projected.y,star.radius,0,Math.PI*2
        );
        backdrop.fill();
      }
    },force);
    skyCtx.fillStyle = '#0a0e1a'; skyCtx.fillRect(0,0,deps.viewport.W,deps.viewport.H);
    skyCtx.drawImage(starBackdrop,0,0);
  }

  return {
    starBackdrop,
    get starBackdropKey(){ return starBackdropKey; },
    set starBackdropKey(value){ starBackdropKey=value; },
    drawStars,
    ensureCatalogStars,
    backdropComponent,
    renderStarBackdrop,
    get stars(){ return stars; }
  };
});
