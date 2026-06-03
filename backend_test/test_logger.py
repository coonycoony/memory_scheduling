import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'backend'))

import shutil
import importlib


class TestLogger:
    def test_get_logger_returns_logger(self):
        import logger
        assert logger.app_logger is not None

    def test_creates_log_dir_when_missing(self):
        shutil.rmtree("logs", ignore_errors=True)
        import logger
        importlib.reload(logger)
        assert os.path.exists("logs")
