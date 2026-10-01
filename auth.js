(() => {
  const cfg=window.DREAMCATCHER_SUPABASE||{}, dialog=document.querySelector("#accountDialog");
  const configured=Boolean(cfg.url&&cfg.publishableKey&&window.supabase);
  let client=null,user=null,syncTimer=null,syncing=false,lastUser=null,profile={nickname:""},wormholes=[];
  const show=(id,on)=>document.querySelector(id)?.classList.toggle("hidden",!on);
  const msg=(t,b=false)=>{const e=document.querySelector("#authMessage");if(e){e.textContent=t||"";e.classList.toggle("error",b)}};
  const state=()=>window.dreamcatcherState;
  const toRow=d=>({id:d.id,user_id:user.id,dream_date:d.date,title:d.title||"",content:d.content||"",category:d.category||null,moods:Array.isArray(d.mood)?d.mood:(d.mood?[d.mood]:[]),body_sensations:d.body||[],life_context:d.context||"",created_at:d.createdAt?new Date(d.createdAt).toISOString():new Date().toISOString(),updated_at:d.updatedAt?new Date(d.updatedAt).toISOString():new Date().toISOString()});
  const fromRow=r=>({id:r.id,date:r.dream_date,title:r.title||"",content:r.content||"",category:r.category||"",mood:r.moods||[],body:r.body_sensations||[],context:r.life_context||"",createdAt:new Date(r.created_at).getTime(),updatedAt:new Date(r.updated_at).getTime()});
  async function pushAll(){
    if(!user||syncing||!state())return; syncing=true;
    try{
      const local=state().getDreams(), rows=local.map(toRow);
      if(rows.length){const {error}=await client.from("dreams").upsert(rows,{onConflict:"id"});if(error)throw error}
      const c=state().getCustom(), opts=[];
      for(const type of ["category","mood","body"])for(const value of (c[type]||[]))opts.push({user_id:user.id,option_type:type,value});
      if(opts.length){const {error}=await client.from("custom_options").upsert(opts,{onConflict:"user_id,option_type,value",ignoreDuplicates:true});if(error)throw error}
      await pullAll();
    }catch(e){console.error("Dreamcatcher sync:",e);msg("云同步失败："+e.message,true)}
    finally{syncing=false}
  }
  async function pullAll(){
    if(!user||!state())return;
    const [{data:remote,error:e1},{data:opts,error:e2}]=await Promise.all([
      client.from("dreams").select("*").order("dream_date",{ascending:false}),
      client.from("custom_options").select("option_type,value")
    ]);
    if(e1||e2)throw(e1||e2);
    const local=state().getDreams(), map=new Map(local.map(d=>[d.id,d]));
    for(const r of remote||[]){const d=fromRow(r),old=map.get(d.id);if(!old||d.updatedAt>=old.updatedAt)map.set(d.id,d)}
    state().setDreams([...map.values()]);
    const c={...state().getCustom(),category:[...(state().getCustom().category||[])],mood:[...(state().getCustom().mood||[])],body:[...(state().getCustom().body||[])]};
    for(const o of opts||[])if(c[o.option_type]&&!c[o.option_type].includes(o.value))c[o.option_type].push(o.value);
    state().setCustom(c);
  }
  async function loadProfile(){if(!user)return;const {data,error}=await client.rpc("get_my_profile");if(!error)profile={nickname:data?.[0]?.nickname||""}}
  async function loadWormholes(){if(!user)return[];const {data,error}=await client.from("wormholes").select("*").order("created_at",{ascending:false});if(error)throw error;wormholes=data||[];return wormholes}
  async function partner(w){const {data,error}=await client.rpc("get_wormhole_partner",{target_wormhole:w.id});if(error)throw error;return data?.[0]||{}}
  async function syncNow(){if(user){await pushAll();msg("已同步到云端 ✓")}}
  async function refresh(){
    if(!configured)return;
    const {data}=await client.auth.getSession(); user=data.session?.user||null;
    show("#authForms",!user);show("#signedInPanel",!!user);show("#authNotConfigured",false);
    if(user){document.querySelector("#signedInEmail").textContent=user.email||"已登录";if(lastUser!==user.id){lastUser=user.id;await syncNow();await loadProfile();await loadWormholes()}}
    else lastUser=null;
  }
  window.addEventListener("dreamcatcher:openaccount",()=>dialog.showModal());
  window.addEventListener("dreamcatcher:profile",async()=>{if(user)await loadProfile();const el=document.querySelector("#profileStatus"),name=document.querySelector("#profileNickname");if(el)el.textContent=user?(user.email||"已登录"):"未登录 · 点击账户与云同步";if(name)name.textContent=profile.nickname||"Dreamcatcher"});
  window.addEventListener("dreamcatcher:editnickname",async()=>{if(!user)return dialog.showModal();const n=prompt("你的昵称：",profile.nickname||"");if(n===null)return;const clean=n.trim();if(!clean||clean.length>30)return alert("昵称需要 1–30 个字符");const {error}=await client.rpc("set_my_nickname",{new_nickname:clean});if(error)return alert("保存失败："+error.message);profile.nickname=clean;document.querySelector("#profileNickname").textContent=clean});
  window.addEventListener("dreamcatcher:openwormhole",async()=>{if(!user)return dialog.showModal();await renderWormhole();document.querySelector("#wormholeDialog").showModal()});
  document.querySelector("#closeWormholeBtn").onclick=()=>document.querySelector("#wormholeDialog").close();
  async function renderWormhole(){const box=document.querySelector("#wormholeContent");box.innerHTML='<p class="muted">正在连接虫洞…</p>';try{await loadWormholes();const active=wormholes.find(w=>w.status==="accepted"),incoming=wormholes.filter(w=>w.status==="pending"&&w.receiver_id===user.id),outgoing=wormholes.filter(w=>w.status==="pending"&&w.sender_id===user.id);if(active){const p=await partner(active),{data:shared}=await client.rpc("get_shared_wormhole_dreams",{target_wormhole:active.id});const {data:mine}=await client.from("wormhole_dreams").select("dream_id").eq("wormhole_id",active.id).eq("owner_id",user.id);const ids=new Set((mine||[]).map(x=>x.dream_id));box.innerHTML='<div class="connected"><div class="wormhole-icon">✦</div><h3>与 '+safe(p.nickname||"未设置昵称")+' 的虫洞</h3><p class="muted">'+safe(p.email||"")+'</p><h3>来自 TA 的梦</h3>'+(shared?.length?shared.map(remoteCard).join(""):'<p class="muted">TA 还没有分享梦境。</p>')+'<h3>我分享的梦</h3><div class="share-list">'+state().getDreams().map(d=>'<label class="share-row"><input type="checkbox" data-share="'+d.id+'" '+(ids.has(d.id)?"checked":"")+'><span><b>'+safe(d.title)+'</b><small>'+safe(d.date)+'</small></span></label>').join("")+'</div><button class="danger-btn" data-disconnect="'+active.id+'">解除虫洞</button></div>';bindWormhole(active.id);return}let incomingHtml="";for(const w of incoming){const p=await partner(w);incomingHtml+='<div class="invite-card"><b>'+safe(p.nickname||"Dreamcatcher 用户")+'</b><small>'+safe(p.email||"")+'</small><div><button class="primary-btn" data-accept="'+w.id+'">接受</button><button class="secondary-btn" data-decline="'+w.id+'">拒绝</button></div></div>'}box.innerHTML='<p>输入对方完整的 Dreamcatcher ID（邮箱）发送邀请。</p><label>Dreamcatcher ID<input id="wormholeEmail" type="email" placeholder="friend@example.com"></label><button id="sendWormholeInvite" class="primary-btn">发送虫洞邀请</button>'+(incomingHtml?'<h3 class="worm-section">收到的邀请</h3>'+incomingHtml:"")+(outgoing.length?'<p class="muted worm-section">你有 '+outgoing.length+' 个等待对方接受的邀请。</p>':"");bindWormhole()}catch(e){box.innerHTML='<p class="auth-message error">虫洞加载失败：'+safe(e.message)+'</p>'}}
  const safe=s=>String(s||"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const remoteCard=d=>'<article class="shared-dream"><b>'+safe(d.title)+'</b><small>'+safe(d.dream_date)+'</small><p>'+safe(d.content)+'</p></article>';
  function bindWormhole(activeId){const send=document.querySelector("#sendWormholeInvite");if(send)send.onclick=async()=>{const email=document.querySelector("#wormholeEmail").value.trim();if(!email)return;send.disabled=true;const {error}=await client.rpc("send_wormhole_invite",{target_email:email});send.disabled=false;if(error)return alert("发送失败："+error.message);alert("邀请已发送。如果该邮箱对应 Dreamcatcher 账户，对方会在虫洞中看到邀请。");renderWormhole()};document.querySelectorAll("[data-accept]").forEach(b=>b.onclick=async()=>{const {error}=await client.rpc("accept_wormhole_invite",{target_wormhole:b.dataset.accept});if(error)return alert(error.message);renderWormhole()});document.querySelectorAll("[data-decline]").forEach(b=>b.onclick=async()=>{const {error}=await client.rpc("decline_wormhole_invite",{target_wormhole:b.dataset.decline});if(error)return alert(error.message);renderWormhole()});document.querySelectorAll("[data-share]").forEach(ch=>ch.onchange=async()=>{const row={wormhole_id:activeId,dream_id:ch.dataset.share,owner_id:user.id};const q=ch.checked?client.from("wormhole_dreams").insert(row):client.from("wormhole_dreams").delete().eq("wormhole_id",activeId).eq("dream_id",ch.dataset.share).eq("owner_id",user.id);const {error}=await q;if(error){ch.checked=!ch.checked;alert("共享设置失败："+error.message)}});const dis=document.querySelector("[data-disconnect]");if(dis)dis.onclick=async()=>{if(!confirm("解除虫洞后，双方将无法继续查看彼此分享的梦。确定解除？"))return;const {error}=await client.from("wormholes").delete().eq("id",dis.dataset.disconnect);if(error)return alert(error.message);renderWormhole()}}
  document.querySelector("#closeAccountBtn").onclick=()=>dialog.close();
  if(!configured)return;
  client=window.supabase.createClient(cfg.url,cfg.publishableKey);window.dreamcatcherSupabase=client;
  show("#authNotConfigured",false);show("#authForms",true);
  client.auth.onAuthStateChange(()=>setTimeout(refresh,0)); refresh();
  window.addEventListener("dreamcatcher:datachanged",()=>{if(!user||syncing)return;clearTimeout(syncTimer);syncTimer=setTimeout(syncNow,500)});
  document.querySelector("#signUpBtn").onclick=async()=>{msg("正在创建账户…");const email=authEmail.value.trim(),password=authPassword.value;const {data,error}=await client.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}});if(error)return msg(error.message,true);msg(data.session?"注册成功，正在同步…":"注册成功，请查看邮箱完成验证。")};
  document.querySelector("#signInBtn").onclick=async()=>{msg("正在登录…");const {error}=await client.auth.signInWithPassword({email:authEmail.value.trim(),password:authPassword.value});msg(error?error.message:"登录成功，正在同步…",!!error)};
  document.querySelector("#signOutBtn").onclick=async()=>{await client.auth.signOut();msg("")};
})();