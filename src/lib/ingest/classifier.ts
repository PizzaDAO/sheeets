// Theme classifier (§5.5): one Claude Haiku call per candidate, structured
// output, temperature 0. Budget/retry/content-hash-skip plumbing that needs
// `ingest_candidates`/`ingest_runs` lands in Phase 1b — this module is the
// pure request/response boundary so it can be unit-tested with the SDK
// mocked and reused by the eval harness.
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { ClassifierOutputSchema } from './types';
import type {
  ClassifierConferenceContext,
  ClassifierEventInput,
  ClassifierOutput,
  FewShotExample,
  ThemeProfile,
} from './types';
import { buildEventDataContent, buildSystemPrompt, scanForInjection } from './prompt';

/** Pinned per the approved plan (§5.5) rather than a floating alias, so eval
 *  results stay comparable across runs until we deliberately move the pin. */
export const CLASSIFIER_MODEL = 'claude-haiku-4-5-20251001';
export const CLASSIFIER_MAX_TOKENS = 300;
export const PROMPT_VERSION = '1a-v1';

export class ClassifierError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'ClassifierError';
  }
}

export interface ClassifyOptions {
  client: Anthropic;
  profile: ThemeProfile;
  conference: ClassifierConferenceContext;
  event: ClassifierEventInput;
  fewShot?: FewShotExample[];
}

export interface ClassifyResult {
  output: ClassifierOutput;
  /** True if our deterministic regex pre-scan found an injection attempt,
   *  independent of whether the model itself flagged it. */
  injectionDetected: boolean;
  inputTokens: number;
  outputTokens: number;
  model: string;
  promptVersion: string;
}

export async function classifyEvent(opts: ClassifyOptions): Promise<ClassifyResult> {
  const { client, profile, conference, event, fewShot = [] } = opts;

  const injectionDetected =
    scanForInjection(event.name) || scanForInjection(event.descriptionText);

  const system = buildSystemPrompt(profile, conference, fewShot);
  const userContent = buildEventDataContent(event);

  let response;
  try {
    response = await client.messages.parse({
      model: CLASSIFIER_MODEL,
      max_tokens: CLASSIFIER_MAX_TOKENS,
      temperature: 0,
      system,
      messages: [{ role: 'user', content: userContent }],
      output_config: { format: zodOutputFormat(ClassifierOutputSchema) },
    });
  } catch (err) {
    throw new ClassifierError('Classifier request failed.', err);
  }

  if (!response.parsed_output) {
    throw new ClassifierError('Classifier returned output that failed schema validation.');
  }

  let output = response.parsed_output;
  // Belt-and-suspenders: our own regex pre-scan is authoritative for capping
  // the route at review, even if the model didn't self-report the flag.
  if (injectionDetected && !output.flags.includes('instructions_in_content')) {
    output = { ...output, flags: [...output.flags, 'instructions_in_content'] };
  }

  return {
    output,
    injectionDetected,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    model: CLASSIFIER_MODEL,
    promptVersion: PROMPT_VERSION,
  };
}
