export const FRONTIER_ANNOTATION_KIND = 'frontier.annotations.annotation';
export const FRONTIER_ANNOTATION_VERSION = 1;
export const FRONTIER_ANNOTATION_CONTEXT_KIND = 'frontier.annotations.context';
export const FRONTIER_ANNOTATION_CONTEXT_VERSION = 1;
export const FRONTIER_ANNOTATION_CODEX_TASK_KIND = 'frontier.annotations.codex-task';
export const FRONTIER_ANNOTATION_CODEX_TASK_VERSION = 1;
export const FRONTIER_ANNOTATION_QUEUE_KIND = 'frontier.annotations.codex-queue';
export const FRONTIER_ANNOTATION_QUEUE_VERSION = 1;
export const FRONTIER_ANNOTATION_SUBMISSION_KIND = 'frontier.annotations.submission';
export const FRONTIER_ANNOTATION_SUBMISSION_VERSION = 1;
export const FRONTIER_ANNOTATION_SUBMIT_RESULT_KIND = 'frontier.annotations.submit-result';
export const FRONTIER_ANNOTATION_SUBMIT_RESULT_VERSION = 1;
export const FRONTIER_ANNOTATION_BROWSER_GLOBAL = '__FRONTIER_ANNOTATIONS__';

export type FrontierAnnotationJsonPrimitive = null | boolean | number | string;
export type FrontierAnnotationJsonValue =
  | FrontierAnnotationJsonPrimitive
  | FrontierAnnotationJsonObject
  | FrontierAnnotationJsonArray;

export interface FrontierAnnotationJsonObject {
  [key: string]: FrontierAnnotationJsonValue;
}

export interface FrontierAnnotationJsonArray extends Array<FrontierAnnotationJsonValue> {}

export type FrontierAnnotationStatus = 'draft' | 'submitted' | 'accepted' | 'rejected' | 'error' | string;

export interface FrontierAnnotationPageLike {
  addInitScript?(script: { content: string } | string): Promise<unknown> | unknown;
  evaluate<T = unknown>(pageFunction: string | ((arg?: unknown) => T | Promise<T>), arg?: unknown): Promise<T>;
}

export interface FrontierAnnotationInstallOptions {
  id?: string;
  endpoint?: string;
  bridgeGlobal?: string;
  submitOnCreate?: boolean;
  buttonLabel?: string;
  placeholder?: string;
  feature?: string;
  package?: string;
  route?: string;
  actor?: string;
  maxTextLength?: number;
  includeCss?: boolean;
  includeComputedStyle?: boolean;
  maxCssRules?: number;
  zIndex?: number;
  metadata?: unknown;
}

export interface FrontierAnnotationRect {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface FrontierAnnotationAncestor {
  tagName: string;
  selector: string;
  id?: string;
  className?: string;
  role?: string;
  testId?: string;
}

export interface FrontierAnnotationCssRule {
  selector: string;
  cssText: string;
  href?: string;
  index?: number;
}

export interface FrontierAnnotationSourceHint {
  file?: string;
  line?: number;
  column?: number;
  symbol?: string;
  package?: string;
  component?: string;
  confidence?: number;
  reason?: string;
  metadata?: FrontierAnnotationJsonObject;
}

export interface FrontierAnnotationDomTarget {
  tagName: string;
  selector: string;
  cssPath: string;
  xpath?: string;
  id?: string;
  className?: string;
  role?: string;
  testId?: string;
  text?: string;
  value?: FrontierAnnotationJsonValue;
  checked?: boolean;
  attributes: Record<string, string>;
  dataset: Record<string, string>;
  rect: FrontierAnnotationRect;
  computedStyle?: Record<string, string>;
  ancestry: FrontierAnnotationAncestor[];
}

export interface FrontierAnnotationInput {
  id?: string;
  note: string;
  target: FrontierAnnotationDomTarget;
  css?: readonly FrontierAnnotationCssRule[];
  sourceHints?: readonly FrontierAnnotationSourceHint[];
  url?: string;
  title?: string;
  route?: string;
  feature?: string;
  package?: string;
  actor?: string;
  createdAt?: number;
  status?: FrontierAnnotationStatus;
  metadata?: unknown;
}

export interface FrontierAnnotation {
  kind: typeof FRONTIER_ANNOTATION_KIND;
  version: typeof FRONTIER_ANNOTATION_VERSION;
  id: string;
  note: string;
  target: FrontierAnnotationDomTarget;
  css: FrontierAnnotationCssRule[];
  sourceHints: FrontierAnnotationSourceHint[];
  url?: string;
  title?: string;
  route?: string;
  feature?: string;
  package?: string;
  actor?: string;
  createdAt: number;
  status: FrontierAnnotationStatus;
  metadata?: FrontierAnnotationJsonObject;
}

export interface FrontierAnnotationSourceSymbolLike {
  name?: string;
  kind?: string;
  exported?: boolean;
  range?: unknown;
}

export interface FrontierAnnotationImportLike {
  specifier?: string;
  localNames?: readonly string[];
  importedNames?: readonly string[];
}

export interface FrontierAnnotationSourceRecordLike {
  id?: string;
  file: string;
  text?: string;
  package?: string;
  feature?: string;
  owner?: string;
  layer?: string;
  tags?: readonly string[];
  imports?: readonly FrontierAnnotationImportLike[];
  exports?: readonly FrontierAnnotationSourceSymbolLike[];
  declarations?: readonly FrontierAnnotationSourceSymbolLike[];
  calls?: readonly FrontierAnnotationSourceSymbolLike[];
  frontierPackages?: readonly string[];
  metadata?: unknown;
}

export interface FrontierAnnotationSourceRanking {
  file: string;
  score: number;
  reasons: string[];
  matchedTokens: string[];
  source: FrontierAnnotationSourceRecordLike;
}

export interface FrontierAnnotationContextOptions {
  route?: string;
  maxFiles?: number;
  maxPromptBytes?: number;
  maxSnippetBytes?: number;
  includeSourceText?: boolean;
  requiredFiles?: readonly string[];
  allowedFilePatterns?: readonly string[];
  verification?: readonly string[];
  metadata?: unknown;
}

export interface FrontierAnnotationSourceSnippet {
  file: string;
  score: number;
  reasons: string[];
  package?: string;
  feature?: string;
  layer?: string;
  text?: string;
  symbols: string[];
  imports: string[];
}

export interface FrontierAnnotationContext {
  kind: typeof FRONTIER_ANNOTATION_CONTEXT_KIND;
  version: typeof FRONTIER_ANNOTATION_CONTEXT_VERSION;
  id: string;
  generatedAt: number;
  annotationId: string;
  route?: string;
  sourceRefs: string[];
  allowedFiles: string[];
  snippets: FrontierAnnotationSourceSnippet[];
  sourceHints: FrontierAnnotationSourceHint[];
  css: FrontierAnnotationCssRule[];
  ranking: FrontierAnnotationSourceRanking[];
  summary: {
    sourceCount: number;
    selectedSourceCount: number;
    cssRuleCount: number;
    hintCount: number;
    promptBytes: number;
  };
  metadata?: FrontierAnnotationJsonObject;
}

export interface FrontierAnnotationCodexTaskOptions {
  id?: string;
  title?: string;
  lane?: string;
  status?: string;
  objective?: string;
  targetRefs?: readonly string[];
  allowedWrites?: readonly string[];
  verification?: readonly string[];
  acceptance?: readonly string[];
  model?: string;
  reasoningEffort?: string;
  package?: string;
  feature?: string;
  includeAnnotationJson?: boolean;
  metadata?: unknown;
}

export interface FrontierAnnotationCodexTask {
  kind: typeof FRONTIER_ANNOTATION_CODEX_TASK_KIND;
  version: typeof FRONTIER_ANNOTATION_CODEX_TASK_VERSION;
  id: string;
  title: string;
  lane: string;
  status: string;
  workKind: string;
  objective: string;
  sourceRefs: string[];
  targetRefs: string[];
  ownedFiles: string[];
  allowedWrites: string[];
  verification: string[];
  acceptance: string[];
  prompt: string;
  model?: string;
  reasoningEffort?: string;
  package?: string;
  feature?: string;
  metadata?: FrontierAnnotationJsonObject;
}

export interface FrontierAnnotationCodexQueue {
  kind: typeof FRONTIER_ANNOTATION_QUEUE_KIND;
  version: typeof FRONTIER_ANNOTATION_QUEUE_VERSION;
  id: string;
  items: FrontierAnnotationCodexTask[];
  summary: {
    taskCount: number;
    sourceRefCount: number;
    targetRefCount: number;
  };
}

export interface FrontierAnnotationEvidenceRef {
  id?: string;
  kind: string;
  file?: string;
  url?: string;
  selector?: string;
  sourcePackage?: string;
  summary?: string;
  metadata?: FrontierAnnotationJsonObject;
}

export interface FrontierAnnotationSubmissionInput {
  id?: string;
  annotations: readonly (FrontierAnnotation | FrontierAnnotationInput)[];
  objective?: string;
  lane?: string;
  compute?: string;
  sourceRefs?: readonly string[];
  targetRefs?: readonly string[];
  allowedWrites?: readonly string[];
  acceptance?: readonly string[];
  verification?: readonly string[];
  evidenceRefs?: readonly FrontierAnnotationEvidenceRef[];
  package?: string;
  feature?: string;
  actor?: string;
  createdAt?: number;
  metadata?: unknown;
}

export interface FrontierAnnotationSubmission {
  kind: typeof FRONTIER_ANNOTATION_SUBMISSION_KIND;
  version: typeof FRONTIER_ANNOTATION_SUBMISSION_VERSION;
  id: string;
  annotations: FrontierAnnotation[];
  objective: string;
  lane: string;
  compute?: string;
  sourceRefs: string[];
  targetRefs: string[];
  allowedWrites: string[];
  acceptance: string[];
  verification: string[];
  evidenceRefs: FrontierAnnotationEvidenceRef[];
  package?: string;
  feature?: string;
  actor?: string;
  createdAt: number;
  metadata?: FrontierAnnotationJsonObject;
}

export interface FrontierAnnotationValidationError {
  path: string;
  code: string;
  message: string;
}

export interface FrontierAnnotationValidationResult {
  valid: boolean;
  errors: FrontierAnnotationValidationError[];
}

export interface FrontierAnnotationSubmitResult {
  kind: typeof FRONTIER_ANNOTATION_SUBMIT_RESULT_KIND;
  version: typeof FRONTIER_ANNOTATION_SUBMIT_RESULT_VERSION;
  id: string;
  submissionId: string;
  accepted: boolean;
  taskIds: string[];
  queuedAt?: number;
  error?: string;
  metadata?: FrontierAnnotationJsonObject;
}

export interface FrontierAnnotationSubmitter {
  submit(submission: FrontierAnnotationSubmission): FrontierAnnotationSubmitResult | Promise<FrontierAnnotationSubmitResult>;
}
