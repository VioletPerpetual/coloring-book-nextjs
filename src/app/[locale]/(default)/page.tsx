import Link from "next/link"
import Branding from "@/components/blocks/branding"
import CTA from "@/components/blocks/cta"
import FAQ from "@/components/blocks/faq"
import Feature from "@/components/blocks/feature"
import Feature1 from "@/components/blocks/feature1"
import Feature2 from "@/components/blocks/feature2"
import Feature3 from "@/components/blocks/feature3"
import Hero from "@/components/blocks/hero"
import Pricing from "@/components/blocks/pricing"
import Showcase from "@/components/blocks/showcase"
import Stats from "@/components/blocks/stats"
import Testimonial from "@/components/blocks/testimonial"
import { getLandingPage } from "@/services/page"
import { setRequestLocale } from "next-intl/server"
import { getTranslations } from "next-intl/server"

export const revalidate = 60
export const dynamic = "force-static"
export const dynamicParams = true

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  let canonicalUrl = `${process.env.NEXT_PUBLIC_WEB_URL}`

  if (locale !== "en") {
    canonicalUrl = `${process.env.NEXT_PUBLIC_WEB_URL}/${locale}`
  }

  return {
    alternates: {
      canonical: canonicalUrl,
    },
  }
}

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  // 关键：namespace 固定为 pages.landing
  const t = await getTranslations({ locale, namespace: "pages.landing" })
  const safeT = (key: string) => (t.has(key) ? t(key) : "")

  const page = await getLandingPage(locale)

  return (
    <>
      {page.hero && <Hero hero={page.hero} />}

      <section className="mx-auto max-w-6xl px-4">
        <div className="mt-6 flex flex-col items-center justify-between gap-3 rounded-2xl border bg-background p-4 shadow-sm md:flex-row md:p-5">
          <div className="text-center md:text-left">
            <div className="text-sm font-semibold">
              {safeT("coloring_entry.title")}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {safeT("coloring_entry.desc")}
            </div>
          </div>

          <Link
            href={`/${locale}/coloring`}
            className="w-full rounded-xl bg-orange-500 px-5 py-3 text-center text-sm font-medium text-white transition hover:bg-orange-600 md:w-auto"
          >
            {safeT("coloring_entry.button")}
          </Link>
        </div>
      </section>

      {page.branding && <Branding section={page.branding} />}
      {page.introduce && <Feature1 section={page.introduce} />}
      {page.benefit && <Feature2 section={page.benefit} />}
      {page.usage && <Feature3 section={page.usage} />}
      {page.feature && <Feature section={page.feature} />}
      {page.showcase && <Showcase section={page.showcase} />}
      {page.stats && <Stats section={page.stats} />}
      {page.pricing && <Pricing pricing={page.pricing} />}
      {page.testimonial && <Testimonial section={page.testimonial} />}
      {page.faq && <FAQ section={page.faq} />}
      {page.cta && <CTA section={page.cta} />}
    </>
  )
}
