// Rule-based modification handler, ported 1:1 from the frontend's
// lib/services/mock/modification_logic.dart (spec section 14): a student's
// request is never blindly honored -- required items locked by parent
// policy are routed to PARENT_APPROVAL_REQUIRED, and otherwise the ladder
// is: remove bonus -> remove optional -> shrink recommended -> shrink
// required -> split -> move to another day (the "move" step is out of
// scope for this mock and falls back to split).
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

function result(status, updatedItem, message, reason) {
  return { modificationStatus: status, updatedItem, message, reason };
}

function handleWrongTime(item) {
  if (item.required) {
    return result(
      'PARENT_APPROVAL_REQUIRED',
      null,
      '필수 계획의 시간 변경은 보호자 확인 후 반영할게요.',
      '필수 계획의 시간 이동은 보호자 승인 대상이에요.',
    );
  }
  const newStart = timeToMinutes(item.startTime) + 30;
  const message = MessageBank.modifyRescheduleMessage();
  const updated = {
    ...item,
    startTime: minutesToTime(newStart),
    endTime: minutesToTime(newStart + item.durationMinutes),
    adjustmentReason: message,
  };
  return result('APPLIED', updated, message, message);
}

function handleReduceOrRemove(item, parentSettings, wantsRemoval) {
  // Step 1-2: bonus/optional items are removed with the least friction.
  if (item.planType === 'bonus' || item.planType === 'optional') {
    const tier = item.planType === 'bonus' ? 'bonus' : 'optional';
    const message = MessageBank.modifyRemovedMessage(tier);
    return result('REMOVED', null, message, message);
  }

  // Step 3: recommended items are shrunk generously.
  if (item.planType === 'recommended') {
    const newDuration = clampInt(Math.round(item.durationMinutes * 0.5), 10, item.durationMinutes);
    const start = timeToMinutes(item.startTime);
    const message = MessageBank.modifyReducedMessage();
    const updated = {
      ...item,
      durationMinutes: newDuration,
      endTime: minutesToTime(start + newDuration),
      adjustmentReason: message,
    };
    return result('APPLIED', updated, message, message);
  }

  // Step 4: required items -- never deleted by this mock. An explicit
  // removal request ("하기 싫어요") on a required item is routed to
  // PARENT_APPROVAL_REQUIRED whenever parent policy locks required-item
  // deletion; a mere "make it lighter" request (tired/too much) is instead
  // eased directly without bothering the parent.
  if (item.required) {
    if (wantsRemoval && parentSettings.requireParentApprovalForRequiredPlanDeletion) {
      return result(
        'PARENT_APPROVAL_REQUIRED',
        null,
        '이 계획은 꼭 필요한 항목이라 보호자 확인이 필요해요.',
        MessageBank.parentDeletionBlockedReason,
      );
    }
    // Ease the load instead of deleting: downgrade hard->normal first,
    // otherwise trim duration by up to 30%.
    if (item.difficulty === 'hard') {
      const message = '필수 계획은 삭제 대신 난이도를 낮춰서 조정했어요.';
      const updated = { ...item, difficulty: 'normal', adjustmentReason: message };
      return result('APPLIED', updated, message, message);
    }
    const newDuration = clampInt(Math.round(item.durationMinutes * 0.7), 10, item.durationMinutes);
    const start = timeToMinutes(item.startTime);
    const message = '필수 계획이라 삭제 대신 분량을 줄여서 조정했어요.';
    const updated = {
      ...item,
      durationMinutes: newDuration,
      endTime: minutesToTime(start + newDuration),
      adjustmentReason: message,
    };
    return result('APPLIED', updated, message, message);
  }

  // Step 5: fallback -- split into a shorter block.
  const half = clampInt(Math.round(item.durationMinutes / 2), 10, item.durationMinutes);
  const start = timeToMinutes(item.startTime);
  const message = MessageBank.modifyShortenedMessage();
  const updated = {
    ...item,
    durationMinutes: half,
    endTime: minutesToTime(start + half),
    adjustmentReason: message,
  };
  return result('APPLIED', updated, message, message);
}

function decide({ item, reason, parentSettings }) {
  if (!item.adjustable) {
    return result(
      'PARENT_APPROVAL_REQUIRED',
      null,
      '고정 일정이라 앱에서 바로 바꿀 수 없어요.',
      '고정 일정/휴식은 조정 대상이 아니에요.',
    );
  }

  switch (reason) {
    case 'WRONG_TIME':
      return handleWrongTime(item);
    case 'TIRED':
    case 'TOO_MUCH':
      return handleReduceOrRemove(item, parentSettings, false);
    case 'DONT_WANT':
      return handleReduceOrRemove(item, parentSettings, true);
    default:
      return handleReduceOrRemove(item, parentSettings, false);
  }
}

module.exports = { decide };