const fs = require('fs');

// Patch types.ts
const typesFile = 'src/lib/tone3000/types.ts';
let typesContent = fs.readFileSync(typesFile, 'utf8');
const oldGear = /export enum Gear {[\s\S]*?Ir = 'ir',\n}/;
const newGear = `export enum Gear {
  Amp = 'amp',
  AmpHead = 'amp-head',
  FullRig = 'full-rig',
  AmpCab = 'amp-cab',
  Pedal = 'pedal',
  Outboard = 'outboard',
  Ir = 'ir',
  Cabinet = 'cabinet',
  Spaces = 'spaces',
  Experimental = 'experimental',
}`;
typesContent = typesContent.replace(oldGear, newGear);
fs.writeFileSync(typesFile, typesContent);

// Patch page.tsx
const pageFile = 'src/app/page.tsx';
let pageContent = fs.readFileSync(pageFile, 'utf8');

const oldGearLabel = /const gearLabel = \(gear: string\): string =>[\s\S]*?: 'Outboard';/;
const newGearLabel = `const gearLabel = (gear: string): string =>
  gear === 'full-rig' || gear === 'amp-cab' ? 'Amp + Cab'
    : gear === 'amp' || gear === 'amp-head' ? 'Amp Head'
    : gear === 'pedal' ? 'Pedal'
    : gear === 'ir' || gear === 'cabinet' ? 'Cabinet / IR'
    : gear === 'spaces' ? 'Spaces'
    : gear === 'experimental' ? 'Experimental'
    : 'Outboard';`;
pageContent = pageContent.replace(oldGearLabel, newGearLabel);

const oldGearFolder = /const gearFolder = \(gear: string\): string =>[\s\S]*?: 'Outboard';/;
const newGearFolder = `const gearFolder = (gear: string): string =>
  gear === 'full-rig' || gear === 'amp-cab' ? 'FullRig'
    : gear === 'amp' || gear === 'amp-head' ? 'Amps'
    : gear === 'pedal' ? 'Pedals'
    : gear === 'ir' || gear === 'cabinet' ? 'Cabinets_IRs'
    : gear === 'spaces' ? 'Spaces'
    : gear === 'experimental' ? 'Experimental'
    : 'Outboard';`;
pageContent = pageContent.replace(oldGearFolder, newGearFolder);

const oldFilters = /\{\[[\s\S]*?\{ id: '', label: 'All', icon: <Grid size=\{16\} \/> \},[\s\S]*?\{ id: 'ir', label: 'IR', icon: <Activity size=\{16\} \/> \}[\s\S]*?\]\.map\(cat => \(/;
const newFilters = `{[
              { id: '', label: 'All', icon: <Grid size={16} /> },
              { id: 'amp-cab', label: 'Amp + Cab', icon: <Server size={16} /> },
              { id: 'amp-head', label: 'Amp Head', icon: <Box size={16} /> },
              { id: 'cabinet', label: 'Cabinet', icon: <Activity size={16} /> },
              { id: 'pedal', label: 'Pedal', icon: <Sliders size={16} /> },
              { id: 'outboard', label: 'Outboard', icon: <Radio size={16} /> },
              { id: 'spaces', label: 'Spaces', icon: <Box size={16} /> },
              { id: 'experimental', label: 'Experimental', icon: <Activity size={16} /> }
            ].map(cat => (`;
pageContent = pageContent.replace(oldFilters, newFilters);

fs.writeFileSync(pageFile, pageContent);
console.log('Patched types.ts and page.tsx');
