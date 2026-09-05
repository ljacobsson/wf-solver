import { mkdir, writeFile } from "node:fs/promises";

const url="https://raw.githubusercontent.com/kamilmielnik/scrabble-dictionaries/master/english/sowpods.txt";
const response=await fetch(url);
if(!response.ok) throw new Error(`Dictionary download failed: HTTP ${response.status}`);
const text=await response.text();
if(text.split(/\s+/).length<100000) throw new Error("Downloaded file does not look like SOWPODS");
await mkdir("data",{recursive:true});
await writeFile("data/sowpods.txt",text);
console.log(`Saved data/sowpods.txt (${text.split(/\s+/).length.toLocaleString()} entries)`);
