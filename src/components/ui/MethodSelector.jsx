"use client"

export default function MethodSelector({ t, method, setMethod }) {
  return (
    <div className="flex justify-center mb-6">
      <div className="flex gap-10">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="radio"
            value="whatsapp"
            checked={method === "whatsapp"}
            onChange={e => setMethod(e.target.value)}
          />
          {t.viaWhatsapp}
        </label>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="radio"
            value="sms"
            checked={method === "sms"}
            onChange={e => setMethod(e.target.value)}
          />
          {t.viaSms}
        </label>
      </div>
    </div>
  )
}
