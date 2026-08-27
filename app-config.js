/* 건강이 스케줄 — 설정
 *
 * firebase 가 null 이면 기록은 이 기기(브라우저)에만 남습니다.
 * 여러 기기에서 같은 기록을 보려면 아래에 Firebase 웹 앱 설정을 넣으세요.
 *
 *   window.KG_CONFIG = {
 *     firebase: {
 *       apiKey:            "...",
 *       authDomain:        "....firebaseapp.com",
 *       projectId:         "...",
 *       storageBucket:     "....appspot.com",
 *       messagingSenderId: "...",
 *       appId:             "...",
 *       docId:             "geongang"   // 이 값이 같은 기기끼리 기록을 공유합니다
 *     }
 *   };
 *
 * 넣기 전에 반드시 읽어 주세요 — 이 파일은 공개 주소에 그대로 올라갑니다.
 * Firebase 웹 apiKey 는 비밀이 아니지만, 그것만으로 접근을 막지는 못합니다.
 * Firestore 보안 규칙에서 읽기·쓰기를 로그인한 사용자로 제한해야
 * 주소를 아는 사람이 기록을 열어보거나 고치지 못합니다.
 */
window.KG_CONFIG = {
  firebase: null
};
