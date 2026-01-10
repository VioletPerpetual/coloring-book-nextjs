import { ReactNode } from "react"
import { getLandingPage } from "@/services/page"
import ClientShell from "./ClientShell"

export default async function DefaultLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const page = await getLandingPage(locale)

  return <ClientShell page={page}>{children}</ClientShell>
}
