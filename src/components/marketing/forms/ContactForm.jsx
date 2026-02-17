"use client";

import { useState } from "react";

/**
 * Contact form with basic validation and user feedback states.
 */
export default function ContactForm() {
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  function handleChange(event) {
    setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    setSuccess(false);

    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      setError("Please complete all fields before submitting.");
      return;
    }

    setError("");
    setSuccess(true);
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900">Send us a message</h3>
      <div className="mt-4 space-y-4">
        <input
          name="name"
          value={form.name}
          onChange={handleChange}
          placeholder="Your name"
          className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-indigo-600"
        />
        <input
          name="email"
          type="email"
          value={form.email}
          onChange={handleChange}
          placeholder="Your email"
          className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-indigo-600"
        />
        <textarea
          name="message"
          value={form.message}
          onChange={handleChange}
          placeholder="How can we help?"
          rows={5}
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-600"
        />
      </div>
      {error ? <p className="mt-3 text-xs font-medium text-rose-700">{error}</p> : null}
      {success ? <p className="mt-3 text-xs font-medium text-emerald-700">Message submitted. We will contact you soon.</p> : null}
      <button type="submit" className="mt-5 rounded-full bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-600">
        Submit
      </button>
    </form>
  );
}
