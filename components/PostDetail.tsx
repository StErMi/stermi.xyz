import clsx from 'clsx'
import * as React from 'react'
import { Post } from '../interfaces'
import DateFormatter from './DateFormatter'
import Image from 'next/future/image'

type Props = {
  post: Post
}

const PostDeail = ({ post }: Props) => (
  <div className="relative overflow-hidden bg-white py-16">
    <div className="hidden lg:absolute lg:inset-y-0 lg:block lg:h-full lg:w-full"></div>
    <div className="relative px-4 sm:px-6 lg:px-8">
      <div className="mx-auto mb-6 max-w-4xl text-lg">
        <h1>
          <span className="block text-center text-base font-semibold uppercase tracking-wide text-indigo-600">
            <DateFormatter dateString={post.date} />
          </span>

          <span className="mt-2 block text-center text-3xl font-extrabold leading-8 tracking-tight text-gray-900 sm:text-4xl">
            {post.title}
          </span>
          <span className="flex items-start justify-start">
            <div className="mt-6 flex items-center">
              <div className="flex-shrink-0">
                <span className="sr-only">{post.author.name}</span>
                <Image
                  className="h-10 w-10 rounded-full"
                  src={post.author.picture}
                  alt=""
                  // width={40}
                  // height={40}
                />
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-900">
                  {post.author.name}
                </p>
                <div className="flex space-x-1 text-sm text-gray-500">
                  <a
                    target="_blank"
                    href={`https://twitter.com/${post.author.twitter}`}
                  >
                    @{post.author.twitter}
                  </a>
                </div>
              </div>
            </div>
          </span>
        </h1>
      </div>

      <div className="flex flex-col items-center justify-center overflow-hidden rounded-lg">
        <Image
          src={post.coverImage.url}
          alt={`Cover Image for ${post.title}`}
          className={clsx('max-w-5xl rounded-lg shadow-sm', {
            'object-cover transition-shadow duration-200 hover:shadow-lg':
              post.slug,
          })}
        />
        {post.coverImage.credit && (
          <div className="pt-1 text-sm text-gray-400">
            <a className="" href={post.coverImage.credit.url} target="_blank">
              {post.coverImage.credit.name}
            </a>
          </div>
        )}
      </div>
      <div
        className="prose prose-lg prose-indigo mx-auto mt-6 text-gray-500"
        dangerouslySetInnerHTML={{ __html: post.content }}
      ></div>
    </div>
  </div>
)

export default PostDeail
