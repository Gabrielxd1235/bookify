import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
async function load(entry){const result=await build({entryPoints:[entry],bundle:true,jsx:'automatic',write:false,format:'cjs',platform:'node',external:['react','react-dom'],define:{'import.meta.env.VITE_API_URL':'"http://localhost:3000"'}});const module={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(require,module,module.exports);return module.exports;}
const router=await load('src/lib/router.jsx');
const ui=await load('src/components/UI.jsx');
function browser(){const calls=[];globalThis.window={scrollY:0,removeEventListener:()=>{},addEventListener:()=>{},location:{href:'http://localhost:5173/discover',origin:'http://localhost:5173',pathname:'/discover',search:'',hash:''},history:{pushState:(_,__,url)=>calls.push(['push',url]),replaceState:(_,__,url)=>calls.push(['replace',url])},dispatchEvent:()=>{},scrollTo:()=>{},matchMedia:()=>({matches:true})};globalThis.requestAnimationFrame=fn=>fn();globalThis.document={documentElement:{dataset:{}},getElementById:()=>({scrollIntoView:options=>calls.push(['scroll',options.behavior])})};return calls;}
test('internal navigation preserves queries',()=>{const calls=browser();router.navigate('/discover?category=2');assert.deepEqual(calls[0],['push','/discover?category=2']);});
test('navigation cannot redirect to a different origin',()=>{const calls=browser();router.navigate('https://example.com');assert.equal(calls.length,0);});
test('same destination does not duplicate browser history',()=>{const calls=browser();router.navigate('/discover');assert.equal(calls.length,0);});
test('anchor navigation respects reduced motion',()=>{const calls=browser();router.navigate('/#how-it-works');assert.deepEqual(calls.at(-1),['scroll','auto']);});
test('new-tab links retain browser behavior',()=>{browser();let prevented=false;router.Link({to:'/discover',target:'_blank',children:'Explore'}).props.onClick({button:0,preventDefault:()=>{prevented=true;}});assert.equal(prevented,false);});
test('external links retain browser behavior',()=>{browser();let prevented=false;router.Link({to:'https://example.com',children:'External'}).props.onClick({button:0,preventDefault:()=>{prevented=true;}});assert.equal(prevented,false);});
test('busy buttons expose state and prevent repeated submissions',()=>{const html=renderToStaticMarkup(React.createElement(ui.Button,{busy:true},'Save'));assert.match(html,/disabled=""/);assert.match(html,/aria-busy="true"/);});
test('filters expose their active choice to assistive technology',()=>{const html=renderToStaticMarkup(React.createElement(ui.Tabs,{items:[{value:'all',label:'All'},{value:'pending',label:'Pending'}],value:'all',onChange:()=>{}}));assert.match(html,/aria-pressed="true"/);assert.match(html,/tabindex="-1"/);});
test('confirmation dialog has accessible title and description',()=>{const html=renderToStaticMarkup(React.createElement(ui.Confirm,{open:true,title:'Cancel booking?',description:'Please confirm.',onCancel:()=>{},onConfirm:()=>{}}));assert.match(html,/aria-labelledby=/);assert.match(html,/aria-describedby=/);assert.match(html,/role="dialog"/);});
test('closed dialog does not render',()=>{assert.equal(renderToStaticMarkup(React.createElement(ui.Confirm,{open:false})), '');});

test('back links select the reverse animation',()=>{browser();router.navigate('/dashboard',false,{direction:'back'});assert.equal(document.documentElement.dataset.navigation,'back');});
test('view transitions run when supported and motion is enabled',async()=>{browser();window.matchMedia=()=>({matches:false});let invoked=0;document.startViewTransition=callback=>{invoked++;callback();return {finished:Promise.resolve(),skipTransition:()=>{}};};router.navigate('/dashboard');await Promise.resolve();assert.equal(invoked,1);delete document.startViewTransition;});
test('reduced motion bypasses native view transitions',()=>{browser();let invoked=0;document.startViewTransition=()=>{invoked++;};router.navigate('/dashboard');assert.equal(invoked,0);delete document.startViewTransition;});
test('browser Back restores reverse navigation state',()=>{browser();const handlers={};window.addEventListener=(name,handler)=>{handlers[name]=handler;};router.initializeRouter();router.navigate('/dashboard');handlers.popstate({state:{bookifyIndex:0}});assert.equal(document.documentElement.dataset.navigation,'back');});
const categories=await load('src/lib/categoryPresentation.js');
const {CategoryCard}=await load('src/components/CategoryCard.jsx');
test('five catalog categories have distinct images and meaningful icons',()=>{const themes=Object.values(categories.categoryThemes);assert.equal(new Set(themes.map(x=>x.image)).size,5);assert.equal(categories.categoryPresentation({name:'Gyms'}).icon,'dumbbell');});
test('Spanish category names display English presentation copy',()=>{assert.equal(categories.categoryPresentation({name:'Salones de belleza'}).title,'Beauty Salons');assert.equal(categories.categoryPresentation({name:'Centros de masajes'}).title,'Massage Centers');});
test('category card renders image, icon, label and the original API category id',()=>{browser();const html=renderToStaticMarkup(React.createElement(CategoryCard,{category:{id:4,name:'Gyms'}}));assert.match(html,/category=4/);assert.match(html,/images\/categories\/gym.jpg/);assert.match(html,/icon-dumbbell/);assert.match(html,/Gyms/);});
test('unknown categories remain navigable without a broken image',()=>{browser();const html=renderToStaticMarkup(React.createElement(CategoryCard,{category:{id:9,name:'Nail care'}}));assert.match(html,/Nail care/);assert.doesNotMatch(html,/<img/);});
