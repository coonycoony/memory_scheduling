# University_Notice_Scheduler
---
충북대학교 컴퓨터공학과 오픈소스기초프로젝트에서 진행하는 프로젝트
대학 웹사이트의 공지사항과 장학 데이터를 크롤링하고, 사용자 맞춤형으로 필터링하여 개인 캘린더에 연동할 수 있는 통합 웹 서비스를 제작하였습니다.

## 프로젝트
대학 생활을 하다 보면 학사, 장학, 취업 등 다양한 공지사항을 확인해야 합니다. 하지만 정보가 여러 게시판에 흩어져 있고, 모바일 확인이 불편하여 중요한 일정을 놓치는 경우가 많습니다. 
### 이 사이트에서는
- 학교의 여러 게시판 데이터를 최신 크롤링 엔진으로 한 번에 모아서 보여줍니다.
- 내 전공, 학년, 관심사(장학, 취업 등)에 맞는 공지만 필터링하여 맞춤 추천을 제공합니다.
- 중요한 공지는 내 스케줄러(달력)에 바로 추가하고 기간별로 잊지 않게 관리할 수 있습니다.

## 개발자 소개 (Contributor)
권세광 @04kwon -김성수 @coonycoony -김현수 @kimsu012 -박준수 @greentea5713

## 의존성 (Dependencies)
본 프로젝트는 아래의 환경 및 패키지 버전을 기준으로 개발되고 테스트되었습니다.

* **OS:** Windows 10/11, Linux, macOS
* **Language:** Python 3.9+
* **Core Libraries:**
  * fastapi == 0.103.1
  * uvicorn == 0.23.2
  * sqlalchemy == 2.0.20
  * pydantic == 2.3.0
  * beautifulsoup4 == 4.12.2
  * requests == 2.31.0
  * httpx == 0.24.1 (FastAPI TestClient 구동용 비동기 HTTP 클라이언트)
  * pytest == 7.4.0 (단위 테스트용)
  * pytest-cov == 4.1.0 (테스트 커버리지 측정 플러그인)


## 설치 방법 (Installation)
본 프로젝트는 `requirements.txt`를 제공하여 필요한 모든 패키지를 한 번에 설치할 수 있습니다.

# 1. 레포지토리 클론
git clone [https://github.com/coonycoony/memory_scheduling.git](https://github.com/coonycoony/memory_scheduling.git)

cd memory_scheduling

# 2. 백엔드 필수 패키지 일괄 설치
pip install -r requirements.txt

# ✏️ 실행 방법 및 Unit Test
터미널에서 cd backend 입력으로 이동 후  python -m uvicorn connect:app --reload 를  입력하여 백엔드 서버를 구동합니다.

frontend 디렉토리 안에 있는  login.html 파일을 웹브라우저로 열어 프론트엔드 환경에 접속합니다.

로그인 후 사이트를 실행 및 테스트합니다.

## Unit Test 및 Coverage 측정 방법
본 프로젝트는 시스템 안정성 검증을 위해 단위 테스트를 제공합니다. Clone 받은 레포지토리에서 아래 명령어를 순서대로 실행하여 테스트 결과와 코드 커버리지(Coverage)를 확인할 수 있습니다.

## 백엔드 단위 테스트 및 커버리지 측정 (Python)
프로젝트 루트(최상위) 폴더에서 아래 명령어를 순서대로 실행하여 테스트를 진행하고 코드 커버리지(Coverage)를 확인할 수 있습니다.

1. 백엔드 테스트 실행 및 커버리지 데이터 수집
python -m coverage run --source=backend -m pytest backend_test/

2. 수집된 커버리지 결과(리포트) 터미널 출력
python -m coverage report

## 프론트엔드 단위 테스트 (JavaScript)
프론트엔드 테스트를 실행하려면 로컬 환경에 Node.js가 설치되어 있어야 합니다. (설치 후 터미널 재시작 필요)

1. 프론트엔드 테스트 폴더로 이동
cd frontend_test

2. 테스트에 필요한 패키지 설치 (최초 1회 필수)
npm install

3. 프론트엔드 단위 테스트 실행
npm test


# 🎬 실행 화면
시작(로그인) 및 맞춤 설정 화면

공지사항 통합 검색 및 맞춤 추천 결과

내 스케줄러(캘린더) 연동 화면

# 📋 LICENSE

MIT License

Copyright (c) 2026 Team memory

[프로젝트 기여자 / Contributors]
* @04kwon / 권세광
* @coonycoony / 김성수
* @kimsu012 / 김현수
* @greentea5713 / 박준수

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
