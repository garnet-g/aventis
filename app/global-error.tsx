'use client'; // error boundaries must be client components

/**
 * Last resort, used only when the site's main layout itself fails. It replaces the whole document, so the site's
 * styles and fonts are not available here; it uses plain inline styles in the VibeCrew colours.
 */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100vh', background: '#0a0a0a', color: '#ffffff', fontFamily: 'system-ui, sans-serif', display: 'grid', placeItems: 'center' }}>
        <title>Something went wrong | VibeCrew</title>
        <main style={{ maxWidth: 520, padding: '32px 16px', display: 'grid', gap: 16 }}>
          <p style={{ margin: 0, color: '#ffd60a', fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', fontSize: 12 }}>VibeCrew</p>
          <h1 style={{ margin: 0, fontSize: 36, lineHeight: 1.1 }}>The site didn&rsquo;t load.</h1>
          <p style={{ margin: 0, color: '#c9c7bd' }}>Please try again in a moment. Your designs and cart are saved.</p>
          <button
            type="button"
            onClick={() => retry()}
            style={{ justifySelf: 'start', background: '#ffd60a', color: '#0a0a0a', border: 0, borderRadius: 10, padding: '12px 22px', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
