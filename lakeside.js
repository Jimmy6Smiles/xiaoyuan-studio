/* Local tangent-plane landscape in metres, sharing the studio's viewpoint.
   Draw it before the room with its own depth range for kilometre-scale relief. */
function createLakeLandscape(gl, mesh, light, requestRender,restoreMaterials) {
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
    uniform sampler2D shadowAtlas,shoreScene;
    uniform float shadowStep;
    uniform mat4 shoreProjection;
    uniform vec2 shoreSize;
    uniform bool traceWater;
    const float pi=3.14159265;
    const vec2 chartSize=vec2(3072.,1536.);
    const vec3 sunlightRGB=vec3(${light.sunRGB.map(v=>v.toFixed(3)).join(',')});
    const float maxIrradiance=${light.maxIrradiance.toFixed(2)};
    const float sunGain=${light.sunGain.toFixed(2)};
    vec3 groundShadow(vec3 p){
      vec2 chart=p.xz/shadowStep+512.;
      vec2 edge=min(chart,1024.-chart);
      float inside=smoothstep(0.,2.,min(edge.x,edge.y));
      vec2 uv=(vec2(1440.,0.)+clamp(chart,.5,1023.5))/chartSize;
      return mix(vec3(1.),texture2D(shadowAtlas,uv).rgb,inside);
    }
    // The capture contains only outdoor geometry. RGB retains its colour;
    // alpha and the two low bits of R/G carry 12 bits of logarithmic view depth.
    float shoreDepth(vec2 uv){
      vec4 s=floor(texture2D(shoreScene,(floor(uv*shoreSize)+.5)/shoreSize)*255.+.5);
      float code=s.a*16.+mod(s.r,4.)*4.+mod(s.g,4.);
      return code>4094.5?1.e7:exp2(code*(17./4094.))-1.;
    }
    vec4 waterHit(vec3 p,vec3 dir){
      vec4 start=shoreProjection*vec4(p,1.),delta=shoreProjection*vec4(dir,0.);
      float travel=max(1.4,start.w*.004),previous=0.;
      for(int i=0;i<21;i++){
        vec4 clip=start+delta*travel;
        vec2 uv=.5+.5*clip.xy/clip.w;
        if(clip.w<.7 || (clip.w>5500. && delta.w>=0.) ||
           any(lessThan(uv,vec2(.002))) || any(greaterThan(uv,vec2(.998))))break;
        if(clip.w>=shoreDepth(uv)){
          float low=previous,high=travel;
          for(int j=0;j<6;j++){
            float t=.5*(low+high);
            clip=start+delta*t;
            uv=.5+.5*clip.xy/clip.w;
            if(clip.w>=shoreDepth(uv))high=t;else low=t;
          }
          clip=start+delta*high;
          uv=.5+.5*clip.xy/clip.w;
          float gap=abs(clip.w-shoreDepth(uv));
          vec2 edge=min(uv,1.-uv);
          float confidence=(1.-smoothstep(.5,2.5,gap/max(1.,clip.w*.003)))*
            smoothstep(.002,.045,min(edge.x,edge.y))*smoothstep(.4,2.,high);
          vec2 footprint=vec2(1.25,.55)/shoreSize;
          vec3 color=.50*texture2D(shoreScene,uv).rgb+
            .25*(texture2D(shoreScene,uv-footprint).rgb+texture2D(shoreScene,uv+footprint).rgb);
          return vec4(color,confidence);
        }
        previous=travel;travel=1.55*travel+2.;
      }
      return vec4(0.);
    }
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
        image=mix(image,sum/13.,smoothstep(.55,1.55,waterBlur));
      }
      image=mix(sky(reflected),image,hasMirror);
      if(traceWater && reflected.y>0. && waterBlur<3. && dist<6000.){
        // A distant water pixel integrates many small ripples. Trace its
        // mean normal so a single crest cannot pull a tree across the lake.
        vec3 meanNormal=normalize(mix(vec3(0.,1.,0.),n,mix(.56,.16,smoothstep(70.,900.,dist))));
        vec4 hit=waterHit(world+vec3(0.,.16,0.),reflect(direction,meanNormal));
        image=mix(image,hit.rgb,.44*hit.a*(1.-smoothstep(.75,3.,waterBlur))*
          (1.-smoothstep(3500.,6000.,dist)));
      }
      vec3 bank=groundShadow(world);
      sunlit*=bank.x*bank.z;
      float fresnel=.020+.98*pow(1.-clamp(dot(-direction,n),0.,1.),5.);
      float glitter=pow(max(dot(reflected,sun),0.),1320.);
      return mix(vec3(.17,.223,.233)*mix(.76,1.,bank.y),image*vec3(.88,.92,.94),.33+.48*fresnel)+
        sunlit*glitter*(.25*pow(sunlightRGB,vec3(1./2.2)))*(.24+.52*wind);
    }`;
  const fragmentSource=(derivatives?'#extension GL_OES_standard_derivatives : enable\n#define FACE_NORMAL\n':'')+`precision highp float;
    varying vec3 world,color;
    varying vec2 landUV;
    varying vec2 canopyUV;
    varying float kind;
    uniform vec3 eye;
    uniform vec2 tileOrigin;
    uniform float mirror,waterHeight,maskWater;
    uniform sampler2D terrainMap,fujiMap,sunMask,canopyMap;
    uniform float cloudTime;
    uniform vec3 fujiUV;
    uniform vec2 depthOrigin,depthSize,depthRange;
    uniform bool captureShore,hasObjectDepth;
    ${waterAndSky}
    float objectShadow(vec3 p){
      if(!hasObjectDepth)return 1.;
      vec3 u=normalize(cross(vec3(0.,1.,0.),sun)),v=cross(sun,u);
      vec2 texel=(vec2(dot(p,u),dot(p,v))-depthOrigin)/(shadowStep*.5);
      if(any(lessThan(texel,vec2(1.))) || any(greaterThan(texel,depthSize-1.)))return 1.;
      float distance=depthRange.x-dot(p,sun);
      vec2 cell=floor(texel-.5),f=fract(texel-.5);
      float visibility=0.;
      for(int y=0;y<2;y++)for(int x=0;x<2;x++){
        vec2 offset=vec2(float(x),float(y));
        vec2 uv=(vec2(1440.,1024.)+cell+offset+.5)/chartSize;
        vec2 bytes=texture2D(shadowAtlas,uv).rg;
        float depth=dot(bytes,vec2(65280.,255.))*depthRange.y/65535.;
        vec2 weights=mix(1.-f,f,offset);
        visibility+=weights.x*weights.y*(1.-smoothstep(2.,8.,distance-depth));
      }
      return visibility;
    }
    // The original mid-slope bank and its detached neighbours share the same
    // wind and filament profile. Coordinates and terrain hits are in metres.
    float cloudFootprint(vec2 point,vec2 center,vec2 radii){
      vec2 q=(point-center)/radii;
      return smoothstep(.01,.55,1.-dot(q,q));
    }
    vec3 cloudBanks(vec2 q){
      float waist=cloudFootprint(q,vec2(12600.,-1100.),vec2(2940.,5600.));
      float shoulder=max(cloudFootprint(q,vec2(13050.,5590.),vec2(1870.,1820.)),
        .71*cloudFootprint(q,vec2(13700.,10350.),vec2(1320.,1380.)));
      float aloft=max(cloudFootprint(q,vec2(14400.,8200.),vec2(1170.,2200.)),
        .75*cloudFootprint(q,vec2(13900.,13100.),vec2(1250.,1290.)));
      return vec3(waist,shoulder,aloft);
    }
    float cloudSun(vec3 p){
      if(p.x<2200. || p.x>16000. || p.y>2100.)return 1.;
      vec2 wind=vec2(170.*sin(cloudTime*.016),250.*sin(cloudTime*.021));
      float opticalDepth=0.;
      for(int i=0;i<3;i++){
        float altitude=i==0?1080.:(i==1?1192.:1825.);
        float t=(altitude-p.y)/sun.y;
        if(t<=0.)continue;
        vec2 q=p.xz+t*sun.xz;
        vec3 banks=cloudBanks(q);
        float cover=i==0?banks.x:(i==1?banks.y:banks.z);
        if(cover>.001)opticalDepth+=cover*smoothstep(.28,.74,noise((q-wind)*.00072));
      }
      return exp(-.36*opticalDepth);
    }
    vec4 mountainCloud(vec3 ray,float distance){
      if(ray.x<.53)return vec4(0.);
      vec2 slope=ray.yz/ray.x;
      if(slope.x<.036 || slope.x>.235 || slope.y<-.74 || slope.y>1.5)return vec4(0.);
      float first=max(0.,(9500.-eye.x)/ray.x);
      float last=min(distance,(15800.-eye.x)/ray.x);
      if(last<=first)return vec4(0.);

      float dt=(last-first)/24.,tau=0.,lightSum=0.;
      // Anchor the banks to the terrain. Wind shears their internal layers
      // at different speeds and lets local pockets condense and disperse.
      vec2 wind=vec2(170.*sin(cloudTime*.016),250.*sin(cloudTime*.021));
      vec2 eddyPhase=vec2(.54*sin(cloudTime*.037),.43*sin(cloudTime*.025));
      vec2 filamentPhase=vec2(.71*sin(cloudTime*.023),-.62*sin(cloudTime*.031));
      // The central snowfield sits above the original bank throughout its drift.
      float summitClearance=1.-(1.-smoothstep(.095,.175,abs(slope.y)))*smoothstep(.103,.125,slope.x);
      for(int i=0;i<24;i++){
        vec3 p=eye+ray*(first+(float(i)+.5)*dt);
        vec2 q=p.xz;
        vec3 banks=cloudBanks(q)*vec3(summitClearance,vec2(step(.19,slope.y)));
        if(max(banks.x,max(banks.y,banks.z))<.002)continue;
        float broad=noise((q-wind)*.00072);
        float eddy=noise(vec2(q.y*.002+q.x*.00024,p.y*.0043+q.x*.00016)+eddyPhase);
        float filaments=noise(vec2(q.y*.0041+q.x*.00042,p.y*.012-q.x*.00055)+filamentPhase);
        float phase=q.y*.00066+q.x*.00017;
        float moisture=.067*(sin(cloudTime*.047+phase)-sin(phase));
        float textureDensity=smoothstep(.29,.70,.46*broad+.36*eddy+.18*filaments+moisture);
        float lift=1080.+110.*sin(q.y*.00055)+130.*(eddy-.5)+95.*(broad-.5);
        // Sample all three banks with the original waist cloud's soft profile.
        // Change only their footprints, height and thickness across the slope.
        vec3 heights=vec3(lift,lift+112.+117.*sin(q.y*.00087),
                          lift+745.+180.*sin(q.y*.00063));
        vec3 thickness=(121.+177.*broad)*vec3(1.,.88,1.08);
        vec3 vertical=(vec3(p.y)-heights)/thickness;
        vec3 layer=1.-smoothstep(vec3(.10),vec3(1.),abs(vertical));
        vec3 depth=banks*layer*(textureDensity*dt*.00130);
        tau+=dot(depth,vec3(1.));
        vec2 litSide=q+sun.xz*290.;
        vec3 litLayer=1.-smoothstep(vec3(.10),vec3(1.),abs(vertical+290.*sun.y/thickness));
        float occlusion=dot(cloudBanks(litSide),litLayer)*noise((litSide-wind)*.00072);
        lightSum+=dot(depth,vec3(.69+.13*filaments-.36*occlusion)+.30*vertical);
      }
      float alpha=1.-exp(-tau);
      vec3 color=mix(vec3(.65,.64,.68),vec3(.96,.86,.74),clamp(lightSum/max(tau,.001),0.,1.));
      return vec4(alpha*color,alpha);
    }
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
        float stepSize=(endT-startT)/26.;
        for(int i=0;i<26;i++){
          vec3 p=eye+ray*(startT+(float(i)+.5)*stepSize);
          vec2 en=vec2(dot(p.xz,vec2(-.21491,-.97663)),dot(p.xz,vec2(-.97663,.21491)));
          vec2 uv=(tileOrigin+en*vec2(.00003136,-.00003136)-vec2(.40625,.15625))*8.;
          float edge=min(min(uv.x,uv.y),min(1.-uv.x,1.-uv.y));
          float shore=texture2D(sunMask,uv).g*smoothstep(0.,.04,edge);
          float patch=.70*noise(p.xz*.0028)+.30*noise(vec2(p.z*.009+p.y*.022,p.x*.007));
          float top=2.8+8.*smoothstep(.38,.77,patch);
          float above=p.y-waterHeight;
          float layer=smoothstep(-1.,1.4,above)*(1.-smoothstep(2.,top,above));
          tau+=shore*layer*smoothstep(.41,.77,patch)*smoothstep(170.,480.,length(p.xz))*stepSize*.0020;
        }
      }
      float shoreAlpha=1.-exp(-tau);
      vec4 cloud=mountainCloud(ray,distance);
      return vec4(shoreAlpha*shoreLight+(1.-shoreAlpha)*cloud.rgb,
                  shoreAlpha+(1.-shoreAlpha)*cloud.a);
    }
    void main(){
      vec3 ray=world-eye;
      float dist=length(ray);
      vec3 direction=ray/max(dist,.001);
      bool isSky=kind>3.5 && kind<4.5;
      if(captureShore && (isSky || dist>5500.))discard;
      if(mirror>.5 && world.y<waterHeight-.02 && !isSky)discard;
      vec4 leaves=vec4(1.);
      vec2 crownUV=canopyUV*vec2(.5,1.);
      if(kind>7.5){leaves=texture2D(canopyMap,crownUV);if(leaves.a<.36)discard;}
      vec4 mist=mistAlong(direction,dist);
      if(isSky){
        gl_FragColor=vec4(mist.rgb+(1.-mist.a)*sky(direction),1.);
        return;
      }
      float edge=min(min(landUV.x,landUV.y),min(1.-landUV.x,1.-landUV.y));
      float coverage=smoothstep(.002,.035,edge);
      vec2 regional=texture2D(shadowAtlas,clamp(world.xz/(shadowStep*8.)+720.,.5,1439.5)/chartSize).rg;
      vec3 terrainSun=texture2D(sunMask,landUV).rgb;
      float sunlit=mix(regional.x,terrainSun.r,coverage);
      if(kind>2.5 && kind<3.5){
        if(maskWater>.5)gl_FragColor=mist;
        else gl_FragColor=vec4(mist.rgb+(1.-mist.a)*lakeWater(world,direction,dist,sunlit),1.);
        return;
      }
      vec3 bank=groundShadow(world);
      float cloudLight=cloudSun(world);
      sunlit=min(sunlit,bank.z)*cloudLight;
      float toward=pow(max(dot(direction,sun),0.),7.);
      vec3 haze=mix(vec3(.445,.505,.578),vec3(.755,.665,.568),toward);
      vec3 result;
      if(kind<1.5){
        vec3 fallback=color*vec3(.94,.77,.74);
        vec3 base=texture2D(terrainMap,vec2(.5*clamp(landUV.x,.001,.999),landUV.y)).rgb;
        vec2 inset=(landUV-vec2(.40625,.15625))*8.;
        float border=min(min(inset.x,inset.y),min(1.-inset.x,1.-inset.y));
        vec2 crop=vec2(.5+.5*clamp(inset.x,.001,.999),clamp(inset.y,.001,.999));
        base=mix(base,texture2D(terrainMap,crop).rgb,smoothstep(.006,.052,border));
        base*=${light.landRange.toFixed(2)};
        // The photograph already includes terrain self-shadow. Remove only
        // the direct component where a nearer object, ridge or cloud blocks it.
        vec3 ambient=vec3(.44,.51,.66);
        vec3 direct=terrainSun.b*maxIrradiance*sunlightRGB;
        float transmission=bank.x*bank.z*cloudLight;
        base*=pow((ambient+transmission*direct)/(ambient+direct),vec3(1./2.2));
        // Register the native DEM/orthophoto inset with the regional material.
        vec2 summit=(landUV-fujiUV.xy)*fujiUV.z;
        float rim=min(min(summit.x,summit.y),min(1.-summit.x,1.-summit.y));
        float alpine=smoothstep(1230.,1620.,world.y)*smoothstep(.004,.085,rim);
        base=mix(base,texture2D(fujiMap,clamp(summit,0.,1.)).rgb*${Number(light.summitRange || 1).toFixed(2)},alpine);
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
          foliage*=(.58+.63*crowns+.42*surround)*pow(ambient+.55*transmission*direct,vec3(1./2.2));
          // Let fine aerial canopy detail show through the open groves above
          // the eastern shore, where individual crowns leave visible gaps.
          vec2 headland=vec2((world.x-755.)/440.,(world.z+600.+.32*(world.x-755.))/184.);
          float grove=1.-smoothstep(.42,1.,dot(headland,headland));
          float undergrowth=mix(.83,.97,smoothstep(12.,38.,rise))*(1.-.55*grove);
          base=mix(base,foliage,woods*undergrowth);
        }
        result=mix(fallback*mix(.66,1.,regional.x),base,coverage)*mix(.69,1.,bank.y)*mix(.86,1.,regional.y)*
          mix(1.,mix(.72,1.,cloudLight),alpine);
      }else if(kind>7.5){
        float crownHeight=1.-fract(canopyUV.y*2.);
        float shelter=mix(bank.y,1.,smoothstep(.12,.82,crownHeight));
        vec3 litLeaves=texture2D(canopyMap,crownUV+vec2(.5,0.)).rgb;
        result=mix(leaves.rgb,litLeaves,sunlit*objectShadow(world))*color*mix(.72,1.,shelter);
      }else{
        vec3 n=vec3(0.,1.,0.);
        #ifdef FACE_NORMAL
          vec3 face=cross(dFdx(world),dFdy(world));
          n=face/max(.000001,length(face));
          if(dot(n,-direction)<0.)n=-n;
        #endif
        float diffuse=clamp(sunGain*dot(n,sun),0.,maxIrradiance)*sunlit*objectShadow(world);
        vec3 base=color;
        if(kind>4.5 && kind<5.5){
          // Silt and coarse scree follow the bank in world space, including
          // its reflected view. The irregular damp margin follows lake level.
          vec2 p=world.xz+world.y*vec2(.47,-.82);
          float patch=noise(p*.16);
          float gravel=noise(p*.89);
          float damp=1.-smoothstep(.25,1.55,world.y-waterHeight+.85*(patch-.5));
          base*=mix(.65,1.09,patch)*mix(.78,1.08,gravel)*(1.-.24*damp);
        }
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
        result=base*pow(vec3(.37,.45,.60)*mix(.77,1.,bank.y)+diffuse*sunlightRGB,vec3(1./2.2));
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
      if(captureShore){
        float code=floor(min(1.,log2(1.+1./gl_FragCoord.w)/17.)*4094.+.5);
        vec2 bytes=floor(clamp(result.rg,0.,1.)*255./4.)*4.;
        gl_FragColor=vec4((bytes+vec2(mod(floor(code/4.),4.),mod(code,4.)))/255.,result.b,floor(code/16.)/255.);
        return;
      }
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
    'resolution','hasMirror','waterTime','waterBlur','eye','forward','right','up','tileOrigin',
    'shadowAtlas','shadowStep','shoreScene','shoreProjection','shoreSize','traceWater'].map(n=>[n,gl.getUniformLocation(composite,n)]));
  const chart=light.shadowChart;
  gl.useProgram(composite);
  gl.uniform1i(uniforms.shadowAtlas,3);gl.uniform1i(uniforms.shoreScene,2);
  gl.uniform1f(uniforms.shadowStep,chart.step);
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
  const captureUniform=loc('captureShore'),traceUniform=loc('traceWater');
  const shoreSizeUniform=loc('shoreSize'),shoreProjectionUniform=loc('shoreProjection');
  gl.uniform1i(loc('shoreScene'),2);
  gl.uniform1f(loc('shadowStep'),chart.step);
  gl.uniform2fv(loc('depthOrigin'),chart.depthOrigin);gl.uniform2fv(loc('depthSize'),chart.depthSize);
  gl.uniform2fv(loc('depthRange'),chart.depthRange);
  gl.uniform1i(loc('hasObjectDepth'),gl.getParameter(gl.MAX_TEXTURE_SIZE)>=3072);
  let textureRevision=0;
  const mirrorUniform=loc('mirror'),reflectionUniform=loc('hasMirror'),sizeUniform=loc('resolution');
  const maskUniform=loc('maskWater'),timeUniform=loc('waterTime'),waterBlurUniform=loc('waterBlur'),cloudUniform=loc('cloudTime');
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
      if(name!=='shadowAtlas'){
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
      }
      const ext=gl.getExtension('EXT_texture_filter_anisotropic');
      if(ext && name!=='shadowAtlas')gl.texParameterf(gl.TEXTURE_2D,ext.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(8,gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      gl.bindTexture(gl.TEXTURE_2D,previous);gl.activeTexture(gl.TEXTURE0);
      textureRevision++;studioLoading.done(name);requestRender();
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
  const shadowAtlas=loadMap('shadowAtlas',light.shadows,3,[255,255,255]);
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
  const shoreTarget=gl.createFramebuffer(),shoreColor=gl.createTexture(),shoreDepthBuffer=gl.createRenderbuffer();
  let shoreW=0,shoreH=0,shoreReady=false,shoreMatrix=null,shoreRevision=-1;
  gl.bindTexture(gl.TEXTURE_2D,shoreColor);
  for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,p,gl.LINEAR);
  for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,p,gl.CLAMP_TO_EDGE);
  let waterSSR=false;
  function captureShore(matrix,eye,w,h){
    const scale=Math.min(.5,800/Math.max(w,h));
    const a=Math.max(1,Math.round(w*scale)),b=Math.max(1,Math.round(h*scale));
    if(a===shoreW && b===shoreH && shoreRevision===textureRevision && shoreMatrix &&
       matrix.every((x,i)=>x===shoreMatrix[i]))return shoreReady;
    if(a!==shoreW || b!==shoreH){
      shoreW=a;shoreH=b;
      gl.bindTexture(gl.TEXTURE_2D,shoreColor);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,a,b,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      gl.bindRenderbuffer(gl.RENDERBUFFER,shoreDepthBuffer);
      gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,a,b);
      gl.bindFramebuffer(gl.FRAMEBUFFER,shoreTarget);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,shoreColor,0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,shoreDepthBuffer);
      shoreReady=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;
      gl.bindTexture(gl.TEXTURE_2D,landTexture);
    }else gl.bindFramebuffer(gl.FRAMEBUFFER,shoreTarget);
    if(shoreReady){
      gl.viewport(0,0,a,b);gl.disable(gl.SCISSOR_TEST);
      gl.clearColor(1,1,1,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      gl.disable(gl.DITHER);
      gl.uniform1f(mirrorUniform,0);gl.uniform1i(captureUniform,1);
      gl.uniform3fv(eyeUniform,eye);gl.uniformMatrix4fv(projection,false,matrix);
      const frustum=studioVisibility.frustum(matrix);
      studioVisibility.drawRanges(dryChunks,c=>
        c[2]<eye[0]+5500 && c[5]>eye[0]-5500 && c[4]<eye[2]+5500 && c[7]>eye[2]-5500 &&
        studioVisibility.intersects(c,frustum),draw);
      gl.uniform1i(captureUniform,0);gl.enable(gl.DITHER);gl.enable(gl.SCISSOR_TEST);
      gl.clearColor(.81,.85,.85,1);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,w,h);
    shoreMatrix=matrix.slice();shoreRevision=textureRevision;
    return shoreReady;
  }
  let waveFrame=0,lastWave=0,cachedWidth=0,cachedHeight=0;
  const clockStart=performance.now();
  function cancelWaves(){cancelAnimationFrame(waveFrame);waveFrame=0;}
  document.addEventListener('visibilitychange',()=>{cancelWaves();if(!document.hidden)requestRender();});
  gl.canvas.addEventListener('webglcontextlost',cancelWaves);
  function drawLake(matrix,eye,roomAtlas,floorMap,rugMap,portals,mayAnimate,waterBlur,cloudTime,offscreenSize){
    if(!offscreenSize)cancelWaves();
    if(!portals.length)return false;
    const frusta=portals.map(r=>studioVisibility.frustum(matrix,r,.68));
    const visible=c=>frusta.some(f=>studioVisibility.intersects(c,f));
    const visibleWater=wetChunks.filter(visible);
    const animateWater=mayAnimate && visibleWater.length>0;
    gl.useProgram(program);
    gl.uniform1i(traceUniform,0);
    gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,landTexture);
    gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,shadowAtlas);
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,summitTexture);
    gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,leavesTexture);
    gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_2D,landTexture);
    gl.activeTexture(gl.TEXTURE6);gl.bindTexture(gl.TEXTURE_2D,sunTexture);
    gl.activeTexture(gl.TEXTURE7);gl.bindTexture(gl.TEXTURE_2D,skyTexture);
    gl.activeTexture(gl.TEXTURE0);
    if(state)vao.bindVertexArrayOES(state);else layout();
    const [w,h]=offscreenSize || [gl.drawingBufferWidth,gl.drawingBufferHeight];
    if(!offscreenSize && visibleWater.length)resizeMirror(w,h);
    gl.uniform2f(sizeUniform,w,h);
    gl.uniform1f(maskUniform,animateWater?1:0);
    gl.uniform1f(timeUniform,(performance.now()-clockStart)*.001);
    gl.uniform1f(waterBlurUniform,waterBlur);
    gl.uniform1f(cloudUniform,cloudTime);
    const showMirror=!offscreenSize && usable && visibleWater.length>0;
    gl.enable(gl.SCISSOR_TEST);
    if(!offscreenSize){
      waterSSR=showMirror && waterBlur<3. && captureShore(matrix,eye,w,h);
    }
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
    if(!offscreenSize && waterSSR){
      gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,shoreColor);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform2f(shoreSizeUniform,shoreW,shoreH);
      gl.uniformMatrix4fv(shoreProjectionUniform,false,matrix);
      gl.uniform1i(traceUniform,1);
    }
    studioVisibility.drawRanges(visibleWater,()=>true,draw);
    gl.disable(gl.SCISSOR_TEST);
    gl.bindTexture(gl.TEXTURE_2D,roomAtlas);
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,roomShadow);
    restoreMaterials();
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
    gl.uniform1i(uniforms.traceWater,waterSSR?1:0);
    if(waterSSR){
      gl.uniformMatrix4fv(uniforms.shoreProjection,false,shoreMatrix);
      gl.uniform2f(uniforms.shoreSize,shoreW,shoreH);
    }
    gl.uniform2f(uniforms.resolution,w,h);gl.uniform1f(uniforms.hasMirror,usable?1:0);
    gl.uniform1f(uniforms.waterBlur,waterBlur);
    gl.uniform3fv(uniforms.eye,view.origin);gl.uniform3fv(uniforms.forward,view.forward);
    gl.uniform3fv(uniforms.right,view.right.map(v=>v/view.sx));
    gl.uniform3fv(uniforms.up,view.up.map(v=>v/view.sy));
    function paint(now){
      gl.useProgram(composite);
      gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,waterSSR?shoreColor:landTexture);
      gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,shadowAtlas);
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
      restoreMaterials();
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
