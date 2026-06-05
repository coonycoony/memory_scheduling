// ========================================================
// schedule_page.test.js
// ========================================================

describe('Schedule Page - 전체 함수 및 브라우저 흐름 검증 테스트', () => {

  beforeEach(() => {
    // 1. 가상 HTML DOM 구조 세팅 (원본 schedule_page.js의 els 상수 매핑 기준)
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
      <button id="prevMonthBtn"></button>
      <button id="nextMonthBtn"></button>
      <div id="calendarGrid"></div>
      <div id="calendarTitle"></div>
      <div id="statusText"></div>
      <div class="selected-date"></div>

      <button id="userChipBtn"><span id="userChipName"></span></button>
      <div id="profileModal" style="display: none;">
        <span id="profileName"></span><span id="profileSchool"></span>
        <span id="profileMajor"></span><span id="profileYear"></span>
        <div id="profileTags"></div>
        <button id="logoutBtn"></button>
      </div>
    `;

    // 2. localStorage 가상화 (Mocking)
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

    // 3. 브라우저 주소창 및 QueryString 가상화 (보관함에서 '달력에 가져가기'로 유입된 상황 재현)
    delete window.location;
    window.location = {
      href: '',
      // '텃트 공지'로 안전하게 인코딩된 주소 세팅
      search: '?title=%ED%85%83%ED%8A%B8+%EA%B3%B5%EC%A7%80&category=%EC%9E%A5%ED%95%99&subCategory=%EA%B5%AC%EA%B2%BD&url=http://example.com&memo=%EB%A9%94%EB%AA%A8'
    };

    // 4. 전역 브라우저 함수 및 API 통신(Fetch) Mocking
    global.alert = jest.fn();
    global.confirm = jest.fn(() => true);
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify([])),
        json: () => Promise.resolve([])
      })
    );

    // 테스트마다 완전 격리된 모듈 상태에서 로드하여 웹페이지 첫 로딩 시나리오(init)를 수행
    jest.isolateModules(() => {
      require('./schedule_page.js');
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // --------------------------------------------------------
  // [1] 초기 구동 시 URL 파라미터 폼(Form) 바인딩 흐름 검사
  // --------------------------------------------------------
  test('초기화 흐름 - 웹페이지 로드 시 주소창의 쿼리스트링 파라미터들이 폼 입력 필드에 자동으로 채워져야 한다', () => {
    // 쿼리스트링 내 타이틀 파라미터가 유입되어 자동 바인딩되었는지 확인
    expect(document.getElementById('eventTitle').value).toBe('텃트 공지');
    
    // 대분류 카테고리가 쿼리 기반으로 정상 세팅되었는지 확인
    expect(document.getElementById('mainCategory').value).toBe('장학');
    
    // 메모 영역에 가공된 원문 링크 정보 등이 결합되어 들어가 있는지 확인
    const memoValue = document.getElementById('eventMemo').value;
    expect(memoValue).toContain('메모');
    expect(memoValue).toContain('원문 링크: http://example.com');
  });

  // --------------------------------------------------------
  // [2] 카테고리 의존성 렌더링 검사 (사용자 UI 액션)
  // --------------------------------------------------------
  test('카테고리 변경 연동 - 사용자가 대분류를 변경하면 소분류 셀렉트박스의 옵션들이 새 규칙으로 다시 그려져야 한다', () => {
    const mainCategorySelect = document.getElementById('mainCategory');
    const subCategorySelect = document.getElementById('subCategory');

    // 유저가 대분류를 '학사'로 선택하는 흐름 시뮬레이션
    mainCategorySelect.value = '학사';
    // 'change' 이벤트를 발송하여 파일 내부의 renderSubCategories 핸들러 동작 유도
    mainCategorySelect.dispatchEvent(new Event('change'));

    const subOptions = Array.from(subCategorySelect.options).map(opt => opt.value);
    
    // '학사' 카테고리에 할당된 서브 카테고리 명단들이 옵션 리스트에 생성되었는지 확인
    expect(subOptions).toContain('수강');
    expect(subOptions).toContain('졸업');
    // 타 카테고리 항목(국가장학 등)은 소분류 리스트에서 완전히 배제되었는지 검증
    expect(subOptions).not.toContain('국가장학');
  });

  // --------------------------------------------------------
  // [3] 비동기 백엔드 서버 데이터 동기화 흐름 검사
  // --------------------------------------------------------
  test('서버 스케줄 로드 - 초기 구동 완료 후 백엔드 API에서 조회된 일정이 가상 달력의 성공 상태로 연동되는가', async () => {
    const mockServerData = [
      {
        id: 101,
        date: '2026-06-15T00:00:00',
        main_category: '장학',
        sub_category: '국가장학',
        title: '테스트용 장학금 공지 스케줄',
        start_date: '2026-06-15',
        end_date: '2026-06-15',
        memo: '비동기 테스트용',
        url: ''
      }
    ];

    // 백엔드 통신 응답 모킹
    global.fetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockServerData)),
        json: () => Promise.resolve(mockServerData)
      })
    );

    // 다시 스크립트를 로드하여 서버를 찌르는 라이프사이클 작동 유도
    jest.isolateModules(() => {
      require('./schedule_page.js');
    });

    // 백그라운드 비동기 마이크로태스크 큐(fetch 완료 지점)까지 완전히 수행될 때까지 안전하게 대기
    await new Promise(jest.requireActual('timers').setImmediate);

    // 데이터가 파싱 완료되어 하단 안내 텍스트가 바르게 바뀌었는지 확인
    expect(document.getElementById('statusText').textContent).toBe('스케줄을 불러왔습니다.');
  });

  // --------------------------------------------------------
  // [4] 폼 유효성 검사 및 예외 처리 가로채기 테스트
  // --------------------------------------------------------
  test('일정 등록 차단 - 사용자가 달력에서 날짜를 지정하지 않고 등록 버튼을 누르면 검증 통과를 막고 경고를 띄워야 한다', () => {
    // 내부 범위 변수 격리를 보장하기 위해 확인
    document.getElementById('eventTitle').value = '날짜 없는 부적절한 일정';
    
    const form = document.getElementById('eventForm');
    // 사용자가 폼 저장 버튼을 눌러 submit을 발생시킨 정황을 재현
    form.dispatchEvent(new Event('submit'));

    // 내부 날짜가 비어있으므로 알림창 가로채기가 선행 수행되었는지 검증
    expect(global.alert).toHaveBeenCalledWith('먼저 시작 날짜 또는 종료 날짜를 선택해 주세요.');
  });

  // --------------------------------------------------------
  // [5] 대량 삭제 기능 및 API 연동 검사
  // --------------------------------------------------------
  test('전체 일정 삭제 - 전체삭제 버튼 클릭 시 백엔드 대량 삭제를 순차 전송하고 완료 확인창을 노출해야 한다', async () => {
    // 먼저 삭제 시도를 할 가상의 대상 목록을 리턴해 주도록 fetch 모킹
    global.fetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([{ id: 50 }, { id: 51 }])
      })
    );

    const deleteAllBtn = document.getElementById('deleteAllBtn');
    // 유저가 전체 삭제 버튼을 누르는 물리 액션 전송
    deleteAllBtn.click();

    // 순차 삭제 비동기 처리가 무사히 끝날 때까지 대기
    await new Promise(jest.requireActual('timers').setImmediate);

    // 완결 문구 스크립트가 alert에 담겨 실행되었는지 검증
    expect(global.alert).toHaveBeenCalledWith(expect.stringContaining('모든 일정이 삭제되었습니다.'));
  });

  // --------------------------------------------------------
  // [6] 개인 정보 세션 폐기 및 로그아웃 라이프사이클 검사
  // --------------------------------------------------------
  test('로그아웃 사이클 - 로그아웃 실행 시 세션을 청소하고 백엔드 동기화를 정리한 뒤 login.html로 전송되어야 한다', async () => {
    // 미리 적재해 둔 모의 세션과 캐시 정보
    window.localStorage.setItem('userSession', JSON.stringify({ name: '임꺽정' }));
    window.localStorage.setItem('scheduleEvents', JSON.stringify({ '2026-06-06': [] }));

    // 대량 연동 정리를 위한 fetch 모킹
    global.fetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([{ id: 777 }])
      })
    );

    const logoutBtn = document.getElementById('logoutBtn');
    // 로그아웃을 직접 유저가 누르는 동작 트리거
    logoutBtn.click();

    // 내부 연쇄 비동기 처리 완료 대기
    await new Promise(jest.requireActual('timers').setImmediate);

    // 세션 정보가 말끔하게 증발되었는지 스토리지 조사
    expect(window.localStorage.getItem('userSession')).toBeNull();
    expect(window.localStorage.getItem('scheduleEvents')).toBeNull();
    
    // 최종적으로 로그인 창 페이지로 무사히 넘어갔는지 목적지 검증
    expect(window.location.href).toBe('login.html');
  });
});
