import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { PublicAdoptionPageData } from "../../../lib/adoptionInformation/publicPage.server";
import { initialAdoptionInstructionContent } from "../../../lib/adoptionInstructions/content";
import type { AdoptionInstructionRevision } from "../../../lib/adoptionInstructions/types";

let accessArea: string | undefined;
let queryOptions:
  | { queryKey: unknown[]; queryFn: () => Promise<PublicAdoptionPageData> }
  | undefined;
let requestedPath: string | undefined;
let publicPageCalls = 0;

const previewData = {
  copy: {
    ...initialAdoptionInstructionContent,
    hero: { ...initialAdoptionInstructionContent.hero, title: "Draft preview title" },
  },
  feesBySpecies: { dog: [], cat: [] },
  estates: [],
  guideGroups: [],
} satisfies PublicAdoptionPageData;

const draftRevision = {
  content: previewData.copy,
} as AdoptionInstructionRevision;

const publishedPageData = {
  ...previewData,
  copy: initialAdoptionInstructionContent,
} satisfies PublicAdoptionPageData;

mock.module("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
}));

mock.module("@tanstack/react-query", () => ({
  useQuery: (options: typeof queryOptions) => {
    queryOptions = options;
    return { data: previewData, isPending: false, error: null };
  },
}));

mock.module("../../../lib/admin/pageAccess", () => ({
  requireAdminPageAccess: async (area: string) => {
    accessArea = area;
  },
}));

mock.module("../../../lib/admin/session", () => ({
  fetchAdminJson: async (path: string) => {
    requestedPath = path;
    return draftRevision;
  },
}));

mock.module("../../../lib/adoptionInformation/publicPage.functions", () => ({
  getPublicAdoptionPage: async () => {
    publicPageCalls += 1;
    return publishedPageData;
  },
}));

describe("adoption instructions preview route", () => {
  test("requires content access and renders the authenticated draft preview without the admin layout", async () => {
    const { Route, AdoptionInstructionsPreviewPage } = await import("./adoption-preview");
    await (Route as unknown as { beforeLoad: () => Promise<void> }).beforeLoad();

    const markup = renderToStaticMarkup(<AdoptionInstructionsPreviewPage />);
    const preview = await queryOptions?.queryFn();

    expect(accessArea).toBe("contentManagement");
    expect(queryOptions?.queryKey).toEqual(["adoption-instructions", "preview"]);
    expect(requestedPath).toBe("/api/admin/adoption-instructions/preview");
    expect(publicPageCalls).toBe(1);
    expect(preview?.copy.hero.title).toBe("Draft preview title");
    expect(markup).toContain("Draft preview title");
    expect(markup).not.toContain("AdminLayout");
  });
});
