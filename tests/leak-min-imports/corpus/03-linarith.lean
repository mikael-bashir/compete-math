import Tengoku.All

theorem c1 (x y : ℝ) (h₁ : x ≤ y) (_h₂ : 0 ≤ x) : x ≤ y + 1 := by linarith

theorem c2 (x y : ℝ) : 2 * x * y ≤ x ^ 2 + y ^ 2 := by nlinarith [sq_nonneg (x - y)]
