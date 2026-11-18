/* Local tangent-plane landscape in metres, sharing the studio's viewpoint.
   Draw it before the room with its own depth range for kilometre-scale relief. */
function createLakeLandscape(gl, mesh, light, requestRender) {
  const derivatives=gl.getExtension('OES_standard_derivatives');
  const vertexSource = `
    attribute vec3 position, tint;
    attribute float surface;
    uniform mat4 projection;
    varying vec3 world, color;
    varying vec2 landUV;
    varying vec2 canopyUV;
    uniform vec2 tileOrigin;
    varying float kind;
    void main(){
      world=position; color=tint; kind=surface;
      canopyUV=vec2(0.);
      if(surface>=8.){
        float species=floor((surface-8.)*.25),corner=mod(surface,4.);
        vec2 xy=vec2(step(.5,corner)*(1.-step(2.5,corner)),1.-step(1.5,corner));
        canopyUV=(vec2(mod(species,4.),floor(species*.25))+.006+.988*xy)/vec2(4.,2.);
        kind=8.;
      }
      // Same tangent plane as the DEM mesh, projected into the north-up photo mosaic.
      float east=dot(position.xz,vec2(-.21491,-.97663));
      float north=dot(position.xz,vec2(-.97663,.21491));
      float dLat=radians(north/111132.);
      float lat=radians(35.5125667);
      landUV=tileOrigin+vec2(east/(111320.*cos(lat))*1024./360.,
        -dLat*(1.+.5*tan(lat)*dLat)/cos(lat)*1024./6.2831853);
      gl_Position=projection*vec4(position,1.);
      gl_Position.z=1.000014*gl_Position.w-1.40;
    }`;
  const waterAndSky=`
    uniform vec3 sun;
    uniform vec2 resolution;
    uniform float waterTime,hasMirror,waterBlur;
    uniform sampler2D skyMap,reflectionMap;
    const float pi=3.14159265;
    vec3 sky(vec3 dir){
      float az=atan(dir.z,dir.x)-atan(sun.z,sun.x);
      return texture2D(skyMap,vec2(fract(.5+az/(2.*pi)),1.-asin(clamp(dir.y,0.,1.))/(.5*pi))).rgb;
    }
    float hash(vec2 p){return fract(sin(dot(mod(p,291.),vec2(127.1,311.7)))*4375.5453);}
    float noise(vec2 p){
      vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
      return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);
    }
    vec3 lakeWater(vec3 world,vec3 direction,float dist,float sunlit){
      vec2 screen=gl_FragCoord.xy/resolution,p=world.xz;
      float time=waterTime;
      float wind=noise(p*vec2(.020,.034)-vec2(.028,.011)*time);
      float swell=noise(p*.042-vec2(.031,-.019)*time);
      float fine=1.-smoothstep(85.,650.,dist);
      float middle=1.-smoothstep(300.,1800.,dist);
      float a=dot(p,vec2(.34,.16))+3.8*swell-.81*time;
      float b=dot(p,vec2(.62,-.25))+4.2*wind-1.12*time;
      float c=dot(p,vec2(.095,.054))+4.1*swell-.42*time;
      float sx=(.36*cos(c)+middle*.46*cos(a)+fine*.32*cos(b))*(.34+.66*wind);
      float sz=(noise(p*.074-vec2(.065,.036)*time)-.5)*.84+fine*.26*sin(b);
      vec3 n=normalize(vec3(.050*sx,1.,.048*sz));
      vec3 reflected=reflect(direction,n);
      vec2 offset=vec2(sz*.0025,(sx*.010+sz*.006))*(.40+.60*middle);
      vec2 uv=clamp(screen+offset/(1.+.10*waterBlur),vec2(.002),vec2(.998));
      vec2 blur=vec2(1.7/resolution.x,.0015+.003*wind);
      vec3 image=.5*texture2D(reflectionMap,uv).rgb+
        .25*(texture2D(reflectionMap,clamp(uv+blur,0.,1.)).rgb+texture2D(reflectionMap,clamp(uv-blur,0.,1.)).rgb);
      if(waterBlur>.55){
        vec3 sum=image;
        for(int i=0;i<12;i++){
          float k=float(i)+.5;
          vec2 disk=sqrt(k/12.)*vec2(cos(k*2.399963),sin(k*2.399963));
          sum+=texture2D(reflectionMap,clamp(uv+disk*waterBlur/resolution,0.,1.)).rgb;
        }
        image=sum/13.;
      }
      image=mix(sky(reflected),image,hasMirror);
      float fresnel=.020+.98*pow(1.-clamp(dot(-direction,n),0.,1.),5.);
      float glitter=pow(max(dot(reflected,sun),0.),1320.);
      return mix(vec3(.17,.223,.233),image*vec3(.88,.92,.94),.33+.48*fresnel)+
        sunlit*glitter*vec3(.59,.36,.18)*(.24+.52*wind);
    }`;
  const fragmentSource=(derivatives?'#extension GL_OES_standard_derivatives : enable\n#define FACE_NORMAL\n':'')+`precision highp float;
    varying vec3 world,color;
    varying vec2 landUV;
    varying vec2 canopyUV;
    varying float kind;
    uniform vec3 eye;
    uniform vec2 tileOrigin;
    uniform float mirror,waterHeight,maskWater;
    uniform bool movingView;
    uniform sampler2D terrainMap,fujiMap,sunMask,canopyMap;
    uniform vec3 fujiUV;
    ${waterAndSky}
    // Integrate only to the first solid hit. The same volumes are visible in
    // the reflected pass, including their occlusion by the actual mountain.
    vec4 mistAlong(vec3 ray,float distance){
      float tau=0.,glow=pow(max(dot(ray,sun),0.),2.);
      vec3 shoreLight=mix(vec3(.72,.73,.76),vec3(.89,.78,.68),glow);
      float endT=min(distance,3400.),startT=130.;
      if(abs(ray.y)>.0001){
        float lo=(waterHeight-.5-eye.y)/ray.y,hi=(waterHeight+38.-eye.y)/ray.y;
        startT=max(startT,min(lo,hi));endT=min(endT,max(lo,hi));
      }
      if(endT>startT){
        float shoreSteps=movingView?10.:26.;
        float stepSize=(endT-startT)/shoreSteps;
        for(int i=0;i<26;i++){
          if(float(i)>=shoreSteps)break;
          vec3 p=eye+ray*(startT+(float(i)+.5)*stepSize);
          vec2 en=vec2(dot(p.xz,vec2(-.21491,-.97663)),dot(p.xz,vec2(-.97663,.21491)));
          vec2 uv=(tileOrigin+en*vec2(.00003136,-.00003136)-vec2(.40625,.15625))*8.;
          float edge=min(min(uv.x,uv.y),min(1.-uv.x,1.-uv.y));
          float shore=texture2D(sunMask,uv).g*smoothstep(0.,.04,edge);
          float patch=.70*noise(p.xz*.0028)+.30*noise(vec2(p.z*.009+p.y*.022,p.x*.007));
          float top=3.5+13.*smoothstep(.32,.77,patch);
          float above=p.y-waterHeight;
          float layer=smoothstep(-1.,1.4,above)*(1.-smoothstep(2.,top,above));
          tau+=shore*layer*smoothstep(.35,.77,patch)*smoothstep(170.,480.,length(p.xz))*stepSize*.0044;
        }
      }
      float shoreAlpha=1.-exp(-tau);
      float cloudTau=0.,lightSum=0.;
      if(ray.x>.64 && ray.y>.040*ray.x && ray.y<.134*ray.x){
        float first=max(0.,(9700.-eye.x)/ray.x);
        float last=min(distance,(15100.-eye.x)/ray.x);
        if(last>first){
          float cloudSteps=movingView?8.:20.;
          float dt=(last-first)/cloudSteps;
          for(int i=0;i<20;i++){
            if(float(i)>=cloudSteps)break;
            vec3 p=eye+ray*(first+(float(i)+.5)*dt);
            vec2 q=p.xz-vec2(12600.,-1100.);
            float footprint=1.-dot(q/vec2(2940.,5600.),q/vec2(2940.,5600.));
            float broad=noise(p.xz*.00072);
            float eddy=noise(vec2(p.z*.002+p.x*.00024,p.y*.0043+p.x*.00016));
            float filaments=noise(vec2(p.z*.0041+p.x*.00042,p.y*.012-p.x*.00055));
            float lift=1080.+110.*sin(p.z*.00055)+130.*(eddy-.5)+95.*(broad-.5);
            float vertical=(p.y-lift)/(98.+153.*broad);
            float density=smoothstep(.01,.55,footprint)*(1.-smoothstep(.10,1.,abs(vertical)))*
              smoothstep(.29,.70,.46*broad+.36*eddy+.18*filaments);
            float opticalDepth=density*dt*.00120;
            cloudTau+=opticalDepth;
            lightSum+=opticalDepth*(.55+.30*vertical+.13*filaments);
          }
        }
      }
      float cloudAlpha=1.-exp(-cloudTau);
      vec3 cloudLight=mix(vec3(.65,.64,.68),vec3(.96,.86,.74),clamp(lightSum/max(cloudTau,.001),0.,1.));
      return vec4(shoreAlpha*shoreLight+(1.-shoreAlpha)*cloudAlpha*cloudLight,
                  shoreAlpha+(1.-shoreAlpha)*cloudAlpha);
    }
    void main(){
      vec3 ray=world-eye;
      float dist=length(ray);
      vec3 direction=ray/max(dist,.001);
      bool isSky=kind>3.5 && kind<4.5;
      if(mirror>.5 && world.y<waterHeight-.02 && !isSky)discard;
      vec4 leaves=vec4(1.);
      if(kind>7.5){leaves=texture2D(canopyMap,canopyUV);if(leaves.a<.36)discard;}
      vec4 mist=mistAlong(direction,dist);
      if(isSky){
        gl_FragColor=vec4(mist.rgb+(1.-mist.a)*sky(direction),1.);
        return;
      }
      float edge=min(min(landUV.x,landUV.y),min(1.-landUV.x,1.-landUV.y));
      float coverage=smoothstep(.002,.035,edge);
      float sunlit=mix(1.,texture2D(sunMask,landUV).r,coverage);
      float toward=pow(max(dot(direction,sun),0.),7.);
      vec3 haze=mix(vec3(.445,.505,.578),vec3(.755,.665,.568),toward);
      vec3 result;
      if(kind>2.5 && kind<3.5){
        if(maskWater>.5)gl_FragColor=mist;
        else gl_FragColor=vec4(mist.rgb+(1.-mist.a)*lakeWater(world,direction,dist,sunlit),1.);
        return;
      }else if(kind<1.5){
        vec3 fallback=color*vec3(.94,.77,.74);
        vec3 base=texture2D(terrainMap,vec2(.5*clamp(landUV.x,.001,.999),landUV.y)).rgb;
        vec2 inset=(landUV-vec2(.40625,.15625))*8.;
        float border=min(min(inset.x,inset.y),min(1.-inset.x,1.-inset.y));
        vec2 crop=vec2(.5+.5*clamp(inset.x,.001,.999),clamp(inset.y,.001,.999));
        base=mix(base,texture2D(terrainMap,crop).rgb,smoothstep(.006,.052,border));
        // Register the native DEM/orthophoto inset with the regional material.
        vec2 summit=(landUV-fujiUV.xy)*fujiUV.z;
        float rim=min(min(summit.x,summit.y),min(1.-summit.x,1.-summit.y));
        float alpine=smoothstep(1230.,1620.,world.y)*smoothstep(.004,.085,rim);
        base=mix(base,texture2D(fujiMap,clamp(summit,0.,1.)).rgb,alpine);
        // A dark understory connects the visible crowns on the shore and headlands.
        // Sample in metres along the hillside so steep faces do not stretch the grain.
        float rise=world.y-waterHeight;
        float woods=smoothstep(1.5,12.,rise)*smoothstep(100.,240.,dist)*(1.-smoothstep(2900.,4600.,dist));
        if(woods>.0){
          vec2 p=world.xz+world.y*vec2(.37,-.52);
          float stand=.65*noise(p*.013)+.35*noise(p*.037);
          float crowns=.72*noise(p*.11)+.28*noise(p*.33);
          vec3 foliage=mix(vec3(.117,.137,.114),vec3(.254,.199,.138),smoothstep(.34,.77,stand));
          float surround=clamp(dot(base,vec3(.28,.56,.16)),.05,.65);
          foliage*=(.58+.63*crowns+.42*surround)*mix(vec3(.77,.83,.87),vec3(1.12,1.01,.87),sunlit);
          base=mix(base,foliage,woods*mix(.83,.97,smoothstep(12.,38.,rise)));
        }
        result=mix(fallback,base,coverage);
      }else if(kind>7.5){
        result=leaves.rgb*color*mix(vec3(.65,.70,.81),vec3(1.07,.98,.90),sunlit);
      }else{
        vec3 n=vec3(0.,1.,0.);
        #ifdef FACE_NORMAL
          vec3 face=cross(dFdx(world),dFdy(world));
          n=face/max(.000001,length(face));
          if(dot(n,-direction)<0.)n=-n;
        #endif
        float diffuse=max(dot(n,sun),0.)*sunlit;
        vec3 base=color;
        if(kind>5.5){
          float along=dot(vec2(n.z,-n.x),world.xz);
          vec2 grid=vec2(along/3.05,world.y/3.15);
          vec2 cell=fract(grid);
          float pane=smoothstep(.10,.21,cell.x)*(1.-smoothstep(.72,.84,cell.x));
          if(kind<6.5)pane*=smoothstep(.20,.30,cell.y)*(1.-smoothstep(.70,.80,cell.y));
          float room=hash(floor(grid));
          vec3 glass=mix(vec3(.20,.25,.28),vec3(.51,.48,.41),room);
          if(room>.94)glass=vec3(.85,.66,.41);
          base=mix(base,glass,pane*(.81-smoothstep(350.,1950.,dist)*.54));
        }
        result=base*sqrt(vec3(.37,.45,.60)+diffuse*vec3(1.34,.88,.48));
      }
      // The aerosol layer thins with height. Integrate density along the ray to
      // the surface so a summit above the layer retains its snow and rock relief.
      float climb=max(.001,(world.y-eye.y)/1050.);
      float column=(1.-exp(-climb))/climb;
      // More aerosol stays over the lake basin. Integrate its exponential
      // falloff in metres; the regional air dominates the long path to Fuji.
      float basinPath=1350.*(1.-exp(-dist/1350.));
      float transmission=exp(-.000029*dist-(.000078*dist+.000171*basinPath)*column);
      result=mix(haze,result,transmission);
      gl_FragColor=vec4(mist.rgb+(1.-mist.a)*result,1.);
    }`;
  function compile(type, source) {
    const shader=gl.createShader(type);
    gl.shaderSource(shader,source);gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  }
  function link(vertex,fragment){
    const program=gl.createProgram();
    for(const [kind,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){
      const shader=compile(kind,source);
      gl.attachShader(program,shader);gl.deleteShader(shader);
    }
    gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
    return program;
  }
  const program=link(vertexSource,fragmentSource);
  const projection=gl.getUniformLocation(program,'projection'),eyeUniform=gl.getUniformLocation(program,'eye');
  const attributes=['position','tint','surface'].map(name=>gl.getAttribLocation(program,name));
  function decode(text){
    const raw=atob(text),bytes=new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
    return bytes;
  }
  let vertices=decode(mesh.vertices);
  const indices=new Uint32Array(decode(mesh.indices).buffer);
  const indexed=gl.getExtension('OES_element_index_uint');
  const vao=gl.getExtension('OES_vertex_array_object');
  const state=vao && vao.createVertexArrayOES();
  const vbo=gl.createBuffer(),ebo=indexed && gl.createBuffer();
  if(state)vao.bindVertexArrayOES(state);
  if(indexed){
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ebo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,indices,gl.STATIC_DRAW);
  }else{
    const expanded=new Uint8Array(indices.length*16);
    indices.forEach((i,k)=>expanded.set(vertices.subarray(i*16,i*16+16),k*16));
    vertices=expanded;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER,vbo);gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.STATIC_DRAW);
  function layout(){
    gl.bindBuffer(gl.ARRAY_BUFFER,vbo);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ebo||null);
    attributes.forEach(a=>gl.enableVertexAttribArray(a));
    gl.vertexAttribPointer(attributes[0],3,gl.FLOAT,false,16,0);
    gl.vertexAttribPointer(attributes[1],3,gl.UNSIGNED_BYTE,true,16,12);
    gl.vertexAttribPointer(attributes[2],1,gl.UNSIGNED_BYTE,false,16,15);
  }
  layout();
  if(state)vao.bindVertexArrayOES(null);
  const dryChunks=mesh.chunks.filter(c=>c[0]<mesh.dryCount);
  const wetChunks=mesh.chunks.filter(c=>c[0]>=mesh.dryCount);
  // Cache the antialiased interior and shore in RGBA. Alpha records their actual
  // coverage over the lake, including glass and the edges of the window bars.
  const composite=link(
    'attribute vec2 corner;void main(){gl_Position=vec4(corner,0.,1.);}',
    `precision highp float;
    ${waterAndSky}
    uniform sampler2D stillScene,sunMask;
    uniform vec3 eye,forward,right,up;
    uniform vec2 tileOrigin;
    uniform float waterHeight;
    void main(){
      vec2 uv=gl_FragCoord.xy/resolution;
      vec4 still=texture2D(stillScene,uv);
      if(still.a>.998){gl_FragColor=vec4(still.rgb,1.);return;}
      vec2 ndc=uv*2.-1.;
      vec3 dir=normalize(forward+ndc.x*right+ndc.y*up);
      float distance=(eye.y-waterHeight)/max(.00001,-dir.y);
      vec3 point=eye+dir*distance;
      vec2 en=vec2(dot(point.xz,vec2(-.21491,-.97663)),dot(point.xz,vec2(-.97663,.21491)));
      float sunlit=texture2D(sunMask,tileOrigin+vec2(en.x,-en.y)*.00003136).r;
      gl_FragColor=vec4(still.rgb+(1.-still.a)*lakeWater(point,dir,distance,sunlit),1.);
    }`);
  const screenBuffer=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,screenBuffer);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  const corner=gl.getAttribLocation(composite,'corner');
  const uniforms=Object.fromEntries(['stillScene','sunMask','reflectionMap','skyMap','sun','waterHeight',
    'resolution','hasMirror','waterTime','waterBlur','eye','forward','right','up','tileOrigin'].map(n=>[n,gl.getUniformLocation(composite,n)]));
  gl.useProgram(composite);
  gl.uniform1i(uniforms.stillScene,0);gl.uniform1i(uniforms.reflectionMap,5);
  gl.uniform1i(uniforms.sunMask,6);gl.uniform1i(uniforms.skyMap,7);
  gl.uniform3fv(uniforms.sun,light.sun);gl.uniform2fv(uniforms.tileOrigin,light.origin);
  gl.uniform1f(uniforms.waterHeight,mesh.waterY);
  const stillTexture=gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D,stillTexture);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.useProgram(program);
  const loc=name=>gl.getUniformLocation(program,name);
  const mirrorUniform=loc('mirror'),reflectionUniform=loc('hasMirror'),sizeUniform=loc('resolution');
  const maskUniform=loc('maskWater'),timeUniform=loc('waterTime'),waterBlurUniform=loc('waterBlur');
  const movingViewUniform=loc('movingView');
  gl.uniform2fv(loc('tileOrigin'),light.origin);
  gl.uniform3fv(loc('fujiUV'),light.fujiUV);
  gl.uniform3fv(loc('sun'),light.sun);
  gl.uniform1f(loc('waterHeight'),mesh.waterY);
  gl.uniform1i(loc('reflectionMap'),0);
  // The room's static shadow map stays on unit 1 between outdoor draws.
  function loadMap(name,url,slot,placeholder,wrapSky=false){
    gl.uniform1i(loc(name),slot);
    const texture=gl.createTexture();
    function bind(){
      gl.activeTexture(gl.TEXTURE0+slot);
      gl.bindTexture(gl.TEXTURE_2D,texture);
    }
    bind();
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([...placeholder,255]));
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,wrapSky?gl.REPEAT:gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.activeTexture(gl.TEXTURE0);
    const image=new Image();
    image.onload=()=>{
      gl.activeTexture(gl.TEXTURE0+slot);
      const previous=gl.getParameter(gl.TEXTURE_BINDING_2D);
      bind();
      let pixels=image;
      const limit=gl.getParameter(gl.MAX_TEXTURE_SIZE);
      if(Math.max(image.width,image.height)>limit){
        const scale=limit/Math.max(image.width,image.height);
        pixels=document.createElement('canvas');pixels.width=image.width*scale;pixels.height=image.height*scale;
        pixels.getContext('2d').drawImage(image,0,0,pixels.width,pixels.height);
      }
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
      const ext=gl.getExtension('EXT_texture_filter_anisotropic');
      if(ext)gl.texParameterf(gl.TEXTURE_2D,ext.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(8,gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      gl.bindTexture(gl.TEXTURE_2D,previous);gl.activeTexture(gl.TEXTURE0);
      studioLoading.done(name);requestRender();
    };
    image.onerror=()=>{studioLoading.done(name);requestRender();};
    image.src=url;
    return texture;
  }
  const landTexture=loadMap('terrainMap',light.terrain,5,[95,81,68]);
  gl.activeTexture(gl.TEXTURE1);
  const roomShadow=gl.getParameter(gl.TEXTURE_BINDING_2D);
  const summitTexture=loadMap('fujiMap',light.fuji,1,[104,111,125]);
  gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,roomShadow);gl.activeTexture(gl.TEXTURE0);
  const leavesTexture=loadMap('canopyMap',light.canopy,4,[80,72,53]);
  const sunTexture=loadMap('sunMask',light.visibility,6,[255,255,255]);
  const skyTexture=loadMap('skyMap',light.sky,7,[174,175,182],true);
  const target=gl.createFramebuffer(),reflected=gl.createTexture(),depth=gl.createRenderbuffer();
  gl.bindTexture(gl.TEXTURE_2D,reflected);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  let rw=0,rh=0,usable=false;
  function resizeMirror(w,h){
    const scale=Math.min(.48,800/Math.max(w,h));
    const a=Math.max(1,Math.round(w*scale)),b=Math.max(1,Math.round(h*scale));
    if(a===rw && b===rh)return;
    rw=a;rh=b;
    gl.bindTexture(gl.TEXTURE_2D,reflected);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,a,b,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    gl.bindRenderbuffer(gl.RENDERBUFFER,depth);
    gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,a,b);
    gl.bindFramebuffer(gl.FRAMEBUFFER,target);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,reflected,0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depth);
    usable=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  }
  function draw(first,length){
    if(indexed)gl.drawElements(gl.TRIANGLES,length,gl.UNSIGNED_INT,first*4);
    else gl.drawArrays(gl.TRIANGLES,first,length);
  }
  function scissor(rects,w,h){
    const left=Math.floor((1+Math.min(...rects.map(r=>r[0])))*w/2);
    const bottom=Math.floor((1+Math.min(...rects.map(r=>r[1])))*h/2);
    const right=Math.ceil((1+Math.max(...rects.map(r=>r[2])))*w/2);
    const top=Math.ceil((1+Math.max(...rects.map(r=>r[3])))*h/2);
    gl.scissor(left,bottom,right-left,top-bottom);
  }
  let waveFrame=0,lastWave=0,cachedWidth=0,cachedHeight=0;
  const clockStart=performance.now();
  function cancelWaves(){cancelAnimationFrame(waveFrame);waveFrame=0;}
  document.addEventListener('visibilitychange',()=>{cancelWaves();if(!document.hidden)requestRender();});
  gl.canvas.addEventListener('webglcontextlost',cancelWaves);
  function drawLake(matrix,eye,roomAtlas,floorMap,portals,mayAnimate,waterBlur,movingView){
    cancelWaves();
    if(!portals.length)return false;
    const frusta=portals.map(r=>studioVisibility.frustum(matrix,r,.68));
    const visible=c=>frusta.some(f=>studioVisibility.intersects(c,f));
    const visibleWater=wetChunks.filter(visible);
    const animateWater=mayAnimate && visibleWater.length>0;
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,summitTexture);
    gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,leavesTexture);
    gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_2D,landTexture);
    gl.activeTexture(gl.TEXTURE6);gl.bindTexture(gl.TEXTURE_2D,sunTexture);
    gl.activeTexture(gl.TEXTURE7);gl.bindTexture(gl.TEXTURE_2D,skyTexture);
    gl.activeTexture(gl.TEXTURE0);
    if(state)vao.bindVertexArrayOES(state);else layout();
    const w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
    if(visibleWater.length)resizeMirror(w,h);
    gl.uniform2f(sizeUniform,w,h);
    gl.uniform1f(maskUniform,animateWater?1:0);
    gl.uniform1f(timeUniform,(performance.now()-clockStart)*.001);
    gl.uniform1f(waterBlurUniform,waterBlur);
    gl.uniform1i(movingViewUniform,movingView?1:0);
    const showMirror=usable && visibleWater.length>0;
    gl.enable(gl.SCISSOR_TEST);
    if(showMirror){
      // Reflect the viewpoint and its basis across the horizontal lake, then
      // render the mountains, buildings and sky into a lower-resolution target.
      const reflectedMatrix=matrix.slice();
      for(let row=0;row<4;row++){
        reflectedMatrix[12+row]+=2*mesh.waterY*matrix[4+row];
        reflectedMatrix[4+row]=-matrix[4+row];
      }
      gl.bindTexture(gl.TEXTURE_2D,roomAtlas);
      gl.bindFramebuffer(gl.FRAMEBUFFER,target);gl.viewport(0,0,rw,rh);
      scissor(portals,rw,rh);
      gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      gl.uniform1f(mirrorUniform,1);
      gl.uniform3f(eyeUniform,eye[0],2*mesh.waterY-eye[1],eye[2]);
      gl.uniformMatrix4fv(projection,false,reflectedMatrix);
      const mirrors=portals.map(r=>studioVisibility.frustum(reflectedMatrix,r,.68));
      studioVisibility.drawRanges(dryChunks,c=>mirrors.some(f=>studioVisibility.intersects(c,f)),draw);
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,w,h);
    }
    gl.bindTexture(gl.TEXTURE_2D,reflected);
    scissor(portals,w,h);
    gl.uniform1f(mirrorUniform,0);gl.uniform1f(reflectionUniform,showMirror?1:0);
    gl.uniformMatrix4fv(projection,false,matrix);gl.uniform3fv(eyeUniform,eye);
    studioVisibility.drawRanges(dryChunks,visible,draw);
    studioVisibility.drawRanges(visibleWater,()=>true,draw);
    gl.disable(gl.SCISSOR_TEST);
    gl.bindTexture(gl.TEXTURE_2D,roomAtlas);
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,roomShadow);
    gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,floorMap);gl.activeTexture(gl.TEXTURE0);
    if(state)vao.bindVertexArrayOES(null);
    else attributes.forEach(a=>gl.disableVertexAttribArray(a));
    return animateWater;
  }
  function finishWater(view,roomAtlas,keepAnimating,waterBlur){
    const w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
    gl.bindTexture(gl.TEXTURE_2D,stillTexture);
    if(w!==cachedWidth || h!==cachedHeight){
      gl.copyTexImage2D(gl.TEXTURE_2D,0,gl.RGBA,0,0,w,h,0);
      cachedWidth=w;cachedHeight=h;
    }else gl.copyTexSubImage2D(gl.TEXTURE_2D,0,0,0,0,0,w,h);
    gl.useProgram(composite);
    gl.uniform2f(uniforms.resolution,w,h);gl.uniform1f(uniforms.hasMirror,usable?1:0);
    gl.uniform1f(uniforms.waterBlur,waterBlur);
    gl.uniform3fv(uniforms.eye,view.origin);gl.uniform3fv(uniforms.forward,view.forward);
    gl.uniform3fv(uniforms.right,view.right.map(v=>v/view.sx));
    gl.uniform3fv(uniforms.up,view.up.map(v=>v/view.sy));
    function paint(now){
      gl.useProgram(composite);
      gl.activeTexture(gl.TEXTURE6);gl.bindTexture(gl.TEXTURE_2D,sunTexture);
      gl.activeTexture(gl.TEXTURE7);gl.bindTexture(gl.TEXTURE_2D,skyTexture);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1f(uniforms.waterTime,(now-clockStart)*.001);
      gl.bindBuffer(gl.ARRAY_BUFFER,screenBuffer);
      gl.enableVertexAttribArray(corner);gl.vertexAttribPointer(corner,2,gl.FLOAT,false,0,0);
      gl.bindTexture(gl.TEXTURE_2D,stillTexture);
      gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_2D,reflected);
      gl.disable(gl.DEPTH_TEST);gl.drawArrays(gl.TRIANGLES,0,3);gl.enable(gl.DEPTH_TEST);
      gl.bindTexture(gl.TEXTURE_2D,landTexture);
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,roomAtlas);
      lastWave=now;
    }
    function tick(now){
      if(document.hidden || gl.isContextLost()){waveFrame=0;return;}
      if(now-lastWave>=1000/30-1)paint(now);
      waveFrame=requestAnimationFrame(tick);
    }
    paint(performance.now());
    if(keepAnimating && !document.hidden)waveFrame=requestAnimationFrame(tick);
  }
  return {drawLake,finishWater,cancelWaves};
}
