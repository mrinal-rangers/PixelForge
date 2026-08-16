import { Link, useParams } from 'react-router-dom'
import { getPost } from '../blog'

export function BlogPost(): React.JSX.Element {
  const { slug } = useParams<{ slug: string }>()
  const post = slug ? getPost(slug) : undefined

  if (!post) {
    return (
      <section className="section">
        <div className="section-inner section-narrow">
          <h2 className="section-title">Post not found.</h2>
          <p className="section-sub">
            That write-up does not exist (yet).{' '}
            <Link className="blog-back" to="/blog">
              ← Back to all posts
            </Link>
          </p>
        </div>
      </section>
    )
  }

  return (
    <article className="section">
      <div className="section-inner section-narrow">
        <Link className="blog-back" to="/blog">
          ← All posts
        </Link>
        <div className="blog-meta blog-meta-top">
          <span className="blog-date">{post.date}</span>
          <span className="blog-readtime">⏱ {post.readTime}</span>
        </div>
        <h1 className="blog-post-title">{post.title}</h1>
        <p className="blog-post-description">{post.description}</p>
        <div className="blog-tags">
          {post.tags.map((tag) => (
            <span key={tag} className="tag">
              {tag}
            </span>
          ))}
        </div>
        <div className="blog-body">
          {post.sections.map((section, i) => (
            <section key={i}>
              {section.heading && <h2>{section.heading}</h2>}
              {section.paragraphs?.map((p, j) => <p key={j}>{p}</p>)}
              {section.bullets && (
                <ul>
                  {section.bullets.map((b, j) => (
                    <li key={j}>{b}</li>
                  ))}
                </ul>
              )}
              {section.code && (
                <pre className="blog-code">
                  <code>{section.code}</code>
                </pre>
              )}
            </section>
          ))}
        </div>
      </div>
    </article>
  )
}