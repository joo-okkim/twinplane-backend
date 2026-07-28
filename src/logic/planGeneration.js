// Rule-based plan generation, ported 1:1 from the frontend's
// lib/services/mock/plan_generation_logic.dart (spec sections 2-8): fixed
// schedules are never touched, required/deadline work is placed first,
// recent achievement rate drives a load tier, hard-difficulty items are
// capped, and incomplete carry-over is reduced rather than re-added at full
// size. Keep this in sync with that file — it is the reference
// implementation (see docs/API_CONTRACT.md in the frontend repo).
const MessageBank = require('./messageBank');

function timeToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function clampInt(value, min, max) {
  if (max < min) return max;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function daysUntil(examDateStr, fromDateStr) {
  const exam = Date.parse(`${examDateStr}T00:00:00Z`);
  const from = Date.parse(`${fromDateStr}T00:00:00Z`);
  return Math.round((exam - from) / 86400000);
}

const LOAD_TIER = {
  INCREASE: 'increase',
  KEEP: 'keep',
  DECREASE_10: 'decrease10',
  DECREASE_20: 'decrease20',
  REQUIRED_ONLY: 'requiredOnly',
};

function resolveLoadTier(rate7d) {
  if (rate7d >= 90) return LOAD_TIER.INCREASE;
  if (rate7d >= 75) return LOAD_TIER.KEEP;
  if (rate7d >= 60) return LOAD_TIER.DECREASE_10;
  if (rate7d >= 40) return LOAD_TIER.DECREASE_20;
  return LOAD_TIER.REQUIRED_ONLY;
}

function targetStudyMinutes(dataset, tier) {
  const base = Math.min(dataset.student.maxSelfStudyMinutes, dataset.parentSettings.maxDailyStudyMinutes);
  switch (tier) {
    case LOAD_TIER.INCREASE: {
      const increased = Math.round(base * 1.05);
      return Math.min(increased, dataset.parentSettings.maxDailyStudyMinutes);
    }
    case LOAD_TIER.KEEP:
      return base;
    case LOAD_TIER.DECREASE_10:
      return Math.round(base * 0.9);
    case LOAD_TIER.DECREASE_20:
      return Math.round(base * 0.8);
    case LOAD_TIER.REQUIRED_ONLY:
      return 0;
    default:
      return base;
  }
}

// Spec section 6: extra load adjustment layered on top of the
// achievement-based tier. very_tired/sick are already forced to
// requiredOnly (target 0) upstream, so their multiplier here is moot.
function conditionLoadMultiplier(condition) {
  switch (condition) {
    case 'very_good':
    case 'good':
    case 'normal':
      return 1.0;
    case 'tired':
      return 0.85;
    case 'stressed':
      return 0.7;
    case 'very_tired':
    case 'sick':
      return 0.0;
    default:
      return 1.0;
  }
}

function expectedAchievementRate(tier) {
  switch (tier) {
    case LOAD_TIER.INCREASE: return 88;
    case LOAD_TIER.KEEP: return 82;
    case LOAD_TIER.DECREASE_10: return 78;
    case LOAD_TIER.DECREASE_20: return 75;
    case LOAD_TIER.REQUIRED_ONLY: return 70;
    default: return 80;
  }
}

function planConfidenceScore(tier) {
  switch (tier) {
    case LOAD_TIER.INCREASE: return 90;
    case LOAD_TIER.KEEP: return 88;
    case LOAD_TIER.DECREASE_10: return 85;
    case LOAD_TIER.DECREASE_20: return 82;
    case LOAD_TIER.REQUIRED_ONLY: return 78;
    default: return 85;
  }
}

function buildFixedItems(schedules) {
  let seq = 0;
  return schedules.map((s) => ({
    id: `fixed-${seq++}`,
    sequence: 0,
    planType: 'fixed',
    subject: null,
    title: s.title,
    description: '고정 일정이에요.',
    startTime: s.startTime,
    endTime: s.endTime,
    durationMinutes: timeToMinutes(s.endTime) - timeToMinutes(s.startTime),
    priority: 'required',
    difficulty: 'normal',
    required: true,
    rewardEligible: false,
    estimatedStickerReward: 0,
    confirmedStickerReward: 0,
    evidenceRequired: false,
    sourceType: 'FIXED_SCHEDULE',
    sourceId: null,
    adjustable: false,
    adjustmentReason: null,
  }));
}

function breakItem(seq, start, duration, title, description) {
  return {
    id: `break-${seq}`,
    sequence: seq,
    planType: 'break',
    subject: null,
    title,
    description,
    startTime: minutesToTime(start),
    endTime: minutesToTime(start + duration),
    durationMinutes: duration,
    priority: 'required',
    difficulty: 'easy',
    required: true,
    rewardEligible: false,
    estimatedStickerReward: 0,
    confirmedStickerReward: 0,
    evidenceRequired: false,
    sourceType: 'AI_GENERATED',
    sourceId: null,
    adjustable: false,
    adjustmentReason: null,
  };
}

// Gaps between wake-up/fixed-schedules/bedtime, each with a small
// transition buffer, become the day's available study windows.
function computeWindows(dataset, fixedItems) {
  const wakeBuffer = 30; // getting ready
  const windDown = 20; // wind-down before bed, no heavy study right before sleep

  const wakeFloor = timeToMinutes(dataset.student.wakeUpTime) + wakeBuffer;
  const preferredFloor = timeToMinutes(dataset.student.preferredStudyStartTime);
  const dayStart = Math.max(wakeFloor, preferredFloor);
  const dayEnd = timeToMinutes(dataset.student.bedTime) - windDown;

  const sortedFixed = [...fixedItems].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  const windows = [];
  let cursor = dayStart;
  for (const f of sortedFixed) {
    const fStart = timeToMinutes(f.startTime);
    const fEnd = timeToMinutes(f.endTime);
    if (fStart > cursor) {
      const windowEnd = fStart - 5; // small buffer before the fixed block
      if (windowEnd - cursor >= 15) {
        windows.push({ start: cursor, end: windowEnd });
      }
    }
    const afterFixed = fEnd + 10; // small buffer after the fixed block
    if (afterFixed > cursor) cursor = afterFixed; // cursor must never move backward
  }
  if (dayEnd - cursor >= 15) {
    windows.push({ start: cursor, end: dayEnd });
  }
  return windows;
}

function findWindowWithRoom(windows, minRoom) {
  for (const w of windows) {
    if (w.end - w.start >= minRoom) return w;
  }
  return null;
}

function buildRequiredUnits(dataset, dateStr) {
  const units = [];
  for (const a of dataset.assignments) {
    if (!a.required) continue;
    const subjectLevel = dataset.subjectLevelFor(a.subject);
    const exam = dataset.exams.find((e) => e.subject === a.subject) || null;
    const isExamRelevant = !!exam;
    const difficulty = subjectLevel && subjectLevel.recentAchievementRate < 70 ? 'hard' : 'normal';
    const dueToday = a.dueDate === dateStr;
    const description = isExamRelevant
      ? `${exam.examName} 대비를 위해 ${exam.scope} 관련 내용을 학습해요.`
      : dueToday
        ? '오늘 마감인 과제를 먼저 끝내볼까요.'
        : '마감이 가까운 과제예요.';
    units.push({
      subject: a.subject,
      title: a.title,
      description,
      minutes: a.estimatedMinutes,
      difficulty,
      planType: 'required',
      sourceType: 'ASSIGNMENT',
      sourceId: String(a.assignmentId),
      required: true,
      evidenceRequired: a.evidenceRequired,
      adjustmentReason: dueToday
        ? MessageBank.assignmentDueReason(a.title, true)
        : isExamRelevant
          ? MessageBank.examProximityReason(a.subject, daysUntil(exam.examDate, dateStr))
          : null,
    });
  }
  // Sort so due-today / exam-relevant / historically-hard subjects land in
  // the first (freshest-concentration) window.
  units.sort((a, b) => {
    if (a.difficulty === 'hard' && b.difficulty !== 'hard') return -1;
    if (b.difficulty === 'hard' && a.difficulty !== 'hard') return 1;
    return 0;
  });
  return units;
}

function buildCarryOverUnits(carryOver) {
  return carryOver.map((p) => {
    const reducedMinutes = clampInt(Math.round(p.estimatedMinutes * 0.5), 10, p.estimatedMinutes);
    return {
      subject: p.subject,
      title: `${p.title} (분량 축소)`,
      description: '전날 컨디션을 고려해 분량을 줄여 다시 도전해봐요.',
      minutes: reducedMinutes,
      difficulty: 'normal',
      planType: 'recommended',
      sourceType: 'INCOMPLETE_PLAN',
      sourceId: String(p.planItemId),
      required: false,
      evidenceRequired: false,
      adjustmentReason: MessageBank.carryOverReducedReason(),
    };
  });
}

function buildRecommendedUnits(dataset) {
  return dataset.subjectLevels.map((s) => ({
    subject: s.subject,
    title: `${s.subject} 복습`,
    description: '오늘 배운 내용을 가볍게 복습해요.',
    minutes: 20,
    difficulty: 'easy',
    planType: 'recommended',
    sourceType: 'AI_GENERATED',
    sourceId: null,
    required: false,
    evidenceRequired: false,
    adjustmentReason: null,
  }));
}

function enforceHardDifficultyCap(items, hardCapRatio) {
  const studyItems = items.filter((p) => p.planType !== 'fixed' && p.planType !== 'break');
  if (studyItems.length === 0) return items;
  let hardCount = studyItems.filter((p) => p.difficulty === 'hard').length;
  const maxHard = Math.floor(studyItems.length * hardCapRatio);
  if (hardCount <= maxHard) return items;

  const result = [...items];
  for (let i = 0; i < result.length && hardCount > maxHard; i++) {
    if (result[i].difficulty === 'hard' && !result[i].required) {
      result[i] = { ...result[i], difficulty: 'normal', adjustmentReason: MessageBank.hardCapReason() };
      hardCount--;
    }
  }
  return result;
}

function tierLabel(tier) {
  return tier;
}

function buildGenerationReasons(dataset, tier, dateStr, carryOverDecisions, condition) {
  const reasons = [MessageBank.loadTierReason(tierLabel(tier), dataset.recentPerformance.dailyAchievementRate7Days)];
  if (condition !== 'normal' && condition !== 'good' && condition !== 'very_good') {
    reasons.push(MessageBank.conditionAdjustmentReason(condition));
  }
  for (const exam of dataset.exams) {
    reasons.push(MessageBank.examProximityReason(exam.subject, daysUntil(exam.examDate, dateStr)));
  }
  for (const a of dataset.assignments) {
    if (a.required && a.dueDate === dateStr) {
      reasons.push(MessageBank.assignmentDueReason(a.title, true));
    }
  }
  if (carryOverDecisions.length > 0) {
    reasons.push(MessageBank.carryOverReducedReason());
  }
  reasons.push(MessageBank.hardCapReason());
  return reasons;
}

function generate({ dataset, dateStr, condition, carryOverOverride }) {
  const effectiveCondition = condition || dataset.student.condition;
  // Spec section 6: very_tired/sick force a required-only day regardless of
  // recent achievement rate; tired/stressed apply an extra load reduction
  // on top of the achievement-based tier instead of overriding it.
  const conditionForcesRequiredOnly = effectiveCondition === 'very_tired' || effectiveCondition === 'sick';

  const carryOver = carryOverOverride || dataset.incompletePlans;
  const achievementTier = resolveLoadTier(dataset.recentPerformance.dailyAchievementRate7Days);
  const tier = conditionForcesRequiredOnly ? LOAD_TIER.REQUIRED_ONLY : achievementTier;

  const fixedItems = buildFixedItems(dataset.fixedSchedules);
  const windows = computeWindows(dataset, fixedItems);

  const requiredUnits = buildRequiredUnits(dataset, dateStr);
  const carryOverUnits = buildCarryOverUnits(carryOver);
  const recommendedUnits = buildRecommendedUnits(dataset);

  const multiplier = conditionLoadMultiplier(effectiveCondition);
  const targetMinutes = Math.round(targetStudyMinutes(dataset, tier) * multiplier);

  const placed = [];
  let seq = 1;
  const carryOverDecisions = [];

  // Insert an after-school decompression break at the very start of the
  // first window, before any study begins (spec section 4: rest/study
  // balance).
  if (windows.length > 0 && windows[0].end - windows[0].start > 0) {
    const w = windows[0];
    const breakLen = clampInt(30, 10, w.end - w.start);
    placed.push(breakItem(seq++, w.start, breakLen, '하교 후 휴식', '간식을 먹고 몸과 머리를 쉬는 시간이에요.'));
    w.start += breakLen;
  }

  let remainingOptionalBudget = tier === LOAD_TIER.REQUIRED_ONLY ? 0 : targetMinutes;

  const queue = [...requiredUnits, ...carryOverUnits, ...(tier !== LOAD_TIER.REQUIRED_ONLY ? recommendedUnits : [])];

  let lastDifficulty = null;
  for (const unit of [...queue]) {
    if (!unit.required && remainingOptionalBudget <= 0) continue;

    // Avoid two hard items back to back: if the next unit is hard and the
    // previous placed item was hard, try to find a later non-hard unit to
    // swap with.
    let effectiveUnit = unit;
    if (unit.difficulty === 'hard' && lastDifficulty === 'hard') {
      const unitIndex = queue.indexOf(unit);
      const swapIndex = queue.findIndex((u, idx) => u !== unit && u.difficulty !== 'hard' && idx > unitIndex);
      if (swapIndex !== -1) {
        effectiveUnit = queue[swapIndex];
        queue[swapIndex] = unit;
      }
    }

    const window = findWindowWithRoom(windows, 10);
    if (!window) break;

    let duration = effectiveUnit.minutes;
    if (!effectiveUnit.required) {
      duration = clampInt(duration, 10, remainingOptionalBudget);
    }
    const windowRemaining = window.end - window.start;
    duration = duration > windowRemaining ? windowRemaining : duration;
    if (duration < 10) break;

    const start = window.start;
    const end = start + duration;
    const isCarryOver = effectiveUnit.sourceType === 'INCOMPLETE_PLAN';
    let adjustmentReason = effectiveUnit.adjustmentReason;
    if (isCarryOver && !adjustmentReason) {
      adjustmentReason = MessageBank.carryOverReducedReason();
    }

    placed.push({
      id: `plan-${seq}`,
      sequence: seq,
      planType: effectiveUnit.planType,
      subject: effectiveUnit.subject,
      title: effectiveUnit.title,
      description: effectiveUnit.description,
      startTime: minutesToTime(start),
      endTime: minutesToTime(end),
      durationMinutes: duration,
      priority: effectiveUnit.required ? 'high' : 'normal',
      difficulty: effectiveUnit.difficulty,
      required: effectiveUnit.required,
      rewardEligible: true,
      estimatedStickerReward: effectiveUnit.required
        ? dataset.stickerPolicy.requiredPlanCompletion
        : dataset.stickerPolicy.recommendedPlanCompletion,
      confirmedStickerReward: 0,
      evidenceRequired: effectiveUnit.evidenceRequired,
      sourceType: effectiveUnit.sourceType,
      sourceId: effectiveUnit.sourceId,
      adjustable: true,
      adjustmentReason,
    });
    seq++;
    window.start = end;
    lastDifficulty = effectiveUnit.difficulty;
    if (!effectiveUnit.required) remainingOptionalBudget -= duration;

    if (isCarryOver) {
      carryOverDecisions.push({
        sourcePlanItemId: effectiveUnit.sourceId || '',
        decision: 'REDUCE_AND_CARRY_OVER',
        originalQuantity: `${carryOver[0].estimatedMinutes}분 분량`,
        adjustedQuantity: `${duration}분 분량`,
        reason: MessageBank.carryOverReducedReason(),
      });
    }

    // Insert a short rest after this study block if there's another item
    // still to place and room remains in the window.
    const restLen = duration <= 25 ? 5 : duration <= 45 ? 8 : 12;
    if (window.end - window.start > restLen + 10) {
      placed.push(breakItem(seq++, window.start, restLen, '짧은 휴식', '물을 마시고 가볍게 스트레칭해요.'));
      window.start += restLen;
    }
  }

  // Merge in fixed schedule items at their real times, then sort by start.
  const merged = [...placed, ...fixedItems].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  let resequenced = merged.map((item, i) => ({ ...item, sequence: i + 1 }));

  const hardCapRatio = effectiveCondition === 'tired' || effectiveCondition === 'stressed' ? 0.25 : 0.4;
  resequenced = enforceHardDifficultyCap(resequenced, hardCapRatio);

  const requiredMinutes = resequenced
    .filter((p) => p.required && p.planType !== 'fixed' && p.planType !== 'break')
    .reduce((sum, p) => sum + p.durationMinutes, 0);
  const recommendedMinutes = resequenced
    .filter((p) => !p.required && p.planType !== 'fixed' && p.planType !== 'break')
    .reduce((sum, p) => sum + p.durationMinutes, 0);
  const breakMinutesTotal = resequenced
    .filter((p) => p.planType === 'break')
    .reduce((sum, p) => sum + p.durationMinutes, 0);

  const easyCount = resequenced.filter((p) => p.difficulty === 'easy').length;
  const normalCount = resequenced.filter((p) => p.difficulty === 'normal').length;
  const hardCount = resequenced.filter((p) => p.difficulty === 'hard').length;

  const planSummary = {
    title: '오늘의 AI 학습 플랜',
    totalStudyMinutes: requiredMinutes + recommendedMinutes,
    requiredStudyMinutes: requiredMinutes,
    recommendedStudyMinutes: recommendedMinutes,
    breakMinutes: breakMinutesTotal,
    planItemCount: resequenced.length,
    requiredPlanCount: resequenced.filter((p) => p.required && p.planType !== 'fixed').length,
    difficultyBalance: { easy: easyCount, normal: normalCount, hard: hardCount },
    expectedAchievementRate: expectedAchievementRate(tier),
    planConfidenceScore: planConfidenceScore(tier),
  };

  const generationReasons = buildGenerationReasons(dataset, tier, dateStr, carryOverDecisions, effectiveCondition);

  const rewardEligibleTotal = resequenced
    .filter((p) => p.rewardEligible)
    .reduce((sum, p) => sum + p.estimatedStickerReward, 0);
  const dailyBonusPossible = dataset.stickerPolicy.dailyAchievement80Bonus + dataset.stickerPolicy.allRequiredCompletionBonus;
  const firstAllowanceCondition = dataset.allowancePolicy.conditions[0] || null;

  const rewardForecast = {
    estimatedPlanStickerReward: rewardEligibleTotal,
    dailyBonusStickerPossible: dailyBonusPossible,
    maximumEstimatedStickerReward: rewardEligibleTotal + dailyBonusPossible,
    allowancePolicyExists: dataset.allowancePolicy.enabled,
    allowancePeriod: dataset.allowancePolicy.period,
    currentWeeklyAchievementRate: dataset.recentPerformance.weeklyAchievementRate,
    targetAchievementRate: firstAllowanceCondition ? firstAllowanceCondition.achievementRate : null,
    expectedAllowance: firstAllowanceCondition ? firstAllowanceCondition.amount : null,
    parentApprovalRequired: true,
    message: firstAllowanceCondition
      ? `이번 주 달성률이 ${Math.round(firstAllowanceCondition.achievementRate)}% 이상이면 ${firstAllowanceCondition.amount}원 용돈 지급 후보가 됩니다.`
      : '적용 가능한 용돈 정책이 없습니다.',
  };

  const reducedLoad =
    tier === LOAD_TIER.DECREASE_10 || tier === LOAD_TIER.DECREASE_20 || tier === LOAD_TIER.REQUIRED_ONLY || multiplier < 1.0;

  return {
    result: 'success',
    targetDate: dateStr,
    studentId: dataset.student.studentId,
    planSummary,
    dailyPlans: resequenced,
    generationReasons,
    studentMessage: {
      title: MessageBank.studentMessageTitle(effectiveCondition),
      message: MessageBank.studentMessageBody({
        leastCompletedSubject: dataset.recentPerformance.leastCompletedSubject,
        reducedLoad,
      }),
      tone: conditionForcesRequiredOnly || effectiveCondition === 'stressed' ? 'concerned' : 'encouraging',
    },
    parentMessage: {
      summary:
        `최근 달성률과 ${dataset.recentPerformance.leastCompletedSubject} 미완료 이력을 반영해 ` +
        `총 자기주도 학습시간을 ${requiredMinutes + recommendedMinutes}분으로 조정했습니다.`,
      attentionItems: [
        ...(carryOverDecisions.length > 0 ? ['전날 미완료 학습이 있어 분량을 줄여 재배치했습니다.'] : []),
        ...(dataset.recentPerformance.dailyAchievementRate7Days < 75
          ? [`${dataset.recentPerformance.leastCompletedSubject} 달성률이 최근 낮은 편입니다.`]
          : []),
        ...(conditionForcesRequiredOnly ? [`학생 컨디션(${effectiveCondition}) 확인이 필요해요.`] : []),
      ],
      approvalRequired: conditionForcesRequiredOnly,
    },
    rewardForecast,
    carryOverDecisions,
    warnings: [...(effectiveCondition === 'sick' ? ['학생이 아픈 컨디션이에요. 학습보다 휴식을 우선해 주세요.'] : [])],
    validation: {
      fixedScheduleConflict: false,
      exceedsMaximumStudyTime: requiredMinutes + recommendedMinutes > dataset.parentSettings.maxDailyStudyMinutes,
      bedTimeConflict:
        resequenced.length > 0 &&
        timeToMinutes(resequenced[resequenced.length - 1].endTime) > timeToMinutes(dataset.student.bedTime),
      insufficientBreakTime: breakMinutesTotal < 10,
      excessiveHardTasks: resequenced.length > 0 && hardCount / resequenced.length > 0.4,
      excessiveCarryOver: carryOverDecisions.length > 2,
      valid: true,
    },
  };
}

module.exports = { generate };