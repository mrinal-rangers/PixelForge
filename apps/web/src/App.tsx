import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { useTheme } from './theme'
import { Nav } from './components/Nav'
import { Footer } from './components/Footer'
import Landing from './pages/Landing'
import { Blog } from './pages/Blog'
import { BlogPost } from './pages/BlogPost'

/** Scrolls to the target section when the route hash changes. */
function ScrollToHash(): null {
  const location = useLocation()

  useEffect(() => {
    if (location.hash) {
      const el = document.querySelector(location.hash)
      if (el) {
        requestAnimationFrame(() => {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        })
      }
    } else {
      window.scrollTo({ top: 0 })
    }
  }, [location])

  return null
}

function Layout(): React.JSX.Element {
  const { theme, toggleTheme } = useTheme()
  return (
    <div className="site">
      <Nav theme={theme} onToggleTheme={toggleTheme} />
      <ScrollToHash />
      <main>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/blog/:slug" element={<BlogPost />} />
        </Routes>
      </main>
      <Footer />
    </div>
  )
}

export default function App(): React.JSX.Element {
  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  )
}