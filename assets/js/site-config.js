/* Site settings for the browser. Everything here is PUBLIC (it is downloaded by every visitor), so never put passwords here.
 *
 * backend: 'auto'  -> use PHP + MySQL when the server has them (XAMPP, php -S), otherwise the online database (Supabase, for GitHub Pages).
 *          'local' -> always use Supabase.   'php' -> always use PHP.
 *
 * supabase: the online database. Accounts, reservations, sign-up codes and password-reset codes all go through it.
 * emailjs: only used for the "ready for release" notice. Create a free account at https://www.emailjs.com, then fill in the three values below
 *          (see README, "Email on GitHub Pages"). The public key is meant to be public. Left empty, the Notify button just says e-mail is not set up.
 */
window.PLMUN_CONFIG = {
  backend: 'auto',
  demoNotice: '',   // text shown as a small label at the bottom of every page, e.g. 'Demo version'. Leave '' for none.
  // Online database + e-mail verification (Supabase). REQUIRED on GitHub Pages: accounts, sign-up codes and password-reset codes all go through Supabase.
  // Both values are PUBLIC by design (Project Settings > API): the project URL and the "anon" / "publishable" key. NEVER paste the service_role / secret key.
  supabase: {
    url: 'https://kdndtmfftehznjrpkjli.supabase.co',       // e.g. 'https://abcdefghijklmnop.supabase.co'
    anonKey: 'sb_publishable_Plf-BD97H-Q-p8EGP10tMg_OkXMgeRz',   // e.g. 'eyJhbGciOi...' (anon public key)
  },
  emailjs: {
    serviceId: 'service_malnn7n',    // e.g. 'service_abc123'
    templateId: 'template_l3m8c39',   // e.g. 'template_xyz789'
    publicKey: 'Hv2yYSrvHaR0KR3r6Hv2yYSrvHaR0KR3r6',    // e.g. 'AbCdEfGhIjKlMnOp'
  },
};
