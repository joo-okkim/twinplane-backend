// In-memory per-date plan cache so a modification/review request can look
// up the plan it acts on, mirroring the frontend's
// MockAiTeacherRepository._plansByDate (mock_ai_teacher_repository.dart).
// A real backend would replace this with actual storage.
const plansByDate = new Map();

function set(dateStr, plan) {
  plansByDate.set(dateStr, plan);
}

function get(dateStr) {
  return plansByDate.get(dateStr) || null;
}

// Finds the plan (and its date key) containing a given plan item id.
function findByItemId(planItemId) {
  for (const [dateStr, plan] of plansByDate.entries()) {
    if (plan.dailyPlans.some((p) => p.id === planItemId)) {
      return { dateStr, plan };
    }
  }
  return null;
}

module.exports = { set, get, findByItemId };