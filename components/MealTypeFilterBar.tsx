'use client'

import { MEAL_TYPE_TAGS, mealTypeToggleClasses } from '../lib/recipe-tags'

type MealTypeFilterBarProps = {
  selected: string[]
  onChange: (selected: string[]) => void
  className?: string
}

export function MealTypeFilterBar({
  selected,
  onChange,
  className = '',
}: MealTypeFilterBarProps) {
  const toggle = (tag: string) => {
    onChange(
      selected.includes(tag)
        ? selected.filter((t) => t !== tag)
        : [...selected, tag]
    )
  }

  return (
    <div className={`flex flex-col gap-2 min-w-0 ${className}`.trim()}>
      <span className="text-sm text-muted">Filter by meal type</span>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange([])}
          className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
            selected.length === 0
              ? 'bg-coral text-on-coral border-coral'
              : 'border-border text-primary/80 hover:border-muted'
          }`}
        >
          All
        </button>
        {MEAL_TYPE_TAGS.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => toggle(tag)}
            className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${mealTypeToggleClasses(
              tag,
              selected.includes(tag)
            )}`}
          >
            {tag}
          </button>
        ))}
      </div>
    </div>
  )
}
