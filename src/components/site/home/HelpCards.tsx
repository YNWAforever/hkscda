import { Link } from "@tanstack/react-router";
import { ArrowUpRight, HandCoins, HandHeart, Home, Users, type LucideIcon } from "lucide-react";

import { revealOrder } from "../revealOnScroll";
import { HomeSectionHeading } from "./HomeSectionHeading";

const WAYS: [string, string, string, LucideIcon][] = [
  ["領養", "讓一隻獲救貓狗得到安全、穩定的永久家庭。", "/animals/cat", Home],
  ["助養", "以每月支持分擔長期照護、膳食與醫療需要。", "/sponsors", HandHeart],
  ["義工", "用時間與專長支援照護、活動及社區工作。", "/volunteer", Users],
  ["捐助", "讓救援團隊能回應突發個案及持續醫療開支。", "/donate", HandCoins],
];

/**
 * Ported from hkscdagpt app/page.tsx (help-section). The cards carry icons, not
 * 01-04: the adoption steps directly above are the numbered sequence, and
 * these four are parallel choices with no order between them.
 */
export function HelpCards() {
  return (
    <section className="section help-section" aria-labelledby="help-title">
      <div className="public-container">
        <HomeSectionHeading
          id="help-title"
          kicker="選擇你的參與方式"
          title="每一種支持，都能推動下一次救援。"
        />
        <div className="help-grid">
          {WAYS.map(([title, description, to, Icon], index) => (
            <Link className="help-card" to={to} key={title} data-reveal style={revealOrder(index)}>
              <span className="help-card-icon" aria-hidden="true">
                <Icon />
              </span>
              <h3>{title}</h3>
              <p>{description}</p>
              <b>
                了解更多
                <span className="help-card-arrow" aria-hidden="true">
                  <ArrowUpRight />
                </span>
              </b>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
