/* Pure presentation helpers. No tokenizer, network, inference or cache telemetry. */
(function(root){
'use strict';
const labels={context:'消息与上下文',rules:'规则',reference:'参考图',image:'当前图',state:'当前状态',question:'问题',thinking:'Thinking',plan:'Plan',boundary:'程序／原生边界'};
function describe(request,fragments){
 const counts={};let offset=0;
 return request.parts.map((p,index)=>{const f=fragments[p.ref],kind=f.kind,ordinal=counts[kind]||0;counts[kind]=ordinal+1;
 const wrapperOnly=kind==='context'&&!f.text.replace(/<[^>]*>/g,'').replace(/\b(system|user|assistant|model|thought|analysis|final)\b/g,'').trim();
 const dynamic=(['image','state','question','context'].includes(kind)&&!wrapperOnly)||(kind==='thinking'&&f.origin!=='reused');
 const part={...p,index,kind,ordinal,key:kind+':'+ordinal,text:f.text,charStart:offset,charEnd:offset+f.text.length,dynamic,origin:f.origin,
  scope:(kind==='plan'||(kind==='thinking'&&f.origin==='reused'))?'本次计划固定，重新生成后变化':dynamic?'随局面、问题或请求变化':'当前配置内固定'};
 offset=part.charEnd;return part;
 });
}
function ids(request,fragments){return request.parts.flatMap(p=>fragments[p.ref].ids);}
function imagePositions(request,fragments){
 const parts=request.parts.filter(p=>['image','reference'].includes(fragments[p.ref].kind));
 return parts.length===request.images.length?parts.map(p=>p.start):null;
}
function compare(current,previous,fragments){
 if(!previous)return {available:false,reason:'没有对应请求'};
 const a=current.request,b=previous.request;
 if(!a||!b)return {available:false,reason:'此阶段没有生成请求'};
 if(a.model!==b.model||current.protocol!==previous.protocol)return {available:false,reason:'模型或协议不同，不比较缓存'};
 const x=ids(a,fragments),y=ids(b,fragments);let end=0;
 while(end<Math.min(x.length,y.length)&&x[end]===y[end])end++;
 let cause=end<Math.min(x.length,y.length)?'文本 token 改变':x.length===y.length?'完全相同':'请求长度改变';
 const ap=imagePositions(a,fragments),bp=imagePositions(b,fragments);
 if(!ap||!bp)return {available:false,reason:'历史图片位置不足，无法可靠推断'};
 for(let i=0;i<Math.max(a.images.length,b.images.length);i++){
  if(a.images[i]!==b.images[i]||ap[i]!==bp[i]){
   const boundary=Math.min(ap[i]??Infinity,bp[i]??Infinity);
   if(boundary<=end){end=boundary;cause='图片内容或位置改变';}break;
  }
 }
 return {available:true,end,cause,identical:end===x.length&&end===y.length,previous:previous.label,previousIds:y};
}
root.AssemblyHelpers={labels,describe,ids,imagePositions,compare};
if(typeof module!=='undefined')module.exports=root.AssemblyHelpers;
})(typeof window==='undefined'?globalThis:window);

'use strict';
window.assemblyReady=(async()=>{
const $=id=>document.getElementById(id), packed=JSON.parse($('assembly-data').textContent);
const D=packed;
const groupCache=new Map();let groupVersion=0;
async function getChunk(url){if(!groupCache.has(url))groupCache.set(url,fetch(url).then(r=>{if(!r.ok)throw Error('请求数据加载失败');return r.json();}).catch(e=>{groupCache.delete(url);throw e;}));return groupCache.get(url);}
async function mergePayload(g){for(const [key,urls] of [["requests",g.request_urls],["fragments",g.fragment_urls]])if(urls)g[key]=Object.fromEntries(await Promise.all(Object.entries(urls).map(async([k,u])=>[k,await getChunk(u)])));Object.assign(D.requests,g.requests||{});Object.assign(D.fragments,g.fragments||{});Object.assign(D.plans,g.plans||{});for(const r of Object.values(g.requests||{}))if(!Object.getOwnPropertyDescriptor(r,'text'))Object.defineProperty(r,'text',{get(){return this.parts.map(p=>D.fragments[p.ref].text).join('');},enumerable:true});}
async function loadRow(row){if(!row?.payload)return;const g=await getChunk(row.payload);await mergePayload(g);Object.assign(row,g.row);}
async function loadGroup(version){const key=state.bench+'-'+state.model;const g=await getChunk(D.groups[key]);if(version!==groupVersion)return false;D.records=g.records.map(r=>({...r}));return true;}
const H=window.AssemblyHelpers,labels=H.labels;
const methods=['no_plan','shared_full','shared_plan_only','shared_no_think','manual_plan','neutral_prefix','per_step_cot'];
const methodDescriptions=['直接看当前截图并读出候选。','生成 thinking 与 plan，复用完整轨迹。','与 full 共用轨迹，只保留提取后的 plan。','关闭 thinking，直接生成并复用 plan。','插入完整人工操作清单。','插入不含决策规则的中性正文。','对当前截图和实际问题逐次思考，再直接读出。'];
const origins={input:'输入',generated:'生成',reused:'复用',prefill:'程序预填',symbolic:'占位符'};
const qs=new URLSearchParams(location.hash.slice(1));
let state={bench:'snake',model:'qwen35',condition:'shared_full',method:'choice',task:'perception',case:'perception-dev-000',probe:'heading',order:'0',profile:'model_default',budget:'0',step:'0',...Object.fromEntries(qs)};
let view=null,stageIndex=0,partIndex=0,timer=null,last=null;
let selection=qs.get('part')||'image:0', parts=[],comparison=null,previousTexts=new Map();
const keys=['bench','model','condition','method','task','case','probe','order','profile','budget','step'];
const unique=values=>[...new Set(values.map(String))];
const text=(tag,content,cls)=>{const n=document.createElement(tag);n.textContent=content;if(cls)n.className=cls;return n;};
function options(id,values,names={}){values=unique(values);const select=$(id);select.replaceChildren(...values.map(v=>{const o=new Option(names[v]||v,v);return o;}));if(!values.includes(String(state[id])))state[id]=values[0]||'';select.value=state[id];select.disabled=values.length<2;}
function matches(r,fields){return fields.every(k=>String(r[k])===String(state[k]));}
function requestsFor(row){return row.stages.filter(s=>s.request).map(s=>D.requests[s.request]);}
function legacyView(){const L=D.legacy,cs=L.cases[state.case],task=L.tasks[L.bindings[state.case][state.probe][Number(state.order)]],m=L.models[state.model];
 const calls=m.requests[task.id][state.condition][state.method];
 const planning=state.condition==='no_plan'?[]:m.planning[task.scope][state.condition==='shared_no_think'?'direct':'thinking'];
 return {bench:'snake',model:state.model,condition:state.condition,method:state.method,task:state.task,case:cs.id,probe:state.probe,order:Number(state.order),
  image:cs.image,question:task.question,choices:task.choices,evidence:'template',protocol:'snake-legacy-template',legacy:true,plan:null,source:'Snake 原页已保存的原生请求模板',
  note:'真实题目模板；生成正文为占位符，未运行模型。当前图按案例绑定，token 由原文与匹配的 tokenizer 导出。',
  stages:[...planning,...calls]};}
async function reconcile(changed=null){
 const version=++groupVersion;pause();options('bench',['snake','brush','drawing'],{snake:'Snake',brush:'Brush',drawing:'Drawing'});
 options('model',Object.keys(D.models),Object.fromEntries(Object.entries(D.models).map(([k,v])=>[k,v.name])));
 if(!await loadGroup(version))return;
 options('condition',methods);renderMethods();
 options('method',state.bench==='drawing'?['choice','yes_no','coordinate']:['choice','yes_no']);
 if(state.bench==='drawing'&&methods.indexOf(state.condition)>3){renderUnsupported();syncURL();return;}
 $('unsupported').hidden=true;document.querySelector('.inspection').hidden=false;
 let rows=D.records.filter(r=>matches(r,['bench','model','condition','method']));
 options('task',unique(rows.map(r=>r.task).concat(state.bench==='snake'?['perception','readout','safety','decision','episode']:[])));
 rows=rows.filter(r=>r.task===state.task);
 const legacyPossible=state.bench==='snake'&&state.task!=='episode'&&['no_plan','shared_full','shared_plan_only','shared_no_think'].includes(state.condition);
 const legacyCases=legacyPossible?Object.values(D.legacy.cases).filter(c=>c.task===state.task).map(c=>c.id):[];
 options('case',[...rows.map(r=>r.case),...legacyCases]);rows=rows.filter(r=>r.case===state.case);
 const lc=legacyPossible?D.legacy.cases[state.case]:null;
 options('probe',[...rows.map(r=>r.probe),...(lc?lc.questions.map(q=>q.id):[])]);
 rows=rows.filter(r=>r.probe===state.probe);
 const tids=lc?D.legacy.bindings[state.case][state.probe]:null;
 options('order',tids?tids.map((_,i)=>i):[...rows.map(r=>r.order)]);rows=rows.filter(r=>String(r.order)===state.order);
 options('profile',[...rows.map(r=>r.profile),...(tids?['template']:[])],{model_default:'default · 实测',probe:'probe · 实测',greedy:'greedy · 实测',template:'模板 · 无模型输出'});
 rows=rows.filter(r=>r.profile===state.profile);
 options('budget',rows.length?rows.map(r=>r.budget):['0'],{'0':'无／见阶段参数'});rows=rows.filter(r=>String(r.budget)===state.budget);
 options('step',rows.length?rows.map(r=>r.step):['0']);rows=rows.filter(r=>String(r.step)===state.step);
 if(rows[0]){
  await loadRow(rows[0]);
  const previous=D.records.filter(r=>['bench','model','condition','method','task','case','probe','order','profile','budget'].every(k=>String(r[k])===String(rows[0][k]))&&r.protocol===rows[0].protocol&&Number(r.step)<Number(rows[0].step)).sort((a,b)=>Number(b.step)-Number(a.step))[0];
  await loadRow(previous);
 }else if(tids){const g=await getChunk(D.legacy_chunks[state.model][state.case]);await mergePayload(g);D.legacy.models[state.model]=g.legacy_model;}
 if(version!==groupVersion)return;
 view=rows[0]||(tids?legacyView():null);
 if(!view)throw Error('没有可用证据；请重置页面选择。');
 $('support').textContent=state.bench==='snake'?'只有已保存的实测组合显示模型输出。其他题目或排列使用明确标记的模板。':state.bench==='brush'?'Brush v2 七种条件使用生产构造路径；生成正文为占位符，规则动作推进局面。':'Drawing v1 快照支持四种共享计划条件；其他三种尚未实现。';
 stageIndex=view.stages.length-1;
 const candidate=Number(state.candidate||0);if(changed===null&&candidate){const idx=view.stages.map((s,i)=>[s,i]).filter(([s])=>s.kind==='readout')[candidate];if(idx)stageIndex=idx[1];}
 $('case-name').textContent=`${view.case} · ${state.task} · step ${state.step}`;
 $('evidence').textContent={measured:'模型实测',template:'真实题目模板',oracle:'规则回放 + 真实输入模板'}[view.evidence];$('evidence').className='badge '+view.evidence;
 $('record-note').textContent=view.note;
 $('question').textContent=view.question;$('choices').textContent=(view.choices||[]).map((v,i)=>`${String.fromCharCode(65+i)}. ${v[0]} — ${v[1]}`).join('\n');
 renderResult();renderFlow();renderStage();syncURL();
}
function syncURL(){const p=new URLSearchParams();for(const k of keys)p.set(k,state[k]);p.set('stage',String(stageIndex));p.set('part',selection);try{history.replaceState(null,'','#'+p.toString());}catch{}}
function renderMethods(){$('condition-buttons').replaceChildren(...methods.map((name,i)=>{const b=text('button',name);b.setAttribute('aria-pressed',String(state.condition===name));b.title=methodDescriptions[i];if(state.bench==='drawing'&&i>3)b.dataset.unsupported='true';b.onclick=()=>{state.condition=name;reconcile('condition');};return b;}));$('method-description').textContent=methodDescriptions[methods.indexOf(state.condition)];}
function renderUnsupported(){view=null;parts=[];stageIndex=0;for(const key of ['task','case','probe','order','profile','budget','step'])options(key,[]);$('support').textContent='Drawing 尚未实现这一方法，没有对应请求模板。';$('unsupported').hidden=false;$('unsupported').textContent='Drawing 尚未实现 '+state.condition+'。没有对应的原生请求；请选前四种方法，或切换 Snake / Brush 查看此方法。';document.querySelector('.inspection').hidden=true;$('flow').replaceChildren();$('stage-note').textContent='此组合没有可播放的流程。';$('evidence').textContent='尚未支持';$('case-name').textContent='Drawing';$('record-note').textContent='不使用其他方法的输入替代。';$('changes').textContent='';for(const id of ['prev','next','play','reset'])$(id).disabled=true;}
function renderFlow(){for(const id of ['play','reset'])$(id).disabled=false;const root=$('flow');root.replaceChildren();view.stages.forEach((s,i)=>{const li=document.createElement('li'),b=document.createElement('button');b.append(text('small',`${String(i+1).padStart(2,'0')} / ${s.batch==='axes'?'同截图轴批次':s.batch==='readout'?'候选读出批次':s.kind}`),text('b',s.label));b.dataset.stage=i;b.onclick=()=>{pause();stageIndex=i;renderStage();syncURL();};if(s.batch&&i<view.stages.length-1&&view.stages[i+1].batch===s.batch&&(s.batch==='readout'||state.task.endsWith('parallel')))li.dataset.parallel='true';li.append(b);root.append(li);});}
function actualRequest(stage,row=view){if(!stage.request)return null;const r=D.requests[stage.request];if(!row.legacy)return r;
 // Only change image bindings, never the captured text or token fragments.
 return {...r,images:stage.kind==='readout'?(row.condition==='no_plan'?[row.image]:[D.legacy.reference,row.image]):r.images};}
function revealStage(){const root=$('flow'),active=root.querySelector('[aria-current="step"]');if(!active||!root.clientWidth)return;const r=root.getBoundingClientRect(),b=active.getBoundingClientRect();if(b.right>r.right)root.scrollLeft+=b.right-r.right+8;else if(b.left<r.left)root.scrollLeft-=r.left-b.left+8;}
function renderStage(){const stage=view.stages[stageIndex],r=actualRequest(stage);
 document.querySelectorAll('#flow button').forEach((b,i)=>b.setAttribute('aria-current',i===stageIndex?'step':'false'));
 revealStage();$('prev').disabled=stageIndex===0;$('next').disabled=stageIndex===view.stages.length-1;
 $('request-title').textContent=stage.label;$('stage-note').textContent=`阶段 ${stageIndex+1} / ${view.stages.length} · ${stage.batch==='axes'?'同一截图上的独立轴问题；parallel 将轴请求放入同一批次。':stage.batch==='readout'?'各候选的 thinking 已完成；这些读出请求一起提交，使用中性参数。':stage.kind==='coordinate'?'直接生成 JSON，再解析为动作；此路径没有 boxed 读出。':stage.kind==='readout'?'预填 boxed 后读取指定候选 token 的 log-prob；不是采样完整答案正文。':'生成输出将用于后续请求；固定正文直接插入，不调用模型。'}`;
 const images=r?r.images:[view.image];$('images').replaceChildren(...images.map((key,i)=>{const f=document.createElement('figure'),im=document.createElement('img');im.src=D.images[key];im.alt=(images.length>1&&i===0?'独立参考图':'当前请求图片')+' · '+view.case;im.width=320;im.height=320;f.append(im,text('figcaption',`${i+1}. ${images.length>1&&i===0?'参考图':['thinking','plan'].includes(stage.kind)&&state.condition!=='per_step_cot'&&images.length===1?'规划参考图':'当前截图'}`));return f;}));
 $('image-note').textContent=`图片以此顺序单独传入。文本标记仅表示插入位置；共 ${images.length} 张。`;
 $('token-count').textContent=r?`${r.tokens} text tokens`:'固定正文';
 renderEditor(stage,r);
 const current=r?new Set(r.parts.map(p=>D.fragments[p.ref].kind)):new Set(['plan']);
 if(last&&last.config!==[state.bench,state.model,state.condition,state.method].join('/')){
  const added=[...current].filter(x=>!last.kinds.has(x)),removed=[...last.kinds].filter(x=>!current.has(x));
  $('changes').textContent=[added.length?'新增：'+added.map(x=>labels[x]).join('、'):'',removed.length?'移除：'+removed.map(x=>labels[x]).join('、'):'',view.plan&&view.plan===last.plan?'复用：同一份生成轨迹。':''].filter(Boolean).join(' ｜ ')||'上下文已更新；下方展示当前配置的完整拼接。';
 }else if(!last)$('changes').textContent='点击流程节点，再点击片段，查看它在原始 token 中的位置。';
 last={config:[state.bench,state.model,state.condition,state.method].join('/'),kinds:current,plan:view.plan};
 $('output-box').hidden=!('output' in stage);$('output').textContent=stage.output||'';
 $('output-note').textContent=`${stage.measured?'真实生成输出':'固定正文或符号占位符，非模型输出'}${stage.termination?' · 终止：'+stage.termination:''}`;
 const plan=view.plan?D.plans[view.plan]:null;
 $('extraction').hidden=!plan;if(plan){const p=plan.record;$('extraction-note').textContent=`共用轨迹 ${view.plan.slice(0,12)} · 切片起点 ${p.plan_slice_start??0} · 提取后 ${p.plan_ids.length} tokens${p.empty_plan?' · 空计划仍进入读出':''}${p.plan_truncated?' · 预算截断，保留正文':''}。full 保留原始轨迹，plan-only 保留下方正文。`;$('extracted-text').textContent=p.plan_text||'（空计划）';}
 const provenance={evidence:view.evidence,protocol:view.protocol||'Snake 原页模板快照',source:view.source,source_sha256:view.source_sha256||D.sources[view.source],model:D.models[state.model],
  input_ids_sha256:r?.ids_sha256,image_hashes:images,stage_parameters:stage.parameters||null,
  reconstruction:view.evidence==='measured'?'记录的输出与原始 token；输入按已核对的适配器重建':'生产代码导出的模板',
  plan_id:view.plan,plan:plan?plan.record:null,sources:view.source_hashes||D.sources};
 $('provenance').textContent=JSON.stringify(provenance,null,2);
}
function comparisonSource(){
 if(!view)return null;
 const current=view.stages[stageIndex];
 if($('compare').value==='previous_request'){
  for(let i=stageIndex-1;i>=0;i--)if(view.stages[i].request)return {request:actualRequest(view.stages[i]),protocol:view.protocol,label:`本流程阶段 ${i+1} · ${view.stages[i].label}`};
  return null;
 }
 const rows=D.records.filter(r=>['bench','model','condition','method','task','case','probe','order','profile','budget'].every(k=>String(r[k])===String(view[k]))&&r.protocol===view.protocol&&Number(r.step)<Number(view.step));
 rows.sort((a,b)=>Number(b.step)-Number(a.step));const row=rows[0];if(!row)return null;
 const signature=s=>[s.kind,s.query_role||'',s.candidate_index??'',s.label].join('/');
 const ordinal=view.stages.slice(0,stageIndex).filter(s=>signature(s)===signature(current)).length;
 const s=row.stages.filter(s=>signature(s)===signature(current))[ordinal];
 return s?.request?{request:actualRequest(s,row),protocol:row.protocol,label:`step ${row.step} · ${s.label}`}:null;
}
function renderEditor(stage,r){
 const root=$('full-text'),rail=$('segments');root.replaceChildren();rail.replaceChildren();
 $('token-ids').textContent='';$('token-detail').hidden=true;$('show-tokens').setAttribute('aria-expanded','false');
 const planning=['thinking','plan'].includes(stage.kind)&&state.condition!=='per_step_cot';
 const capturedQuestion=r?r.parts.filter(p=>D.fragments[p.ref].kind==='question').map(p=>D.fragments[p.ref].text).join(''):'';
 $('question').textContent=stage.question||capturedQuestion||(planning?'通用规划阶段：依据独立参考图准备可复用策略。完整请求见右侧原文。':view.question);
 const choices=planning?[]:stage.choices||view.choices||[];
 let candidate=stage.candidate;
 if(!candidate&&!planning&&state.bench==='snake'&&state.method==='yes_no'){const n=view.stages.slice(0,stageIndex).filter(s=>s.kind===stage.kind).length;candidate=choices[n]?.[1];}
 $('choices').textContent=choices.map((v,i)=>`${String.fromCharCode(65+i)}. ${v[0]} — ${v[1]}`).join('\n')+(candidate?'\n当前 yes/no 候选：'+candidate:'')|| (planning?'此阶段不读取候选分数。':'此历史快照未单独保存语义候选；请查看原文。');
 parts=r?H.describe(r,D.fragments):[{index:0,kind:'plan',key:'plan:0',ordinal:0,text:stage.output||'',start:0,end:(stage.output_ids||[]).length,scope:'固定正文，无模型生成请求',dynamic:false,origin:'input'}];
 comparison=H.compare({request:r,protocol:view.protocol},comparisonSource(),D.fragments);
 $('cache-note').textContent=comparison.available?`可复用前缀推断 · 对比 ${comparison.previous} · 文本 token [0, ${comparison.end}) · ${comparison.cause}`:`可复用前缀推断 · ${comparison.reason}`;
 let line=0,lineNode,content;
 function nextLine(){lineNode=text('span','','code-line');lineNode.dataset.line=String(++line);content=text('span','','line-content');lineNode.append(content);root.append(lineNode);}
 nextLine();
 for(const part of parts){
  const b=text('button',labels[part.kind]||part.kind);b.dataset.kind=part.kind;b.dataset.dynamic=String(part.dynamic);b.dataset.key=part.key;
  const prior=previousTexts.get(part.key);if(prior!==undefined&&prior!==part.text)b.dataset.changed='true';
  b.append(text('small',`[${part.start}, ${part.end}) · ${origins[part.origin]||part.origin}`));
  if(part.dynamic){const flame=text('span','','dynamic-icon');flame.setAttribute('aria-label','动态');flame.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C14 8 19 8 19 15a7 7 0 0 1-14 0c0-3 2-5 4-7-1 4 1 4 2 2 1-2 1-5 1-8Zm0 12c-3 3-3 6 0 6s3-3 0-6Z"/></svg>';b.append(flame);}b.append(text('small',part.dynamic?'动态':part.scope));
  if(comparison.available&&r){let status=part.end<=comparison.end?'共同前缀':part.start<comparison.end?'部分前缀':'差异后缀';if(part.start>=comparison.end){const prev=comparison.previousIds.slice(part.start,part.end),now=D.fragments[part.ref].ids;if(prev.length===now.length&&now.every((t,i)=>t===prev[i]))status='相同 · 前缀外';}b.append(text('small',status,'cache-state'));}
  b.title=part.scope;b.onclick=()=>{selection=part.key;selectPart(part.index,true);syncURL();};rail.append(b);
  const chunks=part.text.split(/(\n)/);
  for(const chunk of chunks){if(!chunk)continue;const run=text('span',chunk,'text-run');run.dataset.part=String(part.index);run.dataset.kind=part.kind;if(chunk!=='\n'&&!root.querySelector(`[data-part="${part.index}"]`)){run.tabIndex=0;run.setAttribute('role','button');run.setAttribute('aria-label','定位片段：'+(labels[part.kind]||part.kind));}
   if(comparison.available){
    run.dataset.cache=part.end<=comparison.end?'prefix':part.start<comparison.end?'partial':'suffix';
    if(!comparison.identical&&part.start<=comparison.end&&part.end>comparison.end){lineNode.dataset.divergence='true';lineNode.title=`首个差异在此片段：token ${comparison.end}（非实际缓存命中）`;}
    if(part.end<=comparison.end)lineNode.dataset.prefix='true';
    if(part.start>=comparison.end&&r){const previous=comparison.previousIds.slice(part.start,part.end),now=D.fragments[part.ref].ids;if(previous.length===now.length&&now.every((t,i)=>t===previous[i]))b.title+='；内容相同，但位于差异之后';}
   }
   content.append(run);if(chunk==='\n')nextLine();
  }
 }
 previousTexts=new Map(parts.map(p=>[p.key,p.text]));
 const index=parts.findIndex(p=>p.key===selection);
 if(index>=0)selectPart(index,true);else{$('segment-meta').textContent=`本阶段无此片段：${labels[selection.split(':')[0]]||selection}；后续出现时恢复高亮。`;}
}
function selectPart(index,reveal=false){
 partIndex=index;const p=parts[index];
 $('segment-meta').textContent=`${labels[p.kind]} · ${p.scope} · 原始 token [${p.start}, ${p.end})`;
 document.querySelectorAll('#segments button').forEach((b,i)=>b.setAttribute('aria-pressed',String(i===index)));
 document.querySelectorAll('#full-text .text-run').forEach(n=>n.classList.toggle('selected',Number(n.dataset.part)===index));
 if(reveal){const target=$('full-text').querySelector(`[data-part="${index}"]`),editor=$('editor');if(target){const y=target.getBoundingClientRect().top-editor.getBoundingClientRect().top+editor.scrollTop-35;editor.scrollTo({top:Math.max(0,y),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}}const button=$('segments').children[index],rail=$('segments');if(button){const a=button.getBoundingClientRect(),b=rail.getBoundingClientRect();if(a.top<b.top||a.bottom>b.bottom)rail.scrollTop+=a.top-b.top-10;if(a.left<b.left||a.right>b.right)rail.scrollLeft+=a.left-b.left-10;}
}
function activateText(event){
 if(event.type==='keydown'&&!['Enter',' '].includes(event.key))return;
 if(event.type==='click'&&window.getSelection()?.toString())return;
 const run=event.target.closest('.text-run');if(!run)return;
 if(event.type==='keydown')event.preventDefault();
 const index=Number(run.dataset.part);selection=parts[index].key;selectPart(index,false);syncURL();
}
$('full-text').addEventListener('click',activateText);$('full-text').addEventListener('keydown',activateText);
function renderResult(){const root=$('result');root.replaceChildren();if(view.result){root.append(text('h3','实际读出'),text('p','选择：'+view.result.action));for(const row of view.result.candidates){const d=text('div','', 'score-row');d.append(text('span',row.id),text('strong',(row.score*100).toFixed(2)+'%'));root.append(d);}root.append(text('p','候选相对权重，不是成功概率。','caption'));}
 else if(view.oracle_action)root.append(text('h3','规则示范动作'),text('pre',typeof view.oracle_action==='string'?view.oracle_action:JSON.stringify(view.oracle_action)),text('p','用于推进示范，不是模型预测。','caption'));
 else root.append(text('p','此配置展示输入模板，没有模型候选分数。','caption'));}
function pause(){if(timer)clearInterval(timer);timer=null;$('play').textContent='播放流程';$('play').setAttribute('aria-pressed','false');}
function move(delta){if(!view)return;pause();stageIndex=Math.max(0,Math.min(view.stages.length-1,stageIndex+delta));renderStage();syncURL();}
$('prev').onclick=()=>move(-1);$('next').onclick=()=>move(1);$('reset').onclick=()=>{if(!view)return;pause();stageIndex=0;renderStage();syncURL();};
$('play').onclick=()=>{if(!view)return;if(timer){pause();return;}if(stageIndex===view.stages.length-1)stageIndex=0;renderStage();$('play').textContent='暂停';$('play').setAttribute('aria-pressed','true');timer=setInterval(()=>{if(stageIndex>=view.stages.length-1){pause();return;}stageIndex++;renderStage();syncURL();},1500);};
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
$('wrap').onchange=()=>{$('editor').classList.toggle('wrap',$('wrap').checked);};
$('compare').onchange=()=>{if(view)renderEditor(view.stages[stageIndex],actualRequest(view.stages[stageIndex]));};
$('show-tokens').onclick=()=>{if(!view)return;const visible=$('token-detail').hidden;$('token-detail').hidden=!visible;$('show-tokens').setAttribute('aria-expanded',String(visible));if(visible){const r=actualRequest(view.stages[stageIndex]);$('token-ids').textContent=JSON.stringify(r?H.ids(r,D.fragments):view.stages[stageIndex].output_ids||[]);}};
$('close-tokens').onclick=()=>{$('token-detail').hidden=true;$('show-tokens').setAttribute('aria-expanded','false');};
async function copy(value){try{await navigator.clipboard.writeText(value);$('status').textContent='已复制。';}catch{const scratch=document.createElement('textarea');scratch.value=value;scratch.setAttribute('aria-label','待复制文本');scratch.style.position='fixed';scratch.style.left='-9999px';document.body.append(scratch);scratch.select();const ok=document.execCommand('copy');scratch.remove();$('status').textContent=ok?'已复制。':'无法访问剪贴板；可选中编辑器原文复制或下载 JSON。';}}
$('copy').onclick=()=>view&&copy(actualRequest(view.stages[stageIndex])?.text||view.stages[stageIndex].output||'');$('share').onclick=()=>copy(location.href);
$('download').onclick=()=>{if(!view)return;const s=view.stages[stageIndex],r=actualRequest(s);const value={state,evidence:view.evidence,source:view.source,stage:s,
 request:r?{...r,ids:r.parts.flatMap(p=>D.fragments[p.ref].ids),fragments:r.parts.map((p,i)=>({...p,...D.fragments[p.ref],...parts[i]})),images:r.images.map(id=>({sha256:id,src:D.images[id]}))}:null,result:view.result||null,plan:view.plan?D.plans[view.plan]:null};
 const u=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=u;a.download=`${state.bench}-${state.model}-${state.condition}-step${state.step}-request${stageIndex}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);};
for(const key of keys)$(key).onchange=()=>{state[key]=$(key).value;reconcile(key);};
await reconcile();if(view&&qs.has('stage')){stageIndex=Math.max(0,Math.min(view.stages.length-1,Number(qs.get('stage'))||0));renderStage();syncURL();}
$('lab').hidden=false;$('loading').hidden=true;$('static-case').hidden=true;revealStage();requestAnimationFrame(()=>{if(view){const i=parts.findIndex(p=>p.key===selection);if(i>=0)selectPart(i,true);}});
window.inputAssembly={data:D,get state(){return {...state};},get view(){return view;},get stage(){return stageIndex;},get playing(){return Boolean(timer);},get selection(){return selection;},get comparison(){return comparison;}};
return true;
})().catch(error=>{document.getElementById('loading').textContent='交互未能加载：'+error.message+'。下方保留静态实测案例。';throw error;});
