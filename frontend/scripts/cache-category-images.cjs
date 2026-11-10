// Cache the editorial category photos locally. Existing custom photos are preserved.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const photos={barber:'photo-1503951914875-452162b0f3f1',beauty:'photo-1562322140-8baeececf3df',gym:'photo-1728486145245-d4cb0c9c3470',massage:'photo-1519823551278-64ac92734fb1',spa:'photo-1540555700478-4be289fbecef'};
const folder=path.join(root,'public','images','categories');
fs.mkdirSync(folder,{recursive:true});
Promise.all(Object.entries(photos).map(async([name,id])=>{
  const file=path.join(folder,name+'.jpg');if(fs.existsSync(file)){console.log('Keeping existing category photo: '+name);return;}
  try{
    const response=await fetch('https://images.unsplash.com/'+id+'?fm=jpg&fit=crop&w=720&q=82',{signal:AbortSignal.timeout(12000)});
    if(!response.ok||!response.headers.get('content-type')?.startsWith('image/'))throw Error('Image unavailable');
    const bytes=Buffer.from(await response.arrayBuffer());
    if(bytes.length<1000||bytes.length>5*1024*1024||bytes[0]!==255||bytes[1]!==216)throw Error('Invalid JPEG response');
    fs.writeFileSync(file,bytes,{flag:'wx'});console.log('Category photo saved: '+name);
  }catch{console.log('Could not cache '+name+'. The card will use its online image or gradient fallback.');}
})).catch(error=>{console.error(error.message);process.exitCode=1;});
