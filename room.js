/* Warm Studio. Meshes use metres; +z faces the entry wall. */
async function initializeStudioRoom(){
  const canvas = document.querySelector('#room');
  if (!canvas) return;
  const gl = canvas.getContext('webgl', {antialias:true,alpha:true,powerPreference:'high-performance'});
  if (!gl){studioLoading.unavailable();return;}
  const separateRadiance=gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS)>8;
  const fineAtlas=gl.getParameter(gl.MAX_TEXTURE_SIZE)>=4096;
  const lightCoordinates=new Image();
  if(fineAtlas)lightCoordinates.src='room-light-uv.png?v=2';
  const coordinateReady=fineAtlas?lightCoordinates.decode().catch(()=>null):Promise.resolve();
  const vertex = `
  invariant gl_Position;
  attribute vec3 p,n,c; attribute vec2 uv; attribute float m;
  attribute vec2 bakedUV;
  varying vec3 fineLightUV;
  uniform mat4 camera, shadowCamera;
  uniform highp float cardLift[6];
  uniform highp float sleeveLift[${recordPrints.length}];
  uniform highp float stringBend[12];
  uniform float viewportWidth, curtainPhase;
  varying vec3 pos,norm,col; varying vec2 tex; varying float mat,localContact; varying vec3 lightUV;
  void main(){
    float code=floor(m+.5);
    fineLightUV=vec3(bakedUV*(65535./16.),1.);
    localContact=(m-code)*4.;
    pos=p; norm=n; col=c; tex=uv; mat=mod(code,32.);
    if(code>=1024.){
      mat=code-1024.;
    }else if(code>=${firstSleeveGroup*32}.){
      int sleeve=int(floor(code/32.))-${firstSleeveGroup};
      float lift=sleeveLift[sleeve];
      localContact*=1.-lift;
      fineLightUV.z=1.-lift;
      // Lift the sleeve over the retaining lip while drawing it toward the room.
      pos.x-=${sleeveTravel.out}*lift;
      pos.y+=${sleeveTravel.up}*lift*(2.-lift);
    }else if(code>=32.){
      int i=int(floor(code/32.))-1;
      float lift=cardLift[i],angle=.085*lift,cx=cos(angle),sx=sin(angle);
      localContact*=1.-lift;
      fineLightUV.z=1.-lift;
      vec2 center=vec2(i<3?2.373:1.863,-4.732);
      mat2 tilt=mat2(cx,sx,-sx,cx);
      pos.yz=center+tilt*(p.yz-center)+vec2(.018,.096)*lift;
      norm.yz=tilt*n.yz;
    }
    if(code==28.){
      // The heading stays on its rings. A travelling ripple reaches the hem last.
      float free=uv.y*uv.y, wave=curtainPhase+1.45*p.z-2.4*uv.y;
      pos.x+=free*(.015*sin(wave)+.004*sin(2.*wave+.8*uv.x));
      pos.z+=free*.013*sin(wave+1.2);
      norm.z-=n.x*free*(.022*cos(wave)+.012*cos(2.*wave+.8*uv.x));
    }
    lightUV=(shadowCamera*vec4(pos,1.)).xyz*.5+.5;
    gl_Position=camera*vec4(pos,1.);
    if(code<=-32.)mat=code;
    else if(code<0.){
      float bend=stringBend[int(-code-1.)]*sin(3.14159*uv.x);
      vec4 axis=camera*vec4(n,0.);
      float pixels=abs(axis.x-gl_Position.x*axis.w/gl_Position.w)*viewportWidth/(2.*gl_Position.w);
      float radius=max(abs(uv.y),min(.003,.49/max(1.,pixels)));
      pos+=n*(bend+sign(uv.y)*radius);
      gl_Position=camera*vec4(pos,1.);
      mat=-1.;
    }
  }`;
  const prints=[3.26,1.56,-.14,-1.735];
  const printCenterY=2.045,matFront=-5.700,matCut=.004,printDepth=.0065;
  const overheadLights=[[.35,3.744,2.60],[.35,3.744,-1.56]];
  const lampSlope=1.85,lampFar=5.0;
  const projectionBeat=2.50;
  const lensLink=measureLensLink();
  const fragment = `precision highp float;
  const float kitMM=${rangefinderMM};
  const vec2 cameraFoot=vec2(${cameraFoot[0].toFixed(6)},${cameraFoot[2].toFixed(6)}),lensFoot=vec2(${lensFoot[0].toFixed(6)},${lensFoot[2].toFixed(6)});
  varying vec3 pos,norm,col,lightUV; varying vec2 tex; varying float mat,localContact;
  varying vec3 fineLightUV;
  uniform vec4 printCenters;
  uniform vec3 overhead[2],profileLamps[2],profileAxes[2];
  uniform sampler2D atlas, shadowDepth, runnerMap, metalFinish, roomSurfaces;
  uniform sampler2D cardInk, fromScreen, toScreen;
  ${separateRadiance?'uniform sampler2D irradianceMap;':''}
  uniform vec2 radianceTexel;
  uniform bool hasRoomRadiance;
  uniform bool hasFineLight;
  uniform float activeCard, priorCard, deskMix;
  uniform highp float cardLift[6];
  uniform vec3 eyePoint, sunDirection, shadowAxisU, shadowAxisV;
  uniform float shadowPixel, hasShadows;
  uniform float darkroomWhite;
  uniform bool fastShadows;
  uniform float projectionReveal;
  uniform float projectionTime;
  uniform vec4 linkFrame;
  float hash(vec2 p){
    vec3 a=fract(vec3(p.xyx)*.1031);
    a+=dot(a,a.yzx+33.33);
    return fract((a.x+a.y)*a.z);
  }
  float noise(vec2 p){
    vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);
  }
  float occlusion(vec3 n){
    if(hasShadows<.5 || any(lessThan(lightUV,vec3(0.))) || any(greaterThan(lightUV,vec3(1.))))return 1.;
    // Each neighbouring texel stores depth at its centre, which can differ
    // substantially from the receiver depth on an obliquely lit floor.
    float incidence=dot(n,sunDirection);
    if(incidence<=0.)return 1.;
    vec2 slope=vec2(dot(n,shadowAxisU),dot(n,shadowAxisV))/max(incidence,.08);
    vec2 grid=lightUV.xy/shadowPixel-.5;
    vec2 cell=floor(grid),phase=fract(grid);
    float visible=0.;
    if(fastShadows){
      for(int x=0;x<2;x++)for(int y=0;y<2;y++){
        vec2 offset=vec2(float(x),float(y));
        vec2 uv=(cell+offset+.5)*shadowPixel;
        vec2 rg=texture2D(shadowDepth,uv).rg;
        vec2 weight=1.-abs(offset-phase);
        float receiver=lightUV.z+dot(slope,uv-lightUV.xy);
        visible+=weight.x*weight.y*step(receiver-.00018,rg.r+rg.g/255.);
      }
      return visible;
    }
    // Tent weights follow the receiver continuously across shadow texel boundaries.
    for(int x=-1;x<=2;x++)for(int y=-1;y<=2;y++){
      vec2 offset=vec2(float(x),float(y));
      vec2 weight=max(vec2(0.),2.-abs(offset-phase));
      vec2 sampleUV=(cell+offset+.5)*shadowPixel;
      vec2 rg=texture2D(shadowDepth,sampleUV).rg;
      float receiver=lightUV.z+dot(slope,sampleUV-lightUV.xy);
      visible+=weight.x*weight.y*step(receiver-.00018,rg.r+rg.g/255.);
    }
    return visible/16.;
  }
  // RG holds the sun map. BA holds a 2 x 2 grid for the indoor fixtures.
  const float lampSlope=${lampSlope},lampFar=${lampFar.toFixed(1)};
  float fixtureDepth(vec2 uv,vec2 tile){
    float edge=shadowPixel;
    vec2 ba=texture2D(shadowDepth,.5*(tile+clamp(uv,edge,1.-edge))).ba;
    return lampFar*(ba.x+ba.y/255.);
  }
  float fixtureVisibility(vec3 fromLight,vec3 n,vec2 tile,float emitterRadius){
    if(hasShadows<.5)return 1.;
    float depth=-fromLight.y;
    vec3 direction=fromLight/depth;
    vec2 uv=.5+direction.xz/(2.*lampSlope);
    vec2 gradient=-depth*2.*lampSlope*n.xz/min(-.15,dot(n,direction));
    float texel=2.*shadowPixel,blockers=0.,total=0.;
    for(int i=0;i<5;i++){
      float a=float(i)*1.570796;
      vec2 off=i==4?vec2(0.):vec2(cos(a),sin(a))*.008;
      float sampleDepth=fixtureDepth(uv+off,tile);
      if(sampleDepth<depth+dot(gradient,off)-.013){total+=sampleDepth;blockers+=1.;}
    }
    float separation=max(0.,depth-total/max(blockers,1.));
    float radius=blockers>0. ? emitterRadius*separation/(max(.4,depth-separation)*2.*lampSlope*depth) : 0.;
    radius=clamp(radius,texel*1.15,.025);
    float visible=0.;
    float samples=fastShadows?4.:12.;
    for(int i=0;i<12;i++){
      if(float(i)>=samples)break;
      float f=float(i)+.5,a=f*2.399963;
      vec2 off=radius*sqrt(f/samples)*vec2(cos(a),sin(a));
      // Compare against the receiver at the centre of the sampled texel.
      vec2 actual=(floor((uv+off)/texel)+.5)*texel-uv;
      visible+=step(depth+dot(gradient,actual)-.004,fixtureDepth(uv+off,tile));
    }
    return visible/samples;
  }
  vec3 lampLight(vec3 p,vec3 n,vec3 origin,vec3 tint,float power){
    vec3 L=origin-p;
    float r2=max(dot(L,L),.004);
    float cone=smoothstep(.30,.87,(origin.y-p.y)/sqrt(r2));
    return tint*(power*cone*max(dot(n,L*inversesqrt(r2)),0.)/(1.+3.4*r2));
  }
  vec3 spot(vec3 p,vec3 n,vec3 origin,vec3 axis,vec3 tint,float power,vec2 cone){
    vec3 delta=origin-p;
    float r2=max(dot(delta,delta),.01);
    vec3 L=delta*inversesqrt(r2);
    float beam=smoothstep(cone.x,cone.y,dot(-L,axis));
    return tint*(power*beam*max(dot(n,L),0.)/(.45+r2));
  }
  float belowDesk(vec3 p,vec3 source,float top,vec2 center,vec2 halfSize){
    if(p.y>=top-.004)return 1.;
    vec2 hit=mix(p.xz,source.xz,(top-p.y)/(source.y-p.y));
    vec2 edge=abs(hit-center)-halfSize;
    return smoothstep(-.025,.025,max(edge.x,edge.y));
  }
  float band(float x,float a,float b,float blur){
    return smoothstep(a-blur,a+blur,x)*(1.-smoothstep(b-blur,b+blur,x));
  }
  float windowSun(vec3 p){
    float t=(5.84-p.x)/sunDirection.x;
    vec3 hit=p+t*sunDirection;
    float blur=.025+max(t,0.)*.009;
    float side=band(hit.y,1.13,3.45,blur)*band(hit.z,-2.37,4.17,blur);
    float mullion=abs(mod(hit.z+2.40+.825,1.65)-.825);
    side*=smoothstep(.028-blur,.028+blur,mullion)*(1.-band(hit.y,2.93,2.98,blur));
    return side*step(0.,t);
  }
  float roomAir(vec3 p){
    return band(p.x,-5.76,5.76,.02)*band(p.z,-4.84,6.84,.02)*band(p.y,0.,4.08,.04)
      *(1.-step(p.x,-1.62)*step(p.z,-2.81)*step(p.y,3.22));
  }
  vec4 projectionInk(vec2 uv){
    vec4 ink=texture2D(atlas,uv);
    if(linkFrame.z>0.){
      vec2 p=uv*vec2(${lensPanel.width.toFixed(1)},${lensPanel.height.toFixed(1)});
      vec2 inset=min(p-linkFrame.xy,linkFrame.zw-p);
      float border=1.-smoothstep(.45,1.7,abs(min(inset.x,inset.y)));
      ink.rgb=mix(ink.rgb,vec3(.62,.99,.91),border*.83);
      ink.a=max(ink.a,border*.88);
    }
    return ink;
  }
  vec4 projectionFringe(vec2 uv,vec4 ink,float time){
    // Distance in units of panel height keeps the falloff even on all four sides.
    vec2 q=abs(uv-.5)*vec2(2.,1.)-vec2(.865,.365);
    float inset=.135-length(max(q,vec2(0.)))-min(max(q.x,q.y),0.);
    if(inset>.14)return ink;

    float row=floor(uv.y*94.);
    float jitter=noise(vec2(row,time*2.2));
    float patches=noise(uv*vec2(17.,23.)+vec2(time*.39,-time*.47));
    float depth=inset+(jitter-.5)*.045+(patches-.5)*.074;
    float feather=smoothstep(.014,.100,depth);
    ink.a*=feather;

    // Broken bands of cyan light spread out beyond the tint and lose registration
    // a row at a time. Keep the centre, including its lettering, at full resolution.
    float signal=smoothstep(.40,.73,.72*patches+.28*jitter);
    float lines=.45+.55*smoothstep(-.5,.65,cos(uv.y*390.));
    float fringe=exp(-80.*abs(depth-.046))+.40*exp(-115.*abs(depth-.072));
    float light=.56*signal*lines*fringe*smoothstep(.001,.024,inset)*(1.-ink.a);
    vec3 emission=mix(vec3(.26,.84,1.),vec3(.64,1.,.81),jitter);
    float alpha=ink.a+light;
    return vec4((ink.rgb*ink.a+emission*light)/max(alpha,.0001),alpha);
  }
  float chartVisibility(vec2 uv, vec4 chart){
    return texture2D(roomSurfaces,(chart.xy+.5+clamp(uv,0.,1.)*(chart.zw-1.))/vec2(2048.,1024.)).r;
  }
  vec4 surfaceMaterial(vec2 uv){
    return texture2D(roomSurfaces,uv*vec2(.5,1.));
  }
  vec3 radianceSlice(vec2 xz,float tile){
    vec2 pixel=vec2(${fineAtlas||separateRadiance?'.5':'1024.5'},.5)+88.*vec2(mod(tile,11.),floor(tile/11.))+xz;
    ${fineAtlas?'float strip=floor(pixel.y/704.);pixel=vec2(pixel.x+strip*968.,3392.+pixel.y-strip*704.);':''}
    vec3 encoded=texture2D(${separateRadiance?'irradianceMap':'runnerMap'},pixel*radianceTexel${separateRadiance?'':',-14.'}).rgb;
    return 4.*encoded*encoded;
  }
  vec3 roomIrradiance(vec3 p,vec3 n){
    vec3 grid=clamp((p+.055*n-vec3(-5.8,.03,-4.88))/vec3(11.59,4.05,11.75),0.,1.)*vec3(87.,39.,87.);
    float y=floor(grid.y);
    vec3 result=vec3(0.);
    for(int i=0;i<3;i++){
      float component=n[i],face=2.*float(i)+(component<0.?1.:0.);
      if(abs(component)>.001){
        float tile=40.*face+y;
        result+=component*component*mix(radianceSlice(grid.xz,tile),
          radianceSlice(grid.xz,40.*face+min(39.,y+1.)),fract(grid.y));
      }
    }
    return result;
  }
  float roomVisibility(vec3 p,vec3 n){
    vec2 xz=(p.xz+vec2(5.9,5.))/vec2(11.8,12.);
    if(mat>8.5 && mat<9.5 && n.y>.98){
      float floorAO=chartVisibility(xz,vec4(0.,0.,512.,512.));
      vec2 local=p.xz-vec2(3.90,5.65),span=vec2(1.55,1.10);
      vec2 edge=min(local,span-local);
      float inset=min(edge.x,edge.y);
      if(inset<=0.)return floorAO;
      vec2 size=vec2(1024.,768.);
      vec2 pixel=vec2(1024.,0.)+clamp(local/span*size,vec2(.5),size-.5);
      float contact=texture2D(roomSurfaces,pixel/vec2(2048.,1024.)).r;
      return mix(floorAO,contact,smoothstep(0.,.045,inset));
    }
    if(mat>1.5 && mat<2.5){
      if(n.y<-.98 && abs(p.y-4.10)<.008) return chartVisibility(xz,vec4(512.,0.,512.,512.));
      vec2 xy=vec2(xz.x,p.y/4.12),zy=vec2(xz.y,xy.y);
      if(n.z>.98 && abs(p.z+4.865)<.008) return chartVisibility(xy,vec4(0.,512.,512.,176.));
      if(n.x<-.98 && abs(p.x-5.77)<.008) return chartVisibility(zy,vec4(512.,512.,512.,176.));
      if(n.x>.98 && abs(p.x+5.78)<.008) return chartVisibility(zy,vec4(0.,688.,512.,176.));
      if(n.z<-.98 && abs(p.z-6.86)<.008) return chartVisibility(xy,vec4(512.,688.,512.,176.));
    }
    if(mat>.5 && mat<1.5 && n.y>.95){
      if(abs(p.y-.99)<.003 && abs(p.z-1.73)<.93)
        return chartVisibility((p.xz-vec2(-.17,.805))/vec2(4.64,1.85),vec4(0.,864.,384.,152.));
      if(abs(p.y-.82)<.003 && abs(p.z+3.92)<.58)
        return chartVisibility((p.xz-vec2(.54,-4.495))/vec2(4.02,1.15),vec4(384.,864.,320.,112.));
      if(abs(p.y-.355)<.003 && abs(p.z-1.73)<.83)
        return chartVisibility((p.xz-vec2(-.075,.905))/vec2(4.45,1.65),vec4(704.,864.,320.,128.));
    }
    return 1.;
  }
  // Reflection of the large window in a satin surface. Project the reflected
  // ray into the actual window opening; apparent edge width grows with roughness.
  float reflectedWindow(vec3 r, float rough){
    float travel=(5.77-pos.x)/max(.08,r.x);
    vec2 hit=pos.yz+r.yz*travel;
    float spread=.18+travel*(.15+.95*rough*rough);
    vec2 edge=min(hit-vec2(1.10,-2.40),vec2(3.50,4.20)-hit);
    vec2 visible=smoothstep(vec2(-spread),vec2(spread),edge);
    float side=visible.x*visible.y*smoothstep(.05,.26,r.x);
    // The clerestory behind the monitors also reflects across the front of the bench.
    travel=(pos.z+4.94)/max(.08,-r.z);
    hit=pos.xy+r.xy*travel;
    spread=.12+travel*(.10+.78*rough*rough);
    edge=min(hit-vec2(-5.8,3.22),vec2(5.8,4.09)-hit);
    visible=smoothstep(vec2(-spread),vec2(spread),edge);
    return side+.82*visible.x*visible.y*smoothstep(.06,.29,-r.z);
  }
  vec3 benchReflection(vec3 r,float rough){
    vec2 oct=r.xy/(abs(r.x)+abs(r.y)+abs(r.z));
    if(r.z<0.)oct=(1.-abs(oct.yx))*mix(vec2(-1.),vec2(1.),step(vec2(0.),oct));
    vec2 uv=(vec2(.5,1536.5)+159.*(.5+.5*oct))/2048.;
    vec3 sharp=texture2D(atlas,uv).rgb, satin=texture2D(atlas,uv+vec2(160./2048.,0.)).rgb;
    return 4.*mix(sharp*sharp,satin*satin,rough);
  }
  // Apparent scatter from an opal diffuser, with an elliptical footprint
  // at oblique angles. Only receivers behind the luminous face can carry it.
  float diffuserGlow(vec3 origin,vec3 axis,float radius,vec3 sight,float depth){
    vec3 delta=origin-eyePoint;
    float reach=dot(delta,sight);
    if(reach<.05 || depth<reach-.045)return 0.;
    float facing=dot(-sight,axis);
    if(facing<=.025)return 0.;
    vec3 offset=reach*sight-delta;
    float across=dot(offset,axis);
    float width=max(.18,facing);
    float distanceFromEdge=sqrt(max(0.,dot(offset,offset)+across*across/(width*width)))-radius;
    float d=max(0.,distanceFromEdge)/(radius+.008*reach);
    return smoothstep(.025,.40,facing)*(.16*exp(-3.3*d)+.062*exp(-.92*d*d));
  }
  void main(){
    vec3 n=normalize(norm),base=col;
    if(mat<-31.5){
      if(mat<-33.5){
        vec2 uv=tex;
        float sweep=0.,tracking=0.,separation=0.;
        if(projectionTime>=0.){
          // Most bursts catch two lines. A third joins every fourth burst.
          // Offset their starts and reverse direction on successive strips.
          float cycle=floor(projectionTime/${projectionBeat});
          float line=tex.y<.380?0.:tex.y<.511?1.:tex.y<.71?2.:3.;
          float order=mod(line+cycle,4.);
          float phase=mod(projectionTime,${projectionBeat})-.18*fract(cycle*.618)-.026*order;
          float row=(line<1.?151.:line<2.?238.:line<3.?285.:${((lensLink.bounds[1]+lensLink.bounds[3])/2).toFixed(2)})/512.+.014*(fract((cycle+line)*.382+.31)-.5);
          float burst=smoothstep(.045,.061,phase)*(1.-smoothstep(.119,.185,phase));
          if(order<2. || (order==2. && mod(cycle,4.)==1.))tracking=burst*(1.-smoothstep(.010,.035,abs(tex.y-row)));
          float slip=tracking*(1.-2.*mod(cycle+order,2.));
          uv.x+=.013*slip*(1.-1.18*smoothstep(.101,.129,phase));
          separation=.0045*slip;
          sweep=1.-smoothstep(.0,.059,abs(tex.y-(fract(projectionTime*.26)*1.14-.07)));
        }
        vec4 panel=projectionInk(uv);
        if(tracking>.01){
          vec4 green=projectionInk(uv+vec2(separation,0.));
          vec4 magenta=projectionInk(uv-vec2(separation,0.));
          panel.rgb=mix(panel.rgb,vec3(magenta.r,green.g,magenta.b),.90*tracking);
          panel.a=max(panel.a,.90*tracking*max(green.a,magenta.a));
        }
        panel=projectionFringe(tex,panel,max(0.,projectionTime));
        panel.rgb+=sweep*vec3(.015,.048,.043);
        float height=1.-tex.y;
        float scan=1.-smoothstep(.0,.045,abs(height-projectionReveal));
        float visible=smoothstep(height-.025,height+.025,projectionReveal*1.08-.03);
        gl_FragColor=vec4(panel.rgb+vec3(.11,.43,.32)*scan*(1.-step(.998,projectionReveal)),panel.a*visible);
      }else if(mat<-32.5){
        float height=1.-tex.y;
        float rayPosition=tex.x/mix(.045,1.,height),side=abs(rayPosition);
        float drift=projectionTime>=0.?.15*sin(projectionTime*2.1+height):0.;
        float ray=.18*pow(max(0.,cos(11.*rayPosition+height*.85+drift)),14.);
        float rim=.26*exp(-85.*abs(side-.93));
        float alpha=(.058+ray+rim)*(1.-smoothstep(.93,1.,side))*(1.15-.70*height);
        vec3 tint=mix(vec3(.58,1.,.80),vec3(.29,.91,1.),clamp(.5+.5*rayPosition,0.,1.));
        gl_FragColor=vec4(tint,alpha*smoothstep(height-.10,height+.06,min(1.1,projectionReveal*2.)));
      }else{
        vec2 p=(tex-.5)*2.;float r=length(p);
        float arc=.65*exp(-65.*abs(r-.89));
        float source=exp(-8.*length(p-vec2(0.,-.38)));
        gl_FragColor=vec4(mix(vec3(.40,1.,.84),vec3(.92,1.,.95),source),
          min(1.,arc+1.35*source+.11*(1.-smoothstep(.30,1.,r)))*projectionReveal);
      }
      return;
    }
    if(mat<-.5){gl_FragColor=vec4(base*.91,1.);return;}
    if(mat>29.5 && mat<30.5){
      // Clear developer reflects the safelight and the ceiling above the trays.
      // Keep the print visible through the flat centre; the curved wet edge
      // reflects a different part of the room as the viewer moves.
      vec3 view=normalize(eyePoint-pos);
      float edge=length(n.xz);
      n=normalize(n+vec3(.013*sin(pos.x*83.+pos.z*31.),0.,.009*sin(pos.z*104.-pos.x*23.)));
      vec3 ray=reflect(-view,n);
      float fresnel=.021+.979*pow(1.-clamp(dot(n,view),0.,1.),5.);
      vec3 ceilingHit=pos+ray*((3.07-pos.y)/max(.01,ray.y));
      float ceiling=smoothstep(-4.88,-4.74,ceilingHit.z)*(1.-smoothstep(-3.04,-2.90,ceilingHit.z));
      vec3 toLamp=vec3(-4.29,2.51,-3.86)-pos;
      float miss=length(cross(ray,toLamp));
      float lamp=(1.-smoothstep(.11,.23,miss))*step(0.,dot(ray,toLamp));
      vec3 tint=mix(vec3(1.,.27,.13),vec3(1.,.99,.97),darkroomWhite);
      float wetEdge=smoothstep(.04,.44,edge);
      float wallLight=.5+.5*dot(n.xz,normalize(toLamp.xz))/max(.001,edge);
      float reflectedLight=mix(mix(.24,.69,ceiling),mix(.12,.95,wallLight),wetEdge);
      vec3 reflection=tint*mix(reflectedLight,1.,lamp);
      gl_FragColor=vec4(reflection,clamp(.035+fresnel+.28*wetEdge+.21*lamp,0.,.68));
      return;
    }
    if(mat>14.5 && mat<15.5){
      vec2 arrive=vec2(clamp(tex.x-.017*(1.-deskMix),.001,.999),tex.y);
      vec3 pixels=mix(texture2D(fromScreen,tex).rgb,texture2D(toScreen,arrive).rgb,deskMix);
      gl_FragColor=vec4(pixels*.96+vec3(.012,.010,.007),1.);
      return;
    }
    if(mat>=15.5 && mat<21.5){
      float id=mat-16.;
      float selected=mix(1.-step(.5,abs(id-priorCard)),1.-step(.5,abs(id-activeCard)),deskMix);
      vec3 ink=mix(vec3(.18,.17,.14),vec3(1.,.97,.87),selected);
      vec3 paper=mix(vec3(.91,.87,.80),vec3(.21,.28,.26),selected);
      base=mix(ink,paper,texture2D(cardInk,tex).r);
    }
    vec3 v=normalize(eyePoint-pos);
    bool suede=mat>27.5 && mat<28.5;
    float foldLight=0.,pileSheen=0.;
    if(suede){
      n=faceforward(n,-v,n);
      // Sample on the developed fabric, so gathering it also compresses the pile.
      vec2 cloth=tex*vec2(1.95,3.6)+vec2(step(0.,pos.z)*2.37,0.);
      // ambientCG Leather038 (CC0). R holds dye variation, GB the tangent normal.
      vec3 pile=texture2D(atlas,cloth*1.65).rgb-.5;
      float brushed=noise(cloth*vec2(7.,3.))-.5;
      vec3 across=normalize(cross(n,vec3(0.,1.,0.)));
      vec3 down=cross(n,across);
      n=normalize(n+across*(.8*pile.g)+down*(.8*pile.b));
      vec3 napNormal=normalize(n+down*(.16+.32*brushed)+across*(.14*brushed));
      vec3 windowFill=normalize(vec3(-.38,.32,sign(.90-pos.z)));
      float exposure=smoothstep(.0,.17,5.46-pos.x);
      foldLight=max(0.,dot(napNormal,windowFill))*(.35+.65*exposure);
      vec3 h=normalize(v+windowFill);
      float nh=clamp(dot(napNormal,h),0.,1.);
      pileSheen=pow(1.-nh*nh,2.2)*smoothstep(-.16,.52,dot(n,windowFill))*(.12+.88*exposure);
      float hem=band(tex.y,.979,.981,.001);
      base*=mix(.70,1.04,exposure)*(1.+.13*brushed+.75*pile.r-.08*hem);
    }
    vec2 surf=abs(n.y)>.60?pos.xz:(abs(n.x)>.60?pos.zy:pos.xy);
    float rough=.82;
    float visibility=roomVisibility(pos,n);
    if(mat<.5)base*=.94+.12*surfaceMaterial(surf*4.8).b;
    if(mat>22.5 && mat<23.5){
      vec2 board=vec2(abs(tex.x),tex.y);
      float rings=board.x*2090.+3.3*noise(board*vec2(22.,2.))+.60*sin(9.*board.y);
      float fiber=noise(board*vec2(210.,8.));
      base*=.91+.15*fiber-.041*pow(.5+.5*sin(rings),5.);
      base.r+=.023*noise(board*vec2(40.,3.));
      float aroundHole=length(tex-vec2(0.,.337));
      base*=.90+.10*smoothstep(.044,.072,aroundHole);
      rough=.46;
    }
    if(mat>23.5 && mat<24.5){
      float edge=clamp(length((tex-vec2(-.015,.19))*vec2(5.2,3.6)),0.,1.);
      base*=mix(vec3(1.19,1.16,1.12),vec3(.80,.74,.72),edge*edge);rough=.23;
    }
    if(mat>25.5 && mat<26.5){
      float amber=noise(tex*60.+noise(tex*27.)*2.5);
      base=mix(vec3(.25,.12,.087),vec3(.64,.39,.18),smoothstep(.28,.77,amber));rough=.33;
    }
    if(mat>26.5 && mat<27.5){
      float pores=noise(tex*vec2(620.,12.));
      base*=.80+.34*pores+.09*noise(tex*vec2(130.,5.));rough=.50;
    }
    if(mat>24.5 && mat<25.5){
      vec2 p=tex*vec2(89.,68.);
      vec2 weave=cos(6.28318*p);
      float detail=1.-smoothstep(1.4,4.3,length(pos-eyePoint));
      float thread=(weave.x*.13+weave.y*.10+.06*sin(p.x*3.14159)*weave.y)*detail;
      float speaker=1.-smoothstep(.84,1.04,length((tex-vec2(.50,.48))*vec2(2.78,1.82)));
      base*=.91+thread-.15*speaker;
    }
    if(mat>.5 && mat<1.5){
      vec2 plank=abs(n.y)>.60?pos.xz:(abs(n.x)>.60?pos.zy:pos.xy);
      vec2 grainUV=plank*vec2(.56,1.18);
      float grain=surfaceMaterial(grainUV).g;
      float slope=grain-surfaceMaterial(grainUV+vec2(0.,.002)).g;
      base*=mix(vec3(.72,.65,.58),vec3(1.16,1.18,1.20),grain);
      rough=(n.y>.85?.43:.49)+.17*(.5-grain);
      vec3 across=abs(n.y)>.60?vec3(0.,0.,1.):vec3(0.,1.,0.);
      n=normalize(n+.17*slope*across);
      if(n.z>.98 && abs(pos.z+4.7575)<.002 && pos.y>1.57 && pos.y<2.70){
        for(int i=0;i<6;i++){
          float lift=cardLift[i];
          vec2 center=vec2(1.17+mod(float(i),3.)*1.03,i<3?2.373:1.863);
          vec2 edge=abs(pos.xy-center+vec2(.071,.048)*lift)-vec2(.46,.203);
          float gap=max(edge.x,edge.y);
          base*=1.-.34*lift*(1.-smoothstep(-.019,.009+.034*lift,gap));
        }
      }
      if(n.y>.94 && abs(pos.y-.99)<.003 && pos.x<1.78 && pos.z>1.73){
        // Short-range occlusion under objects that rest on this tabletop.
        vec2 cameraBase=(pos.xz-cameraFoot)/kitMM;
        cameraBase=mat2(.9992,.04,-.04,.9992)*cameraBase;
        float bodyGap=length(vec2(max(abs(cameraBase.x)-52.,0.),cameraBase.y))-16.8;
        float lensGap=length(pos.xz-lensFoot)/kitMM-21.1;
        float gap=max(min(bodyGap,lensGap),0.);
        base*=1.-.17*exp(-gap*.28);
      }
    }else if((mat>1.5 && mat<2.5) || (mat>8.5 && mat<9.5)){
      float mineral=surfaceMaterial(surf*.76).b;
      base*=.91+.13*noise(surf*1.45)+.22*(mineral-.5);
      if(n.y>.85 && pos.y<.08) rough=.53+.16*mineral;
    }else if(mat>2.5 && mat<3.5){
      // Blend planar samples across rounded shells. Each tile spans 38 cm.
      vec3 weights=pow(abs(n),vec3(6.)); weights/=dot(weights,vec3(1.));
      vec3 finish=texture2D(metalFinish,pos.zy/.38).rgb*weights.x
                 +texture2D(metalFinish,pos.xz/.38).rgb*weights.y
                 +texture2D(metalFinish,pos.xy/.38).rgb*weights.z;
      float brush=finish.r-.5, scratch=finish.g, patina=finish.b;
      bool coated=base.g>base.r*1.11 && base.b>base.r*1.09;
      if(!coated){
        base*=1.+.22*brush-.10*patina;
        base=mix(base,vec3(.68,.66,.60),scratch*.24);
        rough=clamp(.24+.14*brush+.20*scratch+.13*patina,.13,.56);
      }else rough=.23;
    }
    bool mountedPrint=mat>28.5 && mat<29.5;
    float trackVisibility=1.;
    if(mountedPrint){
      // For photographic paper the colour attribute carries centre Z and half extents.
      vec2 local=vec2(pos.z-col.x,pos.y-${printCenterY});
      vec2 edge=col.yz-abs(local);
      float contact=smoothstep(0.,.003,min(edge.x,edge.y));
      base=texture2D(atlas,tex).rgb*mix(.94,1.,contact);
      // Project the upper cut edge onto the paper from the centre of its track light.
      float topShadow=${printDepth}*(3.72-pos.y)/(-4.58-pos.x)-${matCut};
      trackVisibility=smoothstep(topShadow-.0015,topShadow+.0015,col.z-local.y);
    }
    if(mat>4.5 && mat<6.5)base*=texture2D(atlas,tex).rgb;
    if(mat>8.5 && mat<9.5 && n.y>.85){
      vec2 jointUV=(pos.xz-vec2(-4.80,-4.77))/vec2(3.08,1.38);
      base*=.30+.70*surfaceMaterial(jointUV).a;
      if(pos.x>3.7 && pos.z>5.05){
        vec2 d=pos.xz-vec2(5.18,6.40);
        vec2 local=vec2(dot(d,vec2(-.737,.675)),dot(d,vec2(-.675,-.737)));
        float cabinet=length(max(abs(local)-vec2(.213,.096),vec2(0.)));
        float stands=min(length((pos.xz-vec2(5.35,5.59))*vec2(.90,1.)),length(pos.xz-vec2(4.45,6.37)));
        base*=1.-.32*exp(-cabinet*15.)-.15*exp(-stands*5.6);
      }
    }
    if(mat>7.5 && mat<8.5)base=texture2D(runnerMap,${separateRadiance?'tex':fineAtlas?'vec2(.75+clamp(tex.x,.0006,.9994)*.25,tex.y)':'vec2(clamp(tex.x,.0006,.9994)*.5,tex.y)'}).rgb;
    if(mat>9.5 && mat<10.5){
      float u=tex.x,t=tex.y;
      float midrib=1.-smoothstep(.008,.052,abs(u)/(1.08-.72*t));
      float ribPhase=t*7.2-abs(u)*(.75+.40*t)-.20*u*u+.09*sin(t*17.);
      float rib=(1.-smoothstep(.012,.085,abs(fract(ribPhase+.5)-.5)))
                *(1.-smoothstep(.64,1.,abs(u)))*smoothstep(.04,.18,t);
      float pigment=noise(vec2(u*3.+pos.z*6.,t*5.+pos.x*7.));
      base=mix(base*mix(.78,1.16,pigment),vec3(.49,.57,.25),
               .40*smoothstep(.62,.84,pigment+.09*noise(tex*24.))+.35*midrib+.14*rib);
      if(dot(n,v)<0.){n=-n;base=mix(base,vec3(.41,.48,.26),.20);}
      rough=.38+.15*pigment;
    }
    if(mat>10.5 && mat<14.5){
      rough=.36;
      if(mat>11.5 && mat<12.5){
        // Seamless macro sample of the owner's leatherette, in world space,
        // so its grain runs continuously over the rounded shoulders.
        vec3 weight=abs(n);weight*=weight;weight/=dot(weight,vec3(1.));
        vec3 p=pos/(24.6*kitMM);
        vec2 origin=vec2(1024.5,.5)/2048.,size=vec2(223./2048.);
        float grain=weight.x*texture2D(atlas,origin+fract(p.zy)*size).r
                   +weight.y*texture2D(atlas,origin+fract(p.xz)*size).r
                   +weight.z*texture2D(atlas,origin+fract(p.xy)*size).r;
        float detail=1.-smoothstep(1.5,3.7,length(eyePoint-pos));
        base*=mix(.92,.64+.98*grain,detail);rough=.64;
        if(abs(n.z)>.7){
          vec2 g=origin+fract(p.xy)*size;
          vec2 texel=vec2(1./2048.,0.);
          vec2 slope=vec2(texture2D(atlas,g+texel).r-texture2D(atlas,g-texel).r,
                          texture2D(atlas,g+texel.yx).r-texture2D(atlas,g-texel.yx).r);
          n=normalize(n-vec3(.42*detail*slope,0.));
        }
      }
      if(mat>13.5)base*=texture2D(atlas,tex).rgb;
      if(mat<11.5)base*=.92+.17*texture2D(metalFinish,surf/.145).r;
    }
    float dark=smoothstep(2.92,3.04,-pos.z)*smoothstep(1.63,1.74,-pos.x)*(1.-smoothstep(3.08,3.18,pos.y));
    float diffuse=max(dot(n,sunDirection),0.);
    float shadow=windowSun(pos)*(1.-dark);
    if(shadow>0. && diffuse>0.)shadow*=occlusion(n);
    vec3 toWindow=vec3(5.84,2.40,clamp(pos.z,-2.1,4.0))-pos;
    float sky=(.26+.74*max(dot(n,normalize(toWindow)),0.))/(1.+.065*dot(toWindow,toWindow));
    float highSky=max(dot(n,normalize(vec3(clamp(pos.x,-5.6,5.6),3.65,-4.95)-pos)),0.)/(1.+.22*pow(pos.z+4.94,2.));
    float contact=.76+.24*smoothstep(0.,.58,pos.y);
    vec3 indirect=mix(vec3(.36,.30,.24),vec3(.42,.43,.44),.5+.5*n.y)*contact;
    vec3 skyFill=vec3(.70,.81,.97)*(sky+.42*highSky);
    vec3 ambient=indirect*mix(.12,1.,visibility*sqrt(visibility))+skyFill*visibility;
    vec3 fineField=vec3(0.);
    if(hasFineLight){
      vec3 encoded=texture2D(${separateRadiance?'irradianceMap':'runnerMap'},fineLightUV.xy*radianceTexel${separateRadiance?'':',-14.'}).rgb;
      fineField=4.*encoded*encoded;
    }
    if(hasRoomRadiance && dark<.999){
      vec3 field=fineField;
      if(!hasFineLight || fineLightUV.z<.999)
        field=mix(roomIrradiance(pos,n),fineField,hasFineLight?fineLightUV.z:0.);
      field=mix(field,vec3(dot(field,vec3(.24,.66,.10))),.14);
      ambient=(vec3(.252,.246,.236)+1.52*sqrt(field*(field+.30)))*mix(.62,1.,visibility)*max(.44,1.-.70*localContact);
      if(mat>1.5 && mat<2.5){
        if(pos.y>4.04 && n.y<-.85)ambient*=.53+.14*smoothstep(2.,5.8,pos.x);
        if(abs(n.y)<.3 && pos.y<2.8){
          vec2 floorCell=clamp((pos.xz+.12*n.xz-vec2(-5.8,-4.88))/vec2(11.59,11.75),0.,1.)*87.;
          ambient+=vec3(.46,.40,.34)*radianceSlice(floorCell,80.)*exp(-.90*pos.y)*visibility;
        }
      }
      if(mat>8.5 && mat<9.5)ambient*=mix(.15,1.,smoothstep(.18,.91,visibility));
    }
    vec3 light=ambient+vec3(1.77,1.37,1.03)*shadow*diffuse;
    // Daylight grazes the actual recess. It is strongest beside the glazing,
    // rolls into the wall below the sill, and fades around the two jambs.
    if(mat>1.5 && mat<2.5 && pos.x>5.48 && pos.x<5.97){
      vec2 gap=max(max(vec2(1.10,-2.40)-pos.yz,pos.yz-vec2(3.50,4.20)),vec2(0.));
      float reach=exp(-4.8*length(gap));
      float reveal=max(abs(n.z)*(.77+.23*n.z),max(n.y,0.));
      light+=reach*(vec3(.47,.42,.36)*(.60+.40*max(-n.x,0.))+vec3(.94,.94,.91)*reveal);
    }
    bool oakSill=mat>.5 && mat<1.5 && pos.x>5.50 && pos.x<5.98 && abs(pos.z-.9)<3.41 && abs(pos.y-1.068)<.05;
    if(oakSill){
      float top=smoothstep(.08,.91,n.y);
      light+=top*vec3(.53,.57,.62)+vec3(.12,.11,.10);
    }
    if(suede)light+=vec3(.31,.30,.29)*foldLight;
    for(int i=0;i<2;i++){
      vec3 toLamp=overhead[i]-pos;
      float r2=max(dot(toLamp,toLamp),.001);
      vec3 l=toLamp*inversesqrt(r2);
      float incidence=max(0.,dot(n,l)),cone=smoothstep(.49,.67,l.y);
      if(toLamp.y>.07 && incidence*cone>.005 && dark<.99){
        float transmission=fixtureVisibility(-toLamp,n,vec2(float(i),0.),.235);
        light+=vec3(1.,.896,.759)*(7.6*incidence*l.y*cone*transmission/(1.4+r2));
      }
    }
    vec3 benchLamp=vec3(.574,1.765,1.37),deskLamp=vec3(2.69,1.56,-4.123);
    vec3 lampAxis=normalize(vec3(.10,-.19,.04)),warmWhite=vec3(1.,.76,.51);
    light+=spot(pos,n,benchLamp,lampAxis,warmWhite,3.8,vec2(.51,.87))
          *belowDesk(pos,benchLamp,.99,vec2(2.15,1.73),vec2(2.32,.925));
    for(int j=-1;j<=1;j++){
      vec3 emitter=deskLamp+vec3(float(j)*.18,0.,0.);
      light+=spot(pos,n,emitter,normalize(vec3(0.,-.80,.60)),vec3(1.,.90,.77),.37,vec2(.58,.92))
            *belowDesk(pos,emitter,.82,vec2(2.55,-3.92),vec2(2.01,.575));
    }
    vec3 wallAim=normalize(vec3(-1.08,-1.67,0.));
    for(int i=0;i<4;i++){
      float z=printCenters[i];
      light+=trackVisibility*spot(pos,n,vec3(-4.58,3.72,z),wallAim,vec3(1.,.91,.80),5.4,vec2(.80,.95));
    }
    for(int i=0;i<2;i++){
      vec3 axis=profileAxes[i];
      vec3 ray=pos-profileLamps[i];
      float depth=dot(ray,axis),r2=dot(ray,ray);
      float cosine=clamp(depth*inversesqrt(max(.001,r2)),0.,1.);
      float beam=smoothstep(.70,.95,cosine);
      // Keep the playlist head's flux when focusing it across the two rows.
      float intensity=i==1?2.70*pow(cosine,18.):beam*beam;
      float facing=dot(n,-ray)*inversesqrt(max(.001,r2));
      if((i==1?intensity:beam)*facing>.002 && depth>.08 && depth<lampFar){
        vec3 right=normalize(cross(vec3(0.,1.,0.),axis)),up=cross(axis,right);
        vec3 localRay=vec3(dot(ray,right),-depth,dot(ray,up));
        vec3 localNormal=vec3(dot(n,right),-dot(n,axis),dot(n,up));
        float visible=fixtureVisibility(localRay,localNormal,vec2(float(i),1.),.063);
        light+=vec3(1.,.88,.76)*(4.2*intensity*facing*visible/(.45+r2));
      }
    }
    vec3 pendant=vec3(-4.34,2.40,4.08);
    light+=spot(pos,n,pendant,vec3(0.,-1.,0.),vec3(1.,.85,.68),3.9,vec2(.12,.68))
          *belowDesk(pos,pendant,.75,vec2(-4.34,4.08),vec2(1.275,.395));
    vec3 bulbTint=mix(vec3(1.,.07,.012),vec3(1.,.99,.97),darkroomWhite);
    vec3 fill=mix(vec3(.065,.012,.006),vec3(.40,.40,.39),darkroomWhite);
    vec3 bounce=mix(vec3(.78,.065,.016),vec3(.64,.64,.63),darkroomWhite);
    vec3 darkroomLamp=lampLight(pos,n,vec3(-4.29,2.49,-3.86),bulbTint,6.0);
    vec3 safeOffset=pos-vec3(-4.29,2.2,-3.86);
    float safeVisibility=mix(.52,1.,visibility)*(1.-.65*localContact);
    light=mix(light,safeVisibility*(fill+bounce/(1.+.65*dot(safeOffset,safeOffset)))+darkroomLamp,dark);
    vec3 result=pow(max(base,vec3(0.)),vec3(2.2))*light;
    if(mat>33.5 && mat<34.5){
      vec3 r=reflect(-v,n);
      float grazing=pow(1.-max(dot(n,v),0.),3.);
      vec3 coating=benchReflection(r,.58);
      float window=reflectedWindow(r,.29);
      result+=coating*(.042+.39*grazing)+vec3(.88,.94,1.)*window*(.09+.48*grazing);
      for(int i=0;i<2;i++){
        vec3 lampDir=overhead[i]-pos;
        float spot=pow(max(dot(r,normalize(lampDir)),0.),32.);
        result+=vec3(1.,.90,.78)*spot*.80/(1.+.18*dot(lampDir,lampDir));
      }
    }
    if(mat<.5 && dark<.5){
      // Paper, painted housings and coated cases share a weak dielectric
      // reflection. It varies with the opening's apparent size and angle.
      float grazing=pow(1.-max(dot(n,v),0.),4.);
      float pane=reflectedWindow(reflect(-v,n),.66);
      result+=vec3(.84,.92,1.)*(.018+.095*grazing)*pane*(1.-.60*localContact);
    }
    if(mat>2.5 && mat<3.5 && pos.y>.95 && pos.y<1.69 && abs(pos.z-1.59)<1. && abs(pos.x-2.3)<2.25){
      // The optical rail, gauge and caliper all see the same bright strip of
      // glazing. The machined sides pick it up as the viewer moves past them.
      vec3 r=reflect(-v,n);
      vec3 reflected=benchReflection(r,.34)+vec3(.84,.94,1.08)*reflectedWindow(r,.22);
      float polish=.31+.48*pow(1.-max(dot(n,v),0.),3.);
      result=mix(result,reflected*(.16+.67*base),polish);
    }
    if(oakSill && n.y>.02){
      // Grazing sky on varnish, interrupted by the feet of the window bars.
      float opening=smoothstep(5.51,5.82,pos.x);
      float gap=abs(mod(pos.z+2.40+.825,1.65)-.825);
      float sky=smoothstep(.012,.085+.23*(1.-opening),gap);
      float fres=.12+.42*pow(1.-max(dot(n,v),0.),3.);
      result+=vec3(.98,1.03,1.09)*fres*sky*(.28+.72*opening)*smoothstep(.02,.8,n.y);
    }
    if((mat>10.5 && mat<14.5) || (mat>31.5 && mat<32.5)){
      bool mount=mat>31.5;
      float chrome=mount?1.:0.;
      float pebbled=mat>11.5 && mat<12.5?1.:0.;
      vec2 radial=(pos.xy-vec2(cameraFoot.x,${kitCenter[1]}))/kitMM-vec2(11.,32.4);
      float ringRadius=length(radial);
      if(mount && n.z>.88){
        float lip=.45*smoothstep(24.6,25.7,ringRadius)-.72*(1.-smoothstep(21.9,22.8,ringRadius));
        n=normalize(n+vec3((radial/max(ringRadius,.01))*(lip+.12),0.));
      }
      vec3 environment=benchReflection(reflect(-v,n),mix(mix(.43,.90,pebbled),.19,chrome));
      float grazing=pow(1.-max(dot(n,v),0.),4.);
      result+=environment*(mix(.077,.030,pebbled)+.23*grazing);
      if(mount){
        float machining=.97+.03*cos(ringRadius*12.);
        result=(.029*light+environment*.87)*base*machining;
      }
    }
    if(((mat>.5 && mat<1.5) || (mat>8.5 && mat<9.5)) && n.y>.85 && dark<.5){
      vec3 r=reflect(-v,n);
      float facing=1.-max(dot(n,v),0.);
      float fresnel=(mat>8.5?.034:.039)+.38*pow(facing,5.);
      vec3 reflected=vec3(1.01,1.17,1.30)*reflectedWindow(r,rough)*(mat>8.5?3.9:2.85);
      for(int i=0;i<2;i++){
        vec3 towards=overhead[i]-pos;
        float distance2=dot(towards,towards);
        float sheen=pow(max(dot(r,towards*inversesqrt(distance2)),0.),mix(75.,22.,rough));
        reflected+=vec3(1.,.80,.56)*sheen*(13./(2.+distance2));
      }
      vec3 toBulb=benchLamp-pos;
      float bulbDistance2=max(dot(toBulb,toBulb),.01);
      vec3 bulbDirection=toBulb*inversesqrt(bulbDistance2);
      float bulbCone=smoothstep(.36,.86,dot(-bulbDirection,lampAxis));
      float bulbSheen=pow(max(0.,dot(r,bulbDirection)),mix(57.,18.,rough));
      reflected+=warmWhite*bulbCone*bulbSheen*(6./(.4+bulbDistance2));
      result+=fresnel*reflected*visibility*visibility;
    }
    if(n.y>.90 && (mat>8.5 && mat<9.5 || mat>.5 && mat<1.5 && abs(pos.y-.355)<.004)){
      float shelter=1.-smoothstep(.28,.89,visibility);
      result*=mix(vec3(1.),vec3(.55,.49,.45),shelter);
    }
    bool printed=(mat>15.5 && mat<21.5) || (mat>4.5 && mat<6.5) || mountedPrint;
    result=pow(result/(1.+(printed?.47:.24)*result),vec3(1./2.2));
    vec3 halfVec=normalize(v+sunDirection);
    float metal=step(2.5,mat)*(1.-step(3.5,mat));
    float spec=pow(max(dot(n,halfVec),0.),mix(8.,74.,1.-rough));
    if(suede){
      result+=vec3(.103,.086,.071)*pileSheen;
    }else result+=vec3(1.,.87,.69)*spec*shadow*diffuse*mix(.047,.49,metal);
    if(mat>22.5 && mat<24.5){
      vec3 r=reflect(-v,n);
      float gloss=mat>23.5?.23:.09;
      float pane=smoothstep(-.2,.61,r.y)*(1.-smoothstep(.80,1.,r.y));
      result+=gloss*(vec3(.32,.38,.44)*pane+.7*pow(max(0.,1.-abs(dot(n,v))),3.));
    }
    if(mat>9.5 && mat<10.5){
      vec3 windowDir=normalize(toWindow);
      float wax=pow(max(dot(n,normalize(v+windowDir)),0.),29.);
      result+=vec3(.80,.88,.76)*wax*.14+base*max(dot(-n,windowDir),0.)*.12;
    }
    if(metal>.5 && dark<.5){
      vec3 r=reflect(-v,n);
      float strip=pow(max(0.,dot(r,normalize(vec3(-.48,.62,-.53)))),9.);
      float fres=pow(1.-max(dot(n,v),0.),3.);
      vec3 env=mix(vec3(.09,.071,.049),vec3(.39,.42,.43),smoothstep(-.2,.82,r.y));
      float openLight=clamp(dot(ambient,vec3(.24,.66,.10))*1.4+.12,.15,1.);
      float pane=reflectedWindow(r,rough);
      result=mix(result,base*(.32+1.24*env)*sqrt(openLight),.26)+vec3(.86,.88,.89)*(strip*.26+fres*.09+pane*.19)*openLight;
      // Cool lens elements have a broad transmitted tint and tight grazing reflections.
      if(base.g>base.r*1.11 && base.b>base.r*1.09){
        float edge=pow(1.-abs(dot(n,v)),2.3);
        float window=pow(max(0.,dot(r,normalize(vec3(-.3,.63,-.71)))),20.);
        result=mix(base*vec3(.50,.68,.66),vec3(.73,.83,.77),edge*.80)+window*vec3(.44,.50,.52);
      }
    }
    if(mat>10.5 && mat<14.5){
      vec3 r=reflect(-v,n);
      float rim=pow(1.-max(0.,dot(v,n)),3.6);
      float ceiling=smoothstep(.16,.67,r.y);
      float strip=pow(max(dot(r,normalize(vec3(-.46,.67,.54))),0.),18.);
      float softbox=pow(max(dot(r,normalize(vec3(.72,.62,.32))),0.),6.);
      float polished=mat<11.5 || mat>13.5 ? 1. : .35;
      result+=(vec3(.051,.054,.057)*ceiling+vec3(.19,.167,.13)*strip
              +vec3(.065,.077,.092)*softbox+vec3(.09)*rim)*polished;
      if(mat<11.5 || mat>13.5){
        vec3 lampRay=normalize(benchLamp-pos);
        float lampEdge=pow(max(dot(r,lampRay),0.),18.);
        float bounce=pow(max(dot(r,normalize(vec3(-.39,.34,.85))),0.),5.);
        result+=vec3(.19,.14,.085)*lampEdge+vec3(.075,.066,.058)*bounce;
      }
      if(mat>12.5 && mat<13.5){
        float pane=smoothstep(.16,.65,r.y)*(1.-smoothstep(.72,.99,r.y));
        float lightbar=pow(max(dot(r,normalize(vec3(.28,.74,-.61))),0.),60.);
        vec3 element=base*.42+vec3(.064,.119,.112)*pane+vec3(.19,.105,.22)*strip;
        if(n.y>.84){
          float radius=length(pos.xz-lensFoot)/(13.45*kitMM);
          element*=.68+.32*smoothstep(.40,.95,radius);
          float ghost=(radius-.75)/.085;
          element+=vec3(.091,.057,.105)*exp(-ghost*ghost);
        }
        vec3 coating=benchReflection(r,.10)*vec3(.26,.32,.30);
        result=element+coating+vec3(.32,.39,.36)*lightbar+vec3(.14,.18,.18)*rim;
      }
    }
    if(mat>3.5 && mat<4.5)result=base*(.95+.04*clamp(n.y,0.,1.));
    if(mat>30.5 && mat<31.5)result=mix(vec3(1.,.29,.14),vec3(1.,.99,.96),darkroomWhite);
    if(mat>21.5 && mat<22.5){
      float milk=smoothstep(.0,.95,-n.y);
      result=mix(vec3(.85,.76,.63),vec3(1.,.981,.916),milk);
      if(hasFineLight)result*=mix(vec3(1.),.84+.24*sqrt(clamp(fineField,0.,1.)),.78-.48*milk);
    }
    if(mat>32.5 && mat<33.5){
      // Graphite powder coat. The room-facing cap stays dark; the sloping
      // reveal and the polished arris pick up the strip of bright sky.
      float depth=smoothstep(5.783,5.87,pos.x);
      float side=max(abs(n.z)*.54,max(n.y,0.));
      float sheen=side*(.20+.80*depth)*(.35+.65*reflectedWindow(reflect(-v,n),.42));
      vec3 graphite=vec3(dot(base,vec3(.24,.66,.10)));
      result=graphite*(.67+.24*max(-n.x,0.)+.15*depth)+vec3(.74,.77,.80)*sheen*.49;
    }
    if((mat>4.5 && mat<6.5) || mountedPrint)result=mix(result,base,.13*(1.-dark));

    // Integrate single scattering only along the visible eye-to-surface segment.
    // Fixed samples keep still views stable; smooth aperture edges broaden with distance.
    vec3 ray=pos-eyePoint;
    float distanceInView=min(length(ray),14.);
    vec3 stepRay=normalize(ray)*(distanceInView/14.);
    float phase=.60+.80*pow(max(dot(normalize(ray),sunDirection),0.),3.);
    float haze=0.;
    for(int i=0;i<14;i++){
      vec3 samplePos=eyePoint+(float(i)+.5)*stepRay;
      haze+=windowSun(samplePos)*roomAir(samplePos);
    }
    result=mix(result,vec3(1.,.81,.58),1.-exp(-haze*(distanceInView/14.)*.022*phase));
    // A small optical halo and six aperture rays around the exposed safelight.
    vec3 toBulb=vec3(-4.29,2.49,-3.86)-eyePoint;
    vec3 sight=normalize(ray),bulbAxis=normalize(toBulb);
    if(dark<.5){
      float glow=diffuserGlow(overhead[0]+vec3(0.,.047,0.),vec3(0.,-1.,0.),.237,sight,length(ray))
                +diffuserGlow(overhead[1]+vec3(0.,.047,0.),vec3(0.,-1.,0.),.237,sight,length(ray))
                +diffuserGlow(vec3(-4.34,2.445,4.08),vec3(0.,-1.,0.),.175,sight,length(ray))
                +diffuserGlow(benchLamp,lampAxis,.122,sight,length(ray));
      result+=vec3(1.,.86,.65)*glow;
    }
    if(eyePoint.x < -1.71 && eyePoint.z < -2.98 && eyePoint.y < 2.50 &&
       dot(sight,bulbAxis)>.96 && length(ray)+.19>length(toBulb)){
      vec3 right=normalize(cross(bulbAxis,vec3(0.,1.,0.)));
      vec2 uv=vec2(dot(sight,right),dot(sight,cross(right,bulbAxis)));
      float radius=length(uv);
      float halo=.17*exp(-radius*15.);
      float rays=pow(abs(cos(3.*atan(uv.y,uv.x+.00001))),22.);
      vec3 glow=mix(vec3(1.,.23,.055),vec3(1.,.99,.97),darkroomWhite);
      result+=glow*(halo+.055*rays*exp(-radius*14.));
    }
    if(mat>6.5 && mat<7.5){
      vec3 ng=dot(n,v)<0.?-n:n;
      vec3 refl=reflect(-v,ng);
      float edge=pow(1.-abs(dot(ng,v)),3.);
      float pane=smoothstep(.32,.60,refl.y)*(1.-smoothstep(.74,.95,refl.y));
      float sheen=pane*(.65+.35*cos(refl.x*22.));
      vec3 coating=mix(vec3(.44,.70,.67),vec3(.80,.71,.94),smoothstep(.1,.9,abs(refl.x)));
      gl_FragColor=vec4(mix(coating,vec3(.98,.97,.87),sheen),.037+.25*edge+.22*sheen);
    }else gl_FragColor=vec4(clamp(result,0.,1.),1.);

  }`;
  const program=gl.createProgram();
  for(const [type,src] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));gl.attachShader(program,s);}
  gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  const vertices=[], items=[], emitters=[];
  function luminous(power,build){
    const first=vertices.length;
    build();
    for(let i=first;i<vertices.length;i+=12)
      emitters.push(vertices[i],vertices[i+1],vertices[i+2],power);
  }
  const sub=(a,b)=>a.map((v,i)=>v-b[i]), add=(a,b)=>a.map((v,i)=>v+b[i]), mult=(a,k)=>a.map(v=>v*k), dot=(a,b)=>a.reduce((v,x,i)=>v+x*b[i],0), cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]], unit=a=>mult(a,1/(Math.hypot(...a)||1));
  const rgb=h=>h.match(/../g).map(i=>parseInt(i,16)/255);
  function face(a,b,c,d,color,material=0,uvs=[[0,0],[1,0],[1,1],[0,1]]){const nm=unit(cross(sub(b,a),sub(c,a))), base=rgb(color);for(const i of [0,1,2,0,2,3])vertices.push(...[a,b,c,d][i],...nm,...base,...(material===5?[uvs[i][0]*.5,uvs[i][1]*.1875]:uvs[i]),material);}
  function box(x,y,z,w,h,d,color,mat=0){let a=x-w/2,b=x+w/2,l=z-d/2,r=z+d/2,t=y+h;
    face([a,y,r],[b,y,r],[b,t,r],[a,t,r],color,mat);face([b,y,l],[a,y,l],[a,t,l],[b,t,l],color,mat);
    face([a,t,r],[b,t,r],[b,t,l],[a,t,l],color,mat);face([a,y,l],[b,y,l],[b,y,r],[a,y,r],color,mat);
    face([b,y,r],[b,y,l],[b,t,l],[b,t,r],color,mat);face([a,y,l],[a,y,r],[a,t,r],[a,t,l],color,mat);}
  function smoothQuad(points,normals,tint,material,uvs) {
    for (const i of [0,1,2,0,2,3])
      vertices.push(...points[i],...normals[i],...tint,uvs ? uvs[i][0] : 0,uvs ? uvs[i][1] : 0,material);
  }

  // A cuboid with an elliptical fillet. Different plan and height radii
  // let a thin wood top have broad corners and a fine rolled edge.
  function softBox(x,y,z,w,h,d,color,mat=0,radius=.023,vertical=radius) {
    const half=[w/2,h/2,d/2], center=[x,y+h/2,z];
    const radii=half.map((v,i)=>Math.min(v*.96,i===1?vertical:radius));
    const core=half.map((v,i)=>v-radii[i]), tint=rgb(color);
    const quarter=radius>=.04 ? 4 : 2;
    const side=Array.from({length:quarter+1},(_,i)=>Math.tan(i*Math.PI/(4*quarter)));
    const arc=[...side.slice().reverse().map(t=>-t),...side];
    function sample(axis,sign,u,v) {
      const b=(axis+1)%3,c=(axis+2)%3;
      const dir=[0,0,0],offset=[0,0,0];
      dir[axis]=sign;dir[b]=arc[u];dir[c]=arc[v];
      offset[axis]=sign;offset[b]=u<side.length?-1:1;offset[c]=v<side.length?-1:1;
      const n=unit(dir);
      return [center.map((v,i)=>v+offset[i]*core[i]+radii[i]*n[i]),
              unit(n.map((value,i)=>value/radii[i]))];
    }
    for(let axis=0;axis<3;axis++) for(const sign of [-1,1]) {
      const grid=arc.map((_,u)=>arc.map((_,v)=>sample(axis,sign,u,v)));
      for(let u=0;u<arc.length-1;u++) for(let v=0;v<arc.length-1;v++) {
        const q=[grid[u][v],grid[u+1][v],grid[u+1][v+1],grid[u][v+1]];
        if(sign<0)q.reverse();
        smoothQuad(q.map(a=>a[0]),q.map(a=>a[1]),tint,mat);
      }
    }
  }

  function tube(a,b,r,s,color,mat=0,N=32) {
    const delta=sub(b,a),axis=unit(delta),tint=rgb(color);
    const u=unit(cross(axis,Math.abs(axis[1])>.9?[1,0,0]:[0,1,0])),v=cross(u,axis);
    const taper=mult(axis,(r-s)/Math.hypot(...delta));
    function section(i) {
      const angle=i*2*Math.PI/N;
      const radial=add(mult(u,Math.cos(angle)),mult(v,Math.sin(angle)));
      return {lo:add(a,mult(radial,r)),hi:add(b,mult(radial,s)),normal:unit(add(radial,taper))};
    }
    let last=section(0);
    for(let i=1;i<=N;i++) {
      const next=section(i);
      smoothQuad([last.lo,last.hi,next.hi,next.lo],[last.normal,last.normal,next.normal,next.normal],tint,mat);
      for(const point of [b,next.hi,last.hi])vertices.push(...point,...axis,...tint,0,0,mat);
      for(const point of [a,last.lo,next.lo])vertices.push(...point,...mult(axis,-1),...tint,0,0,mat);
      last=next;
    }
  }
  const wood='9e7552',steel='393b37',oak='b09372',wall='877b71';
  const table=(x,z,w,d,h)=>{softBox(x,h-.09,z,w,.09,d,wood,1,.085,.019);for(let dx of [-1,1])for(let dz of [-1,1])softBox(x+dx*(w/2-.09),0,z+dz*(d/2-.09),.055,h-.08,.055,steel,3);};
  box(0,-.18,1,11.8,.18,12,'918880',9);
  // The entry is in the gallery wall, between the first print and the corner.
  const doorwayZ=5.55,doorWidth=1.40,doorHeight=2.68;
  for(const [lo,hi] of [[-5,doorwayZ-doorWidth/2],[doorwayZ+doorWidth/2,7]]){
    box(-5.86,0,(lo+hi)/2,.16,4.12,hi-lo,wall,2);
    box(-5.73,0,(lo+hi)/2,.06,.1,hi-lo,'635c55');
  }
  box(-5.86,doorHeight,doorwayZ,.16,4.12-doorHeight,doorWidth,wall,2);
  for(const side of [-1,1])box(-5.79,0,doorwayZ+side*.67,.18,doorHeight,.09,oak,1);
  box(-5.79,2.58,doorwayZ,.18,.10,doorWidth,oak,1);
  softBox(-5.84,.012,doorwayZ,.075,2.58,1.27,'786957',1,.015);
  box(-5.82,0,doorwayZ,.22,.014,1.30,oak,1);
  tube([-5.803,1.06,doorwayZ+.46],[-5.758,1.06,doorwayZ+.46],.043,.043,'ac9779',3);
  tube([-5.757,1.06,doorwayZ+.46],[-5.757,1.06,doorwayZ+.29],.017,.017,'ccb696',3);
  box(0,0,-4.94,11.8,3.22,.15,wall,2);
  for(let i=0;i<=8;i++)box(-5.82+i*1.455,3.22,-4.94,.045,.88,.13,steel);
  box(0,3.18,-4.92,11.78,.055,.20,steel);
  box(0,0,-4.81,11.6,.1,.05,'635c55');
  // Deep reveal and oak sill around a garden-facing bank of casements.
  const windowStart=vertices.length/12;
  box(5.86,0,1,.18,1.05,12,wall,2);
  box(5.86,3.50,1,.18,.62,12,wall,2);
  box(5.86,1.05,-3.7,.18,2.45,2.6,wall,2);
  box(5.86,1.05,5.6,.18,2.45,2.8,wall,2);
  softBox(5.73,1.02,.90,.43,.09,6.78,oak,1,.019);
  for(let j=0;j<=4;j++){
    const z=-2.40+j*1.65;
    softBox(5.85,1.10,z,.13,2.40,.052,steel,1057,.009);
    for(const side of [-1,1]){
      const zi=z+side*.025,zo=z+side*.041;
      face([5.792,1.10,zi],[5.843,1.10,zo],[5.843,3.50,zo],[5.792,3.50,zi],steel,1057);
      box(5.861,1.10,zo,.032,2.40,.004,'373733');
    }
  }
  for(const y of [1.10,2.95,3.46])
    softBox(5.85,y,.90,.13,.047,6.60,steel,1057,.008);
  // Narrow, light-facing return set between the dark frame and the plaster.
  for(const [z,inside] of [[-2.40,1],[4.20,-1]]){
    const inner=z+inside*.025,outer=z-inside*.12;
    const a=[5.63,1.10,outer],b=[5.86,1.10,inner],c=[5.86,3.50,inner],d=[5.63,3.50,outer];
    if(inside>0)face(a,b,c,d,'b3aea4',2);else face(d,c,b,a,'b3aea4',2);
    softBox(5.68,1.08,outer,.11,2.46,.028,'837a6c',1,.006);
  }
  face([5.63,3.55,-2.52],[5.86,3.47,-2.38],[5.86,3.47,4.18],[5.63,3.55,4.32],'746d62',2);
  const windowEnd=vertices.length/12;
  // The casement pole stands clear of the projecting oak sill.
  const poleX=5.46,poleY=3.69,bronze='51433b',collar='69594d';
  // Measure each stack from its outermost ring. Both outside edges stay at the jambs.
  const curtainPanels=[{outside:-2.85,width:.550,inward:1,seed:.65},
    {outside:4.65,width:.555,inward:-1,seed:2.35}];
  tube([poleX,poleY,-2.96],[poleX,poleY,4.76],.024,.024,bronze,3,24);
  for(const z of [-2.91,.89,4.71]){
    tube([5.774,3.65,z],[5.749,3.65,z],.049,.043,bronze,3,20);
    tube([5.75,3.65,z],[poleX,3.65,z],.012,.012,bronze,3,12);
    tube([poleX,3.64,z],[poleX,poleY,z],.014,.018,bronze,3,12);
    tube([poleX,poleY,z-.009],[poleX,poleY,z+.009],.029,.029,collar,3,20);
  }
  for(const [end,sign] of [[-2.96,-1],[4.76,1]]){
    // Turned collar, recessed neck and a lightly bevelled cylindrical finial.
    const profile=[[0,.024],[.010,.037],[.023,.037],[.030,.021],[.052,.021],
      [.064,.041],[.076,.044],[.160,.044],[.169,.037]];
    for(let i=1;i<profile.length;i++){
      const [a,r]=profile[i-1],[b,s]=profile[i];
      tube([poleX,poleY,end+sign*a],[poleX,poleY,end+sign*b],r,s,i<=3?collar:bronze,3,24);
    }
  }
  const pleats=5,turn=Math.PI*2,headingY=poleY-.076;
  function curtainPoint(panel,u,v){
    const {outside,width,inward,seed}=panel;
    const released=1-Math.exp(-10*v),gather=turn*pleats*u;
    const drift=.56*Math.sin(9*u+seed)+v*(1.25*Math.sin(6*u+seed)+.67*Math.sin(4*v+10*u+seed));
    const phase=gather+released*drift;
    const crest=Math.cos(phase);
    const fold=.5-.5*crest;
    // Close the mouths of the pleats under the clips. Below the heading, the
    // same length of material falls into deeper pockets and spreads at the hem.
    const pocket=Math.pow(fold,.82+.12*Math.sin(7*u+seed));
    const depth=.151+.055*v+.006*(1-released)+.021*released*Math.sin(8*u+seed);
    const flare=.075*v*v;
    const z=outside+inward*(width*u+(u-.5)*flare
      -.006*(1-released)*Math.sin(2*phase)+.012*released*Math.sin(phase+.5)
      +.012*Math.sin(turn*u+seed)+.012*v*Math.sin(8*u+seed));
    const pinch=.022*Math.exp(-14*v)*Math.pow(Math.sin(gather+3*v),2);
    const hemCurl=Math.exp(-35*(1-v));
    const x=poleX-depth*pocket-pinch-.040*Math.sin(Math.PI*v)*(.5+.5*Math.sin(9*u+seed))
      -.012*hemCurl*Math.sin(phase+.7);
    const y=headingY-3.588*v-.032*fold*(1-released)
      +v*v*(.010*crest+.010*Math.sin(8*u+seed));
    return [x,y,z];
  }
  for(const panel of curtainPanels)for(let i=0;i<=pleats;i++){
    const z=curtainPoint(panel,i/pleats,0)[2];
    const ring=t=>[poleX+.039*Math.cos(t),poleY-.014+.043*Math.sin(t),z];
    for(let j=0;j<20;j++)tube(ring(j*turn/20),ring((j+1)*turn/20),.0048,.0048,collar,3,8);
    tube(ring(turn*.75),[poleX,headingY+.003,z],.0035,.0035,bronze,3,8);
    box(poleX,headingY-.012,z,.012,.016,.014,bronze,3);
  }
  const curtainStart=vertices.length/12;
  for(const panel of curtainPanels){
    const cols=pleats*20,tint=rgb('664b3c');
    const heights=[0,.008,.018,...Array.from({length:31},(_,j)=>(j+1)/32),.980,.990,1];
    const grid=heights.map(v=>Array.from({length:cols+1},(_,i)=>{
      const u=i/cols,eps=.0005;
      const du=sub(curtainPoint(panel,u+eps,v),curtainPoint(panel,u-eps,v));
      const dv=sub(curtainPoint(panel,u,v+eps),curtainPoint(panel,u,v-eps));
      return {p:curtainPoint(panel,u,v),n:mult(unit(cross(dv,du)),panel.inward),uv:[u,v]};
    }));
    for(let j=0;j<heights.length-1;j++)for(let i=0;i<cols;i++){
      const q=[grid[j][i],grid[j+1][i],grid[j+1][i+1],grid[j][i+1]];
      if(panel.inward<0)q.reverse();
      smoothQuad(q.map(v=>v.p),q.map(v=>v.n),tint,28,q.map(v=>v.uv));
    }
  }
  const curtainEnd=vertices.length/12;
  box(0,0,6.94,11.8,4.12,.16,wall,2);
  box(0,0,6.833,11.6,.10,.054,'635c55');
  const {centerX:panelX,centerY:panelCenter,front:panelZ,width:panelWidth,height:panelHeight}=profileMount;
  const panelBottom=panelCenter-panelHeight/2;
  const paperPoint=(u,v)=>[panelX+(.5-u/profilePaper.width)*panelWidth,
    panelCenter+(.5-v/profilePaper.height)*panelHeight,panelZ];
  box(panelX,panelBottom-.012,6.832,panelWidth-.09,panelHeight,.053,'514941');
  softBox(panelX,panelBottom-.018,panelZ+.025,panelWidth+.036,panelHeight+.036,.046,'705c48',1,.009);
  const recordShelves=buildRecordShelves({box,softBox,face});
  function rimBand(outer,inner,tint){
    for(let j=0;j<outer.length;j++){
      const next=(j+1)%outer.length;
      face(outer[j],outer[next],inner[next],inner[j],tint);
    }
  }
  // Gallery wall. Prints are individual framed objects with inset mats.
  const photoFaces=[];
  prints.forEach((z,i)=>{
    const rim=(x,w,h)=>[[x,printCenterY-h,z+w],[x,printCenterY-h,z-w],[x,printCenterY+h,z-w],[x,printCenterY+h,z+w]];
    const back=rim(-5.779,.717,.992),outer=rim(-5.704,.720,.995);
    const bevel=rim(-5.694,.711,.986),lip=rim(-5.694,.689,.964);
    const [x,y,w,h]=galleryPrints[i].rect;
    const halfWidth=Math.min(.620,.795*w/h),halfHeight=halfWidth*h/w;
    const mat=rim(matFront,.684,.959);
    const opening=rim(matFront,halfWidth+matCut,halfHeight+matCut);
    const cut=rim(matFront-matCut,halfWidth,halfHeight);
    const paper=rim(matFront-printDepth,halfWidth,halfHeight);
    rimBand(back,outer,'292825');rimBand(outer,bevel,'34322f');rimBand(bevel,lip,'292825');
    rimBand(lip,mat,'35322f');rimBand(mat,opening,'d7d1c5');
    rimBand(opening,cut,'e4dfd4');rimBand(cut,paper,'bfb9ad');
    const l=(x+.5)/2048,r=(x+w-.5)/2048,t=(y+.5)/2048,b=(y+h-.5)/2048;
    photoFaces.push({paper,bounds:[z,halfWidth,halfHeight],uv:[[l,b],[r,b],[r,t],[l,t]]});
  });
  const photosStart=vertices.length/12;
  const printNormals=Array(4).fill([1,0,0]);
  for(const {paper,bounds,uv} of photoFaces)smoothQuad(paper,printNormals,bounds,29,uv);
  const photosEnd=vertices.length/12;
  table(-4.88,-.18,.59,3.28,.51);for(let i=0;i<5;i++)softBox(-5.14+i*.115,.512,-.18,.087,.036,3.28,oak,1);
  const tableX=-4.34,tableZ=4.08;
  softBox(tableX,0,tableZ,2.55,.75,.79,wood,1);
  // One mount board. Adjacent cells meet on the same plane at their midpoints.
  // Each opening follows the image area inside the old loose print's white margin.
  const printTableCenterX=tableX+.30,boardScale=.60,boardHalfWidth=.912,boardHalfDepth=.284;
  const boardTop=.761,tableCut=matCut/2,tableRecess=printDepth/2,paperY=boardTop-tableRecess;
  const tableRect=(y,left,right,far,near)=>[
    [printTableCenterX+left*boardScale,y,tableZ+near*boardScale],[printTableCenterX+right*boardScale,y,tableZ+near*boardScale],
    [printTableCenterX+right*boardScale,y,tableZ+far*boardScale],[printTableCenterX+left*boardScale,y,tableZ+far*boardScale]
  ];
  const boardRect=y=>tableRect(y,-boardHalfWidth,boardHalfWidth,-boardHalfDepth,boardHalfDepth);
  rimBand(boardRect(.750),boardRect(boardTop),'d7d2c8');
  face(...boardRect(.751),'d7d2c8');
  // Columns in viewing order; entries give the atlas tile and its image dimensions.
  const tableColumns=[
    {x:-.69,prints:[[0,363,484]]},
    {x:-.328,prints:[[1,484,362],[4,484,363]]},
    {x:0,prints:[[2,484,363],[5,484,363]]},
    {x:.328,prints:[[3,484,363],[6,484,363]]},
    {x:.69,prints:[[7,363,484]]}
  ];
  const tablePapers=[];
  tableColumns.forEach(({x,prints},column)=>{
    const left=column===0?-boardHalfWidth:(tableColumns[column-1].x+x)/2;
    const right=column===tableColumns.length-1?boardHalfWidth:(x+tableColumns[column+1].x)/2;
    const paired=prints.length===2;
    prints.forEach(([tile,pixelsW,pixelsH],row)=>{
      const far=paired && row===1?0:-boardHalfDepth,near=paired && row===0?0:boardHalfDepth;
      const z=paired?(row-.5)*.25:0;
      const halfH=(paired?.2096:.4586)/2;
      const halfW=halfH*pixelsW/pixelsH;
      const rim=(y,extra)=>tableRect(y,x-halfW-extra,x+halfW+extra,z-halfH-extra,z+halfH+extra);
      const opening=rim(boardTop,tableCut/boardScale),cut=rim(boardTop-tableCut,0),paper=rim(paperY,0);
      rimBand(tableRect(boardTop,left,right,far,near),opening,'ece9e2');
      rimBand(opening,cut,'ddd8cd');rimBand(cut,paper,'b5aea1');
      const atlasX=tile%4*512+Math.floor((512-pixelsW)/2);
      const atlasY=Math.floor(tile/4)*512+Math.floor((512-pixelsH)/2);
      const l=(atlasX+.5)/2048,r=(atlasX+pixelsW-.5)/2048;
      const t=(atlasY+.5)/1024,b=(atlasY+pixelsH-.5)/1024;
      tablePapers.push({paper,uv:[[l,b],[r,b],[r,t],[l,t]]});
    });
  });
  // Enclosed darkroom, with a visible enlarger, trays, drying line and safe light.
  box(-1.63,0,-3.88,.15,3.18,2.08,'6b6159',2);box(-3.68,2.87,-2.89,4.21,.34,.16,wall,2);
  box(-5.48,0,-2.89,.56,2.87,.16,wall,2);table(-3.72,-4.15,3.45,.88,.9);
  // Opaque lining below the clerestory; the slab overlaps the jambs and back wall.
  const soffit=3.07;
  box(-3.70,soffit,-3.90,4.26,.14,2.22,'554a42',2);
  box(-4.27,0,-2.89,1.88,2.87,.16,wall,2);
  box(-1.96,0,-2.89,.60,2.87,.16,wall,2);
  // Full-height flush light seal around the inset door.
  box(-2.80,0,-2.88,1.08,2.87,.17,'393631');
  softBox(-2.80,.018,-2.88,.99,2.58,.19,'675849',1,.014);
  for(const z of [-2.765,-2.995])tube([-2.46,1.08,z],[-2.62,1.08,z],.021,.021,'aba08b',3);
  tube([-4.29,soffit+.015,-3.86],[-4.29,3.005,-3.86],.089,.078,'8c7969',3);
  const darkroomPapers=[];
  function addDarkroomPaper(corners,atlasX,atlasY,pixelsW,pixelsH){
    const l=(atlasX-pixelsW/2+.5)/2048,r=(atlasX+pixelsW/2-.5)/2048;
    const t=(atlasY-pixelsH/2+.5)/2048,b=(atlasY+pixelsH/2-.5)/2048;
    darkroomPapers.push({corners,uv:[[l,b],[r,b],[r,t],[l,t]]});
  }
  const trayPrints=[
    {x:-4.99,atlas:[576,896,1152,768],height:.224},
    {x:-4.53,atlas:[1600,1280,864,1296],height:.282},
    {x:-4.07,atlas:[576,1664,1152,768],height:.224}
  ];
  const trayZ=-4.04,trayFloorY=.934,trayPaperY=trayFloorY+.0015;
  const trayLipY=.982,developerY=.958;
  // Follow the moulded shell from its tapered foot, over the lip and into the well.
  const trayCorners=[];
  for(let corner=0;corner<4;corner++){
    const start=-corner*Math.PI/2;
    for(let j=0;j<=8;j++){
      const angle=start-j*Math.PI/16;
      trayCorners.push({sx:Math.sign(Math.cos(start-Math.PI/4)),sz:Math.sign(Math.sin(start-Math.PI/4)),
        nx:Math.cos(angle),nz:Math.sin(angle)});
    }
  }
  function trayRing(x,y,halfW,halfD,radius){
    return trayCorners.map(({sx,sz,nx,nz})=>[
      x+sx*(halfW-radius)+nx*radius,y,trayZ+sz*(halfD-radius)+nz*radius]);
  }
  function trayWellAt(x,y,inset=0){
    const t=(y-trayFloorY)/(trayLipY-trayFloorY);
    return trayRing(x,y,.183+.017*t-inset,.155+.015*t-inset,.018+.006*t-inset);
  }
  function capTray(ring,color,material){
    const tint=rgb(color);
    for(let j=1;j<ring.length-1;j++)for(const p of [ring[0],ring[j],ring[j+1]])
      vertices.push(...p,0,1,0,...tint,0,0,material);
  }
  for(const {x,atlas,height:h} of trayPrints){
    const z=trayZ,y=trayPaperY,w=h*atlas[2]/atlas[3];
    const foot=trayRing(x,.90,.188,.158,.020);
    const outer=trayRing(x,trayLipY,.210,.180,.027);
    const crown=trayRing(x,trayLipY+.003,.208,.178,.025);
    const inner=trayWellAt(x,trayLipY),floor=trayWellAt(x,trayFloorY);
    rimBand(foot,outer,'777777');
    rimBand(outer,crown,'777777');
    rimBand(crown,inner,'777777');
    rimBand(inner,floor,'696969');
    capTray(floor,'565656',0);
    addDarkroomPaper([[x-w/2,y,z+h/2],[x+w/2,y,z+h/2],[x+w/2,y,z-h/2],[x-w/2,y,z-h/2]],
      ...atlas);
  }
  softBox(-2.78,.9,-4.04,.69,.05,.52,'413c36');softBox(-2.78,.95,-4.21,.035,1.09,.04,'b3aca0',3);softBox(-2.78,1.71,-4.05,.39,.4,.3,'363637');tube([-2.78,1.73,-4.05],[-2.78,1.54,-4.05],.10,.083,'232322');
  tube([-4.29,3.04,-3.86],[-4.29,2.61,-3.86],.012,.012,steel);tube([-4.29,2.52,-3.86],[-4.29,2.68,-3.86],.21,.065,'663229');
  luminous(.80,()=>tube([-4.29,2.52,-3.86],[-4.29,2.51,-3.86],.175,.17,'ff4a23',31));
  tube([-5.3,2.17,-4.74],[-3.53,2.17,-4.74],.005,.005,'cab097');
  for(let i=0;i<6;i++){
    const x=-5.12+i*.26,top=2.162,bottom=top-.240,z=-4.735;
    box(x,bottom,z-.002,.160,top-bottom,.002,'c7bfb3');
    addDarkroomPaper([[x-.080,bottom,z],[x+.080,bottom,z],[x+.080,top,z],[x-.080,top,z]],
      174+i*340,256,320,480);
    box(x,2.143,-4.735,.027,.062,.022,'ad916c',1);
  }
  // Optics workbench, camera bodies, a rail with upright lens elements, tools.
  table(2.15,1.73,4.64,1.85,.99);softBox(2.15,.29,1.73,4.45,.065,1.65,'84644c',1);
  softBox(2.98,.99,2.02,1.5,.018,.71,'636d5a');for(let i=0;i<7;i++)tube([2.35+i*.17,1.025,1.88],[2.4+i*.17,1.025,2.2],.009,.014,'bab2a6',3);
  const appendFinderGlass=buildRangefinderKit({vertices, face, smoothQuad, softBox, tube, rgb, unit, clip:studioVisibility.clip});
  // Sliding caliper with a jaw, engraved scale and thumb wheel on the cutting mat.
  box(2.93,1.024,2.26,.83,.012,.039,'c8c2b3',3);
  for(let i=0;i<42;i++)box(2.54+i*.018,1.036,2.266,.002,.002,i%5===0?.021:.011,'555750');
  for(let x of [2.53,2.70]){
    box(x,1.025,2.228,.022,.014,.138,'bab6a8',3);
    box(x+.013,1.025,2.16,.048,.014,.02,'bab6a8',3);
  }
  box(2.78,1.034,2.26,.16,.039,.082,'5b615a');box(2.78,1.074,2.255,.109,.003,.045,'97a594');
  tube([2.82,1.038,2.295],[2.82,1.038,2.319],.021,.021,'b9b3a6',3,22);
  // A clamp shoe with brass thumbscrews at each end anchors the optical rail.
  for(let x of [1.42,3.0]){box(x,.991,1.15,.20,.018,.35,'4a4d48',3);for(let z of [1.01,1.29])tube([x,1.008,z],[x,1.024,z],.025,.025,'ad9970',3,20);}
  box(2.22,1.0,1.15,1.77,.07,.24,'504d47',3);

  const opticalCenters=[];
  function lensPoint(center, axial, radial, angle){
    const transverse=radial*Math.cos(angle);
    return [center[0]+.93*axial-.368*transverse,center[1]+radial*Math.sin(angle),center[2]+.368*axial+.93*transverse];
  }
  function latheBand(center,a,ra,b,rb,color,material){
    for(let i=0;i<64;i++){
      const t=i*Math.PI/32,u=(i+1)*Math.PI/32;
      face(lensPoint(center,a,ra,t),lensPoint(center,a,ra,u),lensPoint(center,b,rb,u),lensPoint(center,b,rb,t),color,material);
    }
  }
  for(let i=0;i<lensProjects.length;i++){
    const x=1.49+i*.36,center=[x,1.43,1.15];
    opticalCenters.push(center);
    box(x,1.07,1.15,.105,.058,.102,'373a38',3);
    tube([x,1.128,1.15],[x,1.287,1.15],.019,.019,'aa9f8c',3);
    // Each retaining ring is annular, so its centre is genuinely open.
    const profile=[[-.012,.148],[.012,.148],[.014,.144],[.014,.136],[-.014,.136],[-.014,.145],[-.012,.148]];
    for(let j=1;j<profile.length;j++)latheBand(center,...profile[j-1],...profile[j],'93836e',3);
  }

  softBox(3.93,.99,1.34,.72,.42,.39,'ada898');box(3.84,1.09,1.543,.37,.23,.012,'293a33');for(let i=0;i<28;i++)box(3.67+i*.012,1.19+.055*Math.sin(i*.48),1.553,.013,.012,.01,'a3c483',4);for(let i=0;i<6;i++)tube([4.11+(i%2)*.066,1.1+Math.floor(i/2)*.075,1.55],[4.11+(i%2)*.066,1.1+Math.floor(i/2)*.075,1.575],.021,.021,'504e47',3);
  function lamp(x,y,z){
    const enamel=1058;
    const top=[x+.35,y+.98,z-.10],rim=[x+.45,y+.79,z-.06];
    const axis=unit(sub(rim,top)),at=offset=>add(rim,mult(axis,offset));
    const pivot=[x-.04,y+.73,z-.06],foot=[x,y+.045,z];
    const lower=unit(sub(foot,pivot)),upper=unit(sub(top,pivot));
    const pin=unit(cross(lower,upper)),across=unit(cross(pin,upper));
    const along=(direction,distance)=>add(pivot,mult(direction,distance));
    tube([x,y,z],[x,y+.055,z],.14,.14,steel,enamel);
    tube(foot,along(lower,.101),.022,.022,steel,enamel);
    tube(along(lower,.106),along(lower,.077),.0225,.027,steel,enamel);
    tube(along(upper,.069),top,.018,.018,steel,enamel);
    // Two forged cheeks on the upright straddle the narrower moving eye.
    // The rounded end of each lug is concentric with the transverse pivot.
    function lug(direction,offset,half,radius,reach){
      const side=unit(cross(pin,direction)),outline=[],segments=32;
      for(let i=0;i<segments;i++){
        const angle=turn*i/segments,c=Math.cos(angle),s=Math.sin(angle);
        const tail=Math.max(0,c);
        outline.push(add(along(direction,radius*c+(reach-radius)*tail*tail),
          mult(side,radius*s*(1-.22*tail))));
      }
      const edge=outline.map((_,i)=>unit(cross(sub(outline[(i+1)%segments],
        outline[(i+segments-1)%segments]),pin)));
      const bevel=.0025,tint=rgb(steel);
      const rings=[[-half,-bevel,-1],[-half+bevel,0,0],[half-bevel,0,0],[half,-bevel,1]]
        .map(([z,inset,tilt])=>outline.map((p,i)=>({
          p:add(add(p,mult(edge[i],inset)),mult(pin,offset+z)),
          n:unit(add(edge[i],mult(pin,tilt)))
        })));
      for(let i=0;i<segments;i++){
        const j=(i+1)%segments;
        for(let k=1;k<rings.length;k++){
          const q=[rings[k-1][i],rings[k-1][j],rings[k][j],rings[k][i]];
          smoothQuad(q.map(v=>v.p),q.map(v=>v.n),tint,enamel);
        }
        for(const sign of [-1,1]){
          const ring=sign===1?rings[3]:rings[0],n=mult(pin,sign);
          for(const p of [along(pin,offset+sign*half),ring[sign===1?i:j].p,ring[sign===1?j:i].p])
            vertices.push(...p,...n,...tint,0,0,enamel);
        }
      }
    }
    lug(lower,-.021,.0065,.038,.113);
    lug(lower,.021,.0065,.038,.113);
    lug(upper,0,.012,.031,.100);
    for(const sign of [-1,1]){
      const end=d=>along(pin,sign*d);
      tube(end(.012),end(.0145),.029,.029,'786e5c',3);
      tube(end(.0275),end(.030),.024,.024,'66635a',3);
    }
    tube(along(pin,-.030),along(pin,-.033),.019,.016,'74736d',3);
    // The shoulder screw has a chamfered head and a recessed hex socket.
    const radial=(angle,r)=>add(mult(upper,r*Math.cos(angle)),mult(across,r*Math.sin(angle)));
    const screwRing=(i,z,r)=>add(along(pin,z),radial(turn*i/24,r));
    function socket(i,z){
      const a=Math.floor(i/4)*turn/6,t=(i%4)/4,r=.008;
      return add(along(pin,z),add(mult(radial(a,r),1-t),mult(radial(a+turn/6,r),t)));
    }
    tube(along(pin,.030),along(pin,.032),.021,.021,'696962',3);
    const socketFloor=rgb('343530');
    for(let i=0;i<24;i++){
      const j=i+1;
      face(screwRing(i,.032,.021),screwRing(j,.032,.021),screwRing(j,.035,.0185),screwRing(i,.035,.0185),'85847c',3);
      face(screwRing(i,.035,.0185),screwRing(j,.035,.0185),socket(j,.035),socket(i,.035),'77776f',3);
      face(socket(i,.035),socket(j,.035),socket(j,.0321),socket(i,.0321),'373933',0);
      if(i%4===0)for(const p of [along(pin,.0321),socket(i,.0321),socket(i+4,.0321)])
        vertices.push(...p,...pin,...socketFloor,0,0,0);
    }
    tube(top,rim,.06,.148,steel,enamel,48);
    tube(rim,at(.003),.148,.148,'64635e',enamel,48);
    tube(at(.003),at(.006),.148,.143,'aba79d',3,48);
    luminous(1,()=>tube(at(.006),at(.007),.138,.137,'fff4dc',4,48));
  }
  lamp(.12,.99,1.43);
  // Digital desk, project pinboard and storage.
  table(2.55,-3.92,4.02,1.15,.82);softBox(4.1,.02,-3.92,.71,.71,.85,'676358');for(let i=0;i<4;i++)softBox(4.1,.08+i*.16,-3.476,.59,.12,.018,'827b6e');
  // Build each display in local space so stand, bezel and pixels turn together.
  const screens=[];
  function display(x,z,w,h,yaw,tile){
    const start=vertices.length,c=Math.cos(yaw),sn=Math.sin(yaw);
    const y=1.02,metal='737572',shell='323735',pivot=y+h*.5;
    softBox(0,.82,-.030,.24,.015,.185,metal,3,.018,.005);
    softBox(0,.834,-.072,.047,pivot-.834,.033,metal,3,.009);
    tube([0,pivot,-.086],[0,pivot,-.020],.033,.033,shell,3);
    softBox(0,pivot-.058,-.024,.126,.116,.018,shell,3,.012);
    softBox(0,y+.012,.003,w-.028,h-.025,.045,shell,0,.015);
    softBox(0,y,.030,w,h,.021,'252a29',0,.009);
    frontSheet(tile,0,y+.015,.0415,w-.015,h-.023,15);
    screens[tile]={center:[x+sn*.0415,y+.015+(h-.023)/2,z+c*.0415],right:[c,0,-sn],normal:[sn,0,c],w:w-.015,h:h-.023};
    box(w*.45,y+.005,.0418,.006,.0018,.001,'bdcbb7',4);
    for(let i=start;i<vertices.length;i+=12){
      const px=vertices[i],pz=vertices[i+2],nx=vertices[i+3],nz=vertices[i+5];
      vertices[i]=x+c*px+sn*pz;vertices[i+2]=z-sn*px+c*pz;
      vertices[i+3]=c*nx+sn*nz;vertices[i+5]=-sn*nx+c*nz;
    }
  }
  display(2.69,-4.21,1.16,.54,0,0);
  display(3.60,-3.98,.46,.80,-.48,1);
  // Monitor light bar clips over the top lip, with the diffuser forward of the glass.
  softBox(2.69,1.551,-4.189,.057,.021,.087,'444947',3,.006);
  tube([2.32,1.576,-4.125],[3.06,1.576,-4.125],.014,.014,'424744',3);
  luminous(.66,()=>softBox(2.69,1.562,-4.123,.718,.004,.013,'fff0da',4,.002));
  // Low-profile keyboard with staggered rows and individually tapered keycaps.
  softBox(2.84,.821,-3.66,.91,.006,.39,'4c504b',0,.028,.002);
  const keyboardX=2.69,unitKey=.0285;
  softBox(keyboardX,.828,-3.64,.454,.020,.159,'737777',3,.012,.005);
  const keyRows=[
    'Esc 1 2 3 4 5 6 7 8 9 0 - = Back',
    'Tab Q W E R T Y U I O P [ ]',
    'Caps A S D F G H J K L ; Enter',
    'Shift Z X C V B N M , . / Shift',
    'Ctrl Alt Cmd Space Cmd Alt < >'
  ].map(row=>row.split(' '));
  const keyWidths={Back:1.9,Tab:1.5,Caps:1.8,Enter:2.25,Shift:1.95,Ctrl:1.3,Cmd:1.2,Alt:1.15,Space:5.7};
  keyRows.forEach((row,r)=>{
    const total=row.reduce((sum,k)=>sum+(keyWidths[k]||1),0)*unitKey;
    let left=keyboardX-total/2;
    row.forEach((key,i)=>{
      const span=(keyWidths[key]||1)*unitKey,x=left+span/2,z=-3.697+r*.028;
      left+=span;
      const corners=(width,depth,y)=>[[x-width/2,y,z+depth/2],[x+width/2,y,z+depth/2],[x+width/2,y,z-depth/2],[x-width/2,y,z-depth/2]];
      const foot=corners(span-.002,.026,.846),top=corners(span-.005,.022,.855+(4-r)*.00065);
      for(let n=0;n<4;n++){const j=(n+1)%4;face(foot[n],foot[j],top[j],top[n],'434844');}
      const u=i*32,v=1280+r*48;
      face(...top,'ffffff',6,[[u+1,v+46],[u+31,v+46],[u+31,v+1],[u+1,v+1]].map(pair=>pair.map(t=>t/2048)));
    });
  });
  // Continuous ceramic-coloured palm shell; only the front buttons have a split.
  const mx=3.048,mz=-3.63;
  function mouseSkin(a,b){
    const power=(v,k)=>Math.sign(v)*Math.pow(Math.abs(v),k);
    const z=power(Math.sin(a),.78)*Math.cos(b);
    const x=power(Math.cos(a),.78)*Math.cos(b);
    return [mx+x*.043*(.97+.12*z-.09*Math.cos(z*4))-.003*z,
            .837+.040*Math.sin(b)*(1+.34*z)-.003*x,mz+.075*z];
  }
  function mouseVertex(a,b){
    const eps=.001;
    return [mouseSkin(a,b),unit(cross(sub(mouseSkin(a,b+eps),mouseSkin(a,b-eps)),
                                      sub(mouseSkin(a+eps,b),mouseSkin(a-eps,b))))];
  }
  softBox(mx,.828,mz,.080,.014,.140,'393c3b',0,.033,.006);
  for(let i=0;i<48;i++)for(let j=0;j<14;j++){
    const a=i*Math.PI/24,b=j*Math.PI/28;
    const q=[[a,b],[a+Math.PI/24,b],[a+Math.PI/24,b+Math.PI/28],[a,b+Math.PI/28]].map(([u,v])=>mouseVertex(u,v));
    smoothQuad(q.map(k=>k[0]),q.map(k=>k[1]),rgb('d1cfc4'),0);
  }
  for(let j=0;j<13;j++){
    const at=k=>add(mouseSkin(-Math.PI/2,.05+.099*k),[0,.0006,0]);
    tube(at(j),at(j+1),.00075,.00075,'676861',0,6);
  }
  const wheelY=.871,wheelZ=mz-.032;
  tube([mx-.006,wheelY,wheelZ],[mx+.006,wheelY,wheelZ],.009,.009,'747c7c',3,36);
  for(let i=-2;i<=2;i++){
    const x=mx+i*.0019;
    tube([x-.00035,wheelY,wheelZ],[x+.00035,wheelY,wheelZ],.0092,.0092,'4e5857',0,24);
  }
  softBox(2.2,1.58,-4.79,3.2,1.11,.065,'a78b6f',1);
  const cardWidth=.92,cardHeight=.406,cardZ=-4.732;
  const projectCards=studioProjects.map((_,i)=>({
    x:1.17+(i%3)*1.03,y:i<3?2.17:1.66
  }));
  for(const [i,{x,y}] of projectCards.entries()){
    const start=vertices.length;
    box(x,y-.003,cardZ-.012,cardWidth+.006,cardHeight+.006,.018,'c7bba2');
    frontSheet(i,x,y,cardZ,cardWidth,cardHeight,16+i);
    tube([x,y+cardHeight-.017,cardZ],[x,y+cardHeight-.017,cardZ+.009],.008,.009,'897969',3,12);
    // Encode the card number on its paper, backing and pin so they lift together.
    for(let j=start+11;j<vertices.length;j+=12)vertices[j]+=32*(i+1);
  }
  softBox(2.69,.47,-2.99,.60,.105,.58,'52534b',0,.095,.048);softBox(2.69,.57,-2.71,.58,.53,.085,'55564f',0,.088,.09);tube([2.69,.12,-3],[2.69,.47,-3],.05,.06,'8a8880',3);for(let i=0;i<5;i++){let x=2.69+.34*Math.cos(i*1.25),z=-3+.34*Math.sin(i*1.25);tube([2.69,.14,-3],[x,.095,z],.025,.025,steel);tube([x-.032,.057,z],[x+.032,.057,z],.052,.052,steel);}
  for(let i=0;i<4;i++){softBox(-.48,.39+i*.68,-4.5,1.55,.045,.58,'7b6551',1);for(let j=0;j<4;j++)box(-1.12+j*.19,.44+i*.68,-4.43,.12,.24+Math.abs(Math.sin(j+i))*.14,.26,['776b58','777970','9b8d79','494e48'][j]);}for(let x of [-1.24,.28])box(x,0,-4.49,.045,2.69,.52,steel,3);
  // Potted plants, gallery ceramics and small storage items.
  {
    function vessel(x,y,z,profile,colors){
      for(let i=1;i<profile.length;i++){
        tube([x,y+profile[i-1][0],z],[x,y+profile[i][0],z],profile[i-1][1],profile[i][1],colors[(i-1)%colors.length],0,40);
      }
    }
    const leafColors=['486f3d','557940','396745','648346','528048'];
    function pothosLeaf(origin,a,length,width,droop,seed,rows,cols){
      const tilt=.18*Math.sin(seed*4.13),forward=[Math.cos(a),0,Math.sin(a)],side=[-forward[2],0,forward[0]];
      function point(t,u){
        const arch=Math.sin(Math.PI*t),breadth=width*Math.pow(Math.max(0,arch),.63)*(1.26-.66*t);
        const lobe=.30*Math.abs(u)*Math.exp(-((t-.17)**2)/.023)*Math.min(t/.10,1);
        const along=length*(t-lobe),across=breadth*u*(1+.075*u*Math.sin(seed));
        const height=length*(.19*arch-droop*t*t)+breadth*(.24*Math.abs(u)-.27*u*u+tilt*u)
                      +.004*Math.sin(12*t+seed)*arch*u*u;
        return add(origin,add(mult(forward,along),add(mult(side,across+.016*arch*Math.sin(seed)),[0,height,0])));
      }
      const tint=rgb(leafColors[seed%leafColors.length]),grid=[];
      for(let i=0;i<=rows;i++){
        const row=[],t=i/rows;
        for(let j=0;j<=cols;j++){
          const u=2*j/cols-1,h=Math.min(.999,Math.max(.001,t));
          const tangent=sub(point(h+.0005,u),point(h-.0005,u));
          const lateral=sub(point(h,u+.001),point(h,u-.001));
          row.push([...point(t,u),...unit(cross(lateral,tangent)),...tint,u,t,10]);
        }
        grid.push(row);
      }
      for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){
        const q=[grid[i][j],grid[i][j+1],grid[i+1][j+1],grid[i+1][j]];
        for(const k of [0,1,2,0,2,3])vertices.push(...q[k]);
      }
    }
    function pottedPothos(x,y,z,scale,turn,variant,trailingLength){
      const start=vertices.length;
      vessel(0,0,0,[[0,.125],[.010,.145],[.023,.145],[.029,.134]],['a99984','b9a993']);
      vessel(0,.029,0,[[0,.093],[.017,.104],[.153,.131],[.169,.132],[.176,.127]],['bdac94','c9bba6','c6b59f','ccbea9']);
      tube([0,.204,0],[0,.206,0],.115,.115,'453c30',0,48);
      // Root offsets lie inside the soil disk. Two shoots turn over separate parts
      // of the lip; their falling section stays just outside the tapered pot.
      const shoots=[
        [-.043,-.064,4.09],[-.078,.016,2.78,true],[.030,-.055,5.17],
        [.039,.067,1.12,true],[.073,-.007,.34],[-.023,.060,2.12],[.008,.002,5.88]
      ];
      shoots.forEach(([rx,rz,a,trail],vine)=>{
        const phase=vine+variant, longVine=vine===3 && trailingLength>0;
        const rise=.19+.09*(.5+.5*Math.cos(phase*2.7));
        function node(t){
          const bend=.020*Math.sin(Math.PI*t+phase)*t;
          if(!trail)return [rx+.084*t*Math.cos(a)-bend,.201+rise*Math.sin(t*1.42),
                            rz+.084*t*Math.sin(a)+bend];
          const front=vine===3;
          const rim=[.138*Math.cos(a),.214,.138*Math.sin(a)];
          if(t<=.39){
            const u=t/.39;
            return [rx+(rim[0]-rx)*u,.201+.013*u+.028*Math.sin(Math.PI*u),
                    rz+(rim[2]-rz)*u];
          }
          const u=(t-.39)/.61,heading=a+(front?.28:-.18)*u*u;
          // The shelf vine grows out past the board before turning down its front.
          const overhang=longVine ? .17*Math.sin(Math.PI*.55*u) : 0;
          const fall=longVine ? trailingLength*Math.max(0,(u-.28)/.72)**1.45 : 0;
          const radius=.138+.019*Math.sin(Math.PI*u)+.013*u+overhang;
          return [radius*Math.cos(heading),rim[1]-(front?.154:.128)*u**1.15-fall,
                  radius*Math.sin(heading)];
        }
        const steps=longVine?40:20;
        for(let i=1;i<=steps;i++){
          const t=i/steps;
          tube(node((i-1)/steps),node(t),.0055-.002*(i-1)/steps,.0055-.002*t,'728453',0,10);
          if(i<5 || i%5)continue;
          const base=node(t),seed=variant+vine*5+i/5;
          const angle=a+(i%10?1:-1)*(.72+.14*Math.sin(seed));
          const size=(.115+.055*(.5+.5*Math.sin(seed*2.38)))*(trail?1-.36*t:1);
          const end=add(base,[.037*Math.cos(angle),.026+.012*Math.cos(seed),.037*Math.sin(angle)]);
          tube(base,end,.003,.002,'89985d',0,8);
          pothosLeaf(end,angle,size,size*.43,.32+.37*(.5+.5*Math.cos(seed)),seed,variant?14:18,variant?6:10);
        }
      });
      const c=Math.cos(turn),sn=Math.sin(turn);
      for(let i=start;i<vertices.length;i+=12){
        const px=vertices[i],pz=vertices[i+2],nx=vertices[i+3],nz=vertices[i+5];
        vertices[i]=x+scale*(c*px-sn*pz); vertices[i+1]=y+scale*vertices[i+1]; vertices[i+2]=z+scale*(sn*px+c*pz);
        vertices[i+3]=c*nx-sn*nz; vertices[i+5]=sn*nx+c*nz;
      }
    }
    pottedPothos(1.71,.82,-4.19,1,0,0,0);
    pottedPothos(-.285,2.475,-4.36,1.02,-.48,11,.48);
    pottedPothos(.070,2.475,-4.545,.76,1.14,27,0);
    vessel(-5.12,.75,4.02,[[0,.105],[.03,.12],[.13,.155],[.23,.10],[.26,.046],[.29,.05]],['a79578','a78e74','a9997f']);
    for(let i=0;i<8;i++){
      const a=i*2.39,base=[-5.12,1.035,4.02],tip=[base[0]+.21*Math.cos(a),1.43+.13*Math.sin(i*3.1),base[2]+.17*Math.sin(a)];
      tube(base,tip,.005,.002,'6b5544',0,5);
      for(let j=1;j<=3;j++){
        const joint=add(base,mult(sub(tip,base),j*.23)),bud=add(joint,[.045*Math.sin(i+j),.038,.036*Math.cos(j+i)]);
        tube(joint,bud,.003,.002,'6d5943',0,5);tube(bud,add(bud,[0,.018,0]),.014,.008,'92564a',0,6);
      }
    }
    // Distinctive film tins, archive cartons, slide sleeves and book jackets.
    for(let level=0;level<3;level++){
      const shelf=.435+level*.68;
      for(let k=0;k<3;k++){
        const x=-.32+k*.18,z=-4.45;
        if(level===1){
          vessel(x,shelf,z,[[0,.062],[.011,.069],[.14,.061],[.153,.068]],['45433e','848277','41443d']);
          box(x,shelf+.047,z+.060,.075,.042,.005,'d2bca0');
        } else {
          box(x,shelf,z,.16,.13+level*.035,.35,['787568','807e6d','8e826d'][k]);
          box(x,shelf+.07,z+.177,.083,.031,.005,'c7beac');
        }
      }
      for(let j=0;j<4;j++){
        const x=-1.12+j*.19;
        for(let n=0;n<3;n++)box(x,shelf+.105+n*.024,-4.295,.072-n*.01,.006,.005,'c1b298');
      }
    }
    // Capped amber chemistry bottles and graduate cylinders on the darkroom counter.
    for(let j=0;j<5;j++){
      const x=-5.14+j*.148,z=-4.46,s=.86+.08*(j%3);
      vessel(x,.9,z,[[0,.046],[.13*s,.052],[.17*s,.03],[.19*s,.026],[.213*s,.029]],['50423b','665043','635047','302d29']);
      box(x,.95,z+.049,.065,.053,.006,'b4a38a');
    }
    // Low storage keeps the optical bench heavy, with removable archive bins and pull handles.
    for(let j=0;j<3;j++){
      const x=.56+j*.8,z=1.87;
      softBox(x,.358,z,.61,.29,.62,['716d5e','908771','756d61'][j],0,.009);
      softBox(x,.629,z,.64,.046,.65,'a2947a',0,.008,.004);
      softBox(x,.484,z+.314,.13,.046,.012,'514c42',3,.003);
      box(x,.492,z+.325,.085,.024,.006,'aa9c81');
    }
    // A power lead drops from the workstation, then follows the rear skirting.
    const cable=[[3.62,1.15,-4.00],[3.44,.85,-4.10],[3.81,.69,-4.39],[3.77,.24,-4.47],[3.69,.08,-4.59],[3.35,.05,-4.68],[2.95,.07,-4.75]];
    for(let j=1;j<cable.length;j++)tube(cable[j-1],cable[j],.009,.009,'393a36',0,6);
    box(2.93,.065,-4.81,.18,.105,.04,'b2a99a');
    // Drying-room door reveal and timber window cap define real thickness at the cutaway.
    for(const x of [-5.175,-1.726])box(x,.025,-2.87,.052,2.835,.22,'64594f',1);
    box(-3.45,2.815,-2.87,3.48,.058,.22,'655c50',1);
    box(0,3.16,-4.80,11.56,.047,.20,'948271',1);
  }
  // Printed matter, wall typography and display surfaces share a single atlas.
  function sheetCorners(id,corners,material=6) {
    let left=(id%4*512+2)/2048,top=(512+Math.floor(id/4)*256+2)/2048;
    let right=left+508/2048,bottom=top+252/2048;
    if(material===15){left=.0005;right=.9995;top=id/2+.0005;bottom=top+.499;}
    if(material>=16){left=id%2/2+.0005;right=left+.499;top=Math.floor(id/2)/3+.0005;bottom=top+1/3-.001;}
    const uv=material===15 && id===1?[[left,top],[left,bottom],[right,bottom],[right,top]]:
      [[left,bottom],[right,bottom],[right,top],[left,top]];
    face(...corners,'ffffff',material,uv);
  }
  function frontSheet(id,x,y,z,w,h,material=6) {
    sheetCorners(id,[[x-w/2,y,z],[x+w/2,y,z],[x+w/2,y+h,z],[x-w/2,y+h,z]],material);
  }

  frontSheet(6,3.84,1.09,1.56,.37,.23);
  const darkroomSign={width:1.84,height:.22};
  box(-3.65,2.9,-2.776,1.90,.25,.035,'322b25',1);
  frontSheet(7,-3.65,2.915,-2.754,darkroomSign.width,darkroomSign.height);
  prints.forEach((z,i)=>{
    box(-5.776,.808,z,.018,.192,.768,'c8c1b3');
    sheetCorners(8+i,[[-5.766,.808,z+.384],[-5.766,.808,z-.384],
      [-5.766,1.00,z-.384],[-5.766,1.00,z+.384]]);
  });
  // Architectural ceiling, beams, rail pendants and worked boards along the floor.
  // The continuous plaster ceiling is drawn with the exterior shell below.
  for(let z of [-4.66,-2.6,-.52,1.56,3.64,5.72]){
    box(0,3.97,z,11.74,.17,.105,'6e5843',1);
    for(let x of [-5.53,5.53])box(x,3.83,z,.45,.19,.14,'6b5544',1);
  }
  // Shallow opal bowls between the timber beams. The emitter sits just below the glass.
  for(const [x,y,z] of overheadLights){
    const band=(a,b,r,s,color,mat)=>tube([x,y+a,z],[x,y+b,z],r,s,color,mat,64);
    band(.322,.358,.080,.086,'565148',3);
    band(.146,.324,.013,.013,'8b7d66',3);
    band(.122,.160,.069,.035,'675e52',3);
    band(.094,.135,.287,.090,'635f55',3);
    band(.084,.098,.291,.288,'a68e70',3);
    luminous(.92,()=>{
      band(.009,.017,.040,.115,'f7efde',22);
      band(.017,.034,.115,.191,'f7efde',22);
      band(.034,.057,.191,.248,'f7efde',22);
      band(.057,.084,.248,.281,'f7efde',22);
    });
  }
  // Ceiling track, adjustable trunnions and recessed optics aimed at the four print centres.
  box(-4.48,4.036,.45,.075,.068,6.10,'544f47',3);
  function trackHead(x,z,axis,alongX){
    softBox(x,4.001,z,alongX?.17:.104,.039,alongX?.104:.17,'47453f',3,.012);
    tube([x,4.015,z],[x,3.89,z],.019,.019,'57544d',3);
    const pivot=[x,3.885,z],axle=mult(unit(cross([0,1,0],axis)),.081);
    tube(sub(pivot,axle),add(pivot,axle),.033,.033,'68665d',3);
    const point=t=>add(pivot,mult(axis,t));
    tube(point(-.072),point(.17),.077,.091,'494943',3,40);
    tube(point(.17),point(.183),.095,.095,'333531',3,40);
    tube(point(.183),point(.185),.077,.077,'c5b79f',3,40);
    luminous(1,()=>tube(point(.185),point(.187),.060,.059,'fff0d6',4,40));
    return point(.188);
  }
  for(const z of prints)trackHead(-4.48,z,unit([-1.08,-1.67,0]),false);
  const profileRailZ=5.10;
  box(panelX,4.036,profileRailZ,panelWidth*.68,.068,.075,'544f47',3);
  const lampPivots=[-.20,.20].map(offset=>[panelX+offset*panelWidth,3.885,profileRailZ]);
  // At this grazing angle the brightest patch falls nearer the rail than the
  // optical axis. Aim past the sleeve centre (y=2.36, z=5.78) to centre it.
  const wallAims=[[panelX,panelCenter,panelZ],[5.72,1.734,6.061]];
  const profileAxes=lampPivots.map((p,i)=>unit(sub(wallAims[i],p)));
  const profileLamps=lampPivots.map(([x,,z],i)=>trackHead(x,z,profileAxes[i],true));
  // Broad opal pendant over the loose-print table.
  const px=-4.34,pz=4.08;
  function pendantBand(y0,y1,r0,r1,tint,mat){
    tube([px,y0,pz],[px,y1,pz],r0,r1,tint,mat,48);
  }
  pendantBand(4.05,4.105,.080,.080,'67635a',3);
  pendantBand(2.68,4.05,.008,.008,'55574f',0);
  pendantBand(2.64,2.70,.045,.034,'888174',3);
  pendantBand(2.59,2.645,.126,.042,'ded5c2',0);
  pendantBand(2.52,2.59,.190,.126,'ede4d0',0);
  luminous(.87,()=>{
    pendantBand(2.45,2.52,.202,.190,'f4e6cf',4);
    pendantBand(2.405,2.45,.145,.202,'f8ead3',4);
    pendantBand(2.393,2.405,.060,.145,'fff0da',4);
  });

  // The top rolls into its bound sides. A folded band wraps each short end.
  {
    const us=[0,.006,.016,.18,.35,.50,.66,.83,.984,.994,1];
    const vs=[0,.002,.006,.00685,.008,...Array.from({length:37},(_,j)=>(j+1)/38),.992,.99315,.994,.998,1];
    function cloth(u,v){
      const side=Math.min(u,1-u),end=Math.min(v,1-v);
      const corner=Math.max(0,1-side/.025)*Math.max(0,1-end/.006);
      const tilt=Math.sin(v*27+u*3)*.0024+Math.sin(v*76)*.0014;
      const x=-1.52+1.54*u+tilt+(u<.5?1:-1)*corner*.011;
      const z=4.4-6.92*v+Math.max(0,1-end/.012)*(.0035*Math.sin(u*19+v)+.002*Math.sin(u*51));
      const lip=Math.min(1,side/.012),hem=Math.min(1,end/.005);
      const foldedEdge=.0023*Math.max(0,1-Math.abs(end-.006)/.002);
      const height=.007+.009*lip*(.30+.70*hem)+foldedEdge
        +.0017*Math.sin(v*23+u*5)+.0025*corner;
      return [x,height,z];
    }
    function skirt(p,q,color){
      face(p,[p[0],.0005,p[2]],[q[0],.0005,q[2]],q,color);
    }
    for(let j=0;j<vs.length-1;j++)for(let i=0;i<us.length-1;i++){
      const u=us[i],U=us[i+1],v=vs[j],V=vs[j+1];
      const p=cloth(u,v),q=cloth(U,v),r=cloth(U,V),s=cloth(u,V);
      face(p,q,r,s,'ffffff',8,[[u,v],[U,v],[U,V],[u,V]]);
      const sideColor=V<=.00685 || v>=.99315?'69594e':'816b57';
      if(i===0)skirt(s,p,sideColor);
      if(i===us.length-2)skirt(q,r,sideColor);
      if(j===0)skirt(p,q,'69594e');
      if(j===vs.length-2)skirt(r,s,'69594e');
    }
  }
  // Retain the soft studio fill under the roof. Props and window mullions
  // cast the baked contact shadows; the roof receives light from the room.
  const guitars=buildGuitarCorner({vertices,face,tube,softBox,smoothQuad,rgb});
  const casterCount=vertices.length/12;
  box(0,4.10,1,11.82,.14,12.04,'c6baaa',2);
  // Transparent optical elements follow all solid geometry in the vertex buffer.
  const solidCount=vertices.length/12, transparentGroups=[];
  function registerTransparent(first){
    const count=vertices.length/12-first,low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];
    for(let i=first*12;i<vertices.length;i+=12)for(let k=0;k<3;k++){
      low[k]=Math.min(low[k],vertices[i+k]); high[k]=Math.max(high[k],vertices[i+k]);
    }
    transparentGroups.push({center:low.map((v,k)=>(v+high[k])*.5),first,count,bounds:[first,count,...low,...high]});
  }
  appendFinderGlass(registerTransparent);
  for(const {x} of trayPrints){
    const first=vertices.length/12;
    const flat=trayWellAt(x,developerY,.004);
    const wetEdge=trayWellAt(x,developerY+.0013);
    capTray(flat,'ffffff',30);
    const up=[0,1,0],wetNormals=trayCorners.map(({nx,nz})=>unit([-.53*nx,1,-.53*nz]));
    for(let j=0;j<flat.length;j++){
      const k=(j+1)%flat.length;
      smoothQuad([wetEdge[j],wetEdge[k],flat[k],flat[j]],[wetNormals[j],wetNormals[k],up,up],[1,1,1],30);
    }
    registerTransparent(first);
  }
  opticalCenters.forEach((center,i)=>{
    const first=vertices.length/12,radius=.137;
    for(const side of [-1,1]){
      for(let k=0;k<12;k++){
        const r=k/12,R=(k+1)/12;
        const depth=f=>side*(.004+(.011+.0025*i)*(1-f*f));
        latheBand(center,depth(r),radius*r,depth(R),radius*R,'abcac4',7);
      }
    }
    registerTransparent(first);
  });
  // A single uninterrupted print receives light across both sections.
  const paperWidth=profilePaper.width,paperHeight=profilePaper.height;
  const profileFace=[vertices.length/12,6,...paperPoint(paperWidth,paperHeight),...paperPoint(0,0)];
  face(paperPoint(0,paperHeight),paperPoint(paperWidth,paperHeight),paperPoint(paperWidth,0),paperPoint(0,0),
    'ffffff',6,[[0,1],[1,1],[1,0],[0,0]]);
  const firstRecord=vertices.length/12;
  recordShelves.append();
  const recordFaces=[firstRecord,vertices.length/12-firstRecord,5.64-sleeveTravel.out,1.47,4.88,5.75,3.24,6.68];
  const tableFaces=[vertices.length/12,6*tablePapers.length,...boardRect(paperY)[3],...boardRect(paperY)[1]];
  for(const {paper,uv} of tablePapers)face(...paper,'ffffff',6,uv);
  const darkroomFaces=[vertices.length/12,6*darkroomPapers.length,-5.20,trayPaperY,-4.735,-3.74,2.162,-3.898];
  for(const {corners,uv} of darkroomPapers)face(...corners,'ffffff',6,uv);
  const lensRanges=opticalCenters.map(center=>{
    const first=vertices.length/12;
    appendLensProjection(center,face,lensPoint);
    return [first,vertices.length/12-first];
  });
  const buffer=gl.createBuffer();
  const roomIndices=gl.getExtension('OES_element_index_uint') && gl.createBuffer();
  function drawRoom(first,count){
    if(roomIndices)gl.drawElements(gl.TRIANGLES,count,gl.UNSIGNED_INT,first*4);
    else gl.drawArrays(gl.TRIANGLES,first,count);
  }
  let measureCenter,applyContactBake;
  const fineBuffer=gl.createBuffer();
  let surfaceRows=0;
  await coordinateReady;
  const chunks=(()=>{
    const layout=studioVisibility.roomChunks(vertices,[windowStart,windowEnd,curtainStart,curtainEnd,photosStart,photosEnd,casterCount,solidCount]);
    measureCenter=studioVisibility.centerMeter(layout.packed,layout.chunks,solidCount);
    const bits=new Uint32Array(layout.packed.buffer);
    let signature=2166136261;
    for(let k=0;k<solidCount*12;k+=12){
      for(let axis=0;axis<3;axis++)signature=Math.imul(signature^bits[k+axis],16777619);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    let lightUVs;
    const vertexCount=layout.packed.length/12;
    if(lightCoordinates.naturalWidth && lightCoordinates.naturalHeight){
      const sheet=surface(lightCoordinates.width,lightCoordinates.height);
      sheet.drawImage(lightCoordinates,0,0);
      const rgba=sheet.getImageData(0,0,sheet.canvas.width,sheet.canvas.height).data;
      const byte=i=>rgba[i+Math.floor(i/3)];
      const word=i=>(byte(i)|(byte(i+1)<<8)|(byte(i+2)<<16)|(byte(i+3)<<24))>>>0;
      let meshHash=signature;
      for(let k=solidCount*12;k<layout.packed.length;k+=12)
        for(let j=0;j<3;j++)meshHash=Math.imul(meshHash^bits[k+j],16777619);
      if(word(0)===vertexCount && word(4)===(meshHash>>>0) && word(8)>0 && word(8)<=3392 &&
          vertexCount*4+12<=sheet.canvas.width*sheet.canvas.height*3){
        lightUVs=new Uint32Array(vertexCount);
        for(let i=0;i<vertexCount;i++)lightUVs[i]=word(12+i*4);
        surfaceRows=word(8);
      }
    }
    const mesh=roomIndices?studioVisibility.indexRoom(layout.packed,lightUVs):{vertices:layout.packed};
    gl.bufferData(gl.ARRAY_BUFFER,mesh.vertices,gl.STATIC_DRAW);
    if(mesh.indices){
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,roomIndices);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,mesh.indices,gl.STATIC_DRAW);
    }
    if(lightUVs){
      gl.bindBuffer(gl.ARRAY_BUFFER,fineBuffer);
      gl.bufferData(gl.ARRAY_BUFFER,lightUVs.subarray(0,mesh.vertices.length/12),gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    }
    applyContactBake=image=>{
      if(!image.naturalWidth)return;
      const sheet=surface(image.width,image.height);
      sheet.drawImage(image,0,0);
      const data=sheet.getImageData(0,0,image.width,image.height).data;
      const byte=i=>data[i+Math.floor(i/3)];
      const word=i=>(byte(i)|(byte(i+1)<<8)|(byte(i+2)<<16)|(byte(i+3)<<24))>>>0;
      if(word(0)!==solidCount || word(4)!==(signature>>>0))return;
      const count=mesh.vertices.length/12;
      const blocked=new Uint8Array(count);
      for(let i=0;i<solidCount;i++){
        const target=mesh.indices?mesh.indices[i]:i;
        blocked[target]=Math.max(blocked[target],byte(i+8));
      }
      for(let i=0;i<count;i++)mesh.vertices[i*12+11]+=blocked[i]/1020;
      gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.bufferSubData(gl.ARRAY_BUFFER,0,mesh.vertices);
    };
    vertices.length=0;return layout.chunks;
  })();
  const curtainChunks=chunks.filter(c=>c[0]>=curtainStart && c[0]<curtainEnd);
  const photoChunks=chunks.filter(c=>c[0]>=photosStart && c[0]<photosEnd);
  const fixedChunks=chunks.filter(c=>(c[0]<curtainStart || c[0]>=curtainEnd) && (c[0]<photosStart || c[0]>=photosEnd));
  for(const c of curtainChunks){
    // Allow for the animated hem when testing these opaque cells against the camera.
    c[2]-=.020;c[5]+=.020;c[4]-=.014;c[7]+=.014;
  }
  // The sun and both overhead fixtures share one static shadow texture.
  const illumination=unit(kawaguchiLight.sun);
  const lightRight=unit(cross([0,1,0],illumination)),lightUp=cross(illumination,lightRight);
  const lightMatrix=[];
  for(let i=0;i<3;i++)lightMatrix.push(lightRight[i]/8.3,lightUp[i]/8.0,-illumination[i]/9.,0);
  lightMatrix.push(0,-lightUp[1]*1.3/8.,illumination[1]*1.3/9.,1);
  const eyeUniform=gl.getUniformLocation(program,'eyePoint');
  function bakeRoomShadows(){
    const size=Math.min(2048,gl.getParameter(gl.MAX_TEXTURE_SIZE),gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
    const depthProgram=gl.createProgram();
    const shadowVertex='attribute vec3 point;uniform mat4 projection;void main(){gl_Position=projection*vec4(point,1.);}';
    const shadowFragment=`precision highp float;uniform bool overheadPass;
      void main(){
        float depth=overheadPass?1./(gl_FragCoord.w*${lampFar.toFixed(1)}):gl_FragCoord.z;
        float d=clamp(depth,0.,1.)*255.;
        vec2 packedDepth=vec2(floor(d)/255.,fract(d));gl_FragColor=packedDepth.xyxy;
      }`;
    const shaders=[];
    for(const [type,code] of [[gl.VERTEX_SHADER,shadowVertex],[gl.FRAGMENT_SHADER,shadowFragment]]){
      const shader=gl.createShader(type);gl.shaderSource(shader,code);gl.compileShader(shader);
      gl.attachShader(depthProgram,shader);shaders.push(shader);
    }
    gl.linkProgram(depthProgram);for(const shader of shaders)gl.deleteShader(shader);
    if(!gl.getProgramParameter(depthProgram,gl.LINK_STATUS)){gl.deleteProgram(depthProgram);return;}
    const shadowTexture=gl.createTexture(),frame=gl.createFramebuffer(),depth=gl.createRenderbuffer();
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,shadowTexture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,size,size,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    for(const pname of [gl.TEXTURE_MAG_FILTER,gl.TEXTURE_MIN_FILTER])gl.texParameteri(gl.TEXTURE_2D,pname,gl.NEAREST);
    for(const pname of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,pname,gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER,frame);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,shadowTexture,0);
    gl.bindRenderbuffer(gl.RENDERBUFFER,depth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,size,size);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depth);
    const usable=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;
    if(usable){
      gl.useProgram(depthProgram);
      const point=gl.getAttribLocation(depthProgram,'point');
      gl.enableVertexAttribArray(point);gl.vertexAttribPointer(point,3,gl.FLOAT,false,48,0);
      const projection=gl.getUniformLocation(depthProgram,'projection');
      const overheadPass=gl.getUniformLocation(depthProgram,'overheadPass');
      gl.uniformMatrix4fv(projection,false,lightMatrix);
      gl.uniform1i(overheadPass,0);
      gl.viewport(0,0,size,size);gl.enable(gl.DEPTH_TEST);gl.disable(gl.DITHER);
      gl.clearColor(1,1,1,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      gl.colorMask(true,true,false,false);
      // windowSun already projects the side opening and its mullions analytically.
      drawRoom(0,windowStart);
      drawRoom(windowEnd,casterCount-windowEnd);
      // Use the same fixture-local basis as the receiving surface in the shader.
      // Store linear depth so penumbra size follows the blocker/receiver separation.
      gl.colorMask(false,false,true,true);gl.uniform1i(overheadPass,1);
      const tile=size/2,near=.075,a=(lampFar+near)/(lampFar-near),b=-2*lampFar*near/(lampFar-near);
      [...overheadLights,...profileLamps].forEach((origin,i)=>{
        const axis=i<2?[0,-1,0]:profileAxes[i-2];
        const right=i<2?[1,0,0]:unit(cross([0,1,0],axis)),up=cross(axis,right);
        const matrix=[];
        for(let k=0;k<3;k++)matrix.push(right[k]/lampSlope,up[k]/lampSlope,a*axis[k],axis[k]);
        const shift=-dot(origin,axis);
        matrix.push(-dot(origin,right)/lampSlope,-dot(origin,up)/lampSlope,a*shift+b,shift);
        gl.viewport(i%2*tile,Math.floor(i/2)*tile,tile,tile);gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.uniformMatrix4fv(projection,false,matrix);
        drawRoom(0,casterCount);
      });
      gl.colorMask(true,true,true,true);
      gl.disableVertexAttribArray(point);gl.enable(gl.DITHER);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindRenderbuffer(gl.RENDERBUFFER,null);
    gl.deleteFramebuffer(frame);gl.deleteRenderbuffer(depth);gl.useProgram(program);gl.deleteProgram(depthProgram);
    gl.uniform1f(gl.getUniformLocation(program,'hasShadows'),usable?1:0);
    gl.uniform1f(gl.getUniformLocation(program,'shadowPixel'),1/size);
    gl.uniform1i(gl.getUniformLocation(program,'shadowDepth'),usable?1:0);
    gl.activeTexture(gl.TEXTURE0);
  }
  gl.uniformMatrix4fv(gl.getUniformLocation(program,'shadowCamera'),false,lightMatrix);
  gl.uniform4fv(gl.getUniformLocation(program,'printCenters'),prints);
  gl.uniform3fv(gl.getUniformLocation(program,'overhead[0]'),overheadLights.flat());
  gl.uniform3fv(gl.getUniformLocation(program,'profileLamps[0]'),profileLamps.flat());
  gl.uniform3fv(gl.getUniformLocation(program,'profileAxes[0]'),profileAxes.flat());
  gl.uniform3fv(gl.getUniformLocation(program,'sunDirection'),illumination);
  // UV spans twice each orthographic half-extent; depth spans 18 metres.
  gl.uniform3fv(gl.getUniformLocation(program,'shadowAxisU'),mult(lightRight,8.3/9.));
  gl.uniform3fv(gl.getUniformLocation(program,'shadowAxisV'),mult(lightUp,8./9.));
  bakeRoomShadows();
  const {drawLake,finishWater,cancelWaves}=createLakeLandscape(gl,kawaguchiMesh,kawaguchiLight,requestRender);
  const windowLens=createWindowFocus(gl,emitters);
  emitters.length=0;
  const drawWindowGlass=createWindowGlazing(gl,requestRender);
  const maxTextureSize=gl.getParameter(gl.MAX_TEXTURE_SIZE);
  const roomLayout=[['p',3],['n',3],['c',3],['uv',2],['m',1]].map(([name,size])=>[gl.getAttribLocation(program,name),size]);
  const fineAttribute=gl.getAttribLocation(program,'bakedUV');
  function bindRoom(){
    gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,roomIndices||null);
    let offset=0;
    for(const [i,size] of roomLayout){
      gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,size,gl.FLOAT,false,48,offset);offset+=size*4;
    }
    if(surfaceRows){
      gl.bindBuffer(gl.ARRAY_BUFFER,fineBuffer);gl.enableVertexAttribArray(fineAttribute);
      gl.vertexAttribPointer(fineAttribute,2,gl.UNSIGNED_SHORT,true,4,0);
    }else{
      gl.disableVertexAttribArray(fineAttribute);gl.vertexAttrib2f(fineAttribute,0,0);
    }
  }
  bindRoom();
  const atlas=document.createElement('canvas');atlas.width=2048;atlas.height=2048;
  const ctx=atlas.getContext('2d');
  function drawTile(id, paint){
    ctx.save();ctx.translate((id%4)*512,512+Math.floor(id/4)*256);ctx.beginPath();ctx.rect(0,0,512,256);ctx.clip();paint();ctx.restore();
  }
  const letter=(label,x,y,size,color,font='monospace')=>{ctx.fillStyle=color;ctx.font=size+'px '+font;ctx.fillText(label,x,y)};
  const fill=(x,y,w,h,color)=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,h)};
  const rule=(x,y,x2,y2,color,width=1)=>{ctx.lineWidth=width;ctx.strokeStyle=color;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.stroke()};
  drawTile(12,()=>{
    fill(0,0,512,256,'#555b56');
    ctx.textAlign='center';
    keyRows.forEach((row,r)=>row.forEach((key,i)=>{
      if(key!=='Space')letter(key,i*32+16,r*48+30,key.length>2?9:16,'#e4e3dc','monospace');
    }));
  });
  drawTile(13,()=>{
    fill(0,0,512,256,'#4a4034');ctx.textAlign='center';
    const px=x=>512*(.5+x/.468);
    ['GAIN','VOLUME','BASS','MID','TREBLE'].forEach((name,i)=>{
      const x=px(-.095+i*.052);
      letter(name,x,213,12,'#e4d3ad','sans-serif');
      for(let j=0;j<=8;j++){
        const a=Math.PI*(1.2+j*1.6/8);
        fill(x+16*Math.sin(a),111-61*Math.cos(a),2,6,'#c9b58a');
      }
    });
    letter('INPUT',px(-.189),213,13,'#e4d3ad','sans-serif');
    letter('POWER',px(.184),213,12,'#e4d3ad','sans-serif');
    rule(3,9,509,9,'#bca273',2);rule(3,243,509,243,'#bca273',2);
  });
  const deskGraphics=createProjectDeskGraphics(gl,program,studioProjects,selectedProject);
  drawTile(6,()=>{fill(0,0,512,256,'#25322c');for(let i=0;i<18;i++)rule(i*30,0,i*30,256,'#4b5950');for(let i=0;i<10;i++)rule(0,i*30,512,i*30,'#4b5950');for(let i=0;i<512;i++)rule(i,125+54*Math.sin(i*.048),i+1,125+54*Math.sin((i+1)*.048),'#bada8e',3);letter('CH 1    2.00 V',15,30,16,'#c4d295');});
  drawTile(7,()=>{
    fill(0,0,512,256,'#302c27');
    // Typeset in the mounted face's proportions before mapping it to the atlas.
    const faceHeight=512*darkroomSign.height/darkroomSign.width;
    ctx.scale(1,256/faceHeight);
    ctx.font='bold '+Math.round(faceHeight*.97)+'px Arial, sans-serif';
    ctx.fillStyle='#fff2dc';
    const letters=Array.from('DARKROOM');
    const widths=letters.map(c=>ctx.measureText(c).width);
    const margin=512*.08,tracking=(512-2*margin-widths.reduce((a,b)=>a+b,0))/(letters.length-1);
    const ink=ctx.measureText('DARKROOM');
    const baseline=(faceHeight+ink.actualBoundingBoxAscent-ink.actualBoundingBoxDescent)/2;
    let x=margin;
    letters.forEach((c,i)=>{ctx.fillText(c,x,baseline);x+=widths[i]+tracking;});
  });
  ctx.font='44px Georgia';
  const longestTitle=Math.max(...galleryPrints.map(({title})=>ctx.measureText(title).width));
  const plaqueType=Math.min(44,44*464/longestTitle);
  galleryPrints.forEach(({title,date},i)=>drawTile(8+i,()=>{
    // The 512 x 256 texture tile is mounted on a 4:1 wall label.
    ctx.scale(1,2);
    fill(0,0,512,128,'#e1d7c6');
    letter(title,24,62,plaqueType,'#302b26','Georgia');
    letter(date,25,101,27,'#433c35','Arial');
  }));

  // Independent power-of-two maps keep grazing-angle detail out of the UI atlas.
  const anisotropy=gl.getExtension('EXT_texture_filter_anisotropic');
  function materialTexture(name,slot,image,repeat,maxAnisotropy=8){
    gl.activeTexture(gl.TEXTURE0+slot);
    const map=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,map);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    for(const edge of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])
      gl.texParameteri(gl.TEXTURE_2D,edge,repeat?gl.REPEAT:gl.CLAMP_TO_EDGE);
    if(anisotropy)gl.texParameterf(gl.TEXTURE_2D,anisotropy.TEXTURE_MAX_ANISOTROPY_EXT,
      Math.min(maxAnisotropy,gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    gl.uniform1i(gl.getUniformLocation(program,name),slot);
    gl.activeTexture(gl.TEXTURE0);
    return map;
  }
  function surface(w,h){
    const c=document.createElement('canvas');c.width=w;c.height=h;return c.getContext('2d');
  }
  let grainSeed=19379;
  function grainRandom(){grainSeed=(Math.imul(1664525,grainSeed)+1013904223)>>>0;return grainSeed/4294967296;}
  function makeRunner(){
    const h=Math.min(4096,gl.getParameter(gl.MAX_TEXTURE_SIZE)),w=h/4;
    const rug=surface(w,h);
    rug.scale(w/1024,h/4096);
    rug.fillStyle='#96745e';rug.fillRect(0,0,1024,4096);
    for(const edge of [0,1024]){
      const sign=edge===0?1:-1;
      for(const [offset,width,color] of [[8,9,'#68574b'],[28,5,'#c4a68a'],[43,20,'#755e4f'],[72,5,'#c1a288']]){
        rug.fillStyle=color;rug.fillRect(edge+sign*offset,0,sign*width,4096);
      }
    }
    for(let i=0;i<11;i++){
      const y=(i+.5)*4096/11;
      for(const [rx,ry,color] of [[164,143,'#69594e'],[137,119,'#a08269'],[98,84,'#705f51'],[20,15,'#c4a482']]){
        rug.fillStyle=color;rug.beginPath();rug.moveTo(512,y-ry);rug.lineTo(512+rx,y);
        rug.lineTo(512,y+ry);rug.lineTo(512-rx,y);rug.closePath();rug.fill();
      }
    }
    rug.fillStyle='#69594e';
    rug.fillRect(0,0,1024,28);rug.fillRect(0,4096-28,1024,28);
    // Alternate over/under crossings; slow variations in yarn thickness prevent a regular grid.
    const yarn=surface(256,256),data=yarn.createImageData(256,256);
    const dye=Array.from({length:64},()=>grainRandom()*14-7);
    for(let y=0;y<256;y++)for(let x=0;x<256;x++){
      const row=y>>2,col=x>>2,over=(row+col)%2;
      const phase=over?x%4:y%4;
      const value=119+[0,23,32,6][phase]+dye[over?col:row]+(grainRandom()-.5)*17;
      const k=(y*256+x)*4;
      data.data[k]=data.data[k+1]=data.data[k+2]=value;data.data[k+3]=255;
    }
    yarn.putImageData(data,0,0);
    rug.globalCompositeOperation='soft-light';rug.fillStyle=rug.createPattern(yarn.canvas,'repeat');
    rug.fillRect(0,0,1024,4096);
    return rug.canvas;
  }
  function makeMetalFinish(){
    const size=512,metal=surface(size,size),pixels=metal.createImageData(size,size);
    const striation=Array.from({length:size},()=>grainRandom()*90-45);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const k=(y*size+x)*4;
      pixels.data[k]=128+striation[y]+16*Math.sin(x*.02454+y*.14)+(grainRandom()-.5)*24;
      pixels.data[k+1]=0;
      pixels.data[k+2]=20+10*Math.cos(2*Math.PI*x/size)*Math.sin(4*Math.PI*y/size);
      pixels.data[k+3]=255;
    }
    metal.putImageData(pixels,0,0);
    for(let i=0;i<54;i++){
      const x=40+grainRandom()*430,y=35+grainRandom()*440;
      metal.strokeStyle='rgba(128,210,58,.8)';metal.lineWidth=.5+grainRandom()*.8;
      metal.beginPath();metal.moveTo(x,y);metal.lineTo(x+3+grainRandom()*30,y+(grainRandom()-.5)*19);metal.stroke();
    }
    return metal.canvas;
  }
  let profileMap,suedeMap,recordMap,photoMap,tableMap,darkroomMap;
  const wallLinks=[],profileTargets=document.getElementById('profileTargets');
  const playlistTargets=document.getElementById('playlistTargets');
  const sleeveLifts=new Float32Array(recordShelves.targets.length);
  const sleeveUniform=gl.getUniformLocation(program,'sleeveLift[0]');
  let hoveredSleeve=-1;
  // R = static diffuse visibility, G = wood grain, B = mineral grain, A = grout.
  const neutralSurface=surface(1,1);
  neutralSurface.fillStyle='#ff8080';neutralSurface.fillRect(0,0,1,1);
  let floorMap=materialTexture('roomSurfaces',4,neutralSurface.canvas,true);
  const lensMaps=[];
  // Eight-sampler devices share this unit with the runner.
  const rug=makeRunner();
  let rugImage=rug;
  if(!separateRadiance){
    const packed=surface(fineAtlas?4096:2048,rug.height);
    packed.drawImage(rug,fineAtlas?3072:0,0,1024,rug.height);
    rugImage=packed.canvas;
  }
  const rugMap=materialTexture('runnerMap',2,rugImage,false,separateRadiance?8:1);
  const radianceWidth=fineAtlas?(separateRadiance?3072:4096):(separateRadiance?968:2048);
  gl.uniform2f(gl.getUniformLocation(program,'radianceTexel'),1/radianceWidth,1/(fineAtlas?4096:separateRadiance?1936:rug.height));
  if(separateRadiance)gl.uniform1i(gl.getUniformLocation(program,'irradianceMap'),8);
  rug.width=1;
  if(rugImage!==rug)rugImage.width=1;
  materialTexture('metalFinish',3,makeMetalFinish(),true);
  const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);function upload(){gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,atlas);}
  upload();gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  const source=new Image(), cameraFinish=new Image(), suedePile=new Image(),galleryImage=new Image(),tableImage=new Image();
  const darkroomImage=new Image(), surfaceSheet=new Image(),benchProbe=new Image();
  const roomRadiance=new Image(),roomContacts=new Image(),surfaceRadiance=new Image();
  function imageReady(){
    gl.useProgram(program);
    if(roomRadiance.naturalWidth===968 && roomRadiance.naturalHeight===1936){
      if(separateRadiance){
        gl.activeTexture(gl.TEXTURE0+8);gl.bindTexture(gl.TEXTURE_2D,gl.createTexture());
        if(fineAtlas)gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,radianceWidth,4096,0,gl.RGB,gl.UNSIGNED_BYTE,null);
        else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,roomRadiance);
        for(const filter of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,filter,gl.LINEAR);
        for(const edge of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,edge,gl.CLAMP_TO_EDGE);
      }else{
        gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,rugMap);
        if(!fineAtlas)gl.texSubImage2D(gl.TEXTURE_2D,0,1024,0,gl.RGBA,gl.UNSIGNED_BYTE,roomRadiance);
      }
      if(fineAtlas){
        const format=separateRadiance?gl.RGB:gl.RGBA;
        for(let y=0;y<1936;y+=704){
          const h=Math.min(704,1936-y),strip=surface(968,h);
          strip.drawImage(roomRadiance,0,y,968,h,0,0,968,h);
          gl.texSubImage2D(gl.TEXTURE_2D,0,y/704*968,3392,format,gl.UNSIGNED_BYTE,strip.canvas);
        }
        if(surfaceRows && surfaceRadiance.naturalWidth===3072 && surfaceRadiance.naturalHeight===surfaceRows){
          gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,format,gl.UNSIGNED_BYTE,surfaceRadiance);
          gl.uniform1i(gl.getUniformLocation(program,'hasFineLight'),1);
        }
      }
      if(!separateRadiance)gl.generateMipmap(gl.TEXTURE_2D);
      gl.uniform1i(gl.getUniformLocation(program,'hasRoomRadiance'),1);
      gl.activeTexture(gl.TEXTURE0);
    }
    applyContactBake(roomContacts);
    applyContactBake=null;
    if(surfaceSheet.naturalWidth){
      gl.deleteTexture(floorMap);
      floorMap=materialTexture('roomSurfaces',4,surfaceSheet,true,2);
    }
    profileMap=materialTexture('atlas',0,paintProfileWall(maxTextureSize,wallLinks),false);
    recordMap=materialTexture('atlas',0,paintPlaylist(),false);
    if(tableImage.naturalWidth)tableMap=materialTexture('atlas',0,tableImage,false);
    if(darkroomImage.naturalWidth)darkroomMap=materialTexture('atlas',0,darkroomImage,false);
    if(galleryImage.naturalWidth)photoMap=materialTexture('atlas',0,galleryImage,false);
    else{
      const paper=surface(1,1);paper.fillStyle='#d7d1c5';paper.fillRect(0,0,1,1);
      photoMap=materialTexture('atlas',0,paper.canvas,false);
    }
    if(suedePile.naturalWidth)suedeMap=materialTexture('atlas',0,suedePile,true);
    else{
      const neutral=surface(1,1);
      neutral.fillStyle='#808080';neutral.fillRect(0,0,1,1);
      suedeMap=materialTexture('atlas',0,neutral.canvas,true);
    }
    for(const link of wallLinks){
      link.anchor=profileAnchor(link.ref);
      link.anchor.draggable=false;
      profileTargets.append(link.anchor);
    }
    for(const [i,sleeve] of recordShelves.targets.entries()){
      const anchor=trackAnchor(sleeve.track);
      anchor.removeAttribute('title');
      anchor.onpointerenter=e=>{
        if(e.pointerType==='touch')return;
        hoveredSleeve=i;requestRender();
      };
      anchor.onpointerleave=anchor.onpointercancel=()=>{
        if(hoveredSleeve===i){hoveredSleeve=-1;requestRender();}
      };
      anchor.onfocus=anchor.onblur=requestRender;
      sleeve.anchor=anchor;playlistTargets.append(anchor);
    }
    if(cameraFinish.naturalWidth)ctx.drawImage(cameraFinish,1024,0,1024,512);
    if(benchProbe.naturalWidth)ctx.drawImage(benchProbe,0,1536);
    if(source.naturalWidth)ctx.drawImage(source,source.width*.47,source.height*.006,source.width*.47,source.height*.066,1024,1658,1024,325);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);upload();requestRender();
  }
  source.src='studio.png';
  galleryImage.src='gallery-prints.jpg';
  tableImage.src='table-prints.jpg';
  darkroomImage.src='darkroom-prints.jpg';
  surfaceSheet.src='room-surfaces.webp?v=2';
  roomRadiance.src='room-irradiance.webp';
  if(fineAtlas)surfaceRadiance.src='room-light-2cm.webp?v=2';
  roomContacts.src='room-contacts.png?v=2';
  benchProbe.src='workbench-radiance.jpg';
  cameraFinish.src='rangefinder-finish.jpg';
  suedePile.src='suede-pile.jpg';
  const roomImagesReady=Promise.allSettled([source.decode(),cameraFinish.decode(),suedePile.decode(),profilePortrait.decode(),playlistCovers.decode(),galleryImage.decode(),tableImage.decode(),darkroomImage.decode(),surfaceSheet.decode(),benchProbe.decode(),roomRadiance.decode(),roomContacts.decode(),fineAtlas && surfaceRadiance.decode()]);
  roomImagesReady.then(()=>{imageReady();studioLoading.done('prints');requestRender();});
  function drawOpaqueSurfaces(inView){
    studioVisibility.drawRanges(fixedChunks,inView,drawRoom);
    gl.bindTexture(gl.TEXTURE_2D,photoMap);
    studioVisibility.drawRanges(photoChunks,inView,drawRoom);
    gl.bindTexture(gl.TEXTURE_2D,suedeMap);
    studioVisibility.drawRanges(curtainChunks,inView,drawRoom);
    gl.bindTexture(gl.TEXTURE_2D,texture);
  }
  function drawPrintedSurfaces(frustum){
    gl.activeTexture(gl.TEXTURE0);
    for(const [bounds,map] of [[profileFace,profileMap],[recordFaces,recordMap],[tableFaces,tableMap],[darkroomFaces,darkroomMap]]){
      if(!map || !studioVisibility.intersects(bounds,frustum))continue;
      gl.bindTexture(gl.TEXTURE_2D,map);
      drawRoom(bounds[0],bounds[1]);
    }
    gl.bindTexture(gl.TEXTURE_2D,texture);
  }
  // Match the horizontal view of a 24 mm lens on a 36 mm-wide frame.
  const aboutHalfWidth=36/(2*24);
  const aboutAngle=aspect=>2*Math.atan(aboutHalfWidth/aspect)*180/Math.PI;
  const stations=[
    [[-5.29,1.68,doorwayZ],[3.88,1.65,.48],58],
    [[-1.32,1.68,2.40],[-5.7,2.02,.99],62],
    [[.77,2.05,5.26],[1.86,1.13,1.62],56],
    [[2.64,1.695,-2.31],[2.64,1.695,-4.74],60],
    [[-4.46,1.63,-3.03],[-4.46,1.48,-4.43],71],
    [[1.00,2.00,.08],[5.76,2.04,.65],32],
    [[1.182,2.046,1.973],[5.020,2.124,5.176],aboutAngle(1.5)]
  ];
  const uniform=gl.getUniformLocation(program,'camera');gl.enable(gl.DEPTH_TEST);gl.clearColor(.81,.85,.85,1);
  const wireUniform=gl.getUniformLocation(program,'stringBend[0]'),widthUniform=gl.getUniformLocation(program,'viewportWidth');
  const curtainUniform=gl.getUniformLocation(program,'curtainPhase');
  const darkroomLightUniform=gl.getUniformLocation(program,'darkroomWhite');
  const fastShadowsUniform=gl.getUniformLocation(program,'fastShadows');
  const projectionUniform=gl.getUniformLocation(program,'projectionReveal');
  const projectionTimeUniform=gl.getUniformLocation(program,'projectionTime');
  const linkFrameUniform=gl.getUniformLocation(program,'linkFrame');
  let darkroomTarget=0,darkroomFrom=0,lightSwitchTime=0;
  function darkroomLightAt(now){
    if(darkroomFrom===darkroomTarget)return darkroomTarget;
    const duration=(reducedMotion.matches?180:440)*Math.sqrt(Math.abs(darkroomTarget-darkroomFrom));
    const t=Math.max(0,(now-lightSwitchTime)/duration);
    if(t>=1)return darkroomTarget;
    return mix(darkroomFrom,darkroomTarget,t*t*(3-2*t));
  }
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  const mix=(a,b,t)=>a+(b-a)*t;
  const ease=t=>t*t*t*(10+t*(-15+6*t));
  const angles=d=>[Math.atan2(d[0],-d[2]),Math.asin(Math.max(-1,Math.min(1,d[1])) )];
  let basis=null,eye=[...stations[0][0]],fov=stations[0][2],index=0,yaw=0,pitch=0,raf=0,shown=false;
  let heading=angles(unit(sub(stations[0][1],eye))),journey=null,insideDarkroom=false,veil=0,windowFocus=0;
  const indoorPower=1/4.5;
  let focusPull=null,manualWeight=0,manualPower=indoorPower,meterTarget=indoorPower;
  let lastMeterTime=-Infinity,meterPose=null,focusLayers=null,ambientTimer=0;
  const maxRenderEdge=Math.min(maxTextureSize,gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
  const [maxViewportWidth,maxViewportHeight]=gl.getParameter(gl.MAX_VIEWPORT_DIMS);
  const samplingSettleDelay=500;
  let restoreSamplingAt=0;
  let panChanged=false;
  // One browser viewport of scrolling connects adjacent views within a workspace.
  // Gallery frames share an eye height and wall distance, so the wall passes parallel to the viewer.
  const firstLensStop=2;
  const routes=[null,[
    ['Print table',[printTableCenterX,2.30,4.41],[printTableCenterX,.75,tableZ],44],
    ...prints.map((z,i)=>[galleryPrints[i].title,[-2.87,2.045,z],[-5.663,2.045,z],53])
  ],[
    ['Workbench',...stations[2],.85],
    ['Camera study',[1.03,1.43,3.43],kitPoint(-4,35,2),42,.46],
    ...opticalCenters.map(([x,y,z],i)=>['Lens '+(i+1)+' of '+lensProjects.length,[x+.36,y+.42,z+.95],[x,y+.31,z],56,.475])
  ],[
    ['Project board',...stations[3],.97],['Project overview',[2.69,1.29,-3.12],[2.69,1.29,-4.16],45,.63],
    ['Implementation',add(screens[1].center,mult(screens[1].normal,1.14)),screens[1].center,50,.25]
  ],[
    ['Darkroom',...stations[4],.74],['Drying line',[-4.47,2.04,-3.55],[-4.47,2.04,-4.735],42,.68],
    ['Developing trays',[-4.43,1.83,-3.29],[-4.53,trayPaperY,trayZ],49,.67],
    ...trayPrints.map(({x,height,atlas},i)=>{
      // Stand just in front of each tray; leave room below the print for the controls.
      const distance=.54,halfWidth=height*atlas[2]/atlas[3]/2;
      return ['Print '+(i+1)+' of 3',[x,trayPaperY+.51,trayZ+.195],[x,trayPaperY,trayZ+.035],
        2*Math.atan(height/(distance*1.36))*180/Math.PI,(halfWidth+.025)/distance];
    })
  ],[
    ['Mount Fuji',...stations[5]],['Along the shore',[.56,2.04,-2.58],[5.76,2.04,.12],32],
    ['Eastern shore',[.56,2.04,4.68],[5.76,2.04,1.68],32]
  ],[
    [aboutTitle,...stations[6]],
    [profileWall[0].title,[panelX,panelCenter,panelZ-1.40],[panelX,panelCenter,panelZ],aboutAngle(1.5)],
    ['On rotation',[4.22,2.32,5.75],[5.72,2.32,5.78],aboutAngle(1.5)]
  ]];
  const guitarView=[[3.65,1.03,4.16],[4.96,.52,5.99]];
  const profileCorners=[paperPoint(0,0),paperPoint(paperWidth,0),paperPoint(0,paperHeight),paperPoint(paperWidth,paperHeight)];
  const guitarCorners=[];
  for(const g of guitars)for(const x of [-.21,.21])for(const y of [-.11,.97])guitarCorners.push(g.point([x,y,.10]));
  // Back up along the optical axis only when the viewport would crop a subject.
  function fitAboutEye(eye,aim,points,widthFraction,heightFraction){
    const forward=unit(sub(aim,eye)),right=unit(cross(forward,[0,1,0])),up=cross(right,forward);
    const corners=points.map(point=>{
      const p=sub(point,eye);
      return [Math.abs(dot(p,right))/(aboutHalfWidth*widthFraction),
        Math.abs(dot(p,up))/(aboutHalfWidth*heightFraction),dot(p,forward)];
    });
    return aspect=>{
      let retreat=0;
      for(const [horizontal,vertical,depth] of corners){
        retreat=Math.max(retreat,horizontal-depth,vertical*aspect-depth);
      }
      return sub(eye,mult(forward,retreat));
    };
  }
  const overviewPoints=[...profileCorners,...guitarCorners,[5.77,2.10,3.35]];
  const shelfCorners=[[5.65,1.48,4.88],[5.65,1.48,6.68],[5.74,3.24,4.88],[5.74,3.24,6.68]];
  const aboutFrames=[[overviewPoints,.90,.985],[profileCorners,.90,.77],[shelfCorners,.87,.76]];
  const aboutEyes=routes[aboutStation].map(([,eye,aim],stop)=>fitAboutEye(eye,aim,...aboutFrames[stop]));
  const guitarEye=fitAboutEye(...guitarView,guitarCorners,.87,.76);
  function windowFieldOfView(eye,aim,aspect){
    // Include the nearest lip of the sill as well as the top of the reveal.
    const forward=unit(sub(aim,eye)),right=unit(cross(forward,[0,1,0])),up=cross(right,forward);
    let tangent=0;
    for(const x of [5.56,5.95])for(const y of [1.02,3.50])for(const z of [-2.49,4.29]){
      const corner=sub([x,y,z],eye),depth=dot(corner,forward);
      tangent=Math.max(tangent,Math.abs(dot(corner,right))/(depth*aspect*.90),
        Math.abs(dot(corner,up))/(depth*.69));
    }
    return 2*Math.atan(tangent)*180/Math.PI;
  }
  let progress=0,lastTourTime=0,summary='';
  let selectedStop=0,slide=null,routeHeight=window.innerHeight;
  let drag=null,press=null;
  const projectTargets=document.getElementById('projectTargets');
  let hoverCard=-1;
  function liftCard(i){
    if(i===hoverCard)return;
    hoverCard=i;deskGraphics.hover(i);focusLayers=null;requestRender();
  }
  const cardButtons=studioProjects.map((p,i)=>{
    const button=document.createElement('button');
    button.className='projectTarget';
    button.setAttribute('aria-label',p.title);
    button.setAttribute('aria-pressed',String(i===selectedProject));
    button.onclick=()=>selectProject(i);
    button.onfocus=()=>liftCard(i);
    button.onblur=()=>liftCard(-1);
    projectTargets.append(button);
    return button;
  });
  function projectPercent(p){
    const point=sub(p,basis.origin),depth=dot(point,basis.forward);
    return [50+50*basis.sx*dot(point,basis.right)/depth,50-50*basis.sy*dot(point,basis.up)/depth,depth];
  }
  let guitarClose=false;
  const guitarSound=createGuitarSound(updateSoundLabel);
  const guitarPlayer=createGuitarPlayer(guitars,{
    canvas,project:projectPercent,requestRender,sound:guitarSound,
    visible(origin,p,margin){
      // A player looking round from a different station can have a desk or a
      // wall between them and a guitar. Compare the actual first surface.
      const offset=sub(p,origin),distance=Math.hypot(...offset);
      return 1/measureCenter(origin,mult(offset,1/distance))>=distance-margin;
    }
  });
  function updateSoundLabel(){
    const button=document.getElementById('guitarSound'),state=guitarSound.state();
    button.textContent=state==='on'?'Mute guitars':state==='muted'?'Unmute guitars':'Enable guitar sound';
  }
  function audioGesture(e){
    if(index===aboutStation && !e.target.closest?.('#guitarSound'))guitarSound.unlock();
  }
  document.addEventListener('pointerup',audioGesture);
  document.addEventListener('keydown',e=>{
    if(index!==aboutStation || detail.open || !panel.hidden || e.altKey || e.ctrlKey || e.metaKey)return;
    if(e.key==='Escape' && guitarClose){setGuitarClose(false);return;}
    if(/^[1-6]$/.test(e.key) && !e.repeat){
      e.preventDefault();guitarSound.unlock();guitarPlayer.key(Number(e.key)-1);
    }
  });
  function placeWallAnchor(anchor,points,raisedTop,minHeight=0){
    const corners=points.map(projectPercent);
    if(raisedTop){
      // One stable target covers both poses so a pointer resting on a sleeve
      // edge never alternates between lifting it and sending it back.
      raisedTop.map(projectPercent).forEach(([x,y],i)=>{
        corners[i][0]=i===0?Math.min(corners[i][0],x):Math.max(corners[i][0],x);
        corners[i][1]=Math.min(corners[i][1],y);
      });
    }
    if(minHeight){
      // The projected outline hugs the lettering; give small screens a steady touch target.
      const ys=corners.map(c=>c[1]);
      const extra=Math.max(0,minHeight*100/canvas.clientHeight-(Math.max(...ys)-Math.min(...ys)))/2;
      corners.forEach((p,i)=>{p[1]+=i<2?-extra:extra;});
    }
    const xs=corners.map(c=>c[0]),ys=corners.map(c=>c[1]);
    const left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
    anchor.hidden=corners.some(c=>c[2]<=0) || right<=0 || bottom<=0 || left>=100 || top>=100 ||
      right-left<.01 || bottom-top<.01;
    if(anchor.hidden)return;
    const style=anchor.style;
    style.left=left+'%';style.top=top+'%';style.width=(right-left)+'%';style.height=(bottom-top)+'%';
    style.clipPath='polygon('+corners.map(([u,v])=>100*(u-left)/(right-left)+'% '+100*(v-top)/(bottom-top)+'%').join(',')+')';
  }
  function positionWallLinks(){
    const inactive=index!==aboutStation || !!journey || guitarClose;
    profileTargets.hidden=inactive || basis.forward[2]<.25;
    playlistTargets.hidden=inactive || basis.forward[0]<.25;
    if(!profileTargets.hidden)for(const {anchor,x,y,width,height} of wallLinks){
      placeWallAnchor(anchor,[paperPoint(x,y),paperPoint(x+width,y),paperPoint(x+width,y+height),paperPoint(x,y+height)]);
    }
    if(!playlistTargets.hidden)for(const {anchor,corners,raisedTop} of recordShelves.targets)placeWallAnchor(anchor,corners,raisedTop);
  }
  const lensTargets=document.getElementById('lensTargets');
  const projectedLinks=lensProjects.map((project,i)=>{
    const anchor=profileAnchor({text:project.camera+' · '+project.title+' on GitHub',href:project.href});
    const description=document.createElement('span');
    description.id='lens-description-'+i;description.hidden=true;description.textContent=project.copy;
    anchor.setAttribute('aria-describedby',description.id);anchor.hidden=true;
    lensTargets.append(anchor,description);
    for(const event of ['pointerenter','pointerleave','focus','blur'])anchor.addEventListener(event,requestRender);
    const [l,t,r,b]=lensLink.bounds;
    return {anchor,corners:[[l,t],[r,t],[r,b],[l,b]].map(([u,v])=>lensPanelPoint(opticalCenters[i],u,v))};
  });
  function positionLensLink(active){
    lensTargets.hidden=active<0;
    for(let i=0;i<projectedLinks.length;i++){
      const {anchor,corners}=projectedLinks[i];
      if(i===active)placeWallAnchor(anchor,corners,null,24);
      else anchor.hidden=true;
    }
  }
  // Keep keyboard focus rings on the same pieces of paper that pointer rays hit.
  function positionProjectTargets(){
    const atDesk=index===3 && !journey;
    projectTargets.hidden=!atDesk || progress>.02 || basis.forward[2]>-.94;
    if(projectTargets.hidden)return;
    function place(button,points){
      const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
      const left=Math.min(...xs),top=Math.min(...ys);
      const width=Math.max(...xs)-left,height=Math.max(...ys)-top;
      button.hidden=width<=0 || height<=0 || left+width<0 || top+height<0 || left>100 || top>100;
      if(button.hidden)return;
      const style=button.style;
      style.left=left+'%';style.top=top+'%';style.width=width+'%';style.height=height+'%';
    }
    for(const [i,{x,y}] of projectCards.entries()){
      const lift=deskGraphics.lift(i);
      const corner=(dx,dy)=>projectPercent([x+dx,y+dy+.018*lift,cardZ+(.096+.085*(dy-cardHeight/2))*lift]);
      place(cardButtons[i],[corner(-cardWidth/2,cardHeight),corner(cardWidth/2,0)]);
    }
  }
  function deskTarget(ray){
    for(const [i,s] of screens.entries()){
      const incidence=dot(ray,s.normal);
      if(incidence>=-.001)continue;
      const distance=dot(sub(s.center,basis.origin),s.normal)/incidence;
      if(distance<=0)continue;
      const p=sub(add(basis.origin,mult(ray,distance)),s.center);
      const u=dot(p,s.right)/s.w+.5,v=.5-p[1]/s.h;
      if(u<-.008 || u>1.008 || v<-.01 || v>1.01)continue;
      return {kind:'monitor',id:i+1};
    }
    if(ray[2]>=-.001)return null;
    if(hoverCard>=0){
      const c=projectCards[hoverCard],lift=deskGraphics.lift(hoverCard),angle=.085*lift;
      const center=[c.x,c.y+cardHeight/2+.018*lift,cardZ+.096*lift],normal=[0,-Math.sin(angle),Math.cos(angle)];
      const depth=dot(sub(center,basis.origin),normal)/dot(ray,normal);
      const p=sub(add(basis.origin,mult(ray,depth)),center);
      if(depth>0 && Math.abs(p[0])<=cardWidth/2 && Math.abs(p[1])<=cardHeight/2*Math.cos(angle))return {kind:'card',id:hoverCard};
    }
    const t=(cardZ-basis.origin[2])/ray[2], hit=add(basis.origin,mult(ray,t));
    const card=projectCards.findIndex(({x,y})=>Math.abs(hit[0]-x)<=cardWidth/2 && hit[1]>=y && hit[1]<=y+cardHeight);
    return t>0 && card>=0?{kind:'card',id:card}:null;
  }
  const stationBounds=[
    [1,[-5.8,.8,-3],[-5.6,3.2,4.2]], [2,[-.18,.3,.77],[4.6,2.1,2.73]],
    [3,[.48,.35,-4.75],[4.68,2.78,-3.32]], [4,[-5.44,.1,-4.79],[-1.69,2.85,-2.9]],
    [5,[5.78,1.12,-2.36],[5.90,3.45,4.16]]
  ];
  // Resolve every scene action here before a pointer can enter camera-look mode.
  function targetAtPointer(e){
    if(!basis || journey)return null;
    const r=canvas.getBoundingClientRect(),nx=(2*(e.clientX-r.left)/r.width-1)/basis.sx,
      ny=(1-2*(e.clientY-r.top)/r.height)/basis.sy;
    const ray=add(basis.forward,add(mult(basis.right,nx),mult(basis.up,ny)));
    if(index===aboutStation){
      const guitar=guitarPlayer.target(basis.origin,ray);
      if(guitar)return guitar;
    }
    if(index===1 || index===5)return null;
    if(index===2 && progress>firstLensStop-1)return null;
    if(index===3){
      const desk=deskTarget(ray);
      if(desk)return desk;
    }
    const origin=basis.origin;
    if((index===0 || (index===aboutStation && selectedStop===0)) && ray[2]>.001){
      const t=(panelZ-origin[2])/ray[2];
      const [x,y]=add(origin,mult(ray,t));
      if(t>0 && Math.abs(x-panelX)<panelWidth/2 && Math.abs(y-panelCenter)<panelHeight/2){
        return {kind:'profile'};
      }
    }
    let closest=Infinity,selection=0;
    for(const [id,min,max] of stationBounds){
      let start=0,end=Infinity;
      for(let j=0;j<3;j++){
        if(Math.abs(ray[j])<.00001){if(origin[j]<min[j]||origin[j]>max[j]){end=-1;break;}continue;}
        const a=(min[j]-origin[j])/ray[j],b=(max[j]-origin[j])/ray[j];
        start=Math.max(start,Math.min(a,b));end=Math.min(end,Math.max(a,b));
      }
      if(end<start || start>=closest)continue;
      if(id===5 && 1/measureCenter(origin,ray)<start-.020)continue;
      if(id===2){
        // There is open air above and below the worktop. Only pick the bench
        // if the first visible surface along this ray lies inside its bounds.
        const surface=1/measureCenter(origin,ray);
        if(!Number.isFinite(surface) || surface<start || surface>end)continue;
        start=surface;
      }
      if(start<closest){closest=start;selection=id;}
    }
    return selection && selection!==index?{kind:'station',id:selection}:null;
  }
  function activateTarget({kind,id}){
    if(kind==='guitar' && !guitarClose)setGuitarClose(true);
    if(kind==='profile'){
      if(index!==aboutStation)showStation(aboutStation);
      window.scrollTo(0,routeHeight);
    }
    if(kind==='card')selectProject(id);
    if(kind==='monitor'){
      if(selectedStop!==id)window.scrollTo(0,routeHeight*id);
      else document.getElementById('more').click();
    }
    if(kind==='station')document.dispatchEvent(new CustomEvent('studio-select',{detail:id}));
  }
  function releaseLook(){
    press=null;
    if(!drag)return;
    guitarPlayer.reset();
    yaw=Math.atan2(Math.sin(yaw),Math.cos(yaw));
    drag=null;canvas.style.cursor='';requestRender();
  }
  window.addEventListener('blur',releaseLook);
  document.addEventListener('visibilitychange',requestRender);
  reducedMotion.addEventListener('change',requestRender);
  function scrollUnit(){return Math.max(1,window.innerHeight);}
  function setGuitarClose(close){
    if(close===guitarClose)return;
    guitarClose=close;
    document.getElementById('backToWall').hidden=!close;
    guitarPlayer.reset();
    journey={start:performance.now(),eye:[...eye],heading:[...heading],fov,
      duration:730,door:false,veil:0,sway:0,lift:.04};
    requestRender();
  }
  function openRoute(i){
    const gesture=press || drag;
    if(gesture && canvas.hasPointerCapture(gesture.id))canvas.releasePointerCapture(gesture.id);
    press=null;drag=null;canvas.style.cursor='';
    guitarPlayer.reset();
    guitarClose=false;document.getElementById('backToWall').hidden=true;
    if(i===aboutStation){guitarSound.unlock();updateSoundLabel();}
    liftCard(-1);
    hoveredSleeve=-1;
    const route=routes[i];
    document.body.classList.toggle('tour',!!route);
    routeHeight=scrollUnit();
    document.body.style.height=route ? (route.length*routeHeight)+'px' : '';
    window.scrollTo(0,0);progress=0;selectedStop=0;slide=null;summary='';
    canvas.style.touchAction=i===3?'pan-y pinch-zoom':route?'pan-y':'none';
    document.getElementById('hint').textContent=route?'Scroll to explore · ← → change room':'Drag to look · Use ← → to explore';
  }
  window.addEventListener('scroll',()=>{if(guitarClose)setGuitarClose(false);if(routes[index])requestRender();},{passive:true});
  // A display or zoom change can alter the pixel density without resizing the window.
  if(window.ResizeObserver && 'devicePixelContentBoxSize' in ResizeObserverEntry.prototype)
    new ResizeObserver(requestRender).observe(canvas,{box:'device-pixel-content-box'});
  function watchPixelRatio(){
    const current=matchMedia('(resolution: '+window.devicePixelRatio+'dppx)');
    current.addEventListener('change',()=>{watchPixelRatio();requestRender();},{once:true});
  }
  watchPixelRatio();
  window.addEventListener('resize',()=>{
    requestRender();
    if(!routes[index])return;
    const position=window.scrollY/routeHeight;
    routeHeight=scrollUnit();
    document.body.style.height=routes[index].length*routeHeight+'px';
    window.scrollTo(0,position*routeHeight);
  });
  function render(now){raf=0;
    clearTimeout(ambientTimer);
    if(document.hidden || !studioLoading.canDraw())return;
    const css=canvas.getBoundingClientRect();if(!css.width||!css.height)return;
    const aspect=css.width/css.height;
    let [dest,aim,angle]=stations[index];
    if(index===0 && aspect<1)angle=70;
    let moving=false;
    const route=routes[index];
    if(route){
      const position=Math.max(0,Math.min(route.length-1,window.scrollY/routeHeight));
      // Cross 58% to commit in either direction. The gap between the forward
      // and reverse thresholds absorbs small trackpad reversals near the boundary.
      const threshold=.58;
      if(position>=selectedStop+threshold)selectedStop=Math.floor(position+1-threshold);
      else if(position<=selectedStop-threshold)selectedStop=Math.ceil(position-1+threshold);
      if(reducedMotion.matches){
        slide=null;progress=selectedStop;
      }else{
        if(slide){
          const t=Math.min(1,(now-slide.start)/slide.duration);
          progress=mix(slide.from,slide.to,ease(t));
          if(t===1){progress=slide.to;slide=null;}
        }
        // Finish each glide after the wheel stops. A sustained scroll queues the
        // next exhibit; a deliberate reversal starts from the current camera pose.
        if(selectedStop!==progress && (!slide || (selectedStop-progress)*(slide.to-progress)<0)){
          const to=selectedStop>progress?Math.floor(progress)+1:Math.ceil(progress)-1;
          const baseDuration=index===1 && Math.min(progress,to)<1?1020:780;
          slide={from:progress,to,start:now,duration:baseDuration*Math.max(.35,Math.abs(to-progress))};
        }
        moving=slide!==null;
      }
      const lo=Math.floor(progress),hi=Math.min(lo+1,route.length-1);
      const t=progress-lo,from=route[lo],to=route[hi];
      const u=t;
      dest=from[1].map((v,k)=>mix(v,to[1][k],u));
      aim=from[2].map((v,k)=>mix(v,to[2][k],u));
      angle=mix(from[3],to[3],u);
      if(index===aboutStation){
        angle=aboutAngle(aspect);
        if(guitarClose){
          dest=guitarEye(aspect);aim=guitarView[1];
        }else{
          const start=aboutEyes[lo](aspect),end=aboutEyes[hi](aspect);
          dest=start.map((v,k)=>mix(v,end[k],u));
        }
      }
      if(index===2 || index===3 || index===4){
        // Keep the full exhibit in view as the viewport narrows.
        const stopAngle=k=>Math.max(route[k][3],2*Math.atan(route[k][4]/aspect)*180/Math.PI);
        angle=mix(stopAngle(lo),stopAngle(hi),u);
      }
      if(index===5){
        // Step back in portrait, keeping the summit below the upper crossbar.
        const retreat=Math.min(1,Math.max(0,(1.25-aspect)/.8));
        dest[0]-=1.05*retreat;
        dest[1]-=.11*retreat;
        angle=Math.max(angle,windowFieldOfView(dest,aim,aspect));
      }
      if(index===1){
        // Lift the camera around the corner of the table as it tilts up to the wall.
        if(lo===0){
          dest[1]+=.24*Math.sin(Math.PI*u);dest[0]+=.26*Math.sin(Math.PI*u);
          const tableAngle=2*Math.atan(.45/aspect)*180/Math.PI;
          angle+=Math.max(0,tableAngle-from[3])*(1-u);
        }
        const narrow=Math.max(0,.74/aspect-1);
        const printWeight=Math.min(1,progress);
        dest[0]+=narrow*printWeight;
        // Give the caption below the print its own space above the tour controls.
        const labelOffset=(.09+.28*Math.max(0,Math.min(1,(1-aspect)*2)))*printWeight;
        dest[1]-=labelOffset;
        aim[1]-=labelOffset;
      }
      const nearest=Math.round(progress),name=route[nearest][0];
      if(summary!==name){
        summary=name;
        document.getElementById('stage').classList.toggle('monitorCloseup',index===3 && nearest>0);
        document.getElementById('stationTitle').textContent=name;
        if(index===aboutStation){
          document.getElementById('viewPlaylist').textContent=nearest===2?'Back to overview':'View playlist';
          document.getElementById('guitarSound').hidden=nearest===2;
          document.getElementById('more').firstChild.textContent=nearest===2?'Track list ':'Read biography ';
        }
        document.getElementById('kicker').textContent=['','Gallery','Camera Lab','Software Desk','Darkroom','Lake Kawaguchiko','Studio wall'][index];
        document.getElementById('intro').textContent=index===aboutStation && nearest===2?'Select a record to open it in Apple Music.':index===6 && nearest===0?'Brush across the guitar strings to play.':index===3 && nearest===0?'Select a project card. Click a monitor for a closer look.':index===1 && nearest===0?'↓ Scroll to the first photograph':index===1 && nearest===1?'↑ Print table   ·   ↓ Next photograph':
          (nearest===0?'Scroll down to explore':nearest===route.length-1?'Scroll up to revisit':'Scroll to explore');
        if(index===2 && nearest===firstLensStop-1)document.getElementById('intro').textContent='Scroll to the first lens.';
        if(index===2 && nearest===0)document.getElementById('intro').textContent='Scroll to the camera.';
      }
    }
    const elapsed=Math.min(.08,Math.max(.001,(now-lastTourTime)/1000));
    lastTourTime=now;
    if(moving)liftCard(-1);
    const deskMoving=deskGraphics.frame(now,elapsed,reducedMotion.matches);
    const wiresMoving=guitarPlayer.frame(now,reducedMotion.matches);
    let sleeve=-1;
    if(index===aboutStation && !journey && !guitarClose && !playlistTargets.hidden && !detail.open && panel.hidden){
      sleeve=hoveredSleeve;
      if(sleeve<0)sleeve=recordShelves.targets.findIndex(({anchor})=>anchor===document.activeElement && anchor.matches(':focus-visible'));
    }
    const sleevesMoving=advanceHoverLifts(sleeveLifts,sleeve,elapsed,reducedMotion.matches);
    if(deskMoving || wiresMoving)focusLayers=null;
    if(sleevesMoving && focusLayers)focusLayers.interior=false;
    if(!drag && !press){
      const decay=reducedMotion.matches?0:Math.exp(-elapsed*5.8);
      yaw*=decay;pitch*=decay;
      if(Math.abs(yaw)<.0001)yaw=0;
      if(Math.abs(pitch)<.0001)pitch=0;
    }
    const looking=!drag && !press && (yaw!==0 || pitch!==0);
    const endHeading=angles(unit(sub(aim,dest)));
    let fade=0;
    if(journey && !reducedMotion.matches){
      const j=journey,t=Math.min(1,Math.max(0,(now-j.start)/j.duration));
      const u=ease(t);
      if(j.door){
        if(t<.46)fade=mix(j.veil,1,ease(t/.46));
        else {
          eye=dest;heading=endHeading;fov=angle;insideDarkroom=index===4;
          fade=1-ease(Math.max(0,(t-.54)/.46));
        }
      }else{
        eye=j.eye.map((v,i)=>mix(v,dest[i],u));
        const arc=4*u*(1-u);
        eye[0]+=j.sway*arc;eye[1]+=j.lift*arc;
        const turn=Math.atan2(Math.sin(endHeading[0]-j.heading[0]),Math.cos(endHeading[0]-j.heading[0]));
        heading=[j.heading[0]+turn*u,mix(j.heading[1],endHeading[1],u)];
        fov=mix(j.fov,angle,u);
        fade=j.veil*(1-u);
      }
      if(t>=1)journey=null;
    }else{
      journey=null;eye=dest;heading=endHeading;fov=angle;insideDarkroom=index===4;
    }
    if(fade!==veil){veil=fade;canvas.parentElement.style.setProperty('--door-fade',String(fade));}
    // The lens has its own clock. Hold the indoor focus during the approach,
    // then rack in optical power; a slow frame must not skip the entire pull.
    if(focusPull && now>=focusPull.start){
      const p=focusPull;
      p.elapsed+=Math.min(p.duration*.20,Math.max(0,now-p.last));p.last=now;
      const t=reducedMotion.matches?1:Math.min(1,p.elapsed/p.duration);
      windowFocus=mix(p.from,p.to,ease(t));
      if(t>=1)focusPull=null;
    }
    const a=heading[0]+yaw,e=Math.max(-1.3,Math.min(1.3,heading[1]+pitch)),forward=[Math.sin(a)*Math.cos(e),Math.sin(e),-Math.cos(a)*Math.cos(e)],right=unit(cross(forward,[0,1,0])),up=cross(right,forward);
    // Use cheaper shader sampling during camera travel at the same canvas size.
    const returningFromPan=!drag && !press && Math.abs(yaw)+Math.abs(pitch)>.003;
    const cameraMoving=!!(journey || moving || focusPull || panChanged || returningFromPan);
    panChanged=false;
    if(cameraMoving)restoreSamplingAt=now+samplingSettleDelay;
    const fastSampling=now<restoreSamplingAt;
    const scale=Math.min(window.devicePixelRatio||1,maxRenderEdge/Math.max(css.width,css.height),
      maxViewportWidth/css.width,maxViewportHeight/css.height);
    const w=Math.max(1,Math.round(css.width*scale)),h=Math.max(1,Math.round(css.height*scale));
    if(canvas.width!==w)canvas.width=w;
    if(canvas.height!==h)canvas.height=h;
    gl.viewport(0,0,w,h);
    const k=1/Math.tan(fov*Math.PI/360),sx=k/aspect,sy=k,z=1.002,t=-.08008,mat=[];for(let i=0;i<3;i++)mat.push(sx*right[i],sy*up[i],z*forward[i],forward[i]);mat.push(-dot(right,eye)*sx,-dot(up,eye)*sy,-dot(forward,eye)*z+t,-dot(forward,eye));
    basis={right,up,forward,sx,sy,origin:eye};
    positionProjectTargets();
    positionWallLinks();
    const lens=index===2 && !journey?Math.round(progress)-firstLensStop:-1;
    const reveal=lens>=0?Math.max(0,1-2*Math.abs(progress-firstLensStop-lens)):0;
    const animateProjection=reveal>0 && !reducedMotion.matches && !document.hidden;
    const projectionSeconds=animateProjection?(now*.001)%(projectionBeat*240):-1;
    // Sample the fast slips at display refresh; the quiet interval uses the ambient rate.
    const trackingWindow=animateProjection && projectionSeconds%projectionBeat<.43;
    positionLensLink(reveal>.98 && !slide?lens:-1);
    const linkLit=!lensTargets.hidden && projectedLinks[lens].anchor.matches(':hover,:focus-visible');
    const metering=!!drag && drag.travel>=4;
    const cameraPose=[...eye,...forward];
    if(metering){
      if(!meterPose || (now-lastMeterTime>=70 && cameraPose.some((v,i)=>Math.abs(v-meterPose[i])>.00001))){
        meterTarget=Math.min(6,measureCenter(eye,forward));
        if(!meterPose)manualPower=indoorPower*(1-windowFocus);
        meterPose=cameraPose;lastMeterTime=now;
      }
      manualPower=mix(manualPower,meterTarget,1-Math.exp(-elapsed*7));
      if(Math.abs(manualPower-meterTarget)<.0005)manualPower=meterTarget;
    }else meterPose=null;
    const manualTarget=metering?1:0;
    manualWeight=mix(manualWeight,manualTarget,1-Math.exp(-elapsed*(metering?6:4.6)));
    if(Math.abs(manualWeight-manualTarget)<.001)manualWeight=manualTarget;
    const lensMoving=!!focusPull || manualWeight!==manualTarget || (metering &&
      (manualPower!==meterTarget || cameraPose.some((v,i)=>Math.abs(v-meterPose[i])>.00001)));
    const opticalPower=mix(indoorPower*(1-windowFocus),manualPower,manualWeight);
    const lensAvailable=Math.max(w,h)<=maxTextureSize;
    const portals=insideDarkroom?[]:studioVisibility.windows(mat,w,h);
    const aperture=windowLens.apertureScale(w,h,fov);
    const lensScale=aperture*mix(windowFocus,mix(.40,.72,windowFocus),manualWeight);
    const waterBlur=mix((1-windowFocus)*Math.min(6,.0045*Math.min(w,h)),
      Math.min(12,aperture*mix(.40,.72,windowFocus)*manualPower),manualWeight);
    const frustum=studioVisibility.frustum(mat);
    const sway=!insideDarkroom && !document.hidden && !reducedMotion.matches &&
      curtainChunks.some(c=>studioVisibility.intersects(c,frustum));
    // A moving drape needs fresh indoor colour. A stationary view can still
    // reuse the exterior in the glass, including its reflected landscape.
    const reflections=!insideDarkroom && windowLens.supportsReflections;
    const darkroomWhite=darkroomLightAt(now);
    const useLayer=lensAvailable;
    // Composite the waves the same way while approaching the window and at rest.
    const separateWaves=lensAvailable && !reducedMotion.matches;
    // Include the downshore banks and their virtual image below the lake.
    const movingClouds=!reducedMotion.matches && portals.some(rect=>
      studioVisibility.intersects([0,0,9500,-2650,-6800,15800,2650,14500],studioVisibility.frustum(mat,rect)));
    const cloudTime=movingClouds?Math.floor(now/160)*.16:0.;
    const sameView=lensAvailable && focusLayers && focusLayers.w===w && focusLayers.h===h &&
      focusLayers.reduced===reducedMotion.matches && focusLayers.dark===insideDarkroom &&
      (focusLayers.water || !portals.length || focusLayers.waterBlur===waterBlur) &&
      mat.every((v,i)=>v===focusLayers.matrix[i]);
    const reuseOutside=sameView && cloudTime===focusLayers.cloudTime;
    const reuse=useLayer && sameView && focusLayers.interior && focusLayers.darkroomWhite===darkroomWhite && focusLayers.fastSampling===fastSampling &&
      focusLayers.linkLit===linkLit && !sway && !animateProjection;
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    if(reuseOutside)cancelWaves();
    const animateWater=reuseOutside?focusLayers.water:drawLake(mat,eye,texture,floorMap,rugMap,portals,separateWaves,waterBlur,cloudTime);
    if(lensAvailable && portals.length)drawWindowGlass(mat,eye,portals,w,h,waterBlur,texture,!reuseOutside);
    const blurInterior=useLayer && (reuse || windowLens.begin(w,h));
    if(!reuse){
      gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.clear(gl.DEPTH_BUFFER_BIT);bindRoom();deskGraphics.bind();
      gl.uniform1fv(wireUniform,guitarPlayer.bend);gl.uniform1f(widthUniform,w);
      gl.uniform1fv(sleeveUniform,sleeveLifts);
      gl.uniform1f(curtainUniform,sway?(now*.00076)%turn:0);
      gl.uniform1f(darkroomLightUniform,darkroomWhite);
      gl.uniform1i(fastShadowsUniform,fastSampling?1:0);
      gl.uniform3fv(eyeUniform,eye);gl.uniformMatrix4fv(uniform,false,mat);
      const inView=c=>studioVisibility.intersects(c,frustum) && (insideDarkroom?
        c[2]<-1.53 && c[4]<-2.71 && c[5]>-5.97 && c[7]>-5.05 && c[3]<3.26:
        !(c[5]<-1.72 && c[7]<-3.01 && c[2]>-5.76 && c[4]>-4.80 && c[6]<3.07));
      drawOpaqueSurfaces(inView);
      drawPrintedSurfaces(frustum);
      gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
      const viewDepth=g=>dot(sub(g.center,eye),forward);
      transparentGroups.sort((a,b)=>viewDepth(b)-viewDepth(a));
      for(const g of transparentGroups)if(inView(g.bounds))drawRoom(g.first,g.count);
      if(reveal>0){
        gl.uniform1f(projectionUniform,reveal);
        gl.uniform1f(projectionTimeUniform,projectionSeconds);
        if(linkLit)gl.uniform4fv(linkFrameUniform,lensLink.bounds);
        else gl.uniform4f(linkFrameUniform,0,0,0,0);
        if(!lensMaps[lens])lensMaps[lens]=materialTexture('atlas',0,paintLensPanel(lensProjects[lens],lens,lensLink),false);
        gl.bindTexture(gl.TEXTURE_2D,lensMaps[lens]);
        drawRoom(...lensRanges[lens]);
        gl.bindTexture(gl.TEXTURE_2D,texture);
      }
      gl.depthMask(true);gl.disable(gl.BLEND);
      if(blurInterior)windowLens.filterLighting(mat);
      focusLayers={w,h,matrix:mat,water:animateWater,waterBlur,interior:blurInterior,reduced:reducedMotion.matches,dark:insideDarkroom,darkroomWhite,linkLit,fastSampling};
    }
    focusLayers.cloudTime=cloudTime;
    // Keep the blurred window frame stable against the reflection as focus settles outdoors.
    if(blurInterior)windowLens.finish(lensScale,opticalPower,basis,texture,fastSampling && windowFocus===0,reflections,insideDarkroom?darkroomWhite:-1);
    if(animateWater)finishWater(basis,texture,!(sway || animateProjection || journey || moving || looking || lensMoving),waterBlur);

    shown=true;studioLoading.frame();
    if(journey || moving || looking || lensMoving || deskMoving || wiresMoving || sleevesMoving || trackingWindow || darkroomWhite!==darkroomTarget){
      requestRender();
    }else if((sway || animateProjection) && !gl.isContextLost()){
      ambientTimer=setTimeout(requestRender,1000/24);
    }else if(fastSampling || movingClouds){
      ambientTimer=setTimeout(requestRender,Math.min(fastSampling?Math.ceil(restoreSamplingAt-now):Infinity,movingClouds?160:Infinity));
    }}
  function requestRender(){if(!raf)raf=requestAnimationFrame(render);}
  let displayedProject=selectedProject;
  window.studioRoom={toggleGuitarSound(){guitarSound.toggle();},returnToWall(){setGuitarClose(false);},
    toggleDarkroomLight(){
      const now=performance.now();
      darkroomFrom=darkroomLightAt(now);lightSwitchTime=now;
      darkroomTarget=1-darkroomTarget;
      document.getElementById('darkroomLight').textContent=darkroomTarget?'Use red light':'Use white light';
      focusLayers=null;requestRender();
    },
    atPlaylist(){return index===aboutStation && Math.round(progress)===2;},
    viewPlaylist(){
      if(guitarClose)setGuitarClose(false);
      window.scrollTo(0,Math.round(progress)===2?0:2*routeHeight);
    },updateProject(i){
    if(displayedProject===i)return;
    deskGraphics.select(i);
    cardButtons[displayedProject].setAttribute('aria-pressed','false');
    cardButtons[i].setAttribute('aria-pressed','true');
    displayedProject=i;focusLayers=null;requestRender();
  },go(i){
    if(!stations[i])return;
    if(shown && i===index){if(i===3 || i===6)window.scrollTo(0,0);if(guitarClose)setGuitarClose(false);summary='';requestRender();return;}
    index=i;openRoute(i);
    const distance=Math.hypot(...sub(stations[i][0],eye));
    const door=insideDarkroom!==(i===4);
    heading=[heading[0]+yaw,heading[1]+pitch];yaw=0;pitch=0;
    const now=performance.now();
    journey=shown ? {start:now,eye:[...eye],heading:[...heading],fov,door,veil,
      duration:door?900:Math.min(1780,860+distance*104),
      sway:Math.sign(stations[i][0][2]-eye[2])*Math.min(.42,distance*.065),
      lift:Math.min(.18,distance*.035)} : null;
    const target=i===5?1:0;
    if(!journey || reducedMotion.matches){
      windowFocus=target;focusPull=null;
    }else if(!focusPull || focusPull.to!==target){
      const start=now+(target===1?.61:.08)*journey.duration;
      focusPull=Math.abs(target-windowFocus)<.0001?null:{
        from:windowFocus,to:target,start,last:start,elapsed:0,
        duration:Math.max(350,(target===1?1080:780)*Math.abs(target-windowFocus))
      };
    }
    requestRender();
  }};
  canvas.style.touchAction='none';
  canvas.addEventListener('pointerdown',e=>{
    if(e.button!==0 || !e.isPrimary)return;
    const target=targetAtPointer(e);
    if(target){
      press={target,id:e.pointerId,x:e.clientX,y:e.clientY,cancelled:false};
      if(target.kind==='strings' || target.kind==='guitar'){
        guitarSound.unlock();
        if(e.pointerType!=='mouse'){guitarPlayer.reset();guitarPlayer.sweep(e,basis.origin);}
      }
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    drag={id:e.pointerId,x:e.clientX,y:e.clientY,travel:0,panPending:!!routes[index] && e.pointerType==='touch'};
    if(e.pointerType==='mouse')canvas.style.cursor='grabbing';
    if(!drag.panPending)canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove',e=>{
    if(e.pointerType==='mouse' && !e.buttons && (press || drag))releaseLook();
    if(index===aboutStation && basis && !journey && !slide && !drag && e.isPrimary &&
      ((e.pointerType==='mouse' && !press) || press?.target.kind==='strings' || press?.target.kind==='guitar')){
      const played=guitarPlayer.sweep(e,basis.origin);
      if(played && press)press.cancelled=true;
    }
    if(press){
      if(e.pointerId===press.id && Math.hypot(e.clientX-press.x,e.clientY-press.y)>=6){
        press.cancelled=true;liftCard(-1);
      }
      return;
    }
    if(!drag && e.pointerType==='mouse'){
      const target=targetAtPointer(e);
      liftCard(target?.kind==='card'?target.id:-1);
      canvas.style.cursor=target?'pointer':'';
    }
    if(!drag || e.pointerId!==drag.id)return;
    const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
    if(drag.panPending){
      if(Math.max(Math.abs(dx),Math.abs(dy))<7)return;
      if(Math.abs(dy)>Math.abs(dx)){releaseLook();return;}
      drag.panPending=false;canvas.setPointerCapture(e.pointerId);
    }
    drag.travel+=Math.hypot(dx,dy);drag.x=e.clientX;drag.y=e.clientY;
    panChanged=panChanged || dx!==0 || dy!==0;
    if(drag.travel>=6)liftCard(-1);
    yaw-=dx*.004;pitch=Math.max(-.85,Math.min(.85,pitch+dy*.004));requestRender();
  });
  canvas.addEventListener('pointerleave',()=>{liftCard(-1);guitarPlayer.reset();});
  function cancelPointer(e){
    if(press?.id===e.pointerId || drag?.id===e.pointerId)releaseLook();
    if(e.pointerType!=='mouse')guitarPlayer.reset();
  }
  canvas.addEventListener('lostpointercapture',cancelPointer);
  canvas.addEventListener('pointercancel',cancelPointer);
  canvas.addEventListener('pointerup',e=>{
    if(press?.id===e.pointerId){
      const p=press;press=null;
      if(!p.cancelled && Math.hypot(e.clientX-p.x,e.clientY-p.y)<6){
        const hit=targetAtPointer(e);
        if(hit?.kind===p.target.kind && hit.id===p.target.id)activateTarget(hit);
      }
      return;
    }
    if(drag?.id===e.pointerId)releaseLook();
  });
  window.addEventListener('pointerup',cancelPointer);
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();studioLoading.unavailable();});
  new ResizeObserver(requestRender).observe(canvas);
  studioLoading.done('room');window.studioRoom.go(active);
}
// Give the lightweight loading screen a paint before building the room meshes.
requestAnimationFrame(()=>requestAnimationFrame(()=>{
  initializeStudioRoom().catch(error=>{console.error(error);studioLoading.unavailable();});
}));
