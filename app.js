import { buildTrie, makeBoard, scoreBreakdown, solve, VALUES } from "./src/solver.js";
import { locateBoard, readScreenshot } from "./src/vision.js";

const $=s=>document.querySelector(s);
let board=makeBoard(), trie=null, selected=null, sourceImage=null, boardRect=null;
let installPrompt=null;

async function loadDictionary() {
  const status=$("#dictStatus");
  const sources=["./data/sowpods.txt","https://raw.githubusercontent.com/kamilmielnik/scrabble-dictionaries/master/english/sowpods.txt"];
  for(const url of sources) try {
    const response=await fetch(url); if(!response.ok) continue;
    const text=await response.text(); const words=text.split(/\s+/); if(words.length<100000) continue;
    const started=performance.now(); trie=buildTrie(words);
    status.textContent=`${trie.count.toLocaleString()} SOWPODS words · ${Math.round(performance.now()-started)} ms`;
    return;
  } catch {}
  status.innerHTML="Dictionary unavailable · <label class='dict-pick'>choose sowpods.txt<input id='dictFile' type='file' accept='.txt'></label>";
  $("#dictFile").addEventListener("change",async e=>{const words=(await e.target.files[0].text()).split(/\s+/);trie=buildTrie(words);status.textContent=`${trie.count.toLocaleString()} SOWPODS words ready`;});
}

function renderBoard(highlights=[]) {
  const el=$("#board"), highlight=new Set(highlights.map(p=>`${p.r},${p.c}`)); el.replaceChildren();
  for(let r=0;r<15;r++) for(let c=0;c<15;c++) {
    const cell=board[r][c], b=document.createElement("button"); b.className="cell";
    if(cell.letter)b.classList.add("tile"); if(cell.blank)b.classList.add("blank"); if(cell.confidence<.45)b.classList.add("low");
    if(selected?.r===r&&selected?.c===c)b.classList.add("selected"); if(highlight.has(`${r},${c}`))b.classList.add("selected");
    b.dataset.premium=cell.premium; b.title=`${String.fromCharCode(65+c)}${r+1} · ${cell.letter||cell.premium||"empty"}`;
    b.innerHTML=cell.letter ? `${cell.letter}<small>${cell.blank?0:VALUES[cell.letter]??""}</small>` : (cell.premium==="NONE"?"":`<small>${cell.premium}</small>`);
    b.addEventListener("click",()=>selectCell(r,c)); el.append(b);
  }
}

function selectCell(r,c) {
  selected={r,c}; const cell=board[r][c];
  $("#coordinate").textContent=`${String.fromCharCode(65+c)}${r+1} · row ${r+1}, column ${c+1}`;
  $("#cellLetter").value=cell.letter; $("#cellPremium").value=cell.premium; $("#cellBlank").checked=cell.blank; renderBoard();
}

function updateCell() {
  if(!selected)return; const cell=board[selected.r][selected.c];
  cell.letter=$("#cellLetter").value.toUpperCase().replace(/[^A-Z]/g,"").slice(0,1);cell.premium=$("#cellPremium").value;cell.blank=$("#cellBlank").checked&&!!cell.letter;cell.confidence=1;renderBoard();
}

function updateCropLine() {
  if(!sourceImage||!boardRect)return; const shown=$("#preview").clientHeight, scale=shown/sourceImage.naturalHeight;
  const imageOffset=($("#previewWrap").clientWidth-$("#preview").clientWidth)/2;
  const line=$(".crop-line");line.style.top=`${boardRect.y*scale}px`;line.style.left=`${imageOffset+boardRect.x*scale}px`;line.style.right="auto";line.style.width=`${boardRect.size*scale}px`;
  $("#boardTopOut").textContent=`x ${Math.round(boardRect.x)} · y ${Math.round(boardRect.y)} · ${Math.round(boardRect.size)} px`;
}

async function useFile(file) {
  if(!file)return; const img=$("#preview"); img.src=URL.createObjectURL(file); await img.decode(); sourceImage=img;
  boardRect=locateBoard(img); const slider=$("#boardTop");slider.max=Math.max(0,img.naturalHeight-boardRect.size);slider.value=boardRect.y;
  $("#dropzone").classList.add("hidden");$("#previewWrap").classList.remove("hidden");$("#boardTopWrap").classList.remove("hidden");updateCropLine();
  parseImage();
}

function parseImage() {
  const result=readScreenshot(sourceImage,boardRect);board=result.board;$("#rack").value=result.rack;
  $("#workspace").classList.remove("hidden");renderBoard();selectCell(0,0);
}

function runSolver() {
  const results=$("#results"); $("#resultsPanel").classList.remove("hidden");
  if(!trie){results.innerHTML="<div class='error'>SOWPODS is not loaded. Connect once to download it, or choose a local sowpods.txt file in the dictionary badge above.</div>";return;}
  const rack=$("#rack").value.toUpperCase().replace(/[^A-Z?]/g,"");if(!rack.length){results.innerHTML="<div class='error'>Enter the letters on your rack first.</div>";return;}
  $("#solve").disabled=true;$("#solve").textContent="Searching…";
  requestAnimationFrame(()=>setTimeout(()=>{
    const start=performance.now();let plays;
    try{plays=solve(board,rack,trie,100);}catch(error){results.innerHTML=`<div class='error'>${error.message}</div>`;return;}finally{$("#solve").disabled=false;$("#solve").textContent="Find best moves";}
    const elapsed=performance.now()-start;$("#timing").textContent=`${plays.length} moves · ${Math.round(elapsed)} ms`;
    if(!plays.length){results.innerHTML="<div class='error'>No legal moves found. Check any red ? markers on the board and verify the rack.</div>";return;}
    results.replaceChildren(...plays.map((play,index)=>{
      const el=document.createElement("button");el.className="result";el.innerHTML=`<span class='score'>${play.score}</span><span><span class='word'>${play.word}</span><br><span class='meta'>${scoreBreakdown(play)}${play.bingo?" · +40 bingo":""}${play.crossScore?` · ${play.crossScore} cross points`:""}</span></span><span class='placement'>${play.placed.map(p=>`${String.fromCharCode(65+p.c)}${p.r+1}=${p.letter}${p.blank?"*":""}`).join(" ")}</span>`;
      el.addEventListener("click",()=>{renderBoard(play.placed);el.scrollIntoView({behavior:"smooth",block:"nearest"});});if(index===0)el.setAttribute("aria-label","Best move");return el;
    }));
    renderBoard(plays[0].placed);$("#resultsPanel").scrollIntoView({behavior:"smooth"});
  },0));
}

$("#file").addEventListener("change",e=>useFile(e.target.files[0]));
for(const event of ["dragenter","dragover"])$("#dropzone").addEventListener(event,e=>{e.preventDefault();e.currentTarget.classList.add("drag")});
for(const event of ["dragleave","drop"])$("#dropzone").addEventListener(event,e=>{e.preventDefault();e.currentTarget.classList.remove("drag");if(event==="drop")useFile(e.dataTransfer.files[0])});
$("#boardTop").addEventListener("input",e=>{boardRect.y=Number(e.target.value);updateCropLine()});
$("#boardTop").addEventListener("change",parseImage);$("#cellLetter").addEventListener("input",updateCell);$("#cellPremium").addEventListener("change",updateCell);$("#cellBlank").addEventListener("change",updateCell);
$("#clearCell").addEventListener("click",()=>{if(!selected)return;board[selected.r][selected.c]={letter:"",premium:"NONE",blank:false,confidence:1};selectCell(selected.r,selected.c)});
$("#rack").addEventListener("input",e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z?]/g,"").slice(0,7));$("#solve").addEventListener("click",runSolver);
window.addEventListener("resize",updateCropLine);

async function consumeSharedScreenshot(){
  const query=new URLSearchParams(location.search);
  if(!query.has("share-target")&&!query.has("share-error"))return;
  if(query.has("share-error")){alert("The shared item was not a supported screenshot.");history.replaceState({},"",location.pathname);return;}
  try{
    const cache=await caches.open("wordfeud-shared-v1");
    const key=new URL("./__shared_screenshot__",location.href).href;
    const response=await cache.match(key);
    if(!response)throw new Error("The shared screenshot could not be found.");
    const blob=await response.blob();await cache.delete(key);
    history.replaceState({},"",location.pathname);
    await useFile(blob);
  }catch(error){alert(error.message);}
}

async function initializePwa(){
  const button=$("#installApp");
  const standalone=matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
  if(standalone)button.hidden=true;
  window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();installPrompt=event;button.hidden=false;});
  window.addEventListener("appinstalled",()=>{installPrompt=null;button.hidden=true;});
  button.addEventListener("click",async()=>{
    if(installPrompt){await installPrompt.prompt();await installPrompt.userChoice;return;}
    alert("Open your browser menu (or the Share menu on iPhone), then choose ‘Add to Home Screen’ or ‘Install app’. The app must be served over HTTPS.");
  });
  if("serviceWorker" in navigator){
    try{await navigator.serviceWorker.register("./sw.js");await navigator.serviceWorker.ready;}
    catch(error){console.warn("PWA service worker registration failed",error);}
  }
  await consumeSharedScreenshot();
}

loadDictionary();initializePwa();
