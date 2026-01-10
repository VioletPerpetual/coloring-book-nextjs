// src/app/api/generate/route.ts
import { NextResponse } from "next/server"

export const runtime = "nodejs"

type Format = "default" | "square" | "landscape"
type Quality = "medium" | "high"

type CreateTaskResp =
  | { code: 200; msg: string; data: { taskId: string } }
  | { code: number; msg: string; data?: any }

type RecordInfoResp =
  | {
      code: 200
      msg: string
      data: {
        taskId: string
        model: string
        state: "waiting" | "success" | "fail"
        resultJson?: string | null
        failCode?: string | null
        failMsg?: string | null
      }
    }
  | { code: number; msg: string; data?: any }

function mapAspectRatio(format: Format): "1:1" | "2:3" | "3:2" {
  if (format === "square") return "1:1"
  if (format === "landscape") return "3:2"
  return "2:3"
}

function buildPrompt(scene: string) {
  const clean = String(scene ?? "").trim()
  return `Black & white refined lineart 用户输入的提示词：${clean}, elegant mood, 6–8 detailed elements, crisp high-contrast outlines, coloring-book style. --stylize 750 --no watermarks --no signature`
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function parseResultUrl(resultJsonStr?: string | null) {
  if (!resultJsonStr) return undefined
  try {
    const parsed = JSON.parse(resultJsonStr) as { resultUrls?: string[] }
    return parsed?.resultUrls?.[0]
  } catch {
    return undefined
  }
}

export async function POST(req: Request) {
  const API_KEY = process.env.KIE_API_KEY
  const BASE = process.env.KIE_API_BASE || "https://api.kie.ai"

  if (!API_KEY) {
    return NextResponse.json({ error: "Missing KIE_API_KEY" }, { status: 500 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const scene = String(body?.scene ?? "").trim()
  const format = (body?.format ?? "default") as Format
  const quality = (body?.quality ?? "medium") as Quality

  if (!scene) {
    return NextResponse.json({ error: "scene is required" }, { status: 400 })
  }
  if (quality !== "medium" && quality !== "high") {
    return NextResponse.json({ error: "quality must be medium|high" }, { status: 400 })
  }

  const prompt = buildPrompt(scene)
  const aspect_ratio = mapAspectRatio(format)

  // ---- optional logs: helps you see where it hangs ----
  console.log("[generate] start", { format, aspect_ratio, quality, sceneLen: scene.length })

  // 1) Create task
  const createResp = await fetch(`${BASE}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-image/1.5-text-to-image",
      input: { prompt, aspect_ratio, quality },
    }),
  })

  const createJson = (await createResp.json().catch(() => null)) as CreateTaskResp | null

  console.log("[generate] createTask http:", createResp.status, "bodyCode:", (createJson as any)?.code)

  if (!createResp.ok || !createJson || (createJson as any)?.code !== 200) {
    return NextResponse.json(
      { error: "createTask failed", status: createResp.status, detail: createJson },
      { status: 502 }
    )
  }

  const taskId = (createJson as any).data?.taskId as string | undefined
  if (!taskId) {
    return NextResponse.json({ error: "No taskId returned", detail: createJson }, { status: 502 })
  }

  console.log("[generate] taskId:", taskId)

  // 2) Poll recordInfo
  const timeoutMs = 180_000
  const intervalMs = 2000
  const start = Date.now()

  // simple backoff for unstable recordInfo
  let backoff = intervalMs

  while (Date.now() - start < timeoutMs) {
    const elapsed = Date.now() - start

    const qResp = await fetch(
      `${BASE}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
      {
        headers: { Authorization: `Bearer ${API_KEY}` },
        cache: "no-store",
      }
    )

    const qJson = (await qResp.json().catch(() => null)) as RecordInfoResp | null

    if (!qResp.ok || !qJson || (qJson as any)?.code !== 200) {
      backoff = Math.min(backoff + 500, 5000)
      console.log("[generate] poll failed; backoff", { elapsed, http: qResp.status, backoff })
      await sleep(backoff)
      continue
    }

    backoff = intervalMs

    const state = (qJson as any).data?.state as "waiting" | "success" | "fail" | undefined
    console.log("[generate] state:", state, "elapsed:", elapsed)

    if (state === "success") {
      const imageUrl = parseResultUrl((qJson as any).data?.resultJson)

      if (!imageUrl) {
        return NextResponse.json(
          { error: "success but no resultUrls", taskId, detail: (qJson as any).data },
          { status: 502 }
        )
      }

      return NextResponse.json({ taskId, state, imageUrl })
    }

    if (state === "fail") {
      return NextResponse.json(
        {
          taskId,
          state,
          failCode: (qJson as any).data?.failCode ?? null,
          failMsg: (qJson as any).data?.failMsg ?? "Unknown failure",
        },
        { status: 502 }
      )
    }

    await sleep(intervalMs)
  }

  // timeout: keep taskId so you can query later if needed
  return NextResponse.json({ taskId, state: "timeout", error: "Polling timed out" }, { status: 504 })
}
