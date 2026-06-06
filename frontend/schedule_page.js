// =========================
// 1. 상수 & 상태
// =========================
const API_BASE    = "http://127.0.0.1:8000";
const STORAGE_KEY = "noticeArchiveItems"; // 공지 보관함 (다른 페이지에서 사용)
const SESSION_KEY = "userSession";        // 로그인 정보
const SCHEDULE_KEY = "scheduleEvents";    // 필요 시 로컬 캐시용 키

let selectedDate;
let currentMonth = new Date();
const events = {}; // { 'YYYY-MM-DD': [ {id, mainCategory, ...} ] }

let rangeStart = null;
let rangeEnd   = null;
let initialUrlFromQuery = null; // 보관함에서 넘어온 URL 저장용

// =========================
// 2. 카테고리 맵
// =========================
const categoryMap = {
  "장학": ["장학", "국가장학", "성적우수", "근로장학", "장학금", "scholarship", "기타"],
  "학사": ["학사", "수강", "졸업", "성적", "휴학", "복학", "학점", "재수강", "수료", "논문", "강의", "교육과정", "기타"],
  "입학/등록": ["입학", "등록", "전형", "합격", "신입생", "편입", "원서", "기타"],
  "취업/채용": ["채용", "인턴", "취업", "구인", "커리어", "채용설명회", "job", "리크루팅", "현장실습", "기타"],
  "공모전/대회": ["공모전", "대회", "경진", "콘테스트", "해커톤", "공모", "시상", "수상", "기타"],
  "모집/봉사": ["모집", "봉사", "서포터즈", "튜터", "멘토", "지원자", "선발", "학생대표", "위원", "기타"],
  "시설/행정": ["시설", "도서관", "열람실", "wifi", "와이파이", "주차", "셔틀", "기숙사", "식당", "휴관", "공사", "기타"],
  "안전": ["안전", "코로나", "감염", "재난", "비상", "방역", "격리", "기타"],
  "기타": ["기타"]
};

// =========================
// 3. DOM 유틸 / 참조
// =========================
const $ = (id) => document.getElementById(id);

const els = {
  // 스케줄 폼 / 달력
  eventForm: $("eventForm"),
  eventList: $("eventList"),
  deleteAllBtn: $("deleteAllBtn"),
  mainCategory: $("mainCategory"),
  subCategory: $("subCategory"),
  eventTitle: $("eventTitle"),
  startDate: $("startDate"),
  endDate: $("endDate"),
  eventMemo: $("eventMemo"),
  selectedDateBox: document.querySelector(".selected-date"),
  calendarGrid: $("calendarGrid"),
  calendarTitle: $("calendarTitle"),
  prevMonthBtn: $("prevMonthBtn"),
  nextMonthBtn: $("nextMonthBtn"),
  statusText: $("statusText"),

  // 우측 상단 유저 칩 / 프로필 모달
  userChipBtn: $("userChipBtn"),
  userChipName: $("userChipName"),
  profileModal: $("profileModal"),
  profileName: $("profileName"),
  profileSchool: $("profileSchool"),
  profileMajor: $("profileMajor"),
  profileYear: $("profileYear"),
  profileTags: $("profileTags"),
  logoutBtn: $("logoutBtn"),
};

// =========================
// 4. 상태 메시지
// =========================
function setStatus(message = "", type = "") {
  if (!els.statusText) return;
  els.statusText.textContent = message;
  els.statusText.className = "status-text";
  if (type) els.statusText.classList.add(type);
}

// =========================
// 5. 날짜 유틸
// =========================
function parseLocalDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const getIso = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const todayIso = () => getIso(new Date());

const formatDateKorean = (dateStr) => {
  const [y, m, d] = dateStr.split("-");
  return `${y}년 ${+m}월 ${+d}일`;
};

const formatMonthKorean = (date) =>
  `${date.getFullYear()}년 ${date.getMonth() + 1}월`;

function normalizeRange(startIso, endIso) {
  if (!startIso || !endIso) return { start: startIso, end: endIso };
  return startIso <= endIso
    ? { start: startIso, end: endIso }
    : { start: endIso, end: startIso };
}

function getDatesInRange(startIso, endIso) {
  if (!startIso || !endIso) return [];
  const { start, end } = normalizeRange(startIso, endIso);
  const result = [];
  let cursor = parseLocalDate(start);
  const endDate = parseLocalDate(end);

  while (cursor <= endDate) {
    result.push(getIso(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

function isDateInSelectedRange(iso) {
  if (!rangeStart) return false;
  if (!rangeEnd) return iso === rangeStart;
  const { start, end } = normalizeRange(rangeStart, rangeEnd);
  return iso >= start && iso <= end;
}

function getCurrentTargetDates() {
  if (rangeStart && rangeEnd) return getDatesInRange(rangeStart, rangeEnd);
  if (rangeStart) return [rangeStart];
  return selectedDate ? [selectedDate] : [];
}

function syncDateInputsFromRange() {
  if (!els.startDate || !els.endDate) return;

  if (rangeStart && rangeEnd) {
    const { start, end } = normalizeRange(rangeStart, rangeEnd);
    els.startDate.value = start;
    els.endDate.value = end;
  } else if (rangeStart) {
    els.startDate.value = rangeStart;
    els.endDate.value = "";
  } else {
    els.startDate.value = "";
    els.endDate.value = "";
  }
}

function syncRangeFromInputs() {
  if (!els.startDate || !els.endDate) return;

  const start = els.startDate.value;
  const end = els.endDate.value;

  rangeStart = start || null;
  rangeEnd   = end || null;

  if (rangeStart && rangeEnd) {
    const { start: s, end: e } = normalizeRange(rangeStart, rangeEnd);
    rangeStart = s;
    rangeEnd   = e;
    selectedDate = rangeEnd;
    currentMonth = parseLocalDate(rangeEnd);
  } else if (rangeStart) {
    selectedDate = rangeStart;
    currentMonth = parseLocalDate(rangeStart);
  } else if (rangeEnd) {
    selectedDate = rangeEnd;
    currentMonth = parseLocalDate(rangeEnd);
  }

  updateSelectedDateUI();
  renderCalendar();
}

// =========================
// 6. 서버 연동
// =========================
async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`요청 실패: ${response.status}`);
  }
  if (response.status == 204) return null;

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function loadSchedulesFromServer() {
  try {
    setStatus("스케줄을 불러오는 중입니다...");
    const data = await fetchJson(`${API_BASE}/schedules`);

    Object.keys(events).forEach((k) => delete events[k]);

    (data || []).forEach((item) => {
      const rawDate = item.date;
      if (!rawDate) return;

      const dateKey = String(rawDate).slice(0, 10);
      if (!events[dateKey]) events[dateKey] = [];
      events[dateKey].push({
        id: item.id,
        mainCategory: item.main_category,
        subCategory: item.sub_category,
        title: item.title,
        startDate: item.start_date,
        endDate: item.end_date,
        memo: item.memo,
        url: item.url,
      });
    });

    updateSelectedDateUI();
    renderCalendar();
    setStatus("스케줄을 불러왔습니다.", "success");
  } catch (err) {
    console.error(err);
    setStatus(
      "서버에서 스케줄을 불러오지 못했습니다. 백엔드 실행 여부를 확인하세요.",
      "error"
    );
  }
}

async function createScheduleOnServer(payload) {
  return await fetchJson(`${API_BASE}/schedules`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function deleteScheduleOnServer(id) {
  return await fetchJson(`${API_BASE}/schedules/${id}`, {
    method: "DELETE",
  });
}

async function deleteRangeUsingSingleDelete(startIso, endIso) {
  const { start, end } = normalizeRange(startIso, endIso);
  const dates = getDatesInRange(start, end);

  const targets = [];
  dates.forEach((iso) => {
    (events[iso] || []).forEach((ev) => targets.push({ iso, ev }));
  });

  if (!targets.length) {
    setStatus("선택한 범위에 삭제할 스케줄이 없습니다.");
    return;
  }

  for (const { iso, ev } of targets) {
    try {
      await deleteScheduleOnServer(ev.id);
      const list = events[iso];
      const idx = list.findIndex((x) => x.id === ev.id);
      if (idx !== -1) {
        list.splice(idx, 1);
        if (!list.length) delete events[iso];
      }
    } catch (error) {
      console.error("범위 삭제 중 에러:", error);
    }
  }

  renderEventList();
  renderCalendar();
}

function isDuplicateEventOnDate(dateIso, title) {
  const list = events[dateIso] || [];
  return list.some((ev) => ev.title === title);
}

// =========================
// 7. 카테고리 렌더링
// =========================
function renderMainCategories() {
  if (!els.mainCategory) return;
  els.mainCategory.innerHTML = "";
  Object.keys(categoryMap).forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    els.mainCategory.appendChild(option);
  });
}

function renderSubCategories(mainCategory) {
  if (!els.subCategory) return;
  const subCategories = categoryMap[mainCategory] || [];
  els.subCategory.innerHTML = "";
  subCategories.forEach((sub) => {
    const option = document.createElement("option");
    option.value = sub;
    option.textContent = sub;
    els.subCategory.appendChild(option);
  });
}

function applyQueryToForm() {
  const params = new URLSearchParams(window.location.search);
  const title = params.get("title");
  const category = params.get("category");
  const subCategory = params.get("subCategory");
  const url = params.get("url");
  const memo = params.get("memo");

  if (title) {
    els.eventTitle.value = title;
  }

  if (memo || url) {
    const memoParts = [];
    if (memo) memoParts.push(memo);
    if (url) memoParts.push(`원문 링크: ${url}`);
    els.eventMemo.value = memoParts.join("\n");
  }

  if (url) {
    initialUrlFromQuery = url;
  }

  if (category && categoryMap[category]) {
    els.mainCategory.value = category;
    renderSubCategories(category);
  } else {
    renderSubCategories(els.mainCategory.value);
  }

  if (subCategory) {
    Array.from(els.subCategory.options).forEach((opt) => {
      if (opt.value === subCategory) {
        els.subCategory.value = subCategory;
      }
    });
  }
}

// =========================
// 8. 일정 목록 렌더링
// =========================
function renderEventList() {
  const list = events[selectedDate] || [];
  els.eventList.innerHTML = "";

  if (!list.length) {
    els.eventList.innerHTML =
      '<div class="empty-text">이 날짜에는 저장된 스케줄이 없습니다.</div>';
    return;
  }

  list.forEach((ev, index) => {
    const item = document.createElement("div");
    item.className = "event-item";

    const pillClass =
      ev.mainCategory === "장학"
        ? "scholarship"
        : ev.mainCategory === "시설/행정"
        ? "etc"
        : "";

    item.innerHTML = `
      <div class="event-main">
        <div class="event-type-pill ${pillClass}">
          ${ev.mainCategory}
        </div>
        <div class="event-title">${ev.title}</div>
        <div class="event-time">
          ${ev.subCategory ? `세부항목: ${ev.subCategory}` : ""}
          ${ev.startDate ? ` · 시작: ${ev.startDate}` : ""}
          ${ev.endDate ? ` · 종료: ${ev.endDate}` : ""}
        </div>
        ${ev.memo ? `<div class="event-memo">${ev.memo}</div>` : ""}
        ${
          ev.url
            ? `<a class="event-link" href="${ev.url}" target="_blank" rel="noopener noreferrer">원문 바로가기</a>`
            : ""
        }
      </div>
    `;

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn-secondary";
    deleteBtn.type = "button";
    deleteBtn.textContent = "삭제";

    deleteBtn.addEventListener("click", async () => {
      const targetEv = list[index];

      if (!confirm("이 스케줄을 삭제할까요?")) return;

      try {
        setStatus("스케줄을 삭제하는 중입니다...");
        await deleteScheduleOnServer(targetEv.id);

        events[selectedDate].splice(index, 1);
        if (!events[selectedDate].length) {
          delete events[selectedDate];
        }

        renderEventList();
        renderCalendar();
        setStatus("스케줄이 삭제되었습니다.", "success");
      } catch (error) {
        console.error(error);
        setStatus("스케줄 삭제 중 오류가 발생했습니다.", "error");
      }
    });

    item.appendChild(deleteBtn);
    els.eventList.appendChild(item);
  });
}

function updateSelectedDateUI() {
  if (!els.selectedDateBox) return;

  if (rangeStart && rangeEnd) {
    const { start, end } = normalizeRange(rangeStart, rangeEnd);
    els.selectedDateBox.textContent =
      `${formatDateKorean(start)} ~ ${formatDateKorean(end)}`;
  } else if (rangeStart) {
    els.selectedDateBox.textContent =
      `${formatDateKorean(rangeStart)} (시작 날짜 선택됨)`;
  } else if (selectedDate) {
    els.selectedDateBox.textContent = formatDateKorean(selectedDate);
  } else {
    els.selectedDateBox.textContent = "날짜를 선택하세요";
  }

  renderEventList();
}

// =========================
// 9. 달력 렌더링
// =========================
function getBadgeClass(mainCategory) {
  switch (mainCategory) {
    case "장학":       return "cat-scholarship";
    case "학사":       return "cat-academic";
    case "입학/등록":  return "cat-admission";
    case "취업/채용":  return "cat-career";
    case "공모전/대회": return "cat-contest";
    case "모집/봉사":  return "cat-volunteer";
    case "시설/행정":  return "cat-facility";
    case "안전":       return "cat-safety";
    case "기타":       return "cat-etc";
    default:           return "";
  }
}

function createDayCell(date, muted) {
  if (!els.calendarGrid) return;

  const iso = getIso(date);
  const dayEvents = events[iso] || [];

  const cell = document.createElement("div");
  cell.className = "calendar-day";

  if (muted) cell.classList.add("muted");
  if (iso === todayIso()) cell.classList.add("today");
  if (isDateInSelectedRange(iso)) cell.classList.add("in-range");
  if (iso === rangeStart || iso === rangeEnd) cell.classList.add("range-edge");

  cell.innerHTML = `
    <div class="calendar-day-number">${date.getDate()}</div>
    <div class="calendar-day-events"></div>
  `;

  const eventsContainer = cell.querySelector(".calendar-day-events");

  dayEvents.slice(0, 6).forEach((ev) => {
    const badge = document.createElement("div");
    badge.className = `calendar-event-badge ${getBadgeClass(ev.mainCategory)}`;
    badge.textContent = ev.title;
    eventsContainer.appendChild(badge);
  });

  if (dayEvents.length > 6) {
    const more = document.createElement("div");
    more.className = "calendar-event-more";
    more.textContent = `+${dayEvents.length - 6}`;
    eventsContainer.appendChild(more);
  }

  cell.addEventListener("click", () => {
    const clickedIso = iso;

    if (!rangeStart || (rangeStart && rangeEnd)) {
      rangeStart = clickedIso;
      rangeEnd = null;
    } else {
      const normalized = normalizeRange(rangeStart, clickedIso);
      rangeStart = normalized.start;
      rangeEnd = normalized.end;
    }

    selectedDate = clickedIso;
    currentMonth = new Date(date.getFullYear(), date.getMonth(), 1);

    syncDateInputsFromRange();
    updateSelectedDateUI();
    renderCalendar();
  });

  els.calendarGrid.appendChild(cell);
}

function renderCalendar() {
  if (!els.calendarGrid || !els.calendarTitle) return;

  const year  = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  els.calendarTitle.textContent = formatMonthKorean(currentMonth);
  els.calendarGrid.innerHTML = "";

  const firstDay     = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth  = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  for (let i = 0; i < startWeekday; i++) {
    const dayNum = prevMonthDays - startWeekday + i + 1;
    const date   = new Date(year, month - 1, dayNum);
    createDayCell(date, true);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    createDayCell(date, false);
  }

  const totalCells = els.calendarGrid.children.length;
  const remain     = 42 - totalCells;
  for (let i = 1; i <= remain; i++) {
    const date = new Date(year, month + 1, i);
    createDayCell(date, true);
  }
}

// =========================
// 10. 이벤트 핸들러
// =========================
function handleMainCategoryChange() {
  renderSubCategories(els.mainCategory.value);
}

async function handleEventSubmit(e) {
  e.preventDefault();

  const mainCategory = els.mainCategory.value;
  const subCategory  = els.subCategory.value;
  const title        = els.eventTitle.value.trim();
  const memo         = els.eventMemo.value.trim();
  const url          = initialUrlFromQuery || null;

  if (!title) return;

  const targetDates = getCurrentTargetDates();
  if (!targetDates.length) {
    alert("먼저 시작 날짜 또는 종료 날짜를 선택해 주세요.");
    return;
  }

  const uniqueDates = targetDates.filter((dateIso) => {
    const dup = isDuplicateEventOnDate(dateIso, title);
    return !dup;
  });

  if (!uniqueDates.length) {
    alert("선택한 날짜 범위에는 이미 같은 제목의 스케줄이 모두 등록되어 있습니다.");
    return;
  }

  try {
    setStatus("스케줄을 저장하는 중입니다...");
    for (const dateIso of uniqueDates) {
      await createScheduleOnServer({
        date: dateIso,
        main_category: mainCategory,
        sub_category: subCategory,
        title,
        start_date: rangeStart,
        end_date: rangeEnd,
        memo,
        url,
      });
    }

    els.eventTitle.value = "";
    els.eventMemo.value  = "";
    initialUrlFromQuery  = null;

    await loadSchedulesFromServer();
    setStatus("스케줄이 저장되었습니다.", "success");
  } catch (err) {
    console.error(err);
    setStatus("스케줄 저장 중 오류가 발생했습니다.", "error");
  }
}

async function handleDeleteAll() {
  const targetDates = getCurrentTargetDates();
  const hasAnyEvent = targetDates.some((iso) => events[iso]?.length);

  if (!targetDates.length) {
    alert("먼저 삭제할 날짜(또는 날짜 범위)를 선택해 주세요.");
    return;
  }

  if (!hasAnyEvent) {
    alert("선택한 범위에 저장된 스케줄이 없습니다.");
    return;
  }

  if (!confirm("선택된 날짜의 스케줄을 모두 삭제할까요?")) return;

  const start = targetDates[0];
  const end   = targetDates[targetDates.length - 1];

  try {
    setStatus("스케줄을 삭제하는 중입니다...");
    await deleteRangeUsingSingleDelete(start, end);
    setStatus("선택 범위의 스케줄이 삭제되었습니다.", "success");
  } catch (err) {
    console.error(err);
    setStatus("스케줄 삭제 중 오류가 발생했습니다.", "error");
  }
}

function handleNextMonth() {
  currentMonth = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth() + 1,
    1
  );
  renderCalendar();
}

function handlePrevMonth() {
  currentMonth = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth() - 1,
    1
  );
  renderCalendar();
}

// =========================
// 11. 사용자 세션 / 프로필 / 로그아웃
// =========================
function loadUserSession() {
  const raw = sessionStorage.getItem(SESSION_KEY);   // ★ localStorage → sessionStorage
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function fillUserChip(user) {
  if (!els.userChipName) return;
  if (!user) {
    els.userChipName.textContent = "게스트 님";
    return;
  }
  els.userChipName.textContent = `${user.name || "사용자"} 님`;
}

function fillProfileCard(user) {
  if (!user || !els.profileName) return;
  els.profileName.textContent  = user.name || "사용자";
  els.profileSchool.textContent = user.school || "학교 정보 없음";
  els.profileMajor.textContent  = user.major || "학과 정보 없음";

  const yearMap = {
    "1": "1학년",
    "2": "2학년",
    "3": "3학년",
    "4": "4학년 이상",
  };
  els.profileYear.textContent = user.year ? yearMap[user.year] || "" : "";

  const interests = Array.isArray(user.interests) ? user.interests : [];
  els.profileTags.innerHTML = "";
  if (!interests.length) {
    const span = document.createElement("span");
    span.className = "profile-text";
    span.textContent = "관심 분야 없음";
    els.profileTags.appendChild(span);
  } else {
    interests.forEach((label) => {
      const tag = document.createElement("span");
      tag.className = "profile-tag-pill";
      tag.textContent = label;
      els.profileTags.appendChild(tag);
    });
  }
}

function openProfileModal() {
  const user = loadUserSession();
  fillProfileCard(user);
  if (els.profileModal) els.profileModal.style.display = "block";
}

function closeProfileModal() {
  if (els.profileModal) els.profileModal.style.display = "none";
}

async function deleteAllSchedulesOnServer() {
  try {
    const res = await fetch(`${API_BASE}/schedules?skip=0&limit=1000`);
    if (!res.ok) {
      console.error("스케줄 목록 조회 실패:", res.status);
      return;
    }
    const schedules = await res.json();
    const ids = schedules.map((s) => s.id);

    await Promise.all(
      ids.map((id) =>
        fetch(`${API_BASE}/schedules/${id}`, {
          method: "DELETE",
        }).catch((e) => console.error("스케줄 삭제 실패:", id, e))
      )
    );
  } catch (e) {
    console.error("서버 스케줄 전체 삭제 중 오류:", e);
  }
}

async function handleLogout() {
  if (
    !confirm(
      "로그아웃하고 저장된 정보(공지 보관함 & 스케줄러)를 모두 삭제할까요?"
    )
  )
    return;

  await deleteAllSchedulesOnServer();

  sessionStorage.removeItem(SESSION_KEY);  // ★ sessionStorage 기준
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(SCHEDULE_KEY);

  alert(
    "로그아웃이 완료되었습니다. 공지 보관함과 스케줄러 내용이 모두 초기화되었습니다."
  );

  closeProfileModal();
  window.location.href = "login.html";
}

// =========================
// 12. 이벤트 바인딩
// =========================
if (els.mainCategory) {
  els.mainCategory.addEventListener("change", handleMainCategoryChange);
}
if (els.eventForm) {
  els.eventForm.addEventListener("submit", handleEventSubmit);
}
if (els.deleteAllBtn) {
  els.deleteAllBtn.addEventListener("click", handleDeleteAll);
}
if (els.prevMonthBtn) {
  els.prevMonthBtn.addEventListener("click", handlePrevMonth);
}
if (els.nextMonthBtn) {
  els.nextMonthBtn.addEventListener("click", handleNextMonth);
}
if (els.startDate) {
  els.startDate.addEventListener("change", syncRangeFromInputs);
}
if (els.endDate) {
  els.endDate.addEventListener("change", syncRangeFromInputs);
}
if (els.userChipBtn) {
  els.userChipBtn.addEventListener("click", () => {
    const isOpen = els.profileModal?.style.display === "block";
    if (isOpen) closeProfileModal();
    else openProfileModal();
  });
}
if (els.logoutBtn) {
  els.logoutBtn.addEventListener("click", handleLogout);
}

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!els.profileModal || !els.userChipBtn) return;
  if (els.profileModal.style.display !== "block") return;

  if (
    target === els.userChipBtn ||
    els.userChipBtn.contains(target) ||
    els.profileModal.contains(target)
  ) {
    return;
  }
  closeProfileModal();
});

// =========================
// 13. 초기화
// =========================
async function init() {
  const user = loadUserSession();
  fillUserChip(user);

  selectedDate = todayIso();
  currentMonth = new Date();
  rangeStart   = null;
  rangeEnd     = null;

  renderMainCategories();
  renderSubCategories(els.mainCategory.value);
  applyQueryToForm();
  updateSelectedDateUI();
  renderCalendar();
  await loadSchedulesFromServer();
}

init();
