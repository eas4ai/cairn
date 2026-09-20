# TypeSafe evaluator benchmark: results

Model: jev-1.13.0.

## Route accuracy

Overall: 91.7% (22/24)

| expect | accuracy |
|---|---|
| agent | 91.7% (11/12) |
| developer | 91.7% (11/12) |

## Confusion matrix (rows = expect, cols = predicted)

| expect \ predicted | agent | developer |
|---|---|---|
| agent | 11 | 1 |
| developer | 1 | 11 |

## Misrouted

| id | expect | predicted | deciding |
|---|---|---|---|
| A07 | agent | developer | composite |
| D10 | developer | agent | composite |

## Per-dimension separation (mean level, agent-expected vs developer-expected)

| dimension | agent mean | developer mean | separation |
|---|---|---|---|
| evidence | 2.60 | 2.08 | 0.51 |
| reach | 1.33 | 2.21 | 0.89 |
| contract | 0.89 | 1.53 | 0.64 |
| surface | 0.24 | 0.84 | 0.60 |
| ambiguity | 1.54 | 2.26 | 0.72 |
