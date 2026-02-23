"use client";

import { useState, useEffect, useRef } from "react";
import { getCities } from "@/services/city.service";
import useDebounce from "@/hooks/useDebounce";

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
  const lastSelectedLabelRef = useRef("");
  const selectedLockRef = useRef(false);

  const debouncedValue = useDebounce(value, 300);
  const dedupeCities = (items = []) => {
    const map = new Map();
    (Array.isArray(items) ? items : []).forEach((city) => {
      const cityName = String(city?.city_name || city?.name || "").trim().toLowerCase();
      const stateName = String(city?.state_name || "").trim().toLowerCase();
      const countryName = String(city?.country_name || "").trim().toLowerCase();
      const placeId = String(city?.place_id || city?.city_id || "").trim();
      const key = placeId || `${cityName}|${stateName}|${countryName}`;
      if (!map.has(key)) {
        map.set(key, city);
      }
    });
    return Array.from(map.values());
  };


  useEffect(() => {
    let active = true;
    const query = debouncedValue?.trim();

    if (
      selectedLockRef.current &&
      query &&
      query === lastSelectedLabelRef.current
    ) {
      setOpen(false);
      setLoading(false);
      return;
    }

    if (!query || query.length < 2) {
      setCities([]);
      setOpen(false);
      setLoading(false);
      return;
    }

    const fetchCities = async () => {
      try {
        setLoading(true);
        setOpen(true);
        const list = await getCities(query);

        if (!active) return;

        const uniqueCities = dedupeCities(list);
        setCities(uniqueCities);
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
    const handleOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);


  return (
    <div className="autocomplete" ref={wrapperRef}>
      <input
        type="text"
        className="form-input"
        placeholder={placeholder}
        value={value}
        autoComplete="off"
        onChange={(e) => {
          const nextValue = e.target.value;
          const selectedLabel = lastSelectedLabelRef.current;
          const hasEditedSelectedValue =
            selectedLockRef.current && nextValue.trim() !== selectedLabel;

          if (hasEditedSelectedValue) {
            selectedLockRef.current = false;
            lastSelectedLabelRef.current = "";
          }

          onChange(nextValue);
          onSelect?.(null); // clear placeId when typing
        }}
        onFocus={() =>
          !selectedLockRef.current &&
          value &&
          value.trim().length >= 2 &&
          (cities.length > 0 || loading) &&
          setOpen(true)
        }
      />

      {open && (
        <div className="autocomplete-box">
          {loading && (
            <div className="autocomplete-item loading">
              Loading...
            </div>
          )}

          {!loading && cities.length === 0 && (
            <div className="autocomplete-item">
              No cities found
            </div>
          )}

          {!loading &&
            cities.map((city, index) => {
              const cityName = city.city_name || city.name || "";
              const stateName = city.state_name || "";
              const countryName = city.country_name || "";
              const resolvedPlaceId = city.place_id || city.city_id || "";
              const label = `${cityName}${
                stateName ? `, ${stateName}` : ""
              }${countryName ? `, ${countryName}` : ""}`;

              return (
                <div
                  key={resolvedPlaceId || index}
                  className="autocomplete-item"
                  onMouseDown={() => {
                    if (!resolvedPlaceId) return;

                    onChange(label);
                    onSelect?.({
                      label,
                      place_id: resolvedPlaceId,
                      city_id: city.city_id,
                    });
                    lastSelectedLabelRef.current = label.trim();
                    selectedLockRef.current = true;
                    setCities([]);
                    setOpen(false);
                  }}
                >
                  <strong>{cityName}</strong>
                  {stateName && `, ${stateName}`}
                  {countryName && `, ${countryName}`}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

