---
type: feat
timestamp: 1784866690710
id: quiet-lamps
---
read_note logs how a single-note read was served (`mode`: full/outline/section/section-miss/window/empty, plus the requested `section`), so the demand ranker can see whether progressive disclosure actually engaged; a lone `notePaths:[x]` now collapses to the single-note path and gets outline + section slicing instead of a silent full-body dump
