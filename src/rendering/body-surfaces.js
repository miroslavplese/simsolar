(function(root,factory){
  const api={create:factory};
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.SimSolarSurfaces=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(deps){
  'use strict';

  const {document,window}=deps;
  const {AU_KM}=window.TrajectoryMath;
  const {viewCoordinates}=window.ViewTransform;
  const {displayRadiusPixels,planetMarkerRadiusPixels,customMarkerRadiusPixels}=window.BodyRendering;
  const {normalizeVector,sphereBrightness,shadowConeMayIntersectTarget}=window.BodyLighting;
  const {
    createRenderer:createBodyTextureRenderer,viewBasis:bodyTextureViewBasis,
    orientationMatrix:bodyTextureOrientationMatrix
  }=window.BodyTextures;
  const {outerRadiusAu:moonSystemRadiusAu}=window.MoonSystem;
  const {dot:observatoryDot}=window.ObservatoryMode;
  const {dominantLightBody}=window.SystemModel;
  const {charon,moonVisibilityDefinitions,sunReference}=deps.catalog;
  const {AU_PX}=deps.constants;
  const {activeSystemBodies,positionForBody}=deps.simulation;
  const {ctx}=deps.viewport;

  const bodyTextureRenderer=createBodyTextureRenderer({
    onReady:()=>{ deps.camera.orbitLayerDirty=true; }
  });

  function markerRadiusForBody(body,isSun){
    // Luminous bodies (the Sun, curated/custom stars) use the same
    // modest fixed marker; sqrt(radius) planet sizing would make
    // binary companions look like touching balls.
    if(isSun || body?.kind==='star') return 6;
    if(body.kind==='custom') return customMarkerRadiusPixels(body.appearance);
    if(body.kind==='moon'){
      return Math.max(2.2,Math.min(6,Math.sqrt(body.radius)*0.1));
    }
    return planetMarkerRadiusPixels(body.radius);
  }

  function bodyRadiusRendering(body,isSun){
    const radiusKm=isSun?696340:body.radius;
    let systemRadiusAu=0;
    if(!isSun){
      const parentName=body.kind==='moon'
        ? body.parentName
        : body===charon ? 'Pluto' : body.name;
      systemRadiusAu=moonSystemRadiusAu(moonVisibilityDefinitions,parentName);
    }
    return displayRadiusPixels({
      radiusKm,zoom:deps.camera.zoom,auPixels:AU_PX,systemRadiusAu,
      markerRadius:markerRadiusForBody(body,isSun)
    });
  }

  function hexToRgba(hex, a){
    const {r,g,b}=hexToRgb(hex);
    return `rgba(${r},${g},${b},${a})`;
  }

  function hexToRgb(hex){
    const c = hex.replace('#','');
    const r=parseInt(c.substring(0,2),16), g=parseInt(c.substring(2,4),16), bl=parseInt(c.substring(4,6),16);
    return {r,g,b:bl};
  }

  const litSphereCache=new Map();
  function systemTextureViewBasis(){
    const cosYaw=Math.cos(deps.camera.viewYaw),sinYaw=Math.sin(deps.camera.viewYaw);
    const cosTilt=Math.cos(deps.camera.viewTilt),sinTilt=Math.sin(deps.camera.viewTilt);
    return {
      right:{x:cosYaw,y:-sinYaw,z:0},
      up:{
        x:-sinYaw*cosTilt,
        y:-cosYaw*cosTilt,
        z:sinTilt
      },
      towardObserver:{
        x:sinYaw*sinTilt,
        y:cosYaw*sinTilt,
        z:cosTilt
      }
    };
  }

  function observatoryTextureViewBasis(direction,camera){
    return bodyTextureViewBasis(
      {x:-direction.x,y:-direction.y,z:-direction.z},
      camera.right,camera.up
    );
  }

  function textureViewVector(vector,basis){
    return {
      x:observatoryDot(vector,basis.right),
      y:observatoryDot(vector,basis.up),
      z:observatoryDot(vector,basis.towardObserver)
    };
  }

  function physicalRadiusKm(body){
    if(body===sunReference) return 696340;
    return body?.radius||0;
  }

  function bodyShadowGeometry(body,position,lightBody,lightPosition,basis){
    const targetRadiusAu=physicalRadiusKm(body)/AU_KM;
    const lightRadiusAu=physicalRadiusKm(lightBody)/AU_KM;
    if(
      !(targetRadiusAu>0) || !(lightRadiusAu>0) ||
      !position || !lightPosition || !basis
    ) return null;
    const toViewUnits=otherPosition=>textureViewVector({
      x:(otherPosition.x-position.x)/targetRadiusAu,
      y:(otherPosition.y-position.y)/targetRadiusAu,
      z:(otherPosition.z-position.z)/targetRadiusAu
    },basis);
    const viewLightPosition=toViewUnits(lightPosition);
    const lightRadius=lightRadiusAu/targetRadiusAu;
    const occluders=[];
    for(const candidate of activeSystemBodies()){
      const candidateIsChild=
        candidate.parentId===body.id ||
        candidate.parentName===body.name;
      const candidateIsParent=
        body.parentId===candidate.id ||
        body.parentName===candidate.name;
      if(
        candidate===body || candidate===lightBody ||
        (!candidateIsChild && !candidateIsParent)
      ) continue;
      const radius=physicalRadiusKm(candidate)/physicalRadiusKm(body);
      const candidatePosition=positionForBody(candidate,deps.clock.simDaysSinceJ2000);
      if(!(radius>0) || !candidatePosition) continue;
      const viewPosition=toViewUnits(candidatePosition);
      if(!shadowConeMayIntersectTarget(
        viewLightPosition,lightRadius,viewPosition,radius
      )) continue;
      occluders.push({...viewPosition,radius});
    }
    return {
      lightPosition:viewLightPosition,
      lightRadius,
      occluders
    };
  }

  function drawBodyTexture(
    body,x,y,radius,context,light,basis,shadowGeometry=null
  ){
    return !!bodyTextureRenderer && bodyTextureRenderer.draw(
      body,context,x,y,radius,{
        light,
        tDays:deps.clock.simDaysSinceJ2000,
        ...shadowGeometry,
        orientation:bodyTextureOrientationMatrix(
          body,deps.clock.simDaysSinceJ2000,basis
        )
      }
    );
  }

  function litSphereSprite(color,radius,worldLight){
    const light=viewCoordinates(
      worldLight.x,worldLight.y,worldLight.z,deps.camera.viewYaw,deps.camera.viewTilt
    );
    const sampleRadius=Math.max(2,Math.min(192,Math.ceil(radius)));
    const lightKey=[light.x,light.y,light.depth]
      .map(value=>Math.round(value*20)).join(':');
    const key=color+':'+sampleRadius+':'+lightKey;
    if(litSphereCache.has(key)) return litSphereCache.get(key);

    const size=sampleRadius*2+2;
    const sprite=document.createElement('canvas');
    sprite.width=size;
    sprite.height=size;
    const spriteCtx=sprite.getContext('2d');
    const image=spriteCtx.createImageData(size,size);
    const rgb=hexToRgb(color);
    const center=size/2;
    for(let y=0;y<size;y++){
      for(let x=0;x<size;x++){
        const nx=(x+0.5-center)/sampleRadius;
        const ny=(y+0.5-center)/sampleRadius;
        const radialSq=nx*nx+ny*ny;
        if(radialSq>=1) continue;
        const nz=Math.sqrt(1-radialSq);
        const brightness=sphereBrightness(
          {x:nx,y:ny,z:nz},
          {x:light.x,y:light.y,z:light.depth}
        );
        const edgeAlpha=Math.min(1,(1-Math.sqrt(radialSq))*sampleRadius+0.5);
        const offset=(y*size+x)*4;
        image.data[offset]=Math.round(rgb.r*brightness);
        image.data[offset+1]=Math.round(rgb.g*brightness);
        image.data[offset+2]=Math.round(rgb.b*brightness);
        image.data[offset+3]=Math.round(255*edgeAlpha);
      }
    }
    spriteCtx.putImageData(image,0,0);
    litSphereCache.set(key,sprite);
    if(litSphereCache.size>256){
      litSphereCache.delete(litSphereCache.keys().next().value);
    }
    return sprite;
  }

  function drawLitSphere(body,pos,x,y,radius){
    const light=dominantLightBody(activeSystemBodies());
    const lightPosition=light && positionForBody(light,deps.clock.simDaysSinceJ2000);
    if(!lightPosition || light===body){
      ctx.fillStyle=body.color;
      ctx.beginPath();
      ctx.arc(x,y,radius,0,Math.PI*2);
      ctx.fill();
      return;
    }
    const worldLight=normalizeVector({
      x:lightPosition.x-pos.x,
      y:lightPosition.y-pos.y,
      z:lightPosition.z-pos.z
    });
    const basis=systemTextureViewBasis();
    const shadows=bodyShadowGeometry(
      body,pos,light,lightPosition,basis
    );
    if(drawBodyTexture(
      body,x,y,radius,ctx,
      textureViewVector(worldLight,basis),basis,shadows
    )) return;
    const sprite=litSphereSprite(body.color,radius,worldLight);
    ctx.drawImage(sprite,x-radius,y-radius,radius*2,radius*2);
  }

  function drawBodySphere(body,pos,x,y,radiusRendering){
    if(radiusRendering.scaleAccurate){
      drawLitSphere(body,pos,x,y,radiusRendering.radius);
      return;
    }
    ctx.beginPath();
    ctx.fillStyle=body.color;
    ctx.arc(x,y,radiusRendering.radius,0,Math.PI*2);
    ctx.fill();
  }

  function drawCustomStar(body,x,y,radius,scaleAccurate,context=ctx){
    const glowRadius=Math.max(radius*(scaleAccurate?3.2:2.2),12);
    const glow=context.createRadialGradient(x,y,radius*0.25,x,y,glowRadius);
    glow.addColorStop(0,hexToRgba(body.color,1));
    glow.addColorStop(0.35,hexToRgba(body.color,0.72));
    glow.addColorStop(1,hexToRgba(body.color,0));
    context.fillStyle=glow;
    context.beginPath();
    context.arc(x,y,glowRadius,0,Math.PI*2);
    context.fill();
    context.fillStyle='#fff4d8';
    context.beginPath();
    context.arc(x,y,radius,0,Math.PI*2);
    context.fill();
  }

  function drawCustomBlackHole(body,x,y,radius,context=ctx){
    context.fillStyle='#020307';
    context.beginPath();
    context.arc(x,y,radius,0,Math.PI*2);
    context.fill();
    context.strokeStyle=body.color;
    context.lineWidth=Math.max(1,Math.min(3,radius*0.16));
    context.beginPath();
    context.arc(x,y,radius*1.18,0,Math.PI*2);
    context.stroke();
  }

  function drawCustomCometTail(body,x,y,radius,sunX,sunY,context=ctx){
    const dx=x-sunX,dy=y-sunY;
    const length=Math.hypot(dx,dy)||1;
    const tailLength=Math.max(14,Math.min(100,radius*7));
    const endX=x+dx/length*tailLength;
    const endY=y+dy/length*tailLength;
    const tail=context.createLinearGradient(x,y,endX,endY);
    tail.addColorStop(0,hexToRgba(body.color,0.72));
    tail.addColorStop(1,hexToRgba(body.color,0));
    context.strokeStyle=tail;
    context.lineWidth=Math.max(2,radius*0.8);
    context.beginPath();
    context.moveTo(x,y);
    context.lineTo(endX,endY);
    context.stroke();
  }

  function drawCustomBody(body,pos,x,y,radiusRendering,sunScreen){
    const radius=radiusRendering.radius;
    if(body.appearance==='star'){
      drawCustomStar(body,x,y,radius,radiusRendering.scaleAccurate);
    } else if(body.appearance==='black-hole'){
      drawCustomBlackHole(body,x,y,radius);
    } else {
      if(body.appearance==='comet' && sunScreen){
        drawCustomCometTail(
          body,x,y,radius,sunScreen.x,sunScreen.y
        );
      }
      drawBodySphere(body,pos,x,y,radiusRendering);
    }
  }

  return {
    hexToRgba,
    observatoryTextureViewBasis,
    drawCustomStar,
    drawCustomBlackHole,
    drawCustomCometTail,
    drawBodyTexture,
    bodyShadowGeometry,
    textureViewVector,
    bodyRadiusRendering,
    systemTextureViewBasis,
    drawCustomBody,
    drawBodySphere
  };
});
