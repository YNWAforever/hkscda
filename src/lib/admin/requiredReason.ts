import { z } from "zod";

/** The longest reason an admin action accepts; the dialog caps its input at the same length. */
export const REQUIRED_REASON_MAX = 500;

/** A reason staff must give: trimmed, 1 to 500 characters. Stored as `audit_log.detail.reason`. */
export const requiredReasonSchema = z.string().trim().min(1).max(REQUIRED_REASON_MAX);

/** For readers of older audit rows that may carry no reason; routes do not use it. */
export const optionalReasonSchema = requiredReasonSchema.optional();
