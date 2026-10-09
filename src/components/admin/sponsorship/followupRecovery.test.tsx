import React, { type ReactNode, type ReactElement } from "react";
import { beforeEach, expect, mock, test } from "bun:test";
// Coupling: this test calls the drawer as a plain function and answers `useState` and `useRef`
// by call order, so a new `useState` or `useRef` in the drawer, or a change to the order of the
// existing ones, needs a matching change in the mock below. The screen text is in
// SponsorshipEnglish.test.tsx, which renders the drawer without this mock.
const chosen = "33333333-3333-4333-8333-333333333333";
let hookIndex = 0;
const state: unknown[] = [];
mock.module("react", () => ({
  ...React,
  useRef: <T,>(value: T) => {
    const index = hookIndex++;
    if (!(index in state)) state[index] = { current: value };
    return state[index] as { current: T };
  },
  useState: <T,>(initial: T | (() => T)) => {
    const index = hookIndex++;
    if (!(index in state))
      state[index] = typeof initial === "function" ? (initial as () => T)() : initial;
    return [
      state[index] as T,
      (value: T | ((current: T) => T)) => {
        state[index] =
          typeof value === "function" ? (value as (current: T) => T)(state[index] as T) : value;
      },
    ];
  },
}));
// The drawer reads the language from React context, which this test does not mount, so the
// language hook answers from `language`, which is Chinese unless a test switches it. The page
// copy and the sponsorship copy both read it from here.
let language: "zh" | "en" = "zh";
const realLanguage = await import("../adminI18n");
mock.module("../adminI18n", () => ({
  ...realLanguage,
  useAdminLanguage: () => ({
    language,
    copy: realLanguage.adminCopy[language],
    setLanguage: () => {},
  }),
}));
const original = {
  id: "22222222-2222-4222-8222-222222222222",
  status: "needs_followup",
  followupVersion: 1,
  followupAssigneeUserId: null as string | null,
  supporterName: "Synthetic",
  supporterEmail: null,
  supporterPhone: null,
  amountCents: 10000,
  monthlyTier: "100",
  createdAt: "2026-09-30",
  preferences: [],
  proofHistory: [],
  currentProof: null,
  assignments: [],
  periods: [],
  recentAuditLog: [],
};
let pledge: Record<string, unknown> & { id: string; followupVersion: number } = { ...original },
  mode: "lost" | "refresh_fail" | "conflict" | "unknown" = "lost",
  posts = 0,
  reads = 0;
// What every request to the API fails with, when a test sets it; and who is signed in.
let failWith: unknown = null;
let role: "staff" | "admin" = "staff";
const bodies: Array<{ assigneeUserId: string; expectedVersion: number }> = [];
const refetch = async () => {
  reads++;
  if (mode === "refresh_fail" || mode === "unknown")
    return { error: Error("Synthetic unavailable") };
  pledge = {
    ...pledge,
    followupAssigneeUserId: mode === "conflict" ? original.id : chosen,
    followupVersion: 2,
  };
  return { data: { pledge }, error: null };
};
mock.module("@tanstack/react-query", () => ({
  queryOptions: (value: unknown) => value,
  useQueryClient: () => ({ invalidateQueries: async () => {} }),
  useMutation: () => ({}),
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) =>
    queryKey[0] === "sponsorship-pledge"
      ? { data: { pledge }, refetch }
      : queryKey[0] === "sponsorship-followup-assignees"
        ? {
            data: {
              assignees: [{ authUserId: chosen, email: "staff@example.invalid", role: "staff" }],
            },
          }
        : { data: { admin: { role } } },
}));
mock.module("../adoptions/api", () => ({
  fetchCoordinatorJson: async (_url: string, options: { body: string }) => {
    if (failWith !== null) throw failWith;
    bodies.push(JSON.parse(options.body));
    posts++;
    if (mode !== "refresh_fail") throw Error("Response lost");
    return { pledgeId: pledge.id, assigneeUserId: chosen, version: 2, replayed: false };
  },
}));
const { PledgeDetailDrawer } = await import("./PledgeDetailDrawer");
type Props = {
  children?: ReactNode;
  role?: string;
  id?: string;
  onClick?: () => Promise<void>;
  onValueChange?: (value: string) => void;
  onChange?: (event: { target: { files?: File[] } }) => void;
  disabled?: boolean;
};
function walk(node: ReactNode, result: ReactElement<Props>[] = []): ReactElement<Props>[] {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, result);
  } else if (React.isValidElement<Props>(node)) {
    result.push(node);
    walk(node.props.children, result);
  }
  return result;
}
function render() {
  hookIndex = 0;
  return PledgeDetailDrawer({ pledgeId: pledge.id, onClose: () => {}, onChanged: () => {} });
}
async function assign() {
  const select = walk(render()).find(
    (n) =>
      n.props.onValueChange &&
      walk(n.props.children).some((c) => c.props.id === "pledge-followup-assignee"),
  );
  select!.props.onValueChange!(chosen);
  const button = walk(render()).find((n) => n.props.children === "分派跟進");
  await button!.props.onClick!();
}
beforeEach(() => {
  state.length = 0;
  pledge = { ...original };
  posts = 0;
  bodies.length = 0;
  reads = 0;
  mode = "lost";
  language = "zh";
  failWith = null;
  role = "staff";
});
test("lost POST response followed by matching owner/version clears failure", async () => {
  await assign();
  expect(posts).toBe(1);
  expect(reads).toBe(1);
  expect(pledge.followupVersion).toBe(2);
  expect(walk(render()).filter((n) => n.props.role === "alert")).toHaveLength(0);
});
test("known committed assignment is not called failed when refresh is unavailable", async () => {
  mode = "refresh_fail";
  await assign();
  expect(posts).toBe(1);
  expect(
    walk(render()).some(
      (n) => n.props.role === "status" && String(n.props.children).includes("已儲存"),
    ),
  ).toBe(true);
});
test("a different recovered owner remains a conflict", async () => {
  mode = "conflict";
  await assign();
  expect(walk(render()).some((n) => n.props.role === "alert")).toBe(true);
});
test("an unreadable recovery never claims success", async () => {
  mode = "unknown";
  await assign();
  expect(walk(render()).some((n) => n.props.role === "alert")).toBe(true);
});

const textOf = (role: "alert" | "status") =>
  String(walk(render()).find((n) => n.props.role === role)?.props.children);

test("an error shown in Chinese is written in English when the language changes", async () => {
  // The drawer keeps a code for the failure, not the sentence, so the sentence follows the language.
  mode = "conflict";
  await assign();
  expect(textOf("alert")).toBe("跟進資料已有更新，請核對目前職員後再分派。");
  language = "en";
  expect(textOf("alert")).toBe(
    "Follow-up details changed. Check the current owner before assigning again.",
  );
});

test("an unconfirmed result is written in the language it is shown in", async () => {
  mode = "unknown";
  await assign();
  expect(textOf("alert")).toBe("未能確認分派結果；請重新整理或重試原有分派。");
  language = "en";
  expect(textOf("alert")).toBe(
    "The assignment result could not be confirmed. Refresh or retry the original assignment.",
  );
});

test("the saved notice follows the language too", async () => {
  mode = "refresh_fail";
  await assign();
  expect(textOf("status")).toBe("分派已儲存；最新資料未能載入，請重新整理。");
  language = "en";
  expect(textOf("status")).toBe(
    "Assignment saved; the latest details could not load. Please refresh.",
  );
});

const pendingProof = {
  id: "proof-1",
  revision: 2,
  pledgeId: original.id,
  storagePath: null,
  fileName: null,
  fileType: null,
  fileSize: null,
  paymentMethod: "fps",
  reference: "FPS-001",
  amountCents: 30000,
  paymentDate: "2026-09-30",
  reviewStatus: "pending",
  source: "staff",
  reviewedBy: null,
  reviewedAt: null,
  reviewNote: null,
  createdAt: "2026-09-30T02:30:00Z",
};
const openAssignment = {
  id: "assignment-1",
  animalId: "animal-1",
  animalNameSnapshot: "Synthetic cat",
  startedOn: "2026-08-02",
  endedOn: null,
  endReason: null,
  note: null,
  endNote: null,
  animalState: null,
  reviewReason: null,
};
const button = (label: string) => walk(render()).find((n) => n.props.children === label);

test("a review refused because the proof changed reads in the language it is shown in", async () => {
  // The sponsorship API sends this one message in zh-HK, whatever the admin's language.
  role = "admin";
  pledge = { ...original, proofHistory: [pendingProof], currentProof: pendingProof };
  failWith = new Error("付款證明或審批資料已更新，請重新載入。");
  await button("核實通過")!.props.onClick!();
  expect(textOf("alert")).toBe("付款證明或審批資料已更新，請重新載入。");
  language = "en";
  expect(textOf("alert")).toBe(
    "The payment proof or review changed. Reload the pledge and review it again.",
  );
});

test("another reason the server gives for a review is shown as it came, in either language", async () => {
  role = "admin";
  pledge = { ...original, proofHistory: [pendingProof], currentProof: pendingProof };
  failWith = new Error("Sponsorship pledge is not awaiting review");
  await button("核實通過")!.props.onClick!();
  expect(textOf("alert")).toBe("Sponsorship pledge is not awaiting review");
  language = "en";
  expect(textOf("alert")).toBe("Sponsorship pledge is not awaiting review");
});

test("adding an animal that fails without a reason says so in its own words", async () => {
  // Chinese has always shown the review text here; English names the action.
  failWith = "no reason";
  await button("新增動物")!.props.onClick!();
  expect(textOf("alert")).toBe("審核失敗");
  language = "en";
  expect(textOf("alert")).toBe("Could not add the animal. Check the animal UUID and try again.");
  failWith = new Error("Animal 123 cannot be sponsored");
  language = "zh";
  await button("新增動物")!.props.onClick!();
  expect(textOf("alert")).toBe("Animal 123 cannot be sponsored");
});

test("ending a sponsorship that fails without a reason says so in its own words", async () => {
  pledge = { ...original, assignments: [openAssignment] };
  failWith = "no reason";
  await button("結束助養關係")!.props.onClick!();
  expect(textOf("alert")).toBe("審核失敗");
  language = "en";
  expect(textOf("alert")).toBe("Could not end the sponsorship. Refresh the page and try again.");
});

test("a proof file that cannot be attached is explained in the language it is shown in", () => {
  const chooseFile = (file: File) =>
    walk(render()).find((n) => n.props.id === "pledge-payment-proof")!.props.onChange!({
      target: { files: [file] },
    });
  chooseFile(new File([new Uint8Array(0)], "empty.png", { type: "image/png" }));
  expect(textOf("alert")).toBe("檔案大小超過上限（8MB）");
  language = "en";
  expect(textOf("alert")).toBe(
    "The file is empty or larger than the 8MB limit. Choose another file.",
  );
  chooseFile(new File(["text"], "notes.txt", { type: "text/plain" }));
  expect(textOf("alert")).toBe(
    "This file type is not supported. Upload a JPG, PNG, WEBP or PDF file.",
  );
  language = "zh";
  expect(textOf("alert")).toBe("檔案格式不支援，請上載 JPG、PNG、WEBP 或 PDF 檔案");
  // A file that works clears the message.
  chooseFile(new File(["x"], "slip.png", { type: "image/png" }));
  expect(walk(render()).some((n) => n.props.role === "alert")).toBe(false);
});

test("an unknown retry keeps its original version after a background refresh", async () => {
  mode = "unknown";
  await assign();
  pledge = { ...pledge, followupAssigneeUserId: original.id, followupVersion: 3 };
  const button = walk(render()).find((n) => n.props.children === "分派跟進");
  await button!.props.onClick!();
  expect(bodies).toEqual([
    { assigneeUserId: chosen, expectedVersion: 1 },
    { assigneeUserId: chosen, expectedVersion: 1 },
  ]);
});
