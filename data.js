/* 건강이 스케줄 — 데이터 테이블 로더
 *
 * 앱이 보여 주는 내용은 전부 data.json 에 표(테이블) 형태로 들어 있습니다.
 * 시간표·학사일정·학습 항목을 바꾸려면 data.json 만 고치면 되고, 이 파일과
 * app.js 는 손대지 않아도 됩니다.
 *
 * 이 파일이 하는 일은 두 가지뿐입니다.
 *   1) data.json 을 읽어 온다
 *   2) 표의 한글 열 이름을 앱이 쓰는 형태로 옮긴다
 *
 * 표에 문제가 있으면 (없는 과목을 시간표가 가리키는 등) 화면을 그리기 전에
 * 어디가 잘못됐는지 알려 줍니다. 잘못된 데이터로 반쯤 그려진 화면을 보여
 * 주는 것보다 낫기 때문입니다.
 */

/* 표에서 채워지는 값들 — 실제 대입은 applyTables() 에서 한 번에 일어납니다 */
let SEM, SCAT, SUBJ, EV, PERIODS, LEAVE, GAP, KIND, ACAD, OTHERS,
    BASE_STUDY, WEEKEND_DAILY_CAP, NO_OVERLAP_IDS, START, END, SPAN, H;

const DAYS   = ['월','화','수','목','금'];          // 시간표가 다루는 요일
const WNAMES = ['월','화','수','목','금','토','일']; // 달력이 다루는 요일

const TABLE_PATH = 'data.json';

async function loadTables(){
  const res = await fetch(TABLE_PATH, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${TABLE_PATH} 를 읽지 못했습니다 (HTTP ${res.status})`);
  return res.json();
}

/* ── 표 → 앱 내부 형태 ── */
function applyTables(T){
  const problems = [];
  const need = (name) => {
    const v = T[name];
    if (!v) problems.push(`「${name}」 표가 없습니다`);
    return v || (Array.isArray(T[name]) ? [] : {});
  };
  const dayIdx  = (name, where) => {
    const i = WNAMES.indexOf(name);
    if (i < 0) problems.push(`${where}: 「${name}」 은 요일 이름이 아닙니다`);
    return i;
  };
  const toMin = (t, where) => {
    if (!/^\d{1,2}:\d{2}$/.test(t || '')) { problems.push(`${where}: 시각 「${t}」 형식이 HH:MM 이 아닙니다`); return 0; }
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  const 학기 = need('학기');
  SEM = { start: 학기.개학, end: 학기.종업, vacEnd: 학기.방학종료 };

  SCAT = {};
  need('분류').forEach(r => { SCAT[r.코드] = { name: r.이름, tag: r.짧은이름, note: r.설명 }; });

  SUBJ = {};
  need('과목').forEach(r => {
    if (!SCAT[r.분류]) problems.push(`과목 「${r.이름}」 의 분류 「${r.분류}」 가 「분류」 표에 없습니다`);
    SUBJ[r.이름] = { cat: r.분류, c: r.색, i: r.아이콘 };
  });

  EV = need('시간표').map(r => {
    if (!SUBJ[r.과목]) problems.push(`시간표의 과목 「${r.과목}」 이 「과목」 표에 없습니다`);
    const d = DAYS.indexOf(r.요일);
    if (d < 0) problems.push(`시간표: 「${r.요일}」 은 월–금이 아닙니다`);
    const row = [d, r.시작, r.끝, r.과목];
    if (r.표시이름) row.push(r.표시이름);
    return row;
  });

  PERIODS = DAYS.map(() => []);
  need('정규수업').forEach(r => {
    const d = DAYS.indexOf(r.요일);
    if (d < 0) { problems.push(`정규수업: 「${r.요일}」 은 월–금이 아닙니다`); return; }
    PERIODS[d].push({ t: r.시각, s: r.내용 });
  });
  PERIODS.forEach(list => list.sort((a, b) => toMin(a.t, '정규수업') - toMin(b.t, '정규수업')));

  LEAVE = DAYS.map(d => {
    const row = need('하교시각').find(x => x.요일 === d);
    if (!row) problems.push(`하교시각: 「${d}」 이 없습니다`);
    return row ? row.시각 : '';
  });

  GAP = need('이동시간').map(r => ({ wd: DAYS.indexOf(r.요일), t: r.시작, t2: r.끝, s: r.내용 }));

  KIND = {};
  need('학사일정종류').forEach(r => { KIND[r.코드] = { n: r.이름, c: r.색 }; });

  const ev = (r, where) => {
    if (r.종류 !== undefined && !KIND[r.종류]) problems.push(`${where}: 종류 「${r.종류}」 가 「학사일정종류」 표에 없습니다`);
    const o = { d: r.시작, t: r.내용 };
    if (r.종료) o.to = r.종료;
    if (r.짧은이름) o.s = r.짧은이름;
    if (r.종류) o.k = r.종류;
    return o;
  };
  ACAD   = need('학사일정').map(r => ev(r, '학사일정'));
  OTHERS = need('다른학년일정').map(r => ev(r, '다른학년일정'));

  BASE_STUDY = need('학습항목').map(r => ({ id: r.코드, n: r.이름, icon: r.아이콘, target: r.주간목표 }));

  const 규칙 = need('배정규칙');
  WEEKEND_DAILY_CAP = 규칙.주말하루최대;
  NO_OVERLAP_IDS    = 규칙.같은날겹치지않기 || [];
  NO_OVERLAP_IDS.forEach(id => {
    if (!BASE_STUDY.some(s => s.id === id)) problems.push(`배정규칙: 「${id}」 가 「학습항목」 표에 없습니다`);
  });

  const 보드 = need('시간표보드');
  START = toMin(보드.시작시각, '시간표보드');
  END   = toMin(보드.끝시각, '시간표보드');
  SPAN  = END - START;
  H     = 보드.높이px;

  // 학기 날짜가 말이 되는지만 가볍게 본다
  if (SEM.start && SEM.end && SEM.start >= SEM.end) problems.push('학기: 개학일이 종업일보다 늦습니다');

  if (problems.length) throw new Error('data.json 을 확인해 주세요\n · ' + problems.join('\n · '));
  return T;
}
