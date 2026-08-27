(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  root.BodyTextures=api;
})(typeof globalThis!=='undefined' ? globalThis : this,function(){
  const TWO_PI=Math.PI*2;
  const MIN_RADIUS_PX=7;
  const MAX_SAMPLE_RADIUS=256;
  const FRAMEBUFFER_SIZE=MAX_SAMPLE_RADIUS*2+2;
  const DEFINITIONS={
    Sun:{file:'sun.webp',rotationHours:609.12,tiltDeg:7.25,phaseDeg:0,emissive:true},
    Mercury:{file:'mercury.webp',rotationHours:1407.6,tiltDeg:0.034,phaseDeg:329.6},
    Venus:{file:'venus.webp',rotationHours:5832.5,tiltDeg:177.36,phaseDeg:160.2},
    Earth:{
      file:'earth.webp',cloudFile:'earth-clouds.webp',
      rotationHours:23.9345,cloudRotationHours:24.2,
      tiltDeg:23.44,phaseDeg:280.5
    },
    Mars:{file:'mars.webp',rotationHours:24.6229,tiltDeg:25.19,phaseDeg:176.6},
    Jupiter:{file:'jupiter.webp',rotationHours:9.925,tiltDeg:3.13,polarScale:0.935},
    Saturn:{file:'saturn.webp',rotationHours:10.656,tiltDeg:26.73,polarScale:0.902},
    Uranus:{file:'uranus.webp',rotationHours:17.24,tiltDeg:97.77,polarScale:0.977},
    Neptune:{file:'neptune.webp',rotationHours:16.11,tiltDeg:28.32,polarScale:0.983},
    Pluto:{file:'pluto.webp',rotationHours:153.2928,tiltDeg:122.53,phaseDeg:302.7},
    Charon:{file:'charon.webp',rotationHours:153.288,tiltDeg:122.5,phaseDeg:122},
    Moon:{file:'moon.webp',rotationHours:655.728,tiltDeg:6.68,phaseDeg:38.3},
    Phobos:{file:'phobos.webp',rotationHours:7.6538,tiltDeg:25.2,phaseDeg:35.1},
    Deimos:{file:'deimos.webp',rotationHours:30.312,tiltDeg:26,phaseDeg:79.4},
    Io:{file:'io.webp',rotationHours:42.4593,tiltDeg:3.1,phaseDeg:200},
    Europa:{file:'europa.webp',rotationHours:85.2283,tiltDeg:3.6,phaseDeg:80},
    Ganymede:{file:'ganymede.webp',rotationHours:171.709,tiltDeg:3.3,phaseDeg:300},
    Callisto:{file:'callisto.webp',rotationHours:400.536,tiltDeg:3.3,phaseDeg:20},
    Rhea:{file:'rhea.webp',rotationHours:108.437,tiltDeg:27,phaseDeg:90},
    Iapetus:{file:'iapetus.webp',rotationHours:1903.72,tiltDeg:15.5,phaseDeg:330},
    Titania:{file:'titania.webp',rotationHours:208.941,tiltDeg:97.8,phaseDeg:45},
    Oberon:{file:'oberon.webp',rotationHours:323.116,tiltDeg:97.9,phaseDeg:240},
    Triton:{file:'triton.webp',rotationHours:141.04,tiltDeg:129.6,phaseDeg:100}
  };

  function textureDefinition(name){
    const definition=DEFINITIONS[name];
    return definition ? {...definition} : null;
  }

  function rotationTurns(name,tDays){
    const definition=DEFINITIONS[name];
    if(!definition || !Number.isFinite(tDays)) return 0;
    const turns=tDays*24/definition.rotationHours;
    return ((turns%1)+1)%1;
  }

  function cloudOffsetTurns(name,tDays){
    const definition=DEFINITIONS[name];
    if(
      !definition?.cloudRotationHours ||
      !Number.isFinite(tDays)
    ) return 0;
    return tDays*24/definition.cloudRotationHours-
      tDays*24/definition.rotationHours;
  }

  function shouldUseTexture(name,radiusPx){
    return !!DEFINITIONS[name] && Number.isFinite(radiusPx) &&
      radiusPx>=MIN_RADIUS_PX;
  }

  function poleVector(name){
    const definition=DEFINITIONS[name];
    if(!definition) return null;
    const tilt=(definition.tiltDeg||0)*Math.PI/180;
    return {x:0,y:Math.sin(tilt),z:Math.cos(tilt)};
  }

  function dot(a,b){
    return a.x*b.x+a.y*b.y+a.z*b.z;
  }

  function scale(vector,factor){
    return {
      x:vector.x*factor,y:vector.y*factor,z:vector.z*factor
    };
  }

  function subtract(a,b){
    return {x:a.x-b.x,y:a.y-b.y,z:a.z-b.z};
  }

  function cross(a,b){
    return {
      x:a.y*b.z-a.z*b.y,
      y:a.z*b.x-a.x*b.z,
      z:a.x*b.y-a.y*b.x
    };
  }

  function normalize(vector){
    const length=Math.hypot(vector.x,vector.y,vector.z);
    return length>1e-12 ? scale(vector,1/length) : null;
  }

  function viewBasis(towardObserver,cameraRight,cameraUp){
    const toward=normalize(towardObserver);
    if(!toward) return null;
    let right=normalize(subtract(
      cameraRight,scale(toward,dot(cameraRight,toward))
    ));
    if(!right && cameraUp){
      right=normalize(cross(cameraUp,toward));
    }
    if(!right) return null;
    const up=normalize(cross(toward,right));
    return up ? {right,up,towardObserver:toward} : null;
  }

  function orientationMatrix(name,tDays,basis){
    const definition=DEFINITIONS[name];
    if(!definition || !basis) return null;
    const pole=poleVector(name);
    const equatorX={x:1,y:0,z:0};
    const equatorY={x:0,y:pole.z,z:-pole.y};
    const phase=(definition.phaseDeg||0)*Math.PI/180+
      rotationTurns(name,tDays)*TWO_PI;
    const prime={
      x:Math.cos(phase),
      y:equatorY.y*Math.sin(phase),
      z:equatorY.z*Math.sin(phase)
    };
    const east={
      x:-Math.sin(phase),
      y:equatorY.y*Math.cos(phase),
      z:equatorY.z*Math.cos(phase)
    };
    const columns=[basis.right,basis.up,basis.towardObserver];
    const values=[];
    for(const axis of columns){
      values.push(dot(axis,prime),dot(axis,east),dot(axis,pole));
    }
    return values;
  }

  function compileShader(gl,type,source){
    const shader=gl.createShader(type);
    gl.shaderSource(shader,source);
    gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){
      const message=gl.getShaderInfoLog(shader)||'Unknown shader error';
      gl.deleteShader(shader);
      throw new Error(message);
    }
    return shader;
  }

  function createProgram(gl){
    const vertex=compileShader(gl,gl.VERTEX_SHADER,
      'attribute vec2 aPosition;\n'+
      'varying vec2 vUv;\n'+
      'void main(){\n'+
      '  vUv=(aPosition+1.0)*0.5;\n'+
      '  gl_Position=vec4(aPosition,0.0,1.0);\n'+
      '}'
    );
    const fragment=compileShader(gl,gl.FRAGMENT_SHADER,
      'precision highp float;\n'+
      'varying vec2 vUv;\n'+
      'uniform sampler2D uTexture;\n'+
      'uniform sampler2D uCloudTexture;\n'+
      'uniform vec3 uLightPosition;\n'+
      'uniform float uLightRadius;\n'+
      'uniform vec4 uOccluders[8];\n'+
      'uniform float uOccluderCount;\n'+
      'uniform float uCloudMix;\n'+
      'uniform float uCloudOffset;\n'+
      'uniform mat3 uOrientation;\n'+
      'uniform float uPolarScale;\n'+
      'uniform float uAmbient;\n'+
      'uniform float uEdge;\n'+
      'const float PI=3.141592653589793;\n'+
      'void main(){\n'+
      '  vec2 screenPoint=vec2(vUv.x*2.0-1.0,vUv.y*2.0-1.0);\n'+
      '  vec2 point=vec2(screenPoint.x,screenPoint.y/uPolarScale);\n'+
      '  float radialSq=dot(point,point);\n'+
      '  if(radialSq>=1.0) discard;\n'+
      '  float z=sqrt(1.0-radialSq);\n'+
      '  vec3 bodyNormal=normalize(uOrientation*vec3(point,z));\n'+
      '  float longitude=atan(bodyNormal.y,bodyNormal.x)/(2.0*PI);\n'+
      '  float latitude=asin(clamp(bodyNormal.z,-1.0,1.0))/PI;\n'+
      '  vec2 textureUv=vec2(\n'+
      '    fract(0.5+longitude),\n'+
      '    0.5+latitude\n'+
      '  );\n'+
      '  vec4 surface=texture2D(uTexture,textureUv);\n'+
      '  vec3 cloudSample=texture2D(\n'+
      '    uCloudTexture,vec2(fract(textureUv.x+uCloudOffset),textureUv.y)\n'+
      '  ).rgb;\n'+
      '  float cloud=uCloudMix*max(cloudSample.r,max(cloudSample.g,cloudSample.b));\n'+
      '  surface.rgb=mix(surface.rgb,vec3(0.95,0.98,1.0),cloud*0.82);\n'+
      '  vec3 normal=normalize(vec3(screenPoint.x,screenPoint.y,z));\n'+
      '  vec3 toLight=uLightPosition-vec3(screenPoint.x,screenPoint.y,z);\n'+
      '  float lightDistance=length(toLight);\n'+
      '  vec3 lightDirection=toLight/lightDistance;\n'+
      '  float diffuse=max(0.0,dot(normal,lightDirection));\n'+
      '  float brightness=uAmbient+(1.0-uAmbient)*diffuse;\n'+
      '  float shadow=0.0;\n'+
      '  for(int index=0;index<8;index++){\n'+
      '    if(float(index)>=uOccluderCount) continue;\n'+
      '    vec4 occluder=uOccluders[index];\n'+
      '    vec3 toOccluder=occluder.xyz-vec3(screenPoint.x,screenPoint.y,z);\n'+
      '    float along=dot(toOccluder,lightDirection);\n'+
      '    if(along<=0.0 || along>=lightDistance) continue;\n'+
      '    float separation=length(toOccluder-lightDirection*along);\n'+
      '    float lightCone=max(0.000001,uLightRadius*along/lightDistance);\n'+
      '    float outer=occluder.w+lightCone;\n'+
      '    float inner=abs(occluder.w-lightCone);\n'+
      '    float overlap=1.0-smoothstep(inner,outer,separation);\n'+
      '    float maximum=occluder.w>=lightCone\n'+
      '      ? 1.0\n'+
      '      : min(1.0,occluder.w*occluder.w/(lightCone*lightCone));\n'+
      '    shadow=max(shadow,overlap*maximum);\n'+
      '  }\n'+
      '  brightness=max(uAmbient,brightness*(1.0-shadow*0.98));\n'+
      '  float alpha=smoothstep(0.0,uEdge,1.0-radialSq);\n'+
      '  gl_FragColor=vec4(surface.rgb*brightness,surface.a*alpha);\n'+
      '}'
    );
    const program=gl.createProgram();
    gl.attachShader(program,vertex);
    gl.attachShader(program,fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS)){
      throw new Error(gl.getProgramInfoLog(program)||'Unable to link shaders');
    }
    return program;
  }

  function createRenderer(options){
    options=options||{};
    if(typeof document==='undefined' || typeof Image==='undefined') return null;
    const canvas=document.createElement('canvas');
    canvas.width=FRAMEBUFFER_SIZE;
    canvas.height=FRAMEBUFFER_SIZE;
    const gl=canvas.getContext('webgl',{
      alpha:true,antialias:true,premultipliedAlpha:true,
      preserveDrawingBuffer:true
    });
    if(!gl) return null;

    let program;
    try {
      program=createProgram(gl);
    } catch(error){
      console.warn('Planet texture renderer unavailable:',error);
      return null;
    }
    const buffer=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),
      gl.STATIC_DRAW
    );
    const positionLocation=gl.getAttribLocation(program,'aPosition');
    const uniforms={
      texture:gl.getUniformLocation(program,'uTexture'),
      cloudTexture:gl.getUniformLocation(program,'uCloudTexture'),
      lightPosition:gl.getUniformLocation(program,'uLightPosition'),
      lightRadius:gl.getUniformLocation(program,'uLightRadius'),
      occluders:gl.getUniformLocation(program,'uOccluders[0]'),
      occluderCount:gl.getUniformLocation(program,'uOccluderCount'),
      cloudMix:gl.getUniformLocation(program,'uCloudMix'),
      cloudOffset:gl.getUniformLocation(program,'uCloudOffset'),
      orientation:gl.getUniformLocation(program,'uOrientation'),
      polarScale:gl.getUniformLocation(program,'uPolarScale'),
      ambient:gl.getUniformLocation(program,'uAmbient'),
      edge:gl.getUniformLocation(program,'uEdge')
    };
    const states=new Map();
    const basePath=options.basePath||'assets/textures/';

    function startLoad(name,definition){
      const state={
        status:'loading',image:null,texture:null,
        cloudStatus:definition.cloudFile?'loading':'none',
        cloudImage:null,cloudTexture:null
      };
      states.set(name,state);
      const image=new Image();
      image.decoding='async';
      image.addEventListener('load',()=>{
        state.status='ready';
        state.image=image;
        if(typeof options.onReady==='function') options.onReady(name);
      },{once:true});
      image.addEventListener('error',()=>{
        state.status='failed';
        console.warn('Unable to load texture for '+name+'.');
      },{once:true});
      image.src=basePath+definition.file;
      if(definition.cloudFile){
        const cloudImage=new Image();
        cloudImage.decoding='async';
        cloudImage.addEventListener('load',()=>{
          state.cloudStatus='ready';
          state.cloudImage=cloudImage;
          if(typeof options.onReady==='function') options.onReady(name);
        },{once:true});
        cloudImage.addEventListener('error',()=>{
          state.cloudStatus='failed';
          console.warn('Unable to load cloud texture for '+name+'.');
        },{once:true});
        cloudImage.src=basePath+definition.cloudFile;
      }
      return state;
    }

    function ensureTexture(state,imageKey,textureKey){
      if(state[textureKey]) return state[textureKey];
      try {
        const texture=gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D,texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
        gl.texImage2D(
          gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,state[imageKey]
        );
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        state[textureKey]=texture;
        return texture;
      } catch(error){
        if(imageKey==='image') state.status='failed';
        else state.cloudStatus='failed';
        console.warn('Unable to upload planetary texture:',error);
        return null;
      }
    }

    function draw(name,targetContext,x,y,radius,renderOptions){
      if(!shouldUseTexture(name,radius)) return false;
      const definition=DEFINITIONS[name];
      let state=states.get(name);
      if(!state) state=startLoad(name,definition);
      if(state.status!=='ready') return false;
      renderOptions=renderOptions||{};
      const sampleRadius=Math.max(
        8,Math.min(
          MAX_SAMPLE_RADIUS,
          Math.ceil(radius*(definition.polarScale||1))
        )
      );
      const size=sampleRadius*2+2;
      gl.viewport(0,0,size,size);
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(0,0,size,size);
      gl.clearColor(0,0,0,0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation,2,gl.FLOAT,false,0,0);
      gl.activeTexture(gl.TEXTURE0);
      const texture=ensureTexture(state,'image','texture');
      if(!texture) return false;
      gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.activeTexture(gl.TEXTURE1);
      const cloudTexture=state.cloudStatus==='ready'
        ? ensureTexture(state,'cloudImage','cloudTexture')
        : null;
      gl.bindTexture(gl.TEXTURE_2D,cloudTexture||texture);
      const light=renderOptions.light||{x:-0.5,y:-0.4,z:0.7};
      const lightPosition=renderOptions.lightPosition||{
        x:light.x*1e6,y:light.y*1e6,z:light.z*1e6
      };
      const orientation=renderOptions.orientation||[1,0,0,0,1,0,0,0,1];
      gl.uniform1i(uniforms.texture,0);
      gl.uniform1i(uniforms.cloudTexture,1);
      gl.uniform3f(
        uniforms.lightPosition,
        lightPosition.x,lightPosition.y,lightPosition.z
      );
      gl.uniform1f(uniforms.lightRadius,renderOptions.lightRadius||0);
      const occluders=(renderOptions.occluders||[]).slice(0,8);
      const packedOccluders=new Float32Array(32);
      occluders.forEach((occluder,index)=>{
        packedOccluders.set(
          [occluder.x,occluder.y,occluder.z,occluder.radius],
          index*4
        );
      });
      gl.uniform4fv(uniforms.occluders,packedOccluders);
      gl.uniform1f(uniforms.occluderCount,occluders.length);
      gl.uniform1f(uniforms.cloudMix,cloudTexture?1:0);
      gl.uniform1f(
        uniforms.cloudOffset,
        cloudOffsetTurns(name,renderOptions.tDays||0)
      );
      gl.uniformMatrix3fv(uniforms.orientation,false,orientation);
      gl.uniform1f(uniforms.polarScale,definition.polarScale||1);
      gl.uniform1f(uniforms.ambient,definition.emissive?1:0.08);
      gl.uniform1f(uniforms.edge,Math.max(0.002,2/sampleRadius));
      gl.drawArrays(gl.TRIANGLES,0,6);
      const polarScale=definition.polarScale||1;
      targetContext.drawImage(
        canvas,
        0,FRAMEBUFFER_SIZE-size,size,size,
        x-radius-1,y-radius*polarScale-1,
        radius*2+2,radius*polarScale*2+2
      );
      return true;
    }

    return {draw,states};
  }

  return {
    TWO_PI,MIN_RADIUS_PX,MAX_SAMPLE_RADIUS,FRAMEBUFFER_SIZE,
    DEFINITIONS,textureDefinition,rotationTurns,
    cloudOffsetTurns,
    shouldUseTexture,poleVector,viewBasis,orientationMatrix,createRenderer
  };
});
