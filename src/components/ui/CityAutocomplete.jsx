"use client";

import { useState, useEffect, useRef } from "react";
import { getCities } from "@/services/city.services";

export default function AutoComplete({
  value,
  onChange,
  onSelect,
  placeholder,
}) {
  const [open, setOpen] = useState(false);
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef(null);

  const debouncedValue = useDebounce(value, 300);


  useEffect(() => {
    let active = true;

    if (!debouncedValue || debouncedValue.trim().length < 2) {
      setCities([]);
      setOpen(false);
      return;
    }

    const fetchCities = async () => {
      try {
        setLoading(true);
        const list = await getCities(debouncedValue.trim());

        if (active) {
          setCities(Array.isArray(list) ? list : []);
          setOpen(true);
        }
      } catch {
        if (active) setCities([]);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchCities();

    return () => {
      active = false;
    };
  }, [debouncedValue]);


  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, []);


  return (
    <div className="autocomplete" ref={wrapperRef}>
      <input
        type="text"
        className="reg-input"
        placeholder={placeholder}
        value={value}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => value?.length >= 2 && setOpen(true)}
      />

      {open && (
        <div className="suggestion-box">
          {loading && <div className="suggestion-item">Loading...</div>}

          {!loading && cities.length === 0 && (
            <div className="suggestion-item">No cities found</div>
          )}

          {!loading &&
            cities.map((city, index) => {
              const label = `${city.city_name}${
                city.state_name ? `, ${city.state_name}` : ""
              }${city.country_name ? `, ${city.country_name}` : ""}`;

              return (
                <div
                  key={city.place_id || index}
                  className="suggestion-item"
                  onMouseDown={() => {
                    onChange(label);
                    onSelect?.({
                      label,
                      place_id: city.place_id,
                    });
                    setOpen(false);
                  }}
                >
                  <strong>{city.city_name}</strong>
                  {city.state_name && `, ${city.state_name}`}
                  {city.country_name && `, ${city.country_name}`}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
