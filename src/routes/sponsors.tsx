import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { publicUrl } from "@/lib/publicOrigin";
import { z } from "zod";

import { AnimalGrid } from "../components/site/AnimalGrid";
import { PublicPageFrame } from "../components/site/PublicPageFrame";
import { PublicStateShell } from "../components/site/PublicStateShell";
import { getPublicSponsorListing } from "../lib/animals/publicListing.functions";

const PAGE_SIZE = 16;

const searchSchema = z.object({
  page: z.number().int().positive().catch(1),
  filter: z.enum(["all", "bb", "adult", "senior"]).catch("all"),
});

export const Route = createFileRoute("/sponsors")({
  validateSearch: searchSchema,
  // Server-rendered through the shared projection. The previous browser query
  // paginated with range() and no order(), so the same animal could appear on two
  // pages or on none - the G-01 defect, present here as well as on the species
  // listings.
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) =>
    getPublicSponsorListing({
      data: { page: deps.page, pageSize: PAGE_SIZE, ageFilter: deps.filter },
    }),
  head: () => ({
    links: [{ rel: "canonical", href: publicUrl("/sponsors") }],
  }),
  pendingComponent: SponsorsPending,
  errorComponent: SponsorsError,
  component: SponsorsPage,
});

/**
 * Kept verbatim from the previous page. Sponsors are the surface most exposed to
 * payment impersonation, so the warning not to pay any account, number or address
 * that staff have not confirmed stays on the page regardless of layout.
 */
function PaymentSafetyNotice() {
  return (
    <section className="section">
      <div className="public-container">
        <div className="content-chapter">
          <h2>助養付款安排</h2>
          <p>
            完成助養承諾後，本會職員會透過你提供的聯絡資料確認正式付款安排。收到確認前，
            請勿向本頁、搜尋結果或任何未經職員核實的帳戶、電話號碼或電郵付款。
          </p>
          <Link to="/help" hash="contact" className="btn-secondary mt-4 min-h-11">
            向職員核實付款安排
          </Link>
        </div>
      </div>
    </section>
  );
}

function SponsorsFrame({ children }: { children: React.ReactNode }) {
  return (
    <PublicPageFrame
      eyebrow="支持救援"
      title="每月助養"
      description="以每月支持分擔長期照護、膳食與醫療需要，讓仍在等待家庭的動物得到穩定照顧。"
    >
      <PaymentSafetyNotice />
      {children}
    </PublicPageFrame>
  );
}

function SponsorsPage() {
  const listing = Route.useLoaderData();
  const { filter } = Route.useSearch();

  return (
    <SponsorsFrame>
      <section className="section">
        <div className="public-container">
          <AnimalGrid
            animals={listing.animals}
            total={listing.total}
            page={listing.page}
            ageFilter={filter}
            pageSize={PAGE_SIZE}
            animalLabel="助養動物"
          />
        </div>
      </section>
    </SponsorsFrame>
  );
}

function SponsorsPending() {
  return (
    <SponsorsFrame>
      <section className="section">
        <div className="public-container">
          <div className="animal-grid" aria-hidden="true">
            {Array.from({ length: 8 }).map((_, index) => (
              <div className="skeleton-card" key={index}>
                <i className="skeleton-media" />
                <i className="skeleton-line" />
              </div>
            ))}
          </div>
          <p className="sr-only" role="status">
            正在載入助養動物。
          </p>
        </div>
      </section>
    </SponsorsFrame>
  );
}

function SponsorsError() {
  const router = useRouter();
  return (
    <SponsorsFrame>
      <PublicStateShell
        role="alert"
        title="暫時未能載入助養動物"
        description="系統未能取得目前的助養資料，請稍後再試。"
        action={
          <button
            type="button"
            onClick={() => router.invalidate()}
            className="btn-primary min-h-11 px-5"
          >
            再試一次
          </button>
        }
      />
    </SponsorsFrame>
  );
}
