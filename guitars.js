/* The instruments are built in metres. Local +z is the soundboard normal,
   and y runs up the centre of the fretboard from the tail block. */
function buildGuitarCorner({vertices,face,tube,softBox,smoothQuad,rgb}){
  const tau=2*Math.PI, spruce=23, lacquer=24, grille=25;
  const rosewood='513426', ivory='e9dcc1', chrome='c1bfad', rubber='292a28';
  function frame(origin,heading,lean=0,roll=0){
    const c=Math.cos(heading),s=Math.sin(heading),a=Math.cos(lean),b=Math.sin(lean);
    const r=Math.cos(roll),q=Math.sin(roll);
    function vector([x,y,z]){
      const u=r*x-q*y,v=q*x+r*y,w=b*v+a*z;
      return [c*u+s*w,a*v-b*z,-s*u+c*w];
    }
    const point=p=>vector(p).map((v,i)=>v+origin[i]);
    return {point,vector,normal:vector([0,0,1]),right:vector([1,0,0]),up:vector([0,1,0])};
  }
  // Cubic outlines keep the bouts, waist and cutaway continuous at reading distance.
  function outline(start,curves){
    const points=[start];let p=start;
    for(const [a,b,c,d,x,y] of curves){
      for(let j=1;j<=12;j++){
        const t=j/12,u=1-t;
        points.push([u*u*u*p[0]+3*u*u*t*a+3*u*t*t*c+t*t*t*x,
                     u*u*u*p[1]+3*u*u*t*b+3*u*t*t*d+t*t*t*y]);
      }
      p=[x,y];
    }
    if(Math.hypot(p[0]-start[0],p[1]-start[1])<1e-8)points.pop();
    return points;
  }
  const acousticHalf=outline([0,0],[
    [.095,-.002,.196,.035,.199,.123],[.207,.202,.141,.241,.138,.282],
    [.131,.320,.166,.343,.152,.410],[.145,.463,.071,.493,0,.493]]);
  const acousticShape=[...acousticHalf,...acousticHalf.slice(1,-1).reverse().map(([x,y])=>[-x,y])];
  const electricShape=outline([0,0],[
    [.10,-.005,.163,.039,.159,.123],[.163,.197,.114,.230,.111,.265],
    [.107,.294,.141,.312,.123,.337],[.107,.355,.095,.317,.063,.313],
    [.035,.307,.025,.334,.028,.374],[.024,.399,.028,.400,0,.400],
    [-.022,.400,-.037,.386,-.060,.407],[-.098,.451,-.133,.446,-.136,.396],
    [-.145,.343,-.111,.310,-.109,.268],[-.110,.219,-.167,.182,-.167,.121],
    [-.173,.045,-.103,.003,0,0]]);
  const specs=[
    {name:'Steel-string acoustic',origin:[5.35,.115,5.59],yaw:-1.99,roll:.055,shape:acousticShape,
      bridge:.157,nut:.805,fretCount:20,front:.054,width:.055},
    {name:'Electric guitar',origin:[4.45,.117,6.37],yaw:-2.66,roll:-.065,shape:electricShape,
      bridge:.158,nut:.806,fretCount:21,front:.022,width:.053}
  ];
  function rod(a,b,r,color,mat=0,sides=10){tube(a,b,r,r,color,mat,sides);}
  function instrument(spec,id){
    const {origin,yaw,roll,shape,bridge,nut,front,width}=spec, electric=id===1;
    const axes=frame(origin,yaw,-.12,roll),{point,vector}=axes;
    const start=vertices.length;
    const segment=(a,b,r,color,mat=0,sides=10)=>rod(a,b,r,color,mat,sides);
    const rect=(x,y,z,w,h,d,color,mat=0)=>softBox(x,y,z,w,h,d,color,mat,.002);
    function circle(x,y,z,r,color,mat=0,depth=.001){
      tube([x,y,z-depth],[x,y,z],r,r,color,mat,40);
    }
    function annulus(x,y,z,outer,inner,color){
      for(let j=0;j<72;j++){
        const a=tau*j/72,b=tau*(j+1)/72;
        const p=(t,r)=>[x+r*Math.cos(t),y+r*Math.sin(t),z];
        face(p(a,inner),p(a,outer),p(b,outer),p(b,inner),color);
      }
    }
    // Scan-convert a planar outline into trapezoids. Subtracting the circular
    // loop leaves a real opening with a rim and a visible interior back.
    function plate(loops,z,color,mat=0){
      const edges=loops.flatMap(loop=>loop.map((p,i)=>[p,loop[(i+1)%loop.length]]));
      const heights=[...new Set(edges.map(([p])=>p[1]))].sort((a,b)=>a-b);
      const at=(edge,y)=>{const [p,q]=edge;return p[0]+(q[0]-p[0])*(y-p[1])/(q[1]-p[1]);};
      for(let j=1;j<heights.length;j++){
        const lo=heights[j-1],hi=heights[j],mid=(lo+hi)/2;
        if(hi-lo<1e-8)continue;
        const spans=edges.filter(([p,q])=>(p[1]>mid)!==(q[1]>mid)).sort((a,b)=>at(a,mid)-at(b,mid));
        for(let k=0;k+1<spans.length;k+=2){
          const l=spans[k],r=spans[k+1];
          const corners=[[at(l,lo),lo],[at(r,lo),lo],[at(r,hi),hi],[at(l,hi),hi]];
          smoothQuad(corners.map(([x,y])=>[x,y,z]),Array(4).fill([0,0,1]),rgb(color),mat,corners);
        }
      }
    }
    const back=electric?-.022:-.050,waist=electric?.218:.245;
    function scaled(p,scale,z){return [p[0]*scale,waist+(p[1]-waist)*scale,z];}
    const rings=electric?[[.971,back],[.994,back+.004],[1,back+.009],[1,front-.008],[.993,front-.003],[.971,front]]:
      [[.993,back],[1,back+.003],[1,front-.003],[.995,front]];
    const topColor=electric?'84352a':'d9ad73',sideColor=electric?'702c25':'79503a';
    for(let i=0;i<rings.length-1;i++)for(let j=0;j<shape.length;j++){
      const p=shape[j],q=shape[(j+1)%shape.length];
      const corners=[scaled(p,...rings[i]),scaled(q,...rings[i]),scaled(q,...rings[i+1]),scaled(p,...rings[i+1])];
      const color=electric?sideColor:i===1?sideColor:ivory;
      face(...corners,color,electric?lacquer:1);
    }
    const soundY=.337,soundR=.048;
    const hole=Array.from({length:72},(_,i)=>[soundR*Math.cos(i*tau/72),soundY+soundR*Math.sin(i*tau/72)]);
    const top=shape.map(p=>scaled(p,rings.at(-1)[0],front).slice(0,2));
    plate(electric?[top]:[top,hole],front,topColor,electric?lacquer:spruce);
    plate([shape],back,electric?sideColor:'55402e');
    if(!electric){
      for(let j=0;j<hole.length;j++){
        const p=hole[j],q=hole[(j+1)%hole.length];
        face([...p,front],[...q,front],[...q,front-.004],[...p,front-.004],'b18b57');
      }
      circle(0,soundY,back+.001,soundR*1.40,'392c23');
      for(const [out,inside,color] of [[.061,.0595,rosewood],[.058,.0565,ivory],[.055,.051,rosewood],[.0538,.0521,'ad8660'],[.0498,.0488,rosewood]])
        annulus(0,soundY,front+.0005,out,inside,color);
      const guard=outline([.053,.375],[[.087,.374,.107,.331,.105,.278],[.104,.232,.061,.210,.034,.226],
        [.020,.235,.033,.259,.051,.279],[.068,.304,.068,.344,.053,.375]]);
      plate([guard],front+.001,'744332',26);
    }else{
      const guard=outline([-.027,.381],[[-.052,.396,-.068,.420,-.097,.415],[-.124,.406,-.122,.380,-.113,.350],
        [-.103,.315,-.086,.280,-.098,.242],[-.105,.218,-.080,.201,-.058,.207],
        [-.015,.221,.016,.225,.069,.213],[.095,.205,.112,.233,.095,.257],
        [.083,.276,.082,.290,.085,.307],[.055,.290,.023,.310,.024,.348],[.024,.365,.026,.380,-.027,.381]]);
      plate([guard],front+.0018,'e6d9b9');
      for(const [x,y] of [[-.093,.397],[-.099,.249],[-.056,.219],[.083,.233],[.078,.295],[-.035,.363]])
        circle(x,y,front+.0025,.0018,chrome,3);
    }
    // Neck shaft and tapered fingerboard. Equal temperament fixes fret positions.
    const board=front+.010,root=bridge+(nut-bridge)*Math.pow(2,-(spec.fretCount+.45)/12);
    const half=y=>.021+.008*(nut-y)/(nut-root);
    function taper(y0,y1,z0,z1,w0,w1,color){
      const p=[[-w0,y0,z1],[w0,y0,z1],[w1,y1,z1],[-w1,y1,z1]];
      face(...p,color,27,p.map(([x,y])=>[x,y]));
      for(let j=0;j<4;j++){
        const a=p[j],b=p[(j+1)%4];face([...a.slice(0,2),z0],[...b.slice(0,2),z0],b,a,color);
      }
    }
    taper(root,nut,board-.025,board-.005,half(root),half(nut),'ae8053');
    taper(root,nut,board-.006,board,half(root),half(nut),electric?'523c32':'413028');
    for(let i=1;i<=spec.fretCount;i++){
      const y=bridge+(nut-bridge)*Math.pow(2,-i/12);
      segment([-half(y),y,board+.0007],[half(y),y,board+.0007],.0009,chrome,3,8);
      if([3,5,7,9,12,15,17,19,21].includes(i)){
        const center=bridge+(nut-bridge)*Math.pow(2,-(i-.5)/12);
        for(const x of i===12?[-.010,.010]:[0])circle(x,center,board+.00035,electric?.003:.0026,'e6d9bb');
      }
    }
    rect(0,nut-.002,board,.044,.004,.005,ivory);
    const head=electric?outline([-.021,nut],[
      [-.022,.846,-.025,.901,-.024,.945],[-.024,.969,.026,.969,.032,.944],
      [.038,.916,.006,.926,.006,.897],[.005,.862,.026,.849,.021,nut],[.001,nut,-.011,nut,-.021,nut]]):
      [[-.021,nut],[-.028,.832],[-.039,.942],[-.022,.961],[0,.953],[.022,.961],[.039,.942],[.028,.832],[.021,nut]];
    const headZ=board-.008;
    plate([head],headZ,'bc9162',spruce);
    for(let j=0;j<head.length;j++){
      const p=head[j],q=head[(j+1)%head.length];
      face([...q,headZ-.014],[...p,headZ-.014],[...p,headZ],[...q,headZ],'92704c');
    }
    plate([head],headZ-.014,'a47a50');
    if(electric){
      rect(0,bridge-.028,front+.003,.076,.077,.003,'aba89c',3);
      const pickup=(y,slant,color)=>{
        const x=.031,z=front+.008;
        const a=[-x,y-slant,z],b=[x,y+slant,z];
        segment(a,b,.0072,color,color===chrome?3:0,14);
        for(let i=0;i<6;i++){const t=i/5;circle((t-.5)*.050,y+slant*(t*2-1),z+.0074,.0017,chrome,3);}
      };
      pickup(.193,.007,'3a3730');pickup(.309,0,chrome);
      for(const x of [-.037,.037])rect(x,bridge-.026,front+.006,.002,.046,.005,chrome,3);
      rect(0,bridge-.026,front+.006,.076,.002,.007,chrome,3);
      for(let i=0;i<3;i++){
        const x=(i-1)*.018;
        segment([x-.008,bridge,front+.009],[x+.008,bridge,front+.009],.0042,'c09c56',3);
        segment([x,bridge-.024,front+.009],[x,bridge,front+.009],.0014,chrome,3);
      }
      rect(.085,.117,front+.002,.024,.104,.003,chrome,3);
      for(const y of [.135,.164]){circle(.085,y,front+.012,.0086,chrome,3,.009);circle(.085,y,front+.013,.0065,'aeada6',3);}
      rect(.085,.181,front+.005,.002,.027,.002,'343433');
      segment([.085,.196,front+.005],[.085,.204,front+.016],.0021,chrome,3);
      rect(.085,.202,front+.016,.006,.011,.006,rubber);
    }else{
      const bridgeShape=[[-.075,bridge-.013],[-.033,bridge-.020],[.033,bridge-.020],[.075,bridge-.013],
        [.073,bridge+.013],[.034,bridge+.011],[-.034,bridge+.011],[-.073,bridge+.013]];
      plate([bridgeShape],front+.009,rosewood,27);
      for(let j=0;j<bridgeShape.length;j++){const p=bridgeShape[j],q=bridgeShape[(j+1)%bridgeShape.length];face([...p,front],[...q,front],[...q,front+.009],[...p,front+.009],rosewood);}
      segment([-.031,bridge-.001,front+.010],[.031,bridge+.002,front+.010],.0016,ivory);
    }
    const strings=[];
    for(let i=0;i<6;i++){
      const bass=i<3,x=(i/5-.5)*width,nx=(i/5-.5)*.036;
      const pegX=electric?-.014:(bass?-1:1)*.021;
      const pegY=electric?.845+i*.019:.849+(bass?i:5-i)*.037;
      const sign=electric||bass?-1:1, endX=electric?-.036:sign*(.042+(pegY-.85)*.08);
      segment([pegX,pegY,headZ-.009],[endX,pegY,headZ-.009],.0027,chrome,3);
      rect(endX,pegY-.0045,headZ-.009,.012,.009,.008,chrome,3);
      circle(pegX,pegY,headZ+.005,.0046,chrome,3,.006);
      const stringColor=!electric && i<4?'dbb87c':'d7d4c6';
      const a=[x,bridge,front+.0128],b=[nx,nut,board+.003];
      segment(b,[pegX,pegY,headZ+.006],.00055,stringColor,3,6);
      if(!electric){
        circle(x,bridge-.009,front+.011,.0029,ivory,0,.002);
        circle(x,bridge-.009,front+.0112,.0011,rosewood);
        segment([x,bridge-.009,front+.011],a,.00055,stringColor,3,6);
      }
      strings.push({a:point(a),b:point(b),number:i,id:i+6*id});
    }
    // Apply the same rigid transform to hardware and surface normals.
    for(let k=start;k<vertices.length;k+=12){
      const p=point(vertices.slice(k,k+3)),n=vector(vertices.slice(k+3,k+6));
      for(let i=0;i<3;i++){vertices[k+i]=p[i];vertices[k+3+i]=n[i];}
    }
    for(const wire of strings){
      const color=rgb(!electric && wire.number<4?'d9bc8c':'d4d6d1');
      const gauge=.00069-.000073*wire.number;
      for(let j=0;j<24;j++){
        for(const [offset,side] of [[0,-1],[0,1],[1,1],[0,-1],[1,1],[1,-1]]){
          const t=(j+offset)/24,p=wire.a.map((v,i)=>v*(1-t)+wire.b[i]*t);
          vertices.push(...p,...axes.right,...color,t,side*gauge,-1-wire.id);
        }
      }
    }
    // Tubular floor stand, two padded cradles and a rear neck rest.
    const stand=frame([origin[0],0,origin[2]],yaw);
    const bar=(a,b,r,color= rubber)=>rod(stand.point(a),stand.point(b),r,color);
    for(const sign of [-1,1]){
      bar([0,.19,-.055],[.17*sign,.014,.15],.009,'41413d');
      bar([.17*sign,.014,.15],[.177*sign,.009,.164],.012);
      bar([0,.13,-.067],[.079*sign,.110,.066],.011);
      bar([.079*sign,.110,.066],[.079*sign,.143,.080],.010);
      bar([0,.53,-.13],[.052*sign,.53,-.114],.009);
    }
    bar([0,.01,-.22],[0,.19,-.055],.010,'494942');
    bar([0,.12,-.052],[0,.54,-.134],.010,'403f3b');
    return {...spec,...axes,stand,strings,id,head};
  }
  const guitars=specs.map(instrument);
  // Compact combo with a recessed baffle, woven grille and a separate control fascia.
  const amp=frame([5.18,0,6.40],-2.40);
  const ampStart=vertices.length;
  const cabinet=(x,y,z,w,h,d,tint,mat=0,r=.006)=>softBox(x,y,z,w,h,d,tint,mat,r);
  for(const x of [-.202,.202])for(const z of [-.098,.098])cabinet(x,0,z,.049,.027,.044,rubber);
  cabinet(0,.023,0,.51,.433,.264,'393934',12,.019);
  cabinet(0,.047,.132,.480,.319,.006,'382d25');
  const grilleFace=[[-.233,.052,.137],[.233,.052,.137],[.233,.357,.137],[-.233,.357,.137]];
  face(...grilleFace,'968975',grille,[[0,0],[1,0],[1,1],[0,1]]);
  for(const x of [-.237,.237])cabinet(x,.051,.137,.0035,.308,.004,'c5b399');
  for(const y of [.050,.357])cabinet(0,y,.137,.476,.0035,.004,'c5b399');
  cabinet(0,.369,.132,.468,.059,.004,'484137',3);
  const fascia=[[-.234,.369,.1342],[.234,.369,.1342],[.234,.428,.1342],[-.234,.428,.1342]];
  face(...fascia,'ffffff',6,[[514/2048,1534/2048],[1022/2048,1534/2048],[1022/2048,1282/2048],[514/2048,1282/2048]]);
  for(let i=0;i<5;i++){
    const x=-.095+i*.052,y=.402;
    tube([x,y,.135],[x,y,.145],.010,.009,'272620',0,18);
    rod([x,y,.1455],[x-.003,y+.007,.1455],.001,'ddd3b7');
  }
  tube([-.189,.403,.134],[-.189,.403,.146],.009,.006,chrome,3,16);
  cabinet(.191,.391,.136,.013,.020,.006,'1e2020');
  tube([.161,.404,.135],[.161,.404,.138],.003,.003,'ffac60',4,12);
  for(const x of [-.078,.078])cabinet(x,.456,0,.037,.006,.025,chrome,3);
  for(const [a,b] of [[[-.078,.459,0],[-.057,.478,0]],[[-.057,.478,0],[.057,.478,0]],[[.057,.478,0],[.078,.459,0]]])
    rod(a,b,.007,'3d332a');
  for(let k=ampStart;k<vertices.length;k+=12){
    const p=amp.point(vertices.slice(k,k+3)),n=amp.vector(vertices.slice(k+3,k+6));
    for(let i=0;i<3;i++){vertices[k+i]=p[i];vertices[k+3+i]=n[i];}
  }
  const {point:body,stand}=guitars[1];
  const jack=amp.point([-.189,.403,.146]),socket=body([.158,.116,.002]);
  const floorLead=(x,z)=>stand.point([x,.004,z]);
  // Bring the slack around the front feet and lift it on the jack side.
  // Floor points use the upright stand frame, the plug follows the tilted body.
  const cable=[jack,amp.point([-.189,.403,.181]),amp.point([-.190,.357,.195]),
    [5.12,.058,6.06],[5.08,.009,6.02],[4.90,.004,5.93],floorLead(-.40,.35),
    floorLead(-.24,.45),floorLead(-.08,.45),floorLead(-.025,.32),floorLead(.135,.25),
    floorLead(.255,.215),floorLead(.275,.125),floorLead(.25,.042),stand.point([.224,.021,.014]),
    body([.215,.034,.002]),body([.210,.095,.002]),body([.203,.116,.002]),body([.187,.116,.002]),socket];
  const midpoint=(p,q)=>p.map((v,k)=>(v+q[k])*.5);
  rod(cable[0],cable[1],.006,chrome,3);
  let prev=cable[1];
  for(let i=2;i<cable.length-1;i++){
    const control=cable[i],start=prev,end=i===cable.length-2?control:midpoint(control,cable[i+1]);
    for(let j=1;j<=6;j++){
      const t=j/6,u=1-t,p=start.map((v,k)=>u*u*v+2*u*t*control[k]+t*t*end[k]);
      rod(prev,p,.0035,rubber);prev=p;
    }
  }
  rod(prev,socket,.006,chrome,3);
  return guitars;
}

// Both instruments share standard tuning. A fractional-delay plucked string
// feeds either a resonant wooden body or a clean pickup and speaker response.
function createGuitarSound(onState){
  const tuning=[82.4069,110,146.8324,195.9977,246.9417,329.6276];
  let context=null,master=null,muted=false;
  const inputs=[],samples=new Map(),voices=new Map();
  const state=()=>muted?'muted':context?.state==='running'?'on':'off';
  function unlock(){
    if(muted || (navigator.userActivation && !navigator.userActivation.hasBeenActive))return;
    if(!context){
      const Audio=window.AudioContext || window.webkitAudioContext;
      if(!Audio)return;
      context=new Audio();
      master=context.createGain();master.gain.value=.32;
      const limiter=context.createDynamicsCompressor();
      limiter.threshold.value=-14;limiter.ratio.value=5;
      master.connect(limiter).connect(context.destination);
      function filter(kind,freq,Q,gain){
        const node=context.createBiquadFilter();node.type=kind;node.frequency.value=freq;
        node.Q.value=Q;node.gain.value=gain;return node;
      }
      const wood=filter('highpass',66,.7,0);
      wood.connect(filter('peaking',104,2,4)).connect(filter('peaking',205,2.8,4.5))
        .connect(filter('peaking',470,1.4,2)).connect(master);
      const pickup=filter('highpass',54,.7,0);
      pickup.connect(filter('peaking',1750,.85,3.4)).connect(filter('lowpass',3100,.75,0)).connect(master);
      inputs.push(wood,pickup);
      context.addEventListener('statechange',onState);
    }
    if(context.state==='suspended')context.resume().then(onState).catch(onState);
    onState();
  }
  function tone(id){
    if(samples.has(id))return samples.get(id);
    const electric=id>=6,rate=context.sampleRate,freq=tuning[id%6];
    const blend=electric?.23:.39,period=rate/freq-blend,n=Math.floor(period),fraction=period-n;
    const length=Math.ceil(rate*(electric?3.25:2.85));
    const buffer=context.createBuffer(1,length,rate),out=buffer.getChannelData(0);
    const ring=new Float32Array(n+2),noise=new Float32Array(n);
    let seed=42731+id*677;
    for(let i=0;i<n;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;noise[i]=seed/2147483648-1;}
    const pick=Math.round(n*(electric?.17:.25)),feedback=Math.pow(.0015,1/(freq*(electric?3.1:2.6)));
    let prev=0,peak=.01;
    for(let i=0;i<length;i++){
      const k=i%ring.length;
      const delayed=ring[(k+2)%ring.length]*(1-fraction)+ring[(k+1)%ring.length]*fraction;
      const drive=i<n?(noise[i]-noise[(i+pick)%n])*.5:0;
      ring[k]=drive+feedback*((1-blend)*delayed+blend*prev);prev=delayed;
      out[i]=ring[k]*Math.min(1,(i+1)/(rate*.002))*Math.min(1,(length-i)/(rate*.045));
      peak=Math.max(peak,Math.abs(out[i]));
    }
    for(let i=0;i<length;i++)out[i]*=.75/peak;
    samples.set(id,buffer);return buffer;
  }
  function play(id,delay){
    if(muted)return;
    if(!context || context.state!=='running')unlock();
    if(!context || (context.state!=='running' && !navigator.userActivation?.isActive))return;
    const buffer=tone(id),at=context.currentTime+delay;
    const old=voices.get(id);
    if(old){old.gain.gain.setTargetAtTime(.0001,at,.012);old.source.stop(at+.07);}
    const source=context.createBufferSource(),gain=context.createGain();
    source.buffer=buffer;gain.gain.value=.88+.12*Math.random();
    source.connect(gain).connect(inputs[Math.floor(id/6)]);
    const voice={source,gain};voices.set(id,voice);
    source.onended=()=>{source.disconnect();gain.disconnect();if(voices.get(id)===voice)voices.delete(id);};
    source.start(at);
  }
  function toggle(){
    muted=state()==='on';
    if(master)master.gain.setTargetAtTime(muted?0:.32,context.currentTime,.012);
    if(!muted)unlock();
    onState();
  }
  return {play,unlock,toggle,state};
}

function createGuitarPlayer(guitars,{canvas,project,visible,requestRender,sound}){
  const lastPluck=new Float64Array(12).fill(-Infinity),bend=new Float32Array(12);
  let previous=null,lastGuitar=0;
  function strike(id,delay=0){
    const now=performance.now();
    if(now-lastPluck[id]<45)return;
    lastPluck[id]=now+delay*1000;lastGuitar=Math.floor(id/6);
    sound.play(id,delay);requestRender();
  }
  function frame(now,reduced){
    let moving=false;
    for(let i=0;i<12;i++){
      const age=(now-lastPluck[i])/1000;
      const live=!reduced && age<.75;
      bend[i]=live?.0038*Math.exp(-4.8*Math.max(0,age))*Math.sin(Math.max(0,age)*76+1):0;
      moving ||= live;
    }
    return moving;
  }
  function inside(x,y,loop){
    let odd=false;
    for(let i=0,j=loop.length-1;i<loop.length;j=i++){
      const [a,b]=loop[i],[c,d]=loop[j];
      if((b>y)!==(d>y) && x<(c-a)*(y-b)/(d-b)+a)odd=!odd;
    }
    return odd;
  }
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  function target(origin,ray){
    for(const g of guitars){
      const incidence=dot(ray,g.normal);
      if(incidence>-.045)continue;
      const v=origin.map((p,i)=>p-g.origin[i]),t=(g.front-dot(v,g.normal))/incidence;
      if(t<=0)continue;
      const p=v.map((n,i)=>n+t*ray[i]),x=dot(p,g.right),y=dot(p,g.up);
      if(Math.abs(x)>.209 || y<-.003 || y>.974)continue;
      if(!(inside(x,y,g.shape) || (y>.34 && y<g.nut && Math.abs(x)<.029) || inside(x,y,g.head)))continue;
      if(!visible(origin,p.map((n,i)=>n+g.origin[i]),.13))continue;
      const along=(y-g.bridge)/(g.nut-g.bridge);
      const width=g.width*(1-along)+.036*along;
      return {kind:along>=0 && along<=1 && Math.abs(x)<width*.62?'strings':'guitar',id:g.id};
    }
    return null;
  }
  // Intersect the complete pointer path with the projected strings. Fast
  // sweeps may cross all six strings between two browser pointer events.
  function sweep(e,eye){
    const rect=canvas.getBoundingClientRect(),end=[e.clientX-rect.left,e.clientY-rect.top];
    const start=previous?.id===e.pointerId?previous.xy:end;
    previous={id:e.pointerId,xy:end};
    const dx=end[0]-start[0],dy=end[1]-start[1],hits=[];
    function pixel(p){const [x,y,z]=project(p);return [x*.01*rect.width,y*.01*rect.height,z];}
    for(const g of guitars){
      if(dot(g.normal,eye.map((p,i)=>p-g.origin[i]))<.05)continue;
      let nearest=null;
      for(const wire of g.strings){
        const a=pixel(wire.a),b=pixel(wire.b);
        if(Math.min(a[2],b[2])<.07)continue;
        const ux=b[0]-a[0],uy=b[1]-a[1],den=dx*uy-dy*ux;
        const ax=a[0]-start[0],ay=a[1]-start[1];
        const along=(ax*dy-ay*dx)/den,travel=(ax*uy-ay*ux)/den;
        if(travel>0 && travel<=1 && along>=0 && along<=1){
          hits.push({wire,along,travel});continue;
        }
        // A direct touch or first hover can land on a stationary string.
        if(start!==end)continue;
        const t=((end[0]-a[0])*ux+(end[1]-a[1])*uy)/(ux*ux+uy*uy);
        const dist=Math.hypot(end[0]-a[0]-t*ux,end[1]-a[1]-t*uy);
        if(t>=0 && t<=1 && dist<=(e.pointerType==='touch'?7:2) && (!nearest || dist<nearest.dist))
          nearest={wire,along:t,travel:0,dist};
      }
      if(nearest)hits.push(nearest);
    }
    hits.sort((a,b)=>a.travel-b.travel);
    let order=0;
    for(const {wire,along} of hits){
      const p=wire.a.map((v,i)=>v+(wire.b[i]-v)*along);
      if(visible(eye,p,.022))strike(wire.id,order++*.007);
    }
    return order;
  }
  return {target,sweep,frame,bend,reset(){previous=null;},
    key(number){strike(6*lastGuitar+number);}};
}
