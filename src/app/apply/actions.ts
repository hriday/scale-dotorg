'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { hit } from '@/lib/ratelimit'
import { loadSettings } from '@/lib/settings'
import { windowState } from '@/domain/settings'
import { createApplication } from '@/services/applications'
import { prepareUpload, type PreparedUpload } from '@/services/uploads'
import { applicationInputSchema } from '@/validation/application'

export interface FormState {
  errors: Record<string, string>
  message?: string
}

export async function submitApplication(_prev: FormState, formData: FormData): Promise<FormState> {
  const settings = await loadSettings()
  if (windowState(settings, new Date()) !== 'open') {
    return { errors: {}, message: 'Applications are not open.' }
  }

  const parsed = applicationInputSchema.safeParse(Object.fromEntries(formData))
  const errors: Record<string, string> = {}
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0])
      errors[key] ??= issue.message
    }
  }

  const file = formData.get('logo')
  let logo: PreparedUpload | null = null
  if (!(file instanceof File) || file.size === 0) {
    errors.logo = 'Choose a logo file.'
  } else {
    const prepared = prepareUpload(file.name, Buffer.from(await file.arrayBuffer()))
    if (!prepared.ok) errors.logo = prepared.error
    else logo = prepared.value
  }

  if (Object.keys(errors).length > 0 || !logo || !parsed.success) {
    return { errors, message: 'Please fix the problems below.' }
  }

  // Rate limit only complete, valid submissions. Counting validation failures
  // would lock out an applicant who simply made five typos.
  const forwarded = (await headers()).get('x-forwarded-for') ?? 'unknown'
  const ip = forwarded.split(',')[0]!.trim()
  if (!hit(`submit:${ip}`, 5, 3_600_000)) {
    return { errors: {}, message: 'Too many submissions from this address. Try again later.' }
  }

  await createApplication(parsed.data, logo)
  redirect('/apply/submitted')
}
