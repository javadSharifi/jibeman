import { useId, type ChangeEvent, type ComponentPropsWithoutRef } from 'react';
import { Money } from '../core/money';

type AmountInputProps = Omit<ComponentPropsWithoutRef<'input'>, 'type' | 'value' | 'onChange' | 'inputMode' | 'defaultValue'> & {
  value: string;
  onChange: (value: string) => void;
  maxDigits?: number;
  allowNegative?: boolean;
  wordsClassName?: string;
};

function displayOffset(formatted: string, rawOffset: number): number {
  if (rawOffset <= 0) return 0;
  for (let index = 0; index < formatted.length; index++) {
    if (formatted[index] !== ',' && --rawOffset === 0) return index + 1;
  }
  return formatted.length;
}

export function AmountInput({
  value, onChange, maxDigits = 13, allowNegative = false,
  wordsClassName = 'mt-1 text-[11px] text-muted', ...inputProps
}: AmountInputProps) {
  const wordsId = useId();
  const formatted = Money.formatAmountInput(value);
  const rial = Money.parseToman(value, allowNegative);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const entered = input.value;
    const cursor = input.selectionStart ?? entered.length;
    let next = Money.normalizeAmountInput(entered, maxDigits, allowNegative);
    let rawOffset = Money.ascii(entered.slice(0, cursor)).replace(/\s/g, '').length;

    // When the browser deletes just a grouping comma, remove the adjacent digit.
    if (next === value && entered.length === formatted.length - 1) {
      const inputType = (event.nativeEvent as InputEvent).inputType;
      const removed = inputType === 'deleteContentBackward' ? rawOffset - 1
        : inputType === 'deleteContentForward' ? rawOffset : -1;
      if (removed >= 0 && /\d/.test(value.charAt(removed))) {
        next = value.slice(0, removed) + value.slice(removed + 1);
        rawOffset = removed;
      }
    }

    const displayed = next === null ? formatted : Money.formatAmountInput(next);
    if (input.value !== displayed) {
      input.value = displayed;
      const offset = displayOffset(displayed, rawOffset);
      input.setSelectionRange(offset, offset);
    }
    if (next !== null) onChange(next);
  };

  return (
    <>
      <input {...inputProps} type="text" inputMode="decimal" dir="ltr" value={formatted}
        aria-describedby={rial === null ? inputProps['aria-describedby'] : [inputProps['aria-describedby'], wordsId].filter(Boolean).join(' ')}
        onChange={handleChange} />
      {rial !== null && <p id={wordsId} className={wordsClassName}>{Money.amountWords(rial)}</p>}
    </>
  );
}
