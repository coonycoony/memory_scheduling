from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from datetime import date, timedelta
from typing import Optional
from notice_model import load_notices, SearchRequest, add_board_source, analyze_page_urls, Notice

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
    allow_credentials=False,  # 🚨 CORS 에러 방지를 위해 무조건 False여야 합니다!
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
def get_notices(university: str, board: Optional[str] = None, category: Optional[str] = None, db: Session = Depends(get_db)):
    # ✅ (유지됨) 새로 추가된 파라미터 검증 로직
    if board and category:
        raise HTTPException(status_code=400, detail="board와 category 파라미터는 동시에 사용할 수 없습니다.")

    actual_category = board if board else category
    thirty_days_ago = (date.today() - timedelta(days=30)).isoformat()
    today_str = date.today().isoformat()

    request_data = SearchRequest(
        university=university,
        notice_category=actual_category,
        since=thirty_days_ago,
        until=today_str
    )

    db_results = crud.get_notices(db, university=university, category=actual_category)

    # ✅ (유지됨) 새로 추가된 Notice 객체 반환 로직
    if (len(db_results) > 20 and db_results[0].date
        and db_results[0].date >= thirty_days_ago):
        return [
            Notice(
                university=n.university,
                title=n.title,
                url=n.url,
                category=n.category,
                date=n.date,
            )
            for n in db_results
        ]

    results = load_notices(request_data)
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

    add_board_source(
        university=req.university,
        board_name=req.board_name,
        list_url=req.url1,
        page_param=params["page_param"],
        max_pages=req.max_pages,
        enc_inner_path=params["enc_inner_path"],
        enc_query_template=params["enc_query_template"],
    )
    return {"message": f"{req.university} - {req.board_name} 추가 완료"}


@app.get("/health")
def health_check():
    return {"status": "ok", "message": "Server is running smoothly."}


# ==========================================
# 🚨 복구된 Schedule API (이슈 #56)
# ==========================================
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
