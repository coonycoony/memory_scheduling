import logging
import os
import pytest
from logger import get_logger


class TestGetLogger:
    def test_returns_logger_instance(self):
        lg = get_logger("test_logger_1")
        assert isinstance(lg, logging.Logger)

    def test_logger_name(self):
        lg = get_logger("my_custom_logger")
        assert lg.name == "my_custom_logger"

    def test_logger_level_is_info(self):
        lg = get_logger("test_level_logger")
        assert lg.level == logging.INFO

    def test_logger_has_handlers(self):
        lg = get_logger("test_handlers_logger")
        assert len(lg.handlers) > 0

    def test_default_name(self):
        lg = get_logger()
        assert isinstance(lg, logging.Logger)

    def test_logs_dir_created(self):
        get_logger("test_dir_logger")
        assert os.path.isdir("logs")

    def test_app_logger_exists(self):
        from logger import app_logger
        assert app_logger is not None
        assert isinstance(app_logger, logging.Logger)

