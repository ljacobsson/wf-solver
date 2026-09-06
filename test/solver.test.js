import test from "node:test";
import assert from "node:assert/strict";
import { buildTrie, makeBoard, solve } from "../src/solver.js";
import { locateBoardData, locateRackTiles } from "../src/vision.js";

test("finds and scores an opening word through the center", () => {
  const board=makeBoard(); board[7][7].premium="DW";
  const plays=solve(board,"CAB",buildTrie(["CAB","AB"]));
  const cab=plays.find(x=>x.word==="CAB");
  assert.ok(cab); assert.equal(cab.score,18); assert.ok(cab.placed.some(x=>x.r===7&&x.c===7));
});

test("validates and scores a cross-word", () => {
  const board=makeBoard();
  board[6][6].letter="A"; board[8][6].letter="T";
  board[7][7].letter="A"; board[7][8].letter="N"; board[7][6].premium="TL";
  const plays=solve(board,"C",buildTrie(["CAN","ACT"]));
  const play=plays.find(x=>x.word==="CAN" && x.direction==="H");
  assert.ok(play); assert.equal(play.score,28); // CAN 4*3+1+1 + ACT 1+4*3+1
});

test("rejects an invalid cross-word", () => {
  const board=makeBoard(); board[6][7].letter="X"; board[7][8].letter="N";
  const plays=solve(board,"C",buildTrie(["CAN"]));
  assert.equal(plays.length,0);
});

test("blank scores zero and seven tiles receive 40", () => {
  const board=makeBoard();
  const plays=solve(board,"?BCDEFG",buildTrie(["ABCDEFG"]));
  assert.equal(plays[0].score,58); // B4+C4+D2+E1+F4+G3 + blank A + 40
});

test("locates an inset board independently of screenshot pixel ratio", () => {
  const width=300,height=603,x0=4,y0=166,size=292,cell=size/15;
  const pixels=new Uint8ClampedArray(width*height*4);
  for(let i=0;i<pixels.length;i+=4){pixels[i]=50;pixels[i+1]=55;pixels[i+2]=60;pixels[i+3]=255;}
  for(let y=y0;y<y0+size;y++)for(let x=x0;x<x0+size;x++){
    const dx=(x-x0)%cell,dy=(y-y0)%cell;
    const gutter=dx<1.5||dx>cell-1.5||dy<1.5||dy>cell-1.5;
    const shade=gutter?12:35+((Math.floor((x-x0)/cell)+Math.floor((y-y0)/cell))%5)*8;
    const i=(y*width+x)*4;pixels[i]=shade;pixels[i+1]=shade;pixels[i+2]=shade;pixels[i+3]=255;
  }
  const found=locateBoardData({width,height,data:pixels});
  assert.ok(Math.abs(found.x-x0)<=2,JSON.stringify(found));
  assert.ok(Math.abs(found.y-y0)<=2,JSON.stringify(found));
  assert.ok(Math.abs(found.size-size)<=2,JSON.stringify(found));
});

test("rack detection ignores a Q descender crossing one scanline", () => {
  const width=300,height=603,pixels=new Uint8ClampedArray(width*height*4);
  for(let i=0;i<pixels.length;i+=4){pixels[i]=30;pixels[i+1]=35;pixels[i+2]=40;pixels[i+3]=255;}
  for(let tile=0;tile<7;tile++)for(let y=490;y<=550;y++)for(let x=5+tile*42;x<43+tile*42;x++){
    const i=(y*width+x)*4;pixels[i]=235;pixels[i+1]=232;pixels[i+2]=225;
  }
  // The old detector sampled close to the bottom, where this stroke divides Q.
  for(let y=540;y<=550;y++)for(let x=5+4*42+17;x<=5+4*42+21;x++){
    const i=(y*width+x)*4;pixels[i]=20;pixels[i+1]=20;pixels[i+2]=20;
  }
  const tiles=locateRackTiles({width,height,data:pixels},{x:0,y:100,size:300});
  assert.equal(tiles.length,7);
  assert.deepEqual(tiles.map(tile=>tile.x),[5,47,89,131,173,215,257]);
});
