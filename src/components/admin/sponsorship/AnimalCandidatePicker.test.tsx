import React, { type ReactElement, type ReactNode } from "react";
import { expect, mock, test } from "bun:test";

let query = "Snowy";
mock.module("react", () => ({
  ...React,
  useState: () => [query, (value: string) => (query = value)],
  useDeferredValue: (value: string) => value,
}));
const realQuery = await import("@tanstack/react-query");
mock.module("@tanstack/react-query", () => ({
  ...realQuery,
  useQuery: () => ({
    data: { animals: [{ id: "snowy", name: "Snowy", name_en: null, code: null }] },
    isLoading: false,
    isError: false,
  }),
}));
const realCopy = await import("../adminPageCopy");
mock.module("../adminPageCopy", () => ({
  ...realCopy,
  useAdminPageCopy: () => ({ language: "en", pageCopy: realCopy.adminPageCopy.en }),
}));
const { AnimalCandidatePicker } = await import("./AnimalCandidatePicker");

type Props = {
  children?: ReactNode;
  id?: string;
  type?: string;
  value?: string;
  onChange?: (event: { target: { value: string } }) => void;
};
function walk(node: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap((child) => walk(child));
  return React.isValidElement<Props>(node) ? [node, ...walk(node.props.children)] : [];
}

test("editing the search clears the animal selection before the old animal can be hidden", () => {
  let selected = "snowy";
  const render = () =>
    walk(
      AnimalCandidatePicker({
        value: selected,
        onChange: (value) => (selected = value),
        disabled: false,
      }),
    );
  const search = render().find((node) => node.props.id === "pledge-assign-animal-search")!;

  search.props.onChange!({ target: { value: "Momo" } });

  expect(query).toBe("Momo");
  // The parent's Add button is disabled when the selected id is empty. Otherwise it
  // could assign Snowy while the staff member is looking at a different search.
  expect(selected).toBe("");

  const radio = render().find((node) => node.props.type === "radio")!;
  radio.props.onChange!({ target: { value: "snowy" } });
  expect(selected).toBe("snowy");
});
