fetch('https://tone3000.com/search')
  .then(r => r.text())
  .then(html => {
    // Look for anything resembling gear strings, maybe from a JSON payload embedded in HTML
    const match = html.match(/\"gear\"\:\"(.*?)\"/g);
    if (match) {
      const gears = [...new Set(match)];
      console.log('Found gears in page:', gears);
    } else {
      console.log('No gear found in search page html');
    }
  });
