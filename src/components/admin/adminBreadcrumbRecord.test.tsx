import { describe, expect, mock, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Static rendering never runs effects, so collect them and run them by hand.
type Effect = () => void | (() => void);
let effects: Effect[] = [];
mock.module("react", () => ({
  ...React,
  useEffect: (effect: Effect) => {
    effects.push(effect);
  },
}));

const { BreadcrumbRecordContext, useBreadcrumbRecordName } =
  await import("./adminBreadcrumbRecord");

function Page({ name }: { name: string | null | undefined }) {
  useBreadcrumbRecordName(name);
  return <p>page</p>;
}

/** Mounts the page under a layout stand-in and returns what the layout was told, and the unmount. */
function mount(name: string | null | undefined, withLayout = true) {
  const told: (string | null)[] = [];
  effects = [];
  const page = <Page name={name} />;
  renderToStaticMarkup(
    withLayout ? (
      <BreadcrumbRecordContext.Provider value={(value) => told.push(value)}>
        {page}
      </BreadcrumbRecordContext.Provider>
    ) : (
      page
    ),
  );
  const cleanups = effects.map((effect) => effect());
  return {
    told,
    unmount: () =>
      cleanups.forEach((cleanup) => (typeof cleanup === "function" ? cleanup() : null)),
  };
}

describe("useBreadcrumbRecordName", () => {
  test("tells the layout the name once the record has loaded, and forgets it on unmount", () => {
    const { told, unmount } = mount("Mimi");
    expect(told).toEqual(["Mimi"]);
    unmount();
    expect(told).toEqual(["Mimi", null]);
  });

  test("reports nothing for a record that is loading, failed or has no name", () => {
    for (const name of [undefined, null]) {
      const { told } = mount(name);
      expect(told).toEqual([null]);
    }
  });

  test("does nothing outside an AdminLayout", () => {
    expect(() => mount("Mimi", false).unmount()).not.toThrow();
  });
});
