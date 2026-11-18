// The outside colour and water coverage travel together through the panes.
// The indoor cube is baked offline. Both window banks share the same six faces.
function createWindowGlazing(gl,requestRender){
  const program=gl.createProgram();
  const vertex=`attribute vec3 point;
    uniform mat4 camera;
    varying vec3 world;
    void main(){world=point;gl_Position=camera*vec4(point,1.);}`;
  const fragment=`precision highp float;
    uniform mat4 camera;
    uniform sampler2D outside;
    uniform samplerCube roomProbe;
    uniform vec3 eye,sun;
    uniform vec2 pixel;
    uniform float highWindow,blur;
    varying vec3 world;
    vec4 transmission(vec2 uv){
      vec4 centre=texture2D(outside,uv);
      if(blur<.30)return centre;
      vec4 sum=centre;
      for(int i=0;i<12;i++){
        float k=float(i)+.5;
        vec2 disk=sqrt(k/12.)*vec2(cos(k*2.399963),sin(k*2.399963));
        sum+=texture2D(outside,uv+pixel*blur*disk);
      }
      return mix(centre,sum/13.,smoothstep(.30,.85,blur));
    }
    vec3 reflectedRoom(vec3 origin,vec3 ray){
      // Project onto the room shell before looking up the probe, so a print
      // stays on its wall as the observer moves along the windows.
      vec3 bounds=mix(vec3(-5.78,0.,-4.86),vec3(5.77,4.10,6.86),step(vec3(0.),ray));
      vec3 safeRay=mix(vec3(-1.),vec3(1.),step(vec3(0.),ray))*max(abs(ray),vec3(.0001));
      vec3 distances=(bounds-origin)/safeRay;
      vec3 hit=origin+ray*max(0.,min(distances.x,min(distances.y,distances.z)));
      return textureCube(roomProbe,hit-vec3(0.,2.15,.85)).rgb;
    }
    void main(){
      vec3 normal=mix(vec3(-1.,0.,0.),vec3(0.,0.,1.),highWindow);
      vec3 along=mix(vec3(0.,0.,1.),vec3(1.,0.,0.),highWindow),up=vec3(0.,1.,0.);
      float u=dot(world,along);
      float bay=floor(mix((u+2.40)/1.65,(u+5.82)/1.455,highWindow));
      float pane=bay+9.*highWindow+(1.-highWindow)*step(2.95,world.y)*4.;
      vec2 bow=vec2(sin(u*1.7+world.y*.85+pane*2.43),sin(world.y*2.1-u*.64+pane*1.37));
      vec3 slope=along*bow.x+up*bow.y;
      vec3 ray=normalize(world-eye);
      vec3 front=normalize(normal+.0015*slope);
      vec3 inside=refract(ray,front,1./1.52);
      // Parallel 6 mm float glass displaces a ray sideways; only a very small
      // change in the rear surface slope deflects the distant landscape.
      vec3 exitNormal=normalize(front+.00075*slope);
      vec3 outgoing=refract(inside,exitNormal,1.52);
      if(dot(outgoing,outgoing)<.5)outgoing=ray;
      float thickness=.006/max(.12,-dot(inside,normal));
      vec4 sampleClip=camera*vec4(world+inside*thickness+outgoing*48.,1.);
      vec2 uv=gl_FragCoord.xy*pixel;
      vec2 shift=sampleClip.xy/max(.001,sampleClip.w)*.5+.5-uv;
      vec4 field=transmission(uv+clamp(shift,-2.*pixel,2.*pixel));

      float incidence=clamp(-dot(ray,front),0.,1.);
      float face=.0426+.9574*pow(1.-incidence,5.);
      float fresnel=2.*face/(1.+face);
      vec3 indoors=reflectedRoom(world,reflect(ray,front));
      vec3 colour=field.rgb*(1.-fresnel)+indoors*fresnel;
      // A faint diffraction fringe only in the immediate neighbourhood of a
      // transmitted solar highlight. A dark ridge or mullion occludes it.
      if(dot(ray,sun)>.9985 && field.a>.95){
        vec3 tangent=normalize(cross(sun,up));
        vec2 offset=vec2(dot(ray,tangent),dot(ray,cross(tangent,sun)));
        vec3 radius=length(offset)*vec3(185.,215.,252.);
        vec3 sinc=sin(radius+.0001)/(radius+.0001);
        float bright=smoothstep(.70,.92,dot(field.rgb,vec3(.2126,.7152,.0722)));
        colour+=vec3(.083,.066,.044)*bright*sinc*sinc;
      }
      gl_FragColor=vec4(colour,field.a+(1.-field.a)*fresnel);
    }`;
  for(const [type,code] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){
    const shader=gl.createShader(type);
    gl.shaderSource(shader,code);gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));
    gl.attachShader(program,shader);gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
  const loc=Object.fromEntries(['camera','eye','pixel','sun','outside','roomProbe','highWindow','blur']
    .map(name=>[name,gl.getUniformLocation(program,name)]));
  const point=gl.getAttribLocation(program,'point'),quads=gl.createBuffer();
  const corners=studioVisibility.openings.flatMap(bank=>[0,1,2,0,2,3].flatMap(i=>bank[i]));
  gl.bindBuffer(gl.ARRAY_BUFFER,quads);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(corners),gl.STATIC_DRAW);
  const outside=gl.createTexture(),probe=gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D,outside);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  for(const wrap of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,wrap,gl.CLAMP_TO_EDGE);
  // The cube binding is independent of the lake's 2D texture on this unit.
  gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_CUBE_MAP,probe);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  for(let i=0;i<6;i++)gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X+i,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([94,85,75,255]));
  gl.activeTexture(gl.TEXTURE0);
  const image=new Image();
  image.onload=()=>{
    const tile=document.createElement('canvas'),side=image.width/3;
    tile.width=side;tile.height=side;
    const ctx=tile.getContext('2d');
    gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_CUBE_MAP,probe);
    for(let i=0;i<6;i++){
      ctx.drawImage(image,(i%3)*side,Math.floor(i/3)*side,side,side,0,0,side,side);
      gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X+i,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,tile);
    }
    gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
    gl.activeTexture(gl.TEXTURE0);studioLoading.done('glazing');requestRender();
  };
  image.onerror=()=>{studioLoading.done('glazing');requestRender();};
  image.src="studio-reflection.jpg";
  let width=0,height=0;
  return function draw(matrix,eye,portals,w,h,blur,roomAtlas,refreshOutside){
    gl.bindTexture(gl.TEXTURE_2D,outside);
    if(width!==w || height!==h){
      width=w;height=h;
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    }
    // Snapshot only the visible openings, including their existing sampling
    // guard band. Copy both before drawing so neither samples the other pane.
    if(refreshOutside)for(const [l,b,r,t] of portals){
      const x=Math.floor((1+l)*w/2),y=Math.floor((1+b)*h/2);
      gl.copyTexSubImage2D(gl.TEXTURE_2D,0,x,y,x,y,Math.ceil((1+r)*w/2)-x,Math.ceil((1+t)*h/2)-y);
    }
    gl.useProgram(program);gl.uniformMatrix4fv(loc.camera,false,matrix);gl.uniform3fv(loc.eye,eye);
    gl.uniform2f(loc.pixel,1/w,1/h);gl.uniform1f(loc.blur,blur);gl.uniform3fv(loc.sun,kawaguchiLight.sun);
    gl.uniform1i(loc.outside,0);gl.uniform1i(loc.roomProbe,5);
    gl.bindBuffer(gl.ARRAY_BUFFER,quads);gl.enableVertexAttribArray(point);gl.vertexAttribPointer(point,3,gl.FLOAT,false,0,0);
    gl.disable(gl.DEPTH_TEST);
    for(const portal of portals){
      gl.uniform1f(loc.highWindow,portal[4]);gl.drawArrays(gl.TRIANGLES,6*portal[4],6);
    }
    gl.enable(gl.DEPTH_TEST);gl.bindTexture(gl.TEXTURE_2D,roomAtlas);
  };
}
