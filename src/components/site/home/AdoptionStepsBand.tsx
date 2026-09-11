import { Link } from "@tanstack/react-router";

const STEPS: [string, string, string][] = [
  ["01", "瀏覽動物", "按種類與年齡了解目前公開的貓狗資料。"],
  ["02", "加入候選名單", "加入並排列最多三隻候選動物。"],
  ["03", "提交申請及家訪資料", "完成七步申請、相片上載與驗證。"],
  ["04", "配對、見面及領養", "由團隊跟進評估、見面安排及負責任配對。"],
];

/**
 * Ported from hkscdagpt app/page.tsx (steps-section). The wording about going to
 * the existing site is dropped: the shortlist and the seven-step application are
 * same-origin after the merge.
 *
 * The heading and standfirst no longer say the process is "unchanged". That was
 * reassurance aimed at the people running the migration, not at an adopter, who
 * has no idea there was a migration and cannot act on the fact. What an adopter
 * does need -- that the full application asks for home-visit details, that a
 * draft can be saved partway, and that progress can be checked afterwards --
 * is kept, since simplifying the homepage must not drop information someone
 * needs before applying.
 */
export function AdoptionStepsBand() {
  return (
    <section className="section steps-section" aria-labelledby="steps-title">
      <div className="public-container">
        <div className="section-heading centered-heading">
          <p className="eyebrow">領養流程一覽</p>
          <h2 id="steps-title">由認識牠到接牠回家，四個步驟。</h2>
          <p>
            以下為簡要說明。正式申請包括家訪資料、相片上載及身分驗證；申請途中可儲存草稿，提交後亦可隨時查詢進度。
          </p>
        </div>
        <ol className="steps-grid">
          {STEPS.map(([number, title, description]) => (
            <li key={number}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </li>
          ))}
        </ol>
        <div className="center-action">
          <Link className="button button-primary" to="/adoption/instructions">
            了解完整領養流程
          </Link>
        </div>
      </div>
    </section>
  );
}
