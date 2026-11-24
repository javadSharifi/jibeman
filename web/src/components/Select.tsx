import React, { useState, useRef, useEffect, useId } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectOption<T extends string | number = string | number> {
  value: T;
  label: string;
  sublabel?: string;
  disabled?: boolean;
}

export interface SelectProps<T extends string | number = string | number> {
  value?: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  dropdownClassName?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  align?: 'right' | 'center' | 'left';
  id?: string;
  'aria-label'?: string;
}

export function Select<T extends string | number = string | number>({
  value,
  onChange,
  options,
  placeholder = 'انتخاب کنید',
  className = '',
  buttonClassName = '',
  dropdownClassName = '',
  disabled = false,
  size = 'md',
  align = 'right',
  id,
  'aria-label': ariaLabel,
}: SelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const generatedId = useId();
  const selectId = id || generatedId;

  const selectedOption = options.find((opt) => opt.value === value);

  const toggleDropdown = () => {
    if (disabled) return;
    if (!isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      // Flip upwards if less than 200px below and more room above
      setOpenUpward(spaceBelow < 200 && spaceAbove > spaceBelow);
    }
    setIsOpen((prev) => !prev);
  };

  const handleSelect = (optionValue: T) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Scroll active item into view when opening
  useEffect(() => {
    if (isOpen && listRef.current) {
      const activeEl = listRef.current.querySelector('[data-selected="true"]');
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [isOpen]);

  const heightClass = size === 'sm' ? 'h-9 text-xs' : 'h-11 text-xs';
  const textAlignClass = align === 'center' ? 'text-center' : align === 'left' ? 'text-left' : 'text-right';

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      <button
        id={selectId}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={toggleDropdown}
        className={`w-full ${heightClass} px-3 rounded-xl bg-surface border border-line text-white flex items-center justify-between gap-2 transition-all duration-150 focus:outline-none focus:border-sky active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed ${
          isOpen ? 'border-sky ring-1 ring-sky/20' : 'hover:border-lineStrong'
        } ${buttonClassName}`}
      >
        <span
          className={`flex-1 truncate ${textAlignClass} ${
            selectedOption ? 'text-white font-medium' : 'text-muted'
          }`}
        >
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          size={size === 'sm' ? 14 : 16}
          className={`text-muted shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-sky' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          className={`absolute left-0 right-0 z-50 p-1.5 rounded-2xl bg-[#141A3D] border border-lineStrong shadow-[0_12px_32px_rgba(0,0,0,0.6)] backdrop-blur-xl max-h-56 overflow-y-auto overscroll-contain transition-all ${
            openUpward ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          } ${dropdownClassName}`}
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={String(option.value)}
                type="button"
                role="option"
                aria-selected={isSelected}
                data-selected={isSelected}
                disabled={option.disabled}
                onClick={() => handleSelect(option.value)}
                className={`w-full px-2.5 py-2 rounded-xl text-xs flex items-center justify-between gap-2 transition-colors text-right ${
                  isSelected
                    ? 'bg-sky/15 text-sky font-bold'
                    : 'text-white hover:bg-white/5 active:bg-white/10'
                } ${option.disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="truncate">{option.label}</div>
                  {option.sublabel && (
                    <div className="text-[10px] text-muted truncate mt-0.5">{option.sublabel}</div>
                  )}
                </div>
                {isSelected && <Check size={14} className="text-sky shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
