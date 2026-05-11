import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Diamond IQ — Baseball Decision Training',
  description: 'Master baseball field decisions through scenario-based drills',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}