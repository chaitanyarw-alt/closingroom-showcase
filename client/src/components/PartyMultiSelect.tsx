import { useEffect, useRef, useState } from "react";
import { X, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface PartyMultiSelectProps {
  dealParties: {
    buyerName?: string | null;
    sellerName?: string | null;
    buyerCounsel?: string | null;
    sellerCounsel?: string | null;
  };
  value: string[]; // array of selected party display names
  onChange: (parties: string[], customParty?: string) => void;
  className?: string;
  disabled?: boolean;
}

const ALL_PARTIES_KEY = "All Parties";
const OTHER_KEY = "__other__";

export function PartyMultiSelect({
  dealParties,
  value,
  onChange,
  className,
  disabled,
}: PartyMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [otherText, setOtherText] = useState("");
  const [showOtherInput, setShowOtherInput] = useState(false);
  const [dropdownAbove, setDropdownAbove] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Build the named party options from deal setup
  const namedOptions: string[] = [
    dealParties.buyerName,
    dealParties.sellerName,
    dealParties.buyerCounsel,
    dealParties.sellerCounsel,
  ].filter((p): p is string => !!p && p.trim().length > 0);

  // Detect if "All Parties" is currently selected
  const isAllSelected = value.includes(ALL_PARTIES_KEY);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Detect dropdown position (above or below) based on available space
  useEffect(() => {
    if (!open || !triggerRef.current || !dropdownRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const dropdownRect = dropdownRef.current.getBoundingClientRect();
    const dropdownHeight = dropdownRect.height;
    const viewportHeight = window.innerHeight;

    // Space available below trigger
    const spaceBelow = viewportHeight - triggerRect.bottom;
    // Space available above trigger
    const spaceAbove = triggerRect.top;

    // If dropdown would overflow below and there's more space above, open upward
    const shouldOpenAbove = dropdownHeight > spaceBelow && spaceAbove > spaceBelow;
    setDropdownAbove(shouldOpenAbove);
  }, [open]);

  function toggleOption(option: string) {
    if (option === ALL_PARTIES_KEY) {
      // All Parties overrides everything — select all named parties plus "All Parties" label
      if (isAllSelected) {
        onChange([]);
      } else {
        onChange([ALL_PARTIES_KEY, ...namedOptions]);
      }
      setShowOtherInput(false);
      return;
    }

    if (option === OTHER_KEY) {
      setShowOtherInput((prev) => !prev);
      return;
    }

    // Toggle individual named option
    const next = value.includes(option)
      ? value.filter((v) => v !== option && v !== ALL_PARTIES_KEY)
      : [...value.filter((v) => v !== ALL_PARTIES_KEY), option];
    onChange(next);
  }

  function addOtherParty() {
    const trimmed = otherText.trim();
    if (!trimmed) return;
    const next = [...value.filter((v) => v !== ALL_PARTIES_KEY), trimmed];
    onChange(next);
    setOtherText("");
    setShowOtherInput(false);
  }

  function removeTag(party: string) {
    const next = value.filter((v) => v !== party && v !== ALL_PARTIES_KEY);
    onChange(next);
  }

  const displayValue = value.filter((v) => v !== ALL_PARTIES_KEY);
  const showAllTag = isAllSelected;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Trigger field */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "w-full min-h-[34px] px-2 py-1.5 text-left text-sm border border-border rounded-md bg-background",
          "flex flex-wrap gap-1 items-center cursor-pointer",
          "focus:outline-none focus:ring-1 focus:ring-primary/40",
          "hover:border-primary/40 transition-colors",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        {showAllTag ? (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary border border-primary/20">
            All Parties
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange([]); }}
              className="ml-0.5 hover:text-destructive"
            >
              <X size={10} />
            </button>
          </span>
        ) : displayValue.length > 0 ? (
          displayValue.map((p) => (
            <span
              key={p}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-muted text-foreground border border-border"
            >
              {p}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); removeTag(p); }}
                className="ml-0.5 hover:text-destructive"
              >
                <X size={10} />
              </button>
            </span>
          ))
        ) : (
          <span className="text-muted-foreground text-xs">Assign party…</span>
        )}
        <ChevronDown size={14} className="ml-auto shrink-0 text-muted-foreground" />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          ref={dropdownRef}
          className={cn(
            "absolute z-50 w-full min-w-[180px] bg-popover border border-border rounded-md shadow-lg py-1 text-sm",
            dropdownAbove ? "bottom-full mb-1" : "top-full mt-1"
          )}
        >
          {/* Named deal parties */}
          {namedOptions.map((opt) => {
            const checked = isAllSelected || value.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggleOption(opt)}
                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent text-left text-xs"
              >
                <span className={cn(
                  "w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0",
                  checked ? "bg-primary border-primary" : "border-border"
                )}>
                  {checked && (
                    <svg viewBox="0 0 10 8" className="w-2.5 h-2.5 text-primary-foreground fill-current">
                      <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className="truncate">{opt}</span>
              </button>
            );
          })}

          {namedOptions.length > 0 && (
            <div className="my-1 border-t border-border" />
          )}

          {/* All Parties */}
          <button
            type="button"
            onClick={() => toggleOption(ALL_PARTIES_KEY)}
            className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent text-left text-xs"
          >
            <span className={cn(
              "w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0",
              isAllSelected ? "bg-primary border-primary" : "border-border"
            )}>
              {isAllSelected && (
                <svg viewBox="0 0 10 8" className="w-2.5 h-2.5 text-primary-foreground fill-current">
                  <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            <span className="font-medium">All Parties</span>
          </button>

          {/* Other */}
          <button
            type="button"
            onClick={() => toggleOption(OTHER_KEY)}
            className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent text-left text-xs"
          >
            <span className="w-3.5 h-3.5 rounded border border-border flex items-center justify-center shrink-0" />
            <span className="text-muted-foreground">Other…</span>
          </button>

          {/* Other free-text input */}
          {showOtherInput && (
            <div className="px-3 py-2 border-t border-border">
              <div className="flex gap-1">
                <input
                  autoFocus
                  type="text"
                  value={otherText}
                  onChange={(e) => setOtherText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); addOtherParty(); }
                    if (e.key === "Escape") setShowOtherInput(false);
                  }}
                  placeholder="Type party name…"
                  className="flex-1 text-xs border border-border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
                <button
                  type="button"
                  onClick={addOtherParty}
                  className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90"
                >
                  Add
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
