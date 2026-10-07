import fs from 'node:fs/promises';
const source='https://www.pindou.online/en/colors';
const html=await (await fetch(source)).text();
const colors=[...html.matchAll(/background-color:(#[0-9a-f]{6})[\s\S]*?<div class="sr-only">Mard_([A-Z]+\d+)<\/div>/gi)].map(([,hex,code])=>({code,name:`Mard ${code}`,hex:hex.toUpperCase()}));
if(colors.length!==221||new Set(colors.map(c=>c.code)).size!==221)throw new Error(`Expected 221 unique colors; received ${colors.length}. Source may have changed; review before importing.`);
colors.sort((a,b)=>a.code.localeCompare(b.code,'en',{numeric:true}));
await fs.mkdir('src/data',{recursive:true});
await fs.writeFile('src/data/mard.json',JSON.stringify({name:'Mard · 221 色对照',source,description:'来自 Pindou Online 的第三方 Mard 221 色对照，采集于 2026-10-07。不是品牌官方发布；实际颜色以实物为准。',colors},null,2)+'\n');
console.log(`Imported ${colors.length} verified color codes from ${source}`);
