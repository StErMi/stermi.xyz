import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import Footer from '../../components/Footer'
import Header from '../../components/Header'
import PostDeail from '../../components/PostDetail'
import { Post } from '../../interfaces'
import { getAllPosts, getPostBySlug } from '../../lib/api'
import markdownToHtml from '../../lib/markdownToHtml'

type Props = {
  post: Post
}

const IndexPage = ({ post }: Props) => {
  const router = useRouter()
  const meta = {
    title: 'StErMi – Developer, writer, creator.',
    excerpt: `Full-stack developer, creator and Web3 enthusiast.`,
    image: 'https://stermi.xyz/assets/stermi.jpeg',
    type: 'website',
    ...post,
  }
  return (
    <>
      <Head>
        <title>{meta.title}</title>

        <meta name="robots" content="follow, index" />
        <meta content={meta.excerpt} name="description" />
        <meta
          property="og:url"
          content={`https://stermi.xyz${router.asPath}`}
        />
        <link rel="canonical" href={`https://stermi.xyz${router.asPath}`} />
        <meta property="og:site_name" content="StErMi" />
        <meta property="og:description" content={meta.excerpt} />
        <meta property="og:title" content={meta.title} />
        <meta
          property="og:image"
          content={`https://stermi.xyz${meta.coverImage.url}`}
        />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content="@stermi" />
        <meta name="twitter:title" content={meta.title} />
        <meta name="twitter:description" content={meta.excerpt} />
        <meta
          name="twitter:image"
          content={`https://stermi.xyz${meta.coverImage.url}`}
        />
        {meta.date && (
          <meta property="article:published_time" content={meta.date} />
        )}
      </Head>
      <Header />
      <main>
        <PostDeail post={post} />
      </main>
      <Footer />
    </>
  )
}

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
