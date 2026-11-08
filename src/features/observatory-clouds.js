(function(root,factory){
  const api={create:factory};
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.SimSolarClouds=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(deps){
  'use strict';

  const {document,window}=deps;
  const {normalize:normalizeObservatoryVector,dot:observatoryDot}=window.ObservatoryMode;
  const {
    cloudWeatherRequest,cloudWeatherAt,fractalNoise3:observatoryCloudNoise,
    cloudAlpha:observatoryCloudAlpha,cloudSeed:observatoryCloudSeed,
    localSkyDirection:observatoryCloudSkyDirection,
    localSkyTextureCoordinates:observatoryCloudTextureCoordinates
  }=window.ObservatoryClouds;
  const {J2000,DEG}=deps.constants;
  const {ctx}=deps.viewport;

  let observatoryCloudsEnabled=false;
  let observatoryCloudData=null;
  let observatoryCloudRequestKey='';
  let observatoryCloudRequestTimer=null;
  let observatoryCloudRequestController=null;
  let observatoryCloudSynthesisTime=0;
  let observatoryCloudSynthesisKey='';
  let observatoryCloudProjectionKey='';
  let observatoryCloudStatusKey='';
  const observatoryCloudCache=new Map();
  const observatoryCloudSkyCanvas=document.createElement('canvas');
  const observatoryCloudSkyContext=observatoryCloudSkyCanvas.getContext('2d');
  const observatoryCloudCanvas=document.createElement('canvas');
  const observatoryCloudContext=observatoryCloudCanvas.getContext('2d');

  function setObservatoryCloudStatus(message,error=false){
    const status=document.getElementById('observatoryCloudStatus');
    status.textContent=message;
    status.classList.toggle('error',error);
  }

  function clearObservatoryCloudRequest(clearData=true){
    if(observatoryCloudRequestTimer!==null){
      clearTimeout(observatoryCloudRequestTimer);
      observatoryCloudRequestTimer=null;
    }
    observatoryCloudRequestController?.abort();
    observatoryCloudRequestController=null;
    observatoryCloudRequestKey='';
    if(clearData) observatoryCloudData=null;
    observatoryCloudSynthesisTime=0;
    observatoryCloudSynthesisKey='';
    observatoryCloudProjectionKey='';
    observatoryCloudStatusKey='';
  }

  function syncObservatoryCloudControls(){
    const earth=deps.observatory.isEarthObservatoryBody(deps.observatory.observatoryObserver);
    const checkbox=document.getElementById('observatoryClouds');
    checkbox.disabled=!earth;
    checkbox.checked=earth && observatoryCloudsEnabled;
    document.getElementById('observatoryCloudLabel').title=earth
      ? 'Uses Open-Meteo hourly cloud data for the simulation time.'
      : 'Cloud data is available only to Earth observers.';
    if(!earth){
      setObservatoryCloudStatus('Available on Earth only.');
    } else if(!observatoryCloudsEnabled){
      setObservatoryCloudStatus('');
    }
  }

  function scheduleObservatoryCloudRequest(){
    if(!observatoryCloudsEnabled ||
      !deps.observatory.isEarthObservatoryBody(deps.observatory.observatoryObserver)) return;
    const timestamp=J2000+deps.clock.simDaysSinceJ2000*86400000;
    const request=cloudWeatherRequest(
      timestamp,deps.observatory.observatoryLatitude,deps.observatory.observatoryLongitude
    );
    if(!request.supported){
      const key='unsupported:'+request.reason;
      if(observatoryCloudRequestKey!==key){
        clearObservatoryCloudRequest();
        observatoryCloudRequestKey=key;
        setObservatoryCloudStatus(request.reason,true);
      }
      return;
    }
    if(observatoryCloudData?.key===request.key ||
      observatoryCloudRequestKey===request.key) return;
    clearObservatoryCloudRequest();
    observatoryCloudRequestKey=request.key;
    const cached=observatoryCloudCache.get(request.key);
    if(cached){
      observatoryCloudData=cached;
      return;
    }
    setObservatoryCloudStatus('Loading '+request.source.toLowerCase()+'…');
    observatoryCloudRequestTimer=setTimeout(async()=>{
      observatoryCloudRequestTimer=null;
      const controller=new AbortController();
      observatoryCloudRequestController=controller;
      try{
        const response=await fetch(request.url,{signal:controller.signal});
        if(!response.ok){
          throw new Error('weather service returned HTTP '+response.status);
        }
        const payload=await response.json();
        if(!cloudWeatherAt(payload.hourly,timestamp)){
          throw new Error('weather service returned incomplete cloud data');
        }
        if(observatoryCloudRequestKey!==request.key) return;
        const data={
          key:request.key,source:request.source,date:request.date,
          hourly:payload.hourly
        };
        observatoryCloudCache.set(request.key,data);
        while(observatoryCloudCache.size>24){
          observatoryCloudCache.delete(observatoryCloudCache.keys().next().value);
        }
        observatoryCloudData=data;
        observatoryCloudSynthesisTime=0;
        observatoryCloudSynthesisKey='';
        observatoryCloudProjectionKey='';
        observatoryCloudStatusKey='';
      } catch(error){
        if(error.name==='AbortError' ||
          observatoryCloudRequestKey!==request.key) return;
        observatoryCloudData=null;
        observatoryCloudRequestKey='';
        setObservatoryCloudStatus(
          'Cloud data unavailable: '+error.message+'.',true
        );
      } finally {
        if(observatoryCloudRequestController===controller){
          observatoryCloudRequestController=null;
        }
      }
    },250);
  }

  function synthesizeObservatoryCloudSky(weather,timestamp){
    const width=384;
    const height=96;
    if(observatoryCloudSkyCanvas.width!==width ||
      observatoryCloudSkyCanvas.height!==height){
      observatoryCloudSkyCanvas.width=width;
      observatoryCloudSkyCanvas.height=height;
    }
    const image=observatoryCloudSkyContext.createImageData(width,height);
    const windAngle=weather.windDirection*DEG;
    const hoursIntoDay=(timestamp-Date.parse(
      observatoryCloudData.date+'T00:00:00Z'
    ))/3600000;
    const windDistance=hoursIntoDay*(0.0015+weather.windSpeed*0.00008);
    const layers=[
      {name:'high',cover:weather.high,frequency:36,opacity:0.56,speed:1.6},
      {name:'mid',cover:weather.mid,frequency:24,opacity:0.72,speed:1.0},
      {name:'low',cover:weather.low,frequency:15,opacity:0.94,speed:0.65}
    ];
    if(layers.every(layer=>layer.cover<0.5) && weather.total>=0.5){
      layers[1].cover=weather.total;
    }
    for(const layer of layers){
      layer.seed=observatoryCloudSeed(
        deps.observatory.observatoryLatitude,deps.observatory.observatoryLongitude,'sky-v1',layer.name
      );
    }
    for(let y=0;y<height;y++){
      for(let x=0;x<width;x++){
        const local=observatoryCloudSkyDirection(x,y,width,height);
        let transparency=1;
        for(const layer of layers){
          if(layer.cover<0.5) continue;
          const shift=windDistance*layer.speed;
          const noise=observatoryCloudNoise(
            local.east*layer.frequency+Math.sin(windAngle)*shift,
            local.north*layer.frequency+Math.cos(windAngle)*shift,
            local.up*layer.frequency+shift*0.17,
            layer.seed
          );
          transparency*=1-observatoryCloudAlpha(
            noise,layer.cover,layer.opacity
          );
        }
        const horizonFade=Math.min(1,Math.asin(local.up)/(3*DEG));
        const alpha=(1-transparency)*horizonFade;
        if(alpha<0.01) continue;
        const index=(y*width+x)*4;
        image.data[index]=255;
        image.data[index+1]=255;
        image.data[index+2]=255;
        image.data[index+3]=Math.round(alpha*255);
      }
    }
    observatoryCloudSkyContext.putImageData(image,0,0);
  }

  function projectObservatoryCloudSky(frame,camera,daylight){
    const scale=Math.max(1,Math.ceil(Math.max(deps.viewport.W,deps.viewport.H)/240));
    const width=Math.ceil(deps.viewport.W/scale);
    const height=Math.ceil(deps.viewport.H/scale);
    if(observatoryCloudCanvas.width!==width ||
      observatoryCloudCanvas.height!==height){
      observatoryCloudCanvas.width=width;
      observatoryCloudCanvas.height=height;
    }
    const source=observatoryCloudSkyContext.getImageData(
      0,0,observatoryCloudSkyCanvas.width,observatoryCloudSkyCanvas.height
    ).data;
    const image=observatoryCloudContext.createImageData(width,height);
    const focal=deps.viewport.H/(2*Math.tan(deps.observatory.observatoryFov/2));
    const cloudColor=Math.round(24+211*daylight);
    for(let y=0;y<height;y++){
      const vertical=(deps.viewport.H/2-(y+0.5)*scale)/focal;
      for(let x=0;x<width;x++){
        const horizontal=((x+0.5)*scale-deps.viewport.W/2)/focal;
        const direction=normalizeObservatoryVector({
          x:camera.forward.x+camera.right.x*horizontal+camera.up.x*vertical,
          y:camera.forward.y+camera.right.y*horizontal+camera.up.y*vertical,
          z:camera.forward.z+camera.right.z*horizontal+camera.up.z*vertical
        });
        const coordinates=observatoryCloudTextureCoordinates(
          observatoryDot(direction,frame.east),
          observatoryDot(direction,frame.north),
          observatoryDot(direction,frame.up),
          observatoryCloudSkyCanvas.width,observatoryCloudSkyCanvas.height
        );
        if(!coordinates) continue;
        const sourceIndex=(
          coordinates.y*observatoryCloudSkyCanvas.width+coordinates.x
        )*4;
        const alpha=source[sourceIndex+3];
        if(alpha<3) continue;
        const index=(y*width+x)*4;
        image.data[index]=cloudColor;
        image.data[index+1]=cloudColor;
        image.data[index+2]=Math.min(255,cloudColor+6);
        image.data[index+3]=alpha;
      }
    }
    observatoryCloudContext.putImageData(image,0,0);
  }

  function drawObservatoryClouds(frame,camera,daylight){
    if(!observatoryCloudsEnabled || deps.observatory.observatoryObserver?.name!=='Earth') return;
    scheduleObservatoryCloudRequest();
    if(!observatoryCloudData) return;
    const timestamp=J2000+deps.clock.simDaysSinceJ2000*86400000;
    const weather=cloudWeatherAt(observatoryCloudData.hourly,timestamp);
    if(!weather) return;
    const statusKey=[
      observatoryCloudData.key,Math.floor(timestamp/3600000),
      Math.round(weather.total),Math.round(weather.low),
      Math.round(weather.mid),Math.round(weather.high)
    ].join(':');
    if(statusKey!==observatoryCloudStatusKey){
      observatoryCloudStatusKey=statusKey;
      setObservatoryCloudStatus(
        observatoryCloudData.source+' · '+Math.round(weather.total)+
        '% total · L/M/H '+Math.round(weather.low)+'/'+
        Math.round(weather.mid)+'/'+Math.round(weather.high)+'%'
      );
    }
    const synthesisKey=[
      observatoryCloudData.key,Math.floor(timestamp/300000),
      Math.round(weather.total),Math.round(weather.low),
      Math.round(weather.mid),Math.round(weather.high),
      Math.round(weather.windSpeed),Math.round(weather.windDirection)
    ].join(':');
    const now=performance.now();
    if(
      synthesisKey!==observatoryCloudSynthesisKey &&
      (
        !observatoryCloudSynthesisTime ||
        now-observatoryCloudSynthesisTime>=250
      )
    ){
      synthesizeObservatoryCloudSky(weather,timestamp);
      observatoryCloudSynthesisKey=synthesisKey;
      observatoryCloudSynthesisTime=now;
      observatoryCloudProjectionKey='';
    }
    if(!observatoryCloudSynthesisKey) return;
    const projectionKey=[
      observatoryCloudSynthesisKey,deps.viewport.W,deps.viewport.H,
      deps.observatory.observatoryAzimuth.toFixed(6),deps.observatory.observatoryAltitude.toFixed(6),
      deps.observatory.observatoryFov.toFixed(7),Math.round(daylight*255)
    ].join(':');
    if(projectionKey!==observatoryCloudProjectionKey){
      projectObservatoryCloudSky(frame,camera,daylight);
      observatoryCloudProjectionKey=projectionKey;
    }
    ctx.save();
    ctx.imageSmoothingEnabled=true;
    ctx.drawImage(observatoryCloudCanvas,0,0,deps.viewport.W,deps.viewport.H);
    ctx.restore();
  }

  return {
    drawObservatoryClouds,
    clearObservatoryCloudRequest,
    get observatoryCloudsEnabled(){ return observatoryCloudsEnabled; },
    set observatoryCloudsEnabled(value){ observatoryCloudsEnabled=value; },
    syncObservatoryCloudControls,
    scheduleObservatoryCloudRequest
  };
});
