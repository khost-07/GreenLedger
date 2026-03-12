const fs = require('fs');

let code = fs.readFileSync('src/App.tsx', 'utf-8');

// Replace `h-full w-full` or similar inside the divs directly following <GlassSurface>
code = code.replace(/<GlassSurface([^>]*)>\n<div className="([^"]*) h-full([^"]*)"/g, '<GlassSurface$1>\n<div className="$2$3"');
code = code.replace(/ h-full/g, ''); // Let's just remove all h-full since they were added artificially.
// Actually, earlier I might have had some valid h-full. Let's be safe.
// Let's just replace `w-full h-full"` with `w-full"` and ` h-full ` with ` ` inside App.tsx
// It's safe to drop h-full from the GlassSurface inner wrapper divs.

const newCode = code.replace(/(<GlassSurface[^>]*>\s*<div className="[^"]*) h-full([^"]*">)/g, '$1$2');

fs.writeFileSync('src/App.tsx', newCode);
console.log('App.tsx updated. Removed h-full from GlassSurface inner divs.');
