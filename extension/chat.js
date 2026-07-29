(() => {
if (window.__ytsplitChatLoaded) return;
window.__ytsplitChatLoaded = true;
// 치지직 페이지에서 실행: 채팅 입력창을 찾아 명령어를 넣고 전송한다.
// + 입장 BGM: 한국시간 자정 기준 오늘 첫 "직접" 채팅을 감지하면 저장된 명령어를 자동 전송.

// 이 시스템이 작동해야 하는 유일한 방송 채널 (다른 방송에서는 감지·전송 모두 하지 않음)
const ALLOWED_CHANNEL = '01f531c6d0091b9c606bde1c71e2ead4';
function isAllowedPage() {
  return location.href.indexOf(ALLOWED_CHANNEL) !== -1;
}

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

// 형식 검증을 통과한 평문을 입력창에 넣고 전송까지 시도한다
function doInsertSend(text, done) {
  if (!isAllowedPage()) {
    done({ ok: false, error: '이 확장은 지정된 방송에서만 전송할 수 있어요.' });
    return;
  }
  if (typeof text !== 'string' || !SAFE_TEXT.test(text)) {
    done({ ok: false, error: '허용되지 않는 메시지 형식이에요.' });
    return;
  }
  const el = findChatInput();
  if (!el) {
    done({ ok: false, error: '채팅 입력창을 못 찾았어요. 네이버 로그인과 방송 상태를 확인해주세요.' });
    return;
  }
  try {
    el.focus();
    document.execCommand('insertText', false, text);
    if (readText(el).indexOf(text) === -1) {
      done({ ok: false, error: '입력창에 글자를 넣지 못했어요. 로그인 상태를 확인해주세요.' });
      return;
    }
    setTimeout(() => {
      pressEnter(el);
      setTimeout(() => {
        if (readText(el).trim() === '') { done({ ok: true }); return; }
        // Enter가 안 먹으면 전송 버튼 클릭 시도
        clickSendButton();
        setTimeout(() => {
          if (readText(el).trim() === '') done({ ok: true });
          else done({ ok: false, error: '입력까지는 됐어요 — 채팅창에서 Enter만 눌러주세요.' });
        }, 400);
      }, 400);
    }, 100);
  } catch (e) {
    done({ ok: false, error: '오류: ' + e.message });
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'insert') return;
  doInsertSend(msg.text, sendResponse);
  return true; // 비동기 sendResponse 사용
});

// ---- 입장 BGM: 오늘 첫 직접 채팅 감지 ----
// isTrusted(실제 키보드/마우스) 이벤트만 인정 — 이 확장이 만든 가짜 입력은 세지 않아 무한루프가 없다.
function kstDate() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function isChatInputEl(el) {
  if (!el) return false;
  return el.getAttribute && (el.getAttribute('contenteditable') === 'true' || el.tagName === 'TEXTAREA');
}

function onUserChatted() {
  if (!isAllowedPage()) return; // 지정된 방송이 아니면 입장 BGM 감지 안 함
  chrome.storage.local.get(['bgmText', 'bgmDate'], (v) => {
    if (!v.bgmText || !SAFE_TEXT.test(v.bgmText)) return;
    const today = kstDate();
    if (v.bgmDate === today) return;
    // 먼저 날짜를 기록해 중복 전송을 막고, 사용자 메시지가 먼저 나가도록 2초 뒤 전송
    chrome.storage.local.set({ bgmDate: today }, () => {
      setTimeout(() => { doInsertSend(v.bgmText, () => {}); }, 2000);
    });
  });
}

document.addEventListener('keydown', (e) => {
  if (!e.isTrusted || e.key !== 'Enter') return;
  const el = document.activeElement;
  if (!isChatInputEl(el)) return;
  if (readText(el).trim() === '') return;
  onUserChatted();
}, true);

document.addEventListener('click', (e) => {
  if (!e.isTrusted) return;
  const btn = e.target && e.target.closest ? e.target.closest('button[class*="send" i]') : null;
  if (!btn) return;
  const el = findChatInput();
  if (!el || readText(el).trim() === '') return;
  onUserChatted();
}, true);

})();
