/* 건강이 스케줄 — 클라우드 저장 어댑터 (Firebase Auth + Firestore)
 *
 * app-config.js 에 firebase 설정이 있을 때만 boot() 가 이 함수를 부릅니다.
 * 설정이 없으면 아무 일도 하지 않으므로 앱은 이 기기 저장만으로 정상 동작합니다.
 *
 * 로그인은 선택입니다. 로그인 전에는 LocalStore 로 그냥 쓰고,
 * 「동기화 켜기」를 눌러 로그인한 뒤에만 Firestore 로 올라탑니다.
 *
 * index.html 의 LocalStore 와 같은 모양(load / save)에 더해
 * onUser / signIn / signOut / subscribe 를 얹어 돌려줍니다.
 */
window.createCloudStore = async function createCloudStore(cfg){
  const VER = '10.12.0';
  const base = `https://www.gstatic.com/firebasejs/${VER}`;
  const [{ initializeApp }, A, F] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-auth.js`),
    import(`${base}/firebase-firestore.js`)
  ]);

  const app  = initializeApp(cfg);
  const auth = A.getAuth(app);
  const db   = F.getFirestore(app);
  const ref  = F.doc(db, 'schedules', cfg.docId || 'default');

  // 로그인 상태를 기기에 남겨 둡니다 — 앱을 껐다 켜도 다시 로그인하지 않도록
  try { await A.setPersistence(auth, A.browserLocalPersistence); } catch(err){}

  const provider = new A.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  // 리디렉션으로 돌아온 경우의 결과를 먼저 흡수합니다
  try { await A.getRedirectResult(auth); } catch(err){}

  const pick = d => ({
    overrides: d.overrides || {},
    checks:    d.checks    || {},
    assigns:   d.assigns   || {},
    studyMeta: d.studyMeta || null
  });

  let unsub = null;

  return {
    name: 'cloud',
    label: '기기 간 동기화',

    get user(){ return auth.currentUser; },

    /* 로그인 상태가 바뀔 때마다 불립니다 (앱 시작 직후 한 번 포함) */
    onUser(cb){ return A.onAuthStateChanged(auth, cb); },

    /* 팝업이 막히는 브라우저(특히 iOS Safari)에서는 리디렉션으로 넘어갑니다 */
    async signIn(){
      try {
        await A.signInWithPopup(auth, provider);
      } catch (err) {
        const c = err && err.code;
        if (c === 'auth/popup-blocked' || c === 'auth/popup-closed-by-user' ||
            c === 'auth/cancelled-popup-request' || c === 'auth/operation-not-supported-in-this-environment'){
          await A.signInWithRedirect(auth, provider);
          return;
        }
        throw err;
      }
    },

    async signOut(){
      if (unsub){ unsub(); unsub = null; }
      await A.signOut(auth);
    },

    async load(){
      const snap = await F.getDoc(ref);
      return snap.exists() ? pick(snap.data() || {}) : null;
    },

    async save(data){
      await F.setDoc(ref, {
        overrides: data.overrides,
        checks:    data.checks,
        assigns:   data.assigns,
        studyMeta: data.studyMeta,
        updatedAt: Date.now(),
        updatedBy: (auth.currentUser && auth.currentUser.email) || null
      });
    },

    /* 다른 기기에서 바뀌면 그대로 받아 옵니다. 내가 방금 쓴 내용이 되돌아와
       화면이 덜컥이지 않도록 hasPendingWrites 인 스냅숏은 건너뜁니다. */
    subscribe(onRemote){
      if (unsub) unsub();
      unsub = F.onSnapshot(ref, snap => {
        if (!snap.exists() || snap.metadata.hasPendingWrites) return;
        onRemote(pick(snap.data() || {}));
      }, () => {});
      return unsub;
    }
  };
};
