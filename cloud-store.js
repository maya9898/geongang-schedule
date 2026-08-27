/* 건강이 스케줄 — 클라우드 저장 어댑터 (Firebase Firestore)
 *
 * app-config.js 에 firebase 설정이 들어 있을 때만 boot() 가 이 함수를 부릅니다.
 * 설정이 없으면 이 파일은 아무 일도 하지 않으므로, 지금 상태로 두어도
 * 앱은 이 기기 저장만으로 정상 동작합니다.
 *
 * index.html 의 LocalStore 와 같은 모양(load / save / subscribe)을 돌려주므로
 * 화면 코드는 어느 쪽이 끼워졌는지 몰라도 됩니다.
 */
window.createCloudStore = async function createCloudStore(cfg){
  const VER = '10.12.0';
  const [{ initializeApp }, fs] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${VER}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${VER}/firebase-firestore.js`)
  ]);

  const app = initializeApp(cfg);
  const db  = fs.getFirestore(app);
  const ref = fs.doc(db, 'schedules', cfg.docId || 'default');

  const pick = d => ({
    overrides: d.overrides || {},
    checks:    d.checks    || {},
    assigns:   d.assigns   || {},
    studyMeta: d.studyMeta || null
  });

  return {
    name: 'cloud',
    label: '기기 간 동기화',

    async load(){
      const snap = await fs.getDoc(ref);
      return snap.exists() ? pick(snap.data() || {}) : {};
    },

    async save(data){
      await fs.setDoc(ref, {
        overrides: data.overrides,
        checks:    data.checks,
        assigns:   data.assigns,
        studyMeta: data.studyMeta,
        updatedAt: Date.now()
      });
    },

    /* 다른 기기에서 바뀌면 그대로 받아 옵니다. 내가 방금 쓴 내용이 되돌아와
       화면이 덜컥이지 않도록 hasPendingWrites 인 스냅숏은 건너뜁니다. */
    subscribe(onRemote){
      return fs.onSnapshot(ref, snap => {
        if (!snap.exists() || snap.metadata.hasPendingWrites) return;
        onRemote(pick(snap.data() || {}));
      }, () => {});
    }
  };
};
