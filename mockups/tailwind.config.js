/* ============================================================
   Arca — Tailwind theme, bound to the CSS custom properties in
   tokens.css. Nothing here hard-codes a hex value, so changing a
   token changes every mockup and, later, every React component.

   In these static mockups this file is loaded AFTER the Tailwind
   CDN script and assigns `tailwind.config` directly.

   Porting to Next.js: copy the `theme.extend` object verbatim into
   `tailwind.config.ts` and delete the `tailwind.config =` wrapper.
   ============================================================ */

const arcaTheme = {
  extend: {
    colors: {
      bg:        'var(--color-bg)',
      surface:   'var(--color-surface)',
      surface2:  'var(--color-surface-2)',
      surface3:  'var(--color-surface-3)',
      border:    'var(--color-border)',
      borderStrong: 'var(--color-border-strong)',

      text:      'var(--color-text)',
      muted:     'var(--color-text-muted)',
      faint:     'var(--color-text-faint)',
      invert:    'var(--color-text-invert)',

      primary:      'var(--color-primary)',
      primaryHover: 'var(--color-primary-hover)',
      primaryWeak:  'var(--color-primary-weak)',
      accent:       'var(--color-accent)',
      accentHover:  'var(--color-accent-hover)',
      accentWeak:   'var(--color-accent-weak)',

      success: 'var(--color-success)', successWeak: 'var(--color-success-weak)',
      warning: 'var(--color-warning)', warningWeak: 'var(--color-warning-weak)',
      danger:  'var(--color-danger)',  dangerWeak:  'var(--color-danger-weak)',
      info:    'var(--color-info)',    infoWeak:    'var(--color-info-weak)',

      cCharacter: 'var(--color-container-character)',
      cParty:     'var(--color-container-party)',
      cWorld:     'var(--color-container-world)',
    },
    fontFamily: {
      sans:  'var(--font-sans)',
      serif: 'var(--font-serif)',
      mono:  'var(--font-mono)',
    },
    fontSize: {
      xs:   ['var(--font-size-xs)',   'var(--line-height-xs)'],
      sm:   ['var(--font-size-sm)',   'var(--line-height-sm)'],
      base: ['var(--font-size-base)', 'var(--line-height-base)'],
      lg:   ['var(--font-size-lg)',   'var(--line-height-lg)'],
      xl:   ['var(--font-size-xl)',   'var(--line-height-xl)'],
      '2xl':['var(--font-size-2xl)',  'var(--line-height-2xl)'],
    },
    spacing: {
      1: 'var(--space-1)', 2: 'var(--space-2)', 3: 'var(--space-3)',
      4: 'var(--space-4)', 5: 'var(--space-5)', 6: 'var(--space-6)',
      8: 'var(--space-8)',
    },
    borderRadius: {
      sm: 'var(--radius-sm)', md: 'var(--radius-md)', lg: 'var(--radius-lg)',
    },
    boxShadow: {
      panel: 'var(--shadow-panel)',
      modal: 'var(--shadow-modal)',
    },
    width: {
      sidebar: 'var(--sidebar-w)',
      sidebarCollapsed: 'var(--sidebar-w-collapsed)',
      detail: 'var(--detail-w)',
    },
    height: {
      topbar: 'var(--topbar-h)',
      row: 'var(--row-h)',
    },
    screens: {
      // `panel` is the TaleSpire Symbiote's docked width — the narrowest
      // real target, and the one the layout is designed at first.
      panel: '380px',
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
    },
  },
};

if (typeof tailwind !== 'undefined') {
  tailwind.config = { theme: arcaTheme, corePlugins: { preflight: false } };
}
