// 서비스 워커: 분할기 페이지의 전송 요청을 열려 있는 치지직 탭으로 중계한다.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'send') return;

  chrome.tabs.query({ url: 'https://chzzk.naver.com/live/*' }, (tabs) => {
    if (!tabs || tabs.length === 0) {
      sendResponse({ ok: false, error: '열려 있는 치지직 방송 탭이 없어요. 먼저 "채팅창 열기"를 눌러주세요.' });
      return;
    }
    // 채팅 전용 팝업(/chat)이 있으면 우선 사용
    const tab = tabs.find(t => /\/chat(\?|$)/.test(t.url || '')) || tabs[0];
    chrome.tabs.sendMessage(tab.id, { type: 'insert', text: msg.text }, (res) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: '치지직 탭과 연결 실패 — 그 탭을 새로고침한 뒤 다시 시도해주세요.' });
        return;
      }
      sendResponse(res || { ok: false, error: '치지직 탭이 응답하지 않았어요.' });
    });
  });
  return true; // 비동기 sendResponse 사용
});
