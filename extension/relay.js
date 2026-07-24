// 서비스 워커: 분할기 페이지의 전송 요청을 열려 있는 치지직 탭으로 중계한다.
// 치지직 탭이 없으면 채팅 팝업 탭을 직접 열고 나서 전송한다.

// 자동으로 열 수 있는 주소는 치지직 채팅 팝업 형식만 허용
const CHAT_URL_RE = /^https:\/\/chzzk\.naver\.com\/live\/[a-f0-9]{32}\/chat$/;

// 콘텐츠 스크립트가 아직 준비 전이면 잠시 간격을 두고 재시도한다
function trySend(tabId, text, attempts, done) {
  chrome.tabs.sendMessage(tabId, { type: 'insert', text: text }, (res) => {
    if (chrome.runtime.lastError || !res) {
      if (attempts <= 0) {
        done({ ok: false, error: '치지직 탭이 응답하지 않아요. 탭을 새로고침한 뒤 다시 시도해주세요.' });
        return;
      }
      setTimeout(() => trySend(tabId, text, attempts - 1, done), 700);
      return;
    }
    done(res);
  });
}

// 저장 가능한 BGM 명령어도 노래신청 형식만 허용
const SAFE_TEXT_RE = /^!sr https:\/\/youtu\.be\/[A-Za-z0-9_-]{11}\?t=\d{1,6}$/;

// 한국시간(KST, UTC+9) 기준 날짜 문자열
function kstDate() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;

  if (msg.type === 'bgm-save') {
    if (typeof msg.text !== 'string' || !SAFE_TEXT_RE.test(msg.text)) {
      sendResponse({ ok: false, error: '허용되지 않는 명령어 형식이에요.' });
      return;
    }
    chrome.storage.local.set({ bgmText: msg.text }, () => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'bgm-get') {
    chrome.storage.local.get(['bgmText', 'bgmDate'], (v) => {
      sendResponse({ ok: true, text: v.bgmText || '', date: v.bgmDate || '', today: kstDate() });
    });
    return true;
  }
  if (msg.type === 'bgm-clear') {
    chrome.storage.local.remove(['bgmText', 'bgmDate'], () => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type !== 'send') return;

  chrome.tabs.query({ url: 'https://chzzk.naver.com/live/*' }, (tabs) => {
    if (tabs && tabs.length > 0) {
      // 채팅 전용 팝업(/chat)이 있으면 우선 사용
      const tab = tabs.find(t => /\/chat(\?|$)/.test(t.url || '')) || tabs[0];
      trySend(tab.id, msg.text, 3, sendResponse);
      return;
    }
    // 열린 탭이 없으면 채팅 팝업을 직접 연다 (검증된 형식의 주소만)
    if (typeof msg.chatUrl === 'string' && CHAT_URL_RE.test(msg.chatUrl)) {
      chrome.tabs.create({ url: msg.chatUrl, active: false }, (tab) => {
        if (!tab) {
          sendResponse({ ok: false, error: '채팅 탭을 열지 못했어요.' });
          return;
        }
        // 페이지 로딩 시간을 감안해 최대 ~14초 재시도
        trySend(tab.id, msg.text, 20, sendResponse);
      });
      return;
    }
    sendResponse({ ok: false, error: '열려 있는 치지직 탭이 없고 방송 링크도 비어 있어요. 분할기의 치지직 방송 링크를 확인해주세요.' });
  });
  return true; // 비동기 sendResponse 사용
});
