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

## Task 3: ConfirmActionDialog

Every confirm in the admin now opens `ConfirmActionDialog`. Its zh text is existing wording only: the consequence
sentence is the site's old zh confirm text word for word, the confirm button is the action's existing zh button
label, the title repeats that label, Cancel is 取消 and the reason label is 原因. Nothing below is in the code.

| Where                                                                                                | Current zh (shipped)                                     | Draft zh (not shipped)                                  | Why                                                                                                  |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `confirmActionCopy.ts` `zh.reasonHint(minLength)`                                                    | (empty; no hint in zh)                                   | 請至少輸入 N 個字。                                     | Shown only when a reason is required (SP-5b-2); English reads "Enter at least N characters."         |
| `volunteers/volunteerRegistrationCopy.ts` `rejectVerb`, the reject dialog title and button           | 拒絕 (existing wording, `pageCopy/pledgeCopy.ts` reject) | (none needed)                                           | Replaces 已拒絕, a state name; the table button still reads 已拒絕                                   |
| `confirmActionCopy.ts` `zh.discardChanges`, used by the template switch and the animal profile close | 放棄更改 (borrowed from `crm/formCopy.ts`)               | 捨棄變更並切換 (template) / 捨棄變更並關閉 (profile)    | The borrowed label does not name what happens next                                                   |
| `content/ContentEditor.tsx` reload: button and title                                                 | 重新載入最新版本 (`conflict.reload`)                     | 重新載入並捨棄修改                                      | Existing label does not say that unsaved content is lost                                             |
| `content/AdoptionInformationManagement.tsx` estate delete: button and title                          | 刪除                                                     | (none needed)                                           | Listed so the sweep is complete                                                                      |
| Every dialog title (all sites)                                                                       | Same text as the confirm button                          | A question per site, e.g. 刪除「某某」？ / 封存此內容？ | A title that repeats the button gives a screen reader little; the sentence below carries the meaning |
| `confirmActionCopy.ts` `zh.working`                                                                  | 處理中… (borrowed from `content/reviewCopy.ts`)          | (none needed)                                           | Shown on the confirm button while the request runs; English reads "Working…"                         |
| `confirmActionCopy.ts` `zh.failed`                                                                   | 操作失敗，請稍後再試。 (borrowed from `access/copy.ts`)  | (none needed)                                           | Shown when a request rejects with an error that has no message                                       |
