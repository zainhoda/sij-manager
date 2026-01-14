// Force HMR reload
import React, { useState, useRef, useEffect } from "react";

export interface MultiSelectOption {
  value: string | number;
  label: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  value: (string | number)[];
  onChange: (value: (string | number)[]) => void;
  onClose?: () => void;
  onToggle?: (newValue: (string | number)[]) => void; // Called after each toggle for immediate saves
  placeholder?: string;
  autoFocus?: boolean;
}

export function MultiSelect({
  options,
  value,
  onChange,
  onClose,
  onToggle,
  placeholder = "Select items...",
  autoFocus = false,
}: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(autoFocus);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Focus search input when opened
  useEffect(() => {
    if (isOpen && searchRef.current) {
      searchRef.current.focus();
    }
  }, [isOpen]);

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        onClose?.();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  // Handle keyboard
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setIsOpen(false);
      onClose?.();
    } else if (e.key === "Enter" && !isOpen) {
      setIsOpen(true);
    }
  };

  const toggleOption = (optionValue: string | number) => {
    const newValue = value.includes(optionValue)
      ? value.filter((v) => v !== optionValue)
      : [...value, optionValue];
    console.log("MultiSelect toggleOption:", { optionValue, newValue, hasOnToggle: !!onToggle });
    // Call onToggle FIRST to ensure it runs before any re-renders from onChange
    onToggle?.(newValue);
    onChange(newValue);
  };

  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(search.toLowerCase())
  );

  const selectedLabels = value
    .map((v) => options.find((opt) => opt.value === v)?.label)
    .filter(Boolean);

  return (
    <div className="multi-select" ref={containerRef} onKeyDown={handleKeyDown}>
      <div
        className={`multi-select-trigger ${isOpen ? "open" : ""}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        {selectedLabels.length === 0 ? (
          <span className="multi-select-placeholder">{placeholder}</span>
        ) : (
          <div className="multi-select-tags">
            {selectedLabels.slice(0, 2).map((label, i) => (
              <span key={i} className="multi-select-tag">
                {label}
              </span>
            ))}
            {selectedLabels.length > 2 && (
              <span className="multi-select-more">+{selectedLabels.length - 2}</span>
            )}
          </div>
        )}
        <span className="multi-select-arrow">{isOpen ? "▲" : "▼"}</span>
      </div>

      {isOpen && (
        <div className="multi-select-dropdown">
          <input
            ref={searchRef}
            type="text"
            className="multi-select-search"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClick={(e) => e.stopPropagation()}
          />
          <div className="multi-select-options">
            {filteredOptions.length === 0 ? (
              <div className="multi-select-empty">No options found</div>
            ) : (
              filteredOptions.map((option) => (
                <label
                  key={option.value}
                  className={`multi-select-option ${
                    value.includes(option.value) ? "selected" : ""
                  }`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={value.includes(option.value)}
                    onChange={() => toggleOption(option.value)}
                  />
                  <span className="multi-select-option-label">{option.label}</span>
                </label>
              ))
            )}
          </div>
          <div className="multi-select-footer">
            <span className="multi-select-count">
              {value.length} selected
            </span>
            {value.length > 0 && (
              <button
                type="button"
                className="multi-select-clear"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange([]);
                }}
              >
                Clear all
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default MultiSelect;
