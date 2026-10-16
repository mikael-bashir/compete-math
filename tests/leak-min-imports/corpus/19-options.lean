import Tengoku.All

set_option maxHeartbeats 400000

theorem u1 (x : ℝ) (h : 1 < x) : 0 < Real.log x := Real.log_pos h
