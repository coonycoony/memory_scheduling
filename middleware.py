from fastapi import Request
from logger import app_logger
import time

async def log_requests_middleware(request: Request, call_next):
    start_time= time.time()
    client_ip=request.client.host if request.client else "unknown"
    app_logger.info(f"요청 수신: [{request.method}] {request.url.path} (IP: {client_ip})")

    #API 요청을 가로채는 미들웨어 기본 뼈대
    response = await call_next(request)
    return response
