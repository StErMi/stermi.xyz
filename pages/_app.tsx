import { AppProps } from 'next/app'
import { Analytics } from '@vercel/analytics/react'
import { Inter, Lexend } from '@next/font/google'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

const lexend = Inter({
  subsets: ['latin'],
  variable: '--font-lexend',
})

import 'focus-visible'
import '../styles/index.css'
import 'prismjs/themes/prism-tomorrow.css'
import 'prismjs/plugins/line-numbers/prism-line-numbers.css'

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <style jsx global>{`
        html {
          font-family: ${inter.style.fontFamily}, ${lexend.style.fontFamily};
        }
      `}</style>
      <Component {...pageProps} />
      <Analytics />
    </>
  )
}
