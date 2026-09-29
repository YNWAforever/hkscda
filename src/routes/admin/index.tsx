import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  adminListSearchSchema,
  animalListDefaults,
  rememberAnimalTab,
  type AnimalTabMemory,
  type AnimalListState,
} from "../../lib/animals/adminListState";

import { AdminLayout } from "../../components/admin/AdminLayout";
import { AnimalsTable } from "../../components/admin/AnimalsTable";
import { MediaRepairQueue } from "../../components/admin/MediaRepairQueue";
import { LoadFailure } from "../../components/admin/LoadFailure";
import { fetchAdminJson } from "../../lib/admin/http";
import type { Animal } from "../../types/animal";
import { useAdminLanguage } from "../../components/admin/adminI18n";
import { PaymentsReconcile } from "../../components/admin/donations/PaymentsReconcile";
import { PledgeReviewLane } from "../../components/admin/sponsorship/PledgeReviewLane";
import type { AdminSection } from "../../components/admin/adminNav";
import { canRoleAccessAdminArea, getAdminAreaForLocation } from "../../lib/admin/access";
import { adminIdentityQueryOptions } from "../../lib/admin/identity";
import { requireAdminPageAccess } from "../../lib/admin/pageAccess";

type DashboardSection = Exclude<AdminSection, "supporters" | "access">;

export const Route = createFileRoute("/admin/")({
  validateSearch: adminListSearchSchema,
  ssr: false,
  beforeLoad: async ({ context, search }) => {
    await requireAdminPageAccess(
      getAdminAreaForLocation({ pathname: "/admin", section: search.section }),
      context.queryClient,
    );
  },
  component: AdminDashboard,
});

function AdminDashboard() {
  const { section } = Route.useSearch();

  return (
    <AdminLayout activeSection={section}>
      <AdminDashboardContent section={section} />
    </AdminLayout>
  );
}

function AdminDashboardContent({ section }: { section: DashboardSection }) {
  const queryClient = useQueryClient();
  const { copy, language } = useAdminLanguage();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [tabMemory, setTabMemory] = useState<AnimalTabMemory>({});
  const isAnimalSection = section === "cat" || section === "dog" || section === "sponsor";
  useEffect(() => {
    if (section === "cat" || section === "dog" || section === "sponsor") {
      setTabMemory((memory) => rememberAnimalTab(memory, section, search));
    }
  }, [section, search]);
  const changeListState = (state: AnimalListState) => {
    void navigate({ search: { section, ...state } });
  };
  const { data: identity } = useQuery(adminIdentityQueryOptions());
  const canViewSupporters =
    identity != null && canRoleAccessAdminArea(identity.admin.role, "supporters");
  const canReviewPledges =
    identity != null && canRoleAccessAdminArea(identity.admin.role, "sponsorshipReview");
  const [sponsorView, setSponsorView] = useState<"animals" | "pledges">("animals");
  const showPledgeReview = section === "sponsor" && canReviewPledges && sponsorView === "pledges";

  const [missingPhoto, setMissingPhoto] = useState(false);
  const animalsQuery = useQuery({
    queryKey: ["admin-animals", section, identity?.admin.id, search, missingPhoto],
    queryFn: () =>
      fetchAdminJson<{ animals: Animal[]; total: number; page: number }>(
        `/api/admin/animals/list?${new URLSearchParams({ section, q: search.q, archived: String(search.archived), status: search.status, page: String(search.page), missingPhoto: String(missingPhoto) })}`,
      ),
    enabled: identity != null && isAnimalSection && !showPledgeReview,
  });

  // A failed query also yields no rows, so `?? []` alone would render an outage
  // as "沒有結果" -- telling the operator this section is empty when in fact
  // nothing was read.
  const animals = animalsQuery.data?.animals ?? [];
  const isLoading = identity == null || animalsQuery.isLoading;

  return (
    <div className="min-w-0 space-y-4 p-4 sm:p-6">
      {isAnimalSection ? (
        <nav
          aria-label={language === "zh" ? "麵包屑導覽" : "Breadcrumb"}
          className="text-sm text-[var(--color-text-muted)]"
        >
          <ol className="flex flex-wrap items-center gap-2">
            <li>{language === "zh" ? "後台" : "Admin"}</li>
            <li aria-hidden="true">/</li>
            <li>
              <Link
                to="/admin"
                search={{ section: "cat", ...(tabMemory.cat ?? animalListDefaults) }}
                className="hover:text-[var(--color-primary)] hover:underline"
              >
                {language === "zh" ? "動物管理" : "Animal management"}
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page">
              {language === "zh"
                ? { cat: "貓貓", dog: "狗狗", sponsor: "助養" }[section]
                : { cat: "Cats", dog: "Dogs", sponsor: "Sponsorship" }[section]}
            </li>
          </ol>
        </nav>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 tabIndex={-1} className="text-xl font-bold">
          {isAnimalSection
            ? language === "zh"
              ? "動物管理"
              : "Animal management"
            : copy.dashboard.title[section]}
        </h1>
        {section === "payments" ? (
          canViewSupporters ? (
            <Link
              to="/admin/supporters"
              className="min-h-11 rounded border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-panel)] hover:bg-[var(--color-primary-highlight)]"
            >
              {copy.dashboard.supporters}
            </Link>
          ) : null
        ) : section !== "applications" ? (
          <Link
            to="/admin/animals/new"
            className="inline-flex min-h-11 items-center rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm text-white transition-colors hover:bg-[var(--color-primary-hover)]"
          >
            + {copy.dashboard.addNew}
          </Link>
        ) : null}
      </div>
      {isAnimalSection ? (
        <>
          <p className="max-w-2xl text-sm text-[var(--color-text-muted)]">
            {language === "zh"
              ? section === "sponsor"
                ? "列出可供助養的貓狗；助養資格並非品種。"
                : section === "cat"
                  ? "搜尋及管理貓貓記錄、照顧狀態與公開資料。"
                  : "搜尋及管理狗狗記錄、照顧狀態與公開資料。"
              : section === "sponsor"
                ? "Cats and dogs eligible for sponsorship; eligibility is independent of species."
                : section === "cat"
                  ? "Find and manage cat records, care status, and public information."
                  : "Find and manage dog records, care status, and public information."}
          </p>
          <nav
            aria-label={language === "zh" ? "動物分類" : "Animal categories"}
            className="flex max-w-full gap-2 overflow-x-auto border-b border-[var(--color-border)] pb-2"
          >
            {(["cat", "dog", "sponsor"] as const).map((tab) => (
              <Link
                key={tab}
                to="/admin"
                search={{
                  section: tab,
                  ...(tab === section ? search : (tabMemory[tab] ?? animalListDefaults)),
                }}
                aria-current={section === tab ? "page" : undefined}
                className={`inline-flex min-h-11 shrink-0 items-center rounded-lg px-4 py-2 text-sm font-medium ${section === tab ? "bg-[var(--color-primary)] text-white" : "text-[var(--color-panel)] hover:bg-[var(--color-primary-highlight)]"}`}
              >
                {language === "zh"
                  ? { cat: "貓貓", dog: "狗狗", sponsor: "助養" }[tab]
                  : { cat: "Cats", dog: "Dogs", sponsor: "Sponsorship" }[tab]}
              </Link>
            ))}
          </nav>
          {section === "sponsor" && canReviewPledges ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSponsorView("animals")}
                aria-pressed={sponsorView === "animals"}
                className={
                  sponsorView === "animals"
                    ? "min-h-11 rounded border border-[var(--color-panel)] bg-[var(--color-panel)] px-3 py-2 text-sm font-medium text-white"
                    : "min-h-11 rounded border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-panel)] hover:bg-[var(--color-primary-highlight)]"
                }
              >
                {copy.dashboard.sponsorViewAnimals}
              </button>
              <button
                type="button"
                onClick={() => setSponsorView("pledges")}
                aria-pressed={sponsorView === "pledges"}
                className={
                  sponsorView === "pledges"
                    ? "min-h-11 rounded border border-[var(--color-panel)] bg-[var(--color-panel)] px-3 py-2 text-sm font-medium text-white"
                    : "min-h-11 rounded border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-panel)] hover:bg-[var(--color-primary-highlight)]"
                }
              >
                {copy.dashboard.sponsorViewPledges}
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      {section === "payments" ? (
        <PaymentsReconcile />
      ) : section === "applications" ? (
        <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <h2 className="text-lg font-semibold text-[var(--color-panel)]">
            {copy.dashboard.applicationsMovedTitle}
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-[var(--color-text-muted)]">
            {copy.dashboard.applicationsMovedDescription}
          </p>
          <Link
            to="/admin/applications"
            className="mt-4 inline-flex items-center rounded border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-panel)] hover:bg-[var(--color-primary-highlight)]"
          >
            {copy.dashboard.openAdoptionCases}
          </Link>
        </section>
      ) : showPledgeReview ? (
        <PledgeReviewLane />
      ) : isLoading ? (
        <div className="py-12 text-center text-[var(--color-text-muted)]">
          {copy.common.loading}
        </div>
      ) : animalsQuery.isError ? (
        <LoadFailure
          error={animalsQuery.error}
          onRetry={() => void animalsQuery.refetch()}
          retrying={animalsQuery.isFetching}
        />
      ) : (
        <>
          <label className="block text-sm">
            <input
              type="checkbox"
              checked={missingPhoto}
              onChange={(event) => {
                setMissingPhoto(event.target.checked);
                changeListState({ ...search, page: 1 });
              }}
            />{" "}
            待補相片
          </label>
          {missingPhoto ? (
            <p
              role="status"
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm text-[var(--color-panel)]"
            >
              待補相片：{animalsQuery.data?.total ?? 0}{" "}
              筆。按編號核對動物，再進入「編輯」上載到草稿；儲存、預覽及批准發布前，原公開相片不會被替換。
            </p>
          ) : null}
          <AnimalsTable
            key={section}
            animals={animals}
            serverTotal={animalsQuery.data?.total}
            state={search}
            onStateChange={changeListState}
            onDeleted={() =>
              queryClient.invalidateQueries({ queryKey: ["admin-animals", section] })
            }
          />
        </>
      )}
      {isAnimalSection &&
      identity != null &&
      canRoleAccessAdminArea(identity.admin.role, "animals") ? (
        <MediaRepairQueue />
      ) : null}
    </div>
  );
}
