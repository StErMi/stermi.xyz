import Head from 'next/head'
import Link from 'next/link'
import Footer from '../components/Footer'
import Header from '../components/Header'
import Hero from '../components/Hero'
import Posts from '../components/Posts'
import { Post } from '../interfaces'
import { getAllPosts } from '../lib/api'
import markdownToHtml from '../lib/markdownToHtml'

type Props = {
  allPosts: Post[]
}

const IndexPage = ({ allPosts }: Props) => (
  <>
    <Head>
      <title>StErMi.xyz</title>
      <meta name="description" content="StErMi.xyz" />
    </Head>
    <Header />
    <main>
      <Hero />
      <Posts posts={allPosts} />
    </main>
    <Footer />
  </>
)

export const getStaticProps = async () => {
  const allPosts = getAllPosts([
    'title',
    'date',
    'slug',
    'author',
    'coverImage',
    'excerpt',
  ])

  return {
    props: { allPosts },
  }
}

export default IndexPage
