// The wall print and the accessible reader share their copy and link destinations.
const profileRefs={
  university:{text:'University of Pennsylvania',href:'https://www.upenn.edu/'},
  school:{text:'Stuart Weitzman School of Design',href:'https://www.design.upenn.edu/'},
  degree:{text:'Computer Science',href:'https://www.cis.upenn.edu/computer-science-bse/'},
  software:{text:'software engineer',href:'#software'},
  games:{text:'game developer',href:'https://www.ma-xiao-yuan.com/home'},
  photography:{text:'photographer',href:'#gallery'},
  linkedin:{text:'LinkedIn',href:'https://www.linkedin.com/in/xiaoyuan6ma/'},
  github:{text:'GitHub',href:'https://github.com/Jimmy6Smiles'}
};
const biographyLines=[
  ['I’m a ',profileRefs.software,','],
  [profileRefs.games,', and ',profileRefs.photography,'.'],
  ['I study computer science at the'],
  [profileRefs.university,'.'],
  ['I build full-stack applications and'],
  ['create real-time 3D scenes.']
];
const profilePaper={width:800,height:960,workTop:427,bioLink:{left:571,right:756,top:91,bottom:136}};
const profileMount={centerX:3.94,centerY:2.30,front:6.776,width:1.90,height:2.28};
const profileWall = [
  {label:'About', title:'Xiaoyuan (Jimmy) Ma',
    notes:[
      ['About me',biographyLines.flatMap((row,i)=>i?[' ',...row]:row)],
      ['Education',['Bachelor of Science in ',profileRefs.degree,', ',profileRefs.university,'. Expected 2029.']],
      ['Currently seeking','Internships in software engineering and game development.']
    ]},
  {label:'Work experience', title:'Research Assistant',
    school:profileRefs.school, university:profileRefs.university,
    date:'February – May 2026', location:'Philadelphia, PA',
    notes:[
      ['Dome animation','Modeled, rigged and animated 3D assets for immersive dome projection.'],
      ['Simulation','Helped create particle, dynamics and procedural effects.']
    ]}
];
const profilePortrait=new Image();
profilePortrait.alt='Portrait of '+profileWall[0].title;
profilePortrait.className='profilePortrait';
profilePortrait.src='profile-portrait.jpg';

function profileAnchor(ref){
  const a=document.createElement('a');
  a.textContent=ref.text;a.href=ref.href;
  if(!ref.href.startsWith('#')){a.target='_blank';a.rel='noopener noreferrer';}
  return a;
}

function paintProfileWall(limit,links){
  const sheet=document.createElement('canvas');
  sheet.width=sheet.height=Math.min(limit,2048);
  const ctx=sheet.getContext('2d',{alpha:false});
  const serif='Georgia, "Times New Roman", serif',sans='"Segoe UI", Arial, sans-serif';
  const paper='#f7f1e6',ink='#302b27',muted='#62574c',brick='#984831',hair='#c5b8a6';
  ctx.setTransform(sheet.width/profilePaper.width,0,0,sheet.height/profilePaper.height,0,0);
  ctx.fillStyle=paper;ctx.fillRect(0,0,profilePaper.width,profilePaper.height);
  function text(value,x,y,font,color){
    ctx.font=font;ctx.fillStyle=color;
    for(const part of [].concat(value)){
      const label=part.text??part;
      ctx.fillText(label,x,y);
      const w=ctx.measureText(label).width;
      if(part.href){
        const size=parseFloat(font.match(/([\d.]+)px/)[1]);
        line(x,y+4,x+w,y+4,color,1.1);
        links.push({ref:part,x,y:y-size,width:w,height:size+8});
      }
      x+=w;
    }
  }
  function line(x,y,xx,yy,color,width=1.5){
    ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(xx,yy);ctx.stroke();
  }
  function paragraph(value,x,y,width,size,leading,color){
    const font=size+'px '+sans;
    ctx.font=font;
    let row='';
    for(const word of value.split(' ')){
      const next=row?row+' '+word:word;
      if(row && ctx.measureText(next).width>width){
        text(row,x,y,font,color);row=word;y+=leading;
      }else row=next;
    }
    text(row,x,y,font,color);
    return y;
  }
  const [bio,job]=profileWall;
  const left=44,right=756,column=317;
  line(left,40,right,40,ink,3);
  if(profilePortrait.naturalWidth){
    const w=profilePortrait.naturalWidth,h=profilePortrait.naturalHeight;
    const side=Math.min(w,h)*.78;
    ctx.imageSmoothingQuality='high';
    ctx.drawImage(profilePortrait,(w-side)*.63,(h-side)*.13,side,side,left,68,240,240);
  }
  text(bio.title,left,346,'italic 22px '+serif,ink);
  text('About',column-2,126,'bold 68px '+serif,ink);
  const bioLink=profilePaper.bioLink;
  paintLinkLabel(ctx,'Read biography',bioLink.right,122,'22px '+sans,brick,'right',bioLink.right-bioLink.left);
  biographyLines.forEach((row,i)=>text(row,column,171+i*34,'25px '+sans,ink));
  line(left,368,right,368,hair,1);
  text([profileRefs.degree,'  /  Class of 2029'],left,397,'21px '+sans,muted);
  ctx.font='21px '+sans;
  const social=[profileRefs.linkedin,'   ·   ',profileRefs.github];
  text(social,right-ctx.measureText(social.map(p=>p.text??p).join('')).width,397,ctx.font,muted);

  const band=profilePaper.workTop;
  ctx.fillStyle=brick;ctx.fillRect(left,band,244,40);
  paintLinkLabel(ctx,'WORK EXPERIENCE',left+12,band+28,'700 21px '+sans,paper,'left',244-24);
  line(left,band+40,right,band+40,brick,3);
  ctx.textAlign='right';text(job.date,right,band+27,'italic 23px '+serif,muted);ctx.textAlign='left';
  text(job.title,left-2,544,'54px '+serif,ink);
  text(job.school,left,589,'600 29px '+sans,ink);
  text([job.university,'  ·  '+job.location],left,630,'25px '+sans,ink);
  let rowTop=659;
  for(const [heading,body] of job.notes){
    line(left,rowTop,right,rowTop,hair,1.25);
    text(heading,left,rowTop+40,'italic 23px '+serif,muted);
    const lastLine=paragraph(body,245,rowTop+40,right-245,27,36,ink);
    rowTop=lastLine+29;
  }
  return sheet;
}
