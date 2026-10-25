
'use strict';
// The inline core works offline; the online export loads only selected trace chunks.
async function unpackEvidence(encoded){
 const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
 return JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
}
window.articleReady=(async()=>{
 const stored=JSON.parse(document.getElementById('article-data').textContent);
 const data=stored.codec?await unpackEvidence(stored.data):stored;
 const chunks=JSON.parse(document.getElementById('article-traces').textContent), pending=new Map();
 const episodes=new Map(data.episode.episodes.map(e=>[e.id,e]));
 window.ensureEpisodeTrace=async function(e){
  if(e.trace)return;
  const key=e.config_id;
  if(!pending.has(key))pending.set(key,(async()=>{
   const chunk=chunks[key];let values;
   if(chunk.data)values=await unpackEvidence(chunk.data);
   else {
    if(location.protocol==='file:')throw Error('请使用完整离线版查看逐步轨迹。');
    const response=await fetch(chunk.url);if(!response.ok)throw Error('轨迹加载失败：HTTP '+response.status);
    const bytes=await response.arrayBuffer();
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
    if(hash!==chunk.sha256)throw Error('轨迹校验失败，请刷新后重试。');
    values=JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
   }
   for(const [id,trace] of Object.entries(values))episodes.get(id).trace=trace;
  })().catch(error=>{pending.delete(key);throw error;}));
  await pending.get(key);
 };
 window.readArticleEvidence=async()=>{
  // Full evidence download is explicit; bound concurrent network requests.
  const queue=[...new Set(data.episode.episodes.map(e=>e.config_id))];
  await Promise.all(Array.from({length:4},async()=>{while(queue.length){const key=queue.shift();await window.ensureEpisodeTrace(data.episode.episodes.find(e=>e.config_id===key));}}));
  return data;
 };
 return data;
})();

(async()=>{
function revealAnchor(){let target;try{target=document.getElementById(decodeURIComponent(location.hash.slice(1)));}catch{return;}if(!target)return;for(let n=target;n;n=n.parentElement)if(n.tagName==='DETAILS')n.open=true;if(target.matches('section')){const detail=target.querySelector(':scope > details');if(detail)detail.open=true;}target.scrollIntoView();}
window.addEventListener('hashchange',revealAnchor);window.addEventListener('load',()=>{if(location.hash)revealAnchor();});
const D=await window.articleReady;
const $=id=>document.getElementById(id),text=(id,value)=>$(id).textContent=value;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const options=(id,rows)=>{$(id).replaceChildren(...rows.map(([value,label])=>{const o=document.createElement('option');o.value=value;o.textContent=label;return o}));};
const models=D.models.map(m=>[m.id,m.name]),tasks=['perception','readout','safety','decision'];
const taskLabel={perception:'Perception',readout:'Readout',safety:'Safety',decision:'Decision',episode:'Episode'};

function repeatScore(r){const xs=r.repeat_scores,n=xs.length,m=xs.reduce((a,b)=>a+b,0)/n;const sd=n>1?Math.sqrt(xs.reduce((a,b)=>a+(b-m)**2,0)/(n-1)):null;return (100*m).toFixed(2)+(sd===null?'':' ± '+(100*sd).toFixed(2))+'%';}

function devResults(){
 if(!D.dev)return;
 const group=D.dev.highlights.find(r=>r.model===$('dev-model').value&&r.benchmark===$('dev-task').value&&r.method===$('dev-method').value);
 const pct=v=>(v*100).toFixed(2), signed=v=>(v>0?'+':'')+pct(v);
 text('dev-note',group.benchmark==='readout'?'Readout 只测换序一致性；恒定动作也能得满分。':'差值相对同一模型、任务、读出的 no_plan。最佳配置由本 dev 选出。');
 $('dev-bars').innerHTML=group.rows.map(r=>`<div class="bar-row"><span>${esc(r.condition)}</span><div class="bar-track"><div class="bar-fill" style="width:${r.score*100}%"></div></div><span>${repeatScore(r)}</span></div>`).join('');
 $('dev-values').innerHTML=group.rows.map(r=>`<tr><th>${esc(r.condition)}<br><small>${esc(r.sampling.profile)} / ${r.condition==='per_step_cot'?r.step_thinking_tokens:r.condition.startsWith('shared')?r.plan_tokens:'无生成预算'}</small></th><td>${repeatScore(r)}</td><td>${signed(r.delta)}</td><td>${r.delta_ci95.map(signed).join(' 至 ')}</td><td>${r.repeat_scores.length}</td><td>${r.mean_execution_seconds.toFixed(3)}</td></tr>`).join('');
}
if(D.dev){
 options('dev-model',[...new Set(D.dev.highlights.map(r=>r.model))].map(v=>[v,v]));options('dev-task',tasks.map(v=>[v,taskLabel[v]]));
 for(const id of ['dev-model','dev-task','dev-method'])$(id).addEventListener('change',devResults);
 $('dev-reset').addEventListener('click',()=>{$('dev-model').selectedIndex=0;$('dev-task').value='perception';$('dev-method').value='choice';devResults()});devResults();
}

const getModel=id=>D.models.find(m=>m.id===$(id).value);
const conditions={no_plan:'no_plan · 直接读出',shared_full:'shared_full · 完整 CoT + plan',shared_plan_only:'shared_plan_only · 仅保留 plan',shared_no_think:'shared_no_think · 直接生成 plan',manual_plan:'manual_plan · 人工清单',neutral_prefix:'neutral_prefix · 中性前缀',per_step_cot:'per_step_cot · 当前问题推理'};
const describe={no_plan:'直接用当前截图、问题和候选答题。',shared_full:'用参考图生成思考和计划；答题时保留两者，再加入当前题目。',shared_plan_only:'复用 full 的同一次生成。答题时去掉思考，只保留计划。',shared_no_think:'关闭思考，直接生成计划，再回答当前题目。',manual_plan:'使用完整人工清单，不按生成预算裁剪。',neutral_prefix:'加入长度接近人工清单、但不含决策规则的文字。',per_step_cot:'先看当前图和问题，再思考。思考结束后直接比较候选分数。'};
function flow(){const c=$('flow-condition').value,m=getModel('flow-model'),task=$('flow-task').value;
 const labels=c==='per_step_cot'?['当前图与问题','局面 thinking','原生结束边界','boxed 预填','候选读出']:['外观参考图','通用 thinking','plan / 前缀','当前图与问题','候选读出'];
 const active=c==='no_plan'?[3,4]:c==='per_step_cot'?[0,1,2,3,4]:['shared_full','shared_plan_only'].includes(c)?[0,1,2,3,4]:[0,2,3,4];
 $('flow-steps').innerHTML=labels.map((s,i)=>`<div class="step ${active.includes(i)?'active':''} ${i===1?'thinking':''}"><span class="num">0${i+1}</span><b>${s}</b><small>${active.includes(i)?'此条件使用':'此条件跳过'}</small></div>`).join('');text('flow-detail',describe[c]);text('flow-marker',m.end_think);
 $('flow-pair').hidden=!['shared_full','shared_plan_only'].includes(c);$('flow-prefix').hidden=!['manual_plan','neutral_prefix'].includes(c);
 $('flow-current-image').hidden=task==='episode';$('flow-current-image').src=(D.cases[task]||D.cases.decision).image;text('flow-current-note',task==='episode'?'每步重新看图；闭环实测见上方 Episode 案例':'执行阶段 · 实际问题与候选');$('flow-pair').querySelector('details').hidden=!['perception','safety'].includes(task);
 const p=m.plans.find(p=>p.task===(['perception','safety'].includes(task)?task:'perception')&&p.profile==='model_default'&&p.thinking_enabled);
 text('flow-plan-meta',`来自 ${p.task} 冒烟 · thinking ${p.thinking_ids.length} token · plan ${p.plan_ids.length} token · ${p.thinking_end} · plan 截断 ${p.plan_truncated?'是':'否'}。两种执行视图引用同一生成记录。`);
 text('flow-thinking',p.thinking_text||'（无 thinking 内容）');text('flow-plan',p.plan_text||'（空 plan）');
 text('flow-prefix-text',c==='neutral_prefix'?m.neutral[task]:D.manual[task]);text('flow-prefix-meta',`${taskLabel[task]} · 人工 ${m.manual_tokens[task]} token / 中性 ${m.neutral_tokens[task]} token · ${m.name} tokenizer`);
}
function boardQuestionOptions(){const qs=D.cases[$('board-task').value].questions;options('board-question',qs.map((q,i)=>[i,q.id]));board();}
function board(){const task=$('board-task').value,c=D.cases[task],idx=+$('board-question').value,q=c.questions[idx],m=getModel('board-model'),order=+$('board-order').value,method=$('board-method').value;
 $('board-img').src=c.image;text('board-caption',`${c.id} · main-v1 / dev · 环境真值仅用于解释`);text('board-question-text',q.text);
 const choices=order?[...q.choices].reverse():q.choices;$('board-options').innerHTML=choices.map((v,i)=>`<span class="pill">${String.fromCharCode(65+i)} · ${esc(v[1])}</span>`).join('');
 text('board-truth',q.truth===null?task==='decision'?'环境安全动作：'+Object.entries(c.facts).filter(([,f])=>!f.collision).map(([a])=>a).join(', '):'Readout 关注语义一致性，无唯一正确动作标签。':'环境答案：'+q.truth);
 text('board-explain',method==='choice'?`1 个实际请求，比较 ${choices.length} 个字母的原始 log-prob。改变顺序会改变字母到语义的映射。`:`${choices.length} 个实际请求，每个候选独立问 yes/no；先二元归一化，再跨候选比较。per_step_cot 会分别思考。`);
 const previous=$('board-candidate').value;options('board-candidate',choices.map((v,i)=>[i,v[1]]));if(+previous<choices.length)$('board-candidate').value=previous||'0';$('board-candidate-label').hidden=method==='choice';
 text('board-request',m.requests[task][idx][order][method][method==='choice'?0:+$('board-candidate').value]);overlay(c);
}
function overlay(c){let content='';if($('board-annotate').checked){const state=c.state;const rect=(x,y,color,label)=>`<rect x="${x*32+2}" y="${y*32+2}" width="28" height="28" rx="4" fill="none" stroke="${color}" stroke-width="2"/><text x="${x*32+16}" y="${y*32+20}" text-anchor="middle" fill="white" stroke="#101c2d" paint-order="stroke" stroke-width="3" font-size="10">${label}</text>`;
 state.body.slice(1,-1).forEach(([x,y])=>content+=rect(x,y,'#81d8a8','身'));content+=rect(...state.body[0],'#8cbeff','头'+['↑','→','↓','←'][state.direction]);content+=rect(...state.body.at(-1),'#ffe18c','尾');
 c.next_cells.forEach(p=>{if(p.x>=0&&p.x<10&&p.y>=0&&p.y<10)content+=`<circle cx="${p.x*32+16}" cy="${p.y*32+16}" r="13" fill="#65549cbb" stroke="white"/><text x="${p.x*32+16}" y="${p.y*32+20}" text-anchor="middle" fill="white" font-size="9">${{left:'左',straight:'直',right:'右'}[p.action]}</text>`;});}
 $('board-overlay').innerHTML=content;}
function matrix(){const filters=['model','task','stage','budget','repeat'].map(k=>$('matrix-'+k).value);const rows=D.matrix.filter(r=>
 (filters[0]==='all'||r.model_name===filters[0])&&(filters[1]==='all'||r.benchmark===filters[1])&&(filters[2]==='all'||r.stage===filters[2])&&(filters[3]==='all'||(['shared','cot'].includes(r.stage)&&String(r.stage==='cot'?r.step_thinking_tokens:r.plan_tokens)===filters[3]))&&(filters[4]==='all'||String(r.repeat_id)===filters[4]));
 text('matrix-count',rows.length);text('matrix-note',filters[3]==='all'?'共享生成 full / plan-only 在一行内配对。baseline 与 prefix 没有生成预算；固定前缀完整注入。':'预算筛选只作用于 shared 与 CoT；baseline / prefix 不生成，不归入此预算。');
 $('matrix-body').innerHTML=rows.length?rows.map(r=>`<tr><th scope="row">${esc(MODELNAME(r.model_name))}<br><small>${taskLabel[r.benchmark]}</small></th><td>${r.stage}</td><td>${r.conditions.map(esc).join('<br>')}</td><td>${r.sampling}</td><td>${r.stage==='shared'?'thinking 2048<br>plan '+r.plan_tokens:r.stage==='cot'?'thinking '+r.step_thinking_tokens:'不适用'}</td><td>${r.repeat_id}</td></tr>`).join(''):'<tr><td colspan="6">没有匹配的配置；不是零分。调整阶段、预算或重复筛选。</td></tr>';
}
const MODELNAME=id=>D.models.find(m=>m.id===id)?.name||id;
function traceOptions(){const m=getModel('trace-model'),task=$('trace-task').value,method=$('trace-method').value,old=$('trace-condition').value;const cs=[...new Set(m.results.filter(r=>r.task===task&&r.method===method).map(r=>r.condition))];options('trace-condition',cs.map(c=>[c,c]));if(cs.includes(old))$('trace-condition').value=old;trace();}
function generationBlock(title,body,meta){const d=document.createElement('details'),s=document.createElement('summary');s.textContent=title;d.append(s);const p=document.createElement('p');p.className='caption';p.textContent=meta;d.append(p);const pre=document.createElement('pre');pre.tabIndex=0;pre.textContent=body||'（无正文）';d.append(pre);return d;}
function trace(){const m=getModel('trace-model'),task=$('trace-task').value,method=$('trace-method').value,condition=$('trace-condition').value,budget=+$('trace-budget').value;
 $('trace-budget-label').hidden=condition!=='per_step_cot';const r=m.results.find(r=>r.task===task&&r.method===method&&r.condition===condition&&(condition!=='per_step_cot'||r.budget===budget));if(!r)return;
 $('trace-img').src=D.cases[task].image;text('trace-case',r.case_id+' · 重建像素 SHA-256 '+D.cases[task].image_hash);text('trace-question',r.question);text('trace-result',`选择 ${r.action} · 预期 ${r.expected} · ${r.correct?'此题正确':'此题错误，保留原记录'}`);$('trace-result').className='result-note'+(r.correct?'':' wrong');
 $('trace-bars').innerHTML=r.candidates.map(c=>`<div class="bar-row"><span>${esc(c.label)} · ${esc(c.id)}</span><div class="bar-track"><div class="bar-fill ${c.id===r.action?'selected':''}" style="width:${Math.max(0,Math.min(100,c.score*100))}%"></div></div><span>${(c.score*100).toFixed(2)}%</span></div>`).join('');
 $('trace-stats').innerHTML=[['总执行时间',r.seconds.toFixed(3)+' s'],['局面推理',r.thinking_seconds.toFixed(3)+' s'],['候选读出',r.readout_seconds.toFixed(3)+' s']].map(([k,v])=>`<div><small>${k}</small><b>${v}</b></div>`).join('');
 $('trace-values-head').innerHTML='<tr><th>语义候选</th><th>score（原精度）</th><th>其余原始字段</th></tr>';
 $('trace-values').innerHTML=r.candidates.map(c=>`<tr><th>${esc(c.id)}</th><td>${c.score}</td><td><code>${esc(JSON.stringify(Object.fromEntries(Object.entries(c).filter(([k])=>!['score','id'].includes(k)))))}</code></td></tr>`).join('');
 const area=$('trace-generation');area.replaceChildren();
 if(r.reasoning.length){r.reasoning.forEach((v,i)=>{area.append(generationBlock(`${method==='yes_no'?'候选 '+r.candidates[i].id+' · ':''}真实当前局面 thinking`,v.text,`${v.thinking_ids.length} token · ${v.thinking_end} / ${v.finish_reason} · 结束 ${v.closing_text} → ${v.suffix_text}`));});}
 else if(condition.includes(':')){const [profile,mode]=condition.split(':'),p=m.plans.find(p=>p.task===task&&p.profile===profile&&p.thinking_enabled===(mode!=='direct'));
 if(p){if(p.thinking_enabled)area.append(generationBlock(mode==='plan_only'?'生成过但执行时移除的 thinking':'执行中保留的 thinking',p.thinking_text,`${p.thinking_ids.length} token · ${p.thinking_end} · ${p.thinking_seconds.toFixed(3)} s`));area.append(generationBlock('执行中保留的 plan',p.plan_text,`${p.plan_ids.length} token · ${p.plan_finish_reason} · 截断 ${p.plan_truncated?'是':'否'} · ${p.plan_seconds.toFixed(3)} s`));}}
 else if(condition==='manual_plan'||condition==='neutral_prefix')area.append(generationBlock(condition==='manual_plan'?'完整人工计划':'完整中性前缀',condition==='manual_plan'?D.manual[task]:m.neutral[task],`${condition==='manual_plan'?m.manual_tokens[task]:m.neutral_tokens[task]} token · 非模型生成`));
 else{const p=document.createElement('p');p.className='callout';p.textContent='此条件没有 thinking 或 plan 正文，直接进行候选读出。';area.append(p);}
 text('trace-raw',JSON.stringify(r,null,2));
}
let sampleIndex=0;const bundles=['A','B','C'];const draws=[['A','B','C'],['B','B','C'],['A','C','A'],['C','C','C'],['B','A','B']];
const familyHTML=id=>`<div class="family"><b>题组 ${id}</b><div class="members"><span>题目</span><span>选项顺序</span><span>相关变体</span></div></div>`;
function sample(){const draw=draws[sampleIndex%draws.length];$('family-sample').innerHTML=draw.map(familyHTML).join('');const picked=draw.map(f=>'题组 '+f).join('、');text('family-method-draw',picked);text('family-baseline-draw',picked);text('family-note',`第 ${sampleIndex+1} 轮：${bundles.map(f=>f+' × '+draw.filter(x=>x===f).length).join('，')}。两种方法都用这些题，分别计算得分，再相减。`);}

for(const id of ['flow-model','board-model','trace-model'])options(id,models);options('flow-condition',Object.entries(conditions));$('flow-condition').value='shared_plan_only';options('flow-task',Object.keys(D.manual).map(t=>[t,taskLabel[t]]));options('board-task',tasks.map(t=>[t,taskLabel[t]]));
options('matrix-model',[['all','全部模型'],...models]);options('matrix-task',[['all','全部静态任务'],...tasks.map(t=>[t,taskLabel[t]])]);options('matrix-stage',[['all','全部阶段'],['baseline','baseline · 无计划'],['shared','shared · 共享生成'],['prefix','prefix · 固定前缀'],['cot','cot · 当前局面']]);options('matrix-budget',[['all','全部 / 不适用'],...['128','256','512','1024','2048'].map(x=>[x,x+' token'])]);options('matrix-repeat',[['all','全部重复'],...['0','1','2'].map(x=>[x,'repeat '+x])]);
for(const id of ['flow-condition','flow-model','flow-task'])$(id).addEventListener('change',flow);
$('board-task').addEventListener('change',boardQuestionOptions);for(const id of ['board-model','board-method','board-order','board-question','board-candidate','board-annotate'])$(id).addEventListener('change',board);
for(const k of ['model','task','stage','budget','repeat'])$('matrix-'+k).addEventListener('change',matrix);
for(const id of ['trace-model','trace-task','trace-method'])$(id).addEventListener('change',traceOptions);for(const id of ['trace-condition','trace-budget'])$(id).addEventListener('change',trace);
$('flow-reset').onclick=()=>{$('flow-model').value=models[0][0];$('flow-condition').value='shared_plan_only';$('flow-task').value='perception';flow();};
$('board-reset').onclick=()=>{$('board-model').value=models[0][0];$('board-task').value='perception';$('board-method').value='choice';$('board-order').value='0';$('board-annotate').checked=false;boardQuestionOptions();};
$('matrix-reset').onclick=()=>{for(const k of ['model','task','stage','budget','repeat'])$('matrix-'+k).value='all';matrix();};
$('trace-reset').onclick=()=>{$('trace-model').value=models[0][0];$('trace-task').value='perception';$('trace-method').value='choice';$('trace-budget').value='128';$('trace-condition').value='no_plan';traceOptions();};
$('family-next').onclick=()=>{sampleIndex++;sample();};$('family-reset').onclick=()=>{sampleIndex=0;sample();};
$('download-data').onclick=async()=>{await window.readArticleEvidence();const url=URL.createObjectURL(new Blob([JSON.stringify(D,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='reasoning-study-evidence.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};

const pct=x=>x==null?'不可用':(x*100).toFixed(2)+'%';
const diagnosticNames={heading:'头部朝向',food_position:'食物空间关系',tail_position:'尾巴空间关系',cell_content:'指定格子内容',paired_judgement_accuracy:'配对判断正确率',required_change_accuracy:'要求改变时的响应正确率',danger_recall:'危险召回率',false_alarm_rate:'误报率'};
function baseline(){
 const rows=D.baseline?.rows||[];if(!rows.length){$('baseline-lab').hidden=true;return;}
 const task=$('baseline-task').value,method=$('baseline-method').value,model=$('baseline-model').value;
 const selected=rows.filter(r=>r.benchmark===task&&r.method===method);
 const notes={perception:'主分数：四类视觉准确率等权。格子识别是其中一类，不因其问题更多而获得更大权重。',readout:'主分数：六种动作排列的语义一致率。恒定动作也能得到 100%，必须结合下方动作分布判断。',safety:'主分数：完整安全集合正确率，按 0／1／2／3 个安全动作分层等权。逐个动作正确率不是这个主指标。',decision:'主分数：单步动作安全率；先对排列求均值，再对 1／2 个安全动作层等权。不是闭环生存率。'};
 text('baseline-metric-note',notes[task]);
 $('baseline-reference-bars').innerHTML=D.analysis.controls.filter(r=>r.scores[task]!==null).map(r=>`<div class="bar-row"><span>${esc(r.label)}<small> · ${esc(r.basis)}</small></span><div class="bar-track"><div class="bar-fill" style="width:${r.scores[task]*100}%"></div></div><span>${pct(r.scores[task])}</span></div>`).join('');
 $('baseline-bars').innerHTML=selected.map(r=>`<div class="bar-row"><span>${esc(r.model)}</span><div class="bar-track"><div class="bar-fill ${r.model_id===model?'selected':''}" style="width:${r.score*100}%"></div></div><span>${pct(r.score)}</span></div>`).join('');
 $('baseline-filter-values').innerHTML=selected.map(r=>`<tr><th>${esc(r.model)}</th><td>${r.score}</td><td>${r.mean_execution_seconds}</td><td>${r.result_count}</td></tr>`).join('');
 const row=selected.find(r=>r.model_id===model),d=row.details;let content='';
 text('baseline-diagnostic-title',row.model+' · '+taskLabel[task]+' / '+method);
 function table(title,headers,entries){return `<div class="table-wrap"><table><caption>${esc(title)}</caption><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${entries.map(e=>`<tr>${e.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;}
 if(task==='perception'){
  content+=table('四类视觉准确率（各占主分数的 1/4）',['类别','准确率','原始比例'],Object.entries(d.visual_types).map(([k,v])=>[diagnosticNames[k],pct(v),v]));
  const confusion=Object.entries(d.cell_confusion).filter(([k])=>k.startsWith('body->')||k.startsWith('tail->'));
  content+=table('身体／尾巴格子题：计数包含原协议的两个排列，不能当作独立图像数。',['真值 → 预测','题目计数'],confusion.map(([k,v])=>[k,v]));
 }else if(task==='readout'||task==='decision'){
  const counts=d.action_counts,total=Object.values(counts).reduce((a,b)=>a+b,0);
  content+=table('语义动作分布；包含每个局面的六种排列。',['动作','计数','占比'],['left','straight','right'].map(k=>[k,counts[k]||0,pct((counts[k]||0)/total)]));
  if(Object.values(counts).some(n=>n===total))content+='<p class="callout">这个配置在全部评分事件中选择同一个语义动作。一致性不构成看图正确或决策安全的证据。</p>';
 }
 if(task==='safety')content+=table('Safety 响应诊断',['诊断项','数值','原始比例'],Object.keys(diagnosticNames).filter(k=>k in d).map(k=>[diagnosticNames[k],pct(d[k]),d[k]]));
 if(Object.keys(d.strata).length)content+=table('按安全动作数量分层',['安全动作数','层分数','原始比例'],Object.entries(d.strata).map(([k,v])=>[k,pct(v),v]));
 $('baseline-diagnostics').innerHTML=content;
}
options('baseline-task',tasks.map(t=>[t,taskLabel[t]]));options('baseline-model',models);
for(const id of ['baseline-task','baseline-method','baseline-model'])$(id).addEventListener('change',baseline);
$('baseline-reset').onclick=()=>{$('baseline-task').value='perception';$('baseline-method').value='choice';$('baseline-model').value=models[0][0];baseline();};
baseline();


const audit=D.analysis.permutations;
options('permutation-case',audit.cases.map(c=>[c.id,c.id+' · choice '+(c.methods.choice.consistent?'一致':c.methods.choice.unique_actions+' 动作')]));
options('permutation-order',Array.from({length:6},(_,i)=>[i,'排列 '+i]));
function permutation(){
 const c=audit.cases.find(c=>c.id===$('permutation-case').value),method=$('permutation-method').value,bundle=c.methods[method],r=bundle.orders[+$('permutation-order').value];
 $('permutation-image').src=c.image;text('permutation-hash',c.id+' · 六种排列共用像素 SHA-256 '+c.image_hash);
 text('permutation-safety','环境安全动作：'+Object.entries(c.actions).filter(([,v])=>!v.collision).map(([a])=>a).join(', ')+'。Readout 不以动作安全率判分。');
 text('permutation-question',r.question);$('permutation-options').innerHTML=r.choices.map(([id,label],i)=>`<span class="pill">${'ABC'[i]} · ${esc(label)}</span>`).join('');
 text('permutation-picked',`${method} / 排列 ${r.order}：选择 ${r.action}（位置 ${r.winning_position}）。该局面六种排列${bundle.consistent?'全部一致':'出现 '+bundle.unique_actions+' 种动作'}。`);
 $('permutation-bars').innerHTML=['left','straight','right'].map(a=>{const v=r.candidates.find(v=>v.id===a);return `<div class="bar-row"><span>${a}</span><div class="bar-track"><div class="bar-fill ${a===r.action?'selected':''}" style="width:${v.score*100}%"></div></div><span>${pct(v.score)}</span></div>`}).join('');
 text('permutation-margin','最高分最高分与次高分之差：'+r.margin+'。'+(r.exact_tie?'精确同分：当前选择由候选顺序打破平局。':r.near_tie?'近似同分：微小分数差决定了 argmax。':'不是 ≤ 10⁻⁶ 的近似同分。'));
 $('permutation-orders').innerHTML=bundle.orders.map(v=>`<tr class="${v.order===r.order?'selected':''}"><th>${v.order}</th><td>${v.choices.map(c=>esc(c[0])).join(' / ')}</td><td>${esc(v.action)} · ${v.winning_position}</td>${['left','straight','right'].map(a=>`<td>${pct(v.candidates.find(c=>c.id===a).score)}</td>`).join('')}<td>${v.margin.toPrecision(6)}</td></tr>`).join('');
 text('permutation-raw',JSON.stringify(r,null,2));
}
for(const id of ['permutation-case','permutation-method','permutation-order'])$(id).addEventListener('change',permutation);
const featureLabels=['明显翻转 000','近似同分 001','三个动作 014','稳定对照 011'];
$('permutation-featured').replaceChildren(...audit.featured.map((cid,i)=>{const button=document.createElement('button');button.textContent=featureLabels[i];button.onclick=()=>{$('permutation-case').value=cid;$('permutation-order').value='0';permutation();};return button;}));
$('permutation-reset').onclick=()=>{$('permutation-case').value=audit.cases[0].id;$('permutation-method').value='choice';$('permutation-order').value='0';permutation();};
permutation();

const planBias=D.analysis.plan_bias;
options('plan-bias-plan',planBias.examples.map(p=>[p.id,'seed '+p.seed+' · '+p.title]));
options('plan-bias-order',Array.from({length:6},(_,i)=>[i,'排列 '+i]));
function planBiasCaseOptions(){const p=planBias.examples.find(p=>p.id===$('plan-bias-plan').value);options('plan-bias-case',p.cases.map(c=>[c.id,c.id]));planBiasRender();}
function planBiasRender(){
 const p=planBias.examples.find(p=>p.id===$('plan-bias-plan').value),c=p.cases.find(c=>c.id===$('plan-bias-case').value),method=$('plan-bias-method').value,condition=$('plan-bias-condition').value,order=+$('plan-bias-order').value;
 const r=c.records.find(r=>r.method===method&&r.condition===condition&&r.order===order);
 text('plan-bias-meta',`${planBias.run} · repeat 1 / seed ${p.seed} · thinking ${p.plan.thinking_tokens} (${p.plan.thinking_end}) · plan ${p.plan.plan_tokens} token · 截断 ${p.plan.plan_truncated?'是':'否'}`);
 text('plan-bias-quote',p.quote);$('plan-bias-image').src=c.image;
 text('plan-bias-state',`实际头部朝向：${['up','right','down','left'][c.state.direction]}；安全动作：${Object.entries(c.actions).filter(([,v])=>!v.collision).map(([a])=>a).join(', ')}。`);
 text('plan-bias-question',r.question);text('plan-bias-picked',`${condition} / ${method} / 排列 ${order}：选择 ${r.action} · ${r.safe?'安全':'碰撞'}。`);
 $('plan-bias-bars').innerHTML=['left','straight','right'].map(a=>{const v=r.candidates.find(v=>v.id===a);return `<div class="bar-row"><span>${a}</span><div class="bar-track"><div class="bar-fill ${a===r.action?'selected':''}" style="width:${v.score*100}%"></div></div><span>${pct(v.score)}</span></div>`}).join('');
 $('plan-bias-pairs').innerHTML=Array.from({length:6},(_,o)=>`<tr><th>${o}</th><td>${c.records.find(r=>r.order===o).choices.map(c=>esc(c[0])).join(' / ')}</td>${['no_plan','shared_full','shared_plan_only'].map(cond=>{const v=c.records.find(r=>r.method===method&&r.condition===cond&&r.order===o);return `<td>${v.action} · ${v.safe?'安全':'碰撞'}</td>`;}).join('')}</tr>`).join('');
 text('plan-bias-raw',JSON.stringify(r,null,2));text('plan-bias-text',p.plan.plan_text);text('plan-bias-thinking',p.plan.thinking_text);
}
$('plan-bias-plan').onchange=planBiasCaseOptions;
for(const id of ['plan-bias-case','plan-bias-method','plan-bias-condition','plan-bias-order'])$(id).onchange=planBiasRender;
$('plan-bias-reset').onclick=()=>{$('plan-bias-plan').value=planBias.examples[0].id;$('plan-bias-method').value='yes_no';$('plan-bias-condition').value='shared_full';$('plan-bias-order').value='0';planBiasCaseOptions();};
planBiasCaseOptions();


// Inline-only UI: every number comes from the audited Episode payload.
(()=>{
 if(!D.episode)return;
 const E=D.episode, el=id=>document.getElementById(id), label={no_plan:'无计划',manual_plan:'人工计划',neutral_prefix:'中性前缀',shared_full:'完整 CoT + plan',shared_plan_only:'仅生成 plan',shared_no_think:'直接生成 plan',per_step_cot:'逐步 CoT'};
 const act={left:'左转',straight:'直行',right:'右转'}, fmt=x=>x.toFixed(6), put=(id,s)=>el(id).textContent=s;
 const opts=(id,values,names)=>{el(id).replaceChildren(...values.map((v,i)=>{const o=document.createElement('option');o.value=String(v);o.textContent=names?names[i]:String(v);return o}));};
 const byid=new Map(E.episodes.map(e=>[e.id,e]));
 const configLabel=e=>label[e.condition]+(e.condition.startsWith('shared')?` · ${e.sampling==='model_default'?'default':e.sampling} · plan ${e.plan_tokens}`:e.condition==='per_step_cot'?` · default · thinking ${e.step_thinking_tokens}`:'');
 let current,side;
 opts('ep-model',[...new Set(E.episodes.map(e=>e.model))]);opts('ep-seed',Array.from({length:30},(_,i)=>i));
 const matches=()=>E.episodes.filter(e=>e.model===el('ep-model').value&&e.method===el('ep-method').value);
 function conditions(){const cs=E.rows.filter(r=>r.model===el('ep-model').value&&r.method===el('ep-method').value);opts('ep-condition',cs.map(r=>r.config_id),cs.map(configLabel));repeats();}
 function repeats(){opts('ep-repeat',[...new Set(matches().filter(e=>e.config_id===el('ep-condition').value).map(e=>e.repeat))].sort());load();}
 function load(){
  return window.episodeLoaded=loadCurrent();
 }
 async function loadCurrent(){
  current=matches().find(e=>e.config_id===el('ep-condition').value&&e.repeat===+el('ep-repeat').value&&e.seed===+el('ep-seed').value);
  const selected=current;
  for(const id of ['ep-step','ep-prev','ep-next','ep-download'])el(id).disabled=true;
  el('ep-step-table').replaceChildren();el('ep-chart').replaceChildren();
  put('ep-step-detail','正在加载本配置的逐步轨迹…');
  try{if(!selected.trace)await window.ensureEpisodeTrace(selected);}catch(error){if(current===selected)put('ep-step-detail',error.message+' 可重新选择配置重试。');return;}
  if(current!==selected)return;
  for(const id of ['ep-step','ep-download'])el(id).disabled=false;
  el('ep-step').max=current.steps;el('ep-step').value=1;
  put('ep-outcome',`${current.foods} 份食物 · ${current.steps} 步 · ${current.terminal}。整局 ${current.seconds.toFixed(3)} 秒；开局前计划 ${current.planning_seconds.toFixed(3)} 秒。重复状态 ${(100*current.repeated_state_fraction).toFixed(1)}%。`);
  put('ep-source',`原始记录：${current.source} · ${current.id.split('/').at(-1)} · sampling=${current.sampling} · ${current.condition==='per_step_cot'?'step thinking='+current.step_thinking_tokens+' token 上限':current.condition.startsWith('shared')?'plan='+current.plan_tokens+' token 上限':'本条件无生成阶段'}。`);
  el('ep-step-table').innerHTML=current.trace.map((t,i)=>`<tr><th>${i+1}</th><td>${act[t[3]]}</td><td>${t[4]}</td><td>${fmt(t[0])}</td><td>${fmt(t[1])}</td><td>${fmt(t[2])}</td><td>${fmt(t[0]-t[1]-t[2])}</td></tr>`).join('');
  step();
 }
 function step(){
  if(!current?.trace)return;
  const i=+el('ep-step').value-1,t=current.trace[i];
  put('ep-step-detail',`第 ${i+1} / ${current.steps} 步：${act[t[3]]}，食物 ${t[4]} 份。动作 ${fmt(t[0])} 秒 = 思考 ${fmt(t[1])} + 读出 ${fmt(t[2])} + 本地开销 ${fmt(t[0]-t[1]-t[2])}。`);
  el('ep-prev').disabled=i===0;el('ep-next').disabled=i===current.steps-1;
  const W=Math.max(280,el('ep-chart').clientWidth||920);el('ep-chart').setAttribute('viewBox',`0 0 ${W} 265`);
  const max=Math.max(...current.trace.map(t=>t[0]))*1.12,x=j=>62+j*(W-86)/Math.max(current.steps-1,1),y=v=>221-191*v/max;
  let svg=`<text x="8" y="18" font-size="12" fill="#626f69">秒 / 步</text>`;
  for(let k=0;k<=4;k++){const v=max*k/4;svg+=`<line x1="62" x2="${W-24}" y1="${y(v)}" y2="${y(v)}" stroke="#dce1d6"/><text x="55" y="${y(v)+4}" text-anchor="end" font-size="11" fill="#626f69">${v.toFixed(2)}</text>`;}
  for(const [col,color] of [[0,'#202f2b'],[1,'#65549c']])svg+=`<polyline fill="none" stroke="${color}" stroke-width="2" points="${current.trace.map((t,j)=>`${x(j)},${y(t[col])}`).join(' ')}"/>`;
  current.trace.forEach((t,j)=>{if(t[4]>(j?current.trace[j-1][4]:0))svg+=`<circle cx="${x(j)}" cy="${y(t[0])}" r="5" fill="#245e4b"/>`;});
  svg+=`<line x1="${x(i)}" x2="${x(i)}" y1="25" y2="221" stroke="#9b4938" stroke-dasharray="4 4"/><circle cx="${x(i)}" cy="${y(t[0])}" r="4" fill="#9b4938"/>`;
  for(const j of [...new Set([0,Math.floor((current.steps-1)/2),current.steps-1])])svg+=`<text x="${x(j)}" y="243" text-anchor="middle" font-size="12">${j+1}</text>`;
  el('ep-chart').innerHTML=svg+`<text x="${W/2}" y="262" text-anchor="middle" font-size="12">执行步</text>`;
 }
 el('ep-model').onchange=conditions;el('ep-method').onchange=conditions;el('ep-condition').onchange=repeats;
 el('ep-repeat').onchange=load;el('ep-seed').onchange=load;el('ep-step').oninput=step;
 for(const [id,delta] of [['ep-prev',-1],['ep-next',1]])el(id).onclick=()=>{el('ep-step').value=+el('ep-step').value+delta;step();};
 el('ep-reset').onclick=()=>{el('ep-model').selectedIndex=0;el('ep-method').value='choice';el('ep-seed').value='0';conditions();};
 el('ep-download').onclick=()=>{const lines=['step,action,foods_after,action_seconds,thinking_seconds,readout_seconds,local_seconds',...current.trace.map((t,i)=>[i+1,t[3],t[4],t[0],t[1],t[2],t[0]-t[1]-t[2]].join(','))];const url=URL.createObjectURL(new Blob([lines.join('\n')+'\n'],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=current.run+'-'+current.method+'-'+current.seed+'-steps.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 opts('ec-case',E.cases.map(c=>c.id),E.cases.map(c=>c.title));
 function pickCase(){const c=E.cases[+el('ec-case').value];opts('ec-side',[0,1],c.sides.map(s=>configLabel(byid.get(s.episode_id))));el('ec-side').value='1';pickSide();}
 function pickSide(){side=E.cases[+el('ec-case').value].sides[+el('ec-side').value];el('ec-step').max=side.frames.length;el('ec-step').value=1;el('ec-jump').value='first';drawCase();}
 function drawCase(){
  const e=byid.get(side.episode_id),i=+el('ec-step').value-1,f=side.frames[i];
  put('ec-summary',`${e.model} · ${e.method} · ${configLabel(e)} · seed ${e.seed} · repeat ${e.repeat}。${e.foods} 份食物 / ${e.steps} 步 / ${e.terminal}；整局 ${e.seconds.toFixed(3)} 秒。`);
  el('ec-image').src=E.images[f.image];el('ec-image').alt=`${e.model}，seed ${e.seed}，第 ${i+1} 步前的真实截图`;
  put('ec-state',`动作前：头 (${f.before.body[0].join(', ')})，朝${['上','右','下','左'][f.before.direction]}；食物 (${f.before.food.join(', ')})。坐标从左上角 (0, 0) 开始。`);
  put('ec-step-title',`第 ${i+1} / ${e.steps} 步 · ${act[f.action]}`);
  put('ec-detail',`动作 ${fmt(f.seconds)} 秒；思考 ${fmt(f.thinking)}，读出 ${fmt(f.readout)}，本地 ${fmt(f.seconds-f.thinking-f.readout)} 秒。执行后食物 ${f.after.foods} 份。`);
  el('ec-candidates').innerHTML=f.candidates.map(c=>`<tr${c.id===f.action?' class="selected"':''}><th>${act[c.id]}${c.id===f.action?' ← 选中':''}</th><td>${c.score.toFixed(6)}</td><td>${f.facts[c.id].collision?'否':'是'}</td><td>${f.facts[c.id].approaches_food?'是':'否'}</td></tr>`).join('');
  const safe=Object.keys(f.facts).filter(a=>!f.facts[a].collision).map(a=>act[a]).join('、');
  put('ec-interpret',f.facts[f.action].collision?`本步发生碰撞。可选的立即安全动作：${safe||'无'}。这是可观测的选错动作，不能仅凭此断定模型误认了哪个像素。`:f.after.foods>f.before.foods?'本步吃到食物。继续查看后续步骤，可核对它是否能持续进食。':f.repeated?'此前已见过完全相同的身体、朝向和食物位置。这是轨迹重复的直接证据。':'本步未碰撞。立即安全不保证能持续进食。');
  el('ec-prev').disabled=i===0;el('ec-next').disabled=i===e.steps-1;
  put('ec-plan',side.plan?`思考：\n${side.plan.thinking_text||''}\n\n计划：\n${side.plan.plan_text||''}\n\nplan_truncated=${side.plan.plan_truncated}`:e.condition==='manual_plan'?D.manual.episode:'此条件没有共享计划。');
  put('ec-raw',JSON.stringify(f.candidates,null,2));put('ec-source',`${side.episode_id} · step=${f.step} · screenshot SHA-256 ${f.image}`);
 }
 el('ec-case').onchange=pickCase;el('ec-side').onchange=pickSide;el('ec-step').oninput=drawCase;
 el('ec-jump').onchange=()=>{const k=el('ec-jump').value;let i=k==='last'?side.frames.length-1:k==='food'?side.frames.findIndex(f=>f.after.foods>f.before.foods):k==='repeat'?side.frames.findIndex(f=>f.repeated):0;el('ec-step').value=Math.max(0,i)+1;drawCase();if(i<0)put('ec-interpret',k==='food'?'本局没有进食。已返回第一步。':'本局没有重复状态。已返回第一步。');};
 for(const [id,delta] of [['ec-prev',-1],['ec-next',1]])el(id).onclick=()=>{el('ec-step').value=+el('ec-step').value+delta;drawCase();};
 el('ec-reset').onclick=()=>{el('ec-case').value='0';pickCase();};
 el('ec-latency').onclick=async()=>{const e=byid.get(side.episode_id);el('ep-model').value=e.model;el('ep-method').value=e.method;conditions();el('ep-condition').value=e.config_id;repeats();el('ep-repeat').value=e.repeat;el('ep-seed').value=e.seed;await load();el('ep-step').value=el('ec-step').value;step();el('episode-lab').scrollIntoView({block:'start'});};
 const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
 const buttons=[...document.querySelectorAll('[data-gif-play]')], visible=new Set(), preference=new Map();
 function showGif(i,playing){const button=buttons[i],image=el('episode-gif-'+i),src=playing?E.gifs[i].gif:E.gifs[i].poster;if(image.getAttribute('src')!==src)image.src=src;button.textContent=playing?'暂停 GIF':'播放 GIF';button.setAttribute('aria-pressed',String(playing));}
 function refreshGifs(){buttons.forEach((button,i)=>showGif(i,!document.hidden&&visible.has(i)&&(preference.has(i)?preference.get(i):!motion.matches)));}
 const observer=new IntersectionObserver(entries=>{for(const entry of entries){const i=+entry.target.dataset.gifIndex;if(entry.isIntersecting)visible.add(i);else visible.delete(i);}refreshGifs();},{threshold:0.05});
 buttons.forEach((button,i)=>{const card=button.closest('.episode-gif-card');card.dataset.gifIndex=i;observer.observe(card);button.onclick=()=>{preference.set(i,button.getAttribute('aria-pressed')!=='true');visible.add(i);refreshGifs();};});
 for(const button of document.querySelectorAll('[data-gif-latency]'))button.onclick=async()=>{const e=byid.get(E.gifs[+button.dataset.gifLatency].episode_id);el('ep-model').value=e.model;el('ep-method').value=e.method;conditions();el('ep-condition').value=e.config_id;repeats();el('ep-repeat').value=e.repeat;el('ep-seed').value=e.seed;await load();el('episode-lab').scrollIntoView({block:'start'});};
 for(const link of document.querySelectorAll('[data-gif-download]'))link.href=E.gifs[+link.dataset.gifDownload].gif;
 document.addEventListener('visibilitychange',refreshGifs);
 motion.addEventListener('change',()=>{preference.clear();refreshGifs();});
 conditions();pickCase();requestAnimationFrame(step);window.addEventListener('resize',()=>{if(current)step();});
})();

$('family-source').innerHTML=bundles.map(familyHTML).join('');flow();boardQuestionOptions();matrix();traceOptions();sample();document.documentElement.classList.add('js');
})().catch(error=>{console.error(error);});
