import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'backend'))

import pytest
from database import get_db, SessionLocal
import database


@pytest.fixture(autouse=True)
def dispose_engine():
    yield
    database.engine.dispose()


class TestGetDb:
    def test_yields_session_and_closes(self):
        gen = get_db()
        db = next(gen)
        assert db is not None
        try:
            next(gen)
        except StopIteration:
            pass

    def test_session_is_usable(self):
        gen = get_db()
        db = next(gen)
        result = db.execute(__import__("sqlalchemy").text("SELECT 1")).fetchone()
        assert result[0] == 1
        try:
            next(gen)
        except StopIteration:
            pass
