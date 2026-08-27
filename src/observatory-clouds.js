(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  root.ObservatoryClouds=api;
})(typeof globalThis!=='undefined' ? globalThis : this,function(){
  const DAY_MS=86400000;
  const EARLIEST_ARCHIVE=Date.UTC(1940,0,1);
  const ARCHIVE_DELAY_DAYS=5;
  const FORECAST_DAYS=16;
  const WEATHER_FIELDS=[
    'cloud_cover','cloud_cover_low','cloud_cover_mid','cloud_cover_high',
    'wind_speed_10m','wind_direction_10m'
  ];

  function clamp(value,min,max){
    return Math.max(min,Math.min(max,value));
  }

  function utcDate(timestamp){
    return new Date(timestamp).toISOString().slice(0,10);
  }

  function cloudWeatherRequest(timestamp,latitude,longitude,now=Date.now()){
    if(!Number.isFinite(timestamp) ||
      !Number.isFinite(latitude) || !Number.isFinite(longitude)){
      return {supported:false,reason:'Invalid observation time or location.'};
    }
    const today=Date.parse(utcDate(now)+'T00:00:00Z');
    if(timestamp<EARLIEST_ARCHIVE){
      return {supported:false,reason:'Historical cloud data begins in 1940.'};
    }
    if(timestamp>=today+(FORECAST_DAYS+1)*DAY_MS){
      return {
        supported:false,
        reason:'Cloud forecasts are available up to 16 days ahead.'
      };
    }
    const day=Date.parse(utcDate(timestamp)+'T00:00:00Z');
    const archive=day<today-ARCHIVE_DELAY_DAYS*DAY_MS;
    const endpoint=archive
      ? 'https://archive-api.open-meteo.com/v1/archive'
      : 'https://api.open-meteo.com/v1/forecast';
    const date=utcDate(timestamp);
    const params=new URLSearchParams({
      latitude:String(clamp(latitude,-90,90)),
      longitude:String(clamp(longitude,-180,180)),
      start_date:date,
      end_date:date,
      hourly:WEATHER_FIELDS.join(','),
      timezone:'GMT'
    });
    if(archive) params.set('models','era5');
    return {
      supported:true,
      source:archive?'Open-Meteo / ECMWF ERA5':'Open-Meteo forecast',
      date,
      key:[
        archive?'archive':'forecast',
        latitude.toFixed(3),longitude.toFixed(3),date
      ].join(':'),
      url:endpoint+'?'+params.toString()
    };
  }

  function weatherTime(value){
    if(typeof value!=='string') return NaN;
    return Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(value)?value:value+'Z');
  }

  function interpolateValue(values,index,fraction){
    const first=Number(values?.[index]);
    if(!Number.isFinite(first)) return 0;
    const second=Number(values?.[Math.min(index+1,values.length-1)]);
    return Number.isFinite(second)
      ? first+(second-first)*fraction
      : first;
  }

  function interpolateDirection(values,index,fraction){
    const first=Number(values?.[index]);
    if(!Number.isFinite(first)) return 0;
    const second=Number(values?.[Math.min(index+1,values.length-1)]);
    if(!Number.isFinite(second)) return (first%360+360)%360;
    const delta=((second-first+540)%360)-180;
    return (first+delta*fraction+360)%360;
  }

  function cloudWeatherAt(hourly,timestamp){
    const times=hourly?.time;
    if(!Array.isArray(times) || !times.length) return null;
    const parsed=times.map(weatherTime);
    if(parsed.some(value=>!Number.isFinite(value))) return null;
    let index=0;
    while(index<parsed.length-1 && parsed[index+1]<=timestamp) index++;
    const span=parsed[Math.min(index+1,parsed.length-1)]-parsed[index];
    const fraction=span>0
      ? clamp((timestamp-parsed[index])/span,0,1)
      : 0;
    return {
      total:clamp(interpolateValue(hourly.cloud_cover,index,fraction),0,100),
      low:clamp(interpolateValue(hourly.cloud_cover_low,index,fraction),0,100),
      mid:clamp(interpolateValue(hourly.cloud_cover_mid,index,fraction),0,100),
      high:clamp(interpolateValue(hourly.cloud_cover_high,index,fraction),0,100),
      windSpeed:Math.max(
        0,interpolateValue(hourly.wind_speed_10m,index,fraction)
      ),
      windDirection:interpolateDirection(
        hourly.wind_direction_10m,index,fraction
      )
    };
  }

  function hash3(x,y,z,seed){
    let value=Math.imul(x,374761393)+Math.imul(y,668265263)+
      Math.imul(z,2147483647)+Math.imul(seed,1274126177);
    value=Math.imul(value^(value>>>13),1274126177);
    return ((value^(value>>>16))>>>0)/4294967295;
  }

  function smooth(value){
    return value*value*(3-2*value);
  }

  function valueNoise3(x,y,z,seed){
    const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z);
    const fx=smooth(x-ix),fy=smooth(y-iy),fz=smooth(z-iz);
    const lerp=(a,b,t)=>a+(b-a)*t;
    const xy=(dz,dy)=>lerp(
      hash3(ix,iy+dy,iz+dz,seed),
      hash3(ix+1,iy+dy,iz+dz,seed),
      fx
    );
    return lerp(
      lerp(xy(0,0),xy(0,1),fy),
      lerp(xy(1,0),xy(1,1),fy),
      fz
    );
  }

  function fractalNoise3(x,y,z,seed){
    let value=0;
    let amplitude=0.57;
    let total=0;
    for(let octave=0;octave<4;octave++){
      value+=valueNoise3(x,y,z,seed+octave*1013)*amplitude;
      total+=amplitude;
      x=x*2.03+11.7;
      y=y*2.03-7.1;
      z=z*2.03+4.3;
      amplitude*=0.5;
    }
    return value/total;
  }

  function cloudAlpha(noise,cover,maxOpacity=0.92){
    const coverage=clamp(cover/100,0,1);
    if(coverage<=0) return 0;
    if(coverage>=1) return maxOpacity;
    const threshold=1-coverage;
    return clamp((noise-threshold)/0.16,0,1)*maxOpacity;
  }

  function cloudSeed(latitude,longitude,date,layer){
    const text=[
      Number(latitude).toFixed(2),Number(longitude).toFixed(2),date,layer
    ].join(':');
    let hash=2166136261;
    for(let index=0;index<text.length;index++){
      hash^=text.charCodeAt(index);
      hash=Math.imul(hash,16777619);
    }
    return hash|0;
  }

  function localSkyDirection(x,y,width,height){
    const azimuth=(x+0.5)/width*Math.PI*2-Math.PI;
    const altitude=(1-(y+0.5)/height)*Math.PI/2;
    const horizontal=Math.cos(altitude);
    return {
      east:Math.sin(azimuth)*horizontal,
      north:Math.cos(azimuth)*horizontal,
      up:Math.sin(altitude)
    };
  }

  function localSkyTextureCoordinates(east,north,up,width,height){
    if(!(up>0) || !(width>0) || !(height>0)) return null;
    const azimuth=Math.atan2(east,north);
    const altitude=Math.asin(clamp(up,-1,1));
    return {
      x:Math.min(
        width-1,
        Math.floor(((azimuth+Math.PI)/(Math.PI*2)%1)*width)
      ),
      y:Math.min(
        height-1,
        Math.floor((1-altitude/(Math.PI/2))*height)
      )
    };
  }

  return {
    DAY_MS,EARLIEST_ARCHIVE,ARCHIVE_DELAY_DAYS,FORECAST_DAYS,
    cloudWeatherRequest,cloudWeatherAt,
    valueNoise3,fractalNoise3,cloudAlpha,cloudSeed,
    localSkyDirection,localSkyTextureCoordinates
  };
});
