/* The camera and prime share one scale. Model coordinates are in millimetres,
   measured from the baseplate / rear bayonet; +z is the camera front. */
// Display metres per model millimetre for both pieces and their contact shadows.
const rangefinderMM=.00364;
const kitCenter=[1.045,.9902,2.10];
const kitPoint=(x,y,z)=>[kitCenter[0]+x*rangefinderMM,kitCenter[1]+y*rangefinderMM,kitCenter[2]+z*rangefinderMM];
const cameraFoot=kitPoint(-45,0,-4.4),lensFoot=kitPoint(78,0,20);
function buildRangefinderKit({vertices, face, smoothQuad, softBox, tube, rgb, unit, clip}) {
  const enamel=11, skin=12, glass=13, engraving=14;
  const black='252627', edge='353637', steel='c5c6c4';
  const tau=Math.PI*2;
  const uv=(x,y)=>[(1024+x)/2048,y/2048];
  function quad(points,normal,color,mat=0,coords) {
    smoothQuad(points,Array(4).fill(normal),rgb(color),mat,coords);
  }
  function point(axis,cx,cy,h,r,a) {
    return axis==='y'?[cx+r*Math.sin(a),h,cy+r*Math.cos(a)]:[cx+r*Math.cos(a),cy+r*Math.sin(a),h];
  }
  const axial=(axis,sign)=>axis==='y'?[0,sign,0]:[0,0,sign];
  function wall(axis,cx,cy,h0,h1,r0,r1,color,mat=enamel,{sides=64,inside=false,band=null}={}) {
    const slope=(r0-r1)/(h1-h0), sign=inside?-1:1;
    const normal=a=>unit(point(axis,0,0,slope,1,a)).map(v=>v*sign);
    for(let i=0;i<sides;i++){
      const a=(i/sides-.5)*tau,b=((i+1)/sides-.5)*tau;
      const coords=band?[uv(i/sides*1023,band[1]),uv((i+1)/sides*1023,band[1]),
        uv((i+1)/sides*1023,band[0]),uv(i/sides*1023,band[0])]:undefined;
      smoothQuad([point(axis,cx,cy,h0,r0,a),point(axis,cx,cy,h0,r0,b),
        point(axis,cx,cy,h1,r1,b),point(axis,cx,cy,h1,r1,a)],
        [normal(a),normal(b),normal(b),normal(a)],rgb(color),mat,coords);
    }
  }
  function ring(axis,cx,cy,h,outer,inner,color,mat=enamel,
                {start=0,end=tau,facing=1,patch=null}={}) {
    const count=Math.max(2,Math.ceil(72*(end-start)/tau));
    for(let i=0;i<count;i++){
      const a=start+(end-start)*i/count,b=start+(end-start)*(i+1)/count;
      const points=[[outer,a],[outer,b],[inner,b],[inner,a]];
      const coords=patch && points.map(([r,t])=>{
        const dx=axis==='y'?Math.sin(t):facing*Math.cos(t),dy=axis==='y'?Math.cos(t):-Math.sin(t);
        return uv(patch[0]+dx*r/outer*patch[2],patch[1]+dy*r/outer*patch[2]);
      });
      quad(points.map(([r,t])=>point(axis,cx,cy,h,r,t)),axial(axis,facing),color,mat,coords);
    }
  }
  function flutes(axis,cx,cy,h0,h1,r,depth,teeth,color,start=0,end=tau) {
    const steps=teeth*2;
    for(let i=0;i<steps;i++){
      const a=start+(end-start)*i/steps,b=start+(end-start)*(i+1)/steps;
      const r0=r-(i%2)*depth,r1=r-((i+1)%2)*depth;
      const p=point(axis,cx,cy,h0,r0,a),q=point(axis,cx,cy,h0,r1,b);
      const radial=axis==='y'?unit([p[2]-q[2],0,q[0]-p[0]]):unit([q[1]-p[1],p[0]-q[0],0]);
      quad([p,q,point(axis,cx,cy,h1,r1,b),point(axis,cx,cy,h1,r0,a)],radial,color,enamel);
    }
  }
  // Raised, bevel-edged outline in plan. The central skin has an actual hole
  // through its front plane, leaving room behind the bayonet for the shutter.
  function shell(left,right,rLeft,rRight,bottom,top,depth,color,mat,opening=false) {
    function outline(inset){
      const list=[];
      const x0=left+inset,x1=right-inset,d=depth-inset;
      const radii=[rRight,rRight,rLeft,rLeft].map(r=>Math.max(.12,r-inset));
      for(let j=0;j<4;j++){
        const r=radii[j],cx=j<2?x1-r:x0+r,cz=(j===0||j===3)?d-r:-d+r;
        for(let k=0;k<=12;k++){
          const a=(1-j-k/12)*Math.PI/2;
          list.push([cx+r*Math.cos(a),cz+r*Math.sin(a),Math.cos(a),Math.sin(a)]);
        }
      }
      return list;
    }
    const bevel=Math.min(.58,(top-bottom)*.23);
    const rows=[[bottom,bevel,-.85],[bottom+bevel,0,0],[top-bevel,0,0],[top,bevel,.85]];
    const loops=rows.map(row=>outline(row[1]));
    function vertex(p,y){return [p[0],y,p[1]];}
    for(let row=0;row<3;row++){
      const low=loops[row],high=loops[row+1];
      for(let i=0;i<low.length;i++){
        const j=(i+1)%low.length;
        if(opening && j===0 && row===1)continue;
        const pairs=[[low[i],row],[low[j],row],[high[j],row+1],[high[i],row+1]];
        smoothQuad(pairs.map(([p,k])=>vertex(p,rows[k][0])),
          pairs.map(([p,k])=>unit([p[2],rows[k][2],p[3]])),rgb(color),mat);
      }
    }
    for(const row of [0,3]){
      const y=rows[row][0],v=[(left+right)/2,y,0],loop=loops[row];
      for(let i=0;i<loop.length;i++)
        quad([v,vertex(loop[i],y),vertex(loop[(i+1)%loop.length],y),v],[0,row?1:-1,0],color,mat);
    }
    if(opening){
      const cx=11,cy=32.4,rad=22.2,x0=left+rLeft,x1=right-rRight;
      const y0=rows[1][0],y1=rows[2][0];
      const angles=Array.from({length:72},(_,i)=>tau*i/72);
      for(const x of [x0,x1])for(const y of [y0,y1])angles.push((Math.atan2(y-cy,x-cx)+tau)%tau);
      angles.sort((a,b)=>a-b);
      function rim(a,outer){
        const c=Math.cos(a),s=Math.sin(a);
        const r=outer?Math.min((c>=0?x1-cx:x0-cx)/c,(s>=0?y1-cy:y0-cy)/s):rad;
        return [cx+r*c,cy+r*s,depth];
      }
      for(let i=0;i<angles.length;i++){
        const a=angles[i],b=angles[(i+1)%angles.length];
        quad([rim(a,true),rim(b,true),rim(b,false),rim(a,false)],[0,0,1],color,mat);
      }
    }
  }
  function picture(points,rect,normal,mat=engraving){
    const [x,y,w,h]=rect;
    quad(points,normal,'ffffff',mat,[uv(x+.5,y+h-.5),uv(x+w-.5,y+h-.5),
      uv(x+w-.5,y+.5),uv(x+.5,y+.5)]);
  }
  function prism(points,bottom,height,color,mat=enamel) {
    const vertex=([x,z],y)=>[x,y,z];
    // A vertical extrusion of a convex polygon in the x/z plane.
    const mid=points.reduce((s,p)=>[s[0]+p[0]/points.length,s[1]+p[1]/points.length],[0,0]);
    for(let i=0;i<points.length;i++){
      const a=points[i],b=points[(i+1)%points.length],A=vertex(a,bottom),B=vertex(b,bottom);
      const n=unit([b[1]-a[1],0,a[0]-b[0]]);
      const sign=(a[0]-mid[0])*n[0]+(a[1]-mid[1])*n[2]<0?-1:1;
      quad([A,B,vertex(b,bottom+height),vertex(a,bottom+height)],n.map(v=>v*sign),color,mat);
      for(const [h,s] of [[bottom,-1],[bottom+height,1]])
        quad([vertex(mid,h),vertex(a,h),vertex(b,h),vertex(mid,h)],[0,s,0],color,mat);
    }
  }
  function screw(x,y,z,r,angle=0){
    tube([x,y,z-.15],[x,y,z+.08],r,r,'83847f',3,14);
    const a=[Math.cos(angle)*r*.66,Math.sin(angle)*r*.66];
    tube([x-a[0],y-a[1],z+.09],[x+a[0],y+a[1],z+.09],r*.12,r*.12,'343532',0,5);
  }
  // Apply the display scale only after construction, so every dimension,
  // including both sides of the mating mount, uses the same unit.
  function place(start,origin,heading){
    const scale=rangefinderMM,c=Math.cos(heading),s=Math.sin(heading);
    for(let i=start;i<vertices.length;i+=12){
      const x=vertices[i],y=vertices[i+1],z=vertices[i+2];
      const nx=vertices[i+3],ny=vertices[i+4],nz=vertices[i+5];
      vertices[i]=origin[0]+scale*(x*c+z*s); vertices[i+1]=origin[1]+scale*y;
      vertices[i+2]=origin[2]+scale*(-x*s+z*c);
      vertices[i+3]=nx*c+nz*s;vertices[i+4]=ny;vertices[i+5]=-nx*s+nz*c;
    }
  }
  // Both ends use the same angular samples. Their corresponding edges stay
  // parallel as the rounded rectangle tapers into the circular eyepiece.
  function finderOutline(x,y,z,halfW,halfH,r){
    const points=[];
    for(let q=0;q<4;q++){
      const dx=(q===0 || q===3?1:-1)*(halfW-r),dy=(q<2?1:-1)*(halfH-r);
      for(let i=0;i<=8;i++){
        const a=(q+i/8)*Math.PI/2;
        points.push([x+dx+r*Math.cos(a),y+dy+r*Math.sin(a),z]);
      }
    }
    return points;
  }
  const objective=finderOutline(46,66.375,17.30,8.15,6.12,.85);
  const ocular=finderOutline(48,64.9,-20.25,6.45,6.45,6.45);
  function finderSides(visit){
    for(let i=0;i<objective.length;i++){
      const j=(i+1)%objective.length;
      visit(objective[i],objective[j],ocular[j],ocular[i]);
    }
  }
  function openTopPlate(start){
    // Subtract the same convex volume from every shell triangle, including
    // the horizontal caps where the stepped top overlaps the main casting.
    const planes=[];
    finderSides((a,b,c,d)=>{
      const ux=b[0]-a[0],uy=b[1]-a[1],dz=d[2]-a[2];
      const n=unit([uy*dz,-ux*dz,ux*(d[1]-a[1])-uy*(d[0]-a[0])]);
      planes.push(p=>n[0]*(p[0]-a[0])+n[1]*(p[1]-a[1])+n[2]*(p[2]-a[2]));
    });
    const shellVertices=vertices.splice(start);
    for(let k=0;k<shellVertices.length;k+=36){
      let inside=[0,12,24].map(n=>shellVertices.slice(k+n,k+n+12));
      if(planes.some(distance=>inside.every(p=>distance(p)<0))){
        for(const p of inside)vertices.push(...p);
        continue;
      }
      for(const distance of planes){
        if(inside.length<3)break;
        const outside=clip(inside,p=>-distance(p));
        for(let i=1;i+1<outside.length;i++)vertices.push(...outside[0],...outside[i],...outside[i+1]);
        inside=clip(inside,distance);
      }
    }
  }
  const bodyOrigin=cameraFoot,bodyHeading=.04,bodyStart=vertices.length;
  shell(-69,69,16,16,0,5.2,16.8,'242525',enamel);
  shell(-68.9,68.9,16.1,16.1,5.15,55.5,16.7,'353537',skin,true);
  const topStart=vertices.length;
  shell(-69,69,16,16,55.4,69.7,16.65,black,enamel);
  shell(-7.4,67.4,1.8,14.6,69.4,74.2,16.45,black,enamel);
  openTopPlate(topStart);
  // Open mount, recessed curtain, baffles, three discontinuous bayonet lands.
  const cx=11,cy=32.4;
  wall('z',cx,cy,16.3,19.45,26.2,25.8,steel,3);
  wall('z',cx,cy,19.45,19.72,25.8,25.45,'d5d6d1',3);
  ring('z',cx,cy,19.72,25.45,22.15,steel,3);
  wall('z',cx,cy,19.50,19.72,21.95,22.15,'939591',3,{inside:true});
  wall('z',cx,cy,19.45,5.4,22.0,20.2,'212221',enamel,{inside:true});
  ring('z',cx,cy,5.4,20.3,19.5,'1e2020');
  for(const a of [.14,2.25,4.40]){
    ring('z',cx,cy,17.9,22.4,20.9,'888b87',3,{start:a,end:a+.68});
  }
  softBox(cx,cy-20.6,3.1,42,41.2,2,'191a19',0,.6);
  softBox(cx,cy-11.8,4.35,33.4,23.6,.45,'201f1e',0,.45);
  for(const a of [.48,1.58,2.64,3.68,5.03,5.77])
    screw(cx+24.3*Math.cos(a),cy+24.3*Math.sin(a),19.76,1.05,a+.4);
  tube([cx,cy+17,8.5],[cx,cy+20.5,8.5],2.95,2.95,'62605a',3,24);
  // Mechanical release (the little red centre), battery cover, rewind and frame levers.
  tube([-20,32,16.4],[-20,32,20.75],4.55,4.30,'b0afa8',3,40);
  tube([-20,32,20.7],[-20,32,21.1],2.36,2.25,'963a32',enamel,32);
  tube([-32,21.2,16.4],[-32,21.2,19.7],8.1,7.5,'171918',enamel);
  ring('z',-32,21.2,19.8,7.3,5.85,edge,enamel);
  tube([-32,21.2,19.7],[-32,21.2,20.0],5.8,5.6,black,enamel);
  tube([44.1,32.0,19.5],[51.2,46.8,19.8],2.48,1.28,'303132',enamel,24);
  tube([44.1,32,16.4],[44.1,32,20.3],4.7,4.15,'1d1e1d',enamel);
  tube([-35.3,55.5,17.2],[-39.2,48.7,18.2],1.05,.65,'575953',enamel,16);
  function finder(x,y,w,h,rect){
    softBox(x,y,16.58,w,h,1.32,'161819',enamel,1.1,.8);
    const a=x-w/2+1.1,b=x+w/2-1.1,l=y+.98,t=y+h-.98;
    picture([[a,l,17.26],[b,l,17.26],[b,t,17.26],[a,t,17.26]],rect,[0,0,1]);
  }
  finder(-22.2,61.3,11.0,7.15,[698,2,104,65]);
  finder(22.2,60.5,18.2,12.9,[810,2,160,114]);
  const frontLip=finderOutline(46,66.375,17.35,9.35,7.175,1.1);
  for(let i=0;i<frontLip.length;i++){
    const j=(i+1)%frontLip.length,a=frontLip[i],b=frontLip[j];
    quad([a,b,objective[j],objective[i]],[0,0,1],'282a29',enamel);
    face([a[0],a[1],15.65],[b[0],b[1],15.65],b,a,'1d1e1e',enamel);
  }
  finderSides((a,b,c,d)=>face(a,b,c,d,'252827',0));
  // Release and folded advance arm sit on the low shoulder to the photographer's right.
  const sy=69.55;
  tube([-43,sy,5.2],[-43,72.0,5.2],8.8,8.65,black,enamel);
  prism([[-49,3.5],[-39,10.2],[-29,-6.2],[-14,-12.5],[-13,-15.0],[-31.5,-13.8]],71.0,1.65,edge);
  prism([[-31.9,-10.2],[-16,-13.1],[-8.1,-14.7],[-7.6,-17],[-16.8,-17.7],[-30.4,-15.5]],72.15,2.1,'292a2a');
  tube([-43,71.95,5.2],[-43,73.6,5.2],7.8,7.15,'161819',enamel);
  tube([-43,73.4,5.2],[-43,75.1,5.2],4.35,3.85,'c3c4bf',3);
  ring('y',-43,5.2,75.14,3.86,1.2,steel,3);
  ring('y',-43,5.2,75.16,1.2,0,'333431');
  ring('y',-57.8,5.8,69.78,5.0,3.91,steel,3);
  ring('y',-57.8,5.8,69.80,3.91,0,'ffffff',engraving,{patch:[276,189,40]});
  tube([-17.7,69.5,1.3],[-17.7,73.7,1.3],8.45,8.45,black,enamel);
  flutes('y',-17.7,1.3,70.0,73.7,8.55,.31,52,edge);
  ring('y',-17.7,1.3,73.74,8.40,0,'ffffff',engraving,{patch:[296,68,65]});
  // Accessory shoe with sprung rails and an insulated flash contact.
  softBox(3.7,74.12,-5.5,20.5,.88,18.2,'151617',enamel,1.0,.32);
  softBox(3.7,75.00,-5.5,16.4,.55,16.7,'7f827e',3,.85,.18);
  for(const side of [-1,1]){
    softBox(3.7+side*8.9,75.10,-6.1,1.28,2.32,15.7,steel,3,.38);
    softBox(3.7+side*7.74,76.77,-6.1,3.16,.86,15.7,steel,3,.35);
  }
  tube([3.7,75.58,-6.0],[3.7,75.65,-6.0],3.35,3.35,'363938',enamel);
  tube([3.7,75.65,-6.0],[3.7,75.72,-6.0],2.1,2.1,'c6b899',3);
  // Tilted rewind crank; its folded handle follows the top of the roller.
  const crankStart=vertices.length;
  tube([0,0,0],[0,6.0,0],8.75,8.8,black,enamel,48);
  flutes('y',0,0,1.0,5.6,8.88,.34,48,edge);
  softBox(0,6.0,0,4.7,1.25,15.35,'313232',enamel,1.4,.48);
  for(let i=crankStart;i<vertices.length;i+=12){
    const c=Math.cos(.47),s=Math.sin(.47);
    for(const k of [i,i+3]){const x=vertices[k],y=vertices[k+1];vertices[k]=c*x+s*y;vertices[k+1]=c*y-s*x;}
    vertices[i]+=62;vertices[i+1]+=68.9;vertices[i+2]-=.55;
  }
  // Hinged film door, speed reminder, flash socket and rubber eyepiece.
  softBox(0,5.4,-16.77,101.2,49.0,1.5,'202020',enamel,1.45,.65);
  softBox(0,10.0,-17.55,87.0,39.0,.65,'343435',skin,.7,.36);
  for(const x of [-48,48])tube([x,6.4,-17.9],[x,51.8,-17.9],.83,.83,'363636',enamel,16);
  for(const x of [-44.8,44.8])
    tube([x,51.1,-17.45],[x,51.1,-17.8],1.12,1.0,'1a1b1a',enamel,16);
  tube([-.6,29.8,-17.8],[-.6,29.8,-19.55],16.0,15.6,'191a19',enamel,64);
  ring('z',-.6,29.8,-19.58,15.2,0,'ffffff',engraving,{facing:-1,patch:[450,84,80]});
  wall('z',48,64.9,-15.65,-20.25,9.35,8.5,black,enamel,{sides:32});
  const eyeLip=finderOutline(48,64.9,-20.25,8.5,8.5,8.5);
  for(let i=0;i<eyeLip.length;i++){
    const j=(i+1)%eyeLip.length;
    quad([eyeLip[j],eyeLip[i],ocular[i],ocular[j]],[0,0,-1],edge,enamel);
  }
  tube([2.8,64.9,-16.35],[2.8,64.9,-18.2],5.3,4.8,'5c5c57',3,48);
  ring('z',2.8,64.9,-18.23,3.95,0,'171817',enamel,{facing:-1});
  for(const side of [-1,1]){
    const x=side*68.7;
    tube([x,50.8,2.2],[x+side*2.75,50.8,2.2],3.0,2.6,'8f928e',3,28);
    for(let i=0;i<24;i++){
      const end=k=>[x+side*(3+2.05*Math.cos(k*tau/24)),49.50+2.9*Math.sin(k*tau/24),2.2];
      tube(end(i),end(i+1),.44,.44,steel,3,6);
    }
  }
  // Burgundy double cord and a standing, lined leather wrist loop on the table.
  for(const dx of [-.65,.65]){
    const path=[[-71,49,2.2],[-74,44,4.5],[-76,36,8.0],[-77,24,11.9],[-78,12,16],[-80,3,22],[-83,1.0,32],[-83,1.0,39],[-79,1,44],[-70,1.1,46]];
    for(let i=1;i<path.length;i++)tube(path[i-1].map((v,k)=>v+(k===0?dx:0)),path[i].map((v,k)=>v+(k===0?dx:0)),.65,.65,'783b48',0,7);
  }
  tube([-75.1,38,6.8],[-77.6,23.7,12.2],2.6,1.90,'302b29',enamel,20);
  for(let i=0;i<72;i++){
    function band(j,inside,top){
      const t=tau*j/72,c=Math.cos(t),s=Math.sin(t);
      return [-68+(inside?24.1:25.2)*c+6*s,top?8.5+.85*s:.55,47+(inside?8.35:9.45)*s];
    }
    const j=i+1;
    for(const inside of [false,true]){
      const n=unit([Math.cos(tau*(i+.5)/72)/25,0,Math.sin(tau*(i+.5)/72)/9]).map(v=>inside?-v:v);
      quad([band(i,inside,0),band(j,inside,0),band(j,inside,1),band(i,inside,1)],n,inside?'844347':'332e2b',0);
    }
    quad([band(i,0,1),band(j,0,1),band(j,1,1),band(i,1,1)],[0,1,0],'775658',0);
  }
  softBox(-92.0,1.0,46.8,2.5,8.2,4.0,'737672',3,.7,.55);
  place(bodyStart,bodyOrigin,bodyHeading);

  const lensStart=vertices.length;
  const barrel=(a,b,r,s,color,options)=>wall('y',0,0,a,b,r,s,color,enamel,options);
  const ledge=(h,outer,inner,color,mat=enamel,opt)=>ring('y',0,0,h,outer,inner,color,mat,opt);
  // Bayonet registration face is at 5 mm; the bare optical barrel ends at 41.
  wall('y',0,0,.18,4.9,21.1,21.1,'a8aaa6',3);
  for(const a of [.16,2.27,4.41])
    ledge(.15,22.2,18.7,steel,3,{start:a,end:a+.84,facing:-1});
  ledge(.18,21.1,13.3,'9b9e9a',3,{facing:-1});
  ledge(.21,13.35,10.5,'282b29',enamel,{facing:-1});
  ledge(.26,10.5,0,'243432',glass,{facing:-1});
  for(let i=0;i<4;i++){
    const t=.41+i*Math.PI/2;
    ring('y',17.7*Math.cos(t),17.7*Math.sin(t),.14,1.02,0,'565958',3,{facing:-1});
  }
  wall('y',0,0,4.1,6.1,23.75,25.45,steel,3);
  ledge(6.1,25.45,23.2,'8d908e',3);
  barrel(6.08,6.65,25.35,26.05,edge);
  wall('y',0,0,6.65,13.0,26.05,26.05,'ffffff',engraving,{band:[253,302]});
  flutes('y',0,0,6.8,12.8,26.15,.11,69,black,1.00,4.60);
  const registration=-1.16;
  quad([point('y',0,0,4.76,25.05,registration-.022),point('y',0,0,4.76,25.05,registration+.022),
    point('y',0,0,6.08,25.5,registration+.022),point('y',0,0,6.08,25.5,registration-.022)],
    point('y',0,0,0,1,registration),'b43931');
  ledge(13.0,26.05,25.35,'434341');
  barrel(13.0,13.55,25.25,25.35,'141515');
  wall('y',0,0,13.55,25.1,26.1,26.3,'ffffff',engraving,{band:[318,401]});
  barrel(25.1,25.7,26.3,25.8,edge);
  ledge(25.7,25.8,24.85,'393a39');
  barrel(25.7,30.75,24.9,24.85,'282929');
  ledge(30.75,26.45,24.85,'424443');
  flutes('y',0,0,30.75,34.95,26.5,.31,148,'303131');
  ledge(34.95,26.5,25.0,'424443');
  wall('y',0,0,34.95,39.35,25.75,25.0,'ffffff',engraving,{band:[416,470]});
  barrel(39.35,41.0,24.9,24.0,'242525');
  const marker=(450/1023-.5)*tau;
  quad([point('y',0,0,39.65,24.80,marker-.013),point('y',0,0,39.65,24.80,marker+.013),
    point('y',0,0,40.87,24.13,marker+.013),point('y',0,0,40.87,24.13,marker-.013)],
    point('y',0,0,0,1,marker),'d5c7a9');
  // Sculpted focusing tab: two angular wings flank a concave finger rest.
  const tabAngle=-.96;
  const tabPoint=(x,h,r)=>[x*Math.cos(tabAngle)+r*Math.sin(tabAngle),h,-x*Math.sin(tabAngle)+r*Math.cos(tabAngle)];
  const tab=[];
  for(let i=0;i<=16;i++){
    const x=-8.6+i*17.2/16;
    tab.push([x,28+3.7*Math.pow(Math.abs(x)/8.6,2.4)]);
  }
  tab.push([8.6,24.0],[-8.6,24.0]);
  for(let i=0;i<tab.length;i++){
    const j=(i+1)%tab.length,[x,r]=tab[i],[u,s]=tab[j];
    const a=tabPoint(x,14.6,r),b=tabPoint(u,14.6,s),c=tabPoint(u,23.0,s),d=tabPoint(x,23.0,r);
    face(a,d,c,b,'242526',enamel);
    if(i<16)for(const [h,n] of [[23.0,1],[14.6,-1]])
      quad([tabPoint(x,h,24),tabPoint(u,h,24),tabPoint(u,h,s),tabPoint(x,h,r)],[0,n,0],edge,enamel);
  }
  // The hood intersects a round blank with four inclined planes. The curved
  // boundary of each plane is the scallop visible in the side photographs.
  const top=57.8, slope=4.35/11;
  const hoodR=(inside)=>25.75-(inside?1.05:0);
  const cut=(a)=>Math.max(Math.abs(Math.sin(a)),Math.abs(Math.cos(a)));
  const transition=(a,inside)=>Math.min(top,47+hoodR(inside)*(1-cut(a))/slope);
  const hoodPoint=(a,h,inside)=>point('y',0,0,h,
    Math.min(hoodR(inside),(hoodR(inside)-slope*Math.max(0,h-47))/cut(a)),a);
  for(let i=0;i<96;i++){
    const a=i*tau/96,b=(i+1)*tau/96;
    for(const inner of [false,true]){
      const edgeA=hoodPoint(a,transition(a,inner),inner),edgeB=hoodPoint(b,transition(b,inner),inner);
      const sign=inner?-1:1,radial=t=>point('y',0,0,0,sign,t),t=(a+b)/2;
      const color=inner?'171818':black;
      smoothQuad([hoodPoint(a,41,inner),hoodPoint(b,41,inner),edgeB,edgeA],
        [radial(a),radial(b),radial(b),radial(a)],rgb(color),enamel);
      if(edgeA[1]<top || edgeB[1]<top){
        const nx=Math.sin(t),nz=Math.cos(t);
        const n=unit(Math.abs(nx)>Math.abs(nz)?[Math.sign(nx),slope,0]:[0,slope,Math.sign(nz)]);
        quad([edgeA,edgeB,hoodPoint(b,top,inner),hoodPoint(a,top,inner)],n.map(v=>v*sign),color,enamel);
      }
    }
    quad([hoodPoint(a,57.8,0),hoodPoint(b,57.8,0),hoodPoint(b,57.8,1),hoodPoint(a,57.8,1)],[0,1,0],'373837',enamel);
  }
  ledge(41.05,25.75,20.25,'272827');
  ledge(41.18,20.45,16.15,'ffffff',engraving,{patch:[627,185,60]});
  for(let i=0;i<4;i++){
    const r=16.2-i*.72,h=40.9-i*.41;
    ledge(h,r,r-.72,i%2?'373a37':'1a1c1c');
    wall('y',0,0,h-.42,h,r-.72,r-.72,'1b1d1c',enamel,{inside:true});
  }
  // Convex front element, split into concentric zones to give the coating
  // a continuous specular response down into the recessed optical throat.
  for(let i=0;i<9;i++){
    const r0=13.45*i/9,r1=13.45*(i+1)/9;
    const z=r=>39.75-.0105*r*r;
    for(let k=0;k<64;k++){
      const a=k*tau/64,b=(k+1)*tau/64,pairs=[[r0,a],[r1,a],[r1,b],[r0,b]];
      smoothQuad(pairs.map(([r,t])=>point('y',0,0,z(r),r,t)),
        pairs.map(([r,t])=>unit(point('y',0,0,1,.021*r,t))),rgb('253234'),glass);
    }
  }
  place(lensStart,lensFoot,-.18);
  // The panes belong to the depth-sorted transparent pass, separately from
  // the housing, so neither one hides the other or casts a solid shadow.
  return function appendFinderGlass(register){
    for(const t of [.02,.98]){
      const start=vertices.length;
      const rim=objective.map((p,i)=>p.map((v,k)=>v+t*(ocular[i][k]-v)));
      const center=rim[0].map((v,k)=>(v+rim[rim.length/2][k])*.5),normal=[0,0,t<.5?1:-1];
      for(let i=0;i<rim.length;i+=2)
        quad([center,rim[i],rim[i+1],rim[(i+2)%rim.length]],normal,'c1d1d0',7);
      place(start,bodyOrigin,bodyHeading);
      register(start/12);
    }
  };
}
