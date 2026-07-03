import {
  FRONTIER_ANNOTATION_CODEX_TASK_KIND,
  FRONTIER_ANNOTATION_CODEX_TASK_VERSION,
  FRONTIER_ANNOTATION_QUEUE_KIND,
  FRONTIER_ANNOTATION_QUEUE_VERSION,
  type FrontierAnnotation,
  type FrontierAnnotationCodexQueue,
  type FrontierAnnotationCodexTask,
  type FrontierAnnotationCodexTaskOptions,
  type FrontierAnnotationContext
} from './types.js';
import { clampText, stableId, toJsonObject, uniqueStrings } from './internal.js';

export function createFrontierAnnotationCodexTask(
  annotation: FrontierAnnotation,
  context: FrontierAnnotationContext,
  options: FrontierAnnotationCodexTaskOptions = {}
): FrontierAnnotationCodexTask {
  const id = options.id ?? stableId('annotation-task', annotation.id + ':' + annotation.note);
  const targetRefs = uniqueStrings(options.targetRefs ?? []);
  const allowedWrites = uniqueStrings(options.allowedWrites ?? targetRefs);
  const objective = options.objective ?? defaultObjective(annotation);
  const acceptance = [...(options.acceptance ?? defaultAcceptance(annotation))];
  const verification = [...(options.verification ?? [])];
  return {
    kind: FRONTIER_ANNOTATION_CODEX_TASK_KIND,
    version: FRONTIER_ANNOTATION_CODEX_TASK_VERSION,
    id,
    title: options.title ?? titleFromAnnotation(annotation),
    lane: options.lane ?? 'browser-annotation',
    status: options.status ?? 'todo',
    workKind: 'implementation',
    objective,
    sourceRefs: context.sourceRefs,
    targetRefs,
    ownedFiles: allowedWrites,
    allowedWrites,
    verification,
    acceptance,
    prompt: createFrontierAnnotationCodexPrompt(annotation, context, { ...options, objective, acceptance, verification }),
    model: options.model,
    reasoningEffort: options.reasoningEffort,
    package: options.package ?? annotation.package,
    feature: options.feature ?? annotation.feature,
    metadata: toJsonObject({
      ...toJsonObject(options.metadata),
      annotationId: annotation.id,
      contextId: context.id,
      route: annotation.route,
      selector: annotation.target.selector
    })
  };
}

export function createFrontierAnnotationCodexPrompt(
  annotation: FrontierAnnotation,
  context: FrontierAnnotationContext,
  options: FrontierAnnotationCodexTaskOptions = {}
) {
  const lines = [
    'You are a Codex worker handling a browser UI annotation captured by Frontier.',
    '',
    'Objective:',
    options.objective ?? defaultObjective(annotation),
    '',
    'User annotation:',
    annotation.note,
    '',
    'Selected DOM target:',
    '- selector: ' + annotation.target.selector,
    '- cssPath: ' + annotation.target.cssPath,
    '- tagName: ' + annotation.target.tagName,
    annotation.target.text ? '- text: ' + annotation.target.text : '',
    annotation.route ? '- route: ' + annotation.route : '',
    annotation.url ? '- url: ' + annotation.url : '',
    '',
    'Source hints:',
    ...annotation.sourceHints.map((hint) => '- ' + formatHint(hint)),
    annotation.sourceHints.length === 0 ? '- none captured' : '',
    '',
    'Relevant source files:',
    ...context.snippets.map((snippet) => {
      const head = '- ' + snippet.file + ' score=' + snippet.score + ' reasons=' + snippet.reasons.join(',');
      const symbols = snippet.symbols.length ? '\n  symbols: ' + snippet.symbols.join(', ') : '';
      return head + symbols;
    }),
    '',
    'CSS evidence:',
    ...annotation.css.slice(0, 12).map((rule) => '- ' + rule.selector + ': ' + clampText(rule.cssText.replace(/\s+/g, ' '), 360)),
    annotation.css.length === 0 ? '- none captured' : '',
    '',
    'Allowed writes:',
    ...(options.allowedWrites ?? []).map((file) => '- ' + file),
    (options.allowedWrites ?? []).length === 0 ? '- infer from the selected source files, then keep edits narrow' : '',
    '',
    'Verification:',
    ...(options.verification ?? []).map((command) => '- ' + command),
    (options.verification ?? []).length === 0 ? '- run the smallest package-local build/test gate that covers the edit' : '',
    '',
    'Acceptance:',
    ...(options.acceptance ?? defaultAcceptance(annotation)).map((item) => '- ' + item),
    '',
    'Source excerpts:',
    ...context.snippets.flatMap((snippet) => snippet.text ? [
      '```text ' + snippet.file,
      snippet.text,
      '```'
    ] : []),
    options.includeAnnotationJson === false ? '' : '',
    options.includeAnnotationJson === false ? '' : 'Annotation JSON:',
    options.includeAnnotationJson === false ? '' : '```json',
    options.includeAnnotationJson === false ? '' : JSON.stringify(annotation, null, 2),
    options.includeAnnotationJson === false ? '' : '```'
  ];
  return lines.filter((line) => line !== '').join('\n');
}

export function createFrontierAnnotationCodexQueue(
  items: readonly FrontierAnnotationCodexTask[],
  options: { id?: string } = {}
): FrontierAnnotationCodexQueue {
  const tasks = [...items];
  return {
    kind: FRONTIER_ANNOTATION_QUEUE_KIND,
    version: FRONTIER_ANNOTATION_QUEUE_VERSION,
    id: options.id ?? stableId('annotation-queue', tasks.map((task) => task.id).join('|')),
    items: tasks,
    summary: {
      taskCount: tasks.length,
      sourceRefCount: uniqueStrings(tasks.flatMap((task) => task.sourceRefs)).length,
      targetRefCount: uniqueStrings(tasks.flatMap((task) => task.targetRefs)).length
    }
  };
}

function titleFromAnnotation(annotation: FrontierAnnotation) {
  const text = annotation.note.replace(/\s+/g, ' ').trim();
  return text.length > 80 ? text.slice(0, 77) + '...' : text || 'Browser annotation';
}

function defaultObjective(annotation: FrontierAnnotation) {
  return 'Implement the UI/code change requested by the browser annotation for ' + annotation.target.selector + '.';
}

function defaultAcceptance(annotation: FrontierAnnotation) {
  return [
    'The selected UI behavior or presentation matches the annotation request.',
    'The change is scoped to source files relevant to ' + annotation.target.selector + '.',
    'Focused tests or browser evidence cover the changed behavior.'
  ];
}

function formatHint(hint: { file?: string; line?: number; column?: number; symbol?: string; component?: string; reason?: string }) {
  const loc = [hint.file, hint.line !== undefined ? String(hint.line) : undefined, hint.column !== undefined ? String(hint.column) : undefined]
    .filter(Boolean)
    .join(':');
  const symbol = hint.symbol ?? hint.component;
  return [loc || 'unknown-file', symbol ? 'symbol=' + symbol : '', hint.reason ? 'reason=' + hint.reason : '']
    .filter(Boolean)
    .join(' ');
}
