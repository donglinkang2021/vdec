'use strict';
(() => {
const D = JSON.parse(document.getElementById('article-data').textContent);
// Expand interned request metadata; all prompt text still comes from Python.
const shared = D.templates.shared_values;
for (const model of D.templates.models) {
  for (const conditions of Object.values(model.requests)) {
    for (const methods of Object.values(conditions)) {
      for (const bundle of Object.values(methods)) {
        bundle.result = shared[bundle.result_ref]; delete bundle.result_ref;
        for (const call of bundle.calls) { Object.assign(call, shared[call.meta_ref]); delete call.meta_ref; }
      }
    }
  }
}
delete D.templates.shared_values;
document.querySelectorAll('[data-loading-control]').forEach(node=>{node.disabled=false;});
const $ = id => document.getElementById(id);
const A = ['left','straight','right'], names = {left:'左转',straight:'直行',right:'右转'};
const CN = {up:'上方',down:'下方',left:'左侧',right:'右侧',aligned:'对齐',head:'蓝色头部',empty:'空格',food:'食物',body:'普通身体',tail:'尖尾',outside:'棋盘外',collision:'立即碰撞',safe:'不会立即碰撞',available:'至少有一个安全动作',trapped:'三个动作都会立即撞'};
const pct = v => v == null ? '—' : `${(v*100).toFixed(v === 0 || v === 1 ? 0 : 1)}%`;
const num = n => n.toLocaleString('zh-CN');
const safeText = c => c.safe.length ? c.safe.map(a=>names[a]).join('、') : '无安全动作 · 下一步必死';
function board(id, imageId, alt, target=null, safe=true) {
  const node = typeof id === 'string' ? $(id) : id;
  node.replaceChildren();
  const img = document.createElement('img'); img.src = D.images[imageId]; img.alt = alt; img.width=320;img.height=320;
  node.append(img);
  if (target) {
    const ns='http://www.w3.org/2000/svg', svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 320 320');svg.setAttribute('aria-hidden','true');
    const rect=document.createElementNS(ns,'rect');
    rect.setAttribute('x',Math.max(1,Math.min(289,target[0]*32+1)));rect.setAttribute('y',Math.max(1,Math.min(289,target[1]*32+1)));
    rect.setAttribute('width','30');rect.setAttribute('height','30');rect.setAttribute('rx','3');rect.setAttribute('fill',safe?'#d5ff6c35':'#ff635e55');rect.setAttribute('stroke',safe?'#d5ff6c':'#ff867a');rect.setAttribute('stroke-width','2');
    if(target.some(v=>v<0||v>9))rect.setAttribute('stroke-dasharray','4 3');
    svg.append(rect);node.append(svg);
  }
}
function option(value,text){const o=document.createElement('option');o.value=value;o.textContent=text;return o;}
function bars(id, rows) {
  $(id).replaceChildren();
  rows.forEach(({label,value,danger=false})=>{const row=document.createElement('div');row.className='bar-row';
    const title=document.createElement('span');title.textContent=label;
    const track=document.createElement('div');track.className='bar-track';
    const fill=document.createElement('div');fill.className='bar-fill'+(danger?' danger':'');fill.style.width=`${Math.max(0,Math.min(1,value||0))*100}%`;track.append(fill);
    const out=document.createElement('output');out.textContent=pct(value);row.append(title,track,out);$(id).append(row);
  });
}
function safeStrip(node,c){node.replaceChildren();A.forEach(a=>{const span=document.createElement('span');span.textContent=`${names[a]} ${c.safe.includes(a)?'✓':'×'}`;span.className=c.safe.includes(a)?'':'danger';node.append(span);});}

// The one-step lesson uses exported Python step() outputs, including food spawning.
const heroCases = D.suites.safety.filter(id => D.cases[id].safe.length===1).concat(D.suites.safety.filter(id=>D.cases[id].safe.length===0).slice(0,2));
let heroIndex=0;
function renderHero(){const c=D.cases[heroCases[heroIndex]];board('hero-board',c.image,'待选择动作的真实局面');$('hero-case').textContent=c.id;$('hero-result').hidden=true;$('hero-feedback').textContent='选好后再揭晓。多个动作安全时，选任何一个都可以。';$('hero-feedback').className='feedback';document.querySelectorAll('#hero-actions button').forEach(b=>b.setAttribute('aria-pressed','false'));}
function heroChoose(a){const c=D.cases[heroCases[heroIndex]], after=c.after[a], safe=c.safe.includes(a);const target=after.target;const kind=target.every((v,i)=>v===c.state.body.at(-1)[i])?'tail':target.every((v,i)=>v===c.state.food[i])?'food':'empty';
  board('hero-board',c.image,'行动前：高亮目标格',after.target,safe);board('hero-after',after.image,'执行所选动作后的真实状态');$('hero-result').hidden=false;
  const why=!safe?(after.state.terminal==='wall'?'目标在棋盘外，会撞墙。':'目标是尚未腾空的身体，会撞身。'):kind==='tail'?'这是尖尾所在格；不进食时尾巴同时腾空，所以可以进入。':kind==='food'?'这一步会吃到食物，身体增长一格。':'目标格没有障碍，这一步安全。';
  $('hero-feedback').textContent=`${names[a]}：${why} ${safe?'这里只保证这一步。':'你可以换个动作试试。'}`;$('hero-feedback').className=`feedback ${safe?'good':'bad'}`;
  document.querySelectorAll('#hero-actions button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.action===a)));
}
document.querySelectorAll('#hero-actions button').forEach(b=>b.addEventListener('click',()=>heroChoose(b.dataset.action)));
$('hero-reveal').onclick=()=>{$('hero-feedback').textContent=`环境真值：${safeText(D.cases[heroCases[heroIndex]])}。`;$('hero-feedback').className='feedback';};
$('hero-reset').onclick=renderHero;$('hero-next').onclick=()=>{heroIndex=(heroIndex+1)%heroCases.length;renderHero();};renderHero();

const stageText={perception:'只看画面：认方向、找食物和尾巴、辨认指定格子。每图十题，四类等权，最后只报告感知准确率。这里不问转向结果和碰撞。',readout:'同一截图的三个动作重排六次。如果六次都选择同一个实际动作，这张图就算一致。只报告动作排列一致率；固定左转也能满分，因此它不是安全能力成绩。',safety:'分别判断左转、直行、右转是否碰撞，三个判断全对才算完整识别安全集合。3/2/1/0 四层等权，下一步必死的空集合也计入，最后只报告一个准确率。'};
document.querySelectorAll('#stage-tabs button').forEach(b=>b.onclick=()=>{document.querySelectorAll('#stage-tabs button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));$('stage-detail').textContent=stageText[b.dataset.stage];});$('stage-detail').textContent=stageText.perception;

let explorerIds=[];
function filterCases(){const suite=$('suite').value,split=$('split').value,k=$('stratum').value;
  $('split-label').hidden=false;
  const base=D.suites[suite].filter(id=>split==='all'||D.cases[id].split===split);
  explorerIds=base.filter(id=>k==='all'||D.cases[id].safe.length===Number(k));
  $('distribution').replaceChildren();
  [3,2,1,0].forEach(n=>{const cell=document.createElement('div'),count=base.filter(id=>D.cases[id].safe.length===n).length;cell.innerHTML=`<strong>${count}</strong><span>${n} 个安全动作</span>`;$('distribution').append(cell);});
  $('distribution-note').textContent=`${suite}${' / '+split} · 当前划分的分层组成`;
  $('explorer-count').textContent=`当前筛选 ${explorerIds.length} 个局面 / 此划分共 ${base.length} 个`;
  $('case-select').replaceChildren(...explorerIds.map(id=>option(id,id)));
  $('case-select').disabled=!explorerIds.length;$('case-prev').disabled=!explorerIds.length;$('case-next').disabled=!explorerIds.length;
  if(explorerIds.length)renderCase();else{$('explorer-board').replaceChildren();$('explorer-safe').textContent='这个局面集没有所选层级。';$('case-note').textContent='试试“全部层级”，或切换到 safety。';}
}
function renderCase(){const c=D.cases[$('case-select').value];board('explorer-board',c.image,`${c.id}，${c.safe.length} 个安全动作`);safeStrip($('explorer-safe'),c);$('case-note').textContent=c.family_id?`${c.family_id} · ${c.split==='dev'?'开发集':'测试集'}${c.pair_kind?' · 配对类型：'+({tail:'尾巴身份',obstacle:'尾端占用',food:'食物位置'}[c.pair_kind]):' · 单局面'}。${c.safe.length===0?'下一步必死；空安全集合进入 Safety 主指标。':''}`:`${c.group} · 构造局面。`;}
['suite','split','stratum'].forEach(id=>$(id).onchange=filterCases);$('case-select').onchange=renderCase;
for(const [id,direction] of [['case-prev',-1],['case-next',1]])$(id).onclick=()=>{const i=explorerIds.indexOf($('case-select').value);$('case-select').value=explorerIds[(i+direction+explorerIds.length)%explorerIds.length];renderCase();};filterCases();
const pairNames={tail:'尾巴身份',obstacle:'尾端占用',food:'食物位置'};
D.pairs.forEach((p,i)=>$('pair-select').append(option(String(i),`${String(i+1).padStart(2,'0')} · ${pairNames[p.kind]} / ${p.split}`)));
function renderPair(){const p=D.pairs[Number($('pair-select').value)],mode=$('pair-view').value;const old=p.kind==='tail'&&$('pair-ui').value==='old';$('pair-ui-label').hidden=p.kind!=='tail';
  const root=$('pair-boards');root.replaceChildren();root.className='pair-grid'+(mode==='both'?'':' single');
  p.cases.forEach((id,i)=>{if(mode!=='both'&&mode!==(i?'b':'a'))return;const c=D.cases[id],panel=document.createElement('div'),title=document.createElement('p'),b=document.createElement('div'),caption=document.createElement('div');title.className='mini-label';title.textContent=`${i?'B':'A'} · ${id}`;b.className='board';board(b,old?c.classic:c.image,`${i?'B':'A'}局面，${old?'旧':'新'}UI`);caption.className='safe-strip';safeStrip(caption,c);panel.append(title,b,caption);root.append(panel);});
  const text={tail:old?'旧 UI：两张截图完全相同，却有不同的安全答案。看不见的尾巴身份，让这道题在单帧上无法确定。':'新 UI：占用格、头部和食物都相同，连接顺序与尖尾位置不同。进入的是身体还是会腾空的尾巴，决定这一步能不能走。',obstacle:'B 比 A 少了一个尾端占用格，使它前面的一格变成了新的尖尾。原本会撞到的身体格，现在可以随尾巴腾空而进入。',food:'只移动食物，身体和朝向不变。追食物的方向可以改变，但三个动作是否立即碰撞不应改变。'};
  $('pair-explanation').textContent=text[p.kind];
}
['pair-select','pair-view','pair-ui'].forEach(id=>$(id).onchange=renderPair);renderPair();

const T=D.templates;
let quizIndex=0;
const selection={benchmark:'perception',probe:'heading',model:'qwen35',condition:'no_plan',method:'choice',order:0,candidate:0};
const currentCase=()=>D.cases[D.suites[selection.benchmark][quizIndex]];
const unpack=ids=>ids.map(i=>T.fragments[i]).join('');
function questionTitle(q){if(q.id==='action')return selection.benchmark==='decision'?'哪个动作能避免下一步撞墙或撞身？（多个安全动作都接受）':'下一步选择哪个动作？（本榜只比较排列一致性）';if(q.id.startsWith('cell_')){const match=q.text?.match(/column (\d+), row (\d+)/);return match?`第 ${match[1]} 列、第 ${match[2]} 行里是什么？（左上角为第 1 列、第 1 行）`:'指定坐标的格子里是什么？';}if(q.id==='tail_x')return'相对蛇头，尖尾在左边、同一列，还是右边？';if(q.id==='tail_y')return'相对蛇头，尖尾在上方、同一行，还是下方？';if(q.id==='heading')return'蓝色头部的白色箭头，指向哪个绝对方向？';if(q.id==='food_x')return'相对蛇头，食物在左边、同一列，还是右边？';if(q.id==='food_y')return'相对蛇头，食物在上方、同一行，还是下方？';if(q.id==='survival')return'是否至少还有一个不会立即碰撞的动作？';const a=q.id.split('_').at(-1);if(q.id.startsWith('turn_'))return`如果${names[a]}，下一步会朝哪个绝对方向移动？`;if(q.id.startsWith('target_'))return`执行${names[a]}之前，目标格里是什么？`;return`${names[a]}会立即撞墙或撞到身体吗？`;}
function quizQuestions(){return currentCase().questions;}
function selectedTask(){const cid=currentCase().id;const tid=T.bindings[cid][selection.probe][selection.order];return T.tasks.find(t=>t.id===tid);}
function selectedBundle(){const model=T.models.find(m=>m.id===selection.model);return model.requests[selectedTask().id][selection.condition][selection.method];}
function syncControls(){
  const qs=quizQuestions();if(!qs.some(q=>q.id===selection.probe))selection.probe=qs[0].id;
  const count=T.bindings[currentCase().id][selection.probe].length;if(selection.order>=count)selection.order=0;
  for(const prefix of ['quiz']){
    $(prefix==='quiz'?'quiz-mode':'template-task').value=selection.benchmark;
    $(prefix+'-question').replaceChildren(...qs.map(q=>option(q.id,questionTitle(q))));$(prefix+'-question').value=selection.probe;
    for(const key of ['model','condition','method'])$(prefix+'-'+key).value=selection[key];
    $(prefix+'-order').replaceChildren(...Array.from({length:count},(_,i)=>option(String(i),i===0?'原始排列':`排列 ${i+1}`)));$(prefix+'-order').value=String(selection.order);
    const calls=selectedBundle().calls;if(selection.candidate>=calls.length)selection.candidate=0;
    $(prefix+'-candidate').replaceChildren(...calls.map((c,i)=>option(String(i),c.candidate||'全部选项')));$(prefix+'-candidate').value=String(selection.candidate);
    $(prefix+'-candidate').disabled=selection.method==='choice';
  }
}
function renderQuiz(){const c=currentCase(),q=quizQuestions().find(q=>q.id===selection.probe),task=selectedTask();
  board('quiz-board',c.image,`答题用局面 ${c.id}`);$('quiz-title').textContent=questionTitle(q);$('quiz-category').textContent=`${selection.benchmark} / ${c.id}`;
  $('quiz-original').textContent=q.text;$('quiz-original-options').textContent=task.choices.map(([_,text],i)=>`${String.fromCharCode(65+i)}. ${text}`).join('\n');

  $('quiz-feedback').textContent=selection.benchmark==='readout'?'这里没有动作正确答案；正式评测比较六次排列是否选择同一个动作。':'先选一个答案。';$('quiz-feedback').className='feedback';$('quiz-answers').replaceChildren();
  task.choices.forEach(([id],i)=>{const b=document.createElement('button');let label=q.id==='action'?names[id]:CN[id]||id;if(id==='aligned')label=q.id.endsWith('_x')?'同一列':'同一行';b.textContent=`${String.fromCharCode(65+i)}. ${label}`;
    b.onclick=()=>{const correct=q.id==='action'?c.safe.includes(id):id===q.answer;
      $('quiz-feedback').textContent=selection.benchmark==='readout'?`你选择了${names[id]}。换一个排列后，是否还会选择同一个实际动作？一致不代表游戏策略最优。`:q.id==='action'?`${correct?'这个选择安全。':'这一步会碰撞。'}环境真值：${safeText(c)}。`:`${correct?'答对了。':'再看看：'}正确答案为 ${CN[q.answer]||q.answer}。`;
      $('quiz-feedback').className='feedback '+(selection.benchmark==='readout'?'':correct?'good':'bad');
      $('quiz-answers').querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
    };$('quiz-answers').append(b);
  });
}
function updateSelection(){syncControls();renderQuiz();renderInputLinks();}
for(const prefix of ['quiz']){
 T.models.forEach(m=>$(prefix+'-model').append(option(m.id,m.label)));
 if(prefix==='template')Object.keys(D.suites).forEach(t=>$('template-task').append(option(t,t)));
 if(prefix==='quiz')['no_plan','shared_full','shared_plan_only','shared_no_think'].forEach(c=>$('quiz-condition').append(option(c,c)));
 for(const key of ['model','condition','method','order','candidate'])$(prefix+'-'+key).onchange=()=>{selection[key]=['order','candidate'].includes(key)?Number($(prefix+'-'+key).value):$(prefix+'-'+key).value;updateSelection();};
 $(prefix+'-question').onchange=()=>{selection.probe=$(prefix+'-question').value;selection.order=0;updateSelection();};
 $(prefix==='quiz'?'quiz-mode':'template-task').onchange=()=>{selection.benchmark=$(prefix==='quiz'?'quiz-mode':'template-task').value;quizIndex=0;selection.order=0;updateSelection();};
}
$('case-open-question').onclick=()=>{if(!$('case-select').value)return;selection.benchmark=$('suite').value;quizIndex=D.suites[selection.benchmark].indexOf($('case-select').value);selection.order=0;updateSelection();$('questions').scrollIntoView();};
$('quiz-next-case').onclick=()=>{quizIndex=(quizIndex+1)%D.suites[selection.benchmark].length;updateSelection();};
$('decision-try').onclick=()=>{selection.benchmark='decision';quizIndex=0;selection.order=0;updateSelection();$('questions').scrollIntoView();};
D.primary_baselines.decision.forEach(m=>$('decision-policy').append(option(m.policy,m.label)));
$('decision-policy').onchange=()=>bars('decision-bars',[{label:'两层等权动作安全率',value:D.primary_baselines.decision.find(m=>m.policy===$('decision-policy').value).score}]);$('decision-policy').onchange();

const orders=[['left','straight','right'],['left','right','straight'],['straight','left','right'],['straight','right','left'],['right','left','straight'],['right','straight','left']];
orders.forEach((order,i)=>$('score-order').append(option(String(i),order.map(a=>names[a]).join(' / '))));
let scoreValues={choice:[-1,-2,-3],yes_no:[2,-1,0]};
function softmax(values){const m=Math.max(...values),w=values.map(v=>Math.exp(v-m)),sum=w.reduce((a,b)=>a+b,0);return w.map(v=>v/sum);}
function scoring(values,method){if(method==='choice')return softmax(values);const qs=values.map(v=>1/(1+Math.exp(-v))),sum=qs.reduce((a,b)=>a+b,0);return qs.map(v=>v/sum);}
function renderScoreInputs(){const method=$('score-method').value;$('score-inputs').replaceChildren();A.forEach((a,i)=>{const div=document.createElement('div');div.className='range-row';const label=document.createElement('label');label.htmlFor=`score-${a}`;label.append(document.createTextNode(names[a]));const out=document.createElement('output');out.id=`score-value-${a}`;label.append(out);const input=document.createElement('input');input.id=`score-${a}`;input.type='range';input.min=method==='choice'?-8:-6;input.max=method==='choice'?0:6;input.step=.1;input.value=scoreValues[method][i];input.oninput=()=>{scoreValues[method][i]=Number(input.value);updateScores();};div.append(label,input);$('score-inputs').append(div);});updateScores();}
function updateScores(){const method=$('score-method').value,order=orders[Number($('score-order').value)],values=scoreValues[method],weights=scoring(values,method);
  A.forEach((a,i)=>{$(`score-value-${a}`).textContent=method==='choice'?`log-prob ${values[i].toFixed(1)}`:`yes/no 差值 ${values[i].toFixed(1)} · q=${pct(1/(1+Math.exp(-values[i])))}`;});
  $('score-prompt').textContent=method==='choice'?`当前截图 → 同一题目 → 全部选项\n${order.map((a,i)=>`${'ABC'[i]}. ${names[a]}`).join('    ')}\n读取回答位置的候选字母分数。`:`当前截图 → 同一题目 → 分别发出三个候选请求\n${order.map(a=>`“${names[a]}是这个问题的最佳答案吗？”`).join('\n')}\n每个请求只询问当前候选，不展示其他选项或字母。`;
  bars('score-bars',order.map((a,i)=>({label:method==='choice'?`${'ABC'[i]} · ${names[a]}`:names[a],value:weights[A.indexOf(a)]})));
  const chosen=order.reduce((best,a)=>weights[A.indexOf(a)]>weights[A.indexOf(best)]?a:best,order[0]);$('score-selected').textContent=`这个教学例子选择：${names[chosen]}。${new Set(values).size===1?'分数相同，取当前排列中的第一个最高值。':''}`;
  $('score-explanation').textContent=method==='choice'?'滑块调整候选字母的教学 log-prob，经 softmax 得到相对分数。本例把数值绑定到动作，方便观察标签变化；真实模型可能受到选项顺序影响。':'滑块先改变每个候选的 yes/no 倾向，再对三项 q 归一化。最终仍只选择一个动作；换排列可能改变并列时的结果。';
}
$('score-method').onchange=renderScoreInputs;$('score-order').onchange=updateScores;$('score-tie').onclick=()=>{scoreValues[$('score-method').value]=[$('score-method').value==='choice'?-2:0,$('score-method').value==='choice'?-2:0,$('score-method').value==='choice'?-2:0];renderScoreInputs();};renderScoreInputs();

const metricNames={perception:'感知准确率',readout:'动作排列一致率',safety:'安全集合准确率',decision:'动作安全率'};
function metricOptions(){$('metric-policy').replaceChildren(...D.primary_baselines[$('metric-task').value].map(m=>option(m.policy,m.label)));renderMetrics();}
function renderMetrics(){const task=$('metric-task').value,m=D.primary_baselines[task].find(m=>m.policy===$('metric-policy').value);bars('metric-bars',[{label:metricNames[task],value:m.score}]);
 $('metric-lesson').textContent=task==='readout'?'一致率只测是否受选项顺序影响。固定左转得到 100%，固定答 A 得到 0%；这都不能单独告诉你动作是否安全。':task==='safety'?'全部答安全只能识别 3 动作层；全部答危险只能识别 0 动作层。四层等权后，两种常量回答都只有 25%。':'朝向、食物位置、尾巴位置、坐标格子内容四类等权。格子题较多，但不会因此压过其他视觉能力。';
 $('metric-denominator').textContent=`${task} 专用图片 / all · ${m.expected_cases} 个局面。${task==='safety'?'包括 18 个下一步必死局面。':task==='readout'?'108 张全安全截图，每图六种排列。':'每图十题，每题两种答案顺序。'}这是基线或环境真值参照，不是模型实测。`;
}
$('metric-task').onchange=metricOptions;$('metric-policy').onchange=renderMetrics;metricOptions();

let frame=0,timer=null;const frames=D.replay.steps;$('replay-timeline').max=frames.length-1;
const terminalText={wall:'撞墙，游戏结束',body:'撞身，游戏结束',step_limit:'达到观察步数上限；不是死亡',board_full:'棋盘已填满'};
function pause(){if(timer!==null)clearInterval(timer);timer=null;$('replay-play').textContent='播放';}
function renderReplay(){const f=frames[frame];board('replay-before',f.before_image,`第 ${frame+1} 步决策前`);board('replay-after',f.after_image,`第 ${frame+1} 步执行后`);$('replay-label').textContent=`规则策略演示 · seed ${D.replay.seed} · ${D.replay.limit} 步上限`;$('replay-action').textContent=`选择：${names[f.action]} → ${f.facts[f.action].collision?'碰撞':'这一步安全'}`;$('replay-stats').textContent=`食物 ${f.before.foods} → ${f.after.foods} · 蛇长 ${f.after.body.length} · 已执行 ${f.after.steps} 步`;$('replay-position').textContent=`${frame+1} / ${frames.length}`;$('replay-timeline').value=frame;$('replay-prev').disabled=frame===0;$('replay-next').disabled=frame===frames.length-1;$('replay-status').textContent=f.after.terminal?terminalText[f.after.terminal]:'执行结果成为下一次决策的输入。可以暂停，逐步观察头部、尾巴与食物的变化。';bars('replay-weights',f.weights.map(r=>({label:names[r.id],value:r.value})));}
function play(){if(timer!==null){pause();return;}if(frame===frames.length-1)frame=0;renderReplay();$('replay-play').textContent='暂停';timer=setInterval(()=>{if(frame>=frames.length-1){pause();return;}frame++;renderReplay();if(frame===frames.length-1)pause();},Number($('replay-speed').value));}
$('replay-play').onclick=play;$('replay-next').onclick=()=>{pause();frame=Math.min(frames.length-1,frame+1);renderReplay();};$('replay-prev').onclick=()=>{pause();frame=Math.max(0,frame-1);renderReplay();};$('replay-reset').onclick=()=>{pause();frame=0;renderReplay();};$('replay-timeline').oninput=()=>{pause();frame=Number($('replay-timeline').value);renderReplay();};$('replay-speed').onchange=()=>{if(timer!==null){pause();play();}};document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});renderReplay();

const conditions=['no_plan','shared_full','shared_plan_only','shared_no_think'];
conditions.forEach(c=>{const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=c;input.checked=c==='no_plan';label.append(input,document.createTextNode(' '+c));$('calc-conditions').append(label);});
const checked=id=>[...$(id).querySelectorAll('input:checked')].map(e=>e.value);
function calculate(){const benchmark=$('calc-benchmark').value;
 const split=$('calc-split').value,methods=checked('calc-methods'),selected=checked('calc-conditions'),valid=methods.length&&selected.length;
 $('calc-error').hidden=Boolean(valid);$('calc-error').textContent='请至少选择一种读出方法和一个规划条件。';$('copy-command').disabled=!valid;$('copy-status').textContent='';
 if(!valid){$('calc-totals').replaceChildren();$('calc-command').textContent='请先完成上面的选择。';$('calc-detail').textContent='';return;}
 const matrix=D.benchmark_matrix[`${benchmark}:${split}`],atoms=matrix.atoms.filter(a=>methods.includes(a.method)&&selected.includes(a.condition)),scores=atoms.reduce((n,a)=>n+a.scores,0),requests=atoms.reduce((n,a)=>n+a.requests,0),plans=new Set(atoms.flatMap(a=>a.plans)),planRequests=[...plans].reduce((n,k)=>n+(k.endsWith('cot')?2:1),0);
 $('calc-totals').innerHTML=`<div><strong>${num(matrix.cases)}</strong><span>固定局面 · 不是独立 family 数</span></div><div><strong>${num(scores)}</strong><span>评分调用 · engine.score</span></div><div><strong>${num(requests)}</strong><span>候选请求 · 不含规划</span></div>`;
 $('calc-detail').textContent=`只测 ${benchmark}，主指标为${metricNames[benchmark]}。${plans.size} 份共享规划，额外 ${planRequests} 次生成请求；full 与 plan-only 共享同一生成结果。固定截图按 seed 分配，不是每个 seed 都重跑全图。`;
 const slash=' \\\n  ';$('calc-command').textContent=['PYTHONPATH=src .venv/bin/python run.py',`--benchmark ${benchmark} --split ${split}`,'--model /path/to/local-model',`--methods ${methods.join(' ')}`,`--conditions ${selected.join(' ')}`].join(slash);
}
['calc-benchmark','calc-split','calc-methods','calc-conditions'].forEach(id=>$(id).onchange=calculate);calculate();
$('copy-command').onclick=async()=>{const text=$('calc-command').textContent;try{if(!navigator.clipboard)throw Error('fallback');await navigator.clipboard.writeText(text);$('copy-status').textContent='命令已复制。';}catch{const selection=window.getSelection(),range=document.createRange();range.selectNodeContents($('calc-command'));selection.removeAllRanges();selection.addRange(range);$('calc-command').focus();$('copy-status').textContent='命令已选中，可按 Ctrl+C / ⌘C 复制。';}};
function renderInputLinks(){
  const params=new URLSearchParams({bench:'snake',task:selection.benchmark,case:currentCase().id,
    model:selection.model,condition:selection.condition,method:selection.method,probe:selection.probe,
    order:String(selection.order),candidate:String(selection.candidate),profile:'template'});
  for(const id of ['quiz-input-link','planning-link'])$(id).href='/vdec/exps/input-assembly/#'+params;
}
updateSelection();

const versions=[['任务协议',`${D.protocol} / ${D.task_version}`],['专用图片集',JSON.stringify(D.datasets,null,2)],['提示词版本与哈希',JSON.stringify(Object.fromEntries(Object.entries(D.configs).map(([k,v])=>[k,{version:v.prompt_version,hash:v.prompt_hash}])),null,2)],['渲染',D.render_version],['规则演示',`${D.replay.policy} · seed ${D.replay.seed}`]];versions.forEach(([k,v])=>{const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=k;dd.textContent=v;$('provenance').append(dt,dd);});
$('download-data').onclick=()=>{const blob=new Blob([JSON.stringify(D)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='vdecision-explainer-data.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);};
const sections=[...document.querySelectorAll('main>section')];
function updateChapter(){let current=null;for(const section of sections)if(section.getBoundingClientRect().top<=145)current=section.id;document.querySelectorAll('.chapter-nav a').forEach(a=>a.classList.toggle('active',a.getAttribute('href')===`#${current}`));}
window.addEventListener('scroll',updateChapter,{passive:true});window.addEventListener('resize',updateChapter);updateChapter();
// Expose pure numeric helpers for the artifact's browser verification only.
window.benchmarkArticle={scoring,softmax};
document.getElementById('article-loading').dataset.state='ready';
document.getElementById('article-loading').hidden=true;
})();
