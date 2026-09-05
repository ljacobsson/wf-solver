export const SIZE = 15;
export const VALUES = Object.freeze({A:1,B:4,C:4,D:2,E:1,F:4,G:3,H:4,I:1,J:10,K:5,L:1,M:3,N:1,O:1,P:4,Q:10,R:1,S:1,T:1,U:2,V:4,W:4,X:8,Y:4,Z:10});
export const PREMIUM = Object.freeze({ NONE:[1,1], DL:[2,1], TL:[3,1], DW:[1,2], TW:[1,3] });

export function makeBoard() {
  return Array.from({length: SIZE}, () => Array.from({length: SIZE}, () => ({ letter:"", premium:"NONE", blank:false })));
}

export function buildTrie(words) {
  const root = { next: Object.create(null), word:false };
  let count = 0;
  for (let raw of words) {
    const word = raw.trim().toUpperCase();
    if (!/^[A-Z]{1,15}$/.test(word)) continue;
    let node = root;
    for (const ch of word) node = node.next[ch] ||= { next:Object.create(null), word:false };
    if (!node.word) { node.word = true; count++; }
  }
  root.count = count;
  return root;
}

const inside = (r,c) => r >= 0 && c >= 0 && r < SIZE && c < SIZE;
const get = (board,r,c) => inside(r,c) ? board[r][c] : null;
const tileValue = (cell) => cell.blank ? 0 : VALUES[cell.letter] || 0;

function perpendicularWord(board, r, c, letter, blank, dr, dc) {
  const pr = dc, pc = dr;
  let rr=r-pr, cc=c-pc, before=[];
  while (get(board,rr,cc)?.letter) { before.unshift(get(board,rr,cc)); rr-=pr; cc-=pc; }
  rr=r+pr; cc=c+pc; const after=[];
  while (get(board,rr,cc)?.letter) { after.push(get(board,rr,cc)); rr+=pr; cc+=pc; }
  if (!before.length && !after.length) return null;
  const text = before.map(x=>x.letter).join("") + letter + after.map(x=>x.letter).join("");
  const [lm,wm] = PREMIUM[board[r][c].premium] || PREMIUM.NONE;
  const score = (before.reduce((n,x)=>n+tileValue(x),0) + (blank ? 0 : VALUES[letter])*lm + after.reduce((n,x)=>n+tileValue(x),0))*wm;
  return { text, score };
}

function lookup(trie, word) {
  let n=trie;
  for (const ch of word) { n=n.next[ch]; if (!n) return false; }
  return !!n.word;
}

export function solve(board, rackText, trie, limit=100) {
  const rack = Object.create(null);
  for (const ch of rackText.toUpperCase().replace(/[^A-Z?]/g,"")) rack[ch]=(rack[ch]||0)+1;
  const rackSize = Object.values(rack).reduce((a,b)=>a+b,0);
  const occupied = board.some(row=>row.some(cell=>cell.letter));
  const results = new Map();

  for (const [dr,dc,direction] of [[0,1,"H"],[1,0,"V"]]) {
    for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++) {
      if (get(board,r-dr,c-dc)?.letter) continue;
      const placed=[];
      const walk = (rr,cc,node,text,base,wordMult,crossScore,connected) => {
        if (node.word && placed.length && (!inside(rr,cc) || !get(board,rr,cc).letter)) {
          const coversCenter = placed.some(p=>p.r===7 && p.c===7);
          if ((occupied && connected) || (!occupied && coversCenter)) {
            const score = base*wordMult + crossScore + (placed.length===7 && rackSize===7 ? 40 : 0);
            const key = placed.map(p=>`${p.r},${p.c},${p.letter}`).join(";");
            const play = { word:text, row:r, col:c, direction, score, placed:placed.map(x=>({...x})), bingo:placed.length===7, crossScore };
            if (!results.has(key) || results.get(key).score < score) results.set(key,play);
          }
        }
        if (!inside(rr,cc)) return;
        const cell=board[rr][cc];
        if (cell.letter) {
          const child=node.next[cell.letter];
          if (child) walk(rr+dr,cc+dc,child,text+cell.letter,base+tileValue(cell),wordMult,crossScore,true);
          return;
        }
        for (const letter of Object.keys(node.next)) {
          const cross=perpendicularWord(board,rr,cc,letter,false,dr,dc);
          if (cross && !lookup(trie,cross.text)) continue;
          for (const blank of [false,true]) {
            const token=blank?"?":letter;
            if (!rack[token]) continue;
            rack[token]--;
            const [lm,wm]=PREMIUM[cell.premium]||PREMIUM.NONE;
            placed.push({r:rr,c:cc,letter,blank});
            walk(rr+dr,cc+dc,node.next[letter],text+letter,base+(blank?0:VALUES[letter])*lm,wordMult*wm,crossScore+(cross?perpendicularWord(board,rr,cc,letter,blank,dr,dc).score:0),connected||!!cross);
            placed.pop(); rack[token]++;
          }
        }
      };
      walk(r,c,trie,"",0,1,0,false);
    }
  }
  return [...results.values()].sort((a,b)=>b.score-a.score || a.word.localeCompare(b.word) || a.row-b.row || a.col-b.col).slice(0,limit);
}

export function scoreBreakdown(play) {
  return `${play.word} · ${play.direction === "H" ? "across" : "down"} · row ${play.row+1}, column ${play.col+1}`;
}
