import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'backend'))

import pytest
import json
import base64
import tempfile
from datetime import date
from pathlib import Path
from unittest.mock import patch, MagicMock
from bs4 import BeautifulSoup

import requests as req_lib

from notice_model import (
    fetch_board_html,
    parse_notice_rows,
    crawl_notice_board,
    load_notices,
    filter_by_keyword,
    filter_by_category,
    filter_by_date_range,
    save_notices_to_json,
    load_notices_from_json,
    get_university_list,
    get_board_list,
    save_sources_to_json,
    add_board_source,
    analyze_page_urls,
    _build_page_url,
    _extract_date_from_row,
    _load_university_sources,
    Notice,
    NoticeBoard,
    UniversitySource,
    SearchRequest,
)


# ─── 헬퍼 ────────────────────────────────────────────────────────────────────

def _make_board(**kwargs):
    defaults = dict(
        board_name="공지사항",
        list_url="http://example.com/board",
        page_param="pageIndex",
        max_pages=3,
    )
    defaults.update(kwargs)
    return NoticeBoard(**defaults)


SIMPLE_HTML = """
<html><body>
<table>
  <tbody>
    <tr><td><a href="/notice/1">장학금 신청 안내</a></td><td>2024.06.01</td></tr>
    <tr><td><a href="/notice/2">수강신청 일정 공지</a></td><td>2024.05.15</td></tr>
    <tr><td><a href="/notice/3">채용 설명회 안내</a></td><td>2024.04.01</td></tr>
  </tbody>
</table>
</body></html>
"""

EMPTY_HTML = "<html><body><p>공지사항이 없습니다.</p></body></html>"

NO_LINK_HTML = """
<html><body>
<table><tbody>
  <tr><td>링크없는 행</td></tr>
</tbody></table>
</body></html>
"""


# ─── fetch_board_html ─────────────────────────────────────────────────────────

class TestFetchBoardHtml:
    def test_returns_html_on_success(self):
        mock_resp = MagicMock()
        mock_resp.text = "<html>OK</html>"
        mock_resp.apparent_encoding = "utf-8"
        with patch("notice_model.requests.Session") as MockSession:
            MockSession.return_value.__enter__ = lambda s: MockSession.return_value
            MockSession.return_value.__exit__ = MagicMock(return_value=False)
            instance = MockSession.return_value
            instance.get.return_value = mock_resp
            result = fetch_board_html("http://example.com/board")
        assert result == "<html>OK</html>"

    def test_raises_on_http_error(self):
        with patch("notice_model.requests.Session") as MockSession:
            instance = MockSession.return_value
            instance.get.side_effect = req_lib.RequestException("연결 실패")
            with pytest.raises(req_lib.RequestException):
                fetch_board_html("http://example.com/bad")

    def test_encoding_set_from_apparent(self):
        mock_resp = MagicMock()
        mock_resp.text = "내용"
        mock_resp.apparent_encoding = "euc-kr"
        with patch("notice_model.requests.Session") as MockSession:
            instance = MockSession.return_value
            instance.get.return_value = mock_resp
            fetch_board_html("http://example.com/board")
        assert mock_resp.encoding == "euc-kr"


# ─── _build_page_url ──────────────────────────────────────────────────────────

class TestBuildPageUrl:
    def test_adds_page_param(self):
        url = _build_page_url("http://example.com/board?foo=bar", "pageIndex", 2)
        assert "pageIndex=2" in url
        assert "foo=bar" in url

    def test_replaces_existing_page_param(self):
        url = _build_page_url("http://example.com/board?pageIndex=1", "pageIndex", 5)
        assert "pageIndex=5" in url
        assert "pageIndex=1" not in url

    def test_enc_mode_builds_base64_url(self):
        from urllib.parse import unquote
        url = _build_page_url(
            "http://example.com/board",
            "pageIndex",
            2,
            enc_inner_path="/inner/path",
            enc_query_template="pageIndex={page}&size=10",
        )
        assert "enc=" in url
        enc_val = url.split("enc=")[1]
        decoded = unquote(base64.b64decode(enc_val).decode())
        assert "pageIndex=2" in decoded

    def test_enc_mode_fallback_without_template(self):
        url = _build_page_url(
            "http://example.com/board",
            "pageIndex",
            3,
            enc_inner_path="/inner/path",
            enc_query_template=None,
        )
        assert "enc=" in url


# ─── _extract_date_from_row ───────────────────────────────────────────────────

class TestExtractDateFromRow:
    def test_extracts_date_from_row(self):
        soup = BeautifulSoup("<tr><td>2024.06.01</td></tr>", "html.parser")
        row = soup.find("tr")
        result = _extract_date_from_row(row)
        assert result == date(2024, 6, 1)

    def test_returns_none_when_no_date(self):
        soup = BeautifulSoup("<tr><td>날짜없는 행</td></tr>", "html.parser")
        row = soup.find("tr")
        result = _extract_date_from_row(row)
        assert result is None


# ─── parse_notice_rows ────────────────────────────────────────────────────────

class TestParseNoticeRows:
    def test_parses_notices_from_html(self):
        board = _make_board()
        results, should_stop = parse_notice_rows(SIMPLE_HTML, "테스트대학교", board)
        assert len(results) == 3
        assert should_stop is False

    def test_empty_html_returns_empty_with_stop(self):
        board = _make_board()
        results, should_stop = parse_notice_rows(EMPTY_HTML, "테스트대학교", board)
        assert results == []

    def test_skips_rows_without_links(self):
        board = _make_board()
        results, _ = parse_notice_rows(NO_LINK_HTML, "테스트대학교", board)
        assert results == []

    def test_filters_until_date(self):
        board = _make_board()
        results, _ = parse_notice_rows(
            SIMPLE_HTML, "테스트대학교", board,
            until_date=date(2024, 5, 31),
        )
        urls = [n.url for n in results]
        assert not any("notice/1" in u for u in urls)

    def test_filters_since_date_sets_stop(self):
        board = _make_board()
        results, should_stop = parse_notice_rows(
            SIMPLE_HTML, "테스트대학교", board,
            since_date=date(2024, 6, 1),
        )
        assert should_stop is True

    def test_url_joined_with_base(self):
        board = _make_board(list_url="http://example.com/board")
        results, _ = parse_notice_rows(SIMPLE_HTML, "테스트대학교", board)
        assert all(n.url.startswith("http://example.com") for n in results)

    def test_fallback_selector_used(self):
        html = """
        <html><body>
        <div>
          <a href="/board/read/1">공지사항 제목입니다 긴제목</a>
        </div>
        </body></html>
        """
        board = _make_board(selector=".nonexistent")
        results, _ = parse_notice_rows(html, "테스트대학교", board)
        assert len(results) >= 1

    def test_skips_short_title(self):
        html = """
        <html><body>
        <table><tbody>
          <tr><td><a href="/notice/1">A</a></td></tr>
        </tbody></table>
        </body></html>
        """
        board = _make_board()
        results, _ = parse_notice_rows(html, "테스트대학교", board)
        assert results == []

    def test_skips_empty_href(self):
        html = """
        <html><body>
        <table><tbody>
          <tr><td><a href="">공지사항 제목입니다</a></td></tr>
        </tbody></table>
        </body></html>
        """
        board = _make_board()
        results, _ = parse_notice_rows(html, "테스트대학교", board)
        assert results == []


# ─── crawl_notice_board ───────────────────────────────────────────────────────

class TestCrawlNoticeBoard:
    def test_returns_notices(self):
        board = _make_board(max_pages=1)
        with patch("notice_model.fetch_board_html", return_value=SIMPLE_HTML):
            results = crawl_notice_board("테스트대학교", board)
        assert len(results) == 3

    def test_deduplicates_urls_across_pages(self):
        board = _make_board(max_pages=2)
        with patch("notice_model.fetch_board_html", return_value=SIMPLE_HTML):
            results = crawl_notice_board("테스트대학교", board)
        urls = [n.url for n in results]
        assert len(urls) == len(set(urls))

    def test_stops_on_network_error_after_retry(self):
        board = _make_board(max_pages=1)
        with patch("notice_model.fetch_board_html", side_effect=req_lib.RequestException("fail")):
            with patch("notice_model.time.sleep"):
                results = crawl_notice_board("테스트대학교", board)
        assert results == []

    def test_stops_when_no_valid_posts(self):
        board = _make_board(max_pages=3)
        call_count = 0

        def side_effect(url):
            nonlocal call_count
            call_count += 1
            return SIMPLE_HTML if call_count == 1 else EMPTY_HTML

        with patch("notice_model.fetch_board_html", side_effect=side_effect):
            results = crawl_notice_board("테스트대학교", board)
        assert call_count == 2

    def test_respects_since_date_filter(self):
        board = _make_board(max_pages=1)
        with patch("notice_model.fetch_board_html", return_value=SIMPLE_HTML):
            results = crawl_notice_board(
                "테스트대학교", board,
                since_date=date(2024, 6, 1),
                until_date=date(2024, 12, 31),
            )
        assert all(n.date is None or n.date >= "2024-06-01" for n in results)


# ─── load_notices ─────────────────────────────────────────────────────────────

class TestLoadNotices:
    def _make_request(self, university="테스트대학교", **kwargs):
        defaults = dict(university=university, until="2024-12-31")
        defaults.update(kwargs)
        return SearchRequest(**defaults)

    def test_returns_empty_for_unknown_university(self):
        request = self._make_request(university="없는대학교")
        result = load_notices(request)
        assert result == []

    def test_returns_notices_for_known_university(self):
        mock_source = UniversitySource(
            name="테스트대학교",
            boards=[_make_board()]
        )
        with patch("notice_model.UNIVERSITY_SOURCES", {"테스트대학교": mock_source}):
            with patch("notice_model.crawl_notice_board", return_value=[
                Notice(university="테스트대학교", title="공지", url="http://a.com/1", category="장학", date="2024-06-01"),
            ]):
                result = load_notices(self._make_request())
        assert len(result) >= 1

    def test_filters_by_board_name(self):
        board = _make_board(board_name="장학게시판")
        mock_source = UniversitySource(name="테스트대학교", boards=[board])
        with patch("notice_model.UNIVERSITY_SOURCES", {"테스트대학교": mock_source}):
            with patch("notice_model.crawl_notice_board", return_value=[]) as mock_crawl:
                load_notices(self._make_request(board_name="장학게시판"))
        mock_crawl.assert_called_once()

    def test_filters_by_notice_category(self):
        mock_source = UniversitySource(name="테스트대학교", boards=[_make_board()])
        notices = [
            Notice(university="테스트대학교", title="장학", url="http://a.com/1", category="장학", date="2024-06-01"),
            Notice(university="테스트대학교", title="학사", url="http://a.com/2", category="학사", date="2024-06-01"),
        ]
        with patch("notice_model.UNIVERSITY_SOURCES", {"테스트대학교": mock_source}):
            with patch("notice_model.crawl_notice_board", return_value=notices):
                result = load_notices(self._make_request(notice_category="장학"))
        assert all(n.category == "장학" for n in result)


# ─── save/load JSON ───────────────────────────────────────────────────────────

class TestSaveLoadJson:
    def test_save_and_load_notices(self):
        notices = [
            Notice(university="테스트대학교", title="공지1", url="http://a.com/1", category="장학", date="2024-06-01"),
            Notice(university="테스트대학교", title="공지2", url="http://a.com/2", category="학사", date="2024-06-02"),
        ]
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False, mode="w") as f:
            path = f.name
        try:
            save_notices_to_json(notices, path)
            loaded = load_notices_from_json(path)
        finally:
            os.unlink(path)
        assert len(loaded) == 2
        assert loaded[0].title == "공지1"
        assert loaded[1].category == "학사"


# ─── get_university_list / get_board_list ──────────────────────────────────────

class TestUniversityBoardListFromSources:
    def test_get_university_list(self):
        mock_sources = {
            "A대학교": UniversitySource(name="A대학교", boards=[]),
            "B대학교": UniversitySource(name="B대학교", boards=[]),
        }
        with patch("notice_model.UNIVERSITY_SOURCES", mock_sources):
            result = get_university_list()
        assert set(result) == {"A대학교", "B대학교"}

    def test_get_board_list_known_university(self):
        boards = [_make_board(board_name="장학"), _make_board(board_name="학사")]
        mock_sources = {"A대학교": UniversitySource(name="A대학교", boards=boards)}
        with patch("notice_model.UNIVERSITY_SOURCES", mock_sources):
            result = get_board_list("A대학교")
        assert result == ["장학", "학사"]

    def test_get_board_list_unknown_university(self):
        with patch("notice_model.UNIVERSITY_SOURCES", {}):
            result = get_board_list("없는대학교")
        assert result == []


# ─── _load_university_sources ─────────────────────────────────────────────────

class TestLoadUniversitySources:
    def test_returns_empty_when_file_missing(self):
        result = _load_university_sources(Path("/nonexistent/path/sources.json"))
        assert result == {}

    def test_loads_valid_json(self):
        data = {
            "테스트대학교": {
                "name": "테스트대학교",
                "boards": [{"board_name": "공지", "list_url": "http://a.com/board"}]
            }
        }
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False, mode="w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
            path = Path(f.name)
        try:
            result = _load_university_sources(path)
        finally:
            path.unlink()
        assert "테스트대학교" in result

    def test_warns_on_key_name_mismatch(self):
        data = {
            "키이름": {
                "name": "다른이름",
                "boards": []
            }
        }
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False, mode="w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
            path = Path(f.name)
        try:
            result = _load_university_sources(path)
        finally:
            path.unlink()
        assert "키이름" in result


# ─── save_sources_to_json ─────────────────────────────────────────────────────

class TestSaveSourcesToJson:
    def test_saves_sources(self):
        sources = {
            "테스트대학교": UniversitySource(
                name="테스트대학교",
                boards=[_make_board()]
            )
        }
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
            path = Path(f.name)
        try:
            save_sources_to_json(sources, path)
            loaded = json.loads(path.read_text(encoding="utf-8"))
        finally:
            path.unlink()
        assert "테스트대학교" in loaded


# ─── add_board_source ─────────────────────────────────────────────────────────

class TestAddBoardSource:
    def test_adds_new_university_and_board(self):
        saved = {}

        def fake_save(sources, path=None):
            saved.update(sources)

        with patch("notice_model._load_university_sources", return_value={}):
            with patch("notice_model.save_sources_to_json", side_effect=fake_save):
                add_board_source("새대학교", "공지사항", "http://example.com/board")

        assert "새대학교" in saved
        assert saved["새대학교"].boards[0].board_name == "공지사항"

    def test_adds_board_to_existing_university(self):
        existing = {
            "기존대학교": UniversitySource(
                name="기존대학교",
                boards=[_make_board(board_name="기존게시판")]
            )
        }
        saved = {}

        def fake_save(sources, path=None):
            saved.update(sources)

        with patch("notice_model._load_university_sources", return_value=existing):
            with patch("notice_model.save_sources_to_json", side_effect=fake_save):
                add_board_source("기존대학교", "새게시판", "http://a.com/new")

        board_names = [b.board_name for b in saved["기존대학교"].boards]
        assert "새게시판" in board_names

    def test_skips_duplicate_board(self):
        existing = {
            "기존대학교": UniversitySource(
                name="기존대학교",
                boards=[_make_board(board_name="공지사항")]
            )
        }
        saved = {}

        def fake_save(sources, path=None):
            saved.update(sources)

        with patch("notice_model._load_university_sources", return_value=existing):
            with patch("notice_model.save_sources_to_json", side_effect=fake_save):
                add_board_source("기존대학교", "공지사항", "http://a.com/dup")

        # save should not have been called (early return)
        assert saved == {}


# ─── analyze_page_urls ────────────────────────────────────────────────────────

class TestAnalyzePageUrls:
    def test_single_url_returns_default(self):
        result = analyze_page_urls("http://example.com/board?page=1")
        assert result["page_param"] == "page"
        assert result["enc_inner_path"] is None

    def test_finds_differing_param(self):
        result = analyze_page_urls(
            "http://example.com/board?pageIndex=1&size=10",
            "http://example.com/board?pageIndex=2&size=10",
        )
        assert result["page_param"] == "pageIndex"

    def test_raises_on_domain_mismatch(self):
        with pytest.raises(ValueError, match="도메인"):
            analyze_page_urls(
                "http://a.com/board?page=1",
                "http://b.com/board?page=2",
            )

    def test_raises_when_no_diff_param(self):
        with pytest.raises(ValueError):
            analyze_page_urls(
                "http://example.com/board?foo=bar",
                "http://example.com/board?foo=bar",
            )

    def test_enc_url_analysis(self):
        def _encode(inner_path, query):
            inner = f"{inner_path}?{query}"
            return base64.b64encode(("fnct1|@@|" + inner).encode()).decode()

        enc1 = _encode("/inner/path", "pageIndex=1&size=10")
        enc2 = _encode("/inner/path", "pageIndex=2&size=10")
        url1 = f"http://example.com/board?enc={enc1}"
        url2 = f"http://example.com/board?enc={enc2}"
        result = analyze_page_urls(url1, url2)
        assert result["enc_inner_path"] == "/inner/path"
        assert "pageIndex={page}" in result["enc_query_template"]

    def test_enc_url_no_differing_param_raises(self):
        def _encode(inner_path, query):
            inner = f"{inner_path}?{query}"
            return base64.b64encode(("fnct1|@@|" + inner).encode()).decode()

        enc1 = _encode("/inner/path", "size=10")
        enc2 = _encode("/inner/path", "size=10")
        url1 = f"http://example.com/board?enc={enc1}"
        url2 = f"http://example.com/board?enc={enc2}"
        with pytest.raises(ValueError):
            analyze_page_urls(url1, url2)

    def test_enc_url_invalid_base64_raises(self):
        url1 = "http://example.com/board?enc=NOT_VALID_BASE64!!!"
        url2 = "http://example.com/board?enc=ALSO_NOT_VALID!!!"
        with pytest.raises(ValueError):
            analyze_page_urls(url1, url2)

    def test_enc_url_unexpected_exception_raises_value_error(self):
        def _encode(inner_path, query):
            inner = f"{inner_path}?{query}"
            return base64.b64encode(("fnct1|@@|" + inner).encode()).decode()

        enc1 = _encode("/inner/path", "pageIndex=1&size=10")
        enc2 = _encode("/inner/path", "pageIndex=2&size=10")
        url1 = f"http://example.com/board?enc={enc1}"
        url2 = f"http://example.com/board?enc={enc2}"

        with patch("notice_model.base64.b64decode", side_effect=OSError("io error")):
            with pytest.raises(ValueError, match="enc URL 분석에 실패했습니다"):
                analyze_page_urls(url1, url2)
