import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';

export async function POST(request: Request) {
  try {
    const downloadsPath = path.join('C:', 'Users', 'joaob', 'Downloads');
    const targetBasePath = path.join('C:', 'NAM-IR', 'NAM_Profiles');

    // Read files in Downloads
    const files = await fs.readdir(downloadsPath);
    const zipFiles = files.filter(f => f.toLowerCase().endsWith('.zip'));

    let importedCount = 0;
    const importedPacks = [];

    for (const zipFile of zipFiles) {
      const zipPath = path.join(downloadsPath, zipFile);
      const zipNameWithoutExt = path.parse(zipFile).name;
      
      try {
        const zip = new AdmZip(zipPath);
        const zipEntries = zip.getEntries();
        
        // Check if zip contains any .nam files
        const namEntries = zipEntries.filter(entry => 
          !entry.isDirectory && entry.entryName.toLowerCase().endsWith('.nam')
        );

        if (namEntries.length > 0) {
          // Categorization Logic based on Tone3000 API
          let category = 'Amps'; // default fallback
          const nameLower = zipNameWithoutExt.toLowerCase();

          try {
            const tone3000Res = await fetch('https://api.tone3000.com/rest/v1/rpc/search_tones_a2', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                query_term: zipNameWithoutExt,
                page_number: 1,
                page_size: 5,
                order_by: "best-match",
                architecture_filter: "2"
              })
            });

            if (tone3000Res.ok) {
              const items = await tone3000Res.json();
              if (items && items.length > 0) {
                const gear = items[0].gear;
                if (gear === 'full-rig') category = 'FullRig';
                else if (gear === 'pedal') category = 'Pedals';
                else if (gear === 'amp') category = 'Amps';
              } else {
                // Fallback heuristic if API finds nothing
                if (nameLower.includes('full') || nameLower.includes('rig') || nameLower.includes('combo') || nameLower.includes('cab')) category = 'FullRig';
                else if (nameLower.includes('pedal') || nameLower.includes('drive') || nameLower.includes('boost') || nameLower.includes('fuzz') || nameLower.includes('dist') || nameLower.includes('od')) category = 'Pedals';
              }
            }
          } catch (e) {
            console.error('Tone3000 API failed, using fallback.', e);
            if (nameLower.includes('full') || nameLower.includes('rig') || nameLower.includes('combo') || nameLower.includes('cab')) category = 'FullRig';
            else if (nameLower.includes('pedal') || nameLower.includes('drive') || nameLower.includes('boost') || nameLower.includes('fuzz') || nameLower.includes('dist') || nameLower.includes('od')) category = 'Pedals';
          }

          // Create target directory for this pack
          const packTargetDir = path.join(targetBasePath, category, zipNameWithoutExt);
          await fs.mkdir(packTargetDir, { recursive: true });

          // Extract files (we can extract all files or just .nam/.wav)
          // To keep it clean, let's extract .nam and .wav (IRs)
          for (const entry of zipEntries) {
            if (!entry.isDirectory) {
              const ext = path.extname(entry.entryName).toLowerCase();
              if (ext === '.nam' || ext === '.wav') {
                const targetFilePath = path.join(packTargetDir, path.basename(entry.entryName));
                await fs.writeFile(targetFilePath, entry.getData());
              }
            }
          }

          // Rename zip to prevent re-importing
          await fs.rename(zipPath, `${zipPath}.imported`);
          
          importedCount++;
          importedPacks.push({ name: zipNameWithoutExt, category, count: namEntries.length });
        }
      } catch (err) {
        console.error(`Error processing ${zipFile}:`, err);
      }
    }

    return NextResponse.json({ 
      success: true, 
      importedCount,
      importedPacks
    });

  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
