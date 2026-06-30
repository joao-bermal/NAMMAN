const fs = require('fs');

const pageFile = 'src/app/page.tsx';
let pageContent = fs.readFileSync(pageFile, 'utf8');

const oldGearLabel = /const gearLabel = \(gear: string\): string =>[\s\S]*?: 'Outboard';/;
const newGearLabel = `const gearLabel = (gear: string): string => {
  if (!gear) return 'Unknown';
  const g = gear.toLowerCase();
  if (g === 'full-rig' || g === 'amp-cab' || g === 'amp_cab' || g === 'amp+cab') return 'Amp + Cab';
  if (g === 'amp' || g === 'amp-head' || g === 'amp_head') return 'Amp Head';
  if (g === 'pedal') return 'Pedal';
  if (g === 'ir' || g === 'cabinet' || g === 'cab') return 'Cabinet / IR';
  if (g === 'spaces' || g === 'space') return 'Spaces';
  if (g === 'experimental') return 'Experimental';
  if (g === 'outboard') return 'Outboard';
  
  // Dynamic fallback: title case the unknown string
  return g.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
};`;
pageContent = pageContent.replace(oldGearLabel, newGearLabel);

const oldGearFolder = /const gearFolder = \(gear: string\): string =>[\s\S]*?: 'Outboard';/;
const newGearFolder = `const gearFolder = (gear: string): string => {
  if (!gear) return 'Unknown';
  const g = gear.toLowerCase();
  if (g === 'full-rig' || g === 'amp-cab' || g === 'amp_cab' || g === 'amp+cab') return 'Amp_and_Cab';
  if (g === 'amp' || g === 'amp-head' || g === 'amp_head') return 'Amps';
  if (g === 'pedal') return 'Pedals';
  if (g === 'ir' || g === 'cabinet' || g === 'cab') return 'Cabinets_IRs';
  if (g === 'spaces' || g === 'space') return 'Spaces';
  if (g === 'experimental') return 'Experimental';
  if (g === 'outboard') return 'Outboard';
  
  // Dynamic fallback
  return g.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('_');
};`;
pageContent = pageContent.replace(oldGearFolder, newGearFolder);

fs.writeFileSync(pageFile, pageContent);
console.log('Patched robust gear mapping in page.tsx');
