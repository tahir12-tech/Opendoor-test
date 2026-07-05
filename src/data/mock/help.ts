/* =====================================================================
   Seed Help & resources content (ported from portal-help.js).
   opndoor admins add / edit / delete resources, FAQs and account managers;
   changes persist so every portal user sees the same content.
   ===================================================================== */
import type { HelpContent } from '../types';

export const HELP_SEED: HelpContent = {
  gettingStarted: [
    // #110 Three role-specific portal guides (authored HTML, print-to-PDF) + the
    // shipped Sales & Conversation Guide PDF. Referrer guide = all roles; Management
    // guide = management + opndoor admin; opndoor admin guide = opndoor admin only.
    { id: 'gs0', icon: 'doc', type: 'Guide', title: 'Referrer guide', desc: 'How to sign in, send a referral, add agencies and branches on the fly, track your applications, and read your League ranking. For everyone who refers.', meta: 'For all roles', href: '/help-docs/referrer-guide.html' },
    { id: 'gsmg', icon: 'users', type: 'Guide', title: 'Management guide', desc: 'Estate analytics, the fee and commission, settlements, exports, managing agencies, branches and users, the full League, and the Referrer & Period filters.', meta: 'Management & opndoor admin', href: '/help-docs/management-guide.html', minRole: 'management' },
    { id: 'gsag', icon: 'users', type: 'Guide', title: 'opndoor admin guide', desc: 'Reconciliation, partners and rate management (the rate-snapshot law), the premium bordereau, Health, the opndoor team, and the HubSpot sync.', meta: 'opndoor admin only', href: '/help-docs/opndoor-admin-guide.html', minRole: 'superadmin' },
    { id: 'gs0b', icon: 'doc', type: 'Guide', title: 'Sales and conversation guide', desc: 'How to talk to the agent and the tenant, who qualifies, how claims work, and where the line is between a guarantor service and insurance.', meta: 'PDF · all roles', href: '/help-docs/opndoor-sales-and-conversation-guide.pdf' },
    { id: 'gs1', icon: 'video', type: 'Video', title: 'Welcome to the portal', desc: 'A short tour of the dashboard, applications and how a referral moves from Sent to Deed Issued.', meta: '' },
  ],
  templates: [
    { id: 'tp0', icon: 'doc', type: 'Flyer', title: 'Agent one-pager (opndoor for letting agents)', desc: 'A branded one-page flyer to share with letting agents: turn failed references into completed lets, with the benefits and how it works.', meta: 'PDF', href: '/help-docs/opndoor-for-letting-agents.pdf' },
    { id: 'tp2', icon: 'doc', type: 'Leaflet', title: 'Tenant explainer leaflet', desc: 'A one-page explainer to share with tenants: what the opndoor guarantor service is, the fee, and how it works.', meta: 'PDF', href: '/help-docs/opndoor-for-tenants.pdf' },
    { id: 'tplg', icon: 'doc', type: 'Guide', title: 'Landlord guide', desc: 'A one-page guide to share with landlords: what the Deed of Guarantee means for their property, that it isn’t insurance, and that the agent stays the claim contact.', meta: 'PDF', href: '/help-docs/opndoor-for-landlords.pdf' },
    { id: 'tp1', icon: 'doc', type: 'Checklist', title: 'Referral information checklist', desc: 'The tenant, property and tenancy details to gather before you start an application.', meta: 'In the referrer guide', href: '/help-docs/referrer-guide.html#send' },
    { id: 'tp3', icon: 'image', type: 'Assets', title: 'Co-branding assets', desc: 'Logos and brand guidance for white-labelling the portal with your own branding.', meta: '' },
  ],
  faqs: [
    { id: 'f1', q: 'What is the Guarantee Referral Portal for?', a: 'It lets partner staff refer tenants who cannot pass referencing to opndoor’s professional guarantor service, and track each referral from <b>Sent</b> to <b>Paid</b> to <b>Deed Issued</b>, with live analytics on volume, conversion and fees.' },
    { id: 'f2', q: 'What does opndoor do as guarantor?', a: 'opndoor provides a <b>Deed of Guarantee</b> in favour of the property, for tenants who cannot provide their own guarantor. opndoor is not a party to, or named on, the tenancy agreement. It is a professional guarantor service, not insurance, and the referring agent is the claim contact.' },
    { id: 'f3', q: 'What do Sent, Paid and Deed Issued mean?', a: '<b>Sent</b> means the referral has been sent to the tenant. <b>Paid</b> means the guarantor fee, one month’s rent, has been paid. <b>Deed Issued</b> means the Deed of Guarantee has been issued and stored against the record.' },
    { id: 'f4', q: 'How do I refer a tenant?', a: 'Open <b>New application</b> and complete the sections in order: Tenant, Property, Tenancy, then Agent and branch. You can search for an existing agent and branch or add a new one on the fly. Submit to send the referral.' },
    { id: 'f5', q: 'Are the guarantee reference, issue date and expiry entered by hand?', a: 'No. The guarantee reference, issue date and expiry are <b>assigned automatically</b> once the guarantee is issued. They are not entered on the form; they appear on the application detail view.' },
    { id: 'f6', q: 'Who can use the portal and what can each role see?', a: '<b>opndoor admins</b> are opndoor’s internal team and manage everything, including reconciliation and HubSpot mapping. <b>Management</b> sees all tracking and analytics across the whole estate and can add their own users, but cannot edit canonical records or portal settings. <b>Referrers</b> see and track only their own referrals and can add agencies and branches on the fly.' },
    { id: 'f7', q: 'Can I add an agency or branch that is not listed?', a: 'Yes. On the new application form, the agent and branch fields let you search existing records or create a new one on the fly. New records appear on the Agencies and branches screen and are reviewed by opndoor for duplicates.' },
    { id: 'f8', q: 'How are the guarantor fee and commission calculated?', a: 'The guarantor fee is one month’s rent per referral. The partner earns <b>25%</b> of that fee and the agent earns <b>10%</b>. Commission figures are visible to management and opndoor admins only, not to referrers.' },
    { id: 'f9', q: 'Can a tenancy start date be changed after a referral?', a: 'Yes, as long as the new date is within <b>7 days</b> of the payment date. Amending it reissues the Deed of Guarantee with the corrected date. This is available to opndoor admins and management on the application detail view.' },
    { id: 'f10', q: 'How do I find a specific application?', a: 'Use the search and status filters on the <b>Applications</b> screen, or click any figure on the Agencies and branches screen to drill through to the applications behind it.' },
    { id: 'f11', q: 'What time period does the dashboard cover?', a: 'Use the period selector at the top of the dashboard, from the last 7 days through to all time. Every figure and chart updates to match, and the <b>Export CSV</b> button downloads the analytics for the selected period.' },
    { id: 'f12', q: 'I have a question that is not answered here.', a: 'Contact your opndoor account manager using the details in the panel on this page, and the partnerships team will help.' },
  ],
  managers: [
    { id: 'm1', name: 'opndoor partnerships team', role: 'opndoor Partnerships', email: 'partners@opndoor.co', phone: '' },
  ],
};
