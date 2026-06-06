describe('Notice Archive - 전체 함수 및 브라우저 흐름 검증 테스트 (100% 커버리지)', () => {
  let m;

  beforeEach(() => {
    // 예상되는 내부 로직 에러(catch)가 테스트 출력창을 어지럽히지 않도록 막습니다.
    jest.spyOn(console, 'error').mockImplementation(() => {});

    // 1. 가상 HTML DOM 구조 세팅
    document.body.innerHTML = `
      <input id="keywordInput" value="" />
      <select id="categoryFilter"><option value="전체">전체</option><option value="장학">장학</option><option value="학사">학사</option></select>
      <select id="sortFilter">
        <option value="saved-desc">보관 최신순</option>
        <option value="saved-asc">보관 오래된순</option>
        <option value="date-desc">공지 작성일순</option>
        <option value="date-asc">공지 작성오래된순</option>
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

    // 2. localStorage Mocking (매 테스트마다 초기화)
    const localStorageMock = (() => {
      let store = {};
      return {
        getItem: jest.fn((key) => store[key] || null),
        setItem: jest.fn((key, value) => { store[key] = String(value); }),
        removeItem: jest.fn((key) => { delete store[key]; }),
        clear: jest.fn(() => { store = {}; })
      };
    })();
    Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true });

    // 3. 글로벌 객체 Mocking
    delete window.location;
    window.location = { href: '' };
    global.alert = jest.fn();
    global.confirm = jest.fn(() => true);

    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    );

    // 4. 모듈 로드 (DOM 및 Storage가 초기화된 상태에서 바인딩 됨)
    jest.isolateModules(() => {
      m = require('./my_notice_archive.js');
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // --------------------------------------------------------
  // [1] 데이터 파싱 및 유틸리티 예외 처리 (100% 커버)
  // --------------------------------------------------------
  test('parseLocalDate, escapeHtml, normalizeItem - 예외 및 기본값 처리', () => {
    expect(m.parseLocalDate(null)).toBeNull();
    expect(m.parseLocalDate('invalid-date')).toBeNull();
    
    expect(m.escapeHtml(null)).toBe('');
    expect(m.escapeHtml('<"&>')).toBe('&lt;&quot;&amp;&gt;');

    const emptyItem = m.normalizeItem({});
    expect(emptyItem.title).toBe('제목 없음');
    expect(emptyItem.category).toBe('기타');
    expect(emptyItem.url).toBe('#');
  });

  test('sortItems - 모든 정렬 필터 검증', () => {
    const items = [
      { date: '2026-06-10', savedAt: '2026-06-02T00:00:00Z' },
      { date: '2026-06-01', savedAt: '2026-06-01T00:00:00Z' },
      { date: null, savedAt: '2026-06-03T00:00:00Z' }
    ];
    expect(m.sortItems(items, 'date-asc')[0].date).toBe('2026-06-01');
    expect(m.sortItems(items, 'date-desc')[0].date).toBe('2026-06-10');
    expect(m.sortItems(items, 'saved-asc')[0].savedAt).toBe('2026-06-01T00:00:00Z');
    expect(m.sortItems(items, 'saved-desc')[0].savedAt).toBe('2026-06-03T00:00:00Z');
  });

  test('localStorage.getItem 파싱 에러 시 빈 배열 반환', () => {
    window.localStorage.getItem.mockReturnValueOnce('{ bad json');
    document.getElementById('keywordInput').dispatchEvent(new Event('input'));
    expect(document.getElementById('noticeGrid').innerHTML).toContain('조건에 맞는 공지가 없습니다');
  });

  // --------------------------------------------------------
  // [2] 카테고리 렌더링 및 UI 상태
  // --------------------------------------------------------
  test('renderSummary & List - 예외 카테고리(기타) 및 삼항연산자(속성 부재) 렌더링 검증', () => {
    const items = [
      { category: '장학', university: '한국대', department: '컴공', memo: '메모있음' },
      { category: '이상한카테고리', university: '', department: '', memo: '' } // '기타'로 합산되어야 함
    ];
    window.localStorage.setItem('noticeArchiveItems', JSON.stringify(items));
    document.getElementById('keywordInput').dispatchEvent(new Event('input'));
    
    expect(document.getElementById('summaryEtc').textContent).toBe('1');
    const savedList = document.getElementById('savedList').innerHTML;
    expect(savedList).toContain('부서 없음');
  });

  // --------------------------------------------------------
  // [3] 이벤트 핸들러 (버튼 클릭 / 동기화) 핵심 로직 커버
  // --------------------------------------------------------
  test('버튼 액션: 초기화, 개별 삭제, 달력 가져가기 성공/실패', () => {
    // 1. 초기 데이터 주입
    const mockItems = [
      { id: '1', title: '공지1', category: '장학', memo: 'A', department: 'B', university: 'C', url: 'http' },
      { id: '2', title: '공지2', category: '학사' }
    ];
    window.localStorage.setItem('noticeArchiveItems', JSON.stringify(mockItems));
    document.getElementById('keywordInput').dispatchEvent(new Event('input'));

    // 필터 초기화 클릭
    document.getElementById('keywordInput').value = '검색어';
    document.getElementById('resetBtn').click();
    expect(document.getElementById('keywordInput').value).toBe('');

    // 개별 삭제 버튼 클릭
    const removeBtns = document.querySelectorAll('[data-remove-id]');
    removeBtns[0].click();
    expect(document.getElementById('status').textContent).toBe('선택한 공지를 삭제했습니다.');

    // 달력 가져가기 (성공)
    const addBtns = document.querySelectorAll('[data-add-schedule-id]');
    addBtns[0].click(); // 남은 항목 클릭
    expect(window.location.href).toContain('schedule_page.html');

    // 달력 가져가기 (찾을 수 없는 아이템 방어 로직)
    window.localStorage.setItem('noticeArchiveItems', '[]'); // 스토리지 비우기
    addBtns[0].click(); // DOM에 남아있는 버튼 다시 클릭
    expect(global.alert).toHaveBeenCalledWith('해당 공지를 찾을 수 없습니다.');
  });

  test('보관함 전체 삭제 - 취소 및 에러 발생에도 화면 정상 처리', () => {
    window.confirm.mockReturnValueOnce(false);
    document.getElementById('clearBtn').click();
    
    window.confirm.mockReturnValueOnce(true);
    window.localStorage.setItem.mockImplementationOnce(() => { throw new Error('Quota Exceeded'); });
    document.getElementById('clearBtn').click();
    expect(document.getElementById('status').textContent).toContain('아직 저장된 공지가 없습니다');
  });

  test('스토리지 동기화 (handleStorageSync)', () => {
    window.dispatchEvent(new StorageEvent('storage', { key: 'otherKey' })); // 무시
    window.dispatchEvent(new StorageEvent('storage', { key: 'noticeArchiveItems' })); // 적용
    expect(document.getElementById('status').textContent).toContain('목록을 다시 불러왔습니다');
  });

  // --------------------------------------------------------
  // [4] 프로필 세션 모달 및 로그아웃
  // --------------------------------------------------------
  test('프로필 모달 - JSON 에러, 학년 분기(1~4), 태그 누락 커버', () => {
    const years = ['1', '2', '3', '4'];
    const expected = ['1학년', '2학년', '3학년', '4학년 이상'];
    
    years.forEach((y, i) => {
      window.localStorage.setItem('userSession', JSON.stringify({ name: '테스트', year: y, interests: ['A'] }));
      document.getElementById('profileModal').style.display = 'none'; // DOM 상태 리셋
      document.getElementById('userChipBtn').click();
      expect(document.getElementById('profileYear').textContent).toBe(expected[i]);
    });

    // 태그(interests)가 없는 경우
    window.localStorage.setItem('userSession', JSON.stringify({ name: '태그없음', year: '1' }));
    document.getElementById('profileModal').style.display = 'none';
    document.getElementById('userChipBtn').click();
    expect(document.getElementById('profileTags').innerHTML).toContain('관심 분야 없음');

    // 세션 파싱 에러 (catch 블록 커버)
    window.localStorage.setItem('userSession', '{ bad json');
    document.getElementById('profileModal').style.display = 'none';
    document.getElementById('userChipBtn').click();
    expect(document.getElementById('userChipName').textContent).toBe('게스트 님');
  });

  test('모달 바깥 영역 클릭 이벤트', () => {
    document.dispatchEvent(new MouseEvent('click')); // 닫혀있을 때
    
    document.getElementById('profileModal').style.display = 'block';
    document.dispatchEvent(new MouseEvent('click', { bubbles: true })); // 외부 클릭
    expect(document.getElementById('profileModal').style.display).toBe('none');
  });

  test('로그아웃 시 스케줄 단일/전체 삭제 API 예외(catch) 완벽 커버', async () => {
    // 전체 조회 실패 (500)
    global.fetch.mockResolvedValueOnce({ ok: false, status: 500 });
    document.getElementById('logoutBtn').click();
    await new Promise(process.nextTick); 
    
    // 전체 조회 성공, 개별 삭제 중 에러 발생
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([{ id: 1 }]) })
      .mockRejectedValueOnce(new Error('Delete Network Error'));
    document.getElementById('logoutBtn').click();
    await new Promise(process.nextTick); 

    expect(window.localStorage.removeItem).toHaveBeenCalledWith('userSession');
    expect(window.location.href).toBe('login.html');
  });
});
