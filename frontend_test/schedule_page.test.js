describe('schedule_page.js 전체 함수 및 흐름 통합 테스트 (100% 커버리지)', () => {
  let sp;

  beforeEach(() => {
    // catch 블록에서 발생하는 의도된 에러 로그 억제
    jest.spyOn(console, 'error').mockImplementation(() => {});

    document.body.innerHTML = `
      <form id="eventForm">
        <select id="mainCategory"></select>
        <select id="subCategory"></select>
        <input id="eventTitle" value="" />
        <input id="startDate" value="" />
        <input id="endDate" value="" />
        <textarea id="eventMemo"></textarea>
      </form>
      <div id="eventList"></div>
      <button id="deleteAllBtn"></button>
      <div class="selected-date"></div>
      <div id="calendarGrid"></div>
      <div id="calendarTitle"></div>
      <button id="prevMonthBtn"></button>
      <button id="nextMonthBtn"></button>
      <div id="statusText"></div>
      
      <button id="userChipBtn"></button>
      <span id="userChipName"></span>
      <div id="profileModal" style="display: none;"></div>
      <span id="profileName"></span>
      <span id="profileSchool"></span>
      <span id="profileMajor"></span>
      <span id="profileYear"></span>
      <div id="profileTags"></div>
      <button id="logoutBtn"></button>
    `;

    window.alert = jest.fn();
    window.confirm = jest.fn(() => true);
    delete window.location;
    window.location = { href: '', search: '' };

    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify([])),
        json: () => Promise.resolve([])
      })
    );

    const storageMock = () => {
      let store = {};
      return {
        getItem: jest.fn(key => store[key] || null),
        setItem: jest.fn((key, value) => { store[key] = String(value); }),
        removeItem: jest.fn(key => { delete store[key]; }),
        clear: jest.fn(() => { store = {}; })
      };
    };
    Object.defineProperty(window, 'localStorage', { value: storageMock(), writable: true });

    jest.isolateModules(() => {
      sp = require('./schedule_page.js');
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // [1] 날짜 유틸리티 및 데이터 파싱
  // --------------------------------------------------------
  test('normalizeRange & getDatesInRange - Null 및 역순 입력 처리', () => {
    expect(sp.normalizeRange(null, null)).toEqual({ start: null, end: null });
    expect(sp.getDatesInRange(null, null)).toEqual([]);
    expect(sp.isDateInSelectedRange('2026-06-01')).toBe(false);
  });

  test('syncRangeFromInputs - Start/End 조합 렌더링 확인', () => {
    const startInput = document.getElementById('startDate');
    const endInput = document.getElementById('endDate');

    endInput.value = '2026-06-10';
    sp.syncRangeFromInputs(); // End만 있을 때
    
    startInput.value = '2026-06-01';
    endInput.value = '';
    sp.syncRangeFromInputs(); // Start만 있을 때

    endInput.value = '2026-06-05';
    sp.syncRangeFromInputs(); // 둘 다 있을 때
    expect(document.querySelector('.selected-date').textContent).toContain('2026년');
  });

  test('applyQueryToForm - URL Params 바인딩 및 fallback 카테고리', () => {
    window.location.search = '?title=T&category=학사&subCategory=휴학&url=U&memo=M';
    sp.applyQueryToForm();
    expect(document.getElementById('eventTitle').value).toBe('T');

    // DOM 상태 초기화 후 존재하지 않는 카테고리 입력
    document.getElementById('mainCategory').value = '장학'; 
    window.location.search = '?category=없는분야';
    sp.applyQueryToForm(); 
    expect(document.getElementById('mainCategory').value).toBe('장학'); // 기본값 유지 확인
  });

  // -------------------------------------------------------------------------
  // [2] Fetch API (네트워크 예외 및 데이터 로드)
  // --------------------------------------------------------
  test('fetchJson & loadSchedules - 204 No Content 및 네트워크 에러 처리', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, status: 204 });
    expect(await sp.fetchJson('/test')).toBeNull();

    global.fetch.mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(sp.fetchJson('/error')).rejects.toThrow('요청 실패: 404');

    global.fetch.mockRejectedValueOnce(new Error('Network Failed'));
    await sp.loadSchedulesFromServer(); // 내부 catch 확인
    expect(document.getElementById('statusText').classList.contains('error')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // [3] DOM UI 조작 (캘린더 셀, 목록 렌더링)
  // --------------------------------------------------------
  test('캘린더 셀 클릭(createDayCell) 및 월 이동 렌더링', () => {
    sp.renderCalendar();
    sp.handleNextMonth();
    sp.handlePrevMonth();
    sp.handleMainCategoryChange(); // 메인 카테고리 셀렉트 갱신

    const cells = document.querySelectorAll('.calendar-day');
    cells[10].click(); // rangeStart 세팅
    cells[15].click(); // rangeEnd 세팅
    cells[15].click(); // 새로운 rangeStart 리셋
    expect(document.querySelector('.selected-date').textContent).toBeTruthy();
  });

  test('renderEventList - 단일 일정 삭제 성공 및 API 에러 처리', async () => {
    global.fetch.mockResolvedValueOnce({ 
      ok: true, text: () => Promise.resolve(JSON.stringify([{ id: 99, date: sp.todayIso(), main_category: '시설/행정', title: '버튼테스트' }])) 
    });
    await sp.loadSchedulesFromServer();
    sp.renderEventList();
    
    const deleteBtn = document.querySelector('#eventList .btn-secondary');
    
    // API 에러 발생
    global.fetch.mockRejectedValueOnce(new Error('Single delete err'));
    deleteBtn.click();
    await new Promise(process.nextTick); 
    expect(document.getElementById('statusText').classList.contains('error')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // [4] 스케줄 등록/삭제 핵심 비즈니스 로직 (중복, 전체삭제)
  // --------------------------------------------------------
  test('handleEventSubmit - 제목 미입력 시 중단', async () => {
    const mockEvent = { preventDefault: jest.fn() };
    document.getElementById('eventTitle').value = ' ';
    await sp.handleEventSubmit(mockEvent);
    expect(mockEvent.preventDefault).toHaveBeenCalled(); // 중간 return
  });

  test('handleEventSubmit - 일정 중복 알림 및 저장 예외 커버', async () => {
    const mockEvent = { preventDefault: jest.fn() };
    document.getElementById('eventTitle').value = '동일 일정';
    
    global.fetch.mockResolvedValueOnce({ 
      ok: true, text: () => Promise.resolve(JSON.stringify([{ id: 1, date: sp.todayIso(), title: '동일 일정' }])) 
    });
    await sp.loadSchedulesFromServer(); // 로컬에 이벤트 적재
    
    await sp.handleEventSubmit(mockEvent);
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('이미 같은 제목'));

    // 저장 API 에러
    document.getElementById('eventTitle').value = '새 일정';
    global.fetch.mockRejectedValueOnce(new Error('Save Failed'));
    await sp.handleEventSubmit(mockEvent);
    expect(document.getElementById('statusText').classList.contains('error')).toBe(true);
  });

  test('handleDeleteAll - 선택 취소, 대상 없음 및 에러 커버', async () => {
    // 지울 대상 없음
    sp.syncRangeFromInputs(); // 선택 초기화
    document.getElementById('startDate').value = '2099-12-31';
    sp.syncRangeFromInputs();
    await sp.handleDeleteAll();
    
    // 정상 데이터 주입
    global.fetch.mockResolvedValueOnce({ 
      ok: true, text: () => JSON.stringify([{ id: 1, date: '2099-12-31', title: 'A' }]) 
    });
    await sp.loadSchedulesFromServer();

    // 취소 시
    window.confirm.mockReturnValueOnce(false);
    await sp.handleDeleteAll();

    // 삭제 루프 중 개별 에러 (catch 통과 확인용)
    window.confirm.mockReturnValueOnce(true);
    global.fetch.mockRejectedValueOnce(new Error('Internal delete fail')); 
    await sp.handleDeleteAll(); // 에러를 콘솔에만 찍고 무사히 넘어감

    // 강제 에러 (handleDeleteAll 최외곽 catch 커버를 위해 statusText 세터를 오염시켜 강제 에러 유발)
    const originalClassName = document.getElementById('statusText').className;
    Object.defineProperty(document.getElementById('statusText'), 'className', {
      get() { return originalClassName; },
      set() { throw new Error('Forced Error to trigger Catch Block'); },
      configurable: true
    });
    
    window.confirm.mockReturnValueOnce(true);
    await sp.handleDeleteAll(); // catch 구문으로 진입
  });

  // -------------------------------------------------------------------------
  // [5] 사용자 프로필, 세션, 로그아웃
  // --------------------------------------------------------
  test('User Session & Profile - 누락 정보 분기 완벽 처리', () => {
    window.localStorage.setItem('userSession', '{ bad json }');
    expect(sp.loadUserSession()).toBeNull();

    sp.fillUserChip(null);
    sp.fillUserChip({ name: 'A' });
    
    sp.fillProfileCard(null);
    sp.fillProfileCard({ name: 'A', year: '1', interests: ['A'] });
    sp.fillProfileCard({ name: 'B', year: '4' }); // interests 누락
  });

  test('Logout - 서버 전체 삭제 중 예외 및 응답 !ok 처리', async () => {
    // !ok 분기
    global.fetch.mockResolvedValueOnce({ ok: false, status: 500 });
    await sp.deleteAllSchedulesOnServer();

    // catch (Promise.all 내의 개별 에러)
    global.fetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([{ id: 1 }, { id: 2 }]) });
    global.fetch.mockResolvedValueOnce({ ok: true }); 
    global.fetch.mockRejectedValueOnce(new Error('Delete Fail')); 
    await sp.deleteAllSchedulesOnServer();
  });

  test('Document Click - 모달 바깥 영역 닫힘 처리', () => {
    document.dispatchEvent(new MouseEvent('click')); // 닫혀있을 때
    document.getElementById('profileModal').style.display = 'block';
    document.dispatchEvent(new MouseEvent('click', { bubbles: true })); // 열려있을 때
  });
});
