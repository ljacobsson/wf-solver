const SIZE=15;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const lum=(d,i)=>(d[i]*.299+d[i+1]*.587+d[i+2]*.114);

function imageData(source) {
  const canvas=document.createElement("canvas"); canvas.width=source.naturalWidth||source.width; canvas.height=source.naturalHeight||source.height;
  const ctx=canvas.getContext("2d",{willReadFrequently:true}); ctx.drawImage(source,0,0);
  return {canvas,ctx,data:ctx.getImageData(0,0,canvas.width,canvas.height)};
}

export function locateBoard(source) {
  return locateBoardData(imageData(source).data);
}

export function locateBoardData(data) {
  const w=data.width,h=data.height;
  const pixel=(x,y)=>lum(data.data,(clamp(Math.round(y),0,h-1)*w+clamp(Math.round(x),0,w-1))*4);
  const percentile=(values,fraction)=>{const sorted=[...values].sort((a,b)=>a-b),at=(sorted.length-1)*fraction,lower=Math.floor(at),upper=Math.ceil(at);return sorted[lower]+(sorted[upper]-sorted[lower])*(at-lower);};

  // Score a candidate only when all 16 horizontal and vertical grid boundaries
  // behave like a complete 15x15 lattice. Median contrast rejects letters,
  // buttons and smaller rectangular UI elements that happen to resemble lines.
  const scoreRect=(x,y,size)=>{
    const cell=size/SIZE,offset=Math.max(2,cell*.12),bottom=y+size;
    if(y-offset<0||bottom+offset>=h||x<0||x+size>w)return {score:-Infinity,grid:-Infinity,boundary:-Infinity};
    const differences=[],topEnds=[],bottomEnds=[];
    for(let k=0;k<=SIZE;k++) {
      const edgeY=y+k*cell,edgeX=x+k*cell;
      const adjacent=k===0?.5:k===SIZE?SIZE-.5:k-.5;
      for(let j=0;j<SIZE;j++) {
        const centerX=x+(j+.5)*cell,centerY=y+(j+.5)*cell;
        differences.push(pixel(centerX,y+adjacent*cell)-pixel(centerX,edgeY));
        differences.push(pixel(x+adjacent*cell,centerY)-pixel(edgeX,centerY));
      }
      if(k>0&&k<SIZE){
        topEnds.push(pixel(edgeX,y-offset)-pixel(edgeX,y+offset));
        bottomEnds.push(pixel(edgeX,bottom+offset)-pixel(edgeX,bottom-offset));
      }
    }
    const grid=percentile(differences,.5);
    const boundary=Math.min(percentile(topEnds,.25),percentile(bottomEnds,.25));
    return {score:grid+Math.min(60,boundary),grid,boundary};
  };

  const maxSize=Math.min(w,h),coarse=Math.max(1,Math.round(maxSize/100));
  const sizes=[];
  for(let size=Math.max(SIZE*8,Math.round(maxSize*.25));size<=maxSize;size+=coarse)sizes.push(size);
  if(sizes.at(-1)!==maxSize)sizes.push(maxSize);
  let best={score:-Infinity,x:0,y:Math.round((h-w)*.55),size:w};
  let seed=null;
  for(const size of sizes) {
    const x=(w-size)/2;
    let sizeBest={score:-Infinity,x,y:0,size,grid:-Infinity,boundary:-Infinity};
    for(let y=Math.round(h*.05);y<=h-size;y+=coarse) {
      const metrics=scoreRect(x,y,size),candidate={...metrics,x,y,size};
      if(candidate.score>sizeBest.score)sizeBest=candidate;
      if(candidate.score>best.score)best=candidate;
    }
    if(sizeBest.grid>=12&&sizeBest.boundary>=8)seed=sizeBest;
  }

  // Resolve the coarse result to source-pixel precision, including asymmetric
  // insets caused by rounded device frames or screenshot crops.
  seed ||= best;best=seed;
  for(let size=Math.max(SIZE*8,seed.size-coarse);size<=Math.min(maxSize,seed.size+coarse);size++) {
    const centered=(w-size)/2;
    for(let x=Math.max(0,Math.round(centered-coarse));x<=Math.min(w-size,Math.round(centered+coarse));x++) {
      for(let y=Math.max(0,seed.y-coarse);y<=Math.min(h-size,seed.y+coarse);y++) {
        const metrics=scoreRect(x,y,size);
        if(metrics.grid>=12&&metrics.boundary>=8&&metrics.score>best.score)best={...metrics,x,y,size};
      }
    }
  }
  // Grid gutters can be several source pixels thick. Align the returned top to
  // the darkest common horizontal gutter so cell interiors—not gutter edges—
  // are used by the OCR on both low- and high-density screenshots.
  const cell=best.size/SIZE,phaseRadius=Math.max(1,Math.round(cell*.12));
  let alignedY=best.y,lowestEdge=Infinity;
  for(let y=Math.max(0,best.y-phaseRadius);y<=Math.min(h-best.size,best.y+phaseRadius);y++){
    let total=0,count=0;
    for(let k=0;k<=SIZE;k++)for(let j=0;j<SIZE;j++){
      total+=pixel(best.x+(j+.5)*cell,y+k*cell);count++;
    }
    const average=total/count;
    if(average<=lowestEdge){lowestEdge=average;alignedY=y;}
  }
  best={...best,...scoreRect(best.x,alignedY,best.size),y:alignedY};
  return {x:Math.round(best.x),y:Math.round(best.y),size:Math.round(best.size),confidence:clamp(Math.min(best.grid/20,best.boundary/25),0,1)};
}

function averagePatch(data,cx,cy,radius) {
  let rgb=[0,0,0],n=0;
  for(let y=cy-radius;y<=cy+radius;y+=2) for(let x=cx-radius;x<=cx+radius;x+=2) {
    const i=(clamp(y,0,data.height-1)*data.width+clamp(x,0,data.width-1))*4;
    // Ignore dark glyph pixels when deciding the square background.
    if(lum(data.data,i)<55) continue;
    rgb[0]+=data.data[i];rgb[1]+=data.data[i+1];rgb[2]+=data.data[i+2];n++;
  }
  return n?rgb.map(x=>x/n):[20,25,30];
}

function classify(rgb) {
  const [r,g,b]=rgb, brightness=(r+g+b)/3;
  // White/cream and yellow blank tiles are much brighter than board premiums.
  if(brightness>185 || (r>165&&g>155&&b<r*.86)) return "TILE";
  const choices={DL:[91,137,69],TL:[18,102,153],DW:[205,108,4],TW:[169,47,51],NONE:[35,40,46]};
  return Object.entries(choices).sort((a,b)=>distance(rgb,a[1])-distance(rgb,b[1]))[0][0];
}
const distance=(a,b)=>a.reduce((n,x,i)=>n+(x-b[i])**2,0);

function glyphMask(ctx,x,y,w,h) {
  const crop=ctx.getImageData(Math.round(x+w*.08),Math.round(y+h*.12),Math.max(1,Math.round(w*.66)),Math.max(1,Math.round(h*.78)));
  const dark=new Uint8Array(crop.width*crop.height);
  for(let yy=0;yy<crop.height;yy++) for(let xx=0;xx<crop.width;xx++) {
    const i=(yy*crop.width+xx)*4;
    if(lum(crop.data,i)<90) dark[yy*crop.width+xx]=1;
  }
  // A tile contains two glyphs: the large letter and a small point value in the
  // upper-right. Keep only the largest connected component so the score cannot
  // deform the letter during normalization (the old OCR's main failure mode).
  const seen=new Uint8Array(dark.length); let points=[];
  for(let start=0;start<dark.length;start++) {
    if(!dark[start]||seen[start])continue;
    const stack=[start],component=[];seen[start]=1;
    while(stack.length) {
      const at=stack.pop(),py=Math.floor(at/crop.width),px=at%crop.width;component.push([px,py]);
      for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) {
        if(!dx&&!dy)continue;const nx=px+dx,ny=py+dy;
        if(nx<0||ny<0||nx>=crop.width||ny>=crop.height)continue;
        const ni=ny*crop.width+nx;if(dark[ni]&&!seen[ni]){seen[ni]=1;stack.push(ni);}
      }
    }
    if(component.length>points.length)points=component;
  }
  if(points.length<8) return null;
  const minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0])),minY=Math.min(...points.map(p=>p[1])),maxY=Math.max(...points.map(p=>p[1]));
  const out=new Uint8Array(32*40);
  for(const [px,py] of points) {
    const nx=Math.round((px-minX)/Math.max(1,maxX-minX)*27)+2, ny=Math.round((py-minY)/Math.max(1,maxY-minY)*35)+2;
    for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) if(nx+dx>=0&&nx+dx<32&&ny+dy>=0&&ny+dy<40) out[(ny+dy)*32+nx+dx]=1;
  }
  return out;
}

let templates;
function makeTemplates() {
  if(templates) return templates;
  templates=[];
  for(const font of ["Roboto Slab","Roboto Mono","DejaVu Sans Mono","Liberation Mono","Courier New","monospace","Arial"]) for(const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    const c=document.createElement("canvas");c.width=64;c.height=80;const x=c.getContext("2d");
    x.fillStyle="white";x.fillRect(0,0,64,80);x.fillStyle="black";x.textAlign="center";x.textBaseline="middle";x.font=`52px ${font}`;x.fillText(letter,32,42);
    const mask=glyphMask(x,0,0,64,80); if(mask) templates.push({letter,mask});
  }
  return templates;
}

function recognizeGlyph(ctx,x,y,w,h) {
  const mask=glyphMask(ctx,x,y,w,h); if(!mask) return {letter:"",confidence:0};
  const byLetter=new Map();
  for(const t of makeTemplates()) {
    let both=0,either=0;
    for(let i=0;i<mask.length;i++){if(mask[i]||t.mask[i])either++;if(mask[i]&&t.mask[i])both++;}
    const score=both/Math.max(1,either);
    if(score>(byLetter.get(t.letter)??-1))byLetter.set(t.letter,score);
  }
  const ranked=[...byLetter].map(([letter,score])=>({letter,score})).sort((a,b)=>b.score-a.score);
  const best=ranked[0],runnerUp=ranked[1];
  const quality=clamp((best.score-.42)/.38,0,1);
  const separation=clamp((best.score-runnerUp.score)/.14,0,1);
  return {letter:best.letter,confidence:quality*separation,alternatives:ranked.slice(0,3)};
}

function trueRuns(values,minLength=1) {
  const runs=[];let start=-1;
  for(let i=0;i<=values.length;i++) {
    if(i<values.length&&values[i]){if(start<0)start=i;continue;}
    if(start>=0&&i-start>=minLength)runs.push({start,end:i-1,length:i-start});
    start=-1;
  }
  return runs;
}

function locateRackTiles(data,boardRect) {
  const firstY=clamp(Math.round(boardRect.y+boardRect.size),0,data.height-1);
  const lastY=clamp(Math.round(data.height*.94),firstY,data.height-1);
  const rowIsRack=[];
  for(let y=firstY;y<=lastY;y++) {
    let light=0,total=0;
    for(let x=0;x<data.width;x+=4){if(lum(data.data,(y*data.width+x)*4)>150)light++;total++;}
    rowIsRack.push(light/total>.52);
  }
  const bands=trueRuns(rowIsRack,Math.max(20,Math.round(data.width/15*.55)));
  if(!bands.length)return [];
  const band=bands.sort((a,b)=>b.length-a.length)[0];
  const top=firstY+band.start,bottom=firstY+band.end;

  // Near the bottom of each tile there are no letters or point values, so a
  // single scanline gives seven uninterrupted light rectangles separated by
  // the dark rack gutters.
  const scanY=Math.round(bottom-(bottom-top)*.08);
  const lightColumns=Array.from({length:data.width},(_,x)=>lum(data.data,(scanY*data.width+x)*4)>150);
  const columns=trueRuns(lightColumns,Math.max(20,Math.round(data.width/30)));
  if(columns.length!==7)return [];
  return columns.map(column=>({x:column.start,y:top,w:column.length,h:bottom-top+1}));
}

export function readScreenshot(source, rect=locateBoard(source)) {
  const {ctx,data}=imageData(source), cell=rect.size/SIZE;
  const board=Array.from({length:SIZE},()=>Array(SIZE)); let confidence=0;
  for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++) {
    const x=rect.x+c*cell,y=rect.y+r*cell;
    const rgb=averagePatch(data,Math.round(x+cell/2),Math.round(y+cell/2),Math.max(2,Math.round(cell*.25)));
    const kind=classify(rgb); let letter="",ocrConfidence=1,blank=false;
    // Yellow tiles mark the previous play; they are not blank tiles. Existing
    // blanks are intentionally left for user verification because their tiny
    // zero-value marker is less reliable than the main glyph.
    if(kind==="TILE") { const found=recognizeGlyph(ctx,x,y,cell,cell);letter=found.letter;ocrConfidence=found.confidence;blank=false; }
    board[r][c]={letter,premium:kind==="TILE"?"NONE":kind,blank,confidence:ocrConfidence}; confidence+=ocrConfidence;
  }
  const rackTiles=locateRackTiles(data,rect);
  let rack="",rackConfidence=[];
  for(const tile of rackTiles){const found=recognizeGlyph(ctx,tile.x,tile.y,tile.w,tile.h);rack+=found.letter||"?";rackConfidence.push(found.confidence);}
  return {board,rack,rect,confidence:confidence/(SIZE*SIZE),rackConfidence};
}
