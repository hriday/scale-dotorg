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
  {
    key: 'magic_link_admin',
    name: 'Admin sign-in link',
    subject: 'Your {{event}} Community Booths admin link',
    body:
      `Hi {{admin_name}},\n\n` +
      `Here is your sign-in link for the Community Booths admin console:\n\n` +
      `{{admin_url}}\n\n` +
      `It works once and expires in 30 minutes. If you did not ask for it, ignore this email.` +
      SIGNOFF,
    variables: ['admin_name', 'event', 'admin_url', 'contact_email'],
  },
  {
    key: 'accepted',
    name: 'Application accepted',
    subject: 'Your {{event}} community booth \u2014 please confirm',
    body:
      `Hi {{contact_name}},\n\n` +
      `Good news \u2014 we have a community booth for {{org_name}} at {{event}}.\n\n` +
      `Please confirm the booth and the booth terms here:\n\n` +
      `{{portal_url}}\n\n` +
      `The booth is free. Please note that if you cancel fewer than 30 days before the event, ` +
      `or do not occupy your booth during the show, a late cancellation fee of {{fee}} applies. ` +
      `The full terms are on that page.\n\n` +
      `We would always rather hear from you early than charge that fee, so tell us as soon as ` +
      `you know if anything changes.` +
      SIGNOFF,
    variables: ['contact_name', 'org_name', 'event', 'portal_url', 'fee', 'contact_email'],
  },
  {
    key: 'rejected',
    name: 'Application not accepted',
    subject: 'About your {{event}} community booth application',
    body:
      `Hi {{contact_name}},\n\n` +
      `Thank you for applying for a community booth at {{event}} on behalf of {{org_name}}.\n\n` +
      `We had more applications than booths this year and were not able to offer you one. ` +
      `This is not a judgement on your project \u2014 the expo floor is simply smaller than the ` +
      `community it serves.\n\n` +
      `We would genuinely like to see you apply again next year.` +
      SIGNOFF,
    variables: ['contact_name', 'org_name', 'event', 'contact_email'],
  },
  {
    key: 'waitlisted',
    name: 'Application waitlisted',
    subject: 'Your {{event}} community booth application is waitlisted',
    body:
      `Hi {{contact_name}},\n\n` +
      `We would like to give {{org_name}} a booth at {{event}}, but we are full right now. ` +
      `You are on the waitlist, and booths do free up.\n\n` +
      `You can check your status here at any time:\n\n` +
      `{{portal_url}}\n\n` +
      `We will write again as soon as we know either way.` +
      SIGNOFF,
    variables: ['contact_name', 'org_name', 'event', 'portal_url', 'contact_email'],
  },
  {
    key: 'info_request',
    name: 'More information needed',
    subject: 'A question about your {{event}} booth application',
    body:
      `Hi {{contact_name}},\n\n` +
      `We are reviewing {{org_name}}'s community booth application and need a little more from you.\n\n` +
      `Open your application to read our question and reply:\n\n` +
      `{{portal_url}}\n\n` +
      `You can also edit your answers there while applications are open.` +
      SIGNOFF,
    variables: ['contact_name', 'org_name', 'event', 'portal_url', 'contact_email'],
  },
  {
    key: 'admin_reply_notification',
    name: 'Applicant replied (to admins)',
    subject: '{{org_name}} replied about their community booth',
    body:
      `{{org_name}} has replied on their community booth application.\n\n` +
      `Read and answer it here:\n\n` +
      `{{admin_url}}`,
    variables: ['org_name', 'admin_url'],
  },
  {
    key: 'admin_invite',
    name: 'Admin invitation',
    subject: 'You have been added as a {{event}} Community Booths admin',
    body:
      `Hi {{admin_name}},\n\n` +
      `{{inviter_name}} has added you as an admin for {{event}} Community Booths, where we review ` +
      `booth applications from open source projects and community groups.\n\n` +
      `Sign in here:\n\n` +
      `{{admin_url}}\n\n` +
      `That link works once and expires in 30 minutes. After that, request a fresh one from the ` +
      `sign-in page using this address.` +
      SIGNOFF,
    variables: ['admin_name', 'inviter_name', 'event', 'admin_url', 'contact_email'],
  },
]
