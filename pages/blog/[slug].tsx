import Head from 'next/head'
import Link from 'next/link'
import Footer from '../../components/Footer'
import Header from '../../components/Header'
import PostDeail from '../../components/PostDetail'
import { Post } from '../../interfaces'
import { getAllPosts, getPostBySlug } from '../../lib/api'
import markdownToHtml from '../../lib/markdownToHtml'

type Props = {
  post: Post
}

const IndexPage = ({ post }: Props) => (
  <>
    <Head>
      <title>{post.title} StErMi.xyz Blog</title>
      <meta name="description" content={post.excerpt} />

      {/* Twitter */}
      <meta name="twitter:card" content="summary" key="twcard" />
      <meta name="twitter:creator" content="@StErMi" key="twhandle" />

      {/* Open Graph */}
      <meta
        property="og:url"
        content={`https://stermi.xyz/blog/${post.slug}`}
        key="ogurl"
      />
      <meta property="og:image" content={post.coverImage.url} key="ogimage" />
      <meta property="og:site_name" content="StErMi.xyz" key="ogsitename" />
      <meta property="og:title" content={post.title} key="ogtitle" />
      <meta property="og:description" content={post.excerpt} key="ogdesc" />
    </Head>
    <Header />
    <main>
      <PostDeail post={post} />
    </main>
    <Footer />
  </>
)

export default IndexPage

type Params = {
  params: {
    slug: string
  }
}

export async function getStaticProps({ params }: Params) {
  const post = getPostBySlug(params.slug, [
    'title',
    'date',
    'slug',
    'author',
    'excerpt',
    'content',
    'ogImage',
    'coverImage',
    'readingTime',
  ])
  const content = await markdownToHtml(post.content || '')

  return {
    props: {
      post: {
        ...post,
        content,
      },
    },
  }
}

export async function getStaticPaths() {
  const posts = getAllPosts(['slug'])

  return {
    paths: posts.map((post) => {
      return {
        params: {
          slug: post.slug,
        },
      }
    }),
    fallback: false,
  }
}
