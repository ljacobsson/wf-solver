import { assessOpponentRisk, buildTrie, makeBoard, scoreBreakdown, solve, VALUES } from "./src/solver.js";
import { locateBoard, readScreenshot } from "./src/vision.js";
import { randomLoadingQuote } from "./src/loading-quotes.js";

window.__APP_STARTED__=true;

const $=s=>document.querySelector(s);
let board=makeBoard(), trie=null, selected=null, sourceImage=null, boardRect=null;
let installPrompt=null, lastQuote="";

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

function renderBoard(placements=[],animate=false) {
  const el=$("#board"), proposed=new Map(placements.map((p,index)=>[`${p.r},${p.c}`,{...p,index}])); el.replaceChildren();
  for(let r=0;r<15;r++) for(let c=0;c<15;c++) {
    const cell=board[r][c],proposal=proposed.get(`${r},${c}`),letter=proposal?.letter||cell.letter,blank=proposal?.blank||cell.blank,b=document.createElement("button"); b.className="cell";
    if(letter)b.classList.add("tile"); if(blank)b.classList.add("blank"); if(!proposal&&cell.confidence<.45)b.classList.add("low");
    if(selected?.r===r&&selected?.c===c)b.classList.add("selected");
    if(proposal){b.classList.add("proposal");if(animate)b.classList.add("placing");b.style.setProperty("--place-order",proposal.index);}
    b.dataset.premium=cell.premium; b.title=`${String.fromCharCode(65+c)}${r+1} · ${cell.letter||cell.premium||"empty"}`;
    b.innerHTML=letter ? `${letter}<small>${blank?0:VALUES[letter]??""}</small>` : (cell.premium==="NONE"?"":`<small>${cell.premium}</small>`);
    b.addEventListener("click",()=>selectCell(r,c)); el.append(b);
  }
}

function selectCell(r,c) {
  selected={r,c}; const cell=board[r][c];
  $(".inspector").classList.add("open");
  $("#coordinate").textContent=`${String.fromCharCode(65+c)}${r+1} · row ${r+1}, column ${c+1}`;
  $("#cellLetter").value=cell.letter; $("#cellPremium").value=cell.premium; $("#cellBlank").checked=cell.blank; renderBoard();
}

function updateCell() {
  if(!selected)return; const cell=board[selected.r][selected.c];
  cell.letter=$("#cellLetter").value.toUpperCase().replace(/[^A-Z]/g,"").slice(0,1);cell.premium=$("#cellPremium").value;cell.blank=$("#cellBlank").checked&&!!cell.letter;cell.confidence=1;renderBoard();
}

async function useFile(file) {
  if(!file)return;
  setLoading(true);
  const img=$("#preview"),objectUrl=URL.createObjectURL(file);
  try{
    img.src=objectUrl;await img.decode();sourceImage=img;boardRect=locateBoard(img);parseImage();
    await dictionaryReady;await runSolver();
  }catch(error){alert(`Could not read this screenshot: ${error.message}`);}
  finally{URL.revokeObjectURL(objectUrl);setLoading(false);}
}

function parseImage() {
  const result=readScreenshot(sourceImage,boardRect);board=result.board;$("#rack").value=result.rack;
  selected=null;$(".inspector").classList.remove("open");$(".upload-panel").classList.add("hidden");$("#workspace").classList.remove("hidden");document.body.classList.add("has-board");renderBoard();
}

async function runSolver() {
  const results=$("#results"); $("#resultsPanel").classList.remove("hidden");
  if(!trie){results.innerHTML="<div class='error'>SOWPODS is not loaded. Connect once to download it, or choose a local sowpods.txt file in the dictionary badge above.</div>";return [];}
  const rack=$("#rack").value.toUpperCase().replace(/[^A-Z?]/g,"");if(!rack.length){results.innerHTML="<div class='error'>Enter the letters on your rack first.</div>";return [];}
  $("#solve").disabled=true;$("#solve").textContent="Searching…";
  await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
  const start=performance.now();let plays=[];
  try{
    plays=solve(board,rack,trie,30);const elapsed=performance.now()-start;$("#timing").textContent=`${plays.length} moves · ${Math.round(elapsed)} ms`;
    if(!plays.length){results.innerHTML="<div class='error'>No legal moves found. Check any red ? markers on the board and verify the rack.</div>";return plays;}
    results.replaceChildren(...plays.map((play,index)=>{
      const risk=assessOpponentRisk(board,play),riskBadge=risk.level==="none"?"":` <span class='risk risk-${risk.level}' title='${risk.detail}'>⚠ ${risk.label}</span>`;
      const el=document.createElement("button");el.className="result";el.innerHTML=`<span class='score'>${play.score}</span><span><span class='word'>${play.word}</span>${riskBadge}<br><span class='meta'>${scoreBreakdown(play)}${play.bingo?" · +40 bingo":""}${play.crossScore?` · ${play.crossScore} cross points`:""}${risk.detail?` · ${risk.detail}`:""}</span></span><span class='placement'>${play.placed.map(p=>`${String.fromCharCode(65+p.c)}${p.r+1}=${p.letter}${p.blank?"*":""}`).join(" ")}</span>`;
      el.addEventListener("click",async()=>{document.querySelectorAll(".result.active").forEach(item=>item.classList.remove("active"));el.classList.add("active");$("#board").scrollIntoView({behavior:"smooth",block:"center"});await new Promise(resolve=>setTimeout(resolve,260));renderBoard(play.placed,true);});if(index===0)el.setAttribute("aria-label","Best move");return el;
    }));
    renderBoard();return plays;
  }catch(error){results.innerHTML=`<div class='error'>${error.message}</div>`;return plays;}
  finally{$("#solve").disabled=false;$("#solve").textContent="Find best moves";}
}

function showLoadingQuote(quote){
  lastQuote=quote;
  const first=quote.match(/[A-Za-z]+/),word=(first?.[0]||"SCORE").toUpperCase();
  const tiles=$("#loadingTiles");tiles.style.setProperty("--n",word.length);
  tiles.innerHTML=[...word].map((letter,i)=>`<span style="--i:${i}">${letter}<small>${VALUES[letter]??1}</small></span>`).join("");
  $("#loadingQuote").textContent=first?quote.slice(first.index+first[0].length).trimStart():quote;
}

function setLoading(active){
  const root=document.documentElement,wasLoading=root.classList.contains("is-loading");
  if(active&&!wasLoading)showLoadingQuote(randomLoadingQuote());
  if(!active&&wasLoading&&lastQuote)$("#headline").textContent=lastQuote;
  root.classList.toggle("is-loading",active);if(!active)root.classList.remove("receiving-share");
}

$("#file").addEventListener("change",e=>useFile(e.target.files[0]));
for(const event of ["dragenter","dragover"])$("#dropzone").addEventListener(event,e=>{e.preventDefault();e.currentTarget.classList.add("drag")});
for(const event of ["dragleave","drop"])$("#dropzone").addEventListener(event,e=>{e.preventDefault();e.currentTarget.classList.remove("drag");if(event==="drop")useFile(e.dataTransfer.files[0])});
$("#cellLetter").addEventListener("input",updateCell);$("#cellPremium").addEventListener("change",updateCell);$("#cellBlank").addEventListener("change",updateCell);
$("#clearCell").addEventListener("click",()=>{if(!selected)return;board[selected.r][selected.c]={letter:"",premium:"NONE",blank:false,confidence:1};selectCell(selected.r,selected.c)});
$("#closeInspector").addEventListener("click",()=>{selected=null;$(".inspector").classList.remove("open");renderBoard();});
$("#rack").addEventListener("input",e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z?]/g,"").slice(0,7));$("#solve").addEventListener("click",runSolver);

async function consumeSharedScreenshot(){
  const query=new URLSearchParams(location.search);
  if(!query.has("share-target")&&!query.has("share-error"))return;
  if(query.has("share-error")){
    const reason=query.get("reason")||"unknown",messages={
      "missing-file":"Android opened the app but did not include the shared image.",
      "empty-file":"Android shared an empty image file.",
      "file-too-large":"The shared screenshot was larger than the 30 MB limit.",
      "unknown":"The shared screenshot could not be received."
    };
    const message=reason.startsWith("unsupported-format:")
      ?`Android shared the screenshot in an unsupported format (${reason.slice(19)}).`
      :(messages[reason]||`The shared screenshot could not be received (${reason}).`);
    setLoading(false);alert(message);history.replaceState({},"",location.pathname);return;
  }
  try{
    const cache=await caches.open("wordfeud-shared-v1");
    const key=new URL("./__shared_screenshot__",location.href).href;
    const response=await cache.match(key);
    if(!response)throw new Error("The shared screenshot could not be found.");
    const blob=await response.blob();await cache.delete(key);
    history.replaceState({},"",location.pathname);
    await useFile(blob);
  }catch(error){setLoading(false);alert(error.message);}
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
    try{await navigator.serviceWorker.register("./sw.js",{updateViaCache:"none"});await navigator.serviceWorker.ready;}
    catch(error){console.warn("PWA service worker registration failed",error);}
  }
  await consumeSharedScreenshot();
}

const dictionaryReady=loadDictionary();
if(document.documentElement.classList.contains("receiving-share"))setLoading(true);
initializePwa();
