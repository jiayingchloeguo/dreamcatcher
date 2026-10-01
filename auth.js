(() => {
  const cfg=window.DREAMCATCHER_SUPABASE||{}, dialog=document.querySelector("#accountDialog");
  const configured=Boolean(cfg.url&&cfg.publishableKey&&window.supabase);
  let client=null;
  const show=(id,on)=>document.querySelector(id)?.classList.toggle("hidden",!on);
  function message(text,bad=false){const el=document.querySelector("#authMessage");if(el){el.textContent=text||"";el.classList.toggle("error",bad)}}
  async function refresh(){
    if(!configured)return;
    const {data}=await client.auth.getSession(), user=data.session?.user;
    show("#authForms",!user);show("#signedInPanel",!!user);show("#authNotConfigured",false);
    if(user)document.querySelector("#signedInEmail").textContent=user.email||"已登录";
  }
  document.querySelector("#accountBtn").onclick=()=>dialog.showModal();
  document.querySelector("#closeAccountBtn").onclick=()=>dialog.close();
  if(!configured)return;
  client=window.supabase.createClient(cfg.url,cfg.publishableKey);
  window.dreamcatcherSupabase=client;
  show("#authNotConfigured",false);show("#authForms",true);refresh();
  client.auth.onAuthStateChange(()=>refresh());
  document.querySelector("#signUpBtn").onclick=async()=>{message("正在创建账户…");const email=authEmail.value.trim(),password=authPassword.value;const {data,error}=await client.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}});if(error)return message(error.message,true);message(data.session?"注册成功，已登录。":"注册成功，请查看邮箱完成验证。")};
  document.querySelector("#signInBtn").onclick=async()=>{message("正在登录…");const {error}=await client.auth.signInWithPassword({email:authEmail.value.trim(),password:authPassword.value});message(error?error.message:"登录成功。",!!error)};
  document.querySelector("#signOutBtn").onclick=async()=>{await client.auth.signOut();message("")};
})();
