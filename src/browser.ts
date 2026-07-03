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
    buttonLabel: 'Annotation mode',
    placeholder: 'Message Codex about this UI',
    maxTextLength: 280,
    includeCss: true,
    includeComputedStyle: true,
    maxCssRules: 12,
    maxThreadHeight: 420,
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
  let activeAnnotationId: string | null = null;
  let host: HTMLElement | null = null;
  let root: ShadowRoot | HTMLElement | null = null;
  let outline: HTMLElement | null = null;
  let toggleButton: HTMLButtonElement | null = null;
  let threadLayer: HTMLElement | null = null;
  const annotationElements = new Map<string, Element>();

  const api = {
    version: 2,
    configure(next: Record<string, unknown>) {
      Object.assign(config, next || {});
      ensureUi();
      renderThreads();
      updateToggle();
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
    submitMessage(annotationId: string, body: string, metadata?: unknown) {
      const annotation = annotations.find((item) => item.id === annotationId);
      if (!annotation) return undefined;
      return addThreadMessage(annotation, body, metadata);
    },
    collapse(annotationId: string, collapsed = true) {
      const annotation = annotations.find((item) => item.id === annotationId);
      if (!annotation) return undefined;
      annotation.thread.collapsed = collapsed;
      renderThreads();
      return annotation;
    },
    getAnnotations() {
      return annotations.slice();
    },
    clear() {
      annotations = [];
      annotationElements.clear();
      activeAnnotationId = null;
      renderThreads();
      return annotations;
    },
    destroy() {
      disableTargeting();
      win.removeEventListener('resize', onViewportChange, true);
      win.removeEventListener('scroll', onViewportChange, true);
      host?.remove();
      outline?.remove();
      host = null;
      root = null;
      outline = null;
      toggleButton = null;
      threadLayer = null;
    }
  };
  win[globalName] = api;
  ensureUi();
  return api;

  function ensureUi() {
    if (host && root && outline && toggleButton && threadLayer) return;
    host = doc.createElement('div');
    host.setAttribute('data-frontier-annotation-overlay', 'true');
    host.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:' + String(config.zIndex),
      'pointer-events:none',
      'contain:layout style'
    ].join(';');
    root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    const style = doc.createElement('style');
    style.textContent = [
      ':host{all:initial}',
      '.frontier-annotation-root{font:13px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#e5e7eb;letter-spacing:0}',
      '.frontier-annotation-toggle{position:fixed;right:16px;bottom:16px;width:44px;height:44px;display:grid;place-items:center;border:1px solid rgba(148,163,184,.45);border-radius:999px;background:#111827;color:#f8fafc;box-shadow:0 10px 30px rgba(2,6,23,.32);cursor:pointer;pointer-events:auto;padding:0}',
      '.frontier-annotation-toggle:hover{background:#1f2937;border-color:rgba(125,211,252,.8)}',
      '.frontier-annotation-toggle[aria-pressed="true"]{background:#075985;border-color:#38bdf8;color:#ffffff}',
      '.frontier-annotation-toggle svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}',
      '.frontier-annotation-layer{position:fixed;inset:0;pointer-events:none}',
      '.frontier-annotation-thread{position:fixed;box-sizing:border-box;display:flex;flex-direction:column;overflow:hidden;background:#0f172a;border:1px solid rgba(148,163,184,.38);border-radius:8px;box-shadow:0 18px 44px rgba(2,6,23,.44);pointer-events:auto;color:#e5e7eb}',
      '.frontier-annotation-thread.is-active{border-color:#38bdf8;box-shadow:0 0 0 1px rgba(56,189,248,.45),0 18px 44px rgba(2,6,23,.44)}',
      '.frontier-annotation-thread.is-collapsed{min-height:0}',
      '.frontier-annotation-thread-header{display:grid;grid-template-columns:minmax(0,1fr) 30px;gap:8px;align-items:start;padding:10px 10px 8px;border-bottom:1px solid rgba(148,163,184,.22);background:#111827}',
      '.frontier-annotation-thread-title{min-width:0}',
      '.frontier-annotation-thread-kicker{font-size:11px;color:#93c5fd;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.frontier-annotation-thread-target{font-size:12px;color:#cbd5e1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.frontier-annotation-collapse{width:28px;height:28px;border:0;border-radius:6px;display:grid;place-items:center;background:#1f2937;color:#cbd5e1;cursor:pointer;padding:0}',
      '.frontier-annotation-collapse:hover{background:#334155;color:#ffffff}',
      '.frontier-annotation-collapse svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}',
      '.frontier-annotation-messages{display:grid;gap:8px;padding:10px;overflow:auto;overscroll-behavior:contain}',
      '.frontier-annotation-thread.is-collapsed .frontier-annotation-messages,.frontier-annotation-thread.is-collapsed .frontier-annotation-composer{display:none}',
      '.frontier-annotation-message{padding:8px 9px;border-radius:8px;background:#1e293b;color:#f8fafc;border:1px solid rgba(148,163,184,.18);word-break:break-word}',
      '.frontier-annotation-message-meta{margin-bottom:4px;font-size:11px;color:#94a3b8}',
      '.frontier-annotation-empty{padding:10px;color:#94a3b8}',
      '.frontier-annotation-composer{display:grid;grid-template-columns:minmax(0,1fr) 34px;gap:8px;padding:10px;border-top:1px solid rgba(148,163,184,.22);background:#0b1220}',
      '.frontier-annotation-input{box-sizing:border-box;width:100%;min-height:38px;max-height:96px;resize:vertical;border:1px solid rgba(148,163,184,.42);border-radius:8px;background:#020617;color:#f8fafc;padding:9px 10px;font:13px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;outline:none}',
      '.frontier-annotation-input:focus{border-color:#38bdf8;box-shadow:0 0 0 1px rgba(56,189,248,.42)}',
      '.frontier-annotation-input::placeholder{color:#64748b}',
      '.frontier-annotation-send{width:34px;height:34px;align-self:end;border:0;border-radius:8px;display:grid;place-items:center;background:#0284c7;color:#ffffff;cursor:pointer;padding:0}',
      '.frontier-annotation-send:hover{background:#0369a1}',
      '.frontier-annotation-send svg{width:17px;height:17px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}'
    ].join('\n');
    const shell = doc.createElement('div');
    shell.className = 'frontier-annotation-root';
    threadLayer = doc.createElement('div');
    threadLayer.className = 'frontier-annotation-layer';
    toggleButton = doc.createElement('button');
    toggleButton.type = 'button';
    toggleButton.className = 'frontier-annotation-toggle';
    toggleButton.setAttribute('data-frontier-annotation-toggle', 'true');
    toggleButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      api.toggleTargeting();
    });
    shell.append(threadLayer, toggleButton);
    root.append(style, shell);
    doc.documentElement.appendChild(host);
    outline = doc.createElement('div');
    outline.setAttribute('data-frontier-annotation-outline', 'true');
    outline.style.cssText = [
      'position:fixed',
      'display:none',
      'pointer-events:none',
      'border:2px solid #38bdf8',
      'background:rgba(56,189,248,.10)',
      'box-shadow:0 0 0 9999px rgba(2,6,23,.08)',
      'border-radius:4px',
      'z-index:' + String(Number(config.zIndex) - 1)
    ].join(';');
    doc.documentElement.appendChild(outline);
    win.addEventListener('resize', onViewportChange, true);
    win.addEventListener('scroll', onViewportChange, true);
    updateToggle();
    renderThreads();
  }

  function enableTargeting() {
    if (targetMode) return true;
    targetMode = true;
    doc.addEventListener('mouseover', onHover, true);
    doc.addEventListener('mousemove', onHover, true);
    doc.addEventListener('click', onClick, true);
    doc.addEventListener('keydown', onKeyDown, true);
    updateToggle();
    renderThreads();
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
    updateToggle();
    renderThreads();
    return false;
  }

  function updateToggle() {
    if (!toggleButton) return;
    toggleButton.setAttribute('aria-pressed', targetMode ? 'true' : 'false');
    toggleButton.setAttribute('aria-label', targetMode ? 'Close annotation mode' : 'Open annotation mode');
    toggleButton.title = targetMode ? 'Close annotation mode' : 'Open annotation mode';
    toggleButton.innerHTML = targetMode ? activeIcon() : closedIcon();
  }

  function onViewportChange() {
    if (targetMode) renderThreads();
    if (hoverElement) drawOutline(hoverElement);
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
    const annotation = createAnnotation(target, '', { createdBy: 'targeting' });
    activeAnnotationId = annotation.id;
    renderThreads();
    focusComposer(annotation.id);
  }

  function createAnnotation(element: Element, note?: string, metadata?: unknown) {
    const initialBody = String(note || '').trim();
    const id = String(config.id || 'annotation') + '-' + Date.now().toString(36) + '-' + String(annotations.length + 1);
    const messages = initialBody ? [createThreadMessage(id, initialBody, metadata, 'submitted')] : [];
    const annotation = {
      kind: 'frontier.annotations.annotation',
      version: 1,
      id,
      note: messages.map((message) => message.body).join('\n'),
      thread: {
        id: 'thread-' + id,
        collapsed: false,
        messages
      },
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
      status: initialBody ? 'submitted' : 'draft',
      metadata: normalizeJson(metadata || config.metadata)
    };
    annotations.push(annotation);
    annotationElements.set(annotation.id, element);
    activeAnnotationId = annotation.id;
    renderThreads();
    if (initialBody && config.submitOnCreate !== false) submit(annotation);
    return annotation;
  }

  function addThreadMessage(annotation: any, body: string, metadata?: unknown) {
    const text = String(body || '').trim();
    if (!text) return annotation;
    const message = createThreadMessage(annotation.id, text, metadata, 'submitted');
    annotation.thread.messages.push(message);
    annotation.thread.collapsed = false;
    annotation.note = annotation.thread.messages.map((item: any) => item.body).join('\n');
    annotation.status = 'submitted';
    activeAnnotationId = annotation.id;
    submit(annotation, message);
    renderThreads();
    scrollThreadToBottom(annotation.id);
    focusComposer(annotation.id);
    return annotation;
  }

  function createThreadMessage(annotationId: string, body: string, metadata?: unknown, status = 'draft') {
    return {
      id: annotationId + '-message-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
      body,
      actor: config.actor,
      createdAt: Date.now(),
      status,
      metadata: normalizeJson(metadata)
    };
  }

  function submit(annotation: any, message?: any) {
    annotation.status = 'submitted';
    const detail = message ? Object.assign({}, annotation, { submittedMessage: message }) : annotation;
    const event = new CustomEvent('frontier-annotation-submit', { detail, bubbles: true, composed: true });
    doc.dispatchEvent(event);
    const bridge = config.bridgeGlobal && win[String(config.bridgeGlobal)];
    if (typeof bridge === 'function') {
      Promise.resolve(bridge(detail)).catch((error: unknown) => markSubmitError(annotation, message, error));
    }
    if (config.endpoint && typeof fetch === 'function') {
      fetch(String(config.endpoint), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(detail)
      }).catch((error) => markSubmitError(annotation, message, error));
    }
  }

  function markSubmitError(annotation: any, message: any, error: unknown) {
    annotation.status = 'error';
    if (message) message.status = 'error';
    annotation.metadata = Object.assign({}, annotation.metadata, { submitError: String(error) });
    renderThreads();
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

  function renderThreads() {
    if (!threadLayer) return;
    threadLayer.textContent = '';
    if (!targetMode) return;
    for (const annotation of annotations) {
      const card = doc.createElement('section');
      card.className = 'frontier-annotation-thread' +
        (annotation.id === activeAnnotationId ? ' is-active' : '') +
        (annotation.thread.collapsed ? ' is-collapsed' : '');
      card.setAttribute('data-frontier-annotation-thread', annotation.id);
      applyThreadPlacement(card, annotation);

      const header = doc.createElement('div');
      header.className = 'frontier-annotation-thread-header';
      const title = doc.createElement('div');
      title.className = 'frontier-annotation-thread-title';
      const kicker = doc.createElement('div');
      kicker.className = 'frontier-annotation-thread-kicker';
      kicker.textContent = sourceHintLabel(annotation) || annotation.route || 'DOM annotation';
      const target = doc.createElement('div');
      target.className = 'frontier-annotation-thread-target';
      target.textContent = annotation.target.selector;
      title.append(kicker, target);
      const collapse = doc.createElement('button');
      collapse.type = 'button';
      collapse.className = 'frontier-annotation-collapse';
      collapse.setAttribute('aria-label', annotation.thread.collapsed ? 'Expand annotation thread' : 'Collapse annotation thread');
      collapse.innerHTML = annotation.thread.collapsed ? expandIcon() : collapseIcon();
      collapse.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        annotation.thread.collapsed = !annotation.thread.collapsed;
        activeAnnotationId = annotation.id;
        renderThreads();
      });
      header.append(title, collapse);

      const messages = doc.createElement('div');
      messages.className = 'frontier-annotation-messages';
      messages.setAttribute('data-frontier-annotation-messages', annotation.id);
      messages.style.maxHeight = Math.max(96, Math.min(220, Number(config.maxThreadHeight || 420) - 170)) + 'px';
      if (annotation.thread.messages.length === 0) {
        const empty = doc.createElement('div');
        empty.className = 'frontier-annotation-empty';
        empty.textContent = 'No messages yet';
        messages.appendChild(empty);
      } else {
        for (const message of annotation.thread.messages) {
          const item = doc.createElement('div');
          item.className = 'frontier-annotation-message';
          const meta = doc.createElement('div');
          meta.className = 'frontier-annotation-message-meta';
          meta.textContent = [message.actor || 'annotation', formatTime(message.createdAt), message.status === 'error' ? 'error' : ''].filter(Boolean).join(' · ');
          const body = doc.createElement('div');
          body.textContent = message.body;
          item.append(meta, body);
          messages.appendChild(item);
        }
      }

      const form = doc.createElement('form');
      form.className = 'frontier-annotation-composer';
      form.setAttribute('data-frontier-annotation-composer', annotation.id);
      const input = doc.createElement('textarea');
      input.className = 'frontier-annotation-input';
      input.name = 'message';
      input.rows = 2;
      input.placeholder = String(config.placeholder || 'Message Codex about this UI');
      input.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' || event.shiftKey) return;
        event.preventDefault();
        form.requestSubmit();
      });
      const send = doc.createElement('button');
      send.type = 'submit';
      send.className = 'frontier-annotation-send';
      send.setAttribute('aria-label', 'Submit annotation message');
      send.innerHTML = sendIcon();
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        event.stopPropagation();
        addThreadMessage(annotation, input.value, { createdBy: 'thread-composer' });
      });
      form.append(input, send);
      card.append(header, messages, form);
      card.addEventListener('click', () => {
        activeAnnotationId = annotation.id;
        renderThreads();
      });
      threadLayer.appendChild(card);
    }
  }

  function applyThreadPlacement(card: HTMLElement, annotation: any) {
    const margin = 12;
    const viewportWidth = Math.max(320, Number(win.innerWidth || doc.documentElement.clientWidth || 1024));
    const viewportHeight = Math.max(240, Number(win.innerHeight || doc.documentElement.clientHeight || 768));
    const width = Math.min(360, Math.max(280, viewportWidth - margin * 2));
    const maxHeight = Math.min(Number(config.maxThreadHeight || 420), Math.max(180, viewportHeight - margin * 2));
    const rect = liveRect(annotation) || annotation.target.rect || { left: viewportWidth - width - margin, right: viewportWidth - margin, top: margin };
    let left = rect.right + margin;
    if (left + width > viewportWidth - margin) left = rect.left - width - margin;
    if (!Number.isFinite(left)) left = viewportWidth - width - margin;
    left = clamp(left, margin, viewportWidth - width - margin);
    const top = clamp(rect.top || margin, margin, viewportHeight - maxHeight - margin);
    card.style.left = left + 'px';
    card.style.top = top + 'px';
    card.style.width = width + 'px';
    card.style.maxHeight = maxHeight + 'px';
  }

  function liveRect(annotation: any) {
    const element = annotationElements.get(annotation.id);
    if (!element) return undefined;
    return element.getBoundingClientRect();
  }

  function focusComposer(annotationId: string) {
    defer(() => {
      const input = root?.querySelector('[data-frontier-annotation-composer="' + cssAttributeEscape(annotationId) + '"] textarea') as HTMLTextAreaElement | null;
      input?.focus();
    });
  }

  function scrollThreadToBottom(annotationId: string) {
    defer(() => {
      const messages = root?.querySelector('[data-frontier-annotation-messages="' + cssAttributeEscape(annotationId) + '"]') as HTMLElement | null;
      if (messages) messages.scrollTop = messages.scrollHeight;
    });
  }

  function drawOutline(element: Element) {
    if (!outline) return;
    const rect = element.getBoundingClientRect();
    outline.style.display = targetMode ? 'block' : 'none';
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

  function sourceHintLabel(annotation: any) {
    const hint = annotation.sourceHints && annotation.sourceHints[0];
    if (!hint) return '';
    const loc = [hint.file, hint.line, hint.column].filter((item) => item !== undefined && item !== '').join(':');
    return loc || hint.symbol || hint.component || '';
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

  function cssAttributeEscape(value: string) {
    return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function clamp(value: number, min: number, max: number) {
    if (max < min) return min;
    return Math.min(Math.max(value, min), max);
  }

  function clampText(value: string, max: number) {
    const normalized = String(value || '').replace(/\s+/g, ' ').trim();
    return normalized.length > max ? normalized.slice(0, max - 1) + '...' : normalized;
  }

  function formatTime(value: number) {
    try {
      return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  function defer(callback: () => void) {
    const raf = typeof win.requestAnimationFrame === 'function' ? win.requestAnimationFrame : (fn: () => void) => win.setTimeout(fn, 0);
    raf(callback);
  }

  function activeIcon() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"></circle><path d="M12 3v3"></path><path d="M12 18v3"></path><path d="M3 12h3"></path><path d="M18 12h3"></path><circle cx="12" cy="12" r="1"></circle></svg>';
  }

  function closedIcon() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"></path><path d="M12 8v6"></path><path d="M9 11h6"></path></svg>';
  }

  function collapseIcon() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>';
  }

  function expandIcon() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m18 15-6-6-6 6"></path></svg>';
  }

  function sendIcon() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z"></path><path d="M22 2 11 13"></path></svg>';
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
