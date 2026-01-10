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
  const { searchParams } = new URL(req.url)
  const taskId = searchParams.get("taskId")
  if (!taskId) {
    return NextResponse.json({ error: "missing taskId" }, { status: 400 })
  }

  const upstream = await fetch(
    `${process.env.KIE_API_BASE}/api/v1/gpt4o-image/record-info?taskId=${encodeURIComponent(taskId)}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.KIE_API_KEY}`,
      },
    }
  )

  const json = await upstream.json().catch(() => null)

  if (!upstream.ok || !json || json.code !== 200) {
    return NextResponse.json(
      { error: "kie_record_failed", detail: json },
      { status: 500 }
    )
  }

  const data = json.data

  // 0 = 生成中
  if (data.successFlag === 0) {
    return NextResponse.json({
      status: "generating",
      taskId,
      progress: data.progress ?? null,
    })
  }

  // 2 = 失败
  if (data.successFlag === 2) {
    return NextResponse.json({
      status: "failed",
      taskId,
      error: data.errorMessage || "generation failed",
    })
  }

  // 1 = 成功
  const urls = data?.response?.result_urls

  if (!Array.isArray(urls) || urls.length === 0) {
    // ⚠️ 关键：不要当成成功
    return NextResponse.json({
      status: "generating",
      taskId,
      note: "result_urls empty",
    })
  }

  return NextResponse.json({
    status: "ready",
    taskId,
    imageUrl: urls[0], // ✅ 真正的图片 URL
  })
}

