'use strict';
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state = {data:null, attempt:null, busy:false, timer:null, route:0, track:'All', importData:null, libraryPage:1, librarySearch:'', libraryChapter:'', resultFilter:'all'};
const tracks = () => [...new Set(state.data.chapters.map(c=>c.track))];
const TRACK_INFO = {
  Python:{icon:'Py',tag:'LANGUAGE & DESIGN',tone:'',copy:'From types and functions to bounded-memory algorithms, concurrency and reusable pipeline design.'},
  NumPy:{icon:'Np',tag:'NUMERICAL FOUNDATIONS',tone:'blue',copy:'Build a precise mental model of arrays, broadcasting, memory, numerical stability and efficient computation.'},
  pandas:{icon:'Pd',tag:'TABULAR DATA',tone:'orange',copy:'Clean, join and reshape real data. Master alignment, time series, validation and memory-aware pipelines.'},
  PySpark:{icon:'Sp',tag:'DISTRIBUTED SYSTEMS',tone:'blue',copy:'Move from DataFrames to performance diagnosis, stateful streaming and reliable distributed pipelines.'},
  'Data Engineering':{icon:'⇄',tag:'PRODUCTION PRACTICE',tone:'orange',copy:'Connect the tools. Practice ingestion, SQL, testing, observability, fault recovery and operational trade-offs.'}
};
const fmt = n => Number(n).toLocaleString();
const pct = (a,b) => b ? Math.round(a / b * 100) : 0;
const date = t => new Date(t*1000).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});
const chapter = id => state.data.chapters.find(c => c.id === id);
const chip = (text, cls='') => '<span class="chip '+cls+'">'+esc(text)+'</span>';
const button = (label, href, cls='') => '<a class="button '+cls+'" href="'+esc(href)+'">'+label+'</a>';
const heading = (title, sub, eyebrow='YOUR LEARNING WORKSPACE') => '<div class="heading-row"><div><p class="eyebrow">'+eyebrow+'</p><h1 class="page-title">'+title+'</h1><p class="page-subtitle">'+sub+'</p></div></div>';
const progress = (value,total) => '<div class="progress-track"><progress value="'+value+'" max="'+(total||1)+'" aria-label="'+value+' of '+total+' questions correct on latest attempt"></progress></div>';
const blank = (title,copy,link='') => '<div class="empty"><h3>'+title+'</h3><p>'+copy+'</p>'+link+'</div>';
const linkSource = url => '<a class="source-link" target="_blank" rel="noopener noreferrer" href="'+esc(url)+'">Read the documentation ↗</a>';

function toast(message,error=false){const el=$('#toast');el.textContent=message;el.classList.toggle('error',error);el.hidden=false;clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>el.hidden=true,error?8500:3500);}
async function api(path, body, retry=true){
  const opts={headers:{}};
  if(body!==undefined){opts.method='POST';opts.headers={'Content-Type':'application/json','X-CSRF-Token':state.data.csrf};opts.body=JSON.stringify(body);}
  let response;
  try{response=await fetch('/api'+path,opts);}catch(e){throw new Error('Cannot reach the local server. Keep the DataForge terminal open, then retry.');}
  const data=await response.json();
  if(!response.ok&&body!==undefined&&retry&&data.error==='Reload the page to renew your session token.'){
    await refresh();return api(path,body,false);
  }
  if(!response.ok)throw new Error(data.error||'Request failed. Please retry.');
  return data;
}
async function refresh(){state.data=await api('/bootstrap');}
async function guarded(fn){if(state.busy)return;state.busy=true;try{await fn();}catch(e){toast(e.message,true);}finally{state.busy=false;}}
function activeBanner(){const a=state.data.active;return a?'<div class="banner"><div><strong>Your '+esc(a.mode)+' session is saved</strong><p>'+a.answered+' of '+a.count+' answered. Timed sessions keep counting while you are away.</p></div>'+button('Resume session →','#session/'+a.id)+'</div>':'';}
function stat(label,value,foot,icon){return '<div class="stat-card"><div class="stat-top">'+label+'<span class="stat-icon">'+icon+'</span></div><div class="stat-value">'+value+'</div><p class="stat-foot">'+foot+'</p></div>';}
function trackCard(track){
  const cs=state.data.chapters.filter(c=>c.track===track),count=cs.reduce((a,c)=>a+c.count,0),seen=cs.reduce((a,c)=>a+c.seen,0);
  const info=Object.hasOwn(TRACK_INFO,track)?TRACK_INFO[track]:{icon:'↗',tag:'LEARNING TRACK',tone:'',copy:'Explore the chapter lessons, practice with explanations and apply what you learn.'};
  return '<article class="track-card"><div class="track-icon">'+info.icon+'</div>'+chip(info.tag,info.tone)+'<h3>'+esc(track)+'</h3><p>'+info.copy+'</p><div class="track-meta"><span>'+cs.length+' chapters</span><span>·</span><span>'+count+' questions</span></div>'+progress(seen,count)+'<div class="track-bottom"><span>'+pct(seen,count)+'% explored</span><a class="text-link" href="#learn/'+encodeURIComponent(track)+'">Explore path ↗</a></div></article>';
}
function home(){
  const d=state.data,seen=Object.keys(d.progress).length,correct=Object.values(d.progress).filter(p=>p.correct).length;
  const first=d.chapters.find(c=>c.seen<c.count)||d.chapters[0];
  return heading('A little progress. Every day.','Python, NumPy, pandas and PySpark—from first principles to production.','WELCOME TO DATAFORGE')+activeBanner()+
    '<section class="hero"><div class="hero-copy"><p class="eyebrow">LEARN IT. PRACTICE IT. MAKE IT YOURS.</p><h2>Build the skills.<br><em>Own the interview.</em></h2><p>A guided curriculum, thoughtful questions and room to make mistakes. Start where you are. Keep moving forward.</p>'+button(seen?'Continue learning →':'Start with Python →','#lesson/'+first.id,'lime')+'</div><div class="hero-visual" aria-hidden="true"><div class="code-card"><div class="code-dots"><i></i><i></i><i></i></div><pre><span class="dim"># Your next chapter starts here</span>\nskills = [<span class="hl">"Python", "PySpark"</span>]\n\n<span class="hl">for</span> skill <span class="hl">in</span> skills:\n    print(<span class="hl">"Learning"</span>, skill)\n\n<span class="dim"># One small step, every day.</span></pre></div><div class="code-sticker">Small steps. Strong foundations. ↗</div></div></section>'+
    '<div class="stats-grid">'+stat('Question bank',fmt(d.total),d.chapters.length+' structured chapters','▦')+stat('Questions explored',fmt(seen),pct(seen,d.total)+'% of your learning journey','◈')+stat('Latest-answer accuracy',seen?pct(correct,seen)+'<small>%</small>':'—',seen?'Across '+seen+' unique questions':'Your first step starts below','◎')+stat('Completed sessions',d.history_total,'Practice makes progress','↗')+'</div>'+
    '<div class="section-heading"><div><h2>Your data engineering toolkit.</h2><p>Build depth in each tool, then connect them in real pipelines.</p></div><a class="text-link" href="#learn">View curriculum →</a></div><div class="track-grid">'+tracks().map(trackCard).join('')+'</div>'+
    '<div class="section-heading"><h2>Make your next session count</h2></div><div class="two-column"><section class="panel"><h3>A simple rhythm for learning</h3>'+[
      ['Learn the concept','Read a chapter primer and try the hands-on exercise.','#learn','Learn'],
      ['Practice with feedback','Answer a small set. Understand why each answer works.','#test','Practice'],
      ['Check your understanding','Take a timed test, then revisit your mistakes.','#review','Review']
    ].map((x,i)=>'<div class="step-row"><span class="step-number">0'+(i+1)+'</span><div><strong>'+x[0]+'</strong><small>'+x[1]+'</small></div><a class="text-link" href="'+x[2]+'">'+x[3]+' ↗</a></div>').join('')+'</section><section class="panel tint"><p class="eyebrow">YOUR DAILY PRACTICE</p><h3>Twenty minutes is a great start.</h3><p>Try 10 questions from one chapter. Say your reasoning out loud before checking the explanation. Revisit missed questions tomorrow.</p>'+button('Build a practice session →','#test','secondary')+'<p class="notice-text">Understanding beats memorizing answer positions. Choices change order each new session.</p></section></div>';
}
function roadmap(){
  const stages=[
    ['01','Build the foundations','Python values, collections, functions and generators. Trace small programs before designing larger ones.','Python','Explain behavior and write a tested transformation.'],
    ['02','Work precisely with data','NumPy arrays and pandas tables. Reason about shapes, labels, missing values and join cardinality.','pandas','Reconcile input/output counts and validate dtypes.'],
    ['03','Scale the computation','PySpark DataFrames, partitions, shuffles and query plans. Learn where work and memory live.','PySpark','Read a plan and justify a distributed strategy.'],
    ['04','Engineer for failure','Advanced chapters and pipeline exercises. Handle replay, late data, bounded memory and observability.','Data Engineering','Demonstrate recovery and defend your trade-offs.']
  ];
  return '<section class="roadmap" aria-label="Suggested study roadmap">'+stages.map(s=>'<article class="roadmap-stage"><span class="eyebrow">STAGE '+s[0]+'</span><h3>'+s[1]+'</h3><p>'+s[2]+'</p><p class="readiness"><strong>Ready to move on:</strong> '+s[4]+'</p><a class="text-link" href="#learn/'+encodeURIComponent(s[3])+'">Explore '+s[3]+' →</a></article>').join('')+'</section><p class="small-note">Suggested order: Python foundations → NumPy → pandas → PySpark → advanced Python/Spark and production practice. For each chapter, learn the idea, solve its exercise, practice unseen questions, and explain your reasoning. Quiz scores alone do not demonstrate mastery.</p>';
}
function learn(track='All'){
  const cs=state.data.chapters.filter(c=>track==='All'||c.track===track);
  return heading('Build skills you can use in production.','Learn the foundations, work through code, then defend your design choices. Each track progresses into harder material.','YOUR CURRICULUM')+
    (track==='All'?roadmap():'')+
    '<div class="tabs" aria-label="Learning tracks">'+['All',...tracks()].map(t=>'<a class="tab '+(t===track?'selected':'')+'" href="#learn/'+encodeURIComponent(t)+'">'+esc(t)+'</a>').join('')+'</div><div class="chapter-list">'+cs.map(c=>
      '<article class="chapter-row"><span class="chapter-num">'+String(c.order).padStart(2,'0')+'</span><div><h3>'+esc(c.title)+'</h3><p>'+esc(c.summary)+'</p><p class="spacer-top">'+esc(c.track)+' · '+c.count+' questions</p>'+(c.levels?'<div class="level-summary">'+Object.entries(c.levels).filter(([,n])=>n).map(([level,n])=>chip(n+' '+level,level==='advanced'?'orange':level==='intermediate'?'blue':'')).join(' ')+'</div>':'')+'</div><div class="chapter-progress">'+c.mastered+' / '+c.count+' latest correct'+progress(c.mastered,c.count)+'</div>'+button(c.seen?'Continue →':'Start chapter →','#lesson/'+c.id,'secondary small')+'</article>').join('')+'</div>';
}
function lesson(id){
  const c=chapter(id);if(!c)return blank('Chapter not found','Choose a chapter from the learning path.',button('Learning path','#learn'));
  const next=state.data.chapters.find(x=>x.order>c.order);
  return '<p><a class="text-link" href="#learn/'+encodeURIComponent(c.track)+'">← '+esc(c.track)+' learning path</a></p>'+heading(esc(c.title),esc(c.summary),'CHAPTER '+String(c.order).padStart(2,'0'))+
    '<div class="lesson-layout"><article class="panel"><p class="eyebrow">THE CORE IDEA</p><div class="lesson-body">'+esc(c.lesson)+'</div><div class="lesson-exercise"><strong>Try it yourself</strong>'+esc(c.exercise)+'</div><div class="actions">'+button('Practice this chapter →','#test/'+c.id)+(next?button('Next chapter','#lesson/'+next.id,'secondary'):'')+'</div><p class="small-note">Use your own Python or Spark environment for exercises. This study app displays code; it does not execute it.</p></article><aside><section class="panel"><p class="eyebrow">WHAT YOU WILL LEARN</p><ul class="objectives">'+c.objectives.map(o=>'<li>'+esc(o)+'</li>').join('')+'</ul><div class="section-heading"><h3>Your progress</h3></div><p>'+c.seen+' of '+c.count+' questions explored<br>'+c.mastered+' correct on the latest attempt</p>'+progress(c.mastered,c.count)+'<p class="small-note">Read → try → practice → explain it in your own words.</p></section><section class="panel tint spacer-top"><h3>A good answer has a why.</h3><p>For every question you miss, identify the assumption that led you there. Use the documentation link to test your understanding.</p></section></aside></div>';
}
function setup(id){
  const selected=chapter(id),qs=new URLSearchParams(id&&id.startsWith('?')?id.slice(1):'');
  const pool=qs.get('pool')||'all';
  return heading('Practice with purpose.','Choose your focus, set your pace and turn knowledge into confidence.','SESSION BUILDER')+activeBanner()+
    '<form id="test-form" class="setup-grid"><section class="panel"><h3>How would you like to learn?</h3><div class="mode-grid spacer-top"><label class="mode-card"><input type="radio" name="mode" value="practice" checked><strong>Guided practice</strong><p>Check each answer and learn immediately. A timer is optional.</p></label><label class="mode-card"><input type="radio" name="mode" value="exam"><strong>Timed exam</strong><p>Build interview confidence. Feedback appears after you submit.</p></label></div><div class="form-row"><label class="field">Number of questions<input name="count" type="number" min="1" max="20000" step="1" value="10" required><small>Sampled without repeats within a session.</small></label><label class="field">Time limit (minutes)<input name="minutes" type="number" min="0" max="240" step="1" value="0" required><small>0 = untimed practice. Exams require at least 1 minute.</small></label></div><div class="form-row"><label class="field">Difficulty<select name="difficulty"><option value="all">All levels</option><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></label><label class="field">Question pool<select name="pool">'+[['all','All questions'],['unseen','Not yet attempted'],['mistakes','My latest mistakes'],['bookmarks','My bookmarks']].map(([v,l])=>'<option value="'+v+'" '+(pool===v?'selected':'')+'>'+l+'</option>').join('')+'</select></label></div><label class="field">Learning track<select name="track"><option value="All">All tracks</option>'+tracks().map(t=>'<option '+(selected&&selected.track===t?'selected':'')+'>'+esc(t)+'</option>').join('')+'</select></label><div class="section-heading"><h3>Chapters</h3><button type="button" class="text-link" id="toggle-chapters">Select all shown</button></div><p class="small-note">No checked chapters means all chapters in the chosen track.</p><div id="chapter-options" class="check-list">'+state.data.chapters.map(c=>'<label data-track="'+esc(c.track)+'"><input type="checkbox" name="chapters" value="'+c.id+'" '+(selected&&selected.id===c.id?'checked':'')+'>'+String(c.order).padStart(2,'0')+' · '+esc(c.title)+'</label>').join('')+'</div></section><aside class="setup-summary"><p class="eyebrow">YOUR NEXT STEP</p><h3>A session that fits you.</h3><div class="summary-stat"><span>Matching questions</span><strong id="eligible-count">—</strong></div><div class="summary-stat"><span>Session length</span><strong id="session-count">10 questions</strong></div><div class="summary-stat"><span>Time limit</span><strong id="session-time">Untimed</strong></div><p>Questions are balanced across your selected chapters. Answer choices are reshuffled for every new session.</p><button class="button lime" type="submit" id="start-button" '+(state.data.active?'disabled':'')+'>Start session →</button><p id="setup-message" role="status">'+(state.data.active?'Resume or submit your saved session first.':'Your answers are saved as you go.')+'</p></aside></form>';
}
function setupFilters(){
  const form=$('#test-form'),data=new FormData(form),track=data.get('track');
  const checked=$$('input[name=chapters]:checked',form).filter(x=>!x.disabled).map(x=>x.value);
  const ids=checked.length?checked:state.data.chapters.filter(c=>track==='All'||c.track===track).map(c=>c.id);
  return {chapters:ids,mode:data.get('mode'),minutes:Number(data.get('minutes')),count:Number(data.get('count')),difficulty:data.get('difficulty'),pool:data.get('pool')};
}
function setupUpdate(){
  const f=$('#test-form');if(!f)return;
  const track=f.elements.track.value;
  $$('#chapter-options label').forEach(l=>{const show=track==='All'||l.dataset.track===track;l.hidden=!show;l.querySelector('input').disabled=!show;});
  const filters=setupFilters(),p=state.data.progress,b=new Set(state.data.bookmarks);
  const count=state.data.index.filter(q=>filters.chapters.includes(q.chapter)&&(filters.difficulty==='all'||q.difficulty===filters.difficulty)&&
    (filters.pool==='all'||filters.pool==='unseen'&&!p[q.id]||filters.pool==='mistakes'&&p[q.id]&&p[q.id].correct===0||filters.pool==='bookmarks'&&b.has(q.id))).length;
  $('#eligible-count').textContent=fmt(count);$('#session-count').textContent=filters.count+' questions';$('#session-time').textContent=filters.minutes?filters.minutes+' min':'Untimed';
  const error=state.data.active?'Resume or submit your saved session first.':!count?'No questions match. Change your filters or explore a chapter.':filters.count>count?'Choose '+count+' questions or fewer.':filters.mode==='exam'&&!filters.minutes?'Set a time limit for your exam.':!Number.isInteger(filters.count)||filters.count<1?'Choose a positive whole number of questions.':'';
  $('#setup-message').textContent=error||'Your answers are saved as you go.';$('#start-button').disabled=Boolean(error);
}
function bindSetup(){
  const f=$('#test-form');f.addEventListener('change',e=>{if(e.target.name==='mode'&&e.target.value==='exam'&&!Number(f.elements.minutes.value))f.elements.minutes.value='20';setupUpdate();});f.addEventListener('input',setupUpdate);
  $('#toggle-chapters').onclick=()=>{const boxes=$$('input[name=chapters]',f).filter(x=>!x.disabled),all=boxes.every(x=>x.checked);boxes.forEach(x=>x.checked=!all);setupUpdate();};
  f.onsubmit=e=>{e.preventDefault();guarded(async()=>{if(!f.reportValidity())return;$('#start-button').disabled=true;try{state.attempt=await api('/attempts',setupFilters());await refresh();location.hash='session/'+state.attempt.id;}finally{if($('#test-form'))setupUpdate();}});};setupUpdate();
}
function feedback(q,a){const correct=a.answers[q.id]===q.correct;return '<div class="feedback '+(correct?'':'wrong')+'" role="status"><strong>'+(correct?'That’s right. Here’s why.':'A useful mistake. Let’s unpack it.')+'</strong><p>'+esc(q.explanation)+'</p>'+linkSource(q.source)+'</div>';}
function session(a){
  const q=a.questions[a.current],selected=a.answers[q.id],checked=a.checked.includes(q.id),c=chapter(q.chapter);
  return '<div class="test-top"><h1>'+(a.mode==='exam'?'Timed exam':'Guided practice')+'</h1>'+chip(a.questions.length+' questions')+'<span class="timer" id="timer" aria-label="Time remaining">'+(a.deadline?'--:--':'Untimed')+'</span></div><div class="test-layout"><section class="panel question-card"><div class="question-meta"><div class="chips">'+chip(c?c.title:q.chapter,'blue')+chip(q.difficulty)+chip(q.kind,'orange')+'</div><span class="question-counter">'+(a.current+1)+' / '+a.questions.length+'</span></div><h2 id="question-title">'+esc(q.prompt)+'</h2>'+(q.code?'<pre><code>'+esc(q.code)+'</code></pre>':'')+'<div class="choices" role="radiogroup" aria-labelledby="question-title">'+q.choices.map((choice,i)=>
    '<button type="button" class="choice '+(selected===choice.id?'selected ':'')+(checked&&q.correct===choice.id?'correct ':'')+(checked&&selected===choice.id&&q.correct!==choice.id?'incorrect':'')+'" role="radio" aria-checked="'+(selected===choice.id)+'" data-choice="'+choice.id+'" '+(checked?'disabled':'')+'><span class="letter">'+String.fromCharCode(65+i)+'</span><span>'+esc(choice.text)+'</span></button>').join('')+'</div>'+(checked?feedback(q,a):'')+'<div class="actions spread"><div class="actions"><button class="button secondary small" id="flag-question" aria-pressed="'+a.flags.includes(q.id)+'">'+(a.flags.includes(q.id)?'⚑ Flagged':'⚐ Flag for review')+'</button><button class="button secondary small" id="bookmark-question" aria-pressed="'+state.data.bookmarks.includes(q.id)+'">'+(state.data.bookmarks.includes(q.id)?'★ Saved':'☆ Save')+'</button></div>'+(a.mode==='practice'&&!checked?'<button class="button small" id="check-answer" '+(selected===undefined?'disabled':'')+'>Check answer →</button>':'')+'</div><div class="actions spread spacer-top"><button class="button secondary" id="previous-question" '+(a.current===0?'disabled':'')+'>← Previous</button><button class="button" id="next-question">'+(a.current===a.questions.length-1?'Finish & review':'Next question →')+'</button></div><p class="status-line" id="save-status">Saved locally · '+esc(q.version)+' · Keys 1–4 select an answer; ← → navigate.</p></section><aside class="panel navigator"><h3>Your question map</h3><p class="small-note">'+Object.keys(a.answers).length+' answered · '+a.flags.length+' flagged</p><div class="nav-grid">'+a.questions.map((item,i)=>'<button class="'+(a.answers[item.id]!==undefined?'answered ':'')+(i===a.current?'current ':'')+(a.flags.includes(item.id)?'flagged':'')+'" data-go="'+i+'" aria-label="Question '+(i+1)+(a.answers[item.id]!==undefined?', answered':'')+(a.flags.includes(item.id)?', flagged':'')+'" '+(i===a.current?'aria-current="step"':'')+'>'+(i+1)+'</button>').join('')+'</div><div class="legend"><div><i></i> Answered</div><div><i class="flag-key"></i> Flagged for review</div></div><button class="button secondary spacer-top" id="finish-session">Submit session →</button><p class="small-note">'+(a.mode==='exam'?'Answers are revealed after submission. The timer continues if you leave this page.':'Check an answer to lock it and see the explanation. Unanswered questions count as missed on submission.')+'</p></aside></div>';
}
async function mutateAttempt(action,body){
  const a=state.attempt;
  $('#save-status')&&($('#save-status').textContent='Saving…');
  try{state.attempt=await api('/attempts/'+a.id+'/'+action,body);if(state.attempt.status==='finished'){await refresh();location.hash='results/'+a.id;}else{renderSession();}}
  catch(e){$('#save-status')&&($('#save-status').textContent='Not saved — retry your last action.');throw e;}
}
function renderSession(){
  const a=state.attempt;if(!location.hash.startsWith('#session/'))return;
  $('#main').innerHTML=session(a);bindSession();tick();
}
function confirmSubmit(){
  const a=state.attempt,remaining=a.questions.length-Object.keys(a.answers).length;
  $('#dialog-title').textContent='Submit your '+(a.mode==='exam'?'exam':'practice session')+'?';
  $('#dialog-copy').textContent=remaining?'You have '+remaining+' unanswered questions. They will count as missed. You can review all explanations after submitting.':'All questions are answered. Submit to see your score, explanations and chapter breakdown.';
  $('#confirm-dialog').showModal();
}
function bindSession(){
  const a=state.attempt,q=a.questions[a.current];
  $$('[data-choice]').forEach(el=>el.onclick=()=>guarded(()=>mutateAttempt('answer',{qid:q.id,choice:el.dataset.choice})));
  $$('[data-go]').forEach(el=>el.onclick=()=>guarded(()=>mutateAttempt('navigate',{index:Number(el.dataset.go)})));
  $('#previous-question').onclick=()=>guarded(()=>mutateAttempt('navigate',{index:a.current-1}));
  $('#next-question').onclick=()=>a.current===a.questions.length-1?confirmSubmit():guarded(()=>mutateAttempt('navigate',{index:a.current+1}));
  $('#finish-session').onclick=confirmSubmit;
  $('#flag-question').onclick=()=>guarded(()=>mutateAttempt('flag',{qid:q.id}));
  $('#bookmark-question').onclick=()=>guarded(async()=>{await bookmark(q.id);renderSession();});
  if($('#check-answer'))$('#check-answer').onclick=()=>guarded(async()=>{await mutateAttempt('check',{qid:q.id});await refresh();});
}
async function bookmark(id){const saved=!state.data.bookmarks.includes(id);await api('/bookmarks',{id,saved});if(saved)state.data.bookmarks.push(id);else state.data.bookmarks=state.data.bookmarks.filter(x=>x!==id);toast(saved?'Question saved to your bookmarks.':'Bookmark removed.');}
function tick(){
  const el=$('#timer'),a=state.attempt;if(!el||!a||!a.deadline)return;
  const now=Date.now()/1000+(state.serverOffset||0),left=Math.max(0,Math.ceil(a.deadline-now));
  el.textContent=String(Math.floor(left/60)).padStart(2,'0')+':'+String(left%60).padStart(2,'0');el.classList.toggle('urgent',left<60);
  if(left===0&&!state.busy)guarded(async()=>{state.attempt=await api('/attempts/'+a.id);if(state.attempt.status==='finished'){await refresh();$('#confirm-dialog').close();location.hash='results/'+a.id;toast('Time is up. Your saved answers have been submitted.');}});
}
function answerReview(q,a,index){
  const chosen=a.answers[q.id],correct=chosen===q.correct,pick=q.choices.find(x=>x.id===chosen),right=q.choices.find(x=>x.id===q.correct);
  return '<details class="review-question '+(correct?'':'wrong')+'"><summary><span class="result-mark">'+(correct?'✓':'×')+'</span><span>'+(index+1)+'. '+esc(q.prompt)+'</span></summary><div class="answer-detail">'+(q.code?'<pre><code>'+esc(q.code)+'</code></pre>':'')+'<p><strong>Your answer:</strong> '+esc(pick?pick.text:'Not answered')+'</p><p><strong>Correct answer:</strong> '+esc(right.text)+'</p><p class="explanation">'+esc(q.explanation)+'</p>'+linkSource(q.source)+'<p class="small-note">'+esc(q.version)+' · '+esc(q.id)+' · Revision '+q.revision+'</p><button class="button secondary small" data-bookmark="'+q.id+'">'+(state.data.bookmarks.includes(q.id)?'★ Saved':'☆ Save question')+'</button></div></details>';
}
function results(a){
  const score=a.score,n=a.questions.length,percent=pct(score,n),unanswered=n-Object.keys(a.answers).length;
  const by={};a.questions.forEach(q=>{if(!by[q.chapter])by[q.chapter]={total:0,correct:0};by[q.chapter].total++;by[q.chapter].correct+=a.answers[q.id]===q.correct?1:0;});
  const rows=Object.entries(by).sort((x,y)=>x[1].correct/x[1].total-y[1].correct/y[1].total);
  const filtered=a.questions.map((q,i)=>({q,i})).filter(({q})=>state.resultFilter==='all'||state.resultFilter==='wrong'&&a.answers[q.id]!==q.correct||state.resultFilter==='flagged'&&a.flags.includes(q.id));
  const elapsed=Math.min(a.ended-a.started,a.duration_minutes?a.duration_minutes*60:Infinity);
  return '<section class="result-hero"><div class="score-circle">'+percent+'<span>%</span></div><div><p class="eyebrow">SESSION COMPLETE'+(a.end_reason==='timeout'?' · TIME EXPIRED':'')+'</p><h1>'+(percent>=80?'Your practice is paying off.':percent>=50?'A solid step forward.':'Every mistake is a place to grow.')+'</h1><p>'+score+' correct · '+(n-score-unanswered)+' incorrect · '+unanswered+' unanswered<br>'+a.mode+' · '+Math.max(1,Math.round(elapsed/60))+' min · '+date(a.started)+'</p></div><div class="actions">'+button('Practice again →','#test','lime')+button('Progress','#review','secondary')+'</div></section><div class="two-column"><section class="panel"><h3>Chapter breakdown</h3><div class="table-wrap"><table><thead><tr><th>Chapter</th><th>Correct</th><th>Next step</th></tr></thead><tbody>'+rows.map(([id,v])=>'<tr><td>'+esc(chapter(id)?chapter(id).title:id)+'</td><td>'+v.correct+' / '+v.total+'</td><td><a class="text-link" href="#lesson/'+id+'">Revisit lesson ↗</a></td></tr>').join('')+'</tbody></table></div></section><section class="panel tint"><p class="eyebrow">TURN FEEDBACK INTO PROGRESS</p><h3>Your next session starts here.</h3><p>Read the explanations for missed answers. Recreate one example in your own environment, then explain the concept without looking.</p>'+button('Practice my mistakes →','#test/?pool=mistakes','secondary')+'<p class="small-note">Your mistake pool follows the latest graded answer for each question. Correct it to clear it.</p></section></div><div class="section-heading"><h2>Review your answers</h2><select id="result-filter" aria-label="Filter result questions"><option value="all" '+(state.resultFilter==='all'?'selected':'')+'>All questions ('+n+')</option><option value="wrong" '+(state.resultFilter==='wrong'?'selected':'')+'>Missed ('+(n-score)+')</option><option value="flagged" '+(state.resultFilter==='flagged'?'selected':'')+'>Flagged ('+a.flags.length+')</option></select></div><div class="result-list">'+(filtered.length?filtered.map(({q,i})=>answerReview(q,a,i)).join(''):blank('Nothing in this view','Choose another review filter.'))+'</div>';
}
function review(){
  const d=state.data,ps=Object.values(d.progress),missed=ps.filter(p=>!p.correct).length,correct=ps.length-missed;
  const weak=d.chapters.filter(c=>c.seen).sort((a,b)=>a.mastered/a.seen-b.mastered/b.seen).slice(0,8);
  return heading('Keep the progress. Learn from the misses.','Your history, bookmarks and next learning steps, saved on this computer.','REVIEW & PROGRESS')+
    '<div class="stats-grid">'+stat('Unique questions tried',ps.length,'Across all your sessions','◈')+stat('Latest correct',correct,'Correct on most recent graded answer','✓')+stat('To revisit',missed,'Incorrect or unanswered last time','↺')+stat('Bookmarked',d.bookmarks.length,'Questions worth another look','☆')+'</div><div class="actions">'+button('Practice my mistakes →','#test/?pool=mistakes')+button('Practice bookmarks','#test/?pool=bookmarks','secondary')+button('Explore unseen questions','#test/?pool=unseen','secondary')+'</div><div class="section-heading"><h2>Where to focus next</h2></div>'+
    (weak.length?'<section class="panel"><div class="table-wrap"><table><thead><tr><th>Chapter</th><th>Explored</th><th>Latest correct</th><th>Keep learning</th></tr></thead><tbody>'+weak.map(c=>'<tr><td>'+esc(c.title)+'</td><td>'+c.seen+' / '+c.count+'</td><td>'+pct(c.mastered,c.seen)+'%</td><td><a class="text-link" href="#lesson/'+c.id+'">Open lesson ↗</a></td></tr>').join('')+'</tbody></table></div></section>':blank('Your learning story starts with one session.','Begin with a small Python practice set. Your progress will appear here.',button('Start practicing','#test')))+
    '<div class="section-heading"><h2>Session history</h2><span class="small-note">Most recent '+Math.min(d.history_total,100)+' of '+d.history_total+' sessions</span></div>'+(d.history.length?'<section class="panel"><div class="table-wrap"><table><thead><tr><th>Date</th><th>Mode</th><th>Score</th><th>Questions</th><th>Details</th></tr></thead><tbody>'+d.history.map(a=>'<tr><td>'+date(a.started)+'</td><td>'+esc(a.mode)+(a.reason==='timeout'?' · time expired':'')+'</td><td>'+pct(a.score,a.count)+'%</td><td>'+a.score+' / '+a.count+'</td><td><a class="text-link" href="#results/'+a.id+'">Review answers ↗</a></td></tr>').join('')+'</tbody></table></div></section>':blank('No completed sessions yet.','Complete a practice session or timed exam to see the full review.'))+'<p class="small-note">Progress measures the latest graded answer per question. It is a study signal, not a certification of interview readiness.</p>';
}
function libraryShell(){return heading('A question for every next step.','Search concepts, inspect code and learn the reasoning behind every answer.','QUESTION LIBRARY')+'<form class="search-bar" id="library-form"><input type="search" id="library-search" placeholder="Search questions, code or explanations…" aria-label="Search question library" value="'+esc(state.librarySearch)+'"><select id="library-chapter" aria-label="Filter library by chapter"><option value="">All chapters</option>'+state.data.chapters.map(c=>'<option value="'+c.id+'" '+(state.libraryChapter===c.id?'selected':'')+'>'+String(c.order).padStart(2,'0')+' · '+esc(c.title)+'</option>').join('')+'</select></form><div id="library-results"><div class="loading">Loading questions…</div></div>';}
function shuffle(array){const a=array.slice();for(let i=a.length-1;i>0;i--){const r=new Uint32Array(1);crypto.getRandomValues(r);const j=r[0]%(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
async function loadLibrary(){
  const query=new URLSearchParams({search:state.librarySearch,chapter:state.libraryChapter,page:state.libraryPage});
  const request=state.libraryRequest=(state.libraryRequest||0)+1;
  const data=await api('/questions?'+query);if(request!==state.libraryRequest||!$('#library-results'))return;
  $('#library-results').innerHTML='<p class="small-note">'+fmt(data.total)+' questions found · Page '+data.page+' of '+Math.max(1,Math.ceil(data.total/20))+'</p>'+data.questions.map(q=>{
    const choices=shuffle(q.choices.map((text,id)=>({text,id})));
    return '<article class="library-card"><div class="question-meta"><div class="chips">'+chip(chapter(q.chapter).title,'blue')+chip(q.difficulty)+chip(q.kind,'orange')+'</div><button class="button secondary small" data-bookmark="'+q.id+'">'+(state.data.bookmarks.includes(q.id)?'★ Saved':'☆ Save')+'</button></div><h3>'+esc(q.prompt)+'</h3>'+(q.code?'<pre><code>'+esc(q.code)+'</code></pre>':'')+'<ol type="A">'+choices.map(c=>'<li>'+esc(c.text)+'</li>').join('')+'</ol><details><summary>Reveal answer & explanation</summary><p><strong>'+String.fromCharCode(65+choices.findIndex(c=>c.id===q.answer))+'. '+esc(q.choices[q.answer])+'</strong></p><p>'+esc(q.explanation)+'</p>'+linkSource(q.source)+'<p class="small-note">'+esc(q.version)+' · '+esc(q.id)+' · Revision '+q.revision+'</p></details></article>';
  }).join('')+(data.total?' <div class="pagination"><button class="button secondary small" id="library-prev" '+(data.page===1?'disabled':'')+'>← Previous</button><span>'+data.page+' / '+Math.ceil(data.total/20)+'</span><button class="button secondary small" id="library-next" '+(data.page*20>=data.total?'disabled':'')+'>Next →</button></div>':blank('No matching questions','Try a shorter search or a different chapter.'));
  bindBookmarks();if($('#library-prev'))$('#library-prev').onclick=()=>guarded(async()=>{state.libraryPage--;await loadLibrary();window.scrollTo(0,0);});if($('#library-next'))$('#library-next').onclick=()=>guarded(async()=>{state.libraryPage++;await loadLibrary();window.scrollTo(0,0);});
}
function bindBookmarks(){ $$('[data-bookmark]').forEach(el=>el.onclick=()=>guarded(async()=>{await bookmark(el.dataset.bookmark);el.textContent=state.data.bookmarks.includes(el.dataset.bookmark)?'★ Saved':'☆ Save question';})); }
function bank(){
  return heading('A question bank that grows with you.','Import new chapters, revise questions and keep a portable backup of your learning.','DATABASE & SOURCES')+
    '<div class="stats-grid">'+stat('Questions',fmt(state.data.total),'Validated, single-answer MCQs','▦')+stat('Chapters',state.data.chapters.length,'Each with a primer and exercise','▤')+stat('Bank version',esc(state.data.bank_version),'Schema version 1','⊞')+stat('Storage','SQLite','Local data/dataforge.sqlite3','◈')+'</div>'+
    '<div class="two-column"><section class="panel"><h3>Extend your curriculum</h3><p>Import a JSON question bank. Preview the changes first, then merge them into your database. Existing test results keep their original question snapshots.</p><div class="import-area"><label for="bank-file">Choose a question bank (.json)</label><input type="file" id="bank-file" accept=".json,application/json"><p class="small-note">Maximum 16 MB. Four distinct choices, one answer, an explanation and an HTTPS source are required.</p></div><div id="import-preview" role="status"></div><div class="actions"><button class="button" id="preview-import">Validate & preview →</button><a class="button secondary" href="/import-example.json" download>Download example</a></div><p class="small-note">New IDs add questions. To revise an existing question, keep its ID and increase its <span class="mono">revision</span>. Identical records are skipped. Every import is atomic: invalid files change nothing.</p></section><section class="panel tint"><h3>Keep a copy of your progress</h3><p>The question-bank export contains learning content. The full database backup also includes progress, bookmarks and session history.</p><div class="actions"><a class="button secondary" href="/api/export" download>Export question bank ↓</a><a class="button secondary" href="/api/backup" download>Back up everything ↓</a></div><p class="small-note">To restore a full backup, stop the server and run <span class="mono">python manage.py restore path/to/backup.sqlite3</span>. The restore command preserves a copy of your previous database.</p><p class="small-note">Offline learning works without external services. Documentation links require an internet connection.</p></section></div>'+
    '<div class="section-heading"><h2>Designed for learning, grounded in documentation.</h2></div><section class="panel"><p>This collection contains original interview-style and chapter-review questions, informed by official documentation. It is not a collection of leaked employer questions, and it cannot cover every possible interview topic. Each explanation links to its relevant reference.</p><p>The curriculum baseline is <strong>Python 3.11</strong> , <strong>NumPy 2.x</strong>, <strong>pandas 3.0</strong>, and <strong>Apache Spark 3.5.7</strong>. Version-specific assumptions appear on questions. Newer Spark releases can change defaults and behavior.</p><ul class="source-list"><li><a target="_blank" rel="noopener noreferrer" href="https://docs.python.org/3.11/tutorial/">Python tutorial</a> — language foundations, control flow and objects</li><li><a target="_blank" rel="noopener noreferrer" href="https://docs.python.org/3.11/library/">Python standard library</a> — files, data formats, databases and concurrency</li><li><a target="_blank" rel="noopener noreferrer" href="https://numpy.org/doc/2.2/user/">NumPy user guide</a> — arrays, broadcasting, memory and numerical computation</li><li><a target="_blank" rel="noopener noreferrer" href="https://pandas.pydata.org/pandas-docs/version/3.0/user_guide/">pandas user guide</a> — indexing, alignment, joins, Copy-on-Write and time series</li><li><a target="_blank" rel="noopener noreferrer" href="https://spark.apache.org/docs/3.5.7/api/python/">PySpark API reference</a> — DataFrames, expressions and transformations</li><li><a target="_blank" rel="noopener noreferrer" href="https://spark.apache.org/docs/3.5.7/sql-performance-tuning.html">Spark SQL performance tuning</a> — partitions, joins, caching and adaptive execution</li><li><a target="_blank" rel="noopener noreferrer" href="https://spark.apache.org/docs/3.5.7/structured-streaming-programming-guide.html">Structured Streaming guide</a> — event time, state and fault tolerance</li></ul><p class="small-note">Original educational material. Documentation belongs to its respective authors. Code examples are displayed as text; imported code is never executed by this app.</p></section>';
}
function bindBank(){
  $('#bank-file').onchange=()=>{state.importData=null;$('#import-preview').replaceChildren();};
  $('#preview-import').onclick=()=>guarded(async()=>{
    const file=$('#bank-file').files[0];if(!file)throw new Error('Choose a JSON question bank first.');if(file.size>16*1024*1024)throw new Error('The selected file exceeds 16 MB.');
    let data;try{data=JSON.parse(await file.text());}catch(e){throw new Error('This file is not valid JSON. Check its syntax and try again.');}
    const result=await api('/import/preview',data);state.importData=data;
    $('#import-preview').innerHTML='<div class="banner"><div><strong>Validation passed</strong><p>'+result.added+' new · '+result.updated+' revised · '+result.unchanged+' unchanged<br>'+result.total+' questions after import</p></div><button class="button" id="commit-import">Merge question bank</button></div>';
    $('#commit-import').onclick=()=>guarded(async()=>{const done=await api('/import/commit',state.importData);state.importData=null;await refresh();await route();toast('Bank updated: '+done.added+' added and '+done.updated+' revised.');});
  });
}
async function route(){
  const version=++state.route;
  clearInterval(state.timer);state.timer=null;
  const raw=(location.hash||'#home').slice(1),slash=raw.indexOf('/'),page=slash<0?raw:raw.slice(0,slash),arg=slash<0?'':decodeURIComponent(raw.slice(slash+1));
  const nav={home:'home',learn:'learn',lesson:'learn',test:'test',session:'test',results:'review',review:'review',library:'library',bank:'bank'}[page]||'home';
  $$('[data-nav]').forEach(a=>{a.classList.toggle('active',a.dataset.nav===nav);if(a.dataset.nav===nav)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  $('#breadcrumb').innerHTML='Workspace <span>/</span> '+({home:'Overview',learn:'Learning path',test:'Practice & tests',review:'Review & progress',library:'Question library',bank:'Question bank'}[nav]);
  document.title=({home:'Overview',learn:'Learning path',test:'Practice & tests',review:'Review & progress',library:'Question library',bank:'Question bank'}[nav])+' · DataForge';
  try{
    if(!state.data)await refresh();
    if(version!==state.route)return;
    let html;
    if(page==='learn')html=learn(arg||'All');
    else if(page==='lesson')html=lesson(arg);
    else if(page==='test'){await refresh();html=setup(arg);}
    else if(page==='review'){await refresh();html=review();}
    else if(page==='bank')html=bank();
    else if(page==='library')html=libraryShell();
    else if(page==='session'||page==='results'){
      state.attempt=await api('/attempts/'+arg);state.serverOffset=state.attempt.server_time-Date.now()/1000;
      if(page==='session'&&state.attempt.status==='finished'){await refresh();location.replace('#results/'+arg);return;}
      if(page==='results'&&state.attempt.status==='active'){location.replace('#session/'+arg);return;}
      html=page==='session'?session(state.attempt):results(state.attempt);
    }else{await refresh();html=home();}
    if(version!==state.route)return;
    $('#main').innerHTML=html;window.scrollTo(0,0);
    if(page==='test')bindSetup();
    if(page==='session'){bindSession();tick();state.timer=setInterval(tick,1000);}
    if(page==='results'){$('#result-filter').onchange=e=>{state.resultFilter=e.target.value;$('#main').innerHTML=results(state.attempt);bindResult();};bindBookmarks();}
    if(page==='library'){
      $('#library-form').onsubmit=e=>{e.preventDefault();clearTimeout(state.searchTimer);guarded(searchLibrary);};
      $('#library-search').oninput=()=>{clearTimeout(state.searchTimer);state.searchTimer=setTimeout(()=>guarded(searchLibrary),300);};
      $('#library-chapter').onchange=()=>guarded(searchLibrary);await loadLibrary();
    }
    if(page==='bank')bindBank();
  }catch(e){if(version===state.route)$('#main').innerHTML='<div class="banner error"><div><strong>Something needs your attention.</strong><p>'+esc(e.message)+'</p></div><button class="button secondary" id="retry-route">Retry</button></div>';if($('#retry-route'))$('#retry-route').onclick=route;}
}
function bindResult(){$('#result-filter').onchange=e=>{state.resultFilter=e.target.value;$('#main').innerHTML=results(state.attempt);bindResult();};bindBookmarks();}
async function searchLibrary(){if(!$('#library-search'))return;state.librarySearch=$('#library-search').value;state.libraryChapter=$('#library-chapter').value;state.libraryPage=1;await loadLibrary();}
$('#dialog-cancel').onclick=()=>$('#confirm-dialog').close();
$('#dialog-submit').onclick=()=>guarded(async()=>{$('#confirm-dialog').close();await mutateAttempt('submit',{});});
window.addEventListener('hashchange',route);
window.addEventListener('keydown',e=>{
  if(!location.hash.startsWith('#session/')||state.busy||$('#confirm-dialog').open||e.ctrlKey||e.metaKey||e.altKey||['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName))return;
  if(/^[1-4]$/.test(e.key)){const btn=$$('[data-choice]')[Number(e.key)-1];if(btn&&!btn.disabled){e.preventDefault();btn.click();}}
  if(e.key==='ArrowRight'&&$('#next-question')){e.preventDefault();$('#next-question').click();}
  if(e.key==='ArrowLeft'&&$('#previous-question')&&!$('#previous-question').disabled){e.preventDefault();$('#previous-question').click();}
});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&location.hash.startsWith('#session/')&&!state.busy)guarded(async()=>{const a=await api('/attempts/'+state.attempt.id);state.attempt=a;state.serverOffset=a.server_time-Date.now()/1000;if(a.status==='finished'){await refresh();location.hash='results/'+a.id;}else renderSession();});});
route();
