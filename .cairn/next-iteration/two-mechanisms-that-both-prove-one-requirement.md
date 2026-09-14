# Two mechanisms that both prove one requirement

Surfaced from: LOOP-056
Changes: LOOP-056
Moved: 2026-09-14 from the backlog under the-loop-continues-past-done; it changes assess from one mechanism to a set
Captured: 2026-09-05T13:30:00.000Z

The second adoption had a targeted twenty-run test and a whole-binary ten-run mechanism that both legitimately prove one requirement, and had to give the requirement to one because the kernel's requirement-to-mechanism map is last-wins. LOOP-056 refuses the double declaration by name, and the adopter's route is one mechanism that runs both commands. The alternative, recording evidence from both and requiring both to pass, changes assess() from one mechanism per requirement to a set, and the wake's every reason line with it. Promotion is the developer's.
