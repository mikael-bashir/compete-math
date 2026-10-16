import Tengoku.All

theorem s1 (a b : ℤ) (h : a ∣ b) : a ∣ b * 3 := Dvd.dvd.mul_right h 3
