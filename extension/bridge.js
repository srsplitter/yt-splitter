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
});

// 설치되어 있음을 페이지에 알림
window.postMessage({ source: 'ytsplit-ext', type: 'ready' }, '*');
