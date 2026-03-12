const fs = require('fs');

let code = fs.readFileSync('src/App.tsx', 'utf-8');

const regex = /<GlassSurface className="([^"]+)">([\s\S]*?)<\/GlassSurface>/g;

code = code.replace(regex, (match, className, innerContent) => {
  const classes = className.split(' ');
  const outer = [];
  const inner = [];

  for (const c of classes) {
    if (!c) continue;
    if (c.startsWith('w-') || c.startsWith('max-w-') || c.startsWith('h-') || c.startsWith('m') || 
        c === 'relative' || c === 'absolute' || c.startsWith('z-') || 
        c.startsWith('overflow-') || c.startsWith('rounded-') || 
        c.startsWith('shadow-') || c.startsWith('border-') || c === 'group' || 
        c === 'cursor-pointer' || c.startsWith('hover:')) {
      outer.push(c);
    } else {
      inner.push(c);
    }
  }

  if (!inner.includes('w-full')) inner.push('w-full');
  if (!inner.includes('h-full')) inner.push('h-full');

  return `<GlassSurface className="${outer.join(' ')}">
<div className="${inner.join(' ')}">${innerContent}</div>
</GlassSurface>`;
});

fs.writeFileSync('src/App.tsx', code);
console.log('App.tsx updated.');
