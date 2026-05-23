
# NEXT_STEPS.md

# Immediate Priorities

## 1. Fix Visual Design

Goal:
Make the app readable, warm, and visually pleasant.

Tasks:
- Replace white-on-white styling
- Add background colour system
- Improve text contrast
- Improve spacing
- Add consistent card styling
- Add button styles
- Improve typography hierarchy

Suggested direction:
- Soft neutral backgrounds
- Warm accent colours
- Rounded cards
- Subtle shadows
- Clear visual hierarchy

---

## 2. Create Reusable UI Components

Create:
- RecipeCard
- Button
- Input
- TextArea
- PageContainer
- SectionHeader
- EmptyState
- LoadingSpinner

Goal:
Reduce duplication and improve consistency.

---

## 3. Improve Recipe Schema

Review and update recipe table.

Suggested fields:
- id
- title
- description
- ingredients
- instructions
- prep_time
- cook_time
- servings
- tags
- favourite
- created_at
- updated_at

Future-ready fields:
- dietary_flags
- image_url
- notes
- ingredient_metadata

---

# Ingredient-First Meal Planning

## Vegetable Box Workflow

Target workflow:

1. User inputs available produce
2. App suggests suitable recipes
3. User selects meals for upcoming days
4. App identifies missing ingredients
5. Shopping list generated automatically

Example:
Input:
- carrots
- zucchini
- broccoli
- potatoes

Output:
- roast vegetable pasta
- fried rice
- mild curry
- tray bake

---

## Required Features

### Pantry / Ingredient System

Needs:
- Ingredient database
- Flexible ingredient matching
- Ingredient categories
- Pantry tracking
- Fridge tracking
- Leftover tracking

### Recipe Matching

Recipes should support:
- Required ingredients
- Optional ingredients
- Substitute ingredients
- Pantry compatibility scoring

### Meal Suggestions

Future logic:
- Prioritise ingredients expiring soon
- Avoid repeating meals
- Balance prep effort
- Support toddler-friendly meals
- Minimise extra shopping

---

## Suggested Build Order

1. Recipe tags
2. Ingredient normalisation
3. Recipe ingredient structure
4. Pantry input UI
5. Ingredient matching logic
6. Suggested recipe engine
7. Weekly planner integration
8. Shopping list automation

---

# Short-Term Goals

## Meal Planner

Build:
- Weekly planner
- Day-based meal assignment
- Mobile-friendly layout
- Quick meal assignment
- Repeating meals support

Later:
- Drag/drop support

---

## Shopping List

Generate:
- Ingredient aggregation
- Quantity grouping
- Tick-off checklist
- Missing ingredient detection
