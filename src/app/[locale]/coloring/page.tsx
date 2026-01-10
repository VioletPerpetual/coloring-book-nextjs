"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { useTranslations } from "next-intl"

type Format = "default" | "square" | "landscape"
type Quality = "medium" | "high"

function cx(...cls: Array<string | false | null | undefined>) {
  return cls.filter(Boolean).join(" ")
}

function formatToLabel(f: Format) {
  if (f === "square") return "1:1"
  if (f === "landscape") return "3:2"
  return "2:3"
}

// 提示词模板：在前端拼好，传给 /api/coloring
function buildPrompt(userInput: string) {
  return `Black & white refined lineart 用户输入的提示词：${userInput}, [scene type], elegant mood, 6–8 detailed elements, crisp high-contrast outlines, coloring-book style. --stylize 750 --no watermarks --no signature`
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export default function ColoringPage() {
  const t = useTranslations("pages.coloring")

  const PRESETS = useMemo(
    () =>
      [
        { key: "bluey", label: t("presetBluey"), value: "a cute dog holding gifts" },
        { key: "spiderman", label: t("presetSpiderman"), value: "spiderman reading books in a cozy library" },
        { key: "farm", label: t("presetFarm"), value: "a busy farm with animals and tractors" },
      ] as const,
    [t]
  )

  const [scene, setScene] = useState("")
  const [format, setFormat] = useState<Format>("default")
  const [quality, setQuality] = useState<Quality>("medium")

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>("")
  const [taskId, setTaskId] = useState<string>("")
  const [imageUrl, setImageUrl] = useState<string>("")

  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef<number | null>(null)

  // 轮询任务时可中断
  const abortRef = useRef<AbortController | null>(null)

  const canGenerate = useMemo(() => scene.trim().length > 0 && !loading, [scene, loading])

  useEffect(() => {
    if (!loading) {
      setElapsed(0)
      if (timerRef.current) window.clearInterval(timerRef.current)
      timerRef.current = null
      return
    }

    const start = Date.now()
    timerRef.current = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000))
    }, 1000)

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [loading])

  async function onGenerate() {
    const userInput = scene.trim()
    if (!userInput) return

    // 取消上一次生成
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    setLoading(true)
    setError("")
    setImageUrl("")
    setTaskId("")

    const softTimeout = window.setTimeout(() => {
      setError(t("softTimeout"))
    }, 30000)

    try {
      // 1) 拼接最终 prompt
      const prompt = buildPrompt(userInput)

      // 2) 走你项目里已有的 /api/coloring（服务端带 KIE key 转发）
      const res = await fetch("/api/coloring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortRef.current.signal,
        body: JSON.stringify({
          prompt,
          // KIE 支持 size: 1:1 / 3:2 / 2:3
          size: formatToLabel(format),
          // KIE 支持 nVariants（要几张图），这里默认 1
          nVariants: 1,
          // quality 目前仅保留 UI（不确定 KIE 是否支持，不传更稳）
          // quality,
        }),
      })

      const data = await res.json().catch(() => null)

      if (!res.ok) {
        const msg = data?.failMsg || data?.error || (res.status === 504 ? t("timeout") : t("failed"))
        throw new Error(msg)
      }

      const id = String(data?.taskId ?? "")
      if (!id) throw new Error(t("failed"))
      setTaskId(id)

      // 3) 轮询获取结果：最多 60 秒（30 次 * 2 秒）
      for (let i = 0; i < 30; i++) {
        await sleep(2000)

        const poll = await fetch(`/api/coloring?taskId=${encodeURIComponent(id)}`, {
          method: "GET",
          signal: abortRef.current.signal,
        })

        const p = await poll.json().catch(() => null)
        if (!poll.ok) continue

        if (p?.status === "ready" && p?.imageUrl) {
          setImageUrl(String(p.imageUrl))
          return
        }

        if (p?.status === "failed") {
          throw new Error(p?.error || t("failed"))
        }
        // status === "generating" -> 继续轮询
      }

      throw new Error(t("timeout"))
    } catch (e: any) {
      if (e?.name === "AbortError") return
      setError(e?.message || t("failed"))
    } finally {
      window.clearTimeout(softTimeout)
      setLoading(false)
    }
  }

  function onPickPreset(v: string) {
    setScene(v)
    setError("")
  }

  function onClear() {
    abortRef.current?.abort()
    setScene("")
    setError("")
    setTaskId("")
    setImageUrl("")
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-10">
      <div className="mx-auto max-w-2xl text-center">
        <div className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
          {t("badge")}
        </div>

        <h1 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">{t("title")}</h1>
        <p className="mt-3 text-sm text-muted-foreground md:text-base">{t("subtitle")}</p>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Left */}
        <section className="rounded-2xl border bg-background p-5 shadow-sm">
          <div className="rounded-2xl border bg-muted/20 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{t("previewTitle")}</p>
              <span className="rounded-full border bg-background px-2 py-1 text-xs text-muted-foreground">
                {t("example")}
              </span>
            </div>

            <div className="mt-3 overflow-hidden rounded-xl border bg-background">
              <img
                src="https://gencolor.ai/images/home/case/result_01.webp"
                alt="example coloring"
                className="h-auto w-full object-contain"
                loading="lazy"
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => onPickPreset(p.value)}
                  className="rounded-full border bg-background px-4 py-2 text-sm transition hover:bg-muted"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-medium">{t("resultTitle")}</h2>

                {loading ? (
                  <span className="rounded-full bg-orange-50 px-2 py-1 text-xs text-orange-700">
                    {t("statusGenerating")}
                  </span>
                ) : imageUrl ? (
                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
                    {t("statusReady")}
                  </span>
                ) : (
                  <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                    {t("statusEmpty")}
                  </span>
                )}
              </div>

              {taskId ? (
                <span className="max-w-[52%] truncate text-xs text-muted-foreground" title={taskId}>
                  {t("taskId")}: {taskId}
                </span>
              ) : null}
            </div>

            <div className="mt-3 rounded-2xl border bg-muted/15 p-4">
              {loading ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{t("generatingHint")}</span>
                    <span>{elapsed}s</span>
                  </div>

                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full w-1/2 animate-pulse rounded-full bg-orange-500" aria-hidden="true" />
                  </div>

                  <p className="text-xs text-muted-foreground">{t("queueHint")}</p>
                </div>
              ) : imageUrl ? (
                <div className="space-y-4">
                  <div className="overflow-hidden rounded-xl border bg-background">
                    <img src={imageUrl} alt="generated coloring page" className="h-auto w-full object-contain" />
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <a
                      href={imageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl border bg-background px-4 py-2 text-sm transition hover:bg-muted"
                    >
                      {t("openNewTab")}
                    </a>

                    <a
                      href={imageUrl}
                      download
                      className="rounded-xl border bg-background px-4 py-2 text-sm transition hover:bg-muted"
                    >
                      {t("download")}
                    </a>

                    <button
                      type="button"
                      onClick={onClear}
                      className="rounded-xl border bg-background px-4 py-2 text-sm transition hover:bg-muted"
                    >
                      {t("clear")}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>{t("emptyLine1")}</p>
                  <p>{t("emptyLine2")}</p>
                </div>
              )}
            </div>

            {error ? (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}
          </div>
        </section>

        {/* Right */}
        <section className="rounded-2xl border bg-background p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold tracking-tight">{t("promptTitle")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("promptDesc")}</p>
            </div>

            <div className="rounded-xl border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              {t("aspect")}: <span className="font-medium text-foreground">{formatToLabel(format)}</span>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border bg-background p-3">
            <textarea
              value={scene}
              onChange={(e) => setScene(e.target.value)}
              placeholder={t("placeholder")}
              className="h-44 w-full resize-none rounded-xl border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-orange-500 md:h-52"
            />
            <p className="mt-2 text-xs text-muted-foreground">{t("promptLangHint")}</p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <SegButton active={format === "default"} onClick={() => setFormat("default")} label={t("fmtDefault")} />
              <SegButton active={format === "square"} onClick={() => setFormat("square")} label={t("fmtSquare")} />
              <SegButton active={format === "landscape"} onClick={() => setFormat("landscape")} label={t("fmtLandscape")} />

              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{t("quality")}</span>
                <select
                  value={quality}
                  onChange={(e) => setQuality(e.target.value as Quality)}
                  className="rounded-xl border bg-background px-3 py-2 text-sm"
                >
                  <option value="medium">{t("qualityMedium")}</option>
                  <option value="high">{t("qualityHigh")}</option>
                </select>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3">
              <button
                type="button"
                disabled={!canGenerate}
                onClick={onGenerate}
                className={cx(
                  "w-full rounded-2xl px-4 py-3 text-sm font-medium text-white transition",
                  "bg-orange-500 hover:bg-orange-600",
                  "disabled:cursor-not-allowed disabled:opacity-60"
                )}
              >
                {loading ? t("generatingBtn") : t("cta")}
              </button>

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{t("tip")}</span>
                <button
                  type="button"
                  onClick={onClear}
                  className="rounded-lg border bg-background px-3 py-1.5 transition hover:bg-muted"
                >
                  {t("clear")}
                </button>
              </div>
            </div>

            <div className="mt-4 rounded-xl border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">{t("footerNote")}</div>
          </div>
        </section>
      </div>
    </main>
  )
}

function SegButton(props: { active: boolean; onClick: () => void; label: string }) {
  const { active, onClick, label } = props
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "rounded-xl border px-4 py-2 text-sm transition",
        active ? "border-orange-500 bg-orange-50 text-orange-700" : "bg-background hover:bg-muted"
      )}
    >
      {label}
    </button>
  )
}
