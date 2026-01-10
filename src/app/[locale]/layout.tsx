import {
  getMessages,
  getTranslations,
  setRequestLocale,
} from "next-intl/server"
import { AppContextProvider } from "@/contexts/app"
import type { Metadata } from "next"
import { NextAuthSessionProvider } from "@/auth/session"
import { NextIntlClientProvider } from "next-intl"
import { ThemeProvider } from "@/providers/theme"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  setRequestLocale(locale)

  // 关键：传 locale（更明确，避免读错上下文）
  const t = await getTranslations({ locale })

  // 关键：t("xxx") 缺 key 会 throw，|| "" 没用，用 has() 兜底
  const title = t.has("metadata.title") ? t("metadata.title") : ""
  const description = t.has("metadata.description") ? t("metadata.description") : ""
  const keywords = t.has("metadata.keywords") ? t("metadata.keywords") : ""

  return {
    title: {
      template: "%s",
      default: title,
    },
    description,
    keywords,
  }
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode
  params: Promise<{ locale: string }>
}>) {
  const { locale } = await params
  setRequestLocale(locale)

  const messages = await getMessages()

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <NextAuthSessionProvider>
        <AppContextProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </AppContextProvider>
      </NextAuthSessionProvider>
    </NextIntlClientProvider>
  )
}
