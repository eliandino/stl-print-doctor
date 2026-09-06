import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const state = { mesh:null, original:null, fileName:'model.stl', analysis:null, issueLines:null, repaired:false };
const host = $('#canvasHost');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, .1, 10000);
camera.position.set(210,170,210);
const renderer = new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,alpha:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
host.append(renderer.domElement);
const controls = new OrbitControls(camera,renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = .08;
scene.add(new THREE.HemisphereLight(0xffffff,0x283342,2.4));
const key = new THREE.DirectionalLight(0xffffff,3.2); key.position.set(120,200,160); scene.add(key);
const bed = new THREE.GridHelper(256,16,0x4c5d67,0x28333b); bed.position.y=-.05; scene.add(bed);
const bedOutline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(256,.5,256)),new THREE.LineBasicMaterial({color:0x62e6c2,transparent:true,opacity:.65})); bedOutline.position.y=-.25; scene.add(bedOutline);

function resize(){ const r=host.getBoundingClientRect(); renderer.setSize(r.width,r.height,false); camera.aspect=r.width/r.height; camera.updateProjectionMatrix(); }
new ResizeObserver(resize).observe(host);
renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera)});

function toast(message){const t=$('#toast');t.textContent=message;t.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove('show'),2600)}
function format(n,d=1){return Number(n).toLocaleString(undefined,{maximumFractionDigits:d})}
function keyFor(x,y,z,tol=1e-5){return `${Math.round(x/tol)},${Math.round(y/tol)},${Math.round(z/tol)}`}

function analyzeGeometry(geometry){
  const p=geometry.getAttribute('position'), triCount=Math.floor(p.count/3), vertices=[], map=new Map(), faces=[], edgeMap=new Map(), duplicates=new Set();
  let area=0, signedVolume=0, degenerate=0, duplicate=0;
  const getIndex=(v)=>{const k=keyFor(v.x,v.y,v.z);if(!map.has(k)){map.set(k,vertices.length);vertices.push(v.clone())}return map.get(k)};
  for(let i=0;i<triCount;i++){
    const a=new THREE.Vector3().fromBufferAttribute(p,i*3),b=new THREE.Vector3().fromBufferAttribute(p,i*3+1),c=new THREE.Vector3().fromBufferAttribute(p,i*3+2);
    const ia=getIndex(a),ib=getIndex(b),ic=getIndex(c), cross=new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a));
    const ar=cross.length()/2; area+=ar; signedVolume+=a.dot(new THREE.Vector3().crossVectors(b,c))/6;
    if(ar<1e-8||ia===ib||ib===ic||ia===ic)degenerate++;
    const faceKey=[ia,ib,ic].sort((x,y)=>x-y).join(':'); if(duplicates.has(faceKey))duplicate++; else duplicates.add(faceKey);
    faces.push([ia,ib,ic]);
    for(const [u,v] of [[ia,ib],[ib,ic],[ic,ia]]){const ek=u<v?`${u}:${v}`:`${v}:${u}`;if(!edgeMap.has(ek))edgeMap.set(ek,{count:0,u,v});edgeMap.get(ek).count++}
  }
  const boundary=[...edgeMap.values()].filter(e=>e.count===1), nonmanifold=[...edgeMap.values()].filter(e=>e.count>2);
  const parent=Array.from({length:faces.length},(_,i)=>i),find=x=>parent[x]===x?x:(parent[x]=find(parent[x])),union=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent[b]=a};
  const edgeFace=new Map();faces.forEach((f,fi)=>{for(const [u,v] of [[f[0],f[1]],[f[1],f[2]],[f[2],f[0]]]){const ek=u<v?`${u}:${v}`:`${v}:${u}`;if(edgeFace.has(ek))union(fi,edgeFace.get(ek));else edgeFace.set(ek,fi)}});
  const shells=new Set(faces.map((_,i)=>find(i))).size;
  return {triCount,vertices,faces,edgeMap,boundary,nonmanifold,degenerate,duplicate,area,volume:Math.abs(signedVolume),signedVolume,shells};
}

function makeIssueLines(analysis){
  if(state.issueLines){state.issueLines.parent?.remove(state.issueLines);state.issueLines.geometry.dispose()}
  const pts=[];for(const e of [...analysis.boundary,...analysis.nonmanifold])pts.push(analysis.vertices[e.u],analysis.vertices[e.v]);
  const g=new THREE.BufferGeometry().setFromPoints(pts);state.issueLines=new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:0xff5b65,depthTest:false}));state.issueLines.renderOrder=4;state.issueLines.visible=false;state.mesh.add(state.issueLines);
}

function updateBed(){const dims=$('#printerSelect').value.split(',').map(Number);bed.scale.set(dims[0]/256,1,dims[1]/256);bedOutline.scale.set(dims[0]/256,1,dims[1]/256);refreshStats()}
function worldBox(){state.mesh.updateMatrixWorld();return new THREE.Box3().setFromObject(state.mesh)}
function geometryDimensions(){state.mesh.geometry.computeBoundingBox();return state.mesh.geometry.boundingBox.getSize(new THREE.Vector3()).multiply(state.mesh.scale)}
function refreshStats(){
  if(!state.mesh)return;const a=state.analysis,d=geometryDimensions(),profile=$('#printerSelect').value.split(',').map(Number),fits=d.x<=profile[0]&&d.z<=profile[1]&&d.y<=profile[2];
  $('#dimX').value=d.x.toFixed(1);$('#dimY').value=d.z.toFixed(1);$('#dimZ').value=d.y.toFixed(1);
  $('#triangleStat').textContent=format(a.triCount,0);$('#volumeStat').textContent=a.volume?`${format(a.volume/1000,2)} cm³`:'—';$('#surfaceStat').textContent=`${format(a.area/100,1)} cm²`;$('#shellStat').textContent=a.shells;
  $('#boundaryCount').textContent=format(a.boundary.length,0);$('#nonManifoldCount').textContent=format(a.nonmanifold.length,0);$('#degenerateCount').textContent=format(a.degenerate,0);$('#duplicateCount').textContent=format(a.duplicate,0);
  const issueTotal=a.boundary.length+a.nonmanifold.length+a.degenerate+a.duplicate;$$('.issue-row').forEach(r=>{const n={boundary:a.boundary.length,nonmanifold:a.nonmanifold.length,degenerate:a.degenerate,duplicate:a.duplicate}[r.dataset.issue];r.classList.toggle('has-issue',n>0)});
  const density=Number($('#materialSelect').value),scaleVolume=a.volume*state.mesh.scale.x*state.mesh.scale.y*state.mesh.scale.z;$('#weightStat').textContent=a.volume?`${format(scaleVolume/1000*density,1)} g`:'—';
  const penalty=Math.min(100,(a.boundary.length?25:0)+(a.nonmanifold.length?35:0)+(a.degenerate?15:0)+(a.duplicate?10:0)+(a.shells>1?10:0)+(!fits?30:0));const score=100-penalty;
  $('#scoreValue').textContent=score;$('#scoreRing').style.background=`conic-gradient(${score>=80?'var(--accent)':score>=50?'var(--warn)':'var(--danger)'} ${score}%,var(--surface3) 0)`;
  const clean=issueTotal===0;$('#readinessTitle').textContent=!fits?'Does not fit build volume':clean?'Mesh looks print ready':state.repaired?'Repair completed':'Issues found';
  const banner=$('#statusBanner');banner.className=`status-banner ${clean&&fits?'good':'warn'}`;banner.lastElementChild.textContent=!fits?'Scale or rotate the model to fit the printer':clean?'Closed, manifold mesh detected':`${format(issueTotal,0)} repairable mesh flags detected`;
}

function setGeometry(geometry,{keepTransform=false}={}){
  geometry.computeVertexNormals();geometry.computeBoundingBox();
  if(state.mesh){scene.remove(state.mesh);state.mesh.geometry.dispose();state.mesh.material.dispose()}
  const material=new THREE.MeshStandardMaterial({color:0x7b8d99,roughness:.52,metalness:.08,side:THREE.DoubleSide});state.mesh=new THREE.Mesh(geometry,material);scene.add(state.mesh);
  if(!keepTransform)placeOnBed(true);state.analysis=analyzeGeometry(geometry);makeIssueLines(state.analysis);refreshStats();
}
function placeOnBed(center=false){if(!state.mesh)return;state.mesh.geometry.computeBoundingBox();const box=state.mesh.geometry.boundingBox,size=box.getSize(new THREE.Vector3());if(center){state.mesh.position.x=-(box.min.x+size.x/2);state.mesh.position.z=-(box.min.z+size.z/2)}state.mesh.position.y-=worldBox().min.y;if(state.analysis)refreshStats()}
function fitView(){if(!state.mesh)return;const box=worldBox(),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3()),dist=Math.max(size.x,size.y,size.z)*2.15;camera.position.copy(center).add(new THREE.Vector3(dist*.72,dist*.55,dist*.72));camera.near=Math.max(.01,dist/1000);camera.far=dist*20;camera.updateProjectionMatrix();controls.target.copy(center);controls.update()}

async function loadFile(file){
  if(!file||!file.name.toLowerCase().endsWith('.stl')){toast('Please choose an STL file');return}
  try{const buffer=await file.arrayBuffer(),geometry=new STLLoader().parse(buffer);if(!geometry.getAttribute('position')?.count)throw new Error('Empty STL');state.fileName=file.name;state.original=geometry.clone();state.repaired=false;setGeometry(geometry);$('#emptyState').classList.add('hidden');$('#viewerToolbar').classList.remove('hidden');$('#viewCube').classList.remove('hidden');$('#modelBadge').classList.remove('hidden');$('#modelName').textContent=file.name;$('#fileSize').textContent=`${format(file.size/1048576,2)} MB`;$$('button:disabled').filter(b=>!['themeButton'].includes(b.id)).forEach(b=>b.disabled=false);$$('.dimension-grid input').forEach(i=>i.disabled=false);fitView();toast('STL loaded and analyzed')}catch(e){console.error(e);toast('This STL could not be opened')}
}

function repairedGeometry(){
  const p=state.mesh.geometry.getAttribute('position'),vertices=[],map=new Map(),faces=[],seen=new Set(),tol=1e-5;
  const idx=(v)=>{const k=keyFor(v.x,v.y,v.z,tol);if(!map.has(k)){map.set(k,vertices.length);vertices.push(v.clone())}return map.get(k)};
  for(let i=0;i<p.count;i+=3){const va=new THREE.Vector3().fromBufferAttribute(p,i),vb=new THREE.Vector3().fromBufferAttribute(p,i+1),vc=new THREE.Vector3().fromBufferAttribute(p,i+2),a=idx(va),b=idx(vb),c=idx(vc),area=new THREE.Vector3().subVectors(vb,va).cross(new THREE.Vector3().subVectors(vc,va)).length()/2;if(area<1e-8||a===b||b===c||a===c)continue;const fk=[a,b,c].sort((x,y)=>x-y).join(':');if(seen.has(fk))continue;seen.add(fk);faces.push([a,b,c])}
  let vol=0;for(const f of faces)vol+=vertices[f[0]].dot(new THREE.Vector3().crossVectors(vertices[f[1]],vertices[f[2]]))/6;if(vol<0)faces.forEach(f=>[f[1],f[2]]=[f[2],f[1]]);
  const pos=new Float32Array(faces.length*9);let k=0;faces.forEach(f=>f.forEach(i=>{pos[k++]=vertices[i].x;pos[k++]=vertices[i].y;pos[k++]=vertices[i].z}));const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.computeVertexNormals();return g;
}

function repair(){if(!state.mesh)return;const before=state.analysis,transform={position:state.mesh.position.clone(),rotation:state.mesh.rotation.clone(),scale:state.mesh.scale.clone()},g=repairedGeometry();setGeometry(g,{keepTransform:true});state.mesh.position.copy(transform.position);state.mesh.rotation.copy(transform.rotation);state.mesh.scale.copy(transform.scale);state.repaired=true;refreshStats();$('#downloadButton').disabled=false;const removed=(before.triCount-state.analysis.triCount);toast(removed?`Repair finished · ${removed} invalid or duplicate faces removed`:'Cleanup finished · normals recalculated')}
function download(){const clone=state.mesh.clone();clone.updateMatrix();clone.geometry=state.mesh.geometry.clone().applyMatrix4(state.mesh.matrix);clone.position.set(0,0,0);clone.rotation.set(0,0,0);clone.scale.set(1,1,1);const data=new STLExporter().parse(clone,{binary:true}),blob=new Blob([data],{type:'model/stl'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=state.fileName.replace(/\.stl$/i,'')+'-repaired.stl';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('Repaired STL downloaded')}

$('#fileInput').addEventListener('change',e=>loadFile(e.target.files[0]));
const dz=$('#dropZone');['dragenter','dragover'].forEach(n=>dz.addEventListener(n,e=>{e.preventDefault();dz.classList.add('dragging')}));['dragleave','drop'].forEach(n=>dz.addEventListener(n,e=>{e.preventDefault();dz.classList.remove('dragging')}));dz.addEventListener('drop',e=>loadFile(e.dataTransfer.files[0]));
$('#themeButton').addEventListener('click',()=>{const light=document.documentElement.dataset.theme==='light';document.documentElement.dataset.theme=light?'dark':'light';$('#themeButton').textContent=light?'☀':'☾';localStorage.setItem('stl-theme',light?'dark':'light')});
const savedTheme=localStorage.getItem('stl-theme');if(savedTheme){document.documentElement.dataset.theme=savedTheme;$('#themeButton').textContent=savedTheme==='dark'?'☀':'☾'}
$$('[data-view]').forEach(b=>b.addEventListener('click',()=>{$$('[data-view]').forEach(x=>x.classList.remove('active'));b.classList.add('active');if(!state.mesh)return;const m=state.mesh.material;m.wireframe=b.dataset.view==='wire';m.transparent=['xray'].includes(b.dataset.view);m.opacity=b.dataset.view==='xray'?.28:1;m.depthWrite=b.dataset.view!=='xray';state.issueLines.visible=b.dataset.view==='issues';if(b.dataset.view==='issues'){m.transparent=true;m.opacity=.25;m.depthWrite=false}}));
$('#fitViewButton').addEventListener('click',fitView);$('#centerButton').addEventListener('click',()=>{placeOnBed(true);toast('Model centered on build plate')});$('#placeButton').addEventListener('click',()=>{placeOnBed(false);toast('Model placed on build plate')});
$$('[data-rotate]').forEach(b=>b.addEventListener('click',()=>{state.mesh.rotation[b.dataset.rotate]+=Math.PI/2;placeOnBed(true);refreshStats()}));
$$('[data-camera]').forEach(b=>b.addEventListener('click',()=>{if(!state.mesh)return;const box=worldBox(),c=box.getCenter(new THREE.Vector3()),d=Math.max(...box.getSize(new THREE.Vector3()).toArray())*2.5,dirs={top:[0,1,.001],front:[0,.15,1],left:[-1,.15,0],right:[1,.15,0],iso:[1,.75,1]},v=dirs[b.dataset.camera];camera.position.set(c.x+v[0]*d,c.y+v[1]*d,c.z+v[2]*d);controls.target.copy(c);controls.update()}));
$('.dimension-grid').addEventListener('change',e=>{if(!state.mesh||!e.target.matches('input'))return;const old=geometryDimensions(),axis={dimX:'x',dimY:'z',dimZ:'y'}[e.target.id],factor=Math.max(.0001,Number(e.target.value))/old[axis];if($('#uniformScale').checked)state.mesh.scale.multiplyScalar(factor);else state.mesh.scale[axis]*=factor;placeOnBed(true);refreshStats()});
$('#printerSelect').addEventListener('change',updateBed);$('#materialSelect').addEventListener('change',refreshStats);$('#analyzeButton').addEventListener('click',()=>{state.analysis=analyzeGeometry(state.mesh.geometry);makeIssueLines(state.analysis);refreshStats();toast('Mesh analysis refreshed')});$('#repairButton').addEventListener('click',repair);$('#downloadButton').addEventListener('click',download);$('#resetButton').addEventListener('click',()=>{if(!state.original)return;state.repaired=false;setGeometry(state.original.clone());fitView();$('#downloadButton').disabled=true;toast('Original model restored')});
$('#screenshotButton').addEventListener('click',()=>{renderer.render(scene,camera);const a=document.createElement('a');a.href=renderer.domElement.toDataURL('image/png');a.download=state.fileName.replace(/\.stl$/i,'')+'-preview.png';a.click()});
updateBed();resize();
