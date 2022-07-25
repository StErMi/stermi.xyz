import * as React from 'react'
import clsx from 'clsx'

type Props = {
  children?: React.ReactNode
  className?: string
}

const Container = ({ className, ...props }: Props) => (
  <div
    className={clsx('mx-auto max-w-7xl px-4 sm:px-6 lg:px-8', className)}
    {...props}
  />
)

export default Container
