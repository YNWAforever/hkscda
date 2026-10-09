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

## Task 4: page headings (`h1`) that differ from the navigation label

`adminHeadingGuard.test.tsx` requires one `h1` per page and that it equals the page's navigation label. English now
does: each English title is the navigation label itself (the English half imports `adminCommonCopy.en.navItems`, so
the two cannot drift). Chinese keeps today's wording, so the table below is every Chinese heading that still differs.
Each is listed in `DIFFERENT_H1` (or `WORKSPACE_ZH_PINNED`, `ZH_TAB_HEADINGS`) in the guard with its current text
pinned. To adopt a draft: replace the zh title at the file:line with the draft, then delete the guard entry.
The draft is the navigation label that is already shipped (`adminCommonCopy.zh.navItems`, or
`volunteerWorkspaceCopy.zh.pages`), so it is existing wording and not a new line.

| Where (file:line, zh half)                                      | Current zh (shipped) | Draft zh (not shipped) | English now reads                       |
| --------------------------------------------------------------- | -------------------- | ---------------------- | --------------------------------------- |
| `internships/copy.ts:25` `title`                                | 獸醫學生實習申請     | 實習計劃               | Internships                             |
| `routes/admin/-dashboardCopy.ts:9` `animalHeadings` (cat)       | 動物管理             | 貓貓                   | Cats                                    |
| `routes/admin/-dashboardCopy.ts:9` `animalHeadings` (dog)       | 動物管理             | 狗狗                   | Dogs                                    |
| `routes/admin/-dashboardCopy.ts:9` `animalHeadings` (sponsor)   | 動物管理             | 助養                   | Sponsorship                             |
| `pageCopy/caseCopy.ts:11` `caseList.title`                      | 領養個案             | 申請                   | Applications                            |
| `pageCopy/caseCopy.ts:34` `intakeInbox.title`                   | 申請收件箱           | 收件箱                 | Inbox                                   |
| `pageCopy/taskCopy.ts:10` `taskCenter.title`                    | 協調員工作中心       | 工作跟進               | Tasks                                   |
| `pageCopy/coordinatorCopy.ts:46` `reports.title`                | 協調員報表           | 報表紀錄               | Reports                                 |
| `pageCopy/coordinatorCopy.ts:84` `statuses.title`               | 協調員狀態           | 狀態設定               | Status settings                         |
| `volunteers/volunteerOverviewCopy.ts:9` `title`                 | 義工營運總覽         | 義工營運中心           | Volunteer operations                    |
| `i18n/adminCommonCopy.ts:287` `dashboard.title.payments`        | 收款紀錄             | 收款                   | Payments                                |
| `content/adoptionInformationCopy.ts:12` `title`                 | 領養資料管理         | 領養資訊               | Adoption information                    |
| `content/adoptionRulesCopy.ts:26` `rules.title` (rules tab)     | 領養規則管理         | 領養資訊               | Adoption information                    |
| `content/adoptionRulesCopy.ts:36` `careTopics.title` (care tab) | 動物照顧須知管理     | 領養資訊               | Adoption information                    |
| `content/knowledgeCopy.ts:18` `title`                           | 知識專區             | 知識庫                 | Knowledge base                          |
| `content/aboutPagesCopy.ts:12` `title`                          | 關於頁面管理         | 關於頁面               | About pages                             |
| `volunteers/activityWorkspaceCopy.ts:12` `title`                | 義工活動工作台       | 活動與報名             | Activities and registrations            |
| `volunteers/activityWorkspaceCopy.ts:14` `calendarTitle`        | 義工活動工作台       | 營運月曆               | Operations calendar                     |
| `volunteers/volunteerTasksCopy.ts:8` `title`                    | 義工今日待辦與通知   | 今日待辦               | Today's tasks                           |
| `volunteers/volunteerOperationsCopy.ts:15` `title`              | 團體申請及義工改期   | 團體安排與改期         | Group arrangements and rescheduling     |
| `volunteers/qualificationsCopy.ts:7` `title`                    | 義工身份與資格核實   | 身份與資格核實         | Identity and qualification verification |
| `volunteers/dailySettingsCopy.ts:17` `title`                    | 全日義工配額         | 全日配額               | Daily quota                             |
| `volunteers/assessmentsCopy.ts:23` `title`                      | 每月義工級別評核     | 級別評核               | Tier assessment                         |
| `volunteers/policySourcesCopy.ts:8` `title`                     | 共用來源、場地及資格 | 場地與資格             | Venues and qualifications               |

Owner question: for the three animal tabs the draft makes the heading the tab name (貓貓 / 狗狗 / 助養). If you prefer
to keep 動物管理 as the page heading in Chinese, the English would still need to follow the tab label, because the
navigation says Cats / Dogs / Sponsorship.

### Task 4: Chinese that appears for the first time, from existing wording

Task 4 gives a page an `h1` in states that had none. Each new Chinese line is a string already shipped:

- Record pages while loading, failed or not found: the destination's label, `adminCommonCopy.zh.navItems` (申請,
  領養人, 支持者, 宣傳內容, and for an animal 貓貓 / 狗狗 / 助養), or 活動與報名 for a registration.
  Files: `adoptions/CaseDetail.tsx`, `adoptions/AdopterDetail.tsx`, `crm/SupporterDetail.tsx`,
  `content/ContentEditor.tsx`, `volunteers/VolunteerRegistrationDetail.tsx`, `routes/admin/animals/$id.edit.tsx`
  (all through `DestinationHeading.tsx`).
- Volunteer policy settings, payment methods and about pages while loading or failed: the page's own title
  (義工政策設定, 付款方式設定, 關於頁面管理).
- The adoption information "page content" tab: 領養資料管理 (the page's title).

### Task 4: Chinese breadcrumbs change shape

The one breadcrumb is now `AdminLayout`'s, in the order group / destination / record. The Chinese label is the existing
導覽路徑. Two old Chinese breadcrumbs are gone: the animals list's "後台 / 動物管理 / 貓貓" (label 麵包屑導覽) and the volunteer
shell's "義工營運中心 / page / 義工個人詳情 or 報名詳情" (label 麵包屑). The generic detail titles 義工個人詳情 / 報名詳情 are no longer
shown in a breadcrumb; 義工個人詳情 remains the person page's `h1`. Nothing new is written.
