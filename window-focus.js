// Composite the interior at the current optical power, keeping exterior pixels
// separate so defocused window bars can spread over the lake.
function createWindowFocus(gl,emitters){
  const depthExtension=gl.getExtension('WEBGL_depth_texture');
  const frame=gl.createFramebuffer(),depthBuffer=gl.createRenderbuffer();
  function texture(filter){
    const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,filter);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,filter);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    return t;
  }
  const color=texture(gl.LINEAR),depth=texture(gl.NEAREST);
  function link(vertex,fragment){
    const p=gl.createProgram();
    for(const [type,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){
      const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));
      gl.attachShader(p,shader);gl.deleteShader(shader);
    }
    gl.linkProgram(p);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));
    return p;
  }
  const fullscreen='attribute vec2 corner;void main(){gl_Position=vec4(corner,0.,1.);}';
  const program=link(fullscreen,`precision highp float;
      uniform sampler2D room,depthMap,softRoom,broadRoom;
      uniform bool hasFilters;
      uniform vec3 glowTint;
      uniform vec2 size;
      uniform float lensRadius,maxRadius,hasDepth,openingDepth,focusPower;
      uniform bool fastSampling,reflectionsEnabled;
      uniform vec3 viewEye,viewRight,viewUp,viewForward;
      uniform vec2 viewScale;
      float eyeDepth(vec2 uv){return .04004/(1.001-texture2D(depthMap,uv).r);}
      vec3 worldAt(vec2 uv,float z){
        vec2 q=(uv*2.-1.)/viewScale;
        return viewEye+z*(viewForward+viewRight*q.x+viewUp*q.y);
      }
      vec3 projectPoint(vec3 p){
        vec3 v=p-viewEye;
        float z=dot(v,viewForward);
        return vec3(.5+.5*viewScale*vec2(dot(v,viewRight),dot(v,viewUp))/max(.001,z),z);
      }
      bool inTop(vec3 p,vec2 center,vec2 halfSize,float height){
        return abs(p.y-height)<.005 && all(lessThan(abs(p.xz-center),halfSize));
      }
      vec3 reflectSurfaces(vec2 uv,vec4 base){
        if(!reflectionsEnabled || base.a<.98)return base.rgb;
        vec3 p=worldAt(uv,eyeDepth(uv));
        bool floorTile=abs(p.y)<.004 && !(p.x> -1.53 && p.x<.03 && p.z> -2.54 && p.z<4.42);
        bool wood=inTop(p,vec2(2.15,1.73),vec2(2.31,.92),.99)
          || inTop(p,vec2(2.55,-3.92),vec2(2.,.57),.82)
          || inTop(p,vec2(2.15,1.73),vec2(2.21,.82),.355);
        bool printTable=inTop(p,vec2(-4.34,4.08),vec2(1.25,.375),.75)
          && any(greaterThan(abs(p.xz-vec2(-4.04,4.08)),vec2(.55,.174)));
        bool satin=printTable || inTop(p,vec2(-4.91,-.18),vec2(.279,1.62),.548);
        if(!floorTile && !wood && !satin)return base.rgb;
        vec3 incoming=normalize(p-viewEye);
        if(incoming.y>-.025)return base.rgb;
        vec3 dir=reflect(incoming,vec3(0.,1.,0.));
        vec3 start=p+vec3(0.,.017,0.);
        float previous=0.,travel=.045;
        for(int i=0;i<26;i++){
          vec3 h=projectPoint(start+dir*travel);
          if(h.z<.05 || any(lessThan(h.xy,vec2(.002))) || any(greaterThan(h.xy,vec2(.998))))break;
          if(h.z>=eyeDepth(h.xy)){
            float lo=previous,hi=travel;
            for(int j=0;j<4;j++){
              float mid=(lo+hi)*.5;
              vec3 samplePoint=projectPoint(start+dir*mid);
              if(samplePoint.z>eyeDepth(samplePoint.xy))hi=mid;else lo=mid;
            }
            h=projectPoint(start+dir*hi);
            float surfaceZ=eyeDepth(h.xy);
            if(abs(h.z-surfaceZ)>.065 || worldAt(h.xy,surfaceZ).y<p.y+.025)break;
            vec2 border=min(h.xy,1.-h.xy);
            float confidence=smoothstep(0.,.055,min(border.x,border.y))*(1.-smoothstep(3.8,5.5,hi));
            vec4 hit=texture2D(room,h.xy);
            vec3 radiance=hit.rgb*hit.rgb;
            // A reflected object's footprint grows with its distance from
            // the receiver. Contact reflections retain their silhouette.
            if(hasFilters){
              float cone=satin?.21:(wood?.085:.17);
              float pixels=hi*cone*.5*size.y*viewScale.y/max(.05,h.z);
              float filterWidth=max(3.,min(size.x,size.y)/110.);
              radiance=mix(radiance,texture2D(softRoom,h.xy).rgb,smoothstep(.6,filterWidth,pixels));
              radiance=mix(radiance,texture2D(broadRoom,h.xy).rgb,smoothstep(filterWidth,3.*filterWidth,pixels));
            }
            float amount=(wood?.108:.067)+(wood?.28:.22)*pow(1.+incoming.y,4.);
            if(satin)amount=.035+.13*pow(1.+incoming.y,4.);
            return sqrt(mix(base.rgb*base.rgb,radiance,amount*confidence*smoothstep(.8,1.,hit.a)));
          }
          previous=travel;travel+=.055+.011*float(i);
        }
        return base.rgb;
      }
      float radiusAt(vec2 uv){
        float depth=texture2D(depthMap,uv).r;
        float reciprocal=(1.001-depth)/.04004;
        // Glass against open sky did not write depth. Its alpha gives it a near radius.
        if(depth>.99995 || hasDepth<.5){
          float a=texture2D(room,uv).a;
          reciprocal=a<.009?openingDepth:(a<.88?.69:.25);
        }
        return min(maxRadius,lensRadius*abs(reciprocal-focusPower));
      }
      vec4 develop(vec4 scene,vec2 uv){
        if(hasFilters){
          float halo=.46*texture2D(softRoom,uv).a+.47*texture2D(broadRoom,uv).a;
          scene.rgb+=(1.-scene.rgb)*glowTint*halo;
        }
        return scene;
      }
      void main(){
        vec2 uv=gl_FragCoord.xy/size;
        vec4 sharp=texture2D(room,uv);
        if(lensRadius<.15){gl_FragColor=develop(vec4(reflectSurfaces(uv,sharp),sharp.a),uv);return;}
        float radius=radiusAt(uv);
        // Expand near silhouettes over the clear layer. This also catches thin
        // lens barrels and mullions with no depth at the destination pixel.
        for(int i=0;i<8;i++){
          if(fastSampling && mod(float(i),2.)>0.)continue;
          float a=float(i)*.785398;
          vec2 side=vec2(cos(a),sin(a))/size;
          float probe=maxRadius*.44;
          radius=max(radius,radiusAt(uv+side*probe)-.14*probe);
          radius=max(radius,radiusAt(uv+side*1.6)-.22);
        }
        if(radius<3.)sharp.rgb=mix(sharp.rgb,reflectSurfaces(uv,sharp),1.-smoothstep(.3,3.,radius));
        if(radius<.30){gl_FragColor=develop(sharp,uv);return;}
        vec4 sum=sharp;
        float samples=fastSampling?12.:32.;
        for(int i=0;i<32;i++){
          if(float(i)>=samples)break;
          float k=float(i)+.5,angle=k*2.399963;
          vec2 disk=sqrt(k/samples)*vec2(cos(angle),sin(angle));
          sum+=texture2D(room,uv+disk*radius/size);
        }
        gl_FragColor=develop(mix(sharp,sum/(1.+samples),smoothstep(.30,1.,radius)),uv);
      }`);
  const uniforms=Object.fromEntries(['room','depthMap','size','lensRadius','maxRadius','hasDepth','openingDepth','focusPower','fastSampling','reflectionsEnabled','viewEye','viewRight','viewUp','viewForward','viewScale','hasFilters','glowTint','softRoom','broadRoom'].map(n=>[n,gl.getUniformLocation(program,n)]));
  const corner=gl.getAttribLocation(program,'corner'),triangle=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,triangle);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  const maskProgram=link(
    'invariant gl_Position;attribute vec4 emitter;uniform mat4 camera;varying mediump float power;void main(){gl_Position=camera*vec4(emitter.xyz,1.);power=emitter.w;}',
    'precision mediump float;varying mediump float power;void main(){gl_FragColor=vec4(power,0.,0.,1.);}');
  const emitterAttribute=gl.getAttribLocation(maskProgram,'emitter'),maskCamera=gl.getUniformLocation(maskProgram,'camera');
  const emitterBuffer=gl.createBuffer(),emitterCount=emitters.length/4;
  gl.bindBuffer(gl.ARRAY_BUFFER,emitterBuffer);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(emitters),gl.STATIC_DRAW);
  const filterProgram=link(fullscreen,`precision highp float;
    uniform sampler2D source,mask;
    uniform vec2 texel;
    uniform bool first;
    vec4 tap(vec2 p){
      vec4 c=texture2D(source,p);
      if(first)return vec4(c.rgb*c.rgb,texture2D(mask,p).r);
      return c;
    }
    void main(){
      vec2 uv=gl_FragCoord.xy*texel,d=.78*texel;
      vec4 sum=4.*tap(uv);
      sum+=2.*(tap(uv+vec2(d.x,0.))+tap(uv-vec2(d.x,0.))+tap(uv+vec2(0.,d.y))+tap(uv-vec2(0.,d.y)));
      sum+=tap(uv+d)+tap(uv-d)+tap(uv+vec2(d.x,-d.y))+tap(uv+vec2(-d.x,d.y));
      gl_FragColor=sum/16.;
    }`);
  const filterCorner=gl.getAttribLocation(filterProgram,'corner');
  const filterUniform=Object.fromEntries(['source','mask','texel','first'].map(n=>[n,gl.getUniformLocation(filterProgram,n)]));
  const mask=texture(gl.LINEAR),maskFrame=gl.createFramebuffer();
  const levels=Array.from({length:3},()=>({texture:texture(gl.LINEAR),frame:gl.createFramebuffer()}));
  let width=0,height=0,ready=false,useDepth=false,filtersReady=false;
  function target(framebuffer,map,w,h){
    gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
    gl.bindTexture(gl.TEXTURE_2D,map);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,map,0);
  }
  function begin(w,h){
    gl.bindFramebuffer(gl.FRAMEBUFFER,frame);
    if(w!==width || h!==height){
      width=w;height=h;
      gl.bindTexture(gl.TEXTURE_2D,color);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,color,0);
      if(depthExtension){
        gl.bindTexture(gl.TEXTURE_2D,depth);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT,w,h,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);
        gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,depth,0);
        if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)
          gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT,w,h,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_SHORT,null);
      }
      useDepth=!!depthExtension && gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;
      if(!useDepth){
        gl.bindRenderbuffer(gl.RENDERBUFFER,depthBuffer);
        gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,w,h);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depthBuffer);
      }
      ready=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;
      target(maskFrame,mask,w,h);
      if(useDepth)gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,depth,0);
      else gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depthBuffer);
      filtersReady=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;
      let stride=Math.max(2,Math.min(5,Math.min(w,h)/330));
      for(const level of levels){
        level.w=Math.max(1,Math.ceil(w/stride));level.h=Math.max(1,Math.ceil(h/stride));
        target(level.frame,level.texture,level.w,level.h);
        filtersReady=filtersReady && gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;
        stride*=3;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER,frame);
    }
    if(!ready){gl.bindFramebuffer(gl.FRAMEBUFFER,null);return false;}
    gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.clearColor(.81,.85,.85,1);return true;
  }
  function filterLighting(matrix){
    if(!filtersReady)return;
    // Repeat only the luminous triangles against the opaque scene's existing
    // depth. A bright print or a lamp hidden behind its housing contributes zero.
    gl.bindFramebuffer(gl.FRAMEBUFFER,maskFrame);
    gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.clearColor(.81,.85,.85,1);
    gl.depthMask(false);gl.depthFunc(gl.LEQUAL);gl.useProgram(maskProgram);
    // Allow one depth-buffer unit for differently indexed coplanar triangles.
    gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(0,-1);
    gl.uniformMatrix4fv(maskCamera,false,matrix);
    gl.bindBuffer(gl.ARRAY_BUFFER,emitterBuffer);
    gl.enableVertexAttribArray(emitterAttribute);gl.vertexAttribPointer(emitterAttribute,4,gl.FLOAT,false,0,0);
    gl.drawArrays(gl.TRIANGLES,0,emitterCount);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.depthFunc(gl.LESS);gl.disable(gl.DEPTH_TEST);
    gl.useProgram(filterProgram);
    gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_2D,mask);
    gl.uniform1i(filterUniform.mask,5);gl.uniform1i(filterUniform.source,0);
    gl.activeTexture(gl.TEXTURE0);gl.bindBuffer(gl.ARRAY_BUFFER,triangle);
    gl.enableVertexAttribArray(filterCorner);gl.vertexAttribPointer(filterCorner,2,gl.FLOAT,false,0,0);
    let input=color;
    for(const level of levels){
      gl.bindFramebuffer(gl.FRAMEBUFFER,level.frame);gl.viewport(0,0,level.w,level.h);
      gl.bindTexture(gl.TEXTURE_2D,input);gl.uniform2f(filterUniform.texel,1/level.w,1/level.h);
      gl.uniform1i(filterUniform.first,input===color?1:0);gl.drawArrays(gl.TRIANGLES,0,3);
      input=level.texture;
    }
    gl.viewport(0,0,width,height);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);
  }
  function apertureScale(w,h,fov){
    const sensor=h>w?.036:.024,focal=.5*sensor/Math.tan(fov*Math.PI/360);
    return Math.max(.014*Math.min(w,h),h*focal*focal/(2*sensor*1.35));
  }
  function setLens(w,h,scale,power){
    gl.uniform2f(uniforms.size,w,h);gl.uniform1f(uniforms.focusPower,power);
    gl.uniform1f(uniforms.lensRadius,scale);
    gl.uniform1f(uniforms.maxRadius,Math.min(22,.022*Math.min(w,h)));
    gl.bindBuffer(gl.ARRAY_BUFFER,triangle);
    gl.enableVertexAttribArray(corner);gl.vertexAttribPointer(corner,2,gl.FLOAT,false,0,0);
  }
  function finish(scale,power,view,roomAtlas,fastSampling,reflections,darkroomWhite){
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D,color);
    gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_2D,useDepth?depth:color);
    gl.uniform1i(uniforms.room,0);gl.uniform1i(uniforms.depthMap,5);
    gl.activeTexture(gl.TEXTURE6);gl.bindTexture(gl.TEXTURE_2D,filtersReady?levels[1].texture:color);
    gl.activeTexture(gl.TEXTURE7);gl.bindTexture(gl.TEXTURE_2D,filtersReady?levels[2].texture:color);
    gl.uniform1i(uniforms.softRoom,6);gl.uniform1i(uniforms.broadRoom,7);
    gl.uniform1i(uniforms.hasFilters,filtersReady?1:0);
    if(darkroomWhite>=0)gl.uniform3f(uniforms.glowTint,1,.17+.82*darkroomWhite,.065+.90*darkroomWhite);
    else gl.uniform3f(uniforms.glowTint,1,.86,.69);
    gl.uniform1f(uniforms.hasDepth,useDepth?1:0);
    gl.uniform1i(uniforms.fastSampling,fastSampling?1:0);
    gl.uniform1f(uniforms.openingDepth,1/Math.max(2.5,5.85-view.origin[0]));
    gl.uniform1i(uniforms.reflectionsEnabled,reflections && useDepth?1:0);
    gl.uniform3fv(uniforms.viewEye,view.origin);gl.uniform3fv(uniforms.viewForward,view.forward);
    gl.uniform3fv(uniforms.viewRight,view.right);gl.uniform3fv(uniforms.viewUp,view.up);
    gl.uniform2f(uniforms.viewScale,view.sx,view.sy);
    setLens(width,height,scale,power);
    gl.disable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES,0,3);
    gl.disable(gl.BLEND);gl.enable(gl.DEPTH_TEST);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,roomAtlas);
  }
  // The five elements share one view from the visitor's eye. Turning in
  // place cannot clip its contents at the edge of the visible canvas.
  function createRailBackground(){
    const w=Math.min(1280,gl.getParameter(gl.MAX_TEXTURE_SIZE)),h=Math.floor(w/2);
    const buffer=gl.createFramebuffer(),map=texture(gl.LINEAR),z=texture(gl.NEAREST);
    target(buffer,map,w,h);
    gl.bindTexture(gl.TEXTURE_2D,z);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,z,0);
    for(const type of [gl.UNSIGNED_INT,gl.UNSIGNED_SHORT]){
      gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT,w,h,0,gl.DEPTH_COMPONENT,type,null);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE)
        return {buffer,map,z,w,h,eye:[],matrix:null,time:-Infinity};
    }
    gl.deleteTexture(z);gl.deleteTexture(map);gl.deleteFramebuffer(buffer);
    return null;
  }
  let rail,background;
  function refractRail(groups,matrix,eye,outside,now,capture){
    if(!useDepth || !groups.length)return null;
    if(rail===undefined)rail=createRailRefraction(gl,link,triangle);
    if(rail && background===undefined)background=createRailBackground();
    if(background && (now-background.time>=250 || eye.some((v,i)=>v!==background.eye[i]))){
      gl.bindFramebuffer(gl.FRAMEBUFFER,background.buffer);
      gl.viewport(0,0,background.w,background.h);
      gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      background.matrix=capture(background.w,background.h);
      background.eye=eye.slice();background.time=now;
    }
    if(background && background.matrix)rail.draw(groups,background.matrix,eye,background.map,background.z,null);
    else if(rail)rail.draw(groups,matrix,eye,color,depth,outside);
    gl.bindFramebuffer(gl.FRAMEBUFFER,frame);gl.viewport(0,0,width,height);
    return rail && rail.map;
  }
  return {begin,finish,apertureScale,filterLighting,refractRail,supportsReflections:!!depthExtension};
}
