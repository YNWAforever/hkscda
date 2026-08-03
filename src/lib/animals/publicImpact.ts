export type PublicImpactItem = { label: string; value: number; asOf: string };

export function buildPublicImpact(input: {
  availableCats: number | null;
  availableDogs: number | null;
  adoptedCats: number | null;
  adoptedDogs: number | null;
  asOf: string;
}): PublicImpactItem[] {
  const asOf = new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(input.asOf));

  return [
    ["待領養貓貓", input.availableCats],
    ["待領養狗狗", input.availableDogs],
    ["已領養貓貓", input.adoptedCats],
    ["已領養狗狗", input.adoptedDogs],
  ]
    .filter(
      (entry): entry is [string, number] =>
        typeof entry[1] === "number" && Number.isFinite(entry[1]) && entry[1] > 0,
    )
    .map(([label, value]) => ({ label, value, asOf }));
}
