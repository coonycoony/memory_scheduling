from fastapi import Request
from logger import app_logger

async def log_requests_middleware(request: Request, call_next)
    #API 요청을 가로채는 미들웨어 기본 뼈대
    response = await call_next(request)
    return response
