// Bounds layout is [first, count, minX, minY, minZ, maxX, maxY, maxZ].
const studioVisibility=(()=>{
  const openings=[
    [[5.85,1.02,-2.46],[5.85,1.02,4.26],[5.85,3.53,4.26],[5.85,3.53,-2.46]],
    [[-5.88,3.17,-4.92],[5.88,3.17,-4.92],[5.88,4.13,-4.92],[-5.88,4.13,-4.92]]
  ];
  function clip(poly,distance){
    const next=[];
    let prev=poly[poly.length-1],a=distance(prev);
    for(const p of poly){
      const b=distance(p);
      if((a<0)!==(b<0)){
        const t=a/(a-b);
        next.push(prev.map((v,i)=>v+t*(p[i]-v)));
      }
      if(b>=0)next.push(p);
      prev=p;a=b;
    }
    return next;
  }
  function windows(matrix,w,h){
    const rects=[];
    for(let id=0;id<openings.length;id++){
      let points=openings[id].map(([x,y,z])=>[0,1,3].map(i=>matrix[i]*x+matrix[4+i]*y+matrix[8+i]*z+matrix[12+i]));
      for(const plane of [p=>p[2]-.035,p=>p[2]+p[0],p=>p[2]-p[0],p=>p[2]+p[1],p=>p[2]-p[1]]){
        points=clip(points,plane);
        if(!points.length)break;
      }
      if(!points.length)continue;
      const xs=points.map(p=>p[0]/p[2]),ys=points.map(p=>p[1]/p[2]);
      // Keep a border for window-frame defocus and the displaced water reflection.
      const dx=2*(26/w+.012),dy=2*(26/h+.018);
      rects.push([Math.max(-1,Math.min(...xs)-dx),Math.max(-1,Math.min(...ys)-dy),
                  Math.min(1,Math.max(...xs)+dx),Math.min(1,Math.max(...ys)+dy),id]);
    }
    return rects;
  }
  function frustum(m,rect=[-1,-1,1,1],near=.035){
    const planes=[];
    for(const [i,s,t] of [[0,1,-rect[0]],[0,-1,rect[2]],[1,1,-rect[1]],[1,-1,rect[3]],[3,1,0]]){
      planes.push([0,4,8,12].map(k=>s*m[k+i]+t*m[k+3]));
    }
    planes[4][3]-=near;
    return planes;
  }
  function intersects(bounds,planes){
    for(const p of planes){
      const x=bounds[p[0]>=0?5:2],y=bounds[p[1]>=0?6:3],z=bounds[p[2]>=0?7:4];
      if(p[0]*x+p[1]*y+p[2]*z+p[3]<0)return false;
    }
    return true;
  }
  function drawRanges(chunks,accept,draw){
    let first=0,count=0;
    for(const c of chunks){
      if(!accept(c))continue;
      if(count && first+count!==c[0]){draw(first,count);count=0;}
      if(!count)first=c[0];
      count+=c[1];
    }
    if(count)draw(first,count);
  }
  function roomChunks(data,ends){
    const packed=new Float32Array(data.length),chunks=[];
    let from=0,write=0;
    for(const end of ends){
      const cells=new Map();
      for(let first=from;first<end;first+=3){
        const k=first*12;
        const cell=[0,1,2].map(axis=>Math.floor((data[k+axis]+data[k+12+axis]+data[k+24+axis])/(3*(axis===1?1.25:1.7))));
        const key=cell.join(',');
        let group=cells.get(key);
        if(!group){group={triangles:[],bounds:[0,0,Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity]};cells.set(key,group);}
        group.triangles.push(k);
        for(let j=k;j<k+36;j+=12)for(let i=0;i<3;i++){
          group.bounds[2+i]=Math.min(group.bounds[2+i],data[j+i]);
          group.bounds[5+i]=Math.max(group.bounds[5+i],data[j+i]);
        }
      }
      for(const {triangles,bounds} of cells.values()){
        bounds[0]=write/12;bounds[1]=triangles.length*3;
        for(const k of triangles){for(let i=k;i<k+36;i++)packed[write++]=data[i];}
        chunks.push(bounds);
      }
      from=end;
    }
    for(let i=write;i<data.length;i++)packed[i]=data[i];
    return {packed,chunks};
  }
  // Adjacent triangles often share position, normal, colour, UV and material.
  // Preserve exact attribute bits and the existing draw ranges, including seams.
  function indexRoom(data,lightUVs){
    const stride=12,count=data.length/stride;
    const words=new Uint32Array(data.buffer,data.byteOffset,data.length);
    const table=new Uint32Array(2**Math.ceil(Math.log2(count*2)));
    const indices=new Uint32Array(count),mask=table.length-1;
    let used=0;
    for(let i=0;i<count;i++){
      const start=i*stride;
      let hash=2166136261;
      for(let k=0;k<stride;k++)hash=Math.imul(hash^words[start+k],16777619);
        if(lightUVs)hash=Math.imul(hash^lightUVs[i],16777619);
      let slot=(hash^(hash>>>16))&mask;
      while(table[slot]){
        const offset=(table[slot]-1)*stride;
        let k=0;
        while(k<stride && words[offset+k]===words[start+k])k++;
          if(k===stride && (!lightUVs || lightUVs[offset/stride]===lightUVs[i]))break;
        slot=(slot+1)&mask;
      }
      if(!table[slot]){
        words.copyWithin(used*stride,start,start+stride);
        if(lightUVs)lightUVs[used]=lightUVs[i];
        table[slot]=++used;
      }
      indices[i]=table[slot]-1;
    }
    return {vertices:data.subarray(0,used*stride),indices};
  }
  // Keep only opaque vertex positions for centre metering, at sub-millimetre
  // precision. Ray tests visit nearby intersecting cells first and stop at a hit.
  function centerMeter(packed,chunks,count){
    const scale=2048,positions=new Int16Array(count*3);
    for(let i=0,j=0;i<count*12;i+=12){
      positions[j++]=Math.round(packed[i]*scale);
      positions[j++]=Math.round(packed[i+1]*scale);
      positions[j++]=Math.round(packed[i+2]*scale);
    }
    return function measure(origin,direction){
      const candidates=[];
      for(const c of chunks){
        let near=.04,far=Infinity;
        for(let i=0;i<3;i++){
          if(Math.abs(direction[i])<1e-8){
            if(origin[i]<c[i+2] || origin[i]>c[i+5]){far=-1;break;}
          }else{
            const a=(c[i+2]-origin[i])/direction[i],b=(c[i+5]-origin[i])/direction[i];
            near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));
          }
          if(near>far)break;
        }
        if(near<=far)candidates.push([near,c]);
      }
      candidates.sort((a,b)=>a[0]-b[0]);
      const [ox,oy,oz]=origin.map(v=>v*scale),[dx,dy,dz]=direction;
      let nearest=Infinity;
      for(const [near,c] of candidates){
        if(near*scale>nearest+1)break;
        for(let k=3*c[0],end=k+3*c[1];k<end;k+=9){
          const ax=positions[k],ay=positions[k+1],az=positions[k+2];
          const bx=positions[k+3]-ax,by=positions[k+4]-ay,bz=positions[k+5]-az;
          const cx=positions[k+6]-ax,cy=positions[k+7]-ay,cz=positions[k+8]-az;
          const px=dy*cz-dz*cy,py=dz*cx-dx*cz,pz=dx*cy-dy*cx;
          const det=bx*px+by*py+bz*pz;
          if(Math.abs(det)<1.e-6)continue;
          const tx=ox-ax,ty=oy-ay,tz=oz-az;
          const u=(tx*px+ty*py+tz*pz)/det;
          if(u<0 || u>1)continue;
          const qx=ty*bz-tz*by,qy=tz*bx-tx*bz,qz=tx*by-ty*bx;
          const v=(dx*qx+dy*qy+dz*qz)/det;
          if(v<0 || u+v>1)continue;
          const t=(cx*qx+cy*qy+cz*qz)/det;
          if(t>.04*scale && t<nearest)nearest=t;
        }
      }
      return scale/nearest; // dioptres; an unobstructed view outdoors gives zero
    };
  }
  return {clip,openings,windows,frustum,intersects,drawRanges,roomChunks,indexRoom,centerMeter};
})();
