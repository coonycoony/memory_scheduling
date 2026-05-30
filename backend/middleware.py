from fastapi import Request
from logger import app_logger
import time

async def log_requests_middleware(request: Request, call_next):
    start_time= time.time()
    client_ip=request.client.host if request.client else "unknown"
    app_logger.info(f"요청 수신: [{request.method}] {request.url.path} (IP: {client_ip})")

    #API 요청을 가로채는 미들웨어 기본 뼈대
    response = await call_next(request)
    process_time=(time.time() - start_time) * 1000
    status = response.status_code
    app_logger.info(f"응답 완료: [{request.method}] {request.url.path} - 상태: {status} (소요시간: {process_time:.2f}ms)")
    return response
