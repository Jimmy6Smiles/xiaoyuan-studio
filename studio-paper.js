// The same outline serves the HTML actions and the lettering on scene textures.
const printedLinkArrow=new Path2D(document.getElementById('linkArrowPath').getAttribute('d'));
function paintLinkLabel(ctx,label,x,baseline,font,color,align='left',maxWidth=Infinity){
  ctx.save();
  ctx.font=font;
  const capHeight=ctx.measureText('H').actualBoundingBoxAscent;
  const size=capHeight*1.2,gap=capHeight*.45;
  const textWidth=Math.min(ctx.measureText(label).width,maxWidth-gap-size);
  const width=textWidth+gap+size;
  if(align==='right')x-=width;
  if(align==='center')x-=width/2;
  ctx.textAlign='left';
  ctx.fillStyle=color;
  ctx.fillText(label,x,baseline,textWidth);
  ctx.translate(x+textWidth+gap,baseline-(capHeight+size)/2);
  ctx.scale(size/12,size/12);
  ctx.strokeStyle=color;
  ctx.lineWidth=1.3;
  ctx.lineCap=ctx.lineJoin='round';
  ctx.stroke(printedLinkArrow);
  ctx.restore();
}

// Four pieces of printed matter, in reading order from top left. Each uses a
// half-texel inset so distant paper edges don't pick up ink from the next sheet.
const paperReadLabels={1:'Read the wall print notes',2:'Open lab notes',4:'Read process notes',5:'Read lake field notes'};
const galleryCardPixels=384; // A 3:2 guide cut from its 512 × 256 atlas tile.
const paperTurnY=184; // Boundary between reading and browsing, in sheet pixels.
function paintStudioPaper() {
  const sheet=document.createElement('canvas');
  sheet.width=1024;sheet.height=512;
  const g=sheet.getContext('2d');
  const ink='#303b36',rust='#914b35',serif='Georgia, serif',sans='"Segoe UI", Arial, sans-serif';
  function type(copy,x,y,size,font=sans,color=ink){
    g.fillStyle=color;g.font=size+'px '+font;g.fillText(copy,x,y);
  }
  function line(points,color,width=2){
    g.strokeStyle=color;g.lineWidth=width;g.beginPath();
    points.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.stroke();
  }
  function paperFibres(seed,count){
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<count;i++){
      const x=random()*512,y=random()*256;
      g.fillStyle=i%3?'rgba(95,77,47,.072)':'rgba(255,253,226,.36)';
      g.fillRect(x,y,1+random()*4,.55+random()*.85);
    }
  }
  function leaf(i,stock,paint){
    g.save();g.translate(i%2*512,Math.floor(i/2)*256);
    g.fillStyle=stock;g.fillRect(0,0,512,256);paint();g.restore();
  }
  leaf(0,'#e8e2d2',()=>{
    const margin=23,right=galleryCardPixels-margin;
    line([[margin,29],[right,29]],'#868975',1.5);
    type('Four wall prints',margin,102,46,serif);
    type('Read the notes',margin,158,33,sans,rust);
    line([[margin,163],[margin+g.measureText('Read the notes').width,163]],rust,1);
    line([[margin,paperTurnY],[right,paperTurnY]],'#a59c89',1.4);
    type('Scroll to the gallery wall',margin,230,30);
  });
  leaf(1,'#ded8c4',()=>{
    // Warm, uncoated stock. The fibres are printed once into the mipmapped
    // sheet; they soften with viewing distance instead of shimmering.
    const stock=g.createLinearGradient(0,0,76,256);
    stock.addColorStop(0,'#e6e0cb');stock.addColorStop(.065,'#dbd6c1');
    stock.addColorStop(.68,'#dcd7c5');stock.addColorStop(1,'#d1c9b3');
    g.fillStyle=stock;g.fillRect(0,0,512,256);
    paperFibres(4117,5100);
    // A simple section drawing, as on an optical workshop reference card.
    const graphite='#40534b';
    g.save();g.translate(352,32);
    g.setLineDash([5,5]);line([[2,48],[138,48]],'#858776',1.5);g.setLineDash([]);
    line([[4,20],[49,20],[126,66]],'#7f624a',2.5);
    line([[4,76],[49,76],[126,30]],'#7f624a',2.5);
    g.beginPath();g.moveTo(49,6);g.quadraticCurveTo(29,48,49,90);
    g.quadraticCurveTo(69,48,49,6);g.fillStyle='rgba(83,110,95,.12)';g.fill();
    g.strokeStyle=graphite;g.lineWidth=2.6;g.stroke();g.restore();
    type('Lab notes',24,96,65,serif,'#263c35');
    line([[302,83],[323,62],[308,62]],graphite,3);
    line([[323,62],[323,77]],graphite,3);
    type('Five camera projects.',26,157,34,sans,'#41443b');
    line([[25,paperTurnY],[487,paperTurnY]],'#8b8a76',1.6);
    type('Scroll to the first lens',25,232,39,sans,'#513e32');
  });
  leaf(2,'#d7cbb7',()=>{
    type('DARKROOM  /  FILM',23,40,22);
    for(let i=0;i<6;i++){g.fillStyle='hsl(28 7% '+(20+i*11)+'%)';g.fillRect(324+i*27,16,27,25);}
    line([[22,56],[489,56]],ink);
    type('Print log',21,122,58,serif);
    paintLinkLabel(g,'Process notes',22,167,'33px '+sans,rust);
    line([[22,paperTurnY],[489,paperTurnY]],'#978b78');
    type('Scroll to the drying line  ↓',22,229,32);
  });
  leaf(3,'#e6dfc8',()=>{
    const panel=g.createLinearGradient(0,0,512,28);
    panel.addColorStop(0,'#dcd7be');panel.addColorStop(.46,'#e2ddc8');
    panel.addColorStop(.49,'#d1cbb5');panel.addColorStop(.51,'#ece6d4');
    panel.addColorStop(1,'#e0d8c2');
    g.fillStyle=panel;g.fillRect(0,0,512,256);
    paperFibres(7219,4200);
    // A folded landscape sketch. Broken lines follow the water below Fuji.
    type('KAWAGUCHIKO',19,35,22,sans,'#445e54');
    line([[12,143],[43,134],[74,122],[98,110],[131,74],[145,74],[166,99],[195,120],[231,135]],'#526b62',3);
    line([[99,110],[130,85],[121,104],[136,95],[145,80],[156,98]],'#849285',2);
    line([[10,151],[42,144],[72,149],[98,142],[137,153],[192,145],[229,150]],'#546c62',2);
    for(let i=0;i<6;i++)line([[19+i%3*15,164+i*8],[209-i%4*16,164+i*8]],'#99a294',1.4);
    line([[246,0],[246,256]],'#b8b4a1',3);line([[249,0],[249,256]],'#f6efdd',2);
    type('Lake',265,74,55,serif);type('Kawaguchiko',264,115,37,serif);
    paintLinkLabel(g,'Field notes',265,166,'32px '+sans,rust);
    line([[265,paperTurnY],[491,paperTurnY]],'#b1a48b');
    type('Scroll along the shore',265,228,23);
  });
  return sheet;
}
