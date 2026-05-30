from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from datetime import date, timedelta
from typing import Optional
from notice_model import load_notices, SearchRequest

from middleware import log_requests_middleware
from logger import app_logger

from database import engine, Base
import models

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

@app.get("/notices")
def get_notices(university: str, category: Optional[str] = None):
    # 기본 검색 기간: 최근 30일 설정
    thirty_days_ago = (date.today() - timedelta(days=30)).isoformat()
    today_str = date.today().isoformat()

    request_data = SearchRequest(
            university=university,
            category=category,
            since=thirty_days_ago,
            until=today_str
        )
    results = load_notices(request_data)
    return results
@app.get("/health")
def health_check():
    #서버 상태 점검용 Ping API
    return {"status": "ok", "message": "Server is running smoothly."}
