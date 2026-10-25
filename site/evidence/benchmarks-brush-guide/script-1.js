/* UI only. Rule transitions live in the separately parity-tested simulator. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id), M = window.BrushMechanics;
  const D = JSON.parse($('brush-data').textContent);
  const clone = M.clone;
  const phases = {idle: '尚未开始', lifted: '笔尖抬起', drawing: '正在绘制', finished: '已经提交'};
  const familyNames = {horizontal: '水平', vertical: '垂直', diagonal: '对角线', shallow: '缓斜率', steep: '陡斜率', boundary: '边界'};
  const words = {left: '左', right: '右', above: '上', below: '下', same: '对齐'};
  const fmt = n => n === null ? '尚无笔迹' : Number(n).toFixed(3).replace(/\.?0+$/, '');
  const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  function svg(content, viewBox, label) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="${escape(label)}"><title>${escape(label)}</title>${content}</svg>`;
  }
  function board(state, c, guide = false) {
    const pad = 48, top = 38, scale = 448/(c.size-1), x = n => pad+n*scale, y = n => top+n*scale;
    let marks = '<rect x="22" y="12" width="516" height="510" rx="10" fill="white"/>';
    for (let i=0;i<c.size;i++) marks += `<path d="M${x(i)} ${top}V${y(32)} M${pad} ${y(i)}H${x(32)}" stroke="#edf0f3" stroke-width="1"/>`;
    if (guide && !state.terminal) {
      const bounds = ['x','y'].map((a,i) => state.intervals[a].locked ? {low:state.pen[i],high:state.pen[i]} : state.intervals[a]);
      if (bounds.every(b => b.low <= b.high)) {
        marks += `<rect x="${x(bounds[0].low)-3}" y="${y(bounds[1].low)-3}" width="${(bounds[0].high-bounds[0].low)*scale+6}" height="${(bounds[1].high-bounds[1].low)*scale+6}" fill="#255cac" fill-opacity=".08" stroke="#5281d0" stroke-dasharray="5 4"/>`;
        const mx=x(Math.floor((bounds[0].low+bounds[0].high)/2)),my=y(Math.floor((bounds[1].low+bounds[1].high)/2));
        marks += `<path d="M${mx-5} ${my-5}L${mx+5} ${my+5}M${mx-5} ${my+5}L${mx+5} ${my-5}" stroke="#5281d0" stroke-width="2"/>`;
      }
      for(const i of [0,8,16,24,32]) marks += `<text x="${x(i)}" y="510" text-anchor="middle" fill="#68726f" font-size="16">${i}</text><text x="30" y="${y(i)+5}" text-anchor="end" fill="#68726f" font-size="16">${i}</text>`;
    }
    if (state.stroke.length > 1) marks += `<polyline points="${state.stroke.map(p=>`${x(p[0])},${y(p[1])}`).join(' ')}" fill="none" stroke="#3667d6" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
    for (const [key,label,color] of [['start','S','#148758'],['end','E','#bd406b']]) {
      const [px,py]=c[key];
      marks += `<circle cx="${x(px)}" cy="${y(py)}" r="7" fill="white" stroke="${color}" stroke-width="3"/><circle cx="${x(px)}" cy="${y(py)}" r="2" fill="${color}"/><text x="${x(px)+(px>29?-18:10)}" y="${y(py)+(py<2?23:-12)}" fill="${color}" font-size="21" font-weight="600">${label}</text>`;
    }
    const px=x(state.pen[0]),py=y(state.pen[1]);
    marks += `<path d="M${px+8} ${py-8}L${px+18} ${py-24}" stroke="#d99c14" stroke-width="7"/><circle cx="${px}" cy="${py}" r="11" fill="none" stroke="#17263c" stroke-width="2"/><path d="M${px-16} ${py}h8 M${px+8} ${py}h8 M${px} ${py-16}v8 M${px} ${py+8}v8" stroke="#17263c" stroke-width="2"/>`;
    return svg(marks, '0 0 560 536', `${c.id}，${phases[state.phase]}。绿色 S 为起点，粉色 E 为终点，深色准星为笔尖。${guide?`笔尖 (${state.pen.join(', ')})。`:''}`);
  }

  let numberHistory=[],numberIndex=0;
  function resetNumber() {
    const p=+$('number-start').value;
    numberHistory=[{position:p,bounds:{low:0,high:32,locked:false},exhausted:false,message:`初始区间 [0, 32]，笔尖 ${p}。选择一个方向，看看剩余区间如何改变。`}];
    numberIndex=0;drawNumber();
  }
  function drawNumber() {
    const s=numberHistory[numberIndex], target=+$('number-target').value;
    $('number-start-value').value=$('number-start').value;$('number-target-value').value=target;
    const x=n=>36+n*18,lo=s.bounds.low,hi=s.bounds.high;
    let marks='<path d="M36 91H612" stroke="#adb7bb" stroke-width="3"/>';
    if(!s.exhausted) marks+=`<rect x="${x(lo)-6}" y="67" width="${Math.max(12,x(hi)-x(lo)+12)}" height="46" rx="5" fill="#dce8fb"/><path d="M${x(lo)} 91H${x(hi)}" stroke="#5281d0" stroke-width="3"/>`;
    for(let i=0;i<=32;i++) marks+=`<path d="M${x(i)} 86v10" stroke="#89979d"/>${i%4===0?`<text x="${x(i)}" y="141" font-size="20" fill="#68726f" text-anchor="middle">${i}</text>`:''}`;
    marks+=`<path d="M${x(target)} 62V91" stroke="#24674f" stroke-width="2"/><circle cx="${x(target)}" cy="61" r="7" fill="#24674f"/><text x="${Math.max(58,Math.min(590,x(target)))}" y="31" font-size="21" fill="#24674f" text-anchor="middle">目标 ${target}</text><circle cx="${x(s.position)}" cy="91" r="8" fill="#242b30"/><text x="${Math.max(58,Math.min(590,x(s.position)))}" y="180" font-size="21" text-anchor="middle" fill="#242b30">笔尖 ${s.position}</text>`;
    $('number-board').innerHTML=svg(marks,'0 0 648 200',`目标 ${target}，笔尖 ${s.position}，剩余区间 [${lo}, ${hi}]，${s.bounds.locked?'已锁定':s.exhausted?'区间耗尽':'可继续'}`);
    $('number-feedback').textContent=s.message;
    document.querySelectorAll('[data-relation]').forEach(b=>b.disabled=s.bounds.locked||s.exhausted);
    $('number-correct').disabled=s.bounds.locked||s.exhausted;
    $('number-history').max=numberHistory.length-1;$('number-history').value=numberIndex;
    $('number-history-label').value=`${numberIndex} / ${numberHistory.length-1}`;
  }
  function answerNumber(relation) {
    const before=numberHistory[numberIndex],target=+$('number-target').value;
    const after=M.interval(before.position,before.bounds,relation);
    if(relation==='same') after.message=`回答“同列”：锁定在 ${after.position}。${after.position===target?'这次确实对齐。':'但目标在 '+target+'，这是错误锁定；控制器仍然执行。'}`;
    else if(after.exhausted) after.message=`回答“${words[relation]}”：区间变为 [${after.bounds.low}, ${after.bounds.high}]，没有候选位置。搜索耗尽；笔尖仍在 ${before.position}。`;
    else after.message=`回答“${words[relation]}”：从 [${before.bounds.low}, ${before.bounds.high}] 保留 [${after.bounds.low}, ${after.bounds.high}] → ⌊(${after.bounds.low} + ${after.bounds.high}) / 2⌋ = ${after.position}。${(relation==='left')===(target<before.position)&&target!==before.position?'':'这个方向回答不正确，目标可能已被排除。'}`;
    numberHistory=numberHistory.slice(0,numberIndex+1);numberHistory.push(after);numberIndex++;drawNumber();
  }

  let gameHistory=[],gameIndex=0,pending=null;
  const current=()=>gameHistory[gameIndex];
  function currentCase(){return D.cases.find(c=>c.id===$('game-case').value);}
  function resetGame(){
    pending=null;gameIndex=0;
    gameHistory=[{state:M.initial(currentCase(),$('game-ink').value),nextAxis:'x',message:'开始时笔尖已在画布上。先选择 pick 抬笔。'}];
    drawGame();
  }
  function populateCases(preferred='dev-shallow-01') {
    const rows=D.cases.filter(c=>($('game-split').value==='all'||c.split===$('game-split').value)&&($('game-family').value==='all'||c.family===$('game-family').value));
    $('game-case').innerHTML=rows.map(c=>`<option value="${c.id}">${c.id} · ${familyNames[c.family]}</option>`).join('');
    $('game-case').value=rows.some(c=>c.id===preferred)?preferred:rows[0].id;
    resetGame();
  }
  function moveAxes(){
    const entry=current(),active=M.activeAxes(entry.state);
    if($('game-schedule').value==='alternating'&&active.length) return [active.includes(entry.nextAxis)?entry.nextAxis:active[0]];
    return active;
  }
  function actionMessage(before,after,action,answers){
    let text=`第 ${after.steps} 步：${action}${Object.keys(answers).length?'；'+Object.entries(answers).map(([a,r])=>`${a}：${r==='same'?(a==='x'?'同列':'同行'):words[r]}`).join('，'):''}。`;
    if(after.invalid_actions>before.invalid_actions) text+='当前状态下这个动作无效，仍消耗一步。';
    else if(action==='drop') text+='在当前位置落笔；目标切换到 E，两个区间与锁定状态重置。';
    else if(action==='move') text+='根据本次回答更新笔尖；没有使用真值纠正。';
    if(after.terminal==='submitted') text+=M.metrics(after).success?'提交成功。':'已提交，但未满足完整成功条件。';
    if(after.terminal==='search_exhausted') text+='搜索区间耗尽，本局结束。';
    if(after.terminal==='step_limit') text+='达到 40 步上限，本局结束。';
    return text;
  }
  function commit(action,answers={},requested=[]){
    const entry=current(),s=M.step(entry.state,action,answers);
    const nextAxis=$('game-schedule').value==='alternating'&&requested.length?(requested[0]==='x'?'y':'x'):entry.nextAxis;
    const message=actionMessage(entry.state,s,action,answers);
    gameHistory=gameHistory.slice(0,gameIndex+1);gameHistory.push({state:s,nextAxis,message});gameIndex++;
    pending=null;drawGame();
  }
  function chooseAction(action){
    const s=current().state;
    if(action==='move'&&['lifted','drawing'].includes(s.phase)){
      const requested=moveAxes();
      if(requested.length){pending={axes:requested,answers:{}};drawGame();return;}
    }
    commit(action);
  }
  function drawQuestions(){
    $('game-questions').hidden=!pending;
    if(!pending) return;
    $('game-axis-inputs').innerHTML=pending.axes.map(a=>`<fieldset><legend>${a==='x'?'横向：目标在笔尖的哪里？':'纵向：目标在笔尖的哪里？'}</legend><div class="answer-options">${(a==='x'?['left','same','right']:['above','same','below']).map(r=>`<label><input type="radio" name="answer-${a}" value="${r}" data-axis="${a}" ${pending.answers[a]===r?'checked':''}>${r==='same'?(a==='x'?'同列':'同行'):words[r]}</label>`).join('')}</div></fieldset>`).join('');
    $('game-submit').disabled=!pending.axes.every(a=>a in pending.answers);
    $('game-axis-inputs').querySelectorAll('input').forEach(input=>input.addEventListener('change',()=>{
      pending.answers[input.dataset.axis]=input.value;
      $('game-submit').disabled=!pending.axes.every(a=>a in pending.answers);
    }));
  }
  function drawGame(){
    const entry=current(),s=entry.state,shot=M.snapshot(s),guide=$('game-guide').checked;
    $('game-board').innerHTML=board(shot,s.case,guide);
    $('game-phases').innerHTML=Object.entries(phases).map(([p,label])=>`<div class="phase${p===s.phase?' current':''}" ${p===s.phase?'aria-current="step"':''}><strong>${p}</strong>${label}</div>`).join('');
    $('game-state').textContent=`${phases[s.phase]} · 目标 ${shot.target} · 剩余 ${shot.steps_remaining} 步 · 锁定 ${shot.locked_axes.join('、')||'无'}`;
    $('game-caption').textContent=guide?`教学辅助：笔尖 (${s.pen.join(', ')})；S (${s.case.start.join(', ')})；E (${s.case.end.join(', ')})。蓝色框为剩余区间，锁定轴显示笔尖位置，蓝色 × 为该框整数中点。`:'教学辅助已关闭。只显示目标、笔尖与笔迹；图形是浏览器教学重绘。';
    $('game-feedback').textContent=pending?`move 已选择，等待 ${pending.axes.map(a=>a==='x'?'横向':'纵向').join('和')}回答；仍是同一张画面。`:entry.message;
    document.querySelectorAll('[data-action]').forEach(b=>b.disabled=Boolean(s.terminal||pending));
    $('game-oracle').disabled=Boolean(s.terminal||pending);
    drawQuestions();
    $('game-history').max=gameHistory.length-1;$('game-history').value=gameIndex;
    $('game-history-label').value=`${gameIndex} / ${gameHistory.length-1}`;
    $('game-prev').disabled=gameIndex===0;$('game-next').disabled=gameIndex===gameHistory.length-1;
    $('game-metrics').hidden=!s.terminal;
    if(s.terminal){const m=M.metrics(s);$('game-metrics').innerHTML=`<strong>${m.success?'✓ 完整成功':'未满足完整成功条件'}</strong><span>起点误差：${m.start_error===null?'未落笔':fmt(m.start_error)} 格</span><span>终点误差：${fmt(m.end_error)} 格</span><span>最大偏离：${m.max_deviation===null?'无笔迹':fmt(m.max_deviation)+' 格'}</span><span>路径长度比：${fmt(m.length_ratio)}</span><span>无效动作：${m.invalid_actions}</span><span>结束：${escape(m.terminal)}</span>`;}
  }
  function oracleStep(){const s=current().state,action=M.oracleAction(s),requested=action==='move'?moveAxes():[];commit(action,M.oracleRelations(s,requested),requested);}
  function viewGame(index){gameIndex=index;pending=null;drawGame();}

  let replayIndex=0;
  const replay=()=>D.replays.find(r=>r.case.id===$('replay-case').value);
  function drawReplay(){
    const r=replay(),f=r.frames[replayIndex];
    $('replay-line').innerHTML=board(f.line.state,r.case);$('replay-free').innerHTML=board(f.free.state,r.case);
    for(const side of ['line','free']){
      const m=f[side].metrics;
      $(`replay-${side}-metrics`).textContent=`路径长度比 ${fmt(m.length_ratio)} · 最大偏离 ${m.max_deviation===null?'尚无笔迹':fmt(m.max_deviation)+' 格'}${m.terminal?' · '+(m.success?'成功':'失败'):''}`;
    }
    $('replay-feedback').textContent=replayIndex===0?'初始画面。点击下一步，查看同一串规则动作。':`第 ${replayIndex} 步：${f.action} ${Object.entries(f.relations).map(([a,v])=>`${a}=${v}`).join('，')}。${f.line.state.terminal?'两侧均已结束；判断相同，笔迹由协议决定。':'两侧执行完全相同的动作。'}`;
    $('replay-step').max=r.frames.length-1;$('replay-step').value=replayIndex;
    $('replay-label').value=`${replayIndex} / ${r.frames.length-1}`;
    $('replay-prev').disabled=replayIndex===0;$('replay-next').disabled=replayIndex===r.frames.length-1;
  }
  try {
    $('number-start').addEventListener('input',resetNumber);$('number-target').addEventListener('input',resetNumber);
    document.querySelectorAll('[data-relation]').forEach(b=>b.addEventListener('click',()=>answerNumber(b.dataset.relation)));
    $('number-correct').addEventListener('click',()=>{const p=numberHistory[numberIndex].position,t=+$('number-target').value;answerNumber(t===p?'same':t<p?'left':'right');});
    $('number-reset').addEventListener('click',resetNumber);$('number-history').addEventListener('input',()=>{numberIndex=+$('number-history').value;drawNumber();});
    for(const id of ['game-split','game-family']) $(id).addEventListener('change',()=>populateCases($('game-case').value));
    for(const id of ['game-case','game-schedule','game-ink']) $(id).addEventListener('change',resetGame);
    $('game-guide').addEventListener('change',drawGame);
    document.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>chooseAction(b.dataset.action)));
    $('game-submit').addEventListener('click',()=>commit('move',pending.answers,pending.axes));
    $('game-cancel').addEventListener('click',()=>{pending=null;drawGame();});
    $('game-oracle').addEventListener('click',oracleStep);$('game-reset').addEventListener('click',resetGame);
    $('game-history').addEventListener('input',()=>viewGame(+$('game-history').value));
    $('game-prev').addEventListener('click',()=>viewGame(gameIndex-1));$('game-next').addEventListener('click',()=>viewGame(gameIndex+1));
    $('replay-case').innerHTML=D.replays.map(r=>`<option value="${r.case.id}">${familyNames[r.case.family]} · ${r.case.id}</option>`).join('');
    $('replay-case').value='dev-shallow-01';
    for(const id of ['replay-case','replay-reset']) $(id).addEventListener(id==='replay-case'?'change':'click',()=>{replayIndex=0;drawReplay();});
    $('replay-step').addEventListener('input',()=>{replayIndex=+$('replay-step').value;drawReplay();});
    $('replay-prev').addEventListener('click',()=>{replayIndex--;drawReplay();});$('replay-next').addEventListener('click',()=>{replayIndex++;drawReplay();});
    resetNumber();populateCases();drawReplay();
    document.querySelectorAll('.interactive').forEach(n=>n.hidden=false);
    document.documentElement.classList.add('js-ready');
    window.brushArticle={data:D,mechanics:M,board,getGame:()=>clone(current()),getGameHistory:()=>clone(gameHistory),getNumber:()=>clone(numberHistory[numberIndex])};
  } catch(error) {$('enhancement-error').hidden=false;console.error(error);}
})();
