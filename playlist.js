// Covers are arranged in the same reading order as the two ledges.
const studioPlaylist=[
  {title:'Sakuranagashi',version:'2021 Remastered',artist:'Hikaru Utada',path:'sakuranagashi-2021-remastered/1548597141?i=1548597148'},
  {title:'Hotel California',version:'Live on MTV, 1994',artist:'Eagles',path:'hotel-california-live-on-mtv-1994/1453924216?i=1453925093'},
  {title:'Bury the Light',artist:'Casey Edwards & Victor Borba',path:'bury-the-light/1525805458?i=1525805459'},
  {title:'搁浅',artist:'周杰伦',path:'搁浅/536114662?i=536115199'},
  {title:'Reptile',artist:'Periphery',path:'reptile/1647849438?i=1647849439'},
  {title:'修炼爱情',artist:'林俊杰',path:'修炼爱情/1694849133?i=1694849138'}
];
const playlistCovers=new Image();
playlistCovers.src='playlist-covers.jpg';

function trackAnchor(track){
  const link=document.createElement('a');
  link.href='https://music.apple.com/cn/album/'+track.path+'&l=en-GB';
  link.target='_blank';link.rel='noopener noreferrer';link.draggable=false;
  link.textContent=track.title+(track.version?' ('+track.version+')':'')+' — '+track.artist;
  link.title=link.textContent+' · Apple Music';
  link.setAttribute('aria-label',link.title+' (opens in a new tab)');
  return link;
}

// Atlas coordinates are in print pixels. A separate face for each label lets
// the oak lip sit in front of the sleeve without covering the text.
const recordPrints=studioPlaylist.map((track,i)=>{
  const col=i%3,row=Math.floor(i/3),u=8+col*528,v=8+row*760;
  return {track,z:5.78+(col-1)*.56,base:2.55-row*.84,
    art:[u,v,512,512],label:[u,v+524,512,170]};
});
const shelfTitle=[1600,8,432,96];
// The six project cards occupy material groups 1–6 in the room vertex shader.
const firstSleeveGroup=7;
const sleeveTravel={out:.030,up:.021};
function paintPlaylist(){
  const sheet=document.createElement('canvas');sheet.width=sheet.height=2048;
  const ctx=sheet.getContext('2d');
  const sans='"Segoe UI","Microsoft YaHei",sans-serif';
  const [x,y,w,h]=shelfTitle;
  ctx.fillStyle='#423831';ctx.fillRect(x,y,w,h);
  ctx.fillStyle='#f8ebd6';ctx.font='italic 64px Georgia,serif';
  ctx.textAlign='center';ctx.fillText('On rotation',x+w/2,y+68);
  ctx.textAlign='left';
  recordPrints.forEach(({track,art:[u,v,w,h],label:[x,y,lw,lh]},i)=>{
    if(playlistCovers.naturalWidth)ctx.drawImage(playlistCovers,(i%3)*512,Math.floor(i/3)*512,512,512,u,v,w,h);
    ctx.fillStyle='#f2e9d8';ctx.fillRect(x,y,lw,lh);
    ctx.fillStyle='#33271f';ctx.font='600 54px '+sans;
    ctx.fillText(track.title,x+17,y+58,lw-34);
    ctx.font='42px '+sans;ctx.fillStyle='#483b31';
    ctx.fillText(track.artist,x+17,y+110,lw-34);
    if(track.version){
      ctx.font='italic 37px Georgia, serif';ctx.fillStyle='#593d2a';
      ctx.fillText(track.version,x+17,y+154,lw-34);
    }
  });
  return sheet;
}

function buildRecordShelves({box,softBox,face}){
  const prints=[],targets=[];
  function corners(z,y,width,height,bottomX,topX){
    const l=z-width/2,r=z+width/2;
    return [[topX,y+height,l],[topX,y+height,r],[bottomX,y,r],[bottomX,y,l]];
  }
  softBox(5.756,3.09,5.78,.031,.14,.63,'594a3c',3,.005);
  prints.push([corners(5.78,3.092,.626,.136,5.738,5.738),shelfTitle]);
  for(const base of [recordPrints[0].base,recordPrints[3].base]){
    softBox(5.69,base-.038,5.78,.16,.038,1.79,'896346',1,.009);
    box(5.622,base,5.78,.022,.017,1.79,'997557',1);
  }
  for(const [i,{track,z,base,art,label}] of recordPrints.entries()){
    const group=(firstSleeveGroup+i)*32;
    const cover=corners(z,base,.465,.465,5.65,5.737);
    const back=cover.map(([x,y,z])=>[x+.009,y,z]);
    for(let j=0;j<4;j++){
      const k=(j+1)%4;
      face(cover[j],back[j],back[k],cover[k],'695b50',group);
    }
    face(...back,'6b5e50',group);
    const labelWidth=.465,labelHeight=labelWidth*label[3]/label[2],bottom=base-.060-labelHeight;
    box(5.754,bottom,z,.030,labelHeight,labelWidth,'ad9e88');
    const card=corners(z,bottom,labelWidth,labelHeight,5.736,5.736);
    prints.push([cover,art,group],[card,label]);
    const raisedTop=cover.slice(0,2).map(([x,y,z])=>[x-sleeveTravel.out,y+sleeveTravel.up,z]);
    targets.push({track,corners:[cover[0],cover[1],card[2],card[3]],raisedTop});
  }
  return {targets,append(){
    for(const [points,[x,y,w,h],group=0] of prints){
      const l=(x+.5)/2048,r=(x+w-.5)/2048,t=(y+.5)/2048,b=(y+h-.5)/2048;
      // Wind the face toward the room (-X) while reading left to right (+Z).
      face(points[3],points[2],points[1],points[0],'ffffff',group+6,[[l,b],[r,b],[r,t],[l,t]]);
    }
  }};
}
