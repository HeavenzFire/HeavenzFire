# Moral Neural Governor Integration TODO

## Steps (from approved plan)

- [x] 1. Create moral_neural_governor_train.py: Joint physics+ethical training with real phys dataset, ideal targets, L_total = L_flux + 0.5*L_moral + 0.1*L_id + modulated reg. Log moral_loss/DQ.
- [x] 2. Update ethical_governor.py: Set input_dim=6 for proxies.
- [x] 3. dream_metrics.py: Add torch_ethical_quality differentiable.
- [x] 4. lattice_dashboard.py: Load moral_neural_governor.pt; modulate with moral weights.
- [ ] 5. Test: python moral_neural_governor_train.py → check decreasing moral_loss, rising DQ.
- [ ] 6. Test dashboard: EQ>70 average, positive states.
- [ ] 7. Update launch.ps1 to train moral model.

Progress tracked here after each step.

