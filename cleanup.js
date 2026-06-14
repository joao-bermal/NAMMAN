const fs = require('fs');
const path = require('path');

const profilesDir = "C:\\NAM-IR\\NAM_Profiles";

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(filePath));
    } else if (filePath.endsWith('.nam')) {
      results.push(filePath);
    }
  });
  return results;
}

const allFiles = walk(profilesDir);

const groups = {};
for (const file of allFiles) {
  const dir = path.dirname(file);
  if (!groups[dir]) groups[dir] = [];
  groups[dir].push(file);
}

for (const dir in groups) {
  const files = groups[dir];
  const baseMap = {};
  
  for (const file of files) {
    const filename = path.basename(file);
    const match = filename.match(/^(.*?)_(\d+)\.nam$/);
    if (match) {
      const base = match[1] + ".nam";
      const idx = parseInt(match[2], 10);
      if (!baseMap[base]) baseMap[base] = [];
      baseMap[base].push({ file, index: idx });
    } else {
      if (!baseMap[filename]) baseMap[filename] = [];
      baseMap[filename].push({ file, index: 1 });
    }
  }
  
  for (const base in baseMap) {
    const list = baseMap[base];
    list.sort((a, b) => a.index - b.index);
    
    if (list.length > 1) {
      const keep = list[list.length - 1];
      
      for (let i = 0; i < list.length - 1; i++) {
        const del = list[i];
        console.log(`Deleting duplicate: ${del.file}`);
        fs.unlinkSync(del.file);
      }
      
      if (keep.index > 1) {
        const newName = path.join(dir, base);
        console.log(`Renaming kept file: ${keep.file} -> ${newName}`);
        fs.renameSync(keep.file, newName);
      }
    }
  }
}
