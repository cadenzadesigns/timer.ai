# timer.ai — UX Improvements

Read the existing codebase to understand the current UI structure. Then make these changes:

## 1. Validation & Smart Feedback on Parse Results

After the NL parser returns a TimerConfig, validate it and show helpful feedback:

- If the user mentioned a total time (e.g., "10 minutes") but the parsed config doesn't match (e.g., (30+25)*10 = 550s ≠ 600s), show a warning like:
  "⚠️ Parsed as 25s work + 25s rest × 10 rounds = 8m 20s (you asked for 10m). Adjust?"
- Add smart adjustment buttons: "Adjust rounds to fit 10m" or "Keep as parsed"
- If work + rest = 0 or other nonsensical configs, show an error with a suggestion
- Display the total workout time prominently (e.g., "Total: 8m 20s") near the parsed result

To support this, update the Convex parseWorkout action to also return the original user intent when a total time was mentioned. Add a field like `requestedTotalSeconds?: number` to the response.

## 2. Settings Panel (Slide-up Sheet)

Add a settings gear icon (⚙️) in the top-right header area. Tapping it opens a slide-up bottom sheet (mobile-friendly pattern):

### Settings contents:
- **Countdown mode**: Toggle between "3-2-1 Countdown" and "Single Buzzer"
  - Show what each does: "3-2-1: Three descending beeps before each work phase" / "Single: One beep to start"
  - This should update the current TimerConfig's `countdown` field
- **Rest between sets**: Number input (seconds) — only shown when sets > 1
- **Sound**: On/Off toggle (mute all audio)
- **Keep screen on**: On/Off toggle for Wake Lock (show current state)

### Design:
- Bottom sheet slides up from the bottom with a drag handle
- Semi-transparent dark backdrop
- Matches the existing "Signal" tactical aesthetic
- Smooth animation (CSS transition or framer-motion if already installed)
- Close by tapping backdrop, swiping down, or X button
- On mobile, should feel native (like iOS action sheet)

## 3. Also fix: Manual Config Editor

The current UI shows the parsed result but I don't think there's a way to manually tweak individual values (work, rest, rounds, sets) after parsing. Add inline editable fields:
- Tap on "25s WORK" to edit work seconds
- Tap on "25s REST" to edit rest seconds  
- Tap on "10 RDS" to edit rounds
- These should be small inline number inputs that appear on tap
- Total time updates live as you edit

## Technical Notes
- Keep the existing aesthetic — dark, tactical, high contrast
- Follow .claude/skills/frontend-design/SKILL.md for any new UI
- Use CSS transitions for the bottom sheet (no heavy animation libraries)
- Make sure everything is touch-friendly (48px min tap targets)
- Test that the settings actually affect the timer behavior

When completely finished, run:
openclaw system event --text "Done: timer.ai UX improvements — validation feedback, settings panel, inline editing" --mode now
