// The only src/llm provider implemented so far -- see src/llm/index.js for
// the fail-loud provider-selection point that picks this module.
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env
const MODEL = 'claude-opus-5';

class LlmRefusalError extends Error {
  constructor(category) {
    super(`Claude declined the request (category: ${category || 'unknown'})`);
    this.name = 'LlmRefusalError';
  }
}

const QUESTION_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['multiple_choice', 'short_answer'] },
          question: { type: 'string' },
          choices: { type: 'array', items: { type: 'string' } },
          correctAnswer: { type: 'string' },
          explanation: { type: 'string' },
        },
        required: ['type', 'question', 'choices', 'correctAnswer', 'explanation'],
        additionalProperties: false,
      },
    },
  },
  required: ['questions'],
  additionalProperties: false,
};

// json_schema output_config doesn't support minItems/maxItems, so "exactly
// 5 questions" is enforced via the system prompt instead of the schema.
async function generateQuestions({ subject, scope, gradeLevel }) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    // This is a synchronous, foreground request a student is waiting on,
    // and the task is bounded (5 questions from an explicit subject+scope,
    // not open-ended research) -- medium effort trades a small amount of
    // quality for latency, per the user's decision.
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: QUESTION_SCHEMA },
    },
    system:
      '당신은 초중등 학생을 위한 이해도 확인 문제를 만드는 AI 선생님입니다. ' +
      '주어진 과목과 학습 범위를 바탕으로, 객관식과 주관식을 적절히 섞어 정확히 5문항을 생성하세요. ' +
      '어떤 유형을 몇 개 낼지는 과목/범위 특성에 맞게 직접 판단하세요. ' +
      '객관식 문제는 choices에 그럴듯한 보기 4개를 넣고, correctAnswer는 그중 하나와 정확히 일치해야 합니다. ' +
      '주관식 문제는 choices를 빈 배열로 두세요. ' +
      '난이도는 학생의 학년 수준에 맞추고, explanation에는 학생이 이해하는 데 도움이 되는 간단한 해설을 적으세요.',
    messages: [
      {
        role: 'user',
        content:
          `과목: ${subject}\n학습 범위: ${scope}\n학년: ${gradeLevel || '중학생'}\n` +
          '위 내용을 바탕으로 이해도 확인 문제 5개를 만들어주세요.',
      },
    ],
  });

  if (response.stop_reason === 'refusal') {
    throw new LlmRefusalError(response.stop_details && response.stop_details.category);
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  const parsed = JSON.parse(textBlock.text);
  return parsed.questions;
}

const GRADING_SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          questionId: { type: 'integer' },
          isCorrect: { type: 'boolean' },
          feedback: { type: 'string' },
        },
        required: ['questionId', 'isCorrect', 'feedback'],
        additionalProperties: false,
      },
    },
  },
  required: ['results'],
  additionalProperties: false,
};

// No `effort` override here (defaults to "high") -- grading needs more
// judgment than generation (synonyms, partial credit, minor phrasing/typos
// should still count as correct), and a wrongly-marked answer is more
// damaging to the product than one extra second of latency, per the user's
// decision.
async function gradeShortAnswers({ items }) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    output_config: {
      format: { type: 'json_schema', schema: GRADING_SCHEMA },
    },
    system:
      '당신은 학생의 주관식 답안을 채점하는 AI 선생님입니다. ' +
      '모범 답안과 의미가 같으면 정답으로 인정하세요 (표현 차이, 띄어쓰기, 사소한 오타는 허용). ' +
      '각 문항마다 정답 여부(isCorrect)와, 학생에게 도움이 되는 한두 문장의 피드백(feedback)을 작성하세요. ' +
      'questionId는 입력받은 값을 그대로 반환하세요.',
    messages: [
      {
        role: 'user',
        content: JSON.stringify(
          items.map((i) => ({
            questionId: i.questionId,
            question: i.question,
            correctAnswer: i.correctAnswer,
            studentAnswer: i.studentAnswer,
          })),
        ),
      },
    ],
  });

  if (response.stop_reason === 'refusal') {
    throw new LlmRefusalError(response.stop_details && response.stop_details.category);
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  const parsed = JSON.parse(textBlock.text);
  return parsed.results;
}

module.exports = { generateQuestions, gradeShortAnswers, LlmRefusalError };
