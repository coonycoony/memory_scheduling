const frontend = require('./frontend.js');

describe('frontend.js 100% 통합 및 개별 함수 테스트', () => {
  
  // =========================================================================
  // 1. 테스트 환경 셋업 (가짜 HTML + 가짜 내장 함수)
  // =========================================================================
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="profileDropdown" class=""></div>
      <div id="profileNameBtn"></div>
      <div id="profileName"></div>
      <div id="profileSchool"></div>
      <div id="profileMajor"></div>
      <div id="profileYear"></div>
      <div id="profileInterests"></div>
      
      <select id="universitySelect"><option value="한국대학교">한국대학교</option></select>
      <select id="boardSelect"><option value="일반공지">일반공지</option></select>
      <select id="searchDays"><option value="15">15</option></select>
      <select id="sortSelect"><option value="desc">desc</option><option value="asc">asc</option></select>
      
      <div id="status"></div>
      <div id="noticeList"></div>
      <div id="pagination"></div>
      
      <div id="filterContainer">
        <button class="filter-btn active">전체</button>
        <button class="filter-btn">장학</button>
      </div>

      <div id="recommendSection" style="display: none;"></div>
      <div id="recommendTitle"></div>
      <div id="recommendList"></div>
      
      <div id="manageModal" class=""></div>
      <form id="registerForm">
        <button type="submit">등록</button>
      </form>
      <select id="manageUnivSelect">
        <option value="">학교 선택</option>
        <option value="한국대학교">한국대학교</option>
      </select>
      <div id="manageBoardList"></div>
      
      <input id="regUniv" value="테스트대학" />
      <input id="regBoard" value="테스트게시판" />
      <input id="regUrl1" value="http://test.com/2" />
      <input id="regUrl2" value="http://test.com/3" />
    `;

    window.alert = jest.fn();
    window.confirm = jest.fn();
    delete window.location;
    window.location = { href: '' };
    window.HTMLElement.prototype.scrollIntoView = jest.fn();

    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([])
      })
    );

    const storageMock = () => {
      let store = {};
      return {
        getItem: jest.fn(key => store[key] || null),
        setItem: jest.fn((key, value) => { store[key] = value.toString(); }),
        removeItem: jest.fn(key => { delete store[key]; }),
        clear: jest.fn(() => { store = {}; })
      };
    };
    Object.defineProperty(window, 'sessionStorage', { value: storageMock() });
    Object.defineProperty(window, 'localStorage', { value: storageMock() });

    frontend.applyFilter('전체', true);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // 2. 유틸리티 (escapeHtml, escapeAttribute, isNew, safeMeta)
  // =========================================================================
  describe('유틸리티 기능', () => {
    test('escapeHtml & escapeAttribute 변환 테스트', () => {
      expect(frontend.escapeHtml('<script>')).toBe('&lt;script&gt;');
      expect(frontend.escapeAttribute('name="test"')).toBe('name=&quot;test&quot;');
    });

    test('isNew & safeMeta 기능 테스트', () => {
      const today = new Date().toISOString();
      expect(frontend.isNew(today)).toBe(true);
      expect(frontend.safeMeta('부서', null)).toBe('');
      expect(frontend.safeMeta('부서', '공과대학')).toContain('공과대학');
    });
  });

  // =========================================================================
  // 3. UI 제어 (toggleProfile, openManageModal, closeManageModal)
  // =========================================================================
  describe('UI 및 모달 제어', () => {
    test('toggleProfile & 모달 열기/닫기', async () => {
      frontend.toggleProfile();
      expect(document.getElementById('profileDropdown').classList.contains('show')).toBe(true);
      
      await frontend.openManageModal(); 
      expect(document.getElementById('manageModal').classList.contains('show')).toBe(true);
      
      frontend.closeManageModal();
      expect(document.getElementById('manageModal').classList.contains('show')).toBe(false);
    });
  });

  // =========================================================================
  // 4. 세션 및 프로필 (loadProfileData, handleLogout)
  // =========================================================================
  describe('세션 및 프로필 관리', () => {
    test('handleLogout: 확인 누르면 세션 삭제 및 이동', () => {
      window.confirm.mockReturnValue(true);
      frontend.handleLogout();
      expect(sessionStorage.removeItem).toHaveBeenCalledWith('userSession');
      expect(window.location.href).toBe('login.html');
    });

    test('loadProfileData: 세션 데이터를 화면에 로드', () => {
      const mockUser = { name: '김테스트', school: '한국대학교', year: '4', interests: ['장학'] };
      sessionStorage.getItem.mockReturnValue(JSON.stringify(mockUser));
      frontend.loadProfileData();
      expect(document.getElementById('profileName').textContent).toBe('김테스트');
    });
  });

  // =========================================================================
  // 5. 게시판 및 소스 관리 (handleRegisterSource, loadManageBoards, deleteSource)
  // =========================================================================
  describe('게시판 관리 API 통신', () => {
    test('handleRegisterSource: 폼 입력값 전송', async () => {
      const mockEvent = { preventDefault: jest.fn(), target: { querySelector: () => ({ textContent: '', style: {} }) } };
      global.fetch.mockResolvedValueOnce({ ok: true });
      await frontend.handleRegisterSource(mockEvent); 
      expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('성공적으로 등록되었습니다'));
    });

    test('loadManageBoards: 게시판 목록 로드', async () => {
      document.getElementById('manageUnivSelect').value = '한국대학교';
      global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ['일반공지'] });
      await frontend.loadManageBoards();
      expect(document.getElementById('manageBoardList').innerHTML).toContain('일반공지');
    });

    test('deleteSource: 게시판 삭제 호출', async () => {
      window.confirm.mockReturnValue(true);
      global.fetch.mockResolvedValueOnce({ ok: true });
      await frontend.deleteSource('한국대학교', '일반공지'); 
      expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('성공적으로 삭제되었습니다'));
    });
  });

  // =========================================================================
  // 6. 검색, 필터, 페이징 통합 (handleUniversityChange, searchNotices, applyFilter, changePage, handleSortChange, renderRecommendations)
  // =========================================================================
  describe('공지사항 검색 및 렌더링 통합 로직', () => {
    const mockNotices = [
      { title: '장학금 안내', category: '장학', date: new Date().toISOString() },
      { title: '일반 공지사항', category: '일반', date: '2023-01-01' }
    ];

    test('handleUniversityChange: 대학 선택 시 세부 게시판 갱신', async () => {
      document.getElementById('universitySelect').value = '한국대학교';
      global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ['장학게시판'] });
      await frontend.handleUniversityChange();
      expect(document.getElementById('boardSelect').innerHTML).toContain('장학게시판');
    });

    test('searchNotices -> applyFilter', async () => {
      global.fetch.mockResolvedValueOnce({ ok: true, json: async () => mockNotices });
      await frontend.searchNotices(); 
      let listHtml = document.getElementById('noticeList').innerHTML;
      expect(listHtml).toContain('장학금 안내');

      frontend.applyFilter('장학');
      expect(document.getElementById('noticeList').innerHTML).not.toContain('일반 공지사항');
    });

    test('handleSortChange: 정렬 기준 변경', async () => {
      global.fetch.mockResolvedValueOnce({ ok: true, json: async () => mockNotices });
      await frontend.searchNotices();
      document.getElementById('sortSelect').value = 'asc';
      frontend.handleSortChange(); 
      expect(document.getElementById('status').textContent).toContain('찾았습니다'); 
    });

    test('changePage: 페이징 작동 확인', async () => {
      const manyNotices = Array.from({ length: 40 }, (_, i) => ({ title: `공지 ${i}` }));
      global.fetch.mockResolvedValueOnce({ ok: true, json: async () => manyNotices });
      await frontend.searchNotices();
      frontend.changePage(2); 
      expect(sessionStorage.setItem).toHaveBeenCalledWith('lastSearchState', expect.any(String));
    });

    test('renderRecommendations: 관심사 맞춤 추천', async () => {
      const mockUser = { name: '김테스트', year: '4', interests: ['장학'] };
      sessionStorage.getItem.mockReturnValue(JSON.stringify(mockUser));
      global.fetch.mockResolvedValueOnce({ ok: true, json: async () => mockNotices });
      await frontend.searchNotices(); 
      expect(document.getElementById('recommendSection').style.display).toBe('block');
    });
  });

  // =========================================================================
  // 7. 스케줄 및 보관함 (sendToSchedule, saveToArchive)
  // =========================================================================
  describe('스케줄/보관함 연동', () => {
    test('sendToSchedule: 스케줄 파라미터 이동', () => {
      const btn = document.createElement('button');
      btn.setAttribute('data-notice', JSON.stringify({ title: "스케줄", category: "학사", url: "http://sch.com" }));
      frontend.sendToSchedule(btn);
      expect(window.location.href).toContain('schedule_page.html?');
    });

    test('saveToArchive: 로컬스토리지 저장', () => {
      const btn = document.createElement('button');
      btn.setAttribute('data-notice', JSON.stringify({ title: "새 공지", url: "http://test.com" }));
      localStorage.getItem.mockReturnValue(JSON.stringify([]));
      frontend.saveToArchive(btn);
      expect(localStorage.setItem).toHaveBeenCalledWith('noticeArchiveItems', expect.any(String));
    });
  });

  // // =========================================================================
  // 8. 🚨 [신규 추가] 누락되었던 렌더링/API 단독 함수 명시적 검증 (Unit Tests)
  // =========================================================================
  describe('개별 단독 유닛 함수 검증 (load, render, save 관련)', () => {
    test('loadUniversities: 전체 대학 목록 API 호출 및 UI 렌더링', async () => {
      global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ['서울대학교', '부산대학교'] });
      await frontend.loadUniversities();
      expect(document.getElementById('universitySelect').innerHTML).toContain('서울대학교');
    });

    test('loadManageUniversities: 관리 모달창용 대학 목록 API 호출', async () => {
      global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ['인천대학교'] });
      await frontend.loadManageUniversities();
      expect(document.getElementById('manageUnivSelect').innerHTML).toContain('인천대학교');
    });

    test('renderPagination: 데이터 개수에 맞춰 동적으로 페이지네이션 버튼 생성', () => {
      frontend.renderPagination(65);
      const paginationHtml = document.getElementById('pagination').innerHTML;
      expect(paginationHtml).toContain('changePage(1)');
      expect(paginationHtml).toContain('changePage(2)');
      expect(paginationHtml).toContain('changePage(3)');
    });

    test('renderNotices: 배열 길이에 따른 빈 화면 및 정상 렌더링 처리', () => {
      frontend.renderNotices([]);
      expect(document.getElementById('noticeList').innerHTML).toContain('해당 조건의 공지사항이 없습니다');

      frontend.renderNotices([{ title: '독립 테스트 공지', url: '#', category: '학사' }]);
      expect(document.getElementById('noticeList').innerHTML).toContain('독립 테스트 공지');
    });

    test('renderPage & sortNotices: 내부 상태 렌더링 검증', async () => {
      global.fetch.mockResolvedValueOnce({ ok: true, json: async () => [{ title: '정렬된공지' }] });
      await frontend.searchNotices();
      
      frontend.sortNotices(); 
      frontend.renderPage();
      expect(document.getElementById('noticeList').innerHTML).toContain('정렬된공지');
    });

    test('saveSearchState: 현재 검색된 상태를 세션스토리지에 단독 저장', async () => {
      global.fetch.mockResolvedValueOnce({ ok: true, json: async () => [{ title: '저장테스트공지' }] });
      await frontend.searchNotices(); 
      
      frontend.saveSearchState();
      expect(sessionStorage.setItem).toHaveBeenCalledWith('lastSearchState', expect.any(String));
    });
  });
});
