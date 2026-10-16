# Blind re-proof attempt: `BlindProbe.order`

```lean
theorem BlindProbe.order (n : ℕ) (hn : 2 ≤ n) : ¬ (n ∣ 2 ^ n - 1)
```

- **Outcome: CLOSED** after 116.2 s (budget 300 s, hard stop 420 s; ended: closed)
- Calls: 17 searches, 0 proof-state steps, 2 verifications; 98 words of commentary; longest silence 36.7 s
- Model: claude-sonnet-5; library as the services held it: search `85735b6f3866`, states `85735b6f3866`, verify `85735b6f3866`

Rendered from the raw transcript beside this file; the gate renders it again and compares.

> I'll search for this classic number theory fact — it's a known result that no integer n≥2 divides 2^n−1, often proved via minimal prime factor / order arguments.

### 1. at 3.6 s, answered after 0.6 s

**loogle_search** `2 ^ n - 1, Nat, |- ¬ _ ∣ _`

Result:

```text
Loogle Error: Unknown identifier `n`
```

### 2. at 4.0 s, answered after 0.5 s

**moogle_search** ``

Result:

```text
Semantic Search Results:

Theorem Name: carmichael_two_pow_of_le_two
Description: Note that `2 ^ (n - 1) = 1` when `n = 0`.
------------------------------
Theorem Name: carmichael_two_pow_of_ne_two
Description: Note that `2 ^ (n - 2) = 1` when `n ≤ 1`.
------------------------------
Theorem Name: fermatNumber
Description: Fermat numbers: the `n`-th Fermat number is defined as `2^(2^n) + 1`.
------------------------------
Theorem Name: pepin_primality
Description: `Fₙ = 2^(2^n)+1` is prime if `3^(2^(2^n-1)) = -1 mod Fₙ` (**Pépin's test**).
------------------------------
Theorem Name: prime_of_pow_sub_one_prime
Description: Prime `a ^ n - 1` implies `a = 2` and prime `n`.
------------------------------
Theorem Name: Nat.Prime.of_mersenne
Description: If `2 ^ p - 1` is prime, then `p` is prime.
------------------------------
Theorem Name: pow_pow_add_primeFactors_one_lt
Description: Prime factors of `a ^ (2 ^ n) + 1` are of form `k * 2 ^ (n + 1) + 1`.
------------------------------
Theorem Name: pepin_primality
Description: `Fₙ = 2^(2^n)+1` is prime if `3^((Fₙ - 1)/2) = -1 mod Fₙ` (**Pépin's test**).
------------------------------
Theorem Name: exists_eq_two_pow_mul_odd
Description: A
… (263 more characters in the transcript)
```

### 3. at 7.3 s, answered after 13.2 s

**loogle_search** `Nat, ¬ _ ∣ 2 ^ _ - 1`

Result:

```text
No theorems found matching that query. Try a broader pattern, a name substring in quotes, or moogle_search to discover the right name.
```

### 4. at 7.5 s, answered after 13.3 s

**moogle_search** ``

Result:

```text
Semantic Search Results:

Theorem Name: gcd
Description: Greatest Common Divisor (GCD) of two `Num`s.
------------------------------
Theorem Name: primeFactors_eq_to_filter_divisors_prime
Description: The factors of `n` are the prime divisors
------------------------------
Theorem Name: minFac
Description: Returns the smallest prime factor of `n ≠ 1`.
------------------------------
Theorem Name: minFac
Description: Returns the smallest prime factor of `n ≠ 1`.
------------------------------
Theorem Name: minFac
Description: Returns the smallest prime factor of `n ≠ 1`.
------------------------------
Theorem Name: gcd
Description: Greatest Common Divisor (GCD) of two `ZNum`s.
------------------------------
Theorem Name: orderOf_a
Description: If `0 < n`, then `a i` has order `(2 * n) / gcd (2 * n) i`.
------------------------------
Theorem Name: pow_pow_add_primeFactors_one_lt
Description: Prime factors of `a ^ (2 ^ n) + 1` are of form `k * 2 ^ (n + 1) + 1`.
------------------------------
Theorem Name: prime_of_pow_sub_one_prime
Description: Prime `a ^ n - 1` implies `a = 2` and prime `n`.
------------------------------
Theorem Name: gcd_eq_one_of_lt_minFac
Description: If `0 < m <
… (81 more characters in the transcript)
```

### 5. at 28.4 s, answered after 0.3 s

**loogle_search** `"BlindProbe"`

Result:

```text
No theorems found matching that query. Try a broader pattern, a name substring in quotes, or moogle_search to discover the right name.
```

### 6. at 28.9 s, answered after 1.7 s

**loogle_search** `"orderOf", "dvd", Nat.Prime`

Result:

```text
Found 12 results. Top matches:

Name: AddCommute.addOrderOf_add_eq_left_of_forall_prime_mul_dvd
Type:  {G : Type u_1} [AddMonoid G] {x y : G} (h : AddCommute x y) (hx : IsOfFinAddOrder x) (hdvd : ∀ (p : ℕ), Nat.Prime p → p ∣ addOrderOf y → p * addOrderOf y ∣ addOrderOf x) : addOrderOf (x + y) = addOrderOf x
---
Name: AddCommute.addOrderOf_add_eq_right_of_forall_prime_mul_dvd
Type:  {G : Type u_1} [AddMonoid G] {x y : G} (h : AddCommute x y) (hy : IsOfFinAddOrder y) (hdvd : ∀ (p : ℕ), Nat.Prime p → p ∣ addOrderOf x → p * addOrderOf x ∣ addOrderOf y) : addOrderOf (x + y) = addOrderOf y
---
Name: Commute.orderOf_mul_eq_left_of_forall_prime_mul_dvd
Type:  {G : Type u_1} [Monoid G] {x y : G} (h : Commute x y) (hx : IsOfFinOrder x) (hdvd : ∀ (p : ℕ), Nat.Prime p → p ∣ orderOf y → p * orderOf y ∣ orderOf x) : orderOf (x * y) = orderOf x
---
Name: Commute.orderOf_mul_eq_right_of_forall_prime_mul_dvd
Type:  {G : Type u_1} [Monoid G] {x y : G} (h : Commute x y) (hy : IsOfFinOrder y) (hdvd : ∀ (p : ℕ), Nat.Prime p → p ∣ orderOf x → p * orderOf x ∣ orderOf y) : orderOf (x * y) = orderOf y
---
Name: exists_prime_addOrderOf_dvd_card'
Type:  {G : Type u_3} [AddGroup G] [Finite G] (p : ℕ) [hp : Fa
… (69 more characters in the transcript)
```

### 7. at 29.2 s, answered after 1.6 s

**moogle_search** ``

Result:

```text
Semantic Search Results:

Theorem Name: carmichael_two_pow_of_le_two
Description: Note that `2 ^ (n - 1) = 1` when `n = 0`.
------------------------------
Theorem Name: carmichael_two_pow_of_ne_two
Description: Note that `2 ^ (n - 2) = 1` when `n ≤ 1`.
------------------------------
Theorem Name: fermatNumber
Description: Fermat numbers: the `n`-th Fermat number is defined as `2^(2^n) + 1`.
------------------------------
Theorem Name: pepin_primality
Description: `Fₙ = 2^(2^n)+1` is prime if `3^(2^(2^n-1)) = -1 mod Fₙ` (**Pépin's test**).
------------------------------
Theorem Name: pepin_primality
Description: `Fₙ = 2^(2^n)+1` is prime if `3^((Fₙ - 1)/2) = -1 mod Fₙ` (**Pépin's test**).
------------------------------
Theorem Name: prime_of_pow_sub_one_prime
Description: Prime `a ^ n - 1` implies `a = 2` and prime `n`.
------------------------------
Theorem Name: pow_pow_add_primeFactors_one_lt
Description: Prime factors of `a ^ (2 ^ n) + 1` are of form `k * 2 ^ (n + 1) + 1`.
------------------------------
Theorem Name: Nat.pow_card_sub_one_sub_one_mod_card
Description: **Fermat's Little Theorem**: for all `n : ℕ` coprime to `p`, we have `(n ^ (p - 1) - 1) % p = 0`.
---------------
… (221 more characters in the transcript)
```

> Found a very useful lemma: `gcd_eq_one_of_lt_minFac`. I'll search for its exact signature and namespace to use it directly.

### 8. at 41.1 s, answered after 0.3 s

**loogle_search** `gcd_eq_one_of_lt_minFac`

Result:

```text
Loogle Error: unknown identifier 'gcd_eq_one_of_lt_minFac'
```

### 9. at 42.1 s, answered after 0.9 s

**loogle_search** `orderOf, ZMod, |- orderOf _ ∣ _ - 1`

Result:

```text
Found 2 results. Top matches:

Name: ZMod.orderOf_dvd_card_sub_one
Type:  {p : ℕ} [Fact (Nat.Prime p)] {a : ZMod p} (ha : a ≠ 0) : orderOf a ∣ p - 1
---
Name: ZMod.orderOf_units_dvd_card_sub_one
Type:  {p : ℕ} [Fact (Nat.Prime p)] (u : (ZMod p)ˣ) : orderOf u ∣ p - 1
---
```

### 10. at 42.1 s, answered after 1.2 s

**loogle_search** `ZMod.pow_card_sub_one_eq_one`

Result:

```text
Found 1 results. Top matches:

Name: ZMod.pow_card_sub_one_eq_one
Type:  {p : ℕ} [Fact (Nat.Prime p)] {a : ZMod p} (ha : a ≠ 0) : a ^ (p - 1) = 1
---
```

> `ZMod.orderOf_dvd_card_sub_one` is exactly what I need. Now let me find the `gcd_eq_one_of_lt_minFac` name (maybe it's `Nat.Coprime.something` or a differently named lemma) and `orderOf_dvd_of_pow_eq_one`.

### 11. at 46.5 s, answered after 0.2 s

**moogle_search** ``

Result:

```text
Semantic Search Results:

Theorem Name: gcd_eq_one_of_lt_minFac
Description: If `0 < m < minFac n`, then `n` and `m` have gcd equal to `1`.
------------------------------
Theorem Name: coprime_of_lt_minFac
Description: If `0 < m < minFac n`, then `n` and `m` are coprime.
------------------------------
Theorem Name: gcd
Description: Greatest Common Divisor (GCD) of two `Num`s.
------------------------------
Theorem Name: gcd_eq_one_of_gcd_mul_right_eq_one_left
Description: If `gcd a (m * n) = 1`, then `gcd a m = 1`.
------------------------------
Theorem Name: gcd_eq_one_of_gcd_mul_right_eq_one_right
Description: If `gcd a (m * n) = 1`, then `gcd a n = 1`.
------------------------------
Theorem Name: gcd_ne_one_iff_gcd_mul_right_ne_one
Description: If `gcd a (m * n) ≠ 1`, then `gcd a m ≠ 1` or `gcd a n ≠ 1`.
------------------------------
Theorem Name: chineseRemainder
Description: The natural number less than `lcm n m` congruent to `a` mod `n` and `b` mod `m`
------------------------------
Theorem Name: lcm
Description: The least common multiple (lcm) of two positive natural numbers,   viewed as positive natural number.
------------------------------
Theorem Name: gcd
Description:
… (321 more characters in the transcript)
```

### 12. at 46.8 s, answered after 0.3 s

**loogle_search** `orderOf_dvd_of_pow_eq_one`

Result:

```text
Found 1 results. Top matches:

Name: orderOf_dvd_of_pow_eq_one
Type:  {G : Type u_1} [Monoid G] {x : G} {n : ℕ} (h : x ^ n = 1) : orderOf x ∣ n
---
```

### 13. at 46.9 s, answered after 0.6 s

**loogle_search** `Nat.minFac_prime`

Result:

```text
Found 2 results. Top matches:

Name: Nat.minFac_prime
Type:  {n : ℕ} (n1 : n ≠ 1) : Nat.Prime n.minFac
---
Name: Nat.Primes.prodNatEquiv_symm_apply
Type:  {n : ℕ} (hn : IsPrimePow n) : Nat.Primes.prodNatEquiv.symm ⟨n, hn⟩ = (⟨n.minFac, ⋯⟩, n.factorization n.minFac - 1)
---
```

### 14. at 50.0 s, answered after 0.3 s

**loogle_search** `Nat.coprime_of_lt_minFac`

Result:

```text
Found 1 results. Top matches:

Name: Nat.coprime_of_lt_minFac
Type:  {n m : ℕ} (h₀ : m ≠ 0) (h : m < n.minFac) : n.Coprime m
---
```

### 15. at 50.2 s, answered after 0.4 s

**loogle_search** `Nat.minFac_dvd`

Result:

```text
Found 1 results. Top matches:

Name: Nat.minFac_dvd
Type:  (n : ℕ) : n.minFac ∣ n
---
```

> Now I have all the pieces (`Nat.minFac_prime`, `Nat.minFac_dvd`, `Nat.coprime_of_lt_minFac`, `ZMod.orderOf_dvd_card_sub_one`, `orderOf_dvd_of_pow_eq_one`). Let me assemble the full proof and verify it directly since I have all the lemma names needed.

### 16. at 95.9 s, answered after 1.5 s

**verify_full_script**

```lean
theorem BlindProbe.order (n : ℕ) (hn : 2 ≤ n) : ¬ (n ∣ 2 ^ n - 1) := by
  intro h
  have hn1 : n ≠ 1 := by omega
  set p := n.minFac with hp_def
  have hp_prime : p.Prime := Nat.minFac_prime hn1
  have hp_dvd_n : p ∣ n := Nat.minFac_dvd n
  have hp_dvd : p ∣ 2 ^ n - 1 := hp_dvd_n.trans h
  have h4 : 4 ≤ 2 ^ n := by
    have : 2 ^ 2 ≤ 2 ^ n := Nat.pow_le_pow_right (by norm_num) hn
    norm_num at this
    exact this
  have hp2 : p ≠ 2 := by
    intro hpeq
    rw [hpeq] at hp_dvd
    obtain ⟨k, hk⟩ := (dvd_pow_self 2 (show n ≠ 0 by omega))
    obtain ⟨m, hm⟩ := hp_dvd
    omega
  haveI : Fact p.Prime := ⟨hp_prime⟩
  have ha : (2 : ZMod p) ≠ 0 := by
    have : ¬ (p ∣ 2) := by
      intro hcon
      have := (Nat.prime_dvd_prime_iff_eq hp_prime (by norm_num)).mp hcon
      exact hp2 this
    intro hcontra
    apply this
    have := (ZMod.natCast_zmod_eq_zero_iff_dvd 2 p).mp (by exact_mod_cast hcontra)
    exact this
  have key : (2 : ZMod p) ^ n = 1 := by
    have h1 : ((2 ^ n - 1 : ℕ) : ZMod p) = 0 := (ZMod.natCast_zmod_eq_zero_iff_dvd _ _).mpr hp_dvd
    have h2 : ((2 ^ n : ℕ) : ZMod p) - 1 = 0 := by
      rw [Nat.cast_sub (by omega)] at h1
      simpa using h1
    push_cast at h2
    linear_combination h2
  have hord_dvd_n : orderOf (2 : ZMod p) ∣ n := orderOf_dvd_of_pow_eq_one key
  have hord_dvd_p1 : orderOf (2 : ZMod p) ∣ p - 1 := ZMod.orderOf_dvd_card_sub_one ha
  have hcop : n.Coprime (p - 1) := by
    apply Nat.coprime_of_lt_minFac
    · have : 2 < p := hp_prime.two_lt hp2
      omega
    · have : 2 < p := hp_prime.two_lt hp2
      omega
  have hgcd : orderOf (2 : ZMod p) ∣ Nat.gcd n (p - 1) := Nat.dvd_gcd hord_dvd_n hord_dvd_p1
  rw [hcop] at hgcd
  have hord1 : orderOf (2 : ZMod p) = 1 := Nat.eq_one_of_dvd_one hgcd
  have h2eq1 : (2 : ZMod p) = 1 := orderOf_eq_one_iff.mp hord1
  have h10 : (1 : ZMod p) = 0 := by linear_combination h2eq1
  exact one_ne_zero h10
```

Result:

```text
❌ Compilation Failed:
Line 20 (Warning): Try this: haveI̵ The goal is a proposition, so `have` is preferred over `haveI`. The difference between `have` and `haveI` is that `haveI` inlines the value. But this is not relevant for proofs because of proof irrelevance. Note: This linter can be disabled with `set_option linter.style.haveILetI false`
Line 28 (Error): Unknown constant `ZMod.natCast_zmod_eq_zero_iff_dvd`
Line 31 (Error): Unknown constant `ZMod.natCast_zmod_eq_zero_iff_dvd`
Line 41 (Error): Invalid field `two_lt`: The environment does not contain `Irreducible.two_lt`, so it is not possible to project the field `two_lt` from an expression hp_prime of type `Irreducible p`
Line 43 (Error): Invalid field `two_lt`: The environment does not contain `Irreducible.two_lt`, so it is not possible to project the field `two_lt` from an expression hp_prime of type `Irreducible p`
```

### 17. at 102.0 s, answered after 2.4 s

**loogle_search** `ZMod, |- (↑_ : ZMod _) = 0 ↔ _ ∣ _`

Result:

```text
Found 2 results. Top matches:

Name: ZMod.intCast_zmod_eq_zero_iff_dvd
Type:  (a : ℤ) (b : ℕ) : ↑a = 0 ↔ ↑b ∣ a
---
Name: ZMod.natCast_eq_zero_iff
Type:  (a b : ℕ) : ↑a = 0 ↔ b ∣ a
---
```

### 18. at 102.2 s, answered after 2.6 s

**loogle_search** `Nat.Prime.two_le`

Result:

```text
Found 3 results. Top matches:

Name: Nat.Prime.two_le
Type:  {p : ℕ} : Nat.Prime p → 2 ≤ p
---
Name: Nat.properDivisors_prime_pow
Type:  {p : ℕ} (pp : Nat.Prime p) (k : ℕ) : (p ^ k).properDivisors = Finset.map { toFun := fun x => p ^ x, inj' := ⋯ } (Finset.range k)
---
Name: Nat.divisors_prime_pow
Type:  {p : ℕ} (pp : Nat.Prime p) (k : ℕ) : (p ^ k).divisors = Finset.map { toFun := fun x => p ^ x, inj' := ⋯ } (Finset.range (k + 1))
---
```

### 19. at 115.3 s, answered after 0.9 s

**verify_full_script**

```lean
theorem BlindProbe.order (n : ℕ) (hn : 2 ≤ n) : ¬ (n ∣ 2 ^ n - 1) := by
  intro h
  have hn1 : n ≠ 1 := by omega
  set p := n.minFac with hp_def
  have hp_prime : p.Prime := Nat.minFac_prime hn1
  have hp_dvd_n : p ∣ n := Nat.minFac_dvd n
  have hp_dvd : p ∣ 2 ^ n - 1 := hp_dvd_n.trans h
  have h4 : 4 ≤ 2 ^ n := by
    have : 2 ^ 2 ≤ 2 ^ n := Nat.pow_le_pow_right (by norm_num) hn
    norm_num at this
    exact this
  have hp2 : p ≠ 2 := by
    intro hpeq
    rw [hpeq] at hp_dvd
    obtain ⟨k, hk⟩ := (dvd_pow_self 2 (show n ≠ 0 by omega))
    obtain ⟨m, hm⟩ := hp_dvd
    omega
  have : Fact p.Prime := ⟨hp_prime⟩
  have ha : (2 : ZMod p) ≠ 0 := by
    have hnd : ¬ (p ∣ 2) := by
      intro hcon
      have := (Nat.prime_dvd_prime_iff_eq hp_prime (by norm_num)).mp hcon
      exact hp2 this
    intro hcontra
    apply hnd
    exact (ZMod.natCast_eq_zero_iff 2 p).mp (by exact_mod_cast hcontra)
  have key : (2 : ZMod p) ^ n = 1 := by
    have h1 : ((2 ^ n - 1 : ℕ) : ZMod p) = 0 := (ZMod.natCast_eq_zero_iff (2 ^ n - 1) p).mpr hp_dvd
    have h2 : ((2 ^ n : ℕ) : ZMod p) - 1 = 0 := by
      rw [Nat.cast_sub (by omega)] at h1
      simpa using h1
    push_cast at h2
    linear_combination h2
  have hord_dvd_n : orderOf (2 : ZMod p) ∣ n := orderOf_dvd_of_pow_eq_one key
  have hord_dvd_p1 : orderOf (2 : ZMod p) ∣ p - 1 := ZMod.orderOf_dvd_card_sub_one ha
  have hcop : n.Coprime (p - 1) := by
    apply Nat.coprime_of_lt_minFac
    · have h2le : 2 ≤ p := hp_prime.two_le
      omega
    · have h2le : 2 ≤ p := hp_prime.two_le
      omega
  have hgcd : orderOf (2 : ZMod p) ∣ Nat.gcd n (p - 1) := Nat.dvd_gcd hord_dvd_n hord_dvd_p1
  rw [hcop] at hgcd
  have hord1 : orderOf (2 : ZMod p) = 1 := Nat.eq_one_of_dvd_one hgcd
  have h2eq1 : (2 : ZMod p) = 1 := orderOf_eq_one_iff.mp hord1
  have h10 : (1 : ZMod p) = 0 := by linear_combination h2eq1
  exact one_ne_zero h10
```

Result — **this closed it**:

```text
✅ Compilation Successful! The proof is 100% verified.
[[verified script attached by the service]]
```
