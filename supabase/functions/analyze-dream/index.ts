import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  try{
    const auth=req.headers.get("Authorization");
    if(!auth)throw new Error("NOT_AUTHENTICATED");
    const supabase=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:auth}}});
    const {data:{user},error:userError}=await supabase.auth.getUser();
    if(userError||!user)throw new Error("NOT_AUTHENTICATED");
    const {dream}=await req.json();
    if(!dream?.content?.trim())throw new Error("EMPTY_DREAM");
    const prompt=[
      "请用中文分析下面这条梦境。你是温和、好奇、非诊断性的梦境反思助手。",
      "不要把梦中符号解释成固定含义，不要声称知道潜意识的真实意图，不做精神或医学诊断。",
      "把分析写成四个简短部分：\n【情绪线索】\n【可能与近期经历的联系】\n【另一种理解方式】\n【可以继续想想的问题】",
      "把可能性明确写成可能、也许、可以留意。最后的问题写2-3个。总长度约350-600字。",
      "",
      "梦境标题："+(dream.title||"未命名"),
      "梦境内容："+dream.content,
      "分类："+(dream.category||"未分类"),
      "醒后情绪："+((dream.mood||[]).join("、")||"未记录"),
      "身体感受："+((dream.body||[]).join("、")||"未记录"),
      "近期生活背景："+(dream.context||"未记录")
    ].join("\n");
    const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Authorization":"Bearer "+Deno.env.get("OPENAI_API_KEY"),"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-5.6-luna",input:prompt,max_output_tokens:1200})});
    const result=await response.json();
    if(!response.ok)throw new Error(result?.error?.message||"OPENAI_ERROR");
    const analysis=result.output_text||result.output?.flatMap((x:any)=>x.content||[]).filter((x:any)=>x.type==="output_text").map((x:any)=>x.text).join("\n")||"";
    if(!analysis)throw new Error("EMPTY_AI_RESPONSE");
    return new Response(JSON.stringify({analysis,generatedAt:new Date().toISOString()}),{headers:{...corsHeaders,"Content-Type":"application/json"}});
  }catch(e){
    return new Response(JSON.stringify({error:e instanceof Error?e.message:String(e)}),{status:400,headers:{...corsHeaders,"Content-Type":"application/json"}});
  }
});