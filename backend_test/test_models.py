from database import Base
import models


class TestNoticeModel:
    def test_notice_model_tablename(self):
        assert models.NoticeModel.__tablename__ == "notices"

    def test_notice_model_columns(self):
        cols = [c.name for c in models.NoticeModel.__table__.columns]
        assert "id" in cols
        assert "university" in cols
        assert "title" in cols
        assert "url" in cols
        assert "category" in cols
        assert "date" in cols


class TestScheduleModel:
    def test_schedule_model_tablename(self):
        assert models.ScheduleModel.__tablename__ == "schedules"

    def test_schedule_model_columns(self):
        cols = [c.name for c in models.ScheduleModel.__table__.columns]
        assert "id" in cols
        assert "main_category" in cols
        assert "title" in cols
        assert "date" in cols

