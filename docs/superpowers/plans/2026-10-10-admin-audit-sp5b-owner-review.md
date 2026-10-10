# SP-5b-1 admin UX: owner review list

SP-5b-1 made the admin behave the same way everywhere (load errors, confirms, headings, status, dates and money) and shipped no new zh wording. Every zh line below is a proposal. None of it is in the code. This list collects each decision left to the owner, so that nothing is lost when the scratch drafts are deleted.

How to read it:

- File references are repo-relative to `src/components/admin/` unless they start with `src/`. They were re-checked against the head of `codex/audit-final-sp5b-20261010` after Tasks 1 to 8. Where a number differs from the survey (`docs/evidence/sp5b-survey-20261010/a11y.md` and `components.md`), the number here is the current one.
- A decision per item: approve the draft, reword it, or drop it. Reply with the ID.
- "Draft zh" is a proposal. "—" means none was drafted. "(none needed)" means the existing wording stays.
- Source of the drafts: the Task 1, 3, 4 and 5 scratch list (now deleted), `a11y.md` L1 and L2, and `components.md` S5.

| Section | Topic                                                     | Items                                                       |
| ------- | --------------------------------------------------------- | ----------------------------------------------------------- |
| 1       | LoadFailure class lines                                   | 7 (LF-1 to LF-7)                                            |
| 2       | Confirm dialog labels                                     | 8 (DL-1 to DL-8)                                            |
| 3       | State-named button labels                                 | 18 (BT-1 to BT-18)                                          |
| 4       | Next-step error wording                                   | 108 client (ER-001 to ER-108) and 22 server (SV-1 to SV-22) |
| 5       | One conflict sentence                                     | 1 sentence (CF-0) and 15 sites (CF-1 to CF-15)              |
| 6       | Volunteer sidebar group labels                            | 3 (VG-1 to VG-3)                                            |
| 7       | Page headings (Task 4)                                    | 24 (PH-1 to PH-24)                                          |
| 8       | Zh that appears for the first time, from existing wording | 3 notes                                                     |

## 1. LoadFailure class lines (Task 1)

`LoadFailure` names the class of a failure from the HTTP status. English shows the line. zh shows no line today: `classLines` in the zh half is `null` for every class. To switch a line on in zh, replace the `null` with the approved text in `sharedUiCopy.ts`, in `zh.loadFailure.classLines` (lines 13-21), next to the English in `en.loadFailure.classLines` (lines 43-51). The component renders whatever the zh half holds.

| ID   | Key               | File:line            | Current zh | Draft zh                                       | English (shipped)                                                              |
| ---- | ----------------- | -------------------- | ---------- | ---------------------------------------------- | ------------------------------------------------------------------------------ |
| LF-1 | `session`         | `sharedUiCopy.ts:14` | (none)     | 登入已失效。                                   | Your session has ended.                                                        |
| LF-2 | `sessionAction`   | `sharedUiCopy.ts:15` | (none)     | 請重新登入。                                   | Sign in again. (a link to /admin/login)                                        |
| LF-3 | `forbidden`       | `sharedUiCopy.ts:16` | (none)     | 你沒有權限查看此內容。                         | You don't have access to this.                                                 |
| LF-4 | `forbiddenAction` | `sharedUiCopy.ts:17` | (none)     | 前往你的角色可以開啟的頁面。                   | Go to a page your role can open. (a link to the first page the role can open)  |
| LF-5 | `notFound`        | `sharedUiCopy.ts:18` | (none)     | 找不到這筆記錄。請返回名單，確認記錄仍然存在。 | This record could not be found. Go back to the list and check it still exists. |
| LF-6 | `server`          | `sharedUiCopy.ts:19` | (none)     | 伺服器發生問題，請稍後再試。                   | The server had a problem. Try again in a moment.                               |
| LF-7 | `network`         | `sharedUiCopy.ts:20` | (none)     | 未能連線至伺服器。請檢查網絡連線後再試。       | Could not reach the server. Check your connection and try again.               |

Which status gives which line: 401 (and any session error, including a changed account) gives `session`, 403 gives `forbidden`, 404 gives `notFound`, 5xx gives `server`, and a request that got no response gives `network`. Any other failure keeps today's text only.

Notes:

- `forbiddenAction` is the link text. It links only when `AdminLayout` knows the signed-in role. Otherwise `forbidden` and `forbiddenAction` show as one sentence with no link.
- `sessionAction` is the link text and always links to the sign-in page. A 401 is never shown as "no access".
- An error with no status of its own is classified by its `cause`, one level down.
- The session sentence in the server messages is a separate item: `lib/admin/session.ts:29` (`未登入`, English "Not signed in. Sign in again."). See SV-22.

## 2. Confirm dialog labels (Task 3)

Every confirm in the admin opens `ConfirmActionDialog`. Its zh text is existing wording only: the consequence sentence is the site's old zh confirm text word for word, the confirm button is the action's existing zh label, the title repeats that label, Cancel is 取消 and the reason label is 原因.

| ID   | Where (current line)                                                                                                                                                                                         | Current zh (shipped)                                    | Draft zh                                                | Why                                                                                                   |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| DL-1 | `confirmActionCopy.ts:18` `zh.reasonHint(minLength)`                                                                                                                                                         | (empty; no hint in zh)                                  | 請至少輸入 N 個字。                                     | Shown only when a reason is required (SP-5b-2). English: "Enter at least N characters."               |
| DL-2 | `volunteers/volunteerRegistrationCopy.ts:21` `rejectVerb`, the reject dialog title and button (`VolunteerManagement.tsx:661,663`, `VolunteerRegistrationDetail.tsx:163,165`)                                 | 拒絕 (existing wording)                                 | (none needed)                                           | Replaces 已拒絕, a state name, in the dialog. The table button still reads 已拒絕 (BT-2).             |
| DL-3 | `confirmActionCopy.ts:16` `zh.discardChanges`, used by the policy template switch (`volunteers/VolunteerPolicySettings.tsx:249,251`) and the animal profile close (`adoptions/AnimalPipeline.tsx:1000,1002`) | 放棄更改 (borrowed from `crm/formCopy.ts:18`)           | 捨棄變更並切換 (template) / 捨棄變更並關閉 (profile)    | The borrowed label does not name what happens next.                                                   |
| DL-4 | `content/ContentEditor.tsx:485,487` reload dialog title and button (`content/editorCopy.ts:45` `conflict.reload`)                                                                                            | 重新載入最新版本                                        | 重新載入並捨棄修改                                      | The existing label does not say that unsaved content is lost.                                         |
| DL-5 | `content/AdoptionInformationManagement.tsx:322-333` estate delete (`copy.estates.delete`)                                                                                                                    | 刪除                                                    | (none needed)                                           | Listed so the sweep is complete.                                                                      |
| DL-6 | Every dialog title (all sites)                                                                                                                                                                               | Same text as the confirm button                         | A question per site, e.g. 刪除「某某」？ / 封存此內容？ | A title that repeats the button gives a screen reader little. The sentence below carries the meaning. |
| DL-7 | `confirmActionCopy.ts:20` `zh.working`                                                                                                                                                                       | 處理中… (borrowed from `content/reviewCopy.ts`)         | (none needed)                                           | Shown on the confirm button while the request runs. English: "Working…".                              |
| DL-8 | `confirmActionCopy.ts:21` `zh.failed`                                                                                                                                                                        | 操作失敗，請稍後再試。 (borrowed from `access/copy.ts`) | (none needed)                                           | Shown when a request rejects with an error that has no message.                                       |

## 3. State-named button labels (survey `a11y.md` L1-a)

These zh action buttons read as a state or a noun, not a verb. English already uses a verb except where noted. Suggestions are proposals. Line numbers are the current copy lines.

| ID    | Current zh                        | File:line (current)                                        | EN today                                                       | Draft zh                                                                                        |
| ----- | --------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| BT-1  | 已批准                            | `volunteers/volunteerRegistrationCopy.ts:15`               | Approve                                                        | 批准 (or 批核, the owner picks)                                                                 |
| BT-2  | 已拒絕                            | `volunteers/volunteerRegistrationCopy.ts:17`               | Reject                                                         | 拒絕                                                                                            |
| BT-3  | 待審批                            | `volunteers/volunteerRegistrationCopy.ts:14`               | Mark pending                                                   | 改為待審批                                                                                      |
| BT-4  | 候補中                            | `volunteers/volunteerRegistrationCopy.ts:16`               | Add to waitlist                                                | 加入候補                                                                                        |
| BT-5  | 已取消                            | `volunteers/volunteerRegistrationCopy.ts:18`               | Mark cancelled                                                 | 取消報名                                                                                        |
| BT-6  | 已出席                            | `volunteers/volunteerRegistrationCopy.ts:25`               | Mark attended                                                  | 標記出席                                                                                        |
| BT-7  | 缺席                              | `volunteers/volunteerRegistrationCopy.ts:27`               | Mark no-show                                                   | 標記缺席                                                                                        |
| BT-8  | 未記錄                            | `volunteers/volunteerRegistrationCopy.ts:24`               | Mark not recorded                                              | 標記為未記錄                                                                                    |
| BT-9  | 已完成                            | `volunteers/volunteerRegistrationCopy.ts:26`               | Mark completed                                                 | 標記完成 (the same file already has 標記完成 at `management.registrations.markCompleted`)       |
| BT-10 | 新查詢 / 處理中 / 已解決 / 已結案 | `volunteers/groupEnquiryCopy.ts:17-20`                     | New / In progress / Resolved / Closed (status names in EN too) | 改為處理中 / 標記為已解決 / 結案 / 重新開啟; EN: Mark in progress, Mark resolved, Close, Reopen |
| BT-11 | 已手動送出                        | `content/editorPanelsCopy.ts:83` (`markSent`)              | Mark as sent                                                   | 標記為已送出                                                                                    |
| BT-12 | 已核實，更新聯絡人主檔            | `sponsorship/financeCopy.ts:48`                            | Verify and update supporter record                             | 核實並更新聯絡人主檔                                                                            |
| BT-13 | 手動捐款                          | `crm/formCopy.ts:37` (dialog trigger)                      | Manual donation (a noun in EN too)                             | 記錄手動捐款; EN: Record manual donation                                                        |
| BT-14 | 捐款人                            | `crm/copy.ts:121` (back link, `SupporterDetail.tsx:121`)   | Supporters (a noun in EN too)                                  | 返回支持者名單 (the glossary says "supporter" where it names the record)                        |
| BT-15 | 通知草稿                          | `content/editorPanelsCopy.ts:52` (`createDrafts`)          | Create notification drafts                                     | 產生通知草稿                                                                                    |
| BT-16 | 較早版本 / 最新版本               | `content/editorPanelsCopy.ts:116` / `:115`                 | Show earlier / latest versions                                 | 顯示較早版本 / 顯示最新版本                                                                     |
| BT-17 | 完成                              | `crm/formCopy.ts:78`                                       | Close                                                          | 關閉                                                                                            |
| BT-18 | 解析星期設定                      | `volunteers/policyAdvancedCopy.ts:102` (`resolveWeekdays`) | Set the weekdays                                               | 設定適用星期 (the current zh meaning is unclear)                                                |

Not in the 18 above, low priority: `i18n/adminCommonCopy.ts:188` 確認 (`common.confirm`, EN Confirm) could read 確認封存 for the inline archive step; the glossary allows 確認 as "finishes a step". The inline archive step in `AnimalsTable.tsx` now opens `ConfirmActionDialog`, so check whether this label is still used before spending time on it.

The same survey part lists English labels that are not verbs on action buttons: "Manual donation" (BT-13), "Supporters" (BT-14), "New supporter" (`SupporterFormDialog.tsx`), "New status" (`StatusAdmin.tsx`) and the four group-enquiry status names (BT-10). They are for the English owner review and need no zh decision.

## 4. Next-step error wording (survey `a11y.md` L2)

zh failure messages that say what failed but not what to do next. The English half of each key already says what to do next, so the English half is the model. Nothing here is in the code.

How the survey list was used:

- All 108 client strings from L2-a are listed one by one below, each with the line found by search on the current head. Items the survey listed twice at one line (ER-081 and ER-082 are `crm/bulkCopy.ts:26` and `:76`) are resolved to two lines.
- Strings that moved out of the copy module into `src/lib/` are cited at their new home (ER-034 to ER-036, ER-071 to ER-076, ER-105, ER-106).
- Pattern column, proposed once for the whole class so that you decide the pattern, not 108 sentences. When you approve a pattern, the full sweep applies it to every row of that class.
  - **L** (load or read failed): append 請重新整理頁面後再試。 Rows tagged "inside LoadFailure" already get a retry button and an error reference, so the title needs no suffix.
  - **N** (not found): append 請返回名單，確認記錄仍然存在。
  - **S** (selection or preview failed): append 請重新選取後再試。
  - **V** (limit or validation): keep the sentence and say how to fix it, e.g. 圖片不可超過 8 MiB，請選擇較小的檔案。
  - **A** (action failed): append 請重試。 Where a prefix passes the server's text through (ER-037), add the same suffix after it.
  - **E** (English text in a zh half): needs real zh. Draft zh from the SP-5a list is in the notes below the tables.

#### Legend for the tables

ER-NNN is the item ID. File paths are relative to `src/components/admin/` unless they start with `src/`.

#### 1. Adoptions, coordinator, supporters pages (23)

| ID     | File:line (current)                 | Current zh                                  | Pattern               |
| ------ | ----------------------------------- | ------------------------------------------- | --------------------- |
| ER-001 | `adoptions/adopterDetailCopy.ts:8`  | 找不到領養人檔案                            | N                     |
| ER-002 | `adoptions/adopterDetailCopy.ts:17` | (message) => '無法載入跟進狀態: ${message}' | L                     |
| ER-003 | `adoptions/caseDetailCopy.ts:7`     | 找不到個案                                  | N                     |
| ER-004 | `adoptions/caseDetailCopy.ts:9`     | (message) => '無法載入狀態: ${message}'     | L                     |
| ER-005 | `adoptions/caseDetailCopy.ts:92`    | (message) => '無法開啟相片: ${message}'     | A                     |
| ER-006 | `adoptions/copy.ts:59`              | 無法建立預覽                                | S                     |
| ER-007 | `adoptions/copy.ts:21`              | 無法選取                                    | S                     |
| ER-008 | `adoptions/copy.ts:23`              | 無法固定選取範圍                            | S                     |
| ER-009 | `adoptions/copy.ts:147`             | 成功領養完成紀錄需要使用已領養結果狀態。    | V                     |
| ER-010 | `pageCopy/caseCopy.ts:22`           | 無法載入狀態篩選                            | L                     |
| ER-011 | `pageCopy/caseCopy.ts:38`           | 無法載入收件箱                              | L; inside LoadFailure |
| ER-012 | `pageCopy/caseCopy.ts:67`           | 無法載入領養個案狀態                        | L                     |
| ER-013 | `pageCopy/caseCopy.ts:68`           | 無法載入跟進工作狀態                        | L                     |
| ER-014 | `pageCopy/caseCopy.ts:74`           | 無法搜尋身份                                | A                     |
| ER-015 | `pageCopy/coordinatorCopy.ts:48`    | 無法載入每月摘要                            | L                     |
| ER-016 | `pageCopy/coordinatorCopy.ts:49`    | 無法載入匯出紀錄                            | L                     |
| ER-017 | `pageCopy/coordinatorCopy.ts:91`    | 無法載入狀態                                | L                     |
| ER-018 | `pageCopy/sharedCopy.ts:39`         | 下載失敗                                    | A                     |
| ER-019 | `pageCopy/sharedCopy.ts:40`         | 匯出失敗                                    | A                     |
| ER-020 | `pageCopy/supporterCopy.ts:16`      | 無法載入支持者                              | L                     |
| ER-021 | `pageCopy/supporterCopy.ts:18`      | 無法載入支持者                              | L                     |
| ER-022 | `pageCopy/taskCopy.ts:21`           | 無法載入協調員工作                          | L                     |
| ER-023 | `pageCopy/taskCopy.ts:22`           | 無法載入工作狀態                            | L                     |

#### 2. Sponsorship (17)

| ID     | File:line (current)                                    | Current zh                                   | Pattern |
| ------ | ------------------------------------------------------ | -------------------------------------------- | ------- |
| ER-024 | `pageCopy/pledgeCopy.ts:67`                            | 審核失敗                                     | A       |
| ER-025 | `pageCopy/pledgeCopy.ts:70`                            | 審核失敗                                     | A       |
| ER-026 | `pageCopy/pledgeCopy.ts:71`                            | 審核失敗                                     | A       |
| ER-027 | `pageCopy/pledgeCopy.ts:77`                            | 取消失敗                                     | A       |
| ER-028 | `pageCopy/pledgeCopy.ts:78`                            | 記錄付款失敗                                 | A       |
| ER-029 | `pageCopy/pledgeCopy.ts:120`                           | (message) => '無法載入付款證明：${message}'  | L       |
| ER-030 | `sponsorship/bulkCopy.ts:32`                           | 無法建立預覽                                 | S       |
| ER-031 | `sponsorship/bulkCopy.ts:85`                           | 沒有已過月份的未核對承諾；目前無需建立草稿。 | A       |
| ER-032 | `sponsorship/copy.ts:29`                               | 無法選取                                     | S       |
| ER-033 | `sponsorship/copy.ts:30`                               | 無法固定選取範圍                             | S       |
| ER-034 | `src/lib/sponsorshipAdmin/followupBulkSelection.ts:10` | 助養批量選取須為 1 至 1000 筆                | S       |
| ER-035 | `src/lib/sponsorshipAdmin/followupBulkSelection.ts:14` | 助養列表在選取期間變更                       | S       |
| ER-036 | `src/lib/sponsorshipAdmin/followupBulkSelection.ts:18` | 最多只能選取 1000 筆助養承諾                 | S       |
| ER-037 | `sponsorship/drawerCopy.ts:42`                         | (reason) => reason                           | A       |
| ER-038 | `sponsorship/drawerCopy.ts:60`                         | 檔案大小超過上限（8MB）                      | V       |
| ER-039 | `sponsorship/financeCopy.ts:43`                        | 未能載入財務資料                             | L       |
| ER-040 | `sponsorship/financeCopy.ts:88`                        | 未能完成操作                                 | A       |

#### 3. Animals, login and shell (9)

| ID     | File:line (current)           | Current zh           | Pattern |
| ------ | ----------------------------- | -------------------- | ------- |
| ER-041 | `animalFormCopy.ts:15`        | 未能載入已儲存草稿。 | L       |
| ER-042 | `animalFormCopy.ts:22`        | 未能複製版本。       | A       |
| ER-043 | `animalFormCopy.ts:26`        | 相片集上載失敗。     | A       |
| ER-044 | `animalFormCopy.ts:77`        | 未能建立預覽。       | S       |
| ER-045 | `animalListCopy.ts:40`        | 無法讀取修復佇列。   | L       |
| ER-046 | `i18n/adminCommonCopy.ts:262` | 電郵或密碼錯誤       | V       |
| ER-047 | `i18n/adminCommonCopy.ts:319` | 找不到此動物         | N       |
| ER-048 | `i18n/adminCommonCopy.ts:336` | 儲存失敗             | A       |
| ER-049 | `i18n/adminCommonCopy.ts:337` | 圖片上載失敗         | A       |

#### 4. Content, CMS, FAQ, documents (29)

| ID     | File:line (current)                                   | Current zh                                                        | Pattern               |
| ------ | ----------------------------------------------------- | ----------------------------------------------------------------- | --------------------- |
| ER-050 | `content/aboutPagesCopy.ts:15`                        | 無法載入頁面內容                                                  | L; inside LoadFailure |
| ER-051 | `content/adoptionGuideCopy.ts:107`                    | This release changed elsewhere. Reload before saving again.       | E; English in zh      |
| ER-052 | `content/adoptionGuideCopy.ts:108`                    | Unable to save this release.                                      | E; English in zh      |
| ER-053 | `content/adoptionInstructionsCopy.ts:123`             | 未能載入更多版本。                                                | L                     |
| ER-054 | `content/adoptionInstructionsCopy.ts:124`             | 未能載入版本內容。                                                | L                     |
| ER-055 | `content/adoptionRulesCopy.ts:30`                     | 無法載入領養規則                                                  | L; inside LoadFailure |
| ER-056 | `content/adoptionRulesCopy.ts:44`                     | 無法載入照顧須知                                                  | L; inside LoadFailure |
| ER-057 | `content/contentCommonCopy.ts:59`                     | 圖片不可超過 8 MiB                                                | V                     |
| ER-058 | `content/contentCommonCopy.ts:63`                     | 無法取得私密媒體上傳位置                                          | A                     |
| ER-059 | `content/documentsCopy.ts:27`                         | PDF 檔案不可超過 50 MiB                                           | V                     |
| ER-060 | `content/editorCopy.ts:31`                            | 找不到宣傳內容。                                                  | N                     |
| ER-061 | `content/editorPanelsCopy.ts:110`                     | 無法載入版本紀錄                                                  | L; inside LoadFailure |
| ER-062 | `content/faqCopy.ts:25`                               | 無法載入常見問題                                                  | L; inside LoadFailure |
| ER-063 | `content/faqCopy.ts:72`                               | 無法載入搜尋主題報告                                              | L; inside LoadFailure |
| ER-064 | `content/governanceCopy.ts:10`                        | 無法載入團隊名單                                                  | L; inside LoadFailure |
| ER-065 | `content/managementCopy.ts:33`                        | 無法載入待核對清單。                                              | L                     |
| ER-066 | `content/paymentMethodsCopy.ts:32`                    | This configuration changed elsewhere. Reload before saving again. | E; English in zh      |
| ER-067 | `content/paymentMethodsCopy.ts:33`                    | Unable to save this configuration.                                | E; English in zh      |
| ER-068 | `content/reviewCopy.ts:44`                            | 未能載入審核佇列。                                                | L                     |
| ER-069 | `content/reviewCopy.ts:63`                            | 無法選取                                                          | S                     |
| ER-070 | `content/reviewCopy.ts:65`                            | 無法固定選取範圍                                                  | S                     |
| ER-071 | `src/lib/contentReview/cmsBulkSelection.ts:18`        | CMS review bulk selection must contain 1 to 1000 profiles         | E; English in zh      |
| ER-072 | `src/lib/contentReview/cmsBulkSelection.ts:22`        | CMS review queue changed during bulk selection                    | E; English in zh      |
| ER-073 | `src/lib/contentReview/cmsBulkSelection.ts:26`        | 最多只能選取 1000 筆CMS 草稿                                      | S                     |
| ER-074 | `src/lib/contentReview/animalBulkSelection.ts:18`     | Animal review bulk selection must contain 1 to 1000 profiles      | E; English in zh      |
| ER-075 | `src/lib/contentReview/animalBulkSelection.ts:22`     | Animal review queue changed during bulk selection                 | E; English in zh      |
| ER-076 | `src/lib/contentReview/animalBulkSelection.ts:26`     | 最多只能選取 1000 筆動物草稿                                      | S                     |
| ER-077 | `content/reviewCopy.ts:105`                           | 無法建立送審預覽                                                  | S                     |
| ER-078 | `src/routes/admin/content/-adoptionPreviewCopy.ts:10` | 未能載入領養頁面預覽。                                            | L                     |

#### 5. Supporters (CRM) (6)

| ID     | File:line (current)   | Current zh           | Pattern               |
| ------ | --------------------- | -------------------- | --------------------- |
| ER-079 | `crm/bulkCopy.ts:121` | 無法預覽資料格式     | S                     |
| ER-080 | `crm/bulkCopy.ts:71`  | 無法載入可指派的職員 | L                     |
| ER-081 | `crm/bulkCopy.ts:26`  | 無法建立預覽         | S                     |
| ER-082 | `crm/bulkCopy.ts:76`  | 無法建立預覽         | S                     |
| ER-083 | `crm/copy.ts:120`     | 無法載入捐款人。     | L; inside LoadFailure |
| ER-084 | `crm/copy.ts:28`      | 無法固定選取範圍     | S                     |

#### 6. Donations (1)

| ID     | File:line (current)    | Current zh | Pattern |
| ------ | ---------------------- | ---------- | ------- |
| ER-085 | `donations/copy.ts:66` | 匯出失敗   | A       |

#### 7. Volunteers (16)

| ID     | File:line (current)                          | Current zh                                              | Pattern |
| ------ | -------------------------------------------- | ------------------------------------------------------- | ------- |
| ER-086 | `volunteers/groupEnquiryCopy.ts:55`          | (error) => '通知發送失敗：${error ?? "未提供錯誤訊息"}' | V       |
| ER-087 | `volunteers/policySettingsCopy.ts:15`        | 未能載入義工政策。                                      | L       |
| ER-088 | `volunteers/policySettingsCopy.ts:110`       | 操作失敗。                                              | A       |
| ER-089 | `volunteers/policySimulationCopy.ts:54`      | 未能載入模擬資料                                        | L       |
| ER-090 | `volunteers/policySourcesCopy.ts:48`         | 未能載入設定。                                          | L       |
| ER-091 | `volunteers/qualificationsCopy.ts:11`        | 未能載入身份資料。                                      | L       |
| ER-092 | `volunteers/volunteerDirectoryCopy.ts:35`    | 未能載入義工名冊。搜尋條件已保留。                      | L       |
| ER-093 | `volunteers/volunteerDirectoryCopy.ts:66`    | 無法選取                                                | S       |
| ER-094 | `volunteers/volunteerDirectoryCopy.ts:67`    | 無法固定選取範圍                                        | S       |
| ER-095 | `volunteers/volunteerDirectoryCopy.ts:78`    | 搜尋未能完成。                                          | A       |
| ER-096 | `volunteers/volunteerDirectoryCopy.ts:108`   | 無法建立預覽                                            | S       |
| ER-097 | `volunteers/volunteerOverviewCopy.ts:18`     | 部分統計未能載入。                                      | L       |
| ER-098 | `volunteers/volunteerOverviewCopy.ts:64`     | 未能載入今日場次。                                      | L       |
| ER-099 | `volunteers/volunteerPersonCopy.ts:89`       | 未能載入個人紀錄。身份可能不存在，或目前未能連線。      | L       |
| ER-100 | `volunteers/volunteerRegistrationCopy.ts:34` | 找不到義工報名。                                        | N       |
| ER-101 | `volunteers/volunteerTasksCopy.ts:13`        | 未能載入待辦。                                          | L       |

#### 8. Internships (5)

| ID     | File:line (current)                 | Current zh               | Pattern |
| ------ | ----------------------------------- | ------------------------ | ------- |
| ER-102 | `internships/copy.ts:88`            | 設定未能儲存             | A       |
| ER-103 | `internships/copy.ts:89`            | 未能完成審核             | A       |
| ER-104 | `internships/copy.ts:90`            | 未能開啟私人附件         | A       |
| ER-105 | `src/lib/internships/service.ts:33` | 截止時間必須晚於開放時間 | V       |
| ER-106 | `src/lib/internships/service.ts:45` | 沒有此操作權限           | V       |

#### 9. Access (1)

| ID     | File:line (current) | Current zh     | Pattern |
| ------ | ------------------- | -------------- | ------- |
| ER-107 | `access/copy.ts:33` | 未能載入紀錄。 | L       |

#### 10. Other (bulk, operations) (1)

| ID     | File:line (current)     | Current zh | Pattern |
| ------ | ----------------------- | ---------- | ------- |
| ER-108 | `operations/copy.ts:19` | 未能讀取   | L       |

Drafts for the English-in-zh rows (pattern E):

| IDs    | English text today                                                                                     | Draft zh                                                           |
| ------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| ER-071 | CMS review bulk selection must contain 1 to 1000 profiles                                              | CMS 草稿批量選取須為 1 至 1000 筆                                  |
| ER-072 | CMS review queue changed during bulk selection                                                         | CMS 審核佇列在選取期間變更                                         |
| ER-074 | Animal review bulk selection must contain 1 to 1000 profiles                                           | 動物草稿批量選取須為 1 至 1000 筆                                  |
| ER-075 | Animal review queue changed during bulk selection                                                      | 動物審核佇列在選取期間變更                                         |
| ER-051 | This release changed elsewhere. Reload before saving again. (`content/adoptionGuideCopy.ts:107`)       | 此版本已在其他地方更新。請重新載入後再儲存。 (see section 5, CF-4) |
| ER-052 | Unable to save this release. (`content/adoptionGuideCopy.ts:108`)                                      | 未能儲存此版本。請檢查資料後重試。                                 |
| ER-066 | This configuration changed elsewhere. Reload before saving again. (`content/paymentMethodsCopy.ts:32`) | 此設定已在其他地方更新。請重新載入後再儲存。 (see CF-5)            |
| ER-067 | Unable to save this configuration. (`content/paymentMethodsCopy.ts:33`)                                | 未能儲存此設定。請檢查資料後重試。                                 |

Other English-in-zh places the survey (L1-b) found and the SP-5a list already tracks (E1 to E18) are not repeated here: the animal pipeline screen (`adoptions/animalPipelineCopy.ts`, about 79 strings), the knowledge screen (`content/knowledgeCopy.ts`, 17), the guide pager (`content/adoptionGuideCopy.ts:36-38`), the payments pager labels (`donations/copy.ts:90-91`), the bulk result words (`bulk/copy.ts:41-47`), `adminI18n.tsx:82` and the sr-only `Close` in `ui/dialog.tsx` and `ui/sheet.tsx`. They need owner-approved zh wording first.

### Server-side messages with no next step (survey L2-b)

`src/lib/volunteers/serverErrors.ts`, the zh column of the same table that already has English next steps. The survey lists 21 of the 40 entries, and the lines are unchanged on the current head. `src/lib/admin/session.ts:29` is the 22nd.

| ID    | Line                          | zh text today                                    | Draft zh (owner to approve)                                       |
| ----- | ----------------------------- | ------------------------------------------------ | ----------------------------------------------------------------- |
| SV-1  | 24                            | 沒有此操作權限                                   | 你沒有此操作的權限，請向管理員申請權限                            |
| SV-2  | 29                            | 服務地點無效                                     | 服務地點無效，請從清單選擇後再試                                  |
| SV-3  | 38                            | 日期範圍須在93日內                               | 日期範圍須在93日內，請縮短範圍後再試                              |
| SV-4  | 51                            | 未能更新跟進事項                                 | 未能更新跟進事項，請重試                                          |
| SV-5  | 56                            | 找不到義工身份                                   | 找不到此義工身份，請返回名冊重新選擇                              |
| SV-6  | 64                            | 沒有查閱權限                                     | 你沒有查閱權限，請向管理員申請                                    |
| SV-7  | 73                            | 無效的要求內容                                   | 無法讀取要求，請重新載入頁面後再試                                |
| SV-8  | 94                            | 活動尚未開始或完成，不能記錄此出席狀態。         | 加上「請在活動後再試」                                            |
| SV-9  | 102                           | 只有已批准且未取消的活動報名可以記錄出席。       | 加上「請先檢查報名狀態」                                          |
| SV-10 | 115                           | 沒有核實資格權限                                 | 你沒有核實資格的權限，請向管理員申請                              |
| SV-11 | 124                           | 無效要求                                         | 無法讀取要求，請重新載入頁面後再試                                |
| SV-12 | 132                           | 未能處理每月評核                                 | 未能處理每月評核，請重新載入頁面後再試                            |
| SV-13 | 146                           | 義工缺少本場次所需的已核實資格。                 | 加上「請先核實資格」                                              |
| SV-14 | 150                           | 義工未達本場次的最低年齡。                       | 加上「請選擇其他場次」                                            |
| SV-15 | 154                           | 義工級別不符合本場次政策。                       | 加上「請選擇其他場次」                                            |
| SV-16 | 158                           | 義工不符合此職務的資格要求。                     | 加上「請選擇其他職務」                                            |
| SV-17 | 162                           | 義工在此場次已有報名。                           | 加上「請查看現有報名」                                            |
| SV-18 | 170                           | 此級別未開放此星期的報名。                       | 加上「請選擇其他日期」                                            |
| SV-19 | 178                           | 本場次已有出席事實，不能更改歷史時間或場次身份。 | 加上「只可更改其他資料」                                          |
| SV-20 | 182                           | 已核實的單人報名不能更改為多人或其他報名種類。   | 加上「請建立新報名」                                              |
| SV-21 | 190                           | 場次身份變更需要政策預覽。                       | 加上「請到政策設定預覽」                                          |
| SV-22 | `src/lib/admin/session.ts:29` | 未登入                                           | 登入已過期，請重新登入 (English: "Not signed in. Sign in again.") |

`src/lib/contentReview/serverErrors.ts:19` and `src/lib/sponsorshipAdmin/serverErrors.ts:18` already have next steps.

Out of scope here, and tracked in the survey (L2-c, L2-d): raw codes and server text that pass through (bulk status words, `reasonCode`, `last_error`, zod text, fixed prefixes plus `${message}`), and about 128 distinct English API error strings against 38 zh. The full sweep of sections 4 and the server list happens when the owner approves the patterns above.

## 5. One conflict sentence (survey `components.md` S5)

The audit's sentence 「另一位同事已更新此記錄」 appears nowhere today. About a dozen different zh sentences stand in for it, two of them in English. Proposal: one sentence for every editor that has a version token, with a reload control and the user's edits kept.

| ID   | Proposed zh                                                  | Reload control                                                     |
| ---- | ------------------------------------------------------------ | ------------------------------------------------------------------ |
| CF-0 | 另一位同事已更新此記錄。你的修改已保留，請重新載入後再儲存。 | A 重新載入 button; the edits stay on screen until the user chooses |

The wording after 「另一位同事已更新此記錄」 is a draft; the first clause is the audit's. Nothing is built yet: SP-5b-1 did not add a shared `ConflictNotice`.

Variant sites to replace when CF-0 is approved (current lines of the zh sentence):

| ID    | Editor                                       | File:line (current)                      | zh sentence today                                                                                                            |
| ----- | -------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| CF-1  | Content item                                 | `content/editorCopy.ts:43`               | 內容已有較新版本或發布網址衝突。你的輸入已保留，請比較最新內容；重新載入前請先複製要保留的文字。                             |
| CF-2  | Adoption instructions                        | `content/adoptionInstructionsCopy.ts:90` | 伺服器草稿版本 N。請比較本機與伺服器內容，再決定是否採用。                                                                   |
| CF-3a | Adoption fees                                | `content/adoptionInformationCopy.ts:30`  | 領養費用已由其他人更新。請檢查最新版本後重新輸入。                                                                           |
| CF-3b | Adoption estates                             | `content/adoptionInformationCopy.ts:47`  | 此屋苑已由其他人更新。請先檢查最新版本，再重新輸入你的修改。                                                                 |
| CF-4  | Guide release                                | `content/adoptionGuideCopy.ts:107`       | English in zh: "This release changed elsewhere. Reload before saving again."                                                 |
| CF-5  | Payment method                               | `content/paymentMethodsCopy.ts:32`       | English in zh: "This configuration changed elsewhere. Reload before saving again."                                           |
| CF-6  | CRM supporter edit                           | `crm/formCopy.ts:14`                     | 資料已由其他職員更新。你的修改尚未儲存；請重新載入最新版本再編輯。                                                           |
| CF-7  | Group enquiry                                | `volunteers/groupEnquiryCopy.ts:45`      | 資料已被其他職員更新，請重新整理頁面後再試。                                                                                 |
| CF-8  | Volunteer policy draft                       | `volunteers/policySettingsCopy.ts:109`   | 草稿已被其他管理員更新，請重新載入。                                                                                         |
| CF-9  | Volunteer registration, activity, attendance | `src/lib/volunteers/apiResult.ts:16`     | 資料已被更新，請重新整理及預覽後再試。                                                                                       |
| CF-10 | Activity bulk operation                      | `volunteers/activityOperationCopy.ts:99` | 有組別已變更，請重新鎖定範圍並預覽；不要重用舊預覽。                                                                         |
| CF-11 | Bank match (re-preview)                      | `volunteers/activityWorkspaceCopy.ts:23` | 資料已變更，須重新預覽 (the survey also lists 資料已變，須重新預覽 in `donations/bankCopy.ts`; not re-checked)               |
| CF-12 | Sponsorship follow-up assignment             | `pageCopy/pledgeCopy.ts:75`              | 跟進資料已有更新，請核對目前職員後再分派。                                                                                   |
| CF-13 | Animal publish                               | `animalFormCopy.ts:81`                   | 草稿已變更或發布失敗，請重新預覽。                                                                                           |
| CF-14 | Internship review                            | `src/lib/internships/service.ts:49`      | 操作不符合目前申請狀態或核實要求                                                                                             |
| CF-15 | Animal draft save                            | (no sentence; `AnimalForm.tsx`)          | The save does not tell a 409 from any other failure, so the generic save error shows. This needs a code change, not wording. |

Two conflicts are detected by matching the English message text (`content/AdoptionInformationManagement.tsx`, "Fee version or order conflict" and "Estate version conflict"). That is a code fix and belongs to the shared-notice work. Eleven editors have no version token at all (FAQ, governance, knowledge, about pages, adoption rules, care topics, statuses, tasks, document and annual-report edits, adopter edits, consents); a version token needs a migration and an RPC and is not part of this proposal.

## 6. Volunteer sidebar group labels (Task 5)

The audit names the three groups, so they ship in both languages. The zh half replaces the two old group labels. The file is `volunteerWorkspaceCopy.ts` (`groups`, zh at line 34, English at line 98). Confirm or reword.

| ID   | Group  | Current zh before Task 5              | Shipped zh (`volunteerWorkspaceCopy.ts:35-37`) | Shipped en |
| ---- | ------ | ------------------------------------- | ---------------------------------------------- | ---------- |
| VG-1 | daily  | 日常營運 (the old "operations" group) | 日常                                           | Daily work |
| VG-2 | people | none (a new group)                    | 人員                                           | People     |
| VG-3 | policy | 管理員設定 (the old "settings" group) | 政策                                           | Policy     |

Owner questions: 級別評核 (assessments) sits under 政策 because it is administrator-only like the other policy pages. Move it to 人員 if you see it as a people task (its roles stay administrator-only, as `access.ts` has them). 身份與資格核實 (qualifications) sits under 人員.

## 7. Page headings that differ from the navigation label (Task 4)

`adminHeadingGuard.test.tsx` requires one `h1` per page and that it equals the page's navigation label. English does: each English title is the navigation label itself (the English half imports `adminCommonCopy.en.navItems`, so the two cannot drift). Chinese keeps today's wording, so the table is every Chinese heading that still differs. Each is listed in `DIFFERENT_H1` (line 55), `WORKSPACE_ZH_PINNED` or `ZH_TAB_HEADINGS` (line 255) in the guard with its current text pinned. To adopt a draft: replace the zh title at the file:line with the draft, then delete the guard entry. Each draft is a navigation label that already ships (`adminCommonCopy.zh.navItems`, or `volunteerWorkspaceCopy.zh.pages`), so it is existing wording, not a new line.

| ID    | Where (file:line, current)                                        | Current zh (shipped) | Draft zh       | English now reads                       |
| ----- | ----------------------------------------------------------------- | -------------------- | -------------- | --------------------------------------- |
| PH-1  | `internships/copy.ts:25` `title`                                  | 獸醫學生實習申請     | 實習計劃       | Internships                             |
| PH-2  | `src/routes/admin/-dashboardCopy.ts:9` `animalHeadings` (cat)     | 動物管理             | 貓貓           | Cats                                    |
| PH-3  | `src/routes/admin/-dashboardCopy.ts:9` `animalHeadings` (dog)     | 動物管理             | 狗狗           | Dogs                                    |
| PH-4  | `src/routes/admin/-dashboardCopy.ts:9` `animalHeadings` (sponsor) | 動物管理             | 助養           | Sponsorship                             |
| PH-5  | `pageCopy/caseCopy.ts:11` `caseList.title`                        | 領養個案             | 申請           | Applications                            |
| PH-6  | `pageCopy/caseCopy.ts:34` `intakeInbox.title`                     | 申請收件箱           | 收件箱         | Inbox                                   |
| PH-7  | `pageCopy/taskCopy.ts:10` `taskCenter.title`                      | 協調員工作中心       | 工作跟進       | Tasks                                   |
| PH-8  | `pageCopy/coordinatorCopy.ts:46` `reports.title`                  | 協調員報表           | 報表紀錄       | Reports                                 |
| PH-9  | `pageCopy/coordinatorCopy.ts:84` `statuses.title`                 | 協調員狀態           | 狀態設定       | Status settings                         |
| PH-10 | `volunteers/volunteerOverviewCopy.ts:9` `title`                   | 義工營運總覽         | 義工營運中心   | Volunteer operations                    |
| PH-11 | `i18n/adminCommonCopy.ts:287` `dashboard.title.payments`          | 收款紀錄             | 收款           | Payments                                |
| PH-12 | `content/adoptionInformationCopy.ts:12` `title`                   | 領養資料管理         | 領養資訊       | Adoption information                    |
| PH-13 | `content/adoptionRulesCopy.ts:26` `rules.title` (rules tab)       | 領養規則管理         | 領養資訊       | Adoption information                    |
| PH-14 | `content/adoptionRulesCopy.ts:36` `careTopics.title` (care tab)   | 動物照顧須知管理     | 領養資訊       | Adoption information                    |
| PH-15 | `content/knowledgeCopy.ts:18` `title`                             | 知識專區             | 知識庫         | Knowledge base                          |
| PH-16 | `content/aboutPagesCopy.ts:12` `title`                            | 關於頁面管理         | 關於頁面       | About pages                             |
| PH-17 | `volunteers/activityWorkspaceCopy.ts:12` `title`                  | 義工活動工作台       | 活動與報名     | Activities and registrations            |
| PH-18 | `volunteers/activityWorkspaceCopy.ts:14` `calendarTitle`          | 義工活動工作台       | 營運月曆       | Operations calendar                     |
| PH-19 | `volunteers/volunteerTasksCopy.ts:8` `title`                      | 義工今日待辦與通知   | 今日待辦       | Today's tasks                           |
| PH-20 | `volunteers/volunteerOperationsCopy.ts:15` `title`                | 團體申請及義工改期   | 團體安排與改期 | Group arrangements and rescheduling     |
| PH-21 | `volunteers/qualificationsCopy.ts:7` `title`                      | 義工身份與資格核實   | 身份與資格核實 | Identity and qualification verification |
| PH-22 | `volunteers/dailySettingsCopy.ts:17` `title`                      | 全日義工配額         | 全日配額       | Daily quota                             |
| PH-23 | `volunteers/assessmentsCopy.ts:23` `title`                        | 每月義工級別評核     | 級別評核       | Tier assessment                         |
| PH-24 | `volunteers/policySourcesCopy.ts:8` `title`                       | 共用來源、場地及資格 | 場地與資格     | Venues and qualifications               |

Owner question: for the three animal tabs the draft makes the heading the tab name (貓貓 / 狗狗 / 助養). If you prefer to keep 動物管理 as the page heading in Chinese, the English would still need to follow the tab label, because the navigation says Cats / Dogs / Sponsorship.

**Already changed on this branch (not a draft).** This zh heading was replaced, not kept, so it is listed for review rather than for adoption. To restore the old wording, put it back as the heading in that state.

| ID    | Where (file:line, current)                                                                                                                                                               | Was (before this branch)                                                        | Now (shipped on this branch) | English now reads            |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------- | ---------------------------- |
| PH-25 | `volunteers/VolunteerRegistrationDetail.tsx:61` `DestinationHeading` (registration page `h1` while loading or failed), text from `volunteerWorkspaceCopy.ts:53` `pages.activities.label` | 報名詳情 (`volunteerWorkspaceCopy.ts` `detailTitles.registration`, now removed) | 活動與報名                   | Activities and registrations |

The person page kept its heading 義工個人詳情, so only the registration page changed.

## 8. Chinese that appears for the first time, from existing wording (Task 4)

No new wording is written. These are for the owner to know about, not to decide.

- **Headings in states that had none.** Record pages while loading, failed or not found show the destination's label from `adminCommonCopy.zh.navItems` (申請, 領養人, 支持者, 宣傳內容, and for an animal 貓貓 / 狗狗 / 助養), or 活動與報名 for a registration. Files: `adoptions/CaseDetail.tsx`, `adoptions/AdopterDetail.tsx`, `crm/SupporterDetail.tsx`, `content/ContentEditor.tsx`, `volunteers/VolunteerRegistrationDetail.tsx` and `src/routes/admin/animals/$id.edit.tsx`, all through `DestinationHeading.tsx`. Volunteer policy settings, payment methods and about pages, while loading or failed, show the page's own title (義工政策設定, 付款方式設定, 關於頁面管理). The adoption information "page content" tab shows 領養資料管理.
- **Breadcrumbs change shape.** The one breadcrumb is now `AdminLayout`'s, in the order group / destination / record, with the existing label 導覽路徑. Two old breadcrumbs are gone: the animals list's 後台 / 動物管理 / 貓貓 (label 麵包屑導覽) and the volunteer shell's 義工營運中心 / page / 義工個人詳情 or 報名詳情 (label 麵包屑). The generic detail titles 義工個人詳情 and 報名詳情 no longer appear in a breadcrumb; 義工個人詳情 remains the person page's `h1`.
- **English copy lines with no zh counterpart yet** are tracked in section 1 (LoadFailure class lines) and DL-1 (reason hint).

## 9. SP-5b-2 additions

Task 2: the supporter page now asks for a reason before it voids a receipt, in a confirm dialog. All of its Chinese is existing text reused; nothing is newly written (SB-1, SB-2). Task 5: the FAQ screen gets a confirm dialog with a required reason (SB-3, SB-4); its zh consequence sentence is empty until the owner approves the draft. Task 6: the governance screen gets the same kind of dialog (SB-5, SB-6), and the estate delete dialog gains the reason field (SB-7). Task 9: the pledge drawer gets reject and cancel dialogs with a required reason (SB-8 to SB-10). Task 10: the case screen asks for a reason before a closing or rejecting status is saved (SB-11). Owner question below.

| ID    | Where (file:line, current)                                                                                 | zh now (reused)            | English now                                                                                                                                                                                                    | Notes                                                                                                                                                                                                                                                                                                                             |
| ----- | ---------------------------------------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SB-1  | `crm/copy.ts:134` `supporterDetailCopy.zh.confirmVoid(receiptNo)`                                          | 確定作廢收條 {no}？        | Void receipt {no}?                                                                                                                                                                                             | Same sentence as the payments screen (`donations/copy.ts:86`). Title and confirm button reuse 作廢.                                                                                                                                                                                                                               |
| SB-2  | Reason field label in the same dialog (`confirmActionCopy.ts` `reasonLabel`)                               | 原因                       | Reason                                                                                                                                                                                                         | The shared label every required-reason dialog uses.                                                                                                                                                                                                                                                                               |
| SB-3  | `content/faqCopy.ts` `list.disableConsequence` (zh)                                                        | (empty)                    | Disabling hides this question from the /help page. You can show it again by editing the question.                                                                                                              | New dialog on the FAQ screen, which disabled an entry with no confirmation before. Title and confirm button reuse 停用. The zh consequence is left empty (plan D6). Draft for the owner: 停用後，此問題不會在 /help 頁面顯示。你可編輯問題以重新顯示。                                                                            |
| SB-4  | `content/faqCopy.ts:34` `list.disableFailed` (kept)                                                        | 停用操作失敗，請再試一次。 | Could not disable the question. Try again.                                                                                                                                                                     | Kept, not changed (final fix wave, I2). It now shows inside the confirm dialog when a disable fails, in place of the API's English text. The inline paragraph under the table stays gone.                                                                                                                                         |
| SB-5  | `content/governanceCopy.ts:24` `stepDownConsequence` (zh)                                                  | (empty)                    | Marking a member as stepped down removes them from the public team list. The record stays on this screen as stepped down.                                                                                      | New dialog on the governance screen, which stepped a member down with no confirmation before. Title and confirm button reuse 卸任 (`governanceCopy.ts:20`). The zh consequence is left empty (plan D6). Draft for the owner: 卸任後，該成員不會在公開的團隊名單顯示。紀錄會保留在此頁面，並標示為已卸任。                         |
| SB-6  | `content/governanceCopy.ts:24` `stepDownFailed` (kept)                                                     | 卸任操作失敗，請再試一次。 | Could not mark the member as stepped down. Try again.                                                                                                                                                          | Kept, not changed (final fix wave, I2). It now shows inside the confirm dialog when a step-down fails, in place of the API's English text. The inline paragraph under the table stays gone.                                                                                                                                       |
| SB-7  | `content/AdoptionInformationManagement.tsx` estate delete dialog                                           | (no change)                | (no change)                                                                                                                                                                                                    | The estate delete dialog already existed; it now also shows the shared 原因 / Reason field. Its title, consequence sentence and confirm button are unchanged.                                                                                                                                                                     |
| SB-8  | `sponsorship/PledgeDetailDrawer.tsx:687-699` and `pageCopy/pledgeCopy.ts:124` `cancel.noteLabel` (removed) | 取消備註                   | Cancellation note                                                                                                                                                                                              | Removed, not changed: the inline cancel-note input is gone (plan D6). The cancel button now opens a dialog whose required 原因 / Reason field is sent as the cancellation note. Title and confirm button reuse 取消助養 (`pledgeCopy.ts:125`).                                                                                    |
| SB-9  | `pageCopy/pledgeCopy.ts` `cancel.confirmConsequence` and `reviewProof.rejectConsequence` (zh)              | (empty)                    | Cancelling ends this sponsorship. The supporter is emailed when an address is on file. / Rejecting this payment proof moves the sponsorship to follow-up. The supporter is emailed when an address is on file. | New dialogs on the pledge drawer, where Reject and Cancel acted at once. Titles and confirm buttons reuse 拒絕 and 取消助養. The zh consequences are left empty (plan D6). Draft for the owner: 取消後，此助養會終止；如有電郵地址，系統會通知支持者。 / 拒絕此付款證明後，助養會轉入跟進；如有電郵地址，系統會通知支持者。       |
| SB-10 | `pageCopy/pledgeCopy.ts:77` `errors.cancel` (removed)                                                      | 取消失敗                   | Could not cancel the sponsorship. Refresh the page and try again.                                                                                                                                              | Removed, not changed: the cancel dialog now shows the failure itself (the server message, or the shared dialog failure line), so the drawer no longer sets this error.                                                                                                                                                            |
| SB-11 | `adoptions/caseDetailCopy.ts:96` `closeConsequence` (zh)                                                   | (empty)                    | This status closes the case. The reason is saved with the status change in the case history.                                                                                                                   | New dialog on the case screen: choosing a closing or rejecting status and pressing 儲存狀態 now asks for a reason, which is saved as the status-change note. Title and confirm button reuse 儲存狀態. The zh consequence is left empty (plan D6). Draft for the owner: 此狀態會結束個案。原因會連同狀態變更一併記錄在個案歷史中。 |

Owner question: this screen's other copy says 收據 (`crm/copy.ts` receipts section), while the reused sentence says 收條. The glossary (`docs/admin-glossary.md:96`) treats them as the same thing. Which one should the dialog sentence use? The string is left as it is in code until you decide.
