/* 찐한플래너 — 음력(한국 음력, dangi)
 *
 * 음력은 표를 손으로 넣어 계산하는 곳이 많은데, 그 표는 잘못 적어도 몇 년 뒤에야
 * 티가 난다. 생일·제사에 쓰는 값이라 «틀린 음력»은 없느니만 못하다.
 *
 * 그래서 자바스크립트가 이미 갖고 있는 한국 음력(Intl 의 dangi 달력)을 쓴다.
 * 천문 계산으로 만들어진 값이라 표를 관리할 일이 없다. 설날(음 1/1)과
 * 추석(음 8/15)을 여러 해에 걸쳐 대조해 확인해 두었다(qa `core` 그룹).
 *
 * ★ 지원하지 않는 환경에서는 «아무것도 보여 주지 않는다». 틀린 날짜를 보여
 *   주느니 비워 두는 편이 낫다.
 *
 * 시간대를 못 박는다 — 그러지 않으면 기기 시간대에 따라 하루가 밀린다.
 */
(function (root) {
  'use strict';

  const TZ = 'Asia/Seoul';
  let fmt;                       // 한 번만 만든다(만드는 비용이 크다)
  let ready = null;              // null=아직 안 봄 · true/false=확인함

  function formatter(){
    if (ready !== null) return fmt;
    try {
      const f = new Intl.DateTimeFormat('ko-u-ca-dangi',
        { timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric' });
      ready = f.resolvedOptions().calendar === 'dangi';
      fmt = ready ? f : null;
    } catch (err) { ready = false; fmt = null; }
    return fmt;
  }

  /* 이 환경이 한국 음력을 아는가 */
  const supported = () => !!formatter();

  /* "2026-09-01" → { y, m, d, leap } · 모르면 null
     m 은 «달 숫자»이고 윤달이면 leap 이 true 다. 윤5월과 5월은 다른 달이다. */
  function toLunar(dateKey){
    const f = formatter();
    if (!f || !/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ''))) return null;
    /* 정오로 못 박는다 — 자정으로 두면 시간대가 조금만 어긋나도 하루가 밀린다 */
    const at = new Date(dateKey + 'T12:00:00+09:00');
    if (isNaN(at.getTime())) return null;
    let parts;
    try { parts = f.formatToParts(at); } catch (err) { return null; }
    const get = t => (parts.filter(p => p.type === t)[0] || {}).value;
    const rawM = String(get('month') || '');
    const leap = rawM.indexOf('윤') >= 0;                 // ICU 가 "윤6" 처럼 준다
    const m = parseInt(rawM.replace(/[^0-9]/g, ''), 10);
    const d = parseInt(get('day'), 10);
    const y = parseInt(get('relatedYear') || get('year'), 10);
    if (!isFinite(m) || !isFinite(d)) return null;
    return { y: isFinite(y) ? y : null, m: m, d: d, leap: leap };
  }

  /* 약식 표기 — "음 7/20" · 윤달이면 "음 윤6/6" · 모르면 빈 글자 */
  function short(dateKey){
    const l = toLunar(dateKey);
    if (!l) return '';
    return '음 ' + (l.leap ? '윤' : '') + l.m + '/' + l.d;
  }

  const api = { TZ, supported, toLunar, short };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.PlannerCore = root.PlannerCore || {}).lunar = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
