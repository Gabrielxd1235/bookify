import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve('src');
let checked=0,errors=0;
function inspect(directory) {
  for (const entry of fs.readdirSync(directory,{withFileTypes:true})) {
    const full=path.join(directory,entry.name);
    if(entry.isDirectory())inspect(full);
    else if(/\.(js|jsx)$/.test(entry.name)) {
      checked++;
      const code=fs.readFileSync(full,'utf8');
      for(const match of code.matchAll(/\bfrom\s+['"](\.[^'"]+)['"]/g)) {
        const target=path.resolve(path.dirname(full),match[1]);
        if(!fs.existsSync(target)) {console.error(`Missing import: ${full} -> ${match[1]}`);errors++;}
      }
      if(/(?:SUPABASE_SECRET_KEY|JWT_SECRET)\s*=/.test(code)) {console.error(`Private secret variable detected: ${full}`);errors++;}
    }
  }
}
inspect(root);
console.log(`Checked ${checked} source files. Missing imports or unsafe assignments: ${errors}.`);
if(errors)process.exit(1);
