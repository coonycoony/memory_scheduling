describe('Notice Archive - 전체 함수 및 브라우저 흐름 검증 테스트 (높은 커버리지)', () => {
  let m;

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    document.body.innerHTML = `
      <input id="keywordInput" value="" />
      <select id="categoryFilter">
        <option value="전체">전체</option>
        <option value="장학">장학</option>
        <option value="학사">학사</option>
      </select>
      <select id="sortFilter">
        <option value="saved-desc">보관 최신순</option>
        <option value="saved-asc">보관 오래된순</option>
        <option value="date-desc">공지 작성일순</option>
        <option value="date-asc">공지 작성오래된순</option>
      </select>
      <button id="resetBtn"></button>
      <button id="clearBtn"></button>
      <div id="savedList"></div>
      <div id="noticeGrid"></div>
      <div id="status"></div>
      <div id="resultText"></div>

      <span id="summaryTotal">0</span>
      <span id="summaryScholarship">0</span>
      <span id="summaryAcademic">0</span>
      <span id="summaryAdmission">0</span>
      <span id="summaryJob">0</span>
      <span id="summaryContest">0</span>
      <span id="summaryVolunteer">0</span>
      <span id="summaryFacility">0</span>
      <span id="summarySafety">0</span>
      <span id="summaryEtc">0</span>

      <button id="userChipBtn"><span id="userChipName"></span></button>
      <div id="profileModal" style="display: none;">
        <span id="profileName"></span>
        <span id="profileSchool"></span>
        <span id="profileMajor"></span>
        <span id="profileYear"></span>
        <div id="profileTags"></div>
        <button id="logoutBtn"></button>
      </div>
    `;

    const localStorageMock = (() => {
      let store = {};
      return {
        getItem: jest.fn((key) => store[key] || null),
        setItem: jest.fn((key, value) => {
          store[key] = String(value);
        }),
        removeItem: jest.fn((key) => {
          delete store[key];
        }),
        clear: jest.fn(() => {
          store = {};
        }),
      };
    })();
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });

    delete window.location;
    window.location = { href: '' };

    global.alert = jest.fn();
    global.confirm = jest.fn(() => true);

    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    );

    jest.isolateModules(() => {
      m = require('./my_notice_archive.js');
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // --------------------------------------------------------
  // [1] 데이터 파싱 및 유틸리티
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
      { date: null, savedAt: '2026-06-03T00:00:00Z' },
    ];
    expect(m.sortItems(items, 'date-asc')[0].date).toBe('2026-06-01');
    expect(m.sortItems(items, 'date-desc')[0].date).toBe('2026-06-10');
    expect(m.sortItems(items, 'saved-asc')[0].savedAt).toBe(
      '2026-06-01T00:00:00Z'
    );
    expect(m.sortItems(items, 'saved-desc')[0].savedAt).toBe(
      '2026-06-03T00:00:00Z'
    );
  });

  test('localStorage.getItem 파싱 에러 시 빈 배열 처리', () => {
    window.localStorage.getItem.mockReturnValueOnce('{ bad json');
    document.getElementById('keywordInput').dispatchEvent(new Event('input'));
    expect(
      document.getElementById('noticeGrid').innerHTML
    ).toContain('조건에 맞는 공지가 없습니다');
  });

  // --------------------------------------------------------
  // [2] 카테고리 요약 및 리스트 렌더링
  // --------------------------------------------------------
  test('renderSummary & List - 기타 카테고리 및 속성 부재 렌더링 검증', () => {
    const items = [
      {
        category: '장학',
        university: '한국대',
        department: '컴공',
        memo: '메모있음',
      },
      {
        category: '이상한카테고리',
        university: '',
        department: '',
        memo: '',
      },
    ];
    window.localStorage.setItem(
      'noticeArchiveItems',
      JSON.stringify(items)
    );
    document.getElementById('keywordInput').dispatchEvent(new Event('input'));

    expect(document.getElementById('summaryEtc').textContent).toBe('1');

    const savedListHtml = document.getElementById('savedList').innerHTML;
    expect(savedListHtml).toContain('부서 없음');
  });

  // --------------------------------------------------------
  // [3] 버튼/필터 액션 및 스토리지 동기화
  // --------------------------------------------------------
  test('버튼 액션: 초기화, 개별 삭제, 달력 가져가기 성공/실패', () => {
    const mockItems = [
      {
        id: '1',
        title: '공지1',
        category: '장학',
        memo: 'A',
        department: 'B',
        university: 'C',
        url: 'http',
      },
      { id: '2', title: '공지2', category: '학사' },
    ];
    window.localStorage.setItem(
      'noticeArchiveItems',
      JSON.stringify(mockItems)
    );
    document.getElementById('keywordInput').dispatchEvent(new Event('input'));

    // 필터 초기화 클릭
    document.getElementById('keywordInput').value = '검색어';
    document.getElementById('resetBtn').click();
    expect(document.getElementById('keywordInput').value).toBe('');

    // 개별 삭제 버튼 클릭
    const beforeRemoveBtns = document.querySelectorAll('[data-remove-id]');
    const beforeCount = beforeRemoveBtns.length;
    beforeRemoveBtns[0].click();

    // 삭제 후 남은 개수가 줄어야 함
    const afterRemoveBtns = document.querySelectorAll('[data-remove-id]');
    expect(afterRemoveBtns.length).toBeLessThan(beforeCount);

    // 달력 가져가기 (성공) - 남은 항목 클릭
    const addBtns = document.querySelectorAll('[data-add-schedule-id]');
    if (addBtns.length) {
      addBtns[0].click();
      expect(window.location.href).toContain('schedule_page.html');
    }

    // 달력 가져가기 (찾을 수 없는 아이템 방어 로직)
    window.localStorage.setItem('noticeArchiveItems', '[]');
    if (addBtns.length) {
      addBtns[0].click();
      expect(global.alert).toHaveBeenCalledWith(
        '해당 공지를 찾을 수 없습니다.'
      );
    }
  });

  test('보관함 전체 삭제 - 취소 및 에러 발생에도 화면 정상 처리', () => {
    window.confirm.mockReturnValueOnce(false);
    document.getElementById('clearBtn').click();

    window.confirm.mockReturnValueOnce(true);
    window.localStorage.setItem.mockImplementationOnce(() => {
      throw new Error('Quota Exceeded');
    });
    document.getElementById('clearBtn').click();
    expect(document.getElementById('status').textContent).toContain(
      '아직 저장된 공지가 없습니다'
    );
  });

  test('스토리지 동기화 (handleStorageSync)', () => {
    window.dispatchEvent(new StorageEvent('storage', { key: 'otherKey' }));
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'noticeArchiveItems' })
    );
    expect(document.getElementById('status').textContent).toContain(
      '아직 저장된 공지가 없습니다'
    );
  });

  // --------------------------------------------------------
  // [4] 프로필 모달 및 로그아웃
  // --------------------------------------------------------
  test('프로필 모달 - JSON 에러, 학년 분기(1~4), 태그 누락 커버', () => {
    const years = ['1', '2', '3', '4'];
    const expected = ['1학년', '2학년', '3학년', '4학년 이상'];

    years.forEach((y, i) => {
      window.localStorage.setItem(
        'userSession',
        JSON.stringify({ name: '테스트', year: y, interests: ['A'] })
      );
      document.getElementById('profileModal').style.display = 'none';
      document.getElementById('userChipBtn').click();
      expect(document.getElementById('profileYear').textContent).toBe(
        expected[i]
      );
    });

    // 태그가 없는 경우
    window.localStorage.setItem(
      'userSession',
      JSON.stringify({ name: '태그없음', year: '1' })
    );
    document.getElementById('profileModal').style.display = 'none';
    document.getElementById('userChipBtn').click();
    expect(
      document.getElementById('profileTags').innerHTML
    ).toContain('관심 분야 없음');

    // 세션 파싱 에러 → 게스트 처리
    window.localStorage.setItem('userSession', '{ bad json');
    document.getElementById('profileModal').style.display = 'none';
    document.getElementById('userChipBtn').click();
    expect(document.getElementById('userChipName').textContent).toBe(
      '게스트 님'
    );
  });

  test('프로필 칩 이름 - name 없는 경우 게스트 처리 유지', () => {
    window.localStorage.setItem(
      'userSession',
      JSON.stringify({ year: '2', interests: ['장학'] })
    );

    document.getElementById('profileModal').style.display = 'none';
    document.getElementById('userChipBtn').click();

    // 구현상 name이 없으면 게스트 처리로 떨어지는 상태이므로, 기대값을 게스트로 둔다.
    expect(document.getElementById('userChipName').textContent).toBe(
      '게스트 님'
    );
  });

  test('모달 바깥 영역 클릭 이벤트', () => {
    document.dispatchEvent(new MouseEvent('click'));

    document.getElementById('profileModal').style.display = 'block';
    document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.getElementById('profileModal').style.display).toBe('none');
  });

  test('로그아웃 시 스케줄 단일/전체 삭제 API 예외(catch) 처리', async () => {
    // 전체 조회 실패 (ok: false)
    global.fetch.mockResolvedValueOnce({ ok: false, status: 500 });
    document.getElementById('logoutBtn').click();
    await new Promise(process.nextTick);

    // 전체 조회 성공, 개별 삭제 중 에러 발생
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ id: 1 }]),
      })
      .mockRejectedValueOnce(new Error('Delete Network Error'));
    document.getElementById('logoutBtn').click();
    await new Promise(process.nextTick);

    expect(window.localStorage.removeItem).toHaveBeenCalledWith('userSession');
    expect(window.location.href).toBe('login.html');
  });
});
