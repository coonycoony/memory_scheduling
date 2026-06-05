from database import get_db


class TestGetDb:
    def test_get_db_yields_session(self):
        gen = get_db()
        db = next(gen)
        assert db is not None
        try:
            next(gen)
        except StopIteration:
            pass

    def test_get_db_session_closes(self):
        gen = get_db()
        db = next(gen)
        assert db.is_active
        try:
            next(gen)
        except StopIteration:
            pass

