import { describe, expect, it } from 'vitest'
import { csvCell, slugify, toCsv } from '@/services/export'

describe('csvCell', () => {
  it('quotes every field', () => expect(csvCell('Debian')).toBe('"Debian"'))
  it('doubles embedded quotes', () => expect(csvCell('the "best" distro')).toBe('"the ""best"" distro"'))
  it('keeps commas inside the field', () => expect(csvCell('Pasadena, CA')).toBe('"Pasadena, CA"'))
  it('renders null as empty', () => expect(csvCell(null)).toBe('""'))

  it('defuses a formula so a spreadsheet does not execute it', () => {
    expect(csvCell('=HYPERLINK("http://evil","click")')).toBe('"\'=HYPERLINK(""http://evil"",""click"")"')
  })

  it('defuses the other formula lead characters', () => {
    for (const lead of ['+', '-', '@']) {
      expect(csvCell(`${lead}cmd`)).toBe(`"'${lead}cmd"`)
    }
  })
})

describe('toCsv', () => {
  it('joins rows with CRLF', () => {
    expect(toCsv([['a', 'b'], ['c', 'd']])).toBe('"a","b"\r\n"c","d"')
  })
})

describe('slugify', () => {
  it('lowercases and hyphenates', () => expect(slugify('The Debian Project')).toBe('the-debian-project'))
  it('drops punctuation', () => expect(slugify('Free/Libre & Open!')).toBe('freelibre-open'))
  it('falls back when nothing survives', () => expect(slugify('!!!')).toBe('organization'))
  it('caps the length', () => expect(slugify('x'.repeat(200)).length).toBeLessThanOrEqual(60))
})
