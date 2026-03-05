"use client"

import { useState, useRef, useEffect } from "react"
import Image from "next/image"
import phoneCodes from "@/constants/phoneCodes.json"

export default function PhoneInput({
  t,
  mobile,
  setMobile,
  country,
  setCountry,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [dropdownStyle, setDropdownStyle] = useState({});
  const wrapperRef = useRef(null);
  const buttonRef = useRef(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      // Close dropdown if click is outside wrapper and dropdown
      if (
        wrapperRef.current && 
        !wrapperRef.current.contains(e.target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownStyle({
        top: rect.bottom + 8,
        left: rect.left,
        width: rect.width,
      });
    }
  }, [open]);

  const filteredCountries = phoneCodes.filter((c) => {
    const searchTerm = search.toLowerCase().trim();
    if (!searchTerm) return true;
    
    return (
      c.name.toLowerCase().includes(searchTerm) ||
      c.dialCode.includes(searchTerm) ||
      (c.code && c.code.toLowerCase().includes(searchTerm))
    );
  });

  return (
    <>
      <label className="text-sm font-medium text-black block mb-2">
        {t.mobileLabel}
      </label>

      <div ref={wrapperRef} className="relative mb-6">
        <div
          ref={buttonRef}
          className="flex items-center w-full rounded-lg border border-gray-300 bg-white px-3 h-[44px]"
        >
          <button
            type="button"
            onClick={() => setOpen((p) => !p)}
            className="flex items-center gap-2 min-w-[110px] text-sm text-black shrink-0 focus:outline-none"
          >
            <Image
              src={country.flag}
              alt={country.name}
              width={20}
              height={16}
              className="w-5 h-4 object-cover rounded-sm"
            />
            <span>{country.dialCode}</span>
            <span className="ml-auto text-gray-500 text-xs">v</span>
          </button>

          <div className="mx-3 h-5 w-px bg-gray-200 shrink-0" />

          <input
            type="text"
            inputMode="numeric"
            maxLength={10}
            placeholder={t.placeholder}
            value={mobile}
            onChange={(e) =>
              setMobile(e.target.value.replace(/\D/g, ""))
            }
            className="flex-1 min-w-0 outline-none text-sm text-black bg-transparent"
          />
        </div>
      </div>

      {open && (
        <div ref={dropdownRef} className="phone-dropdown" style={dropdownStyle}>
          <input
            type="text"
            placeholder="Search country"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            autoComplete="off"
          />

          <ul>
            {filteredCountries.length === 0 && (
              <li className="px-4 py-3 text-sm text-gray-500" style={{cursor: 'default'}}>
                No country found
              </li>
            )}

            {filteredCountries.map((c) => (
              <li
                key={`${c.name}-${c.dialCode}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setCountry(c);
                  setOpen(false);
                  setSearch("");
                }}
                role="option"
                aria-selected={country.dialCode === c.dialCode}
                tabIndex={0}
              >
                <div className="flex items-center gap-3">
                  <Image src={c.flag} alt={c.name} width={20} height={16} />
                  <span>{c.name}</span>
                </div>
                <span>{c.dialCode}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

