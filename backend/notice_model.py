from typing import List, Optional
from urllib.parse import urljoin, urlencode, urlparse, parse_qs, urlunparse, quote
from datetime import date
import re
import json
import logging
import base64
import time
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
    enc_inner_path: Optional[str] = None
    enc_query_template: Optional[str] = None


class UniversitySource(BaseModel):
    name: str
    boards: List[NoticeBoard]


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
    board_name: Optional[str] = None
    notice_category: Optional[str] = None
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

VALID_CATEGORIES: set[str] = set(CATEGORY_KEYWORDS.keys()) | {"기타"}

logger = logging.getLogger(__name__)


def is_valid_category(category: str) -> bool:
    return category in VALID_CATEGORIES


def classify_notice(title: str, board_name: Optional[str] = None) -> str:
    if board_name:
        board_lower = board_name.lower()
        for category, keywords in CATEGORY_KEYWORDS.items():
            for kw in sorted(keywords, key=len, reverse=True):
                if kw in board_lower:
                    return category

    text = title.strip().lower()
    best_category = None
    best_pos = len(text)
    best_kw_len = 0

    for category, keywords in CATEGORY_KEYWORDS.items():
        for kw in sorted(keywords, key=len, reverse=True):
            pos = text.find(kw)
            if pos == -1:
                continue
            if pos < best_pos or (pos == best_pos and len(kw) > best_kw_len):
                best_pos = pos
                best_kw_len = len(kw)
                best_category = category

    return best_category if best_category else "기타"


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


SOURCES_PATH = Path(__file__).parent / "sources.json"


def _load_university_sources(path: Path = SOURCES_PATH) -> dict[str, UniversitySource]:
    if not path.exists():
        logger.warning("sources.json 파일이 없습니다: %s", path)
        return {}
    raw: dict = json.loads(path.read_text(encoding="utf-8"))
    return {k: UniversitySource(**v) for k, v in raw.items()}


UNIVERSITY_SOURCES: dict[str, UniversitySource] = _load_university_sources()

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


def _build_page_url(base_url: str, page_param: str, page: int,
                    enc_inner_path: Optional[str] = None,
                    enc_query_template: Optional[str] = None) -> str:
    if enc_inner_path:
        if enc_query_template is None:
            logger.warning(
                "_build_page_url: enc_inner_path 있지만 enc_query_template 없음 "
                "(base_url=%s, page=%d), 'page={page}' 폴백 적용", base_url, page
            )
        query = enc_query_template.format(page=page) if enc_query_template else f"page={page}"
        inner = f"{enc_inner_path}?{query}"
        enc_value = base64.b64encode(("fnct1|@@|" + quote(inner)).encode()).decode()
        return f"{base_url}?enc={enc_value}"

    parsed = urlparse(base_url)
    params = parse_qs(parsed.query, keep_blank_values=True)
    params[page_param] = [str(page)]
    new_query = urlencode({k: v[0] for k, v in params.items()})
    return urlunparse(parsed._replace(query=new_query))


def analyze_page_urls(url1: str, url2: Optional[str] = None) -> dict:
    if url2 is None:
        return {"page_param": "page", "enc_inner_path": None, "enc_query_template": None}

    parsed1 = urlparse(url1)
    parsed2 = urlparse(url2)

    params1 = parse_qs(parsed1.query, keep_blank_values=True)
    params2 = parse_qs(parsed2.query, keep_blank_values=True)

    if "enc" in params1 and "enc" in params2:
        try:
            def decode_enc(enc_val: str) -> str:
                decoded = base64.b64decode(enc_val).decode()
                if "|@@|" in decoded:
                    decoded = decoded.split("|@@|", 1)[1]
                return decoded

            inner1 = decode_enc(params1["enc"][0])
            inner2 = decode_enc(params2["enc"][0])

            parsed_inner1 = urlparse(inner1)
            parsed_inner2 = urlparse(inner2)

            inner_params1 = parse_qs(parsed_inner1.query, keep_blank_values=True)
            inner_params2 = parse_qs(parsed_inner2.query, keep_blank_values=True)

            enc_inner_path = parsed_inner1.path

            page_key = None
            for key in inner_params1:
                if key in inner_params2 and inner_params1[key] != inner_params2[key]:
                    page_key = key
                    break

            if page_key is None:
                page_key = "page"

            template_parts = []
            for key in inner_params1:
                if key == page_key:
                    template_parts.append(f"{key}={{page}}")
                else:
                    template_parts.append(f"{key}={inner_params1[key][0]}")
            enc_query_template = "&".join(template_parts)

            return {
                "page_param": page_key,
                "enc_inner_path": enc_inner_path,
                "enc_query_template": enc_query_template,
            }
        except Exception as e:
            logger.warning("enc 파라미터 분석 실패, 폴백 적용: %s", e)
            return {"page_param": "page", "enc_inner_path": None, "enc_query_template": None}

    for key in params1:
        if key in params2 and params1[key] != params2[key]:
            return {"page_param": key, "enc_inner_path": None, "enc_query_template": None}

    logger.warning("두 URL 간 변경된 파라미터를 찾지 못했습니다. 폴백 적용")
    return {"page_param": "page", "enc_inner_path": None, "enc_query_template": None}


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
    all_dated_count = 0
    out_of_range_count = 0
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

        if notice_date:
            all_dated_count += 1
            if until_date and notice_date > until_date:
                out_of_range_count += 1
                continue
            if since_date and notice_date < since_date:
                out_of_range_count += 1
                continue

        notice = make_notice(
            university=university,
            title=title,
            url=url,
            board_name=board.board_name,
            source_category=None,
            date=notice_date.isoformat() if notice_date else None,
        )
        results.append(notice)

    if all_dated_count > 0 and out_of_range_count == all_dated_count:
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
        page_url = _build_page_url(board.list_url, board.page_param, page, board.enc_inner_path, board.enc_query_template)
        logger.info("크롤링 시작: %s / %s (page=%d)", university, board.board_name, page)
        html = None
        for attempt in range(1, 4):
            try:
                html = fetch_board_html(page_url)
                break
            except requests.RequestException as e:
                app_logger.error(f"======== 크롤링 네트워크 장애 발생 (시도 {attempt}/3) ========")
                app_logger.error(f"학교: {university}, URL: {page_url}")
                app_logger.error(f"상세 에러 내용: {str(e)}")
                if attempt < 3:
                    time.sleep(2 ** (attempt - 1))
        if html is None:
            app_logger.error(f"3회 재시도 모두 실패, 크롤링 중단: {university} / {board.board_name}")
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
        if request.board_name and request.board_name != board.board_name:
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

    if request.notice_category:
        results = filter_by_category(results, request.notice_category)

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


def get_university_list() -> List[str]:
    return list(UNIVERSITY_SOURCES.keys())


def get_board_list(university: str) -> List[str]:
    source = UNIVERSITY_SOURCES.get(university)
    if source is None:
        return []
    return [board.board_name for board in source.boards]


def save_sources_to_json(sources: dict[str, UniversitySource], path: Path = SOURCES_PATH) -> None:
    data = {k: v.model_dump() for k, v in sources.items()}
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def add_board_source(
    university: str,
    board_name: str,
    list_url: str,
    page_param: str = "page",
    max_pages: int = 50,
    enc_inner_path: Optional[str] = None,
    enc_query_template: Optional[str] = None,
) -> None:
    sources = _load_university_sources()
    board = NoticeBoard(
        board_name=board_name,
        list_url=list_url,
        page_param=page_param,
        max_pages=max_pages,
        enc_inner_path=enc_inner_path,
        enc_query_template=enc_query_template,
    )
    if university in sources:
        sources[university].boards.append(board)
    else:
        sources[university] = UniversitySource(name=university, boards=[board])
    save_sources_to_json(sources)
    global UNIVERSITY_SOURCES
    UNIVERSITY_SOURCES = sources
