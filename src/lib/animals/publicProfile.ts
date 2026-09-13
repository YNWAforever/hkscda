import type { Animal, AnimalPublicProfile } from "../../types/animal";

function validDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? value
    : null;
}

function publicText(value: unknown, limit: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  const contactCheck = text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, "");
  if (
    !text ||
    text.length > limit ||
    /[<>]|https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(text) ||
    /[+\d][\d ()-]{6,}\d/.test(contactCheck)
  )
    return null;
  return text;
}

/** Only reviewed public fields cross the public reader boundary. */
export function parsePublicAnimalProfile(value: unknown): AnimalPublicProfile {
  const input =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const code = typeof input.code === "string" ? input.code.trim() : "";
  return {
    code: /^[A-Za-z0-9][A-Za-z0-9 _()./-]{0,63}$/.test(code) ? code : null,
    birthday: validDate(input.birthday),
    neutered: typeof input.neutered === "boolean" ? input.neutered : null,
    suitability:
      input.suitability === "newbie" || input.suitability === "experienced"
        ? input.suitability
        : null,
    personality: publicText(input.personality, 1000),
    health: publicText(input.health, 2000),
    story: publicText(input.story, 8000),
    recordDate: validDate(input.recordDate),
  };
}

const hongKongDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Hong_Kong",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function projectPublicAnimal(animal: Animal, now = () => new Date()): Animal {
  const profile = parsePublicAnimalProfile(animal.public_profile);
  const todayParts = hongKongDate.formatToParts(now());
  const part = (type: string) => Number(todayParts.find((item) => item.type === type)?.value);
  const year = part("year"),
    month = part("month"),
    day = part("day");
  let age = animal.age;
  if (profile.birthday) {
    const [bornYear, bornMonth, bornDay] = profile.birthday.split("-").map(Number);
    const today = year * 10000 + month * 100 + day;
    if (bornYear * 10000 + bornMonth * 100 + bornDay > today) {
      profile.birthday = null;
      age = "不詳";
    } else {
      const years =
        year - bornYear - Number(month < bornMonth || (month === bornMonth && day < bornDay));
      const months = (year - bornYear) * 12 + month - bornMonth - Number(day < bornDay);
      age = years ? `${years} 歲` : `${Math.max(0, months)} 個月`;
    }
  }
  return {
    id: animal.id,
    type: animal.type,
    name: animal.name,
    name_en: animal.name_en,
    gender: animal.gender,
    age,
    age_en: profile.birthday ? null : animal.age_en,
    description: animal.description,
    description_en: animal.description_en,
    notes: null,
    notes_en: null,
    status: animal.status,
    adoption_eligible: animal.adoption_eligible,
    sponsorship_eligible: animal.sponsorship_eligible,
    retired_at: animal.retired_at,
    publication_state: animal.publication_state,
    image_url: animal.image_url,
    gallery: (animal.gallery ?? [])
      .filter((item) => item.review_status === "approved" && Boolean(item.url))
      .sort((a, b) => a.sort_order - b.sort_order),
    created_at: animal.created_at,
    updated_at: animal.updated_at,
    public_profile: profile,
  };
}
