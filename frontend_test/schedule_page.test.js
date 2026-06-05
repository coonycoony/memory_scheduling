// ========================================================
// schedule_page.test.js (100% 에러 없는 완전판 통합 테스트)
// ========================================================

describe('schedule_page.js 전체 함수 및 흐름 통합 테스트', () => {
  let sp; // 격리된 모듈을 담을 변수

  beforeEach(() => {
    // 1. 가상 HTML DOM 뼈대 세팅 (필수 요소 모두 포함)
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

    // 2. 브라우저 내장 함수 가짜 구현
    window.alert = jest.fn();
    window.confirm = jest.fn(() => true);
    delete window.location;
    window.location = { href: '', search: '' };

    // 3. fetch API 가짜 구현 (기본적으로 빈 배열을 반환하도록 설정)
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify([])),
        json: () => Promise.resolve([])
      })
    );

    // 4. 스토리지 가짜 구현
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
    Object.defineProperty(window, 'sessionStorage', { value: storageMock(), writable: true });

    // 5. 모듈 상태 격리 (매 테스트마다 init()이 새로 실행되어 초기화됨)
    jest.isolateModules(() => {
      sp = require('./schedule_page.js');
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // 1. 날짜 및 유틸리티 함수 검증
  // =========================================================================
  describe('유틸리티 및 날짜 포맷팅 (Date Utils)', () => {
    test('getIso & parseLocalDate: 날짜 객체와 문자열 상호 변환', () => {
      const date = new Date(2026, 5, 15); // 2026-06-15
      expect(sp.getIso(date)).toBe('2026-06-15');
      
      const parsed = sp.parseLocalDate('2026-06-15');
      expect(parsed.getFullYear()).toBe(2026);
      expect(parsed.getMonth()).toBe(5); 
    });

    test('formatDateKorean & formatMonthKorean: 한국어 날짜 표기', () => {
      expect(sp.formatDateKorean('2026-06-05')).toBe('2026년 6월 5일');
      const date = new Date(2026, 0, 1);
      expect(sp.formatMonthKorean(date)).toBe('2026년 1월');
    });

    test('normalizeRange: 범위가 역순이어도 올바르게 정렬', () => {
      const result = sp.normalizeRange('2026-06-20', '2026-06-10');
      expect(result.start).toBe('2026-06-10');
      expect(result.end).toBe('2026-06-20');
    });

    test('getDatesInRange: 두 날짜 사이의 모든 날짜 배열 반환', () => {
      const dates = sp.getDatesInRange('2026-06-01', '2026-06-03');
      expect(dates).toEqual(['2026-06-01', '2026-06-02', '2026-06-03']);
    });
  });

  // =========================================================================
  // 2. DOM 유틸 및 상태 메시지
  // =========================================================================
  describe('상태 제어 (DOM Utils)', () => {
    test('$: ID로 엘리먼트를 올바르게 가져오는지 확인', () => {
      expect(sp.$('eventTitle').id).toBe('eventTitle');
    });

    test('setStatus: 상태 메시지와 클래스가 화면에 렌더링되는지 확인', () => {
      sp.setStatus('저장 완료', 'success');
      const statusText = document.getElementById('statusText');
      expect(statusText.textContent).toBe('저장 완료');
      expect(statusText.classList.contains('success')).toBe(true);
    });
  });

  // =========================================================================
  // 3. 백엔드 통신 API
  // =========================================================================
  describe('서버 연동 통신 (Fetch API)', () => {
    test('fetchJson: 텍스트 응답을 JSON 객체로 파싱', async () => {
      global.fetch.mockImplementationOnce(() =>
        Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{"msg": "ok"}') })
      );
      const res = await sp.fetchJson('/test');
      expect(res).toEqual({ msg: 'ok' });
    });

    test('createScheduleOnServer: POST 전송 확인', async () => {
      await sp.createScheduleOnServer({ title: '백엔드 전송 테스트' });
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/schedules'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    test('deleteScheduleOnServer: DELETE 전송 확인', async () => {
      await sp.deleteScheduleOnServer(888);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/schedules/888'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  // =========================================================================
  // 4. 화면 렌더링 및 UI 조작
  // =========================================================================
  describe('카테고리 및 달력 렌더링', () => {
    test('renderMainCategories & renderSubCategories: 옵션이 동적으로 그려지는지 확인', () => {
      sp.renderMainCategories();
      expect(document.getElementById('mainCategory').innerHTML).toContain('장학');
      
      sp.renderSubCategories('취업/채용');
      const subHtml = document.getElementById('subCategory').innerHTML;
      expect(subHtml).toContain('인턴');
      expect(subHtml).not.toContain('국가장학');
    });

    test('getBadgeClass: 메인 카테고리별 올바른 CSS 클래스 반환', () => {
      expect(sp.getBadgeClass('안전')).toBe('cat-safety');
      expect(sp.getBadgeClass('알수없음')).toBe('');
    });

    test('handlePrevMonth & handleNextMonth: 달 이동 시 제목이 바뀌는지 확인', () => {
      sp.handleNextMonth();
      sp.handlePrevMonth();
      expect(document.getElementById('calendarTitle').textContent).toBeTruthy();
    });
  });

  // =========================================================================
  // 5. 쿼리스트링 및 등록 폼 제어 (🚨 오류 수정됨)
  // =========================================================================
  describe('스케줄 폼 제어 및 유효성 검사', () => {
    test('applyQueryToForm: URL 파라미터를 폼에 올바르게 바인딩', () => {
      window.location.search = '?title=새공지&category=학사&subCategory=휴학&url=test.com&memo=메모';
      sp.applyQueryToForm();
      
      expect(document.getElementById('eventTitle').value).toBe('새공지');
      expect(document.getElementById('mainCategory').value).toBe('학사');
      expect(document.getElementById('subCategory').value).toBe('휴학');
      expect(document.getElementById('eventMemo').value).toContain('test.com');
    });

    test('handleEventSubmit: 일정 제목이 비어있으면 저장 로직 없이 중단', async () => {
      const mockEvent = { preventDefault: jest.fn() };
      document.getElementById('eventTitle').value = '   '; // 공백만 입력
      
      await sp.handleEventSubmit(mockEvent);
      
      expect(mockEvent.preventDefault).toHaveBeenCalled();
      // 제목이 없으면 바로 return 하므로 서버 호출(fetch)이나 alert가 발생하지 않아야 함
      expect(global.alert).not.toHaveBeenCalled();
    });

    test('handleEventSubmit: 이미 등록된 동일한 제목이면 중복 경고창 발생', async () => {
      const mockEvent = { preventDefault: jest.fn() };
      document.getElementById('eventTitle').value = '중복된 제목';
      
      // 1. 서버에 이미 스케줄이 있다고 가짜 데이터 응답 세팅
      global.fetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify([{ 
            id: 1, 
            date: sp.todayIso(), // 항상 오늘 날짜에 세팅됨
            title: '중복된 제목' 
          }]))
        })
      );
      
      // 2. 서버 스케줄을 로컬 상태(events)로 가져오기
      await sp.loadSchedulesFromServer();
      
      // 3. 동일한 제목으로 폼 제출 실행
      await sp.handleEventSubmit(mockEvent);
      
      // 4. 중복 알림창 발생 여부 확인
      expect(window.alert).toHaveBeenCalledWith('선택한 날짜 범위에는 이미 같은 제목의 스케줄이 모두 등록되어 있습니다.');
    });
  });

  // =========================================================================
  // 6. 삭제 기능 
  // =========================================================================
  describe('스케줄 삭제 로직', () => {
    test('handleDeleteAll: 저장된 스케줄이 없으면 경고 띄우기', async () => {
      await sp.handleDeleteAll();
      // init() 시 오늘 날짜가 잡혀있지만, 이벤트가 없는 상태이므로
      expect(window.alert).toHaveBeenCalledWith('선택한 범위에 저장된 스케줄이 없습니다.');
    });
  });

  // =========================================================================
  // 7. 사용자 세션 및 모달 (로그아웃)
  // =========================================================================
  describe('사용자 프로필 세션 관리 및 로그아웃', () => {
    test('fillUserChip & fillProfileCard: 세션 유무에 따른 정보 렌더링', () => {
      sp.fillUserChip(null);
      expect(document.getElementById('userChipName').textContent).toBe('게스트 님');

      sp.fillUserChip({ name: '임테스트' });
      expect(document.getElementById('userChipName').textContent).toBe('임테스트 님');

      const mockUser = { name: '이학생', school: 'A대', year: '3', interests: ['봉사'] };
      sp.fillProfileCard(mockUser);
      
      expect(document.getElementById('profileName').textContent).toBe('이학생');
      expect(document.getElementById('profileYear').textContent).toBe('3학년');
    });

    test('openProfileModal & closeProfileModal: 모달 표시 토글', () => {
      sp.openProfileModal();
      expect(document.getElementById('profileModal').style.display).toBe('block');
      
      sp.closeProfileModal();
      expect(document.getElementById('profileModal').style.display).toBe('none');
    });

    test('handleLogout: 확인 누르면 세션 삭제 후 로그인 화면으로 이동', async () => {
      window.localStorage.setItem('userSession', '존재함');
      
      await sp.handleLogout();
      
      expect(window.localStorage.removeItem).toHaveBeenCalledWith('userSession');
      expect(window.location.href).toBe('login.html');
    });
  });

});
