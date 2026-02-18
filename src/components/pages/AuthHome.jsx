"use client";

import Link from "next/link";

export default function AuthHome() {
  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-3xl mx-auto bg-white p-6 rounded-lg shadow">
        <h1 className="text-2xl font-semibold mb-4">Auth / Home</h1>
        <p className="text-gray-600 mb-4">This is a simple `auth/home` page you requested.</p>
        <div className="mt-6">
          <Link href="/" className="text-sm text-gray-500">← Back to Home</Link>
        </div>
      </div>
    </div>
  );
}
