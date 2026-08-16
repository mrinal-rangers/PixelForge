import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useTheme } from './theme'
import { Nav } from './components/Nav'
import { Footer } from './components/Footer'
import Landing from './pages/Landing'
import { Blog } from './pages/Blog'
import { BlogPost } from './pages/BlogPost'

function Layout(): React.JSX.Element {
  const { theme, toggleTheme } = useTheme()
  return (
    <div className="site">
      <Nav theme={theme} onToggleTheme={toggleTheme} />
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