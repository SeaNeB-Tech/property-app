"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { getCookie } from "@/services/cookie"
import { setDashboardMode, DASHBOARD_MODE_USER } from "@/services/dashboardMode.service"
import AuthCard1 from "@/components/ui/AuthCard1"
import AuthHeader from "@/components/ui/AuthHeader"

export default function BusinessOptionPage() {
  const router = useRouter()
  const [language, setLanguage] = useState("eng")
  const isProfileCompleted = getCookie("profile_completed") === "true"

  // Guard: User must have completed profile to see this page
  useEffect(() => {
    if (!isProfileCompleted) {
      router.replace("/auth/login")
    }
  }, [isProfileCompleted, router])

  const handleHaveBusiness = () => {
    // Redirect to business registration page
    router.push("/auth/business-register")
  }

  const handleSkip = () => {
    // Skip and go to regular user dashboard
    setDashboardMode(DASHBOARD_MODE_USER)
    router.push("/dashboard")
  }

  if (!isProfileCompleted) return null

  return (
    <AuthCard1 header={<AuthHeader language={language} setLanguage={setLanguage} />}>
      <div className="space-y-6">
        {/* Header */}
        <div className="business-option-header">
          <h1 className="business-option-title">
            🏢 Do You Have a Business?
          </h1>
          <p className="business-option-subtitle">
            Grow your business with our broker management platform
          </p>
        </div>

        {/* Options Container */}
        <div className="business-options-grid">
          {/* Option 1: Register Business */}
          <button
            onClick={handleHaveBusiness}
            className="business-option-card"
          >
            <div className="business-option-icon">📱</div>
            <h2 className="business-option-card-title">
              Register Your Business
            </h2>
            <p className="business-option-card-desc">
              List properties and manage your real estate business
            </p>
            <div className="business-option-badge">
              Get Started →
            </div>
          </button>

          {/* Option 2: Skip */}
          <button
            onClick={handleSkip}
            className="business-option-card"
          >
            <div className="business-option-icon">👤</div>
            <h2 className="business-option-card-title">
              Continue as User
            </h2>
            <p className="business-option-card-desc">
              Explore properties and find your dream home
            </p>
            <div className="business-option-badge">
              Skip for Now →
            </div>
          </button>
        </div>

        {/* Info Section */}
        <div className="business-info-box">
          <p className="business-info-box-text">
            <span className="business-info-box-highlight">💡 Tip:</span> You can always register your business later from your dashboard settings.
          </p>
        </div>
      </div>
    </AuthCard1>
  )
}

