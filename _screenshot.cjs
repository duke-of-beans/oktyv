/**
 * Oktyv screenshot helper
 * Reads the last browser_screenshot tool result and saves it as a PNG.
 * Usage: node _screenshot.cjs [output_path]
 * Output defaults to D:\Dev\oktyv\screenshots\latest.png
 */
const fs = require('fs');
const path = require('path');

const toolResultsDir = process.env.TOOL_RESULTS_DIR || 
  path.join(process.env.USERPROFILE || 'C:/Users/DKdKe', 'AppData/Roaming/Claude/tool_results');

const outPath = process.argv[2] || 'D:/Dev/oktyv/screenshots/latest.png';

// Find the most recent Oktyv screenshot result
const files = fs.readdirSync(toolResultsDir)
  .filter(f => f.includes('browser_screenshot'))
  .map(f => ({ f, t: fs.statSync(path.join(toolResultsDir, f)).mtimeMs }))
  .sort((a, b) => b.t - a.t);

if (!files.length) {
  console.error('No screenshot results found in', toolResultsDir);
  process.exit(1);
}

const latest = path.join(toolResultsDir, files[0].f);
const d = JSON.parse(fs.readFileSync(latest, 'utf8'));
const text = JSON.parse(d[0].text);
const imgData = text.result.image;
const bytes = Buffer.from(imgData.split(',').map(Number));

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, bytes);
console.log('Saved', bytes.length, 'bytes to', outPath);
