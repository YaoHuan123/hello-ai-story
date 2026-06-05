import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { normalizeYearMonthInRange, yearMonthFromDigits } from "../utils/yearMonth";

const MASK = "YYYY年MM月";

function ymToMaskDigits(ym: string): string {
  const n = normalizeYearMonthInRange(ym);
  if (!n) return "";
  return n.replace("-", "");
}

function buildMaskParts(digits: string): { typed: string; rest: string } {
  const chars: string[] = [];
  let d = 0;
  for (const m of MASK) {
    if (m === "Y" || m === "M") {
      chars.push(d < digits.length ? digits[d]! : m);
      d++;
    } else {
      chars.push(m);
    }
  }
  const full = chars.join("");
  const n = digits.length;
  let typedLen: number;
  if (n < 4) typedLen = n;
  else if (n === 4) typedLen = 5;
  else if (n === 5) typedLen = 6;
  else typedLen = 8;
  return { typed: full.slice(0, typedLen), rest: full.slice(typedLen) };
}

export type YearMonthInputProps = {
  value: string;
  onChange: (ym: string) => void;
  disabled?: boolean;
};

/** 年月输入：灰色 YYYY年MM月 模板，落盘 YYYY-MM。 */
export function YearMonthInput({ value, onChange, disabled }: YearMonthInputProps) {
  const [digits, setDigits] = useState(() => ymToMaskDigits(value));
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const advanceCaretToMonth = useRef(false);

  useEffect(() => {
    if (!focused) {
      setDigits(ymToMaskDigits(value));
    }
  }, [value, focused]);

  useLayoutEffect(() => {
    if (!advanceCaretToMonth.current || !focused) return;
    advanceCaretToMonth.current = false;
    const el = inputRef.current;
    if (!el) return;
    const pos = buildMaskParts(digits).typed.length;
    el.setSelectionRange(pos, pos);
  }, [digits, focused]);

  const { typed, rest } = buildMaskParts(digits);

  const commitDigits = (nextDigits: string) => {
    if (nextDigits.length === 4 && digits.length < 4) {
      advanceCaretToMonth.current = true;
    }
    setDigits(nextDigits);
    if (!nextDigits) {
      onChange("");
      return;
    }
    const ym = yearMonthFromDigits(nextDigits);
    if (ym) {
      const inRange = normalizeYearMonthInRange(ym);
      if (inRange) onChange(inRange);
    }
  };

  return (
    <span style={{ position: "relative", display: "block", width: "100%", maxWidth: 240 }}>
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        aria-label="年月"
        value={typed}
        style={{ boxSizing: "border-box", width: "100%", padding: 8 }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          const ym = normalizeYearMonthInRange(yearMonthFromDigits(digits));
          onChange(ym);
          setDigits(ymToMaskDigits(ym));
        }}
        onChange={(e) => {
          const next = e.target.value.replace(/\D/g, "").slice(0, 6);
          commitDigits(next);
        }}
      />
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: 8,
          top: "50%",
          transform: "translateY(-50%)",
          pointerEvents: "none",
          color: "#aaa",
          fontSize: "inherit",
          whiteSpace: "pre",
        }}
      >
        <span style={{ visibility: "hidden" }}>{typed}</span>
        {rest}
      </span>
    </span>
  );
}
