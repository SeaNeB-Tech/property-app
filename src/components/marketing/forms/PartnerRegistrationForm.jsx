"use client";

import { useState } from "react";

/**
 * Partner onboarding form with lightweight client-side validation.
 */
export default function PartnerRegistrationForm() {
  const [form, setForm] = useState({ name: "", email: "", company: "", partnerType: "Broker" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  function handleChange(event) {
    setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    setSuccess(false);

    if (!form.name.trim() || !form.email.trim() || !form.company.trim()) {
      setError("Please fill all required fields.");
      return;
    }

    setError("");
    setSuccess(true);
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900">Partner registration</h3>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <input
          name="name"
          value={form.name}
          onChange={handleChange}
          placeholder="Full name"
          className="h-11 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-cyan-600"
        />
        <input
          name="email"
          type="email"
          value={form.email}
          onChange={handleChange}
          placeholder="Work email"
          className="h-11 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-cyan-600"
        />
        <input
          name="company"
          value={form.company}
          onChange={handleChange}
          placeholder="Company name"
          className="h-11 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-cyan-600"
        />
        <select
          name="partnerType"
          value={form.partnerType}
          onChange={handleChange}
          className="h-11 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-cyan-600"
        >
          <option>Broker</option>
          <option>Builder</option>
          <option>Agent</option>
        </select>
      </div>
      {error ? <p className="mt-3 text-xs font-medium text-rose-700">{error}</p> : null}
      {success ? <p className="mt-3 text-xs font-medium text-emerald-700">Registration submitted successfully.</p> : null}
      <button type="submit" className="mt-5 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
        Submit Application
      </button>
    </form>
  );
}
