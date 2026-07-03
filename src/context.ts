import {
  FRONTIER_ANNOTATION_CONTEXT_KIND,
  FRONTIER_ANNOTATION_CONTEXT_VERSION,
  type FrontierAnnotation,
  type FrontierAnnotationContext,
  type FrontierAnnotationContextOptions,
  type FrontierAnnotationSourceRanking,
  type FrontierAnnotationSourceRecordLike,
  type FrontierAnnotationSourceSnippet
} from './types.js';
import { basename, clampText, stableId, tokenize, toJsonObject, uniqueStrings } from './internal.js';

export function rankFrontierAnnotationSources(
  annotation: FrontierAnnotation,
  sources: readonly FrontierAnnotationSourceRecordLike[],
  options: FrontierAnnotationContextOptions = {}
): FrontierAnnotationSourceRanking[] {
  const tokens = annotationTokens(annotation, options);
  const directHintFiles = new Set(annotation.sourceHints.map((hint) => hint.file).filter(isString));
  const directHintBasenames = new Set([...directHintFiles].map(basename));
  const hintSymbols = new Set(annotation.sourceHints.flatMap((hint) => [hint.symbol, hint.component]).filter(isString).map((item) => item.toLowerCase()));
  const required = new Set((options.requiredFiles ?? []).map((file) => file.replace(/\\/g, '/')));
  const rankings = sources.map((source) => {
    const file = source.file.replace(/\\/g, '/');
    let score = 0;
    const reasons: string[] = [];
    const matchedTokens: string[] = [];
    if (required.has(file)) {
      score += 200;
      reasons.push('required-file');
    }
    if (directHintFiles.has(file)) {
      score += 180;
      reasons.push('source-hint-file');
    } else if (directHintBasenames.has(basename(file))) {
      score += 80;
      reasons.push('source-hint-basename');
    }
    const lowerFile = file.toLowerCase();
    const route = (options.route ?? annotation.route ?? '').toLowerCase();
    if (route && route !== '/' && lowerFile.includes(route.replace(/^\/+/, '').replace(/\/+$/, ''))) {
      score += 24;
      reasons.push('route-path');
    }
    const symbolNames = sourceSymbols(source).map((name) => name.toLowerCase());
    for (const symbol of symbolNames) {
      if (!hintSymbols.has(symbol)) continue;
      score += 64;
      reasons.push('source-hint-symbol:' + symbol);
      matchedTokens.push(symbol);
    }
    const haystack = sourceHaystack(source);
    for (const token of tokens) {
      if (!haystack.includes(token)) continue;
      score += tokenScore(token);
      matchedTokens.push(token);
    }
    if (source.layer === 'frontend-route' && annotation.route) {
      score += 8;
      reasons.push('frontend-route');
    }
    if (source.layer === 'frontend-component') {
      score += 6;
      reasons.push('frontend-component');
    }
    return {
      file,
      score,
      reasons: uniqueStrings(reasons),
      matchedTokens: uniqueStrings(matchedTokens).slice(0, 24),
      source
    };
  });
  return rankings
    .filter((ranking) => ranking.score > 0)
    .sort((left, right) => right.score - left.score || left.file.localeCompare(right.file));
}

export function createFrontierAnnotationContext(
  annotation: FrontierAnnotation,
  sources: readonly FrontierAnnotationSourceRecordLike[],
  options: FrontierAnnotationContextOptions = {}
): FrontierAnnotationContext {
  const maxFiles = Math.max(1, options.maxFiles ?? 8);
  const maxPromptBytes = Math.max(1024, options.maxPromptBytes ?? 48_000);
  const maxSnippetBytes = Math.max(256, options.maxSnippetBytes ?? 4_000);
  const ranking = rankFrontierAnnotationSources(annotation, sources, options);
  const selected = ranking.slice(0, maxFiles);
  const snippets: FrontierAnnotationSourceSnippet[] = [];
  let promptBytes = 0;
  for (const item of selected) {
    const source = item.source;
    const fullText = options.includeSourceText === false ? '' : source.text ?? '';
    const remaining = maxPromptBytes - promptBytes;
    const text = remaining > 0 && fullText ? clampText(fullText, Math.min(maxSnippetBytes, remaining)) : undefined;
    promptBytes += text ? text.length : 0;
    snippets.push({
      file: item.file,
      score: item.score,
      reasons: item.reasons,
      package: source.package,
      feature: source.feature,
      layer: source.layer,
      text,
      symbols: sourceSymbols(source).slice(0, 40),
      imports: uniqueStrings((source.imports ?? []).map((record) => record.specifier)).slice(0, 40)
    });
  }
  const sourceRefs = uniqueStrings([
    ...selected.map((item) => item.file),
    ...(options.requiredFiles ?? [])
  ]);
  return {
    kind: FRONTIER_ANNOTATION_CONTEXT_KIND,
    version: FRONTIER_ANNOTATION_CONTEXT_VERSION,
    id: stableId('annotation-context', annotation.id + ':' + sourceRefs.join('|')),
    generatedAt: Date.now(),
    annotationId: annotation.id,
    route: options.route ?? annotation.route,
    sourceRefs,
    allowedFiles: uniqueStrings([...sourceRefs, ...(options.allowedFilePatterns ?? [])]),
    snippets,
    sourceHints: [...annotation.sourceHints],
    css: [...annotation.css],
    ranking,
    summary: {
      sourceCount: sources.length,
      selectedSourceCount: snippets.length,
      cssRuleCount: annotation.css.length,
      hintCount: annotation.sourceHints.length,
      promptBytes
    },
    metadata: toJsonObject(options.metadata)
  };
}

function annotationTokens(annotation: FrontierAnnotation, options: FrontierAnnotationContextOptions) {
  const target = annotation.target;
  const values = [
    annotation.note,
    annotation.route,
    options.route,
    target.selector,
    target.cssPath,
    target.id,
    target.className,
    target.role,
    target.testId,
    target.text,
    ...Object.keys(target.attributes),
    ...Object.values(target.attributes),
    ...Object.keys(target.dataset),
    ...Object.values(target.dataset),
    ...target.ancestry.flatMap((item) => [item.selector, item.id, item.className, item.role, item.testId]),
    ...annotation.sourceHints.flatMap((hint) => [hint.file, hint.symbol, hint.component, hint.package])
  ];
  return uniqueStrings(values.flatMap((value) => tokenize(value)));
}

function sourceHaystack(source: FrontierAnnotationSourceRecordLike) {
  return [
    source.file,
    source.text,
    source.package,
    source.feature,
    source.layer,
    ...(source.tags ?? []),
    ...(source.frontierPackages ?? []),
    ...sourceSymbols(source),
    ...(source.imports ?? []).flatMap((item) => [item.specifier, ...(item.importedNames ?? []), ...(item.localNames ?? [])])
  ]
    .filter(isString)
    .join('\n')
    .toLowerCase();
}

function sourceSymbols(source: FrontierAnnotationSourceRecordLike) {
  return uniqueStrings([
    ...(source.declarations ?? []).map((item) => item.name),
    ...(source.exports ?? []).map((item) => item.name),
    ...(source.calls ?? []).map((item) => item.name)
  ]);
}

function tokenScore(token: string) {
  if (token.includes('/') || token.includes('.')) return 14;
  if (token.length >= 8) return 10;
  if (token.length >= 4) return 5;
  return 2;
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
