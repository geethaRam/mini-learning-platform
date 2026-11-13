/**
 * The Refund Window rules (see GLOSSARY.md). Pure functions only, so they can
 * be shared by the course page and the refund route and tested without a
 * database.
 */

export const REFUND_WINDOW_DAYS = 14;
export const REFUND_WATCH_LIMIT_SECONDS = 2 * 60 * 60;
export const REFUND_COMPLETION_LIMIT = 0.5;

export type RefundBlocker =
  | "claimed_team_seat"
  | "window_closed"
  | "completed_too_much"
  | "watched_too_much";

export const REFUND_BLOCKER_MESSAGES: Record<RefundBlocker, string> = {
  claimed_team_seat: "A claimed team seat cannot be refunded.",
  window_closed: `The ${REFUND_WINDOW_DAYS}-day refund window has closed.`,
  completed_too_much:
    "You have completed too much of this course to request a refund.",
  watched_too_much:
    "You have watched too much of this course to request a refund.",
};

// The window is counted in whole calendar days, not hours — someone who buys
// at 23:00 should still get the whole of their fourteenth day.
export function calendarDay(when: Date): string {
  const month = String(when.getMonth() + 1).padStart(2, "0");
  const day = String(when.getDate()).padStart(2, "0");
  return `${when.getFullYear()}-${month}-${day}`;
}

export function lastDayOfRefundWindow(purchasedAtIso: string): string {
  const deadline = new Date(purchasedAtIso);
  deadline.setDate(deadline.getDate() + REFUND_WINDOW_DAYS);
  return calendarDay(deadline);
}

/**
 * Why a purchase falls outside the Refund Window, or null if a Refund Request
 * is allowed.
 */
export function getRefundBlocker(input: {
  purchasedAt: string;
  now: Date;
  secondsWatched: number;
  completedLessons: number;
  totalLessons: number;
  isClaimedTeamSeat: boolean;
}): RefundBlocker | null {
  if (input.isClaimedTeamSeat) return "claimed_team_seat";

  const today = calendarDay(input.now);
  const purchasedDay = calendarDay(new Date(input.purchasedAt));
  if (today < purchasedDay || today > lastDayOfRefundWindow(input.purchasedAt)) {
    return "window_closed";
  }

  if (
    input.totalLessons > 0 &&
    input.completedLessons / input.totalLessons >= REFUND_COMPLETION_LIMIT
  ) {
    return "completed_too_much";
  }

  if (input.secondsWatched >= REFUND_WATCH_LIMIT_SECONDS) {
    return "watched_too_much";
  }

  return null;
}

/** A Refund is always the full amount the learner paid, never the list price. */
export function getRefundAmount(purchase: { amountPaid: number }): number {
  return purchase.amountPaid;
}
