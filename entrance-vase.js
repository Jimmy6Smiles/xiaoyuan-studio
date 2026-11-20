// A small wheel-thrown stoneware vase and cut plum branches on the print table.
function appendEntranceVase(origin,{vertices,add,sub,mult,cross,unit,rgb}){
  const turn=2*Math.PI,up=[0,1,0],clay=1059,petal=1060;
  function vertex(p,n,color,material,u=0,v=0){
    return [...add(origin,p),...n,...color,u,v,material];
  }
  function surface(rows,cols,sample,pointStart=false,pointEnd=false){
    let last=Array.from({length:cols+1},(_,j)=>sample(0,j/cols));
    for(let i=1;i<=rows;i++){
      const row=Array.from({length:cols+1},(_,j)=>sample(i/rows,j/cols));
      for(let j=0;j<cols;j++){
        if(!(pointEnd && i===rows))vertices.push(...last[j],...row[j],...row[j+1]);
        if(!(pointStart && i===1))vertices.push(...last[j],...row[j+1],...last[j+1]);
      }
      last=row;
    }
  }
  const profile=[
    // Height and radius in metres, from the foot up and back down inside the lip.
    [0,.069],[.002,.075],[.006,.078],[.013,.078],[.017,.076],
    [.020,.077],[.024,.085],[.032,.096],[.045,.108],[.062,.121],
    [.082,.133],[.104,.142],[.128,.146],[.149,.145],[.168,.141],
    [.185,.134],[.202,.123],[.218,.108],[.231,.091],[.241,.073],
    [.249,.057],[.257,.046],[.266,.041],[.279,.039],[.286,.040],
    [.290,.044],[.294,.045],[.297,.0435],[.298,.040],[.297,.0365],
    [.293,.0345],[.280,.033],[.265,.035],[.254,.040],[.243,.052],
    [.228,.075],[.206,.100],[.180,.120],[.150,.133],[.118,.133],
    [.086,.123],[.059,.106],[.043,.084],[.036,.059],[.035,0]
  ];
  const body=rgb('c4bdb0');
  surface(profile.length-1,72,(t,u)=>{
    const i=Math.round(t*(profile.length-1)),[h,r]=profile[i];
    const [h0,r0]=profile[Math.max(0,i-1)],[h1,r1]=profile[Math.min(profile.length-1,i+1)];
    const a=turn*u,c=Math.cos(a),s=Math.sin(a);
    const oval=1+.008*Math.cos(2*a+.7)+.003*Math.sin(3*a+8*h);
    const p=[r*oval*c+.002*h/.30,h,r*oval*s];
    const n=unit([(h1-h0)*c,r0-r1,(h1-h0)*s]);
    const inner=i<=29?1:.28+.72*Math.exp(-Math.max(0,.296-h)/.022);
    return vertex(p,n,mult(body,inner),clay,u,h);
  },false,true);

  function bezier([a,b,c,d],t){
    const q=1-t;
    return a.map((x,i)=>q*q*q*x+3*q*q*t*b[i]+3*q*t*t*c[i]+t*t*t*d[i]);
  }
  function twig(points,r0,r1,seed,steps){
    const bark=rgb('655045');
    surface(steps,7,(t,u)=>{
      const p=bezier(points,t),axis=unit(sub(bezier(points,t+.001),bezier(points,t-.001)));
      const x=unit(cross(axis,[0,0,1])),y=cross(x,axis),a=turn*u;
      const n=add(mult(x,Math.cos(a)),mult(y,Math.sin(a)));
      const radius=(r0+(r1-r0)*t)*(1+.06*Math.sin(19*t+seed));
      return vertex(add(p,mult(n,radius)),n,mult(bark,.91+.19*t+.09*Math.cos(3*a+seed)),0);
    });
  }
  // Oriented ovoids give the buds a pinched tip and five seams in their folded petals.
  function ovoid(base,axis,r,h,color,bud){
    const u=unit(cross(Math.abs(axis[1])>.85?[1,0,0]:up,axis)),v=cross(u,axis);
    surface(bud?9:4,bud?16:6,(t,s)=>{
      const a=s*turn,b=Math.PI*t,radial=add(mult(u,Math.cos(a)),mult(v,Math.sin(a)));
      const seam=bud?(.5+.5*Math.cos(5*a+1.2*t))**6:0;
      const width=r*Math.sin(b)*(bud?1.12-.37*t:1)*(1-.09*seam);
      const p=add(base,add(mult(axis,h*(1-Math.cos(b))*.5),mult(radial,width)));
      const n=unit(add(mult(radial,Math.sin(b)),mult(axis,-2*r/h*Math.cos(b))));
      const tint=bud && t<.33?rgb('78624a'):mult(color,.88+.15*t-.18*seam);
      return vertex(p,n,tint,0);
    },true,true);
  }
  function blossom(cup,axis,size,seed){
    const u=unit(cross(up,axis)),v=cross(axis,u),root=rgb('ae6668');
    const edge=rgb(seed%3===0?'f2c7b3':seed%3===1?'dfa29a':'ebbaab');
    ovoid(sub(cup,mult(axis,.006)),axis,.005,.008,rgb('806345'),false);
    for(let k=0;k<5;k++){
      const a=seed+turn*k/5+.05*Math.sin(k*7+seed);
      const out=add(mult(u,Math.cos(a)),mult(v,Math.sin(a))),side=cross(axis,out);
      const length=size*(.94+.09*Math.sin(k*3.9+seed));
      function point(t,s){
        const width=.63*length*Math.sin(Math.PI*t)**.55*(.57+.64*t);
        const along=length*(.10+.90*t-.039*Math.exp(-24*s*s)*t**5);
        const lift=length*(.12+.33*t*t+.14*s*s*Math.sin(Math.PI*t)+.11*t*Math.sin(k+seed));
        return add(cup,add(mult(out,along),add(mult(side,width*s),mult(axis,lift))));
      }
      surface(7,6,(t,s)=>{
        const across=2*s-1,h=Math.max(.001,Math.min(.999,t));
        const n=unit(cross(sub(point(h+.0005,across),point(h-.0005,across)),
                           sub(point(h,across+.001),point(h,across-.001))));
        const pigment=.22+.77*Math.sqrt(t)-.05*(1-Math.abs(across))**4;
        return vertex(point(t,across),n,root.map((c,i)=>c+(edge[i]-c)*pigment),petal);
      },true);
    }
    for(let k=0;k<9;k++){
      const a=k*2.4+seed,out=add(mult(u,Math.cos(a)),mult(v,Math.sin(a)));
      const base=add(cup,mult(out,.0017)),height=size*(.29+.13*Math.sin(5*k+seed));
      const end=add(base,add(mult(out,.0045),mult(axis,height)));
      const stalk=unit(sub(end,base));
      ovoid(base,stalk,.0006,Math.hypot(...sub(end,base)),rgb('dfbc83'),false);
      ovoid(end,stalk,.00115,.0017,rgb('d39a48'),false);
    }
  }
  // Long flowering wood, a lower outward spray and a slender rear stem.
  // Short laterals start on their parent branch and carry mixed stages of bloom.
  const stems=[
    [[-.014,.229,.004],[-.001,.452,.015],[-.213,.639,-.022],[-.278,.770,-.051]],
    [[.012,.236,-.010],[.014,.393,-.032],[.118,.561,-.077],[.188,.690,-.116]],
    [[.005,.232,.012],[.023,.390,.054],[.158,.468,.081],[.244,.503,.115]],
    [[-.009,.238,-.009],[-.068,.413,-.035],[-.024,.571,-.079],[-.055,.655,-.091]]
  ];
  const laterals=[
    [[.40,-.074,.062,.037],[.58,.030,.087,.040],[.74,-.072,.039,-.010],[.88,.004,.061,.012]],
    [[.43,-.051,.075,-.004],[.62,.063,.042,.045],[.81,-.020,.066,.037]],
    [[.42,.046,.041,.008],[.72,.033,.051,-.023]],
    [[.59,-.050,.045,.009]]
  ];
  let seed=0;
  function sprout(p,open,direction){
    seed++;
    const axis=unit([direction+.48*Math.sin(seed*2.4),.35+.45*Math.sin(seed*1.7),.32+.64*Math.cos(seed*.81)]);
    const cup=add(p,mult(axis,.0075));
    twig([p,add(p,mult(axis,.0025)),add(p,mult(axis,.005)),cup],.0018,.0013,seed,2);
    if(seed%4===1){
      const side=unit(cross(up,axis)),length=.025+.008*Math.sin(seed);
      const tip=unit(add(mult(axis,.55),[.12,.72,.16]));
      const normal=unit(cross(tip,side)),pivot=p;
      surface(6,4,(t,s)=>{
        const span=(2*s-1)*Math.sin(Math.PI*t);
        const p=add(pivot,add(mult(tip,length*t),add(mult(side,span*.0048),mult(normal,.003*Math.sin(Math.PI*t)*(1-Math.abs(2*s-1))))));
        return vertex(p,normal,mult(rgb('777549'),.72+.28*t+.12*(1-Math.abs(2*s-1))),petal);
      },true,true);
    }
    if(open)blossom(cup,axis,.022+.0045*Math.cos(seed*2),seed);
    else ovoid(cup,axis,.0045+.002*(.5+.5*Math.cos(seed)),.013,rgb(seed%2?'b16b62':'c18a78'),true);
  }
  stems.forEach((stem,i)=>{
    twig(stem,i===0?.0047:.0035,.0006,i,14);
    laterals[i].forEach(([t,x,y,z],j)=>{
      const start=bezier(stem,t),end=add(start,[x,y,z]);
      const branch=[start,add(start,[.31*x,.13*y,.39*z]),add(start,[.77*x,.68*y,.82*z]),end];
      twig(branch,.0023,.00065,i+j,6);
      sprout(bezier(branch,.52),j%2===0,Math.sign(x)*.60);
      sprout(bezier(branch,.86),(i+j)%3===1,Math.sign(x)*.44);
      sprout(end,false,Math.sign(x)*.80);
    });
    sprout(bezier(stem,.94),i===1,-.30+i*.23);
  });
}
