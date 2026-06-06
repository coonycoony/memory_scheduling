// ========================================================
// schedule_page.test.js — schedule_page.js 커버리지 극대화 통합 테스트
// ========================================================

describe('schedule_page.js 전체 함수 및 흐름 통합 테스트', () => {
  let sp;

  beforeEach(() => {
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
    Object.defineProperty(window, 'sessionStorage', { value: storageMock(), writable: true });

    jest.isolateModules(() => {
      sp = require('./schedule_page.js');
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // 1. 날짜 유틸리티
  // =========================================================================
  describe('날짜 유틸리티 (Date Utils)', () => {
    test('getIso: Date 객체를 YYYY-MM-DD 문자열로 변환', () => {
      expect(sp.getIso(new Date(2026, 5, 15))).toBe('2026-06-15');
    });

    test('getIso: 한 자리 월/일도 0 패딩 처리', () => {
      expect(sp.getIso(new Date(2026, 0, 5))).toBe('2026-01-05');
    });

    test('parseLocalDate: YYYY-MM-DD 문자열을 로컬 Date 객체로 파싱', () => {
      const d = sp.parseLocalDate('2026-06-15');
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(5);
      expect(d.getDate()).toBe(15);
    });

    test('todayIso: YYYY-MM-DD 형식 반환', () => {
      expect(sp.todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test('formatDateKorean: 날짜 문자열을 한국어 표기로 변환', () => {
      expect(sp.formatDateKorean('2026-06-05')).toBe('2026년 6월 5일');
      expect(sp.formatDateKorean('2026-01-01')).toBe('2026년 1월 1일');
    });

    test('formatMonthKorean: Date 객체를 "YYYY년 M월" 형식으로 변환', () => {
      expect(sp.formatMonthKorean(new Date(2026, 0, 1))).toBe('2026년 1월');
      expect(sp.formatMonthKorean(new Date(2026, 11, 1))).toBe('2026년 12월');
    });

    test('normalizeRange: 올바른 순서는 그대로 반환', () => {
      const r = sp.normalizeRange('2026-06-01', '2026-06-10');
      expect(r.start).toBe('2026-06-01');
      expect(r.end).toBe('2026-06-10');
    });

    test('normalizeRange: 역순이면 뒤집어 반환', () => {
      const r = sp.normalizeRange('2026-06-20', '2026-06-10');
      expect(r.start).toBe('2026-06-10');
      expect(r.end).toBe('2026-06-20');
    });

    test('normalizeRange: 한쪽이 null이면 그대로 반환', () => {
      const r = sp.normalizeRange(null, '2026-06-10');
      expect(r.start).toBeNull();
      expect(r.end).toBe('2026-06-10');
    });

    test('getDatesInRange: 두 날짜 사이 모든 날짜 반환', () => {
      expect(sp.getDatesInRange('2026-06-01', '2026-06-03'))
        .toEqual(['2026-06-01', '2026-06-02', '2026-06-03']);
    });

    test('getDatesInRange: 같은 날짜면 하나만 반환', () => {
      expect(sp.getDatesInRange('2026-06-15', '2026-06-15')).toEqual(['2026-06-15']);
    });

    test('getDatesInRange: null 입력이면 빈 배열 반환', () => {
      expect(sp.getDatesInRange(null, '2026-06-10')).toEqual([]);
      expect(sp.getDatesInRange('2026-06-10', null)).toEqual([]);
    });
  });

  // =========================================================================
  // 2. DOM 유틸 및 상태 메시지
  // =========================================================================
  describe('DOM 유틸 및 상태 메시지', () => {
    test('$: ID로 DOM 엘리먼트 반환', () => {
      expect(sp.$('eventTitle').id).toBe('eventTitle');
    });

    test('setStatus: 텍스트와 클래스 동시 적용', () => {
      sp.setStatus('저장 완료', 'success');
      const el = document.getElementById('statusText');
      expect(el.textContent).toBe('저장 완료');
      expect(el.classList.contains('success')).toBe(true);
    });

    test('setStatus: type 없이 호출하면 기본 클래스만 남음', () => {
      sp.setStatus('로딩 중');
      const el = document.getElementById('statusText');
      expect(el.className).toBe('status-text');
    });

    test('setStatus: 호출마다 이전 타입 클래스 초기화', () => {
      sp.setStatus('에러', 'error');
      sp.setStatus('완료', 'success');
      const el = document.getElementById('statusText');
      expect(el.classList.contains('success')).toBe(true);
      expect(el.classList.contains('error')).toBe(false);
    });
  });

  // =========================================================================
  // 3. 카테고리 렌더링
  // =========================================================================
  describe('카테고리 렌더링 (Category)', () => {
    test('categoryMap: 주요 카테고리가 모두 존재', () => {
      const keys = Object.keys(sp.categoryMap);
      ['장학','학사','취업/채용','안전','기타'].forEach(k => expect(keys).toContain(k));
    });

    test('renderMainCategories: 모든 카테고리가 option으로 렌더링됨', () => {
      sp.renderMainCategories();
      const html = document.getElementById('mainCategory').innerHTML;
      expect(html).toContain('장학');
      expect(html).toContain('학사');
    });

    test('renderSubCategories: 해당 카테고리의 서브만 렌더링', () => {
      sp.renderSubCategories('취업/채용');
      const html = document.getElementById('subCategory').innerHTML;
      expect(html).toContain('인턴');
      expect(html).not.toContain('국가장학');
    });

    test('renderSubCategories: 존재하지 않는 카테고리면 빈 select', () => {
      sp.renderSubCategories('없는카테고리');
      expect(document.getElementById('subCategory').innerHTML).toBe('');
    });

    test('getBadgeClass: 각 카테고리별 CSS 클래스 반환', () => {
      const map = {
        '장학': 'cat-scholarship', '학사': 'cat-academic',
        '입학/등록': 'cat-admission', '취업/채용': 'cat-career',
        '공모전/대회': 'cat-contest', '모집/봉사': 'cat-volunteer',
        '시설/행정': 'cat-facility', '안전': 'cat-safety', '기타': 'cat-etc'
      };
      Object.entries(map).forEach(([cat, cls]) => expect(sp.getBadgeClass(cat)).toBe(cls));
    });

    test('getBadgeClass: 알 수 없는 카테고리는 빈 문자열', () => {
      expect(sp.getBadgeClass('모르는것')).toBe('');
    });
  });

  // =========================================================================
  // 4. 서버 연동 API
  // =========================================================================
  describe('서버 연동 (Fetch API)', () => {
    test('fetchJson: 텍스트 응답을 JSON으로 파싱', async () => {
      global.fetch.mockImplementationOnce(() =>
        Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{"msg":"ok"}') })
      );
      expect(await sp.fetchJson('/test')).toEqual({ msg: 'ok' });
    });

    test('fetchJson: 빈 응답이면 null 반환', async () => {
      global.fetch.mockImplementationOnce(() =>
        Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('') })
      );
      expect(await sp.fetchJson('/test')).toBeNull();
    });

    test('fetchJson: ok가 아니면 에러 throw', async () => {
      global.fetch.mockImplementationOnce(() =>
        Promise.resolve({ ok: false, status: 500 })
      );
      await expect(sp.fetchJson('/fail')).rejects.toThrow('요청 실패: 500');
    });

    test('createScheduleOnServer: POST 요청 + Content-Type 헤더 확인', async () => {
      await sp.createScheduleOnServer({ title: '테스트' });
      const postCall = global.fetch.mock.calls.find(c => c[1]?.method === 'POST');
      expect(postCall).toBeTruthy();
      expect(postCall[1].headers['Content-Type']).toBe('application/json');
    });

    test('deleteScheduleOnServer: /schedules/{id}로 DELETE 요청', async () => {
      await sp.deleteScheduleOnServer(888);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/schedules/888'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    test('loadSchedulesFromServer: 서버 데이터를 events에 날짜별 저장', async () => {
      global.fetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true, status: 200,
          text: () => Promise.resolve(JSON.stringify([
            { id: 1, date: '2026-06-15', title: '서버공지', main_category: '학사',
              sub_category: '수강', start_date: null, end_date: null, memo: '', url: '' }
          ]))
        })
      );
      await sp.loadSchedulesFromServer();
      expect(sp.isDuplicateEventOnDate('2026-06-15', '서버공지')).toBe(true);
    });

    test('loadSchedulesFromServer: 서버 에러 시 에러 상태 메시지 표시', async () => {
      global.fetch.mockImplementationOnce(() => Promise.reject(new Error('Network Error')));
      await sp.loadSchedulesFromServer();
      expect(document.getElementById('statusText').textContent)
        .toContain('불러오지 못했습니다');
    });

    // ── deleteRangeUsingSingleDelete ──────────────────────────────────────
    test('deleteRangeUsingSingleDelete: 해당 범위 스케줄 DELETE 요청 전송', async () => {
      // 먼저 이벤트 로드
      global.fetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true, status: 200,
          text: () => Promise.resolve(JSON.stringify([
            { id: 7, date: '2026-06-10', title: '범위삭제테스트', main_category: '기타',
              sub_category: '기타', start_date: null, end_date: null, memo: '', url: '' }
          ]))
        })
      );
      await sp.loadSchedulesFromServer();

      global.fetch.mockImplementation(() =>
        Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('') })
      );

      await sp.deleteRangeUsingSingleDelete('2026-06-10', '2026-06-10');

      const deleteCalls = global.fetch.mock.calls.filter(c => c[1]?.method === 'DELETE');
      expect(deleteCalls.length).toBeGreaterThan(0);
    });

    test('deleteRangeUsingSingleDelete: 범위 내 스케줄 없으면 상태 메시지만 표시', async () => {
      await sp.deleteRangeUsingSingleDelete('2030-01-01', '2030-01-03');
      expect(document.getElementById('statusText').textContent)
        .toContain('삭제할 스케줄이 없습니다');
    });

    test('deleteRangeUsingSingleDelete: 삭제 서버 에러 시 콘솔 에러만 출력(계속 진행)', async () => {
      global.fetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true, status: 200,
          text: () => Promise.resolve(JSON.stringify([
            { id: 55, date: sp.todayIso(), title: '에러테스트', main_category: '기타',
              sub_category: '기타', start_date: null, end_date: null, memo: '', url: '' }
          ]))
        })
      );
      await sp.loadSchedulesFromServer();

      global.fetch.mockImplementation(() => Promise.reject(new Error('Delete Failed')));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      await sp.deleteRangeUsingSingleDelete(sp.todayIso(), sp.todayIso());
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    // ── deleteAllSchedulesOnServer ────────────────────────────────────────
    test('deleteAllSchedulesOnServer: 서버에서 목록 조회 후 각 id로 DELETE 요청', async () => {
      global.fetch
        .mockImplementationOnce(() =>
          Promise.resolve({
            ok: true, status: 200,
            json: () => Promise.resolve([{ id: 1 }, { id: 2 }]),
            text: () => Promise.resolve(JSON.stringify([{ id: 1 }, { id: 2 }]))
          })
        )
        .mockImplementation(() =>
          Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('') })
        );

      await sp.deleteAllSchedulesOnServer();

      const deleteCalls = global.fetch.mock.calls.filter(c => c[1]?.method === 'DELETE');
      expect(deleteCalls.length).toBe(2);
    });

    test('deleteAllSchedulesOnServer: 목록 조회 실패(ok=false)면 DELETE 요청 안 함', async () => {
      global.fetch.mockImplementationOnce(() =>
        Promise.resolve({ ok: false, status: 500 })
      );
      await sp.deleteAllSchedulesOnServer();
      const deleteCalls = global.fetch.mock.calls.filter(c => c[1]?.method === 'DELETE');
      expect(deleteCalls.length).toBe(0);
    });

    test('deleteAllSchedulesOnServer: 네트워크 에러 시 catch로 처리됨', async () => {
      global.fetch.mockImplementationOnce(() => Promise.reject(new Error('Network')));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      await sp.deleteAllSchedulesOnServer(); // throw 없이 정상 종료
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test('deleteAllSchedulesOnServer: 개별 DELETE 실패 시 .catch 처리됨 (line 747)', async () => {
      // 목록 조회는 성공, 개별 DELETE는 reject
      global.fetch
        .mockImplementationOnce(() =>
          Promise.resolve({
            ok: true, status: 200,
            json: () => Promise.resolve([{ id: 10 }, { id: 11 }]),
            text: () => Promise.resolve(JSON.stringify([{ id: 10 }, { id: 11 }]))
          })
        )
        .mockImplementation(() => Promise.reject(new Error('개별삭제실패')));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      await sp.deleteAllSchedulesOnServer(); // 개별 실패해도 전체 throw 없어야 함
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  // =========================================================================
  // 5. 달력 렌더링 및 월 이동
  // =========================================================================
  describe('달력 렌더링 및 월 이동', () => {
    test('renderCalendar: 42개 셀 렌더링', () => {
      sp.renderCalendar();
      expect(document.getElementById('calendarGrid').children.length).toBe(42);
    });

    test('renderCalendar: calendarTitle에 "YYYY년 M월" 표시', () => {
      sp.renderCalendar();
      expect(document.getElementById('calendarTitle').textContent).toMatch(/\d{4}년 \d+월/);
    });

    test('handleNextMonth → handlePrevMonth: 원래 달로 복귀', () => {
      const before = document.getElementById('calendarTitle').textContent;
      sp.handleNextMonth();
      sp.handlePrevMonth();
      expect(document.getElementById('calendarTitle').textContent).toBe(before);
    });

    // ── createDayCell 달력 셀 클릭 — 커버리지 504-520 ─────────────────────
    test('createDayCell 클릭: rangeStart 없을 때 클릭하면 rangeStart 설정', () => {
      sp.renderCalendar();
      const cells = document.getElementById('calendarGrid').querySelectorAll('.calendar-day');
      // 현재 달의 셀 중 muted 아닌 것 클릭
      const nonMuted = Array.from(cells).find(c => !c.classList.contains('muted'));
      nonMuted.click();
      // 클릭 후 selectedDateBox가 업데이트 되어야 함
      expect(document.querySelector('.selected-date').textContent).toMatch(/년/);
    });

    test('createDayCell 클릭: rangeStart 있고 rangeEnd 없을 때 두 번째 클릭으로 범위 확정', () => {
      sp.renderCalendar();
      const cells = Array.from(
        document.getElementById('calendarGrid').querySelectorAll('.calendar-day')
      ).filter(c => !c.classList.contains('muted'));

      cells[0].click(); // 첫 번째 클릭 → rangeStart
      cells[4].click(); // 두 번째 클릭 → rangeEnd 확정
      expect(document.querySelector('.selected-date').textContent).toContain('~');
    });

    test('createDayCell 클릭: rangeStart & rangeEnd 모두 있을 때 클릭하면 새 rangeStart로 리셋', () => {
      sp.renderCalendar();
      const cells = Array.from(
        document.getElementById('calendarGrid').querySelectorAll('.calendar-day')
      ).filter(c => !c.classList.contains('muted'));

      cells[0].click();
      cells[4].click(); // 범위 확정
      cells[1].click(); // 새 시작점으로 리셋

      // "~" 없이 단일 날짜만 표시되어야 함
      const text = document.querySelector('.selected-date').textContent;
      expect(text).not.toContain('~');
    });

    test('createDayCell: 7개 초과 이벤트 있으면 "+N" 더보기 배지 렌더링', async () => {
      // 오늘 날짜에 8개 이벤트 세팅
      const today = sp.todayIso();
      const manyEvents = Array.from({ length: 8 }, (_, i) => ({
        id: i + 1, date: today, title: `이벤트${i + 1}`,
        main_category: '기타', sub_category: '기타',
        start_date: null, end_date: null, memo: '', url: ''
      }));
      global.fetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true, status: 200,
          text: () => Promise.resolve(JSON.stringify(manyEvents))
        })
      );
      await sp.loadSchedulesFromServer();
      sp.renderCalendar();
      expect(document.getElementById('calendarGrid').innerHTML).toContain('+2');
    });
  });

  // =========================================================================
  // 6. updateSelectedDateUI 분기 커버 (428-436)
  // =========================================================================
  describe('updateSelectedDateUI: 날짜 표시 분기', () => {
    test('rangeStart & rangeEnd 모두 있으면 "시작 ~ 종료" 표시', () => {
      sp.syncRangeFromInputs(); // 기본 초기화
      document.getElementById('startDate').value = '2026-06-01';
      document.getElementById('endDate').value   = '2026-06-05';
      sp.syncRangeFromInputs();
      expect(document.querySelector('.selected-date').textContent).toContain('~');
    });

    test('rangeStart만 있으면 "시작 날짜 선택됨" 표시', () => {
      document.getElementById('startDate').value = '2026-06-10';
      document.getElementById('endDate').value   = '';
      sp.syncRangeFromInputs();
      expect(document.querySelector('.selected-date').textContent).toContain('시작 날짜 선택됨');
    });
  });

  // =========================================================================
  // 7. syncRangeFromInputs 분기 커버
  // =========================================================================
  describe('syncRangeFromInputs: 입력 필드 → 상태 동기화', () => {
    test('start, end 둘 다 있을 때 rangeStart/rangeEnd 정규화 적용', () => {
      document.getElementById('startDate').value = '2026-06-20';
      document.getElementById('endDate').value   = '2026-06-10';
      sp.syncRangeFromInputs();
      // 역순도 normalizeRange로 정렬됨
      expect(document.querySelector('.selected-date').textContent).toContain('~');
    });

    test('end만 있을 때도 selectedDate 업데이트됨', () => {
      document.getElementById('startDate').value = '';
      document.getElementById('endDate').value   = '2026-07-01';
      sp.syncRangeFromInputs();
      expect(document.querySelector('.selected-date').textContent).toContain('2026년');
    });

    test('start, end 둘 다 없으면 에러 없이 실행됨', () => {
      document.getElementById('startDate').value = '';
      document.getElementById('endDate').value   = '';
      expect(() => sp.syncRangeFromInputs()).not.toThrow();
    });
  });

  // ── updateSelectedDateUI line 436: selectedDate도 없는 분기 커버 ──────────
  describe('updateSelectedDateUI: selectedDate null 분기 (line 436)', () => {
    test('selected-date 엘리먼트 없어도 updateSelectedDateUI가 크래시 없이 early return (line 425)', () => {
      document.querySelector('.selected-date').remove();
      expect(() => sp.updateSelectedDateUI()).not.toThrow();
    });
  });

  // =========================================================================
  // 8. syncDateInputsFromRange 분기 커버
  // =========================================================================
  describe('syncDateInputsFromRange: 상태 → 입력 필드 동기화', () => {
    test('rangeStart & rangeEnd 있으면 두 인풋 모두 채워짐', () => {
      document.getElementById('startDate').value = '2026-06-01';
      document.getElementById('endDate').value   = '2026-06-05';
      sp.syncRangeFromInputs();  // 내부 상태 세팅
      sp.syncDateInputsFromRange();
      expect(document.getElementById('startDate').value).toBe('2026-06-01');
      expect(document.getElementById('endDate').value).toBe('2026-06-05');
    });

    test('rangeStart만 있으면 startDate만 채워지고 endDate는 빔', () => {
      document.getElementById('startDate').value = '2026-06-10';
      document.getElementById('endDate').value   = '';
      sp.syncRangeFromInputs();
      sp.syncDateInputsFromRange();
      expect(document.getElementById('startDate').value).toBe('2026-06-10');
      expect(document.getElementById('endDate').value).toBe('');
    });

    test('둘 다 없으면 두 인풋 모두 비워짐', () => {
      document.getElementById('startDate').value = '';
      document.getElementById('endDate').value   = '';
      sp.syncRangeFromInputs();
      sp.syncDateInputsFromRange();
      expect(document.getElementById('startDate').value).toBe('');
      expect(document.getElementById('endDate').value).toBe('');
    });
  });

  // =========================================================================
  // 9. isDateInSelectedRange / getCurrentTargetDates
  // =========================================================================
  describe('날짜 범위 유틸', () => {
    test('isDateInSelectedRange: rangeStart 없으면 항상 false', () => {
      expect(sp.isDateInSelectedRange('2026-06-15')).toBe(false);
    });

    test('isDateInSelectedRange: rangeStart만 있을 때 같은 날짜만 true', () => {
      document.getElementById('startDate').value = '2026-06-15';
      document.getElementById('endDate').value   = '';
      sp.syncRangeFromInputs();
      expect(sp.isDateInSelectedRange('2026-06-15')).toBe(true);
      expect(sp.isDateInSelectedRange('2026-06-16')).toBe(false);
    });

    test('isDateInSelectedRange: 범위 안에 있으면 true', () => {
      document.getElementById('startDate').value = '2026-06-10';
      document.getElementById('endDate').value   = '2026-06-20';
      sp.syncRangeFromInputs();
      expect(sp.isDateInSelectedRange('2026-06-15')).toBe(true);
      expect(sp.isDateInSelectedRange('2026-06-09')).toBe(false);
    });

    test('getCurrentTargetDates: init() 이후 오늘 날짜 반환', () => {
      const dates = sp.getCurrentTargetDates();
      expect(dates.length).toBeGreaterThanOrEqual(1);
    });

    test('getCurrentTargetDates: rangeStart & rangeEnd 있으면 범위 전체 반환', () => {
      document.getElementById('startDate').value = '2026-06-01';
      document.getElementById('endDate').value   = '2026-06-03';
      sp.syncRangeFromInputs();
      expect(sp.getCurrentTargetDates()).toEqual(['2026-06-01', '2026-06-02', '2026-06-03']);
    });
  });

  // =========================================================================
  // 10. applyQueryToForm
  // =========================================================================
  describe('applyQueryToForm: URL 쿼리 → 폼 바인딩', () => {
    test('title, category, subCategory, url, memo 파라미터 적용', () => {
      window.location.search = '?title=장학공고&category=장학&subCategory=국가장학&url=https://test.com&memo=확인요망';
      sp.applyQueryToForm();
      expect(document.getElementById('eventTitle').value).toBe('장학공고');
      expect(document.getElementById('mainCategory').value).toBe('장학');
      expect(document.getElementById('subCategory').value).toBe('국가장학');
      expect(document.getElementById('eventMemo').value).toContain('확인요망');
      expect(document.getElementById('eventMemo').value).toContain('https://test.com');
    });

    test('url만 있으면 메모에 "원문 링크: URL" 형태로 포함', () => {
      window.location.search = '?url=https://school.ac.kr/notice';
      sp.applyQueryToForm();
      expect(document.getElementById('eventMemo').value)
        .toContain('원문 링크: https://school.ac.kr/notice');
    });

    test('존재하지 않는 카테고리 입력 시 크래시 없이 실행', () => {
      window.location.search = '?category=없는카테고리';
      expect(() => sp.applyQueryToForm()).not.toThrow();
    });

    test('쿼리 파라미터 없으면 폼 변경 없음', () => {
      window.location.search = '';
      sp.applyQueryToForm();
      expect(document.getElementById('eventTitle').value).toBe('');
    });
  });

  // =========================================================================
  // 11. handleMainCategoryChange (line 562)
  // =========================================================================
  describe('handleMainCategoryChange', () => {
    test('mainCategory 변경 시 subCategory 옵션 재렌더링', () => {
      sp.renderMainCategories();
      document.getElementById('mainCategory').value = '안전';
      sp.handleMainCategoryChange();
      const html = document.getElementById('subCategory').innerHTML;
      expect(html).toContain('안전');
    });
  });

  // =========================================================================
  // 12. handleEventSubmit
  // =========================================================================
  describe('handleEventSubmit', () => {
    test('빈 제목이면 서버 요청 없이 return', async () => {
      const e = { preventDefault: jest.fn() };
      document.getElementById('eventTitle').value = '   ';
      await sp.handleEventSubmit(e);
      expect(e.preventDefault).toHaveBeenCalled();
      expect(global.fetch.mock.calls.filter(c => c[1]?.method === 'POST').length).toBe(0);
    });

    test('targetDates가 없으면 "날짜를 선택해 주세요" alert 발생 (line 579-580)', async () => {
      // handleEventSubmit 내부에서 module.exports.getCurrentTargetDates()를 통해 호출하므로
      // spy 교체가 정상 반영됨 (수정된 schedule_page.js 기준)
      const e = { preventDefault: jest.fn() };
      document.getElementById('eventTitle').value = '날짜없는일정';

      const origGet = sp.getCurrentTargetDates;
      sp.getCurrentTargetDates = jest.fn(() => []);

      await sp.handleEventSubmit(e);

      expect(window.alert).toHaveBeenCalledWith('먼저 시작 날짜 또는 종료 날짜를 선택해 주세요.');
      // alert 이후 서버 POST 요청 없어야 함
      expect(global.fetch.mock.calls.filter(c => c[1]?.method === 'POST').length).toBe(0);

      sp.getCurrentTargetDates = origGet; // 복원
    });

    test('중복 제목이면 alert 발생 후 저장 안 함 (line 589-591)', async () => {
      const e = { preventDefault: jest.fn() };
      document.getElementById('eventTitle').value = '중복된 제목';

      global.fetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true, status: 200,
          text: () => Promise.resolve(JSON.stringify([{
            id: 1, date: sp.todayIso(), title: '중복된 제목',
            main_category: '학사', sub_category: '수강',
            start_date: null, end_date: null, memo: '', url: ''
          }]))
        })
      );
      await sp.loadSchedulesFromServer();

      global.fetch.mockClear();
      global.fetch.mockImplementation(() =>
        Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('[]') })
      );

      await sp.handleEventSubmit(e);
      expect(window.alert).toHaveBeenCalledWith(
        '선택한 날짜 범위에는 이미 같은 제목의 스케줄이 모두 등록되어 있습니다.'
      );
      expect(global.fetch.mock.calls.filter(c => c[1]?.method === 'POST').length).toBe(0);
    });

    test('정상 제출 시 createScheduleOnServer 호출 후 폼 초기화 (line 598-616)', async () => {
      const e = { preventDefault: jest.fn() };
      document.getElementById('eventTitle').value = '새 일정';
      document.getElementById('startDate').value  = sp.todayIso();
      sp.syncRangeFromInputs();

      global.fetch.mockImplementation(() =>
        Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('[]') })
      );

      await sp.handleEventSubmit(e);

      const postCalls = global.fetch.mock.calls.filter(c => c[1]?.method === 'POST');
      expect(postCalls.length).toBeGreaterThan(0);
      expect(document.getElementById('eventTitle').value).toBe('');
    });

    test('서버 저장 실패 시 에러 상태 메시지 표시 (line 618-619)', async () => {
      const e = { preventDefault: jest.fn() };
      document.getElementById('eventTitle').value = '에러유발일정';
      document.getElementById('startDate').value  = sp.todayIso();
      sp.syncRangeFromInputs();

      // POST 요청만 실패, GET(loadSchedules)은 성공
      global.fetch.mockImplementation((url, options) => {
        if (options && options.method === 'POST') {
          return Promise.reject(new Error('Save Failed'));
        }
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('[]') });
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      await sp.handleEventSubmit(e);
      consoleSpy.mockRestore();

      expect(document.getElementById('statusText').textContent)
        .toContain('오류가 발생했습니다');
    });
  });

  // =========================================================================
  // 13. handleDeleteAll
  // =========================================================================
  describe('handleDeleteAll', () => {
    test('targetDates가 빈 배열이면 "날짜를 선택해 주세요" alert (line 628-629)', async () => {
      // hasAnyEvent 계산이 !targetDates.length 체크 이후로 이동되어
      // 빈 배열일 때 올바른 메시지가 먼저 표시됨 (수정된 schedule_page.js 기준)
      const origGet = sp.getCurrentTargetDates;
      sp.getCurrentTargetDates = jest.fn(() => []);

      await sp.handleDeleteAll();

      expect(window.alert).toHaveBeenCalledWith('먼저 삭제할 날짜(또는 날짜 범위)를 선택해 주세요.');
      // "저장된 스케줄이 없습니다" alert은 호출되지 않아야 함
      expect(window.alert).not.toHaveBeenCalledWith('선택한 범위에 저장된 스케줄이 없습니다.');
      sp.getCurrentTargetDates = origGet;
    });

    test('스케줄 없으면 "저장된 스케줄이 없습니다" alert', async () => {
      await sp.handleDeleteAll();
      expect(window.alert).toHaveBeenCalledWith('선택한 범위에 저장된 스케줄이 없습니다.');
    });

    test('confirm 동의 시 deleteScheduleOnServer 호출 (line 642-645)', async () => {
      global.fetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true, status: 200,
          text: () => Promise.resolve(JSON.stringify([{
            id: 42, date: sp.todayIso(), title: '삭제테스트',
            main_category: '기타', sub_category: '기타',
            start_date: null, end_date: null, memo: '', url: ''
          }]))
        })
      );
      await sp.loadSchedulesFromServer();

      global.fetch.mockImplementation(() =>
        Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('') })
      );
      window.confirm.mockReturnValue(true);
      await sp.handleDeleteAll();

      expect(global.fetch.mock.calls.filter(c => c[1]?.method === 'DELETE').length)
        .toBeGreaterThan(0);
    });

    test('confirm 거부 시 삭제 요청 없음', async () => {
      global.fetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true, status: 200,
          text: () => Promise.resolve(JSON.stringify([{
            id: 10, date: sp.todayIso(), title: '취소테스트',
            main_category: '기타', sub_category: '기타',
            start_date: null, end_date: null, memo: '', url: ''
          }]))
        })
      );
      await sp.loadSchedulesFromServer();

      global.fetch.mockClear();
      window.confirm.mockReturnValue(false);
      await sp.handleDeleteAll();

      expect(global.fetch.mock.calls.filter(c => c[1]?.method === 'DELETE').length).toBe(0);
    });

    test('deleteRangeUsingSingleDelete 자체가 throw 시 handleDeleteAll catch 동작 (line 647-648)', async () => {
      // handleDeleteAll 내부에서 module.exports.deleteRangeUsingSingleDelete를 통해 호출하므로
      // spy의 reject가 catch 블록에 정상 전달됨 (수정된 schedule_page.js 기준)
      global.fetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true, status: 200,
          text: () => Promise.resolve(JSON.stringify([{
            id: 99, date: sp.todayIso(), title: '에러삭제',
            main_category: '기타', sub_category: '기타',
            start_date: null, end_date: null, memo: '', url: ''
          }]))
        })
      );
      await sp.loadSchedulesFromServer();

      // deleteRangeUsingSingleDelete를 강제로 reject하는 spy로 교체
      const origDel = sp.deleteRangeUsingSingleDelete;
      sp.deleteRangeUsingSingleDelete = jest.fn(() => Promise.reject(new Error('범위삭제실패')));
      window.confirm.mockReturnValue(true);

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      await sp.handleDeleteAll();
      consoleSpy.mockRestore();

      expect(document.getElementById('statusText').textContent)
        .toContain('오류가 발생했습니다');

      sp.deleteRangeUsingSingleDelete = origDel;
    });
  });

  // =========================================================================
  // 14. renderEventList — 삭제 버튼 클릭 (line 397-416)
  // =========================================================================
  describe('renderEventList 삭제 버튼', () => {
    beforeEach(async () => {
      global.fetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true, status: 200,
          text: () => Promise.resolve(JSON.stringify([{
            id: 3, date: sp.todayIso(), title: '삭제버튼테스트',
            main_category: '학사', sub_category: '수강',
            start_date: null, end_date: null, memo: '메모', url: 'https://test.com'
          }]))
        })
      );
      await sp.loadSchedulesFromServer();
      sp.renderEventList();
    });

    test('이벤트 있으면 제목이 목록에 렌더링됨', () => {
      expect(document.getElementById('eventList').innerHTML).toContain('삭제버튼테스트');
    });

    test('삭제 버튼 클릭 + confirm 동의 시 DELETE 요청', async () => {
      global.fetch.mockImplementation(() =>
        Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('') })
      );
      window.confirm.mockReturnValue(true);

      const deleteBtn = document.querySelector('#eventList .btn-secondary');
      deleteBtn.click();
      await new Promise(r => setTimeout(r, 50));

      const deleteCalls = global.fetch.mock.calls.filter(c => c[1]?.method === 'DELETE');
      expect(deleteCalls.length).toBeGreaterThan(0);
    });

    test('삭제 버튼 클릭 + confirm 거부 시 DELETE 요청 없음', async () => {
      global.fetch.mockClear();
      window.confirm.mockReturnValue(false);

      const deleteBtn = document.querySelector('#eventList .btn-secondary');
      deleteBtn.click();
      await new Promise(r => setTimeout(r, 50));

      const deleteCalls = global.fetch.mock.calls.filter(c => c[1]?.method === 'DELETE');
      expect(deleteCalls.length).toBe(0);
    });

    test('삭제 버튼 클릭 + 서버 에러 시 에러 상태 메시지 (line 413-415)', async () => {
      global.fetch.mockImplementation(() => Promise.reject(new Error('삭제실패')));
      window.confirm.mockReturnValue(true);

      const deleteBtn = document.querySelector('#eventList .btn-secondary');
      deleteBtn.click();
      await new Promise(r => setTimeout(r, 50));

      expect(document.getElementById('statusText').textContent)
        .toContain('오류가 발생했습니다');
    });
  });

  // =========================================================================
  // 15. 이벤트 목록 없음 메시지
  // =========================================================================
  describe('renderEventList 빈 상태', () => {
    test('이벤트 없는 날짜는 빈 상태 메시지 표시', () => {
      sp.renderEventList();
      expect(document.getElementById('eventList').innerHTML)
        .toContain('이 날짜에는 저장된 스케줄이 없습니다.');
    });
  });

  // =========================================================================
  // 16. 사용자 세션 및 프로필
  // =========================================================================
  describe('사용자 세션 및 프로필 (User Session)', () => {
    test('loadUserSession: 유효한 JSON → 파싱 반환', () => {
      window.localStorage.getItem.mockReturnValueOnce(JSON.stringify({ name: '이학생' }));
      expect(sp.loadUserSession().name).toBe('이학생');
    });

    test('loadUserSession: null → null 반환', () => {
      window.localStorage.getItem.mockReturnValueOnce(null);
      expect(sp.loadUserSession()).toBeNull();
    });

    test('loadUserSession: 잘못된 JSON → null 반환', () => {
      window.localStorage.getItem.mockReturnValueOnce('invalid{json');
      expect(sp.loadUserSession()).toBeNull();
    });

    test('fillUserChip: null → "게스트 님"', () => {
      sp.fillUserChip(null);
      expect(document.getElementById('userChipName').textContent).toBe('게스트 님');
    });

    test('fillUserChip: name 있으면 "이름 님"', () => {
      sp.fillUserChip({ name: '임테스트' });
      expect(document.getElementById('userChipName').textContent).toBe('임테스트 님');
    });

    test('fillUserChip: name 없으면 "사용자 님"', () => {
      sp.fillUserChip({});
      expect(document.getElementById('userChipName').textContent).toBe('사용자 님');
    });

    test('fillProfileCard: 전체 정보 렌더링', () => {
      sp.fillProfileCard({ name: '이학생', school: 'A대', major: '컴공', year: '3', interests: ['봉사'] });
      expect(document.getElementById('profileName').textContent).toBe('이학생');
      expect(document.getElementById('profileSchool').textContent).toBe('A대');
      expect(document.getElementById('profileMajor').textContent).toBe('컴공');
      expect(document.getElementById('profileYear').textContent).toBe('3학년');
    });

    test('fillProfileCard: year="4" → "4학년 이상"', () => {
      sp.fillProfileCard({ year: '4' });
      expect(document.getElementById('profileYear').textContent).toBe('4학년 이상');
    });

    test('fillProfileCard: year 없으면 profileYear 빈 문자열', () => {
      sp.fillProfileCard({ name: '테스트' });
      expect(document.getElementById('profileYear').textContent).toBe('');
    });

    test('fillProfileCard: interests 있으면 태그 pill 렌더링', () => {
      sp.fillProfileCard({ interests: ['봉사', '취업'] });
      expect(document.getElementById('profileTags').querySelectorAll('.profile-tag-pill').length).toBe(2);
    });

    test('fillProfileCard: interests 없으면 "관심 분야 없음" 표시', () => {
      sp.fillProfileCard({ interests: [] });
      expect(document.getElementById('profileTags').innerHTML).toContain('관심 분야 없음');
    });

    test('fillProfileCard: null → throw 없이 종료', () => {
      expect(() => sp.fillProfileCard(null)).not.toThrow();
    });
  });

  // =========================================================================
  // 17. 프로필 모달
  // =========================================================================
  describe('프로필 모달 (Modal)', () => {
    test('openProfileModal: display=block', () => {
      sp.openProfileModal();
      expect(document.getElementById('profileModal').style.display).toBe('block');
    });

    test('closeProfileModal: display=none', () => {
      sp.openProfileModal();
      sp.closeProfileModal();
      expect(document.getElementById('profileModal').style.display).toBe('none');
    });

    // ── userChipBtn 클릭 이벤트 (line 783-787) ────────────────────────────
    test('userChipBtn 클릭: 모달 닫혀 있으면 열림', () => {
      document.getElementById('profileModal').style.display = 'none';
      document.getElementById('userChipBtn').click();
      expect(document.getElementById('profileModal').style.display).toBe('block');
    });

    test('userChipBtn 클릭: 모달 열려 있으면 닫힘', () => {
      document.getElementById('profileModal').style.display = 'block';
      document.getElementById('userChipBtn').click();
      expect(document.getElementById('profileModal').style.display).toBe('none');
    });

    // ── document click 외부 클릭 닫힘 (line 791-808) ─────────────────────
    test('document 클릭: 모달 열린 상태에서 외부 클릭 시 닫힘', () => {
      sp.openProfileModal();
      document.body.click();
      expect(document.getElementById('profileModal').style.display).toBe('none');
    });

    test('document 클릭: 모달이 이미 닫혀 있으면 아무 일도 없음', () => {
      document.getElementById('profileModal').style.display = 'none';
      document.body.click();
      expect(document.getElementById('profileModal').style.display).toBe('none');
    });

    test('document 클릭: profileModal 내부 클릭 시 닫히지 않음', () => {
      sp.openProfileModal();
      document.getElementById('profileModal').click();
      expect(document.getElementById('profileModal').style.display).toBe('block');
    });
  });

  // =========================================================================
  // 18. 로그아웃
  // =========================================================================
  describe('handleLogout', () => {
    test('confirm 동의 시 세션 삭제 + login.html 이동 (line 762-769)', async () => {
      window.confirm.mockReturnValue(true);
      await sp.handleLogout();
      expect(window.localStorage.removeItem).toHaveBeenCalledWith('userSession');
      expect(window.localStorage.removeItem).toHaveBeenCalledWith('noticeArchiveItems');
      expect(window.localStorage.removeItem).toHaveBeenCalledWith('scheduleEvents');
      expect(window.location.href).toBe('login.html');
    });

    test('confirm 동의 시 완료 alert 발생', async () => {
      window.confirm.mockReturnValue(true);
      await sp.handleLogout();
      expect(window.alert).toHaveBeenCalledWith(
        expect.stringContaining('로그아웃이 완료되었습니다')
      );
    });

    test('confirm 거부 시 페이지 이동 없음', async () => {
      window.confirm.mockReturnValue(false);
      await sp.handleLogout();
      expect(window.location.href).toBe('');
    });
  });

  // =========================================================================
  // 19. isDuplicateEventOnDate
  // =========================================================================
  describe('isDuplicateEventOnDate', () => {
    test('해당 날짜에 제목 없으면 false', () => {
      expect(sp.isDuplicateEventOnDate('2026-06-15', '없는제목')).toBe(false);
    });

    test('해당 날짜에 동일 제목 있으면 true', async () => {
      global.fetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true, status: 200,
          text: () => Promise.resolve(JSON.stringify([{
            id: 99, date: '2026-07-01', title: '중복체크', main_category: '기타',
            sub_category: '기타', start_date: null, end_date: null, memo: '', url: ''
          }]))
        })
      );
      await sp.loadSchedulesFromServer();
      expect(sp.isDuplicateEventOnDate('2026-07-01', '중복체크')).toBe(true);
    });
  });

});
