import { describe, expect, it } from 'vitest'
import { renderTemplate } from '@/services/mail/render'

describe('renderTemplate', () => {
  it('substitutes variables in the subject and body', () => {
    const out = renderTemplate(
      { subject: 'Your booth at {{event}}', body: 'Hello {{org_name}},\n\nWelcome.' },
      { event: 'SCaLE 24x', org_name: 'Debian' },
    )
    expect(out.subject).toBe('Your booth at SCaLE 24x')
    expect(out.text).toContain('Hello Debian,')
  })

  it('leaves an unknown placeholder untouched rather than printing undefined', () => {
    expect(renderTemplate({ subject: 's', body: 'Hi {{nope}}' }, {}).text).toContain('{{nope}}')
  })

  it('escapes HTML in variable values', () => {
    const out = renderTemplate(
      { subject: 's', body: 'Hi {{org_name}}' },
      { org_name: '<script>alert(1)</script>' },
    )
    expect(out.html).not.toContain('<script>')
    expect(out.html).toContain('&lt;script&gt;')
  })

  it('does not escape the variable value in the plain text part', () => {
    expect(renderTemplate({ subject: 's', body: '{{org_name}}' }, { org_name: 'A & B' }).text).toBe('A & B')
  })

  it('does not evaluate expressions', () => {
    expect(renderTemplate({ subject: 's', body: '{{ 1 + 1 }}' }, {}).text).toContain('{{ 1 + 1 }}')
  })

  it('renders blank lines as paragraph breaks in HTML', () => {
    const out = renderTemplate({ subject: 's', body: 'One\n\nTwo' }, {})
    expect(out.html).toContain('<p>One</p>')
    expect(out.html).toContain('<p>Two</p>')
  })

  it('does not double-escape ampersands the template itself contains', () => {
    const out = renderTemplate({ subject: 's', body: 'Tom & Jerry' }, {})
    expect(out.html).toContain('Tom &amp; Jerry')
    expect(out.html).not.toContain('&amp;amp;')
  })
})
