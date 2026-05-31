from sqlalchemy.orm import Session
import models 
import logging

def create_notice(db: Session, univ: str, title: str, url: str, cat: str, date: str):
    existing = db.query(models.NoticeModel).filter(models.NoticeModel.url == url).first()
    if existing:
        return existing #이미 있으면 저장 안하고 반환
    db_notice = models.NoticeModel(
            university=univ, title=title, url=url, category=cat, date=date
    )
    db.add(db_notice)
    db.commit()
    db.refresh(db_notice)
    return db_notice

def get_notices(db: Session, university: str, category: str = None, skip: int = 0, limit: int = 100):
    query = db.query(models.NoticeModel).filter(
            models.NoticeModel.university == university
    )
    #날짜 기준 내림차순(최신순) 정렬 강제 적용
    query = query.order_by(models.NoticeModel.date.desc())
    if category:
        query = query.filter(models.NoticeModel.category == category)
    return query.offset(skip).limit(limit).all()

def bulk_insert_notices(db: Session, notices: list):
    # 배열로 들어온 공지사항들을 한 번에 넣기 위한 뼈대
    inserted_count = 0
    try:
        for n in notices:
            create_notice(db, n.university, n.title, n.url, n.category, n.date)
            inserted_count += 1
    except Exception as e:
        db.rollback()
        logging.error(f"DB 벌크 인서트 중 에러 발생: {e}")
    return inserted_count

def get_university_list(db: Session):
    universities = db.query(models.NoticeModel.university).distinct().all()
    return [u[0] for u in universities if u[0] is not None]

def get_board_list(db: Session, university: str):
    boards = db.query(models.NoticeModel.category).filter(models.NoticeModel.university == university).distinct().all()
    return [b[0] for b in boards if b[0] is not None]