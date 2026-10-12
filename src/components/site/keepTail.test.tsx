import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { keepTail, tailStart } from "./keepTail";

const tail = (text: string) => text.slice(tailStart(text));

describe("keepTail", () => {
  test("keeps a short closing clause whole", () => {
    expect(tail("讓流浪貓狗重新得到安全、照顧與歸屬。")).toBe("照顧與歸屬。");
  });

  test("falls back to the last four characters of a long clause", () => {
    expect(tail("相片、狀態與內容均以協會最新發佈記錄為準。")).toBe("記錄為準。");
    expect(tail("我們相信負責任的領養需要透明資訊、耐心配對和社區共同參與。")).toBe("共同參與。");
  });

  test("reaches back past a clause shorter than four characters", () => {
    expect(tail("如有任何查詢，歡迎隨時與我們聯絡。謝謝。")).toBe("聯絡。謝謝。");
  });

  test("leaves short text alone", () => {
    expect(tailStart("立即捐助")).toBe(-1);
    expect(renderToStaticMarkup(<>{keepTail("立即捐助。")}</>)).toBe("立即捐助。");
  });

  test("renders the tail in a no-wrap span and keeps every character", () => {
    const html = renderToStaticMarkup(<p>{keepTail("讓流浪貓狗重新得到安全、照顧與歸屬。")}</p>);
    expect(html).toBe('<p>讓流浪貓狗重新得到安全、<span class="keep-tail">照顧與歸屬。</span></p>');
  });
});
