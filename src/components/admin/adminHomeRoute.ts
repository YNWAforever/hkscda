import { createContext } from "react";

/**
 * The first admin page the signed-in role can open, for a screen that has to send someone
 * somewhere they are allowed to be (the forbidden failure in `LoadFailure`). `AdminLayout`
 * provides it from the identity it already holds; `null` outside it, or while the identity is
 * unknown, and the screen then shows its line without a link.
 */
export const AdminHomeRouteContext = createContext<string | null>(null);
