"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { getCookie } from "@/services/cookie"
import { setDashboardMode, DASHBOARD_MODE_USER } from "@/services/dashboardMode.service"
import { authStore } from "@/app/auth/auth-service/store/authStore"
import { bootstrapProductAuth } from "@/app/auth/auth-service/auth.bootstrap"
import AuthCard1 from "@/components/ui/AuthCard1"
import AuthHeader from "@/components/ui/AuthHeader"

const LANGUAGE_STORAGE_KEY = "auth_language"
const SUPPORTED_LANGUAGES = new Set(["eng", "guj", "hindi"])

export default function BusinessOptionPage() {
  const router = useRouter()
  const [language, setLanguage] = useState(() => {
    if (typeof window !== "undefined") {
      const savedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
      if (savedLanguage && SUPPORTED_LANGUAGES.has(savedLanguage)) {
        return savedLanguage
      }
    }
    return "eng"
  })
  const isProfileCompleted = getCookie("profile_completed") === "true"
  const [hasSession, setHasSession] = useState(false)

  useEffect(() => {
    let active = true

    const checkSession = async () => {
      let sessionOk = !!authStore.getAccessToken()
      if (!sessionOk) {
        try {
          await bootstrapProductAuth()
          sessionOk = !!authStore.getAccessToken()
        } catch {
          sessionOk = false
        }
      }
      if (!active) return
      setHasSession(sessionOk)
      if (!isProfileCompleted || !sessionOk) {
        router.replace("/auth/login")
      }
    }

    checkSession()
    return () => {
      active = false
    }
  }, [isProfileCompleted, router])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (SUPPORTED_LANGUAGES.has(language)) {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
    }
  }, [language])

  const handleHaveBusiness = () => {
    router.push("/auth/business-register")
  }

  const handleSkip = () => {
    setDashboardMode(DASHBOARD_MODE_USER)
    router.push("/dashboard")
  }

  if (!isProfileCompleted || !hasSession) return null

  return (
    <AuthCard1 header={<AuthHeader language={language} setLanguage={setLanguage} />}>
      <div className="mx-auto w-full max-w-4xl space-y-6 sm:space-y-8">
        <div className="rounded-2xl border border-blue-100 bg-blue-50/55 p-4 sm:p-6">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            Do you have a business?
          </h1>
          <p className="mt-2 text-sm text-slate-600 sm:text-base">
            Grow your business with our broker management platform.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-2">
          <button
            onClick={handleHaveBusiness}
            type="button"
            className="group flex h-full flex-col items-start rounded-2xl border border-indigo-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-xs font-bold text-indigo-700">
              BR
            </span>
            <h2 className="mt-4 text-lg font-semibold text-slate-900">
              Register Your Business
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              List properties and manage your real estate business
            </p>
            <span className="mt-4 inline-flex rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition group-hover:bg-indigo-700">
              Get Started
            </span>
          </button>

          <button
            onClick={handleSkip}
            type="button"
            className="group flex h-full flex-col items-start rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-xs font-bold text-slate-700">
              US
            </span>
            <h2 className="mt-4 text-lg font-semibold text-slate-900">
              Continue as User
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Explore properties and find your dream home
            </p>
            <span className="mt-4 inline-flex rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition group-hover:border-slate-400 group-hover:bg-slate-50">
              Skip for Now
            </span>
          </button>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-900">
            <span className="font-semibold">Tip:</span> You can always register your business later from your dashboard settings.
          </p>
        </div>
      </div>
    </AuthCard1>
  )
}
