(() => {
  const cfg=window.DREAMCATCHER_SUPABASE||{}, dialog=document.querySelector("#accountDialog");
  const configured=Boolean(cfg.url&&cfg.publishableKey&&window.supabase);
  let client=null,user=null,syncTimer=null,syncing=false,lastUser=null;
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
  async function syncNow(){if(user){await pushAll();msg("已同步到云端 ✓")}}
  async function refresh(){
    if(!configured)return;
    const {data}=await client.auth.getSession(); user=data.session?.user||null;
    show("#authForms",!user);show("#signedInPanel",!!user);show("#authNotConfigured",false);
    if(user){document.querySelector("#signedInEmail").textContent=user.email||"已登录";if(lastUser!==user.id){lastUser=user.id;await syncNow()}}
    else lastUser=null;
  }
  window.addEventListener("dreamcatcher:openaccount",()=>dialog.showModal());
  window.addEventListener("dreamcatcher:profile",()=>{const el=document.querySelector("#profileStatus");if(el)el.textContent=user?("已登录 · "+(user.email||"账户")):"未登录 · 点击账户与云同步"});
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