import { describe, expect, test } from "bun:test";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AdminApiError, AdminSessionError } from "../../lib/admin/session";
import { AdminHomeRouteContext } from "./adminHomeRoute";
import { DataTable } from "./DataTable";
import { expectNoChineseText, renderAdminInChinese, renderAdminInEnglish } from "./i18n/testing";
import { failureClass } from "./failureClass";
import { LoadFailure, StatFigure, errorReference, STAT_UNAVAILABLE } from "./LoadFailure";

type ElementProps = { children?: ReactNode; onClick?: () => void };
function findElements(node: ReactNode, out: ReactElement<ElementProps>[] = []) {
  if (Array.isArray(node)) for (const child of node) findElements(child, out);
  else if (isValidElement<ElementProps>(node)) {
    out.push(node);
    findElements(node.props.children, out);
  }
  return out;
}

function withStatus(status: number | null, message = "x") {
  return Object.assign(new Error(message), { status });
}

const columns = [
  { id: "name", header: "名稱", cell: (row: { name: string }) => row.name },
] as const;

function renderTable(props: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    <DataTable
      columns={[...columns]}
      rows={[] as { name: string }[]}
      getRowKey={(row) => row.name}
      empty="沒有結果"
      {...props}
    />,
  );
}

describe("errorReference", () => {
  test("is stable for the same fault so a retry quotes one reference", () => {
    const first = errorReference(new Error("relation volunteer_activity_counts does not exist"));
    const second = errorReference(new Error("relation volunteer_activity_counts does not exist"));
    expect(first).toBe(second);
  });

  test("distinguishes different faults", () => {
    expect(errorReference(new Error("a"))).not.toBe(errorReference(new Error("b")));
  });

  test("survives values that are not Errors and do not serialise", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(errorReference(circular)).toMatch(/^[0-9A-F]{6}$/);
    expect(errorReference("plain string")).toMatch(/^[0-9A-F]{6}$/);
    expect(errorReference(undefined)).toMatch(/^[0-9A-F]{6}$/);
  });
});

describe("LoadFailure", () => {
  test("never renders the raw error text", () => {
    // Provider and Postgres errors carry table names, row contents and
    // connection strings. An operator gets a reference, not the payload.
    const markup = renderToStaticMarkup(
      <LoadFailure
        error={new Error("password=hunter2 relation supporter does not exist")}
        onRetry={() => {}}
      />,
    );
    expect(markup).not.toContain("hunter2");
    expect(markup).not.toContain("supporter");
    expect(markup).toContain("無法載入");
  });

  test("always offers a retry control that runs onRetry", () => {
    // Asserted on the control itself, not the word: the guidance copy
    // ("請重試。若問題持續…") contains 重試 whether or not a button is rendered.
    let retried = 0;
    const onRetry = () => {
      retried += 1;
    };
    expect(
      renderToStaticMarkup(<LoadFailure error={new Error("x")} onRetry={onRetry} />),
    ).toContain("<button");
    // Hooks run only inside a render, so capture the element tree from inside one.
    let tree: ReactNode = null;
    function Probe() {
      tree = LoadFailure({ error: new Error("x"), onRetry });
      return null;
    }
    renderToStaticMarkup(<Probe />);
    const retry = findElements(tree).find((node) => typeof node.props.onClick === "function");
    expect(retry).toBeDefined();
    retry?.props.onClick?.();
    expect(retried).toBe(1);
  });

  test("disables the retry control while a retry is in flight", () => {
    const markup = renderToStaticMarkup(
      <LoadFailure error={new Error("x")} onRetry={() => {}} retrying />,
    );
    expect(markup).toContain("disabled");
  });
});

describe("StatFigure", () => {
  test("shows the unavailable marker instead of a figure when the source failed", () => {
    const markup = renderToStaticMarkup(<StatFigure value={0} failed />);
    expect(markup).toContain(STAT_UNAVAILABLE);
    expect(markup).not.toContain(">0<");
  });

  test("shows a genuine zero when the load succeeded", () => {
    // Zero is a real answer -- "nothing is waiting" -- and must stay readable.
    expect(renderToStaticMarkup(<StatFigure value={0} failed={false} />)).toContain("0");
  });
});

describe("DataTable failure state", () => {
  test("a failed load is not rendered as the empty state", () => {
    // The defect this closes: a failed fetch also yields zero rows, so the
    // empty copy ("沒有結果") told the operator there was no work waiting when
    // in fact nothing had been read.
    const markup = renderTable({ error: new Error("boom"), onRetry: () => {} });
    expect(markup).toContain("無法載入");
    expect(markup).not.toContain("沒有結果");
  });

  test("a genuinely empty result still shows the empty state", () => {
    const markup = renderTable();
    expect(markup).toContain("沒有結果");
    expect(markup).not.toContain("無法載入");
  });

  test("loading takes precedence over the failure state", () => {
    // A refetch that has not resolved yet is not a failure.
    const markup = renderTable({ error: new Error("boom"), onRetry: () => {}, loading: true });
    expect(markup).not.toContain("無法載入");
  });

  test("rows are not rendered alongside a failure", () => {
    // Stale rows next to an error read as "this is the current list".
    const markup = renderToStaticMarkup(
      <DataTable
        columns={[...columns]}
        rows={[{ name: "STALE-ROW" }]}
        getRowKey={(row) => row.name}
        error={new Error("boom")}
        onRetry={() => {}}
      />,
    );
    expect(markup).not.toContain("STALE-ROW");
    expect(markup).toContain("無法載入");
  });

  test("the mobile card layout also shows the failure instead of the empty state", () => {
    const markup = renderTable({
      error: new Error("boom"),
      onRetry: () => {},
      renderMobileCard: (row: { name: string }) => <div>{row.name}</div>,
    });
    expect(markup).toContain("無法載入");
    expect(markup).not.toContain("沒有結果");
  });
});

describe("failureClass", () => {
  test("maps 401 and 403 to forbidden", () => {
    expect(failureClass(withStatus(401))).toBe("forbidden");
    expect(failureClass(withStatus(403))).toBe("forbidden");
    expect(failureClass(new AdminSessionError("not_signed_in"))).toBe("forbidden");
  });

  test("maps 404 to not_found and 5xx to server", () => {
    expect(failureClass(withStatus(404))).toBe("not_found");
    expect(failureClass(withStatus(500))).toBe("server");
    expect(failureClass(withStatus(503))).toBe("server");
    expect(failureClass(new AdminApiError({ status: 502, message: "x" }))).toBe("server");
  });

  test("maps a null status to network", () => {
    expect(failureClass(withStatus(null))).toBe("network");
  });

  test("maps everything else to unknown", () => {
    expect(failureClass(withStatus(400))).toBe("unknown");
    expect(failureClass(withStatus(409))).toBe("unknown");
    expect(failureClass(new Error("x"))).toBe("unknown");
    expect(failureClass("x")).toBe("unknown");
    expect(failureClass(undefined)).toBe("unknown");
    expect(failureClass({ status: "403" })).toBe("unknown");
  });
});

describe("LoadFailure class lines in English", () => {
  const render = (error: unknown) =>
    renderAdminInEnglish(<LoadFailure error={error} onRetry={() => {}} />);

  test("says what to do for each class", () => {
    const lines: Record<string, string> = {
      forbidden: "You don't have access to this. Go to a page your role can open.",
      not_found: "This record could not be found. Go back to the list and check it still exists.",
      server: "The server had a problem. Try again in a moment.",
      network: "Could not reach the server. Check your connection and try again.",
    };
    const errors = {
      forbidden: withStatus(403),
      not_found: withStatus(404),
      server: withStatus(500),
      network: withStatus(null),
    };
    for (const [name, error] of Object.entries(errors)) {
      const markup = render(error);
      expectNoChineseText(markup);
      expect(markup, name).toContain(lines[name].replace("'", "&#x27;"));
      expect(markup, name).toMatch(/<button[^>]*>Retry<\/button>/);
      expect(markup, name).toMatch(/<span class="font-mono">[0-9A-F]{6}<\/span>/);
    }
  });

  test("keeps today's text for an unknown failure", () => {
    const markup = render(new Error("x"));
    expect(markup).toContain("Try again. If the problem continues, quote this error reference:");
    expect(markup).not.toContain("The server had a problem");
    expect(markup).not.toContain("You don&#x27;t have access");
  });

  test("links a forbidden failure to the first page the signed-in role can open", () => {
    const markup = renderAdminInEnglish(
      <AdminHomeRouteContext.Provider value="/admin?section=payments">
        <LoadFailure error={withStatus(403)} onRetry={() => {}} />
      </AdminHomeRouteContext.Provider>,
    );
    expect(markup).toContain('href="/admin?section=payments"');
  });

  test("shows the forbidden line without a link when no home page is known", () => {
    const markup = render(withStatus(403));
    expect(markup).toContain("You don&#x27;t have access to this.");
    expect(markup).not.toContain("<a ");
  });
});

describe("LoadFailure class lines in Chinese", () => {
  test("add nothing: every class renders today's markup", () => {
    const reference = renderAdminInChinese(<LoadFailure error="x" onRetry={() => {}} />);
    for (const status of [401, 403, 404, 500, null, 400]) {
      const markup = renderAdminInChinese(
        <LoadFailure error={withStatus(status, "x")} onRetry={() => {}} />,
      );
      // The reference is derived from the error text and name, which are the same here.
      expect(markup.replace(/[0-9A-F]{6}<\/span>/, "")).toBe(
        reference.replace(/[0-9A-F]{6}<\/span>/, ""),
      );
    }
    expect(reference).toContain("請重試。若問題持續，請提供錯誤編號 ");
  });
});

describe("LoadFailure wording a screen keeps", () => {
  test("a retry label replaces Retry, and the retrying label stays the shared one", () => {
    const labelled = renderAdminInChinese(
      <LoadFailure error="x" onRetry={() => {}} retryLabel="重新載入" />,
    );
    expect(labelled).toMatch(/<button[^>]*>重新載入<\/button>/);
    const retrying = renderAdminInChinese(
      <LoadFailure error="x" onRetry={() => {}} retryLabel="重新載入" retrying />,
    );
    expect(retrying).toContain("重試中…");
  });

  test("a table's failure title replaces the heading and keeps the retry", () => {
    const markup = renderTable({
      error: new Error("boom"),
      onRetry: () => {},
      failureTitle: "無法載入捐款人。",
    });
    expect(markup).toContain("無法載入捐款人。");
    expect(markup).not.toContain("沒有結果");
    expect(markup).toMatch(/<button[^>]*>重試<\/button>/);
  });
});
