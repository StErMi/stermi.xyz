import Link from 'next/link'
import * as React from 'react'

type Props = {
  href: string
  children?: React.ReactNode
}

const NavLink = ({ href, children }: Props) => (
  <Link
    href={href}
    className="inline-block rounded-lg py-1 px-2 text-sm text-slate-700 hover:bg-slate-100 hover:text-slate-900"
  >
    {children}
  </Link>
)

export default NavLink
