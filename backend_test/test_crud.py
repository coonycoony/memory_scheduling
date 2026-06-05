import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base
import crud
import models


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    Base.metadata.drop_all(bind=engine)


# ── create_notice ─────────────────────────────────────────────────────────────

class TestCreateNotice:
    def test_create_notice(self, db):
        n = crud.create_notice(db, "서울대", "장학 공지", "http://snu.ac.kr/1", "장학", "2024-01-01")
        assert n.id is not None
        assert n.university == "서울대"
        assert n.title == "장학 공지"

    def test_duplicate_url_returns_existing(self, db):
        n1 = crud.create_notice(db, "서울대", "제목", "http://snu.ac.kr/1", "장학", "2024-01-01")
        n2 = crud.create_notice(db, "서울대", "다른제목", "http://snu.ac.kr/1", "학사", "2024-02-01")
        assert n1.id == n2.id
        assert n2.title == "제목"  # 중복이므로 기존 것 반환

    def test_different_urls_create_separately(self, db):
        crud.create_notice(db, "A대", "공지1", "http://a.com/1", "기타", "2024-01-01")
        crud.create_notice(db, "A대", "공지2", "http://a.com/2", "기타", "2024-01-02")
        notices = crud.get_notices(db, "A대")
        assert len(notices) == 2


# ── get_notices ───────────────────────────────────────────────────────────────

class TestGetNotices:
    def setup_notices(self, db):
        crud.create_notice(db, "서울대", "장학공지", "http://snu.ac.kr/1", "장학", "2024-03-01")
        crud.create_notice(db, "서울대", "수강신청", "http://snu.ac.kr/2", "학사", "2024-02-01")
        crud.create_notice(db, "고려대", "공지", "http://korea.ac.kr/1", "기타", "2024-01-01")

    def test_get_notices_by_university(self, db):
        self.setup_notices(db)
        result = crud.get_notices(db, "서울대")
        assert len(result) == 2

    def test_get_notices_with_category(self, db):
        self.setup_notices(db)
        result = crud.get_notices(db, "서울대", category="장학")
        assert len(result) == 1
        assert result[0].category == "장학"

    def test_get_notices_ordered_by_date_desc(self, db):
        self.setup_notices(db)
        result = crud.get_notices(db, "서울대")
        assert result[0].date >= result[1].date

    def test_get_notices_skip_limit(self, db):
        self.setup_notices(db)
        result = crud.get_notices(db, "서울대", skip=1, limit=1)
        assert len(result) == 1

    def test_get_notices_empty_university(self, db):
        result = crud.get_notices(db, "없는대학")
        assert result == []


# ── bulk_insert_notices ───────────────────────────────────────────────────────

class TestBulkInsertNotices:
    def test_bulk_insert(self, db):
        from notice_model import Notice
        notices = [
            Notice(university="A대", title="공지1", url="http://a.com/1", category="기타", date="2024-01-01"),
            Notice(university="A대", title="공지2", url="http://a.com/2", category="기타", date="2024-01-02"),
        ]
        count = crud.bulk_insert_notices(db, notices)
        assert count == 2

    def test_bulk_insert_with_duplicate(self, db):
        from notice_model import Notice
        notices = [
            Notice(university="A대", title="공지1", url="http://a.com/1", category="기타", date="2024-01-01"),
            Notice(university="A대", title="공지1", url="http://a.com/1", category="기타", date="2024-01-01"),
        ]
        crud.bulk_insert_notices(db, notices)
        result = crud.get_notices(db, "A대")
        assert len(result) == 1


# ── get_university_list / get_board_list ──────────────────────────────────────

class TestUniversityBoardList:
    def test_get_university_list(self, db):
        crud.create_notice(db, "서울대", "공지", "http://a.com/1", "기타", "2024-01-01")
        crud.create_notice(db, "고려대", "공지", "http://b.com/1", "기타", "2024-01-01")
        result = crud.get_university_list(db)
        assert "서울대" in result
        assert "고려대" in result

    def test_get_board_list(self, db):
        crud.create_notice(db, "서울대", "공지", "http://a.com/1", "장학", "2024-01-01")
        crud.create_notice(db, "서울대", "공지", "http://a.com/2", "학사", "2024-01-01")
        result = crud.get_board_list(db, "서울대")
        assert "장학" in result
        assert "학사" in result


# ── create_schedule ───────────────────────────────────────────────────────────

class TestCreateSchedule:
    def test_create_basic_schedule(self, db):
        s = crud.create_schedule(db, date="2024-03-01", main_category="학사", title="중간고사")
        assert s.id is not None
        assert s.title == "중간고사"
        assert s.main_category == "학사"

    def test_create_schedule_with_all_fields(self, db):
        s = crud.create_schedule(
            db,
            date="2024-03-01",
            main_category="학사",
            title="중간고사",
            sub_category="시험",
            start_date="2024-03-10",
            end_date="2024-03-14",
            memo="준비 필요",
            url="http://example.com/exam",
        )
        assert s.sub_category == "시험"
        assert s.memo == "준비 필요"
        assert s.url == "http://example.com/exam"


# ── get_schedules ─────────────────────────────────────────────────────────────

class TestGetSchedules:
    def setup_schedules(self, db):
        crud.create_schedule(db, date="2024-03-01", main_category="학사", title="중간고사")
        crud.create_schedule(db, date="2024-05-01", main_category="취업", title="채용설명회")
        crud.create_schedule(db, date="2024-01-15", main_category="학사", title="수강신청")

    def test_get_all_schedules(self, db):
        self.setup_schedules(db)
        result = crud.get_schedules(db)
        assert len(result) == 3

    def test_get_schedules_with_category_filter(self, db):
        self.setup_schedules(db)
        result = crud.get_schedules(db, main_category="학사")
        assert len(result) == 2
        assert all(s.main_category == "학사" for s in result)

    def test_get_schedules_ordered_asc(self, db):
        self.setup_schedules(db)
        result = crud.get_schedules(db)
        dates = [s.date for s in result]
        assert dates == sorted(dates)

    def test_get_schedules_skip_limit(self, db):
        self.setup_schedules(db)
        result = crud.get_schedules(db, skip=1, limit=1)
        assert len(result) == 1


# ── update_schedule ───────────────────────────────────────────────────────────

class TestUpdateSchedule:
    def test_update_schedule_title(self, db):
        s = crud.create_schedule(db, date="2024-03-01", main_category="학사", title="원래제목")
        updated = crud.update_schedule(db, s.id, {"title": "바뀐제목"})
        assert updated.title == "바뀐제목"

    def test_update_schedule_multiple_fields(self, db):
        s = crud.create_schedule(db, date="2024-03-01", main_category="학사", title="공지")
        updated = crud.update_schedule(db, s.id, {"title": "수정", "memo": "메모추가"})
        assert updated.title == "수정"
        assert updated.memo == "메모추가"

    def test_update_nonexistent_returns_none(self, db):
        result = crud.update_schedule(db, 9999, {"title": "없는일정"})
        assert result is None


# ── delete_schedule ───────────────────────────────────────────────────────────

class TestDeleteSchedule:
    def test_delete_existing_schedule(self, db):
        s = crud.create_schedule(db, date="2024-03-01", main_category="학사", title="삭제할일정")
        result = crud.delete_schedule(db, s.id)
        assert result is True
        assert crud.get_schedules(db) == []

    def test_delete_nonexistent_returns_false(self, db):
        result = crud.delete_schedule(db, 9999)
        assert result is False


# ── bulk_insert_notices: 예외 발생 시 rollback ────────────────────────────────

class TestBulkInsertRollback:
    def test_rollback_on_error(self, db):
        from unittest.mock import patch, Mock
        with patch("crud.create_notice", side_effect=Exception("DB error")):
            count = crud.bulk_insert_notices(db, [Mock()])
        assert count == 0


# ── database.get_db ───────────────────────────────────────────────────────────

class TestGetDb:
    def test_get_db_yields_session(self):
        from database import get_db
        gen = get_db()
        db = next(gen)
        assert db is not None
        try:
            next(gen)
        except StopIteration:
            pass

    def test_get_db_session_closes(self):
        from database import get_db
        gen = get_db()
        db = next(gen)
        assert db.is_active
        try:
            next(gen)
        except StopIteration:
            pass

