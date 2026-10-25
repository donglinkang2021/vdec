'use strict';
(()=>{
const D=JSON.parse(document.getElementById('drawing-data').textContent),$=id=>document.getElementById(id);
async function prompt(key){return D.prompts[key]||(D.prompts[key]=await fetch(D.prompt_urls[key]).then(r=>r.json()));}
const names={direction:'方向位置',alignment:'对齐与等距',between:'两物体之间',containment:'包含与不相交',relative_size:'相对大小',composition:'多条件组合'};
const ops={tool:'选择工具',color:'选择颜色',move:'移动笔尖',down:'落笔',up:'抬笔',undo:'撤销',finish:'提交'};
let executed=false,graded=false;
function option(value,text){const x=document.createElement('option');x.value=value;x.textContent=text;return x;}
function img(id,key){const i=D.images[key],el=$(id);el.src=i.src;el.width=i.width;el.height=i.height;}
function json(value){return JSON.stringify(value,null,2);}
function track(){return $('replay-track').value;}
function steps(){return D.replays[track()];}
function current(){return steps()[Number($('replay-step').value)];}
function model(){return $('request-model').value;}
function method(){return $('request-method').value;}
function calls(){return current().requests[model()][method()];}
function phaseName(c,i){return c.kind==='coordinate'?'一次 JSON 动作':c.selection?`定位第 ${i} 轮 · ${c.selection[2]} → ${c.selection[2]/3}`:i===0?'选择操作':'选择工具 / 颜色';}
function updateGallery(){const c=D.gallery.find(x=>x.family===$('gallery-family').value),t=$('gallery-track').value;
 $('gallery-task').textContent=c.instruction;img('gallery-before',c.initial);img('gallery-after',c.finals[t].image);
 $('gallery-caption').textContent=`规则参考完成图 · ${c.finals[t].operations} 次操作 · 所有空间要求满足`;
}
function updateReplay(resetQueries=true){const s=current(),i=Number($('replay-step').value);img('replay-before',s.before_image);img('replay-after',s.after_image);
 $('replay-position').textContent=`动作 ${i+1} / ${steps().length} · ${ops[s.action.action]}`;
 $('replay-action').textContent='规则策略示范：'+json(s.action);$('replay-state').textContent=json(s.public_before);
 $('replay-result').textContent=s.metrics?`已提交：${s.metrics.success?'完整成功':'未完成'}；空间关系 ${s.metrics.relations_correct} / ${s.metrics.relations_total}。`:'尚未提交，不向模型提供评分反馈。';
 $('replay-prev').disabled=$('request-prev').disabled=i===0;$('replay-next').disabled=$('request-next').disabled=i===steps().length-1;
 updateRequests(resetQueries);
}
function updateRequests(reset=true){const cs=calls(),old=Number($('request-phase').value)||0;
 $('request-phase').replaceChildren(...cs.map((c,i)=>option(i,phaseName(c,i))));$('request-phase').value=String(reset?0:Math.min(old,cs.length-1));updateRequest();
}
function updateRequest(keepCandidate=false){const cs=calls(),c=cs[Number($('request-phase').value)],m=method();
 const old=Number($('request-candidate').value)||0;
 $('candidate-label').hidden=m!=='yes_no';
 $('request-candidate').replaceChildren(...c.inputs.map((_,i)=>option(i,m==='yes_no'?`${i+1}. ${c.choices[i][1]}`:'完整请求')));
 $('request-candidate').value=String(keepCandidate?Math.min(old,c.inputs.length-1):0);
 updateCandidate();
}
async function updateCandidate(){const cs=calls(),c=cs[Number($('request-phase').value)],m=method(),ci=Number($('request-candidate').value),p=await prompt(c.inputs[ci]);
 img('request-image',c.image);$('request-native').textContent=p.text;$('request-tokens').textContent=json(p.ids);
 $('request-boundary').textContent=p.text.slice(-Math.min(260,p.text.length));
 $('request-rules').textContent=D.rules[track()][m==='coordinate'?'coordinate':'readout'];
 $('request-provenance').textContent=json({...D.models[model()],input_text_token_count:p.ids.length,images:p.images,measurement:'文本 token ID 快照；不包含推理后端展开的视觉 token，未运行推理'});
 const total=cs.reduce((n,q)=>n+q.inputs.length,0);
 $('request-caption').textContent=`${D.models[model()].name} · ${track()} · ${ops[current().action.action]} · 本次环境动作需要 ${total} 个模型请求。当前阶段 ${c.inputs.length} 个请求。`;
 const table=$('request-choices'),body=table.querySelector('tbody');body.replaceChildren();table.hidden=m==='coordinate';
 if(m!=='coordinate')for(const [i,[id,text]] of c.choices.entries()){const row=document.createElement('tr');if(id===c.chosen)row.className='selected-row';
  for(const textValue of [m==='choice'?String.fromCharCode(65+i):`yes / no · ${i+1}`,`${id} · ${text}`,'未测']){const cell=document.createElement('td');cell.textContent=textValue;row.append(cell);}body.append(row);}
 if(m==='coordinate'){$('request-output').textContent=json(current().action);$('request-output-note').textContent='规范 JSON 示范，由规则动作构造；不是模型生成文本。生产解析器不接受额外解释或字段。';}
 else if(m==='choice'){const index=c.choices.findIndex(x=>x[0]===c.chosen);$('request-output').textContent=`被评分的候选 token：${String.fromCharCode(65+index)}\n规则示范选择：${c.chosen}\n最终规范动作：${JSON.stringify(current().action)}`;
  $('request-output-note').textContent='高亮与字母来自规则策略。真实运行比较候选分数后映射到语义选择；参数尚未选完时不会执行最终动作。';}
 else{$('request-output').textContent=`当前候选：${c.choices[ci][0]}\n规则示范判断：${c.choices[ci][0]===c.chosen?'yes':'no'}\n规则示范最终选择：${c.chosen}`;
  $('request-output-note').textContent='真实方法读取每个候选的 yes 与 no 分数，然后归一化比较；这里的 yes/no 仅说明规则答案，不是实测概率或采样结果。';}
 updatePlanning();
}
function moveStep(delta){$('replay-step').value=Math.max(0,Math.min(steps().length-1,Number($('replay-step').value)+delta));updateReplay();}
function localization(){const s=steps().find(s=>s.action.action==='move'),qs=s.requests[model()][method()==='yes_no'?'yes_no':'choice'],level=Number($('localize-level').value);
 $('localize-prev').disabled=level===0;$('localize-next').disabled=level===4;$('localize-execute').disabled=level!==4||executed;
 if(executed){img('localize-image',s.after_image);$('localize-caption').textContent=`现在执行一次 move：(${s.action.x}, ${s.action.y})。此前四轮只有选区变化；环境操作数现在才加 1。`;return;}
 if(level===0){img('localize-image',s.before_image);$('localize-caption').textContent='先选择 move。笔尖仍在原处，尚未进行位置选择，也没有新增墨迹。';return;}
 const c=qs[level],w=c.selection[2],child=w/3,region=Number(c.chosen),x=c.selection[0]+(region-1)%3*child,y=c.selection[1]+Math.floor((region-1)/3)*child;
 img('localize-image',c.image);$('localize-caption').textContent=`第 ${level} 轮：${w} × ${w} → ${child} × ${child}。规则示范选区 ${region}，下一范围 x=${x}…${x+child-1}、y=${y}…${y+child-1}。真实笔尖不动；${level===4?'四轮完成，可以执行落点。':'继续下一轮观察。'} 这里的范围数字是教学说明，不额外输入模型。`;
}
async function updatePlanning(){const c=$('plan-condition').value,root=$('plan-flow');root.replaceChildren();
 const cards=c==='no_plan'?[['当前题目与图片','每次直接构造观察请求'],['候选读出 / JSON','生成或选择下一次动作'],['执行并刷新','重新观察画面']]:[
 ['独立参考图',`按控制器、轨道、seed 分别规划`],
 [c==='shared_no_think'?'独立短计划生成':'共享一次生成',c==='shared_no_think'?'[尚未生成计划]':'[尚未生成推理与计划]'],
 ['注入当前请求',c==='shared_full'?'保留完整推理＋计划':c==='shared_plan_only'?'只保留同次生成的计划':'保留短计划，不带思考过程'],['当前观察','追加新的图片与问题，进行读出或 JSON 动作生成']];
 for(const [title,body]of cards){const card=document.createElement('div'),h=document.createElement('strong'),p=document.createElement('span');h.textContent=title;p.textContent=body;card.append(h,p);root.append(card);}
 $('plan-request').hidden=c==='no_plan';
 const key=D.planning[model()][track()][method()==='coordinate'?'coordinate':'readout'][String(c!=='shared_no_think')],p=await prompt(key);
 img('plan-image',p.images[0]);$('plan-native').textContent=p.text;
}
function grade(){const v=D.variants.find(v=>v.id===$('grader-case').value);img('grader-image',v.image);const root=$('grader-result');root.replaceChildren();
 if(!graded){root.textContent='结果尚未提交；此处不显示评分。';return;}
 const m=v.metrics,h=document.createElement('h4');h.className=m.success?'score-good':'score-bad';h.textContent=m.success?'通过：全部要求满足':'失败：未满足全部要求';root.append(h);
 const rows=[`空间关系：${m.relations_correct} / ${m.relations_total}`,`数量：${m.object_count_correct?'正确':'不符'}`,`颜色错误：${m.color_errors}；工具错误：${m.tool_errors}`,`未完成笔画：${m.unfinished?'有':'无'}`];
 if(m.assignments.some(a=>!a.shape_valid))rows.push('至少一个图形轮廓或边界不合格。');
 for(const text of rows){const p=document.createElement('p');p.className='constraint-list';p.textContent=text;root.append(p);}
}
function undo(){const i=Number($('undo-step').value),s=D.undo[i];img('undo-image',s.image);$('undo-action').textContent=json(s.action);$('undo-prev').disabled=i===0;$('undo-next').disabled=i===D.undo.length-1;
 $('undo-result').textContent=s.metrics?`已提交：${s.metrics.success?'成功':'失败'}。`:`${ops[s.action.action]}；已完成的新增图形 ${s.objects} 个。尚未提交，不显示评分。`;
}
// This walkthrough uses symbolic scores only; no generated model outputs or numeric scores.
let decisionStep=0;
function decisionExample(){return D.replays[$('decision-track').value].find(s=>s.action.action==='move');}
function decisionPath(){
 const m=$('decision-method').value,op=$('decision-op').value,t=$('decision-track').value;
 const seq=[{title:m==='coordinate'?'生成完整 JSON':'选择操作',n:m==='yes_no'?7:1,
  detail:m==='coordinate'?'一次生成动作与所需参数，无九宫格追问。':m==='choice'?'一个请求同时比较 A–G；最高字母映射为 '+op+'。':'七个独立请求各读 yes/no；比较七个归一化分数，选 '+op+'。'}];
 if(m!=='coordinate'){
  if(op==='move')for(let i=0;i<4;i++){
   const q=decisionExample().requests.qwen35[m][i+1],index=q.choices.findIndex(c=>c[0]===q.chosen);
   seq.push({title:`定位 ${i+1} · ${81/3**i} → ${27/3**i}`,n:m==='yes_no'?9:1,
    detail:`${m==='choice'?'一个请求同时比较 A–I':'九个区域各一道 yes/no 题'}；规则路径：${m==='choice'?String.fromCharCode(65+index)+' → 区域 '+q.chosen:'候选区域 '+q.chosen}。只缩小选区，笔尖不动。`});
  }
  if(op==='tool'||op==='color'){
   const n=op==='color'?6:t==='geometry'?3:1;
   seq.push({title:op==='color'?'选择颜色':'选择工具',n:n===1?0:m==='choice'?1:n,
    detail:n===1?'freehand 只有 pen，直接填入，不向模型追问。':`${n} 个候选：${m==='choice'?'一起列在一个请求中':'分别构成 '+n+' 道 yes/no 题'}。`});
  }
 }
 seq.push({title:'环境执行一次',n:0,detail:'参数齐全后执行规范动作，操作预算减 1；刷新图片后才开始下一次决策。'});
 return seq;
}
async function decisionNative(){
 const m=$('decision-method').value,q=decisionExample().requests.qwen35[m][0],ci=Number($('decision-candidate').value)||0;
 $('decision-native').textContent=(await prompt(q.inputs[ci])).text;
}
function updateDecision(reset=false){
 if(reset)decisionStep=0;
 const m=$('decision-method').value,op=$('decision-op').value,s=decisionExample(),cs=s.requests.qwen35.choice[0].choices;
 const index=cs.findIndex(c=>c[0]===op),letter=String.fromCharCode(65+index),seq=decisionPath();
 img('decision-image',s.before_image);$('decision-state').textContent=s.requests.qwen35.choice[0].question;
 $('decision-context').textContent=`固定观察：${$('decision-track').value} 主案例第一次移动前。工具 ${s.public_before.tool}，颜色 ${s.public_before.color}，笔尖${s.public_before.pen_down?'已落下':'抬起'}。三种方法以相同画面和状态为基础。`;
 $('decision-question-title').textContent=m==='coordinate'?'① 输入要求与输出格式示范':'① 输入问题（中文阅读版）';
 $('decision-question').textContent=m==='choice'?`[规则 + 当前图片 + 题目与状态]\n选择接下来的操作：\n${cs.map(([id],i)=>String.fromCharCode(65+i)+'. '+ops[id]+' · '+id).join('\n')}\n[assistant 回答边界]\\boxed{`:m==='yes_no'?cs.map(([id],i)=>`请求 ${i+1}：[相同规则 + 图片 + 题目与状态]\n“${ops[id]}”是否是当前最佳操作？\n[assistant 回答边界]\\boxed{`).join('\n\n'):'[规则 + 当前图片 + 题目与状态]\n请生成下一步动作的 JSON。\n没有预填 boxed，没有 A–G 候选评分。';
 $('decision-readout').textContent=m==='choice'?'读取 A–G 七个 token 的 log-prob → 在七项中归一化 → 取最大项。一次请求能评分多个候选。':m==='yes_no'?'每题一次读出 yes 和 no 两个 log-prob → 计算 qᵢ → 七个 q 再归一化为 sᵢ → 取最大项。不是对七个 yes/no 做多数投票。':'生成完整 JSON 文本 → 严格解析 → 环境执行。不是先另发一个请求选择操作。';
 $('decision-scores').hidden=m==='coordinate';const body=$('decision-scores').querySelector('tbody');body.replaceChildren();
 for(const [i,[id]]of cs.entries()){
  const row=document.createElement('tr');if(id===op)row.className='selected-row';
  for(const v of [m==='choice'?String.fromCharCode(65+i)+' → '+id:`题 ${i+1} → ${id}`,m==='choice'?`s${String.fromCharCode(65+i)} · 未测`:`q${i+1} → s${i+1} · 未测`,id===op?'假设此项最高 → 选中':'未测']){const td=document.createElement('td');td.textContent=v;row.append(td);}body.append(row);
 }
 $('decision-selection').textContent=m==='coordinate'?`输出格式的教学示范选择 ${op}；没有展示真实生成文本。`:`② 教学假设：${m==='choice'?letter+' 的 s':'候选 '+op+' 的 q / s'} 最高 → 程序选中 ${op}（${ops[op]}）。${op==='move'?'还没有坐标，现在不能移动。':['tool','color'].includes(op)?'还需要补齐参数。':'参数已齐全，无需追问位置。'}`;
 const ci=Number($('decision-candidate').value)||0,q=s.requests.qwen35[m][0];
 $('decision-candidate-label').hidden=m!=='yes_no';$('decision-candidate').replaceChildren(...q.inputs.map((_,i)=>option(i,m==='yes_no'?`请求 ${i+1} · ${cs[i][0]}`:'完整请求')));$('decision-candidate').value=String(Math.min(ci,q.inputs.length-1));decisionNative();
 const list=$('decision-stages');list.replaceChildren();
 for(const [i,phase]of seq.entries()){
  const item=document.createElement('li'),title=document.createElement('strong'),desc=document.createElement('span');
  item.className=i<decisionStep?'done':'';if(i===decisionStep)item.classList.add('next');
  title.textContent=`${i+1}. ${phase.title} · +${phase.n} 请求`;desc.textContent=phase.detail;item.append(title,desc);list.append(item);
 }
 const requests=seq.slice(0,decisionStep).reduce((n,p)=>n+p.n,0),total=seq.reduce((n,p)=>n+p.n,0),executed=decisionStep===seq.length;
 $('decision-progress').textContent=`教学累计：${requests} / ${total} 个模型请求，${executed?1:0} / 1 次环境动作。${executed?'本次决策结束。':decisionStep===0?'尚未发起请求。':'参数选择期间环境尚未执行。'}完整请求算式：${seq.slice(0,-1).map(p=>p.n).join(' + ')} = ${total}。`;
 const action={action:op};if(op==='move')Object.assign(action,{x:s.action.x,y:s.action.y});if(op==='tool')action.tool=$('decision-track').value==='freehand'?'pen':'rectangle';if(op==='color')action.color='red';
 $('decision-action').textContent=(executed?'交给环境的规范动作（教学示例）：\n':'参数齐全后才会交给环境（教学示例）：\n')+json(action);
 $('decision-prev').disabled=decisionStep===0;$('decision-next').disabled=executed;
}
for(const id of ['decision-method','decision-op','decision-track'])$(id).onchange=()=>updateDecision(true);
$('decision-candidate').onchange=decisionNative;
$('decision-next').onclick=()=>{decisionStep++;updateDecision();};$('decision-prev').onclick=()=>{decisionStep--;updateDecision();};$('decision-reset').onclick=()=>updateDecision(true);
$('decision-inspect').onclick=()=>{
 $('replay-track').value=$('decision-track').value;$('replay-step').max=steps().length-1;$('replay-step').value=steps().findIndex(s=>s.action.action==='move');
 $('request-model').value='qwen35';$('request-method').value=$('decision-method').value;executed=false;$('localize-level').value=0;updateReplay();localization();
 $('inputs').scrollIntoView();$('request-phase').focus({preventScroll:true});
};
updateDecision();

$('gallery-family').replaceChildren(...D.gallery.map(c=>option(c.family,names[c.family])));$('gallery-family').value='between';
$('gallery-family').onchange=$('gallery-track').onchange=updateGallery;
$('replay-step').max=steps().length-1;$('replay-step').oninput=()=>updateReplay();
$('replay-prev').onclick=$('request-prev').onclick=()=>moveStep(-1);$('replay-next').onclick=$('request-next').onclick=()=>moveStep(1);$('replay-reset').onclick=()=>{$('replay-step').value=0;updateReplay();};
$('replay-track').onchange=()=>{$('replay-step').max=steps().length-1;$('replay-step').value=0;executed=false;$('localize-level').value=0;updateReplay();localization();};
$('request-model').onchange=$('request-method').onchange=()=>{updateRequests(false);localization();};
$('request-phase').onchange=()=>updateRequest();$('request-candidate').onchange=updateCandidate;
$('localize-level').oninput=()=>{executed=false;localization();};
for(const [id,d]of [['localize-prev',-1],['localize-next',1]])$(id).onclick=()=>{$('localize-level').value=Number($('localize-level').value)+d;executed=false;localization();};
$('localize-reset').onclick=()=>{$('localize-level').value=0;executed=false;localization();};$('localize-execute').onclick=()=>{executed=true;localization();};
$('plan-condition').onchange=updatePlanning;
$('grader-case').replaceChildren(...D.variants.map(v=>option(v.id,v.label)));$('grader-case').onchange=()=>{graded=false;grade();};$('grader-submit').onclick=()=>{graded=true;grade();};
$('undo-step').max=D.undo.length-1;$('undo-step').value=D.replays.geometry.length-2;$('undo-step').oninput=undo;
for(const [id,d]of [['undo-prev',-1],['undo-next',1]])$(id).onclick=()=>{$('undo-step').value=Number($('undo-step').value)+d;undo();};
$('undo-reset').onclick=()=>{$('undo-step').value=D.replays.geometry.length-2;undo();};
$('provenance').textContent=json({protocol:D.config,models:D.models,source_hashes:D.source_hashes,evidence:D.evidence.map(r=>({source:r.source,hashes:r.hashes,conditions:r.config})),model_inference_performed:false});
$('download-html').href=location.href.split('#')[0];$('download-html').download='/vdec/benchmarks/drawing/guide/';$('download-html').textContent='下载此单文件 HTML ↓';
updateGallery();updateReplay();localization();grade();undo();document.documentElement.classList.add('js-ready');
window.drawingArticle={data:D,current,localizationState:()=>({level:Number($('localize-level').value),executed}),gradeVisible:()=>graded};
})();
