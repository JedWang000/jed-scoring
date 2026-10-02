import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const projectFile = (relativePath: string) => resolve(process.cwd(), relativePath);
const readSource = (relativePath: string) => {
  const path = projectFile(relativePath);
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
};

const exactTokens = [
  '--surface-canvas: #0b0b0a;',
  '--surface-page: #10100e;',
  '--surface-shell: #13120f;',
  '--surface-zone: #191712;',
  '--surface-raised: #1e1b15;',
  '--surface-control: #0f0e0c;',
  '--surface-bronze-soft: rgb(216 173 112 / 8%);',
  '--text-primary: #f4efe6;',
  '--text-secondary: #bcb5aa;',
  '--text-tertiary: #8f887d;',
  '--accent-bronze: #d8ad70;',
  '--accent-bronze-bright: #f0cc94;',
  '--accent-ink: #21170d;',
  '--state-success: #9fcfa8;',
  '--radius-detail: 6px;',
  '--radius-control: 8px;',
  '--radius-module: 12px;',
  '--radius-shell: 14px;',
  '--space-2xs: 4px;',
  '--space-xs: 8px;',
  '--space-sm: 12px;',
  '--space-md: 16px;',
  '--space-lg: 24px;',
  '--space-xl: 32px;',
  '--space-2xl: 48px;',
  '--type-caption: .75rem;',
  '--type-secondary: .875rem;',
  '--type-body: 1rem;',
  '--type-subheading: 1.125rem;',
  '--type-title: 1.3125rem;',
  '--shadow-shell: 0 12px 28px rgb(0 0 0 / 46%);',
  '--motion-fast: 150ms;',
  '--motion-standard: 220ms;'
] as const;

const localizedLeafComponents = [
  'src/ui/App.tsx',
  'src/ui/components/VideoImporter.tsx',
  'src/ui/components/SyncStatus.tsx',
  'src/ui/components/StudioConnectionCard.tsx',
  'src/ui/components/SilentReferenceCard.tsx',
  'src/ui/components/LocalVideoViewer.tsx',
  'src/ui/components/BindingPicker.tsx'
] as const;

const displayLiteralAllowlist = new Set([
  '1',
  '2',
  '3',
  '+',
  '−',
  'MP4',
  'WebM',
  'MOV',
  'WAV',
  'MB',
  's',
  '×',
  '·',
  'Suno',
  'Suno Studio'
]);

const diagnosticLiteralAllowlist = new Set([
  'No active Suno Studio tab is available.',
  'Active browser tab could not be queried.',
  'The Studio debugging target is already in use.',
  'Connected to Studio; waiting for project state.',
  'Studio transport has not been observed.',
  'File drag payload is unavailable.',
  'File drag payload was rejected.'
]);

const accessibilityCopyAttributes = new Set(['aria-label', 'title', 'placeholder', 'alt']);
const technicalComparisonLiteralAllowlist = new Set(['preparation', 'ready']);

function normalizedLiteral(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function isLongDisplayCandidate(value: string): boolean {
  return /[\u3400-\u9fff]/u.test(value)
    || (value.length >= 20 && /\s/u.test(value) && /[A-Za-z]/u.test(value));
}

function containingJsxAttribute(node: ts.Node): ts.JsxAttribute | undefined {
  let current: ts.Node | undefined = node.parent;
  while (current && !ts.isJsxElement(current) && !ts.isJsxSelfClosingElement(current)) {
    if (ts.isJsxAttribute(current)) return current;
    current = current.parent;
  }
  return undefined;
}

function containingJsxExpression(node: ts.Node): ts.JsxExpression | undefined {
  let current: ts.Node | undefined = node.parent;
  while (current && !ts.isJsxElement(current) && !ts.isJsxSelfClosingElement(current)) {
    if (ts.isJsxExpression(current)) return current;
    current = current.parent;
  }
  return undefined;
}

function isInsideTranslationCall(node: ts.Node, boundary: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current && current !== boundary) {
    if (
      ts.isCallExpression(current)
      && ts.isIdentifier(current.expression)
      && current.expression.text === 't'
    ) return true;
    current = current.parent;
  }
  return false;
}

function hardCodedDisplayLiteralsFromSource(relativePath: string, source: string): string[] {
  const sourceFile = ts.createSourceFile(
    relativePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const violations: string[] = [];

  const inspect = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      const value = normalizedLiteral(node.getText(sourceFile));
      if (value && !displayLiteralAllowlist.has(value)) violations.push(value);
    }

    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const value = normalizedLiteral(node.text);
      const parent = node.parent;
      const jsxAttribute = containingJsxAttribute(node);
      const jsxExpression = containingJsxExpression(node);

      if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) return;
      if (ts.isPropertyAssignment(parent) && parent.name === node) return;
      if (jsxExpression && isInsideTranslationCall(node, jsxExpression)) return;
      if (jsxAttribute) {
        const attributeName = jsxAttribute.name.getText(sourceFile);
        if (
          accessibilityCopyAttributes.has(attributeName)
          && value
          && !displayLiteralAllowlist.has(value)
        ) violations.push(`${attributeName}=${value}`);
        return;
      }
      if (jsxExpression) {
        const isAllowedTechnicalComparison = ts.isBinaryExpression(parent)
          && technicalComparisonLiteralAllowlist.has(value);
        if (value && !isAllowedTechnicalComparison && !displayLiteralAllowlist.has(value)) {
          violations.push(value);
        }
        return;
      }
      if (
        value
        && isLongDisplayCandidate(value)
        && !diagnosticLiteralAllowlist.has(value)
        && !displayLiteralAllowlist.has(value)
      ) violations.push(value);
    }

    ts.forEachChild(node, inspect);
  };

  inspect(sourceFile);
  return [...new Set(violations)].sort();
}

function hardCodedDisplayLiterals(relativePath: string): string[] {
  return hardCodedDisplayLiteralsFromSource(relativePath, readSource(relativePath));
}

describe('Cinema Bronze token contract', () => {
  it('defines the approved surfaces, type scale, spacing and radius vocabulary', () => {
    const tokens = readSource('src/ui/tokens.css');

    expect(tokens).not.toBe('');
    for (const token of exactTokens) expect(tokens).toContain(token);
  });

  it('uses exact native locale stacks, line heights and numeric typography', () => {
    const tokens = readSource('src/ui/tokens.css');

    expect(tokens).toMatch(/\[lang=['"]zh-CN['"]\][^{]*\{[^}]*"Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC",\s*"Noto Sans CJK SC", "Noto Sans SC", system-ui, sans-serif;[^}]*line-height:\s*1\.62;/s);
    expect(tokens).toMatch(/\[lang=['"]zh-TW['"]\][^{]*\{[^}]*"Microsoft JhengHei UI", "Microsoft JhengHei", "PingFang TC",\s*"Noto Sans CJK TC", "Noto Sans TC", system-ui, sans-serif;[^}]*line-height:\s*1\.62;/s);
    expect(tokens).toMatch(/\[lang=['"]en['"]\][^{]*\{[^}]*"Segoe UI Variable Text", "Segoe UI", -apple-system,\s*BlinkMacSystemFont, "Helvetica Neue", Arial, system-ui, sans-serif;[^}]*line-height:\s*1\.55;/s);
    expect(tokens).toMatch(/\.numeric\s*\{[^}]*ui-monospace, "Cascadia Mono", "SFMono-Regular", Consolas,\s*"Liberation Mono", monospace;[^}]*font-variant-numeric:\s*tabular-nums lining-nums;[^}]*letter-spacing:\s*0;[^}]*white-space:\s*nowrap;/s);
  });

  it('rejects pill radii, gradients, remote fonts and unapproved font weights', () => {
    const css = [readSource('src/ui/tokens.css'), readSource('src/ui/styles.css')].join('\n');
    const fontWeights = [...css.matchAll(/font-weight:\s*(\d+)/g)].map((match) => Number(match[1]));

    expect(css).not.toContain('999px');
    expect(css).not.toMatch(/linear-gradient/i);
    expect(css).not.toMatch(/@font-face|@import\s+url|url\(\s*['"]?https?:/i);
    expect(new Set(fontWeights).size).toBeLessThanOrEqual(3);
    expect(fontWeights.every((weight) => [400, 600, 700].includes(weight))).toBe(true);
  });
});

describe('continuous shell CSS contract', () => {
  it('imports tokens first and gives the outer shell the sole shadow', () => {
    const styles = readSource('src/ui/styles.css');
    const shadowDeclarations = styles.match(/box-shadow\s*:/g) ?? [];

    expect(styles.trimStart().startsWith("@import './tokens.css';")).toBe(true);
    expect(styles).toMatch(/\.app-shell\s*\{[^}]*border-radius:\s*var\(--radius-shell\);[^}]*box-shadow:\s*var\(--shadow-shell\);/s);
    expect(shadowDeclarations).toHaveLength(1);
  });

  it('defines adjacent semantic zones and accessible interaction states', () => {
    const styles = readSource('src/ui/styles.css');

    for (const selector of [
      '.panel-header',
      '.video-stage',
      '.readiness-zone',
      '.work-zone',
      '.action-zone',
      '.developer-footer'
    ]) expect(styles).toContain(selector);
    expect(styles).toMatch(/min-height:\s*44px/);
    expect(styles).toMatch(/:hover/);
    expect(styles).toMatch(/:focus-visible/);
    expect(styles).toMatch(/:active/);
    expect(styles).toMatch(/:disabled/);
    expect(styles).toMatch(/outline:\s*2px solid var\(--accent-bronze-bright\)/);
    expect(styles).toMatch(/outline-offset:\s*[2-9]px/);
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('keeps warning and error states semantically distinct from the bronze accent', () => {
    const tokens = readSource('src/ui/tokens.css');
    const styles = readSource('src/ui/styles.css');
    const semanticWarningRule = styles.match(
      /\.status-warning,\s*\.status-adapter-unavailable,\s*\.inline-error\s*\{[^}]*\}/s
    )?.[0] ?? '';

    expect(tokens).toMatch(/--state-warning:\s*#[0-9a-f]{6};/i);
    expect(semanticWarningRule).toContain('color: var(--state-warning);');
    expect(semanticWarningRule).not.toMatch(/--accent-bronze(?:-bright)?/);
  });

  it('transfers hidden file-input focus to the visible picker label', () => {
    const importer = readSource('src/ui/components/VideoImporter.tsx');
    const styles = readSource('src/ui/styles.css');

    expect(importer).toMatch(/<label className="primary-button" htmlFor="video-file">/);
    expect(importer).toMatch(/id="video-file"\s+className="visually-hidden"\s+type="file"/s);
    expect(styles).toMatch(
      /\.drop-zone:focus-within\s+\.primary-button\s*\{[^}]*outline:\s*2px solid var\(--accent-bronze-bright\);[^}]*outline-offset:\s*[2-9]px;/s
    );
  });

  it('contains shell paint with edge radii without clipping focus overflow', () => {
    const styles = readSource('src/ui/styles.css');
    const appShellRule = styles.match(/\.app-shell\s*\{[^}]*\}/s)?.[0] ?? '';

    expect(appShellRule).not.toMatch(/overflow:\s*(?:hidden|clip)/);
    expect(styles).toMatch(
      /\.app-shell\s*>\s*:first-child,\s*\.app-shell\s*>\s*\.settings-scroll:first-child\s*>\s*:first-child\s*\{[^}]*border-radius:\s*var\(--radius-shell\) var\(--radius-shell\) 0 0;/s
    );
    expect(styles).toMatch(
      /\.app-shell\s*>\s*:last-child,\s*\.app-shell\s*>\s*\.settings-scroll:last-child\s*>\s*:last-child\s*\{[^}]*border-radius:\s*0 0 var\(--radius-shell\) var\(--radius-shell\);/s
    );
    expect(styles).toMatch(
      /\.app-shell\s*>\s*:only-child\s*\{[^}]*border-radius:\s*var\(--radius-shell\);/s
    );
  });
});

describe('responsive and accessible side-panel contract', () => {
  it('uses structural narrow-width rules without fluid product type or mid-token breaking', () => {
    const styles = readSource('src/ui/styles.css');
    const tokens = readSource('src/ui/tokens.css');
    const css = `${tokens}\n${styles}`;
    const anywhereRules = styles.match(/[^{}]+\{[^{}]*overflow-wrap:\s*anywhere;[^{}]*\}/g) ?? [];
    const narrowBreakpointIndex = styles.indexOf('@media (max-width: 359px)');
    const singleColumnMappingIndex = styles.indexOf('.mapping-grid { grid-template-columns: 1fr; }');
    const reducedMotionIndex = styles.indexOf('@media (prefers-reduced-motion: reduce)');

    expect(styles).not.toMatch(/body\s*\{[^}]*min-width:\s*320px/s);
    expect(css).not.toMatch(/font-size:\s*clamp\(/i);
    expect(narrowBreakpointIndex).toBeGreaterThanOrEqual(0);
    expect(singleColumnMappingIndex).toBeGreaterThan(narrowBreakpointIndex);
    expect(singleColumnMappingIndex).toBeLessThan(reducedMotionIndex);
    expect(anywhereRules.length).toBeGreaterThan(0);
    expect(anywhereRules.join('\n')).not.toMatch(/\.numeric|\.file-summary\s+strong|\.silent-reference-file\s+strong/);
    expect(styles).not.toMatch(/(?:\.numeric|\.file-summary\s+strong|\.silent-reference-file\s+strong)[^{]*\{[^}]*word-break:\s*break-all/s);
  });

  it('forces reduced-motion duration and iteration overrides while keeping controls functional', () => {
    const styles = readSource('src/ui/styles.css');
    const reducedMotion = styles.match(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([^]*)\}\s*$/
    )?.[1] ?? '';

    expect(reducedMotion).toMatch(/scroll-behavior:\s*auto\s*!important;/);
    expect(reducedMotion).toMatch(/transition-duration:\s*0s\s*!important;/);
    expect(reducedMotion).toMatch(/animation-duration:\s*0s\s*!important;/);
    expect(reducedMotion).toMatch(/animation-iteration-count:\s*1\s*!important;/);
    expect(reducedMotion).not.toMatch(/display:\s*none|pointer-events:\s*none/);
  });

  it('keeps normal status polite, alerts assertive, and Studio time outside live regions', () => {
    const status = readSource('src/ui/components/SyncStatus.tsx');
    const videoStage = readSource('src/ui/components/VideoStage.tsx');
    const statusBanners = status.match(/<div\s+className=(?:"status-banner[^"}]*"|\{`status-banner[^`]*`\})[^>]*>/g) ?? [];
    const alertBanners = statusBanners.filter((banner) => banner.includes('role="alert"'));
    const normalStatus = statusBanners.find((banner) => banner.includes('role="status"')) ?? '';

    expect(statusBanners).toHaveLength(4);
    expect(alertBanners).toHaveLength(3);
    expect(alertBanners.every((banner) => !banner.includes('aria-live'))).toBe(true);
    expect(normalStatus).toContain('aria-live="polite"');
    expect(videoStage).not.toMatch(/studio-time-summary[^>]*aria-live|aria-live[^>]*studio-time-summary/);
  });

  it('passes optional developer destinations through App without changing the shipped brand defaults', () => {
    const app = readSource('src/ui/App.tsx');
    const fixture = readSource('tests/fixtures/sidepanel/bridge-ready.tsx');
    const brand = readSource('src/ui/brand.ts');

    expect(app).toMatch(/readonly developerContactUrl\?: string;/);
    expect(app).toMatch(/readonly developerHomepageUrl\?: string;/);
    expect(app).toMatch(/<DeveloperFooter\s+contactUrl=\{developerContactUrl\}\s+homepageUrl=\{developerHomepageUrl\}\s*\/>/s);
    expect(fixture).toContain('developerContactUrl="https://example.com/jed/contact"');
    expect(fixture).toContain('developerHomepageUrl="https://example.com/jed"');
    expect(brand).toContain('import.meta.env.VITE_JED_CONTACT_URL');
    expect(brand).toContain('import.meta.env.VITE_JED_HOMEPAGE_URL');
  });

  it('keeps localized Offset values visible and gives every adjustment an explicit full label', () => {
    const offset = readSource('src/ui/components/OffsetControl.tsx');

    expect(offset).toMatch(/aria-label=\{t\('offset\.decrease',\s*\{\s*amount:\s*label\s*\}\)\}/);
    expect(offset).toMatch(/aria-label=\{t\('offset\.increase',\s*\{\s*amount:\s*label\s*\}\)\}/);
    expect(offset).toMatch(/<span className="numeric">\{label\}<\/span>/);
    expect(offset).toContain('onOffsetChange(offsetMs - adjustment.value)');
    expect(offset).toContain('onOffsetChange(offsetMs + adjustment.value)');
  });

  it('keeps the semantic regions in natural focus order without positive tabindex values', () => {
    const app = readSource('src/ui/App.tsx');
    const renderedShell = app.slice(app.lastIndexOf('return ('));
    const orderedRegions = [
      '<BrandHeader',
      '<VideoStage',
      '<ReadinessZone',
      '<TimeMapping',
      '<OffsetControl',
      '<ActionZone',
      '<DeveloperFooter'
    ];
    const positions = orderedRegions.map((region) => renderedShell.indexOf(region));
    const focusSources = [
      app,
      readSource('src/ui/components/BrandHeader.tsx'),
      readSource('src/ui/components/LocalVideoViewer.tsx'),
      readSource('src/ui/components/SyncStatus.tsx'),
      readSource('src/ui/components/OffsetControl.tsx'),
      readSource('src/ui/components/ActionZone.tsx'),
      readSource('src/ui/components/DeveloperFooter.tsx')
    ].join('\n');

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    expect(focusSources).not.toMatch(/tabIndex\s*=\s*(?:\{\s*)?[1-9]/);
  });
});

describe('localized leaf copy contract', () => {
  it('rejects short English copy rendered from JSX expressions', () => {
    const source = `
      export function AudioToggle({ muted }: { muted: boolean }) {
        return <button>{muted ? 'Unmute' : 'Mute'}</button>;
      }
    `;

    expect(hardCodedDisplayLiteralsFromSource('synthetic-audio-toggle.tsx', source)).toEqual([
      'Mute',
      'Unmute'
    ]);
  });

  it('rejects unregistered long JSX and accessibility display literals', () => {
    const violations = localizedLeafComponents.flatMap((relativePath) => (
      hardCodedDisplayLiterals(relativePath).map((literal) => `${relativePath}: ${literal}`)
    ));

    expect(violations).toEqual([]);
  });
});
