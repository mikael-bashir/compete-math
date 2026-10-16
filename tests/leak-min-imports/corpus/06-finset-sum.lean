import Tengoku.All

theorem f1 (n : ℕ) : (∑ i ∈ Finset.range n, i) * 2 = n * (n - 1) := Finset.sum_range_id_mul_two n
