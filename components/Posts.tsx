import * as React from 'react'
import Container from './Container'
import Image from 'next/future/image'
import { Post } from '../interfaces'
import DateFormatter from './DateFormatter'
import Link from 'next/link'

type Props = {
  posts: Post[]
}

const Posts = ({ posts }: Props) => (
  <section
    id="posts"
    aria-label="What our customers are saying"
    className="bg-slate-50 py-10 sm:py-10"
  >
    <Container>
      <div className="mx-auto max-w-2xl md:text-center">
        <h2 className="font-display text-3xl tracking-tight text-slate-900 sm:text-4xl">
          Latest blog posts
        </h2>
        <p className="mt-4 text-lg tracking-tight text-slate-700">
          Want to know more about all the things that I learn during my journey?
          You are in the right place!
        </p>
      </div>
      <ul
        role="list"
        className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-6 sm:gap-8 lg:mt-20 lg:max-w-none lg:grid-cols-3"
      >
        {posts.map((post) => (
          <div
            key={post.title}
            className="flex flex-col overflow-hidden rounded-lg shadow-lg"
          >
            <div className="flex-shrink-0">
              <Image
                className="h-48 w-full object-cover"
                src={post.coverImage}
                alt=""
              />
            </div>
            <div className="flex flex-1 flex-col justify-between bg-white p-6">
              <div className="flex-1">
                {/* <p className="text-sm font-medium text-indigo-600">
                  <a href={post.category.href} className="hover:underline">
                    {post.category.name}
                  </a>
                </p> */}
                <Link
                  as={`/blog/${post.slug}`}
                  href="/blog/[slug]"
                  className="mt-2 block"
                >
                  <p className="text-xl font-semibold text-gray-900">
                    {post.title}
                  </p>
                  <p
                    className="mt-3 text-base text-gray-500"
                    dangerouslySetInnerHTML={{ __html: post.excerpt }}
                  ></p>
                </Link>
              </div>
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
                    <DateFormatter dateString={post.date} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </ul>
    </Container>
  </section>
)

export default Posts
