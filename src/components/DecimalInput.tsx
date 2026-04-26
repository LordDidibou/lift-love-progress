import { forwardRef, useEffect, useState, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: number | string;
  onValueChange: (value: number) => void;
  allowEmpty?: boolean;
};

/**
 * Input numérique acceptant la virgule ET le point (ex: 5,5 ou 5.5).
 * Renvoie toujours un Number via onValueChange.
 */
export const DecimalInput = forwardRef<HTMLInputElement, Props>(
  ({ value, onValueChange, allowEmpty = true, className, ...rest }, ref) => {
    const toDisplay = (v: number | string) => {
      if (v === "" || v === 0) return allowEmpty ? "" : "0";
      return String(v).replace(".", ",");
    };
    const [text, setText] = useState<string>(toDisplay(value));

    // Sync when external value changes (and input isn't being typed mid-decimal)
    useEffect(() => {
      const parsed = Number(text.replace(",", "."));
      if (Number.isNaN(parsed) || parsed !== Number(value)) {
        setText(toDisplay(value));
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    return (
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={text}
        onChange={(e) => {
          // Allow optional leading -, digits, one separator
          let v = e.target.value.replace(/[^0-9.,-]/g, "");
          // Keep "-" only at position 0
          v = v.replace(/(?!^)-/g, "");
          // Keep only the first separator
          const firstSep = v.search(/[.,]/);
          if (firstSep !== -1) {
            v = v.slice(0, firstSep + 1) + v.slice(firstSep + 1).replace(/[.,]/g, "");
          }
          setText(v);
          if (v === "" || v === "," || v === "." || v === "-") {
            onValueChange(0);
            return;
          }
          const num = Number(v.replace(",", "."));
          if (!Number.isNaN(num)) onValueChange(num);
        }}
        onBlur={(e) => {
          const num = Number(e.target.value.replace(",", "."));
          if (Number.isNaN(num) || e.target.value === "") {
            setText(allowEmpty ? "" : "0");
            onValueChange(0);
          } else {
            setText(toDisplay(num));
          }
        }}
        className={cn(className)}
        {...rest}
      />
    );
  },
);
DecimalInput.displayName = "DecimalInput";
