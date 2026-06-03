from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from datetime import date, timedelta
from typing import Optional

from notice_model import (
    load_notices, SearchRequest, add_board_source, analyze_page_urls, Notice, 
    is_valid_category, check_sso_required, check_js_pagination, 
    UNIVERSITY_SOURCES, save_sources_to_json
)

from middleware import log_requests_middleware
from logger import app_logger

from database import engine, Base
import models
from sqlalchemy.orm import Session
from database import get_db
import crud
import json
import os

from pydantic import BaseModel

app = FastAPI()
models.Base.metadata.create_all(bind=engine)
app.middleware("http")(log_requests_middleware)

@app.on_event("startup")
async def startup_event():
    app_logger.info("서버가 성공적으로 시작되었습니다. 로그 기록을 시작합니다.")

@app.on_event("shutdown")
async def shutdown_event():
    app_logger.info("서버가 안전하게 종료되었습니다.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,  
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/universities")
def get_universities():
    if os.path.exists("sources.json"):
        with open("sources.json", "r", encoding="utf-8") as f:
            data = json.load(f)
        return list(data.keys())
    return []

@app.get("/boards")
def get_boards(university: str):
    if os.path.exists("sources.json"):
        with open("sources.json", "r", encoding="utf-8") as f:
            data = json.load(f)
        if university in data:
            return [board["board_name"] for board in data[university]["boards"]]
    return []


@app.get("/notices")
def get_notices(
    university: str,
    board: Optional[str] = None,       
    category: Optional[str] = None,    
    days: int = 30,                    # 프론트엔드가 보내는 days 파라미터 (기본값 30)
    limit: int = 500,                  
    db: Session = Depends(get_db)
):
    
    if board and category:
        raise HTTPException(status_code=400, detail="board와 category 파라미터는 동시에 사용할 수 없습니다.")

    if category and not is_valid_category(category):
        raise HTTPException(status_code=400, detail=f"허용되지 않는 카테고리입니다: '{category}'")
    
    try:
        # days 값을 바탕으로 자동으로 since 와 until 을 계산
        if days < 1:
            raise ValueError("조회 기간(days)은 1일 이상이어야 합니다.")
            
        today_str = date.today().isoformat()
        since_str = (date.today() - timedelta(days=days)).isoformat()
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    request_data = SearchRequest(
        university=university,
        board_name=board,           
        notice_category=category,   
        since=since_str,
        until=today_str
    )

    try:
        results = load_notices(request_data)
    except Exception as e:
        app_logger.error(f"공지사항 크롤링 중 치명적 에러 발생: {e}")
        raise HTTPException(status_code=500, detail="서버에서 공지사항을 수집하는 중 오류가 발생했습니다.")

    # DB 동기화
    if results:
        inserted_count = crud.bulk_insert_notices(db, results)
        app_logger.info(f"새로운 공지사항 {inserted_count}건을 DB에 동기화했습니다.")
    else:
        app_logger.warning("크롤링된 새 데이터가 없어 DB 동기화를 생략합니다.")

    return results


class AddSourceRequest(BaseModel):
    university: str
    board_name: str
    url1: str
    url2: Optional[str] = None
    max_pages: int = 50

@app.post("/sources/url")
def add_source(req: AddSourceRequest):
    try:
        params = analyze_page_urls(req.url1, req.url2)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    from urllib.parse import urlparse, urlunparse
    parsed = urlparse(req.url1)
    base_url = urlunparse(parsed._replace(query="", fragment=""))

    if check_js_pagination(req.url1):
        raise HTTPException(status_code=400, detail="해당 URL은 JavaScript 기반 페이지네이션을 사용하여 크롤링이 불가능합니다.")

    if check_sso_required(req.url1):
        raise HTTPException(status_code=403, detail="해당 URL은 로그인(SSO)이 필요한 페이지입니다. 공개 접근 가능한 URL을 사용해주세요.")

    add_board_source(
        university=req.university,
        board_name=req.board_name,
        list_url=base_url,
        page_param=params["page_param"],
        max_pages=req.max_pages,
        enc_inner_path=params["enc_inner_path"],
        enc_query_template=params["enc_query_template"],
    )
    return {"message": f"{req.university} - {req.board_name} 추가 완료"}

@app.delete("/sources")
def delete_source(university: str, board_name: str):
    # 1. 학교가 메모리에 존재하는지 확인
    if university not in UNIVERSITY_SOURCES:
        raise HTTPException(status_code=404, detail="해당 학교를 찾을 수 없습니다.")

    source = UNIVERSITY_SOURCES[university]
    
    # 2. 지우려는 게시판이 존재하는지 확인
    board_exists = any(b.board_name == board_name for b in source.boards)
    if not board_exists:
        raise HTTPException(status_code=404, detail="해당 게시판을 찾을 수 없습니다.")

    # 3. 게시판 리스트에서 해당 게시판만 쏙 빼고 재구성
    source.boards = [b for b in source.boards if b.board_name != board_name]

    # 4. 만약 이 게시판을 지워서 해당 학교의 게시판이 0개가 된다면, 학교 카테고리 자체를 삭제
    if len(source.boards) == 0:
        del UNIVERSITY_SOURCES[university]

    # 5. sources.json 파일에 변경사항 덮어쓰기
    try:
        save_sources_to_json(UNIVERSITY_SOURCES)
        app_logger.info(f"크롤링 소스 삭제 완료: {university} - {board_name}")
        return {"message": f"'{university}'의 '{board_name}' 게시판이 성공적으로 삭제되었습니다."}
    except Exception as e:
        app_logger.error(f"소스 삭제 중 JSON 저장 오류: {str(e)}")
        raise HTTPException(status_code=500, detail="게시판 정보를 갱신하는 중 서버 오류가 발생했습니다.")

@app.get("/health")
def health_check():
    return {"status": "ok", "message": "Server is running smoothly."}


class ScheduleCreate(BaseModel):
    date: str
    main_category: str
    title: str
    sub_category: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    memo: Optional[str] = None
    url: Optional[str] = None

class ScheduleUpdate(BaseModel):
    date: Optional[str] = None
    main_category: Optional[str] = None
    title: Optional[str] = None
    sub_category: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    memo: Optional[str] = None
    url: Optional[str] = None

@app.post("/schedules")
def create_schedule_api(req: ScheduleCreate, db: Session = Depends(get_db)):
    return crud.create_schedule(
        db=db,
        date=req.date,
        main_category=req.main_category,
        title=req.title,
        sub_category=req.sub_category,
        start_date=req.start_date,
        end_date=req.end_date,
        memo=req.memo,
        url=req.url
    )

@app.get("/schedules")
def get_schedules_api(main_category: Optional[str] = None, skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return crud.get_schedules(db=db, main_category=main_category, skip=skip, limit=limit)

@app.put("/schedules/{schedule_id}")
def update_schedule_api(schedule_id: int, req: ScheduleUpdate, db: Session = Depends(get_db)):
    update_data = req.model_dump(exclude_unset=True) 
    updated_schedule = crud.update_schedule(db=db, schedule_id=schedule_id, update_data=update_data)
    
    if not updated_schedule:
        raise HTTPException(status_code=404, detail="해당 일정을 찾을 수 없습니다.")
    return updated_schedule

@app.delete("/schedules/{schedule_id}")
def delete_schedule_api(schedule_id: int, db: Session = Depends(get_db)):
    deleted = crud.delete_schedule(db=db, schedule_id=schedule_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="해당 일정을 찾을 수 없거나 이미 삭제되었습니다.")
    return {"message": "일정이 성공적으로 삭제되었습니다."}

