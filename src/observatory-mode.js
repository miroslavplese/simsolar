(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  root.ObservatoryMode=api;
})(typeof globalThis!=='undefined' ? globalThis : this,function(){
  const DEG=Math.PI/180;
  const TWO_PI=Math.PI*2;
  const TELESCOPE_MIN_FOV=0.05*DEG;
  const TELESCOPE_MAX_FOV=10*DEG;

  const SURFACES={
    Mercury:{rotationHours:1407.6,tiltDeg:0.034,phaseDeg:329.6,ground:'#625d58'},
    Venus:{rotationHours:5832.5,tiltDeg:177.36,phaseDeg:160.2,ground:'#765b38',atmosphere:'#d99b55',atmosphereDensity:1},
    Earth:{rotationHours:23.9345,tiltDeg:23.44,phaseDeg:280.5,ground:'#1d342e',atmosphere:'#4d8ed8',atmosphereDensity:0.9},
    Mars:{rotationHours:24.6229,tiltDeg:25.19,phaseDeg:176.6,ground:'#6a3525',atmosphere:'#b46d4a',atmosphereDensity:0.35},
    Pluto:{rotationHours:153.2928,tiltDeg:122.53,phaseDeg:302.7,ground:'#62584f',atmosphere:'#6685a0',atmosphereDensity:0.08},
    Moon:{rotationHours:655.728,tiltDeg:6.68,phaseDeg:38.3,ground:'#55545a'},
    Phobos:{rotationHours:7.6538,tiltDeg:25.2,phaseDeg:35.1,ground:'#51483f'},
    Deimos:{rotationHours:30.312,tiltDeg:26.0,phaseDeg:79.4,ground:'#5d554b'},
    Io:{rotationHours:42.4593,tiltDeg:3.1,phaseDeg:200,ground:'#75682f'},
    Europa:{rotationHours:85.2283,tiltDeg:3.6,phaseDeg:80,ground:'#69645c'},
    Ganymede:{rotationHours:171.709,tiltDeg:3.3,phaseDeg:300,ground:'#514b45'},
    Callisto:{rotationHours:400.536,tiltDeg:3.3,phaseDeg:20,ground:'#3e3b39'},
    Rhea:{rotationHours:108.437,tiltDeg:27.0,phaseDeg:90,ground:'#666664'},
    Titan:{rotationHours:382.69,tiltDeg:27.0,phaseDeg:220,ground:'#654d2f',atmosphere:'#b47a34',atmosphereDensity:0.75},
    Iapetus:{rotationHours:1903.72,tiltDeg:15.5,phaseDeg:330,ground:'#524f4a'},
    Titania:{rotationHours:208.941,tiltDeg:97.8,phaseDeg:45,ground:'#596065'},
    Oberon:{rotationHours:323.116,tiltDeg:97.9,phaseDeg:240,ground:'#494c50'},
    Triton:{rotationHours:141.04,tiltDeg:129.6,phaseDeg:100,ground:'#5d5858',atmosphere:'#647a91',atmosphereDensity:0.06},
    Charon:{rotationHours:153.288,tiltDeg:122.5,phaseDeg:122,ground:'#55565b'}
  };

  const LOCATION_PRESETS={
    Earth:[
      {name:'Auckland',latitude:-36.8509,longitude:174.7645,timeZone:'Pacific/Auckland'},
      {name:'Bangkok',latitude:13.7563,longitude:100.5018,timeZone:'Asia/Bangkok'},
      {name:'Beijing',latitude:39.9042,longitude:116.4074,timeZone:'Asia/Shanghai'},
      {name:'Belgrade',latitude:44.7866,longitude:20.4489,timeZone:'Europe/Belgrade'},
      {name:'Berlin',latitude:52.52,longitude:13.405,timeZone:'Europe/Berlin'},
      {name:'Buenos Aires',latitude:-34.6037,longitude:-58.3816,timeZone:'America/Argentina/Buenos_Aires'},
      {name:'Cairo',latitude:30.0444,longitude:31.2357,timeZone:'Africa/Cairo'},
      {name:'Cape Town',latitude:-33.9249,longitude:18.4241,timeZone:'Africa/Johannesburg'},
      {name:'Chicago',latitude:41.8781,longitude:-87.6298,timeZone:'America/Chicago'},
      {name:'Delhi',latitude:28.6139,longitude:77.209,timeZone:'Asia/Kolkata'},
      {name:'Denver',latitude:39.7392,longitude:-104.9903,timeZone:'America/Denver'},
      {name:'Dubai',latitude:25.2048,longitude:55.2708,timeZone:'Asia/Dubai'},
      {name:'Greenwich',latitude:51.4779,longitude:0,timeZone:'Europe/London'},
      {name:'Hong Kong',latitude:22.3193,longitude:114.1694,timeZone:'Asia/Hong_Kong'},
      {name:'Honolulu',latitude:21.3099,longitude:-157.8581,timeZone:'Pacific/Honolulu'},
      {name:'Istanbul',latitude:41.0082,longitude:28.9784,timeZone:'Europe/Istanbul'},
      {name:'Lagos',latitude:6.5244,longitude:3.3792,timeZone:'Africa/Lagos'},
      {name:'London',latitude:51.5074,longitude:-0.1278,timeZone:'Europe/London'},
      {name:'Los Angeles',latitude:34.0522,longitude:-118.2437,timeZone:'America/Los_Angeles'},
      {name:'Madrid',latitude:40.4168,longitude:-3.7038,timeZone:'Europe/Madrid'},
      {name:'Melbourne',latitude:-37.8136,longitude:144.9631,timeZone:'Australia/Melbourne'},
      {name:'Mexico City',latitude:19.4326,longitude:-99.1332,timeZone:'America/Mexico_City'},
      {name:'Moscow',latitude:55.7558,longitude:37.6173,timeZone:'Europe/Moscow'},
      {name:'Mumbai',latitude:19.076,longitude:72.8777,timeZone:'Asia/Kolkata'},
      {name:'Nairobi',latitude:-1.2921,longitude:36.8219,timeZone:'Africa/Nairobi'},
      {name:'New York',latitude:40.7128,longitude:-74.006,timeZone:'America/New_York'},
      {name:'Paris',latitude:48.8566,longitude:2.3522,timeZone:'Europe/Paris'},
      {name:'Rio de Janeiro',latitude:-22.9068,longitude:-43.1729,timeZone:'America/Sao_Paulo'},
      {name:'Rome',latitude:41.9028,longitude:12.4964,timeZone:'Europe/Rome'},
      {name:'San Francisco',latitude:37.7749,longitude:-122.4194,timeZone:'America/Los_Angeles'},
      {name:'São Paulo',latitude:-23.5505,longitude:-46.6333,timeZone:'America/Sao_Paulo'},
      {name:'Seattle',latitude:47.6062,longitude:-122.3321,timeZone:'America/Los_Angeles'},
      {name:'Seoul',latitude:37.5665,longitude:126.978,timeZone:'Asia/Seoul'},
      {name:'Singapore',latitude:1.3521,longitude:103.8198,timeZone:'Asia/Singapore'},
      {name:'Sydney',latitude:-33.8688,longitude:151.2093,timeZone:'Australia/Sydney'},
      {name:'Tokyo',latitude:35.6762,longitude:139.6503,timeZone:'Asia/Tokyo'},
      {name:'Toronto',latitude:43.6532,longitude:-79.3832,timeZone:'America/Toronto'}
    ],
    Moon:[
      {name:'Near side',latitude:0,longitude:0},
      {name:'Apollo 11',latitude:0.6741,longitude:23.4729},
      {name:'South pole',latitude:-89.9,longitude:0}
    ],
    Mars:[
      {name:'Gale Crater',latitude:-5.4,longitude:137.8},
      {name:'Jezero Crater',latitude:18.38,longitude:77.58},
      {name:'Olympus Mons',latitude:18.65,longitude:-133.8}
    ]
  };

  function add(a,b){
    return {x:a.x+b.x,y:a.y+b.y,z:a.z+b.z};
  }

  function scale(vector,factor){
    return {x:vector.x*factor,y:vector.y*factor,z:vector.z*factor};
  }

  function dot(a,b){
    return a.x*b.x+a.y*b.y+a.z*b.z;
  }

  function cross(a,b){
    return {
      x:a.y*b.z-a.z*b.y,
      y:a.z*b.x-a.x*b.z,
      z:a.x*b.y-a.y*b.x
    };
  }

  function normalize(vector){
    const magnitude=Math.hypot(vector.x,vector.y,vector.z);
    if(!(magnitude>0)) throw new RangeError('Cannot normalize a zero vector.');
    return scale(vector,1/magnitude);
  }

  function wrapRadians(angle){
    angle%=TWO_PI;
    return angle<0 ? angle+TWO_PI : angle;
  }

  function surfaceDefinition(name){
    return SURFACES[name]||null;
  }

  function surfaceDefinitionForBody(body){
    if(!body) return null;
    if(body.kind==='custom'){
      if(body.appearance!=='planet' || !(body.radius>0)) return null;
      return {
        rotationHours:24,
        tiltDeg:0,
        phaseDeg:0,
        ground:body.color||'#38465a'
      };
    }
    return surfaceDefinition(body.name);
  }

  function locationPresets(name){
    return LOCATION_PRESETS[name]||[
      {name:'Prime meridian',latitude:0,longitude:0},
      {name:'Equator 90° E',latitude:0,longitude:90},
      {name:'North polar region',latitude:80,longitude:0}
    ];
  }

  function locationPresetsForBody(body){
    return locationPresets(body?.kind==='custom' ? '' : body?.name);
  }

  function surfaceFrame(definition,tDays,latitudeDeg,longitudeDeg){
    if(!definition) throw new TypeError('A surface definition is required.');
    const latitude=Math.max(-90,Math.min(90,latitudeDeg))*DEG;
    const tilt=definition.tiltDeg*DEG;
    const pole=normalize({x:0,y:Math.sin(tilt),z:Math.cos(tilt)});
    const equatorX={x:1,y:0,z:0};
    const equatorY=normalize(cross(pole,equatorX));
    const rotation=wrapRadians(
      definition.phaseDeg*DEG+
      tDays*24/definition.rotationHours*TWO_PI+
      longitudeDeg*DEG
    );
    const radial=add(
      scale(equatorX,Math.cos(rotation)),
      scale(equatorY,Math.sin(rotation))
    );
    const east=normalize(add(
      scale(equatorX,-Math.sin(rotation)),
      scale(equatorY,Math.cos(rotation))
    ));
    const up=normalize(add(
      scale(radial,Math.cos(latitude)),
      scale(pole,Math.sin(latitude))
    ));
    const north=normalize(cross(up,east));
    return {east,north,up,pole};
  }

  function horizontalDirection(frame,azimuth,altitude){
    const horizontal=add(
      scale(frame.north,Math.cos(azimuth)),
      scale(frame.east,Math.sin(azimuth))
    );
    return normalize(add(
      scale(horizontal,Math.cos(altitude)),
      scale(frame.up,Math.sin(altitude))
    ));
  }

  function cameraFrame(frame,azimuth,altitude){
    const forward=horizontalDirection(frame,azimuth,altitude);
    const right=normalize(add(
      scale(frame.east,Math.cos(azimuth)),
      scale(frame.north,-Math.sin(azimuth))
    ));
    const up=normalize(cross(right,forward));
    return {forward,right,up};
  }

  function projectDirection(direction,camera,width,height,verticalFov){
    const normalized=normalize(direction);
    const depth=dot(normalized,camera.forward);
    if(depth<=1e-8) return null;
    const focal=height/(2*Math.tan(verticalFov/2));
    return {
      x:width/2+dot(normalized,camera.right)/depth*focal,
      y:height/2-dot(normalized,camera.up)/depth*focal,
      depth,focal
    };
  }

  function altitudeForDirection(direction,frame){
    return Math.asin(Math.max(-1,Math.min(1,dot(normalize(direction),frame.up))));
  }

  function horizontalCoordinates(direction,frame){
    const normalized=normalize(direction);
    return {
      azimuth:wrapRadians(Math.atan2(
        dot(normalized,frame.east),dot(normalized,frame.north)
      )),
      altitude:altitudeForDirection(normalized,frame)
    };
  }

  function angularRadius(radiusAu,distanceAu){
    if(!(radiusAu>0) || !(distanceAu>radiusAu)) return 0;
    return Math.asin(Math.min(1,radiusAu/distanceAu));
  }

  function daylightFactor(sunAltitude,atmosphereDensity){
    if(!(atmosphereDensity>0)) return 0;
    const twilight=(sunAltitude+12*DEG)/(18*DEG);
    return Math.max(0,Math.min(1,twilight))*atmosphereDensity;
  }

  function telescopeFovFromSlider(value){
    if(!Number.isFinite(value)) return 2*DEG;
    const degrees=10**value;
    return Math.max(
      TELESCOPE_MIN_FOV,
      Math.min(TELESCOPE_MAX_FOV,degrees*DEG)
    );
  }

  function telescopeSliderFromFov(fov){
    const clamped=Math.max(
      TELESCOPE_MIN_FOV,
      Math.min(TELESCOPE_MAX_FOV,Number.isFinite(fov)?fov:2*DEG)
    );
    return Math.log10(clamped/DEG);
  }

  function telescopeMagnification(fov){
    if(!(fov>0)) return 1;
    return 70*DEG/fov;
  }

  function collapsedSatelliteLabels(entries,projectEntry,thresholdPixels=46){
    const byName=new Map(entries.map(entry=>[entry.body.name,entry]));
    const hidden=new Set();
    for(const entry of entries){
      const parentName=entry.body.parentName;
      if(!parentName) continue;
      const parent=byName.get(parentName);
      if(!parent) continue;
      const satellitePoint=projectEntry(entry);
      const parentPoint=projectEntry(parent);
      if(!satellitePoint || !parentPoint) continue;
      if(Math.hypot(
        satellitePoint.x-parentPoint.x,
        satellitePoint.y-parentPoint.y
      )<thresholdPixels){
        hidden.add(entry.body);
      }
    }
    return hidden;
  }

  return {
    DEG,SURFACES,surfaceDefinition,surfaceDefinitionForBody,
    locationPresets,locationPresetsForBody,surfaceFrame,
    horizontalDirection,horizontalCoordinates,cameraFrame,projectDirection,
    altitudeForDirection,angularRadius,daylightFactor,
    TELESCOPE_MIN_FOV,TELESCOPE_MAX_FOV,
    telescopeFovFromSlider,telescopeSliderFromFov,telescopeMagnification,
    collapsedSatelliteLabels,normalize,dot
  };
});
