// =========================
// 1. 상태 / 상수 / DOM
// =========================

// 보관함 데이터가 비었을 때 대비용
const state = { fallbackItems: [] };

// localStorage 키
const STORAGE_KEY  = 'noticeArchiveItems';
const SESSION_KEY  = 'userSession';
const SCHEDULE_KEY = 'scheduleEvents';

// DOM 요소 모음
const els = {
  // 필터/리스트
  keywordInput:   document.getElementById('keywordInput'),
  categoryFilter: document.getElementById('categoryFilter'),
  sortFilter:     document.getElementById('sortFilter'),
  resetBtn:       document.getElementById('resetBtn'),
  clearBtn:       document.getElementById('clearBtn'),
  savedList:      document.getElementById('savedList'),

  // 오른쪽 카드 영역
  noticeGrid: document.getElementById('noticeGrid'),
  status:     document.getElementById('status'),
  resultText: document.getElementById('resultText'),

  // 보관함 요약 (카테고리별 개수)
  summaryTotal:        document.getElementById('summaryTotal'),
  summaryScholarship:  document.getElementById('summaryScholarship'),
  summaryAcademic:     document.getElementById('summaryAcademic'),
  summaryAdmission:    document.getElementById('summaryAdmission'),
  summaryJob:          document.getElementById('summaryJob'),
  summaryContest:      document.getElementById('summaryContest'),
  summaryVolunteer:    document.getElementById('summaryVolunteer'),
  summaryFacility:     document.getElementById('summaryFacility'),
  summarySafety:       document.getElementById('summarySafety'),
  summaryEtc:          document.getElementById('summaryEtc'),

  // 사용자 칩 / 프로필
  userChipBtn:   document.getElementById('userChipBtn'),
  userChipName:  document.getElementById('userChipName'),
  profileModal:  document.getElementById('profileModal'),
  profileName:   document.getElementById('profileName'),
  profileSchool: document.getElementById('profileSchool'),
  profileMajor:  document.getElementById('profileMajor'),
  profileYear:   document.getElementById('profileYear'),
  profileTags:   document.getElementById('profileTags'),
  logoutBtn:     document.getElementById('logoutBtn'),
};

// =========================
// 2. 유틸 함수
// =========================

// YYYY-MM-DD 형식 문자열을 Date로 변환
function parseLocalDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const m = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d));
}

// HTML 이스케이프
function escapeHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// attribute용 이스케이프
function escapeAttribute(v) {
  return String(v ?? '').replace(/"/g, '&quot;');
}

// =========================
// 3. 데이터 헬퍼 (localStorage)
// =========================

function getStoredItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return state.fallbackItems;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : state.fallbackItems;
  } catch {
    return state.fallbackItems;
  }
}

function setStoredItems(items) {
  state.fallbackItems = items;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // 저장 실패해도 치명적이진 않으니 조용히 무시
  }
}

// 공지 1개를 보관함에서 쓰기 좋은 형태로 정규화
function normalizeItem(item) {
  return {
    id: item.id || `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    title: item.title || '제목 없음',
    url: item.url || '#',
    category: item.category || '기타',                         // 메인 카테고리
    source_category: item.source_category || item.subCategory || '기타',
    department: item.department || '',
    university: item.university || '',
    date: item.date || '',                                   // 공지 일정 날짜
    memo: item.memo || '',
    savedAt: item.savedAt || new Date().toISOString(),       // 보관함에 저장한 시각
  };
}

// 버튼/배지 색 구분용
function getPillClass(category) {
  if (category === '장학')      return 'scholarship';
  if (category === '학사')      return 'academic';
  if (category === '취업/채용') return 'job';
  return 'etc';
}

// 검색어 필터
function matchesKeyword(item, keyword) {
  const text = [
    item.title,
    item.department,
    item.memo,
    item.source_category,
    item.university,
  ].join(' ').toLowerCase();
  return keyword ? text.includes(keyword) : true;
}

// 카테고리 필터
function matchesCategory(item, category) {
  return category === '전체' ? true : item.category === category;
}

// 정렬
function sortItems(items, type) {
  return [...items].sort((a, b) => {
    if (type === 'saved-asc') {
      return new Date(a.savedAt) - new Date(b.savedAt);
    }
    if (type === 'date-asc') {
      const ad = parseLocalDate(a.date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bd = parseLocalDate(b.date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return ad - bd;
    }
    if (type === 'date-desc') {
      const ad = parseLocalDate(a.date)?.getTime() ?? 0;
      const bd = parseLocalDate(b.date)?.getTime() ?? 0;
      return bd - ad;
    }
    // 기본: 저장 최신순
    return new Date(b.savedAt) - new Date(a.savedAt);
  });
}

function getAllItems() {
  return getStoredItems().map(normalizeItem);
}

function getFilteredItems() {
  const keyword = els.keywordInput.value.trim().toLowerCase();
  const cat     = els.categoryFilter.value;
  const sort    = els.sortFilter.value;

  const filtered = getAllItems()
    .filter(i => matchesKeyword(i, keyword))
    .filter(i => matchesCategory(i, cat));

  return sortItems(filtered, sort);
}

// =========================
// 4. 렌더링: 요약 / 리스트 / 카드
// =========================

// 보관함 요약: 메인 카테고리별 개수
function renderSummary(items) {
  const total = items.length;

  const counts = {
    '장학':      0,
    '학사':      0,
    '입학/등록': 0,
    '취업/채용': 0,
    '공모전/대회': 0,
    '모집/봉사': 0,
    '시설/행정': 0,
    '안전':      0,
    '기타':      0,
  };

  items.forEach(i => {
    const cat = i.category || '기타';
    if (counts[cat] !== undefined) {
      counts[cat] += 1;
    } else {
      counts['기타'] += 1;
    }
  });

  els.summaryTotal.textContent       = String(total);
  els.summaryScholarship.textContent = String(counts['장학']);
  els.summaryAcademic.textContent    = String(counts['학사']);
  els.summaryAdmission.textContent   = String(counts['입학/등록']);
  els.summaryJob.textContent         = String(counts['취업/채용']);
  els.summaryContest.textContent     = String(counts['공모전/대회']);
  els.summaryVolunteer.textContent   = String(counts['모집/봉사']);
  els.summaryFacility.textContent    = String(counts['시설/행정']);
  els.summarySafety.textContent      = String(counts['안전']);
  els.summaryEtc.textContent         = String(counts['기타']);
}

// 왼쪽: “저장된 공지 목록”
function renderSavedList(items) {
  if (!items.length) {
    els.savedList.innerHTML = `<div class="empty-text">저장된 공지가 없습니다.</div>`;
    return;
  }

  els.savedList.innerHTML = items.map(item => `
    <div class="event-item">
      <div class="event-main">
        <div class="event-type-pill ${getPillClass(item.category)}">
          ${escapeHtml(item.category)}
        </div>
        <div class="event-title">${escapeHtml(item.title)}</div>
        <div class="event-time">
          ${escapeHtml(item.date || '날짜 없음')} · ${escapeHtml(item.source_category || '세부항목 없음')}
        </div>
        <div class="event-meta">
          ${escapeHtml(item.department || '부서 없음')}
          ${item.university ? ` | ${escapeHtml(item.university)}` : ''}
        </div>
      </div>
      <button type="button" class="btn-secondary" data-remove-id="${escapeAttribute(item.id)}">삭제</button>
    </div>
  `).join('');
}

// 오른쪽: 보관한 공지 카드 그리드
function renderNoticeGrid(items) {
  if (!items.length) {
    els.noticeGrid.innerHTML = `<div class="empty-text">조건에 맞는 공지가 없습니다.</div>`;
    return;
  }

  els.noticeGrid.innerHTML = items.map(item => `
    <div class="notice-card">
      <div class="notice-top">
        <div class="pill-row">
          <span class="mini-badge">${escapeHtml(item.category)}</span>
          <span class="date-badge">${escapeHtml(item.date || '날짜 없음')}</span>
          <span class="saved-badge">보관 완료</span>
        </div>
        <span class="status-text">${escapeHtml(item.university || '')}</span>
      </div>

      <div class="notice-title">
        <a href="${escapeAttribute(item.url)}" target="_blank" rel="noopener noreferrer">
          ${escapeHtml(item.title)}
        </a>
      </div>

      <div class="event-meta">
        세부항목: ${escapeHtml(item.source_category || '없음')}
        · 부서: ${escapeHtml(item.department || '없음')}
      </div>

      <div class="notice-memo">
        ${escapeHtml(
          item.memo || '메모가 없습니다. 저장 이유를 남겨두면 나중에 다시 확인하기 쉽습니다.'
        )}
      </div>

      <div class="notice-actions">
        <a class="btn-primary"
           href="${escapeAttribute(item.url)}"
           target="_blank"
           rel="noopener noreferrer">
          원문 보기
        </a>
        <button type="button"
                class="btn-secondary"
                data-add-schedule-id="${escapeAttribute(item.id)}">
          달력에 가져가기
        </button>
        <button type="button"
                class="btn-danger"
                data-remove-id="${escapeAttribute(item.id)}">
          보관함에서 제거
        </button>
      </div>
    </div>
  `).join('');
}

// 상태/결과 텍스트
function renderStatus(allItems, filteredItems) {
  if (!allItems.length) {
    els.status.textContent    = '아직 저장된 공지가 없습니다. 공지 검색 페이지에서 저장해 보세요.';
    els.resultText.textContent = '보관함이 비어 있습니다.';
    return;
  }

  els.status.textContent =
    `필터 결과 ${filteredItems.length}건을 표시 중입니다.`;
  els.resultText.textContent =
    `전체 ${allItems.length}건 중 현재 조건에 맞는 공지 ${filteredItems.length}건`;
}

// 버튼 이벤트 바인딩
function bindRemoveButtons() {
  document.querySelectorAll('[data-remove-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      handleRemoveItem(btn.dataset.removeId);
    });
  });
}

function bindAddScheduleButtons() {
  document.querySelectorAll('[data-add-schedule-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.addScheduleId;
      handleAddScheduleFromArchive(id);
    });
  });
}

// 보관함 전체 렌더
function renderArchive() {
  const all      = getAllItems();
  const filtered = getFilteredItems();

  renderSummary(all);          // 요약은 전체 기준
  renderSavedList(all);        // 왼쪽 리스트도 전체 기준
  renderNoticeGrid(filtered);  // 오른쪽 카드는 현재 필터 기준
  renderStatus(all, filtered);
  bindRemoveButtons();
  bindAddScheduleButtons();
}

// =========================
// 5. 보관함 액션 핸들러
// =========================

// 개별 제거
function handleRemoveItem(id) {
  const next = getStoredItems().filter(i => i.id !== id);
  setStoredItems(next);
  els.status.textContent = '선택한 공지를 삭제했습니다.';
  renderArchive();
}

// 스케줄러로 보내기 (쿼리스트링)
function handleAddScheduleFromArchive(id) {
  const items = getAllItems();
  const item  = items.find(x => x.id === id);

  if (!item) {
    alert('해당 공지를 찾을 수 없습니다.');
    return;
  }

  const mainCategory = item.category || '기타';
  const subCategory  = item.source_category || '기타';
  const title        = item.title || '제목 없음';

  const memoLines = [];
  if (item.memo)       memoLines.push(item.memo);
  if (item.url)        memoLines.push(`원문 링크: ${item.url}`);
  if (item.university) memoLines.push(`학교: ${item.university}`);
  if (item.department) memoLines.push(`부서: ${item.department}`);

  const memo = memoLines.join('\n') || '';

  const todayStr = new Date().toISOString().slice(0, 10);
  const dateStr  = item.date || todayStr;

  const params = new URLSearchParams({
    title,
    category:    mainCategory,
    subCategory,
    url:         item.url || '',
    memo,
    date:        dateStr,
  });

  window.location.href = `schedule_page.html?${params.toString()}`;
}

// 보관함 전체 삭제
function handleClearArchive() {
  if (!confirm('보관함을 모두 비울까요?')) return;
  setStoredItems([]);
  els.status.textContent = '보관함을 비웠습니다.';
  renderArchive();
}

// 필터 초기화
function handleResetFilters() {
  els.keywordInput.value   = '';
  els.categoryFilter.value = '전체';
  els.sortFilter.value     = 'saved-desc';
  renderArchive();
}

// 다른 탭에서 localStorage 변경됐을 때 동기화
function handleStorageSync(e) {
  if (e.key !== STORAGE_KEY) return;
  els.status.textContent = '다른 페이지에서 보관함이 변경되어 목록을 다시 불러왔습니다.';
  renderArchive();
}

// =========================
// 6. 사용자 세션 / 프로필 / 로그아웃
// =========================

function loadUserSession() {
  const raw = sessionStorage.getItem(SESSION_KEY);  // ★ 변경
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function fillUserChip(user) {
  if (!user) {
    els.userChipName.textContent = '게스트 님';
    return;
  }
  els.userChipName.textContent = `${user.name || '사용자'} 님`;
}

function fillProfileCard(user) {
  if (!user) return;

  els.profileName.textContent  = user.name  || '사용자';
  els.profileSchool.textContent = user.school || '학교 정보 없음';
  els.profileMajor.textContent  = user.major  || '학과 정보 없음';

  const yearMap = {
    '1': '1학년',
    '2': '2학년',
    '3': '3학년',
    '4': '4학년 이상',
  };
  els.profileYear.textContent = user.year ? yearMap[user.year] || '' : '';

  const interests = Array.isArray(user.interests) ? user.interests : [];
  els.profileTags.innerHTML = '';
  if (!interests.length) {
    const span = document.createElement('span');
    span.className = 'profile-text';
    span.textContent = '관심 분야 없음';
    els.profileTags.appendChild(span);
  } else {
    interests.forEach(label => {
      const tag = document.createElement('span');
      tag.className = 'profile-tag-pill';
      tag.textContent = label;
      els.profileTags.appendChild(tag);
    });
  }
}

function openProfileModal() {
  const user = loadUserSession();
  fillProfileCard(user);
  els.profileModal.style.display = 'block';
}

function closeProfileModal() {
  els.profileModal.style.display = 'none';
}

// 서버 스케줄 전체 삭제 (로그아웃 시)
async function deleteAllSchedulesViaSingleEndpoint() {
  try {
    const listRes = await fetch('http://127.0.0.1:8000/schedules?skip=0&limit=1000');
    if (!listRes.ok) {
      console.error('스케줄 목록 조회 실패:', listRes.status);
      return;
    }

    const schedules = await listRes.json();
    const ids = schedules.map(s => s.id);

    await Promise.all(
      ids.map(id =>
        fetch(`http://127.0.0.1:8000/schedules/${id}`, {
          method: 'DELETE',
        }).catch(e => console.error('스케줄 삭제 실패:', id, e))
      )
    );
  } catch (e) {
    console.error('스케줄 일괄 삭제 중 오류:', e);
  }
}

async function handleLogout() {
  if (!confirm('로그아웃하고 저장된 정보(공지 보관함 & 스케줄러)를 모두 삭제할까요?')) return;

  await deleteAllSchedulesViaSingleEndpoint();

  sessionStorage.removeItem(SESSION_KEY);  // ★ 변경
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(SCHEDULE_KEY);

  alert('로그아웃이 완료되었습니다. 공지 보관함과 스케줄러 내용이 모두 초기화되었습니다.');

  renderArchive();
  closeProfileModal();
  window.location.href = 'login.html';
}

// =========================
// 7. 이벤트 바인딩 / 초기화
// =========================

function bindEvents() {
  // 필터
  els.keywordInput.addEventListener('input', renderArchive);
  els.categoryFilter.addEventListener('change', renderArchive);
  els.sortFilter.addEventListener('change', renderArchive);

  els.resetBtn.addEventListener('click', handleResetFilters);
  els.clearBtn.addEventListener('click', handleClearArchive);

  // storage 동기화
  window.addEventListener('storage', handleStorageSync);

  // 사용자 칩 / 로그아웃
  els.userChipBtn.addEventListener('click', () => {
    const isOpen = els.profileModal.style.display === 'block';
    if (isOpen) closeProfileModal();
    else openProfileModal();
  });

  els.logoutBtn.addEventListener('click', handleLogout);
}

// 프로필 바깥 클릭 시 닫기
document.addEventListener('click', (event) => {
  const target = event.target;

  if (els.profileModal.style.display !== 'block') return;

  if (
    target === els.userChipBtn ||
    els.userChipBtn.contains(target) ||
    els.profileModal.contains(target)
  ) {
    return;
  }

  closeProfileModal();
});

// 초기화
function init() {
  const user = loadUserSession();
  fillUserChip(user);
  bindEvents();
  renderArchive();
}

init();
