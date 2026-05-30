from sqlalchemy.orm import Session
import models 

def create_notice(db: Session, univ: str, title: str, url: str, cat: str, date: str):
    db_notice = models.NoticeModel(
            university=univ, title=title, url=url, category=cat, date=date
    )
    db.add(db_notice)
    db.commit()
    db.refresh(db_notice)
    return db_notice
