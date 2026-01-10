import { getRequestConfig } from "next-intl/server"
import { routing } from "./routing"

type AnyObj = Record<string, any>

function deepMerge(a: AnyObj, b: AnyObj): AnyObj {
  const out: AnyObj = { ...a }
  for (const k of Object.keys(b || {})) {
    const av = out[k]
    const bv = b[k]
    if (
      av &&
      bv &&
      typeof av === "object" &&
      typeof bv === "object" &&
      !Array.isArray(av) &&
      !Array.isArray(bv)
    ) {
      out[k] = deepMerge(av, bv)
    } else {
      out[k] = bv
    }
  }
  return out
}

/** 显式映射：不要用字符串拼路径 import */
const baseMessages: Record<string, () => Promise<{ default: AnyObj }>> = {
  en: () => import("./messages/en.json"),
  zh: () => import("./messages/zh.json"),
}

const landingMessages: Record<string, () => Promise<{ default: AnyObj }>> = {
  en: () => import("./pages/landing/en.json"),
  zh: () => import("./pages/landing/zh.json"),
}

const pricingMessages: Record<string, () => Promise<{ default: AnyObj }>> = {
  en: () => import("./pages/pricing/en.json"),
  zh: () => import("./pages/pricing/zh.json"),
}

const showcaseMessages: Record<string, () => Promise<{ default: AnyObj }>> = {
  en: () => import("./pages/showcase/en.json"),
  zh: () => import("./pages/showcase/zh.json"),
}

const coloringMessages: Record<string, () => Promise<{ default: AnyObj }>> = {
  en: () => import("./pages/coloring/en.json"),
  zh: () => import("./pages/coloring/zh.json"),
}

async function load(map: Record<string, () => Promise<{ default: AnyObj }>>, locale: string) {
  const loader = map[locale] || map.en
  return (await loader()).default
}

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale

  if (!locale || !routing.locales.includes(locale as any)) locale = routing.defaultLocale
  if (locale === "zh-CN") locale = "zh"
  if (!routing.locales.includes(locale as any)) locale = "en"

  const base = await load(baseMessages, locale)
  const landing = await load(landingMessages, locale)
  const pricing = await load(pricingMessages, locale)
  const showcase = await load(showcaseMessages, locale)
  const coloring = await load(coloringMessages, locale)

  const messages = deepMerge(base, {
    pages: {
      landing,
      pricing,
      showcase,
      coloring,
    },
  })

  return { locale, messages }
})
