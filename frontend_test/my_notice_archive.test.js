describe('Notice Archive - 전체 함수 및 브라우저 흐름 검증 테스트', () => {

  beforeEach(() => {
    // 1. 가상 HTML DOM 구조 세팅
    document.body.innerHTML = `
      <input id="keywordInput" value="" />
      <select id="categoryFilter"><option value="전체">전체</option><option value="장학">장학</option><option value="학사">학사</option></select>
      <select id="sortFilter">
        <option value="saved-desc">보관 최신순</option>
        <option value="saved-asc">보관 오래된순</option>
        <option value="date-desc">공지 작성일순</option>
      </select>
      <button id="resetBtn"></button><button id="clearBtn"></button>
      <div id="savedList"></div><div id="noticeGrid"></div>
      <div id="status"></div><div id="resultText"></div>
      
      <span id="summaryTotal">0</span><span id="summaryScholarship">0</span>
      <span id="summaryAcademic">0</span><span id="summaryAdmission">0</span>
      <span id="summaryJob">0</span><span id="summaryContest">0</span>
      <span id="summaryVolunteer">0</span><span id="summaryFacility">0</span>
      <span id="summarySafety">0</span><span id="summaryEtc">0</span>

      <button id="userChipBtn"><span id="userChipName"></span></button>
      <div id="profileModal" style="display: none;">
        <span id="profileName"></span><span id="profileSchool"></span>
        <span id="profileMajor"></span><span id="profileYear"></span>
        <div id="profileTags"></div>
        <button id="logoutBtn"></button>
      </div>
    `;

    // 2. localStorage Mocking
    const localStorageMock = (() => {
      let store = {};
      return {
        getItem: (key) => store[key] || null,
        setItem: (key, value) => { store[key] = String(value); },
        removeItem: (key) => { delete store[key]; },
        clear: () => { store = {}; }
      };
    })();
    Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true });

    // 3. 브라우저 내비게이션 및 알림창 Mocking
    delete window.location;
    window.location = { href: '' };
    global.alert = jest.fn();
    global.confirm = jest.fn(() => true);

    // 4. 백엔드 서버 통신 Mocking
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      })
    );

    // 매 테스트 시작 전 격리된 환경에서 소스 파일을 로드하여 init() 자동 실행 유도
    jest.isolateModules(() => {
      require('./my_notice_archive.js');
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // --------------------------------------------------------
  // [1] 데이터 필터링 및 검색 흐름 테스트 (DOM 변화 검증)
  // --------------------------------------------------------
  test('filter 및 검색 로직 - 검색어 입력 시 해당 공지만 필터링되어 화면에 렌더링되어야 한다', async () => {
    const mockItems = [
      { id: 'item1', title: '국가장학 안내', category: '장학', date: '2026-06-01', savedAt: 1000 },
      { id: 'item2', title: '졸업고사 일정', category: '학사', date: '2026-06-05', savedAt: 2000 }
    ];
    window.localStorage.setItem('noticeArchiveItems', JSON.stringify(mockItems));

    // 검색어 입력창 요소를 가져와 값을 '장학'으로 세팅
    const keywordInput = document.getElementById('keywordInput');
    keywordInput.value = '장학';
    
    // 파일 내 등록된 'input' 이벤트 리스너를 실행시켜 renderArchive() 흐름을 트리거
    keywordInput.dispatchEvent(new Event('input')); 

    const noticeGrid = document.getElementById('noticeGrid');
    // '장학'이 들어간 공지만 화면 그리드 내에 출력되고 다른 공지는 제외되었는지 검증
    expect(noticeGrid.innerHTML).toContain('국가장학 안내');
    expect(noticeGrid.innerHTML).not.toContain('졸업고사 일정');
  });

  test('카테고리 필터링 - 카테고리 셀렉트박스 변경 시 조건에 맞는 카드만 그리드에 표현되어야 한다', async () => {
    const mockItems = [
      { id: 'item1', title: '국가장학 안내', category: '장학', date: '2026-06-01', savedAt: 1000 },
      { id: 'item2', title: '졸업고사 일정', category: '학사', date: '2026-06-05', savedAt: 2000 }
    ];
    window.localStorage.setItem('noticeArchiveItems', JSON.stringify(mockItems));

    const categoryFilter = document.getElementById('categoryFilter');
    categoryFilter.value = '학사';
    
    // 'change' 이벤트를 발송하여 화면 갱신 유도
    categoryFilter.dispatchEvent(new Event('change'));

    const noticeGrid = document.getElementById('noticeGrid');
    expect(noticeGrid.innerHTML).toContain('졸업고사 일정');
    expect(noticeGrid.innerHTML).not.toContain('국가장학 안내');
  });

  // --------------------------------------------------------
  // [2] UI 카운터 및 요약 통계 집계 테스트
  // --------------------------------------------------------
  test('renderSummary() - 로컬 스토리지 데이터 변경 시 상단 요약 영역의 카운팅이 자동 동기화되어야 한다', async () => {
    const mockItems = [
      { id: '1', category: '장학' },
      { id: '2', category: '장학' },
      { id: '3', category: '학사' }
    ];
    window.localStorage.setItem('noticeArchiveItems', JSON.stringify(mockItems));
    
    // 이벤트를 통해 강제 화면 동기화 유도
    document.getElementById('keywordInput').dispatchEvent(new Event('input'));

    expect(document.getElementById('summaryTotal').textContent).toBe('3');
    expect(document.getElementById('summaryScholarship').textContent).toBe('2');
    expect(document.getElementById('summaryAcademic').textContent).toBe('1');
  });

  // --------------------------------------------------------
  // [3] 사용자 버튼 클릭 액션 핸들러 테스트
  // --------------------------------------------------------
  test('삭제 액션 - 카드 내의 삭제 버튼 클릭 시 데이터가 보관함(스토리지)에서 제거되어야 한다', async () => {
    const mockItems = [{ id: 'target-id', title: '삭제 대상 공지', category: '장학' }];
    window.localStorage.setItem('noticeArchiveItems', JSON.stringify(mockItems));
    
    // 먼저 화면에 카드가 렌더링되도록 트리거
    document.getElementById('keywordInput').dispatchEvent(new Event('input'));

    // 동적으로 그려진 삭제 버튼 검색
    const removeBtn = document.querySelector('[data-remove-id="target-id"]');
    expect(removeBtn).not.toBeNull();
    
    // 사용자가 마우스로 삭제 버튼을 클릭한 흐름 시뮬레이션
    removeBtn.click();

    // 로컬스토리지에서 온전히 삭제되었는지 최종 배열 검증
    const stored = JSON.parse(window.localStorage.getItem('noticeArchiveItems'));
    expect(stored.length).toBe(0);
  });

  test('전체 삭제 액션 - 상단 전체 삭제 버튼 클릭 시 confirm 확인창을 거쳐 보관함이 완전히 비워져야 한다', async () => {
    const mockItems = [{ id: '1' }, { id: '2' }];
    window.localStorage.setItem('noticeArchiveItems', JSON.stringify(mockItems));
    document.getElementById('keywordInput').dispatchEvent(new Event('input'));

    const clearBtn = document.getElementById('clearBtn');
    clearBtn.click();

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('보관함을 모두 비울까요?'));
    const stored = JSON.parse(window.localStorage.getItem('noticeArchiveItems'));
    expect(stored.length).toBe(0);
  });

  test('달력에 가져가기 액션 - 일정 추가 버튼 클릭 시 파라미터를 파싱하여 schedule_page.html 주소로 이동해야 한다', async () => {
    const mockItems = [{ id: 'sched-id', title: '달력 전송 공지', category: '학사', url: 'http://test.com' }];
    window.localStorage.setItem('noticeArchiveItems', JSON.stringify(mockItems));
    document.getElementById('keywordInput').dispatchEvent(new Event('input'));

    const scheduleBtn = document.querySelector('[data-add-schedule-id="sched-id"]');
    scheduleBtn.click();

    // 주소창(window.location.href)에 올바른 목적지 및 데이터 쿼리스트링이 담겼는지 확인
    expect(window.location.href).toContain('schedule_page.html');
    expect(window.location.href).toContain('title=%EB%8B%AC%EB%A0%A5+%EC%A0%84%EC%86%A1+%EA%B3%B5%EC%A7%80');
  });

  // --------------------------------------------------------
  // [4] 인증 및 로그아웃 라이프사이클 테스트
  // --------------------------------------------------------
  test('handleLogout() - 로그아웃 버튼을 클릭하면 모든 로컬 데이터가 소멸하고 로그인창으로 튕겨야 한다', async () => {
    // 세션 및 데이터 등록
    window.localStorage.setItem('userSession', JSON.stringify({ name: '홍길동' }));
    window.localStorage.setItem('noticeArchiveItems', JSON.stringify([{ id: '1' }]));
    window.localStorage.setItem('scheduleEvents', JSON.stringify({ '2026-06-06': [] }));

    // 가상 DOM에 배치된 로그아웃 버튼 탐색 후 클릭 이벤트 전송
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.click();
    }

    // 파일 내부의 비동기 작업(fetch) 및 처리가 백그라운드 큐에서 끝날 때까지 대기
    await new Promise(jest.requireActual('timers').setImmediate);

    // 개인 정보 및 캐시 데이터 완전 초기화 확인
    expect(window.localStorage.getItem('userSession')).toBeNull();
    expect(window.localStorage.getItem('noticeArchiveItems')).toBeNull();
    
    // 리다이렉트 경로 확인
    expect(window.location.href).toBe('login.html');
  });
});
