import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export default function StyledSelect({
  value,
  onChange,
  options,
  name,
  placeholder = 'Select an option',
  disabled = false,
  required = false,
  className = '',
  buttonClassName = '',
  ariaLabel,
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef(null);
  const listId = useId();
  const selectedIndex = options.findIndex(option => String(option.value) === String(value));
  const selected = options[selectedIndex];

  useEffect(() => {
    function closeOnOutsidePointer(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    function closeOnEscape(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  function emitChange(option) {
    if (option.disabled) return;
    onChange?.({ target: { name, value: option.value } });
    setOpen(false);
  }

  function moveActive(direction) {
    const enabledIndexes = options.map((option, index) => option.disabled ? -1 : index).filter(index => index >= 0);
    if (!enabledIndexes.length) return;
    const currentPosition = enabledIndexes.indexOf(activeIndex);
    const fallbackPosition = enabledIndexes.indexOf(selectedIndex);
    const position = currentPosition >= 0 ? currentPosition : Math.max(fallbackPosition, 0);
    setActiveIndex(enabledIndexes[(position + direction + enabledIndexes.length) % enabledIndexes.length]);
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) setOpen(true);
      moveActive(event.key === 'ArrowDown' ? 1 : -1);
    } else if ((event.key === 'Enter' || event.key === ' ') && open && activeIndex >= 0) {
      event.preventDefault();
      emitChange(options[activeIndex]);
    } else if (event.key === 'Home' && open) {
      event.preventDefault();
      setActiveIndex(options.findIndex(option => !option.disabled));
    } else if (event.key === 'End' && open) {
      event.preventDefault();
      for (let index = options.length - 1; index >= 0; index -= 1) {
        if (!options[index].disabled) {
          setActiveIndex(index);
          break;
        }
      }
    }
  }

  return <div ref={rootRef} className={`relative ${className}`}>
    <button
      type="button"
      role="combobox"
      aria-label={ariaLabel || placeholder}
      aria-controls={listId}
      aria-expanded={open}
      aria-haspopup="listbox"
      aria-required={required}
      disabled={disabled}
      onClick={() => {
        setOpen(current => !current);
        setActiveIndex(selectedIndex >= 0 ? selectedIndex : options.findIndex(option => !option.disabled));
      }}
      onKeyDown={handleKeyDown}
      className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-xl border border-black/15 bg-[#f7f8f4] px-3.5 py-2.5 text-left text-sm text-ink shadow-[0_1px_2px_rgba(17,24,20,0.04),inset_0_1px_0_rgba(255,255,255,0.8)] transition hover:border-seal hover:bg-seal/[0.06] focus:border-seal focus:outline-none focus:ring-4 focus:ring-seal/10 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/15 dark:bg-[#17211d] dark:text-paper dark:shadow-none dark:hover:border-seal dark:hover:bg-seal/10 ${buttonClassName}`}
    >
      <span className={selected ? '' : 'text-ink/40 dark:text-white/40'}>{selected?.label || placeholder}</span>
      <ChevronDown size={16} className={`shrink-0 text-ink/45 transition-transform dark:text-white/45 ${open ? 'rotate-180 text-seal' : ''}`} aria-hidden="true" />
    </button>

    {open && <div id={listId} role="listbox" aria-label={ariaLabel || placeholder} className="absolute left-0 right-0 z-[80] mt-2 max-h-64 overflow-y-auto rounded-xl border border-black/10 bg-white p-1.5 shadow-[0_18px_50px_-18px_rgba(13,25,19,0.45)] dark:border-white/15 dark:bg-[#101714]">
      {options.map((option, index) => {
        const isSelected = String(option.value) === String(value);
        const isActive = index === activeIndex;
        return <button
          key={`${option.value}-${index}`}
          type="button"
          role="option"
          aria-selected={isSelected}
          disabled={option.disabled}
          onMouseEnter={() => setActiveIndex(index)}
          onClick={() => emitChange(option)}
          className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-35 ${isSelected ? 'bg-seal text-[#0d211a]' : isActive ? 'bg-seal/15 text-sealDark dark:text-seal' : 'text-ink hover:bg-seal/10 hover:text-sealDark dark:text-paper dark:hover:bg-seal/15 dark:hover:text-seal'}`}
        >
          <span>{option.label}</span>
          {isSelected && <Check size={15} strokeWidth={2.5} aria-hidden="true" />}
        </button>;
      })}
    </div>}
  </div>;
}
