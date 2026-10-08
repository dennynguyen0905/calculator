# Assumptions about the real fx-580VN X

The emulator was written without access to a physical device. Wherever the real behaviour was not certain, the
choice made here is listed below and covered by a test marked `// UNVERIFIED` (see
`engine/tests/unverified.test.ts`). If you own the device and find a mismatch, change the corresponding line in
that test, run `npm test` and fix the engine until it passes.

Legend: **[A]** = assumption, behaviour could differ on the real device.

## Number model

| # | Topic | Assumption |
|---|-------|------------|
| N1 | Internal precision | Exact values are kept as rationals / sums of `c·π^p·√r`. Non-exact results are rounded to **15 significant digits**; display rounds to **10** significant digits (half-up). Internal decimal work uses 60 digits. |
| N2 | Decimal input flag | A number typed with a decimal point (or `×10^x`) marks the result "decimal-preferred": `0.1+0.2` shows `0.3`, and S⇔D then shows `3/10`. Results of irrational functions are approximations and cannot be toggled. **[A]** |
| N3 | Overflow | Any (rounded) result with magnitude ≥ 10^100 is `Math ERROR`. Magnitudes below 10^-99 collapse to 0 (underflow). |
| N4 | Exact display limits | A fraction/radical is displayed only if every numerator, coefficient and denominator has ≤ 10 digits and the value has ≤ 4 terms; otherwise the decimal is shown. π appears with power in [-2, 2]. **[A]** |
| N5 | Fraction format default | Default *Fraction Result* is `d/c` (improper). `ab/c` is available in SETUP. **[A]** |
| N6 | Term order | In natural display, terms with positive coefficients come first (rational part, then radicals by increasing radicand, then π terms), then negative terms: `2-√3`, `√3-√2`, `(√6-√2)/4`. The real device's order for sums is not documented. **[A]** |
| N7 | Common denominator | Sums are printed as one stacked fraction over the lcm of the coefficient denominators (`(1+√3)/2`). **[A]** |
| N8 | Square roots of sums | `√(3+2√2)` is de-nested to `1+√2` when possible. The device may show a decimal instead. **[A]** |
| N9 | `2^0.5` | Evaluated as the exact `√2` flagged decimal; shows `1.414213562`, S⇔D gives `√2`. **[A]** |
| N10 | Percent | `x%` = x/100 exact (`50%` → `1/2`). No add-on/discount semantics. **[A]** |
| N11 | Integers above 10 digits | Shown in scientific notation (`2^40` → `1.099511628×10^12`). |
| N12 | Negative base, fractional power | `(-8)^(1÷3)` = −2 (odd root); even root of a negative number is `Math ERROR` in Real mode. **[A]** |

## Syntax and priority

| # | Topic | Assumption |
|---|-------|------------|
| S1 | Priority | `( )` → function with argument → postfix (`x²`, `x!`, `%`, `^`, `°'"`) → prefix minus → *implicit multiplication* → `nPr nCr ∠` → `·` → `× ÷ ÷R` → `+ -` → `and` → `or xor xnor`. Implicit multiplication binds tighter than `÷`, so `6÷2(1+2)` = 1, `1÷2π` = 1/(2π). |
| S2 | Power associativity | `2^3^2` = 2^(3^2) = 512. Sequential superscripts `2²³`-style chains are left-associative. |
| S3 | Auto-closing | Missing `)` at the end of the input is closed automatically. A stray `)` is `Syntax ERROR`. |
| S4 | Stack | Number stack 10, command stack 24; each pending operator/open bracket/function takes a command slot. The exact accounting of the device is approximated from the AST. **[A]** |
| S5 | Empty slots | An empty template slot (□) is `Syntax ERROR`. |

## Functions

| # | Topic | Assumption |
|---|-------|------------|
| F1 | Exact trig | Exact values for multiples of 15° (π/12 rad, 50/3 grad). Other arguments give 15-digit decimals. |
| F2 | Inverse trig | Exact special values (0, ½, √2/2, √3/2, 1, (√6±√2)/4 and tan⁻¹ of 0, 1, √3/3, √3, 2±√3) return exact degrees/π-multiples. |
| F3 | `tan` poles | `tan(90°)` / `tan(π/2)` are `Math ERROR` when the argument is exactly a pole. |
| F4 | Logs | `log`/`logₐb` are exact when the argument is a rational power of the base (`log 1000` = 3, `log₈2` = 1/3). `ln e` = 1 only through the 15-digit constant e. |
| F5 | `x!` | Defined for integers 0–69 only (70! ≥ 10^100). |
| F6 | `nPr`/`nCr` | Integer arguments, n < 10^10, r ≤ n, result < 10^100. |
| F7 | `Int(` vs `Intg(` | `Int(` truncates toward zero, `Intg(` is floor. **[A]** |
| F8 | `÷R` | Printed as `q R r`; quotient truncated toward zero, remainder has the sign of the dividend. **[A]** |
| F9 | `GCD`/`LCM` | Integer arguments (|x| < 10^10); non-integers → `Math ERROR`. |
| F10 | DMS | `a°b′c″` is converted to the current angle unit. A result with min/sec parts is flagged decimal. `▶DMS` shows seconds with up to 2 decimals. **[A]** |
| F11 | `∫dx` | Adaptive Gauss–Kronrod (G7K15) in double precision, tolerance ≈ 1e-11, evaluated on the fast path when the integrand uses supported functions. The device's own algorithm differs; results agree to ~10 significant digits for smooth integrands. |
| F12 | `d/dx` | Ridders extrapolated central difference (double precision). |
| F13 | `Σ(` | Integer bounds, step 1, at most 10^6 terms, exact arithmetic. |
| F14 | Pol/Rec | Results are also stored in X and Y. `Pol(0,0)` is `Math ERROR`. |
| F15 | Constants | CONST uses the CODATA 2010 table of 40 values (as on the fx-991ES/EX family); digits were typed from memory of that table. **[A]** |
| F16 | Conversions | CONV uses the 40-pair table (fx-991ES layout); `cal` = 4.184 J, `mmHg` = 101325/760 Pa. **[A]** |
| F17 | Random | `Ran#` returns a 3-digit decimal in [0,1). `RanInt#(a,b)` is inclusive. |

## Display and input

| # | Topic | Assumption |
|---|-------|------------|
| D1 | Norm 1 / Norm 2 | Norm 1 uses scientific notation when \|x\| < 10^-2 or ≥ 10^10; Norm 2 when \|x\| < 10^-9 or ≥ 10^10. |
| D2 | Fix / Sci | Fix n: n decimals, half-up. Sci n: n significant digits (n = 0 → 10). Exact fractions/radicals are unaffected by Fix/Sci; S⇔D shows them in the chosen format. |
| D3 | Exponent | Exponents are printed without leading zeros. |
| D4 | Line display | Only simple fractions are shown exactly (`1⌟3`, mixed `2⌟1⌟3`); radicals and π are decimals. |

## Complex numbers (CMPLX)

| # | Topic | Assumption |
|---|-------|------------|
| C1 | Polar output | With `r∠θ` output a purely real result is still shown as a real number. |
| C2 | Powers | A negative base with a non-integer exponent uses the principal complex value in CMPLX (`(-8)^(1÷3)` = 1+1.732i) and is `Math ERROR` in COMP. |
| C3 | Trig of x+iy | The real part follows the angle unit; the imaginary part is a plain hyperbolic argument. |
| C4 | `ln` | `ln(-1)` = `πi` (exact, via Arg in radians). |
| C5 | ENG key | In CMPLX the ENG key types `i` (as on the ES/EX family). Outside CMPLX it is ENG. |

## Base-N

| # | Topic | Assumption |
|---|-------|------------|
| B1 | Range | 32-bit two's complement: Dec −2147483648…2147483647, Hex 00000000…FFFFFFFF (≥ 80000000 negative), Oct up to 37777777777, Bin up to 32 digits. Out-of-range input or results are `Math ERROR`. |
| B2 | Division | Integer division truncates toward zero; the fraction is dropped. |
| B3 | Keys | `x²` DEC, `x^□` HEX, `log` BIN, `ln` OCT (set base); `SHIFT`+`3` menu: d h b o Neg( Not( and or xor xnor. |
| B4 | Display | Non-decimal results are shown as unsigned 32-bit patterns without leading zeros. |

## Equations, inequalities

| # | Topic | Assumption |
|---|-------|------------|
| E1 | Root order | Quadratics list `(-b+√D)/2a` first; cubic/quartic roots are sorted by real part (ascending), then imaginary part. |
| E2 | Exactness | Rational roots are found with the rational-root theorem and deflated; the remaining quadratic is solved exactly (fractions, radicals, complex pairs). Biquadratic quartics are solved exactly in terms of `x²`. Anything else falls back to numeric (Durand–Kerner) 15-digit roots. |
| E3 | Repeated roots | If all roots are equal a single `x=` is shown. |
| E4 | Singular systems | A singular simultaneous system is `Math ERROR`. |
| I1 | Output | Each solution interval is one row (`x<1`, `2<x`, `1≤x≤2`); no solution → `No solution`, everything → `All real numbers`. Sign analysis uses 60-digit decimals between exact roots. |

## Statistics

| # | Topic | Assumption |
|---|-------|------------|
| T1 | Transformed data | For `ln X`, `e^X`, `A·B^X`, `A·X^B` and `1/X` regressions the statistic sums (Σx, Σy, …) and r are computed on the transformed data. |
| T2 | Quartiles | `Q1`/`Q3` are the medians of the lower/upper half; the median is excluded from both halves when n is odd. |
| T3 | `x̂`, `ŷ` | Entered as functions `x̂(`, `ŷ(` (and `x̂1(`, `x̂2(` for quadratic) from `SHIFT 1 > Reg`. |
| T4 | Limits | 80 data rows (1-variable) / 40 (two-variable); frequencies must be non-negative. |
| T5 | `P(` `Q(` `R(` `t(` | `P` = area (−∞, t), `Q` = area (0, t), `R` = area (t, ∞); `t(x)` = (x − x̄)/σx. |

## Distributions, table, matrix, vector, others

| # | Topic | Assumption |
|---|-------|------------|
| D1 | Inverse binomial / Poisson | Smallest integer x with P(X ≤ x) ≥ area. |
| D2 | Normal CD defaults | Empty Lower/Upper default to ∓1E99, empty σ to 1, μ to 0. |
| D3 | Precision | Normal CDF uses a 100-digit `erf` series; results are rounded to 15 digits. |
| D4 | Inverse normal tails | Left (default), Right and Central are offered as a menu before the form. |
| TB1 | Table size | Up to 30 rows (f only) or 20 rows (f and g). Cells with an error show `ERROR`. Values are shown as decimals. |
| M1 | Matrices | MatA–MatD up to 4×4; vectors VctA–VctD with 2 or 3 components. A matrix result is shown as a cell grid with the selected cell in natural display below. `×` between two vectors is the cross product, `·` the dot product. |
| M2 | Dimension errors | Mismatched sizes give `Dimension ERROR`; singular inverse `Math ERROR`. |
| V1 | VERIFY | Sides are compared exactly (no rounding); relations `=`, `≠`, `>`, `<`, `≥`, `≤` come from the `SHIFT`+`6` (OPTN) menu; `=` is `ALPHA`+`CALC`. |
| R1 | RATIO | `a:b = X:d` → X = a·d/b; `a:b = c:X` → X = b·c/a. |
| S1 | SPREADSHEET | 5 columns × 45 rows; formulas start with `=` (`ALPHA`+`CALC`), cell references are `A1`…`E45`, ranges `A1:A5`, functions `SUM( MEAN( MAX( MIN( COUNT(` from `SHIFT 1`. A reference cycle shows `ERROR` in the cell. |
| K1 | Key layout | The physical layout, the position of most SHIFT/ALPHA legends and the numbering of the menus follow the fx-991ES/EX family from memory; they are an approximation of the fx-580VN X, not a copy. |
| SOLVE1 | SOLVE | Newton/secant from the initial value with a bracketing fallback; the result is snapped to a nearby short decimal when that gives a smaller residual. `L−R` below 1e-12 (relative) is shown as 0. |
