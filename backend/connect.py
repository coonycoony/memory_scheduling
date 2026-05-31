from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from datetime import date, timedelta
from typing import Optional
from notice_model import load_notices, SearchRequest

from middleware import log_requests_middleware
from logger import app_logger

from database import engine, Base
import models

from fastapi import Depends
from sqlalchemy.orm import Session
from database import get_db
import crud
import json
import os

app = FastAPI()
models.Base.metadata.create_all(bind=engine)
app.middleware("http")(log_requests_middleware)

@app.on_event("startup")
async def startup_event():
    app_logger.info("서버가 성공적으로 시작되었습니다. 로그 기록을 시작합니다.")
@app.on_event("shutdown")
async def shutdown_event():
    #서버 종료 시 안전하게 로그 기록
    app_logger.info("서버가 안전하게 종료되었습니다.")

# 프론트엔드 연동을 위한 CORS 미들웨어 허용
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 새로 추가된 API 라우터 ---
@app.get("/universities")
def get_universities():
    # DB 대신 sources.json 파일에서 지원하는 모든 대학교 목록을 직접 읽어옵니다.
    if os.path.exists("sources.json"):
        with open("sources.json", "r", encoding="utf-8") as f:
            data = json.load(f)
        return list(data.keys())
    return []

@app.get("/boards")
def get_boards(university: str):
    # 선택한 대학교의 전체 게시판 목록을 sources.json에서 직접 읽어옵니다.
    if os.path.exists("sources.json"):
        with open("sources.json", "r", encoding="utf-8") as f:
            data = json.load(f)
        if university in data:
            return [board["board_name"] for board in data[university]["boards"]]
    return []

# --- 수정된 공지사항 검색 API ---
@app.get("/notices")
def get_notices(university: str, board: Optional[str] = None, category: Optional[str] = None, db: Session = Depends(get_db)):
    # 프론트엔드에서 넘겨주는 board 값을 category 로 매핑
    actual_category = board if board else category

    # 기본 검색 기간: 최근 30일 설정
    thirty_days_ago = (date.today() - timedelta(days=30)).isoformat()
    today_str = date.today().isoformat()

    request_data = SearchRequest(
            university=university,
            notice_category=actual_category,
            since=thirty_days_ago,
            until=today_str
        )
    
    # DB에서 먼저 꺼내보고 확인
    db_results = crud.get_notices(db, university=university, category=actual_category)
    
    # DB에 데이터가 20개 이상이고, 가장 최근 공지사항이 오늘 또는 어제일때만 크롤링 생략
    if len(db_results) > 20 and db_results[0].date >= thirty_days_ago:
        return db_results
        
    results = load_notices(request_data)
    if results:
        inserted_count = crud.bulk_insert_notices(db, results)
        app_logger.info(f"새로운 공지사항 {inserted_count}건을 DB에 동기화했습니다.")
    else:
        app_logger.warning("크롤링된 새 데이터가 없어 DB 동기화를 생략합니다.")
    return results

@app.get("/health")
def health_check():
    return {"status": "ok", "message": "Server is running smoothly."}
