from typing import List, Optional
from urllib.parse import urljoin, urlencode, urlparse, parse_qs, urlunparse
from datetime import date
import re
import json
import logging
from pathlib import Path

import requests
from bs4 import BeautifulSoup
from pydantic import BaseModel

from logger import app_logger


class NoticeBoard(BaseModel):
    board_name: str
    list_url: str
    page_param: str = "pageIndex"
    max_pages: int = 50
    board_category: str = "기타" #게시판의 고유 카테고리(ex:장학,학사)

class UniversitySource(BaseModel):
    name: str
    boards: List[NoticeBoard]
    categories: Optional[List[str]] = None


class Notice(BaseModel):
    university: str
    title: str
    url: str
    category: str
    board_name: Optional[str] = None
    source_category: Optional[str] = None
    department: Optional[str] = None
    date: Optional[str] = None


class SearchRequest(BaseModel):
    university: str
    category:Optional[str] = None
    since: Optional[str] = None
    until: str
    max_pages: Optional[int] = None

    @property
    def since_date(self) -> Optional[date]:
        return date.fromisoformat(self.since) if self.since else None

    @property
    def until_date(self) -> date:
        return date.fromisoformat(self.until)


CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "장학":       ["장학", "국가장학", "성적우수", "근로장학", "장학금", "scholarship"],
    "학사":       ["학사", "수강", "졸업", "성적", "휴학", "복학", "학점",
                  "재수강", "수료", "논문", "강의", "교육과정"],
    "입학/등록":  ["입학", "등록", "전형", "합격", "신입생", "편입", "원서"],
    "취업/채용":  ["채용", "인턴", "취업", "구인", "커리어",
                   "채용설명회", "job", "리크루팅", "현장실습"],
    "공모전/대회": ["공모전", "대회", "경진", "콘테스트", "해커톤",
                   "공모", "시상", "수상"],
    "모집/봉사":   ["모집", "봉사", "서포터즈", "튜터", "멘토",
                   "지원자", "선발", "학생대표", "위원"],
    "시설/행정":   ["시설", "도서관", "열람실", "wifi", "와이파이",
                   "주차", "셔틀", "기숙사", "식당", "휴관", "공사"],
    "안전": ["코로나", "감염", "안전", "재난", "비상", "방역", "격리"],
}

VALID_CATEGORIES: set[str] = set(CATEGORY_KEYWORDS.keys()) | {"기타", "일반"}

def is_valid_category(category: str) -> bool:
    return category in VALID_CATEGORIES

def classify_notice(title: str, board_name: Optional[str] = None) -> str:
    if board_name:
        board_lower = board_name.lower()
        for category, keywords in CATEGORY_KEYWORDS.items():
            if any(kw in board_lower for kw in keywords):
                return category

    text = title.strip().lower()
    for category, keywords in CATEGORY_KEYWORDS.items():
        if any(kw in text for kw in keywords):
            return category

    return "기타"


def make_notice(
    university: str,
    title: str,
    url: str,
    board_name: Optional[str] = None,
    source_category: Optional[str] = None,
    department: Optional[str] = None,
    date: Optional[str] = None,
) -> Notice:
    clean_title = title.strip()
    clean_department = department.strip() if department else None
    raw_category = source_category if source_category else classify_notice(clean_title, board_name)

    if not is_valid_category(raw_category):
        logger.warning("알 수 없는 카테고리 '%s', 기타로 대체", raw_category)
        raw_category = "기타"

    return Notice(
        university=university,
        title=clean_title,
        url=url,
        category=raw_category,
        board_name=board_name,
        source_category=source_category,
        department=clean_department,
        date=date,
    )


UNIVERSITY_SOURCES = {
    "충북대학교": UniversitySource(
        name="충북대학교",
        boards=[
            NoticeBoard(
                board_name="대학교 전체공지",
                list_url="https://www.cbnu.ac.kr/www/selectBbsNttList.do?bbsNo=8&key=813",
                page_param="pageIndex",
                board_category="일반" 
            ),
        ]
    ),
    "충남대학교": UniversitySource(
        name="충남대학교",
        boards=[
            NoticeBoard(
                board_name="대학교 전체공지",
                list_url="https://plus.cnu.ac.kr/_prog/_board/?code=sub07_0702&site_dvs_cd=kr&menu_dvs_cd=0702",
                page_param="GotoPage",
                board_category="일반"
            ),
            NoticeBoard(
                board_name="장학공지",
                list_url="https://plus.cnu.ac.kr/_prog/_board/?code=sub07_0713&site_dvs_cd=kr&menu_dvs_cd=0713",
                page_param="GotoPage",
                board_category="장학"
            ),
        ]
    ),
}

logger = logging.getLogger(__name__)


_DATE_PATTERN = re.compile(r"(\d{2,4})[.\-/](\d{1,2})[.\-/](\d{1,2})")

def _parse_date(raw: str) -> Optional[date]:
    m = _DATE_PATTERN.search(raw.strip())
    if not m:
        return None
    y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if y < 100:
        y += 2000
    try:
        return date(y, mo, d)
    except ValueError:
        return None

def _extract_date_from_row(row) -> Optional[date]:
    for td in row.find_all("td"):
        parsed = _parse_date(td.get_text(strip=True))
        if parsed:
            return parsed
    return None

def _build_page_url(base_url: str, page_param: str, page: int) -> str:
    parsed = urlparse(base_url)
    params = parse_qs(parsed.query, keep_blank_values=True)
    params[page_param] = [str(page)]
    new_query = urlencode({k: v[0] for k, v in params.items()})
    return urlunparse(parsed._replace(query=new_query))

def fetch_board_html(list_url: str) -> str:
    session = requests.Session()
    session.headers.update({
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/123.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "ko-KR,ko;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    })
    response = session.get(list_url, timeout=20)
    response.raise_for_status()
    if response.apparent_encoding:
        response.encoding = response.apparent_encoding
    return response.text


def parse_notice_rows(html: str, university: str, board: NoticeBoard,
                      until_date: Optional[date] = None,
                      since_date: Optional[date] = None):
    soup = BeautifulSoup(html, "html.parser")
    results: List[Notice] = []
    should_stop = False

    valid_post_count = 0

    rows = soup.select("table tbody tr")

    for row in rows:
        cells = row.find_all("td")
        if not cells:
            continue

        link_tag = row.find("a", href=True)
        if link_tag is None:
            continue

        title = link_tag.get_text(" ", strip=True)
        if not title:
            continue

        raw_href = link_tag["href"].strip()
        if not raw_href:
            continue

        url = urljoin(board.list_url, raw_href)
        notice_date = _extract_date_from_row(row)

        if until_date and notice_date and notice_date > until_date:
            continue
        if since_date and notice_date and notice_date < since_date:
            continue
        valid_post_count += 1

    notice = make_notice(
        university=university,
        title=title,
        url=url,
        board_name=board.board_name,
        source_category=None,
        date=notice_date.isoformat() if notice_date else None,
    )   
        results.append(notice)
   
   if valid_post_count == 0 and len(rows) > 0:
        should_stop = True

    return results, should_stop


def crawl_notice_board(university: str, board: NoticeBoard,
                       until_date: Optional[date] = None,
                       since_date: Optional[date] = None,
                       max_pages: Optional[int] = None) -> List[Notice]:
    all_notices: List[Notice] = []
    seen_urls: set = set()
    limit = max_pages if max_pages is not None else board.max_pages

    for page in range(1, limit + 1):
        page_url = _build_page_url(board.list_url, board.page_param, page)
        logger.info("크롤링 시작: %s / %s (page=%d)", university, board.board_name, page)
        try:
            html = fetch_board_html(page_url)
        except requests.RequestException as e:
            app_logger.error("======== 크롤링 네트워크 장애 발생 ========")
            app_logger.error(f"학교: {university}, URL: {page_url}")
            app_logger.error(f"상세 에러 내용: {str(e)}")
            break
        notices, should_stop = parse_notice_rows(html, university, board, until_date, since_date)

        for notice in notices:
            if notice.url not in seen_urls:
                seen_urls.add(notice.url)
                all_notices.append(notice)

        if should_stop or not notices:
            break

    logger.info("수집 완료: %s / %s 총 %d건", university, board.board_name, len(all_notices))
    if len(all_notices) == 0:
        app_logger.warning(f"크롤링 데이터 없음! 대상: {university} ({board.board_name})")
        app_logger.warning(f"조회 기간: {since_date} ~ {until_date}")
    return all_notices


def load_notices(request: SearchRequest) -> List[Notice]:
    source = UNIVERSITY_SOURCES.get(request.university)
    if source is None:
        return []

    results: List[Notice] = []

    for board in source.boards:
        if request.category and request.category != board.board_category:
            continue
        board_notices = crawl_notice_board(
            source.name, board,
            until_date=request.until_date,
            since_date=request.since_date,
            max_pages=request.max_pages,
        )
        results.extend(board_notices)

    results = filter_by_date_range(
        results,
        since=request.since_date,
        until=request.until_date,
    )
    results.sort(key=lambda n: n.date or "", reverse=True)
    return results


def filter_by_keyword(
    notices: List[Notice],
    keyword: str,
    university: Optional[str] = None,
) -> List[Notice]:
    kw = keyword.strip().lower()
    pool = notices if university is None else [n for n in notices if n.university == university]
    return [n for n in pool if kw in n.title.lower()]


def filter_by_category(
    notices: List[Notice],
    category: str,
    university: Optional[str] = None,
) -> List[Notice]:
    if not is_valid_category(category):
        raise ValueError(f"허용되지 않는 카테고리: {category}")
    pool = notices if university is None else [n for n in notices if n.university == university]
    return [n for n in pool if n.category == category]


def filter_by_date_range(
    notices: List[Notice],
    since: Optional[date] = None,
    until: Optional[date] = None,
    include_undated: bool = True,
) -> List[Notice]:
    result = []
    for n in notices:
        if not n.date:
            if include_undated:
                result.append(n)
            continue
        d = date.fromisoformat(n.date)
        if since and d < since:
            continue
        if until and d > until:
            continue
        result.append(n)
    return result


def summarize_by_category(
    notices: List[Notice],
    sort_by_count: bool = False,
) -> dict[str, int]:
    summary: dict[str, int] = {}
    for notice in notices:
        summary[notice.category] = summary.get(notice.category, 0) + 1
    if sort_by_count:
        summary = dict(sorted(summary.items(), key=lambda x: x[1], reverse=True))
    return summary


def save_notices_to_json(notices: List[Notice], path: str = "notices.json") -> None:
    output = Path(path)
    data = [n.model_dump() for n in notices]
    output.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def load_notices_from_json(path: str = "notices.json") -> List[Notice]:
    output = Path(path)
    raw = json.loads(output.read_text(encoding="utf-8"))
    return [Notice(**item) for item in raw]
