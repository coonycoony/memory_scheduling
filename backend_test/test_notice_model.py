import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'backend'))

import pytest
from datetime import date
from notice_model import (
    is_valid_category,
    classify_notice,
    make_notice,
    _parse_date,
    filter_by_keyword,
    filter_by_category,
    filter_by_date_range,
    summarize_by_category,
    Notice,
    VALID_CATEGORIES,
)


class TestIsValidCategory:
    def test_valid_categories(self):
        for cat in ["장학", "학사", "입학/등록", "취업/채용", "공모전/대회", "모집/봉사", "시설/행정", "안전", "기타"]:
            assert is_valid_category(cat) is True

    def test_invalid_category(self):
        assert is_valid_category("없는카테고리") is False

    def test_empty_string(self):
        assert is_valid_category("") is False


class TestClassifyNotice:
    def test_classify_by_title_scholarship(self):
        assert classify_notice("2024년 국가장학금 신청 안내") == "장학"

    def test_classify_by_title_academic(self):
        assert classify_notice("2024-1 수강신청 일정 안내") == "학사"

    def test_classify_by_title_job(self):
        assert classify_notice("삼성전자 채용설명회 안내") == "취업/채용"

    def test_classify_by_title_contest(self):
        assert classify_notice("전국 대학생 공모전 참가자 모집") == "공모전/대회"

    def test_classify_unknown_returns_기타(self):
        assert classify_notice("공지사항입니다") == "기타"

    def test_classify_by_board_name_takes_priority(self):
        result = classify_notice("공지사항", board_name="장학게시판")
        assert result == "장학"

    def test_classify_safety(self):
        assert classify_notice("코로나 관련 안전 수칙 안내") == "안전"

    def test_classify_facility(self):
        assert classify_notice("도서관 열람실 운영 안내") == "시설/행정"


class TestParseDate:
    def test_parse_standard_date(self):
        assert _parse_date("2024.03.15") == date(2024, 3, 15)

    def test_parse_dash_format(self):
        assert _parse_date("2024-03-15") == date(2024, 3, 15)

    def test_parse_slash_format(self):
        assert _parse_date("2024/03/15") == date(2024, 3, 15)

    def test_parse_two_digit_year(self):
        assert _parse_date("24.03.15") == date(2024, 3, 15)

    def test_parse_invalid_returns_none(self):
        assert _parse_date("날짜없음") is None

    def test_parse_invalid_date_values(self):
        assert _parse_date("2024.13.45") is None

    def test_parse_from_text_with_surrounding(self):
        assert _parse_date("등록기간: 2024.06.01 ~ 2024.06.10") == date(2024, 6, 1)


class TestMakeNotice:
    def test_basic_notice_creation(self):
        n = make_notice(
            university="테스트대학교",
            title="  장학금 신청 안내  ",
            url="http://example.com/notice/1",
        )
        assert n.university == "테스트대학교"
        assert n.title == "장학금 신청 안내"
        assert n.category == "장학"

    def test_title_stripped(self):
        n = make_notice("테스트대학교", "  공지사항  ", "http://example.com/1")
        assert n.title == "공지사항"

    def test_unknown_source_category_falls_back_to_기타(self):
        n = make_notice(
            university="테스트대학교",
            title="공지",
            url="http://example.com/2",
            source_category="알수없음",
        )
        assert n.category == "기타"

    def test_valid_source_category_used(self):
        n = make_notice(
            university="테스트대학교",
            title="공지",
            url="http://example.com/3",
            source_category="학사",
        )
        assert n.category == "학사"

    def test_department_stripped(self):
        n = make_notice("테스트대학교", "공지", "http://example.com/4", department="  컴퓨터공학과  ")
        assert n.department == "컴퓨터공학과"

    def test_none_department_stays_none(self):
        n = make_notice("테스트대학교", "공지", "http://example.com/5")
        assert n.department is None


def _make_notice_obj(**kwargs):
    defaults = dict(university="테스트대학교", title="공지", url="http://example.com/", category="기타")
    defaults.update(kwargs)
    return Notice(**defaults)


class TestFilterByKeyword:
    def setup_method(self):
        self.notices = [
            _make_notice_obj(title="장학금 신청 안내", url="http://a.com/1"),
            _make_notice_obj(title="수강신청 일정", url="http://a.com/2"),
            _make_notice_obj(title="채용 공고", url="http://a.com/3"),
        ]

    def test_filter_by_keyword(self):
        result = filter_by_keyword(self.notices, "신청")
        assert len(result) == 2

    def test_filter_case_insensitive(self):
        notices = [_make_notice_obj(title="Job Fair 안내", url="http://a.com/4")]
        result = filter_by_keyword(notices, "JOB")
        assert len(result) == 1

    def test_filter_no_match(self):
        result = filter_by_keyword(self.notices, "없는키워드")
        assert result == []

    def test_filter_by_university(self):
        notices = [
            _make_notice_obj(university="A대학교", title="장학금", url="http://a.com/5"),
            _make_notice_obj(university="B대학교", title="장학금", url="http://b.com/1"),
        ]
        result = filter_by_keyword(notices, "장학금", university="A대학교")
        assert len(result) == 1
        assert result[0].university == "A대학교"


class TestFilterByCategory:
    def setup_method(self):
        self.notices = [
            _make_notice_obj(category="장학", url="http://a.com/1"),
            _make_notice_obj(category="학사", url="http://a.com/2"),
            _make_notice_obj(category="장학", url="http://a.com/3"),
        ]

    def test_filter_by_valid_category(self):
        result = filter_by_category(self.notices, "장학")
        assert len(result) == 2

    def test_filter_invalid_category_raises(self):
        with pytest.raises(ValueError):
            filter_by_category(self.notices, "없는카테고리")

    def test_filter_by_university(self):
        notices = [
            _make_notice_obj(university="A대학교", category="장학", url="http://a.com/4"),
            _make_notice_obj(university="B대학교", category="장학", url="http://b.com/1"),
        ]
        result = filter_by_category(notices, "장학", university="A대학교")
        assert len(result) == 1


class TestFilterByDateRange:
    def setup_method(self):
        self.notices = [
            _make_notice_obj(date="2024-01-01", url="http://a.com/1"),
            _make_notice_obj(date="2024-06-15", url="http://a.com/2"),
            _make_notice_obj(date="2024-12-31", url="http://a.com/3"),
            _make_notice_obj(date=None, url="http://a.com/4"),
        ]

    def test_filter_since(self):
        result = filter_by_date_range(self.notices, since=date(2024, 6, 1))
        dated = [n for n in result if n.date]
        assert all(n.date >= "2024-06-01" for n in dated)

    def test_filter_until(self):
        result = filter_by_date_range(self.notices, until=date(2024, 6, 30))
        dated = [n for n in result if n.date]
        assert all(n.date <= "2024-06-30" for n in dated)

    def test_include_undated_by_default(self):
        result = filter_by_date_range(self.notices, since=date(2024, 6, 1))
        urls = [n.url for n in result]
        assert "http://a.com/4" in urls

    def test_exclude_undated(self):
        result = filter_by_date_range(self.notices, include_undated=False)
        assert all(n.date is not None for n in result)

    def test_no_filter_returns_all(self):
        result = filter_by_date_range(self.notices)
        assert len(result) == 4


class TestSummarizeByCategory:
    def test_basic_summary(self):
        notices = [
            _make_notice_obj(category="장학", url="http://a.com/1"),
            _make_notice_obj(category="장학", url="http://a.com/2"),
            _make_notice_obj(category="학사", url="http://a.com/3"),
        ]
        summary = summarize_by_category(notices)
        assert summary["장학"] == 2
        assert summary["학사"] == 1

    def test_empty_list(self):
        assert summarize_by_category([]) == {}

    def test_sort_by_count(self):
        notices = [
            _make_notice_obj(category="기타", url="http://a.com/1"),
            _make_notice_obj(category="장학", url="http://a.com/2"),
            _make_notice_obj(category="장학", url="http://a.com/3"),
        ]
        summary = summarize_by_category(notices, sort_by_count=True)
        keys = list(summary.keys())
        assert keys[0] == "장학"
