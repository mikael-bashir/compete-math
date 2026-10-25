/-! A finite model found by Vampire's model builder. Its 3 elements are `Fin 3`; element k here is Vampire's `fmb_$i_{k+1}`. -/
def le_b : Fin 3 → Fin 3 → Bool := ![![true, false, false], ![false, true, false], ![false, false, true]]

theorem ax_partial_order_refl_holds : ∀ x : Fin 3, (le_b x x = true) := by decide
theorem ax_partial_order_antisymm_holds : ∀ x y : Fin 3, (((le_b x y = true) ∧ (le_b y x = true)) → (x = y)) := by decide
theorem ax_partial_order_trans_holds : ∀ x y z : Fin 3, (((le_b x y = true) ∧ (le_b y z = true)) → (le_b x z = true)) := by decide
theorem conjecture_fails : ¬ (∀ x y : Fin 3, ((le_b x y = true) ∨ (le_b y x = true))) := by decide
