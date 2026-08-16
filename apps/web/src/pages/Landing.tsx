import { Hero } from '../components/Hero'
import { Providers } from '../components/Providers'
import { HowItWorks } from '../components/HowItWorks'
import { Features } from '../components/Features'
import { Security } from '../components/Security'
import { Pricing } from '../components/Pricing'
import { Contact } from '../components/Contact'
import { FAQ } from '../components/FAQ'

export default function Landing(): React.JSX.Element {
  return (
    <>
      <Hero />
      <Providers />
      <HowItWorks />
      <Features />
      <Security />
      <Pricing />
      <Contact />
      <FAQ />
    </>
  )
}