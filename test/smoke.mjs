import assert from 'node:assert';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import {
  FRONTIER_ANNOTATION_BROWSER_GLOBAL,
  createFrontierAnnotationCodexQueue,
  createFrontierAnnotationCodexTask,
  createFrontierAnnotationSubmission,
  createFrontierAnnotationContext,
  createFrontierAnnotationOverlayScript,
  decodeFrontierAnnotationsJsonl,
  encodeFrontierAnnotationsJsonl,
  installFrontierAnnotationOverlay,
  rankFrontierAnnotationSources,
  readFrontierAnnotations,
  submitFrontierAnnotationTask,
  validateFrontierAnnotationSubmission
} from '../dist/index.js';

const dom = new JSDOM(
  '<!doctype html><html><head><style>.primary.action { color: red; }</style></head><body><main><button class="primary action" data-testid="save-button" data-frontier-file="src/components/SaveButton.tsx" data-frontier-line="12" data-component="SaveButton">Save draft</button></main></body></html>',
  {
    url: 'http://example.test/editor',
    pretendToBeVisual: true,
    runScripts: 'outside-only'
  }
);
const { window } = dom;
window.prompt = () => 'Make this button clearer';
window.fetch = async (_url, init) => ({ ok: true, init });
const submitted = [];
window.document.addEventListener('frontier-annotation-submit', (event) => submitted.push(event.detail));

const script = createFrontierAnnotationOverlayScript({
  id: 'test',
  endpoint: '/__frontier/annotations',
  feature: 'editor-save',
  package: '@app/web',
  actor: 'tester'
});
window.eval(script);
assert.ok(window[FRONTIER_ANNOTATION_BROWSER_GLOBAL]);
const overlay = window.document.querySelector('[data-frontier-annotation-overlay]');
assert.strictEqual(overlay !== null, true);
const overlayRoot = overlay.shadowRoot;
assert.ok(overlayRoot);
const toggle = overlayRoot.querySelector('[data-frontier-annotation-toggle]');
assert.ok(toggle);
assert.strictEqual(toggle.getAttribute('aria-pressed'), 'false');
assert.strictEqual(overlayRoot.querySelectorAll('[data-frontier-annotation-thread]').length, 0);

const button = window.document.querySelector('[data-testid="save-button"]');
const annotation = window[FRONTIER_ANNOTATION_BROWSER_GLOBAL].annotateElement(button, 'Make this button clearer');
assert.strictEqual(annotation.kind, 'frontier.annotations.annotation');
assert.strictEqual(annotation.target.selector, '[data-testid="save-button"]');
assert.strictEqual(annotation.target.text, 'Save draft');
assert.strictEqual(annotation.sourceHints[0].file, 'src/components/SaveButton.tsx');
assert.strictEqual(annotation.sourceHints[0].line, 12);
assert.strictEqual(annotation.css[0].selector, '.primary.action');
assert.strictEqual(annotation.thread.messages.length, 1);
assert.strictEqual(annotation.thread.messages[0].body, 'Make this button clearer');
assert.strictEqual(submitted.length, 1);
assert.strictEqual(overlayRoot.querySelectorAll('[data-frontier-annotation-thread]').length, 0);

window[FRONTIER_ANNOTATION_BROWSER_GLOBAL].enableTargeting();
assert.strictEqual(toggle.getAttribute('aria-pressed'), 'true');
assert.notStrictEqual(toggle.innerHTML.includes('circle'), false);
let threadCard = overlayRoot.querySelector('[data-frontier-annotation-thread="' + annotation.id + '"]');
assert.ok(threadCard);
assert.ok(threadCard.style.left.endsWith('px'));
assert.ok(threadCard.style.top.endsWith('px'));
assert.ok(threadCard.style.maxHeight.endsWith('px'));
const threadLeft = threadCard.style.left;
const threadTop = threadCard.style.top;
const threadHeader = overlayRoot.querySelector('.frontier-annotation-thread-header');
assert.ok(threadHeader);
assert.strictEqual(threadHeader.firstElementChild?.className, 'frontier-annotation-collapse');
const composer = overlayRoot.querySelector('[data-frontier-annotation-composer="' + annotation.id + '"]');
assert.ok(composer);
const textarea = composer.querySelector('textarea');
textarea.value = 'Also make sure this routes to the save flow.';
composer.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
assert.strictEqual(annotation.thread.messages.length, 2);
assert.ok(annotation.note.includes('Also make sure this routes to the save flow.'));
assert.strictEqual(submitted.length, 2);

const collapseButton = overlayRoot.querySelector('.frontier-annotation-collapse');
collapseButton.dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true }));
assert.strictEqual(annotation.thread.collapsed, true);
threadCard = overlayRoot.querySelector('[data-frontier-annotation-thread="' + annotation.id + '"]');
assert.strictEqual(threadCard.className.includes('is-collapsed'), true);
assert.strictEqual(threadCard.style.left, threadLeft);
assert.strictEqual(threadCard.style.top, threadTop);
overlayRoot.querySelector('.frontier-annotation-collapse').dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true }));
assert.strictEqual(annotation.thread.collapsed, false);
threadCard = overlayRoot.querySelector('[data-frontier-annotation-thread="' + annotation.id + '"]');
assert.strictEqual(threadCard.style.left, threadLeft);
assert.strictEqual(threadCard.style.top, threadTop);

window[FRONTIER_ANNOTATION_BROWSER_GLOBAL].disableTargeting();
assert.strictEqual(toggle.getAttribute('aria-pressed'), 'false');
assert.strictEqual(overlayRoot.querySelectorAll('[data-frontier-annotation-thread]').length, 0);

const sources = [
  {
    file: 'src/components/SaveButton.tsx',
    text: 'export function SaveButton() { return <button data-testid="save-button">Save draft</button>; }',
    layer: 'frontend-component',
    declarations: [{ name: 'SaveButton', kind: 'function', exported: true }],
    imports: [{ specifier: '../actions/save', importedNames: ['saveDraft'], localNames: ['saveDraft'] }]
  },
  {
    file: 'src/components/DeleteButton.tsx',
    text: 'export function DeleteButton() { return <button>Delete</button>; }',
    layer: 'frontend-component',
    declarations: [{ name: 'DeleteButton', kind: 'function', exported: true }]
  },
  {
    file: 'src/routes/editor.tsx',
    text: 'import { SaveButton } from "../components/SaveButton"; export default function EditorRoute() { return <SaveButton />; }',
    layer: 'frontend-route',
    declarations: [{ name: 'EditorRoute', kind: 'function', exported: true }]
  }
];
const ranking = rankFrontierAnnotationSources(annotation, sources);
assert.strictEqual(ranking[0].file, 'src/components/SaveButton.tsx');
assert.ok(ranking[0].reasons.includes('source-hint-file'));

const context = createFrontierAnnotationContext(annotation, sources, {
  maxFiles: 2,
  maxPromptBytes: 2000,
  verification: ['npm test']
});
assert.strictEqual(context.kind, 'frontier.annotations.context');
assert.deepStrictEqual(context.sourceRefs.slice(0, 2), ['src/components/SaveButton.tsx', 'src/routes/editor.tsx']);
assert.strictEqual(context.summary.selectedSourceCount, 2);
assert.ok(context.snippets[0].text.includes('SaveButton'));

const task = createFrontierAnnotationCodexTask(annotation, context, {
  targetRefs: ['src/components/SaveButton.tsx'],
  allowedWrites: ['src/components/SaveButton.tsx'],
  verification: ['npm --prefix apps/web test'],
  acceptance: ['Save button annotation is addressed.'],
  model: 'config-default',
  reasoningEffort: 'high'
});
assert.strictEqual(task.kind, 'frontier.annotations.codex-task');
assert.ok(task.prompt.includes('Make this button clearer'));
assert.ok(task.prompt.includes('src/components/SaveButton.tsx'));
assert.deepStrictEqual(task.allowedWrites, ['src/components/SaveButton.tsx']);

const queue = createFrontierAnnotationCodexQueue([task], { id: 'queue-test' });
assert.strictEqual(queue.summary.taskCount, 1);
assert.strictEqual(queue.summary.sourceRefCount, 2);

const submission = createFrontierAnnotationSubmission({
  annotations: [annotation],
  objective: 'Fix the annotated save button',
  sourceRefs: context.sourceRefs,
  targetRefs: ['src/components/SaveButton.tsx'],
  allowedWrites: ['src/components/SaveButton.tsx'],
  acceptance: ['Save button annotation is addressed.']
});
assert.strictEqual(submission.kind, 'frontier.annotations.submission');
assert.strictEqual(validateFrontierAnnotationSubmission(submission).valid, true);
const jsonl = encodeFrontierAnnotationsJsonl([annotation, submission]);
assert.strictEqual(decodeFrontierAnnotationsJsonl(jsonl).length, 2);
const submitResult = await submitFrontierAnnotationTask({
  async submit(request) {
    return {
      kind: 'frontier.annotations.submit-result',
      version: 1,
      id: 'result-1',
      submissionId: request.id,
      accepted: true,
      taskIds: ['task-1'],
      queuedAt: 1
    };
  }
}, submission);
assert.strictEqual(submitResult.accepted, true);
assert.deepStrictEqual(submitResult.taskIds, ['task-1']);

class FakePage {
  constructor() {
    this.initScripts = [];
    this.context = vm.createContext({
      window,
      document: window.document,
      location: window.location,
      CustomEvent: window.CustomEvent,
      Element: window.Element,
      HTMLElement: window.HTMLElement,
      HTMLInputElement: window.HTMLInputElement,
      CSSStyleSheet: window.CSSStyleSheet,
      getComputedStyle: window.getComputedStyle.bind(window),
      fetch: window.fetch,
      Date,
      Number,
      String,
      Boolean,
      Object,
      Array
    });
  }

  async addInitScript(scriptInput) {
    this.initScripts.push(scriptInput);
  }

  async evaluate(pageFunction, arg) {
    this.context.__frontierArg = arg;
    if (typeof pageFunction === 'string') return vm.runInContext(pageFunction, this.context);
    return vm.runInContext('(' + pageFunction.toString() + ')(__frontierArg)', this.context);
  }
}

const page = new FakePage();
await installFrontierAnnotationOverlay(page, { submitOnCreate: false });
assert.strictEqual(page.initScripts.length, 1);
const pageAnnotations = await readFrontierAnnotations(page);
assert.ok(Array.isArray(pageAnnotations));

console.log('frontier annotations smoke passed');
