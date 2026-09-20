const PLACEHOLDER = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function substitute(
  source: string,
  variables: Record<string, string>,
  transform: (value: string) => string,
): string {
  return source.replace(PLACEHOLDER, (match, name: string) => {
    const value = variables[name.toLowerCase()]
    return value === undefined ? match : transform(value)
  })
}

function toHtml(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br />')}</p>`)
    .join('\n')
}

export interface RenderedEmail {
  subject: string
  text: string
  html: string
}

export function renderTemplate(
  template: { subject: string; body: string },
  variables: Record<string, string>,
): RenderedEmail {
  const subject = substitute(template.subject, variables, (value) => value)
  const text = substitute(template.body, variables, (value) => value)
  // Escape the template first, then substitute already-escaped values, so an
  // ampersand written in the template is not escaped twice.
  const html = toHtml(substitute(escapeHtml(template.body), variables, escapeHtml))
  return { subject, text, html }
}
