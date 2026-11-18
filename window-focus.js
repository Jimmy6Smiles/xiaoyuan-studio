// Composite the interior at the current optical power, keeping exterior pixels
// separate so defocused window bars can spread over the lake.
function createWindowFocus(gl){
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
  const program=gl.createProgram();
  for(const [type,source] of [
    [gl.VERTEX_SHADER,'attribute vec2 corner;void main(){gl_Position=vec4(corner,0.,1.);}'],
    [gl.FRAGMENT_SHADER,`precision highp float;
      uniform sampler2D room,depthMap;
      uniform vec2 size;
      uniform float lensRadius,maxRadius,hasDepth,openingDepth,focusPower;
      uniform bool fastSampling;
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
      void main(){
        vec2 uv=gl_FragCoord.xy/size;
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
        vec4 sharp=texture2D(room,uv);
        if(radius<.30){gl_FragColor=sharp;return;}
        vec4 sum=sharp;
        float samples=fastSampling?12.:32.;
        for(int i=0;i<32;i++){
          if(float(i)>=samples)break;
          float k=float(i)+.5,angle=k*2.399963;
          vec2 disk=sqrt(k/samples)*vec2(cos(angle),sin(angle));
          sum+=texture2D(room,uv+disk*radius/size);
        }
        gl_FragColor=mix(sharp,sum/(1.+samples),smoothstep(.30,1.,radius));
      }`]]){
    const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));
    gl.attachShader(program,shader);gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
  const uniforms=Object.fromEntries(['room','depthMap','size','lensRadius','maxRadius','hasDepth','openingDepth','focusPower','fastSampling'].map(n=>[n,gl.getUniformLocation(program,n)]));
  const corner=gl.getAttribLocation(program,'corner'),triangle=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,triangle);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  let width=0,height=0,ready=false,useDepth=false;
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
    }
    if(!ready){gl.bindFramebuffer(gl.FRAMEBUFFER,null);return false;}
    gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.clearColor(.81,.85,.85,1);return true;
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
  function finish(scale,power,eyeX,roomAtlas,fastSampling){
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.useProgram(program);
    gl.bindTexture(gl.TEXTURE_2D,color);
    gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_2D,useDepth?depth:color);
    gl.uniform1i(uniforms.room,0);gl.uniform1i(uniforms.depthMap,5);
    gl.uniform1f(uniforms.hasDepth,useDepth?1:0);
    gl.uniform1i(uniforms.fastSampling,fastSampling?1:0);
    gl.uniform1f(uniforms.openingDepth,1/Math.max(2.5,5.85-eyeX));
    setLens(width,height,scale,power);
    gl.disable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES,0,3);
    gl.disable(gl.BLEND);gl.enable(gl.DEPTH_TEST);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,roomAtlas);
  }
  return {begin,finish,apertureScale};
}
