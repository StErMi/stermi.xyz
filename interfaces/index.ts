// You can include shared interfaces/types in a separate file
// and then use them in any component by importing them. For
// example, to import the interface below do:
//
// import { User } from 'path/to/interfaces';

export type Author = {
  name: string
  picture: string
  twitter: string
}

export type Post = {
  slug: string
  title: string
  date: string
  coverImage: {
    url: string
    credit?: {
      name: string
      url: string
    }
  }
  author: Author
  excerpt: string
  ogImage: {
    url: string
  }
  content: string
}
