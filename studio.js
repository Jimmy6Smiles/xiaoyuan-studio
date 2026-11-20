const studioProjects = [
  {title:'Loop Land', subject:'Photography community', flow:'Draft → Publish → Review',
    overview:'Photographers publish sets of images, share assignments, and discuss each other’s work.',
    stack:'Java · Spring Boot · PostgreSQL · React · TypeScript · Docker · AWS',
    details:[
      ['Publishing','Spring Boot APIs and a React/TypeScript frontend support drafts, multi-image posts, tags, collections, and search. Photographers can comment, like, favorite, follow, run polls and Q&A, and join check-ins and assignments.'],
      ['Accounts and permissions','Spring Security authenticates users with JWT access tokens and rotating HttpOnly refresh cookies. Roles and permissions control access.'],
      ['Moderation','Amazon Bedrock Guardrails and Rekognition pre-screen posts asynchronously. Human reviewers handle reports, with audit logs and version history for post edits.'],
      ['Deployment','The Docker backend runs on AWS ECS Fargate behind an Application Load Balancer. PostgreSQL runs on RDS, S3 holds private media, and CloudFront serves the React app.'],
      ['Operations','IAM and Secrets Manager control access and credentials. CloudWatch provides monitoring and alarms. Recovery procedures were tested for both RDS and S3.']
    ]},
  {title:'TableTap', subject:'Food ordering', flow:'Menu → Cart → Checkout',
    overview:'Diners search restaurant menus, add dishes to a cart, and check out in one ordering flow.',
    stack:'Java · Spring Boot · PostgreSQL · React · Docker · AWS',
    details:[
      ['Order service','Spring Boot CRUD APIs handle registration, menu search, orders, and checkout. Injected controller, service, and repository layers let business logic be tested independently of HTTP and storage.'],
      ['Data and access','Spring Data JDBC repositories model restaurants, menus, and orders in PostgreSQL on AWS RDS. Spring Security uses session authentication to protect carts and checkout.'],
      ['Frontend and deployment','The React and Ant Design frontend handles carts and order placement. The Docker image is published to AWS ECR and deployed on AWS App Runner with managed auto-scaling.']
    ]},
  {title:'Muse', subject:'AI-assisted social network', flow:'Compose → Generate → Post',
    overview:'A social feed with an image generator in the composer. Authors can revise an image before publishing.',
    stack:'React · Go · Elasticsearch · Google Cloud · OpenAI',
    details:[
      ['Social feed','A React frontend connects to a Go post service on Google App Engine. Users can create and edit posts and browse the feed.'],
      ['Image composer','OpenAI’s gpt-image-2 is integrated into the composer. Authors can generate and iterate on imagery directly inside a post.'],
      ['Accounts and search','React Router supports registration, login, and logout with JWT sessions. Elasticsearch on Google Compute Engine uses an inverted index for recent-post and personal-post queries.']
    ]},
  {title:'Docent', subject:'Document Q&A', flow:'Upload → Retrieve → Cite',
    overview:'Readers ask questions about a document and get answers with citations to the passages used.',
    stack:'React · Node.js / Express · LangChain · GPT-5 · MCP',
    details:[
      ['Grounded answers','A retrieval-augmented generation pipeline uses LangChain and GPT-5 to answer from passages in uploaded documents and cite the underlying source material.'],
      ['Hybrid retrieval','The agent routes between document retrieval and live web results. A Model Context Protocol server exposes SerpAPI search through the same tool interface.'],
      ['Voice and ingestion','Node.js and Express handle ingestion, queries, and API orchestration. The React/Ant Design interface uses react-speech-recognition and speak-tts for hands-free input and output.']
    ]},
  {title:'Cadence', subject:'Android music player', flow:'Browse → Play → Save',
    overview:'Listeners move between albums, the feed, and favorites while the current track keeps playing.',
    stack:'Kotlin · Jetpack Compose · Hilt · Room · ExoPlayer',
    details:[
      ['App architecture','The Kotlin Android app uses MVVM and Hilt dependency injection. View models can be unit-tested without constructing their dependencies.'],
      ['Browsing','Jetpack Compose renders feed, album, and favorites screens. Jetpack Navigation handles bottom-bar routing, and Retrofit connects to a json-server mock REST API.'],
      ['Playback and favorites','ExoPlayer maintains global playback across navigation. Room caches favorites locally so saved tracks load without another network request.']
    ]},
  {title:'Don’t Get Shot', subject:'Bird photography survival game', flow:'In development',
    overview:'Fly a gull through a day–night cycle while evading photographers in this third-person survival game, currently in development.',
    stack:'Unity · C# · URP · Compute Shaders',
    details:[
      ['Flight and pursuit','The gull can flap and glide. Collisions trigger falls. Photographers use Unity NavMesh to patrol and pursue the bird.'],
      ['Photo scoring','Each photo is scored on framing, exposure, visibility, and detail retained on the bird. A sharp reference captured at shutter time isolates the bird’s sharpness so background detail cannot inflate its score.'],
      ['Shutter performance','In Unity Editor tests, synchronous shutter processing fell from 53–60 ms to about 15 ms. Color, depth, and a subject mask are captured once. GPU compute shaders process blur and exposure over subsequent frames.']
    ]}
];
let selectedProject = 0;
function selectProject(i) {
  if (!Number.isInteger(i) || !studioProjects[i] || i===selectedProject) return;
  selectedProject=i;
  window.studioRoom?.updateProject(i);
}

const aboutTitle='About & Experience';
// Print rectangles in gallery-prints.jpg, in walking order from the print table.
const galleryPrints=[
  {title:'Still Amid the Rush',date:'June 23, 2026',rect:[4,131,1016,762],description:'Blurred pedestrians pass a seated figure looking at a phone.'},
  {title:'An Open Question',date:'September 6, 2026',rect:[1028,4,1016,1016],description:'A figure sits facing the water. A question is written on the wall below.'},
  {title:'Beneath the Green Giants',date:'June 10, 2026',rect:[131,1028,762,1016],description:'Red roofs sit between a steep green hillside and a narrow strip of shore.'},
  {title:'Between Cloud and Water',date:'June 16, 2026',rect:[1028,1155,1016,762],description:'Clouds cross Mount Fuji above dark ridgelines and a ribbon of lake.'}
];
const stations = [
  { id:'entrance', nav:'Entrance', title:'Xiaoyuan Ma', category:'The Studio', intro:'Photography, software & camera engineering', action:aboutTitle, x:50, y:50 },
  { id:'gallery', nav:'Gallery', title:'The Gallery', category:'Photography', intro:'Four photographs by Xiaoyuan Ma.', action:'View gallery notes', x:14,y:40,
    notes:galleryPrints.map(print=>[print.title,print.description]) },
  { id:'optics',nav:'Camera lab',title:'The Camera Lab',category:'Camera engineering',intro:'Camera extensions for Hasselblad and Sony.',action:'Open lab notes',x:85,y:77,
    notes:[
      ['Hasselblad X2D II 100C','I built a pixel-shift mode that combines six shots into a 400 MP image. I also added multiple exposure for up to nine frames, enabled continuous autofocus (AF-C) with the electronic shutter, and integrated 45 in-camera filters by FarSails777.',
        {text:'X2D II extensions on GitHub',href:lensProjects[0].href}],
      ['Sony Alpha','I’m developing an in-camera multiple exposure mode for Sony Alpha.',
        {text:'Sony Alpha research on GitHub',href:lensProjects[4].href}]
    ] },
  { id:'software',nav:'Software',title:'The Software Desk',category:'Software engineering',intro:'Select a card to view its project on the monitors.',action:'Read project',x:85,y:29 },
  { id:'darkroom',nav:'Darkroom',title:'The Darkroom',category:'Photographic process',intro:'Nine photographs on film.',action:'View darkroom notes',x:45,y:31,
    notes:[['Film photography','Shooting with the Leica M6 and Canon EOS 30 makes room for two different ways of framing a photograph: a rangefinder and a through-the-lens view.'],['Developing trays','These larger prints give you a closer look at the film grain and the detail in the shadows.']] },
  { id:'lake',nav:'Window',title:'Lake Kawaguchiko',category:'Landscape',intro:'The north shore, looking towards Mount Fuji.',action:'About this landscape',x:92,y:38,
    notes:[['Late autumn','From the studio window, you can see Mount Fuji across the lake. The hills along the shore catch the afternoon light.'],
      ['Scene rendering','I built this real-time landscape for my technical art portfolio.']] },
  { id:'about', nav:'About', title:aboutTitle, category:'Studio wall', intro:'', action:'Read biography' }
];
const aboutStation=stations.findIndex(s=>s.id==='about');
const stationOrder=[0,aboutStation,1,2,3,4,5];
const el = id => document.getElementById(id);
let active = 0;
const detail = el('detail');
const panel = el('indexPanel');
const stage = el('stage');
const studioLoading=(()=>{
  const pending=new Set(['room','terrainMap','fujiMap','canopyMap','sunMask','shadowAtlas','skyMap','prints','glazing','frame']);
  const progress=el('studioProgress');
  stage.inert=true;
  function reveal(){
    stage.inert=false;document.documentElement.classList.add('studio-open');
    el('studioLoader').setAttribute('aria-hidden','true');
  }
  function done(task){
    if(pending.delete(task))progress.value=progress.max-pending.size;
  }
  function frame(){
    if(pending.size===1 && pending.has('frame')){
      done('frame');document.documentElement.classList.add('room-ready');reveal();
    }
  }
  function unavailable(){
    pending.clear();el('renderNotice').hidden=false;
    document.documentElement.classList.remove('room-ready');reveal();
  }
  window.addEventListener('error',event=>{
    if(pending.size && (event.error || event.target instanceof HTMLScriptElement))unavailable();
  },true);
  return {done,frame,unavailable,canDraw:()=>pending.size<=1};
})();
const navButtons = [];
function closeIndex(returnFocus = false) {
  panel.hidden = true;
  el('openIndex').setAttribute('aria-expanded','false');
  if (returnFocus) el('openIndex').focus();
}
function showStation(index, sync = true) {
  if (!Number.isInteger(index) || !stations[index]) return;
  if(index!==active && !matchMedia('(prefers-reduced-motion: reduce)').matches){
    const caption=document.querySelector('.caption');
    caption.getAnimations().forEach(animation=>animation.cancel());
    caption.animate([{opacity:0,transform:'translateY(5px)'},{opacity:1,transform:'translateY(0)'}],
      {delay:160,duration:480,easing:'ease-out',fill:'backwards'});
  }
  active = index;
  const s = stations[index];
  stage.classList.toggle('softwareDesk',s.id==='software');
  stage.classList.toggle('profileView',s.id==='about');
  el('guitarSound').hidden=s.id!=='about';
  el('darkroomLight').hidden=s.id!=='darkroom';
  el('readExperience').hidden=s.id!=='about';
  el('previousPortfolio').hidden=s.id!=='entrance';
  el('viewPlaylist').hidden=s.id!=='about';
  closeIndex();
  if(detail.open) detail.close();
  el('kicker').textContent = s.category;
  el('stationTitle').textContent = s.title;
  el('intro').textContent = s.intro;
  el('more').firstChild.textContent = s.action+' ';
  navButtons.forEach((button,i)=>button.setAttribute('aria-current',String(i===index)));
  if(window.studioRoom) window.studioRoom.go(index);
  if(sync && location.hash!== '#'+s.id) history.replaceState(null,'','#'+s.id);
}
function fromHash() {
  const i = stations.findIndex(s=>s.id===location.hash.slice(1));
  showStation(i<0 ? 0 : i,false);
}
stationOrder.forEach(i=>{
  const s=stations[i];
  const button=document.createElement('button');
  button.className='stop'; button.textContent=s.nav;
  button.onclick=()=>showStation(i);
  el('stations').append(button); navButtons[i]=button;
  const row=document.createElement('button'); row.className='indexItem';
  const title=document.createElement('span'); title.textContent=s.id==='entrance'?s.category:s.title;
  const arrow=document.createElement('span'); arrow.textContent='↗'; arrow.setAttribute('aria-hidden','true');
  row.append(title,arrow); row.onclick=()=>{showStation(i); navButtons[i].focus()};
  el('indexList').append(row);
});
el('openIndex').onclick=()=>{
  if(!panel.hidden){closeIndex(true);return}
  panel.hidden=false;el('openIndex').setAttribute('aria-expanded','true');el('closeIndex').focus();
};
el('closeIndex').onclick=()=>closeIndex(true);
stage.addEventListener('pointerdown',e=>{if(!panel.hidden&&!panel.contains(e.target)&&!el('openIndex').contains(e.target))closeIndex()});
function addNote(heading,body,link){
  const section=document.createElement('section');section.className='note';
  const h=document.createElement('h3'),p=document.createElement('p');
  for(const [node,copy] of [[h,heading],[p,body]]){
    for(const part of [].concat(copy))node.append(part.href?profileAnchor(part):part);
  }
  section.append(h,p);
  if(link)section.append(profileAnchor(link));
  el('notes').append(section);
}
function openProfile(id){
  const panel=profileWall[id];
  el('detailType').textContent=panel.label;el('detailTitle').textContent=panel.title;
  el('notes').replaceChildren();
  if(id===0)el('notes').append(profilePortrait);
  if(panel.school)addNote(panel.school,[panel.university,' · '+panel.location+' · '+panel.date]);
  panel.notes.forEach(([heading,body])=>addNote(heading,body));
  if(id===0){
    const links=document.createElement('p');links.className='profileSocial';
    links.append(profileAnchor(profileRefs.linkedin),' · ',profileAnchor(profileRefs.github));
    el('notes').append(links);
  }
  detail.showModal();el('closeDetail').focus();
}
el('readExperience').onclick=()=>openProfile(1);
function openTrackList(){
  el('detailType').textContent='Apple Music';el('detailTitle').textContent='On rotation';
  const list=document.createElement('ol');list.className='trackList';
  list.style.setProperty('--covers','url("'+playlistCovers.src+'")');
  studioPlaylist.forEach((track,i)=>{
    const item=document.createElement('li'),link=trackAnchor(track),cover=document.createElement('i');
    cover.setAttribute('aria-hidden','true');cover.style.backgroundPosition=(i%3)*50+'% '+Math.floor(i/3)*100+'%';
    const text=document.createElement('span'),title=document.createElement('strong'),artist=document.createElement('small');
    title.textContent=track.title;artist.textContent=[track.artist,track.version].filter(Boolean).join(' · ');
    text.append(title,artist);link.replaceChildren(cover,text);item.append(link);list.append(item);
  });
  el('notes').replaceChildren(list);detail.showModal();el('closeDetail').focus();
}
el('viewPlaylist').onclick=()=>window.studioRoom?window.studioRoom.viewPlaylist():openTrackList();
el('guitarSound').onclick=()=>window.studioRoom?.toggleGuitarSound();
el('darkroomLight').onclick=()=>window.studioRoom?.toggleDarkroomLight();
el('backToWall').onclick=()=>window.studioRoom?.returnToWall();
el('more').onclick=()=>{
  if(!active){showStation(aboutStation);return}
  if(active===aboutStation){
    if(window.studioRoom?.atPlaylist())openTrackList();else openProfile(0);
    return
  }
  const s=stations[active];
  el('detailType').textContent=s.category;el('detailTitle').textContent=s.title;
  const notes=el('notes');notes.replaceChildren();
  if(s.id==='software'){
    const picker=document.createElement('select');
    picker.className='projectPicker'; picker.setAttribute('aria-label','Project');
    studioProjects.forEach(p=>picker.add(new Option(p.title)));
    picker.selectedIndex=selectedProject;
    function readProject(){
      const p=studioProjects[selectedProject];
      el('detailTitle').textContent=p.title;
      notes.replaceChildren(picker);
      addNote(p.subject,p.overview);
      for(const [heading,body] of p.details)addNote(heading,body);
      addNote('Built with',p.stack);
    }
    picker.onchange=()=>{selectProject(picker.selectedIndex);readProject();picker.focus()};
    readProject();
  }else{
    for(const note of s.notes)addNote(...note);
  }
  if(s.disclaimer){const p=document.createElement('p');p.className='small';p.textContent=s.disclaimer;notes.append(p)}
  detail.showModal();el('closeDetail').focus();
};
el('closeDetail').onclick=()=>detail.close();
detail.addEventListener('click',e=>{if(e.target===detail)detail.close()});
document.addEventListener('keydown',e=>{
  if(detail.open||e.altKey||e.ctrlKey||e.metaKey)return;
  if(e.key==='Escape'&&!panel.hidden){closeIndex(true);return}
  if(panel.hidden&&(e.key==='ArrowRight'||e.key==='ArrowLeft')){
    e.preventDefault();
    const next=stationOrder.indexOf(active)+(e.key==='ArrowRight'?1:-1);
    showStation(stationOrder[(next+stationOrder.length)%stationOrder.length]);
  }
});
document.addEventListener('studio-select',e=>{
  showStation(Number(e.detail));
});
window.addEventListener('hashchange',fromHash);
window.addEventListener('load',fromHash);
fromHash();
