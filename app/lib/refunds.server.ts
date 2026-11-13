import { db } from "~/db";
import {
  coupons,
  lessonProgress,
  lessons,
  modules,
  purchases,
  refunds,
  videoWatchEvents,
  LessonProgressStatus,
  RefundStatus,
} from "~/db/schema";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import {
  getRefundAmount,
  getRefundBlocker,
  lastDayOfRefundWindow,
  type RefundBlocker,
} from "./refunds";

type Purchase = typeof purchases.$inferSelect;

export type RefundEligibility =
  | { kind: "no_purchase" }
  | { kind: "request_open" }
  | { kind: "blocked"; blocker: RefundBlocker }
  | {
      kind: "eligible";
      purchase: Purchase;
      amount: number;
      lastDayInWindow: string;
    };

function getLatestPurchase(userId: number, courseId: number) {
  return db
    .select()
    .from(purchases)
    .where(and(eq(purchases.userId, userId), eq(purchases.courseId, courseId)))
    .orderBy(sql`${purchases.createdAt} desc`)
    .get();
}

function getOpenRefundRequest(purchaseId: number) {
  return db
    .select({ id: refunds.id })
    .from(refunds)
    .where(
      and(
        eq(refunds.purchaseId, purchaseId),
        eq(refunds.status, RefundStatus.Requested)
      )
    )
    .get();
}

function getLessonIdsForCourse(courseId: number): number[] {
  return db
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, courseId))
    .all()
    .map((row) => row.id);
}

function getCompletedLessonCount(userId: number, lessonIds: number[]) {
  if (lessonIds.length === 0) return 0;

  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        eq(lessonProgress.status, LessonProgressStatus.Completed),
        inArray(lessonProgress.lessonId, lessonIds)
      )
    )
    .get();

  return result?.count ?? 0;
}

function getSecondsWatched(userId: number, lessonIds: number[]) {
  if (lessonIds.length === 0) return 0;

  const furthestPerLesson = db
    .select({
      furthest: sql<number>`max(${videoWatchEvents.positionSeconds})`,
    })
    .from(videoWatchEvents)
    .where(
      and(
        eq(videoWatchEvents.userId, userId),
        inArray(videoWatchEvents.lessonId, lessonIds)
      )
    )
    .groupBy(videoWatchEvents.lessonId)
    .all();

  return furthestPerLesson.reduce((total, row) => total + row.furthest, 0);
}

// A seat that came out of a team licence, and has been claimed, belongs to the
// team — the learner cannot hand it back on their own.
function isClaimedTeamSeat(purchaseId: number) {
  return Boolean(
    db
      .select({ id: coupons.id })
      .from(coupons)
      .where(
        and(eq(coupons.purchaseId, purchaseId), isNotNull(coupons.redeemedAt))
      )
      .get()
  );
}

/**
 * Whether this learner may make a Refund Request for this course right now.
 * The course page and the refund route both use this, so they cannot drift.
 */
export function getRefundEligibility(
  userId: number,
  courseId: number,
  now: Date = new Date()
): RefundEligibility {
  const purchase = getLatestPurchase(userId, courseId);
  if (!purchase) return { kind: "no_purchase" };

  if (getOpenRefundRequest(purchase.id)) return { kind: "request_open" };

  const lessonIds = getLessonIdsForCourse(courseId);
  const blocker = getRefundBlocker({
    purchasedAt: purchase.createdAt,
    now,
    secondsWatched: getSecondsWatched(userId, lessonIds),
    completedLessons: getCompletedLessonCount(userId, lessonIds),
    totalLessons: lessonIds.length,
    isClaimedTeamSeat: isClaimedTeamSeat(purchase.id),
  });

  if (blocker) return { kind: "blocked", blocker };

  return {
    kind: "eligible",
    purchase,
    amount: getRefundAmount(purchase),
    lastDayInWindow: lastDayOfRefundWindow(purchase.createdAt),
  };
}
