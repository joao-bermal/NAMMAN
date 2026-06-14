const fs = require('fs');
const path = require('path');

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

const profilesDir = "C:\\NAM-IR\\NAM_Profiles";
const allFiles = walk(profilesDir);

let count = 0;
for (const file of allFiles) {
  if (file.endsWith('_2.nam')) {
    const baseFile = file.slice(0, -6) + '.nam';
    if (fs.existsSync(baseFile)) {
      console.log(`Found duplicate pair:\n  A1 (to delete): ${baseFile}\n  A2 (to keep/rename): ${file}`);
      
      // Delete A1
      try {
        fs.unlinkSync(baseFile);
        console.log(`  -> Deleted A1`);
      } catch (e) {
        console.error(`  -> Failed to delete A1:`, e.message);
        continue;
      }
      
      // Rename A2 to A1's name
      try {
        fs.renameSync(file, baseFile);
        console.log(`  -> Renamed A2 to base name`);
        count++;
      } catch (e) {
        console.error(`  -> Failed to rename A2:`, e.message);
      }
    } else {
       console.log(`Found _2.nam but no base file: ${file}`);
       // Just rename it to base if base doesn't exist!
       try {
           fs.renameSync(file, baseFile);
           console.log(`  -> Renamed to base name (base didn't exist)`);
           count++;
       } catch(e) {
           console.error(`  -> Failed to rename:`, e.message);
       }
    }
  }
}

console.log(`Successfully cleaned ${count} duplicate pairs.`);
