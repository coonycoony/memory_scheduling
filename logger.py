import logging
import sys
def get_logger(name: str = "api_logger") -> logging.Logger:
    logger = logging.getLogger(name)
    logger.setLevel(logging.INFO)

    #터미널 출력 핸들러
    stream_handler = logging.StreamHandler(sys.stdout)
    logger.addHandler(stream_handler)

	return logger
app_logger = get_logger()
