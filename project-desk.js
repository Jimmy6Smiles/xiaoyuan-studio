// The pinboard and record shelves use the same ease in and out of hover.
function advanceHoverLifts(lifts,hover,elapsed,reduced){
  const follow=reduced?1:1-Math.exp(-elapsed*18);
  let changed=false;
  for(let i=0;i<lifts.length;i++){
    const target=Number(i===hover);
    if(lifts[i]===target)continue;
    const next=lifts[i]+(target-lifts[i])*follow;
    lifts[i]=Math.abs(next-target)<.003?target:next;
    changed=true;
  }
  return changed;
}

// The pinboard is printed once. Two screen buffers let the GPU blend between
// projects without rasterizing text on every animation frame.
function createProjectDeskGraphics(gl, program, projects, initial) {
  const limit=gl.getParameter(gl.MAX_TEXTURE_SIZE);
  const paper=document.createElement('canvas');
  paper.width=Math.min(4096,limit);paper.height=paper.width/2;
  const printed=paper.getContext('2d',{alpha:false});
  const display=document.createElement('canvas');
  display.width=display.height=Math.min(2048,limit);
  const screen=display.getContext('2d',{alpha:false});
  const sans='"Segoe UI", Arial, sans-serif';
  function text(ctx,value,x,y,size,color,font=sans){
    ctx.font=size+'px '+font;ctx.fillStyle=color;ctx.fillText(value,x,y);
  }
  function fill(ctx,x,y,w,h,color){
    ctx.fillStyle=color;ctx.fillRect(x,y,w,h);
  }
  function lines(ctx,value,width,size){
    ctx.font=size+'px '+sans;
    const result=[];
    for(const word of value.split(' ')){
      const last=result.length-1;
      if(last<0 || ctx.measureText(result[last]+' '+word).width>width)result.push(word);
      else result[last]+=' '+word;
    }
    return result;
  }
  function paragraph(ctx,value,x,y,width,height,size,color){
    let rows=lines(ctx,value,width,size);
    while(rows.length*size*1.26>height && size>12)rows=lines(ctx,value,width,--size);
    rows.forEach((row,i)=>text(ctx,row,x,y+i*size*1.26,size,color));
  }
  function texture(slot,format,source){
    const t=gl.createTexture();
    gl.activeTexture(gl.TEXTURE0+slot);gl.bindTexture(gl.TEXTURE_2D,t);
    gl.texImage2D(gl.TEXTURE_2D,0,format,format,gl.UNSIGNED_BYTE,source);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    const ext=gl.getExtension('EXT_texture_filter_anisotropic');
    if(ext)gl.texParameterf(gl.TEXTURE_2D,ext.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(8,gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    gl.generateMipmap(gl.TEXTURE_2D);
    return t;
  }
  const cellW=paper.width/2,cellH=paper.height/3;
  projects.forEach((p,i)=>{
    printed.setTransform(cellW/512,0,0,cellH/256,(i%2)*cellW,Math.floor(i/2)*cellH);
    fill(printed,0,0,512,256,'white');
    text(printed,p.subject.toUpperCase(),26,64,22,'#414141');
    fill(printed,26,80,460,1.5,'#b6b6b6');
    text(printed,p.title,24,153,p.title.length>14?44:54,'black','Georgia, serif');
    text(printed,p.flow,26,217,24,'#363636');
  });
  const cards=texture(5,gl.LUMINANCE,paper);
  paper.width=paper.height=1;
  function implementationSheet(p){
    // Pack the portrait LCD sideways in the lower half of the texture.
    screen.setTransform(0,display.height/2/290,-display.width/512,0,display.width,display.height/2);
    fill(screen,0,0,290,512,'#1d2932');
    text(screen,'IMPLEMENTATION',15,23,11,'#b4cfca');
    text(screen,p.title,14,53,26,'#fff4df','Georgia, serif');
    fill(screen,15,64,260,.8,'#637a7b');
    let size=15,notes;
    const start=76;
    for(;size>=8;size-=.25){
      notes=p.details.map(([title,body])=>{
        const rows=lines(screen,body,260,size);
        return {title,rows,height:size*(2.35+rows.length*1.22)};
      });
      if(notes.reduce((height,n)=>height+n.height,0)<=512-start-10)break;
    }
    let y=start;
    notes.forEach(({title,rows,height},i)=>{
      if(i)fill(screen,15,y-size*.42,260,.45,'#415159');
      text(screen,title,15,y+size,size*1.17,'#c4ddcc','"Segoe UI Semibold", Arial, sans-serif');
      rows.forEach((row,j)=>text(screen,row,15,y+size*(2.48+j*1.22),size,'#eff1e9'));
      y+=height;
    });
  }
  function paintScreens(p){
    const scale=display.width/512;
    screen.setTransform(scale,0,0,scale,0,0);
    fill(screen,0,0,512,256,'#172828');
    text(screen,'PROJECT OVERVIEW',22,29,16,'#b4d3c1');
    fill(screen,22,42,468,.9,'#638074');
    text(screen,p.title,21,88,p.title.length>14?36:40,'#fff4df','Georgia, serif');
    paragraph(screen,p.overview,22,122,466,86,22,'#edf1e8');
    fill(screen,22,201,468,.9,'#536d64');
    paragraph(screen,p.stack,22,224,466,48,15,'#c9d9cd');
    implementationSheet(p);
  }
  paintScreens(projects[initial]);
  const banks=[texture(6,gl.RGB,display),null];
  let currentBank=0,previousBank=0,project=initial,previous=initial;
  let start=-Infinity,hover=-1;
  const lifts=new Float32Array(projects.length);
  const mixLocation=gl.getUniformLocation(program,'deskMix'),liftLocation=gl.getUniformLocation(program,'cardLift[0]');
  const activeLocation=gl.getUniformLocation(program,'activeCard'),previousLocation=gl.getUniformLocation(program,'priorCard');
  for(const [name,slot] of [['cardInk',5],['fromScreen',6],['toScreen',7]])gl.uniform1i(gl.getUniformLocation(program,name),slot);
  gl.activeTexture(gl.TEXTURE0);
  function select(i){
    if(project===i)return;
    previous=project;project=i;
    previousBank=currentBank;currentBank=1-currentBank;
    paintScreens(projects[i]);
    if(!banks[currentBank])banks[currentBank]=texture(7,gl.RGB,display);
    else{
      gl.activeTexture(gl.TEXTURE7);gl.bindTexture(gl.TEXTURE_2D,banks[currentBank]);
      gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGB,gl.UNSIGNED_BYTE,display);
      gl.generateMipmap(gl.TEXTURE_2D);
    }
    gl.activeTexture(gl.TEXTURE0);start=performance.now();
  }
  return {
    select,
    lift(i){return lifts[i]},
    hover(i){hover=i},
    frame(now,elapsed,reduced){
      const phase=reduced?1:Math.max(0,Math.min(1,(now-start)/240));
      const moving=advanceHoverLifts(lifts,hover,elapsed,reduced);
      gl.useProgram(program);
      gl.uniform1fv(liftLocation,lifts);gl.uniform1f(mixLocation,phase*phase*(3-2*phase));
      gl.uniform1f(activeLocation,project);gl.uniform1f(previousLocation,previous);
      return moving || phase<1;
    },
    bind(){
      gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_2D,cards);
      gl.activeTexture(gl.TEXTURE6);gl.bindTexture(gl.TEXTURE_2D,banks[previousBank]);
      gl.activeTexture(gl.TEXTURE7);gl.bindTexture(gl.TEXTURE_2D,banks[currentBank]);
      gl.activeTexture(gl.TEXTURE0);
    }
  };
}
