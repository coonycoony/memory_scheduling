function handleLogin(event) {
  event.preventDefault();
  const name = document.getElementById("userName").value.trim();
  const school = document.getElementById("userSchool").value.trim();
  const major = document.getElementById("userMajor").value.trim();
  const year = document.getElementById("userYear").value;
  
  const checkboxes = document.querySelectorAll('#interestGroup input:checked');
  const interests = Array.from(checkboxes).map(cb => cb.value);

  if (!name || !school || !major || !year) {
    alert("모든 정보를 올바르게 입력해주세요.");
    return;
  }

  const userInfo = {
    name: name,
    school: school,
    major: major,
    year: year,
    interests: interests,
    loginAt: new Date().toISOString()
  };
  
  sessionStorage.setItem("userSession", JSON.stringify(userInfo));
  alert(`${name}님 환영합니다! 맞춤형 공지사항을 준비해 드릴게요.`);
  window.location.href = "frontend.html";
}

window.onload = function() {
  const savedSession = sessionStorage.getItem("userSession");
  if (savedSession) {
    const user = JSON.parse(savedSession);
    console.log(`${user.name}님의 세션이 이미 존재합니다.`);
  }
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    handleLogin
  };
}
