import { notFound } from "@tanstack/react-router";

export async function loadPublicDetailOrNotFound<T>(
  load: () => Promise<T | null>,
): Promise<T | null> {
  let value: T | null;
  try {
    value = await load();
  } catch (error) {
    console.error("Public animal detail read failed; rendering the unavailable state.", error);
    return null;
  }
  if (!value) throw notFound();
  return value;
}
