import pytest
from datetime import date
from unittest.mock import patch, MagicMock
from pathlib import Path
import json
import base64
from urllib.parse import quote

import notice_model as nm
from notice_model import (
    is_valid_category,
    classify_notice,
    make_notice,
    _parse_date,
    _build_page_url,
    filter_by_keyword,
    filter_by_category,
    filter_by_date_range,
    summarize_by_category,
    analyze_page_urls,
    check_js_pagination,
    get_university_list,
    get_board_list,
    filter_by_keyword,
    Notice,
    NoticeBoard,
    UniversitySource,
    SearchRequest,
    VALID_CATEGORIES,
    save_sources_to_json,
    delete_board_source,
    add_board_source,
)


# ── is_valid_category ─────────────────────────────────────────────────────────

class TestIsValidCategory:
    def test_valid_categories(self):
        for cat in ["장학", "학사", "입학/등록", "취업/채용", "공모전/대회", "모집/봉사", "시설/행정", "안전", "기타"]:
            assert is_valid_category(cat) is True

    def test_invalid_category(self):
        assert is_valid_category("없는카테고리") is False
        assert is_valid_category("") is False
        assert is_valid_category("random") is False


# ── classify_notice ───────────────────────────────────────────────────────────

class TestClassifyNotice:
    def test_classify_by_title_scholarship(self):
        assert classify_notice("2024년 국가장학금 신청 안내") == "장학"

    def test_classify_by_title_academic(self):
        assert classify_notice("2024년 1학기 수강신청 안내") == "학사"

    def test_classify_by_title_employment(self):
        assert classify_notice("하계 인턴 채용 안내") == "취업/채용"

    def test_classify_by_title_contest(self):
        assert classify_notice("공모전 참가자 모집") == "공모전/대회"

    def test_classify_by_title_recruitment(self):
        assert classify_notice("봉사활동 모집 공고") == "모집/봉사"

    def test_classify_by_title_facility(self):
        assert classify_notice("도서관 열람실 운영시간 안내") == "시설/행정"

    def test_classify_by_title_safety(self):
        assert classify_notice("코로나 감염 예방 안내") == "안전"

    def test_classify_unknown_returns_기타(self):
        assert classify_notice("알 수 없는 공지사항") == "기타"

    def test_classify_by_board_name(self):
        result = classify_notice("어떤 제목", board_name="장학게시판")
        assert result == "장학"

    def test_classify_board_name_priority_over_title(self):
        # board_name에 키워드 있으면 title보다 우선
        result = classify_notice("채용공고", board_name="장학공지")
        assert result == "장학"

    def test_classify_graduation(self):
        assert classify_notice("2024년 졸업논문 제출 안내") == "학사"

    def test_classify_admission(self):
        assert classify_notice("2025 신입생 입학 안내") == "입학/등록"


# ── make_notice ───────────────────────────────────────────────────────────────

class TestMakeNotice:
    def test_basic_make_notice(self):
        n = make_notice("서울대", "장학금 안내", "http://example.com/1")
        assert n.university == "서울대"
        assert n.title == "장학금 안내"
        assert n.url == "http://example.com/1"
        assert n.category == "장학"

    def test_make_notice_strips_title(self):
        n = make_notice("고려대", "  제목 공백  ", "http://example.com/2")
        assert n.title == "제목 공백"

    def test_make_notice_strips_department(self):
        n = make_notice("연세대", "공지", "http://x.com", department="  공학부  ")
        assert n.department == "공학부"

    def test_make_notice_none_department(self):
        n = make_notice("연세대", "공지", "http://x.com", department=None)
        assert n.department is None

    def test_make_notice_source_category_used(self):
        n = make_notice("서울대", "제목", "http://x.com", source_category="학사")
        assert n.category == "학사"

    def test_make_notice_invalid_source_category_falls_back(self):
        n = make_notice("서울대", "제목", "http://x.com", source_category="없는카테고리")
        assert n.category == "기타"

    def test_make_notice_with_date(self):
        n = make_notice("서울대", "공지", "http://x.com", date="2024-01-01")
        assert n.date == "2024-01-01"


# ── _parse_date ───────────────────────────────────────────────────────────────

class TestParseDate:
    def test_parse_full_date(self):
        assert _parse_date("2024.03.15") == date(2024, 3, 15)

    def test_parse_dash_separated(self):
        assert _parse_date("2024-01-01") == date(2024, 1, 1)

    def test_parse_slash_separated(self):
        assert _parse_date("2024/12/31") == date(2024, 12, 31)

    def test_parse_two_digit_year(self):
        assert _parse_date("24.03.15") == date(2024, 3, 15)

    def test_parse_in_text(self):
        assert _parse_date("등록기간: 2024.05.10 마감") == date(2024, 5, 10)

    def test_parse_invalid_returns_none(self):
        assert _parse_date("날짜없음") is None

    def test_parse_invalid_date_values(self):
        assert _parse_date("2024.13.01") is None  # 13월은 없음

    def test_parse_empty_string(self):
        assert _parse_date("") is None


# ── _build_page_url ───────────────────────────────────────────────────────────

class TestBuildPageUrl:
    def test_simple_page_param(self):
        url = _build_page_url("http://example.com/board", "pageIndex", 2)
        assert "pageIndex=2" in url

    def test_first_page(self):
        url = _build_page_url("http://example.com/board", "pageIndex", 1)
        assert "pageIndex=1" in url

    def test_existing_params_preserved(self):
        url = _build_page_url("http://example.com/board?category=notice", "pageIndex", 3)
        assert "category=notice" in url
        assert "pageIndex=3" in url

    def test_with_page_size(self):
        url = _build_page_url("http://example.com/board", "start", 2, page_size=10)
        assert "start=10" in url  # (2-1)*10 = 10

    def test_enc_page_url(self):
        url = _build_page_url(
            "http://example.com/board",
            "pageIndex",
            2,
            enc_inner_path="/inner/list.do",
            enc_query_template="pageIndex={page}&menuId=1",
        )
        assert "enc=" in url
        assert "http://example.com/board" in url

    def test_enc_removes_existing_enc(self):
        url = _build_page_url(
            "http://example.com/board?enc=abc",
            "pageIndex",
            2,
            enc_inner_path="/inner/list.do",
            enc_query_template="pageIndex={page}",
        )
        assert url.startswith("http://example.com/board?enc=")

    def test_enc_without_template_uses_fallback(self):
        url = _build_page_url(
            "http://example.com/board",
            "page",
            3,
            enc_inner_path="/inner/list.do",
            enc_query_template=None,
        )
        assert "enc=" in url


# ── check_js_pagination ───────────────────────────────────────────────────────

class TestCheckJsPagination:
    def test_js_pagination_detected(self):
        assert check_js_pagination("http://example.com/board#page2") is True

    def test_normal_url_not_js(self):
        assert check_js_pagination("http://example.com/board?page=2") is False

    def test_fragment_without_page(self):
        assert check_js_pagination("http://example.com/board#section") is False


# ── filter_by_keyword ─────────────────────────────────────────────────────────

class TestFilterByKeyword:
    def setup_method(self):
        self.notices = [
            Notice(university="A", title="장학금 안내", url="http://a.com/1", category="장학"),
            Notice(university="A", title="수강신청 안내", url="http://a.com/2", category="학사"),
            Notice(university="B", title="장학 공지", url="http://b.com/1", category="장학"),
        ]

    def test_keyword_match(self):
        result = filter_by_keyword(self.notices, "장학")
        assert len(result) == 2

    def test_keyword_no_match(self):
        result = filter_by_keyword(self.notices, "없는키워드")
        assert result == []

    def test_keyword_case_insensitive(self):
        notices = [Notice(university="A", title="Job Fair 안내", url="http://a.com", category="취업/채용")]
        result = filter_by_keyword(notices, "job")
        assert len(result) == 1

    def test_keyword_with_university_filter(self):
        result = filter_by_keyword(self.notices, "장학", university="A")
        assert len(result) == 1
        assert result[0].university == "A"


# ── filter_by_category ────────────────────────────────────────────────────────

class TestFilterByCategory:
    def setup_method(self):
        self.notices = [
            Notice(university="A", title="장학금", url="http://a.com/1", category="장학"),
            Notice(university="A", title="수강신청", url="http://a.com/2", category="학사"),
            Notice(university="B", title="장학", url="http://b.com/1", category="장학"),
        ]

    def test_filter_valid_category(self):
        result = filter_by_category(self.notices, "장학")
        assert len(result) == 2

    def test_filter_with_university(self):
        result = filter_by_category(self.notices, "장학", university="B")
        assert len(result) == 1

    def test_filter_invalid_category_raises(self):
        with pytest.raises(ValueError):
            filter_by_category(self.notices, "없는카테고리")

    def test_filter_기타(self):
        notices = [Notice(university="A", title="기타공지", url="http://a.com", category="기타")]
        result = filter_by_category(notices, "기타")
        assert len(result) == 1


# ── filter_by_date_range ──────────────────────────────────────────────────────

class TestFilterByDateRange:
    def setup_method(self):
        self.notices = [
            Notice(university="A", title="n1", url="u1", category="기타", date="2024-01-01"),
            Notice(university="A", title="n2", url="u2", category="기타", date="2024-06-15"),
            Notice(university="A", title="n3", url="u3", category="기타", date="2024-12-31"),
            Notice(university="A", title="n4", url="u4", category="기타", date=None),
        ]

    def test_since_filter(self):
        result = filter_by_date_range(self.notices, since=date(2024, 6, 1))
        dates = [n.date for n in result if n.date]
        assert "2024-01-01" not in dates
        assert "2024-06-15" in dates

    def test_until_filter(self):
        result = filter_by_date_range(self.notices, until=date(2024, 6, 30))
        dates = [n.date for n in result if n.date]
        assert "2024-12-31" not in dates

    def test_include_undated_default(self):
        result = filter_by_date_range(self.notices)
        assert any(n.date is None for n in result)

    def test_exclude_undated(self):
        result = filter_by_date_range(self.notices, include_undated=False)
        assert all(n.date is not None for n in result)

    def test_both_since_and_until(self):
        result = filter_by_date_range(
            self.notices,
            since=date(2024, 6, 1),
            until=date(2024, 6, 30),
            include_undated=False,
        )
        assert len(result) == 1
        assert result[0].date == "2024-06-15"


# ── summarize_by_category ─────────────────────────────────────────────────────

class TestSummarizeByCategory:
    def test_basic_summary(self):
        notices = [
            Notice(university="A", title="t1", url="u1", category="장학"),
            Notice(university="A", title="t2", url="u2", category="장학"),
            Notice(university="A", title="t3", url="u3", category="학사"),
        ]
        result = summarize_by_category(notices)
        assert result["장학"] == 2
        assert result["학사"] == 1

    def test_sort_by_count(self):
        notices = [
            Notice(university="A", title="t1", url="u1", category="학사"),
            Notice(university="A", title="t2", url="u2", category="장학"),
            Notice(university="A", title="t3", url="u3", category="장학"),
        ]
        result = summarize_by_category(notices, sort_by_count=True)
        keys = list(result.keys())
        assert keys[0] == "장학"

    def test_empty_list(self):
        assert summarize_by_category([]) == {}


# ── analyze_page_urls ─────────────────────────────────────────────────────────

class TestAnalyzePageUrls:
    def test_single_url_returns_default(self):
        result = analyze_page_urls("http://example.com/board?page=1")
        assert result["page_param"] == "page"
        assert result["enc_inner_path"] is None

    def test_two_urls_detect_page_param(self):
        result = analyze_page_urls(
            "http://example.com/board?pageIndex=1&category=a",
            "http://example.com/board?pageIndex=2&category=a",
        )
        assert result["page_param"] == "pageIndex"

    def test_different_domains_raises(self):
        with pytest.raises(ValueError, match="도메인"):
            analyze_page_urls("http://a.com/board?p=1", "http://b.com/board?p=2")

    def test_no_page_param_difference_raises(self):
        with pytest.raises(ValueError):
            analyze_page_urls(
                "http://example.com/board?cat=a",
                "http://example.com/board?cat=a",
            )

    def test_enc_url_analysis(self):
        def make_enc_url(page):
            inner = f"/list.do?pageIndex={page}&menuId=100"
            enc_val = base64.b64encode(("fnct1|@@|" + quote(inner, safe="")).encode()).decode()
            return f"http://example.com/board?enc={enc_val}"

        result = analyze_page_urls(make_enc_url(1), make_enc_url(2))
        assert result["page_param"] == "pageIndex"
        assert result["enc_inner_path"] == "/list.do"


# ── SearchRequest properties ──────────────────────────────────────────────────

class TestSearchRequest:
    def test_since_date_property(self):
        req = SearchRequest(university="서울대", since="2024-01-01", until="2024-12-31")
        assert req.since_date == date(2024, 1, 1)

    def test_until_date_property(self):
        req = SearchRequest(university="서울대", until="2024-12-31")
        assert req.until_date == date(2024, 12, 31)

    def test_since_none(self):
        req = SearchRequest(university="서울대", until="2024-12-31")
        assert req.since_date is None


# ── get_university_list / get_board_list ──────────────────────────────────────

class TestUniversityAndBoardList:
    def test_get_university_list_returns_list(self):
        result = get_university_list()
        assert isinstance(result, list)

    def test_get_board_list_unknown_university(self):
        result = get_board_list("존재하지않는학교xyz")
        assert result == []

    def test_get_board_list_known_university(self):
        from notice_model import UNIVERSITY_SOURCES
        if not UNIVERSITY_SOURCES:
            pytest.skip("sources.json에 데이터 없음")
        univ = list(UNIVERSITY_SOURCES.keys())[0]
        result = get_board_list(univ)
        assert isinstance(result, list)


# ── save/load notices JSON ────────────────────────────────────────────────────

class TestNoticesJson:
    def test_save_and_load(self, tmp_path):
        from notice_model import save_notices_to_json, load_notices_from_json
        notices = [
            Notice(university="A", title="공지1", url="http://a.com/1", category="장학", date="2024-01-01"),
        ]
        path = str(tmp_path / "test_notices.json")
        save_notices_to_json(notices, path)
        loaded = load_notices_from_json(path)
        assert len(loaded) == 1
        assert loaded[0].title == "공지1"


# ── add / delete board source ─────────────────────────────────────────────────

class TestBoardSourceManagement:
    def test_add_and_delete_board_source(self, tmp_path):
        sources_path = tmp_path / "sources.json"
        sources_path.write_text("{}", encoding="utf-8")
        initial = nm._load_university_sources(sources_path)

        # add_board_source를 mock으로 우회해 save_sources_to_json 직접 호출
        board = NoticeBoard(board_name="테스트게시판", list_url="http://test.com/board")
        initial["테스트대학"] = UniversitySource(name="테스트대학", boards=[board])
        save_sources_to_json(initial, sources_path)

        sources = nm._load_university_sources(sources_path)
        assert "테스트대학" in sources

        with patch("notice_model._load_university_sources", return_value=sources), \
             patch("notice_model.save_sources_to_json"):
            result = delete_board_source("테스트대학", "테스트게시판")
            assert result is True

    def test_delete_nonexistent_university(self, tmp_path):
        sources_path = tmp_path / "sources.json"
        sources_path.write_text("{}", encoding="utf-8")
        empty = nm._load_university_sources(sources_path)
        with patch("notice_model._load_university_sources", return_value=empty), \
             patch("notice_model.save_sources_to_json"):
            result = delete_board_source("없는대학", "없는게시판")
            assert result is False

    def test_delete_nonexistent_board(self, tmp_path):
        board = NoticeBoard(board_name="공지", list_url="http://a.com")
        sources = {"A대학": UniversitySource(name="A대학", boards=[board])}
        with patch("notice_model._load_university_sources", return_value=sources), \
             patch("notice_model.save_sources_to_json"):
            result = delete_board_source("A대학", "없는게시판")
            assert result is False

    def test_add_duplicate_board_skipped(self, tmp_path):
        sources_path = tmp_path / "sources.json"
        sources_path.write_text("{}", encoding="utf-8")
        empty = {}

        saved = {}

        def fake_load(path=None):
            return {k: v for k, v in saved.items()}

        def fake_save(s, path=None):
            saved.clear()
            saved.update(s)

        with patch("notice_model._load_university_sources", side_effect=fake_load), \
             patch("notice_model.save_sources_to_json", side_effect=fake_save):
            add_board_source("B대학", "게시판", "http://b.com/board")
            add_board_source("B대학", "게시판", "http://b.com/board")  # 중복 추가
            assert len(saved["B대학"].boards) == 1


# ── load_notices (unit, mocked crawl) ────────────────────────────────────────

class TestLoadNotices:
    def test_unknown_university_returns_empty(self):
        req = SearchRequest(university="없는대학xyz", until="2024-12-31")
        result = nm.load_notices(req)
        assert result == []

    def test_load_notices_with_mock(self, tmp_path):
        sources_path = tmp_path / "sources.json"
        data = {
            "테스트대": {
                "name": "테스트대",
                "boards": [{"board_name": "공지사항", "list_url": "http://test.com/board"}],
            }
        }
        sources_path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

        mock_notice = Notice(university="테스트대", title="장학 공지", url="http://test.com/1", category="장학", date="2024-06-01")

        with patch("notice_model.UNIVERSITY_SOURCES", nm._load_university_sources(sources_path)), \
             patch("notice_model.crawl_notice_board", return_value=[mock_notice]):
            req = SearchRequest(university="테스트대", until="2024-12-31", since="2024-01-01")
            result = nm.load_notices(req)
            assert len(result) == 1
            assert result[0].title == "장학 공지"


# ── check_sso_required ────────────────────────────────────────────────────────

class TestCheckSsoRequired:
    def test_sso_detected(self):
        from unittest.mock import Mock
        mock_resp = Mock()
        mock_resp.text = "please login to continue ssologin"
        with patch("notice_model.requests.get", return_value=mock_resp):
            assert nm.check_sso_required("http://example.com") is True

    def test_sso_not_detected_long_response(self):
        from unittest.mock import Mock
        mock_resp = Mock()
        mock_resp.text = "A" * 3000
        with patch("notice_model.requests.get", return_value=mock_resp):
            assert nm.check_sso_required("http://example.com") is False

    def test_sso_not_detected_no_pattern(self):
        from unittest.mock import Mock
        mock_resp = Mock()
        mock_resp.text = "일반 공지사항 페이지입니다."
        with patch("notice_model.requests.get", return_value=mock_resp):
            assert nm.check_sso_required("http://example.com") is False

    def test_sso_exception_returns_false(self):
        import requests
        with patch("notice_model.requests.get", side_effect=requests.RequestException("timeout")):
            assert nm.check_sso_required("http://example.com") is False


# ── parse_notice_rows: jf_view 패턴 ──────────────────────────────────────────

class TestParseNoticeRowsJfView:
    def test_jf_view_pattern_parsed(self):
        html = """
        <table><tbody>
          <tr>
            <td><a href="#" onclick="jf_view('ART00012345', 'menuId', '10')">공지사항 제목</a></td>
            <td>2024.06.01</td>
          </tr>
        </tbody></table>
        """
        board = NoticeBoard(
            board_name="공지", list_url="http://example.com/board",
            enc_inner_path="/portal/list.do", enc_query_template="menuId=10&pageIndex={page}",
        )
        results, _ = nm.parse_notice_rows(html, "서울대", board)
        assert len(results) == 1
        assert "enc=" in results[0].url

    def test_jf_view_no_match_skipped(self):
        html = """
        <table><tbody>
          <tr><td><a href="#" onclick="other_func()">공지제목입니다</a></td></tr>
        </tbody></table>
        """
        board = NoticeBoard(board_name="공지", list_url="http://example.com/board", enc_inner_path="/portal/list.do")
        results, _ = nm.parse_notice_rows(html, "서울대", board)
        assert results == []


# ── crawl_notice_board: 멀티페이지 ────────────────────────────────────────────

class TestCrawlNoticeBoardMultiPage:
    def test_stops_after_empty_page_2(self):
        html_p1 = "<table><tbody><tr><td><a href='/n/1'>공지1</a></td><td>2024.06.01</td></tr></tbody></table>"
        html_p2 = "<html><body>게시글 없음</body></html>"
        call_count = {"n": 0}

        def fake_fetch(url):
            call_count["n"] += 1
            return html_p1 if call_count["n"] == 1 else html_p2

        board = NoticeBoard(board_name="공지", list_url="http://example.com/board", max_pages=5)
        with patch("notice_model.fetch_board_html", side_effect=fake_fetch):
            nm.crawl_notice_board("서울대", board)
        assert call_count["n"] == 2

    def test_network_failure_stops_crawl(self):
        import requests
        board = NoticeBoard(board_name="공지", list_url="http://example.com/board", max_pages=2)
        with patch("notice_model.fetch_board_html", side_effect=requests.RequestException("timeout")), \
             patch("time.sleep"):
            result = nm.crawl_notice_board("서울대", board)
        assert result == []


# ── _load_university_sources ──────────────────────────────────────────────────

class TestLoadUniversitySources:
    def test_missing_file_returns_empty(self, tmp_path):
        result = nm._load_university_sources(tmp_path / "nonexistent.json")
        assert result == {}

    def test_key_name_mismatch_logs_warning(self, tmp_path, caplog):
        import logging
        data = {"실제키": {"name": "다른이름", "boards": [{"board_name": "공지", "list_url": "http://x.com"}]}}
        path = tmp_path / "sources.json"
        path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        with caplog.at_level(logging.WARNING, logger="notice_model"):
            result = nm._load_university_sources(path)
        assert "실제키" in result

    def test_valid_sources_loaded(self, tmp_path):
        data = {"서울대": {"name": "서울대", "boards": [{"board_name": "공지", "list_url": "http://snu.ac.kr"}]}}
        path = tmp_path / "sources.json"
        path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        result = nm._load_university_sources(path)
        assert result["서울대"].boards[0].board_name == "공지"


# ── _extract_date_from_row ────────────────────────────────────────────────────

class TestExtractDateFromRow:
    def test_extracts_date_from_row_text(self):
        from bs4 import BeautifulSoup
        row = BeautifulSoup("<tr><td>장학금 안내</td><td>2024.03.15</td></tr>", "html.parser").find("tr")
        assert nm._extract_date_from_row(row) == date(2024, 3, 15)

    def test_returns_none_when_no_date(self):
        from bs4 import BeautifulSoup
        row = BeautifulSoup("<tr><td>날짜없는공지</td></tr>", "html.parser").find("tr")
        assert nm._extract_date_from_row(row) is None


# ── parse_notice_rows ─────────────────────────────────────────────────────────

class TestParseNoticeRows:
    def _board(self, **kw):
        return NoticeBoard(**{"board_name": "공지사항", "list_url": "http://example.com/board", **kw})

    def test_basic_parse(self):
        html = "<table><tbody><tr><td><a href='/n/1'>장학금 공고</a></td><td>2024.03.01</td></tr></tbody></table>"
        results, _ = nm.parse_notice_rows(html, "서울대", self._board())
        assert any("장학" in n.title for n in results)

    def test_no_rows_returns_empty(self):
        results, _ = nm.parse_notice_rows("<html><body>없음</body></html>", "서울대", self._board())
        assert results == []

    def test_since_date_filtering(self):
        html = "<table><tbody><tr><td><a href='/n/1'>공지1</a></td><td>2024.01.01</td></tr></tbody></table>"
        results, _ = nm.parse_notice_rows(html, "서울대", self._board(), since_date=date(2024, 3, 1))
        assert "2024-01-01" not in [n.date for n in results if n.date]

    def test_until_date_filtering(self):
        html = "<table><tbody><tr><td><a href='/n/1'>공지</a></td><td>2025.01.01</td></tr></tbody></table>"
        results, _ = nm.parse_notice_rows(html, "서울대", self._board(), until_date=date(2024, 12, 31))
        assert results == []

    def test_fallback_to_a_tags(self):
        html = "<html><body><div><a href='/board/read?id=1'>공지사항 제목입니다 긴제목</a></div></body></html>"
        results, _ = nm.parse_notice_rows(html, "서울대", self._board())
        assert len(results) >= 1

    def test_short_title_skipped(self):
        html = "<table><tbody><tr><td><a href='/n/1'>X</a></td></tr></tbody></table>"
        results, _ = nm.parse_notice_rows(html, "서울대", self._board())
        assert results == []

    def test_should_stop_when_no_valid_posts(self):
        html = "<table><tbody><tr><td><a href='/n/1'>공지</a></td><td>2020.01.01</td></tr></tbody></table>"
        _, should_stop = nm.parse_notice_rows(html, "서울대", self._board(), since_date=date(2024, 1, 1))
        assert should_stop is True


# ── load_notices with board_name / category filter ────────────────────────────

class TestLoadNoticesFilters:
    def _setup_sources(self, tmp_path, boards):
        data = {"서울대": {"name": "서울대", "boards": boards}}
        path = tmp_path / "sources.json"
        path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        return nm._load_university_sources(path)

    def test_load_with_board_name(self, tmp_path):
        sources = self._setup_sources(tmp_path, [
            {"board_name": "장학공지", "list_url": "http://snu.ac.kr/s"},
            {"board_name": "학사공지", "list_url": "http://snu.ac.kr/a"},
        ])
        mock_notice = Notice(university="서울대", title="장학 공고", url="http://snu.ac.kr/1", category="장학", date="2024-06-01")
        with patch("notice_model.UNIVERSITY_SOURCES", sources), \
             patch("notice_model.crawl_notice_board", return_value=[mock_notice]):
            result = nm.load_notices(SearchRequest(university="서울대", board_name="장학공지", until="2024-12-31"))
        assert len(result) == 1

    def test_load_with_category_filter(self, tmp_path):
        sources = self._setup_sources(tmp_path, [{"board_name": "전체공지", "list_url": "http://snu.ac.kr/all"}])
        notices = [
            Notice(university="서울대", title="장학금", url="http://u/1", category="장학", date="2024-06-01"),
            Notice(university="서울대", title="수강신청", url="http://u/2", category="학사", date="2024-06-01"),
        ]
        with patch("notice_model.UNIVERSITY_SOURCES", sources), \
             patch("notice_model.crawl_notice_board", return_value=notices):
            result = nm.load_notices(SearchRequest(university="서울대", notice_category="장학", until="2024-12-31", since="2024-01-01"))
        assert all(n.category == "장학" for n in result)


# ── save_sources_to_json ──────────────────────────────────────────────────────

class TestSaveSourcesToJson:
    def test_save_with_explicit_path(self, tmp_path):
        path = tmp_path / "out.json"
        sources = {"A대": UniversitySource(name="A대", boards=[NoticeBoard(board_name="공지", list_url="http://a.com")])}
        nm.save_sources_to_json(sources, path)
        assert "A대" in json.loads(path.read_text(encoding="utf-8"))


# ── analyze_page_urls: enc 디코딩 실패 ───────────────────────────────────────

class TestAnalyzePageUrlsEncFailure:
    def test_enc_analysis_failure_raises(self):
        with pytest.raises(ValueError):
            nm.analyze_page_urls("http://example.com/?enc=invalid!!", "http://example.com/?enc=alsoinvalid!!")

