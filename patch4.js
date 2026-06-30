const fs = require('fs');

const pageFile = 'src/app/page.tsx';
let pageContent = fs.readFileSync(pageFile, 'utf8');

const oldGearLabel = /const gearLabel = \(gear: string\): string => \{[\s\S]*?\n\};/;
const newGearLabel = `const gearLabel = (tone: Tone): string => {
  let g = tone.gear?.toLowerCase() || 'unknown';
  
  // If it's outboard, check tags for a more specific category
  if (g === 'outboard' && tone.tags) {
    const tagNames = tone.tags.map(t => t.name.toLowerCase());
    if (tagNames.some(t => t.includes('amp-cab') || t.includes('full-rig'))) g = 'amp-cab';
    else if (tagNames.some(t => t.includes('amp'))) g = 'amp-head';
    else if (tagNames.some(t => t.includes('cab') || t.includes('ir'))) g = 'cabinet';
    else if (tagNames.some(t => t.includes('pedal'))) g = 'pedal';
    else if (tagNames.some(t => t.includes('space'))) g = 'spaces';
    else if (tagNames.some(t => t.includes('experimental'))) g = 'experimental';
  }

  if (g === 'full-rig' || g === 'amp-cab' || g === 'amp_cab' || g === 'amp+cab') return 'Amp + Cab';
  if (g === 'amp' || g === 'amp-head' || g === 'amp_head') return 'Amp Head';
  if (g === 'pedal') return 'Pedal';
  if (g === 'ir' || g === 'cabinet' || g === 'cab') return 'Cabinet / IR';
  if (g === 'spaces' || g === 'space') return 'Spaces';
  if (g === 'experimental') return 'Experimental';
  if (g === 'outboard') return 'Outboard';
  if (g === 'unknown') return 'Unknown';
  
  return g.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
};`;
pageContent = pageContent.replace(oldGearLabel, newGearLabel);

const oldGearFolder = /const gearFolder = \(gear: string\): string => \{[\s\S]*?\n\};/;
const newGearFolder = `const gearFolder = (tone: Tone): string => {
  let g = tone.gear?.toLowerCase() || 'unknown';
  
  if (g === 'outboard' && tone.tags) {
    const tagNames = tone.tags.map(t => t.name.toLowerCase());
    if (tagNames.some(t => t.includes('amp-cab') || t.includes('full-rig'))) g = 'amp-cab';
    else if (tagNames.some(t => t.includes('amp'))) g = 'amp-head';
    else if (tagNames.some(t => t.includes('cab') || t.includes('ir'))) g = 'cabinet';
    else if (tagNames.some(t => t.includes('pedal'))) g = 'pedal';
    else if (tagNames.some(t => t.includes('space'))) g = 'spaces';
    else if (tagNames.some(t => t.includes('experimental'))) g = 'experimental';
  }

  if (g === 'full-rig' || g === 'amp-cab' || g === 'amp_cab' || g === 'amp+cab') return 'Amp_and_Cab';
  if (g === 'amp' || g === 'amp-head' || g === 'amp_head') return 'Amps';
  if (g === 'pedal') return 'Pedals';
  if (g === 'ir' || g === 'cabinet' || g === 'cab') return 'Cabinets_IRs';
  if (g === 'spaces' || g === 'space') return 'Spaces';
  if (g === 'experimental') return 'Experimental';
  if (g === 'outboard') return 'Outboard';
  if (g === 'unknown') return 'Unknown';
  
  return g.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('_');
};`;
pageContent = pageContent.replace(oldGearFolder, newGearFolder);

// Update calls to gearLabel and gearFolder
pageContent = pageContent.replace(/gearLabel\(tone\.gear\)/g, 'gearLabel(tone)');
pageContent = pageContent.replace(/gearFolder\(tone\.gear\)/g, 'gearFolder(tone)');

fs.writeFileSync(pageFile, pageContent);
console.log('Patched tags-based fallback');
