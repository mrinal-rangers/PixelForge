import { Link } from 'react-router-dom'
import { BLOG_POSTS } from '../blog'
import { BlogCover } from '../components/BlogCover'

export function Blog(): React.JSX.Element {
  return (
    <section className="section" id="blog">
      <div className="section-inner">
        <p className="section-kicker">Blogs</p>
        <h2 className="section-title">Guides from the forge.</h2>
        <p className="section-sub">
          Install it, set it up, or go under the hood. Straightforward write-ups with no fluff.
        </p>
        <div className="blog-list">
          {BLOG_POSTS.map((post) => (
            <article key={post.slug} className="blog-card">
              <Link to={`/blog/${post.slug}`} className="blog-card-link">
                <BlogCover slug={post.slug} />
                <div className="blog-meta">
                  <span className="blog-date">{post.date}</span>
                  <span className="blog-readtime">⏱ {post.readTime}</span>
                </div>
                <h3>{post.title}</h3>
                <p>{post.description}</p>
                <div className="blog-tags">
                  {post.tags.map((tag) => (
                    <span key={tag} className="tag">
                      {tag}
                    </span>
                  ))}
                </div>
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}