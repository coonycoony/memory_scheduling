const core = require("./archive_core");

describe("parseLocalDate", () => {
  test("returns null for falsy or non-string", () => {
    expect(core.parseLocalDate(null)).toBeNull();
    expect(core.parseLocalDate(1234)).toBeNull();
  });

  test("returns null for invalid format", () => {
    expect(core.parseLocalDate("2024/01/01")).toBeNull();
    expect(core.parseLocalDate("abc")).toBeNull();
  });

  test("parses valid YYYY-MM-DD", () => {
    const d = core.parseLocalDate("2024-05-10");
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(4);
    expect(d.getDate()).toBe(10);
  });
});

describe("escapeHtml", () => {
  test("escapes special characters", () => {
    const input = `<div a="1" b='2'>&</div>`;
    const out = core.escapeHtml(input);
    expect(out).toBe(
      "&lt;div a=&quot;1&quot; b=&#039;2&#039;&gt;&amp;&lt;/div&gt;"
    );
  });

  test("handles null/undefined", () => {
    expect(core.escapeHtml(null)).toBe("");
    expect(core.escapeHtml(undefined)).toBe("");
  });
});

describe("escapeAttribute", () => {
  test("escapes double quotes only", () => {
    const input = `"a" 'b'`;
    const out = core.escapeAttribute(input);
    expect(out).toBe("&quot;a&quot; 'b'");
  });

  test("handles null/undefined", () => {
    expect(core.escapeAttribute(null)).toBe("");
    expect(core.escapeAttribute(undefined)).toBe("");
  });
});

describe("normalizeItem", () => {
  test("fills defaults when fields missing", () => {
    const base = {
      // intentionally empty to trigger defaults
    };
    const item = core.normalizeItem(base);

    expect(item.title).toBe("제목 없음");
    expect(item.url).toBe("#");
    expect(item.category).toBe("기타");
    expect(item.source_category).toBe("기타");
    expect(item.department).toBe("");
    expect(item.university).toBe("");
    expect(item.date).toBe("");
    expect(item.memo).toBe("");
    expect(typeof item.id).toBe("string");
    expect(typeof item.savedAt).toBe("string");
  });

  test("prefers source_category over subCategory", () => {
    const item = core.normalizeItem({
      title: "t",
      url: "u",
      category: "장학",
      source_category: "소스",
      subCategory: "서브",
    });
    expect(item.source_category).toBe("소스");
  });

  test("falls back to subCategory when source_category missing", () => {
    const item = core.normalizeItem({
      title: "t",
      url: "u",
      category: "장학",
      subCategory: "서브",
    });
    expect(item.source_category).toBe("서브");
  });
});

describe("getPillClass", () => {
  test("returns mapped classes", () => {
    expect(core.getPillClass("장학")).toBe("scholarship");
    expect(core.getPillClass("학사")).toBe("academic");
    expect(core.getPillClass("취업/채용")).toBe("job");
  });

  test("returns etc for others", () => {
    expect(core.getPillClass("기타")).toBe("etc");
    expect(core.getPillClass("아무거나")).toBe("etc");
  });
});

describe("matchesKeyword", () => {
  const item = {
    title: "국가장학금 안내",
    department: "학생지원팀",
    memo: "필독",
    source_category: "장학",
    university: "OO대학교",
  };

  test("returns true when keyword empty", () => {
    expect(core.matchesKeyword(item, "")).toBe(true);
    expect(core.matchesKeyword(item, null)).toBe(true);
  });

  test("performs case-insensitive search", () => {
    expect(core.matchesKeyword(item, "장학금")).toBe(true);
    expect(core.matchesKeyword(item, "oo대")).toBe(true);
    expect(core.matchesKeyword(item, "없는단어")).toBe(false);
  });
});

describe("matchesCategory", () => {
  const item = { category: "장학" };

  test("matches 전체 always", () => {
    expect(core.matchesCategory(item, "전체")).toBe(true);
  });

  test("matches same category only", () => {
    expect(core.matchesCategory(item, "장학")).toBe(true);
    expect(core.matchesCategory(item, "학사")).toBe(false);
  });
});

describe("sortItems", () => {
  const items = [
    {
      title: "A",
      savedAt: "2024-01-02T00:00:00.000Z",
      date: "2024-02-01",
    },
    {
      title: "B",
      savedAt: "2024-01-01T00:00:00.000Z",
      date: "2024-01-01",
    },
    {
      title: "C",
      savedAt: "2024-01-03T00:00:00.000Z",
      date: "",
    },
  ];

  test("sorts by saved-asc", () => {
    const out = core.sortItems(items, "saved-asc");
    expect(out.map((i) => i.title)).toEqual(["B", "A", "C"]);
  });

  test("sorts by date-asc", () => {
    const out = core.sortItems(items, "date-asc");
    expect(out.map((i) => i.title)).toEqual(["B", "A", "C"]);
  });

  test("sorts by date-desc", () => {
    const out = core.sortItems(items, "date-desc");
    expect(out.map((i) => i.title)).toEqual(["A", "B", "C"]);
  });

  test("default sorts by savedAt desc", () => {
    const out = core.sortItems(items, "unknown-type");
    expect(out.map((i) => i.title)).toEqual(["C", "A", "B"]);
  });
});

describe("buildSummary", () => {
  test("aggregates counts by category", () => {
    const items = [
      { category: "장학" },
      { category: "장학" },
      { category: "학사" },
      { category: "입학/등록" },
      { category: "기타" },
      { category: "없는카테고리" },
    ];
    const { total, counts } = core.buildSummary(items);
    expect(total).toBe(6);
    expect(counts["장학"]).toBe(2);
    expect(counts["학사"]).toBe(1);
    expect(counts["입학/등록"]).toBe(1);
    expect(counts["기타"]).toBe(2); // 기타 + 없는카테고리
  });

  test("handles empty items", () => {
    const { total, counts } = core.buildSummary([]);
    expect(total).toBe(0);
    Object.values(counts).forEach((v) => {
      expect(v).toBe(0);
    });
  });
});

describe("buildScheduleMemo", () => {
  test("joins memo parts with newline", () => {
    const item = {
      memo: "메모",
      url: "http://example.com",
      university: "OO대",
      department: "학생지원팀",
    };
    const memo = core.buildScheduleMemo(item);
    expect(memo.split("\n")).toEqual([
      "메모",
      "원문 링크: http://example.com",
      "학교: OO대",
      "부서: 학생지원팀",
    ]);
  });

  test("returns empty string when no data", () => {
    const memo = core.buildScheduleMemo({});
    expect(memo).toBe("");
  });
});

describe("buildScheduleParams", () => {
  test("builds params with item fields", () => {
    const item = {
      title: "국가장학금",
      category: "장학",
      source_category: "국가장학",
      url: "http://example.com",
      memo: "필독",
      university: "OO대",
      department: "학생지원팀",
      date: "2024-05-10",
    };
    const params = core.buildScheduleParams(item, "2024-01-01");
    expect(params).toEqual({
      title: "국가장학금",
      category: "장학",
      subCategory: "국가장학",
      url: "http://example.com",
      memo: core.buildScheduleMemo(item),
      date: "2024-05-10",
    });
  });

  test("fills defaults when some fields missing", () => {
    const item = {
      // intentionally minimal
    };
    const params = core.buildScheduleParams(item, "2024-01-01");
    expect(params.title).toBe("제목 없음");
    expect(params.category).toBe("기타");
    expect(params.subCategory).toBe("기타");
    expect(params.url).toBe("");
    expect(params.memo).toBe("");
    expect(params.date).toBe("2024-01-01");
  });
});
