const API_BASE_URL = "http://127.0.0.1:8000";
const ITEMS_PER_PAGE = 30;

let allNotices = [];
let currentFilteredNotices = [];
let currentCategory = '전체';
let hasSearched = false;
let currentPage = 1;
let currentSort = 'desc';

function saveSearchState() {
  if (!hasSearched) return;
  const state = {
    university: document.getElementById("universitySelect").value,
    board: document.getElementById("boardSelect").value,
    searchDays: document.getElementById("searchDays").value,
    category: currentCategory,
    sort: currentSort,
    page: currentPage,
    allNotices: allNotices,
    hasSearched: hasSearched
  };
  sessionStorage.setItem('lastSearchState', JSON.stringify(state));
}

window.onload = async function() {
  loadProfileData(); 
  await loadUniversities();
  
  const savedSession = sessionStorage.getItem("userSession");
  const savedSearch = sessionStorage.getItem("lastSearchState");

  if (savedSearch) {
    try {
      const state = JSON.parse(savedSearch);
      const univSelect = document.getElementById("universitySelect");
      const boardSelect = document.getElementById("boardSelect");
      
      univSelect.value = state.university;
      await handleUniversityChange(); 
      
      if (state.board) {
        boardSelect.value = state.board;
      }
      
      document.getElementById("searchDays").value = state.searchDays || "15";
      document.getElementById("sortSelect").value = state.sort || "desc";

      allNotices = state.allNotices || [];
      hasSearched = state.hasSearched;
      currentSort = state.sort || "desc";
      currentPage = state.page || 1;

      if (hasSearched && allNotices.length > 0) {
        renderRecommendations();
        applyFilter(state.category || '전체', true);
      } else if (hasSearched) {
        const status = document.getElementById("status");
        status.textContent = `${state.university} 공지사항이 없습니다.`;
        document.getElementById("noticeList").innerHTML = `<div class="empty">검색 결과가 없습니다.<br />선택한 학교 또는 게시판에 데이터가 있는지 확인해주세요.</div>`;
      }
    } catch (e) {
      console.error("검색 상태 복원 중 오류:", e);
    }
  } else if (savedSession) {
    try {
      const user = JSON.parse(savedSession);
      const univSelect = document.getElementById("universitySelect");
      const status = document.getElementById("status");
      
      let schoolExists = false;
      for (let i = 0; i < univSelect.options.length; i++) {
        if (univSelect.options[i].value === user.school) {
          schoolExists = true;
          break;
        }
      }

      if (schoolExists) {
        univSelect.value = user.school;
        status.textContent = `👋 ${user.name}님 환영합니다! ${user.school} 게시판을 선택해 검색해 보세요.`;
        handleUniversityChange();
      } else {
        status.textContent = `👋 ${user.name}님 환영합니다! (아쉽게도 입력하신 '${user.school}'은 아직 지원하지 않습니다.)`;
      }
    } catch (error) {
      console.error("세션 데이터를 읽는 중 오류가 발생했습니다.", error);
    }
  }
};

function toggleProfile() {
  document.getElementById('profileDropdown').classList.toggle('show');
}

async function openManageModal() {
  document.getElementById('manageModal').classList.add('show');
  await loadManageUniversities(); 
}

function closeManageModal() {
  document.getElementById('manageModal').classList.remove('show');
  document.getElementById('registerForm').reset();
  document.getElementById('manageBoardList').innerHTML = `<div style="font-size: 13px; color: #9ca3af; text-align: center; padding: 16px;">학교를 선택하면 등록된 게시판이 표시됩니다.</div>`;
  document.getElementById('manageUnivSelect').value = "";
}

window.addEventListener('click', function(e) {
  const profileContainer = document.querySelector('.profile-container');
  const dropdown = document.getElementById('profileDropdown');
  if (profileContainer && !profileContainer.contains(e.target) && dropdown.classList.contains('show')) {
    dropdown.classList.remove('show');
  }

  const modal = document.getElementById('manageModal');
  if (e.target === modal) {
    closeManageModal();
  }
});

function loadProfileData() {
  const savedSession = sessionStorage.getItem("userSession");
  if (savedSession) {
    try {
      const user = JSON.parse(savedSession);
      
      document.getElementById('profileNameBtn').textContent = `${user.name} 님`;
      document.getElementById('profileName').textContent = user.name;
      document.getElementById('profileSchool').textContent = user.school;
      document.getElementById('profileMajor').textContent = user.major;
      document.getElementById('profileYear').textContent = `${user.year}학년`;
      
      const interestsContainer = document.getElementById('profileInterests');
      if (user.interests && user.interests.length > 0) {
        interestsContainer.innerHTML = user.interests.map(interest => 
          `<span class="interest-badge">${escapeHtml(interest)}</span>`
        ).join('');
      } else {
        interestsContainer.innerHTML = '<span style="font-size:12px; color:#9ca3af;">관심 분야 없음</span>';
      }
    } catch (e) {
      console.error("프로필 데이터를 불러오는 중 오류가 발생했습니다.", e);
    }
  }
}

function handleLogout() {
  if(confirm('로그아웃 시 입력하신 사용자 정보가 초기화됩니다.\n계속하시겠습니까?')) {
    sessionStorage.removeItem('userSession');
    sessionStorage.removeItem('lastSearchState');
    location.href = 'login.html'; 
  }
}

async function loadUniversities() {
  const univSelect = document.getElementById("universitySelect");
  try {
    const response = await fetch(`${API_BASE_URL}/universities`);
    if (response.ok) {
      let universities = await response.json();
      universities.sort((a, b) => a.localeCompare(b, 'ko-KR'));
      
      univSelect.innerHTML = `<option value="">학교를 선택하세요</option>` + 
        universities.map(u => `<option value="${escapeAttribute(u)}">${escapeHtml(u)}</option>`).join("");
    } else {
      throw new Error("API 응답 실패");
    }
  } catch (error) {
    console.error("대학교 목록을 불러오지 못했습니다.", error);
    let fallbackList = ['충북대학교', '전남대학교', '충남대학교', '서울대학교', '인천대학교', '경북대학교'];
    fallbackList.sort((a, b) => a.localeCompare(b, 'ko-KR'));
    
    univSelect.innerHTML = `<option value="">학교를 선택하세요</option>` + 
        fallbackList.map(u => `<option value="${escapeAttribute(u)}">${escapeHtml(u)}</option>`).join("");
  }
}

async function loadManageUniversities() {
  const manageUnivSelect = document.getElementById("manageUnivSelect");
  manageUnivSelect.innerHTML = `<option value="">목록을 불러오는 중...</option>`;
  
  try {
    const response = await fetch(`${API_BASE_URL}/universities`);
    if (response.ok) {
      let universities = await response.json();
      universities.sort((a, b) => a.localeCompare(b, 'ko-KR'));
      
      manageUnivSelect.innerHTML = `<option value="">학교를 선택하세요</option>` + 
        universities.map(u => `<option value="${escapeAttribute(u)}">${escapeHtml(u)}</option>`).join("");
    }
  } catch (error) {
    manageUnivSelect.innerHTML = `<option value="">학교 목록을 불러올 수 없습니다.</option>`;
  }
}

async function loadManageBoards() {
  const selectedUniv = document.getElementById("manageUnivSelect").value;
  const boardListDiv = document.getElementById("manageBoardList");

  if (!selectedUniv) {
    boardListDiv.innerHTML = `<div style="font-size: 13px; color: #9ca3af; text-align: center; padding: 16px;">학교를 선택하면 등록된 게시판이 표시됩니다.</div>`;
    return;
  }

  boardListDiv.innerHTML = `<div style="font-size: 13px; color: #6b7280; text-align: center; padding: 16px;">게시판 목록을 불러오는 중...</div>`;

  try {
    const response = await fetch(`${API_BASE_URL}/boards?university=${encodeURIComponent(selectedUniv)}`);
    if (response.ok) {
      const boards = await response.json();
      if (boards.length === 0) {
        boardListDiv.innerHTML = `<div style="font-size: 13px; color: #ef4444; text-align: center; padding: 16px;">등록된 게시판이 없습니다.</div>`;
        return;
      }

      boardListDiv.innerHTML = boards.map(b => `
        <div class="board-list-item">
          <span>${escapeHtml(b)}</span>
          <button class="btn-delete" onclick="deleteSource('${escapeAttribute(selectedUniv)}', '${escapeAttribute(b)}')">🗑️ 삭제</button>
        </div>
      `).join("");
    } else {
      throw new Error("게시판 조회 실패");
    }
  } catch (error) {
    boardListDiv.innerHTML = `<div style="font-size: 13px; color: #ef4444; text-align: center; padding: 16px;">게시판 목록을 불러오지 못했습니다.</div>`;
  }
}

async function deleteSource(univ, board) {
  if (!confirm(`⚠️ 정말 '${univ}'의 '${board}' 게시판을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) {
    return;
  }

  try {
    const url = `${API_BASE_URL}/sources?university=${encodeURIComponent(univ)}&board_name=${encodeURIComponent(board)}`;
    const response = await fetch(url, {
      method: "DELETE"
    });

    if (response.ok) {
      alert(`🗑️ '${univ} - ${board}' 게시판이 성공적으로 삭제되었습니다.`);
      
      await loadManageBoards(); 
      await loadUniversities(); 
      
      const mainUnivSelect = document.getElementById("universitySelect");
      if (mainUnivSelect.value === univ) {
        handleUniversityChange();
      }

    } else {
      const errorData = await response.json();
      throw new Error(errorData.detail || "삭제 중 오류가 발생했습니다.");
    }
  } catch (error) {
    console.error("삭제 실패:", error);
    alert(`❌ 삭제에 실패했습니다.\n사유: ${error.message}`);
  }
}

async function handleUniversityChange() {
  const univSelect = document.getElementById("universitySelect");
  const boardSelect = document.getElementById("boardSelect");
  const selectedUniv = univSelect.value;

  if (!selectedUniv) {
    boardSelect.innerHTML = `<option value="">게시판 선택 (전체)</option>`;
    boardSelect.disabled = true;
    return;
  }

  boardSelect.innerHTML = `<option value="">게시판 목록을 불러오는 중...</option>`;
  boardSelect.disabled = true;

  try {
    const response = await fetch(`${API_BASE_URL}/boards?university=${encodeURIComponent(selectedUniv)}`);
    if (response.ok) {
      const boards = await response.json();
      boardSelect.innerHTML = `<option value="">게시판 선택 (전체)</option>` + 
        boards.map(b => `<option value="${escapeAttribute(b)}">${escapeHtml(b)}</option>`).join("");
      
      boardSelect.disabled = false;
    } else {
      throw new Error("게시판 API 응답 실패");
    }
  } catch (error) {
    console.error("게시판 목록을 불러오지 못했습니다.", error);
    boardSelect.innerHTML = `<option value="">게시판을 불러오지 못했습니다 (전체 검색)</option>`;
    boardSelect.disabled = false;
  }
}

async function searchNotices() {
  const university = document.getElementById("universitySelect").value;
  const board = document.getElementById("boardSelect").value;
  const searchDays = document.getElementById("searchDays").value; 
  const status = document.getElementById("status");
  const noticeList = document.getElementById("noticeList");
  const pagination = document.getElementById("pagination");

  if (!university) {
    status.textContent = "학교를 먼저 선택해주세요.";
    noticeList.innerHTML = "";
    pagination.innerHTML = "";
    return;
  }

  status.textContent = "공지사항을 불러오는 중입니다...";
  noticeList.innerHTML = "";
  pagination.innerHTML = "";
  hasSearched = true;
  currentPage = 1;

  try {
    let url = `${API_BASE_URL}/notices?university=${encodeURIComponent(university)}&days=${searchDays}`;
    if (board) {
      url += `&board=${encodeURIComponent(board)}`;
    }

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error("서버 응답 오류");
    }

    const notices = await response.json();
    
    if (!Array.isArray(notices) || notices.length === 0) {
      allNotices = [];
      status.textContent = `${university} 공지사항이 없습니다.`;
      document.getElementById("recommendSection").style.display = "none";
      noticeList.innerHTML = `
        <div class="empty">
          검색 결과가 없습니다.<br />
          선택한 학교 또는 게시판에 데이터가 있는지 확인해주세요.
        </div>
      `;
      saveSearchState(); 
      return;
    }

    allNotices = notices;
    renderRecommendations();
    applyFilter(currentCategory);

  } catch (error) {
    console.error(error);
    status.textContent = "공지사항을 불러오지 못했습니다.";
    noticeList.innerHTML = `
      <div class="empty">
        서버 연결에 실패했습니다.<br />
        백엔드 실행 여부와 API 주소를 확인해주세요.
      </div>
    `;
  }
}

function applyFilter(category, skipPageReset = false) {
  currentCategory = category;
  if (!skipPageReset) {
    currentPage = 1;
  }

  const buttons = document.querySelectorAll('.filter-btn');
  buttons.forEach(btn => {
    if (btn.textContent.trim() === category) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  if (!hasSearched) return;

  currentFilteredNotices = category === '전체' 
    ? allNotices 
    : allNotices.filter(n => (n.category || '기타') === category);

  const status = document.getElementById("status");
  const university = document.getElementById("universitySelect").value;
  const board = document.getElementById("boardSelect").value;
  
  const targetName = board ? `${university} - ${board}` : university;
  status.textContent = `${targetName} '${category}' 공지 ${currentFilteredNotices.length}건을 찾았습니다.`;

  sortNotices();
}

function renderPage() {
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedNotices = currentFilteredNotices.slice(startIndex, endIndex);

  renderNotices(paginatedNotices);
  renderPagination(currentFilteredNotices.length);

  saveSearchState();
}

function changePage(pageNumber) {
  currentPage = pageNumber;
  renderPage();
  const statusElement = document.getElementById("status");
  statusElement.scrollIntoView({ behavior: 'smooth' });
}

function renderPagination(totalItems) {
  const paginationContainer = document.getElementById("pagination");
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

  if (totalPages <= 1) {
    paginationContainer.innerHTML = "";
    return;
  }

  let paginationHtml = "";
  for (let i = 1; i <= totalPages; i++) {
    const isActive = i === currentPage ? 'active' : '';
    paginationHtml += `<button class="page-btn ${isActive}" onclick="changePage(${i})">${i}</button>`;
  }
  paginationContainer.innerHTML = paginationHtml;
}

function safeMeta(label, value) {
  if (value === undefined || value === null || String(value).trim() === '' || String(value).toLowerCase() === 'null' || String(value).toLowerCase() === 'none' || String(value).trim() === '전체') {
    return '';
  }
  return `<span>${label}: ${escapeHtml(value)}</span>`;
}

function renderNotices(notices) {
  const noticeList = document.getElementById("noticeList");
  
  if (notices.length === 0) {
    noticeList.innerHTML = `
      <div class="empty">
        해당 조건의 공지사항이 없습니다.
      </div>
    `;
    return;
  }

  noticeList.innerHTML = notices.map(notice => {
    let selectedBoard = document.getElementById("boardSelect").value;
    let sourceCat = notice.university;
    let dept = notice.board_name || notice.board || (selectedBoard ? selectedBoard : "전체 공지");
    let noticeJson = escapeAttribute(JSON.stringify(notice));
    
    return `
    <div class="notice-card">
      <div class="notice-top">
        <span class="badge">${escapeHtml(notice.category || "기타")}</span>
        <span>${escapeHtml(notice.university || "")}</span>
      </div>
      <div class="title">
        <a href="${escapeAttribute(notice.url || "#")}" target="_blank" rel="noopener noreferrer">
          ${escapeHtml(notice.title || "제목 없음")}
        </a>
        ${isNew(notice.date) ? '<span class="new-badge">NEW</span>' : ''} 
      </div>
      <div class="meta">
        ${safeMeta('원본 분류', sourceCat)}
        ${safeMeta('부서', dept)}
        <span>작성일: ${escapeHtml(notice.date || "작성일 없음")}</span>
      </div>
      <div class="action-buttons">
        <button class="add-schedule-btn" onclick="sendToSchedule(this)" data-notice="${noticeJson}">
          📅 스케줄 추가
        </button>
        <button class="add-schedule-btn archive-btn" onclick="saveToArchive(this)" data-notice="${noticeJson}">
          🗂️ 보관함 저장
        </button>
      </div>
    </div>
    `;
  }).join("");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
  return String(value).replace(/\"/g, "&quot;");
}

function handleSortChange() {
  currentSort = document.getElementById("sortSelect").value;
  currentPage = 1;
  sortNotices();
}

function sortNotices() {
  if (currentSort === 'desc') {
    currentFilteredNotices.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  } else {
    currentFilteredNotices.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
  }
  renderPage();
}

function isNew(dateString) {
  if (!dateString) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const noticeDate = new Date(dateString);
  noticeDate.setHours(0, 0, 0, 0);
  
  const diffTime = today - noticeDate;
  const diffDays = diffTime / (1000 * 60 * 60 * 24);
  
  return diffDays <= 2 && diffDays >= 0;
}

function renderRecommendations() {
  const recommendSection = document.getElementById("recommendSection");
  const recommendList = document.getElementById("recommendList");
  const recommendTitle = document.getElementById("recommendTitle");
  
  const savedSession = sessionStorage.getItem("userSession");
  if (!savedSession || allNotices.length === 0) {
    recommendSection.style.display = "none";
    return;
  }

  const user = JSON.parse(savedSession);
  let recommended = [];

  if (user.interests && user.interests.length > 0) {
    recommended = allNotices.filter(notice => user.interests.includes(notice.category));
  }

  if (user.year === "4") {
    const priorityNotices = allNotices.filter(notice => 
      (notice.category === "취업/채용" || notice.category === "학사") && 
      !recommended.includes(notice)
    );
    recommended = [...recommended, ...priorityNotices];
  }

  if (user.year === "1") {
     const priorityNotices = allNotices.filter(notice => 
      (notice.category === "입학/등록" || notice.category === "일반") && 
      !recommended.includes(notice)
    );
    recommended = [...recommended, ...priorityNotices];
  }

  if (recommended.length === 0) {
    recommendSection.style.display = "none";
    return;
  }

  recommended.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  const topPicks = recommended.slice(0, 3);

  recommendTitle.textContent = `${user.name}님(${user.year}학년)을 위한 오늘의 추천 공지`;
  
  recommendList.innerHTML = topPicks.map(notice => {
    let selectedBoard = document.getElementById("boardSelect").value;
    let sourceCat = notice.university;
    let dept = notice.board_name || notice.board || (selectedBoard ? selectedBoard : "전체 공지");
    let noticeJson = escapeAttribute(JSON.stringify(notice));

    return `
    <div class="recommend-card">
      <div class="notice-top" style="margin-bottom: 8px;">
        <span class="badge" style="background: #dbeafe;">${escapeHtml(notice.category || "기타")}</span>
        <span style="font-size: 13px; color: #6b7280;">${isNew(notice.date) ? '<span style="color:#ef4444; font-weight:bold; margin-right:4px;">[NEW]</span>' : ''}${escapeHtml(notice.date || "")}</span>
      </div>
      <div class="title" style="font-size: 16px; margin-bottom: 8px;">
        <a href="${escapeAttribute(notice.url || "#")}" target="_blank" rel="noopener noreferrer">
          ${escapeHtml(notice.title || "제목 없음")}
        </a>
      </div>
      <div class="meta" style="margin-bottom: 12px;">
        ${safeMeta('원본 분류', sourceCat)}
        ${safeMeta('부서', dept)}
      </div>
      <div class="action-buttons">
        <button class="add-schedule-btn" onclick="sendToSchedule(this)" data-notice="${noticeJson}">
          📅 스케줄 추가
        </button>
        <button class="add-schedule-btn archive-btn" onclick="saveToArchive(this)" data-notice="${noticeJson}">
          🗂️ 보관함 저장
        </button>
      </div>
    </div>
    `;
  }).join("");

  recommendSection.style.display = "block";
}

async function handleRegisterSource(event) {
  event.preventDefault();

  const univ = document.getElementById("regUniv").value.trim();
  const board = document.getElementById("regBoard").value.trim();
  const url1 = document.getElementById("regUrl1").value.trim();
  const url2 = document.getElementById("regUrl2").value.trim();
  const submitBtn = event.target.querySelector("button[type='submit']");

  if (!univ || !board || !url1 || !url2) {
    alert("모든 필드를 입력해주세요.");
    return;
  }

  const originalText = submitBtn.textContent;
  submitBtn.textContent = "등록 중...";
  submitBtn.style.background = "#9ca3af";
  submitBtn.disabled = true;

  try {
    const response = await fetch(`${API_BASE_URL}/sources/url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        university: univ,
        board_name: board,
        url1: url1,
        url2: url2
      })
    });

    if (response.ok) {
      alert(`🎉 성공적으로 등록되었습니다!\n대학: ${univ}\n게시판: ${board}`);
      
      closeManageModal();
      await loadUniversities(); 
    } else {
      const errorData = await response.json();
      throw new Error(errorData.detail || "서버 응답 오류");
    }
  } catch (error) {
    console.error("소스 등록 오류:", error);
    alert(`❌ 등록에 실패했습니다.\n사유: ${error.message}`);
  } finally {
    submitBtn.textContent = originalText;
    submitBtn.style.background = "#8b5cf6";
    submitBtn.disabled = false;
  }
}

function sendToSchedule(btnElement) {
  try {
    const notice = JSON.parse(btnElement.getAttribute('data-notice'));
    let selectedBoard = document.getElementById("boardSelect").value;
    let dept = notice.board_name || notice.board || (selectedBoard ? selectedBoard : "전체 공지");
    let sourceCat = notice.source_category || notice.sourceCategory || notice.subCategory || "기타";
    
    let memoText = "";
    if(notice.university) memoText += `학교: ${notice.university}\n`;
    if(dept) memoText += `부서: ${dept}\n`;

    const params = new URLSearchParams({
      title: notice.title || '',
      category: notice.category || '기타',
      subCategory: sourceCat,
      url: notice.url || '',
      memo: memoText.trim()
    });
    
    location.href = `schedule_page.html?${params.toString()}`;
  } catch(e) {
    console.error("스케줄 이동 중 오류:", e);
    alert("오류가 발생했습니다.");
  }
}

function saveToArchive(btnElement) {
  try {
    const notice = JSON.parse(btnElement.getAttribute('data-notice'));
    const STORAGE_KEY = 'noticeArchiveItems';
    let items = [];
    
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      items = JSON.parse(raw);
    }

    const isDuplicate = items.some(item => item.url === notice.url && item.title === notice.title);
    if (isDuplicate) {
      alert('이미 보관함에 저장된 공지입니다.');
      return;
    }

    let selectedBoard = document.getElementById("boardSelect").value;
    let sourceCat = notice.source_category || notice.sourceCategory || notice.subCategory || '기타';
    let dept = notice.department || notice.author || notice.board_name || notice.board || (selectedBoard ? selectedBoard : "전체 공지");

    const newItem = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      title: notice.title || '제목 없음',
      url: notice.url || '#',
      category: notice.category || '기타',
      source_category: sourceCat,
      department: dept,
      university: notice.university || '',
      date: notice.date || '',
      memo: '',
      savedAt: new Date().toISOString()
    };

    items.push(newItem);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    alert('🗂️ 공지가 보관함에 성공적으로 저장되었습니다!');
  } catch(e) {
    console.error("보관함 저장 중 오류:", e);
    alert('저장 중 오류가 발생했습니다.');
  }
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    saveSearchState,
    toggleProfile,
    openManageModal,
    closeManageModal,
    loadProfileData,
    handleLogout,
    loadUniversities,
    loadManageUniversities,
    loadManageBoards,
    deleteSource,
    handleUniversityChange,
    searchNotices,
    applyFilter,
    renderPage,
    changePage,
    renderPagination,
    safeMeta,
    renderNotices,
    escapeHtml,
    escapeAttribute,
    handleSortChange,
    sortNotices,
    isNew,
    renderRecommendations,
    handleRegisterSource,
    sendToSchedule,
    saveToArchive
  };
}
