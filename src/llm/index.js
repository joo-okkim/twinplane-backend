// Provider selection point for the 이해도 확인 (comprehension check) feature.
// Add new providers by creating src/llm/<name>Provider.js implementing the
// same exports (generateQuestions, gradeShortAnswers, LlmRefusalError) and
// adding a case below. Selecting an unimplemented provider throws here, at
// require-time (server boot) -- fail loudly, never a silent fallback to
// Claude.
const PROVIDER = process.env.LLM_PROVIDER || 'claude';

let impl;
if (PROVIDER === 'claude') {
  impl = require('./claudeProvider');
} else {
  throw new Error(
    `Unsupported LLM_PROVIDER "${PROVIDER}" -- no provider implementation registered. ` +
      `Set LLM_PROVIDER=claude, or implement src/llm/${PROVIDER}Provider.js and register it in src/llm/index.js.`,
  );
}

module.exports = impl;
