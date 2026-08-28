/* 건강이 스케줄 — 화면과 동작
   보여 주는 내용(시간표·학사일정·학습 항목)은 data.js 에 있습니다.
   여기는 그 데이터를 화면에 그리고 사용자의 조작을 처리하는 코드입니다. */

/* ═══════════ 시간표 보강·휴원 조정 + 저녁 학습 체크리스트 저장 데이터 ═══════════ */
/* ── 저장 어댑터 ──
   저장 위치는 어댑터 하나로 갈립니다. 기본은 이 기기(localStorage)이고,
   app-config.js 가 window.KG_CONFIG.firebase 를 주면 클라우드로 올라탑니다.
   화면 코드는 Store 만 보므로 어댑터를 바꿔도 나머지는 손대지 않습니다. */
const DATASETS = ['overrides', 'checks', 'assigns', 'studyMeta'];
const LS_PREFIX = 'kg-schedule/';

const LocalStore = {
  name: 'local',
  label: '이 기기에만 저장',
  async load(){
    const out = {};
    for (const k of DATASETS){
      try { out[k] = JSON.parse(localStorage.getItem(LS_PREFIX + k)); }
      catch(err){ out[k] = null; }
    }
    return out;
  },
  async save(data){
    for (const k of DATASETS) localStorage.setItem(LS_PREFIX + k, JSON.stringify(data[k]));
  }
};

/* 클라우드 어댑터는 설정이 들어왔을 때만 boot() 에서 끼워집니다 (cloud-store.js) */
let Store = LocalStore;

let overrides = {};
let checks = {};
let assigns = {};
let studyMeta = { added: [], removed: [], renamed: {}, special: {} };
let writable = true;
let saveTimer = null;
let editingStudyId = null;
let saveRetryCount = 0;

const $ = id => document.getElementById(id);

function setSave(s, txt){
  $('savechip').dataset.s = s;
  $('savetxt').textContent = txt;
  const rb = $('saveretry');
  if (rb) rb.hidden = (s !== 'readonly' && s !== 'error');
}

function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, m =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

/* ── 저장 ── */
const snapshot = () => ({ overrides, checks, assigns, studyMeta });

/* 클라우드를 쓰더라도 이 기기 사본은 항상 남깁니다 — 오프라인에서 바로 열리도록 */
function mirror(){
  try { LocalStore.save(snapshot()); } catch(err){}
}

function queueSave(){
  mirror();
  if (!writable) return;
  if (Store === LocalStore){ setSave('saved', LocalStore.label); return; }
  setSave('saving', '저장 중…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(doSave, 800);
}

async function doSave(){
  try {
    await Store.save(snapshot());
    setSave('saved', '저장됨');
    saveRetryCount = 0;
  } catch (err) {
    // 네트워크가 끊겨도 이 기기 사본은 이미 mirror() 로 남아 있으므로 기록을 잃지 않습니다.
    saveRetryCount++;
    if (saveRetryCount <= 4){
      setSave('saving', '연결을 기다리는 중… 다시 시도합니다');
      clearTimeout(saveTimer);
      saveTimer = setTimeout(doSave, Math.min(2000 * saveRetryCount, 15000));
      return;
    }
    setSave('local', '이 기기에만 저장됨 — 연결되면 자동 반영');
  }
}

function lockDown(){
  setSave('readonly', '읽기 전용 보기');
  closeDayPanel();
  buildCalendar();
}

/* 저장이 막혔을 때 새로고침 없이 다시 시도 */
function retrySave(){
  saveRetryCount = 0;
  writable = true;
  if (Store === LocalStore){ mirror(); setSave('saved', LocalStore.label); buildCalendar(); return; }
  setSave('saving', '다시 시도 중…');
  doSave().then(() => { if (writable) buildCalendar(); });
}
document.getElementById('saveretry') && document.getElementById('saveretry').addEventListener('click', retrySave);



let sfilter = 'all';

const mins = t => { const [a,b] = t.split(':').map(Number); return a*60 + b; };
const dur = e => mins(e[2]) - mins(e[1]);
const fmtDur = m => m >= 60 ? Math.floor(m/60) + '시간' + (m % 60 ? ' ' + (m % 60) + '분' : '') : m + '분';
const fmt = t => String(Math.floor(t/60)).padStart(2,'0') + ':' + String(t%60).padStart(2,'0');
const catOf = e => SUBJ[e[3]].cat;

function buildSchedule(){
  const todayIdx = [-1,0,1,2,3,4,-1][new Date().getDay()];

  // 분류 필터
  const order = ['neulbom','after','academy'];
  $('sfilters').innerHTML =
    '<button type="button" class="fbtn" data-f="all" aria-pressed="true">전체 <span class="cnt">' + EV.length + '</span></button>' +
    order.map(k => {
      const list = EV.filter(e => catOf(e) === k);
      const c = k === 'academy' ? 'var(--s-asobi)' : (k === 'after' ? 'var(--s-after)' : 'var(--s-neulbom)');
      return '<button type="button" class="fbtn" data-f="' + k + '" aria-pressed="false" style="--c:' + c + '">' +
        '<span class="sw"></span>' + SCAT[k].name + ' <span class="cnt">' + list.length + '</span></button>';
    }).join('');

  const totalMin = EV.reduce((a,e) => a + dur(e), 0);
  $('ssum').innerHTML = '월–금 <b>' + EV.length + '개</b> 일정 · 주 <b>' + fmtDur(totalMin) + '</b>';

  // 범례 — 분류별로 묶어서
  $('legend').innerHTML = order.map(k => {
    const names = Object.keys(SUBJ).filter(n => SUBJ[n].cat === k);
    const m = EV.filter(e => catOf(e) === k).reduce((a,e) => a + dur(e), 0);
    const sw = names.map(n => '<i style="--c:' + SUBJ[n].c + '"></i>').join('');
    const items = names.map(n => {
      const s = SUBJ[n], cnt = EV.filter(e => e[3] === n).length;
      return '<span class="lg" style="--c:' + s.c + '">' + s.i + ' ' + n +
        '<span class="cnt">주 ' + cnt + '</span></span>';
    }).join('');
    return '<div class="lgroup"><div class="lghead"><span class="sw">' + sw + '</span>' +
      SCAT[k].name + '<span class="mins">주 ' + fmtDur(m) + '</span></div>' +
      '<div class="lgitems">' + items + '</div></div>';
  }).join('');

  // 학교 일과가 끝나는 시간대 ↔ 학원이 시작되는 시간대
  const schoolEnds = DAYS.map((_, i) => EV.filter(e => e[0] === i && catOf(e) !== 'academy'))
    .filter(l => l.length).map(l => Math.max(...l.map(e => mins(e[2]))));
  const acaStarts = DAYS.map((_, i) => EV.filter(e => e[0] === i && catOf(e) === 'academy'))
    .filter(l => l.length).map(l => Math.min(...l.map(e => mins(e[1]))));
  const zTop = Math.min(...schoolEnds), zBot = Math.max(...acaStarts);

  // 시간축 — 정시 실선, 30분 점선
  const axis = $('axis');
  const cols = [...document.querySelectorAll('#p-sched .col')];
  for (let t = 13*60; t <= END; t += 30){
    const y = (t - START) / SPAN * H;
    const onHour = t % 60 === 0;
    if (onHour && !(t > zTop && t < zBot)){
      const d = document.createElement('div');
      d.className = 'tick'; d.style.top = y + 'px';
      d.innerHTML = '<span>' + String(t/60).padStart(2,'0') + ':00</span>';
      axis.appendChild(d);
    }
    cols.forEach(c => {
      const l = document.createElement('div');
      l.className = 'hline' + (onHour ? '' : ' half');
      l.style.top = y + 'px'; c.appendChild(l);
    });
  }

  // 학교 일과 ↔ 학원 전환 구간을 띠로 표시
  const y1 = (zTop - START) / SPAN * H, y2 = (zBot - START) / SPAN * H;
  cols.forEach(c => {
    const z = document.createElement('div');
    z.className = 'zone'; z.style.top = y1 + 'px'; z.style.height = (y2 - y1) + 'px';
    c.appendChild(z);
  });
  const zl = document.createElement('div');
  zl.className = 'zonelb';
  zl.style.top = y1 + 'px'; zl.style.height = (y2 - y1) + 'px';
  zl.textContent = '하교';
  axis.appendChild(zl);
  $('zoneinfo').textContent = fmt(zTop) + '–' + fmt(zBot);

  // 요일 헤더 — 일정 수 + 오늘 표시
  document.querySelectorAll('#p-sched .dayhead').forEach(h => {
    const d = Number(h.dataset.d);
    const list = EV.filter(e => e[0] === d);
    const m = list.reduce((a,e) => a + dur(e), 0);
    h.innerHTML = DAYS[d] + (d === todayIdx ? ' · 오늘' : '') + '<span class="cnt">' + list.length + '개 · ' + fmtDur(m) + '</span>';
    if (d === todayIdx){ h.classList.add('now'); cols[d].classList.add('now'); }
  });

  // 요일별 블록 — 겹치면 나란히
  DAYS.forEach((_, day) => {
    const list = EV.filter(e => e[0] === day)
      .map(e => ({s: mins(e[1]), e: mins(e[2]), raw: e}))
      .sort((a,b) => a.s - b.s);

    // 겹침 묶음
    let cluster = [], clusterEnd = -1;
    const flush = () => {
      if (!cluster.length) return;
      const lanes = [];
      cluster.forEach(it => {
        let li = lanes.findIndex(end => end <= it.s);
        if (li === -1){ li = lanes.length; lanes.push(0); }
        lanes[li] = it.e; it.lane = li;
      });
      const total = lanes.length;
      cluster.forEach(it => place(it, cols[day], it.lane, total));
      cluster = []; clusterEnd = -1;
    };
    list.forEach(it => {
      if (cluster.length && it.s >= clusterEnd) flush();
      cluster.push(it);
      clusterEnd = Math.max(clusterEnd, it.e);
    });
    flush();
  });

  buildGrid(todayIdx, 'tgrid');
  applyFilter();
}

/* 같은 시간대끼리 같은 열에 서는 정리표 — 가운데가 하교 경계 */
function buildGrid(todayIdx, targetId){
  targetId = targetId || 'tgrid';
  const byDay = i => EV.filter(e => e[0] === i).sort((a,b) => mins(a[1]) - mins(b[1]));
  const slotOf = e => e[3] === '늘봄' ? 0 : (catOf(e) === 'after' ? 1 : null);

  // 열 머리 시간대는 실제 데이터에서 뽑습니다
  const cells = [0,1,2,3].map(() => []);
  DAYS.forEach((_, i) => {
    const aca = [];
    byDay(i).forEach(e => {
      const s = slotOf(e);
      if (s === null) aca.push(e); else cells[s].push(e);
    });
    aca.forEach((e, k) => cells[Math.min(2 + k, 3)].push(e));
  });
  const range = arr => arr.length
    ? fmt(Math.min(...arr.map(e => mins(e[1])))) + '–' + fmt(Math.max(...arr.map(e => mins(e[2]))))
    : '';
  const HEADS = ['늘봄', '방과후', '학원 ①', '학원 ②'];

  let html = '<div class="thead"><div class="th">요일</div>' +
    [0,1].map(k => '<div class="th">' + HEADS[k] + '<span>' + range(cells[k]) + '</span></div>').join('') +
    '<div class="th mid">하교<br>이동</div>' +
    [2,3].map(k => '<div class="th">' + HEADS[k] + '<span>' + range(cells[k]) + '</span></div>').join('') +
    '</div>';

  const chip = (e, gapFrom) => {
    const [, s, en, subj, label] = e, meta = SUBJ[subj];
    const g = gapFrom == null ? null : mins(s) - gapFrom;
    return (g != null && g > 0 ? '<span class="tgap">↳ 쉬는 시간 ' + g + '분</span>' : '') +
      '<span class="tchip" data-cat="' + meta.cat + '" style="--c:' + meta.c + '">' + meta.i +
      '<span class="nm">' + (label || subj) + '</span><span class="tm">' + s + '–' + en + '</span></span>';
  };

  DAYS.forEach((day, i) => {
    const list = byDay(i);
    const school = list.filter(e => slotOf(e) !== null);
    const aca = list.filter(e => slotOf(e) === null);
    const m = list.reduce((a, e) => a + dur(e), 0);

    // 하교 경계 — 학교 마지막 종료 → 학원 첫 시작
    let mid = '<span class="tnone">–</span>';
    if (school.length && aca.length){
      const g = mins(aca[0][1]) - Math.max(...school.map(e => mins(e[2])));
      mid = g < 0 ? '<span class="midgap over">겹침 ' + (-g) + '분</span>'
                  : '<span class="midgap">' + (g === 0 ? '바로' : g + '분') + '</span>';
    }

    const cell = (k, prevEnd) => {
      const e = k < 2 ? school.find(x => slotOf(x) === k) : aca[k - 2];
      return '<div class="tc" data-col="' + HEADS[k] + '"><div class="tcin">' +
        (e ? chip(e, prevEnd) : '<span class="tnone">–</span>') + '</div></div>';
    };

    html += '<div class="trow' + (i % 2 ? ' alt' : '') + (i === todayIdx ? ' now' : '') +
      (i === DAYS.length - 1 ? ' last' : '') + '">' +
      '<div class="tc day"><div class="tcin"><b>' + day + '</b><em>' + fmtDur(m) + '</em>' +
      (i === todayIdx ? '<span class="badge">오늘</span>' : '') + '</div></div>' +
      cell(0) + cell(1) +
      '<div class="tc mid" data-col="하교 이동"><div class="tcin">' + mid + '</div></div>' +
      cell(2) + cell(3, aca[0] ? mins(aca[0][2]) : null) +
      '</div>';
  });

  $(targetId).innerHTML = html;
}

function place(it, col, lane, total){
  const [, s, e, subj, label] = it.raw;
  const meta = SUBJ[subj];
  const top = (it.s - START) / SPAN * H;
  const h = (it.e - it.s) / SPAN * H;
  const w = 100 / total;
  const box = Math.max(h - 3, 26);
  const el = document.createElement('div');
  el.className = 'ev' + (total > 1 ? ' narrow' : '') + (box < 56 ? ' short' : '');
  el.dataset.cat = meta.cat;
  el.style.setProperty('--c', meta.c);
  el.style.top = top + 'px';
  el.style.height = box + 'px';
  el.style.left = 'calc(' + (lane * w) + '% + 4px)';
  el.style.width = 'calc(' + w + '% - 8px)';
  el.innerHTML = '<span class="cat">' + SCAT[meta.cat].tag + '</span><b>' + meta.i + ' ' +
    (label || subj) + '</b><i>' + s + '–' + e + '</i>';
  col.appendChild(el);
}

function applyFilter(){
  document.querySelectorAll('#p-sched .ev, #p-sched .tchip').forEach(el => {
    el.classList.toggle('dim', sfilter !== 'all' && el.dataset.cat !== sfilter);
  });
  document.querySelectorAll('#sfilters .fbtn').forEach(b => {
    b.setAttribute('aria-pressed', String(b.dataset.f === sfilter));
  });
}

/* ── 시간표만 따로 내보내기 ──
   내보낸 HTML 파일은 다운로드 폴더 등 어디서 열릴지 알 수 없어서, 폰트 파일도
   원격 링크 대신 base64 로 CSS 안에 심어 그 파일 하나로 완결되게 만든다. */
async function embedFonts(css){
  const toDataUri = async path => {
    const buf = await (await fetch(path)).arrayBuffer();
    let bin = '';
    new Uint8Array(buf).forEach(b => { bin += String.fromCharCode(b); });
    return 'data:font/woff2;base64,' + btoa(bin);
  };
  try {
    const [sans, mono] = await Promise.all([
      toDataUri('fonts/IBMPlexSansKR-Regular.woff2'),
      toDataUri('fonts/IBMPlexMono-Regular.woff2')
    ]);
    return css
      .replace('fonts/IBMPlexSansKR-Regular.woff2', sans)
      .replace('fonts/IBMPlexMono-Regular.woff2', mono);
  } catch (err) { return css; }   // 실패해도 화면용 스타일은 그대로 살아 있다
}

function stamp(){
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

/* 지출 내용은 담지 않고, 시간표+학사 캘린더 영역만 독립 문서로 만듭니다 */
async function schedDoc(){
  // 스타일이 별도 파일이라 내보내기 문서에는 읽어서 심는다
  let exportCss = '';
  try { exportCss = await embedFonts(await (await fetch('styles.css')).text()); } catch(err){}

  const sched = $('p-sched').cloneNode(true);
  sched.classList.add('on');
  sched.removeAttribute('role');
  sched.removeAttribute('aria-labelledby');
  sched.querySelectorAll('.dim').forEach(el => el.classList.remove('dim'));
  const bar = sched.querySelector('.schedbar');
  if (bar) bar.remove();
  const xn = sched.querySelector('.xnote');
  if (xn) xn.remove();
  const ph = sched.querySelector('.printhead');
  if (ph) ph.style.display = 'block';

  const cal = $('p-cal').cloneNode(true);
  cal.classList.add('on');
  cal.removeAttribute('role');
  cal.removeAttribute('aria-labelledby');
  const dp = cal.querySelector('#daypanel');
  if (dp) dp.remove();
  // 라이브 주간 달력(네비게이션·배정 요약·주간 그리드)은 내보내기에서 제외하고,
  // 학기 전체를 훑는 정적 월별 달력을 그 자리에 채워 넣는다
  ['.wknav', '#wkassign', '#wgrid', '#daystrip', '.calswitch', '#monthview']
    .forEach(sel => { const el = cal.querySelector(sel); if (el) el.remove(); });
  const wkH2 = cal.querySelector('#wkh2');
  if (wkH2) wkH2.textContent = '날짜별 달력';
  const allweeks = cal.querySelector('#allweeks');
  if (allweeks){ allweeks.hidden = false; allweeks.innerHTML = buildAllWeeksHtml(); }
  // 접힌 학사 일정 목록도 내보내기 문서에서는 펼친 채로 담는다
  const evd = cal.querySelector('#evlist-details');
  if (evd) evd.setAttribute('open', '');

  const total = fmtDur(EV.reduce((a,e) => a + dur(e), 0));
  return '<!doctype html><html lang="ko"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>건강이 주간 시간표 · 2학기 학사 캘린더</title>' +
    '<style>' + exportCss + '</style></head><body><main class="wrap" style="padding-top:22px">' +
    sched.outerHTML.replace('<p id="printsub"></p>',
      '<p>월–금 ' + EV.length + '개 일정 · 주 ' + total + ' · ' + stamp() + ' 기준</p>') +
    '<h2 style="margin-top:38px">2026학년도 2학기 학사 캘린더 · 주간 달력</h2>' + cal.outerHTML +
    '</main></body></html>';
}

$('x-pdf').addEventListener('click', () => {
  $('printsub').textContent = '월–금 ' + EV.length + '개 일정 · 주 ' +
    fmtDur(EV.reduce((a,e) => a + dur(e), 0)) + ' · ' + stamp() + ' 기준';
  $('allweeks').innerHTML = buildAllWeeksHtml();
  $('wkh2').firstChild.textContent = '날짜별 달력 ';
  const evd = $('evlist-details');
  const wasOpen = evd ? evd.open : false;
  if (evd) evd.open = true;
  document.body.classList.add('print-sched');
  const off = () => {
    document.body.classList.remove('print-sched');
    $('wkh2').firstChild.textContent = calView === 'month' ? '월간 달력 ' : '주간 달력 ';
    if (evd) evd.open = wasOpen;
    window.removeEventListener('afterprint', off);
  };
  window.addEventListener('afterprint', off);
  setTimeout(() => window.print(), 60);
});

$('x-html').addEventListener('click', async () => {
  const btn = $('x-html'), note = $('xnote');
  btn.disabled = true; btn.textContent = '저장 중…';
  const done = (t, msg) => {
    btn.textContent = t; btn.disabled = false;
    if (msg){ note.hidden = false; note.textContent = msg; } else note.hidden = true;
    setTimeout(() => { btn.textContent = 'HTML 파일로 저장'; }, 2200);
  };
  try {
    const blob = new Blob([await schedDoc()], {type: 'text/html;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = '건강이_주간시간표_' + stamp() + '.html';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    done('저장됨');
  } catch (err) {
    done('다시 시도', '저장하지 못했습니다. 「PDF로 저장」으로도 내보낼 수 있습니다.');
  }
});

$('sfilters').addEventListener('click', ev => {
  const b = ev.target.closest('[data-f]');
  if (!b) return;
  sfilter = (sfilter === b.dataset.f) ? 'all' : b.dataset.f;
  applyFilter();
});








/* 저녁 학습 체크리스트 — 2학기 방학 전까지(SEM 범위) 매일 표시. target = 7일 중 목표 일수 */
/* 매주 반복되는 기본 학습 항목. 이 배열은 그대로 두고, 사용자가 바꾼 내용은
   studyMeta 에만 쌓아서 applyStudyMeta() 가 STUDY 를 매번 다시 만듭니다.
   덕분에 이름 변경·추가·삭제가 한 방향으로만 흐릅니다. */
let STUDY = [];   // 표를 읽은 뒤 applyStudyMeta() 가 BASE_STUDY 로부터 채웁니다

function applyStudyMeta(){
  const removed = new Set(studyMeta.removed || []);
  const renamed = studyMeta.renamed || {};
  STUDY = BASE_STUDY.concat(studyMeta.added || [])
    .filter(it => it && it.id && !removed.has(it.id))
    .map(it => Object.assign({}, it, renamed[it.id] ? { n: renamed[it.id] } : null));
}

/* 화면을 다시 그리고 저장까지 — 학습 항목을 건드리는 모든 경로가 이걸 씁니다 */
function studyChanged(){
  applyStudyMeta();
  editingStudyId = null;
  dataChanged();
  buildCalendar();
  if (selectedDate) renderDayPanel(selectedDate);
  queueSave();
}

function addStudyItem(name){
  name = (name || '').trim();
  if (!name) return;
  const id = 'custom_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  studyMeta.added = (studyMeta.added || []).concat([{ id, n: name, icon: '📌', target: 3 }]);
  studyChanged();
}

function renameStudyItem(id, name){
  name = (name || '').trim();
  if (!name || !STUDY.find(x => x.id === id)){ editingStudyId = null; renderWeek(currentWeekKey); return; }
  studyMeta.renamed = Object.assign({}, studyMeta.renamed, { [id]: name });
  studyChanged();
}

/* 매주 반복 항목을 목록에서 뺍니다. 기본 항목도 뺄 수 있고, 되돌리려면
   removed 에서 지우면 되므로 기록은 남겨 둡니다. */
function removeStudyItem(id){
  studyMeta.removed = (studyMeta.removed || []).concat([id]).filter((v, i, a) => a.indexOf(v) === i);
  studyChanged();
}

/* ── 특별 학습 — 그날 하루에만 붙는 항목 ──
   매주 반복되는 STUDY 와 달리 날짜에 매달려 있어서 배정 로직을 타지 않습니다. */
const specialFor = dateKey => ((studyMeta.special || {})[dateKey] || []);

/* 그날 화면에 뜨는 학습 목록 = 이번 주 배정된 반복 항목(+이미 체크된 것) + 그날의 특별 학습.
   주간 달력 · 월간 달력 · 수정 패널이 모두 이 함수를 거치므로 세 화면이 항상 같은 목록을 봅니다. */
function dayStudyList(k, weekKey, wd){
  const dayChk = checks[k] || {};
  const repeat = STUDY.filter(it =>
    dayChk[it.id] || it.target >= 7 || assignedDaysForWeek(weekKey, it).has(mon0(wd)));
  return repeat.concat(specialFor(k).map(s => Object.assign({}, s, { special: true })));
}

function addSpecialStudy(dateKey, name){
  name = (name || '').trim();
  if (!name) return;
  const item = { id: 'sp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                 n: name, icon: '⭐' };
  const sp = Object.assign({}, studyMeta.special);
  sp[dateKey] = (sp[dateKey] || []).concat([item]);
  studyMeta.special = sp;
  studyChanged();
}

function removeSpecialStudy(dateKey, id){
  const sp = Object.assign({}, studyMeta.special);
  sp[dateKey] = (sp[dateKey] || []).filter(x => x.id !== id);
  if (!sp[dateKey].length) delete sp[dateKey];
  studyMeta.special = sp;
  // 지운 항목의 완료 표시도 함께 걷어냅니다
  if (checks[dateKey]){
    const day = Object.assign({}, checks[dateKey]);
    delete day[id];
    if (Object.keys(day).length) checks[dateKey] = day; else delete checks[dateKey];
  }
  studyChanged();
}
function mondayOf(dateKey){
  const d = parse(dateKey), wd = d.getDay();
  const diff = wd === 0 ? -6 : 1 - wd;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
}
function weekCount(dateKey, itemId){
  const mon = mondayOf(dateKey);
  let n = 0;
  for (let i = 0; i < 7; i++){
    const kk = dkey(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i));
    if (checks[kk] && checks[kk][itemId]) n++;
  }
  return n;
}
function toggleCheck(dateKey, itemId){
  const day = Object.assign({}, checks[dateKey]);
  if (day[itemId]) delete day[itemId]; else day[itemId] = true;
  if (Object.keys(day).length) checks[dateKey] = day; else delete checks[dateKey];
  buildCalendar();
  if (selectedDate) renderDayPanel(selectedDate);
  queueSave();
}


const dkey = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
const parse = k => { const [y,m,d] = k.split('-').map(Number); return new Date(y, m-1, d); };

function expand(list){
  const map = {};
  list.forEach(e => {
    let d = parse(e.d); const end = parse(e.to || e.d);
    const weekdayOnly = e.k !== 'off' && e.k !== 'vac';
    while (d <= end){
      const wd = d.getDay();
      if (!weekdayOnly || (wd >= 1 && wd <= 5)) (map[dkey(d)] = map[dkey(d)] || []).push(e);
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate()+1);
    }
  });
  return map;
}

function computeOffDays(){
  const offDays = {};
  ACAD.filter(e => e.k === 'off').forEach(e => {
    let d = parse(e.d); const end = parse(e.to || e.d);
    while (d <= end){ offDays[dkey(d)] = e.t; d = new Date(d.getFullYear(), d.getMonth(), d.getDate()+1); }
  });
  return offDays;
}

/* 월요일=0…일요일=6 로 맞춘 요일 인덱스 (JS getDay()는 일요일=0 시작) */
function mon0(wd){ return wd === 0 ? 6 : wd - 1; }

function weekKeyOf(dateKey){ return dkey(mondayOf(dateKey)); }
function shiftWeek(weekKey, delta){
  const mon = parse(weekKey);
  return dkey(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + delta*7));
}
function initialWeekKey(){
  const now = new Date();
  const s = parse(SEM.start), en = parse(SEM.end);
  const base = (now >= s && now <= en) ? now : s;
  return weekKeyOf(dkey(base));
}

/* 문자열을 시드로 하는 결정적 의사난수 — 새로고침해도 이번 주 배정이 그대로 유지되도록 Math.random 대신 사용 */
function seedRand(str){
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  let state = h >>> 0;
  return function(){
    state |= 0; state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* 자동 배정 규칙: 토·일에는 하루 3건을 넘지 않도록, 그림일기·독서기록지는 같은 요일에 겹치지 않도록 —
   개별 항목을 따로 셔플하면 이 두 조건을 지킬 수 없어서, 한 주 전체를 한 번에 계산해 weekKey 단위로 캐시해 둔다 */
/* 자동 배정 계획은 assigns 와 STUDY 를 입력으로 삼는다. 입력이 바뀌었는데 캐시가
   남아 있으면 저장한 배정이 화면에 반영되지 않는다(실제로 그런 버그가 있었다).
   그래서 캐시를 '데이터 버전'에 묶고, 데이터를 바꾸는 곳은 dataChanged() 만
   부르게 했다. 캐시 객체를 직접 손대는 곳은 이제 없다. */
let dataVer = 0;
const dataChanged = () => { dataVer++; };
let _weekPlanCache = { key: null, ver: -1, plan: null };

function computeAutoWeekPlan(weekKey){
  const quotaItems = STUDY.filter(it => it.target < 7);
  const dayCount = [0,0,0,0,0,0,0];
  const usedByNoOverlap = {};
  // 이미 수동으로 배정된 항목은 그대로 두되, 주말 상한 계산에는 포함시킨다
  quotaItems.forEach(it => {
    const key = weekKey + '::' + it.id;
    if (assigns[key]){
      assigns[key].forEach(d => { dayCount[d] = (dayCount[d] || 0) + 1; });
      if (NO_OVERLAP_IDS.includes(it.id)) assigns[key].forEach(d => { usedByNoOverlap[d] = true; });
    }
  });

  const rand = seedRand(weekKey + '::autoplan');
  const toPlace = quotaItems.filter(it => !assigns[weekKey + '::' + it.id]);
  // 그림일기·독서기록지처럼 상호 배제가 걸린 항목을 먼저 배치해서 서로 자리를 피하게 한다
  toPlace.sort((a, b) => {
    const rank = id => NO_OVERLAP_IDS.includes(id) ? 0 : 1;
    return rank(a.id) - rank(b.id);
  });

  const plan = {};
  toPlace.forEach(it => {
    const idx = [0,1,2,3,4,5,6];
    for (let i = idx.length - 1; i > 0; i--){
      const j = Math.floor(rand() * (i + 1));
      const tmp = idx[i]; idx[i] = idx[j]; idx[j] = tmp;
    }
    const isNoOverlap = NO_OVERLAP_IDS.includes(it.id);
    const chosen = [];
    // 1단계 — 주말 상한 + 상호 배제를 모두 지키며 채운다
    for (const d of idx){
      if (chosen.length >= it.target) break;
      if ((d === 5 || d === 6) && dayCount[d] >= WEEKEND_DAILY_CAP) continue;
      if (isNoOverlap && usedByNoOverlap[d]) continue;
      chosen.push(d);
    }
    // 2단계 — 그래도 목표만큼 못 채웠으면 주말 상한만은 유지하고 상호 배제를 완화한다
    if (chosen.length < it.target){
      for (const d of idx){
        if (chosen.length >= it.target) break;
        if (chosen.includes(d)) continue;
        if ((d === 5 || d === 6) && dayCount[d] >= WEEKEND_DAILY_CAP) continue;
        chosen.push(d);
      }
    }
    // 3단계 — 극단적인 경우에만 주말 상한도 완화해 남은 자리를 채운다
    if (chosen.length < it.target){
      for (const d of idx){
        if (chosen.length >= it.target) break;
        if (chosen.includes(d)) continue;
        chosen.push(d);
      }
    }
    chosen.forEach(d => {
      dayCount[d] = (dayCount[d] || 0) + 1;
      if (isNoOverlap) usedByNoOverlap[d] = true;
    });
    plan[it.id] = new Set(chosen);
  });
  return plan;
}

/* 이번 주(weekKey=월요일 날짜키)에 해당 학습 항목이 배정된 요일 집합 (월=0…일=6) */
function assignedDaysForWeek(weekKey, item){
  if (item.target >= 7) return new Set([0,1,2,3,4,5,6]);
  const akey = weekKey + '::' + item.id;
  if (assigns[akey]) return new Set(assigns[akey]);
  if (!_weekPlanCache.plan || _weekPlanCache.key !== weekKey || _weekPlanCache.ver !== dataVer){
    _weekPlanCache = { key: weekKey, ver: dataVer, plan: computeAutoWeekPlan(weekKey) };
  }
  return _weekPlanCache.plan[item.id] || new Set();
}
/* ── 학습 배정 편집 ──
   요일을 누르면 바로 반영하지 않고 여기에 쌓아 둔다. [저장]을 눌러야 assigns 로
   옮겨지고 달력이 다시 그려지며 서버로 올라간다. 누를 때마다 달력이 튀지 않고,
   여러 개를 고친 뒤 한 번에 반영할 수 있다. */
let pendingAssigns = null;

const hasPendingAssigns = () => !!pendingAssigns && Object.keys(pendingAssigns).length > 0;

/* 화면에 그릴 배정 — 저장 전 값이 있으면 그걸 먼저 쓴다 */
function shownAssignDays(weekKey, item){
  const akey = weekKey + '::' + item.id;
  if (pendingAssigns && akey in pendingAssigns) return new Set(pendingAssigns[akey]);
  return assignedDaysForWeek(weekKey, item);
}

function toggleAssignDay(weekKey, itemId, dayIdx){
  const item = STUDY.find(it => it.id === itemId);
  if (!item || item.target >= 7) return;
  const akey = weekKey + '::' + itemId;
  if (!pendingAssigns) pendingAssigns = {};
  const cur = new Set(shownAssignDays(weekKey, item));
  if (cur.has(dayIdx)) cur.delete(dayIdx); else cur.add(dayIdx);
  pendingAssigns[akey] = [...cur].sort((a, b) => a - b);
  renderAssignCard(weekKey);
}

/* [저장] — 쌓아 둔 배정을 확정한다.
   buildCalendar() 가 주간과 (월간을 보고 있다면) 월간을 함께 다시 그리고,
   queueSave() 가 서버로 올린다. 다른 기기는 구독으로 곧바로 따라온다. */
function saveAssigns(){
  if (!hasPendingAssigns()) return;
  Object.assign(assigns, pendingAssigns);
  pendingAssigns = null;
  dataChanged();
  buildCalendar();
  if (selectedDate) renderDayPanel(selectedDate);
  queueSave();
}

function cancelAssigns(){
  pendingAssigns = null;
  renderAssignCard(currentWeekKey);
}

function renderAssignCard(weekKey){
  const quotaItems = STUDY.filter(it => it.target < 7);
  const dirty = hasPendingAssigns();

  $('wkassign').innerHTML = '<h4>이번 주 학습 배정' +
    (writable
      ? '<span class="wa-hint">요일을 눌러 배정 추가 · 취소 · 이름 옆 ✏️로 수정</span>'
      : '<span class="wa-hint">자동 무작위 배정</span>') + '</h4>' +
    quotaItems.map(it => {
      const shown = shownAssignDays(weekKey, it);
      const saved = assignedDaysForWeek(weekKey, it);
      const changed = shown.size !== saved.size || [...shown].some(d => !saved.has(d));
      const done = weekCount(weekKey, it.id);
      const dayBtns = WNAMES.map((wn, i) => {
        const on = shown.has(i);
        const moved = on !== saved.has(i);
        return writable
          ? '<button type="button" class="wa-day' + (on ? ' on' : '') + (moved ? ' dirty' : '') +
            '" data-assign="' + weekKey + '::' + it.id + '::' + i + '" aria-pressed="' + on + '">' + wn + '</button>'
          : '<span class="wa-day' + (on ? ' on' : '') + '">' + wn + '</span>';
      }).join('');
      const nameBlock = !writable
        ? '<span class="wa-n">' + esc(it.n) + '</span>'
        : editingStudyId === it.id
          ? '<span class="wa-rename">' +
            '<input type="text" class="wa-rename-input" id="wa-rename-input" value="' + esc(it.n) + '" data-rename-id="' + it.id + '" maxlength="20">' +
            '<button type="button" class="wa-mini on" data-rename-save="' + it.id + '">저장</button>' +
            '<button type="button" class="wa-mini" data-rename-cancel="1">취소</button></span>'
          : '<button type="button" class="wa-n wa-nbtn" data-rename-open="' + it.id + '" title="이름 수정">' +
            esc(it.n) + '<span class="wa-editicon" aria-hidden="true">✏️</span></button>';
      return '<div class="wa-row' + (changed ? ' changed' : '') + '"><span class="wa-ic">' + it.icon + '</span>' +
        nameBlock + '<span class="wa-daybtns">' + dayBtns + '</span>' +
        '<span class="wa-prog">' + (changed ? '<b class="wa-chg">변경됨</b> · ' : '') +
        done + '/' + it.target + '일 완료</span></div>';
    }).join('') +
    (writable
      ? '<div class="wa-savebar' + (dirty ? ' on' : '') + '">' +
          '<span class="wa-savemsg">' + (dirty
            ? '바뀐 배정은 <b>저장</b>을 눌러야 달력에 반영됩니다.'
            : '요일을 눌러 이번 주 배정을 바꿀 수 있습니다.') + '</span>' +
          '<button type="button" class="wa-mini" id="wa-cancel"' + (dirty ? '' : ' disabled') + '>되돌리기</button>' +
          '<button type="button" class="wa-mini on" id="wa-save"' + (dirty ? '' : ' disabled') + '>저장</button>' +
        '</div>' +
        '<div class="wa-addrow"><input type="text" class="wa-newitem-input" id="wa-newitem-input" placeholder="새 학습 항목 이름" maxlength="20">' +
        '<button type="button" class="wa-mini on" id="wa-additem-btn">+ 항목 추가</button></div>'
      : '');

  if (editingStudyId){
    const inp = $('wa-rename-input');
    if (inp){ inp.focus(); inp.select(); }
  }
}

/* 하루치 등교/학원/휴업 정보 계산 — 월별 정적 달력(내보내기용)과 주간 달력(화면용)이 함께 사용 */
function dayCellParts(k, d, wd, offDays, byDay){
  const s = parse(SEM.start), en = parse(SEM.end);
  const inSem = d >= s && d <= en;
  const isOff = !!offDays[k];
  const evs = (byDay[k] || []).filter(e => e.k !== 'off' && e.k !== 'vac');
  const isSchool = inSem && wd >= 1 && wd <= 5 && !isOff;

  let banner = '', title = '';
  if (evs.length){
    const c = KIND[evs[0].k].c;
    banner = '<div class="dots" style="--c:' + c + '">' + evs.map(() => '<i></i>').join('') + '</div>' +
      evs.map(e => '<div class="ev" style="--c:' + KIND[e.k].c + '">' + (e.s || e.t) + '</div>').join('');
    title += (title ? ' · ' : '') + evs.map(e => e.t).join(' · ');
  } else if (isOff){
    banner = '<div class="ev" style="--c:var(--crit)">' + offDays[k] + '</div>';
    title = offDays[k];
  }

  let icons = '', agenda = '', changed = false;
  const wd0 = wd - 1; // 월=0…금=4, 토=5, 일=-1(EV 조회 범위 밖 — instancesFor가 보강 이동만 남겨줌)
  if (inSem){
    const rawInst = instancesFor(k, wd0);
    changed = rawInst.some(x => x.state !== 'normal');
    // 공휴일 · 휴업일에는 오버라이드가 없어도 자동으로 휴원 처리해 보여준다
    const inst = rawInst.map(x => (isOff && x.state !== 'makeup') ? Object.assign({}, x, {state:'holiday'}) : x);
    const active = inst.filter(x => x.state !== 'cancel' && x.state !== 'moved' && x.state !== 'holiday');
    if (active.length || isSchool){
      icons = active.map(x => SUBJ[x.e[3]].i + (x.state === 'makeup' ? '<sup>+</sup>' : '')).join('');
      const dayName = (wd0 >= 0 && wd0 <= 4) ? DAYS[wd0] + '요일' : (wd === 0 ? '일요일' : '토요일');
      title += (title ? ' · ' : '') + dayName + (isSchool ? ' 하교 ' + LEAVE[wd0] : '') + ' · ' +
        (active.length
          ? active.map(x => (x.e[4] || x.e[3]) + ' ' + x.e[1] + '–' + x.e[2] +
              (x.state === 'makeup' ? ' (보강)' : '')).join(', ')
          : '일정 없음');
      if (inst.some(x => x.state === 'cancel')) title += ' · 휴원 있음';
      if (inst.some(x => x.state === 'moved')) title += ' · 다른 날로 보강 이동됨';
      if (isOff) title += ' · 휴업일 자동 휴원';
    }

    const gapDef = GAP.find(g => g.wd === wd0);
    let rows = inst.map(x => ({
      t: x.e[1], lb: x.e[4] || x.e[3], c: SUBJ[x.e[3]].c, state: x.state
    }));
    if (gapDef) rows.push({t: gapDef.t, lb: gapDef.s, gap: true, state: isOff ? 'holiday' : 'normal'});
    rows.sort((a, b) => mins(a.t) - mins(b.t));
    if (isSchool) agenda += PERIODS[wd0].map(p =>
      '<div class="cev per"><i></i><span class="tm">' + p.t + '</span><span class="lb">' + p.s + '</span></div>').join('');
    if (isSchool && rows.length) agenda += '<div class="cdiv"></div>';
    agenda += rows.map(r => {
      const off = r.state === 'cancel' || r.state === 'holiday' || r.state === 'moved';
      let lb = r.lb;
      if (r.state === 'moved') lb += ' (보강 이동)';
      if (r.state === 'makeup') lb += '<span class="mk">[보강]</span>';
      return '<div class="cev' + (r.gap ? ' gap' : ' aca') + (off ? ' off' : '') + '" style="--c:' +
        (r.c || 'var(--ink-3)') + '"><i></i><span class="tm">' + r.t + '</span><span class="lb">' + lb + '</span></div>';
    }).join('');
  }

  return {inSem, isOff, isSchool, banner, title, icons, agenda, changed, wd0};
}

/* 월별 정적 달력 셀(읽기 전용) — PDF·HTML 내보내기 전용 */
function monthCellHtml(k, dd, wd, offDays, byDay, todayKey){
  const d = parse(k);
  const p = dayCellParts(k, d, wd, offDays, byDay);
  const cls = ['cell'];
  if (wd === 0) cls.push('sun'); if (wd === 6) cls.push('sat');
  if (p.isOff) cls.push('off');
  else if (!p.inSem) cls.push('vac');
  if (k === todayKey) cls.push('today');

  let body = '';
  if (p.inSem){
    if (p.icons || p.isSchool) body += '<div class="icons' + (p.changed ? ' has-change' : '') + '">' + p.icons + '</div>';
    if (p.agenda) body += '<div class="agenda">' + p.agenda + '</div>';
    const dayChk = checks[k] || {};
    const wk = weekKeyOf(k);
    const dayStudy = STUDY.filter(it => dayChk[it.id] || it.target >= 7 || assignedDaysForWeek(wk, it).has(mon0(wd)));
    const doneN = dayStudy.filter(it => dayChk[it.id]).length;
    body += '<div class="study" title="저녁 학습 ' + doneN + '/' + dayStudy.length + ' 완료">' +
      dayStudy.map(it => '<span class="schk' + (dayChk[it.id] ? ' on' : '') + '">' + it.icon + '</span>').join('') + '</div>';
  }
  body = p.banner + body;
  if (p.changed) body += '<span class="flag">수정됨</span>';
  return '<div class="' + cls.join(' ') + '"' +
    (p.title ? ' title="' + p.title.replace(/"/g,'&quot;') + '"' : '') +
    '><span class="dn">' + dd + '</span>' + body + '</div>';
}

/* 학기 전체를 월별로 훑는 정적 달력 HTML — PDF/HTML 내보내기에서만 사용 */
function buildAllWeeksHtml(){
  const byDay = expand(ACAD);
  const offDays = computeOffDays();
  const s = parse(SEM.start), en = parse(SEM.end);
  const todayKey = dkey(new Date());
  let months = [];
  let cur = new Date(s.getFullYear(), s.getMonth(), 1);
  const last = new Date(en.getFullYear(), en.getMonth(), 1);
  while (cur <= last){
    const y = cur.getFullYear(), m = cur.getMonth();
    const first = new Date(y, m, 1), dim = new Date(y, m+1, 0).getDate();
    let cells = '', inMonth = 0;
    for (let i = 0; i < first.getDay(); i++) cells += '<div class="cell out"></div>';
    for (let dd = 1; dd <= dim; dd++){
      const d = new Date(y, m, dd), k = dkey(d), wd = d.getDay();
      const inSem = d >= s && d <= en, isOff = !!offDays[k];
      if (inSem && wd >= 1 && wd <= 5 && !isOff) inMonth++;
      cells += monthCellHtml(k, dd, wd, offDays, byDay, todayKey);
    }
    const restCells = (7 - ((first.getDay() + dim) % 7)) % 7;
    for (let i = 0; i < restCells; i++) cells += '<div class="cell out"></div>';
    months.push('<div class="month"><div class="mhead"><b>' + (m+1) + '월</b>' +
      '<span>' + y + ' · 등교 ' + inMonth + '일</span></div>' +
      '<div class="wdays"><div>일</div><div>월</div><div>화</div><div>수</div><div>목</div><div>금</div><div>토</div></div>' +
      '<div class="mgrid">' + cells + '</div></div>');
    cur = new Date(y, m+1, 1);
  }
  return months.join('');
}

/* 주간 달력(화면용) 하루 컬럼 — 클릭 가능한 학습 체크리스트 + 수정 버튼 포함 */
function weekDayColHtml(k, wd, offDays, byDay, weekKey, todayKey){
  const d = parse(k);
  const p = dayCellParts(k, d, wd, offDays, byDay);
  const cls = ['cell', 'wcol'];
  if (wd === 0) cls.push('sun'); if (wd === 6) cls.push('sat');
  if (p.isOff) cls.push('off');
  else if (!p.inSem) cls.push('vac');
  if (k === todayKey) cls.push('today');

  let body = p.banner;
  if (p.inSem){
    if (p.agenda) body += '<div class="agenda">' + p.agenda + '</div>';
    else if (!p.isSchool) body += '<div class="agenda"><div class="cev" style="color:var(--ink-3)"><i></i><span class="lb">일정 없음</span></div></div>';

    const dayChk = checks[k] || {};
    const dayStudy = dayStudyList(k, weekKey, wd);
    const doneN = dayStudy.filter(it => dayChk[it.id]).length;
    body += '<div class="cdiv"></div><div class="wstudy" role="group" aria-label="' +
      (d.getMonth()+1) + '월 ' + d.getDate() + '일 저녁 학습 체크">' +
      (dayStudy.length ? dayStudy.map(it => {
        const on = !!dayChk[it.id];
        return '<button type="button" class="wchk' + (on ? ' on' : '') + (it.special ? ' sp' : '') +
          '" data-check="' + k + '::' + it.id + '" aria-pressed="' + on + '" title="' +
          esc(it.n) + (on ? ' — 완료' : ' — 미완료') + '">' +
          '<span class="wc-ic" aria-hidden="true">' + (on ? '✅' : it.icon) + '</span>' +
          '<span class="wc-n">' + esc(it.n) + '</span></button>';
      }).join('') +
      '<p class="wstudy-sum' + (doneN === dayStudy.length ? ' all' : '') + '">' +
        (doneN === dayStudy.length ? '오늘 다 했어요 🎉' : doneN + '/' + dayStudy.length + ' 완료') + '</p>'
      : '<p class="wstudy-empty">이번 주 배정 없음</p>') + '</div>';
  }
  if (p.changed) body += '<span class="flag">수정됨</span>';
  const editBtn = p.inSem ? '<button type="button" class="wedit" data-editday="' + k + '">수정</button>' : '';
  return '<div class="' + cls.join(' ') + '" data-date="' + k + '"' +
    (p.title ? ' title="' + p.title.replace(/"/g,'&quot;') + '"' : '') + '>' +
    '<div class="wcolhead"><span class="dn">' + (d.getMonth()+1) + '/' + d.getDate() + ' (' + WNAMES[mon0(wd)] + ')</span>' + editBtn + '</div>' +
    body + '</div>';
}

/* 주간 달력을 화면에 그린다 — 상단 라벨, 학습 배정 요약, 7일 컬럼 */
function renderWeek(weekKey){
  currentWeekKey = weekKey;
  const byDay = expand(ACAD);
  const offDays = computeOffDays();
  const todayKey = dkey(new Date());
  const mon = parse(weekKey);
  const days = [];
  for (let i = 0; i < 7; i++){
    const d = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i);
    days.push({k: dkey(d), wd: d.getDay()});
  }
  const first = parse(days[0].k), lastD = parse(days[6].k);
  const label = (first.getMonth()+1) + '월 ' + first.getDate() + '일 – ' +
    (lastD.getMonth() !== first.getMonth() ? (lastD.getMonth()+1) + '월 ' : '') + lastD.getDate() + '일';
  $('wklabel').textContent = calView === 'week' ? '— ' + label : '';
  $('wk-prev').disabled = !weekInSem(shiftWeek(weekKey, -1));
  $('wk-next').disabled = !weekInSem(shiftWeek(weekKey, 1));

  // 카드 7장은 화면 크기와 무관하게 늘 그려 둔다. 폰에서는 CSS 가 고른 한 장만 보여 준다.
  $('wgrid').innerHTML = days.map(({k, wd}) => weekDayColHtml(k, wd, offDays, byDay, weekKey, todayKey)).join('');

  // 이번 주에 없는 날이 골라져 있으면 오늘로, 오늘도 이번 주가 아니면 월요일로 맞춘다
  if (!days.some(d => d.k === activeDay))
    activeDay = days.some(d => d.k === todayKey) ? todayKey : days[0].k;

  $('daystrip').innerHTML = days.map(({k, wd}) => {
    const d = parse(k);
    const done = Object.keys(checks[k] || {}).length;
    return '<button type="button" class="ds' + (k === todayKey ? ' istoday' : '') +
      '" role="tab" data-day="' + k + '" aria-selected="' + (k === activeDay) + '">' +
      '<b>' + WNAMES[mon0(wd)] + '</b><span>' + d.getDate() + '</span>' +
      '<i class="dsdot' + (done ? '' : ' off') + '"></i></button>';
  }).join('');
  markActiveDay();

  renderAssignCard(weekKey);
  if (selectedDate) markSelectedCell();
}

/* ═══════════ 월간 달력 ═══════════
   요일 카드는 주간과 똑같은 weekDayColHtml() 로 찍습니다. 렌더 경로가 하나뿐이라
   월간에서 체크한 내용이 주간에도 같은 모습으로 그대로 나타납니다. */
let currentMonthKey = null;
let briefMode = false;

const monthKeyOf = dateKey => dateKey.slice(0, 7);

function shiftMonth(mk, delta){
  const [y, m] = mk.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

/* 학기(개학~종업) 와 걸치는 달·주만 오갈 수 있게 해서 빈 화면으로 새 나가지 않도록 합니다 */
function monthInSem(mk){
  const [y, m] = mk.split('-').map(Number);
  return new Date(y, m, 0) >= parse(SEM.start) && new Date(y, m - 1, 1) <= parse(SEM.end);
}
function weekInSem(wk){
  const mon = parse(wk);
  return new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6) >= parse(SEM.start)
      && mon <= parse(SEM.end);
}

function initialMonthKey(){
  const now = new Date();
  const inSem = now >= parse(SEM.start) && now <= parse(SEM.end);
  return monthKeyOf(dkey(inSem ? now : parse(SEM.start)));
}

function renderMonth(mk){
  currentMonthKey = mk;
  const [y, m] = mk.split('-').map(Number);
  const byDay = expand(ACAD), offDays = computeOffDays(), todayKey = dkey(new Date());
  const first = new Date(y, m - 1, 1), dim = new Date(y, m, 0).getDate();

  let cells = '';
  for (let i = 0; i < first.getDay(); i++) cells += '<div class="cell out"></div>';
  for (let dd = 1; dd <= dim; dd++){
    const d = new Date(y, m - 1, dd), k = dkey(d);
    cells += weekDayColHtml(k, d.getDay(), offDays, byDay, weekKeyOf(k), todayKey);
  }
  const rest = (7 - ((first.getDay() + dim) % 7)) % 7;
  for (let i = 0; i < rest; i++) cells += '<div class="cell out"></div>';

  const grid = $('mgrid');
  grid.className = 'mmonth' + (briefMode ? ' brief' : '');
  grid.innerHTML = cells;
  $('m-title').textContent = y + '년 ' + m + '월';
  $('m-prev').disabled = !monthInSem(shiftMonth(mk, -1));
  $('m-next').disabled = !monthInSem(shiftMonth(mk, 1));
  if (selectedDate) markSelectedCell();
}

/* ── 폰에서 펼쳐 보는 요일 ──
   카드 7장은 항상 그려 두고, 이 값이 가리키는 한 장에만 .active 를 단다.
   PC 에서는 7장이 그대로 다 보이므로 이 값은 화면에 영향을 주지 않는다. */
let activeDay = null;

function markActiveDay(){
  document.querySelectorAll('#wgrid .cell').forEach(c =>
    c.classList.toggle('active', c.dataset.date === activeDay));
  document.querySelectorAll('#daystrip .ds').forEach(b =>
    b.setAttribute('aria-selected', String(b.dataset.day === activeDay)));
}

function setActiveDay(k){
  activeDay = k;
  markActiveDay();
}

/* ── 주간 ↔ 월간 전환 ── */
let calView = 'week';

function setCalView(v){
  calView = (v === 'month') ? 'month' : 'week';
  const week = calView === 'week';
  $('cv-week').setAttribute('aria-selected', String(week));
  $('cv-month').setAttribute('aria-selected', String(!week));
  $('weekview').hidden = !week;
  $('monthview').hidden = week;
  $('m-brief').hidden = week;
  $('wkh2').firstChild.textContent = week ? '주간 달력 ' : '월간 달력 ';
  if (week) renderWeek(currentWeekKey || initialWeekKey());
  else { $('wklabel').textContent = ''; renderMonth(currentMonthKey || initialMonthKey()); }
  try { sessionStorage.setItem('kg-calview', calView); } catch(err){}
}

function buildCalendar(){
  const offDays = computeOffDays();
  const s = parse(SEM.start), en = parse(SEM.end);

  // 범례
  $('callegend').innerHTML = Object.entries(KIND).map(([k, v]) =>
    '<span class="clg" style="--c:' + v.c + '"><i></i>' + v.n + '</span>').join('') +
    '<span class="clg" style="--c:var(--s-neulbom)"><i></i>주간 루틴 반복</span>' +
    '<span class="clg" style="--c:var(--accent)"><i></i>보강 · 휴원 조정됨</span>';

  // 저녁 학습 체크리스트 범례
  $('studylegend').innerHTML = STUDY.map(it =>
    '<span class="clg">' + it.icon + ' ' + it.n + ' · ' + (it.target >= 7 ? '매일' : '주 ' + it.target + '일') + '</span>').join('');

  // 학기 전체 등교일수 집계 (요약 카드용)
  let schoolDays = 0;
  { let d = new Date(s); while (d <= en){
      const wd = d.getDay();
      if (wd >= 1 && wd <= 5 && !offDays[dkey(d)]) schoolDays++;
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate()+1);
    } }

  const total = EV.reduce((a,e) => a + dur(e), 0);
  $('calsum').innerHTML = '8/21 개학 – 1/7 종업 · 등교 <b>' + schoolDays + '일</b> · 주간 루틴 <b>' +
    EV.length + '개 · ' + fmtDur(total) + '</b> 반복' +
    (Object.keys(overrides).length ? ' · 조정 <b>' + Object.keys(overrides).length + '건</b>' : '');

  // 일정 목록
  const fmtRange = e => {
    const a = parse(e.d), b = parse(e.to || e.d);
    const one = d => (d.getMonth()+1) + '/' + d.getDate() + '(' + ['일','월','화','수','목','금','토'][d.getDay()] + ')';
    return e.to ? one(a) + '–' + one(b) : one(a);
  };
  let listHtml = '', lastMon = '';
  ACAD.forEach(e => {
    const d = parse(e.d), mon = d.getFullYear() + '년 ' + (d.getMonth()+1) + '월';
    if (mon !== lastMon){ listHtml += '<div class="evmon">' + mon + '</div>'; lastMon = mon; }
    listHtml += '<div class="evrow" style="--c:' + KIND[e.k].c + '">' +
      '<span class="when">' + fmtRange(e) + '</span>' +
      '<span class="what">' + e.t + '<em>' + KIND[e.k].n + '</em></span></div>';
  });
  listHtml += '<div class="evmon">2학년 해당 없음 · 참고</div>';
  OTHERS.forEach(e => {
    listHtml += '<div class="evrow dimmed">' +
      '<span class="when">' + fmtRange(e) + '</span>' +
      '<span class="what">' + e.t + '<em>다른 학년 행사</em></span></div>';
  });
  $('evlist').innerHTML = listHtml;
  $('evlist-count').textContent = '· 2학년 ' + ACAD.length + '건';

  if (!currentWeekKey) currentWeekKey = initialWeekKey();
  renderWeek(currentWeekKey);
  if (calView === 'month') renderMonth(currentMonthKey || initialMonthKey());
}

/* ── 보강·휴원 조정 (오버라이드) ── */
let selectedDate = null;
let currentWeekKey = null;

function evId(e){ return 'ev' + EV.indexOf(e); }

/* 특정 날짜(dateKey)·요일(wd0=0~4)의 실제 일정 목록 — 취소·보강 이동을 반영 */
function instancesFor(dateKey, wd0){
  const out = [];
  if (wd0 >= 0 && wd0 <= 4){
    EV.filter(e => e[0] === wd0).forEach(e => {
      const key = dateKey + '::' + evId(e);
      const ov = overrides[key];
      if (ov && ov.status === 'cancel') out.push({e, ov, key, state:'cancel'});
      else if (ov && ov.status === 'moved') out.push({e, ov, key, state:'moved'});
      else out.push({e, key, state:'normal'});
    });
  }
  Object.keys(overrides).forEach(key => {
    const ov = overrides[key];
    if (ov.status === 'moved' && ov.to === dateKey){
      const [fromDate, id] = key.split('::');
      const e = EV[Number(id.replace('ev',''))];
      if (e) out.push({e, ov, key, state:'makeup', fromDate});
    }
  });
  return out.sort((a,b) => mins(a.e[1]) - mins(b.e[1]));
}

function setOverride(key, patch){
  if (patch === null) delete overrides[key];
  else overrides[key] = Object.assign({}, overrides[key], patch);
  buildCalendar();
  if (selectedDate) renderDayPanel(selectedDate);
  queueSave();
}

/* 주간·월간 어느 쪽에서 열었든 같은 날짜 칸을 표시해 줍니다 */
const CELL_GRIDS = '#wgrid, #mgrid';

function markSelectedCell(){
  document.querySelectorAll(CELL_GRIDS + ' .cell.selected').forEach(c => c.classList.remove('selected'));
  document.querySelectorAll(CELL_GRIDS).forEach(g => {
    const el = g.querySelector('.cell[data-date="' + selectedDate + '"]');
    if (el) el.classList.add('selected');
  });
}

function closeDayPanel(){
  selectedDate = null;
  const p = $('daypanel');
  p.hidden = true; p.innerHTML = '';
  document.querySelectorAll(CELL_GRIDS + ' .cell.selected').forEach(c => c.classList.remove('selected'));
}

function openDayPanel(dateKey){
  selectedDate = dateKey;
  markSelectedCell();
  renderDayPanel(dateKey);
  $('daypanel').hidden = false;
  $('daypanel').scrollIntoView({behavior:'smooth', block:'nearest'});
}

function renderDayPanel(dateKey){
  const d = parse(dateKey), wd = d.getDay();
  const label = (d.getMonth()+1) + '월 ' + d.getDate() + '일(' + ['일','월','화','수','목','금','토'][wd] + ')';
  const offEntry = ACAD.find(e => e.k === 'off' && (() => {
    const a = parse(e.d), b = parse(e.to || e.d); return d >= a && d <= b;
  })());
  const wd0 = wd - 1;
  const inst = wd0 >= 0 && wd0 <= 4 ? instancesFor(dateKey, wd0)
    : Object.keys(overrides).filter(k => overrides[k].status === 'moved' && overrides[k].to === dateKey)
        .map(key => { const [fromDate, id] = key.split('::'); const e = EV[Number(id.replace('ev',''))];
          return e ? {e, ov: overrides[key], key, state:'makeup', fromDate} : null; }).filter(Boolean);

  const STAT = {
    normal:{n:'정상 진행', c:'accent'},
    cancel:{n:'휴원 (취소)', c:'crit'},
    moved: {n:'다른 날로 보강 이동됨', c:'ink-3'},
    makeup:{n:'보강 수업', c:'accent'}
  };

  const rows = inst.map(x => {
    const meta = SUBJ[x.e[3]];
    const nm = x.e[4] || x.e[3];
    let status = STAT[x.state].n;
    if (x.state === 'moved') status = (x.ov.to) + '로 보강 이동됨' + (x.ov.note ? ' · ' + esc(x.ov.note) : '');
    if (x.state === 'makeup') status = x.fromDate + '에서 이동된 보강' + (x.ov.note ? ' · ' + esc(x.ov.note) : '');

    let ctrl = '';
    if (writable){
      if (x.state === 'makeup'){
        ctrl = '<div class="dp-ctrl"><button type="button" class="dp-btn warn" data-restore="' + x.key + '">원래대로 되돌리기</button></div>';
      } else {
        ctrl = '<div class="dp-ctrl">' +
          '<button type="button" class="dp-btn' + (x.state === 'normal' ? ' on' : '') + '" data-set="' + x.key + '" data-status="normal">정상</button>' +
          '<button type="button" class="dp-btn warn' + (x.state === 'cancel' ? ' on' : '') + '" data-set="' + x.key + '" data-status="cancel">휴원</button>' +
          '<button type="button" class="dp-btn' + (x.state === 'moved' ? ' on' : '') + '" data-movebtn="' + x.key + '">보강 이동…</button>' +
          '</div>' +
          '<div class="dp-moveform" id="mf-' + x.key + '" hidden>' +
          '<input type="date" class="mf-date" value="' + (x.ov && x.ov.to ? x.ov.to : '') + '">' +
          '<input type="text" class="mf-note" placeholder="메모(선택)" value="' + (x.ov && x.ov.note ? esc(x.ov.note) : '') + '" style="flex:1;min-width:120px">' +
          '<button type="button" class="dp-btn on" data-movesave="' + x.key + '">이 날짜로 보강</button>' +
          '</div>';
      }
    }
    return '<div class="dprow st-' + x.state + '" style="--c:' + meta.c + '">' +
      '<span class="tchip" style="--c:' + meta.c + '">' + meta.i + '<span class="nm">' + nm + '</span>' +
      '<span class="tm">' + x.e[1] + '–' + x.e[2] + '</span></span>' +
      '<span class="dp-status">' + status + '</span>' + ctrl + '</div>';
  }).join('');

  const bulk = writable && inst.some(x => x.state === 'normal')
    ? '<div class="dp-bulk"><button type="button" class="dp-btn warn" id="dp-bulk-cancel">이 날 전체 휴원 (여행 등)</button></div>' : '';

  const dayChk = checks[dateKey] || {};
  const wkForDay = weekKeyOf(dateKey);

  /* 한 줄 그리기 — 완료 토글은 요일 카드에서 바로 하므로 여기서는 상태만 보여 주고
     목록을 손보는 버튼(빼기·삭제)을 답니다. */
  const studyRow = (it, meta, delBtn) =>
    '<div class="dprow' + (dayChk[it.id] ? ' st-makeup' : '') + '" style="--c:var(--' +
      (it.special ? 'warn' : 'accent') + ')">' +
    '<span class="tchip" style="--c:var(--' + (it.special ? 'warn' : 'accent') + ')">' + it.icon +
      '<span class="nm">' + esc(it.n) + '</span></span>' +
    '<span class="dp-status">' + (dayChk[it.id] ? '완료' : '미완료') + '</span>' +
    (meta || '') + (writable ? delBtn : '') + '</div>';

  const specials = specialFor(dateKey);
  const specialRows = specials.length
    ? specials.map(it => studyRow(Object.assign({}, it, {special:true}),
        '<span class="dp-quota">이 날만</span>',
        '<div class="dp-ctrl"><button type="button" class="dp-btn warn" data-spdel="' +
          dateKey + '::' + it.id + '">삭제</button></div>')).join('')
    : '<p class="dp-empty">이 날에만 있는 학습이 아직 없습니다.</p>';

  const specialAdd = writable
    ? '<div class="wa-addrow" style="border-top:0;padding-top:0;margin-top:2px">' +
      '<input type="text" class="wa-newitem-input" id="sp-newitem-input" ' +
      'placeholder="예 · 받아쓰기 연습, 독후감" maxlength="20" data-spdate="' + dateKey + '">' +
      '<button type="button" class="wa-mini on" id="sp-additem-btn" data-spdate="' + dateKey + '">+ 추가</button></div>'
    : '';

  const repeatRows = STUDY.map(it => {
    const days = it.target >= 7 ? '매일'
      : [...assignedDaysForWeek(wkForDay, it)].sort((a,b) => a - b).map(i => WNAMES[i]).join('·');
    const meta = '<span class="dp-quota">배정 ' + days +
      (it.target < 7 ? ' · 이번 주 ' + weekCount(dateKey, it.id) + '/' + it.target + '일' : '') + '</span>';
    return studyRow(it, meta,
      '<div class="dp-ctrl"><button type="button" class="dp-btn warn" data-studydel="' + it.id +
      '" title="매주 반복 목록에서 뺍니다">목록에서 빼기</button></div>');
  }).join('');

  $('daypanel').innerHTML =
    '<div class="dp-head"><b>' + label + '</b>' +
    (offEntry ? '<span class="dp-tag off">' + offEntry.t + '</span>' : (wd >= 1 && wd <= 5 ? '<span class="dp-tag">등교일</span>' : '<span class="dp-tag">주말</span>')) +
    '<button type="button" class="dp-close" id="dp-close" aria-label="닫기">×</button></div>' +
    '<div class="dp-body">' +
    (rows || '<p class="dp-empty">이 날은 늘봄·방과후·학원 일정이 없습니다.</p>') +
    (writable ? bulk : '') +
    '</div>' +
    '<div class="dp-section"><h4>특별 학습 <span class="dp-quota">이 날 하루만</span></h4>' +
      specialRows + specialAdd + '</div>' +
    '<div class="dp-section"><h4>매주 반복 학습</h4>' + repeatRows +
      '<p class="dp-note" style="border-top:0;padding-top:0">완료 표시는 달력의 요일 카드에서 바로 켜고 끌 수 있습니다.</p></div>' +
    (!writable ? '<p class="dp-readonly" style="padding:0 16px 12px">읽기 전용 보기에서는 수정할 수 없습니다.</p>' : '');
}

document.addEventListener('click', ev => {
  if (ev.target.closest('#dp-close')){ closeDayPanel(); return; }

  const dayBtn = ev.target.closest('[data-day]');
  if (dayBtn){ setActiveDay(dayBtn.dataset.day); return; }

  const editBtn = ev.target.closest('[data-editday]');
  if (editBtn){ setActiveDay(editBtn.dataset.editday); openDayPanel(editBtn.dataset.editday); return; }

  if (ev.target.closest('#wk-prev')){ const w = shiftWeek(currentWeekKey, -1); if (weekInSem(w)) renderWeek(w); return; }
  if (ev.target.closest('#wk-next')){ const w = shiftWeek(currentWeekKey,  1); if (weekInSem(w)) renderWeek(w); return; }
  if (ev.target.closest('#wk-today')){ renderWeek(initialWeekKey()); return; }

  /* ── 주간 ↔ 월간 ── */
  if (ev.target.closest('#cv-week')){ setCalView('week'); return; }
  if (ev.target.closest('#cv-month')){ setCalView('month'); return; }
  if (ev.target.closest('#m-prev')){ const m = shiftMonth(currentMonthKey, -1); if (monthInSem(m)) renderMonth(m); return; }
  if (ev.target.closest('#m-next')){ const m = shiftMonth(currentMonthKey,  1); if (monthInSem(m)) renderMonth(m); return; }
  if (ev.target.closest('#m-today')){ renderMonth(initialMonthKey()); return; }
  if (ev.target.closest('#m-brief')){
    briefMode = !briefMode;
    const b = $('m-brief');
    b.setAttribute('aria-pressed', String(briefMode));
    b.classList.toggle('on', briefMode);
    b.textContent = briefMode ? '자세히 보기' : '간략히 보기';
    try { localStorage.setItem(LS_PREFIX + 'brief', briefMode ? '1' : ''); } catch(err){}
    renderMonth(currentMonthKey);
    return;
  }

  /* ── 특별 학습 추가 · 삭제 ── */
  const spAdd = ev.target.closest('#sp-additem-btn');
  if (spAdd){
    const inp = $('sp-newitem-input');
    addSpecialStudy(spAdd.dataset.spdate, inp ? inp.value : '');
    return;
  }
  const spDel = ev.target.closest('[data-spdel]');
  if (spDel){
    const [dk, id] = spDel.dataset.spdel.split('::');
    removeSpecialStudy(dk, id);
    return;
  }
  const stDel = ev.target.closest('[data-studydel]');
  if (stDel){
    const it = STUDY.find(x => x.id === stDel.dataset.studydel);
    if (it && confirm('「' + it.n + '」을(를) 매주 반복 학습 목록에서 뺍니다.\n이미 체크해 둔 완료 기록은 그대로 남습니다.'))
      removeStudyItem(it.id);
    return;
  }

  if (ev.target.closest('#wa-save')){ saveAssigns(); return; }
  if (ev.target.closest('#wa-cancel')){ cancelAssigns(); return; }

  const assignBtn = ev.target.closest('[data-assign]');
  if (assignBtn){
    const [wk, itemId, dayIdx] = assignBtn.dataset.assign.split('::');
    toggleAssignDay(wk, itemId, Number(dayIdx));
    return;
  }

  const renameOpenBtn = ev.target.closest('[data-rename-open]');
  if (renameOpenBtn){ editingStudyId = renameOpenBtn.dataset.renameOpen; renderWeek(currentWeekKey); return; }

  const renameSaveBtn = ev.target.closest('[data-rename-save]');
  if (renameSaveBtn){
    const inp = $('wa-rename-input');
    renameStudyItem(renameSaveBtn.dataset.renameSave, inp ? inp.value : '');
    return;
  }
  const renameCancelBtn = ev.target.closest('[data-rename-cancel]');
  if (renameCancelBtn){ editingStudyId = null; renderWeek(currentWeekKey); return; }

  const addItemBtn = ev.target.closest('#wa-additem-btn');
  if (addItemBtn){
    const inp = $('wa-newitem-input');
    addStudyItem(inp ? inp.value : '');
    return;
  }

  const setBtn = ev.target.closest('[data-set]');
  if (setBtn){
    const key = setBtn.dataset.set, status = setBtn.dataset.status;
    setOverride(key, status === 'normal' ? null : { status });
    return;
  }
  const restoreBtn = ev.target.closest('[data-restore]');
  if (restoreBtn){ setOverride(restoreBtn.dataset.restore, null); return; }

  const chkBtn = ev.target.closest('[data-check]');
  if (chkBtn){
    const [dateKey, itemId] = chkBtn.dataset.check.split('::');
    toggleCheck(dateKey, itemId);
    return;
  }

  const moveBtn = ev.target.closest('[data-movebtn]');
  if (moveBtn){
    const f = $('mf-' + moveBtn.dataset.movebtn);
    if (f) f.hidden = !f.hidden;
    return;
  }
  const saveBtn = ev.target.closest('[data-movesave]');
  if (saveBtn){
    const key = saveBtn.dataset.movesave;
    const form = $('mf-' + key);
    const to = form.querySelector('.mf-date').value;
    const note = form.querySelector('.mf-note').value.trim();
    if (!to){ form.querySelector('.mf-date').focus(); return; }
    setOverride(key, { status:'moved', to, note });
    return;
  }
  const bulkBtn = ev.target.closest('#dp-bulk-cancel');
  if (bulkBtn && selectedDate){
    const d = parse(selectedDate), wd0 = d.getDay() - 1;
    if (wd0 >= 0 && wd0 <= 4){
      EV.filter(e => e[0] === wd0).forEach(e => {
        const key = selectedDate + '::' + evId(e);
        if (!overrides[key] || overrides[key].status !== 'cancel') overrides[key] = { status:'cancel' };
      });
      buildCalendar(); renderDayPanel(selectedDate); queueSave();
    }
  }
});

document.addEventListener('keydown', ev => {
  if (ev.key === 'Escape' && selectedDate) closeDayPanel();
  if (ev.key === 'Escape' && editingStudyId){ editingStudyId = null; renderWeek(currentWeekKey); return; }
  if (ev.key === 'Enter' && ev.target && ev.target.id === 'wa-rename-input'){
    ev.preventDefault();
    renameStudyItem(ev.target.dataset.renameId, ev.target.value);
    return;
  }
  if (ev.key === 'Enter' && ev.target && ev.target.id === 'wa-newitem-input'){
    ev.preventDefault();
    addStudyItem(ev.target.value);
    return;
  }
  if (ev.key === 'Enter' && ev.target && ev.target.id === 'sp-newitem-input'){
    ev.preventDefault();
    addSpecialStudy(ev.target.dataset.spdate, ev.target.value);
    return;
  }
});

/* ═══════════ 부팅 ═══════════ */
async function boot(){
  const now = new Date();
  $('today').textContent = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' +
    String(now.getDate()).padStart(2,'0') + ' ' + ['일','월','화','수','목','금','토'][now.getDay()] + '요일';

  // 이 기기 사본을 먼저 그려서 오프라인에서도 즉시 열립니다.
  apply(await LocalStore.load());
  applyStudyMeta();
  buildCalendar();
  setSave('saved', LocalStore.label);

  await setupSync();
}

/* ── 기기 간 동기화 ──
   설정이 없으면 아무 일도 하지 않습니다. 설정이 있어도 로그인은 선택이라,
   로그인 전까지는 지금처럼 이 기기 저장으로 그냥 씁니다. */
let Cloud = null;

async function setupSync(){
  const btn = $('syncbtn');
  if (!(window.KG_CONFIG && window.KG_CONFIG.firebase && window.createCloudStore)) return;

  btn.hidden = false;
  try {
    Cloud = await window.createCloudStore(window.KG_CONFIG.firebase);
  } catch (err) {
    btn.hidden = true;
    setSave('local', '이 기기에만 저장 — 동기화를 준비하지 못했습니다');
    return;
  }

  Cloud.onUser(async user => {
    if (!user){                       // 로그아웃 상태 — 이 기기 저장으로 되돌린다
      Store = LocalStore;
      btn.textContent = '동기화 켜기';
      btn.classList.remove('on');
      btn.title = '다른 기기와 기록을 함께 보려면 로그인하세요';
      setSave('saved', LocalStore.label);
      return;
    }

    Store = Cloud;
    btn.textContent = '동기화 중';
    btn.classList.add('on');
    btn.title = user.email + ' 로 로그인됨 — 눌러서 끄기';
    setSave('saving', '동기화 중…');
    try {
      const remote = await Cloud.load();
      if (remote && Object.keys(remote).length){
        apply(remote, true);          // 클라우드 내용을 이 기기에 반영
      } else {
        await Cloud.save(snapshot()); // 처음이면 이 기기 내용을 올려 시작한다
      }
      applyStudyMeta();
      dataChanged();
      buildCalendar();
      if (selectedDate) renderDayPanel(selectedDate);
      setSave('saved', '저장됨 · 기기 간 동기화');

      Cloud.subscribe(remote2 => {    // 다른 기기에서 바뀌면 그대로 따라온다
        apply(remote2, true);
        applyStudyMeta();
        dataChanged();
        buildCalendar();
        if (selectedDate) renderDayPanel(selectedDate);
      });
    } catch (err) {
      Store = LocalStore;
      setSave('local', '이 기기에만 저장 — 권한이 없거나 연결이 끊겼습니다');
    }
  });

  btn.addEventListener('click', async () => {
    if (!Cloud) return;
    btn.disabled = true;
    try {
      if (Cloud.user) await Cloud.signOut();
      else await Cloud.signIn();
    } catch (err) {
      setSave('error', '로그인하지 못했습니다 — 다시 시도해 주세요');
    } finally { btn.disabled = false; }
  });
}

/* 불러온 묶음을 화면 상태에 반영. keepEmpty=false 면 빈 값은 무시해
   기존 기기 사본을 지우지 않습니다.

   자동 배정 계획은 assigns 를 입력으로 삼기 때문에, 데이터를 갈아끼우면
   반드시 캐시를 버려야 합니다. 앱은 데이터를 불러오기 전에 한 번 그려 두므로
   (빈 assigns 기준으로 계획이 캐시된다) 이걸 빠뜨리면 불러온 뒤에도 옛 계획이
   그대로 쓰여 저장한 배정이 화면에 반영되지 않습니다. */
function apply(d, allowEmpty){
  dataChanged();
  const obj = v => (v && typeof v === 'object') ? v : null;
  const o = obj(d.overrides), c = obj(d.checks), a = obj(d.assigns), s = obj(d.studyMeta);
  if (o || allowEmpty) overrides = o || {};
  if (c || allowEmpty) checks = c || {};
  if (a || allowEmpty) assigns = a || {};
  if (s || allowEmpty){
    studyMeta = s
      ? { added:   Array.isArray(s.added)   ? s.added   : [],
          removed: Array.isArray(s.removed) ? s.removed : [],
          renamed: obj(s.renamed) || {},
          special: obj(s.special) || {} }
      : { added: [], removed: [], renamed: {}, special: {} };
  }
}

/* ═══════════ 탭 ═══════════ */
const TABS = [['tab-cal','p-cal'], ['tab-sched','p-sched']];
TABS.forEach(([tid, pid]) => {
  $(tid).addEventListener('click', () => {
    TABS.forEach(([t, p]) => {
      const on = t === tid;
      $(t).setAttribute('aria-selected', String(on));
      $(p).classList.toggle('on', on);
    });
    try { sessionStorage.setItem('kg-tab', tid); } catch(e){}
  });
});
try {
  const saved = sessionStorage.getItem('kg-tab');
  if (saved && saved !== 'tab-cal' && $(saved)) $(saved).click();
} catch(e){}

/* 지난번에 보던 달력 모드와 간략히 보기 상태를 되살립니다 */
try { briefMode = !!localStorage.getItem(LS_PREFIX + 'brief'); } catch(e){}
if (briefMode){
  const b = $('m-brief');
  b.setAttribute('aria-pressed', 'true'); b.classList.add('on'); b.textContent = '자세히 보기';
}

/* ── 시작 ──
   데이터 표(data.json)를 먼저 읽고 나서 화면을 그립니다. 표가 없거나 잘못돼 있으면
   반쯤 그려진 화면 대신 무엇이 잘못됐는지 보여 줍니다. */
function showStartupError(err){
  setSave('error', '데이터를 불러오지 못했습니다');
  const box = document.createElement('div');
  box.className = 'card startup-error';
  box.innerHTML = '<h3>데이터를 불러오지 못했습니다</h3>' +
    '<p>화면에 필요한 표(<code>data.json</code>)를 읽는 데 실패했습니다. ' +
    '연결을 확인하고 새로고침해 주세요.</p><pre>' + esc(err && err.message || err) + '</pre>';
  const main = document.querySelector('main.wrap');
  main.insertBefore(box, main.firstChild);
}

async function start(){
  try {
    applyTables(await loadTables());
  } catch (err) {
    showStartupError(err);
    return;
  }

  buildSchedule();
  buildCalendar();

  let savedView = 'week';
  try { savedView = sessionStorage.getItem('kg-calview') || 'week'; } catch(e){}
  setCalView(savedView);

  await boot();
}

start();

/* ── 홈 화면 앱으로 설치되도록 서비스 워커를 등록합니다 ── */
if ('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
