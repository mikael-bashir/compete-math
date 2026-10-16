# Blind re-proof attempt: `BlindProbe.nesbitt`

```lean
theorem BlindProbe.nesbitt (a b c : ℝ) (ha : 0 < a) (hb : 0 < b) (hc : 0 < c) : a / (b + c) + b / (c + a) + c / (a + b) ≥ 3 / 2
```

- **Outcome: CLOSED** after 52.1 s (budget 300 s, hard stop 420 s; ended: closed)
- Calls: 2 searches, 10 proof-state steps, 1 verifications; 197 words of commentary; longest silence 4.1 s
- Model: claude-sonnet-5; library as the services held it: search `85735b6f3866`, states `85735b6f3866`, verify `85735b6f3866`

Rendered from the raw transcript beside this file; the gate renders it again and compares.

> I'll search for existing Nesbitt's inequality lemmas in the library first, since this is a well-known result that might already be formalized.

### 1. at 3.0 s, answered after 0.4 s

**loogle_search** `"nesbitt"`

Result:

```text
No theorems found matching that query. Try a broader pattern, a name substring in quotes, or moogle_search to discover the right name.
```

### 2. at 3.2 s, answered after 2.1 s

**moogle_search** ``

Result:

```text
Semantic Search Results:

Theorem Name: fkg
Description: The **Fortuin-Kastelyn-Ginibre Inequality**.
------------------------------
Theorem Name: sub_one_div_inv_le_two
Description: An inequality involving `2`.
------------------------------
Theorem Name: tsum_mul_le_mul_norm
Description: Hölder inequality
------------------------------
Theorem Name: uIcc_subset_uIcc_union_uIcc
Description: A sort of triangle inequality.
------------------------------
Theorem Name: Orthonormal.tsum_inner_products_le
Description: Bessel's inequality.
------------------------------
Theorem Name: holley
Description: The **Holley Inequality**.
------------------------------
Theorem Name: Finset.card_le_card_diffs
Description: The **Marica-Schönheim Inequality**.
------------------------------
Theorem Name: Finset.le_card_diffs_mul_card_diffs
Description: A slight generalisation of the **Marica-Schönheim Inequality**.
------------------------------
Theorem Name: young_inequality_of_nonneg
Description: **Young's inequality**, a version for nonnegative real numbers.
------------------------------
Theorem Name: inner_le_weight_mul_Lp_of_nonneg
Description: **Weighted Hölder inequality**.
-----------------
… (13 more characters in the transcript)
```

> No pre-existing Nesbitt lemma. I'll try to prove it directly via `nlinarith` or `polyrith` with the positivity facts, since this is a polynomial inequality after clearing denominators.

### 3. at 7.9 s, answered after 0.2 s

**init_proof**

```lean
∀ (a b c : ℝ), 0 < a → 0 < b → 0 < c → a / (b + c) + b / (c + a) + c / (a + b) ≥ 3 / 2
```

Result:

```text
Proof initialized. State ID: 7b73a82d-6d4f-4d50-b951-4a480cf1919f
Current Goal(s):

⊢ ∀ (a b c : ℝ), 0 < a → 0 < b → 0 < c → a / (b + c) + b / (c + a) + c / (a + b) ≥ 3 / 2
```

### 4. at 10.0 s, answered after 0.1 s

**apply_tactic** on `7b73a82d`:

```lean
intro a b c ha hb hc
```

Result:

```text
Tactic succeeded. New Goals:
a : ℝ
b : ℝ
c : ℝ
ha : 0 < a
hb : 0 < b
hc : 0 < c
⊢ a / (b + c) + b / (c + a) + c / (a + b) ≥ 3 / 2
```

### 5. at 14.2 s, answered after 0.2 s

**branch_tactics** on `7b73a82d`:

```lean
have hbc : 0 < b + c := by linarith
 have hca : 0 < c + a := by linarith
 have hab : 0 < a + b := by linarith
 rw [ge_iff_le, div_add_div _ _ (ne_of_gt hbc) (ne_of_gt hca), div_add_div _ _ (by positivity) (ne_of_gt hab), le_div_iff (by positivity)]
 nlinarith [sq_nonneg (a-b), sq_nonneg (b-c), sq_nonneg (c-a), mul_pos ha hb, mul_pos hb hc, mul_pos hc ha]
nlinarith [sq_nonneg (a-b), sq_nonneg (b-c), sq_nonneg (c-a), mul_pos ha hb, mul_pos hb hc, mul_pos hc ha, sq_nonneg (a+b+c), div_add_div_same a b]
```

Result:

```text
Branch results for 7b73a82d (2 candidates):
[1] ❌ have hbc : 0 < b + c := by linarith
 have hca : 0 < c + a := by linarith
 have hab : 0 < a + b := by linarith
 rw [ge_iff_le, div_add_div _ _ (ne_of_gt hbc) (ne_of_gt hca), div_add_div _ _ (by positivity) (ne_of_gt hab), le_div_iff (by positivity)]
 nlinarith [sq_nonneg (a-b), sq_nonneg (b-c), sq_nonneg (c-a), mul_pos ha hb, mul_pos hb hc, mul_pos hc ha] → failed (0ms): {'hasSorry': False, 'hasUnsafe': False, 'parseError': 'Cannot parse as one tactic block'}
[2] ❌ nlinarith [sq_nonneg (a-b), sq_nonneg (b-c), sq_nonneg (c-a), mul_pos ha hb, mul_pos hb hc, mul_pos hc ha, sq_nonneg (a+b+c), div_add_div_same a b] → failed (36ms): [Message(data='Unknown identifier `div_add_div_same`', pos=Position(line=0, column=0), pos_end=None, severity=<Severity.ERROR: 3>, kind='lean.unknownIdentifier._namedError')]
0/2 candidates advanced. Parent state '7b73a82d-6d4f-4d50-b951-4a480cf1919f' is unchanged and still usable. Free the child states you don't keep with cleanup_memory.
```

> The first attempt had a parsing issue with multi-line format. Let me try using a single tactic via `field_simp` then `nlinarith`.

### 6. at 20.6 s, answered after 0.4 s

**branch_tactics** on `7b73a82d`:

```lean
rw [ge_iff_le, div_add_div _ _ (by linarith : (b+c) ≠ 0) (by linarith : (c+a) ≠ 0), div_add_div _ _ (by positivity) (by linarith : (a+b) ≠ 0), le_div_iff (by positivity)]; nlinarith [sq_nonneg (a-b), sq_nonneg (b-c), sq_nonneg (c-a), mul_pos ha hb, mul_pos hb hc, mul_pos hc ha]
nlinarith [sq_nonneg (a-b), sq_nonneg (b-c), sq_nonneg (c-a), mul_pos ha hb, mul_pos hb hc, mul_pos hc ha, div_add_div_same, sq_nonneg (a+b-2*c), sq_nonneg (b+c-2*a), sq_nonneg (c+a-2*b)]
```

Result:

```text
Branch results for 7b73a82d (2 candidates):
[1] ❌ rw [ge_iff_le, div_add_div _ _ (by linarith : (b+c) ≠ 0) (by linarith : (c+a) ≠ 0), div_add_div _ _ (by positivity) (by linarith : (a+b) ≠ 0), le_div_iff (by positivity)]; nlinarith [sq_nonneg (a-b), sq_nonneg (b-c), sq_nonneg (c-a), mul_pos ha hb, mul_pos hb hc, mul_pos hc ha] → failed (131ms): [Message(data='Unknown identifier `le_div_iff`', pos=Position(line=0, column=0), pos_end=None, severity=<Severity.ERROR: 3>, kind='lean.unknownIdentifier._namedError')]
[2] ❌ nlinarith [sq_nonneg (a-b), sq_nonneg (b-c), sq_nonneg (c-a), mul_pos ha hb, mul_pos hb hc, mul_pos hc ha, div_add_div_same, sq_nonneg (a+b-2*c), sq_nonneg (b+c-2*a), sq_nonneg (c+a-2*b)] → failed (18ms): [Message(data='Unknown identifier `div_add_div_same`', pos=Position(line=0, column=0), pos_end=None, severity=<Severity.ERROR: 3>, kind='lean.unknownIdentifier._namedError')]
0/2 candidates advanced. Parent state '7b73a82d-6d4f-4d50-b951-4a480cf1919f' is unchanged and still usable. Free the child states you don't keep with cleanup_memory.
```

> `le_div_iff` might be renamed. Let me try `field_simp` followed by `nlinarith`, which is a more robust standard approach.

### 7. at 25.5 s, answered after 0.2 s

**branch_tactics** on `7b73a82d`:

```lean
have hbc : (0:ℝ) < b + c := by linarith
 have hca : (0:ℝ) < c + a := by linarith
 have hab : (0:ℝ) < a + b := by linarith
 rw [ge_iff_le, div_add_div _ _ (ne_of_gt hbc) (ne_of_gt hca), div_add_div _ _ (by positivity) (ne_of_gt hab), le_div_iff₀ (by positivity)]
 nlinarith [sq_nonneg (a-b), sq_nonneg (b-c), sq_nonneg (c-a), mul_pos ha hb, mul_pos hb hc, mul_pos hc ha]
```

Result:

```text
Branch results for 7b73a82d (1 candidates):
[1] ❌ have hbc : (0:ℝ) < b + c := by linarith
 have hca : (0:ℝ) < c + a := by linarith
 have hab : (0:ℝ) < a + b := by linarith
 rw [ge_iff_le, div_add_div _ _ (ne_of_gt hbc) (ne_of_gt hca), div_add_div _ _ (by positivity) (ne_of_gt hab), le_div_iff₀ (by positivity)]
 nlinarith [sq_nonneg (a-b), sq_nonneg (b-c), sq_nonneg (c-a), mul_pos ha hb, mul_pos hb hc, mul_pos hc ha] → failed (0ms): {'hasSorry': False, 'hasUnsafe': False, 'parseError': 'Cannot parse as one tactic block'}
0/1 candidates advanced. Parent state '7b73a82d-6d4f-4d50-b951-4a480cf1919f' is unchanged and still usable. Free the child states you don't keep with cleanup_memory.
```

> The multi-line tactic blocks are failing to parse. Let me try using `apply_tactic` sequentially instead, applying one step at a time.

### 8. at 30.2 s, answered after 0.2 s

**apply_tactic** on `7b73a82d`:

```lean
have hbc : (0:ℝ) < b + c := by linarith
```

Result:

```text
Tactic succeeded. New Goals:
a : ℝ
b : ℝ
c : ℝ
ha : 0 < a
hb : 0 < b
hc : 0 < c
hbc : 0 < b + c := lt_of_not_ge fun a =>
  Mathlib.Tactic.Linarith.lt_irrefl
    (Eq.mp
      (congrArg (fun _a => _a < 0)
        (Mathlib.Tactic.Ring.of_eq
          (Mathlib.Tactic.Ring.Common.add_congr
            (Mathlib.Tactic.Ring.Common.add_congr
              (Mathlib.Tactic.Ring.Common.sub_congr
                (Mathlib.Tactic.Ring.cast_zero (Mathlib.Meta.NormNum.isNat_ofNat ℝ Nat.cast_zero))
                (Mathlib.Tactic.Ring.Common.atom_pf b rfl
                  (Eq.mpr
                    (id (congrArg (fun _a => b ^ Nat.rawCast 1 * Nat.rawCast 1 = b ^ Nat.rawCast 1 * _a) (Eq.symm rfl)))
                    (Eq.refl (b ^ Nat.rawCast 1 * Nat.rawCast 1))))
                (Mathlib.Tactic.Ring.Common.sub_pf
                  (Mathlib.Tactic.Ring.Common.neg_add
                    (Mathlib.Tactic.Ring.Common.neg_mul b (Nat.rawCast 1)
                      (Mathlib.Meta.NormNum.IsInt.to_raw_eq
                        (Mathlib.Meta.NormNum.isInt_neg (Eq.refl Neg.neg)
                          (Mathlib.Meta.NormNum.IsNat.to_isInt (Mathlib.Meta.NormNum.IsNat.of_raw ℝ 1))
… (4123 more characters in the transcript)
```

> That worked. Now let me continue with the field_simp approach, applying step by step.

### 9. at 33.5 s, answered after 0.2 s

**apply_tactic** on `7b73a82d`:

```lean
have hca : (0:ℝ) < c + a := by linarith
```

Result:

```text
Tactic succeeded. New Goals:
a : ℝ
b : ℝ
c : ℝ
ha : 0 < a
hb : 0 < b
hc : 0 < c
hbc : 0 < b + c := lt_of_not_ge fun a =>
  Mathlib.Tactic.Linarith.lt_irrefl
    (Eq.mp
      (congrArg (fun _a => _a < 0)
        (Mathlib.Tactic.Ring.of_eq
          (Mathlib.Tactic.Ring.Common.add_congr
            (Mathlib.Tactic.Ring.Common.add_congr
              (Mathlib.Tactic.Ring.Common.sub_congr
                (Mathlib.Tactic.Ring.cast_zero (Mathlib.Meta.NormNum.isNat_ofNat ℝ Nat.cast_zero))
                (Mathlib.Tactic.Ring.Common.atom_pf b rfl
                  (Eq.mpr
                    (id (congrArg (fun _a => b ^ Nat.rawCast 1 * Nat.rawCast 1 = b ^ Nat.rawCast 1 * _a) (Eq.symm rfl)))
                    (Eq.refl (b ^ Nat.rawCast 1 * Nat.rawCast 1))))
                (Mathlib.Tactic.Ring.Common.sub_pf
                  (Mathlib.Tactic.Ring.Common.neg_add
                    (Mathlib.Tactic.Ring.Common.neg_mul b (Nat.rawCast 1)
                      (Mathlib.Meta.NormNum.IsInt.to_raw_eq
                        (Mathlib.Meta.NormNum.isInt_neg (Eq.refl Neg.neg)
                          (Mathlib.Meta.NormNum.IsNat.to_isInt (Mathlib.Meta.NormNum.IsNat.of_raw ℝ 1))
… (9321 more characters in the transcript)
```

> This step-by-step approach is generating huge output. Let me instead try `field_simp` directly on the main goal, which should be more direct.

### 10. at 38.3 s, answered after 0.2 s

**apply_tactic** on `7b73a82d`:

```lean
rw [ge_iff_le, div_add_div _ _ hbc.ne' hca.ne', div_add_div _ _ (by positivity) hab.ne']
```

Result:

```text
Tactic failed: [Message(data="Unknown identifier `hab.ne'`", pos=Position(line=0, column=0), pos_end=None, severity=<Severity.ERROR: 3>, kind='lean.unknownIdentifier._namedError')]
```

### 11. at 40.9 s, answered after 0.3 s

**apply_tactic** on `7b73a82d`:

```lean
have hab : (0:ℝ) < a + b := by linarith
```

Result:

```text
Tactic succeeded. New Goals:
a : ℝ
b : ℝ
c : ℝ
ha : 0 < a
hb : 0 < b
hc : 0 < c
hbc : 0 < b + c := lt_of_not_ge fun a =>
  Mathlib.Tactic.Linarith.lt_irrefl
    (Eq.mp
      (congrArg (fun _a => _a < 0)
        (Mathlib.Tactic.Ring.of_eq
          (Mathlib.Tactic.Ring.Common.add_congr
            (Mathlib.Tactic.Ring.Common.add_congr
              (Mathlib.Tactic.Ring.Common.sub_congr
                (Mathlib.Tactic.Ring.cast_zero (Mathlib.Meta.NormNum.isNat_ofNat ℝ Nat.cast_zero))
                (Mathlib.Tactic.Ring.Common.atom_pf b rfl
                  (Eq.mpr
                    (id (congrArg (fun _a => b ^ Nat.rawCast 1 * Nat.rawCast 1 = b ^ Nat.rawCast 1 * _a) (Eq.symm rfl)))
                    (Eq.refl (b ^ Nat.rawCast 1 * Nat.rawCast 1))))
                (Mathlib.Tactic.Ring.Common.sub_pf
                  (Mathlib.Tactic.Ring.Common.neg_add
                    (Mathlib.Tactic.Ring.Common.neg_mul b (Nat.rawCast 1)
                      (Mathlib.Meta.NormNum.IsInt.to_raw_eq
                        (Mathlib.Meta.NormNum.isInt_neg (Eq.refl Neg.neg)
                          (Mathlib.Meta.NormNum.IsNat.to_isInt (Mathlib.Meta.NormNum.IsNat.of_raw ℝ 1))
… (14519 more characters in the transcript)
```

> Now I have all three positivity facts. Given the time constraints, let me just try `nlinarith` directly with division-friendly hints, or better, just skip straight to verify_full_script with a full self-contained attempt using `field_simp; nlinarith`.

### 12. at 46.3 s, answered after 0.7 s

**branch_tactics** on `7b73a82d`:

```lean
rw [ge_iff_le, div_add_div _ _ hbc.ne' hca.ne', div_add_div _ _ (mul_ne_zero hbc.ne' hca.ne') hab.ne', le_div_iff₀ (by positivity)]; nlinarith [sq_nonneg (a-b), sq_nonneg (b-c), sq_nonneg (c-a), mul_pos ha hb, mul_pos hb hc, mul_pos hc ha]
```

Result:

```text
Branch results for 7b73a82d (1 candidates):
[1] ✅ rw [ge_iff_le, div_add_div _ _ hbc.ne' hca.ne', div_add_div _ _ (mul_ne_zero hbc.ne' hca.ne') hab.ne', le_div_iff₀ (by positivity)]; nlinarith [sq_nonneg (a-b), sq_nonneg (b-c), sq_nonneg (c-a), mul_pos ha hb, mul_pos hb hc, mul_pos hc ha] → PROOF COMPLETE (529ms). New State ID: 606226cd-224d-4e68-9acd-b6a983ee73ee
Verified script:
```lean4
theorem auto_proof : ∀ (a b c : ℝ), 0 < a → 0 < b → 0 < c → a / (b + c) + b / (c + a) + c / (a + b) ≥ 3 / 2 := by
  intro a b c ha hb hc
  have hbc : (0:ℝ) < b + c := by linarith
  have hca : (0:ℝ) < c + a := by linarith
  have hab : (0:ℝ) < a + b := by linarith
  rw [ge_iff_le, div_add_div _ _ hbc.ne' hca.ne', div_add_div _ _ (mul_ne_zero hbc.ne' hca.ne') hab.ne', le_div_iff₀ (by positivity)]; nlinarith [sq_nonneg (a-b), sq_nonneg (b-c), sq_nonneg (c-a), mul_pos ha hb, mul_pos hb hc, mul_pos hc ha]
```
1/1 candidates advanced. Parent state '7b73a82d-6d4f-4d50-b951-4a480cf1919f' is unchanged and still usable. Free the child states you don't keep with cleanup_memory.
```

> The proof completed. Now let me verify the exact theorem statement with the correct name using `verify_full_script`.

### 13. at 51.0 s, answered after 1.1 s

**verify_full_script**

```lean
theorem BlindProbe.nesbitt (a b c : ℝ) (ha : 0 < a) (hb : 0 < b) (hc : 0 < c) : a / (b + c) + b / (c + a) + c / (a + b) ≥ 3 / 2 := by
  have hbc : (0:ℝ) < b + c := by linarith
  have hca : (0:ℝ) < c + a := by linarith
  have hab : (0:ℝ) < a + b := by linarith
  rw [ge_iff_le, div_add_div _ _ hbc.ne' hca.ne', div_add_div _ _ (mul_ne_zero hbc.ne' hca.ne') hab.ne', le_div_iff₀ (by positivity)]
  nlinarith [sq_nonneg (a-b), sq_nonneg (b-c), sq_nonneg (c-a), mul_pos ha hb, mul_pos hb hc, mul_pos hc ha]
```

Result — **this closed it**:

```text
✅ Compilation Successful! The proof is 100% verified.
[[verified script attached by the service]]
```
