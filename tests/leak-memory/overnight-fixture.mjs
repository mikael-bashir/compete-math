// The scripts of the 2026-10-18 Control II Lucid run on Erdős 396 that exposed the sleep-merge bugs: four verified lemmas about
// the p-part of centralBinom, then the one script the sleep stage returned (a master identity and three corollaries) that was
// meant to replace them. Plain text, copied from that run's log.
export const OLD = [
  `open Nat in
theorem le_factorization_centralBinom_of_dvd_succ (p n m : ℕ) (hp : p.Prime) (hn : 1 ≤ n)
    (hd : p ^ m ∣ n + 1) : m ≤ (centralBinom n).factorization p := by
  have hpm : p ^ m ≤ n + 1 := Nat.le_of_dvd (by omega) hd
  have hm : m ≤ log p (2 * n) := by
    apply Nat.le_log_of_pow_le hp.one_lt
    omega
  rw [Nat.centralBinom, Nat.factorization_choose hp (by omega) (Nat.lt_succ_self _)]
  sorry_free_placeholder
`.replace("  sorry_free_placeholder\n", "  simpa using hm\n"),
  `open Nat in
theorem factorization_centralBinom_eq_zero_of_sq_gt (p n : ℕ) (hp : p.Prime) (h2 : 2 * n < p ^ 2)
    (hmod : 2 * (n % p) < p) : (centralBinom n).factorization p = 0 := by
  rcases Nat.eq_zero_or_pos n with rfl | hn
  · simp
  have hlog : log p (2 * n) < 2 := Nat.log_lt_of_lt_pow (by omega) h2
  rw [Nat.centralBinom, Nat.factorization_choose hp (by omega) (Nat.lt_succ_self _)]
  simp only [Finset.card_eq_zero]
  rw [Finset.filter_eq_empty_iff]
  intro i hi
  omega
`,
  `open Nat in
theorem one_le_factorization_centralBinom_of_sq_le (p n : ℕ) (hp : p.Prime) (h1 : n < p ^ 2) (h2 : p ^ 2 ≤ 2 * n) : 1 ≤ (centralBinom n).factorization p := by
  have hn : 0 < n := by
    have : 0 < p ^ 2 := pow_pos hp.pos 2
    omega
  apply Finset.card_pos.mpr
  refine ⟨2, ?_⟩
  omega
`,
  `open Nat in
theorem one_le_factorization_centralBinom_of_le_two_mod (p n : ℕ) (hp : p.Prime) (h : p ≤ 2 * (n % p)) : 1 ≤ (centralBinom n).factorization p := by
  have hlt : n % p < p := Nat.mod_lt _ hp.pos
  apply Finset.card_pos.mpr
  refine ⟨1, ?_⟩
  omega
`,
]

export const SLEEP_SCRIPT = `open Nat in
theorem factorization_centralBinom_eq_card (p n : ℕ) (hp : p.Prime) :
    (centralBinom n).factorization p =
      ((Finset.Ico 1 (log p (2 * n) + 1)).filter (fun i => p ^ i ≤ 2 * (n % p ^ i))).card := by
  rw [Nat.centralBinom, Nat.factorization_choose hp (by omega) (Nat.lt_succ_self _)]
  have e : 2 * n - n = n := by omega
  rw [e]
  congr 1
  apply Finset.filter_congr
  intro i _
  omega

open Nat in
theorem one_le_factorization_centralBinom_of_pow_le (p n i : ℕ) (hp : p.Prime) (hi : 1 ≤ i)
    (h : p ^ i ≤ 2 * (n % p ^ i)) : 1 ≤ (centralBinom n).factorization p := by
  have hle : n % p ^ i ≤ n := Nat.mod_le n _
  rw [factorization_centralBinom_eq_card p n hp]
  apply Finset.card_pos.mpr
  exact ⟨i, by simp⟩

open Nat in
theorem le_factorization_centralBinom_of_forall_pow_le (p n m : ℕ) (hp : p.Prime)
    (h : ∀ i, 1 ≤ i → i ≤ m → p ^ i ≤ 2 * (n % p ^ i)) :
    m ≤ (centralBinom n).factorization p := by
  rw [factorization_centralBinom_eq_card p n hp]
  exact Nat.zero_le _

open Nat in
theorem factorization_centralBinom_eq_zero_of_forall_lt (p n : ℕ) (hp : p.Prime)
    (h : ∀ i, 1 ≤ i → i ≤ log p (2 * n) → 2 * (n % p ^ i) < p ^ i) :
    (centralBinom n).factorization p = 0 := by
  rw [factorization_centralBinom_eq_card p n hp, Finset.card_eq_zero, Finset.filter_eq_empty_iff]
  intro i hi
  omega
`
