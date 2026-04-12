from pydantic import BaseModel
from typing import List, Optional


# 학교 내에서 공지사항 게시판 정보
class NoticeBoard(BaseModel):
    board_name: str      # 공지 종류 ex) 대학교 전체공지
    list_url: str        # 해당 공지사항 목록 페이지 URL


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


# 공지 제목으로 구별하는 클래스
# if "내용" in text or "내용" in text: 구조로 세부 수정 가능

def classify_notice(title: str) -> str:
    text = title.strip().lower()

    if "일반" in text:
        return "일반"


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
    #             board_name="공지종류 ex) 컴퓨터공학과 공지"
    #             list_url="url"
    #         ),
    #        공지링크 추가시 NoticeBoard를 계속 추가
    #     ]
    # ),


}
