"use client"

import React from "react"
import Header from "@/components/blocks/header"
import Footer from "@/components/blocks/footer"

export default function ClientShell({
  page,
  children,
}: {
  page: any
  children: React.ReactNode
}) {
  return (
    <>
      {page?.header && <Header header={page.header} />}
      <main className="overflow-x-hidden">{children}</main>
      {page?.footer && <Footer footer={page.footer} />}
    </>
  )
}
