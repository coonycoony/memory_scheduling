from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from datetime import date, timedelta
from notice_model import load_notices, SearchRequest

app = FastAPI()

# 프론트엔드 연동을 위한 CORS 미들웨어 허용
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/notices")
def get_notices(university: str):
    # 기본 검색 기간: 최근 30일 설정
    thirty_days_ago = date.today() - timedelta(days=30)
    until_str = thirty_days_ago.isoformat()

    request_data = SearchRequest(
            university=university,
            until=until_str
        )
    results = load_notices(request_date)
    return results
