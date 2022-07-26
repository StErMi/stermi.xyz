import RSS from 'rss'
import { getAllPosts } from '../lib/api'

export async function getServerSideProps({ res }) {
  const feed = new RSS({
    title: 'Emanuele Ricci',
    site_url: 'https://stermi.xyz',
    feed_url: 'https://stermi.xyz/feed.xml',
  })

  const allPosts = getAllPosts([
    'title',
    'date',
    'slug',
    'author',
    'coverImage',
    'excerpt',
  ])
  allPosts.map((post) => {
    feed.item({
      title: post.title,
      url: `https://stermi.xyz/blog/${post.slug}`,
      date: post.date,
      description: post.excerpt,
    })
  })

  res.setHeader('Content-Type', 'text/xml')
  res.setHeader(
    'Cache-Control',
    'public, s-maxage=1200, stale-while-revalidate=600'
  )
  res.write(feed.xml({ indent: true }))
  res.end()

  return {
    props: {},
  }
}

export default function RSSFeed() {
  return null
}
