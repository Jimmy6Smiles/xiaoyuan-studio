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
