import {
  createFrontierAnnotationCodexQueue,
  createFrontierAnnotationCodexTask,
  createFrontierAnnotationContext,
  createFrontierAnnotationOverlayScript,
  createFrontierAnnotationSubmission,
  decodeFrontierAnnotationsJsonl,
  encodeFrontierAnnotationsJsonl,
  installFrontierAnnotationOverlay,
  readFrontierAnnotations,
  submitFrontierAnnotationTask,
  validateFrontierAnnotationSubmission,
  type FrontierAnnotation,
  type FrontierAnnotationCodexTask,
  type FrontierAnnotationContext,
  type FrontierAnnotationInstallOptions,
  type FrontierAnnotationPageLike,
  type FrontierAnnotationSourceRecordLike,
  type FrontierAnnotationThread
} from '../dist/index.js';

declare const page: FrontierAnnotationPageLike;

const installOptions: FrontierAnnotationInstallOptions = {
  endpoint: '/__frontier/annotations',
  bridgeGlobal: '__submitAnnotation',
  feature: 'editor',
  package: '@app/web',
  submitOnCreate: true
};

const script: string = createFrontierAnnotationOverlayScript(installOptions);
await installFrontierAnnotationOverlay(page, installOptions);
const annotations: FrontierAnnotation[] = await readFrontierAnnotations(page);
const thread: FrontierAnnotationThread | undefined = annotations[0]?.thread;

const sources: FrontierAnnotationSourceRecordLike[] = [
  {
    file: 'src/components/Button.tsx',
    text: 'export function Button() { return null; }',
    declarations: [{ name: 'Button' }],
    imports: [{ specifier: './theme' }],
    layer: 'frontend-component'
  }
];

const context: FrontierAnnotationContext = createFrontierAnnotationContext(annotations[0], sources, {
  maxFiles: 1,
  requiredFiles: ['src/components/Button.tsx']
});
const task: FrontierAnnotationCodexTask = createFrontierAnnotationCodexTask(annotations[0], context, {
  targetRefs: ['src/components/Button.tsx'],
  allowedWrites: ['src/components/Button.tsx'],
  acceptance: ['The annotated button is fixed.']
});
const submission = createFrontierAnnotationSubmission({
  annotations,
  sourceRefs: context.sourceRefs,
  targetRefs: task.targetRefs,
  allowedWrites: task.allowedWrites,
  acceptance: task.acceptance
});
const validation = validateFrontierAnnotationSubmission(submission);
const jsonl = encodeFrontierAnnotationsJsonl([annotations[0], submission]);
const decoded = decodeFrontierAnnotationsJsonl(jsonl);
const submitResult = await submitFrontierAnnotationTask({
  submit(request) {
    return {
      kind: 'frontier.annotations.submit-result',
      version: 1,
      id: 'result',
      submissionId: request.id,
      accepted: true,
      taskIds: [task.id]
    };
  }
}, submission);
const queue = createFrontierAnnotationCodexQueue([task]);

void script;
void validation;
void decoded;
void submitResult;
void queue;
void thread;
