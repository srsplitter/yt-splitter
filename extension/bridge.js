// 분할기 페이지(srsplitter.github.io)와 확장을 잇는 다리.
// 페이지가 보낸 전송 요청을 서비스 워커로 넘기고, 결과를 페이지에 되돌려준다.
window.addEventListener('message', (ev) => {
  if (ev.source !== window) return;
  const d = ev.data;
  if (!d || d.source !== 'ytsplit-page') return;

  if (d.type === 'ping') {
    window.postMessage({ source: 'ytsplit-ext', type: 'ready' }, '*');
    return;
  }

  if (d.type === 'send' && typeof d.text === 'string') {
    chrome.runtime.sendMessage({
      type: 'send',
      text: d.text,
      chatUrl: typeof d.chatUrl === 'string' ? d.chatUrl : ''
    }, (res) => {
      const err = chrome.runtime.lastError;
      window.postMessage({
        source: 'ytsplit-ext',
        type: 'result',
        id: d.id,
        ok: !!(res && res.ok),
        error: (res && res.error) || (err ? '확장과 연결에 실패했어요. 확장을 다시 로드해주세요.' : '')
      }, '*');
    });
  }

  // 유튜브 검색 중계
  if (d.type === 'yt-search') {
    chrome.runtime.sendMessage({ type: 'yt-search', query: typeof d.query === 'string' ? d.query : '' }, (res) => {
      const err = chrome.runtime.lastError;
      window.postMessage(Object.assign({
        source: 'ytsplit-ext',
        type: 'search-result',
        ok: false,
        error: err ? '확장과 연결에 실패했어요.' : '응답 없음'
      }, res || {}), '*');
    });
    return;
  }

  // 입장 BGM 설정 저장/조회/삭제 중계
  if (d.type === 'bgm-save' || d.type === 'bgm-get' || d.type === 'bgm-clear') {
    chrome.runtime.sendMessage({ type: d.type, text: typeof d.text === 'string' ? d.text : '' }, (res) => {
      const err = chrome.runtime.lastError;
      window.postMessage(Object.assign({
        source: 'ytsplit-ext',
        type: 'bgm-result',
        op: d.type,
        ok: false,
        error: err ? '확장과 연결에 실패했어요.' : '응답 없음'
      }, res || {}), '*');
    });
  }
});

// 설치되어 있음을 페이지에 알림
window.postMessage({ source: 'ytsplit-ext', type: 'ready' }, '*');
