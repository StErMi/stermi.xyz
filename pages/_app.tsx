import { AppProps } from 'next/app'
import { Analytics } from '@vercel/analytics/react'

import 'focus-visible'
import '../styles/index.css'
import 'prismjs/themes/prism-tomorrow.css'
import 'prismjs/plugins/line-numbers/prism-line-numbers.css'

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Component {...pageProps} />
      <Analytics />
    </>
  )
}
