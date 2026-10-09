# SP-5b-1 owner drafts (scratch list for Task 9)

A scratch list, not a spec. SP-5b-1 never ships new zh wording: where English gains a line, the zh half
keeps today's text or shows nothing new. Each task appends the zh lines it would need here, so the owner
can approve, reword or drop them in Task 9. Every draft below is a proposal, marked as a draft, and none
of it is in the code.

Each entry gives the English text as shipped, a proposed zh line (draft), and where it would go.

## Task 1: LoadFailure class lines

`LoadFailure` names the class of a failure from the HTTP status. English shows the line; zh shows no
line today (`classLines` in the zh half of `sharedUiCopy` is `null` for every class). To switch a line on
in zh, replace the `null` with the approved text; the component already renders whatever the zh half holds.

All seven go in `src/components/admin/sharedUiCopy.ts`, in `zh.loadFailure.classLines` (lines 13-21), next
to the English in `en.loadFailure.classLines` (lines 43-51).

| Key               | English (shipped)                                                              | Current zh | Draft zh (not shipped)                         |
| ----------------- | ------------------------------------------------------------------------------ | ---------- | ---------------------------------------------- |
| `session`         | Your session has ended.                                                        | (none)     | 登入已失效。                                   |
| `sessionAction`   | Sign in again. (a link to /admin/login)                                        | (none)     | 請重新登入。                                   |
| `forbidden`       | You don't have access to this.                                                 | (none)     | 你沒有權限查看此內容。                         |
| `forbiddenAction` | Go to a page your role can open. (a link to the first page the role can open)  | (none)     | 前往你的角色可以開啟的頁面。                   |
| `notFound`        | This record could not be found. Go back to the list and check it still exists. | (none)     | 找不到這筆記錄。請返回名單，確認記錄仍然存在。 |
| `server`          | The server had a problem. Try again in a moment.                               | (none)     | 伺服器發生問題，請稍後再試。                   |
| `network`         | Could not reach the server. Check your connection and try again.               | (none)     | 未能連線至伺服器。請檢查網絡連線後再試。       |

Which status gives which line: 401 (and any session error, including a changed account) gives `session`, 403 gives `forbidden`, 404 gives
`notFound`, 5xx gives `server`, a request that got no response gives `network`. Any other failure keeps
today's text only.

Notes for the owner:

- `forbiddenAction` is the link text. It only links when `AdminLayout` knows the signed-in role; otherwise
  `forbidden` and `forbiddenAction` are shown as one sentence with no link.
- `sessionAction` is the link text and always links to the sign-in page; a 401 is never shown as "no access".
- An error with no status of its own is classified by its `cause`, one level down.
