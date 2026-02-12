// Scoped CSS: Extract styles and add scope hash to selectors

export interface ScopedCSSResult {
  css: string;
  scopeAttr: string;
}

// Generate a short hash from a string
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return 'px' + Math.abs(hash).toString(36).slice(0, 6);
}

// Add scope attribute selector to all CSS rules
export function scopeCSS(css: string, componentName: string): ScopedCSSResult {
  const scopeAttr = `data-${hashString(componentName)}`;

  // Simple CSS scoping: add [data-hash] after each selector
  const scopedCSS = css.replace(
    /([^{}@]+)(\{[^}]*\})/g,
    (match, selectors: string, block: string) => {
      const scopedSelectors = selectors
        .split(',')
        .map((sel: string) => {
          sel = sel.trim();
          if (!sel || sel.startsWith('@') || sel === ':root' || sel === 'html' || sel === 'body') {
            return sel;
          }
          // Add scope attribute to each selector part
          // :host maps to the component element itself
          if (sel === ':host') {
            return `[${scopeAttr}]`;
          }
          return `[${scopeAttr}] ${sel}`;
        })
        .join(', ');
      return `${scopedSelectors}${block}`;
    }
  );

  return { css: scopedCSS, scopeAttr };
}

// Extract <style> content from JSX/HTML template
export function extractStyleFromTemplate(templateHTML: string): {
  html: string;
  style: string | null;
} {
  const styleMatch = templateHTML.match(/<style>([\s\S]*?)<\/style>/);
  if (!styleMatch) {
    return { html: templateHTML, style: null };
  }

  const style = styleMatch[1];
  const html = templateHTML.replace(/<style>[\s\S]*?<\/style>/, '');
  return { html, style };
}
