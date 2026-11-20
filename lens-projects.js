// The five exhibits follow the physical order of the glasses on the optical rail.
const hasselbladExtensions='https://github.com/Jimmy6Smiles/Hasselblad-X2DII-Extensions';
const lensProjects=[
  {camera:'Hasselblad X2D II 100C',title:'Shared runtime',
    copy:'One shared interface lets my camera extensions run together on the X2D II.',
    href:hasselbladExtensions},
  {camera:'Hasselblad X2D II 100C',title:'400 MP pixel shift',
    copy:'The sensor shifts between six exposures. The camera combines them into a single 400 MP image.',
    href:'https://github.com/Jimmy6Smiles/Hasselblad-X2DII-400MP-Source'},
  {camera:'Hasselblad X2D II 100C',title:'Multiple exposure',
    copy:'Blend up to nine exposures. A live overlay of previous frames helps line up the next shot.',
    href:hasselbladExtensions+'/releases/tag/multiple-exposure-0.1.2-rc42-fw-1.3.18.1-runtime-1.2.39'},
  {camera:'Hasselblad X2D II 100C',title:'In-camera filters',
    copy:'I integrated 45 filters by FarSails777 so you can preview a look before taking the shot.',
    href:hasselbladExtensions+'/releases/tag/mod-manager-runtime-1.2.43-20261107'},
  {camera:'Sony Alpha',title:'Multiple exposure',
    copy:'I’m developing a way to layer several shots into one image in camera on Sony Alpha.',
    href:'https://github.com/Jimmy6Smiles/Sony-Alpha-Research'}
];

// Panel geometry, lettering and the interactive link share these texture coordinates.
const lensPanel={width:1024,height:512,metres:.80,bottom:.32};
// Signed sag of each air/glass surface, measured from the edge to the centre.
// Negative elements retain a thin centre and fit within the retaining ring.
const railOptics={radius:.137,axis:[.93,0,.368],transverse:[-.368,0,.93],
  sag:[.0026,-.0032,.004,-.0036,.003],index:1.52};

// Shade one small tile per visible element from the already-rendered room.
// Its depth and colour stay on the GPU. The projector is drawn afterwards.
function createRailRefraction(gl,link,triangle){
  const vertex='attribute vec2 corner;varying vec2 disc;void main(){disc=corner;gl_Position=vec4(corner,0.,1.);}';
  const program=link(vertex,`precision highp float;
    varying vec2 disc;
    uniform sampler2D background,depth,exterior;
    uniform mat4 camera;
    uniform vec3 eye,center;
    uniform float side,sag,hasOutside,strength;
    const vec3 axis=vec3(${railOptics.axis.join(',')}),across=vec3(${railOptics.transverse.join(',')});
    const vec3 up=vec3(0.,1.,0.);
    const float radius=${railOptics.radius},ior=${railOptics.index};
    vec2 project(vec3 point){
      vec4 clip=camera*vec4(point,1.);
      return .5+.5*clip.xy/max(.04,clip.w);
    }
    float distanceZ(vec2 uv){return .04004/(1.001-texture2D(depth,uv).r);}
    void main(){
      vec2 d=disc/max(1.,length(disc));
      float halfWidth=.004+max(0.,-sag)+sag*(1.-dot(d,d));
      vec3 radial=across*d.x+up*d.y;
      vec3 front=center+radius*radial+side*halfWidth*axis;
      vec3 normal=normalize(side*axis+2.*sag/radius*radial);
      vec3 incoming=normalize(front-eye);
      vec3 glass=refract(incoming,normal,1./ior);
      float run=2.*halfWidth/max(.18,-dot(glass,side*axis));
      vec3 exitPoint=front+run*glass;
      vec2 backDisc=vec2(dot(exitPoint-center,across),exitPoint.y-center.y)/radius;
      vec3 backNormal=normalize(side*axis-2.*sag/radius*(backDisc.x*across+backDisc.y*up));
      vec3 outgoing=refract(glass,backNormal,ior);
      vec4 start=camera*vec4(exitPoint,1.),direction=camera*vec4(outgoing,0.);
      vec2 origin=project(front),uv=origin;
      if(direction.w>.04){
        // Reproject onto the sampled background depth, refining once when a
        // ray crosses from the nearby bench to the more distant wall or floor.
        for(int i=0;i<2;i++){
          float t=clamp((distanceZ(uv)-start.w)/direction.w,0.,38.);
          vec4 hit=start+t*direction;
          uv=.5+.5*hit.xy/max(.04,hit.w);
        }
      }
      vec2 border=min(uv,1.-uv);
      float valid=smoothstep(0.,.018,min(border.x,border.y))*
        smoothstep(.008,.065,distanceZ(uv)-start.w);
      uv=mix(origin,uv,valid*strength);
      vec4 room=texture2D(background,uv);
      if(room.a<.999 && hasOutside>.5)room+=(1.-room.a)*texture2D(exterior,uv);
      gl_FragColor=room*strength;
    }`);
  const loc=Object.fromEntries(['camera','eye','center','side','sag','strength','background','depth','exterior','hasOutside']
    .map(k=>[k,gl.getUniformLocation(program,k)]));
  const corner=gl.getAttribLocation(program,'corner');
  const tile=Math.min(256,Math.floor(gl.getParameter(gl.MAX_TEXTURE_SIZE)/railOptics.sag.length));
  const width=tile*railOptics.sag.length;
  const map=gl.createTexture(),target=gl.createFramebuffer();
  gl.bindTexture(gl.TEXTURE_2D,map);
  for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,p,gl.LINEAR);
  for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,p,gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,tile,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  gl.bindFramebuffer(gl.FRAMEBUFFER,target);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,map,0);
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE){
    gl.deleteFramebuffer(target);gl.deleteTexture(map);gl.deleteProgram(program);return null;
  }
  return {map,draw(groups,camera,eye,room,depth,outside){
    gl.bindFramebuffer(gl.FRAMEBUFFER,target);
    gl.disable(gl.DEPTH_TEST);gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER,triangle);
    gl.enableVertexAttribArray(corner);gl.vertexAttribPointer(corner,2,gl.FLOAT,false,0,0);
    gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_2D,depth);
    gl.activeTexture(gl.TEXTURE6);gl.bindTexture(gl.TEXTURE_2D,outside||room);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,room);
    gl.uniform1i(loc.background,0);gl.uniform1i(loc.depth,5);gl.uniform1i(loc.exterior,6);
    gl.uniform1f(loc.hasOutside,outside?1:0);
    gl.uniformMatrix4fv(loc.camera,false,camera);gl.uniform3fv(loc.eye,eye);
    for(const g of groups){
      const size=Math.min(tile,Math.max(24,Math.ceil(g.diameter)));
      const x=g.lens*tile;
      gl.viewport(x,0,size,size);
      gl.uniform1f(loc.strength,g.strength);
      gl.uniform3fv(loc.center,g.center);gl.uniform1f(loc.sag,railOptics.sag[g.lens]);gl.uniform1f(loc.side,g.side);
      gl.drawArrays(gl.TRIANGLES,0,3);
      g.tile=[(x+.5)/width,.5/tile,(size-1)/width,(size-1)/tile];
    }
    gl.enable(gl.DEPTH_TEST);
  }};
}
function measureLensLink(){
  const text='View on GitHub',font='600 37px "Segoe UI", sans-serif',x=56,baseline=452;
  const ctx=document.createElement('canvas').getContext('2d');
  ctx.font=font;
  const ink=ctx.measureText(text),arrowX=x+ink.width+17,arrowSize=17;
  const arrowBottom=baseline-2,arrowTop=arrowBottom-arrowSize;
  const pad=6,stroke=3;
  const left=x-ink.actualBoundingBoxLeft,right=arrowX+arrowSize+stroke/2;
  const top=Math.min(baseline-ink.actualBoundingBoxAscent,arrowTop-stroke/2);
  const bottom=Math.max(baseline+ink.actualBoundingBoxDescent,arrowBottom+stroke/2);
  return {text,font,x,baseline,arrowX,arrowSize,arrowBottom,arrowTop,stroke,
    bounds:[left-pad,top-pad,right+pad,bottom+pad]};
}
function lensPanelPoint(center,u,v){
  const dx=(u-lensPanel.width/2)*lensPanel.metres/lensPanel.width;
  return [center[0]+.933*dx,center[1]+lensPanel.bottom+(lensPanel.height-v)*lensPanel.metres/lensPanel.width,center[2]-.360*dx];
}

function paintLensPanel(project,index,link){
  const sheet=document.createElement('canvas');
  sheet.width=lensPanel.width;sheet.height=lensPanel.height;
  const ctx=sheet.getContext('2d');
  // Concentrate the tint underneath the type. The shader dissolves the perimeter.
  ctx.save();ctx.scale(1.8,1);
  const haze=ctx.createRadialGradient(226,245,50,226,245,435);
  haze.addColorStop(0,'rgba(5,31,34,.55)');haze.addColorStop(.6,'rgba(7,43,45,.44)');
  haze.addColorStop(1,'rgba(13,58,59,.12)');
  ctx.fillStyle=haze;ctx.fillRect(0,0,sheet.width/1.8,sheet.height);ctx.restore();
  ctx.fillStyle='rgba(159,255,233,.04)';
  for(let y=5;y<sheet.height;y+=8)ctx.fillRect(0,y,sheet.width,1);
  ctx.shadowColor='rgba(1,16,20,.98)';ctx.shadowBlur=5;ctx.shadowOffsetY=1;
  ctx.fillStyle='#c2f8ee';ctx.font='600 29px "Segoe UI", sans-serif';
  ctx.fillText(project.camera.toUpperCase(),56,81);
  // The five lens profiles show the visitor's position along the rail.
  for(let i=0;i<lensProjects.length;i++){
    const x=819+i*31;
    ctx.beginPath();ctx.ellipse(x,76,6,16,-.17,0,Math.PI*2);
    ctx.lineWidth=2;ctx.strokeStyle=i===index?'#b5fff4':'#689994';ctx.stroke();
    if(i===index){ctx.fillStyle='#9bf9e8';ctx.fill();}
  }
  ctx.fillStyle='#e5fffa';ctx.font='600 68px "Segoe UI", sans-serif';
  ctx.fillText(project.title,54,179);
  ctx.font='38px "Segoe UI", sans-serif';ctx.fillStyle='#edfff8';
  let line='',y=253;
  for(const word of project.copy.split(' ')){
    const next=line?line+' '+word:word;
    if(line && ctx.measureText(next).width>909){ctx.fillText(line,56,y);y+=48;line=word;}
    else line=next;
  }
  ctx.fillText(line,56,y);
  ctx.font=link.font;ctx.fillStyle='#aaffee';ctx.fillText(link.text,link.x,link.baseline);
  const tip=link.arrowX+link.arrowSize;
  ctx.beginPath();ctx.moveTo(link.arrowX,link.arrowBottom);ctx.lineTo(tip,link.arrowTop);ctx.lineTo(link.arrowX+3,link.arrowTop);
  ctx.moveTo(tip,link.arrowTop);ctx.lineTo(tip,link.arrowBottom-3);ctx.lineWidth=link.stroke;ctx.strokeStyle='#aaffee';ctx.stroke();
  return sheet;
}

function appendLensProjection(center,face,lensPoint){
  // Start inside the glass. Two crossing, translucent fans spread the light upward.
  const glow=(u,v)=>lensPoint(center,.013,.143*Math.hypot(u,v),Math.atan2(v,u));
  const uv=[[0,1],[1,1],[1,0],[0,0]];
  face(glow(-1,-1),glow(1,-1),glow(1,1),glow(-1,1),'ffffff',-32,uv);
  const [x,y,z]=center;
  const floor=lensPanel.height;
  const fanUV=[[-.045,1],[.045,1],[1,0],[-1,0]];
  for(const depth of [-.014,.014]){
    const end=u=>{
      const p=lensPanelPoint(center,u,floor);
      p[2]+=depth;
      return p;
    };
    face([x-.015,y+.055,z-depth],[x+.015,y+.055,z-depth],end(942),end(82),'ffffff',-33,fanUV);
  }
  face(lensPanelPoint(center,0,floor),lensPanelPoint(center,lensPanel.width,floor),
    lensPanelPoint(center,lensPanel.width,0),lensPanelPoint(center,0,0),'ffffff',-34,uv);
}
