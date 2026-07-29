// Per-student, per-date plan storage backed by Postgres (daily_plans +
// plan_items), replacing the old in-memory Map. daily_plans holds the
// envelope only; plan_items is the single source of truth for items, keyed
// by (daily_plan_id, client_id) -- NOT globally unique on client_id, since
// wire ids like "plan-2" are reused every day by design
// (see src/logic/planGeneration.js). findItemByClientId scopes its lookup
// to student_id, which is what makes /api/plans/modify resolve correctly
// per-student instead of the old cross-date Map scan.
const pool = require('../db/pool');

async function saveDailyPlan(studentId, dateStr, response) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO daily_plans
         (student_id, plan_date, plan_summary, generation_reasons, student_message,
          parent_message, reward_forecast, carry_over_decisions, warnings, validation)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (student_id, plan_date) DO UPDATE SET
         plan_summary = EXCLUDED.plan_summary,
         generation_reasons = EXCLUDED.generation_reasons,
         student_message = EXCLUDED.student_message,
         parent_message = EXCLUDED.parent_message,
         reward_forecast = EXCLUDED.reward_forecast,
         carry_over_decisions = EXCLUDED.carry_over_decisions,
         warnings = EXCLUDED.warnings,
         validation = EXCLUDED.validation,
         created_at = now()
       RETURNING id`,
      [
        studentId,
        dateStr,
        response.planSummary,
        response.generationReasons,
        response.studentMessage,
        response.parentMessage,
        response.rewardForecast,
        response.carryOverDecisions,
        response.warnings,
        response.validation,
      ],
    );
    const dailyPlanId = rows[0].id;

    await client.query('DELETE FROM plan_items WHERE daily_plan_id = $1', [dailyPlanId]);
    for (const item of response.dailyPlans) {
      await client.query(
        `INSERT INTO plan_items (daily_plan_id, student_id, plan_date, client_id, sequence, item)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [dailyPlanId, studentId, dateStr, item.id, item.sequence, item],
      );
    }

    await client.query('COMMIT');
    return dailyPlanId;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getPlanItems(studentId, dateStr) {
  const { rows } = await pool.query(
    `SELECT pi.item
       FROM plan_items pi
       JOIN daily_plans dp ON dp.id = pi.daily_plan_id
      WHERE dp.student_id = $1 AND dp.plan_date = $2
      ORDER BY pi.sequence`,
    [studentId, dateStr],
  );
  return rows.map((r) => r.item);
}

// Resolves a client-supplied item id to the item itself plus enough
// context to update/remove it, preferring the student's most recently
// generated/regenerated plan if the same client_id appears on more than
// one date.
async function findItemByClientId(studentId, clientId) {
  const { rows } = await pool.query(
    `SELECT daily_plan_id, plan_date, item
       FROM plan_items
      WHERE student_id = $1 AND client_id = $2
      ORDER BY plan_date DESC, id DESC
      LIMIT 1`,
    [studentId, clientId],
  );
  if (rows.length === 0) return null;
  return { dailyPlanId: rows[0].daily_plan_id, planDate: rows[0].plan_date, item: rows[0].item };
}

async function updateItem(dailyPlanId, clientId, updatedItem) {
  await pool.query('UPDATE plan_items SET item = $1 WHERE daily_plan_id = $2 AND client_id = $3', [
    updatedItem,
    dailyPlanId,
    clientId,
  ]);
}

async function removeItem(dailyPlanId, clientId) {
  await pool.query('DELETE FROM plan_items WHERE daily_plan_id = $1 AND client_id = $2', [dailyPlanId, clientId]);
}

module.exports = { saveDailyPlan, getPlanItems, findItemByClientId, updateItem, removeItem };
