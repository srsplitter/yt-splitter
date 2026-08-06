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

// 이 확장이 보낼 수 있는 메시지는 노래신청 명령어 형식과 아래 고정 게임 명령어뿐 (임의 텍스트 전송 차단)
const SAFE_TEXT = /^!sr https:\/\/youtu\.be\/[A-Za-z0-9_-]{11}\?t=\d{1,6}$/;
const GAME_COMMANDS = ['!일괄 룰렛', '!일괄 가챠권', '!배율', '!인벤', '!기록'];
function isAllowedText(text) {
  return typeof text === 'string' && (SAFE_TEXT.test(text) || GAME_COMMANDS.indexOf(text) !== -1);
}

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
  // 잠금 중에도 확장 자신의 입력은 허용해야 하므로 작업 동안 표시해 둔다
  selfInserting = true;
  const finish = (res) => { selfInserting = false; done(res); };
  if (!isAllowedPage()) {
    finish({ ok: false, error: '이 확장은 지정된 방송에서만 전송할 수 있어요.' });
    return;
  }
  if (!isAllowedText(text)) {
    finish({ ok: false, error: '허용되지 않는 메시지 형식이에요.' });
    return;
  }
  const el = findChatInput();
  if (!el) {
    finish({ ok: false, error: '채팅 입력창을 못 찾았어요. 네이버 로그인과 방송 상태를 확인해주세요.' });
    return;
  }
  try {
    el.focus();
    document.execCommand('insertText', false, text);
    if (readText(el).indexOf(text) === -1) {
      finish({ ok: false, error: '입력창에 글자를 넣지 못했어요. 로그인 상태를 확인해주세요.' });
      return;
    }
    setTimeout(() => {
      pressEnter(el);
      setTimeout(() => {
        if (readText(el).trim() === '') { finish({ ok: true }); return; }
        // Enter가 안 먹으면 전송 버튼 클릭 시도
        clickSendButton();
        setTimeout(() => {
          if (readText(el).trim() === '') finish({ ok: true });
          else finish({ ok: false, error: '입력까지는 됐어요 — 채팅창에서 Enter만 눌러주세요.' });
        }, 400);
      }, 400);
    }, 100);
  } catch (e) {
    finish({ ok: false, error: '오류: ' + e.message });
  }
}

// 사용자가 입력창에 쓰는 중이면 비워질 때까지 기다렸다가 전송 (직접 채팅과 명령어가 섞이는 것 방지)
function waitIdleThenSend(text, maxWaitMs, done) {
  const deadline = Date.now() + maxWaitMs;
  (function poll() {
    const el = findChatInput();
    if (el && readText(el).trim() === '') { doInsertSend(text, done); return; }
    if (Date.now() > deadline) {
      done({ ok: false, error: '채팅 입력창이 계속 사용 중이라 전송하지 못했어요.' });
      return;
    }
    setTimeout(poll, 400);
  })();
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'insert') return;
  waitIdleThenSend(msg.text, 8000, sendResponse);
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
  if (!isAllowedPage()) return; // 지정된 방송이 아니면 감지 안 함
  chrome.storage.local.get(['bgmText', 'bgmDate', 'gameRoulette', 'gameGacha', 'gameMul', 'gameInv', 'gameRec'], (v) => {
    // 전송 순서: 입장 BGM(있다면) → !일괄 룰렛 → !일괄 가챠권 → !배율 → !인벤 → !기록
    const queue = [];
    if (v.bgmText && SAFE_TEXT.test(v.bgmText)) queue.push(v.bgmText);
    if (v.gameRoulette) queue.push('!일괄 룰렛');
    if (v.gameGacha) queue.push('!일괄 가챠권');
    if (v.gameMul) queue.push('!배율');
    if (v.gameInv) queue.push('!인벤');
    if (v.gameRec) queue.push('!기록');
    if (queue.length === 0) return;
    const today = kstDate();
    if (v.bgmDate === today) return;
    // 먼저 날짜를 기록해 중복 전송을 막고, 사용자 메시지가 먼저 나가도록 2초 뒤 순차 전송.
    // 전송이 모두 끝날 때까지 채팅창의 실제 키보드 입력은 잠시 차단된다.
    chrome.storage.local.set({ bgmDate: today }, () => {
      lockInput();
      setTimeout(() => sendQueue(queue, 0), 2000);
    });
  });
}

// 큐를 1초 간격으로 순차 전송. 입력창이 사용 중이면 비워질 때까지 기다린다
function sendQueue(queue, idx) {
  if (idx >= queue.length) { unlockInput(); return; }
  waitIdleThenSend(queue[idx], 60000, () => {
    setTimeout(() => sendQueue(queue, idx + 1), 1000);
  });
}

// ---- 자동 전송 중 채팅창 잠금 ----
// 키 이벤트 차단만으로는 한글(IME) 입력을 못 막으므로(조합 입력은 취소 불가),
// 잠금 중에는 입력창의 포커스 자체를 뺏는다. 포커스가 없으면 어떤 입력도 불가능하다.
// 확장 자신이 명령어를 넣는 동안(selfInserting)만 포커스를 허용한다.
let inputLocked = false;
let unlockTimer = null;
let selfInserting = false;
function isChatArea(t) {
  return !!(t && ((t.closest && t.closest('[contenteditable="true"], textarea')) || isChatInputEl(t)));
}
function lockInput() {
  inputLocked = true;
  // 이미 입력창에 포커스가 있으면 바로 뺏는다 (진행 중이던 한글 조합도 종료됨)
  const ae = document.activeElement;
  if (isChatArea(ae)) { try { ae.blur(); } catch (e) {} }
  clearTimeout(unlockTimer);
  unlockTimer = setTimeout(unlockInput, 60000); // 안전장치: 어떤 경우에도 60초 뒤 자동 해제
}
function unlockInput() {
  inputLocked = false;
  clearTimeout(unlockTimer);
}
['keydown', 'keypress', 'beforeinput', 'paste', 'compositionstart', 'mousedown'].forEach((evt) => {
  document.addEventListener(evt, (e) => {
    if (!inputLocked || !e.isTrusted) return;
    if (!isChatArea(e.target)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
});
// 잠금 중 사용자가 입력창에 포커스를 얻으면 즉시 되뺏는다 (확장 자신의 포커스는 예외)
document.addEventListener('focusin', (e) => {
  if (!inputLocked || selfInserting) return;
  if (!isChatArea(e.target)) return;
  try { e.target.blur(); } catch (err) {}
}, true);

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
