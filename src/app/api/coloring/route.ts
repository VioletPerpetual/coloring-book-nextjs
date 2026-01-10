// src/app/api/coloring/route.ts
import { NextResponse } from "next/server"

export const runtime = "nodejs"

const BASE = process.env.KIE_API_BASE || "https://api.kie.ai"
const KEY = process.env.KIE_API_KEY

function mustEnv() {
  if (!KEY) throw new Error("Missing env: KIE_API_KEY")
}

type KieResp<T> = { code: number; msg: string; data: T }

export async function POST(req: Request) {
  mustEnv()
  const body = await req.json().catch(() => ({}))

  const prompt = String(body?.prompt ?? "")
  const size = String(body?.size ?? "1:1") // 1:1 / 3:2 / 2:3 :contentReference[oaicite:1]{index=1}
  const nVariants = Number(body?.nVariants ?? 1)

  if (!prompt) return NextResponse.json({ error: "missing prompt" }, { status: 400 })

  // KIE: POST /api/v1/gpt4o-image/generate :contentReference[oaicite:2]{index=2}
  const upstream = await fetch(`${BASE}/api/v1/gpt4o-image/generate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt, size, nVariants }),
  })

  const json = (await upstream.json().catch(() => null)) as KieResp<{ taskId: string }> | null

  if (!upstream.ok || !json || json.code !== 200) {
    return NextResponse.json(
      { error: "kie_generate_failed", detail: json ?? (await upstream.text().catch(() => "")) },
      { status: 500 }
    )
  }

  return NextResponse.json({ taskId: json.data.taskId })
}

export async function GET(req: Request) {
  mustEnv()
  const { searchParams } = new URL(req.url)
  const taskId = searchParams.get("taskId")
  if (!taskId) return NextResponse.json({ error: "missing taskId" }, { status: 400 })

  // KIE: GET /api/v1/gpt4o-image/record-info?taskId=... :contentReference[oaicite:3]{index=3}
  const upstream = await fetch(`${BASE}/api/v1/gpt4o-image/record-info?taskId=${encodeURIComponent(taskId)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${KEY}` },
  })

  const json = (await upstream.json().catch(() => null)) as
    | KieResp<{
        taskId: string
        successFlag: 0 | 1 | 2
        progress?: string
        errorMessage?: string | null
        response?: { result_urls?: string[] } | null
      }>
    | null

  if (!upstream.ok || !json || json.code !== 200) {
    return NextResponse.json(
      { error: "kie_record_failed", detail: json ?? (await upstream.text().catch(() => "")) },
      { status: 500 }
    )
  }

  const d = json.data
  if (d.successFlag === 0) {
    return NextResponse.json({ status: "generating", progress: d.progress ?? null, taskId: d.taskId })
  }
  if (d.successFlag === 2) {
    return NextResponse.json({ status: "failed", taskId: d.taskId, error: d.errorMessage ?? "failed" })
  }

  const url = d.response?.result_urls?.[0]
  if (!url) return NextResponse.json({ status: "failed", taskId: d.taskId, error: "missing result url" })

  return NextResponse.json({ status: "ready", taskId: d.taskId, imageUrl: url })
}
