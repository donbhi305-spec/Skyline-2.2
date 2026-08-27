import { createClient } from 'npm:@supabase/supabase-js@2'

const cors={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'GET,POST,OPTIONS'
}
const json=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}})

const supabase=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const tableMap:any={
  users:'profiles', posts:'posts', 'posts-likes':'post_likes', 'favorite-posts':'favorite_posts',
  followers:'follows', following:'follows', 'profile-likes':'profile_likes', 'line-posts':'line_videos',
  inbox:'inbox', chats:'messages', 'posts-comments':'comments', 'posts-comments-replies':'comment_replies',
  'posts-comments-like':'comment_likes', 'posts-comments-replies-like':'comment_reply_likes',
  'posts-share':'post_shares', 'profile-history':'profile_history', 'cover-image-history':'cover_image_history'
}

async function verifyFirebase(req:Request){
  const h=req.headers.get('Authorization')||''
  if(!h.startsWith('Bearer ')) throw new Error('Missing Firebase ID token')
  const idToken=h.slice(7)
  const apiKey=Deno.env.get('FIREBASE_WEB_API_KEY')
  if(!apiKey) throw new Error('FIREBASE_WEB_API_KEY is not configured')
  const r=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken})})
  const data=await r.json()
  if(!r.ok || !data.users?.[0]) throw new Error('Invalid or expired Firebase ID token')
  return data.users[0]
}
function splitPath(path:string){return path.replace(/^\/+|\/+$/g,'').split('/').filter(Boolean)}
function map(path:string){
  const p=splitPath(path); if(p[0]!=='skyline') throw new Error('Invalid path')
  const root=p[1]||''; return {p,root,table:tableMap[root]}
}
function rowId(parts:string[]){return parts.length>2?parts[2]:null}
function actorAllowed(root:string,parts:string[],uid:string){
  if(root==='users') return rowId(parts)===uid
  if(root==='posts'||root==='line-posts') return true
  if(root==='following') return (parts[2]||uid)===uid
  if(root==='followers') return (parts[3]||uid)===uid
  if(root==='favorite-posts') return (parts[2]||uid)===uid
  if(root==='profile-likes'||root==='posts-likes') return (parts[3]||uid)===uid
  if(root==='inbox') return (parts[2]||uid)===uid || (parts[3]||uid)===uid
  if(root==='chats') return (parts[2]||uid)===uid || (parts[3]||uid)===uid
  if(root==='profile-history'||root==='cover-image-history') return (parts[2]||uid)===uid
  return true
}

async function getPath(path:string,constraints:any[]=[]){
  const {p,root,table}=map(path); if(!table) return {}
  let q=supabase.from(table).select('*')
  const order=constraints?.find(x=>x.type==='orderByChild'); const eq=constraints?.find(x=>x.type==='equalTo');
  if(root==='following'||root==='followers'){
    if(p[2]) q=q.eq(root==='following'?'follower_id':'following_id',p[2])
    else if(order?.field==='uid' && eq) q=q.eq(root==='followers'?'following_id':'follower_id',eq.value)
  } else if(root==='favorite-posts') q=q.eq('user_id',p[2])
  else if(root==='users'&&p[2]) q=q.eq('uid',p[2])
  else if(root==='posts'&&p[2]) q=q.eq('id',p[2])
  else if(root==='posts-likes'&&p[2]) q=q.eq('post_id',p[2])
  else if(root==='line-posts'&&p[2]) q=q.eq('id',p[2])
  else if(root==='inbox'&&p[2]) q=q.eq('owner_id',p[2])
  else if(root==='chats'&&p[2]) { q=q.eq('sender_id',p[2]); if(p[3]) q=q.eq('recipient_id',p[3]) }
  else if(root==='profile-likes'&&p[2]) q=q.eq('profile_id',p[2])
  else if(root==='posts-comments'&&p[2]) q=q.eq('post_id',p[2])
  if(order && !((root==='followers'||root==='following') && order.field==='uid')) q=q.order(order.field,{ascending:true})
  if(eq&&order && !((root==='followers'||root==='following') && order.field==='uid')) q=q.eq(order.field,eq.value)
  const lim=constraints?.find(x=>x.type==='limitToLast'); if(lim) q=q.limit(lim.value)
  const {data,error}=await q; if(error)throw error
  if(p.length>2){
    if(root==='users'&&p[2]) return data?.[0]||null
    if(root==='posts'&&p[2]) return data?.[0]||null
    if(root==='posts-likes'&&p[3]) return data?.some((x:any)=>x.user_id===p[3])?p[3]:null
    if(root==='favorite-posts'&&p[3]) return data?.some((x:any)=>x.post_id===p[3])?p[3]:null
  }
  const out:any={}
  for(const x of data||[]){
    const key=x.key||x.id||x.uid||`${x.follower_id||''}_${x.following_id||''}`; out[key]=toLegacy(root,x)
  }
  return out
}
function toLegacy(root:string,x:any){
  if(root==='users') return {...x,uid:x.uid}
  if(root==='following') return x.following_id||x
  if(root==='followers') return {uid:x.follower_id||x}
  if(root==='favorite-posts') return x.post_id||x
  if(root==='posts-likes') return x.user_id||x
  if(root==='profile-likes') return x.user_id||x
  if(root==='inbox') return x
  if(root==='chats') return x
  return x
}
function fromLegacy(root:string,data:any,parts:string[],uid:string){
  if(root==='users') return {...data,uid:parts[2]||uid}
  if(root==='posts') return {...data,id:parts[2]||data.key,uid:data.uid||uid}
  if(root==='line-posts') { const row={...data,id:parts[2]||data.key,uid:data.uid||uid}; if(row.videoUri!==undefined){row.video_uri=row.videoUri;delete row.videoUri} return row }
  if(root==='following') return {follower_id:parts[2]||uid,following_id:parts[3]||data}
  if(root==='followers') return {follower_id:parts[3]||data,following_id:parts[2]||uid}
  if(root==='favorite-posts') return {user_id:parts[2]||uid,post_id:parts[3]||data}
  if(root==='posts-likes') return {post_id:parts[2],user_id:parts[3]||uid}
  if(root==='profile-likes') return {profile_id:parts[2],user_id:parts[3]||uid}
  if(root==='inbox') { const row={...data,owner_id:parts[2]||uid,contact_id:parts[3]||data.uid}; if(row.TYPE!==undefined){row.type=row.TYPE;delete row.TYPE} return row }
  if(root==='chats') { const row={...data,id:parts[4]||data.key,sender_id:parts[2]||uid,recipient_id:parts[3]}; if(row.TYPE!==undefined){row.type=row.TYPE;delete row.TYPE} return row }
  if(root==='posts-comments') return {...data,post_id:parts[2],author_id:data.uid||uid}
  return data
}
async function mutate(op:string,path:string,data:any,uid:string){
  const {p,root,table}=map(path); if(!table)throw new Error(`Unsupported path: ${path}`)
  if(!actorAllowed(root,p,uid))throw new Error('Forbidden')
  if(op==='remove'){
    let q=supabase.from(table).delete()
    if(root==='users') q=q.eq('uid',p[2])
    else if(root==='posts') { const cur=await supabase.from('posts').select('uid').eq('id',p[2]).maybeSingle(); if(cur.error)throw cur.error; if(cur.data?.uid!==uid)throw new Error('Forbidden'); q=q.eq('id',p[2]) }
    else if(root==='following'||root==='followers') q=q.eq('follower_id',root==='following'?p[2]:p[3]).eq('following_id',root==='following'?p[3]:p[2])
    else if(root==='favorite-posts') q=q.eq('user_id',p[2]).eq('post_id',p[3])
    else if(root==='posts-likes') q=q.eq('post_id',p[2]).eq('user_id',p[3])
    else if(root==='profile-likes') q=q.eq('profile_id',p[2]).eq('user_id',p[3])
    else if(root==='inbox') q=q.eq('owner_id',p[2]).eq('contact_id',p[3])
    else if(root==='chats') q=q.eq('id',p[4]).eq('sender_id',uid)
    else throw new Error('Delete path unsupported')
    const {error}=await q; if(error)throw error; return
  }
  if(root==='users'&&(op==='update'||op==='set')){if((p[2]||uid)!==uid)throw new Error('Forbidden');const row=fromLegacy(root,data,p,uid);const {error}=await supabase.from(table).upsert(row,{onConflict:'uid'});if(error)throw error;return}
  if(root==='posts'&&op==='update'){
    const id=p[2]||data?.key; if(!id)throw new Error('Missing post id')
    const existing=await supabase.from('posts').select('uid').eq('id',id).maybeSingle();
    if(existing.error)throw existing.error; if(existing.data && existing.data.uid!==uid)throw new Error('Forbidden')
    const row={...data,id,uid:existing.data?.uid||uid}; delete row.key
    const {error}=await supabase.from(table).upsert(row,{onConflict:'id'});if(error)throw error;return
  }
  if(root==='line-posts'&&op==='update'){
    const id=p[2]||data?.key; if(!id)throw new Error('Missing video id')
    const existing=await supabase.from('line_videos').select('uid').eq('id',id).maybeSingle();
    if(existing.error)throw existing.error; if(existing.data && existing.data.uid!==uid)throw new Error('Forbidden')
    const row={...data,id,uid:existing.data?.uid||uid}; delete row.key
    const {error}=await supabase.from(table).upsert(row,{onConflict:'id'});if(error)throw error;return
  }
  const row=fromLegacy(root,data,p,uid)
  const {error}=await supabase.from(table).upsert(row);if(error)throw error
}

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors})
  try{
    const fb=await verifyFirebase(req); const uid=fb.localId
    const ct=req.headers.get('content-type')||''
    if(ct.includes('multipart/form-data')){
      const form=await req.formData(); const path=String(form.get('path')||''); const file=form.get('file');
      if(!(file instanceof File))throw new Error('Missing file')
      const clean=path.replace(/^\/+|\/+$/g,''); if(!clean.startsWith('skyline/posts/') && !clean.startsWith('skyline/profiles/')) throw new Error('Invalid upload path');
      const {error}=await supabase.storage.from('skyline-media').upload(clean,file,{upsert:true,contentType:file.type||undefined})
      if(error)throw error
      const {data}=supabase.storage.from('skyline-media').getPublicUrl(clean)
      return json({url:data.publicUrl,path:clean})
    }
    const body=await req.json(); const op=body.op||'get'
    if(op==='get')return json({data:await getPath(body.path,body.constraints||[])})
    await mutate(op,body.path,body.data,uid); return json({ok:true})
  }catch(e){console.error(e);return json({error:e?.message||String(e)},400)}
})
