const { handleLogin } = require('./login.js');

describe('login.js 로그인 기능 테스트', () => {

  beforeEach(() => {
    document.body.innerHTML = `
      <form id="loginForm">
        <input type="text" id="userName" value="홍길동" />
        <input type="text" id="userSchool" value="한국대학교" />
        <input type="text" id="userMajor" value="컴퓨터공학과" />
        <select id="userYear">
          <option value="4" selected>4학년</option>
        </select>
        <div id="interestGroup">
          <input type="checkbox" value="취업/채용" checked />
          <input type="checkbox" value="학사" checked />
        </div>
      </form>
    `;

    window.alert = jest.fn();
    delete window.location;
    window.location = { href: '' };

    Storage.prototype.setItem = jest.fn();
    Storage.prototype.getItem = jest.fn(); // window.onload 테스트를 위해 추가
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('모든 정보가 정상적으로 입력되면 sessionStorage에 저장되어야 한다', () => {
    const mockEvent = { preventDefault: jest.fn() };

    handleLogin(mockEvent);

    expect(mockEvent.preventDefault).toHaveBeenCalled();

    expect(sessionStorage.setItem).toHaveBeenCalledWith(
      'userSession',
      expect.stringContaining('홍길동') 
    );
    
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('환영합니다'));
  });

  test('입력값이 하나라도 누락되면 에러 알림창이 떠야 한다', () => {
    document.getElementById("userName").value = "";
    
    const mockEvent = { preventDefault: jest.fn() };
    handleLogin(mockEvent);

    expect(window.alert).toHaveBeenCalledWith("모든 정보를 올바르게 입력해주세요.");
    
    expect(sessionStorage.setItem).not.toHaveBeenCalled();
  });

  // [신규 추가] window.onload 커버리지 로직
  test('window.onload 시 기존 세션이 있으면 console.log를 출력해야 한다', () => {
    console.log = jest.fn();
    sessionStorage.getItem.mockReturnValue(JSON.stringify({ name: "테스트" }));
    
    // login.js에 정의된 window.onload 실행
    if (window.onload) window.onload();
    
    expect(console.log).toHaveBeenCalledWith('테스트님의 세션이 이미 존재합니다.');
  });

  test('window.onload 시 기존 세션이 없으면 아무 동작도 하지 않아야 한다', () => {
    console.log = jest.fn();
    sessionStorage.getItem.mockReturnValue(null);
    
    if (window.onload) window.onload();
    
    expect(console.log).not.toHaveBeenCalled();
  });

});
