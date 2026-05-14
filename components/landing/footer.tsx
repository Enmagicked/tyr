// Server component — pure markup, no interactivity. About / Privacy / Terms
// remain `#` stubs per the M4 plan; M5+ writes the real pages.

const COLUMNS = [
  {
    label: 'Product',
    links: [
      { label: 'Upload resume', href: '/upload' },
      { label: 'How it works', href: '#how-it-works' },
      { label: 'FAQ', href: '#faq' },
    ],
  },
  {
    label: 'Company',
    links: [
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
    ],
  },
]

export function Footer() {
  return (
    <footer className="bg-ink px-6 md:px-12 pt-16 pb-10">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-col gap-12 md:flex-row md:justify-between md:gap-8 mb-12">
          <div>
            <div className="font-serif text-3xl text-vellum mb-3 lowercase">
              tyr
            </div>
            <p className="text-sm text-vellum/40 max-w-[220px] leading-[1.78]">
              Named after the Norse god of justice and fairness.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-12 md:gap-16">
            {COLUMNS.map((col) => (
              <div key={col.label}>
                <div className="text-[10px] font-semibold tracking-[0.14em] uppercase text-vellum/30 mb-5">
                  {col.label}
                </div>
                {col.links.map((l) => (
                  <div key={l.label} className="mb-3">
                    <a
                      href={l.href}
                      className="text-sm text-vellum/50 hover:text-vellum transition-colors"
                    >
                      {l.label}
                    </a>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="border-t border-vellum/10 pt-6 text-xs text-vellum/30">
          © 2026 tyr. All rights reserved.
        </div>
      </div>
    </footer>
  )
}
