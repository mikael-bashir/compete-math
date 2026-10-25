/-! A finite model found by Vampire's model builder. Its 6 elements are `Fin 6`; element k here is Vampire's `fmb_$i_{k+1}`. -/
def e_c : Fin 6 := 0
def inv_tbl : Fin 6 → Fin 6 := ![0, 1, 5, 3, 4, 2]
def mul_tbl : Fin 6 → Fin 6 → Fin 6 := ![![0, 1, 2, 3, 4, 5], ![1, 0, 3, 2, 5, 4], ![2, 4, 5, 1, 3, 0], ![3, 5, 4, 0, 2, 1], ![4, 2, 1, 5, 0, 3], ![5, 3, 0, 4, 1, 2]]

theorem ax_group_assoc_holds : ∀ x y z : Fin 6, ((mul_tbl (mul_tbl x y) z) = (mul_tbl x (mul_tbl y z))) := by decide
theorem ax_group_left_identity_holds : ∀ x : Fin 6, ((mul_tbl e_c x) = x) := by decide
theorem ax_group_right_identity_holds : ∀ x : Fin 6, ((mul_tbl x e_c) = x) := by decide
theorem ax_group_left_inverse_holds : ∀ x : Fin 6, ((mul_tbl (inv_tbl x) x) = e_c) := by decide
theorem ax_group_right_inverse_holds : ∀ x : Fin 6, ((mul_tbl x (inv_tbl x)) = e_c) := by decide
theorem conjecture_fails : ¬ (∀ x y : Fin 6, ((mul_tbl x y) = (mul_tbl y x))) := by decide
