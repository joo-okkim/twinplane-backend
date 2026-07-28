// Curated, soft-phrasing string templates, ported 1:1 from the frontend's
// lib/services/mock/message_bank.dart. Centralizing every student/parent-
// facing sentence here means no code path can accidentally emit a blaming
// phrase -- every string here already matches the AI Teacher spec's
// approved tone.

function conditionAdjustmentReason(condition) {
  switch (condition) {
    case 'tired':
      return '오늘 컨디션이 다소 피곤하다고 하셔서 학습량을 조금 줄였어요.';
    case 'very_tired':
      return '많이 피곤한 날이라 꼭 필요한 계획 중심으로만 구성했어요.';
    case 'stressed':
      return '마음이 편하지 않은 날이라 작은 단위로 나누어 부담을 줄였어요.';
    case 'sick':
      return '컨디션이 좋지 않아 학습보다 휴식을 우선했어요. 보호자 확인이 필요해요.';
    default:
      return '';
  }
}

function loadTierReason(tierLabel, rate7d) {
  const pct = Math.round(rate7d);
  switch (tierLabel) {
    case 'increase':
      return `최근 7일 달성률이 ${pct}%로 높아 학습량을 조금 늘려도 괜찮을 것 같아요.`;
    case 'keep':
      return `최근 7일 달성률이 ${pct}%로 안정적이어서 기존 학습량을 그대로 유지했어요.`;
    case 'decrease10':
      return `최근 7일 달성률이 ${pct}%이어서 학습량을 10% 정도 줄여 부담을 낮췄어요.`;
    case 'decrease20':
      return `최근 7일 달성률이 ${pct}%이어서 학습량을 20% 정도 줄이고 꼭 필요한 것 위주로 구성했어요.`;
    case 'requiredOnly':
    default:
      return `최근 7일 달성률이 ${pct}%이어서 오늘은 꼭 필요한 계획 중심으로만 구성했어요.`;
  }
}

function examProximityReason(subject, daysLeft) {
  if (daysLeft <= 2) return `${subject} 시험이 코앞이라 새로운 학습보다 핵심 복습 위주로 배치했어요.`;
  if (daysLeft <= 6) return `${subject} 시험이 얼마 남지 않아 오답과 취약 영역을 우선 배치했어요.`;
  if (daysLeft <= 14) return `${subject} 시험이 다가오고 있어 핵심 개념과 문제풀이 비중을 높였어요.`;
  return `${subject} 시험까지 시간이 있어 진도와 복습을 균형 있게 배치했어요.`;
}

function assignmentDueReason(title, dueToday) {
  return dueToday
    ? `오늘 마감인 "${title}" 과제를 우선 배치했어요.`
    : `마감이 가까운 "${title}" 과제를 먼저 배치했어요.`;
}

function carryOverReducedReason() {
  return '전날 컨디션을 반영해 이월된 학습은 분량을 줄여서 다시 배치했어요.';
}

function hardCapReason() {
  return '어려운 과목이 너무 몰리지 않도록 일부 난이도를 조정했어요.';
}

function studentMessageTitle(condition) {
  switch (condition) {
    case 'tired':
    case 'very_tired':
      return '오늘은 가볍게, 할 수 있는 만큼만 해봐요.';
    case 'stressed':
      return '오늘은 작은 단위로 하나씩 완료해봐요.';
    case 'sick':
      return '오늘은 몸을 먼저 돌보는 게 우선이에요.';
    default:
      return '오늘은 중요한 계획부터 차근차근 해봐요.';
  }
}

function studentMessageBody({ leastCompletedSubject, reducedLoad }) {
  const loadPart = reducedLoad ? '지난 학습 결과를 반영해 분량을 줄였어요. ' : '';
  return `${loadPart}${leastCompletedSubject}부터 먼저 시작해서 중요한 계획을 하나씩 완료해봅시다.`.trim();
}

const parentDeletionBlockedReason = '필수 계획 삭제는 보호자 승인이 필요한 항목이라 자동으로 반영하지 않았어요.';

function modifyReducedMessage() {
  return '오늘 컨디션을 반영해 분량을 줄여서 이어서 진행할 수 있게 조정했어요.';
}

function modifyShortenedMessage() {
  return '짧게 시작한 뒤 집중 상태를 다시 확인해볼 수 있도록 시간을 줄였어요.';
}

function modifyRescheduleMessage() {
  return '지금 시간이 맞지 않는 것 같아 다른 시간대로 옮겨봤어요.';
}

function modifyRemovedMessage(tier) {
  switch (tier) {
    case 'bonus':
      return '보너스 계획이라 부담 없이 오늘 계획에서 제외했어요.';
    case 'optional':
      return '선택 계획이라 오늘 계획에서 제외했어요.';
    default:
      return '오늘 수행 가능한 범위로 조정했어요.';
  }
}

module.exports = {
  conditionAdjustmentReason,
  loadTierReason,
  examProximityReason,
  assignmentDueReason,
  carryOverReducedReason,
  hardCapReason,
  studentMessageTitle,
  studentMessageBody,
  parentDeletionBlockedReason,
  modifyReducedMessage,
  modifyShortenedMessage,
  modifyRescheduleMessage,
  modifyRemovedMessage,
};