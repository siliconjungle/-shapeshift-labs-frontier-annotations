import {
  FRONTIER_ANNOTATION_BROWSER_GLOBAL,
  type FrontierAnnotation,
  type FrontierAnnotationInstallOptions,
  type FrontierAnnotationPageLike
} from './types.js';

export function createFrontierAnnotationOverlayScript(options: FrontierAnnotationInstallOptions = {}) {
  return ';(' + frontierAnnotationOverlayRuntime.toString() + ')(' + JSON.stringify(options) + ');';
}

export async function installFrontierAnnotationOverlay(
  page: FrontierAnnotationPageLike,
  options: FrontierAnnotationInstallOptions = {}
) {
  const content = createFrontierAnnotationOverlayScript(options);
  if (page.addInitScript) await page.addInitScript({ content });
  return page.evaluate(content);
}

export async function readFrontierAnnotations(page: FrontierAnnotationPageLike): Promise<FrontierAnnotation[]> {
  return page.evaluate(() => {
    const api = (globalThis as unknown as Record<string, { getAnnotations?: () => unknown }>).__FRONTIER_ANNOTATIONS__;
    return api?.getAnnotations?.() ?? [];
  }) as Promise<FrontierAnnotation[]>;
}

export async function clearFrontierAnnotations(page: FrontierAnnotationPageLike) {
  return page.evaluate(() => {
    const api = (globalThis as unknown as Record<string, { clear?: () => unknown }>).__FRONTIER_ANNOTATIONS__;
    return api?.clear?.();
  });
}

function frontierAnnotationOverlayRuntime(input: Record<string, unknown>) {
  const globalName = '__FRONTIER_ANNOTATIONS__';
  const win = window as unknown as Record<string, any>;
  const doc = document;
  const config = Object.assign({
    submitOnCreate: true,
    buttonLabel: 'Annotate',
    placeholder: 'Describe the change for Codex',
    maxTextLength: 280,
    includeCss: true,
    includeComputedStyle: true,
    maxCssRules: 12,
    zIndex: 2147483000
  }, input || {});
  const existing = win[globalName];
  if (existing && existing.configure) {
    existing.configure(config);
    return existing;
  }

  let annotations: any[] = [];
  let targetMode = false;
  let hoverElement: Element | null = null;
  let host: HTMLElement | null = null;
  let root: ShadowRoot | HTMLElement | null = null;
  let outline: HTMLElement | null = null;
  let list: HTMLElement | null = null;

  const api = {
    version: 1,
    configure(next: Record<string, unknown>) {
      Object.assign(config, next || {});
      ensureUi();
      return api;
    },
    enableTargeting,
    disableTargeting,
    toggleTargeting() {
      return targetMode ? disableTargeting() : enableTargeting();
    },
    annotateElement(element: Element, note?: string, metadata?: unknown) {
      return createAnnotation(element, note, metadata);
    },
    getAnnotations() {
      return annotations.slice();
    },
    clear() {
      annotations = [];
      renderList();
      return annotations;
    },
    destroy() {
      disableTargeting();
      host?.remove();
      outline?.remove();
      host = null;
      root = null;
      outline = null;
      list = null;
    }
  };
  win[globalName] = api;
  ensureUi();
  return api;

  function ensureUi() {
    if (host && root && outline) return;
    host = doc.createElement('div');
    host.setAttribute('data-frontier-annotation-overlay', 'true');
    host.style.position = 'fixed';
    host.style.right = '18px';
    host.style.bottom = '18px';
    host.style.zIndex = String(config.zIndex);
    root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    const style = doc.createElement('style');
    style.textContent = [
      ':host{all:initial}',
      '.frontier-annotation-shell{font:13px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#17202a}',
      '.frontier-annotation-button{border:0;border-radius:999px;background:#1a73e8;color:white;padding:10px 14px;box-shadow:0 6px 20px rgba(0,0,0,.24);cursor:pointer;font-weight:700}',
      '.frontier-annotation-button[aria-pressed="true"]{background:#b3261e}',
      '.frontier-annotation-panel{margin-top:8px;width:280px;max-height:320px;overflow:auto;background:white;border:1px solid #d4dbe7;border-radius:8px;box-shadow:0 8px 28px rgba(0,0,0,.18)}',
      '.frontier-annotation-empty{padding:10px;color:#5f6b7a}',
      '.frontier-annotation-item{padding:10px;border-top:1px solid #edf1f7}',
      '.frontier-annotation-item:first-child{border-top:0}',
      '.frontier-annotation-note{font-weight:700;margin-bottom:4px}',
      '.frontier-annotation-target{font-size:12px;color:#5f6b7a;word-break:break-word}',
      '.frontier-annotation-chip{position:fixed;z-index:' + String(Number(config.zIndex) + 1) + ';background:#fff;border:1px solid #d4dbe7;border-left:4px solid #1a73e8;border-radius:6px;box-shadow:0 4px 18px rgba(0,0,0,.18);padding:8px 10px;max-width:240px;font:12px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#17202a}'
    ].join('\n');
    const shell = doc.createElement('div');
    shell.className = 'frontier-annotation-shell';
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'frontier-annotation-button';
    button.textContent = String(config.buttonLabel || 'Annotate');
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      api.toggleTargeting();
      button.setAttribute('aria-pressed', targetMode ? 'true' : 'false');
    });
    list = doc.createElement('div');
    list.className = 'frontier-annotation-panel';
    shell.append(button, list);
    root.append(style, shell);
    doc.documentElement.appendChild(host);
    outline = doc.createElement('div');
    outline.setAttribute('data-frontier-annotation-outline', 'true');
    outline.style.cssText = [
      'position:fixed',
      'display:none',
      'pointer-events:none',
      'border:2px solid #1a73e8',
      'background:rgba(26,115,232,.10)',
      'box-shadow:0 0 0 9999px rgba(26,115,232,.04)',
      'z-index:' + String(Number(config.zIndex) - 1)
    ].join(';');
    doc.documentElement.appendChild(outline);
    renderList();
  }

  function enableTargeting() {
    if (targetMode) return true;
    targetMode = true;
    doc.addEventListener('mouseover', onHover, true);
    doc.addEventListener('mousemove', onHover, true);
    doc.addEventListener('click', onClick, true);
    doc.addEventListener('keydown', onKeyDown, true);
    return true;
  }

  function disableTargeting() {
    targetMode = false;
    hoverElement = null;
    doc.removeEventListener('mouseover', onHover, true);
    doc.removeEventListener('mousemove', onHover, true);
    doc.removeEventListener('click', onClick, true);
    doc.removeEventListener('keydown', onKeyDown, true);
    if (outline) outline.style.display = 'none';
    return false;
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') disableTargeting();
  }

  function onHover(event: Event) {
    const target = event.target;
    if (!(target instanceof Element) || isOverlayElement(target)) return;
    hoverElement = target;
    drawOutline(target);
  }

  function onClick(event: Event) {
    const target = event.target;
    if (!(target instanceof Element) || isOverlayElement(target)) return;
    event.preventDefault();
    event.stopPropagation();
    const note = typeof win.prompt === 'function'
      ? win.prompt(String(config.placeholder || 'Describe the change for Codex'), '')
      : '';
    if (note === null) return;
    createAnnotation(target, String(note || ''), { createdBy: 'targeting' });
    disableTargeting();
  }

  function createAnnotation(element: Element, note?: string, metadata?: unknown) {
    const rect = element.getBoundingClientRect();
    const annotation = {
      kind: 'frontier.annotations.annotation',
      version: 1,
      id: String(config.id || 'annotation') + '-' + Date.now().toString(36) + '-' + String(annotations.length + 1),
      note: String(note || ''),
      target: captureTarget(element),
      css: config.includeCss === false ? [] : captureCss(element),
      sourceHints: captureSourceHints(element),
      url: location.href,
      title: doc.title,
      route: config.route || location.pathname,
      feature: config.feature,
      package: config.package,
      actor: config.actor,
      createdAt: Date.now(),
      status: 'draft',
      metadata: normalizeJson(metadata || config.metadata)
    };
    annotations.push(annotation);
    renderList();
    renderChip(annotation, rect);
    if (config.submitOnCreate !== false) submit(annotation);
    return annotation;
  }

  function submit(annotation: any) {
    annotation.status = 'submitted';
    const event = new CustomEvent('frontier-annotation-submit', { detail: annotation, bubbles: true, composed: true });
    doc.dispatchEvent(event);
    const bridge = config.bridgeGlobal && win[String(config.bridgeGlobal)];
    if (typeof bridge === 'function') {
      Promise.resolve(bridge(annotation)).catch((error: unknown) => {
        annotation.status = 'error';
        annotation.metadata = Object.assign({}, annotation.metadata, { submitError: String(error) });
      });
    }
    if (config.endpoint && typeof fetch === 'function') {
      fetch(String(config.endpoint), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(annotation)
      }).catch((error) => {
        annotation.status = 'error';
        annotation.metadata = Object.assign({}, annotation.metadata, { submitError: String(error) });
      });
    }
  }

  function captureTarget(element: Element) {
    const htmlElement = element as HTMLInputElement;
    const attributes: Record<string, string> = {};
    for (const attribute of Array.from(element.attributes || [])) {
      attributes[attribute.name] = attribute.value;
    }
    const dataset = Object.assign({}, (element as HTMLElement).dataset || {});
    const rect = element.getBoundingClientRect();
    const target: any = {
      tagName: element.tagName.toLowerCase(),
      selector: stableSelector(element),
      cssPath: cssPath(element),
      xpath: xpath(element),
      id: (element as HTMLElement).id || undefined,
      className: typeof (element as HTMLElement).className === 'string' ? (element as HTMLElement).className : undefined,
      role: element.getAttribute('role') || undefined,
      testId: element.getAttribute('data-testid') || element.getAttribute('data-test-id') || undefined,
      text: clampText((element as HTMLElement).innerText || element.textContent || '', Number(config.maxTextLength || 280)),
      attributes,
      dataset,
      rect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left
      },
      ancestry: ancestry(element)
    };
    if ('value' in htmlElement && typeof htmlElement.value !== 'undefined') target.value = String(htmlElement.value);
    if ('checked' in htmlElement && typeof htmlElement.checked !== 'undefined') target.checked = Boolean(htmlElement.checked);
    if (config.includeComputedStyle !== false && typeof getComputedStyle === 'function') {
      const computed = getComputedStyle(element);
      target.computedStyle = {};
      for (const name of ['display', 'position', 'color', 'backgroundColor', 'fontSize', 'fontWeight', 'margin', 'padding', 'border', 'width', 'height']) {
        target.computedStyle[name] = computed.getPropertyValue(name.replace(/[A-Z]/g, (char) => '-' + char.toLowerCase())) || (computed as any)[name] || '';
      }
    }
    return target;
  }

  function captureCss(element: Element) {
    const rules: any[] = [];
    const max = Number(config.maxCssRules || 12);
    for (const sheet of Array.from(doc.styleSheets || [])) {
      let cssRules: CSSRuleList;
      try {
        cssRules = (sheet as CSSStyleSheet).cssRules;
      } catch {
        continue;
      }
      for (let index = 0; index < cssRules.length && rules.length < max; index++) {
        const rule = cssRules[index] as CSSStyleRule;
        if (!rule.selectorText || !rule.cssText) continue;
        try {
          if (!element.matches(rule.selectorText)) continue;
        } catch {
          continue;
        }
        rules.push({
          selector: rule.selectorText,
          cssText: rule.cssText,
          href: (sheet as CSSStyleSheet).href || undefined,
          index
        });
      }
      if (rules.length >= max) break;
    }
    return rules;
  }

  function captureSourceHints(element: Element) {
    const hints: any[] = [];
    let current: Element | null = element;
    while (current && current !== doc.documentElement) {
      const file = attr(current, ['data-frontier-file', 'data-source-file', 'data-file', 'data-src-file']);
      const source = attr(current, ['data-frontier-source', 'data-source']);
      const symbol = attr(current, ['data-frontier-symbol', 'data-source-symbol', 'data-component']);
      const component = attr(current, ['data-frontier-component', 'data-component']);
      const line = numericAttr(current, ['data-frontier-line', 'data-source-line', 'data-line']);
      const column = numericAttr(current, ['data-frontier-column', 'data-source-column', 'data-column']);
      if (file || source || symbol || component) {
        hints.push({
          file: file || source,
          line,
          column,
          symbol,
          component,
          reason: current === element ? 'selected-node-attribute' : 'ancestor-attribute',
          confidence: current === element ? 1 : 0.7
        });
      }
      const anyCurrent = current as any;
      const runtimeSource = anyCurrent.__frontierSource || anyCurrent.__source;
      if (runtimeSource && typeof runtimeSource === 'object') {
        hints.push({
          file: runtimeSource.fileName || runtimeSource.file,
          line: runtimeSource.lineNumber || runtimeSource.line,
          column: runtimeSource.columnNumber || runtimeSource.column,
          symbol: runtimeSource.name,
          reason: 'runtime-source-object',
          confidence: 0.9
        });
      }
      current = current.parentElement;
    }
    return hints.filter((hint, index, all) => {
      const key = [hint.file, hint.line, hint.column, hint.symbol, hint.component].join(':');
      return all.findIndex((item) => [item.file, item.line, item.column, item.symbol, item.component].join(':') === key) === index;
    });
  }

  function renderList() {
    if (!list) return;
    list.textContent = '';
    if (annotations.length === 0) {
      const empty = doc.createElement('div');
      empty.className = 'frontier-annotation-empty';
      empty.textContent = 'No annotations';
      list.appendChild(empty);
      return;
    }
    for (const annotation of annotations.slice().reverse()) {
      const item = doc.createElement('div');
      item.className = 'frontier-annotation-item';
      const note = doc.createElement('div');
      note.className = 'frontier-annotation-note';
      note.textContent = annotation.note || '(no note)';
      const target = doc.createElement('div');
      target.className = 'frontier-annotation-target';
      target.textContent = annotation.target.selector;
      item.append(note, target);
      list.appendChild(item);
    }
  }

  function renderChip(annotation: any, rect: DOMRect) {
    const chip = doc.createElement('div');
    chip.className = 'frontier-annotation-chip';
    chip.textContent = annotation.note || annotation.target.selector;
    chip.style.left = Math.min(Math.max(rect.right + 8, 8), win.innerWidth - 260 || rect.right + 8) + 'px';
    chip.style.top = Math.max(rect.top, 8) + 'px';
    doc.body.appendChild(chip);
  }

  function drawOutline(element: Element) {
    if (!outline) return;
    const rect = element.getBoundingClientRect();
    outline.style.display = 'block';
    outline.style.left = rect.left + 'px';
    outline.style.top = rect.top + 'px';
    outline.style.width = rect.width + 'px';
    outline.style.height = rect.height + 'px';
  }

  function isOverlayElement(element: Element) {
    if (host && (element === host || host.contains(element))) return true;
    if (outline && element === outline) return true;
    return Boolean(element.closest('[data-frontier-annotation-overlay],[data-frontier-annotation-outline]'));
  }

  function stableSelector(element: Element): string {
    const testId = element.getAttribute('data-testid') || element.getAttribute('data-test-id');
    if (testId) return '[data-testid="' + cssEscape(testId) + '"]';
    if ((element as HTMLElement).id) return '#' + cssEscape((element as HTMLElement).id);
    const role = element.getAttribute('role');
    const label = element.getAttribute('aria-label');
    if (role && label) return '[role="' + cssEscape(role) + '"][aria-label="' + cssEscape(label) + '"]';
    return cssPath(element);
  }

  function cssPath(element: Element): string {
    const parts: string[] = [];
    let current: Element | null = element;
    while (current && current.nodeType === 1 && current !== doc.documentElement) {
      let part = current.tagName.toLowerCase();
      const id = (current as HTMLElement).id;
      if (id) {
        part += '#' + cssEscape(id);
        parts.unshift(part);
        break;
      }
      const className = typeof (current as HTMLElement).className === 'string'
        ? (current as HTMLElement).className.trim().split(/\s+/).filter(Boolean).slice(0, 2)
        : [];
      if (className.length) part += '.' + className.map(cssEscape).join('.');
      const parent: Element | null = current.parentElement;
      if (parent) {
        const tagName = current.tagName;
        const siblings = Array.from(parent.children).filter((child): child is Element => child instanceof Element && child.tagName === tagName);
        if (siblings.length > 1) part += ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')';
      }
      parts.unshift(part);
      current = parent;
    }
    return parts.join(' > ');
  }

  function xpath(element: Element): string {
    const parts: string[] = [];
    let current: Element | null = element;
    while (current && current.nodeType === 1) {
      const parent: Element | null = current.parentElement;
      const tagName = current.tagName;
      const siblings = parent
        ? Array.from(parent.children).filter((child): child is Element => child instanceof Element && child.tagName === tagName)
        : [current];
      const index = siblings.indexOf(current) + 1;
      parts.unshift(current.tagName.toLowerCase() + '[' + index + ']');
      current = parent;
    }
    return '/' + parts.join('/');
  }

  function ancestry(element: Element) {
    const out: any[] = [];
    let current: Element | null = element;
    while (current && current !== doc.documentElement && out.length < 8) {
      out.push({
        tagName: current.tagName.toLowerCase(),
        selector: stableSelector(current),
        id: (current as HTMLElement).id || undefined,
        className: typeof (current as HTMLElement).className === 'string' ? (current as HTMLElement).className : undefined,
        role: current.getAttribute('role') || undefined,
        testId: current.getAttribute('data-testid') || current.getAttribute('data-test-id') || undefined
      });
      current = current.parentElement;
    }
    return out;
  }

  function attr(element: Element, names: string[]) {
    for (const name of names) {
      const value = element.getAttribute(name);
      if (value) return value;
    }
    return undefined;
  }

  function numericAttr(element: Element, names: string[]) {
    const value = attr(element, names);
    if (!value) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  function cssEscape(value: string) {
    const css = (win.CSS && typeof win.CSS.escape === 'function') ? win.CSS.escape : undefined;
    return css ? css(value) : value.replace(/["\\#.:,[\]>+~*]/g, '\\$&');
  }

  function clampText(value: string, max: number) {
    const normalized = String(value || '').replace(/\s+/g, ' ').trim();
    return normalized.length > max ? normalized.slice(0, max - 1) + '...' : normalized;
  }

  function normalizeJson(value: unknown): unknown {
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) return value.slice(0, 50).map(normalizeJson);
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 80)) out[key] = normalizeJson(item);
      return out;
    }
    return undefined;
  }
}
