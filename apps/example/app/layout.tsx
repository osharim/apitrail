import type { ReactNode } from 'react'

export const metadata = {
  title: 'apitrail example',
  description: 'Demo app for apitrail',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: 720 }}>
        {children}
      </body>
    </html>
  )
}
