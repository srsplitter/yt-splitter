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

// ---- 유튜브 검색 결과 파싱 (검색 페이지의 ytInitialData JSON에서 상위 3개 추출) ----
function parseDuration(t) {
  if (!t) return 0;
  const parts = t.split(':').map(n => parseInt(n, 10));
  if (parts.some(isNaN)) return 0;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

function extractResults(html) {
  const marker = 'var ytInitialData = ';
  const start = html.indexOf(marker);
  if (start === -1) return { ok: false, error: '검색 결과를 읽지 못했어요.' };
  const jsonStart = start + marker.length;
  const end = html.indexOf(';</script>', jsonStart);
  if (end === -1) return { ok: false, error: '검색 결과 형식이 예상과 달라요.' };
  let data;
  try { data = JSON.parse(html.slice(jsonStart, end)); } catch (e) { return { ok: false, error: '검색 결과 해석 실패' }; }
  const items = [];
  try {
    const sections = data.contents.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer.contents;
    for (const sec of sections) {
      const list = sec.itemSectionRenderer && sec.itemSectionRenderer.contents;
      if (!list) continue;
      for (const it of list) {
        const v = it.videoRenderer;
        if (!v || !v.videoId || !/^[A-Za-z0-9_-]{11}$/.test(v.videoId)) continue;
        items.push({
          videoId: v.videoId,
          title: (v.title && v.title.runs && v.title.runs[0] && v.title.runs[0].text) || '(제목 없음)',
          channel: (v.ownerText && v.ownerText.runs && v.ownerText.runs[0] && v.ownerText.runs[0].text) || '',
          durationText: (v.lengthText && v.lengthText.simpleText) || '',
          seconds: parseDuration(v.lengthText && v.lengthText.simpleText)
        });
        if (items.length >= 3) return { ok: true, items: items };
      }
    }
  } catch (e) { return { ok: false, error: '검색 결과 구조가 바뀐 것 같아요.' }; }
  if (items.length === 0) return { ok: false, error: '검색 결과가 없어요.' };
  return { ok: true, items: items };
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

  if (msg.type === 'yt-search') {
    // 검색어 검증: 문자·숫자·공백·일반 문장부호만 허용, 100자 제한. 도메인은 youtube.com 고정.
    const q = String(msg.query || '').replace(/[^\p{L}\p{N}\s\-_.,!?'"()#&]/gu, '').trim().slice(0, 100);
    if (!q) { sendResponse({ ok: false, error: '검색어가 비어 있어요.' }); return; }
    const u = new URL('https://www.youtube.com/results');
    u.searchParams.set('search_query', q);
    if (u.hostname !== 'www.youtube.com' || u.protocol !== 'https:') {
      sendResponse({ ok: false, error: '잘못된 요청이에요.' });
      return;
    }
    fetch(u)
      .then(r => r.text())
      .then(html => sendResponse(extractResults(html)))
      .catch(e => sendResponse({ ok: false, error: '유튜브 접속 실패: ' + e.message }));
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
