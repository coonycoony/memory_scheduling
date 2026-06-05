const { escapeHtml, isNew } = require('./frontend.js');

describe('frontend.js 유틸리티 함수 테스트', () => {

  test('escapeHtml이 특수문자를 안전한 HTML 엔티티로 변환해야 한다', () => {
    const input = '<script>alert("test & hi")</script>';
    const expected = '&lt;script&gt;alert(&quot;test &amp; hi&quot;)&lt;/script&gt;';
    expect(escapeHtml(input)).toBe(expected);
  });

  test('isNew 함수가 오늘 날짜에 대해 true를 반환해야 한다', () => {
    const today = new Date().toISOString(); 
    expect(isNew(today)).toBe(true);
  });

  test('isNew 함수가 3일 전 날짜에 대해 false를 반환해야 한다', () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 3); 
    expect(isNew(oldDate.toISOString())).toBe(false);
  });

});
