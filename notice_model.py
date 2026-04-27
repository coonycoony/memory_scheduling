from typing import List, Optional
from urllib.parse import urljoin, urlencode, urlparse, parse_qs, urlunparse
from datetime import date
import re

import requests
from bs4 import BeautifulSoup
from pydantic import BaseModel

# 학교 내에서 공지사항 게시판 정보
class NoticeBoard(BaseModel):
    board_name: str      # 공지 종류 ex) 대학교 전체공지
    list_url: str        # 해당 공지사항 목록 페이지 URL
    page_param: str = "pageIndex"
    max_pages: int = 50


# 학교 정보 구조
class UniversitySource(BaseModel):
    name: str                           # 학교 이름
    boards: List[NoticeBoard]           # 학교 내 여러 공지 게시판 목록
    categories: Optional[List[str]] = None   # 장학금, 봉사, 행사 같은 공지 분류 목록


# 공지사항 구조
# 나중에 HTML이나 백엔드에서 공통으로 사용할 데이터 형태
class Notice(BaseModel):
    university: str           # 학교 이름
    title: str                # 공지 제목
    url: str                  # 공지 상세 링크
    category: str             # 제목 기준 자동 분류 결과
    board_name: Optional[str] = None        # 게시판 이름
    source_category: Optional[str] = None   # 학교 사이트 원본 카테고리
    department: Optional[str] = None        # 작성 부서
    date: Optional[str] = None              # 작성일


# 검색 입력 구조
# 나중에 사용자가 학교명을 입력하면 이 구조로 전달 가능
class SearchRequest(BaseModel):
    university: str
    until: str  # "YYYY-MM-DD" 형식, 해당 날짜 이후 공지만 수집

    @property
    def until_date(self) -> date:
        return date.fromisoformat(self.until)


# 공지 제목으로 구별하는 함수
# if "내용" in text or "내용" in text: 구조로 세부 수정 가능
# 현재 분류기준은 충북대 전체 공지 분류 기준임
# https://www.cbnu.ac.kr/www/selectBbsNttList.do?bbsNo=8&key=813
def classify_notice(title: str) -> str:
    text = title.strip().lower()

    if "일반" in text:
        return "일반"
    elif "학사" in text or "장학" in text:
        return "학사/장학"
    elif "입학" in text or "등록" in text:
        return "입학/등록"
    elif "채용" in text or "인사" in text:
        return "채용/인사"
    elif "행사" in text or "세미나" in text:
        return "행사/세미나"
    elif "모집" in text or "공고" in text:
        return "모집/공고"
    else:
        return "기타"


# 크롤링으로 얻은 데이터를 Notice 객체 형태로 변환
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

    return Notice(
        university=university,
        title=clean_title,
        url=url,
        category=source_category if source_category else classify_notice(clean_title),
        board_name=board_name,
        source_category=source_category,
        department=department,
        date=date,
    )


# 학교별 공지 목록 URL 저장
# 학교가 늘어나면 boards 안에 게시판을 추가
UNIVERSITY_SOURCES = {
    "충북대학교": UniversitySource(
        name="충북대학교",
        boards=[
            NoticeBoard(
                board_name="대학교 전체공지",
                list_url="https://www.cbnu.ac.kr/www/selectBbsNttList.do?bbsNo=8&key=813"
            ),
        ]
    ),
    # "대학교명": UniversitySource(
    #     name="대학교명",
    #     boards=[
    #         NoticeBoard(
    #             board_name="공지종류 ex) 대학교 전체공지",
    #             list_url="url"
    #         ),
    #         NoticeBoard(
    #             board_name="공지종류 ex) 컴퓨터공학과 공지",
    #             list_url="url"
    #         ),
    #        공지링크 추가시 NoticeBoard를 계속 추가
    #     ]
    # ),
}


# 크롤링 함수
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
    response = requests.get(
        list_url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/123.0.0.0 Safari/537.36"
            )
        },
        timeout=10,
    )
    response.raise_for_status()

    if response.apparent_encoding:
        response.encoding = response.apparent_encoding

    return response.text


def parse_notice_rows(html: str, university: str, board: NoticeBoard, until_date: Optional[date] = None):
    soup = BeautifulSoup(html, "html.parser")
    results: List[Notice] = []
    should_stop = False

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

        if until_date and notice_date and notice_date < until_date:
            should_stop = True
            break

        notice = make_notice(
            university=university,
            title=title,
            url=url,
            board_name=board.board_name,
            date=notice_date.isoformat() if notice_date else None,
        )
        results.append(notice)

    return results, should_stop

def crawl_notice_board(university: str, board: NoticeBoard, until_date: Optional[date] = None) -> List[Notice]:
    all_notices: List[Notice] = []
    seen_urls: set = set()

    for page in range(1, board.max_pages + 1):
        page_url = _build_page_url(board.list_url, board.page_param, page)
        html = fetch_board_html(page_url)
        notices, should_stop = parse_notice_rows(html, university, board, until_date)

        for notice in notices:
            if notice.url not in seen_urls:
                seen_urls.add(notice.url)
                all_notices.append(notice)

        if should_stop or not notices:
            break

    return all_notices


def load_notices(request: SearchRequest) -> List[Notice]:
    source = UNIVERSITY_SOURCES.get(request.university)
    if source is None:
        return []

    results: List[Notice] = []

    for board in source.boards:
        board_notices = crawl_notice_board(source.name, board, request.until_date)
        results.extend(board_notices)

    results.sort(key=lambda n: n.date or "", reverse=True)
    return results
