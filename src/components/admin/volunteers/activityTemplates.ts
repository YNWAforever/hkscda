import type { Template } from "./activityWorkspaceTypes";

/** The first template of each key, in the order the server sent them. */
export function uniqueTemplates(templates: Template[]) {
  return Array.from(new Map(templates.map((t) => [t.template_key, t])).values());
}
