/* 건강이 스케줄 — 설정
 *
 * firebase 가 null 이면 기록은 이 기기(브라우저)에만 남습니다.
 * 여러 기기에서 같은 기록을 보려면 아래에 Firebase 웹 앱 설정을 넣으세요.
 *
 * 넣어 두어도 로그인은 선택입니다 — 상단바의 「동기화 켜기」를 눌러야
 * 클라우드로 올라탑니다. 누르지 않으면 지금처럼 이 기기에만 저장됩니다.
 *
 * 이 파일은 공개 주소에 그대로 올라갑니다. Firebase 웹 apiKey 는 비밀이
 * 아니지만 그것만으로 접근을 막지는 못합니다 — 실제 방어선은 Firestore
 * 보안 규칙입니다. 규칙에서 읽기·쓰기를 지정한 계정으로 제한해 두었으므로
 * 주소를 아는 사람이 기록을 열어보거나 고치지 못합니다.
 */
window.KG_CONFIG = {
  firebase: {
    apiKey:            "AIzaSyBrzMuCIIEqT_d-qodQ6wiOWsYaGtryOSk",
    authDomain:         "geongang-schedule.firebaseapp.com",
    projectId:          "geongang-schedule",
    storageBucket:      "geongang-schedule.firebasestorage.app",
    messagingSenderId:  "1016082902306",
    appId:              "1:1016082902306:web:e70142f0e41ba669d4c97b",
    docId:              "geongang"   // 이 값이 같은 기기끼리 기록을 공유합니다
  }
};

/* 「가족을 승인하는 사람이 누구인가」는 여기에 두지 않습니다.
   이 파일은 공개 주소에 그대로 올라가므로 가족의 이메일이 노출되기 때문입니다.
   소유자 이메일은 Firestore 보안 규칙(비공개)에만 있고, 앱은 규칙이 자기
   등록을 허락하는지로 소유자 여부를 알아냅니다 — 자세한 건 FIREBASE-RULES.md. */
