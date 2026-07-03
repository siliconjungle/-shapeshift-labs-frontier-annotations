import {
  FRONTIER_ANNOTATION_KIND,
  FRONTIER_ANNOTATION_SUBMISSION_KIND,
  FRONTIER_ANNOTATION_SUBMISSION_VERSION,
  FRONTIER_ANNOTATION_SUBMIT_RESULT_KIND,
  FRONTIER_ANNOTATION_SUBMIT_RESULT_VERSION,
  FRONTIER_ANNOTATION_VERSION,
  type FrontierAnnotation,
  type FrontierAnnotationInput,
  type FrontierAnnotationSubmission,
  type FrontierAnnotationSubmissionInput,
  type FrontierAnnotationSubmitResult,
  type FrontierAnnotationSubmitter,
  type FrontierAnnotationValidationError,
  type FrontierAnnotationValidationResult
} from './types.js';
import { stableId, toJsonObject, uniqueStrings } from './internal.js';

export function createFrontierAnnotation(input: FrontierAnnotation | FrontierAnnotationInput): FrontierAnnotation {
  if ((input as FrontierAnnotation).kind === FRONTIER_ANNOTATION_KIND) return input as FrontierAnnotation;
  const draft = input as FrontierAnnotationInput;
  return {
    kind: FRONTIER_ANNOTATION_KIND,
    version: FRONTIER_ANNOTATION_VERSION,
    id: draft.id ?? stableId('annotation', draft.note + ':' + draft.target.selector),
    note: draft.note,
    target: draft.target,
    css: [...(draft.css ?? [])],
    sourceHints: [...(draft.sourceHints ?? [])],
    url: draft.url,
    title: draft.title,
    route: draft.route,
    feature: draft.feature,
    package: draft.package,
    actor: draft.actor,
    createdAt: draft.createdAt ?? Date.now(),
    status: draft.status ?? 'draft',
    metadata: toJsonObject(draft.metadata)
  };
}

export function createFrontierAnnotationSubmission(input: FrontierAnnotationSubmissionInput): FrontierAnnotationSubmission {
  const annotations = input.annotations.map(createFrontierAnnotation);
  const sourceRefs = uniqueStrings([
    ...(input.sourceRefs ?? []),
    ...annotations.flatMap((annotation) => annotation.sourceHints.map((hint) => hint.file))
  ]);
  const targetRefs = uniqueStrings(input.targetRefs ?? []);
  const objective = input.objective ?? defaultObjective(annotations);
  return {
    kind: FRONTIER_ANNOTATION_SUBMISSION_KIND,
    version: FRONTIER_ANNOTATION_SUBMISSION_VERSION,
    id: input.id ?? stableId('annotation-submission', annotations.map((annotation) => annotation.id).join('|') + ':' + objective),
    annotations,
    objective,
    lane: input.lane ?? 'browser-annotation',
    compute: input.compute,
    sourceRefs,
    targetRefs,
    allowedWrites: uniqueStrings(input.allowedWrites ?? targetRefs),
    acceptance: [...(input.acceptance ?? ['The annotated UI issue is addressed and covered by focused evidence.'])],
    verification: [...(input.verification ?? [])],
    evidenceRefs: [...(input.evidenceRefs ?? [])],
    package: input.package ?? annotations.find((annotation) => annotation.package)?.package,
    feature: input.feature ?? annotations.find((annotation) => annotation.feature)?.feature,
    actor: input.actor ?? annotations.find((annotation) => annotation.actor)?.actor,
    createdAt: input.createdAt ?? Date.now(),
    metadata: toJsonObject(input.metadata)
  };
}

export function validateFrontierAnnotationSubmission(submission: FrontierAnnotationSubmission): FrontierAnnotationValidationResult {
  const errors: FrontierAnnotationValidationError[] = [];
  if (submission.annotations.length === 0) {
    errors.push({ path: '/annotations', code: 'missing-annotations', message: 'At least one annotation is required.' });
  }
  if (!submission.objective.trim()) {
    errors.push({ path: '/objective', code: 'missing-objective', message: 'A submission objective is required.' });
  }
  for (const [index, annotation] of submission.annotations.entries()) {
    if (!annotation.note.trim()) {
      errors.push({ path: '/annotations/' + index + '/note', code: 'missing-note', message: 'Annotation note is empty.' });
    }
    if (!annotation.target.selector.trim()) {
      errors.push({ path: '/annotations/' + index + '/target/selector', code: 'missing-selector', message: 'Annotation target selector is empty.' });
    }
  }
  for (const file of submission.allowedWrites) {
    if (file.includes('..')) {
      errors.push({ path: '/allowedWrites', code: 'unsafe-write', message: 'Allowed write path must not contain parent traversal: ' + file });
    }
  }
  return { valid: errors.length === 0, errors };
}

export async function submitFrontierAnnotationTask(
  submitter: FrontierAnnotationSubmitter,
  submission: FrontierAnnotationSubmission
): Promise<FrontierAnnotationSubmitResult> {
  const validation = validateFrontierAnnotationSubmission(submission);
  if (!validation.valid) {
    return {
      kind: FRONTIER_ANNOTATION_SUBMIT_RESULT_KIND,
      version: FRONTIER_ANNOTATION_SUBMIT_RESULT_VERSION,
      id: stableId('annotation-submit-result', submission.id + ':invalid'),
      submissionId: submission.id,
      accepted: false,
      taskIds: [],
      error: validation.errors.map((error) => error.code + ':' + error.path).join(', '),
      metadata: { validationErrorCount: validation.errors.length }
    };
  }
  return submitter.submit(submission);
}

export function encodeFrontierAnnotationsJsonl(records: readonly (FrontierAnnotation | FrontierAnnotationSubmission | FrontierAnnotationSubmitResult)[]) {
  return records.map((record) => JSON.stringify(record)).join('\n') + (records.length ? '\n' : '');
}

export function decodeFrontierAnnotationsJsonl(text: string) {
  return text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as FrontierAnnotation | FrontierAnnotationSubmission | FrontierAnnotationSubmitResult);
}

function defaultObjective(annotations: readonly FrontierAnnotation[]) {
  const first = annotations[0];
  if (!first) return 'Address browser annotations.';
  return 'Address browser annotation for ' + first.target.selector + ': ' + first.note;
}
