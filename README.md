# University_Notice_Scheduler
---
충북대학교 컴퓨터공학과 오픈소스기초프로젝트에서 진행하는 프로젝트
대학 웹사이트의 공지사항과 장학 데이터를 크롤링하고, 사용자 맞춤형으로 필터링하여 개인 캘린더에 연동할 수 있는 통합 웹 서비스를 제작하였습니다.

## 의존성 (Dependencies)
본 프로젝트는 아래의 환경 및 패키지 버전을 기준으로 개발되고 테스트되었습니다.
* **OS:** Windows 10/11, Linux, macOS
* **Language:** Python 3.9+
* **Core Libraries:** fastapi == 0.103.1, uvicorn == 0.23.2, sqlalchemy == 2.0.20, pydantic == 2.3.0, beautifulsoup4 == 4.12.2, requests == 2.31.0, pytest == 7.4.0
* **External GitHub Packages & References:**
  * [tiangolo/fastapi](https://github.com/tiangolo/fastapi)
  * 참고: https://github.com/clovaai/CRAFT-pytorch, https://github.com/bytecell/slotminer

## 설치 방법 (Installation)
```bash
# 1. 레포지토리 클론
git clone [https://github.com/coonycoony/memory_scheduling.git](https://github.com/coonycoony/memory_scheduling.git)
cd memory_scheduling

# 2. 필수 패키지 일괄 설치
pip install -r requirements.txt
