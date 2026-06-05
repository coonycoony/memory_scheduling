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

});
