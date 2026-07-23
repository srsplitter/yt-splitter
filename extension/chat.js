// 치지직 페이지에서 실행: 채팅 입력창을 찾아 명령어를 넣고 전송한다.

// 이 확장이 보낼 수 있는 메시지는 노래신청 명령어 형식뿐 (임의 텍스트 전송 차단)
const SAFE_TEXT = /^!sr https:\/\/youtu\.be\/[A-Za-z0-9_-]{11}\?t=\d{1,6}$/;

function findChatInput() {
  // 치지직 채팅 입력은 contenteditable 요소(구조 변경 대비 textarea 폴백)
  const candidates = document.querySelectorAll('[contenteditable="true"], textarea');
  for (const el of candidates) {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return el;
  }
  return null;
}

function readText(el) {
  return ((el.value !== undefined && el.tagName === 'TEXTAREA') ? el.value : el.textContent) || '';
}

function pressEnter(el) {
  const opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
  el.dispatchEvent(new KeyboardEvent('keydown', opts));
  el.dispatchEvent(new KeyboardEvent('keyup', opts));
}

function clickSendButton() {
  // 전송 버튼 후보: 클래스명에 send가 들어가는 버튼
  const btn = document.querySelector('button[class*="send" i]');
  if (btn) { btn.click(); return true; }
  return false;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'insert') return;

  // 형식 검증을 통과한 평문만 insertText로 입력됨 (HTML로 해석되지 않음)
  if (typeof msg.text !== 'string' || !SAFE_TEXT.test(msg.text)) {
    sendResponse({ ok: false, error: '허용되지 않는 메시지 형식이에요.' });
    return;
  }

  const el = findChatInput();
  if (!el) {
    sendResponse({ ok: false, error: '채팅 입력창을 못 찾았어요. 네이버 로그인과 방송 상태를 확인해주세요.' });
    return;
  }

  try {
    el.focus();
    document.execCommand('insertText', false, msg.text);
    if (readText(el).indexOf(msg.text) === -1) {
      sendResponse({ ok: false, error: '입력창에 글자를 넣지 못했어요. 로그인 상태를 확인해주세요.' });
      return;
    }
    setTimeout(() => {
      pressEnter(el);
      setTimeout(() => {
        if (readText(el).trim() === '') { sendResponse({ ok: true }); return; }
        // Enter가 안 먹으면 전송 버튼 클릭 시도
        clickSendButton();
        setTimeout(() => {
          if (readText(el).trim() === '') sendResponse({ ok: true });
          else sendResponse({ ok: false, error: '입력까지는 됐어요 — 채팅창에서 Enter만 눌러주세요.' });
        }, 400);
      }, 400);
    }, 100);
  } catch (e) {
    sendResponse({ ok: false, error: '오류: ' + e.message });
  }
  return true; // 비동기 sendResponse 사용
});
