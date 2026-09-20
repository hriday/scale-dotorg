import { describe, expect, it } from 'vitest'
import { prepareUpload, sanitizeSvg, sniffContentType } from '@/services/uploads'

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)])
const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(20)])
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>')

describe('sniffContentType', () => {
  it('detects PNG', () => expect(sniffContentType(png)).toBe('image/png'))
  it('detects JPEG', () => expect(sniffContentType(jpeg)).toBe('image/jpeg'))
  it('detects PDF', () => expect(sniffContentType(pdf)).toBe('application/pdf'))
  it('detects SVG', () => expect(sniffContentType(svg)).toBe('image/svg+xml'))

  it('returns null for an unrecognized type', () => {
    expect(sniffContentType(Buffer.from('MZ\x90\x00 not a logo'))).toBeNull()
  })

  it('is not fooled by a .png filename on a Windows executable', () => {
    expect(sniffContentType(Buffer.from([0x4d, 0x5a, 0x90, 0x00]))).toBeNull()
  })
})

describe('sanitizeSvg', () => {
  it('strips script elements', () => {
    const out = sanitizeSvg('<svg><script>alert(1)</script><rect/></svg>')
    expect(out).not.toContain('script')
    expect(out).toContain('<rect/>')
  })

  it('strips event handler attributes', () => {
    expect(sanitizeSvg('<svg><rect onload="alert(1)"/></svg>')).not.toContain('onload')
  })

  it('strips external references', () => {
    expect(sanitizeSvg('<svg><image href="https://evil.example/x.png"/></svg>')).not.toContain('evil.example')
  })

  it('strips javascript: URLs', () => {
    expect(sanitizeSvg('<svg><a href="javascript:alert(1)"/></svg>')).not.toContain('javascript:')
  })

  it('leaves benign markup intact', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10v10H0z" fill="#1d71f0"/></svg>'
    expect(sanitizeSvg(input)).toContain('fill="#1d71f0"')
  })
})

describe('prepareUpload', () => {
  it('accepts a PNG and hashes it', () => {
    const result = prepareUpload('logo.png', png)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.contentType).toBe('image/png')
      expect(result.value.sha256).toMatch(/^[0-9a-f]{64}$/)
      expect(result.value.byteSize).toBe(png.length)
    }
  })

  it('rejects an empty file', () => {
    expect(prepareUpload('logo.png', Buffer.alloc(0))).toEqual({ ok: false, error: 'Choose a logo file.' })
  })

  it('rejects a file over 2 MB', () => {
    expect(prepareUpload('logo.png', Buffer.concat([png, Buffer.alloc(2_097_153)])).ok).toBe(false)
  })

  it('rejects an unsupported type', () => {
    expect(prepareUpload('logo.exe', Buffer.from([0x4d, 0x5a, 0x90, 0x00])).ok).toBe(false)
  })

  it('sanitizes SVG content in place', () => {
    const result = prepareUpload('logo.svg', Buffer.from('<svg><script>alert(1)</script></svg>'))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.data.toString()).not.toContain('script')
  })
})
