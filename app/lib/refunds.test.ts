import { describe, it, expect } from "vitest";
import {
  getRefundAmount,
  getRefundBlocker,
  lastDayOfRefundWindow,
  REFUND_WATCH_LIMIT_SECONDS,
} from "./refunds";

const purchasedAt = new Date(2026, 0, 1, 23, 0).toISOString();

function blocker(overrides: Partial<Parameters<typeof getRefundBlocker>[0]>) {
  return getRefundBlocker({
    purchasedAt,
    now: new Date(2026, 0, 5, 12, 0),
    secondsWatched: 0,
    completedLessons: 0,
    totalLessons: 10,
    isClaimedTeamSeat: false,
    ...overrides,
  });
}

describe("Refund Window", () => {
  it("allows a Refund Request inside every rule", () => {
    expect(blocker({})).toBeNull();
  });

  it("counts the fourteenth day in full", () => {
    expect(lastDayOfRefundWindow(purchasedAt)).toBe("2026-01-15");
    expect(blocker({ now: new Date(2026, 0, 15, 23, 59) })).toBeNull();
  });

  it("closes after the fourteenth day", () => {
    expect(blocker({ now: new Date(2026, 0, 16, 0, 1) })).toBe(
      "window_closed"
    );
  });

  it("blocks at 50% of lessons completed", () => {
    expect(blocker({ completedLessons: 4 })).toBeNull();
    expect(blocker({ completedLessons: 5 })).toBe("completed_too_much");
  });

  it("does not apply the completion rule to a course with no lessons", () => {
    expect(blocker({ totalLessons: 0, completedLessons: 0 })).toBeNull();
  });

  it("blocks at 2 hours watched", () => {
    expect(
      blocker({ secondsWatched: REFUND_WATCH_LIMIT_SECONDS - 1 })
    ).toBeNull();
    expect(blocker({ secondsWatched: REFUND_WATCH_LIMIT_SECONDS })).toBe(
      "watched_too_much"
    );
  });

  it("never qualifies a claimed team seat", () => {
    expect(blocker({ isClaimedTeamSeat: true })).toBe("claimed_team_seat");
  });
});

describe("getRefundAmount", () => {
  it("is always the amount paid, never the list price", () => {
    expect(getRefundAmount({ amountPaid: 4900 })).toBe(4900);
  });
});
