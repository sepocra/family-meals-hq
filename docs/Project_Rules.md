# PROJECT_RULES.md

# Product Vision

This app is intended to become a central operating system for family meals.

The goal is to reduce the mental load of:
- deciding what to cook
- using available ingredients
- planning upcoming meals
- coordinating shopping
- feeding a household consistently

This is not:
- a calorie tracking app
- a chef-focused recipe platform
- a social cooking network

This is a practical family meal coordination tool.

The app should feel:
- calm
- organised
- dependable
- flexible
- fast
- easy to use repeatedly

---

# Overview

This project is a family-focused meal planning and recipe management web app.

Primary focus:
- Family meal coordination
- Ingredient-first planning
- Reducing food waste
- Simplifying meal decisions
- Helping busy households plan meals quickly

Tech stack:
- Next.js App Router
- React
- TypeScript
- Supabase backend
- Tailwind CSS

---

# Core Product Principles

1. Reduce mental load
2. Minimise clicks/taps
3. Mobile-first design
4. Fast page loads
5. Keep workflows obvious
6. Prefer simple over clever
7. Avoid cluttered UI
8. Prioritise readability
9. Dark mode support preferred
10. Family-oriented UX
11. Reduce food waste
12. Prioritise ingredient-first meal planning
13. Help users plan around existing ingredients
14. Support repeatable weekly routines
15. Focus on practical real-world cooking

---

# Household Context

Household includes:
- 2 adults
- 1 toddler
- 1 baby (baby-led weaning)

Dietary requirements:
- Dairy-free
- Peanut-free

Meals should generally support:
- Mild flavours
- Family sharing
- Batch cooking where possible
- Leftovers support
- Toddler-friendly options
- Flexible ingredient substitutions

---

# Existing Meal Types

Common meals include:
- Spaghetti bolognese
- Roast chicken and vegetables
- Sausages and vegetables
- Mild curry
- Dumplings with rice and edamame
- Fried rice
- Tacos
- Pizza

These represent the intended style of meals:
- practical
- repeatable
- family-friendly
- weeknight realistic

---

# Ingredient-First Planning

The app should support planning meals based on:
- Vegetable boxes
- Pantry items
- Fridge ingredients
- Leftovers

Primary workflow goal:
Users can input available ingredients and receive suitable recipe suggestions for upcoming days.

The experience should:
- Reduce food waste
- Reduce planning fatigue
- Encourage flexible cooking
- Support substitutions
- Work for imperfect ingredient matches

Example workflow:
1. User inputs available produce
2. App suggests recipes
3. User selects meals for upcoming days
4. App identifies missing ingredients
5. Shopping list generated automatically

---

# UI Rules

## General

- Avoid white text on white backgrounds
- Ensure strong contrast
- Use card-based layouts
- Use spacing generously
- Keep typography readable
- Prefer rounded corners
- Use subtle shadows
- Avoid dense tables on mobile
- Prioritise fast scanning

## Mobile First

All pages should work well on:
- Mobile portrait
- Tablet
- Desktop

Primary optimisation target:
- Mobile portrait

## UX Style

The app should feel:
- warm
- calm
- low-friction
- practical
- family-friendly

Avoid:
- enterprise dashboard feel
- excessive animations
- noisy layouts
- overcomplicated interactions

---

# Coding Rules

## Components

- Keep components small and reusable
- Avoid deeply nested JSX
- Prefer server components where practical
- Use client components only when necessary

## Data Fetching

- Use Supabase for persistence
- Handle loading states
- Handle empty states
- Handle error states

## Styling

- Use Tailwind CSS
- Avoid inline styles
- Maintain consistent spacing scale
- Prefer utility classes over custom CSS

---

# Database Rules

Recipes should support:
- Title
- Description
- Ingredients
- Instructions
- Tags
- Prep time
- Cook time
- Servings
- Dietary flags
- Favourite status
- Created date
- Updated date

Future support:
- Meal planning calendar
- Shopping lists
- Pantry tracking
- Ingredient availability
- Weekly plans
- AI meal suggestions
- Leftover tracking

---

# AI Assistant Instructions

When generating code:
- Preserve existing functionality
- Avoid unnecessary rewrites
- Explain major architecture changes
- Prefer incremental improvements
- Keep styling consistent
- Maintain accessibility basics

When uncertain:
- Ask clarifying questions
- Do not invent database fields
- Do not assume APIs exist

Prioritise:
- maintainability
- readability
- practical UX
- mobile usability