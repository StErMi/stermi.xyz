import { remark } from 'remark'
import html from 'remark-html'
import prism from 'remark-prism'
import remarkGfm from 'remark-gfm'

export default async function markdownToHtml(markdown: string) {
  const result = await remark()
    // https://github.com/sergioramos/remark-prism/issues/265
    .use(html, { sanitize: false })
    .use(remarkGfm)
    .use(prism)
    .process(markdown)
  return result.toString()
}
