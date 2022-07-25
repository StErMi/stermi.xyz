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
      <meta name="description" content="StErMi.xyz" />
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
    'content',
    'ogImage',
    'coverImage',
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
