import { createHash } from 'node:crypto'
import { LIMITS } from '@/validation/application'

export type SniffedType = 'image/png' | 'image/jpeg' | 'image/svg+xml' | 'application/pdf'

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff])
const PDF_MAGIC = Buffer.from('%PDF-')

export function sniffContentType(bytes: Buffer): SniffedType | null {
  if (bytes.length === 0) return null
  if (bytes.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) return 'image/png'
  if (bytes.subarray(0, JPEG_MAGIC.length).equals(JPEG_MAGIC)) return 'image/jpeg'
  if (bytes.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) return 'application/pdf'

  const head = bytes.subarray(0, 1024).toString('utf8').trimStart()
  if (/^(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head)) {
    return 'image/svg+xml'
  }
  return null
}

export function sanitizeSvg(svg: string): string {
  let out = svg
  // Remove entire script and foreignObject subtrees.
  out = out.replace(/<\s*(script|foreignObject)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
  // Remove self-closing or unterminated variants of the same.
  out = out.replace(/<\s*(script|foreignObject)\b[^>]*\/?>/gi, '')
  // Remove on* event handler attributes.
  out = out.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  // Remove javascript:, data: and remote URLs from href attributes.
  out = out.replace(/\s(?:xlink:)?href\s*=\s*("|')\s*(?:javascript|data):[^"']*\1/gi, '')
  out = out.replace(/\s(?:xlink:)?href\s*=\s*("|')\s*https?:[^"']*\1/gi, '')
  // Neutralize url(...) references to remote or scripted resources.
  out = out.replace(/url\(\s*['"]?\s*(?:https?|data|javascript):[^)]*\)/gi, 'none')
  // Remove external entity declarations.
  out = out.replace(/<!ENTITY[\s\S]*?>/gi, '')
  return out
}

export interface PreparedUpload {
  filename: string
  contentType: SniffedType
  byteSize: number
  sha256: string
  data: Buffer
}

export type PrepareResult = { ok: true; value: PreparedUpload } | { ok: false; error: string }

export function prepareUpload(filename: string, bytes: Buffer): PrepareResult {
  if (bytes.length === 0) return { ok: false, error: 'Choose a logo file.' }
  if (bytes.length > LIMITS.logoBytesMax) {
    return { ok: false, error: 'That file is larger than 2 MB. Please upload a smaller logo.' }
  }

  const contentType = sniffContentType(bytes)
  if (!contentType) {
    return { ok: false, error: 'Logos must be a PNG, JPEG, SVG, or PDF file.' }
  }

  const data =
    contentType === 'image/svg+xml'
      ? Buffer.from(sanitizeSvg(bytes.toString('utf8')), 'utf8')
      : bytes

  const safeName = filename.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'logo'

  return {
    ok: true,
    value: {
      filename: safeName,
      contentType,
      byteSize: data.length,
      sha256: createHash('sha256').update(data).digest('hex'),
      data,
    },
  }
}
