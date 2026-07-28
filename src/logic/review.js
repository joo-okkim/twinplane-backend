// Rule-based evaluation, ported 1:1 from the frontend's
// lib/services/mock/review_logic.dart (spec §15/16): completed items are
// always mentioned first, incomplete items are described gently (never
// blamed), and reward/allowance figures are computed from policy but
// parentApprovalRequired always stays true -- the AI never confirms payout.
const MessageBank = require('./messageBank');

function compute({ dataset, dateStr, planItems, completions }) {
  const completionById = new Map(completions.map((c) => [c.planItemId, c]));

  const scored = planItems.filter((p) => p.rewardEligible);
  const total = scored.length;
  const completedItems = scored.filter((p) => completionById.get(p.id)?.completed === true);
  const requiredItems = scored.filter((p) => p.required);
  const completedRequired = requiredItems.filter((p) => completionById.get(p.id)?.completed === true);

  const overallRate = total === 0 ? 0 : Math.round((completedItems.length / total) * 100);
  const requiredRate =
    requiredItems.length === 0 ? 100 : Math.round((completedRequired.length / requiredItems.length) * 100);

  let onTimeCount = 0;
  for (const p of completedItems) {
    const actual = completionById.get(p.id)?.actualMinutes ?? p.durationMinutes;
    if (actual <= p.durationMinutes * 1.1) onTimeCount++;
  }
  const onTimeRate = completedItems.length === 0 ? 100 : Math.round((onTimeCount / completedItems.length) * 100);

  const totalPlanned = scored.reduce((sum, p) => sum + p.durationMinutes, 0);
  const totalActual = completedItems.reduce(
    (sum, p) => sum + (completionById.get(p.id)?.actualMinutes ?? p.durationMinutes),
    0,
  );

  const subjects = [...new Set(scored.filter((p) => p.subject != null).map((p) => p.subject))];
  const subjectResults = [];
  for (const subject of subjects) {
    const items = scored.filter((p) => p.subject === subject);
    const done = items.filter((p) => completionById.get(p.id)?.completed === true);
    const planned = items.reduce((sum, p) => sum + p.durationMinutes, 0);
    const actual = done.reduce((sum, p) => sum + (completionById.get(p.id)?.actualMinutes ?? p.durationMinutes), 0);
    const rate = items.length === 0 ? 0 : Math.round((done.length / items.length) * 100);
    let analysis;
    if (done.length < items.length) {
      analysis = MessageBank.reviewIncompleteGentle(items[0].title);
    } else if (actual > planned) {
      analysis = MessageBank.reviewSlowerThanPlanned(subject, actual - planned);
    } else if (actual < planned) {
      analysis = MessageBank.reviewFasterThanPlanned(subject);
    } else {
      analysis = '계획한 시간 내에 완료했습니다.';
    }
    subjectResults.push({ subject, plannedMinutes: planned, actualMinutes: actual, achievementRate: rate, analysis });
  }

  const completedWell = [
    ...(requiredRate === 100 ? [MessageBank.reviewCompletedRequired()] : []),
    ...completedItems.slice(0, 3).map((p) => MessageBank.reviewCompletedItem(p.title)),
  ];

  const incomplete = scored.filter((p) => completionById.get(p.id)?.completed !== true);
  const improvementPoints = [...incomplete.slice(0, 3).map((p) => MessageBank.reviewIncompleteGentle(p.title))];
  for (const r of subjectResults) {
    if (r.actualMinutes > r.plannedMinutes) {
      improvementPoints.push(MessageBank.reviewSlowerThanPlanned(r.subject, r.actualMinutes - r.plannedMinutes));
    }
  }

  const studentMessage = `${completedWell.length > 0 ? completedWell[0] : ''} ${MessageBank.reviewEncouragement(overallRate)}`.trim();
  const parentMessage =
    `전체 달성률은 ${overallRate}%, 필수 계획 달성률은 ${requiredRate}%입니다. ` +
    `${subjectResults.length > 0 ? subjectResults[0].analysis : ''}`.trim();

  const policy = dataset.stickerPolicy;
  let earnedStickers = 0;
  earnedStickers += completedRequired.length * policy.requiredPlanCompletion;
  earnedStickers += completedItems.filter((p) => p.planType === 'recommended').length * policy.recommendedPlanCompletion;
  if (onTimeRate === 100 && completedItems.length > 0) earnedStickers += policy.onTimeBonus;
  const dailyBonusApplied = overallRate >= 80;
  if (dailyBonusApplied) earnedStickers += policy.dailyAchievement80Bonus;
  if (requiredRate === 100 && requiredItems.length > 0) earnedStickers += policy.allRequiredCompletionBonus;

  const weeklyRate = Math.round((dataset.recentPerformance.weeklyAchievementRate * 6 + overallRate) / 7);

  const allowance = dataset.allowancePolicy;
  let expectedAllowance = null;
  let allowanceCandidate = false;
  if (allowance.enabled) {
    for (const condition of allowance.conditions) {
      if (weeklyRate >= condition.achievementRate) {
        allowanceCandidate = true;
        expectedAllowance = condition.amount;
      }
    }
  }

  return {
    result: 'success',
    studentId: dataset.student.studentId,
    reviewDate: dateStr,
    achievement: {
      totalPlanCount: total,
      completedPlanCount: completedItems.length,
      overallAchievementRate: overallRate,
      requiredAchievementRate: requiredRate,
      onTimeCompletionRate: onTimeRate,
      totalPlannedMinutes: totalPlanned,
      totalActualMinutes: totalActual,
    },
    subjectResults,
    completedWell: completedWell.length === 0 ? ['오늘도 계획을 확인하며 하루를 시작했어요.'] : completedWell,
    improvementPoints,
    studentMessage,
    parentMessage,
    rewardResult: {
      earnedStickerCount: earnedStickers,
      dailyBonusApplied,
      weeklyAchievementRate: weeklyRate,
      allowanceCandidate,
      expectedAllowance,
      currency: 'KRW',
      parentApprovalRequired: true,
    },
  };
}

module.exports = { compute };