export interface TemplateDefinition {
  key: string
  name: string
  subject: string
  body: string
  variables: string[]
}

const SIGNOFF = `\n\nThe SCaLE Community Booths team\n{{contact_email}}`

export const DEFAULT_TEMPLATES: TemplateDefinition[] = [
  {
    key: 'submission_receipt',
    name: 'Application received',
    subject: 'We received your {{event}} community booth application',
    body:
      `Hi {{contact_name}},\n\n` +
      `Thanks for applying for a community booth at {{event}} on behalf of {{org_name}}.\n\n` +
      `You can view your application, make changes before the deadline, and see any messages from us here:\n\n` +
      `{{portal_url}}\n\n` +
      `Keep that link — it is how you get back in.\n\n` +
      `We review applications as they come in and will be in touch.` +
      SIGNOFF,
    variables: ['contact_name', 'org_name', 'event', 'portal_url', 'contact_email'],
  },
  {
    key: 'magic_link_applicant',
    name: 'Applicant sign-in link',
    subject: 'Your link to your {{event}} booth application',
    body:
      `Hi,\n\n` +
      `Here is your link to your community booth application:\n\n` +
      `{{portal_url}}\n\n` +
      `The link works for 7 days. If you did not ask for it, you can ignore this email.` +
      SIGNOFF,
    variables: ['event', 'portal_url', 'contact_email'],
  },
]
