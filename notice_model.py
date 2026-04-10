from pydantic import BaseModel
from typing import List, Optional


# 학교 정보 구조
# 나중에 학교명과 공지 목록 페이지 URL을 연결할 때 사용
class UniversitySource(BaseModel):
    name: str                 # 학교 이름
    list_url: str             # 공지사항 목록 페이지 URL


# 공지사항  구조
# 나중에 HTML이나 백엔드에서 공통으로 사용할 데이터 형태
class Notice(BaseModel):
    university: str           # 학교 이름
    title: str                # 공지 제목
    url: str                  # 공지 상세 링크
    category: str             # 제목 기준 자동 분류 결과
    source_category: Optional[str] = None   # 학교 사이트 원본 카테고리
    department: Optional[str] = None        # 작성 부서
    date: Optional[str] = None              # 작성일


# 검색 입력 구조
# 나중에 사용자가 학교명을 입력하면 이 구조로 전달 가능
class SearchRequest(BaseModel):
    university: str


# 학교별 공지 목록 URL 저장
# 나중에 학교가 늘어나면 여기만 추가
UNIVERSITY_SOURCES = {
    "충북대학교": UniversitySource(
        name="충북대학교",
        list_url="https://www.cbnu.ac.kr/www/selectBbsNttList.do?bbsNo=8&key=813"
    ),
    # "전북대학교": UniversitySource(
    #     name="전북대학교",
    #     list_url="여기에 전북대학교 공지 목록 URL 추가"
    # ),
}


# 공지 분류용 키워드
CATEGORY_KEYWORDS = {
    "장학금": ["장학", "장학생", "장학금", "등록금", "학비"],
    "공모전": ["공모전", "공모", "아이디어 공모", "콘텐츠 공모"],
    "대회": ["경진대회", "대회"],
    "봉사": ["봉사", "자원봉사", "봉사활동", "해외봉사"],
    "행사": ["행사", "세미나", "특강", "설명회", "박람회", "캠페인"],
    "모집": ["모집", "참여자 모집", "홍보단", "서포터즈", "선발"],
    "채용": ["채용", "초빙", "전임교원", "면접시험", "합격자"],
}


def classify_notice(title: str, source_category: Optional[str] = None) -> str:
    # 제목에서 먼저 분류
    normalized_title = title.strip().lower()

    for category, keywords in CATEGORY_KEYWORDS.items():
        for keyword in keywords:
            if keyword.lower() in normalized_title:
                return category

    # 제목으로 판단이 어려우면 학교 원본 카테고리 참고
    if source_category:
        if "학사" in source_category or "장학" in source_category:
            return "장학금"
        if "모집" in source_category or "공모" in source_category:
            return "모집"
        if "행사" in source_category or "세미나" in source_category:
            return "행사"
        if "채용" in source_category or "인사" in source_category:
            return "채용"
        if "입학" in source_category or "등록" in source_category:
            return "학사"

    return "기타"


def get_university_source(university: str) -> Optional[UniversitySource]:
    # 학교명으로 공지 목록 URL 조회
    return UNIVERSITY_SOURCES.get(university)


def load_notices_by_university(university: str) -> List[Notice]:
    # 나중에 실제 크롤러 함수가 여기서 공지 목록을 가져오게 됨
    source = get_university_source(university)
    if not source:
        return []

    # TODO:
    # 여기에 실제 크롤링 결과를 넣을 예정
    # 예:
    # raw_notices = crawl_notice_list(source.list_url, university)

    raw_notices = [
        # 나중에 크롤러가 아래 형식으로 결과를 반환
        # {
        #     "university": university,
        #     "title": "2026학년도 1학기 천사장학생 선발 안내",
        #     "url": "상세 공지 링크",
        #     "source_category": "학사/장학",
        #     "department": "학생과",
        #     "date": "2026-04-10"
        # },
    ]

    results: List[Notice] = []

    for item in raw_notices:
        results.append(
            Notice(
                university=item["university"],
                title=item["title"],
                url=item["url"],
                category=classify_notice(
                    title=item["title"],
                    source_category=item.get("source_category")
                ),
                source_category=item.get("source_category"),
                department=item.get("department"),
                date=item.get("date"),
            )
        )

    return results











