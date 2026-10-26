(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  root.AsteroidBelt=api;
})(typeof globalThis!=='undefined' ? globalThis : this,function(){
  function createPoints(){
    let seed=1947;
    function random(){
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      return seed/4294967296;
    }
    const points=[];
    for(let i=0;i<5000;i++){
      const radius=2.1+1.2*(random()+random())/2;
      const angle=random()*Math.PI*2;
      points.push({
        x:radius*Math.cos(angle),
        y:radius*Math.sin(angle),
        z:(random()-random())*0.16,
        size:0.55+random()*0.65
      });
    }
    return points;
  }

  function draw(context,points,project,width,height,pixelsPerAU){
    // This is a density illustration, not individually tracked asteroids.
    // Compensate for increasing dot density as projected area shrinks.
    const opacity=Math.min(1,(pixelsPerAU/60)**2)*
      Math.max(0,Math.min(1,(2400-pixelsPerAU)/1200));
    if(opacity<=0) return 0;
    context.save();
    context.fillStyle='rgba(232,206,158,0.85)';
    context.globalAlpha=opacity;
    let drawn=0;
    for(const point of points){
      const screen=project(point.x,point.y,point.z);
      const size=point.size;
      if(screen.x<-size || screen.x>width+size ||
        screen.y<-size || screen.y>height+size) continue;
      context.fillRect(screen.x-size/2,screen.y-size/2,size,size);
      drawn++;
    }
    context.restore();
    return drawn;
  }

  return {createPoints,draw};
});
