import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { firebaseConfig } from './firebase-config.js';
import { supabaseConfig } from './supabase-config.js';

const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
const apiUrl = `${supabaseConfig.url}/functions/v1/skyline-api`;

async function token(){
  if(!auth.currentUser) throw new Error('Authentication required');
  return auth.currentUser.getIdToken();
}
async function request(method, body, signal){
  const t=await token();
  const r=await fetch(apiUrl,{method,headers:{'Authorization':`Bearer ${t}`,'apikey':supabaseConfig.publishableKey,'Content-Type':'application/json'},body:method==='GET'?undefined:JSON.stringify(body),signal});
  const text=await r.text(); let data; try{data=JSON.parse(text)}catch{data={error:text}};
  if(!r.ok) throw new Error(data.error||`API ${r.status}`);
  return data;
}
function ref(db,path){return {path:String(path).replace(/^\/+/,''),db};}
function query(r,...constraints){return {...r,constraints};}
function orderByChild(field){return {type:'orderByChild',field};}
function equalTo(value){return {type:'equalTo',value};}
function limitToLast(value){return {type:'limitToLast',value};}
function encodeQuery(r){const c=r.constraints||[];return {path:r.path, constraints:c};}
class Snapshot{
  constructor(data,key=null){this.data=data;this.key=key}
  exists(){return this.data!==null&&this.data!==undefined&&(typeof this.data!=='object'||Object.keys(this.data).length>0)}
  val(){return this.data}
  forEach(fn){if(!this.data||typeof this.data!=='object')return;Object.entries(this.data).forEach(([key,val])=>fn(new Snapshot(val,key)))}
}
export async function get(r){const data=await request('POST',{op:'get',...encodeQuery(r)});return new Snapshot(data.data)}
export async function set(r,data){await request('POST',{op:'set',path:r.path,data});}
export async function update(r,data){await request('POST',{op:'update',path:r.path,data});}
export async function remove(r){await request('POST',{op:'remove',path:r.path});}
export function push(r){const key=crypto.randomUUID();return {path:`${r.path}/${key}`,key};}
export function sref(storage,path){return {path:String(path).replace(/^\/+/,'')};}
export async function uploadBytes(storageRef,file){
  const t=await token();
  const form=new FormData(); form.append('path',storageRef.path); form.append('file',file,file.name||'upload.bin');
  const r=await fetch(apiUrl,{method:'POST',headers:{'Authorization':`Bearer ${t}`,'apikey':supabaseConfig.publishableKey},body:form});
  const text=await r.text(); let data; try{data=JSON.parse(text)}catch{data={error:text}};
  if(!r.ok)throw new Error(data.error||`Upload ${r.status}`);
  return {url:data.url,path:storageRef.path};
}
export async function getDownloadURL(result){return result.url;}
export function onValue(r,callback){
  let stopped=false, last='';
  const run=async()=>{if(stopped)return;try{const s=await get(r);const raw=JSON.stringify(s.val());if(raw!==last){last=raw;callback(s)}}catch(e){console.error(e)}};
  run();const id=setInterval(run,3000);return ()=>{stopped=true;clearInterval(id)};
}
